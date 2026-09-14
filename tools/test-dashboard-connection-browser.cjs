const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.GLDN_NODE_MODULES, 'playwright'));
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'dashboard-connection-proof');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://gldn.test') return route.abort();
      const file = path.resolve(root, 'extension', '.' + url.pathname);
      if (!file.startsWith(path.join(root, 'extension') + path.sep) || !fs.existsSync(file)) return route.abort();
      const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html';
      await route.fulfill({ body: fs.readFileSync(file), contentType: type });
    });
    await page.addInitScript(() => {
      const saved = { computerLabel: '6', ebayAccountLabel: 'FINTIME', gldnPopupTab: 'status' };
      const complete = (callback, value) => { if (callback) callback(value); return Promise.resolve(value); };
      globalThis.fixture = { saved, requests: [], writes: [], reject: false };
      globalThis.chrome = {
        storage: {
          onChanged: { addListener() {} },
          local: {
            get(keys, callback) { return complete(callback, Object.fromEntries((keys || Object.keys(saved)).filter(k => k in saved).map(k => [k, saved[k]]))); },
            set(values, callback) { Object.assign(saved, values); fixture.writes.push(Object.keys(values)); return complete(callback); },
            remove(keys, callback) { keys.forEach(k => delete saved[k]); return complete(callback); }
          }
        },
        runtime: {
          id: 'fixture-extension',
          getURL: (file) => 'http://gldn.test/' + file,
          getManifest: () => ({ version: '3.12.44', permissions: [] }),
          sendMessage(request, callback) {
            fixture.requests.push(request.type);
            let result = { ok: true };
            if (request.type === 'seedDashboardSetupFromLocalConfig') result = { ok: false, error: 'Fixture requires operator entry' };
            if (request.type === 'testDashboard') result = fixture.reject ? { ok: false, error: 'Fixture connection rejected' } : { ok: true };
            return complete(callback, result);
          },
          reload() { throw new Error('Unexpected reload'); }
        },
        tabs: {
          query(_options, callback) { return complete(callback, []); },
          get(_id, callback) { return complete(callback, null); },
          create() { throw new Error('Unexpected tab creation'); }
        }
      };
    });
    await page.goto('http://gldn.test/popup.html');
    await page.locator('[data-popup-tab="status"]').click();
    await page.locator('#repairDashboardSetup').click();
    const code = page.locator('#dashboardConnectionCode');
    assert.equal(await code.isVisible(), true);
    assert.equal(await code.getAttribute('type'), 'password');
    await code.fill('fixture-only-dashboard-code-12345');
    await page.locator('#dashboardConnectionFields').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'paste-field.png') });
    await page.locator('#saveDashboardConnection').click();
    await page.getByText('Dashboard connected securely.', { exact: true }).first().waitFor();
    assert.equal(await code.inputValue(), '');
    assert.equal(await code.isVisible(), false);
    assert.equal(await page.evaluate(() => fixture.saved.sellerDashboardKey), 'fixture-only-dashboard-code-12345');
    await page.locator('#repairDashboardSetup').click();
    await code.fill('unsaved-cancelled-value');
    await page.locator('#cancelDashboardConnection').click();
    assert.equal(await page.evaluate(() => fixture.saved.sellerDashboardKey), 'fixture-only-dashboard-code-12345');
    await page.evaluate(() => { fixture.reject = true; });
    await page.locator('#repairDashboardSetup').click();
    await code.fill('fixture-only-rejected-code-67890');
    await code.press('Enter');
    await page.locator('#dashboardConnectionStatus').filter({ hasText: 'Code saved in this profile, but connection test failed' }).waitFor();
    assert.equal(await page.locator('#saveDashboardConnection').isEnabled(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#dashboardConnectionFields').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'connection-failure.png') });
    const boxes = await page.locator('#dashboardConnectionFields input, #dashboardConnectionFields button').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect(), parent = n.parentElement.getBoundingClientRect();
      return { width: r.width, fits: r.left >= parent.left - 1 && r.right <= parent.right + 1 };
    }));
    assert.ok(boxes.every(b => b.width > 0 && b.fits));
    assert.deepEqual(errors, []);
    const proof = { ok: true, actualPopupFiles: true, maskedEntry: true, saveAndTest: true, cancellationPreservesSetup: true, failedTestVisible: true, widths: [420, 390], pageErrors: errors, fixtureOnly: true, marketplaceChanges: 0 };
    fs.writeFileSync(path.join(output, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
