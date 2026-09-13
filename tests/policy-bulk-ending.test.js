const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../extension/policy-listing-audit-core');
const source = fs.readFileSync(require.resolve('../extension/background.js'), 'utf8');
const start = source.indexOf('async function policyListingNativePage');
const end = source.indexOf('\nfunction openTab', start);
const code = source.slice(start, end);
const ids = ['300000000001', '300000000002'];

function worker(data, native) {
  const calls = [];
  const context = vm.createContext({
    POLICY_LISTING_AUDIT: core, POLICY_LISTING_AUDIT_STATE_KEY: 'audit',
    PENDING_POLICY_LISTING_END_REVIEW_KEY: 'pending', POLICY_LISTING_END_LEDGER_KEY: 'ledger',
    LAST_POLICY_LISTING_END_RESULT_KEY: 'result', policyListingScanPromise: null,
    storageGet: async () => data,
    storageSet: async (values) => Object.assign(data, structuredClone(values)),
    storageRemove: async (keys) => keys.forEach((key) => delete data[key]),
    exactPolicyListingItemIds(values) {
      if (!values.length || values.length > 200 || new Set(values).size !== values.length
        || values.some((id) => !/^\d{9,15}$/.test(id))) throw Error('Invalid exact batch');
      return values;
    },
    validateCurrentPolicyListingAudit: async () => {},
    mergedPolicyListingEndLedger: (old, pending, successful) => ({
      ...old, [pending.reportFingerprint]: { successfulItemIds: successful }
    }),
    setTimeout: (fn) => { fn(); return 1; },
    URL, crypto: require('node:crypto').webcrypto,
    openTab: async () => { calls.push('openTab'); return { ok: false }; }
  });
  vm.runInContext(code, context);
  context.inspectPolicyNativePage = async (pending, mode, extra) => {
    calls.push(mode);
    return native(pending, mode, extra);
  };
  return { context, calls, submit: (request) => context.submitEbayPolicyListingEndReview(request) };
}

function fixture() {
  return {
    audit: { reportFingerprint: 'a', rulesFingerprint: 'r',
      listings: ids.map((itemId, index) => ({ itemId, action: index ? 'review' : 'block' })) },
    pending: { active: true, phase: 'review-ready', reviewMode: 'native-active-listings-ui',
      runId: 'one', reportFingerprint: 'a', rulesFingerprint: 'r',
      itemIds: ids, requestedCount: 2, seller: 'seller', sourceTabId: 10 },
    ledger: {}
  };
}
const approval = { runId: 'one', reportFingerprint: 'a', confirmationToken: 'APPROVE END POLICY LISTINGS 2' };

test('selected Review rows are endable but no-match, duplicate and already-ended rows are not', () => {
  const audit = fixture().audit;
  audit.listings.push({ itemId: '300000000003', action: 'clear' });
  assert.deepEqual(core.endableItemIds(audit, ids), ids);
  assert.throws(() => core.endableItemIds(audit, ['300000000003']));
  assert.throws(() => core.endableItemIds(audit, [ids[0], ids[0]]));
  assert.throws(() => core.endableItemIds(audit, ids, [ids[0]]));
});

test('same count from an old review cannot approve a different batch', async () => {
  for (const invalid of [{ ...approval, runId: 'old' }, { ...approval, reportFingerprint: 'old' },
    { ...approval, confirmationToken: 'APPROVE END POLICY LISTINGS 200' }]) {
    const w = worker(fixture(), () => { throw Error('Must not click'); });
    await assert.rejects(w.submit(invalid));
    assert.deepEqual(w.calls, []);
  }
});

test('submission is durably consumed before any native End action, and double click cannot replay', async () => {
  const data = fixture();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const w = worker(data, async (_, mode) => {
    if (mode === 'submit') {
      assert.equal(data.pending.phase, 'submitted');
      await held;
      return { ok: true };
    }
    return { ok: true, outcome: 'success', message: '2 listings ended' };
  });
  const first = w.submit(approval);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(w.submit(approval), /already running/);
  release();
  const result = await first;
  assert.equal(result.successfulCount, 2);
  assert.equal(data.pending, undefined);
  assert.equal(w.calls.filter((call) => call === 'submit').length, 1);
});

test('uncertain response is not success and a restarted worker refuses the same approval', async () => {
  const data = fixture();
  const w = worker(data, async () => { throw Error('Page disconnected after click'); });
  const result = await w.submit(approval);
  assert.equal(result.unknown, true);
  assert.equal(data.pending.phase, 'result-unknown');
  assert.equal(data.result, undefined);
  assert.deepEqual(data.ledger, {});
  const resumed = worker(data, () => { throw Error('Must not click'); });
  await assert.rejects(resumed.submit(approval), /no longer awaiting approval/);
  assert.deepEqual(resumed.calls, []);
});

test('a proven pre-End failure can be freshly approved without leaving a stuck submitted lock', async () => {
  const data = fixture();
  const w = worker(data, async () => {
    const error = Error('Selection changed before End');
    error.notDispatched = true;
    throw error;
  });
  await assert.rejects(w.submit(approval), /Selection changed/);
  assert.equal(data.pending.phase, 'review-ready');
  assert.equal(data.result, undefined);
});

test('unverified native confirmation is never clicked and no next batch starts automatically', async () => {
  const data = fixture();
  const w = worker(data, async (_, mode, extra) => {
    if (mode === 'confirm') { assert.notEqual(extra?.click, true); return { ok: true, needsNativeReview: true }; }
    return { ok: true, outcome: 'unknown' };
  });
  const result = await w.submit(approval);
  assert.equal(result.unknown, true);
  assert.equal(result.stopped, true);
  assert.equal(w.calls.filter((call) => call === 'submit').length, 1);
  assert.equal(w.calls.includes('openTab'), false);
});

test('unknown review cannot be canceled into a duplicate submission', async () => {
  const data = fixture();
  data.pending.phase = 'submitted';
  const w = worker(data, async () => ({}));
  await assert.rejects(w.context.cancelEbayPolicyListingEndReview(), /may already have been submitted/);
  assert.ok(data.pending);
});

test('empty or informational legacy results never count as successful ends', () => {
  for (const response of [{}, { ok: true }, { ok: true, messageType: 'INFO' }]) {
    const result = core.normalizeEndSubmissionOutcome(ids, response);
    assert.deepEqual(result.successfulItemIds, []);
    assert.deepEqual(result.unknownItemIds, ids);
  }
});

test('policy ending path uses normal UI, not private JSON submission endpoints', () => {
  assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|submit-end-listings|fetchEbayVariationEndReview|createMove99BulkWorkspace/);
  assert.match(code, /shui-dt-checkone-/);
  assert.match(code, /sameIds\(dialogIds, ids\)/);
  assert.match(code, /seller\(\) !== args.seller/);
});
