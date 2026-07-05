param(
  [string]$Computer = "",
  [string]$EbayAccount = "",
  [switch]$StartHelper
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$configExample = Join-Path $extensionRoot "config.example.js"
$configFile = Join-Path $extensionRoot "config.js"
$helper = Join-Path $PSScriptRoot "local-click-helper.ps1"

function Ask-Value([string]$Prompt, [string]$Default = "") {
  if ($Default) {
    $value = Read-Host "$Prompt [$Default]"
    if (-not $value) { return $Default }
    return $value
  }
  return Read-Host $Prompt
}

if (-not (Test-Path $configExample)) {
  throw "Missing config template: $configExample"
}

if (-not $Computer) {
  $Computer = Ask-Value "Computer number/name shown on the task sheet" "0"
}

if (-not $EbayAccount) {
  $EbayAccount = Ask-Value "eBay account label for this computer" "FAK12"
}

if (-not (Test-Path $configFile)) {
  Copy-Item -LiteralPath $configExample -Destination $configFile
  Write-Host "Created extension config: $configFile"
} else {
  Write-Host "Config already exists: $configFile"
}

$configText = Get-Content -LiteralPath $configFile -Raw
if ($configText -match 'YOUR_SCRIPT_ID|YOUR_PRIVATE_DASHBOARD_KEY') {
  $configText = $configText `
    -replace 'https://script\.google\.com/macros/s/YOUR_SCRIPT_ID/exec', '' `
    -replace 'YOUR_PRIVATE_DASHBOARD_KEY', ''
  Set-Content -LiteralPath $configFile -Value $configText -Encoding UTF8
  Write-Host "Removed placeholder dashboard values from config.js."
}

Write-Host ""
Write-Host "Install values:"
Write-Host "  Computer: $Computer"
Write-Host "  eBay account: $EbayAccount"
Write-Host ""
Write-Host "Chrome extension folder to load:"
Write-Host "  $extensionRoot"
Write-Host ""
Write-Host "Next Chrome steps:"
Write-Host "  1. Open chrome://extensions"
Write-Host "  2. Turn on Developer mode"
Write-Host "  3. Click Load unpacked"
Write-Host "  4. Select the extension folder shown above"
Write-Host ""

Start-Process "chrome.exe" "chrome://extensions"

if ($StartHelper) {
  if (-not (Test-Path $helper)) {
    throw "Missing local helper: $helper"
  }
  Start-Process powershell.exe -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$helper`""
  ) -WindowStyle Minimized
  Write-Host "Started local click helper."
} else {
  Write-Host "To start the local click helper later, run:"
  Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$helper`""
}

Write-Host ""
Write-Host "Install setup complete."
