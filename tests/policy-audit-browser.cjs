const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.GLDN_NODE_MODULES, 'playwright'));
const preflight = require('../extension/listing-preflight-core');
const core = require('../extension/policy-listing-audit-core');
const pack = require('../extension/listing-preflight-rules.json');
const root = path.resolve(__dirname, '..');
const ext = path.join(root, 'extension');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const evidence = path.join(root, 'evidence/policy-audit-v3.12.37');
  fs.mkdirSync(evidence, { recursive: true });
  const results = [];
  const coverage = { initialTotal: 18640, latestTotal: 18641, observedUnique: 3, countChanged: true, duplicatesRemoved: 1, followUpRecommended: true };
  const audit = core.buildPolicyAudit([
    { itemId: '300000000001', title: 'Knockoff designer handbag' },
    { itemId: '300000000002', title: 'Disney Mickey Mouse stickers' },
    { itemId: '300000000003', title: 'Bosch drill bit set' }
  ], pack, { coverage, computerLabel: 'M0', ebayAccountLabel: 'FIXTURE', scannedAt: '2026-09-13T14:00:00Z' }, preflight);
  const html = fs.readFileSync(path.join(ext, 'policy-listing-audit.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  try {
    for (const width of [1440, 900, 540]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setContent(html);
      await page.addStyleTag({ path: path.join(ext, 'policy-listing-audit.css') });
      await page.evaluate(({ audit, coverage }) => {
        const data = { ebayPolicyListingAudit: audit, ebayPolicyListingScanState: {
          phase: 'complete', active: false, totalListings: 3, runId: 'fixture', coverage
        } };
        window.fixtureMessages = [];
        window.chrome = {
          runtime: { sendMessage(message, cb) { window.fixtureMessages.push(message); cb({ ok: true }); } },
          storage: { local: { get(keys, cb) { cb(data); } }, onChanged: { addListener() {} } }
        };
      }, { audit, coverage });
      await page.addScriptTag({ path: path.join(ext, 'policy-listing-audit-core.js') });
      await page.addScriptTag({ path: path.join(ext, 'policy-listing-audit.js') });
      await page.waitForFunction(() => document.getElementById('scanHeadline').textContent.includes('Store changed'));
      assert.match(await page.locator('#scanDetail').innerText(), /18,640 at start, 18,641 last observed/);
      assert.equal(await page.locator('#downloadAudit').isEnabled(), true);
      assert.equal(await page.locator('#currentReview').isVisible(), false);
      assert.equal(await page.locator('#listingRows tr').count(), 3);
      await page.locator('#listingSearch').fill('Disney');
      assert.equal(await page.locator('#listingRows tr').count(), 1);
      assert.match(await page.locator('#listingRows').innerText(), /REVIEW/);
      await page.locator('#listingSearch').fill('');
      const warningFits = await page.locator('#scanHeadline').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      assert.equal(warningFits, true, `warning fits at ${width}px`);
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#downloadAudit').click();
      const download = await downloadPromise;
      const csv = fs.readFileSync(await download.path(), 'utf8');
      assert.match(csv, /300000000001/);
      assert.match(csv, /Knockoff designer handbag/);
      assert.deepEqual(await page.evaluate(() => window.fixtureMessages.map((message) => message.type)), ['getEbayPolicyListingScanStatus']);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(evidence, `snapshot-${width}.png`), fullPage: true });
      results.push({ width, pass: true, checks: ['coverage warning', 'results visible', 'search', 'CSV download', 'no marketplace messages', 'warning fits'] });
      await page.close();
    }
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ scope: 'Isolated Chrome fixture; no signed-in account or marketplace action', results }, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
