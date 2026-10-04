const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../extension/companion-setup-core.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const key = 'gldnCompanionSetupSession';
const clone = value => JSON.parse(JSON.stringify(value));
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
const item = () => ({ id: 42, url: 'https://storage.googleapis.com/ecomsniper-cb046.appspot.com/software/eBayLister.zip?temporary=not-saved', referrer: 'https://ecomsniper.io/', startTime: new Date().toISOString() });

function harness(initial = {}) {
  const store = { [key]: clone(initial) };
  const calls = [];
  const tabs = new Map();
  const downloads = new Map();
  let permission = true;
  let pageResult = { status: 'ready', version: '45.7' };
  let failDownloadClick = false;
  const chrome = {
    runtime: { id: 'test-extension', getURL: file => 'chrome-extension://test-extension/' + file, onMessage: event() },
    storage: { session: {
      get: async () => clone(store),
      set: async value => Object.assign(store, clone(value))
    } },
    permissions: { contains: async () => permission, onAdded: event() },
    tabs: {
      create: async options => { const tab = { id: tabs.size + 1, status: 'complete', ...options }; tabs.set(tab.id, tab); calls.push(['tab', options.url]); return tab; },
      get: async id => { if (!tabs.has(id)) throw new Error('Closed tab'); return tabs.get(id); }
    },
    scripting: { executeScript: async options => {
      if (options.files) return [];
      const [service, action, credentials] = options.args;
      calls.push(['script', service, action, clone(credentials)]);
      if (action === 'download') {
        if (failDownloadClick) throw new Error('Navigation detached script');
        return [{ result: { status: 'download-clicked', version: '45.7' } }];
      }
      return [{ result: clone(action === 'login' ? { status: 'login-submitted' } : pageResult) }];
    } },
    downloads: {
      onDeterminingFilename: event(), onChanged: event(),
      search: async query => downloads.has(query.id) ? [downloads.get(query.id)] : [],
      show: async id => calls.push(['show', id])
    }
  };
  vm.runInNewContext(read('extension/companion-setup-background.js'), { chrome, GLDN_COMPANION_SETUP: core, Date, URL, setTimeout });
  const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('companion-setup.html'), frameId: 0 };
  const send = (action, service = 'ecomsniper', extra = {}, source = sender) => new Promise(resolve => {
    const handled = chrome.runtime.onMessage.listeners[0]({ type: 'gldnCompanionSetup', action, service, ...extra }, source, resolve);
    if (!handled) resolve({ ignored: true });
  });
  const route = data => new Promise(resolve => chrome.downloads.onDeterminingFilename.listeners[0](data, resolve));
  const change = async delta => {
    chrome.downloads.onChanged.listeners[0](delta);
    // Drain the same event queue without peeking at service-worker internals.
    await route({ id: -1, url: 'https://unrelated.invalid/file.zip' });
  };
  return { chrome, calls, tabs, downloads, store, send, route, change,
    state: () => clone(store[key]),
    permission: value => { permission = value; },
    result: value => { pageResult = value; },
    failDownload: () => { failDownloadClick = true; }
  };
}

test('versioned download folders are bounded and cannot escape Downloads', () => {
  assert.equal(core.versionFromText('Current Version: 45.7'), '45.7');
  assert.equal(core.downloadPath('45.7'), 'GLDN-Companions/eComSniper-45.7/Ebay-Lister-45.7.zip');
  for (const text of ['', 'Version 45.7', 'Current Version: 45.7 Current Version: 46.1']) assert.throws(() => core.versionFromText(text));
  for (const version of ['../45.7', '/45.7', 'C:\\45.7', '45.7/bad', 'latest']) assert.throws(() => core.downloadPath(version));
});

