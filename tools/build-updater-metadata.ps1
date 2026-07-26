param(
  [string]$Version = "",
  [string]$PackagePath = "",
  [string]$PackageUrl = "",
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "extension\manifest.json") | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -ne [string]$manifest.version) { throw "Metadata version $Version does not match manifest version $($manifest.version)." }
if (-not $PackagePath) { $PackagePath = Join-Path $repoRoot "dist\GLDN-Ops-extension-v$Version.zip" }
$PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
if (-not $PackageUrl) {
  $PackageUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/downloads/GLDN-Ops-extension-v$Version.zip"
}
if (-not $OutputPath) { $OutputPath = Join-Path $repoRoot "dist\latest.json" }

$hash = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash
$metadata = [ordered]@{
  schemaVersion = 1
  channel = "stable"
  version = $Version
  publishedAt = (Get-Date).ToUniversalTime().ToString("o")
  url = $PackageUrl
  sha256 = $hash
  minimumUpdaterVersion = "1.0.0"
  notesUrl = "https://github.com/googoogaagaa23/GLDN-Ops/blob/main/releases/v$Version.md"
}
New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath -Parent) | Out-Null
$json = $metadata | ConvertTo-Json
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Built verified updater metadata:"
Write-Host "  $OutputPath"
Write-Host "  SHA256 $hash"
