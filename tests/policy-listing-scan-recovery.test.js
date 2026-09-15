const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const preflight = require('../extension/listing-preflight-core.js');
const auditCore = require('../extension/policy-listing-audit-core.js');
const violationHistory = require('../extension/violation-history-core.js');
const pack = require('../extension/listing-preflight-rules.json');
const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const scanSource = source.slice(source.indexOf('const POLICY_LISTING_AUDIT_STATE_KEY ='), source.indexOf('function mergedPolicyListingEndLedger'));
const STATE = 'ebayPolicyListingScanState';
const AUDIT = 'ebayPolicyListingAudit';
const chunkKey = (page) => `ebayPolicyListingScanChunk:recovery-run:${page}`;

function harness(total = 18359) {
  const pages = Math.ceil(total / 200);
  const data = {
    computerLabel: '2', ebayAccountLabel: 'FANCYFI',
    [STATE]: {
      active: true, phase: 'scanning', runId: 'recovery-run',
      computerLabel: '2', ebayAccountLabel: 'FANCYFI', rulesFingerprint: 'same-rules',
      totalListings: total, totalPages: pages, completedPages: pages,
      page: pages, nextPage: pages + 1, scannedListings: total,
      startedAt: '2026-09-08T01:00:00Z'
    },
    gldnWorkflowReservation: { active: true, id: 'ebay-policy-scan', token: 'old-token' }
  };
  for (let page = 1; page <= pages; page += 1) {
    data[chunkKey(page)] = {
      runId: 'recovery-run', page, totalListings: total,
      records: Array.from({ length: Math.min(200, total - (page - 1) * 200) }, (_, i) => ({
        itemId: String(300000000000 + (page - 1) * 200 + i), title: 'Storage shelf organizer'
      }))
    };
  }
  const h = { data, progress: [], tabsCreated: 0, saveFailure: false, classificationHook: null, snapshots: null, pagesRead: [] };
  const context = vm.createContext({
    console, setTimeout, clearTimeout, Date, Promise,
    GLDN_VIOLATION_HISTORY: violationHistory,
    VARIATION_SCAN_PAGE_SIZE: 200,
    VARIATION_SCAN_NAVIGATION_DELAY_MS: 0,
    LISTING_PREFLIGHT: { normalizeRulePack: (value) => value },
    POLICY_LISTING_AUDIT: {
      rulePackFingerprint: () => 'same-rules',
      buildPolicyAuditAsync: async (rows, rules, metadata, engine, options) => {
        await options.onProgress({ classifiedListings: 0, summary: { total: 0 } });
        if (h.classificationHook) await h.classificationHook();
        await options.onProgress({ classifiedListings: rows.length, summary: { total: rows.length, clear: rows.length, block: 0, review: 0 } });
        return { totalListings: rows.length, summary: { total: rows.length, clear: rows.length, block: 0, review: 0 }, listings: rows, coverage: metadata.coverage, incidentHistoryWarning:rules.incidentHistoryWarning };
      }
    },
    FOUNDATION: { normalizeEbayAccount: (v) => v },
    getDashboardConfig:async()=>{if(h.dashboardOffline) throw new Error('Dashboard setup code is missing'); return {};},
    postToDashboard:async()=>({schemaVersion:1,ok:true,offset:0,total:0,records:[],nextOffset:null,revision:'empty'}),
    identityForComputer: () => ({ computerLabel: '2', ebayAccountLabel: 'FANCYFI' }),
    fetch: async () => ({ ok: true, json: async () => ({ ruleCount: 580 }) }),
    chrome: { runtime: { getURL: (url) => url } },
    storageGet: async (keys) => structuredClone(keys == null ? data : Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]))),
    storageSet: async (values) => {
      if (h.saveFailure && values[AUDIT]) throw new Error('Storage commit failed');
      Object.assign(data, structuredClone(values));
      if (values[STATE]) h.progress.push(structuredClone(values[STATE]));
    },
    storageRemove: async (keys) => keys.forEach((key) => { delete data[key]; }),
    claimWorkflowStart: async () => {
      assert.equal(data[STATE]?.active, false, 'recover orphan before claiming');
      return { ok: true, token: 'new-token' };
    },
    releaseWorkflowStart: async (token) => {
      if (data.gldnWorkflowReservation?.token === token) delete data.gldnWorkflowReservation;
    },
    createChromeTab: async () => { h.tabsCreated += 1; if (h.snapshots) return { id: 123 }; throw new Error('Completed scans must not open page 93'); },
    updateChromeTab: async () => {},
    waitForControlTabSettled: async () => {},
    waitForEbayVariationScanPage: async (tabId, offset, timeout, allowEnd) => {
      assert.equal(allowEnd, true);
      const page = offset / 200 + 1;
      h.pagesRead.push(page);
      assert.ok(h.snapshots?.[page], `unexpected page ${page}`);
      return h.snapshots[page];
    },
    controlDelay: async () => {},
    variationScanPageUrl: (page) => `https://example.test/active?page=${page}`,
    closeChromeTab: async () => {},
    recordExtensionLog: async () => {}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/violation-history-background.js'), 'utf8'), context);
  vm.runInContext(`let policyListingScanPromise = null; let policyListingStopRequested = false;\n${scanSource}`, context);
  h.useRealRules = () => {
    context.LISTING_PREFLIGHT = preflight;
    context.POLICY_LISTING_AUDIT = auditCore;
    context.fetch = async () => ({ok:true,json:async()=>pack});
  };
  h.run = () => context.scanEbayPolicyListings({ fresh: false });
  h.status = () => context.getEbayPolicyListingScanStatus();
  h.stop = () => context.stopEbayPolicyListingScan();
  h.readSaved = (total, pages) => context.readCompletePolicyListingScan('recovery-run', total, pages);
  return h;
}

