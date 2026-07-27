param([string]$Version = "")

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionRoot = Join-Path $repoRoot "extension"
$manifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot "manifest.json") | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -ne [string]$manifest.version) { throw "Requested version $Version does not match manifest version $($manifest.version)." }

$distRoot = Join-Path $repoRoot "dist"
$buildRoot = Join-Path $repoRoot ".local-build"
$stageRoot = Join-Path $buildRoot "GLDN-Ops"
$zipPath = Join-Path $distRoot "GLDN-Ops-local-v$Version.zip"
$latestPath = Join-Path $distRoot "GLDN-Ops-latest.zip"

$extensionFiles = @(
  "manifest.json", "config.example.js", "theme-catalog.js", "foundation.js", "shared.js", "profit-audit.js", "profit-backfill.js", "profit-backfill-background.js", "sniping-audit.js",
  "sniping-review.html", "sniping-review.css", "sniping-review.js", "background.js",
  "popup.html", "popup.js", "styles.css", "themes.css", "theme-page.js", "guide.html", "onboarding.html", "onboarding.js", "universal.js",
  "amazon.js", "walmart.js",
  "ebay.js", "ecomsniper.js", "poshmark.js", "reload.html", "reload.js",
  "start-move99.html", "start-move99.js", "README.txt"
)
$projectDirectories = @("tools", "docs", "dashboard", "releases", "tests", "installer")
$projectFiles = @(
  "CHANGELOG.md", "INSTALL.md", "package.json", "pnpm-lock.yaml",
  "bootstrap-install.ps1", "install-latest.ps1",
  "Install-GLDN-Ops.cmd", "Install-GLDN-Ops-Updater.cmd", "Update-GLDN-Ops.cmd", "Diagnose-GLDN-Ops.cmd", "Start-GLDN-Helper.cmd"
)

New-Item -ItemType Directory -Force -Path $distRoot, $buildRoot | Out-Null
if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot "extension") | Out-Null

foreach ($file in $extensionFiles) {
  $source = Join-Path $extensionRoot $file
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing extension runtime file: $file" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot "extension\$file") -Force
}
Copy-Item -LiteralPath (Join-Path $extensionRoot "icons") -Destination (Join-Path $stageRoot "extension\icons") -Recurse -Force

foreach ($directory in $projectDirectories) {
  $source = Join-Path $repoRoot $directory
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing local release directory: $directory" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot $directory) -Recurse -Force
}
foreach ($legacyTool in @("build-webstore-zip.ps1", "install-chrome-policy.ps1", "local-click-helper.ps1", "test-extension-health.ps1", "test-poshmark-computer-guard.ps1")) {
  $legacyPath = Join-Path $stageRoot "tools\$legacyTool"
  if (Test-Path -LiteralPath $legacyPath) { Remove-Item -LiteralPath $legacyPath -Force }
}
foreach ($file in $projectFiles) {
  $source = Join-Path $repoRoot $file
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing local release file: $file" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot $file) -Force
}

$configText = Get-Content -Raw -LiteralPath (Join-Path $stageRoot "extension\config.example.js")
if ($configText -match 'dashboardKey:\s*"[^"]{1,}"') { throw "Local package contains a built-in dashboard setup code." }
$privateKeyPattern = 'GLDN' + '.Private' + '.Seller' + '.Level' + '.[0-9]'
if ($configText -match $privateKeyPattern) { throw "Local package contains a private dashboard setup code." }

foreach ($target in @($zipPath, $latestPath)) {
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
}
Compress-Archive -Path $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal
Copy-Item -LiteralPath $zipPath -Destination $latestPath -Force

Write-Host "Built local GLDN Ops release bundle:"
Write-Host "  $zipPath"
Write-Host "  $latestPath"
