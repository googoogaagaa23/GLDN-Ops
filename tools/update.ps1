param(
  [switch]$RestartHelper
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$git = "git"
$helper = Join-Path $PSScriptRoot "local-click-helper.ps1"
$configFile = Join-Path $repoRoot "extension\config.js"
$configExample = Join-Path $repoRoot "extension\config.example.js"

Set-Location $repoRoot

& $git pull

if (-not (Test-Path $configFile) -and (Test-Path $configExample)) {
  Copy-Item -LiteralPath $configExample -Destination $configFile
  Write-Host "Created missing extension config: $configFile"
}

if ($RestartHelper) {
  Get-Process powershell -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "*local-click-helper*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue

  Start-Process powershell.exe -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$helper`""
  ) -WindowStyle Minimized
  Write-Host "Restarted local click helper."
}

Start-Process "chrome.exe" "chrome://extensions"
Write-Host "Update pulled. Click Reload on GLDN Ops in chrome://extensions."
