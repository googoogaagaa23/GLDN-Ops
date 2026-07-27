param(
  [string]$InstallRoot = "",
  [string]$MetadataUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/downloads/latest.json",
  [int]$Port = 39417,
  [switch]$SkipStart,
  [switch]$SkipStartupShortcut
)

$ErrorActionPreference = "Stop"
if (-not $InstallRoot) { $InstallRoot = Join-Path $env:LOCALAPPDATA "GLDN Ops" }
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$agentPath = Join-Path $InstallRoot "tools\gldn-update-agent.ps1"
$corePath = Join-Path $InstallRoot "tools\gldn-update-core.ps1"
$manifestPath = Join-Path $InstallRoot "extension\manifest.json"
foreach ($path in @($agentPath, $corePath, $manifestPath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Updater installation is missing: $path" }
}

$config = [pscustomobject]@{
  schemaVersion = 2
  installRoot = $InstallRoot
  extensionRoot = (Join-Path $InstallRoot "extension")
  resolvesChromeLoadedFolder = $true
  metadataUrl = $MetadataUrl
  port = $Port
  installedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot "updater.json") -Encoding UTF8

$powerShellPath = Join-Path $PSHOME "powershell.exe"
$agentArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Action Serve -InstallRoot "{1}" -MetadataUrl "{2}" -Port {3}' -f `
  $agentPath.Replace('"', '\"'), $InstallRoot.Replace('"', '\"'), $MetadataUrl.Replace('"', '\"'), $Port

if (-not $SkipStartupShortcut) {
  $startupRoot = [Environment]::GetFolderPath("Startup")
  New-Item -ItemType Directory -Force -Path $startupRoot | Out-Null
  $shortcutPath = Join-Path $startupRoot "GLDN Ops Updater.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $powerShellPath
  $shortcut.Arguments = $agentArguments
  $shortcut.WorkingDirectory = $InstallRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Starts the GLDN Ops verified local update agent"
  $shortcut.Save()
}

function Test-GldnAgentPort {
  param([int]$TargetPort)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect([System.Net.IPAddress]::Loopback, $TargetPort, $null, $null)
    return $async.AsyncWaitHandle.WaitOne(300) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

if (-not $SkipStart -and -not (Test-GldnAgentPort $Port)) {
  Start-Process -FilePath $powerShellPath -ArgumentList $agentArguments -WindowStyle Hidden
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 200
    if (Test-GldnAgentPort $Port) { $ready = $true; break }
  }
  if (-not $ready) { throw "The GLDN Ops updater did not start on this computer." }
}

[pscustomobject]@{
  ok = $true
  installRoot = $InstallRoot
  extensionRoot = (Join-Path $InstallRoot "extension")
  port = $Port
  startsWithWindows = -not $SkipStartupShortcut
  resolvesChromeLoadedFolder = $true
  running = if ($SkipStart) { $false } else { Test-GldnAgentPort $Port }
} | ConvertTo-Json -Compress
