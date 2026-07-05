param(
  [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$distRoot = Join-Path $repoRoot "dist"
$buildRoot = Join-Path $repoRoot ".crx-build"
$packRoot = Join-Path $buildRoot "extension"
$pemPath = Join-Path $distRoot "GLDN-Ops.pem"
$crxPath = Join-Path $distRoot "GLDN-Ops.crx"
$updateXmlPath = Join-Path $distRoot "update.xml"
$manifestPath = Join-Path $extensionRoot "manifest.json"
$configPath = Join-Path $packRoot "config.example.js"

$dashboardUrl = "https://script.google.com/macros/s/AKfycbziGWXqyZ-bW5MLKhRkkRghH1hT1X6kUCPO5sgEI1pWjuKzMT4aOcivG3ITqCUpjAhUhw/exec"
$dashboardKey = "GLDN-Private-Seller-Level-2026-8291"

if (-not (Test-Path $ChromePath)) {
  throw "Chrome was not found at $ChromePath"
}

New-Item -ItemType Directory -Force -Path $distRoot, $buildRoot | Out-Null
if (Test-Path $packRoot) {
  Remove-Item -LiteralPath $packRoot -Recurse -Force
}
Copy-Item -LiteralPath $extensionRoot -Destination $packRoot -Recurse

$configText = Get-Content -LiteralPath (Join-Path $packRoot "config.example.js") -Raw
$configText = $configText `
  -replace 'dashboardUrl:\s*"[^"]*"', ('dashboardUrl: "' + $dashboardUrl + '"') `
  -replace 'dashboardKey:\s*"[^"]*"', ('dashboardKey: "' + $dashboardKey + '"')
Set-Content -LiteralPath $configPath -Value $configText -Encoding UTF8

if (Test-Path $crxPath) {
  Remove-Item -LiteralPath $crxPath -Force
}

$packArgs = @("--pack-extension=$packRoot")
if (Test-Path $pemPath) {
  $packArgs += "--pack-extension-key=$pemPath"
}

& $ChromePath $packArgs

$packParent = Split-Path $packRoot -Parent
$packName = Split-Path $packRoot -Leaf
$generatedCrx = Join-Path $packParent "$packName.crx"
$generatedPem = Join-Path $packParent "$packName.pem"

if (Test-Path $generatedCrx) {
  Move-Item -LiteralPath $generatedCrx -Destination $crxPath -Force
}
if ((Test-Path $generatedPem) -and -not (Test-Path $pemPath)) {
  Move-Item -LiteralPath $generatedPem -Destination $pemPath -Force
}

if (-not (Test-Path $crxPath)) {
  throw "Chrome did not create $crxPath"
}
if (-not (Test-Path $pemPath)) {
  throw "Chrome did not create or find $pemPath"
}

function Get-ExtensionIdFromPem([string]$Path) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodePath = if ($node) { $node.Source } else { "C:\Users\afarr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
  if (-not (Test-Path $nodePath)) {
    throw "Node was not found for extension ID calculation."
  }
  $script = @"
const fs = require('fs');
const crypto = require('crypto');
const pem = fs.readFileSync(process.argv[1], 'utf8');
const key = crypto.createPrivateKey(pem);
const pub = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
const hash = crypto.createHash('sha256').update(pub).digest();
const chars = 'abcdefghijklmnop';
let id = '';
for (const byte of hash.subarray(0, 16)) {
  id += chars[(byte >> 4) & 15] + chars[byte & 15];
}
process.stdout.write(id);
"@
  return (& $nodePath -e $script $Path)
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version
$extensionId = Get-ExtensionIdFromPem $pemPath
$crxUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/dist/GLDN-Ops.crx"

$updateXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="$extensionId">
    <updatecheck codebase="$crxUrl" version="$version" />
  </app>
</gupdate>
"@

Set-Content -LiteralPath $updateXmlPath -Value $updateXml -Encoding UTF8

Write-Host "Built CRX:"
Write-Host "  $crxPath"
Write-Host "Extension ID:"
Write-Host "  $extensionId"
Write-Host "Update XML:"
Write-Host "  $updateXmlPath"
