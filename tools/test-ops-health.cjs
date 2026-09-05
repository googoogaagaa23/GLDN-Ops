const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'evidence/reliability-v31232');
fs.mkdirSync(output, { recursive:true });
(async () => {
  const storeBuild = process.env.GLDN_TEST_CHANNEL === 'webstore';
  const extension = path.join(root, storeBuild ? '.webstore-build/extension' : 'extension');
  const prefix = storeBuild ? 'store-' : '';
  const profile = fs.mkdtempSync(path.join(output, 'isolated-profile-'));
  const context = await chromium.launchPersistentContext(profile, { channel:'chromium', headless:true, viewport:{width:1365,height:960}, ignoreDefaultArgs:['--disable-extensions'], args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`] });
  try {
    // Fresh fixture profile; page routes do not intercept service-worker requests.
    await context.route(/^https?:/, (route) => route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    if (storeBuild) {
      const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
      assert.equal(manifest.host_permissions.some(host => ['http://*/*','https://*/*','<all_urls>'].includes(host)), false);
      assert.equal(manifest.content_scripts.some(script => script.js.includes('universal.js')), false);
      assert.deepEqual(manifest.optional_host_permissions, ['http://127.0.0.1/*']);
      assert.equal(await worker.evaluate(() => chrome.permissions.contains({origins:['http://127.0.0.1/*']})), false);
    }
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`chrome-extension://${id}/ops-health.html`);
    await page.getByText('No saved workflow in this profile.',{exact:true}).waitFor();
    assert.equal(await page.locator('#version').textContent(),'3.12.32');
    if (storeBuild) assert.match(await page.locator('body').textContent(), /Chrome-managed|Chrome Web Store/i);
    await worker.evaluate(() => chrome.storage.local.set({
      computerLabel:'0', ebayAccountLabel:'FIXTURE ACCOUNT',
      ebayMonthlyProfit:{phase:'review',active:false,updatedAt:new Date().toISOString(),monthKey:'2026-07',progressMessage:'Fixture review: 94 orders read. No sheet write.'},
      gldnOpenReviews:{fixture:{active:true,expiresAt:Date.now()+600000,label:'Fixture approval',ownerTabId:25,openedAt:new Date().toISOString()}},
      gldnDashboardQueue:[{fixture:true}]
    }));
    await page.getByText('Awaiting approval',{exact:true}).waitFor();
    assert.equal(await page.locator('#queued').textContent(),'1');
    assert.match(await page.locator('#reviews').textContent(),/Fixture approval/);
    await page.screenshot({path:path.join(output,`${prefix}health-desktop.png`),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({colorScheme:'dark'});
    await page.screenshot({path:path.join(output,`${prefix}health-mobile-dark.png`),fullPage:true});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow,false,'Page-level horizontal overflow');
    assert.deepEqual(errors,[]);
    await page.getByRole('link',{name:'Open Results',exact:true}).first().click();
    assert.match(page.url(),/ebay-profit.html$/);
    const report={ok:true,version:'3.12.32',channel:storeBuild?'webstore':'local',isolated:true,signedInMarketplace:false,pageNetworkBlocked:true,serviceWorkerNetworkBlocked:false,pageErrors:errors,checks:['actual service worker startup','empty state','stored progress','review ownership','queued records','desktop/mobile layout','results navigation']};
    if (storeBuild) report.checks.push('no all-sites injection or broad host grant', 'optional helper access not granted by default');
    fs.writeFileSync(path.join(output,`${prefix}ui-check.json`),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await context.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
