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

test('relative shipment headings use the next local calendar date and ignore alternate options', () => {
  const lines = ['Arriving Tomorrow 7 AM - 11 AM', 'Fastest Tomorrow 7 AM - 11 AM', 'Tomorrow 4 AM - 8 AM', 'Amazon Day Wednesday, Oct 7', 'Order within 3 hours for delivery tomorrow'];
  const sandbox = { U: { ...utils(), getBodyLines: () => lines }, Date };
  vm.runInNewContext(block(amazon, '  function parseEtaLine(', '  function extractCheckoutData('), sandbox);
  const now = new Date(2026, 9, 4, 23, 45).getTime();
  for (const line of ['Arriving Tomorrow 7 AM - 11 AM', 'Arriving tomorrow', 'Arrives by tomorrow', 'Delivery date: Tomorrow by 10 PM', 'Arriving Tomorrow 7:30 AM \u2013 11:30 AM']) {
    assert.equal(sandbox.parseEtaLine(line, now), '10/5', line);
  }
  assert.equal(sandbox.parseEtaLine('Arriving Today by 10 PM', now), '10/4');
  assert.equal(sandbox.parseEtaLine('Arriving Tomorrow, October 8, 2026', now), '10/8');
  for (const line of lines.slice(1).concat(['Arriving Tomorrow - Friday', 'Arriving Today or Tomorrow', 'Arriving Tomorrow or October 7'])) {
    assert.equal(sandbox.parseEtaLine(line, now), '', line);
  }
  assert.deepEqual([...sandbox.extractAmazonEtas(now)], ['10/5']);
  assert.equal(sandbox.parseEtaLine('Arriving Tomorrow', NaN), '');
});

test('tomorrow handles month/year rollover, leap days, DST and local dates instead of UTC dates', () => {
  const sandbox = { U: utils(), Date };
  vm.runInNewContext(block(amazon, '  function parseEtaLine(', '  function extractCheckoutData('), sandbox);
  for (const [parts, expected] of [
    [[2026, 11, 31, 23, 59], '1/1'], [[2028, 1, 28, 23, 59], '2/29'],
    [[2028, 1, 29, 23, 59], '3/1'], [[2026, 2, 8, 23, 30], '3/9'],
    [[2026, 10, 1, 0, 30], '11/2'], [[2026, 9, 4, 23, 30], '10/5']
  ]) assert.equal(sandbox.parseEtaLine('Arriving Tomorrow 7 AM - 11 AM', new Date(...parts).getTime()), expected);
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

function nativeNoteFixture({ label = 'Add order note', menuOpen = false, delayed = false } = {}) {
  const state = { menuOpen, dialog: false, clicks: [], waits: 0, field: { value: '', focus() {}, dispatchEvent() {} } };
  const control = (name, options = {}) => ({
    innerText: name, textContent: name, disabled: false, visible: true,
    getAttribute(key) { return key === 'aria-label' ? options.ariaLabel || '' : key === 'aria-disabled' ? options.ariaDisabled || '' : ''; },
    closest: () => options.injected ? {} : null,
    contains: other => options.child === other,
    ...options
  });
  const note = control(label);
  const more = control('More actions');
  const wrong = control('Add note to buyer message');
  const own = control('Add order note', { injected: true });
  const parent = control(label, { child: note });
  state.controls = [own, wrong, more, parent, note, control('Save')];
  const sandbox = {
    location: { href: 'https://www.ebay.com/mesh/ord/details?orderid=11-11111-11111' },
    navigator: { clipboard: { writeText: async () => {} } },
    document: { querySelectorAll: () => state.controls },
    extractEbayOrderNumber: () => '11-11111-11111',
    findExistingNoteEditButton: () => null,
    findVisibleNoteTextarea: () => state.dialog ? state.field : null,
    dispatchFullClick(element) {
      state.clicks.push(element.innerText);
      if (element === more) state.menuOpen = !state.menuOpen;
      if (element === note) state.dialog = true;
    },
    U: {
      normalizeText: text => String(text).toLowerCase().replace(/\s+/g, ' ').trim(),
      isVisible: element => element.visible && (![note, parent].includes(element) || (state.menuOpen && (!delayed || state.waits >= 3))),
      setNativeValue: (element, value) => { element.value = value; },
      waitFor: async callback => { for (let i = 0; i < 4; i++) { state.waits++; const result = callback(); if (result) return result; } return null; }
    },
    InputEvent: class {}
  };
  vm.runInNewContext(block(ebay, '  async function openAndFillAddNote(', '  function findExistingNoteEditButton('), sandbox);
  return { sandbox, state, control, note, more };
}

for (const label of ['Add order note', 'Add note', 'Edit order note', 'Edit note']) {
  test(`native menu label ${label} opens and fills once without Save`, async () => {
    const { sandbox, state } = nativeNoteFixture({ label });
    await sandbox.openAndFillAddNote('80.04 - 75.57 - M8 - 10/5');
    assert.equal(state.field.value, '80.04 - 75.57 - M8 - 10/5');
    assert.deepEqual(state.clicks, ['More actions', label]);
  });
}

test('an already-open or delayed native note menu is not toggled closed', async () => {
  const open = nativeNoteFixture({ menuOpen: true });
  await open.sandbox.openAndFillAddNote('open menu');
  assert.deepEqual(open.state.clicks, ['Add order note']);
  const delayed = nativeNoteFixture({ delayed: true });
  await delayed.sandbox.openAndFillAddNote('delayed menu');
  assert.equal(delayed.state.field.value, 'delayed menu');
  assert.deepEqual(delayed.state.clicks, ['More actions', 'Add order note']);
});

test('native lookup uses accessible names, ignores disabled/injected controls and rejects ambiguity', () => {
  const { sandbox, state, control } = nativeNoteFixture();
  const target = control('', { ariaLabel: 'Add order note' });
  state.controls = [control('Add order note', { injected: true }), control('Add order note', { disabled: true }), control('Add order note', { ariaDisabled: 'true' }), target];
  assert.equal(sandbox.findNativeOrderNoteControl('note'), target);
  state.controls.push(control('Add note'));
  assert.throws(() => sandbox.findNativeOrderNoteControl('note'), /More than one/);
});

test('a changed order during menu wait stops before clicking or filling its note', async () => {
  const { sandbox, state } = nativeNoteFixture();
  sandbox.U.waitFor = async callback => { sandbox.location.href += '&changed=1'; return callback(); };
  await assert.rejects(sandbox.openAndFillAddNote('wrong note'), /order changed/);
  assert.deepEqual(state.clicks, ['More actions']);
  assert.equal(state.field.value, '');
});
