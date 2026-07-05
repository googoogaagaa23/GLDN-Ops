param(
  [string]$InstallRoot = "$env:USERPROFILE\Desktop\GLDN-Ops",
  [string]$Computer = "",
  [string]$EbayAccount = "",
  [string]$DashboardSetupCode = "GLDN2026",
  [switch]$InstallChromePolicy,
  [switch]$StartHelper
)

$ErrorActionPreference = "Stop"

$scriptUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/bootstrap-install.ps1"
$scriptPath = Join-Path $env:TEMP "gldn-bootstrap-install.ps1"

Invoke-WebRequest -Uri $scriptUrl -OutFile $scriptPath

$args = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$scriptPath`"",
  "-InstallRoot", "`"$InstallRoot`""
)

if ($DashboardSetupCode) {
  $args += @("-DashboardSetupCode", "`"$DashboardSetupCode`"")
}

if ($InstallChromePolicy) {
  $args += "-InstallChromePolicy"
}

if ($StartHelper) {
  $args += "-StartHelper"
}

Start-Process powershell.exe -ArgumentList $args -Wait
