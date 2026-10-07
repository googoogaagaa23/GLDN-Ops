const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const core = require('../extension/order-audit-core.js');
const root = path.join(__dirname, '..');
const selection = { computerLabel: 'M0', accountLabel: 'CLICKNCARRY', monthKey: '2026-10', runKey: 'M0|CLICKNCARRY|2026-10' };
const unit = core.normalizeExpectedUnit({ ...selection, orderNumber: '11-10000-10000', orderDate: '2026-10-04', asin: 'B012345678', unitIndex: 1 });
const monthly = { ...selection, phase: 'review', results: [{ ...unit, items: [{ asin: unit.asin, quantity: 1 }] }] };
const shared = () => ({ ok: true, metadata: { ...selection, expectedUnits: 1, expectedProfiles: ['M7'], scannedProfiles: [] }, expected: [unit], purchases: [], summary: { expectedUnits: 1 }, audit: { findings: [] } });

function workerHarness(stored = {}) {
  const tabs = [];
  const context = {
    GLDN_ORDER_PLACEMENT_AUDIT: core, URL, Date, Math, setTimeout: (callback) => callback(),
    chrome: {
      runtime: { getManifest: () => ({ version: 'fixture' }) },
      storage: { local: {
        get: (_keys, callback) => callback(stored),
        set: (values, callback) => { Object.assign(stored, values); callback(); },
        remove: (_keys, callback) => callback()
      } },
      tabs: {
        create: (options, callback) => { tabs.push(options); callback({ id: 42 }); },
        get: (_id, callback) => callback(null), remove: (_id, callback) => callback()
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'extension/order-audit-background.js'), 'utf8'), context);
  return { api: context.GLDN_ORDER_PLACEMENT_AUDIT_BACKGROUND, stored, tabs };
}

test('build readiness distinguishes missing, unfinished, wrong-scope, and exact completed eBay reads', () => {
  assert.match(core.seedReadiness(null, selection).reason, /eBay profile signed into CLICKNCARRY/);
  assert.equal(core.seedReadiness({ ...monthly, phase: 'index' }, selection).ready, false);
  for (const scope of [{ computerLabel: '2' }, { accountLabel: 'FANCYFI' }, { monthKey: '2026-09' }, { runKey: 'wrong' }]) {
    assert.equal(core.seedReadiness(monthly, { ...selection, ...scope }).ready, false);
  }
  assert.equal(core.seedReadiness(monthly, selection).ready, true);
});

test('mismatched eBay build is rejected before any shared data is reset', async () => {
  const h = workerHarness();
  const calls = [];
  await assert.rejects(h.api.seedExpectedFromMonthlyRun(monthly, { ...selection, computerLabel: '2' }, { postToDashboard: async (...args) => calls.push(args) }), /different computer/);
  assert.equal(calls.length, 0);
});

test('Amazon-only M7 can scan exact shared eBay demand without a local Monthly eBay Profit run', async () => {
  const h = workerHarness({ amazonProfileLabel: 'M7', computerLabel: 'M0' });
  const calls = [];
  const result = await h.api.startAmazonScan(selection, {}, { postToDashboard: async (action) => { calls.push(action); return shared(); } });
  assert.equal(result.ok, true);
  assert.equal(result.state.runKey, selection.runKey);
  assert.equal(result.state.supplierProfile, 'M7');
  assert.deepEqual(calls, ['orderPlacementAuditRead']);
  assert.equal(h.tabs.length, 1);
  assert.equal(h.tabs[0].active, false);
});

