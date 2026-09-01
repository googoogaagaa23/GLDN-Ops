'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const extensionRoot = path.join(projectRoot, 'product-hunter-extension');
const listingPreflight = require(path.join(projectRoot, 'extension', 'listing-preflight-core.js'));
const shippedRulePack = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'policy-rules.json'), 'utf8'));
const shippedSeedProfile = {
  approvedSeeds: shippedRulePack.clearancePolicy.readyPhrases,
  profileVersion: shippedRulePack.clearancePolicy.version
};

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
      getManifest: () => ({ version: '0.3.0' }),
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
    btoa: globalThis.btoa,
    TextEncoder,
    TextDecoder,
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
    keywords: 'cabinet shelf liner',
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

test('background accepts an arbitrary operator keyword and opens one inactive Amazon worker', async () => {
  const harness = createHarness();
  const response = await harness.message({
    type: 'hunterStart',
    keywords: 'phone case',
    settings: { desiredReady: 1, maxPagesPerKeyword: 1, excludeAlreadyListed: false }
  });
  assert.equal(response.ok, true);
  assert.deepEqual(response.job.keywords, ['phone case']);
  assert.equal(harness.calls.created.length, 1);
  assert.equal(harness.calls.created[0].active, false);
});

test('background accepts ordinary search words under the shipped keyword policy profile', async () => {
  const harness = createHarness();
  const response = await harness.message({
    type: 'hunterStart',
    keywords: 'stackable storage bins',
    settings: { desiredReady: 1, maxPagesPerKeyword: 1, excludeAlreadyListed: false }
  });
  assert.equal(response.ok, true);
  assert.equal(response.job.keywords[0], 'stackable storage bins');
  assert.equal(response.job.riskProfileVersion, response.riskProfile.profileVersion);
  assert.match(response.riskProfile.profileVersion, /^\d{4}-\d{2}-\d{2}\./);
  assert.equal(harness.calls.created.length, 1);
});

test('background cannot resume a hunt saved under an old risk profile', async () => {
  const harness = createHarness();
  const job = harness.context.GLDN_PRODUCT_HUNTER_CORE.createJob({
    keywords: 'cabinet shelf liner',
    settings: { excludeAlreadyListed: false },
    seedProfile: shippedSeedProfile
  });
  job.status = 'paused';
  job.riskProfileVersion = '2026-01-01.1';
  await harness.context.saveJob(job);
  const response = await harness.message({ type: 'hunterResume' });
  assert.equal(response.ok, false);
  assert.match(response.error, /cannot resume.*current profile/i);
  assert.equal(harness.calls.created.length, 0);
});

test('background completes a search-to-detail run and preserves decision counts', async () => {
  const harness = createHarness();
  await harness.message({ type: 'hunterStart', keywords: 'cabinet shelf liner', settings: { desiredReady: 1, maxPagesPerKeyword: 1, excludeAlreadyListed: false } });
  const job = await harness.context.getJob();
  harness.setWorkerResponse({
    ok: true, keyword: 'cabinet shelf liner', searchPage: 1, hasNextPage: false, noResults: false,
    products: [
      { asin: 'B012345678', url: 'https://www.amazon.com/dp/B012345678', title: 'Cabinet Shelf Liner', keyword: 'cabinet shelf liner', price: '$24.99', sponsored: false },
      { asin: 'B087654321', url: 'https://www.amazon.com/dp/B087654321', title: 'Cabinet Shelf Liner', keyword: 'cabinet shelf liner', price: '$18.99', sponsored: true }
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
      asin: 'B012345678', url: 'https://www.amazon.com/dp/B012345678', title: 'Cabinet Shelf Liner',
      brand: 'Generic', manufacturer: 'Generic', categories: ['Home & Kitchen', 'Shelf Liners'], bullets: [],
      details: 'Cabinet shelf liner', availability: 'In Stock', price: '$24.99',
      rating: '4.6 out of 5 stars', reviewCount: '1,234 ratings',
      soldBy: 'Example Seller', shipsFrom: 'Amazon.com',
      imageUrls: ['https://m.media-amazon.com/images/I/plain-shelf-liner.jpg'],
      imageText: 'Plain shelf liner on white background',
      capturedAt: new Date().toISOString()
    }
  });
  await harness.context.processLoadedPage(current.workerTabId);
  current = await harness.context.getJob();
  assert.equal(current.counts.ready, 1);
  assert.equal(current.counts.queued, 0);
  await harness.context.advanceJob(current);
  current = await harness.context.getJob();
  assert.equal(current.status, 'complete');
  assert.match(current.completionReason, /Preflight-candidate target reached/);

  const payload = await harness.message({ type: 'hunterReadyPayload' });
  assert.equal(payload.ok, true, payload.error || 'Evidence-bundle handoff failed.');
  assert.equal(payload.bundles.length, 1);
  assert.match(payload.bundles[0], /^GLDNPH1\.[A-Za-z0-9_-]+\.[a-f0-9]{16}$/i);
  const parsed = listingPreflight.parseProductHunterEvidenceBundle(payload.bundles[0]);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.payload.asin, 'B012345678');
  assert.equal(parsed.payload.policyVersion, shippedRulePack.clearancePolicy.version);
  assert.deepEqual(parsed.payload.imageUrls, ['https://m.media-amazon.com/images/I/plain-shelf-liner.jpg']);
  assert.deepEqual(Array.from(payload.asins || []), ['B012345678']);
  assert.equal(payload.links, undefined, 'Product Hunter must hand off evidence bundles, not direct listing links.');
  assert.equal(payload.products, undefined, 'Product Hunter must not expose a direct product-link handoff payload.');
});

test('background retries the same Amazon page instead of skipping a failed candidate', async () => {
  const harness = createHarness();
  await harness.message({ type: 'hunterStart', keywords: 'cabinet shelf liner', settings: { desiredReady: 1, maxPagesPerKeyword: 1, excludeAlreadyListed: false } });
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
  await harness.message({ type: 'hunterStart', keywords: 'cabinet shelf liner', settings: { desiredReady: 1, excludeAlreadyListed: false } });
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
    keywords: 'cabinet shelf liner',
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
    keywords: 'cabinet shelf liner',
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
