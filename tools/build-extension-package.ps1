param([string]$Version = "")

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionRoot = Join-Path $repoRoot "extension"
$manifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -ne [string]$manifest.version) {
  throw "Requested version $Version does not match manifest version $($manifest.version)."
}

$buildRoot = Join-Path $repoRoot ".public-extension-build"
$stageRoot = Join-Path $buildRoot "extension"
$distRoot = Join-Path $repoRoot "dist"
$zipPath = Join-Path $distRoot "GLDN-Ops-extension-v$Version.zip"

if (Test-Path -LiteralPath $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageRoot, $distRoot | Out-Null

Get-ChildItem -LiteralPath $extensionRoot -Force | Where-Object { $_.Name -ne "config.js" } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $stageRoot -Recurse -Force
}

$exampleConfig = Join-Path $stageRoot "config.example.js"
if (-not (Test-Path -LiteralPath $exampleConfig)) { throw "Credential-free config.example.js is missing." }
$configText = Get-Content -Raw -LiteralPath $exampleConfig
if ($configText -match 'dashboardKey\s*:\s*["''][^"'']+["'']') {
  throw "Public extension package contains a dashboard setup code."
}

$legacyPrivatePattern = 'GLDN' + '.Private' + '.Seller' + '.Level' + '.[0-9]'
$textFiles = Get-ChildItem -LiteralPath $stageRoot -Recurse -File | Where-Object {
  $_.Extension -in @('.js', '.json', '.html', '.css', '.txt', '.md', '.ps1', '.gs')
}
foreach ($file in $textFiles) {
  $text = Get-Content -Raw -LiteralPath $file.FullName
  if ($text -match $legacyPrivatePattern) {
    throw "Public extension package contains a legacy private dashboard credential in $($file.FullName)."
  }
  if ($text -match 'const\s+SYNC_KEY\s*=\s*["''][^"'']{1,}["'']') {
    throw "Public extension package contains a hardcoded dashboard credential in $($file.FullName)."
  }
}

if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $buildRoot -Recurse -Force

Write-Host "Built credential-free extension package:"
Write-Host "  $zipPath"
