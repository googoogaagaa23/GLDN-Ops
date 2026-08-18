param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$manifestPath = Join-Path $extensionRoot "manifest.json"
$distRoot = Join-Path $repoRoot "dist"
$buildRoot = Join-Path $repoRoot ".webstore-build"
$stageRoot = Join-Path $buildRoot "extension"

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -ne [string]$manifest.version) {
  throw "Requested version $Version does not match manifest version $($manifest.version)."
}

New-Item -ItemType Directory -Force -Path $distRoot, $buildRoot | Out-Null
if (Test-Path $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

$runtimeFiles = @(
  "manifest.json",
  "config.example.js",
  "foundation.js",
  "shared.js",
  "control-heartbeat.js",
  "profit-audit.js",
  "sniping-audit.js",
  "subscribe-save.js",
  "sniping-review.html",
  "sniping-review.css",
  "sniping-review.js",
  "background.js",
  "popup.html",
  "popup.js",
  "styles.css",
  "guide.html",
  "amazon.js",
  "walmart.js",
  "ebay.js",
  "ecomsniper.js",
  "poshmark.js",
  "reload.html",
  "reload.js",
  "start-move99.html",
  "start-move99.js"
)

foreach ($file in $runtimeFiles) {
  $source = Join-Path $extensionRoot $file
  if (-not (Test-Path $source)) { throw "Missing extension runtime file: $file" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot $file)
}

Copy-Item -LiteralPath (Join-Path $extensionRoot "icons") -Destination (Join-Path $stageRoot "icons") -Recurse

$stagedManifest = Get-Content -LiteralPath (Join-Path $stageRoot "manifest.json") -Raw | ConvertFrom-Json
if ($stagedManifest.permissions -contains "management") { throw "Chrome Web Store package must not request management permission." }
if ($stagedManifest.PSObject.Properties.Name -contains "update_url") { throw "Chrome Web Store package must not include update_url." }
if ($stagedManifest.PSObject.Properties.Name -contains "key") { throw "Chrome Web Store package must not include a manifest key." }
foreach ($hostPermission in @($stagedManifest.host_permissions)) {
  if ($hostPermission -match "localhost|127\.0\.0\.1") { throw "Chrome Web Store package must not include external Windows helper host permissions." }
}

$configText = Get-Content -LiteralPath (Join-Path $stageRoot "config.example.js") -Raw
if ($configText -match 'dashboardKey:\s*"[^"]{1,}"') {
  throw "Chrome Web Store package must not contain a built-in dashboard key."
}
if ($configText -match "GLDN-Private-Seller-Level") {
  throw "Chrome Web Store package contains the private dashboard key."
}

$zipPath = Join-Path $distRoot "GLDN-Ops-webstore-v$Version.zip"
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Built Chrome Web Store ZIP:"
Write-Host "  $zipPath"
