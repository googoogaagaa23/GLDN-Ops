param(
  [string]$InstallRoot = "$env:USERPROFILE\Desktop\GLDN-Ops",
  [string]$Computer = "",
  [string]$EbayAccount = "",
  [string]$DashboardSetupCode = "",
  [switch]$StartHelper
)

$ErrorActionPreference = "Stop"

$repoZip = "https://github.com/googoogaagaa23/GLDN-Ops/archive/refs/heads/main.zip"
$repoGit = "https://github.com/googoogaagaa23/GLDN-Ops.git"
$dashboardCode = "GLDN2026"
$dashboardUrl = "https://script.google.com/macros/s/AKfycbziGWXqyZ-bW5MLKhRkkRghH1hT1X6kUCPO5sgEI1pWjuKzMT4aOcivG3ITqCUpjAhUhw/exec"
$dashboardKey = "GLDN-Private-Seller-Level-2026-8291"
$tempRoot = Join-Path $env:TEMP ("gldn-ops-install-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot "GLDN-Ops-main.zip"
$extractRoot = Join-Path $tempRoot "extract"

function Ask-Value([string]$Prompt, [string]$Default = "") {
  if ($Default) {
    $value = Read-Host "$Prompt [$Default]"
    if (-not $value) { return $Default }
    return $value
  }
  return Read-Host $Prompt
}

function Find-Chrome {
  $paths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($path in $paths) {
    if ($path -and (Test-Path $path)) { return $path }
  }
  return "chrome.exe"
}

function Find-Git {
  $cmd = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $paths = @(
    "$env:ProgramFiles\Git\cmd\git.exe",
    "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
  )
  foreach ($path in $paths) {
    if ($path -and (Test-Path $path)) { return $path }
  }
  return ""
}

function Install-With-Zip {
  New-Item -ItemType Directory -Force -Path $tempRoot, $extractRoot | Out-Null

  Write-Host "Downloading latest GLDN Ops..."
  Invoke-WebRequest -Uri $repoZip -OutFile $zipPath

  Write-Host "Extracting..."
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force

  $sourceRoot = Get-ChildItem -LiteralPath $extractRoot -Directory -Recurse |
    Where-Object { (Test-Path (Join-Path $_.FullName "extension\manifest.json")) -and (Test-Path (Join-Path $_.FullName "tools\install.ps1")) } |
    Select-Object -First 1

  if (-not $sourceRoot) {
    throw "Could not find GLDN Ops files inside the downloaded ZIP."
  }

  if (Test-Path $InstallRoot) {
    $backup = "$InstallRoot.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Write-Host "Existing install found. Moving it to:"
    Write-Host "  $backup"
    Move-Item -LiteralPath $InstallRoot -Destination $backup
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $InstallRoot -Parent) | Out-Null
  Copy-Item -LiteralPath $sourceRoot.FullName -Destination $InstallRoot -Recurse
}

function Install-With-Git([string]$Git) {
  if (Test-Path (Join-Path $InstallRoot ".git")) {
    Write-Host "Git install found. Pulling latest GLDN Ops..."
    Push-Location $InstallRoot
    try {
      & $Git pull --ff-only
    } finally {
      Pop-Location
    }
    return
  }

  if (Test-Path $InstallRoot) {
    $backup = "$InstallRoot.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Write-Host "Non-Git install found. Moving it to:"
    Write-Host "  $backup"
    Move-Item -LiteralPath $InstallRoot -Destination $backup
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $InstallRoot -Parent) | Out-Null
  Write-Host "Git found. Cloning latest GLDN Ops..."
  & $Git clone $repoGit $InstallRoot
}

$git = Find-Git
if ($git) {
  Install-With-Git $git
} else {
  Install-With-Zip
}

if (-not $Computer) {
  $Computer = Ask-Value "Computer number/name shown on the task sheet" "0"
}

if (-not $EbayAccount) {
  $EbayAccount = Ask-Value "eBay account label for this computer" "FAK12"
}

if (-not $DashboardSetupCode) {
  $DashboardSetupCode = Ask-Value "Dashboard setup code (blank = local only)" ""
}

$extensionRoot = Join-Path $InstallRoot "extension"
$configExample = Join-Path $extensionRoot "config.example.js"
$configFile = Join-Path $extensionRoot "config.js"
$helper = Join-Path $InstallRoot "tools\local-click-helper.ps1"

Copy-Item -LiteralPath $configExample -Destination $configFile -Force
$configText = Get-Content -LiteralPath $configFile -Raw
$configText = $configText `
  -replace 'https://script\.google\.com/macros/s/YOUR_SCRIPT_ID/exec', '' `
  -replace 'YOUR_PRIVATE_DASHBOARD_KEY', ''
Set-Content -LiteralPath $configFile -Value $configText -Encoding UTF8

if ($DashboardSetupCode -eq $dashboardCode) {
  $configText = Get-Content -LiteralPath $configFile -Raw
  $configText = $configText `
    -replace 'dashboardUrl:\s*"[^"]*"', ('dashboardUrl: "' + $dashboardUrl + '"') `
    -replace 'dashboardKey:\s*"[^"]*"', ('dashboardKey: "' + $dashboardKey + '"')
  Set-Content -LiteralPath $configFile -Value $configText -Encoding UTF8
  Write-Host "Shared dashboard sync enabled."
} elseif ($DashboardSetupCode) {
  Write-Host "Dashboard setup code was not recognized. This install will be local-only."
} else {
  Write-Host "Dashboard sync not enabled. This install will be local-only."
}

if ($StartHelper) {
  Start-Process powershell.exe -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$helper`""
  ) -WindowStyle Minimized
  Write-Host "Started local click helper."
}

$chrome = Find-Chrome
Start-Process $chrome "chrome://extensions"

Write-Host ""
Write-Host "GLDN Ops installed."
Write-Host "Install folder:"
Write-Host "  $InstallRoot"
Write-Host ""
Write-Host "Chrome extension folder to load:"
Write-Host "  $extensionRoot"
Write-Host ""
Write-Host "Chrome steps:"
Write-Host "  1. Turn on Developer mode"
Write-Host "  2. Click Load unpacked"
Write-Host "  3. Select the extension folder shown above"
Write-Host ""
Write-Host "Computer: $Computer"
Write-Host "eBay account: $EbayAccount"
Write-Host "Dashboard sync: $(if ($DashboardSetupCode -eq $dashboardCode) { 'Enabled' } else { 'Local-only' })"
