param(
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$nodeRoot = "C:\Users\afarr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
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

const extensionRoot = process.env.GLDN_EXTENSION_ROOT;
const timeoutMs = Number(process.env.GLDN_TIMEOUT_MS || 90000);

const fakeStatsHtml = `<!doctype html>
<html>
  <head><title>My Posh Stats - Poshmark</title></head>
  <body>
    <header>
      <a>POSHMARK</a>
      <div>@igivegreatdeals</div>
      <div>Jan 25 2025</div><div>Posher Since</div>
      <div>124,269</div><div>Listings</div>
      <div>85,870</div><div>Followers</div>
    </header>
    <main>
      <h1>My Posh Stats</h1>
      <section>
        <div>SELLER STATS</div>
        <div>3823</div><h2>Shipped Orders</h2><p>All Time</p>
        <p>Learn more</p><p>Spacer</p><p>Spacer</p><p>Spacer</p><p>Spacer</p>
        <div>1119</div><h2>Shipped Orders</h2><p>Last 90 Days</p>
        <div>2.4</div><h2>Days To Ship</h2><p>Last 90 Days</p>
        <div>$32,886</div><h2>Total Sales</h2><p>Last 90 Days</p>
        <div>2.7%</div><h2>Seller Cancellations</h2><p>Last 90 Days</p>
        <div>0.6%</div><h2>Approved Return Cases</h2><p>Last 90 Days</p>
      </section>
      <section>
        <div>114794</div><h2>Available Listings</h2>
        <div>27%</div><h2>Average Discount Off Original Price</h2>
        <div>220404</div><h2>Self-Shares</h2><p>In the last 30 days</p>
        <div>72</div><h2>Moderator-Removed-Listings</h2><p>In the last 30 days</p>
        <div>3935</div><h2>Sold Listings</h2>
        <div>Total Earned: $89,785.91</div>
        <div>3.4</div><h2>Days To Ship</h2><p>On Average</p>
        <div>4.8</div><h2>Average Rating</h2>
        <div>Total Ratings: 2075</div>
      </section>
    </main>
  </body>
</html>`;

const fakeSalesHtml = `<!doctype html>
<html>
  <head><title>My Sales - Poshmark</title></head>
  <body>
    <main>
      <h1>My Sales</h1>
      <table class="my-sales-desktop-table__table">
        <thead><tr><th>Order</th><th>Item(s)</th><th>Order Date</th><th>Price</th><th>Earnings</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          <tr class="my-sales-desktop-table__row">
            <td class="my-sales-desktop-table__td my-sales-desktop-table__item-col">
              <a href="/order/sales/abc123" class="my-sales-desktop-table__item-title">Amber Glass Spray Bottles, 16 oz Glass Spray Bottle Set</a>
              <a href="/order/sales/abc123" hidden>Duplicate order link</a>
              <div>@buyer</div>
            </td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__items-col">1</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__date-col">Jul 08, 2026</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__price-col">\$17.00</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__earnings-col">\$13.40<br>Processing</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__status-col">Awaiting Shipment</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__actions-col">Actions</td>
          </tr>
          <tr class="my-sales-desktop-table__row">
            <td class="my-sales-desktop-table__td my-sales-desktop-table__item-col">
              <a href="/order/sales/def456" class="my-sales-desktop-table__item-title">Fabric Cube Storage Organizer Bins, Black Wood Grain</a>
              <div>@buyer2</div>
            </td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__items-col">1</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__date-col">Jul 09, 2026</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__price-col">\$35.00</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__earnings-col">\$28.00<br>Completed</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__status-col">Order Complete</td>
            <td class="my-sales-desktop-table__td my-sales-desktop-table__actions-col">Actions</td>
          </tr>
        </tbody>
      </table>
    </main>
  </body>
</html>`;

const fakeOrderHtml = `<!doctype html>
<html>
  <head><title>Poshmark Sale Order</title></head>
  <body>
    <main>
      <div>@igivegreatdeals</div>
      <div>ORDER DATE</div>
      <div>Jul-06-2026</div>
      <div>ORDER NUMBER</div>
      <div>abc123</div>
      <h1>Amber Glass Spray Bottles, 16 oz Glass Spray Bottle Set</h1>
      <div>$17.00 Size: OS SKU: QjA5V1RYWDNRWA==</div>
      <div>Your Earnings: $13.40</div>
    </main>
  </body>
</html>`;

const fakeAmazonSearchHtml = `<!doctype html>
<html>
  <head><title>Your Orders</title></head>
  <body>
    <main>
      <div class="order-card">
        <a href="/gp/css/order-details?orderID=114-TEST-ORDER&ref=ppx_yo2ov_dt_b_order_details">View order details</a>
        <a href="/dp/B09WTXX3QX?ref_=ppx_hzsearch_conn_dt_b_fed_asin_title_1">Amber Glass Spray Bottles, 16 oz Glass Spray Bottle Set</a>
        <a href="/your-orders/pop?orderId=114-TEST-ORDER&shipmentId=ship1&lineItemId=line1&packageId=1&asin=B09WTXX3QX&ref_=ppx_hzsearch_conn_dt_b_pop_1">View your item</a>
      </div>
    </main>
  </body>
</html>`;

const fakeAmazonOrderDetailsHtml = `<!doctype html>
<html>
  <head><title>Order Details</title></head>
  <body>
    <main>
      <div id="ecomsniper-toolbar">
        <a href="/dp/B09WTXX3QX">Amber Glass Spray Bottles, 16 oz Glass Spray Bottle Set</a>
        <button>Snipe Title (1 credit)</button>
        <button>Snipe-List</button>
        <label>Sell it for:</label>
        <input value="$99.99">
      </div>
      <div>Order placed July 8, 2026  Order # 114-TEST-ORDER</div>
      <div>Item(s) Subtotal:</div>
      <div>$99.99</div>
      <section>
        <a href="/dp/B09WTXX3QX?ref_=ppx_hz_dt_b_asin_title">Amber Glass Spray Bottles, 16 oz Glass Spray Bottle Set</a>
        <div>Sold by: Example Supplier</div>
        <div>$9.99</div>
        <div>$9.99</div>
      </section>
    </main>
  </body>
</html>`;

async function serviceWorker(context) {
  let worker = context.serviceWorkers()[0];
  if (worker) return worker;
  worker = await context.waitForEvent('serviceworker', { timeout: timeoutMs });
  return worker;
}

async function setComputer(context, computerLabel) {
  const sw = await serviceWorker(context);
  await sw.evaluate((value) => new Promise((resolve) => chrome.storage.local.set({ computerLabel: value, amazonProfileLabel: 'F9132' }, resolve)), computerLabel);
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const userDataDir = path.join(os.tmpdir(), 'gldn-poshmark-guard-' + Date.now());
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1200, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const page = context.pages()[0] || await context.newPage();
  await page.route('https://poshmark.com/users/self/closet_stats', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: fakeStatsHtml });
  });
  await page.route('https://poshmark.com/order/sales', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: fakeSalesHtml });
  });
  await page.route('https://poshmark.com/order/sales/abc123', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: fakeOrderHtml });
  });
  await context.route('https://www.amazon.com/your-orders/search**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: fakeAmazonSearchHtml });
  });
  await context.route('https://www.amazon.com/gp/css/order-details**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: fakeAmazonOrderDetailsHtml });
  });
  await context.route('https://www.amazon.com/your-orders/order-details**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: fakeAmazonOrderDetailsHtml });
  });
  await context.route('https://script.google.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Fixture dashboard sync passed' }) });
  });

  await setComputer(context, '0');
  const setupWorker = await serviceWorker(context);
  await setupWorker.evaluate(() => new Promise((resolve) => chrome.storage.local.set({
    sellerDashboardUrl: 'https://script.google.com/macros/s/gldn-poshmark-fixture/exec',
    sellerDashboardKey: 'fixture-dashboard-key'
  }, resolve)));
  await page.goto('https://poshmark.com/users/self/closet_stats', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForSelector('#gldn-poshmark-panel', { timeout: timeoutMs });
  const combinedIdentity = await page.locator('#gldn-poshmark-panel .gldn-panel-identity').innerText({ timeout: 5000 });
  const combinedDisabled = await page.locator('#gldn-poshmark-panel [data-action="posh-stats"]').isDisabled();
  if (combinedDisabled || !/0\s*\+\s*7/i.test(combinedIdentity)) {
    throw new Error(`Expected computer 0 to allow Poshmark tools as 0 + 7, got disabled=${combinedDisabled}, identity=${combinedIdentity}`);
  }

  await page.locator('#gldn-poshmark-panel [data-action="posh-stats"]').click({ timeout: 5000 });
  await page.waitForSelector('#gldn-posh-stats-preview', { timeout: timeoutMs });
  const modalText = await page.locator('#gldn-posh-stats-preview').innerText({ timeout: 5000 });
  const required = ['igivegreatdeals', 'Jan 25 2025', '124269', '85870', '3823', '1119', '2.4', '32886', '3.4', '2.7%', '0.6%', '72', '114794', '27%', '220404', '3935', '89785.91', '4.8', '2075'];
  const missing = required.filter((value) => !modalText.includes(value));
  if (missing.length) throw new Error(`Poshmark stats modal missing parsed values: ${missing.join(', ')}`);
  await page.locator('#gldn-posh-stats-preview [data-action="save"]').click({ timeout: 5000 });
  await page.waitForTimeout(700);
  const sw = await serviceWorker(context);
  const storedStats = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['latestPoshmarkStats'], resolve)));
  if (storedStats.latestPoshmarkStats?.computerLabel !== '7') {
    throw new Error(`Expected computer 0 Poshmark stats to sync as computer 7, got ${storedStats.latestPoshmarkStats?.computerLabel || 'missing'}`);
  }
  for (const [field, expected] of Object.entries({
    totalSalesLast90: 32886,
    averageDiscountOffOriginalPrice: 27,
    selfSharesLast30: 220404,
    soldListingsAllTime: 3935,
    totalEarnedAllTime: 89785.91,
    totalRatings: 2075
  })) {
    if (storedStats.latestPoshmarkStats?.[field] !== expected) {
      throw new Error(`Expected ${field}=${expected}, got ${storedStats.latestPoshmarkStats?.[field]}`);
    }
  }
  if (await page.locator('#gldn-posh-stats-preview .gldn-close').count()) {
    await page.locator('#gldn-posh-stats-preview .gldn-close').click({ timeout: 5000 });
  }

  await page.goto('https://poshmark.com/order/sales', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForSelector('#gldn-poshmark-panel', { timeout: timeoutMs });
  await page.locator('#gldn-poshmark-panel [data-action="visible-sales"]').click({ timeout: 5000 });
  await page.waitForSelector('#gldn-posh-sales-preview', { timeout: timeoutMs });
  const salesText = await page.locator('#gldn-posh-sales-preview').innerText({ timeout: 5000 });
  for (const value of ['abc123', 'Amber Glass Spray Bottles', '$13.40', 'Jul 08, 2026', 'Awaiting Shipment', 'Processing', 'def456', '$28.00', 'Jul 09, 2026', 'Order Complete', 'Completed']) {
    if (!salesText.includes(value)) throw new Error(`Visible sales modal missing ${value}`);
  }
  await page.locator('#gldn-posh-sales-preview [data-action="save"]').click({ timeout: 5000 });
  await page.waitForTimeout(1200);
  const storedSales = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['latestPoshmarkVisibleSales'], resolve)));
  const visibleRecords = storedSales.latestPoshmarkVisibleSales?.records || [];
  if (visibleRecords.length !== 2) {
    throw new Error(`Expected two deduplicated visible-sale records, got ${visibleRecords.length}: ${JSON.stringify(visibleRecords)}`);
  }
  const firstVisible = visibleRecords.find((record) => record.orderNumber === 'abc123');
  const secondVisible = visibleRecords.find((record) => record.orderNumber === 'def456');
  if (firstVisible?.computerLabel !== '7' || firstVisible?.orderDate !== 'Jul 08, 2026' || firstVisible?.orderStatus !== 'Awaiting Shipment' || firstVisible?.earningsStatus !== 'Processing') {
    throw new Error(`First visible-sale fields were not preserved exactly: ${JSON.stringify(firstVisible)}`);
  }
  if (secondVisible?.marketplaceSoldPrice !== 35 || secondVisible?.marketplaceEarnings !== 28 || secondVisible?.orderStatus !== 'Order Complete' || secondVisible?.earningsStatus !== 'Completed') {
    throw new Error(`Second visible-sale fields were not preserved exactly: ${JSON.stringify(secondVisible)}`);
  }
  if (storedSales.latestPoshmarkVisibleSales?.handledCount !== 2) {
    throw new Error(`Expected both visible-sale rows to sync or queue, got ${JSON.stringify(storedSales.latestPoshmarkVisibleSales)}`);
  }

  await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.set({
    lastCopiedAmazonPayload: {
      source: 'amazon',
      total: 9.99,
      profileLabel: 'F9132',
      etas: ['7/10']
    }
  }, resolve)));
  await page.goto('https://poshmark.com/order/sales/abc123', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForSelector('#gldn-poshmark-panel', { timeout: timeoutMs });
  await page.locator('#gldn-poshmark-panel [data-action="posh-profit"]').click({ timeout: 5000 });
  await page.waitForSelector('#gldn-posh-amazon-needed', { timeout: timeoutMs });
  const amazonNeededText = await page.locator('#gldn-posh-amazon-needed').innerText({ timeout: 5000 });
  for (const value of ['abc123', 'B09WTXX3QX', 'Open Amazon Orders for B09WTXX3QX', 'Matching Amazon info has not been copied for this exact order']) {
    if (!amazonNeededText.includes(value)) throw new Error(`Expected stale Amazon payload to be blocked; missing ${value}`);
  }
  const pendingMatch = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['pendingPoshmarkProfitContext'], resolve)));
  if (pendingMatch.pendingPoshmarkProfitContext?.orderNumber !== 'abc123') {
    throw new Error('Expected Poshmark profit click to store pending Amazon match context for abc123.');
  }
  const amazonSearchPromise = context.waitForEvent('page', { timeout: timeoutMs });
  await page.locator('#gldn-posh-amazon-needed [data-action="open-amazon-orders"]').click({ timeout: 5000 });
  const amazonSearchPage = await amazonSearchPromise;
  let amazonPage = amazonSearchPage;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const liveAmazonPage = () => {
    const pages = context.pages().filter((candidate) => !candidate.isClosed() && /amazon\.com/i.test(candidate.url()));
    return pages[pages.length - 1] || amazonPage;
  };
  await amazonPage.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  await amazonPage.waitForSelector('#gldn-amazon-order-panel', { timeout: timeoutMs });
  let searchStatus = '';
  const statusReadyRe = /No Amazon order result|Found Amazon order|Matched item cost/i;
  const searchDeadline = Date.now() + timeoutMs;
  while (Date.now() < searchDeadline) {
    amazonPage = liveAmazonPage();
    searchStatus = amazonPage.isClosed() ? '' : await amazonPage.locator('#gldn-amazon-order-panel .gldn-status').innerText({ timeout: 5000 }).catch(() => '');
    if (!amazonPage.isClosed() && (/order-details/i.test(amazonPage.url()) || statusReadyRe.test(searchStatus))) break;
    await sleep(250);
  }
  amazonPage = liveAmazonPage();
  if (amazonPage.isClosed() || (!/order-details/i.test(amazonPage.url()) && !statusReadyRe.test(searchStatus))) {
    const searchStorage = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['pendingPoshmarkProfitContext', 'pendingAmazonOrderDetailMatch'], resolve)));
    throw new Error(`Amazon search did not produce a result status. url=${amazonPage.isClosed() ? '(closed)' : amazonPage.url()} status=${searchStatus || '(blank)'} storage=${JSON.stringify(searchStorage)}`);
  }
  if (!/order-details/i.test(amazonPage.url())) {
    throw new Error(`Amazon search did not continue to order details. url=${amazonPage.url()} status=${searchStatus}`);
  }
  await amazonPage.waitForSelector('#gldn-amazon-order-panel', { timeout: timeoutMs });
  const amazonSearchUrl = amazonPage.url();
  const decodedAmazonSearchUrl = decodeURIComponent(amazonSearchUrl);
  if (!/amazon\.com\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(amazonSearchUrl) || !/orderID=114-TEST-ORDER/i.test(decodedAmazonSearchUrl)) {
    throw new Error(`Expected Amazon Orders details to open from decoded ASIN B09WTXX3QX, got ${amazonSearchUrl}`);
  }
  const amazonPanelStatus = await amazonPage.locator('#gldn-amazon-order-panel .gldn-status').innerText({ timeout: 5000 });
  if (!amazonPanelStatus.includes('$9.99') || !amazonPanelStatus.includes('B09WTXX3QX')) {
    throw new Error(`Expected Amazon order-details status to show matched item cost and ASIN, got ${amazonPanelStatus}`);
  }
  await amazonPage.locator('#gldn-amazon-order-panel [data-action="copy"]').click({ timeout: 5000 });
  await amazonPage.waitForSelector('#gldn-amazon-preview', { timeout: timeoutMs });
  const amazonPreviewText = await amazonPage.locator('#gldn-amazon-preview').innerText({ timeout: 5000 });
  for (const value of ['$9.99', 'B09WTXX3QX', 'Amazon Item Cost', 'Linked Poshmark order']) {
    if (!amazonPreviewText.includes(value)) throw new Error(`Amazon preview missing ${value}`);
  }
  await amazonPage.locator('#gldn-amazon-preview [data-action="copy"]').click({ timeout: 5000 });
  await sleep(900);
  const storedAmazon = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['lastCopiedAmazonPayload'], resolve)));
  if (storedAmazon.lastCopiedAmazonPayload?.total !== 9.99 || !storedAmazon.lastCopiedAmazonPayload?.asins?.includes('B09WTXX3QX')) {
    throw new Error(`Expected copied Amazon payload to use item-row cost and ASIN, got ${JSON.stringify(storedAmazon.lastCopiedAmazonPayload)}`);
  }
  await page.locator('#gldn-posh-amazon-needed [data-action="close"]').click({ timeout: 5000 });
  await page.locator('#gldn-poshmark-panel [data-action="posh-profit"]').click({ timeout: 5000 });
  await page.waitForSelector('#gldn-posh-profit-preview', { timeout: timeoutMs });
  const profitText = await page.locator('#gldn-posh-profit-preview').innerText({ timeout: 5000 });
  for (const value of ['abc123', 'Amber Glass Spray Bottles', '$13.40', '$9.99', 'F9132', '$3.41', 'B09WTXX3QX']) {
    if (!profitText.includes(value)) throw new Error(`Poshmark profit modal missing ${value}`);
  }
  await page.locator('#gldn-posh-profit-preview [data-action="save"]').click({ timeout: 5000 });
  await page.waitForTimeout(700);
  const storedProfit = await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['latestMarketplaceProfit'], resolve)));
  if (storedProfit.latestMarketplaceProfit?.computerLabel !== '7') {
    throw new Error(`Expected computer 0 Poshmark profit to sync as computer 7, got ${storedProfit.latestMarketplaceProfit?.computerLabel || 'missing'}`);
  }

  await context.close();
  console.log(JSON.stringify({
    ok: true,
    version: manifest.version,
    combinedIdentity,
    poshmarkDashboardComputer: storedStats.latestPoshmarkStats.computerLabel,
    parsedValues: required,
    visibleSales: ['abc123', '$13.40', 'Awaiting Shipment', 'def456', '$28.00', 'Order Complete'],
    profit: '$3.41'
  }, null, 2));
})().catch(async (error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
'@

$env:GLDN_EXTENSION_ROOT = [string](Resolve-Path $extensionRoot)
$env:GLDN_TIMEOUT_MS = [string]($TimeoutSeconds * 1000)

$tempScript = Join-Path ([System.IO.Path]::GetTempPath()) ("gldn-poshmark-guard-" + [guid]::NewGuid().ToString("N") + ".cjs")
[System.IO.File]::WriteAllText($tempScript, $script, [System.Text.UTF8Encoding]::new($false))
try {
  & $node $tempScript
  if ($LASTEXITCODE -ne 0) {
    throw "Poshmark computer guard browser check failed with exit code $LASTEXITCODE."
  }
} finally {
  Remove-Item -LiteralPath $tempScript -Force -ErrorAction SilentlyContinue
}
