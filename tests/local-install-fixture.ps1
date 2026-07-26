param([string]$PackagePath = "")

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $PackagePath) { $PackagePath = Join-Path $repoRoot "dist\GLDN-Ops-latest.zip" }
$PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
$testRoot = Join-Path $env:TEMP ("gldn-clean-install-fixture-" + [guid]::NewGuid().ToString("N"))
$installRoot = Join-Path $testRoot "GLDN-Ops"
$bootstrap = Join-Path $repoRoot "bootstrap-install.ps1"
$initialCode = "fixture-dashboard-" + [guid]::NewGuid().ToString("N")
$replacementCode = "replacement-dashboard-" + [guid]::NewGuid().ToString("N")

$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
$tempPrefix = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not $resolvedTestRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe install fixture path: $resolvedTestRoot"
}

try {
  New-Item -ItemType Directory -Force -Path $testRoot | Out-Null

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bootstrap `
    -InstallRoot $installRoot `
    -DashboardSetupCode $initialCode `
    -SourceZipPath $PackagePath `
    -ProfileDirectory "Profile 2" `
    -SkipChromeOpen `
    -SkipUpdaterStart | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Clean install fixture failed." }

  $manifestPath = Join-Path $installRoot "extension\manifest.json"
  $configPath = Join-Path $installRoot "extension\config.js"
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Clean install did not create extension\manifest.json." }
  if (-not (Test-Path -LiteralPath $configPath)) { throw "Clean install did not create extension\config.js." }

  $firstManifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $firstConfig = Get-Content -Raw -LiteralPath $configPath
  if ($firstConfig -notmatch [regex]::Escape($initialCode)) { throw "Clean install did not save the supplied dashboard setup code." }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bootstrap `
    -InstallRoot $installRoot `
    -DashboardSetupCode $replacementCode `
    -SourceZipPath $PackagePath `
    -ProfileDirectory "Profile 2" `
    -SkipChromeOpen `
    -SkipUpdaterStart | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Clean update fixture failed." }

  $finalManifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $finalConfig = Get-Content -Raw -LiteralPath $configPath
  $backups = @(Get-ChildItem -LiteralPath $testRoot -Directory -Filter "GLDN-Ops.backup-*")
  $configPreserved = $finalConfig -eq $firstConfig -and $finalConfig -match [regex]::Escape($initialCode) -and $finalConfig -notmatch [regex]::Escape($replacementCode)
  $installedVersion = [string]$firstManifest.version
  $pass = $installedVersion -and [string]$finalManifest.version -eq $installedVersion -and $configPreserved -and $backups.Count -eq 1

  [pscustomobject]@{
    version = [string]$finalManifest.version
    cleanInstall = $true
    updateBackupCount = $backups.Count
    configPreserved = $configPreserved
    profileWithSpaceAccepted = $true
    pass = $pass
  } | ConvertTo-Json -Compress

  if (-not $pass) { throw "Local install fixture did not meet every assertion." }
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
    if ($resolvedTestRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
  }
}
