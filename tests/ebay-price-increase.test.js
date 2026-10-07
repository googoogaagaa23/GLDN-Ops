const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../extension/ebay-price-core');
const item = 'https://www.ebay.com/itm/123456789012';
const editor = 'https://www.ebay.com/lstng?draftId=9876543210&mode=ReviseItem';
const order = 'https://www.ebay.com/mesh/ord/details?orderid=11-11111-11111';
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'extension', name), 'utf8');
const makeRun = () => core.bindEditor(core.createRun({ itemId: '123456789012', sourceUrl: order }), item, editor);

for (const [from, to] of [['27.19', '27.29'], ['27.99', '28.09'], ['1,234.95', '1235.05'], ['0.01', '0.11'], ['100', '100.10']]) {
  test(`ten cents: ${from} becomes ${to}`, () => {
    const result = core.plan(makeRun(), editor, from);
    assert.equal(result.claimed, true);
    assert.equal(core.money(result.run.newCents), to);
  });
}
for (const value of ['', '-1', '0', '27.191', 'NaN', '27.19 - 29.99', '1e3', '1,23.19', 'USD 27.19']) {
  test(`invalid price does not change: ${value}`, () => assert.equal(core.cents(value), null));
}
test('repeated plans preserve the first price rather than adding again', () => {
  const first = core.plan(makeRun(), editor, '27.19');
  const second = core.plan(first.run, editor, '27.29');
  assert.equal(second.claimed, false);
  assert.equal(second.run.newCents, 2729);
});
test('prepared price can be applied once or restored without further arithmetic', () => {
  const run = core.plan(makeRun(), editor, '27.19').run;
  assert.equal(core.applyAllowed(run, editor, '27.19'), true);
  assert.equal(core.applyAllowed(run, editor, '27.29'), true);
  assert.equal(core.applyAllowed(run, editor, '27.39'), false);
  assert.equal(core.applyAllowed(run, editor.replace('9876543210', '9876543211'), '27.19'), false);
});
test('wrong listing, draft, protocol and lookalike host stop preparation', () => {
  assert.throws(() => core.bindEditor(core.createRun({ itemId: '123456789012', sourceUrl: order }), item.replace('012', '013'), editor));
  assert.throws(() => core.plan(makeRun(), editor.replace('9876543210', '9876543211'), '27.19'));
  assert.equal(core.isEditor(editor.replace('ebay.com', 'ebay.com.evil.test')), false);
  assert.equal(core.isEditor(editor.replace('https:', 'http:')), false);
  assert.equal(core.isEditor(editor.replace('ReviseItem', 'CreateItem')), false);
});
test('expired and future-dated runs are not resumed', () => {
  const run = core.createRun({ sourceUrl: editor }, 1000);
  assert.equal(core.fresh(run, 1000 + core.TTL - 1), true);
  assert.equal(core.fresh(run, 1000 + core.TTL), false);
  assert.equal(core.fresh(run, 999), false);
});
test('the editor key tolerates tracking parameters, not another draft', () => {
  assert.equal(core.editorKey(editor), core.editorKey(editor + '&ref=nav'));
  assert.notEqual(core.editorKey(editor), core.editorKey(editor.replace('9876543210', '9876543211')));
});
function backgroundFixture() {
  const memory = {};
  let listener, removed, updated;
  const sandbox = {
    GLDN_EBAY_PRICE_CORE: core,
    GLDN_FOUNDATION: { workflowStateKeys: ['pendingRun'], activeWorkflowEntries: data => data.pendingRun?.active ? ['pendingRun'] : [] },
    chrome: {
      runtime: { id: 'gldn', onMessage: { addListener: fn => { listener = fn; } } },
      tabs: { onRemoved: { addListener: fn => { removed = fn; } }, onUpdated: { addListener: fn => { updated = fn; } } },
      storage: {
        local: { get: async () => memory.local || {} },
        session: { get: async key => ({ [key]: memory[key] }), set: async data => Object.assign(memory, data), remove: async key => { delete memory[key]; } }
      }
    }
  };
  vm.runInNewContext(source('ebay-price-background.js'), sandbox);
  const send = (action, data = {}, url = editor, tabId = 1, id = 'gldn') => new Promise(resolve => listener(
    { type: 'ebayPriceIncrease', action, ...data }, { id, url, tab: { id: tabId, url } }, resolve));
  return { memory, send, close: tab => removed(tab), navigate: (url, tab = 1) => updated(tab, { url }) };
}
test('concurrent start/plan calls are serialized and cannot double-increase', async () => {
  const fixture = backgroundFixture();
  await fixture.send('begin', { title: 'Test listing' });
  const results = await Promise.all([fixture.send('plan', { value: '27.19' }), fixture.send('plan', { value: '27.29' })]);
  assert.equal(results.filter(result => result.claimed).length, 1);
  assert.equal(results[1].run.newCents, 2729);
});
test('price state belongs to one exact originating tab', async () => {
  const fixture = backgroundFixture();
  await fixture.send('begin');
  assert.equal((await fixture.send('get', {}, editor, 2)).run, null);
  assert.equal((await fixture.send('get', {}, editor, 1, 'other')).ok, false);
  assert.equal((await fixture.send('get', {}, 'https://example.com/', 1)).ok, false);
  await fixture.close(1);
  assert.equal((await fixture.send('get')).run, null);
});

