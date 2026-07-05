param(
  [string]$InstallRoot = "$env:USERPROFILE\Desktop\GLDN-Ops",
  [string]$Computer = "",
  [string]$EbayAccount = "",
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

if ($Computer) {
  $args += @("-Computer", "`"$Computer`"")
}

if ($EbayAccount) {
  $args += @("-EbayAccount", "`"$EbayAccount`"")
}

if ($StartHelper) {
  $args += "-StartHelper"
}

Start-Process powershell.exe -ArgumentList $args -Wait
