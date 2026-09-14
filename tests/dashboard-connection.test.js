const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
const start = source.indexOf('let dashboardConnectionBusy = false;');
const end = source.indexOf("document.getElementById('openDashboard').addEventListener", start);
assert.ok(start >= 0 && end > start);
const connectionCode = source.slice(start, end);
const setupCode = 'fixture-only-dashboard-code-12345';

function harness({ testResult = { ok: true }, saveError, testError, url = 'https://script.google.com/macros/s/fixture/exec' } = {}) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', hidden: true, disabled: false, textContent: '', attrs: {}, handlers: {},
      focus() { this.focused = true; },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(k, v) { this.handlers[k] = v; }
    });
    return nodes.get(id);
  };
  const writes = [], requests = [], messages = [];
  const context = {
    document: { getElementById: node }, GLDN_CONFIG: { dashboardUrl: url },
    dashboardAutoSetupElement: node('dashboardAutoSetup'),
    storageSet: async (value) => { if (saveError) throw saveError; writes.push(value); },
    runtimeMessage: async (request) => {
      requests.push(request);
      if (testError) throw testError;
      return typeof testResult === 'function' ? testResult() : testResult;
    },
    refresh() {}, setMessage: (message) => messages.push(message)
  };
  vm.createContext(context);
  vm.runInContext(connectionCode, context);
  return { node, context, writes, requests, messages };
}

test('Connect opens a focused pasteable field without U or browser prompt; cancel preserves setup', () => {
  const h = harness();
  h.node('repairDashboardSetup').handlers.click();
  assert.equal(h.node('dashboardConnectionFields').hidden, false);
  assert.equal(h.node('dashboardConnectionCode').focused, true);
  assert.equal(h.node('repairDashboardSetup').attrs['aria-expanded'], 'true');
  h.node('dashboardConnectionCode').value = setupCode;
  h.node('cancelDashboardConnection').handlers.click();
  assert.equal(h.node('dashboardConnectionFields').hidden, true);
  assert.equal(h.node('dashboardConnectionCode').value, '');
  assert.equal(h.writes.length, 0);
});

test('blank, short and placeholder codes do not replace saved setup or test a connection', async () => {
  for (const value of ['', 'short', 'YOUR_PRIVATE_DASHBOARD_SETUP_CODE']) {
    const h = harness();
    h.node('dashboardConnectionCode').value = value;
    await h.node('saveDashboardConnection').handlers.click();
    assert.equal(h.writes.length, 0);
    assert.equal(h.requests.length, 0);
    assert.match(h.node('dashboardConnectionStatus').textContent, /complete dashboard setup code/);
  }
});

test('a pasted code is trimmed, saved only to dashboard settings, tested and removed from the field', async () => {
  const h = harness();
  h.node('dashboardConnectionCode').value = '  ' + setupCode + '\n';
  await h.node('saveDashboardConnection').handlers.click();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(Object.keys(h.writes[0]).sort(), ['sellerDashboardKey', 'sellerDashboardUrl']);
  assert.equal(h.writes[0].sellerDashboardKey, setupCode);
  assert.equal(h.requests[0].type, 'testDashboard');
  assert.equal(h.node('dashboardConnectionCode').value, '');
  assert.equal(h.node('dashboardConnectionFields').hidden, true);
  assert.match(h.node('dashboardConnectionStatus').textContent, /connected securely/);
});

test('save errors remain visible and never claim a successful connection or log the code', async () => {
  const h = harness({ saveError: new Error('Storage failed for ' + setupCode) });
  h.node('dashboardConnectionCode').value = setupCode;
  await h.node('saveDashboardConnection').handlers.click();
  assert.equal(h.requests.length, 0);
  assert.match(h.node('dashboardConnectionStatus').textContent, /not saved/);
  assert.ok(!h.messages.join(' ').includes(setupCode));
  assert.equal(h.node('saveDashboardConnection').disabled, false);
});

test('rejected and timed-out connection tests distinguish saved code from verified connection', async () => {
  for (const options of [{ testResult: { ok: false, error: 'Rejected' } }, { testError: new Error('Timed out') }]) {
    const h = harness(options);
    h.node('dashboardConnectionCode').value = setupCode;
    await h.node('saveDashboardConnection').handlers.click();
    assert.equal(h.writes.length, 1);
    assert.equal(h.node('dashboardConnectionCode').value, '');
    assert.match(h.node('dashboardConnectionStatus').textContent, /Code saved.*connection test failed/);
    assert.equal(h.node('saveDashboardConnection').disabled, false);
  }
});

test('double clicks during testing cannot create duplicate writes', async () => {
  let finish;
  const h = harness({ testResult: () => new Promise((resolve) => { finish = resolve; }) });
  h.node('dashboardConnectionCode').value = setupCode;
  const first = h.node('saveDashboardConnection').handlers.click();
  await Promise.resolve();
  assert.equal(h.node('saveDashboardConnection').disabled, true);
  await h.node('saveDashboardConnection').handlers.click();
  assert.equal(h.writes.length, 1);
  finish({ ok: true });
  await first;
  assert.equal(h.node('saveDashboardConnection').disabled, false);
});

test('missing configured dashboard URL leaves saved profile settings untouched', async () => {
  const h = harness({ url: '' });
  h.node('dashboardConnectionCode').value = setupCode;
  await h.node('saveDashboardConnection').handlers.click();
  assert.equal(h.writes.length, 0);
  assert.match(h.node('dashboardConnectionStatus').textContent, /URL is missing/);
});

test('Enter saves the typed code and Escape clears an unsaved entry', async () => {
  const h = harness();
  h.node('repairDashboardSetup').handlers.click();
  h.node('dashboardConnectionCode').value = setupCode;
  let prevented = false;
  await h.node('dashboardConnectionCode').handlers.keydown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.writes.length, 1);
  h.node('repairDashboardSetup').handlers.click();
  h.node('dashboardConnectionCode').value = 'unsaved';
  h.node('dashboardConnectionCode').handlers.keydown({ key: 'Escape' });
  assert.equal(h.node('dashboardConnectionCode').value, '');
  assert.equal(h.node('dashboardConnectionFields').hidden, true);
});