test('wrong audit scope, partial demand, duplicate units, and explicit wrong run keys never start an Amazon worker', async () => {
  for (const change of [
    (data) => { data.metadata.runKey = '2|FANCYFI|2026-10'; },
    (data) => { data.metadata.accountLabel = 'FANCYFI'; },
    (data) => { data.metadata.expectedUnits = 2; },
    (data) => { data.expected = [unit, unit]; data.metadata.expectedUnits = 2; },
    (data) => { data.expected = [{ ...unit, computerLabel: '2' }]; }
  ]) {
    const h = workerHarness({ amazonProfileLabel: 'M7' });
    const response = shared(); change(response);
    await assert.rejects(h.api.startAmazonScan(selection, {}, { postToDashboard: async () => response }));
    assert.equal(h.tabs.length, 0);
  }
  const h = workerHarness({ amazonProfileLabel: 'M7' });
  await assert.rejects(h.api.startAmazonScan({ ...selection, runKey: 'wrong' }, {}, { postToDashboard: async () => shared() }), /matching/);
  assert.equal(h.tabs.length, 0);
});

test('building eBay demand verifies every saved unit before reporting success', async () => {
  const h = workerHarness();
  const calls = [];
  const result = await h.api.seedExpectedFromMonthlyRun(monthly, selection, { postToDashboard: async (action) => { calls.push(action); return shared(); } });
  assert.equal(result.count, 1);
  assert.deepEqual(calls, ['orderPlacementAuditConfig', 'orderPlacementAuditExpectedBatch', 'orderPlacementAuditRead']);
  const wrongUnit = shared(); wrongUnit.expected = [{ ...unit, orderNumber: '11-20000-20000', unitKey: '' }];
  await assert.rejects(h.api.seedExpectedFromMonthlyRun(monthly, selection, { postToDashboard: async () => wrongUnit }), /did not verify/);
});

function pageHarness({ localMonthly = null, read = () => shared(), action = () => ({ ok: true }) } = {}) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: id === 'computerLabel' ? 'M0' : '', textContent: '', innerHTML: '', disabled: false,
      dataset: {}, handlers: {}, addEventListener: (event, callback) => node(id).handlers[event] = callback
    });
    return nodes.get(id);
  };
  const requests = [], opened = [];
  const context = {
    GLDN_ORDER_PLACEMENT_AUDIT: core,
    GLDN_FOUNDATION: { computerOptions: ['M0', '2'], computerAccounts: { M0: { ebayAccountLabel: 'CLICKNCARRY' }, '2': { ebayAccountLabel: 'FANCYFI' } } },
    document: { getElementById: node, querySelectorAll: () => [] },
    window: { addEventListener() {} }, Date, URL, Blob, setTimeout: () => 1, clearTimeout() {}, confirm: () => true,
    chrome: {
      storage: { local: {
        get: (_keys, callback) => callback({ computerLabel: 'M0', amazonProfileLabel: 'M7', orderPlacementAuditSelection: selection, ebayMonthlyProfit: localMonthly }),
        set: (_values, callback) => callback()
      } },
      runtime: { getURL: (page) => `chrome-extension://fixture/${page}`, sendMessage: (message, callback) => {
        requests.push(message);
        const response = message.type === 'readOrderPlacementAudit' ? read(message)
          : message.type === 'getOrderPlacementAuditAmazon' ? { ok: true }
          : action(message);
        Promise.resolve(response).then(callback);
      } },
      tabs: { create: (options) => opened.push(options) }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'extension/order-audit.js'), 'utf8'), context);
  return { node, requests, opened, tick: () => new Promise(setImmediate) };
}

test('Amazon-only page enables Scan from shared demand and explains why Build is unavailable', async () => {
  const h = pageHarness(); await h.tick();
  assert.equal(h.node('startAmazonScan').disabled, false);
  assert.equal(h.node('seedExpected').disabled, true);
  assert.match(h.node('seedExpected').title, /eBay profile signed into CLICKNCARRY/);
  assert.match(h.node('demandStatus').textContent, /No local eBay read is needed/);
  h.node('openMonthlyProfit').handlers.click();
  assert.match(h.opened[0].url, /ebay-profit\.html$/);
});

