const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.GLDN_NODE_MODULES, 'playwright'));
const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const native = background.slice(background.indexOf('async function policyListingNativePage'), background.indexOf('\nasync function inspectPolicyNativePage'));
const ids = ['300000000001', '300000000002'];
const html = `<!doctype html><a href="/usr/seller" aria-label="seller View profile">seller</a>
<p id="selected">(0 selected)</p>
<input type="checkbox" id="shui-dt-checkone-300000000001">
<input type="checkbox" id="shui-dt-checkone-300000000002">
<button id="actions">Actions</button><div id="menu"></div><div id="notice" role="status"></div>
<script>
window.endClicks = 0; window.confirmClicks = 0;
document.querySelectorAll('input').forEach(el => el.onchange = () =>
  document.getElementById('selected').textContent = '(' + document.querySelectorAll('input:checked').length + ' selected)');
document.getElementById('actions').onclick = () => {
  document.getElementById('menu').innerHTML = '<button id="end">End listings</button>';
  document.getElementById('end').onclick = () => {
    window.endClicks++;
    document.getElementById('menu').innerHTML = '';
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<a href="/itm/300000000001">First</a><a href="/itm/300000000002">Second</a><button id="confirm">End listings</button>';
    document.body.appendChild(dialog);
    document.getElementById('confirm').onclick = () => {
      window.confirmClicks++; dialog.remove();
      document.getElementById('notice').textContent = '2 listings have been ended.';
    };
  };
};
</script>`;

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [];
  try {
    const page = await browser.newPage();
    // An isolated fixture intercepts every request. No signed-in browser or real eBay data is used.
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
    const load = async () => {
      await page.goto('https://www.ebay.com/sh/lst/active?keyword=' + ids.join(','));
      await page.addScriptTag({ content: native });
    };
    const run = (mode, extra = {}) => page.evaluate(args => policyListingNativePage(args), { mode, itemIds: ids, ...extra });
    await load();
    const prepared = await run('prepare');
    assert.equal(prepared.ok, true);
    assert.equal(prepared.seller, 'seller');
    assert.equal(await page.evaluate(() => window.endClicks), 0);
    assert.equal((await run('submit', { seller: 'different' })).ok, false);
    assert.equal(await page.evaluate(() => window.endClicks), 0);
    assert.equal((await run('submit', { seller: 'seller' })).dispatched, true);
    assert.equal((await run('confirm', { seller: 'seller' })).confirmationReady, true);
    assert.equal(await page.evaluate(() => window.confirmClicks), 0);
    assert.equal((await run('confirm', { seller: 'seller', click: true })).confirmationClicked, true);
    assert.equal((await run('result', { seller: 'seller', baseline: prepared.baseline })).outcome, 'success');
    results.push('exact selection, owner binding, one End click, exact dialog, explicit success');

    await load();
    await run('prepare');
    await page.evaluate(() => document.getElementById('selected').textContent = '(3 selected)');
    assert.equal((await run('submit', { seller: 'seller' })).ok, false);
    assert.equal(await page.evaluate(() => window.endClicks), 0);
    results.push('hidden or extra selected count rejected before End');

    await load();
    await run('prepare');
    await run('submit', { seller: 'seller' });
    await page.evaluate(() => document.querySelector('[role="dialog"] a').href = '/itm/399999999999');
    assert.equal((await run('confirm', { seller: 'seller', click: true })).needsNativeReview, true);
    assert.equal(await page.evaluate(() => window.confirmClicks), 0);
    results.push('changed native confirmation IDs never clicked');

    await load();
    await page.evaluate(() => document.getElementById('notice').textContent = '2 listings have been ended.');
    const baseline = await run('prepare');
    assert.equal((await run('result', { seller: 'seller', baseline: baseline.baseline })).outcome, 'unknown');
    await page.evaluate(() => document.getElementById('notice').textContent = '1 listing has been ended.');
    assert.equal((await run('result', { seller: 'seller', baseline: [] })).outcome, 'unknown');
    results.push('stale and partial success messages never complete the batch');
    const dir = path.join(root, 'evidence/policy-audit-v3.12.38');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'native-fixture-results.json'), JSON.stringify({ scope: 'Isolated DOM fixtures, not live ending verification', results }, null, 2));
    console.log(results.join('\n'));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
