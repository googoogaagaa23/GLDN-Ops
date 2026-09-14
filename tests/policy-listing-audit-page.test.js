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
    handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, classList: { toggle() {} }
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
    click: (id) => elements[id].handlers.click(),
    input: (id, value, type = 'change') => {
      elements[id].value = value;
      return elements[id].handlers[type]();
    },
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

function combinedAudit() {
  const listings = Array.from({ length: 194 }, (_, index) => ({
    itemId: String(300000000100 + index), title: 'Listing ' + index,
    action: index < 58 ? 'block' : index < 184 ? 'review' : 'clear',
    status: index < 58 ? 'BLOCK' : index < 184 ? 'REVIEW' : 'NO RULE MATCH', matches: []
  }));
  return { computerLabel: '2', ebayAccountLabel: 'FANCYFI', reportFingerprint: 'combined',
    scannedAt: '2026-09-13T20:00:00Z', totalListings: listings.length,
    summary: { total: 194, block: 58, review: 126, clear: 10 }, listings };
}

test('combined default displays Block and Review without no-match rows', async () => {
  const p = await page({ phase: 'complete', active: false });
  p.change({ ebayPolicyListingAudit: combinedAudit() });
  assert.match(p.elements.listingRows.innerHTML, />BLOCK</);
  assert.match(p.elements.listingRows.innerHTML, />REVIEW</);
  assert.doesNotMatch(p.elements.listingRows.innerHTML, /NO RULE MATCH/);
  assert.equal(p.elements.rangeLabel.textContent, '1-184 of 184 shown');
  assert.equal((p.elements.listingRows.innerHTML.match(/data-item-id=/g) || []).length, 184);
  assert.equal(p.elements.rowsPerPage.value, 'all');
  assert.equal(p.elements.nextPage.hidden, true);
  assert.equal(p.elements.pageLabel.textContent, 'All rows');
});

test('58 Block plus 126 Review are selected across both pages and prepared in one exact mixed batch', async () => {
  const p = await page({ phase: 'complete', active: false });
  p.change({ ebayPolicyListingAudit: combinedAudit() });
  await p.input('rowsPerPage', '100');
  await p.click('selectAllFlags');
  assert.equal(p.elements.metricSelected.textContent, '184');
  await p.click('nextPage');
  assert.equal(p.elements.rangeLabel.textContent, '101-184 of 184 shown');
  await p.click('prepareReview');
  const request = p.messages.find((m) => m.type === 'prepareEbayPolicyListingEndReview');
  assert.equal(request.itemIds.length, 184);
  assert.equal(request.itemIds[0], '300000000100');
  assert.equal(request.itemIds.at(-1), '300000000283');
  assert.equal(p.messages.some((m) => m.type === 'submitEbayPolicyListingEndReview'), false);
});

test('global combined selection excludes completed and unconfirmed IDs, preserving no-repeat protection', async () => {
  const p = await page({ phase: 'complete', active: false });
  const audit = combinedAudit();
  p.change({
    ebayPolicyListingAudit: audit,
    policyListingEndLedger: { combined: { successfulItemIds: [audit.listings[0].itemId] } },
    policyListingEndHistory: { previous: { runId: 'previous', computerLabel: '2', ebayAccountLabel: 'FANCYFI',
      phase: 'set-aside', itemIds: [audit.listings[58].itemId] } }
  });
  await p.click('selectAllFlags');
  assert.equal(p.elements.metricSelected.textContent, '182');
  await p.click('prepareReview');
  const request = p.messages.find((m) => m.type === 'prepareEbayPolicyListingEndReview');
  assert.equal(request.itemIds.includes(audit.listings[0].itemId), false);
  assert.equal(request.itemIds.includes(audit.listings[58].itemId), false);
});

test('switching from page two to All displays every row without clearing selections', async () => {
  const p = await page({ phase: 'complete', active: false });
  p.change({ ebayPolicyListingAudit: combinedAudit() });
  await p.input('rowsPerPage', '100');
  await p.click('selectAllFlags');
  await p.click('nextPage');
  assert.equal(p.elements.rangeLabel.textContent, '101-184 of 184 shown');
  p.elements.resultsTable.scrollTop = 500;
  await p.input('rowsPerPage', 'all');
  assert.equal(p.elements.rangeLabel.textContent, '1-184 of 184 shown');
  assert.equal(p.elements.metricSelected.textContent, '184');
  assert.equal(p.elements.resultsTable.scrollTop, 0);
  assert.equal(p.elements.previousPage.hidden, true);
  assert.equal(p.elements.nextPage.hidden, true);
  await p.input('rowsPerPage', '100');
  assert.equal(p.elements.rangeLabel.textContent, '1-100 of 184 shown');
  assert.equal(p.elements.previousPage.disabled, true);
  assert.equal(p.elements.nextPage.disabled, false);
  assert.equal(p.elements.nextPage.hidden, false);
});

test('250, 500 and All display sizes do not change the 200-item End batch limit', async () => {
  const p = await page({ phase: 'complete', active: false });
  const base = combinedAudit();
  const listings = Array.from({ length: 501 }, (_, i) => ({ ...base.listings[0], itemId: String(300000000100 + i) }));
  p.change({ ebayPolicyListingAudit: { ...base, listings } });
  for (const size of ['250', '500']) {
    await p.input('rowsPerPage', size);
    assert.equal((p.elements.listingRows.innerHTML.match(/data-item-id=/g) || []).length, Number(size));
    await p.click('nextPage');
    assert.match(p.elements.rangeLabel.textContent, new RegExp('^' + (Number(size) + 1) + '-'));
  }
  await p.input('rowsPerPage', 'all');
  p.elements.pageSelection.checked = true;
  await p.elements.pageSelection.handlers.change();
  assert.equal(p.elements.metricSelected.textContent, '501');
  await p.click('prepareReview');
  const request = p.messages.find((m) => m.type === 'prepareEbayPolicyListingEndReview');
  assert.equal(request.itemIds.length, 200);
  assert.equal(p.messages.some((m) => m.type === 'submitEbayPolicyListingEndReview'), false);
});

test('All handles empty searches and invalid display sizes without losing the audit', async () => {
  const p = await page({ phase: 'complete', active: false });
  p.change({ ebayPolicyListingAudit: combinedAudit() });
  await p.input('listingSearch', 'no such title', 'input');
  assert.equal(p.elements.rangeLabel.textContent, '0-0 of 0 shown');
  assert.equal(p.elements.pageLabel.textContent, 'No rows');
  assert.equal(p.elements.pageSelection.disabled, true);
  await p.input('rowsPerPage', '0');
  assert.equal(p.elements.rowsPerPage.value, 'all');
  await p.input('listingSearch', '', 'input');
  assert.equal(p.elements.rangeLabel.textContent, '1-184 of 184 shown');
  assert.equal(p.elements.metricScanned.textContent, '194');
});
