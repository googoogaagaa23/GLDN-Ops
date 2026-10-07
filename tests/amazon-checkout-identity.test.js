const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const amazon = fs.readFileSync(path.join(root, 'extension/amazon.js'), 'utf8');
const ebay = fs.readFileSync(path.join(root, 'extension/ebay.js'), 'utf8');
function block(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const checkoutUrl = id => `https://www.amazon.com/checkout/p/p-${id}/spc?pipelineType=Chewbacca`;
function cacheHelpers(extra = {}) {
  const sandbox = { URL, Date, ...extra };
  vm.runInNewContext(block(amazon, '  function amazonCheckoutIdentityKey(', '  function scopedTextLines('), sandbox);
  return sandbox;
}
function snapshot(id = '123', extra = {}) {
  const url = checkoutUrl(id);
  return { url, checkoutIdentityKey: cacheHelpers().amazonCheckoutIdentityKey(url), capturedAt: new Date().toISOString(),
    total: 19.87, etas: ['10/9'], titles: ['Fixture motor'], asins: ['B000000001'], shippingBlock: '', ...extra };
}

test('checkout identity ignores presentation parameters but requires a purchase ID and Amazon host', () => {
  const helper = cacheHelpers();
  assert.equal(helper.amazonCheckoutIdentityKey(checkoutUrl('123')), helper.amazonCheckoutIdentityKey(checkoutUrl('123') + '&hasWorkingJavascript=1'));
  assert.notEqual(helper.amazonCheckoutIdentityKey(checkoutUrl('123')), helper.amazonCheckoutIdentityKey(checkoutUrl('456')));
  for (const url of ['bad URL', 'https://www.amazon.com/checkout/spc', 'https://notamazon.com/checkout/p/p-123/spc']) {
    assert.equal(helper.amazonCheckoutIdentityKey(url), '');
  }
});

test('cached values are usable only for the same recent checkout with compatible known items', () => {
  const helper = cacheHelpers(), saved = snapshot();
  assert.equal(helper.compatibleAmazonCheckoutCache(snapshot(), saved), saved);
  assert.equal(Object.keys(helper.compatibleAmazonCheckoutCache(snapshot('456'), saved)).length, 0);
  assert.equal(Object.keys(helper.compatibleAmazonCheckoutCache(snapshot(), {...saved, checkoutIdentityKey: ''})).length, 0);
  assert.equal(Object.keys(helper.compatibleAmazonCheckoutCache(snapshot(), {...saved, capturedAt: '2020-01-01'})).length, 0);
  assert.equal(Object.keys(helper.compatibleAmazonCheckoutCache(snapshot(), {...saved, asins: ['B000000002']})).length, 0);
  assert.equal(Object.keys(helper.compatibleAmazonCheckoutCache(snapshot(), {...saved, capturedAt: 'invalid'})).length, 0);
});

test('checkout refresh never inherits old ASINs, titles or exact purchase proof', async () => {
  let saved;
  const live = snapshot('456', {titles: [], asins: []});
  const sandbox = cacheHelpers({ cachedSnapshot: null, isCheckoutPage: () => true, isConfirmationPage: () => false,
    extractCheckoutData: () => live, storageGet: async () => ({pendingAmazonCheckout: snapshot('123', {confirmed: true, exactOrderDetails: true, orderId: 'old-order'})}),
    storageSet: async value => { saved = value.pendingAmazonCheckout; }, sessionStorage: {setItem() {}},
    U: {formatMoney: value => String(value)}, renderPassiveStatus() {} });
  vm.runInNewContext(block(amazon, '  async function autoCacheCheckout(', '  async function setProfileLabel('), sandbox);
  await sandbox.autoCacheCheckout();
  assert.deepEqual([...saved.asins], []);
  assert.deepEqual([...saved.titles], []);
  assert.equal(saved.total, 19.87);
  assert.equal(saved.exactOrderDetails, false);
  assert.equal(saved.confirmed, false);
  assert.equal(saved.orderId, '');
});

test('unknown ASINs remain unknown even during the same checkout instead of reusing hidden old IDs', async () => {
  let saved;
  const sandbox = cacheHelpers({ cachedSnapshot: null, isCheckoutPage: () => true, isConfirmationPage: () => false,
    extractCheckoutData: () => snapshot('123', {asins: [], titles: []}), storageGet: async () => ({pendingAmazonCheckout: snapshot()}),
    storageSet: async value => { saved = value.pendingAmazonCheckout; }, sessionStorage: {setItem() {}},
    U: {formatMoney: String}, renderPassiveStatus() {} });
  vm.runInNewContext(block(amazon, '  async function autoCacheCheckout(', '  async function setProfileLabel('), sandbox);
  await sandbox.autoCacheCheckout();
  assert.deepEqual([...saved.asins], []);
  assert.deepEqual([...saved.titles], []);
});

test('confirmation can only use a checkout belonging to this tab, never another tab', async () => {
  let saved, marker = '';
  const sandbox = cacheHelpers({ cachedSnapshot: null, location: {href: 'https://www.amazon.com/gp/buy/thankyou'},
    isCheckoutPage: () => false, isConfirmationPage: () => true,
    extractCheckoutData: () => ({url: sandbox.location.href, capturedAt: new Date().toISOString(), total: null, etas: [], asins: [], titles: []}),
    storageGet: async () => ({pendingAmazonCheckout: snapshot()}), storageSet: async value => { saved = value.pendingAmazonCheckout; },
    sessionStorage: {getItem: () => marker}, U: {formatMoney: String}, renderPassiveStatus() {} });
  vm.runInNewContext(block(amazon, '  async function autoCacheCheckout(', '  async function setProfileLabel('), sandbox);
  await sandbox.autoCacheCheckout();
  assert.equal(saved.total, null);
  assert.deepEqual([...saved.asins], []);
  marker = checkoutUrl('123');
  await sandbox.autoCacheCheckout();
  assert.equal(saved.total, 19.87);
  assert.deepEqual([...saved.asins], ['B000000001']);
  assert.equal(saved.exactOrderDetails, false);
});

test('scoped checkout reader excludes recommendations, hidden rows and injected extension controls', () => {
  const node = (asin, {visible = true, injected = false, recommended = false} = {}) => ({
    visible, injected, getAttribute: () => asin, closest: () => recommended ? {} : null
  });
  const current = node('B000000001'), recommendation = node('B000000002', {recommended: true}), hidden = node('B000000003', {visible: false}), injected = node('B000000004', {injected: true});
  const rootNode = { visible: true, matches: () => false, querySelectorAll: selector => selector === '[data-asin]' ? [current, recommendation, hidden, injected] : [] };
  const sandbox = {document: {querySelectorAll: () => [rootNode]}, U: {isVisible: node => node.visible},
    isCheckoutPage: () => true, isInjectedToolUiNode: node => node.injected, directText: () => ''};
  vm.runInNewContext(block(amazon, '  function amazonCheckoutItemRoots(', '  function amazonCheckoutIdentityKey('), sandbox);
  assert.deepEqual([...sandbox.extractAmazonAsins()], ['B000000001']);
  sandbox.isCheckoutPage = () => false;
  assert.deepEqual([...sandbox.extractAmazonAsins()], []);
});

test('review refuses navigation or item changes before copying a fresh payload', () => {
  const preview = block(amazon, '  function showAmazonPreview(', '  async function copyAmazonInfo(');
  assert.match(preview, /orderEvidence\.url !== location\.href/);
  assert.match(preview, /JSON\.stringify\(currentAsins\) !== JSON\.stringify\(reviewedAsins\)/);
  assert.match(preview, /checkoutIdentityKey: amazonCheckoutIdentityKey/);
  const copy = block(amazon, '  async function copyAmazonInfo(', '  function renderStatus(');
  assert.match(copy, /compatibleAmazonCheckoutCache\(live, candidate\)/);
  assert.match(copy, /isAmazonOrderDetailsPage\(\) \|\| isCheckoutPage\(\)\s*\? live\.asins/);
});

test('the newest reviewed handoff wins over an older matching item', async () => {
  const latest = {source: 'amazon', asins: ['B000000002'], capturedAt: '2026-10-06T12:01:00Z'};
  const old = {source: 'amazon', asins: ['B000000001'], capturedAt: '2026-10-06T12:00:00Z'};
  const sandbox = {navigator: {clipboard: {readText: async () => 'PREFIX:' + JSON.stringify(latest)}},
    U: {PAYLOAD_PREFIX: 'PREFIX:'}, storageGet: async () => ({lastCopiedAmazonPayload: old})};
  vm.runInNewContext(block(ebay, '  async function readAmazonClipboard(', '  function showOrderNoteFailure('), sandbox);
  assert.deepEqual([...((await sandbox.readAmazonClipboard({asins: ['B000000001']})).asins)], ['B000000002']);
});

test('blocked clipboard still uses the saved reviewed handoff', async () => {
  const saved = {source: 'amazon', asins: ['B000000001'], capturedAt: new Date().toISOString()};
  const sandbox = {navigator: {clipboard: {readText: async () => { throw new Error('denied'); }}},
    U: {PAYLOAD_PREFIX: 'PREFIX:'}, storageGet: async () => ({lastCopiedAmazonPayload: saved})};
  vm.runInNewContext(block(ebay, '  async function readAmazonClipboard(', '  function showOrderNoteFailure('), sandbox);
  assert.equal(await sandbox.readAmazonClipboard({asins: ['B000000001']}), saved);
});

test('ASIN comparison deduplicates IDs but a real mismatch still reports both products and profile', () => {
  const sandbox = {U: {formatMoney: value => Number(value).toFixed(2), parseDateToMD: String}};
  vm.runInNewContext(block(ebay, '  function buildEtaText(', '  function calculateMatch(')
    + block(ebay, '  function buildAmazonNoteDraft(', '  function ensureInlineOrderNote('), sandbox);
  const payload = {source: 'amazon', total: 19.87, profileLabel: 'Fixture Profile', etas: ['10/9'], capturedAt: new Date().toISOString(), asins: ['b000000001', ' B000000001 ']};
  assert.equal(sandbox.buildAmazonNoteDraft(payload, {asins: ['B000000001']}, 25.01), '25.01 - 19.87 - Fixture Profile - 10/9');
  assert.throws(() => sandbox.buildAmazonNoteDraft({...payload, asins: ['B000000002']}, {asins: ['B000000001']}, 25.01), /eBay: B000000001.*Fixture Profile: B000000002/);
});