function snapshot(total, page, firstId = (page - 1) * 200) {
  const offset = (page - 1) * 200;
  const count = Math.max(0, Math.min(200, total - offset));
  return { total, start: offset + 1, end: offset + count, endOfList: count === 0,
    records: Array.from({ length: count }, (_, index) => ({ itemId: String(300000000000 + firstId + index), title: 'Wood storage shelf' })) };
}

test('daily listing growth no longer aborts, deduplicates shifted rows and bounds the pass', async () => {
  const h = harness(201);
  Object.assign(h.data[STATE], { completedPages: 1, nextPage: 2 });
  delete h.data[chunkKey(2)];
  h.snapshots = { 2: snapshot(650, 2, 199) };
  const result = await h.run();
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(h.pagesRead, [2], 'do not chase a constantly growing page count');
  assert.equal(result.scannedListings, 399);
  assert.equal(result.coverage.initialTotal, 201);
  assert.equal(result.coverage.latestTotal, 650);
  assert.equal(result.coverage.duplicatesRemoved, 1);
  assert.equal(result.coverage.followUpRecommended, true);
  assert.equal(h.data[AUDIT].coverage.countChanged, true);
  assert.equal(h.data[STATE].phase, 'complete');
});

test('a complete scan without dashboard setup preserves real rules, cached blocks and a non-blocking warning',async()=>{
  const h=harness(201);
  h.dashboardOffline=true;
  h.useRealRules();
  h.data.gldnViolationHistoryLocal=violationHistory.mergeRecords([{account:'old-store',itemId:'300000999999',
    title:'Previously removed product',asin:'B012345678',reason:'This listing was removed for violating our Pesticides policy.'}]);
  h.data[chunkKey(1)].records[0].title='Ant Killer Pesticide Granules';
  Object.assign(h.data[chunkKey(1)].records[1],{title:'Stainless Measuring Spoon Set',sku:Buffer.from('B012345678').toString('base64')});
  const result=await h.run();
  assert.equal(result.ok,true,result.error);
  assert.equal(result.scannedListings,201);
  assert.equal(result.summary.block,2);
  assert.equal(h.data[STATE].phase,'complete');
  assert.match(h.data[STATE].incidentHistoryWarning,/Dashboard connection is optional/);
  assert.match(h.data[AUDIT].incidentHistoryWarning,/1 saved incident/);
  assert.equal(h.tabsCreated,0);
});

test('listing shrinkage and an explicit end-of-list checkpoint finish without restart', async () => {
  for (const total of [201, 199]) {
    const h = harness(450);
    Object.assign(h.data[STATE], { completedPages: 1, nextPage: 2 });
    delete h.data[chunkKey(2)];
    delete h.data[chunkKey(3)];
    h.snapshots = { 2: snapshot(total, 2) };
    const result = await h.run();
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(h.pagesRead, [2]);
    assert.equal(result.coverage.followUpRecommended, true);
    assert.equal(result.coverage.latestTotal, total);
    assert.equal(result.scannedListings, Math.max(200, total));
  }
});

test('stable count with shifted duplicates is explicitly incomplete, not a false full-store result', async () => {
  const h = harness(201);
  h.data[chunkKey(2)].records[0] = h.data[chunkKey(1)].records[0];
  const result = await h.run();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.coverage.countChanged, false);
  assert.equal(result.coverage.completeAtStableCount, false);
  assert.equal(result.coverage.followUpRecommended, true);
  assert.equal(result.scannedListings, 200);
});