test('failed refresh removes old audit results and disables Scan instead of keeping stale demand', async () => {
  let failed = false;
  const h = pageHarness({ read: () => failed ? { ok: false, error: 'Google is blocking the shared dashboard.' } : shared() });
  await h.tick(); assert.equal(h.node('startAmazonScan').disabled, false);
  failed = true; await h.node('refreshAudit').handlers.click();
  assert.equal(h.node('startAmazonScan').disabled, true);
  assert.equal(h.node('expectedUnits').textContent, '0');
  assert.match(h.node('notice').textContent, /Google is blocking/);
});

test('older refresh cannot restore a different computer’s audit after changing targets', async () => {
  let finishOld;
  let count = 0;
  const h = pageHarness({ read: () => ++count === 1 ? new Promise((resolve) => finishOld = resolve) : { ok: false, error: 'No target data' } });
  await h.tick();
  h.node('computerLabel').value = '2';
  await h.node('computerLabel').handlers.change();
  finishOld(shared()); await h.tick();
  assert.equal(h.node('startAmazonScan').disabled, true);
  assert.match(h.node('identity').textContent, /FANCYFI/);
  assert.equal(h.node('expectedUnits').textContent, '0');
});

test('double Build clicks cannot reset the shared audit twice', async () => {
  let finish;
  const h = pageHarness({ localMonthly: monthly, action: () => new Promise((resolve) => finish = resolve) });
  await h.tick();
  const first = h.node('seedExpected').handlers.click();
  assert.equal(h.node('seedExpected').disabled, true);
  await h.node('seedExpected').handlers.click();
  assert.equal(h.requests.filter((message) => message.type === 'seedOrderPlacementAuditExpected').length, 1);
  finish({ ok: true }); await first;
});

test('Google denial and non-JSON responses are actionable and never dump raw HTML or a key into the notice', async () => {
  const source = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
  const code = source.slice(source.indexOf('async function postDashboardRequest('), source.indexOf('async function postToDashboard('));
  for (const [status, text] of [[403, '<html>Access Denied SECRET-NONCE</html>'], [200, '<html>Authorization needed SECRET-NONCE</html>'], [502, '<html>upstream unavailable SECRET-NONCE</html>']]) {
    const context = { URL, setTimeout: (callback) => callback(), getDashboardConfig: async () => ({ url: 'https://script.google.com/fixture/exec', key: 'fixture-key' }),
      fetchWithTimeout: async () => ({ ok: status === 200, status, text: async () => text }), dashboardRequestTimeoutMs: () => 100,
      chrome: { runtime: { getManifest: () => ({ version: 'fixture' }) } }
    };
    vm.createContext(context); vm.runInContext(code, context);
    await assert.rejects(context.postDashboardRequest('orderPlacementAuditRead'), (error) => {
      assert.doesNotMatch(error.message, /SECRET-NONCE|fixture-key|<html>/);
      assert.match(error.message, /dashboard|Google/);
      return true;
    });
  }
});

test('transient dashboard reads retry with fresh URLs, but authorization failures and writes are not replayed', async () => {
  const source = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
  const code = source.slice(source.indexOf('async function postDashboardRequest('), source.indexOf('async function postToDashboard('));
  const calls = [];
  let mode = 'transient';
  const context = {
    URL, setTimeout: (callback) => callback(), getDashboardConfig: async () => ({ url: 'https://script.google.com/fixture/exec', key: 'fixture-key' }),
    fetchWithTimeout: async (url) => {
      calls.push(url);
      const success = mode === 'transient' && calls.length === 3;
      return { ok: true, status: 200, text: async () => success ? '{"ok":true}' : mode === 'authorization' ? '<html>Authorization needed</html>' : '<html>GLDN Ops Dashboard</html>' };
    },
    dashboardRequestTimeoutMs: () => 100, chrome: { runtime: { getManifest: () => ({ version: 'fixture' }) } }
  };
  vm.createContext(context); vm.runInContext(code, context);
  assert.equal((await context.postDashboardRequest('orderPlacementAuditRead')).ok, true);
  assert.equal(new Set(calls).size, 3);
  calls.length = 0; mode = 'authorization';
  await assert.rejects(context.postDashboardRequest('orderPlacementAuditRead'), /Google is blocking/);
  assert.equal(calls.length, 1);
  calls.length = 0; mode = 'write';
  await assert.rejects(context.postDashboardRequest('orderPlacementAuditAmazonBatch', { syncId: 'same-receipt' }), (error) => error.outcomeUnknown === true);
  assert.equal(calls.length, 1);
});

