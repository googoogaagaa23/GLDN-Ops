'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const extensionRoot = path.join(projectRoot, 'product-hunter-extension');

function event() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
    emit(...args) { for (const listener of listeners) listener(...args); }
  };
}

function createHarness() {
  const storage = {};
  const tabs = new Map();
  const calls = { created: [], updated: [], removed: [], reloaded: [], alarms: [] };
  const events = {
    message: event(), installed: event(), startup: event(), tabUpdated: event(), tabRemoved: event(), alarm: event()
  };
  let nextTabId = 20;
  let workerResponse = null;
  let workerError = null;
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  function storageGet(keys) {
    if (keys === null) return clone(storage);
    const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
    const result = {};
    for (const name of names) {
      if (Object.hasOwn(storage, name)) result[name] = clone(storage[name]);
      else if (keys && !Array.isArray(keys) && typeof keys === 'object' && Object.hasOwn(keys, name)) result[name] = clone(keys[name]);
    }
    return result;
  }

  const chrome = {
    runtime: {
      getManifest: () => ({ version: '0.2.0' }),
      getURL: (relative) => `chrome-extension://hunter/${relative}`,
      onMessage: events.message,
      onInstalled: events.installed,
      onStartup: events.startup
    },
    storage: {
      local: {
        get: async (keys) => storageGet(keys),
        set: async (values) => { Object.assign(storage, clone(values)); },
        remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; }
      }
    },
    tabs: {
      onUpdated: events.tabUpdated,
      onRemoved: events.tabRemoved,
      create: async (properties) => {
        const tab = { id: nextTabId++, windowId: properties.windowId || 2, url: properties.url, active: properties.active, status: 'complete' };
        tabs.set(tab.id, tab);
        calls.created.push(clone(properties));
        return clone(tab);
      },
      update: async (id, properties) => {
        const tab = tabs.get(id);
        if (!tab) throw new Error('No tab');
        Object.assign(tab, properties, { status: 'complete' });
        calls.updated.push({ id, properties: clone(properties) });
        return clone(tab);
      },
      get: async (id) => {
        if (!tabs.has(id)) throw new Error('No tab');
        return clone(tabs.get(id));
      },
      remove: async (id) => {
        tabs.delete(id);
        calls.removed.push(id);
      },
      reload: async (id) => {
        if (!tabs.has(id)) throw new Error('No tab');
        calls.reloaded.push(id);
      },
      query: async () => [...tabs.values()].map(clone),
      sendMessage: async () => {
        if (workerError) throw workerError;
        return clone(workerResponse);
      }
    },
    alarms: {
      onAlarm: events.alarm,
      create: async (name, options) => { calls.alarms.push({ name, options: clone(options) }); },
      clear: async () => true
    },
    windows: { update: async () => ({}) }
  };

  const scheduled = [];
  const context = vm.createContext({
    chrome,
    URL,
    Date,
    Math,
    Object,
    Array,
    Set,
    Map,
    Promise,
    RegExp,
    String,
    Number,
    Boolean,
    JSON,
    console,
    atob: globalThis.atob,
    setTimeout(callback) { scheduled.push(callback); return scheduled.length; },
    clearTimeout() {},
    fetch: async () => ({
      ok: true,
      json: async () => JSON.parse(fs.readFileSync(path.join(extensionRoot, 'policy-rules.json'), 'utf8'))
    })
  });
  context.globalThis = context;
  context.importScripts = (...files) => {
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(extensionRoot, file), 'utf8'), context, { filename: file });
  };
  vm.runInContext(fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8'), context, { filename: 'background.js' });

  async function message(payload) {
    const listener = events.message.listeners[0];
    return new Promise((resolve) => listener(payload, { tab: { windowId: 2 } }, resolve));
  }

  return {
    context, storage, tabs, calls, events, scheduled, message,
    setWorkerResponse(value) { workerResponse = value; workerError = null; },
    setWorkerError(value) { workerError = value; }
  };
}

