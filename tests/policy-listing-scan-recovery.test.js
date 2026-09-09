const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const preflight = require('../extension/listing-preflight-core.js');
const auditCore = require('../extension/policy-listing-audit-core.js');
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
  const h = { data, progress: [], tabsCreated: 0, saveFailure: false, classificationHook: null };
  const context = vm.createContext({
    console, setTimeout, Date, Promise,
    VARIATION_SCAN_PAGE_SIZE: 200,
    VARIATION_SCAN_NAVIGATION_DELAY_MS: 0,
    LISTING_PREFLIGHT: { normalizeRulePack: (value) => value },
    POLICY_LISTING_AUDIT: {
      rulePackFingerprint: () => 'same-rules',
      buildPolicyAuditAsync: async (rows, rules, metadata, engine, options) => {
        await options.onProgress({ classifiedListings: 0, summary: { total: 0 } });
        if (h.classificationHook) await h.classificationHook();
        await options.onProgress({ classifiedListings: rows.length, summary: { total: rows.length, clear: rows.length, block: 0, review: 0 } });
        return { totalListings: rows.length, summary: { total: rows.length, clear: rows.length, block: 0, review: 0 }, listings: rows };
      }
    },
    FOUNDATION: { normalizeEbayAccount: (v) => v },
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
    createChromeTab: async () => { h.tabsCreated += 1; throw new Error('Completed scans must not open page 93'); },
    variationScanPageUrl: (page) => `https://example.test/active?page=${page}`,
    closeChromeTab: async () => {},
    recordExtensionLog: async () => {}
  });
  vm.runInContext(`let policyListingScanPromise = null; let policyListingStopRequested = false;\n${scanSource}`, context);
  h.run = () => context.scanEbayPolicyListings({ fresh: false });
  h.status = () => context.getEbayPolicyListingScanStatus();
  h.stop = () => context.stopEbayPolicyListingScan();
  return h;
}

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
