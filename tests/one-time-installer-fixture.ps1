param(
  [string]$LocalPackagePath = "",
  [string]$PrivateExtensionPath = "",
  [string]$MetadataPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $LocalPackagePath) { $LocalPackagePath = Join-Path $repoRoot "dist\GLDN-Ops-latest.zip" }
if (-not $PrivateExtensionPath) {
  $version = [string]((Get-Content -Raw -LiteralPath (Join-Path $repoRoot "extension\manifest.json") | ConvertFrom-Json).version)
  $PrivateExtensionPath = Join-Path $repoRoot "dist\GLDN-Ops-extension-v$version.zip"
}
if (-not $MetadataPath) { $MetadataPath = Join-Path $repoRoot "dist\latest.json" }

$testRoot = Join-Path $env:TEMP ("gldn-one-time-installer-" + [guid]::NewGuid().ToString("N"))
$installRoot = Join-Path $testRoot "GLDN Ops"
$agentProcess = $null
try {
  New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "bootstrap-install.ps1") `
    -InstallRoot $installRoot `
    -SourceZipPath $LocalPackagePath `
    -ReleaseMetadataPath $MetadataPath `
    -PrivateExtensionZipPath $PrivateExtensionPath `
    -SkipChromeOpen `
    -SkipUpdaterStart | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "One-time installer fixture failed." }

  $manifestPath = Join-Path $installRoot "extension\manifest.json"
  $configPath = Join-Path $installRoot "extension\config.js"
  $updaterConfigPath = Join-Path $installRoot "updater.json"
  $agentPath = Join-Path $installRoot "tools\gldn-update-agent.ps1"
  foreach ($path in @($manifestPath, $configPath, $updaterConfigPath, $agentPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "One-time installer fixture is missing $path" }
  }
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $configText = Get-Content -Raw -LiteralPath $configPath
  $keyMatch = [regex]::Match($configText, 'dashboardKey\s*:\s*["'']([^"'']+)["'']')
  if (-not $keyMatch.Success -or $keyMatch.Groups[1].Value -match '^YOUR_') {
    throw "One-time installer did not seed the automatic dashboard connection."
  }
  $updaterConfig = Get-Content -Raw -LiteralPath $updaterConfigPath | ConvertFrom-Json
  if ([System.IO.Path]::GetFullPath([string]$updaterConfig.installRoot) -ne [System.IO.Path]::GetFullPath($installRoot)) {
    throw "Updater configuration points to the wrong stable install folder."
  }

  $agentPort = Get-Random -Minimum 41000 -Maximum 49000
  $agentArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Action Serve -InstallRoot "{1}" -Port {2}' -f `
    $agentPath.Replace('"', '\"'), $installRoot.Replace('"', '\"'), $agentPort
  $agentProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $agentArguments -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 750
  $agentProcess.Refresh()
  if ($agentProcess.HasExited) { throw "Updater-lock fixture could not start its existing updater." }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "bootstrap-install.ps1") `
    -InstallRoot $installRoot `
    -SourceZipPath $LocalPackagePath `
    -ReleaseMetadataPath $MetadataPath `
    -PrivateExtensionZipPath $PrivateExtensionPath `
    -SkipChromeOpen `
    -SkipUpdaterStart | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Reinstall with a running updater failed." }

  $agentProcess.Refresh()
  if (-not $agentProcess.HasExited) { throw "Reinstall did not stop the existing updater before replacing its folder." }
  $backups = @(Get-ChildItem -LiteralPath $testRoot -Directory -Filter "GLDN Ops.backup-*")
  if ($backups.Count -ne 1) { throw "Reinstall did not create exactly one stable-folder backup." }

  [pscustomobject]@{
    version = [string]$manifest.version
    stableFolder = $true
    privateDashboardSeeded = $true
    updaterConfigured = $true
    runningUpdaterStoppedForReinstall = $true
    reinstallBackupCount = $backups.Count
    noChromeProfileOpened = $true
    noAdminRequired = $true
    pass = $true
  } | ConvertTo-Json -Compress
} finally {
  if ($agentProcess) {
    try {
      $agentProcess.Refresh()
      if (-not $agentProcess.HasExited) { Stop-Process -Id $agentProcess.Id -Force }
    } catch {}
  }
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    $tempPrefix = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    if ($resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
  }
}
