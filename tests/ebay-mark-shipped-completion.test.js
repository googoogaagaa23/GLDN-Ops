const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../extension/ebay.js'), 'utf8');
const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
function extract(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const brace = text.indexOf('{', text.indexOf(') {', start));
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) return `${text.slice(start - 6, start) === 'async ' ? 'async ' : ''}${text.slice(start, i + 1)}`;
  }
  throw new Error(name);
}
const pending = (phase = 'manual-review-required') => ({
  active: true, phase, startedAt: '2026-09-10T03:00:00.000Z',
  activationApprovedAt: '2026-09-10T03:01:00.000Z', ownerTabId: 29,
  beforeCount: 4, selectedCount: 4
});
function harness(state = pending()) {
  const stored = { pendingMarkShippedRun: state, computerLabel: '0', ebayAccountLabel: 'FAK12' };
  const writes = [];
  let syncs = 0;
  const sandbox = {
    Date, Number, Boolean, String, console,
    markShippedFinalization: null, stored, writes,
    document: { body: { innerText: 'Results: 0\n4 orders have been marked as shipped.' }, getElementById: () => null },
    location: { href: 'https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT' },
    isAwaitingShipmentPage: () => true,
    parseAwaitingResultsCount: () => 0,
    runtimeMessage: async () => ({ ok: true, tabId: 29 }),
    storageGet: async () => structuredClone(stored),
    storageSet: async (data) => { writes.push(structuredClone(data)); Object.assign(stored, structuredClone(data)); },
    syncMarkShippedRecord: async () => { syncs++; return { ok: true }; },
    dismissAnyMarkShippedConfirmation: async () => {}, renderStatus: () => {},
    syncCount: () => syncs
  };
  vm.runInNewContext([
    'markShippedCompletionEvidence', 'recoverableMarkShippedCompletion', 'isMarkShippedOwnerPage',
    'reconcilePendingMarkShippedCompletion', 'finalizePendingMarkShipped', 'finishPendingMarkShipped', 'saveMarkShippedResult'
  ].map((name) => extract(source, name)).join('\n'), sandbox);
  return sandbox;
}

for (const phase of ['manual-review-required', 'activating-approved-action', 'awaiting-approval', 'awaiting-result', 'finalizing']) {
  test(`late eBay success clears ${phase} and records the exact four orders`, async () => {
    const h = harness(pending(phase));
    assert.equal(await h.reconcilePendingMarkShippedCompletion(), true);
    assert.equal(h.stored.pendingMarkShippedRun, null);
    assert.equal(h.stored.lastMarkShippedResult.status, 'Completed');
    assert.equal(h.stored.lastMarkShippedResult.markedCount, 4);
    assert.equal(h.stored.lastMarkShippedResult.remainingCount, 0);
    assert.equal(h.syncCount(), 1);
    assert.equal(h.writes.some((write) => write.pendingMarkShippedRun?.phase === 'finalizing'), false);
    assert.equal(await h.reconcilePendingMarkShippedCompletion(), false);
    assert.equal(h.syncCount(), 1);
  });
}

test('recovery preserves pending approval, unknown, mismatched, and filtered-empty results', async () => {
  const variants = [
    { phase: 'prepare' }, { phase: 'awaiting-activation-approval' },
    { activationApprovedAt: '' }, { selectedCount: 3 }, { beforeCount: 0 }
  ];
  for (const change of variants) {
    const h = harness({ ...pending(), ...change });
    assert.equal(await h.reconcilePendingMarkShippedCompletion(), false, JSON.stringify(change));
    assert.equal(h.writes.length, 0);
  }
  for (const text of ['Results: 0', 'No results found', '4 orders selected', '5 orders have been marked as shipped']) {
    const h = harness();
    h.document.body.innerText = text;
    assert.equal(await h.reconcilePendingMarkShippedCompletion(), false, text);
    assert.equal(h.writes.length, 0);
  }
  for (const count of [null, 4]) {
    const h = harness();
    h.parseAwaitingResultsCount = () => count;
    assert.equal(await h.reconcilePendingMarkShippedCompletion(), false);
  }
});

test('recovery cannot use another tab or another eBay page', async () => {
  for (const wrongTab of [true, false]) {
    const h = harness();
    if (wrongTab) h.runtimeMessage = async () => ({ ok: true, tabId: 30 });
    else h.isAwaitingShipmentPage = () => false;
    assert.equal(await h.reconcilePendingMarkShippedCompletion(), false);
    assert.equal(h.writes.length, 0);
  }
});

