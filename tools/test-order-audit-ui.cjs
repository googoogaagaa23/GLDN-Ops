const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.GLDN_NODE_MODULES || 'C:/Users/afarr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright'));
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.test-tmp/order-audit-ui');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const filename = path.basename(url.pathname);
        const file = path.join(root, 'extension', filename);
        if (url.hostname !== 'gldn-audit-fixture.test' || !fs.existsSync(file)) return route.abort();
        await route.fulfill({ body: fs.readFileSync(file), contentType: filename.endsWith('.html') ? 'text/html' : filename.endsWith('.css') ? 'text/css' : 'application/javascript' });
      });
      await page.addInitScript(() => {
        const selection = { computerLabel: 'M0', accountLabel: 'CLICKNCARRY', monthKey: '2026-10', runKey: 'M0|CLICKNCARRY|2026-10' };
        const unit = { ...selection, orderNumber: '11-10000-10000', orderDate: '2026-10-04', asin: 'B012345678', unitIndex: 1 };
        const shared = { ok: true, metadata: { ...selection, expectedUnits: 1, expectedProfiles: ['M7'], scannedProfiles: [] }, expected: [unit], purchases: [], summary: { expectedUnits: 1 }, audit: { findings: [] } };
        window.fixtureFailure = false;
        window.chrome = {
          runtime: {
            getURL: (page) => `https://gldn-audit-fixture.test/${page}`,
            sendMessage: (message, callback) => callback(message.type === 'readOrderPlacementAudit'
              ? (window.fixtureFailure ? { ok: false, error: 'Google is blocking the shared dashboard. Its owner must renew the existing dashboard authorization.' } : shared)
              : { ok: true })
          },
          storage: { local: {
            get: (_keys, callback) => callback({ computerLabel: 'M0', amazonProfileLabel: 'M7', orderPlacementAuditSelection: selection }),
            set: (_values, callback) => callback()
          } },
          tabs: { create() {} }
        };
      });
      await page.goto('https://gldn-audit-fixture.test/order-audit.html');
      await page.locator('#notice[data-tone="good"]').waitFor();
      assert.match(await page.locator('#demandStatus').textContent(), /No local eBay read is needed/);
      assert.equal(await page.locator('#startAmazonScan').isEnabled(), true);
      assert.equal(await page.locator('#seedExpected').isEnabled(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'page must fit the viewport');
      const overlap = await page.evaluate(() => {
        const ids = ['notice', 'demandStatus', 'seedExpected', 'openMonthlyProfit', 'amazonProfileText', 'startAmazonScan'];
        const boxes = ids.map((id) => ({ id, rect: document.getElementById(id).getBoundingClientRect() }));
        return boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top).map((b) => [a.id, b.id]));
      });
      assert.deepEqual(overlap, []);
      await page.screenshot({ path: path.join(output, `ready-${viewport.width}.png`), fullPage: true });
      await page.evaluate(() => { window.fixtureFailure = true; });
      await page.getByRole('button', { name: 'Refresh Results', exact: true }).click();
      assert.equal(await page.locator('#startAmazonScan').isEnabled(), false);
      assert.equal(await page.locator('#expectedUnits').textContent(), '0');
      assert.match(await page.locator('#notice').textContent(), /renew the existing dashboard authorization/);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, `blocked-${viewport.width}.png`), fullPage: true });
      console.log(`PASS ${viewport.width}x${viewport.height}: Amazon-only shared demand, failed refresh, no overlap or page overflow.`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
