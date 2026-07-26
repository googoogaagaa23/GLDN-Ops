param(
  [ValidateSet("Serve", "Status", "Update", "Versions", "Rollback")]
  [string]$Action = "Serve",
  [string]$InstallRoot = "",
  [string]$MetadataUrl = "",
  [string]$MetadataPath = "",
  [string]$SourceZipPath = "",
  [string]$SnapshotId = "",
  [int]$Port = 39417,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "gldn-update-core.ps1")

$defaultRoot = Get-GldnDefaultInstallRoot
$configPath = Join-Path $defaultRoot "updater.json"
if (Test-Path -LiteralPath $configPath) {
  try { $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json } catch { $config = $null }
} else {
  $config = $null
}
if (-not $InstallRoot) { $InstallRoot = if ($config.installRoot) { [string]$config.installRoot } else { $defaultRoot } }
if (-not $MetadataUrl) { $MetadataUrl = if ($config.metadataUrl) { [string]$config.metadataUrl } else { $script:GldnDefaultMetadataUrl } }
if ($config.port -and $Port -eq 39417) { $Port = [int]$config.port }
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)

function ConvertTo-AgentJson {
  param($Value)
  return ($Value | ConvertTo-Json -Depth 10 -Compress)
}

function Invoke-AgentAction {
  param([string]$Name, $Body = $null, [switch]$Refresh)
  switch ($Name) {
    "Status" { return Get-GldnUpdaterStatus -InstallRoot $InstallRoot -MetadataUrl $MetadataUrl -Refresh:$Refresh }
    "Update" {
      return Invoke-GldnExtensionUpdate -InstallRoot $InstallRoot -MetadataUrl $MetadataUrl -MetadataPath $MetadataPath -SourceZipPath $SourceZipPath -Force:$Force
    }
    "Versions" {
      return [pscustomobject]@{ ok = $true; versions = @(Get-GldnSnapshots $InstallRoot) | Select-Object id, version, reason, createdAt }
    }
    "Rollback" {
      $requestedId = if ($Body -and $Body.snapshotId) { [string]$Body.snapshotId } else { $SnapshotId }
      return Invoke-GldnExtensionRollback -InstallRoot $InstallRoot -SnapshotId $requestedId
    }
    default { throw "Unknown updater action: $Name" }
  }
}

if ($Action -ne "Serve") {
  try {
    $result = Invoke-AgentAction -Name $Action -Refresh:($Action -eq "Status")
    ConvertTo-AgentJson $result
    exit 0
  } catch {
    ConvertTo-AgentJson ([pscustomobject]@{ ok = $false; error = $_.Exception.Message })
    exit 1
  }
}

function Read-HttpRequest {
  param([System.Net.Sockets.TcpClient]$Client)
  $stream = $Client.GetStream()
  $stream.ReadTimeout = 15000
  $buffer = New-Object byte[] 8192
  $memory = [System.IO.MemoryStream]::new()
  $headerEnd = -1
  while ($headerEnd -lt 0 -and $memory.Length -lt 65536) {
    $read = $stream.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) { break }
    $memory.Write($buffer, 0, $read)
    $text = [System.Text.Encoding]::UTF8.GetString($memory.ToArray())
    $headerEnd = $text.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
  }
  if ($headerEnd -lt 0) { throw "Invalid HTTP request." }
  $allBytes = $memory.ToArray()
  $headerText = [System.Text.Encoding]::UTF8.GetString($allBytes, 0, $headerEnd)
  $lines = $headerText -split "`r`n"
  $requestLine = $lines[0] -split " "
  if ($requestLine.Count -lt 2) { throw "Invalid HTTP request line." }
  $headers = @{}
  foreach ($line in ($lines | Select-Object -Skip 1)) {
    $separator = $line.IndexOf(':')
    if ($separator -gt 0) {
      $headers[$line.Substring(0, $separator).Trim().ToLowerInvariant()] = $line.Substring($separator + 1).Trim()
    }
  }
  $contentLength = 0
  if ($headers.ContainsKey("content-length")) { $contentLength = [int]$headers["content-length"] }
  if ($contentLength -gt 1048576) { throw "Updater request body is too large." }
  $bodyOffset = $headerEnd + 4
  $bodyBytes = [System.IO.MemoryStream]::new()
  if ($allBytes.Length -gt $bodyOffset) {
    $bodyBytes.Write($allBytes, $bodyOffset, $allBytes.Length - $bodyOffset)
  }
  while ($bodyBytes.Length -lt $contentLength) {
    $read = $stream.Read($buffer, 0, [Math]::Min($buffer.Length, $contentLength - $bodyBytes.Length))
    if ($read -le 0) { break }
    $bodyBytes.Write($buffer, 0, $read)
  }
  $bodyText = if ($contentLength) { [System.Text.Encoding]::UTF8.GetString($bodyBytes.ToArray(), 0, $contentLength) } else { "" }
  return [pscustomobject]@{
    method = $requestLine[0].ToUpperInvariant()
    target = $requestLine[1]
    headers = $headers
    body = $bodyText
    stream = $stream
  }
}

