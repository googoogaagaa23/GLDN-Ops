param(
  [string]$RepoZipUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/dist/GLDN-Ops-latest.zip",
  [string]$ProfileDirectory = "",
  [string]$SourceZipPath = "",
  [switch]$SkipReload
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionRoot = (Resolve-Path (Join-Path $repoRoot "extension")).Path
$versionsRoot = Join-Path $repoRoot "extension_versions"
$tempRoot = Join-Path $env:TEMP ("gldn-update-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot "GLDN-Ops-main.zip"
$backupPath = $null

function Assert-WithinRepo([string]$Path) {
  $resolved = [System.IO.Path]::GetFullPath($Path)
  $prefix = $repoRoot.TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside the GLDN project: $resolved"
  }
  return $resolved
}

function Copy-ExtensionRuntime([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | Where-Object { $_.Name -ne "config.js" } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Clear-ExtensionRuntime {
  Assert-WithinRepo $extensionRoot | Out-Null
  Get-ChildItem -LiteralPath $extensionRoot -Force | Where-Object { $_.Name -ne "config.js" } | ForEach-Object {
    $target = Assert-WithinRepo $_.FullName
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

New-Item -ItemType Directory -Force -Path $tempRoot, $versionsRoot | Out-Null

try {
  if ($SourceZipPath) {
    $resolvedSourceZip = (Resolve-Path -LiteralPath $SourceZipPath).Path
    Write-Host "Using local GLDN Ops release package: $resolvedSourceZip"
    Copy-Item -LiteralPath $resolvedSourceZip -Destination $zipPath -Force
  } else {
    Write-Host "Downloading the latest GLDN Ops release..."
    Invoke-WebRequest -Uri $RepoZipUrl -OutFile $zipPath
  }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $tempRoot -Force
  $sourceManifest = Get-ChildItem -LiteralPath $tempRoot -Recurse -File -Filter "manifest.json" |
    Where-Object { $_.FullName -match '[\\/]extension[\\/]manifest\.json$' } |
    Select-Object -First 1
  if (-not $sourceManifest) { throw "The downloaded ZIP does not contain extension\manifest.json." }
  $sourceExtension = Split-Path $sourceManifest.FullName -Parent
  $sourceRoot = Split-Path $sourceExtension -Parent
  $sourceCheck = Join-Path $sourceRoot "tools\universal-release-check.ps1"
  if (-not (Test-Path -LiteralPath $sourceCheck)) { throw "The downloaded ZIP is missing the release check." }

  Write-Host "Checking the downloaded release before touching the installed copy..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $sourceCheck
  if ($LASTEXITCODE -ne 0) { throw "The downloaded release did not pass its checks." }

  $currentManifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
  $backupPath = Join-Path $versionsRoot ("v$($currentManifest.version)-before-update-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  Assert-WithinRepo $backupPath | Out-Null
  Copy-ExtensionRuntime $extensionRoot $backupPath
  Write-Host "Saved rollback snapshot: $backupPath"

  Write-Host "Updating project tools and documentation..."
  $projectDirectories = @("tools", "docs", "dashboard", "apps-script-live", "apps-script-live-2", "apps-script-live-3", "releases", "tests", "installer")
  foreach ($directory in $projectDirectories) {
    $sourceDirectory = Join-Path $sourceRoot $directory
    if (-not (Test-Path -LiteralPath $sourceDirectory)) { continue }
    $targetDirectory = Join-Path $repoRoot $directory
    New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
    & robocopy $sourceDirectory $targetDirectory /E /XF "*.pem" | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Project directory update failed for $directory with code $LASTEXITCODE." }
    $global:LASTEXITCODE = 0
  }
  $projectFiles = @(
    "CHANGELOG.md", "INSTALL.md", "package.json", "pnpm-lock.yaml",
    "bootstrap-install.ps1", "install-latest.ps1",
    "Install-GLDN-Ops.cmd", "Update-GLDN-Ops.cmd", "Diagnose-GLDN-Ops.cmd", "Start-GLDN-Helper.cmd"
  )
  foreach ($file in $projectFiles) {
    $sourceFile = Join-Path $sourceRoot $file
    if (Test-Path -LiteralPath $sourceFile) { Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $repoRoot $file) -Force }
  }

  Write-Host "Replacing extension runtime while preserving private config.js..."
  Clear-ExtensionRuntime
  Copy-ExtensionRuntime $sourceExtension $extensionRoot

  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tools\universal-release-check.ps1")
  if ($LASTEXITCODE -ne 0) { throw "The installed update failed its final checks." }

  if (-not $SkipReload) {
    $manager = Join-Path $repoRoot "tools\local-extension-manager.ps1"
    $reloadArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $manager, "-Action", "Reload")
    if ($ProfileDirectory) { $reloadArgs += @("-ProfileDirectory", $ProfileDirectory) }
    & powershell @reloadArgs
    if ($LASTEXITCODE -ne 0) { throw "The files updated, but Chrome reload failed." }
  }

  $updatedManifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
  Write-Host "GLDN Ops updated to $($updatedManifest.version)."
} catch {
  if ($backupPath -and (Test-Path -LiteralPath $backupPath)) {
    Write-Warning "Update failed. Restoring the previous extension runtime..."
    Clear-ExtensionRuntime
    Copy-ExtensionRuntime $backupPath $extensionRoot
  }
  throw
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
