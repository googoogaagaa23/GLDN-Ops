const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const amazon = fs.readFileSync(path.join(root, 'extension/amazon.js'), 'utf8');
const ebay = fs.readFileSync(path.join(root, 'extension/ebay.js'), 'utf8');
function block(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
function utils() {
  const source = fs.readFileSync(path.join(root, 'extension/shared.js'), 'utf8');
  const sandbox = { window: {}, URL, document: { addEventListener() {} }, chrome: { runtime: { getManifest: () => ({version:'test'}) }, storage: { onChanged: {addListener() {}} } } };
  // Reuse the actual date and money helpers, without starting shared panel code.
  const dates = block(source, '  const parseDateToMD =', '  const extractEtasFromText =');
  const money = block(source, '  const moneyToNumber =', '  const isVisible =');
  vm.runInNewContext(money + dates + ';window.result = {parseDateToMD, formatMoney};', sandbox);
  return sandbox.window.result;
}

test('screenshot wording auto-detects 10/7 and ignores unselected delivery choices', () => {
  const U = { ...utils(), getBodyLines: () => ['Arriving by Oct 7, 2026', 'Wednesday, Oct 7 FREE', 'Amazon Day Monday, Oct 12', 'FREE delivery October 5', 'Arriving by Oct 7, 2026'] };
  const sandbox = { U };
  vm.runInNewContext(block(amazon, '  function parseEtaLine(', '  function extractCheckoutData('), sandbox);
  assert.equal(sandbox.parseEtaLine('Arriving by Oct 7, 2026'), '10/7');
  assert.equal(sandbox.parseEtaLine('Arriving by Wednesday, October 7, 2026'), '10/7');
  assert.equal(sandbox.parseEtaLine('Arriving on Oct 7, 2026'), '10/7');
  assert.equal(sandbox.parseEtaLine('Arriving Jul 2, 2026'), '7/2');
  assert.deepEqual([...sandbox.extractAmazonEtas()], ['10/7']);
});

test('late ETA text fills the open preview but never overwrites a manual correction', () => {
  let callback, refresh, disconnected = false, dates = ['10/7'];
  const sandbox = {
    location: { href: 'https://www.amazon.com/checkout/test' },
    document: {body:{}},
    MutationObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() { disconnected = true; } },
    setTimeout: fn => { refresh = fn; return 1; }, clearTimeout: () => {},
    extractCheckoutData: () => ({etas: dates})
  };
  vm.runInNewContext(block(amazon, '  function watchAmazonPreviewEtas(', '  function showAmazonPreview('), sandbox);
  let onInput;
  const input = { value: '', addEventListener: (_, fn) => { onInput = fn; } };
  const overlay = { isConnected: true };
  sandbox.watchAmazonPreviewEtas(overlay, input);
  callback(); refresh();
  assert.equal(input.value, '10/7');
  onInput(); input.value = '10/8'; dates = ['10/9'];
  callback(); refresh();
  assert.equal(input.value, '10/8');
  overlay.isConnected = false;
  callback(); refresh();
  assert.equal(disconnected, true);
});

function draftBuilder() {
  const sandbox = { U: utils() };
  vm.runInNewContext(block(ebay, '  function buildEtaText(', '  function calculateMatch(')
    + block(ebay, '  function buildAmazonNoteDraft(', '  function ensureInlineOrderNote('), sandbox);
  return sandbox.buildAmazonNoteDraft;
}
const payload = () => ({ source:'amazon', total:24.11, profileLabel:'Fixture Profile', etas:['10/7'], asins:[], capturedAt:new Date().toISOString(), confirmed:false, exactOrderDetails:false });

test('checkout estimates can draft a note without becoming verified purchase evidence', () => {
  const source = payload();
  const before = JSON.stringify(source);
  assert.equal(draftBuilder()(source, {asins:['B000000001']}, 29.79), '29.79 - 24.11 - Fixture Profile - 10/7');
  assert.equal(JSON.stringify(source), before);
  const inline = block(ebay, '  function ensureInlineOrderNote(', '  async function prepareNote(');
  assert.match(inline, /expectedSavedNote = null/);
  assert.match(inline, /expectedProfitRecord = null/);
  assert.doesNotMatch(inline, /syncMarketplaceProfitRecord|storageSet|refreshProfitForMatchingSavedNote/);
  assert.match(inline, /Checkout estimate imported/);
  assert.match(inline, /if \(!confirm.checked/);
});

test('draft imports reject stale data, missing totals/ETAs, and known ASIN mismatches', () => {
  const build = draftBuilder();
  for (const change of [
    {capturedAt:'2020-01-01'}, {capturedAt:''}, {total:null}, {total:-1}, {etas:[]},
    {source:'other'}, {profileLabel:''}, {asins:['B000000002']}
  ]) assert.throws(() => build({...payload(), ...change}, {asins:['B000000001']}, 29.79));
  assert.throws(() => build(payload(), {}, null));
});

test('inline note does not mask navigation to a different order', () => {
  const sandbox = { document: {
    body: {innerText:'GLDN Order Note\n11-11111-11111\nOrder\n22-22222-22222'},
    getElementById: () => ({innerText:'GLDN Order Note\n11-11111-11111'})
  } };
  vm.runInNewContext(block(ebay, '  function extractEbayOrderNumber(', '  function extractEbayTitleCandidates('), sandbox);
  assert.equal(sandbox.extractEbayOrderNumber(), '22-22222-22222');
  const inline = block(ebay, '  function ensureInlineOrderNote(', '  async function prepareNote(');
  assert.match(inline, /location.href === ownerUrl/);
  assert.match(inline, /urlOrder && urlOrder !== orderNumber/);
  const fill = block(ebay, '  async function openAndFillAddNote(', '  function findExistingNoteEditButton(');
  assert.match(fill, /location.href !== ownerUrl/);
  assert.doesNotMatch(fill, /findVisibleByText\("Save"\)/);
});

test('native note fill works without clipboard permission and stops if the order changes', async () => {
  const field = { focus() {}, dispatchEvent() {} };
  const sandbox = {
    location: {href:'https://www.ebay.com/mesh/ord/details?orderid=11-11111-11111'},
    navigator: {clipboard: {writeText: async () => { throw new Error('clipboard denied'); }}},
    extractEbayOrderNumber: () => '11-11111-11111', findVisibleNoteTextarea: () => field,
    U: { setNativeValue: (element, value) => { element.value = value; } },
    InputEvent: class {}
  };
  vm.runInNewContext(block(ebay, '  async function openAndFillAddNote(', '  function findExistingNoteEditButton('), sandbox);
  await sandbox.openAndFillAddNote('fixture note');
  assert.equal(field.value, 'fixture note');
  sandbox.navigator.clipboard.writeText = async () => { sandbox.location.href += '&new-order=1'; };
  await assert.rejects(sandbox.openAndFillAddNote('wrong-order note'), /order changed/);
  assert.equal(field.value, 'fixture note');
});