test('download routing is limited to the chosen provider and short user-started window', () => {
  const now = Date.now();
  const pending = { status: 'awaiting-download', startedAt: now - 100, expiresAt: now + 1000, downloadId: null };
  assert.equal(core.mayRouteDownload(item(), pending, now), true);
  assert.equal(core.mayRouteDownload({ ...item(), byExtensionId: 'ours' }, pending, now, 'ours'), true);
  for (const altered of [
    { url: 'https://storage.googleapis.com/other/file.zip' },
    { url: 'https://storage.googleapis.com.attacker.invalid/ecomsniper-cb046.appspot.com/software/eBayLister.zip' },
    { referrer: 'https://other.invalid/' }, { referrer: 'malformed' },
    { byExtensionId: 'different-extension' }, { startTime: 'invalid' }, { startTime: new Date(now - 1000).toISOString() }
  ]) assert.equal(core.mayRouteDownload({ ...item(), ...altered }, pending, now), false);
  assert.equal(core.mayRouteDownload(item(), { ...pending, expiresAt: now }, now), false);
  assert.equal(core.mayRouteDownload(item(), { ...pending, downloadId: 3 }, now), false);
  assert.equal(core.mayRouteDownload(item(), null, now), false);
  assert.equal(core.allowedPage('https://ecomsniper.io.attacker.invalid/', 'ecomsniper'), false);
  assert.equal(core.allowedPage('https://app.trackerbot.me/', 'trackerbot'), true);
});

test('loading setup and opening the store do not start login or downloads', async () => {
  const h = harness();
  assert.equal((await h.send('status')).ok, true);
  assert.deepEqual(h.calls, []);
  await h.send('store', 'trackerbot');
  assert.deepEqual(h.calls, [['tab', core.urls.trackerbotStore]]);
  assert.equal(h.state().trackerbot.storeOpened, true);
  assert.equal(h.state().trackerbot.status, undefined);
});

test('setup messages from websites or other extension pages are rejected', async () => {
  const h = harness();
  for (const source of [
    { id: 'other', url: h.chrome.runtime.getURL('companion-setup.html') },
    { id: h.chrome.runtime.id, url: 'https://ecomsniper.io/' },
    { id: h.chrome.runtime.id, url: h.chrome.runtime.getURL('popup.html') },
    { id: h.chrome.runtime.id, url: h.chrome.runtime.getURL('companion-setup.html'), frameId: 1 }
  ]) assert.equal((await h.send('open', 'ecomsniper', {}, source)).ok, false);
  assert.equal(h.calls.length, 0);
});

test('declined optional permission leaves the provider untouched', async () => {
  const h = harness();
  h.permission(false);
  assert.equal((await h.send('open')).ok, false);
  assert.equal(h.calls.length, 0);
});

test('login is explicit and credentials never enter session state', async () => {
  const h = harness();
  h.result({ status: 'login-required' });
  await h.send('open');
  await h.send('continue');
  assert.equal(h.state().ecomsniper.status, 'login-required');
  assert.equal(h.calls.some(call => call[2] === 'login'), false);
  const response = await h.send('login', 'ecomsniper', { email: 'fixture@example.invalid', password: 'fixture-only' });
  assert.equal(response.submitted, true);
  assert.doesNotMatch(JSON.stringify(h.state()), /fixture-only|fixture@example/);
  h.tabs.get(1).url = 'https://other.invalid/';
  const count = h.calls.length;
  assert.equal((await h.send('login', 'ecomsniper', { password: 'fixture-only' })).ok, false);
  assert.equal(h.calls.length, count);
});

