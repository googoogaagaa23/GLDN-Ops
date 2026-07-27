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

function Get-AgentExtensionId {
  param([string]$Origin, [string]$HeaderExtensionId = "")
  $originExtensionId = ""
  if ($Origin -match '^chrome-extension://([a-p]{32})/?$') { $originExtensionId = [string]$Matches[1] }
  if ($HeaderExtensionId -and $HeaderExtensionId -notmatch '^[a-p]{32}$') {
    throw "Invalid GLDN Ops extension ID header."
  }
  if ($originExtensionId -and $HeaderExtensionId -and $originExtensionId -cne $HeaderExtensionId) {
    throw "Updater extension identity did not match the request origin."
  }
  if ($originExtensionId) { return $originExtensionId }
  if ($HeaderExtensionId) { return $HeaderExtensionId }
  return ""
}

function Add-AgentTargetMetadata {
  param($Value, $Target)
  $Value | Add-Member -NotePropertyName targetSource -NotePropertyValue ([string]$Target.source) -Force
  $Value | Add-Member -NotePropertyName extensionId -NotePropertyValue ([string]$Target.extensionId) -Force
  $Value | Add-Member -NotePropertyName extensionRoot -NotePropertyValue ([string]$Target.extensionRoot) -Force
  $Value | Add-Member -NotePropertyName profileDirectories -NotePropertyValue @($Target.profileDirectories) -Force
  return $Value
}

function Invoke-AgentAction {
  param(
    [string]$Name,
    $Body = $null,
    [switch]$Refresh,
    [string]$RequestOrigin = "",
    [string]$RequestExtensionId = ""
  )
  $extensionId = Get-AgentExtensionId -Origin $RequestOrigin -HeaderExtensionId $RequestExtensionId
  $target = Resolve-GldnExtensionRequestTarget -ExtensionId $extensionId -FallbackInstallRoot $InstallRoot
  $targetRoot = [string]$target.installRoot
  $result = switch ($Name) {
    "Status" { Get-GldnUpdaterStatus -InstallRoot $targetRoot -MetadataUrl $MetadataUrl -Refresh:$Refresh }
    "Update" {
      Invoke-GldnExtensionUpdate -InstallRoot $targetRoot -MetadataUrl $MetadataUrl -MetadataPath $MetadataPath -SourceZipPath $SourceZipPath -Force:$Force
    }
    "Versions" {
      [pscustomobject]@{ ok = $true; versions = @(Get-GldnSnapshots $targetRoot) | Select-Object id, version, reason, createdAt }
    }
    "Rollback" {
      $requestedId = if ($Body -and $Body.snapshotId) { [string]$Body.snapshotId } else { $SnapshotId }
      Invoke-GldnExtensionRollback -InstallRoot $targetRoot -SnapshotId $requestedId
    }
    default { throw "Unknown updater action: $Name" }
  }
  return Add-AgentTargetMetadata -Value $result -Target $target
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
  $allowOrigin = if ($origin -match '^chrome-extension://[a-p]{32}$') { $origin } else { "null" }
  $header = @(
    "HTTP/1.1 $StatusCode $statusText",
    "Content-Type: application/json; charset=utf-8",
    "Content-Length: $($bytes.Length)",
    "Cache-Control: no-store",
    "Access-Control-Allow-Origin: $allowOrigin",
    "Access-Control-Allow-Headers: Content-Type, X-GLDN-Updater, X-GLDN-Extension-Id",
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
  $extensionId = [string]$Request.headers["x-gldn-extension-id"]
  if ($Request.method -eq "OPTIONS") {
    return $origin -match '^chrome-extension://[a-p]{32}/?$'
  }
  if ([string]$Request.headers["x-gldn-updater"] -ne "1") { return $false }
  if ($extensionId -notmatch '^[a-p]{32}$') { return $false }
  if ($origin) {
    if ($origin -notmatch '^chrome-extension://([a-p]{32})/?$') { return $false }
    return [string]$Matches[1] -ceq $extensionId
  }
  return [string]$Request.headers["sec-fetch-site"] -eq "none" -and [string]$Request.headers["sec-fetch-mode"] -eq "cors"
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
          Send-HttpJson $request 200 (Invoke-AgentAction -Name "Status" -Refresh:$refresh -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"]))
        }
        "GET /v1/versions" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Versions" -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
        "POST /v1/update" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Update" -Body $body -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
        "POST /v1/rollback" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Rollback" -Body $body -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
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
