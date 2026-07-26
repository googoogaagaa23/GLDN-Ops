param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\GLDN Ops",
  [string]$DashboardSetupCode = "",
  [string]$ProfileDirectory = "",
  [string]$BootstrapScriptPath = ""
)

$ErrorActionPreference = "Stop"
$scriptUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/bootstrap-install.ps1"
$scriptPath = if ($BootstrapScriptPath) {
  (Resolve-Path -LiteralPath $BootstrapScriptPath).Path
} else {
  Join-Path $env:TEMP "gldn-bootstrap-install.ps1"
}
$logRoot = Join-Path $env:LOCALAPPDATA "GLDN Ops Installer"
$logPath = Join-Path $logRoot ("setup-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$latestLogPath = Join-Path $logRoot "latest.log"
$transcriptStarted = $false
$exitCode = 1

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

try {
  try {
    Start-Transcript -LiteralPath $logPath -Force | Out-Null
    $transcriptStarted = $true
  } catch {
    Write-Warning "The setup transcript could not start. Console output will still remain visible."
  }

  if ($BootstrapScriptPath) {
    Write-Host "Using the verified bootstrap included in GLDN Ops Setup..."
  } else {
    Write-Host "Downloading the verified GLDN Ops installer..."
    Invoke-WebRequest -UseBasicParsing -Uri $scriptUrl -OutFile $scriptPath
  }

  $arguments = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath,
    "-InstallRoot", $InstallRoot
  )
  if ($DashboardSetupCode) { $arguments += @("-DashboardSetupCode", $DashboardSetupCode) }
  if ($ProfileDirectory) { $arguments += @("-ProfileDirectory", $ProfileDirectory) }

  & powershell.exe @arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "The GLDN Ops installer stopped with exit code $exitCode."
  }

  Write-Host "GLDN Ops setup completed successfully." -ForegroundColor Green
  $exitCode = 0
} catch {
  Write-Host ""
  Write-Host "GLDN Ops setup failed: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
} finally {
  if ($transcriptStarted) {
    try { Stop-Transcript | Out-Null } catch {}
  }
  if (Test-Path -LiteralPath $logPath) {
    Copy-Item -LiteralPath $logPath -Destination $latestLogPath -Force
  }
}

Write-Host "Setup log: $latestLogPath"
exit $exitCode
