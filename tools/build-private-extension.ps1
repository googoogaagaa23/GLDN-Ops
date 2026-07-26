param([string]$Version = "")

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionRoot = Join-Path $repoRoot "extension"
$manifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -ne [string]$manifest.version) { throw "Requested version $Version does not match manifest version $($manifest.version)." }

$privateConfig = Join-Path $extensionRoot "config.js"
if (-not (Test-Path -LiteralPath $privateConfig)) { throw "Private extension/config.js is missing." }
$configText = Get-Content -Raw -LiteralPath $privateConfig
$keyMatch = [regex]::Match($configText, 'dashboardKey\s*:\s*["'']([^"'']+)["'']')
if (-not $keyMatch.Success -or $keyMatch.Groups[1].Value -match '^YOUR_') {
  throw "Private extension/config.js does not contain a usable dashboard setup code."
}

$buildRoot = Join-Path $repoRoot ".private-extension-build"
$stageRoot = Join-Path $buildRoot "extension"
$distRoot = Join-Path $repoRoot "dist"
$zipPath = Join-Path $distRoot "GLDN-Ops-extension-v$Version.zip"

if (Test-Path -LiteralPath $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageRoot, $distRoot | Out-Null
Get-ChildItem -LiteralPath $extensionRoot -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $stageRoot -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $buildRoot -Recurse -Force

Write-Host "Built private auto-configuring extension package:"
Write-Host "  $zipPath"
