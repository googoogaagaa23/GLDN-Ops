param(
  [string]$Version = "",
  [string]$OutputRoot = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Get-FullPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path)
}

function Assert-File([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label is missing: $Path"
  }
  if ((Get-Item -LiteralPath $Path).Length -le 0) {
    throw "$Label is empty: $Path"
  }
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Invoke-CheckedScript([string]$Path, [string[]]$Arguments = @()) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Release build step failed: $Path"
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $repoRoot "extension\manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -ne [string]$manifest.version) {
  throw "Requested version $Version does not match manifest version $($manifest.version)."
}

if (-not $OutputRoot) {
  $OutputRoot = Join-Path $repoRoot "dist\public-release-v$Version"
}
$outputFull = Get-FullPath $OutputRoot
$repoFull = Get-FullPath $repoRoot
if ($outputFull.TrimEnd('\') -eq $repoFull.TrimEnd('\')) {
  throw "The release staging directory cannot be the repository root."
}
if (Test-Path -LiteralPath $outputFull) {
  if (-not $Force) {
    throw "Release staging directory already exists. Use -Force to replace it: $outputFull"
  }
  Remove-Item -LiteralPath $outputFull -Recurse -Force
}

Invoke-CheckedScript (Join-Path $repoRoot "tools\build-extension-package.ps1") @("-Version", $Version)
Invoke-CheckedScript (Join-Path $repoRoot "tools\build-updater-metadata.ps1") @("-Version", $Version)
Invoke-CheckedScript (Join-Path $repoRoot "tools\build-local-package.ps1") @("-Version", $Version)
Invoke-CheckedScript (Join-Path $repoRoot "tools\build-installer.ps1")

$distRoot = Join-Path $repoRoot "dist"
$extensionName = "GLDN-Ops-extension-v$Version.zip"
$localName = "GLDN-Ops-local-v$Version.zip"
$extensionZip = Join-Path $distRoot $extensionName
$localZip = Join-Path $distRoot $localName
$latestLocalZip = Join-Path $distRoot "GLDN-Ops-latest.zip"
$installer = Join-Path $distRoot "GLDN-Ops-Setup.exe"
$metadataPath = Join-Path $distRoot "latest.json"
$releaseNote = Join-Path $repoRoot "releases\v$Version.md"
$bootstrap = Join-Path $repoRoot "bootstrap-install.ps1"
$installLatest = Join-Path $repoRoot "install-latest.ps1"

Assert-File $extensionZip "Versioned extension package"
Assert-File $localZip "Versioned local bundle"
Assert-File $latestLocalZip "Latest local bundle"
Assert-File $installer "One-time installer"
Assert-File $metadataPath "Updater metadata"
Assert-File $releaseNote "Release notes"
Assert-File $bootstrap "Bootstrap installer"
Assert-File $installLatest "Latest installer script"

$metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json
$expectedUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/downloads/$extensionName"
$extensionHash = Get-Sha256 $extensionZip
$localHash = Get-Sha256 $localZip
$latestLocalHash = Get-Sha256 $latestLocalZip
$installerHash = Get-Sha256 $installer
if ([string]$metadata.version -ne $Version) {
  throw "Updater metadata version $($metadata.version) does not match $Version."
}
if ([string]$metadata.url -ne $expectedUrl) {
  throw "Updater metadata URL does not identify the staged extension package."
}
if ([string]$metadata.sha256 -ne $extensionHash) {
  throw "Updater metadata SHA-256 does not match the staged extension package."
}
if ($localHash -ne $latestLocalHash) {
  throw "GLDN-Ops-latest.zip is not byte-identical to $localName."
}

$downloadsRoot = Join-Path $outputFull "downloads"
$releasesRoot = Join-Path $outputFull "releases"
New-Item -ItemType Directory -Force -Path $downloadsRoot, $releasesRoot | Out-Null

# Stage every referenced file before latest.json so the metadata can never point
# at a missing package inside the assembled release directory.
Copy-Item -LiteralPath $extensionZip -Destination (Join-Path $downloadsRoot $extensionName) -Force
Copy-Item -LiteralPath $localZip -Destination (Join-Path $downloadsRoot $localName) -Force
Copy-Item -LiteralPath $latestLocalZip -Destination (Join-Path $downloadsRoot "GLDN-Ops-latest.zip") -Force
Copy-Item -LiteralPath $installer -Destination (Join-Path $downloadsRoot "GLDN-Ops-Setup.exe") -Force
Copy-Item -LiteralPath $bootstrap -Destination (Join-Path $outputFull "bootstrap-install.ps1") -Force
Copy-Item -LiteralPath $installLatest -Destination (Join-Path $outputFull "install-latest.ps1") -Force
Copy-Item -LiteralPath $releaseNote -Destination (Join-Path $releasesRoot "v$Version.md") -Force

$releaseManifest = [ordered]@{
  schemaVersion = 1
  version = $Version
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  files = @(
    [ordered]@{ path = "downloads/$extensionName"; sha256 = $extensionHash }
    [ordered]@{ path = "downloads/$localName"; sha256 = $localHash }
    [ordered]@{ path = "downloads/GLDN-Ops-latest.zip"; sha256 = $latestLocalHash }
    [ordered]@{ path = "downloads/GLDN-Ops-Setup.exe"; sha256 = $installerHash }
    [ordered]@{ path = "bootstrap-install.ps1"; sha256 = (Get-Sha256 $bootstrap) }
    [ordered]@{ path = "install-latest.ps1"; sha256 = (Get-Sha256 $installLatest) }
    [ordered]@{ path = "releases/v$Version.md"; sha256 = (Get-Sha256 $releaseNote) }
  )
  publishLast = "downloads/latest.json"
}
$releaseManifestPath = Join-Path $downloadsRoot "release-manifest-v$Version.json"
[System.IO.File]::WriteAllText(
  $releaseManifestPath,
  ($releaseManifest | ConvertTo-Json -Depth 5),
  [System.Text.UTF8Encoding]::new($false)
)

$readme = @"
# GLDN Ops Downloads

## Recommended one-time setup

- [Download GLDN Ops Setup](./GLDN-Ops-Setup.exe)

Run Setup once on each Windows computer. Load the stable extension folder once
in every intended Chrome profile. Later updates use **Update & Reload**.

SHA-256: $installerHash

## Current extension package

- [Download GLDN Ops v$Version](./$extensionName)

SHA-256: $extensionHash

## Current full local bundle

- [Download the GLDN Ops v$Version local bundle](./$localName)

SHA-256: $localHash

The complete machine-readable file list is in
[release-manifest-v$Version.json](./release-manifest-v$Version.json).
"@
[System.IO.File]::WriteAllText(
  (Join-Path $downloadsRoot "README.md"),
  $readme,
  [System.Text.UTF8Encoding]::new($false)
)

# Copy updater metadata last, after its target and every recovery artifact exist.
Copy-Item -LiteralPath $metadataPath -Destination (Join-Path $downloadsRoot "latest.json") -Force

$stagedMetadata = Get-Content -Raw -LiteralPath (Join-Path $downloadsRoot "latest.json") | ConvertFrom-Json
$stagedExtension = Join-Path $downloadsRoot ([System.IO.Path]::GetFileName([Uri]$stagedMetadata.url))
Assert-File $stagedExtension "Staged updater target"
if ((Get-Sha256 $stagedExtension) -ne [string]$stagedMetadata.sha256) {
  throw "Staged latest.json does not match its staged extension package."
}

foreach ($entry in $releaseManifest.files) {
  $path = Join-Path $outputFull ([string]$entry.path).Replace('/', '\')
  Assert-File $path "Staged release file"
  if ((Get-Sha256 $path) -ne [string]$entry.sha256) {
    throw "Staged release file hash changed: $($entry.path)"
  }
}

$summary = [ordered]@{
  version = $Version
  outputRoot = $outputFull
  extensionSha256 = $extensionHash
  localBundleSha256 = $localHash
  installerSha256 = $installerHash
  updaterTargetVerified = $true
  latestMetadataStagedLast = $true
  privateConfigIncluded = $false
  readyForReview = $true
}
Write-Output ($summary | ConvertTo-Json -Compress)
