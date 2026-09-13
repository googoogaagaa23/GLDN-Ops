const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../extension/policy-listing-audit-core.js');
const ext = path.join(__dirname, '../extension');
const html = fs.readFileSync(path.join(ext, 'policy-listing-audit.html'), 'utf8');
const code = fs.readFileSync(path.join(ext, 'policy-listing-audit.js'), 'utf8');

async function page(state) {
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], {
    value: '', textContent: '', innerHTML: '', disabled: false, hidden: false,
    addEventListener() {}, classList: { toggle() {} }
  }]));
  const listeners = [];
  const data = { ebayPolicyListingScanState: state };
  const messages = [];
  await vm.runInNewContext(code, {
    GLDN_POLICY_LISTING_AUDIT: core,
    document: { getElementById: (id) => elements[id], querySelectorAll: () => [] },
    chrome: {
      runtime: { sendMessage: (message, callback) => { messages.push(message); callback({ ok: true }); } },
      storage: {
        local: { get: (keys, callback) => callback(data) },
        onChanged: { addListener: (listener) => listeners.push(listener) }
      }
    },
    setTimeout, clearTimeout, setInterval() {}, URL, Blob, console
  });
  return {
    elements, messages,
    change: (values) => {
      Object.assign(data, values);
      const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
      listeners.forEach((listener) => listener(changes, 'local'));
    }
  };
}

const collected = {
  active: true, phase: 'scanning', runId: 'last-page', computerLabel: 'M0', ebayAccountLabel: 'CLICKNCARRY',
  page: 92, nextPage: 93, completedPages: 92, totalPages: 92, scannedListings: 18359, totalListings: 18359
};

test('last-page screen shows collected totals, classification progress and recovered Resume', async () => {
  const p = await page(collected);
  assert.equal(p.messages[0].type, 'getEbayPolicyListingScanStatus');
  assert.equal(p.elements.metricScanned.textContent, '18,359');
  assert.match(p.elements.scanHeadline.textContent, /18,359 listing rows collected/);
  assert.equal(p.elements.auditIdentity.textContent, 'M0 / CLICKNCARRY');
  assert.equal(p.elements.currentReview.hidden, true);
  p.change({ ebayPolicyListingScanState: {
    ...collected, phase: 'classifying', classifiedListings: 100,
    classificationSummary: { total: 100, clear: 75, review: 20, block: 5 }
  } });
  assert.match(p.elements.scanHeadline.textContent, /100 of 18,359 listings classified/);
  assert.equal(p.elements.metricBlock.textContent, '5');
  assert.equal(p.elements.resumeScan.disabled, true);
  assert.equal(p.elements.stopScan.disabled, false);
  p.change({ ebayPolicyListingScanState: { ...collected, active: false, phase: 'paused', interrupted: true } });
  assert.match(p.elements.scanHeadline.textContent, /no pages need rescanning/);
  assert.equal(p.elements.resumeScan.disabled, false);
  assert.equal(p.elements.stopScan.disabled, true);
});

test('saved audit rows become visible and downloadable only after the complete commit', async () => {
  const p = await page({ ...collected, phase: 'saving' });
  assert.equal(p.elements.downloadAudit.disabled, true);
  const audit = {
    computerLabel: 'M0', ebayAccountLabel: 'CLICKNCARRY', scannedAt: '2026-09-08T01:00:00Z',
    ruleCount: 580, totalListings: 1, summary: { total: 1, clear: 0, review: 0, block: 1 },
    listings: [{ itemId: '300000000001', title: 'Aerosol paint can', action: 'block', status: 'BLOCK', matches: [], reason: 'Aerosol rule' }]
  };
  p.change({ ebayPolicyListingAudit: audit, ebayPolicyListingScanState: { ...collected, active: false, phase: 'complete' } });
  assert.equal(p.elements.downloadAudit.disabled, false);
  assert.match(p.elements.listingRows.innerHTML, /Aerosol paint can/);
  assert.equal(p.elements.currentReview.hidden, true);
  const css = fs.readFileSync(path.join(ext, 'policy-listing-audit.css'), 'utf8');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test('changing-store results remain visible with a prominent coverage warning', async () => {
  const coverage = { followUpRecommended: true, initialTotal: 18640, latestTotal: 18641, duplicatesRemoved: 1 };
  const state = { ...collected, active: false, phase: 'complete', totalListings: 18639, coverage };
  const p = await page(state);
  p.change({ ebayPolicyListingScanState: state, ebayPolicyListingAudit: {
    computerLabel: 'M0', ebayAccountLabel: 'CLICKNCARRY', scannedAt: '2026-09-13T00:00:00Z',
    totalListings: 18639, ruleCount: 620, summary: { total: 18639 }, coverage,
    listings: [{ itemId: '300000000001', title: 'Reviewable listing', action: 'review', matches: [] }]
  } });
  assert.match(p.elements.scanHeadline.textContent, /Store changed/);
  assert.match(p.elements.scanHeadline.textContent, /not a guaranteed current-store total/);
  assert.match(p.elements.scanDetail.textContent, /18,640 at start, 18,641 last observed/);
  assert.match(p.elements.scanDetail.textContent, /1 repeated rows removed/);
  assert.match(p.elements.listingRows.innerHTML, /Reviewable listing/);
  assert.equal(p.elements.downloadAudit.disabled, false);
});