test('clicking a download is not completion; only the matching completed Chrome item is', async () => {
  const h = harness();
  await h.send('open');
  await h.send('continue');
  assert.equal(h.state().ecomsniper.status, 'awaiting-download');
  await h.send('continue');
  assert.equal(h.calls.filter(call => call[2] === 'download').length, 1);
  assert.equal(await h.route({ ...item(), url: 'https://example.invalid/unrelated.zip' }), undefined);
  const suggestion = await h.route(item());
  assert.equal(suggestion.filename, core.downloadPath('45.7'));
  assert.equal(h.state().ecomsniper.status, 'downloading');
  assert.doesNotMatch(JSON.stringify(h.state()), /temporary=not-saved/);
  h.downloads.set(42, { id: 42, state: 'complete', exists: true, filename: 'Downloads/' + core.downloadPath('45.7') });
  await h.change({ id: 99, state: { current: 'complete' } });
  assert.equal(h.state().ecomsniper.status, 'downloading');
  await h.change({ id: 42, state: { current: 'complete' } });
  assert.equal(h.state().ecomsniper.status, 'complete');
  await h.send('show');
  assert.deepEqual(h.calls.at(-1), ['show', 42]);
});

test('blocked, missing, or interrupted downloads are never marked complete', async () => {
  const h = harness();
  await h.send('open');
  h.failDownload();
  await h.send('continue');
  assert.equal(h.state().ecomsniper.status, 'awaiting-download');
  h.store[key].ecomsniper.expiresAt = Date.now() - 1;
  await h.send('status');
  assert.equal(h.state().ecomsniper.status, 'download-unconfirmed');
  await h.send('open');
  assert.equal(h.state().ecomsniper.filename, '');
  await h.send('continue');
  await h.route(item());
  await h.change({ id: 42, error: { current: 'FILE_BLOCKED' } });
  assert.equal(h.state().ecomsniper.status, 'download-interrupted');
});

test('status recovers a finished download after a worker restart', async () => {
  const h = harness({ ecomsniper: { status: 'downloading', downloadId: 42 } });
  h.downloads.set(42, { state: 'complete', exists: true, filename: 'Downloads/verified.zip' });
  await h.send('status');
  assert.equal(h.state().ecomsniper.status, 'complete');
  h.chrome.permissions.onAdded.listeners[0]();
  assert.equal(h.chrome.downloads.onDeterminingFilename.listeners.length, 1);
  const missing = harness({ ecomsniper: { status: 'downloading', downloadId: 42 } });
  missing.downloads.set(42, { state: 'complete', exists: false });
  await missing.send('status');
  assert.equal(missing.state().ecomsniper.status, 'download-interrupted');
  await missing.send('open');
  assert.equal(missing.state().ecomsniper.status, 'opened');
});

test('parallel providers preserve each other in session state', async () => {
  const h = harness();
  await Promise.all([h.send('open'), h.send('store', 'trackerbot')]);
  assert.equal(h.state().ecomsniper.tabId, 1);
  assert.equal(h.state().trackerbot.storeOpened, true);
});

test('fresh installs offer setup, but updates and restarts do not', () => {
  const source = read('extension/background.js');
  const start = source.indexOf('chrome.runtime.onInstalled.addListener');
  const end = source.indexOf('chrome.runtime.onStartup.addListener', start);
  const calls = [];
  let listener;
  const context = {
    chrome: { runtime: { onInstalled: { addListener: fn => { listener = fn; } }, getURL: file => file }, tabs: { create: async options => { calls.push(options.url); } } },
    recordExtensionLog: () => {}
  };
  // Unrelated migration and scheduling work is stubbed; the real install callback is executed.
  for (const name of ['seedAutomaticDashboardSetup', 'clearIncompatibleMove99State', 'clearIncompatibleWorkflowState',
    'clearRemovedBulkAutomationState', 'pauseIncompatibleProfitBackfill', 'pauseIncompatibleEbayProfit',
    'migrateFoundationSettings', 'scheduleDashboardRetry', 'scheduleUpdaterCheck']) {
    context[name] = () => Promise.resolve();
  }
  vm.runInNewContext(source.slice(start, end), context);
  listener({ reason: 'update' });
  listener({ reason: 'chrome_update' });
  assert.deepEqual(calls, []);
  listener({ reason: 'install' });
  assert.deepEqual(calls, ['companion-setup.html']);
});

