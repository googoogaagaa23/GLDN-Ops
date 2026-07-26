param(
  [string]$Version = "",
  [switch]$SkipDashboardContract,
  [switch]$SkipLiveDashboardContract,
  [switch]$RunFixtureBrowserChecks,
  [switch]$RunSignedInBrowserChecks,
  [switch]$RequireLiveVideo
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
  "INSTALL.md",
  "docs\RELEASE_PROCESS.md",
  "docs\LOCAL_DEPLOYMENT.md",
  "docs\LIVE_TEST_VIDEO_STANDARD.md",
  "docs\MASTER_FEATURE_MATRIX.md",
  "extension\manifest.json",
  "extension\README.txt",
  "extension\sniping-review.html",
  "extension\sniping-review.css",
  "extension\sniping-review.js",
  "tools\build-local-package.ps1",
  "tools\local-extension-manager.ps1",
  "tools\update.ps1",
  "tools\gldn-update-core.ps1",
  "tools\gldn-update-agent.ps1",
  "tools\install-update-agent.ps1",
  "tests\local-install-fixture.ps1",
  "tests\one-time-installer-fixture.ps1",
  "tests\local-updater-fixture.ps1",
  "tests\poshmark-daily-history.test.js",
  "tests\poshmark-profit-audit.test.js",
  "tests\ebay-profit-audit.test.js",
  "tests\dashboard-profit-upsert.test.js",
  "tests\reload-wiring.test.js"
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
  "CHANGELOG.md",
  "releases\$tagVersion.md"
)

$releaseNotePath = Join-Path $repoRoot "releases\$tagVersion.md"
$releaseNoteText = Get-Content -Raw -LiteralPath $releaseNotePath
$changelogText = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "CHANGELOG.md")
$matrixText = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "docs\MASTER_FEATURE_MATRIX.md")

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

if ($releaseNoteText -notmatch '(?m)^## Verification\s*$') {
  throw "Release $tagVersion is missing its Verification section."
}
if ($changelogText -notmatch "(?m)^##\s+$([regex]::Escape($tagVersion))\s+-") {
  throw "CHANGELOG.md is missing the current $tagVersion release heading."
}
if ($matrixText -notmatch "Current local manifest:\s*$([regex]::Escape($plainVersion))\b") {
  throw "MASTER_FEATURE_MATRIX.md does not identify current manifest $plainVersion."
}
if ($matrixText -notmatch '(?m)^\| F-14 \|') {
  throw "MASTER_FEATURE_MATRIX.md is missing the F-14 release-discipline gate."
}
Write-Host "ok - release notes, changelog and matrix identify $tagVersion"

if ($RequireLiveVideo) {
  $driveLinkMatches = @([regex]::Matches(
    $releaseNoteText,
    'https://drive\.google\.com/file/d/[^/\s]+/view(?:\?[^\s)]*)?'
  ))
  if (-not $driveLinkMatches.Count) {
    throw "Release $tagVersion is missing a Google Drive proof-video view link."
  }

  $matrixHasReleaseProof = $false
  foreach ($match in $driveLinkMatches) {
    if ($matrixText.Contains($match.Value)) {
      $matrixHasReleaseProof = $true
      break
    }
  }
  if (-not $matrixHasReleaseProof) {
    throw "MASTER_FEATURE_MATRIX.md does not cite any proof-video link from release $tagVersion."
  }

  $versionPattern = [regex]::Escape("v$plainVersion")
  $liveVideos = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "evidence") -Recurse -File -Filter "*.mp4" |
    Where-Object { $_.Name -match $versionPattern -and $_.Length -gt 0 })
  if (-not $liveVideos.Count) {
    throw "Release $tagVersion is missing a non-empty local MP4 proof video under evidence."
  }
  Write-Host "ok - live proof video, Drive link and matrix citation"
}

$manifestText = Get-Content (Join-Path $repoRoot "extension\manifest.json") -Raw
if ($manifestText -match '"management"') { throw "Manifest includes management permission." }
if ($manifestText -match 'localhost|127\.0\.0\.1') { throw "Manifest includes external Windows helper host permission." }
if ($manifestText -match '"update_url"') { throw "Manifest includes update_url; Web Store package should not." }

