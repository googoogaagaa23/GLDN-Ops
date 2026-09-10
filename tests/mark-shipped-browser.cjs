const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(path.join(process.env.GLDN_NODE_MODULES, 'playwright'));

const root = path.resolve(__dirname, '..');
const ebay = fs.readFileSync(path.join(root, 'extension/ebay.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const brace = source.indexOf('{', source.indexOf(') {', start));
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return `${source.slice(start - 6, start) === 'async ' ? 'async ' : ''}${source.slice(start, i + 1)}`;
  }
  throw new Error(`Unclosed function ${name}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const evidence = path.join(root, 'evidence/mark-shipped-v3.12.36');
  fs.mkdirSync(evidence, { recursive: true });
  const results = [];
  try {
    const sandbox = {};
    vm.runInNewContext(extract(background, 'buildMarkShippedActivationTargetProbe'), sandbox);
    const probe = sandbox.buildMarkShippedActivationTargetProbe();
    const cases = [
      ['nested menu row and button', '<li role="menuitem"><button>Mark as shipped</button></li>', true],
      ['nested text hit target', '<li role="menuitem"><button><span>Mark as shipped</span></button></li>', true],
      ['two independent actions', '<button>Mark as shipped</button><button>Mark as shipped</button>', false],
      ['disabled menu parent', '<li role="menuitem" aria-disabled="true"><button>Mark as shipped</button></li>', false],
      ['closed menu', '<div style="display:none"><button>Mark as shipped</button></div>', false],
      ['extension text is not eBay', '<div id="gldn-test"><button>Mark as shipped</button></div>', false],
      ['blocked hit target', '<button>Mark as shipped</button><div style="position:fixed;inset:0;z-index:9"></div>', false]
    ];
    for (const [name, html, expected] of cases) {
      await page.setContent(html);
      const result = await page.evaluate(probe);
      assert.equal(result.ok, expected, `${name}: ${JSON.stringify(result)}`);
      results.push({ name, pass: true });
    }

    for (const changedSelection of [false, true]) {
      await page.setContent('<button id="shipping">Shipping</button><div id="menu" style="display:none"><button>Mark as shipped</button></div>');
      await page.evaluate((changed) => {
        window.orderCount = 6;
        window.menuOpens = 0;
        window.dispatchCalls = 0;
        window.U = {
          normalizeText: (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' '),
          isVisible: (el) => el.getBoundingClientRect().width > 0,
          waitFor: async (read) => read()
        };
        window.isAwaitingShipmentPage = () => true;
        window.parseAwaitingResultsCount = () => window.orderCount;
        window.findActionsMasterCheckbox = () => ({});
        window.currentMarkShippedSelectionEvidence = () => ({ count: window.orderCount });
        window.validateMarkShippedConfirmation = (before, count) => ({ ok: before === count });
        window.findExactVisible = () => document.getElementById('shipping');
        document.getElementById('shipping').onclick = () => { document.getElementById('menu').style.display = 'block'; window.menuOpens++; };
        window.storageSet = async () => {
          document.getElementById('menu').style.display = 'none';
          if (changed) window.orderCount = 5;
        };
        window.runtimeMessage = async () => {
          window.dispatchCalls++;
          if (!window.U.isVisible(document.querySelector('#menu button'))) throw new Error('menu was not reopened');
          return { ok: false, dispatched: false, error: 'fixture stopped before shipment click' };
        };
      }, changedSelection);
      await page.addScriptTag({ content: [
        extract(ebay, 'dispatchFullClick'), extract(ebay, 'findMarkShippedMenuAction'),
        extract(ebay, 'ensureMarkShippedMenuForApproval'), extract(ebay, 'activateApprovedMarkShipped')
      ].join('\n') });
      const observed = await page.evaluate(async () => {
        try { await activateApprovedMarkShipped({ beforeCount: 6, selectedCount: 6 }); }
        catch (error) { return { noClick: error.activationNotDispatched, opens: window.menuOpens, dispatches: window.dispatchCalls }; }
      });
      assert.equal(observed.noClick, true);
      assert.equal(observed.dispatches, changedSelection ? 0 : 1);
      assert.equal(observed.opens, changedSelection ? 1 : 2);
      results.push({ name: changedSelection ? 'changed order count stops before dispatch' : 'Shipping menu reopens after approval is hidden', pass: true });
    }

    for (const dispatched of [false, true, 'unknown']) {
      await page.setContent('<button id="outside" style="position:fixed;left:10px;top:10px">eBay page control</button><button id="ship" style="position:fixed;left:10px;top:70px">Mark as shipped</button>');
      await page.addStyleTag({ path: path.join(root, 'extension/styles.css') });
      await page.evaluate((result) => {
        window.pending = { active: true, phase: 'awaiting-activation-approval', beforeCount: 6, selectedCount: 6 };
        window.U = { enhanceModal() {}, isVisible: (el) => el.getBoundingClientRect().width > 0,
          normalizeText: (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ') };
        window.storageGet = async () => ({ pendingMarkShippedRun: structuredClone(window.pending) });
        window.storageSet = async (data) => { window.pending = structuredClone(data.pendingMarkShippedRun); };
        window.ensureMarkShippedMenuForApproval = async () => document.getElementById('ship');
        window.runtimeMessage = async () => {
          if (result === 'unknown') throw new Error('Connection lost before a result was received.');
          if (result) window.pending.trustedActivationDispatchAt = new Date().toISOString();
          return { ok: false, dispatched: result, error: 'Simulated activation failure' };
        };
        window.renderStatus = (value) => { window.panelStatus = value; };
        window.findActionsMasterCheckbox = () => null;
        window.outsideClicks = 0;
        document.getElementById('outside').onclick = () => window.outsideClicks++;
      }, dispatched);
      await page.addScriptTag({ content: [
        extract(ebay, 'activateApprovedMarkShipped'),
        extract(ebay, 'cancelMarkShippedActivationApproval'),
        extract(ebay, 'showMarkShippedActivationApproval'),
        extract(ebay, 'isMarkShippedDialogText'),
        extract(ebay, 'findMarkShippedDialog')
      ].join('\n') });
      await page.evaluate(() => showMarkShippedActivationApproval(window.pending));
      assert.equal(await page.evaluate(() => findMarkShippedDialog({ requireLayout: false })), null, 'GLDN approval must not be an eBay confirmation');
      await page.locator('#outside').click();
      await page.locator('[data-action="approve"]').click();
      await page.waitForFunction(() => !document.querySelector('#gldn-mark-shipped-activation-approval').hasAttribute('aria-busy'));
      await page.locator('#outside').click();
      assert.equal(await page.evaluate(() => window.outsideClicks), 2);
      assert.equal(await page.locator('[data-action="close"]').isEnabled(), true);
      assert.equal((await page.locator('[data-action="close"]').boundingBox()).width, 32);
      assert.equal(await page.locator('[data-action="cancel"]').isEnabled(), true);
      assert.equal(await page.locator('[data-action="approve"]').isEnabled(), dispatched === false);
      assert.equal(await page.evaluate(() => window.pending.phase), dispatched === false ? 'awaiting-activation-approval' : 'manual-review-required');
      for (const width of [1200, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: path.join(evidence, `failure-${dispatched}-${width}.png`) });
      }
      if (dispatched === false) {
        await page.locator('[data-action="close"]').click();
        assert.equal(await page.evaluate(() => window.pending.phase), 'awaiting-activation-approval');
      } else {
        await page.locator('[data-action="cancel"]').click();
        assert.equal(await page.evaluate(() => window.pending.phase), 'manual-review-required', 'Closing must preserve uncertain dispatch evidence');
      }
      assert.equal(await page.locator('#gldn-mark-shipped-activation-approval').count(), 0);
      results.push({ name: `failure=${dispatched}: outside click, close, retry gate, preserved state`, pass: true });
      await page.setViewportSize({ width: 1200, height: 900 });
    }
    await page.setContent('<div id="gldn-review" role="dialog">Are you sure you want to mark orders as shipped? <button>Continue</button></div><div id="native" role="dialog">Mark as shipped. Are you sure? <button>Continue</button></div>');
    await page.addScriptTag({ content: [
      extract(ebay, 'markShippedElementDisplayed'), extract(ebay, 'isMarkShippedDialogText'),
      extract(ebay, 'findMarkShippedDialog')
    ].join('\n') });
    assert.equal(await page.evaluate(() => findMarkShippedDialog({ requireLayout: false })?.id), 'native');
    await page.locator('#native').evaluate((element) => element.remove());
    assert.equal(await page.evaluate(() => findMarkShippedDialog({ requireLayout: false })), null);
    results.push({ name: 'native confirmation remains detectable; GLDN confirmation text is excluded', pass: true });
    for (const phase of ['manual-review-required', 'finalizing']) {
      await page.setContent('<h1>Manage orders awaiting shipment</h1><p>Results: 0</p><p id="result"></p><p id="status"></p><button id="next">Scan Seller Level</button>');
      await page.evaluate((phase) => {
        window.markShippedFinalization = null;
        window.stored = { pendingMarkShippedRun: { active: true, phase, startedAt: '2026-09-10T03:00:00.000Z', activationApprovedAt: '2026-09-10T03:01:00.000Z', ownerTabId: 29, beforeCount: 4, selectedCount: 4 } };
        window.storageGet = async () => structuredClone(window.stored);
        window.storageSet = async (data) => Object.assign(window.stored, structuredClone(data));
        window.isAwaitingShipmentPage = () => true;
        window.parseAwaitingResultsCount = () => 0;
        window.runtimeMessage = async (msg) => {
          if (msg.type !== 'currentTabInfo') throw new Error('Recovery must never dispatch a shipment');
          return { ok: true, tabId: 29 };
        };
        window.syncs = 0;
        window.syncMarkShippedRecord = async () => { window.syncs++; return { ok: true }; };
        window.dismissAnyMarkShippedConfirmation = async () => {};
        window.renderStatus = (text) => { document.getElementById('status').textContent = text; };
        window.U.claimWorkflowStart = async () => {
          if (window.stored.pendingMarkShippedRun?.active) throw new Error('Still busy');
          return 'fixture-reservation';
        };
        window.U.releaseWorkflowStart = async () => {};
        window.scanHealthPage = () => { window.nextScanStarted = true; };
        window.nextScanStarted = false;
      }, phase);
      await page.addScriptTag({ content: [
        'markShippedCompletionEvidence', 'recoverableMarkShippedCompletion', 'isMarkShippedOwnerPage',
        'reconcilePendingMarkShippedCompletion', 'finalizePendingMarkShipped', 'finishPendingMarkShipped',
        'saveMarkShippedResult', 'startSellerLevelScan'
      ].map((name) => extract(ebay, name)).join('\n') });
      assert.equal(await page.evaluate(() => reconcilePendingMarkShippedCompletion()), false, 'Empty table alone cannot complete');
      await page.evaluate(() => {
        document.getElementById('result').textContent = '4 orders have been marked as shipped.';
        document.getElementById('next').onclick = () => startSellerLevelScan();
      });
      await page.locator('#next').click();
      await page.waitForFunction(() => window.nextScanStarted);
      assert.equal(await page.evaluate(() => window.stored.pendingMarkShippedRun), null);
      assert.equal(await page.evaluate(() => window.stored.lastMarkShippedResult.markedCount), 4);
      assert.equal(await page.evaluate(() => window.syncs), 1);
      await page.screenshot({ path: path.join(evidence, `recovered-${phase}.png`) });
      results.push({ name: `${phase}: late success unlocks Seller Level without resubmission`, pass: true });
    }
    const report = { syntheticBrowserFixture: true, signedInMarketplace: false, results };
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