test('background creates one inactive Amazon worker and persists a resumable hunt', async () => {
  const harness = createHarness();
  const response = await harness.message({
    type: 'hunterStart',
    keywords: 'mixing bowls',
    settings: { desiredReady: 1, maxPagesPerKeyword: 1, computerLabel: '0', excludeAlreadyListed: false }
  });
  assert.equal(response.ok, true);
  assert.equal(response.job.status, 'running');
  assert.equal(response.job.pendingNavigation.kind, 'search');
  assert.equal(harness.calls.created.length, 1);
  assert.equal(harness.calls.created[0].active, false);
  assert.equal(harness.calls.updated[0].properties.active, false);
  assert.match(harness.calls.updated[0].properties.url, /^https:\/\/www\.amazon\.com\/s\?/);
});

test('background completes a search-to-detail run and preserves decision counts', async () => {
  const harness = createHarness();
  await harness.message({ type: 'hunterStart', keywords: 'mixing bowls', settings: { desiredReady: 1, maxPagesPerKeyword: 1, excludeAlreadyListed: false } });
  const job = await harness.context.getJob();
  harness.setWorkerResponse({
    ok: true, keyword: 'mixing bowls', searchPage: 1, hasNextPage: false, noResults: false,
    products: [
      { asin: 'B012345678', url: 'https://www.amazon.com/dp/B012345678', title: 'Stainless Steel Mixing Bowl Set', price: '$24.99', sponsored: false },
      { asin: 'B087654321', url: 'https://www.amazon.com/dp/B087654321', title: 'Silicone Kitchen Organizer', price: '$18.99', sponsored: true }
    ]
  });
  await harness.context.processLoadedPage(job.workerTabId);
  let current = await harness.context.getJob();
  assert.equal(current.counts.queued, 1);
  assert.equal(current.counts.excluded, 1);
  await harness.context.advanceJob(current);
  current = await harness.context.getJob();
  assert.equal(current.pendingNavigation.kind, 'detail');

  harness.setWorkerResponse({
    ok: true,
    product: {
      asin: 'B012345678', url: 'https://www.amazon.com/dp/B012345678', title: 'Stainless Steel Mixing Bowl Set',
      brand: 'Kitchen Works', categories: ['Home & Kitchen'], bullets: ['Dishwasher safe bowls'],
      details: 'Six piece nesting bowl set with lids for food storage.', availability: 'In Stock', price: '$24.99',
      rating: '4.6 out of 5 stars', reviewCount: '1,234 ratings'
    }
  });
  await harness.context.processLoadedPage(current.workerTabId);
  current = await harness.context.getJob();
  assert.equal(current.counts.ready, 1);
  assert.equal(current.counts.queued, 0);
  await harness.context.advanceJob(current);
  current = await harness.context.getJob();
  assert.equal(current.status, 'complete');
  assert.match(current.completionReason, /Ready target reached/);
});

test('background retries the same Amazon page instead of skipping a failed candidate', async () => {
  const harness = createHarness();
  await harness.message({ type: 'hunterStart', keywords: 'solar lights', settings: { desiredReady: 1, maxPagesPerKeyword: 1, excludeAlreadyListed: false } });
  const before = await harness.context.getJob();
  const pendingUrl = before.pendingNavigation.url;
  await harness.context.retryPendingNavigation(before, 'No receiver in worker tab');
  const after = await harness.context.getJob();
  assert.equal(after.status, 'running');
  assert.equal(after.pendingNavigation.url, pendingUrl);
  assert.equal(after.pendingNavigation.handling, false);
  assert.equal(after.navigationFailures, 1);
  assert.deepEqual(harness.calls.reloaded, [before.workerTabId]);
});