function Send-HttpJson {
  param($Request, [int]$StatusCode, $Value)
  $statusText = switch ($StatusCode) { 200 { "OK" } 400 { "Bad Request" } 403 { "Forbidden" } 404 { "Not Found" } 409 { "Conflict" } default { "Internal Server Error" } }
  $json = ConvertTo-AgentJson $Value
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $origin = [string]$Request.headers["origin"]
  $allowOrigin = if ($origin -match '^chrome-extension://[a-z]{32}$') { $origin } else { "null" }
  $header = @(
    "HTTP/1.1 $StatusCode $statusText",
    "Content-Type: application/json; charset=utf-8",
    "Content-Length: $($bytes.Length)",
    "Cache-Control: no-store",
    "Access-Control-Allow-Origin: $allowOrigin",
    "Access-Control-Allow-Headers: Content-Type, X-GLDN-Updater",
    "Access-Control-Allow-Methods: GET, POST, OPTIONS",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Request.stream.Write($headerBytes, 0, $headerBytes.Length)
  $Request.stream.Write($bytes, 0, $bytes.Length)
  $Request.stream.Flush()
}

function Test-AgentRequestAllowed {
  param($Request)
  $origin = [string]$Request.headers["origin"]
  if ($origin -and $origin -notmatch '^chrome-extension://[a-z]{32}$') { return $false }
  if ($Request.method -ne "OPTIONS" -and [string]$Request.headers["x-gldn-updater"] -ne "1") { return $false }
  return $true
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $request = Read-HttpRequest $client
      if (-not (Test-AgentRequestAllowed $request)) {
        Send-HttpJson $request 403 ([pscustomobject]@{ ok = $false; error = "Updater request was not authorized." })
        continue
      }
      if ($request.method -eq "OPTIONS") {
        Send-HttpJson $request 200 ([pscustomobject]@{ ok = $true })
        continue
      }
      $uri = [System.Uri]("http://127.0.0.1:$Port" + $request.target)
      $body = if ($request.body) { $request.body | ConvertFrom-Json } else { $null }
      switch ("$($request.method) $($uri.AbsolutePath)") {
        "GET /v1/status" {
          $refresh = $uri.Query -match '(^|[?&])refresh=1(&|$)'
          Send-HttpJson $request 200 (Invoke-AgentAction -Name "Status" -Refresh:$refresh)
        }
        "GET /v1/versions" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Versions") }
        "POST /v1/update" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Update" -Body $body) }
        "POST /v1/rollback" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Rollback" -Body $body) }
        default { Send-HttpJson $request 404 ([pscustomobject]@{ ok = $false; error = "Updater endpoint not found." }) }
      }
    } catch {
      try { Send-HttpJson $request 500 ([pscustomobject]@{ ok = $false; error = $_.Exception.Message }) } catch {}
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