test('current IP rules can classify old raw checkpoints without rescanning the store', async () => {
  const h = harness(201);
  h.data[STATE].rulesFingerprint = 'older-ip-rules';
  const result = await h.run();
  assert.equal(result.ok, true, result.error);
  assert.equal(h.tabsCreated, 0);
  assert.equal(h.data[STATE].rulesFingerprint, 'same-rules');
  assert.equal(result.coverage.completeAtStableCount, true);
});

test('count tolerance never accepts missing rows, wrong ranges or within-page duplicates', async () => {
  for (const bad of ['missing row', 'duplicate row', 'wrong range', 'missing end evidence']) {
    const h = harness(201);
    const page = snapshot(202, 2);
    Object.assign(h.data[chunkKey(2)], page, { schemaVersion: 2, observedTotal: 202 });
    if (bad === 'missing row') h.data[chunkKey(2)].records.pop();
    if (bad === 'duplicate row') h.data[chunkKey(2)].records[1] = h.data[chunkKey(2)].records[0];
    if (bad === 'wrong range') h.data[chunkKey(2)].start = 1;
    if (bad === 'missing end evidence') Object.assign(h.data[chunkKey(2)], { observedTotal: 100, start: 201, end: 200, records: [], endOfList: false });
    const result = await h.run();
    assert.equal(result.ok, false, bad);
    assert.equal(h.data[AUDIT], undefined);
    assert.ok(h.data[chunkKey(1)]);
  }
});

test('an explicitly verified empty store is a valid zero-listing result', async () => {
  const h = harness(0);
  h.snapshots = { 1: snapshot(0, 1) };
  const result = await h.run();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.scannedListings, 0);
  assert.equal(result.coverage.completeAtStableCount, true);
});

test('all 18,359 saved listings finish without requesting page 93', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.ok, true, result.error);
  assert.equal(h.tabsCreated, 0);
  assert.equal(h.data[AUDIT].listings.length, 18359);
  assert.equal(h.data[STATE].phase, 'complete');
  assert.equal(h.data[STATE].active, false);
  assert.ok(h.progress.some((state) => state.phase === 'classifying'));
  assert.ok(h.progress.some((state) => state.phase === 'saving'));
  assert.equal(result.audit, undefined, 'avoid a second store-sized message payload');
  assert.equal(h.data[chunkKey(1)], undefined, 'cleanup only after commit');
});

test('interrupted classification becomes resumable without discarding raw pages', async () => {
  const h = harness(201);
  h.data[STATE].phase = 'classifying';
  const result = await h.status();
  assert.equal(result.scanState.phase, 'paused');
  assert.equal(result.scanState.interrupted, true);
  assert.equal(result.scanState.nextPage, 3);
  assert.ok(h.data[chunkKey(2)]);
  assert.equal(h.data.gldnWorkflowReservation, undefined);
});

test('status checks and duplicate starts do not interrupt a live classifier', async () => {
  const h = harness(2);
  h.classificationHook = async () => {
    assert.equal((await h.status()).scanState.phase, 'classifying');
    assert.equal(h.data[STATE].active, true);
    assert.equal((await h.run()).busy, true);
  };
  assert.equal((await h.run()).ok, true);
});

test('pause during classification retains every saved listing for Resume', async () => {
  const h = harness(201);
  h.classificationHook = () => h.stop();
  const result = await h.run();
  assert.equal(result.paused, true);
  assert.equal(h.data[STATE].phase, 'paused');
  assert.equal(h.data[STATE].nextPage, 3);
  assert.ok(h.data[chunkKey(1)]);
  assert.ok(h.data[chunkKey(2)]);
  assert.equal(h.data[AUDIT], undefined);
  h.classificationHook = null;
  assert.equal((await h.run()).ok, true);
  assert.equal(h.tabsCreated, 0);
});

test('failed final storage commit preserves checkpoints and can be retried', async () => {
  const h = harness(201);
  h.saveFailure = true;
  assert.match((await h.run()).error, /Storage commit failed/);
  assert.equal(h.data[STATE].phase, 'error');
  assert.ok(h.data[chunkKey(1)]);
  assert.ok(h.data[chunkKey(2)]);
  h.saveFailure = false;
  assert.equal((await h.run()).ok, true);
  assert.equal(h.tabsCreated, 0);
});

test('incomplete final scan and account mismatch do not create an audit or discard evidence', async () => {
  const h = harness(201);
  delete h.data[chunkKey(2)];
  assert.match((await h.run()).error, /missing or incomplete/);
  assert.ok(h.data[chunkKey(1)]);
  assert.equal(h.data[AUDIT], undefined);
  const wrongAccount = harness(1);
  wrongAccount.data[STATE].ebayAccountLabel = 'OTHER';
  assert.match((await wrongAccount.run()).error, /different account/);
  assert.ok(wrongAccount.data[chunkKey(1)]);
});

