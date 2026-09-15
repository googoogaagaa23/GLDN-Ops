const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.GLDN_NODE_MODULES, 'playwright'));
const root = path.resolve(__dirname, '..');
const ext = path.join(root, 'extension');
const offline = process.argv.includes('--offline-history');
const output = path.join(root, offline ? 'dist/optional-history-proof' : 'dist/pesticide-proof');
const version = require('../extension/manifest.json').version;
const history = require('../extension/violation-history-core');
const policy = require('../extension/listing-preflight-core');
const auditCore = require('../extension/policy-listing-audit-core');
const pack = require('../extension/listing-preflight-rules.json');
const titles = [
  'Neem Oil & Peppermint Plant Nutrient Spray Natural Leaf Shine',
  'Septic Chlorine Tablet 6 Tablet Pail',
  'Rooting Gel Plant Cuttings Compound',
  'Rodent Repellent Spray Peppermint Oil',
  'Mosquito Repellents for Camping',
  'Ant-Killer Granules',
  'Empty Trigger Pump Spray Bottle'
];
const rows = titles.map((title, i) => ({ title, itemId: String(123450000000 + i), sku: `B${String(i).padStart(9, '0')}`, price: 25 }));
const incidents = offline ? history.mergeRecords([{account:'another-store', itemId:'300000000001',
  title:'Different original title', asin:'B000000007', reason:'This listing was removed for violating our Pesticides policy.',
  firstSeenAt:'2026-09-13T12:00:00Z',lastSeenAt:'2026-09-13T12:00:00Z'}]) : [];
if (offline) rows.push({title:'Wooden Serving Spoon Set',itemId:'123450000007',sku:'B000000007',price:25});
const warning = offline ? history.unavailableWarning(incidents.length) : '';
const blocked = offline ? 7 : 6;
const savedAudit = auditCore.buildPolicyAudit(rows, {...pack,incidentHistory:incidents,incidentHistoryWarning:warning},
  { computerLabel: 'Fixture', ebayAccountLabel: 'test-store', scannedAt: new Date().toISOString() }, policy);
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://gldn.test') return route.abort();
      const file = path.resolve(ext, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(ext + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
      return route.fulfill({ contentType: types[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
    });
    await context.addInitScript(({savedAudit, incidents, offline, version}) => {
      const data = { ebayPolicyListingAudit: savedAudit, ebayPolicyListingScanState: { phase: 'complete', active: false,
        totalListings: savedAudit.totalListings, scannedListings: savedAudit.totalListings },
        gldnViolationHistoryShared:{records:incidents},gldnViolationHistoryLocal:[] };
      window.fixtureMessages = [];
      window.fixtureClipboard = '';
      window.fixtureHistoryOnline = !offline;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value) => { window.fixtureClipboard = value; } } });
      const respond = (value, cb) => cb ? cb(value) : Promise.resolve(value);
      window.chrome = {
        runtime: { id: 'fixture', getURL: (p) => 'http://gldn.test/' + p, getManifest: () => ({ version }),
          onMessage: { addListener() {} }, sendMessage(message, cb) {
            window.fixtureMessages.push(message);
            if (message.type === 'getEbayViolationHistory') return respond(window.fixtureHistoryOnline
              ? { ok: true, records: incidents, warning:'' }
              : { ok: false, error:'Dashboard setup code is missing.' }, cb);
            return respond({ ok: true }, cb);
          }
        },
        tabs: { getCurrent: (cb) => cb({ id: 1 }) },
        storage: { local: {
          get: (keys, cb) => respond(data, cb),
          set: (values, cb) => { Object.assign(data, values); return respond({}, cb); },
          remove: (keys, cb) => respond({}, cb)
        }, onChanged: { addListener() {} } }
      };
    }, {savedAudit, incidents, offline, version});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('http://gldn.test/listing-preflight.html');
    await page.locator('#ruleStatus').filter({ hasText: '639' }).waitFor();
    await page.locator('#itemInput').fill(rows.map((r) => `${r.title} | ASIN: ${r.sku}`).join('\n'));
    await page.locator('#runCheck').click();
    await page.waitForFunction((blocked) => document.querySelector('#countBlock').textContent === String(blocked), blocked);
    assert.equal(await page.locator('#countClear').innerText(), '1');
    assert.equal(await page.locator('#historyWarning').isVisible(), offline);
    if (offline) assert.match(await page.locator('#historyWarning').innerText(), /1 saved incident\./);
    await page.locator('#copyReady').click();
    await page.waitForFunction(() => window.fixtureClipboard.length > 0);
    assert.equal(await page.evaluate(() => window.fixtureClipboard), 'https://www.amazon.com/dp/B000000006');
    await page.screenshot({ path: path.join(output, 'preflight-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'preflight-mobile.png'), fullPage: true });
    if (offline) {
      assert.ok((await page.evaluate(() => window.fixtureMessages.filter(m=>m.type==='getEbayViolationHistory'))).every(m=>m.optional === true));
      await page.evaluate(() => { window.fixtureHistoryOnline = true; });
      await page.locator('#runCheck').click();
      await page.waitForFunction(() => document.querySelector('#historyWarning').hidden);
      assert.equal(await page.locator('#countBlock').innerText(), String(blocked));
    }
    await page.goto('http://gldn.test/policy-listing-audit.html');
    await page.locator('#listingRows tr').first().waitFor();
    assert.equal(await page.locator('#metricBlock').innerText(), String(blocked));
    assert.match(await page.locator('#scanHeadline').innerText(), new RegExp(rows.length + ' unique listings'));
    assert.equal(await page.locator('#listingRows tr').count(), blocked);
    assert.equal(await page.locator('#historyWarning').isVisible(), offline);
    assert.equal(await page.locator('#currentReview').isVisible(), false);
    await page.locator('#selectAllFlags').click();
    assert.equal(await page.locator('#metricSelected').innerText(), String(blocked));
    await page.screenshot({ path: path.join(output, 'audit-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(output, 'audit-desktop.png'), fullPage: true });
    const messages = await page.evaluate(() => window.fixtureMessages);
    assert.ok(messages.every((m) => !/submit|prepare.*End|openEcomSniper/i.test(m.type)));
    assert.deepEqual(errors, []);
    const proof = { version, offlineHistory:offline, signedInMarketplace: false, inputs: rows.length, blocked, readyCopied: 1,
      auditVisible: blocked, auditSelected: blocked, marketplaceChanges: 0, viewports: [1440, 390], errors };
    fs.writeFileSync(path.join(output, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(proof);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