function providerPage({ service = 'ecomsniper', login = false, challenge = false, text = 'Current Version: 45.7', buttons: suppliedButtons } = {}) {
  let clicks = 0;
  class Input {
    constructor() { this.content = ''; this.events = []; }
    get value() { return this.content; }
    set value(value) { this.content = value; }
    getClientRects() { return [1]; }
    dispatchEvent(event) { this.events.push(event.type); }
  }
  const email = new Input();
  const password = new Input();
  const button = { innerText: login ? 'Log in' : 'Download Ebay Lister', id: login && service === 'trackerbot' ? 'loginBtn' : '', getClientRects: () => [1], click: () => { clicks++; } };
  const buttons = suppliedButtons || [button];
  const context = {
    location: { origin: service === 'trackerbot' ? 'https://app.trackerbot.me' : 'https://ecomsniper.io', pathname: '/dashboard/software_downloads' },
    getComputedStyle: () => ({ visibility: 'visible' }), HTMLInputElement: Input,
    Event: class { constructor(type) { this.type = type; } },
    document: { title: 'Fixture provider', body: { innerText: text }, querySelectorAll: selector => {
      if (selector.startsWith('button')) return buttons;
      if (selector === 'input[type="password"]') return login ? [password] : [];
      if (selector.startsWith('input[type="email"]')) return login ? [email] : [];
      if (selector.startsWith('iframe')) return challenge ? [{ getClientRects: () => [1] }] : [];
      return [];
    } }
  };
  vm.runInNewContext(read('extension/companion-setup-page.js'), context);
  return { context, email, password, clicks: () => clicks, run: (action, credentials, version) => context.gldnCompanionPage(service, action, credentials, version) };
}

test('provider inspection never clicks or fills a login form', async () => {
  const page = providerPage({ login: true });
  assert.equal((await page.run('inspect')).status, 'login-required');
  assert.equal(page.clicks(), 0);
  assert.equal(page.email.value, '');
  await page.run('login', { email: 'fixture@example.invalid', password: 'fixture-only' });
  assert.equal(page.clicks(), 1);
  assert.deepEqual(page.email.events, ['input', 'change']);
});

test('verification, ambiguous version, and changed version stop native download clicks', async () => {
  const challenge = providerPage({ login: true, challenge: true });
  assert.equal((await challenge.run('login', { email: 'fixture@example.invalid', password: 'fixture-only' })).status, 'verification-required');
  assert.equal(challenge.clicks(), 0);
  const ambiguous = providerPage({ text: 'Current Version: 45.7 Current Version: 46.1' });
  assert.equal((await ambiguous.run('inspect')).status, 'check-page');
  const page = providerPage();
  assert.equal((await page.run('inspect')).version, '45.7');
  await assert.rejects(page.run('download', null, '45.6'));
  assert.equal(page.clicks(), 0);
  await page.run('download', null, '45.7');
  assert.equal(page.clicks(), 1);
  page.context.location.origin = 'https://unrelated.invalid';
  await assert.rejects(page.run('inspect'));
});

test('Trackerbot website inspection never asserts extension installation or authentication', async () => {
  const page = providerPage({ service: 'trackerbot' });
  assert.equal((await page.run('inspect')).status, 'website-open');
  assert.equal(page.clicks(), 0);
});

test('manifest and UI keep downloads optional, passwords transient, and the tour reachable', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.ok(manifest.optional_permissions.includes('downloads'));
  assert.ok(!manifest.permissions.includes('downloads'));
  assert.ok(!manifest.permissions.includes('management'));
  const html = read('extension/companion-setup.html');
  assert.match(html, /Skip for now/);
  assert.match(html, /href="onboarding.html"/);
  assert.doesNotMatch(html, /type="password"[^>]*value=/);
  for (const file of ['companion-setup.js', 'companion-setup-background.js', 'companion-setup-page.js']) {
    assert.doesNotMatch(read('extension/' + file), /storage\.(?:local|sync)|chrome\.management|webstore\.install/);
  }
});
