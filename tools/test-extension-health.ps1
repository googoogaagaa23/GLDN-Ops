param(
  [string]$HealthUrl = "https://ecomsniper.io/docs/competitor-scanner-guide/1738579053061",
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$nodeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node"
$node = Join-Path $nodeRoot "bin\node.exe"
$nodeModules = Join-Path $nodeRoot "node_modules"
$pnpmModules = Join-Path $nodeModules ".pnpm\node_modules"
$playwrightCli = Join-Path $nodeModules ".pnpm\playwright-core@1.61.1\node_modules\playwright-core\cli.js"

if (-not (Test-Path $node)) {
  throw "Bundled Node runtime not found at $node."
}
if (-not (Test-Path $playwrightCli)) {
  throw "Bundled Playwright runtime not found at $playwrightCli."
}

$env:NODE_PATH = "$nodeModules;$pnpmModules"

$browserPath = & $node -e "const { chromium } = require('playwright-core'); console.log(chromium.executablePath());"
if (-not (Test-Path $browserPath)) {
  Write-Host "Installing Playwright Chromium for isolated extension testing..."
  & $node $playwrightCli install chromium
}

$script = @'
const { chromium } = require('playwright-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const repoRoot = process.env.GLDN_REPO_ROOT;
const extensionRoot = process.env.GLDN_EXTENSION_ROOT;
const healthUrl = process.env.GLDN_HEALTH_URL;
const timeoutMs = Number(process.env.GLDN_HEALTH_TIMEOUT_MS || 90000);

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const userDataDir = path.join(os.tmpdir(), 'gldn-health-' + Date.now());
  const logs = [];
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 950 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const page = context.pages()[0] || await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (/GLDN|extension|dashboard|health/i.test(text)) {
      logs.push({ level: msg.type(), text: text.slice(0, 500) });
    }
  });
  page.on('pageerror', (error) => logs.push({ level: 'pageerror', text: String(error?.stack || error).slice(0, 800) }));

  await page.goto(healthUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForSelector('#gldn-ops-ecomsniper-panel [data-action="feature-health"]', { timeout: timeoutMs });
  await page.evaluate(() => document.querySelector('#gldn-ops-ecomsniper-panel [data-action="feature-health"]')?.click());
  await page.waitForFunction(() => {
    const status = document.querySelector('#gldn-ops-ecomsniper-panel .gldn-status')?.innerText || '';
    return /^Health (OK|CHECK|failed)/i.test(status);
  }, null, { timeout: timeoutMs });

  const status = await page.locator('#gldn-ops-ecomsniper-panel .gldn-status').innerText({ timeout: 5000 });
  const serviceWorkers = context.serviceWorkers().map((worker) => worker.url());
  const sw = context.serviceWorkers()[0];
  if (!sw) throw new Error('GLDN Ops service worker did not start.');

  const identities = {};
  for (const computer of ['M0', '2', '6', '0', 'M1', '7']) {
    await sw.evaluate((value) => new Promise((resolve) => chrome.storage.local.set({ computerLabel: value, ebayAccountLabel: 'STALE' }, resolve)), computer);
    const health = await sw.evaluate(() => runExtensionHealthCheck());
    identities[computer] = health && health.identity;
  }
  const expected = {
    M0: 'CLICKNCARRY',
    '2': 'FANCYFI',
    '6': 'FINTIME',
    '0': 'FAK12',
    M1: 'HEARTSTONE',
    '7': ''
  };
  const mappingErrors = Object.entries(expected)
    .filter(([computer, ebay]) => (identities[computer]?.ebayAccountLabel || '') !== ebay)
    .map(([computer, ebay]) => `${computer} expected ${ebay || 'Poshmark-only'} got ${identities[computer]?.ebayAccountLabel || 'none'}`);
  if (mappingErrors.length) {
    throw new Error(`Computer/account mapping failed: ${mappingErrors.join('; ')}`);
  }

  await context.close();

  const result = {
    ok: /^Health OK/i.test(status),
    version: manifest.version,
    status,
    serviceWorkers,
    identities,
    logs
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
})().catch(async (error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
'@

$env:GLDN_REPO_ROOT = [string]$repoRoot
$env:GLDN_EXTENSION_ROOT = [string](Resolve-Path $extensionRoot)
$env:GLDN_HEALTH_URL = $HealthUrl
$env:GLDN_HEALTH_TIMEOUT_MS = [string]($TimeoutSeconds * 1000)

& $node -e $script
