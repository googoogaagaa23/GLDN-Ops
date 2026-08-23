param(
  [string]$InstallRoot = "",
  [string]$MetadataUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/downloads/latest.json",
  [int]$Port = 39417
)

$ErrorActionPreference = "Stop"
if (-not $InstallRoot) { $InstallRoot = Split-Path $PSScriptRoot -Parent }
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$agentPath = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot "tools\gldn-update-agent.ps1"))
if (-not (Test-Path -LiteralPath $agentPath)) { throw "GLDN updater is missing: $agentPath" }

$matches = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" | Where-Object {
  $commandLine = [string]$_.CommandLine
  $commandLine.IndexOf($agentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $commandLine -match '(?i)-Action\s+Serve(?:\s|$)'
})
if ($matches.Count -gt 1) { throw "More than one updater is serving this exact GLDN install." }

if ($matches.Count -eq 1) {
  $oldPid = [int]$matches[0].ProcessId
  Stop-Process -Id $oldPid -Force -ErrorAction Stop
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
    throw "The verified GLDN updater did not stop."
  }
} else {
  $oldPid = 0
}

$powerShellPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$agentArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Action Serve -InstallRoot "{1}" -MetadataUrl "{2}" -Port {3}' -f `
  $agentPath.Replace('"', '\"'), $InstallRoot.Replace('"', '\"'), $MetadataUrl.Replace('"', '\"'), $Port
$started = Start-Process -FilePath $powerShellPath -ArgumentList $agentArguments -WindowStyle Hidden -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  Start-Sleep -Milliseconds 200
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect([System.Net.IPAddress]::Loopback, $Port, $null, $null)
    if ($async.AsyncWaitHandle.WaitOne(250) -and $client.Connected) { $ready = $true; break }
  } catch {
  } finally {
    $client.Close()
  }
}
if (-not $ready) { throw "The refreshed GLDN updater did not open port $Port." }

[pscustomobject]@{
  ok = $true
  oldPid = $oldPid
  newPid = $started.Id
  installRoot = $InstallRoot
  port = $Port
} | ConvertTo-Json -Compress