test('Amazon completion batches keep a stable receipt when finishing a saved checkpoint', async () => {
  const stored = { orderPlacementAuditAmazonScan: {
    ...selection, runId: 'fixture-run', supplierProfile: 'M7', active: true, phase: 'capture-amazon-details', workerTabId: 42,
    candidates: [{ orderId: '112-1000000-1000000' }], candidateIndex: 0, purchases: []
  } };
  const h = workerHarness(stored);
  const calls = [];
  await h.api.handleAmazonDetail({ orderId: '112-1000000-1000000', purchases: [] }, { tab: { id: 42 } }, {
    postToDashboard: async (action, record) => { calls.push({ action, record }); return { ok: true }; }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].record.syncId, 'fixture-run:M0|CLICKNCARRY|2026-10:M7:amazon-batch:0');
  assert.equal(calls[0].record.profileCompleted, true);
  assert.equal(stored.orderPlacementAuditAmazonScan.phase, 'review');
});

test('dashboard requests use fresh non-cached redirect URLs without changing write receipt identity', async () => {
  const source = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
  const code = source.slice(source.indexOf('async function postDashboardRequest('), source.indexOf('async function postToDashboard('));
  const calls = [];
  const context = {
    URL, getDashboardConfig: async () => ({ url: 'https://script.google.com/fixture/exec?existing=kept', key: 'fixture-key' }),
    fetchWithTimeout: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, text: async () => '{"ok":true}' }; },
    dashboardRequestTimeoutMs: () => 100, chrome: { runtime: { getManifest: () => ({ version: 'fixture' }) } }
  };
  vm.createContext(context); vm.runInContext(code, context);
  for (let index = 0; index < 2; index++) await context.postDashboardRequest('orderPlacementAuditAmazonBatch', { syncId: 'same-write-receipt', records: [] });
  assert.notEqual(calls[0].url, calls[1].url);
  for (const call of calls) {
    const url = new URL(call.url);
    assert.equal(url.searchParams.get('existing'), 'kept');
    assert.ok(url.searchParams.get('_gldnRequest'));
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.method, 'POST');
    const body = JSON.parse(call.options.body);
    assert.equal(body.syncId, 'same-write-receipt');
    assert.equal(body.record.syncId, 'same-write-receipt');
    assert.equal(body.key, 'fixture-key');
  }
});

test('local control starts in Amazon-only profiles using requested or mapped scope, not an old eBay run', async () => {
  const source = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
  const code = source.slice(source.indexOf("if (action === 'start-order-placement-audit-amazon')"), source.indexOf("if (action === 'resume-order-placement-audit-amazon')"));
  let options;
  const context = {
    storageGet: async () => ({ computerLabel: 'M0', amazonProfileLabel: 'M7', ebayMonthlyProfit: { ...monthly, computerLabel: '2' } }),
    FOUNDATION: { computerAccounts: { M0: { ebayAccountLabel: 'CLICKNCARRY' } } }, postToDashboard() {},
    ORDER_AUDIT_BACKGROUND: { startAmazonScan: async (value) => { options = value; return { ok: true }; } }
  };
  vm.createContext(context); vm.runInContext(`async function run(action, payload) { ${code} }`, context);
  await context.run('start-order-placement-audit-amazon', { monthKey: '2026-10' });
  assert.equal(options.computerLabel, 'M0'); assert.equal(options.accountLabel, 'CLICKNCARRY'); assert.equal(options.supplierProfile, 'M7');
});