test('partial success stays partial rather than claiming the full batch completed', async () => {
  const h = harness();
  h.document.body.innerText = '2 orders have been marked as shipped';
  h.parseAwaitingResultsCount = () => 2;
  assert.equal(await h.reconcilePendingMarkShippedCompletion(), true);
  assert.equal(h.stored.lastMarkShippedResult.status, 'Partial');
  assert.equal(h.stored.lastMarkShippedResult.markedCount, 2);
});

test('concurrent completion checks save once and release busy before dashboard sync returns', async () => {
  const h = harness();
  let release;
  let syncCalls = 0;
  h.syncMarkShippedRecord = async () => { syncCalls++; return new Promise((resolve) => { release = resolve; }); };
  const first = h.reconcilePendingMarkShippedCompletion();
  const second = h.reconcilePendingMarkShippedCompletion();
  for (let i = 0; i < 30 && !release; i++) await Promise.resolve();
  assert.equal(h.stored.pendingMarkShippedRun, null);
  assert.equal(h.stored.lastMarkShippedResult.status, 'Completed');
  assert.equal(syncCalls, 1);
  release({ ok: false, queued: true });
  await Promise.all([first, second]);
  assert.equal(h.stored.pendingMarkShippedRun, null);
});

test('stale completion cannot clear a newer run or a canceled run', async () => {
  for (const replacement of [null, { ...pending(), startedAt: '2026-09-10T04:00:00.000Z' }]) {
    const h = harness(replacement);
    assert.equal(await h.finalizePendingMarkShipped(pending(), { marked: 4, remaining: 0, exact: true }), null);
    assert.equal(h.writes.length, 0);
  }
});

test('Seller Level checks late completion before enforcing the workflow lock', async () => {
  const h = harness();
  const order = [];
  h.U = {
    claimWorkflowStart: async () => { assert.equal(h.stored.pendingMarkShippedRun, null); order.push('claimed'); return 'token'; },
    releaseWorkflowStart: async () => order.push('released')
  };
  vm.runInNewContext(extract(source, 'startSellerLevelScan'), h);
  // Navigation itself is deliberately stubbed; this test does not touch a seller account.
  h.location.assign = () => order.push('navigated');
  h.scanHealthPage = () => order.push('scan');
  await h.startSellerLevelScan();
  assert.ok(order.includes('claimed'));
});

for (const action of ['Activation', 'Continue']) {
  for (const replacement of [null, { ...pending(), startedAt: 'new-run' }]) {
    test(`late ${action} release does not resurrect or overwrite a completed/replaced run (${replacement ? 'new' : 'cleared'})`, async () => {
      let state = pending(action === 'Activation' ? 'activating-approved-action' : 'awaiting-result');
      const h = {
        Date, Number, URL,
        getTab: async () => ({ url: 'https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT' }),
        storageGet: async () => ({ pendingMarkShippedRun: structuredClone(state) }),
        storageSet: async (data) => { state = structuredClone(data.pendingMarkShippedRun); },
        debuggerAttach: async () => {}, debuggerDetach: async () => {},
        buildMarkShippedActivationTargetProbe: () => '', buildMarkShippedTargetProbe: () => '',
        validateTrustedMarkShippedActivation: () => ({ selectedCount: 4 }),
        validateTrustedMarkShippedDispatch: () => ({ selectedCount: 4, actionLabel: 'continue' }),
        debuggerCommand: async (_target, method, params) => {
          if (method === 'Runtime.evaluate') return { result: { value: { ok: true, x: 20, y: 30, label: action === 'Activation' ? 'mark as shipped' : 'continue' } } };
          if (params.type === 'mouseReleased') state = structuredClone(replacement);
          return {};
        }
      };
      vm.runInNewContext([extract(background, 'isExactAwaitingShipmentUrl'), extract(background, `dispatchTrustedEbayMarkShipped${action}`)].join('\n'), h);
      const result = await h[`dispatchTrustedEbayMarkShipped${action}`]({}, { tab: { id: 29, url: 'https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT' } });
      assert.equal(result.ok, true);
      assert.deepEqual(state, replacement);
    });
  }
}

test('completion recovery is wired into startup and heartbeat and never dispatches shipments', () => {
  assert.match(extract(source, 'resumePendingActions'), /await reconcilePendingMarkShippedCompletion\(\)/);
  const heartbeat = source.slice(source.indexOf('ebayHeartbeatTimer = setInterval'));
  assert.match(heartbeat, /await reconcilePendingMarkShippedCompletion\(\)/);
  for (const name of ['reconcilePendingMarkShippedCompletion', 'finishPendingMarkShipped']) {
    assert.doesNotMatch(extract(source, name), /dispatchTrusted|\.click\(|dispatchFullClick/);
  }
});
