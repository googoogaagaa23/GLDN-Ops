const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const background = read('extension/background.js');
const code = background.slice(background.indexOf('async function seedDashboardSetupFromLocalConfig()'), background.indexOf('function seedAutomaticDashboardSetup('));
const url = 'https://script.google.com/macros/s/fixture/exec';
const key = 'fixture-shared-default-not-a-live-key';
const defaults = () => ({schemaVersion:1, publicByOwnerRequest:true, dashboardUrl:url, dashboardKey:key});

function harness({stored = {}, local = '', bundled = defaults(), localThrows = false, bundleOk = true} = {}) {
  const state = {...stored}, writes = [], fetches = [];
  const context = {
    DASHBOARD_URL_KEY:'sellerDashboardUrl', DASHBOARD_SECRET_KEY:'sellerDashboardKey',
    GLDN_CONFIG:{dashboardUrl:url},
    storageGet: async () => ({...state}),
    storageSet: async value => { writes.push(value); Object.assign(state, value); },
    chrome:{runtime:{getURL:file => file}},
    cleanWebAppUrl: value => {
      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(value)) throw new Error('Invalid URL');
      return value;
    },
    fetch: async file => {
      fetches.push(file);
      if (file === 'config.js') {
        if (localThrows) throw new Error('File unavailable');
        return {ok:!!local, text:async () => local};
      }
      assert.equal(file, 'dashboard-default.json');
      return {ok:bundleOk, json:async () => bundled};
    }
  };
  vm.runInNewContext(code, context);
  return {run:context.seedDashboardSetupFromLocalConfig, state, writes, fetches};
}

test('fresh profiles seed the bundled default without asking for a code', async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.ok, true);
  assert.equal(result.source, 'bundled-default');
  assert.equal(h.state.sellerDashboardKey, key);
  assert.equal(h.state.sellerDashboardUrl, url);
  assert.equal(h.writes.length, 1);
  await h.run();
  assert.equal(h.writes.length, 1);
});

test('updates and worker restarts preserve an existing profile connection', async () => {
  const h = harness({stored:{sellerDashboardKey:'existing-private-connection',sellerDashboardUrl:url}});
  assert.equal((await h.run()).source, 'saved-profile');
  assert.equal(h.state.sellerDashboardKey, 'existing-private-connection');
  assert.equal(h.fetches.length, 0);
  assert.equal(h.writes.length, 0);
});

test('a local private override takes precedence over the public default', async () => {
  const h = harness({local:'dashboardUrl: "' + url + '", dashboardKey: "existing-local-override"'});
  assert.equal((await h.run()).source, 'private-package');
  assert.equal(h.state.sellerDashboardKey, 'existing-local-override');
  assert.deepEqual(h.fetches, ['config.js']);
});

test('missing private files still fall back, while malformed bundled settings never save', async () => {
  assert.equal((await harness({localThrows:true}).run()).ok, true);
  for (const options of [
    {bundleOk:false}, {bundled:{}},
    {bundled:{...defaults(),publicByOwnerRequest:false}},
    {bundled:{...defaults(),dashboardKey:''}},
    {bundled:{...defaults(),dashboardUrl:'https://unrelated.invalid/exec'}}
  ]) {
    const h = harness(options);
    assert.equal((await h.run()).ok, false);
    assert.equal(h.writes.length, 0);
  }
});

test('public-key inclusion is explicit and source/package entry points are complete', () => {
  const published = JSON.parse(read('extension/dashboard-default.json'));
  assert.equal(published.schemaVersion, 1);
  assert.equal(published.publicByOwnerRequest, true);
  assert.ok(typeof published.dashboardKey === 'string' && published.dashboardKey.length >= 24);
  const builder = read('tools/build-local-package.ps1');
  for (const file of ['dashboard-default.json','companion-setup-core.js','companion-setup-background.js','companion-setup-page.js','companion-setup.html','companion-setup.js','companion-setup.css']) {
    assert.ok(builder.includes('"' + file + '"'), 'Local bundle must include ' + file);
    assert.ok(fs.existsSync(path.join(root, 'extension', file)));
  }
  assert.match(read('extension/popup.html'), /id="openCompanionSetup"/);
  assert.match(read('extension/popup.js'), /getElementById\('openCompanionSetup'\)/);
  assert.match(read('tools/build-extension-package.ps1'), /publicByOwnerRequest/);
  assert.match(read('extension/popup.js'), /Use Test Connection to verify access/);
});