test('native sl/list redirect needs the exact item navigation and title before adoption', async () => {
  const fixture = backgroundFixture();
  const entry = 'https://www.ebay.com/sl/list?itemId=123456789012&mode=ReviseItem';
  await fixture.send('begin', { itemId: '123456789012', title: 'Test listing' }, item);
  assert.equal((await fixture.send('bind-editor', { editorUrl: entry }, item)).run.phase, 'opening');
  assert.equal((await fixture.send('adopt-editor', { title: 'Test listing' })).ok, false);
  fixture.navigate(entry);
  fixture.navigate(editor);
  assert.equal((await fixture.send('adopt-editor', { title: 'Other listing' })).ok, false);
  assert.equal((await fixture.send('adopt-editor', { title: 'Test listing' })).run.phase, 'editor');
  assert.equal((await fixture.send('plan', { value: '27.19' })).run.newCents, 2729);
});

test('a navigation detour or a different draft prevents automatic adoption', () => {
  const entry = 'https://www.ebay.com/sl/list?itemId=123456789012&mode=ReviseItem';
  let run = core.bindEditor(core.createRun({ itemId: '123456789012', title: 'Test', sourceUrl: item }), item, entry);
  run = core.observeNavigation(run, entry);
  run = core.observeNavigation(run, editor);
  assert.throws(() => core.adoptEditor(run, editor.replace('9876543210', '9876543211'), 'Test'));
  run = core.observeNavigation(run, 'https://www.ebay.com/');
  assert.throws(() => core.adoptEditor(run, editor, 'Test'));
  assert.throws(() => core.bindEditor(core.createRun({ itemId: '123456789012', sourceUrl: item }), item, entry.replace('012', '013')));
});
test('Stop or another running workflow blocks any mutation', async () => {
  const fixture = backgroundFixture();
  fixture.memory.local = { gldnStopRequested: true };
  assert.equal((await fixture.send('begin')).ok, false);
  fixture.memory.local = { pendingRun: { active: true } };
  assert.equal((await fixture.send('begin')).ok, false);
  assert.equal(fixture.memory['gldnPriceIncrease:1'], undefined);
});
test('a wrong editor cannot claim an existing planned run', async () => {
  const fixture = backgroundFixture();
  await fixture.send('begin');
  const result = await fixture.send('plan', { value: '27.19' }, editor.replace('9876543210', '9876543211'));
  assert.equal(result.ok, false);
});
test('starting again reopens the same pending increase', async () => {
  const fixture = backgroundFixture();
  await fixture.send('begin');
  await fixture.send('plan', { value: '27.19' });
  const repeated = await fixture.send('begin');
  assert.equal(repeated.resumed, true);
  assert.equal(repeated.run.newCents, 2729);
});
test('only the exact new price can be marked prepared, never saved', async () => {
  const fixture = backgroundFixture();
  await fixture.send('begin');
  await fixture.send('plan', { value: '27.19' });
  assert.equal((await fixture.send('applied', { value: '27.39' })).ok, false);
  assert.equal((await fixture.send('applied', { value: '27.29' })).run.phase, 'applied');
});

test('leaving a prepared revision releases the helper without claiming a successful save', async () => {
  const fixture = backgroundFixture();
  await fixture.send('begin');
  await fixture.send('plan', { value: '27.19' });
  await fixture.send('applied', { value: '27.29' });
  fixture.navigate(editor + '&ref=nav');
  assert.equal((await fixture.send('get')).run.phase, 'applied');
  fixture.navigate('https://www.ebay.com/sh/lst/active');
  assert.equal((await fixture.send('get')).run, null);
  assert.equal(fixture.memory.saved, undefined);
});
test('runtime module excludes GLDN fields, requires fixed price and never clicks final submit', () => {
  const content = source('ebay-price-increase.js');
  assert.match(content, /element\.closest\('\[id\^="gldn-/);
  assert.match(content, /Buy \(\?:It \)\?Now/);
  assert.match(content, /Variation prices need separate review/);
  assert.doesNotMatch(content, /\.click\(|requestSubmit\(|\.submit\(/);
  assert.match(content, /Close helper/);
  assert.match(content, /dismissedHref !== location\.href/);
});
test('new runtime is present in manifest, background reinjection and package allowlist', () => {
  const manifest = JSON.parse(source('manifest.json'));
  const ebayScripts = manifest.content_scripts.find(entry => entry.matches.includes('https://*.ebay.com/*')).js;
  for (const file of ['ebay-price-core.js', 'ebay-price-increase.js']) {
    assert.ok(ebayScripts.indexOf(file) < ebayScripts.indexOf('ebay.js'));
    assert.match(source('background.js'), new RegExp(file.replaceAll('.', '\\.')));
    assert.ok(fs.readFileSync(path.join(root, 'tools/build-local-package.ps1'), 'utf8').includes(file));
  }
});
