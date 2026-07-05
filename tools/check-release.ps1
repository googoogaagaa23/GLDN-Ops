param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$manifestPath = Join-Path $extensionRoot "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

if (-not $Version) {
  $Version = [string]$manifest.version
}
$plainVersion = $Version.TrimStart("v")
$tagVersion = "v$plainVersion"

$requiredFiles = @(
  "CHANGELOG.md",
  "releases\$tagVersion.md",
  "docs\RELEASE_PROCESS.md",
  "extension\manifest.json",
  "extension\README.txt"
)

$missing = @()
foreach ($file in $requiredFiles) {
  $path = Join-Path $repoRoot $file
  if (-not (Test-Path $path)) { $missing += $file }
}
if ($missing.Count) {
  throw "Missing release files: $($missing -join ', ')"
}

$versionFiles = @(
  "extension\README.txt",
  "extension\amazon.js",
  "extension\ebay.js",
  "extension\ecomsniper.js",
  "CHANGELOG.md",
  "releases\$tagVersion.md"
)

$versionMisses = @()
foreach ($file in $versionFiles) {
  $path = Join-Path $repoRoot $file
  $text = Get-Content $path -Raw
  if ($text -notmatch [regex]::Escape($plainVersion)) {
    $versionMisses += $file
  }
}
if ($versionMisses.Count) {
  throw "Version $plainVersion not found in: $($versionMisses -join ', ')"
}

$node = "C:\Users\afarr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) { $node = "node" }

& $node -e @"
const fs = require('fs');
for (const f of ['extension/ebay.js','extension/amazon.js','extension/ecomsniper.js','extension/background.js','extension/popup.js']) {
  new Function(fs.readFileSync(f, 'utf8'));
  console.log('parse ok', f);
}
"@

Write-Host "Release check passed for $tagVersion"