test('batched classifier preserves exact decisions and fingerprint, with visible progress', async () => {
  const rows = Array.from({ length: 203 }, (_, i) => ({
    itemId: String(300000000000 + i),
    title: ['Wood shelf organizer', 'Blue aerosol spray paint can', 'EPA registered ant and roach insecticide'][i % 3]
  }));
  const metadata = { scannedAt: '2026-09-08T01:00:00Z', computerLabel: '2', ebayAccountLabel: 'FANCYFI' };
  const expected = auditCore.buildPolicyAudit(rows, pack, metadata, preflight);
  const progress = [];
  let yielded = false;
  setTimeout(() => { yielded = true; }, 0);
  const actual = await auditCore.buildPolicyAuditAsync(rows, pack, metadata, preflight, {
    batchSize: 100,
    onProgress: (event) => { progress.push(event.classifiedListings); }
  });
  assert.deepEqual(actual, expected);
  assert.deepEqual(progress, [0, 100, 200, 203]);
  assert.equal(yielded, true);
  await assert.rejects(auditCore.buildPolicyAuditAsync([rows[0], rows[0]], pack, metadata, preflight), /Duplicate/);
});

test('extension upgrade preserves read-only scan checkpoints but not old End approvals', async () => {
  const data = {
    [STATE]: { active: true, phase: 'scanning', runId: 'old-run', extensionVersion: '3.12.31', nextPage: 93, completedPages: 92, totalPages: 92 },
    pendingPolicyListingEndReview: { active: true, extensionVersion: '3.12.31' },
    'ebayPolicyListingScanChunk:old-run:92': { records: [{ itemId: '300000000001' }] }
  };
  const code = source.slice(source.indexOf('async function clearIncompatibleWorkflowState'), source.indexOf('async function clearRemovedBulkAutomationState'));
  const context = vm.createContext({
    VERSIONED_WORKFLOW_KEYS: [STATE, 'pendingPolicyListingEndReview'],
    EXTENSION_VERSION: 'new-version',
    storageGet: async () => structuredClone(data),
    storageRemove: async (keys) => keys.forEach((key) => { delete data[key]; }),
    storageSet: async (values) => Object.assign(data, values),
    recordExtensionLog: async () => {}
  });
  vm.runInContext(code, context);
  const result = await context.clearIncompatibleWorkflowState('update');
  assert.ok(result.preserved.includes(STATE));
  assert.equal(data[STATE].phase, 'paused');
  assert.equal(data[STATE].nextPage, 93);
  assert.equal(data[STATE].active, false);
  assert.ok(data['ebayPolicyListingScanChunk:old-run:92']);
  assert.equal(data.pendingPolicyListingEndReview, undefined);
});

test('upgrade retains v3.12.38 native batch evidence but revokes its old End approval', async () => {
  const pending = { active: true, phase: 'review-ready', extensionVersion: '3.12.38',
    reviewMode: 'native-active-listings-ui', runId: 'manual-56', seller: 'seller',
    computerLabel: 'M0', ebayAccountLabel: 'FIXTURE', reportFingerprint: 'saved',
    itemIds: ['300000000001'], requestedCount: 1, sourceTabId: 77 };
  const data = { pendingPolicyListingEndReview: pending };
  const code = source.slice(source.indexOf('async function clearIncompatibleWorkflowState'), source.indexOf('async function clearRemovedBulkAutomationState'));
  const context = vm.createContext({
    VERSIONED_WORKFLOW_KEYS: ['pendingPolicyListingEndReview'], EXTENSION_VERSION: '3.12.39',
    storageGet: async () => structuredClone(data),
    storageSet: async (values) => Object.assign(data, structuredClone(values)),
    storageRemove: async (keys) => keys.forEach((key) => { delete data[key]; }),
    recordExtensionLog: async () => {}
  });
  vm.runInContext(code, context);
  await context.clearIncompatibleWorkflowState('update');
  assert.equal(data.pendingPolicyListingEndReview.phase, 'result-unknown');
  assert.deepEqual(data.pendingPolicyListingEndReview.itemIds, pending.itemIds);
  assert.equal(data.pendingPolicyListingEndReview.sourceTabId, 77);
  assert.equal(data.policyListingEndHistory['manual-56'].phase, 'set-aside');
  delete data.pendingPolicyListingEndReview; // Even a later Reset retains the batch receipt.
  assert.deepEqual(data.policyListingEndHistory['manual-56'].itemIds, pending.itemIds);
});