test('unrelated completed tabs cannot replace the worker completion timer', async () => {
  const harness = createHarness();
  await harness.message({ type: 'hunterStart', keywords: 'desk organizer', settings: { desiredReady: 1, excludeAlreadyListed: false } });
  const job = await harness.context.getJob();
  harness.events.tabUpdated.emit(999, { status: 'complete' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.scheduled.length, 0);
  harness.events.tabUpdated.emit(job.workerTabId, { status: 'complete' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.scheduled.length, 1);
});

test('protected hunts require a verified Active Listings index for the selected computer', async () => {
  const harness = createHarness();
  const response = await harness.message({
    type: 'hunterStart',
    keywords: 'mixing bowls',
    settings: { desiredReady: 1, computerLabel: '0', excludeAlreadyListed: true }
  });
  assert.equal(response.ok, false);
  assert.match(response.error, /scan or import.*active listings/i);
  assert.equal(harness.calls.created.length, 0);
});

test('a verified index from another eBay computer cannot protect the hunt', async () => {
  const harness = createHarness();
  await harness.context.saveEbayIndex({
    schemaVersion: 1,
    verified: true,
    source: 'fixture',
    computerLabel: 'M0',
    accountLabel: 'click_carryllc',
    scannedAt: '2026-08-09T12:00:00.000Z',
    totalListings: 1,
    recordCount: 1,
    asinCount: 1,
    titleCount: 1,
    asins: { B012345678: [{ itemId: '123456789012', asin: 'B012345678' }] },
    titles: { 'stainless steel mixing bowl set': [{ itemId: '123456789012' }] }
  });
  const response = await harness.message({
    type: 'hunterStart',
    keywords: 'mixing bowls',
    settings: { desiredReady: 1, computerLabel: '0', excludeAlreadyListed: true }
  });
  assert.equal(response.ok, false);
  assert.match(response.error, /scan or import.*active listings/i);
  assert.equal(harness.calls.created.length, 0);
});

test('eBay scanner verifies the complete listing count before publishing its duplicate index', async () => {
  const harness = createHarness();
  let response = await harness.message({ type: 'hunterEbayScanStart', computerLabel: '0' });
  assert.equal(response.ok, true);
  assert.equal(response.ebayScan.status, 'running');
  assert.equal(harness.calls.created.length, 1);
  assert.equal(harness.calls.created[0].active, false);
  assert.match(harness.calls.created[0].url, /^https:\/\/www\.ebay\.com\/sh\/lst\/active/);

  let scan = await harness.context.getEbayScan();
  harness.setWorkerResponse({
    ok: true,
    start: 1,
    end: 2,
    total: 2,
    expected: 2,
    recordCount: 2,
    accountLabel: 'imjustratrend',
    records: [
      { itemId: '123456789012', title: 'Stainless Steel Mixing Bowl Set with Lids', sku: 'B012345678', price: 39.99 },
      { itemId: '123456789013', title: 'Solar Garden Lights Set', sku: 'QjA4NzY1NDMyMQ==', price: 24.99 }
    ]
  });
  await harness.context.processLoadedEbayPage(scan.workerTabId);
  assert.equal(harness.scheduled.length, 1);
  await harness.scheduled.shift()();

  scan = await harness.context.getEbayScan();
  assert.equal(scan.phase, 'verify-total');
  harness.setWorkerResponse({
    ok: true,
    start: 1,
    end: 2,
    total: 2,
    expected: 2,
    recordCount: 2,
    accountLabel: 'imjustratrend',
    records: []
  });
  await harness.context.processLoadedEbayPage(scan.workerTabId);

  const state = await harness.message({ type: 'hunterGetState' });
  assert.equal(state.ebayScan.status, 'complete');
  assert.equal(state.ebayIndex.verified, true);
  assert.equal(state.ebayIndex.recordCount, 2);
  assert.equal(state.ebayIndex.asinCount, 2);
  assert.equal(state.ebayIndex.computerLabel, '0');
  assert.equal(state.ebayIndex.accountLabel, 'imjustratrend');
});