$dynamicVersionFiles = @(
  "extension\foundation.js",
  "extension\popup.js",
  "extension\amazon.js",
  "extension\walmart.js",
  "extension\ebay.js",
  "extension\ecomsniper.js",
  "extension\poshmark.js",
  "extension\start-move99.js",
  "extension\sniping-review.js"
)
foreach ($file in $dynamicVersionFiles) {
  $path = Join-Path $repoRoot $file
  $text = Get-Content $path -Raw
  if ($file -ne "extension\foundation.js" -and $file -ne "extension\start-move99.js" -and $text -notmatch "chrome\.runtime\.getManifest\(\)\.version") {
    throw "Dynamic manifest version display not found in: $file"
  }
}

$node = "C:\Users\afarr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) { $node = "node" }

& $node -e @"
const fs = require('fs');
for (const f of ['extension/config.example.js','extension/foundation.js','extension/shared.js','extension/profit-audit.js','extension/sniping-audit.js','extension/sniping-review.js','extension/ebay.js','extension/amazon.js','extension/walmart.js','extension/ecomsniper.js','extension/poshmark.js','extension/background.js','extension/popup.js','extension/start-move99.js']) {
  new Function(fs.readFileSync(f, 'utf8'));
  console.log('parse ok', f);
}
"@

& (Join-Path $repoRoot "tools\universal-release-check.ps1") -BuildPackage -RequireJavaScriptParser
if ($LASTEXITCODE -ne 0) {
  throw "Universal release check failed."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tools\build-private-extension.ps1") -Version $plainVersion
if ($LASTEXITCODE -ne 0) {
  throw "Private extension package build failed."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tools\build-updater-metadata.ps1") -Version $plainVersion
if ($LASTEXITCODE -ne 0) {
  throw "Stable updater metadata build failed."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tests\local-install-fixture.ps1") -PackagePath (Join-Path $repoRoot "dist\GLDN-Ops-latest.zip")
if ($LASTEXITCODE -ne 0) {
  throw "Local clean-install/update fixture failed."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tests\one-time-installer-fixture.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "One-time Setup and running-updater fixture failed."
}

if (-not $SkipDashboardContract) {
  & (Join-Path $repoRoot "tools\test-dashboard-contract.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Dashboard contract check failed."
  }
}

if (-not $SkipLiveDashboardContract) {
  & (Join-Path $repoRoot "tools\test-dashboard-live-contract.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Live dashboard contract check failed."
  }
}

$nodeTests = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "tests") -Filter "*.test.js" -File |
  Sort-Object Name |
  ForEach-Object { $_.FullName })
& $node --test --test-isolation=none @nodeTests
if ($LASTEXITCODE -ne 0) {
  throw "Automated test suite failed."
}

$dashboardHash = (Get-FileHash -Algorithm SHA256 (Join-Path $repoRoot "dashboard\GLDN_Ops_Dashboard_Code.gs")).Hash
$embeddedHash = (Get-FileHash -Algorithm SHA256 (Join-Path $repoRoot "extension\dashboard_apps_script\Code.gs")).Hash
$liveHash = (Get-FileHash -Algorithm SHA256 (Join-Path $repoRoot "apps-script-live\Code.js")).Hash
if ($dashboardHash -ne $embeddedHash -or $dashboardHash -ne $liveHash) {
  throw "Dashboard Apps Script mirrors are not identical."
}

$tasksScript = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "apps-script-live-3\Timestamps.js")
if ($tasksScript -match 'percent\s*<\s*90') { throw "Tasks tracking alert still contains the retired 90% threshold." }
if ($tasksScript -notmatch 'percent\s*<\s*85') { throw "Tasks tracking alert is missing the 85% threshold." }

$secretScanFiles = @(
  "bootstrap-install.ps1",
  "install-latest.ps1",
  "dashboard\GLDN_Ops_Dashboard_Code.gs"
) + @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "tools") -Filter "*.ps1" | ForEach-Object { "tools\$($_.Name)" })
$privateKeyPattern = 'GLDN' + '.Private' + '.Seller' + '.Level' + '.[0-9]'
foreach ($file in $secretScanFiles) {
  if ((Get-Content -Raw -LiteralPath (Join-Path $repoRoot $file)) -match $privateKeyPattern) {
    throw "Private dashboard setup code is embedded in tracked source: $file"
  }
}

if ($RunFixtureBrowserChecks) {
  & (Join-Path $repoRoot "tools\test-extension-health.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Fixture browser health check failed."
  }
}

if ($RunSignedInBrowserChecks) {
  & (Join-Path $repoRoot "tools\test-poshmark-computer-guard.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Signed-in Poshmark computer guard browser check failed."
  }
}

Write-Host "Release check passed for $tagVersion"
