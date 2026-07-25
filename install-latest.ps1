param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\GLDN Ops",
  [string]$DashboardSetupCode = "",
  [string]$ProfileDirectory = ""
)

$ErrorActionPreference = "Stop"
$scriptUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/bootstrap-install.ps1"
$scriptPath = Join-Path $env:TEMP "gldn-bootstrap-install.ps1"
Invoke-WebRequest -Uri $scriptUrl -OutFile $scriptPath

$arguments = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath,
  "-InstallRoot", $InstallRoot
)
if ($DashboardSetupCode) { $arguments += @("-DashboardSetupCode", $DashboardSetupCode) }
if ($ProfileDirectory) { $arguments += @("-ProfileDirectory", $ProfileDirectory) }
& powershell @arguments
exit $LASTEXITCODE
