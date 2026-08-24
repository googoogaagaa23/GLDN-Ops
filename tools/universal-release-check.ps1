param(
  [switch]$BuildPackage,
  [switch]$RequireJavaScriptParser
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$manifestPath = Join-Path $extensionRoot "manifest.json"
$failures = [System.Collections.Generic.List[string]]::new()
$passes = [System.Collections.Generic.List[string]]::new()

function Fail($message) {
  [void]$script:failures.Add($message)
}

function Pass($message) {
  [void]$script:passes.Add($message)
}

function Assert-True($condition, $message) {
  if (-not $condition) { Fail $message }
}

function RepoPath($relativePath) {
  Join-Path $repoRoot $relativePath
}

function ExtensionPath($relativePath) {
  Join-Path $extensionRoot $relativePath
}

function Read-Text($path) {
  [System.IO.File]::ReadAllText($path)
}

function As-Array($value) {
  if ($null -eq $value) { return @() }
  if ($value -is [System.Array]) { return @($value) }
  return @($value)
}

function Add-ReferencedFile($set, $relativePath) {
  if (-not $relativePath) { return }
  $normalized = [string]$relativePath
  $normalized = $normalized.Replace("/", "\")
  $set[$normalized] = $true
}

function Has-Text($text, $pattern) {
  return $text -match $pattern
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Missing extension manifest: $manifestPath"
}

$manifestText = Read-Text $manifestPath
$manifest = $manifestText | ConvertFrom-Json
$version = [string]$manifest.version

Assert-True ($manifest.manifest_version -eq 3) "Manifest must be MV3."
Assert-True ([bool]$version) "Manifest version is missing."
Assert-True ($manifest.name -eq "GLDN Ops") "Manifest name must be GLDN Ops."
Assert-True (-not ($manifest.PSObject.Properties.Name -contains "update_url")) "Local manifest must not include a remote update_url."
Assert-True (-not ($manifest.PSObject.Properties.Name -contains "key")) "Local manifest must not include a fixed extension key."
Assert-True (-not ((As-Array $manifest.permissions) -contains "management")) "Local build must not request Chrome management permission."
Assert-True (-not ($manifestText -match "localhost|127\.0\.0\.1")) "Manifest must not include localhost helper permissions."
Pass "manifest policy checks"

$referenced = [ordered]@{}
Add-ReferencedFile $referenced "manifest.json"
Add-ReferencedFile $referenced $manifest.background.service_worker
Add-ReferencedFile $referenced $manifest.action.default_popup
foreach ($icon in $manifest.icons.PSObject.Properties) { Add-ReferencedFile $referenced $icon.Value }
foreach ($icon in $manifest.action.default_icon.PSObject.Properties) { Add-ReferencedFile $referenced $icon.Value }

foreach ($contentScript in (As-Array $manifest.content_scripts)) {
  $jsFiles = As-Array $contentScript.js
  Assert-True ($jsFiles.Count -ge 5) "Each content script must load config, theme catalog, foundation, shared, and a site script."
  Assert-True ($jsFiles[0] -eq "config.example.js") "Content scripts must load config.example.js first."
  Assert-True ($jsFiles[1] -eq "theme-catalog.js") "Content scripts must load theme-catalog.js second."
  Assert-True ($jsFiles[2] -eq "foundation.js") "Content scripts must load foundation.js third."
  Assert-True ($jsFiles[3] -eq "shared.js") "Content scripts must load shared.js fourth."
  foreach ($file in $jsFiles) { Add-ReferencedFile $referenced $file }
  foreach ($file in (As-Array $contentScript.css)) { Add-ReferencedFile $referenced $file }
}

foreach ($resourceGroup in (As-Array $manifest.web_accessible_resources)) {
  foreach ($file in (As-Array $resourceGroup.resources)) { Add-ReferencedFile $referenced $file }
}

foreach ($file in $referenced.Keys) {
  Assert-True (Test-Path -LiteralPath (ExtensionPath $file)) "Manifest references missing file: extension\$file"
}
Pass "manifest file references"

$configText = Read-Text (ExtensionPath "config.example.js")
$privateKeyPattern = 'GLDN' + '.Private' + '.Seller' + '.Level' + '.[0-9]'
Assert-True ($configText -match 'dashboardUrl:\s*"https://script\.google\.com/.+/exec"') "config.example.js must contain the built-in Apps Script /exec dashboard URL."
Assert-True ($configText -match 'dashboardKey:\s*""') "config.example.js must keep dashboardKey empty in local release bundles."
Assert-True (-not ($configText -match $privateKeyPattern)) "config.example.js must not contain the private dashboard key."
Assert-True ($configText -match 'ecomSniperExtensionId:\s*"eohieelgcgopcnjjjanjgfjdaifolokm"') "config.example.js must use the known EcomSniper extension ID."
Pass "store-safe configuration"

$profileLaunchers = @(
  "bootstrap-install.ps1",
  "tools\install.ps1",
  "tools\local-extension-manager.ps1"
)
foreach ($launcher in $profileLaunchers) {
  $launcherText = Read-Text (RepoPath $launcher)
  Assert-True ($launcherText -match '--profile-directory="\{0\}"') "$launcher must quote Chrome profile directories such as Profile 2."
}
Pass "profile-safe local reload"

$installerBuilderText = Read-Text (RepoPath "tools\build-installer.ps1")
$installerLauncherText = Read-Text (RepoPath "installer\SetupLauncher.cs")
$installerRunnerText = Read-Text (RepoPath "installer\run-install.cmd")
$installerBootstrapText = Read-Text (RepoPath "install-latest.ps1")
Assert-True ($installerBuilderText -match '/target:winexe') "Windows Setup must compile the native visible launcher."
Assert-True ($installerBuilderText -match '/resource:\$installerScript,InstallLatest\.ps1') "Windows Setup must embed the verified installer script."
Assert-True ($installerBuilderText -match '/resource:\$bootstrapScript,BootstrapInstall\.ps1') "Windows Setup must embed the verified bootstrap script."
Assert-True ($installerLauncherText -match 'AllocConsole') "Windows Setup launcher must allocate a visible console."
Assert-True ($installerLauncherText -match 'ShowWindow\(GetConsoleWindow\(\), SwShow\)') "Windows Setup launcher must explicitly show its console."
Assert-True ($installerLauncherText -match 'process\.WaitForExit\(\)') "Windows Setup launcher must wait for installation to finish."
Assert-True ($installerLauncherText -match 'Console\.ReadKey\(true\)') "Windows Setup launcher must keep the result visible until acknowledged."
Assert-True ($installerRunnerText -match 'title GLDN Ops Setup') "Windows Setup runner must have a recognizable visible window title."
Assert-True ($installerRunnerText -match 'GLDN Ops Installer\\latest\.log') "Windows Setup runner must tell the operator where the persistent log is stored."
Assert-True ($installerBootstrapText -match 'Start-Transcript') "Windows Setup must capture a persistent transcript."
Assert-True ($installerBootstrapText -match 'GLDN Ops Installer') "Windows Setup transcript must live outside the replaceable install folder."
Assert-True ($installerBootstrapText -match 'BootstrapScriptPath') "Windows Setup must prefer its embedded verified bootstrap."
Assert-True ((Read-Text (RepoPath "bootstrap-install.ps1")) -match 'Stop-GldnUpdaterForInstall') "Windows Setup must stop its exact updater before replacing the stable folder."
Pass "visible Windows installer and persistent log"

$popupHtml = Read-Text (ExtensionPath "popup.html")
$popupJs = Read-Text (ExtensionPath "popup.js")
$htmlIds = @{}
foreach ($match in [regex]::Matches($popupHtml, '(?:^|\s)id=["'']([^"'']+)["'']')) {
  $htmlIds[$match.Groups[1].Value] = $true
}

foreach ($match in [regex]::Matches($popupJs, 'document\.getElementById\(\s*["'']([^"'']+)["'']\s*\)')) {
  $id = $match.Groups[1].Value
  Assert-True ($htmlIds.ContainsKey($id)) "popup.js references missing popup.html id: $id"
}

foreach ($match in [regex]::Matches($popupHtml, '<button\b[^>]*\sid=["'']([^"'']+)["''][^>]*>')) {
  $id = $match.Groups[1].Value
  Assert-True ($popupJs.Contains($id)) "popup.html button is not wired in popup.js: $id"
}
Pass "popup id and button wiring"

$runtimeTextFiles = @(
  "extension\manifest.json",
  "extension\popup.html",
  "extension\popup.js",
  "extension\theme-catalog.js",
  "extension\theme-page.js",
  "extension\themes.css",
  "extension\foundation.js",
  "extension\profit-audit.js",
  "extension\profit-backfill.js",
  "extension\profit-backfill-background.js",
  "extension\sniping-audit.js",
  "extension\subscribe-save.js",
  "extension\sniping-review.html",
  "extension\sniping-review.css",
  "extension\sniping-review.js",
  "extension\listing-preflight.html",
  "extension\listing-preflight.css",
  "extension\listing-preflight-core.js",
  "extension\listing-preflight.js",
  "extension\listing-preflight-rules.json",
  "extension\background.js",
  "extension\amazon.js",
  "extension\walmart.js",
  "extension\ebay.js",
  "extension\ecomsniper.js",
  "extension\poshmark.js",
  "extension\guide.html",
  "dashboard\GLDN_Ops_Dashboard_Code.gs"
)

foreach ($relative in $runtimeTextFiles) {
  $text = Read-Text (RepoPath $relative)
  Assert-True (-not ($text -match "[âÃ�]")) "$relative contains mojibake or replacement characters."
}

Assert-True (-not ($popupHtml -match "Start (?:the )?(?:local )?click helper|Local helper not running|Check Click Mode")) "popup.html still requires the old external helper."
Assert-True (-not ($popupJs -match "Start (?:the )?(?:local )?click helper|Local helper not running|Chrome extension mode is using manual")) "popup.js still requires the old external helper."
Assert-True (-not ($popupHtml -match "Premium\s+â|Anchor\s+â")) "popup.html has broken subscription dash text."
Pass "runtime text cleanup"

$expectedMapChecks = @(
  @("M0", "CLICKNCARRY"),
  @("6", "FINTIME"),
  @("0", "FAK12"),
  @("M1", "HEARTSTONE"),
  @("2", "FANCYFI"),
  @("7", "poshmarkOnly")
)

$foundationText = Read-Text (ExtensionPath "foundation.js")
foreach ($check in $expectedMapChecks) {
  $left = [regex]::Escape($check[0])
  $right = [regex]::Escape($check[1])
  Assert-True (Has-Text $foundationText "$left[\s\S]{0,220}$right") "foundation.js is missing computer mapping $($check[0]) -> $($check[1])."
}
Pass "computer/account mapping"

$poshmarkText = Read-Text (ExtensionPath "poshmark.js")
Assert-True ($foundationText -match '"0"[\s\S]{0,180}poshmarkComputerLabel:\s*"7"') "computer 0 must sync Poshmark records to computer 7."
Assert-True ($foundationText -match 'M0[\s\S]{0,180}poshmarkComputerLabel:\s*"M0"') "computer M0 must support its Poshmark account."
Assert-True ($poshmarkText.Contains("savedPoshmarkComputerLabel")) "poshmark.js is missing the Poshmark computer guard."
Assert-True ($poshmarkText.Contains("data-requires-poshmark=`"true`"")) "poshmark.js must mark Poshmark action buttons with the computer guard."
Pass "Poshmark computer guard"

$backgroundText = Read-Text (ExtensionPath "background.js")
$dashboardText = Read-Text (RepoPath "dashboard\GLDN_Ops_Dashboard_Code.gs")
$syncActions = [System.Collections.Generic.HashSet[string]]::new()
[void]$syncActions.Add("ping")
foreach ($match in [regex]::Matches($backgroundText, "handleSync\('([^']+)'")) {
  [void]$syncActions.Add($match.Groups[1].Value)
}

foreach ($action in $syncActions) {
  Assert-True ($dashboardText.Contains("action === '$action'")) "Dashboard Apps Script does not handle background sync action: $action"
}
Pass "dashboard action compatibility"

$jsFilesToParse = @(
  "config.example.js",
  "theme-catalog.js",
  "foundation.js",
  "shared.js",
  "profit-audit.js",
  "profit-backfill.js",
  "profit-backfill-background.js",
  "sniping-audit.js",
  "subscribe-save.js",
  "sniping-review.js",
  "background.js",
  "popup.js",
  "amazon.js",
  "walmart.js",
  "ebay.js",
  "ecomsniper.js",
  "poshmark.js",
  "reload.js",
  "start-move99.js",
  "theme-page.js",
  "variation-core.js",
  "variation-audit.js",
  "listing-preflight-core.js",
  "listing-preflight.js"
)

$node = "C:\Users\afarr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
  $node = if ($nodeCommand) { $nodeCommand.Source } else { $null }
}

$parseScript = @"
const fs = require('fs');
const files = process.argv.slice(1);
for (const file of files) {
  new Function(fs.readFileSync(file, 'utf8'));
}
"@

if ($node) {
  $parseArgs = @("-e", $parseScript)
  foreach ($file in $jsFilesToParse) { $parseArgs += (ExtensionPath $file) }
  try {
    & $node @parseArgs
    if ($LASTEXITCODE -ne 0) { Fail "JavaScript parser exited with code $LASTEXITCODE." } else { Pass "JavaScript parse checks" }
  } catch {
    Fail "JavaScript parse checks failed: $($_.Exception.Message)"
  }
} elseif ($RequireJavaScriptParser) {
  Fail "Node.js is required for the release JavaScript parser check."
} else {
  Pass "JavaScript parser unavailable on this client; structural checks completed"
}

if ($BuildPackage) {
  try {
    & (RepoPath "tools\build-local-package.ps1") -Version $version | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail "Local ZIP builder exited with code $LASTEXITCODE." }
  } catch {
    Fail "Local ZIP build failed: $($_.Exception.Message)"
  }

  $zipPath = RepoPath "dist\GLDN-Ops-local-v$version.zip"
  if (Test-Path -LiteralPath $zipPath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
      $entries = @($zip.Entries | ForEach-Object { $_.FullName })
      foreach ($entry in $entries) {
        Assert-True (-not ($entry -match '(^|/)(evidence|pet-runs|node_modules|extension_versions|dist|\.git|\.codex|\.agents|\.local-build|\.webstore-build)/')) "ZIP contains excluded local path: $entry"
        Assert-True (-not ($entry -match 'config\.js$')) "ZIP contains private local config.js."
        Assert-True (-not ($entry -match '(^|/)(secrets?)/|bot-token\.dpapi$')) "ZIP contains a protected local secret path: $entry"
        Assert-True (-not ($entry -match '\.pem$|\.crx$')) "ZIP contains private key or CRX artifact: $entry"
      }
      foreach ($requiredEntry in @('extension/manifest.json', 'extension/listing-preflight.html', 'extension/listing-preflight-core.js', 'extension/listing-preflight-rules.json', 'tools/listing-preflight/publish-reviewed-rules.ps1', 'tools/update.ps1', 'tools/local-extension-manager.ps1', 'docs/DISCORD_RESEARCH.md', 'INSTALL.md')) {
        Assert-True (@($entries | Where-Object { $_.Replace('\', '/').EndsWith($requiredEntry) }).Count -eq 1) "ZIP is missing required local release entry: $requiredEntry"
      }
      foreach ($runtimeFile in $referenced.Keys) {
        $runtimeEntry = ('extension/' + $runtimeFile.Replace('\', '/')).TrimStart('/')
        Assert-True (@($entries | Where-Object { $_.Replace('\', '/').EndsWith($runtimeEntry) }).Count -eq 1) "ZIP is missing manifest-referenced runtime file: $runtimeEntry"
      }
      $zipText = ""
      foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '\.(js|gs|html|json|css|txt|md|ps1|cmd)$') {
          $stream = $entry.Open()
          try {
            $reader = [System.IO.StreamReader]::new($stream)
            $zipText += "`n--- $($entry.FullName) ---`n" + $reader.ReadToEnd()
          } finally {
            if ($reader) { $reader.Dispose() } else { $stream.Dispose() }
          }
        }
      }
      Assert-True (-not ($zipText -match $privateKeyPattern)) "ZIP contains the private dashboard key."
      Pass "local release bundle safety"
    } finally {
      $zip.Dispose()
    }
  } else {
    Fail "Local ZIP was not created: $zipPath"
  }
}

if ($failures.Count) {
  Write-Host ""
  Write-Host "Universal release check failed:" -ForegroundColor Red
  foreach ($failure in $failures) {
    Write-Host "  - $failure" -ForegroundColor Red
  }
  exit 1
}

foreach ($pass in $passes) {
  Write-Host "ok - $pass"
}
Write-Host "Universal release check passed for GLDN Ops v$version"
