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
  const evidence = path.join(root, 'evidence/policy-audit-v3.12.39');
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
        const listeners = [];
        window.changeFixture = (changes) => {
          Object.assign(data, changes);
          listeners.forEach((fn) => fn(Object.fromEntries(Object.entries(changes).map(([key, newValue]) => [key, { newValue }])), 'local'));
        };
        window.chrome = {
          runtime: { sendMessage(message, cb) {
            window.fixtureMessages.push(message);
            if (message.type === 'prepareEbayPolicyListingEndReview') {
              window.changeFixture({ pendingPolicyListingEndReview: {
                active: true, phase: 'review-ready', reviewMode: 'native-active-listings-ui',
                runId: 'fixture-' + window.fixtureMessages.length, reportFingerprint: message.reportFingerprint,
                itemIds: message.itemIds, requestedCount: message.itemIds.length,
                computerLabel: 'M0', ebayAccountLabel: 'FIXTURE', createdAt: '2026-09-13T14:00:00Z'
              } });
              cb({ ok: true, requestedCount: message.itemIds.length }); return;
            }
            if (message.type === 'cancelEbayPolicyListingEndReview') {
              const pending = data.pendingPolicyListingEndReview;
              window.changeFixture({
                policyListingEndHistory: { ...data.policyListingEndHistory, [pending.runId]: { ...pending, active: false, phase: 'set-aside' } },
                pendingPolicyListingEndReview: null
              });
              cb({ ok: true }); return;
            }
            if (message.type === 'submitEbayPolicyListingEndReview' || message.type === 'checkEbayPolicyListingEndResult') {
              const pending = message.archivedRunId ? data.policyListingEndHistory[message.archivedRunId] : data.pendingPolicyListingEndReview;
              if (message.type === 'submitEbayPolicyListingEndReview' && message.runId !== pending.runId) throw Error('Wrong run');
              const successfulItemIds = pending.itemIds;
              const old = data.policyListingEndLedger?.[pending.reportFingerprint]?.successfulItemIds || [];
              window.changeFixture({
                pendingPolicyListingEndReview: message.archivedRunId ? data.pendingPolicyListingEndReview : null,
                policyListingEndHistory: { ...data.policyListingEndHistory, [pending.runId]: { ...pending, active: false, phase: 'complete', successfulItemIds } },
                policyListingEndLedger: { [pending.reportFingerprint]: { successfulItemIds: [...old, ...successfulItemIds] } }
              });
              cb({ ok: true, stopped: true, successfulItemIds, successfulCount: successfulItemIds.length, failedCount: 0,
                message: successfulItemIds.length + ' exact listings verified ended.' }); return;
            }
            cb({ ok: true });
          } },
          storage: { local: { get(keys, cb) { cb(data); } }, onChanged: { addListener(fn) { listeners.push(fn); } } }
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
      await page.evaluate((audit) => {
        const listings = Array.from({ length: 201 }, (_, index) => ({
          itemId: String(300000000100 + index), title: 'Flagged item ' + index,
          action: index ? 'review' : 'block', status: index ? 'REVIEW' : 'BLOCK', matches: []
        }));
        listings.push({ itemId: '399999999999', title: 'Ordinary item', action: 'clear', matches: [] });
        window.changeFixture({ ebayPolicyListingScanState: { phase: 'complete', active: false, totalListings: 202, coverage: audit.coverage }, ebayPolicyListingAudit: {
          ...audit, reportFingerprint: 'bulk-fixture', listings, totalListings: 202,
          summary: { total: 202, block: 1, review: 200, clear: 1 }
        } });
      }, audit);
      await page.locator('#selectFiltered').click();
      assert.equal(await page.locator('#metricSelected').innerText(), '201');
      await page.locator('#prepareReview').click();
      assert.equal(await page.locator('#currentReview').isVisible(), true);
      assert.equal(await page.locator('#currentReviewCount').innerText(), '200 exact listings');
      await page.locator('#approvalToken').fill('APPROVE END POLICY LISTINGS 201');
      assert.equal(await page.locator('#approveEnd').isEnabled(), false);
      await page.locator('#approvalToken').fill('APPROVE END POLICY LISTINGS 200');
      assert.equal(await page.locator('#approveEnd').isEnabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page fits viewport');
      await page.screenshot({ path: path.join(evidence, `review-${width}.png`), fullPage: true });
      await page.locator('#approveEnd').click();
      assert.equal(await page.locator('#metricEnded').innerText(), '200');
      assert.equal(await page.locator('#metricSelected').innerText(), '1');
      assert.equal(await page.locator('#currentReview').isVisible(), false);
      assert.equal(await page.evaluate(() => window.fixtureMessages.filter((message) => message.type === 'prepareEbayPolicyListingEndReview').length), 1);
      await page.locator('#prepareReview').click();
      assert.equal(await page.locator('#currentReviewCount').innerText(), '1 exact listings');
      assert.equal(await page.locator('#approvalToken').inputValue(), '');
      assert.equal(await page.locator('#approveEnd').isEnabled(), false);
      assert.equal(await page.locator('#checkResult').isVisible(), true);
      const sendsBefore = await page.evaluate(() => window.fixtureMessages.filter(m => m.type === 'submitEbayPolicyListingEndReview').length);
      await page.locator('#checkResult').click();
      assert.equal(await page.locator('#metricEnded').innerText(), '201');
      assert.equal(await page.locator('#currentReview').isVisible(), false);
      assert.equal(await page.evaluate(() => window.fixtureMessages.filter(m => m.type === 'submitEbayPolicyListingEndReview').length), sendsBefore);
      await page.evaluate((audit) => {
        window.changeFixture({ ebayPolicyListingAudit: audit,
          ebayPolicyListingScanState: { phase: 'complete', active: false, totalListings: 3, coverage: audit.coverage },
          policyListingEndLedger: {}, policyListingEndHistory: {} });
      }, audit);
      await page.locator('#selectAllBlock').click();
      await page.locator('#prepareReview').click();
      await page.locator('#cancelReview').click();
      assert.equal(await page.locator('#heldBatches').isVisible(), true);
      assert.equal(await page.locator('#metricEnded').innerText(), '0');
      assert.equal(await page.locator('[data-item-id="300000000001"]').isEnabled(), false);
      await page.locator('[data-filter="review"]').click();
      await page.locator('#selectFiltered').click();
      assert.equal(await page.locator('#metricSelected').innerText(), '1');
      await page.locator('#prepareReview').click();
      const reviewRun = await page.evaluate(() => window.fixtureMessages.filter(m => m.type === 'prepareEbayPolicyListingEndReview').at(-1).itemIds);
      assert.deepEqual(reviewRun, ['300000000002']);
      await page.locator('#checkHeldResult').click();
      assert.equal(await page.locator('#metricEnded').innerText(), '1');
      assert.equal(await page.locator('#currentReviewCount').innerText(), '1 exact listings');
      assert.equal(await page.locator('#approveEnd').isEnabled(), false);
      assert.equal(await page.locator('#heldBatches').isVisible(), false);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(evidence, `snapshot-${width}.png`), fullPage: true });
      results.push({ width, pass: true, checks: ['coverage warning', 'search', 'CSV', '201 flags selected, no-match excluded', '200-item batch', 'exact approval', '200 ended and 1 remaining', 'manual ending recognized without resubmission', 'set-aside Block batch excluded while Review batch proceeds', 'archived result leaves current Review intact'] });
      await page.close();
    }
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ scope: 'Isolated Chrome fixture; no signed-in account or marketplace action', results }, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
