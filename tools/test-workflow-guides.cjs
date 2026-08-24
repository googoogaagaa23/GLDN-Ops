const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const extensionRoot = path.join(root, 'extension');
const evidenceRoot = path.join(root, 'evidence', 'workflow-guides');

(async () => {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const context = await chromium.launchPersistentContext(path.join(os.tmpdir(), `gldn-guides-${Date.now()}`), {
    headless: false,
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--window-position=-32000,-32000',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });
  const pageErrors = [];
  const watch = (page) => page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  context.pages().forEach(watch);
  context.on('page', watch);

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup.setViewportSize({ width: 430, height: 720 });
  await popup.locator('[data-popup-tab="guides"]').click();
  await popup.locator('[data-gldn-guide-directory] .gldn-guide-directory-item').first().waitFor();
  const guideCount = await popup.locator('[data-gldn-guide-directory] .gldn-guide-directory-item').count();
  if (guideCount !== 29) throw new Error(`Expected 29 workflow guides, found ${guideCount}.`);
  await popup.locator('.gldn-guide-search').fill('Mark as Shipped');
  const filteredTitles = await popup.locator('.gldn-guide-directory-item strong').allTextContents();
  if (!filteredTitles.includes('Mark as Shipped')) throw new Error('Guide search did not return Mark as Shipped.');
  await popup.screenshot({ path: path.join(evidenceRoot, 'popup-guides.png'), fullPage: true });

  await popup.locator('[data-popup-tab="workflows"]').click();
  const contextual = popup.locator('.gldn-guide-action-row:has(#openOrderPlacementAuditQuick) .gldn-guide-icon-button');
  await contextual.waitFor();
  const guidePagePromise = context.waitForEvent('page');
  await contextual.click();
  const guidePage = await guidePagePromise;
  await guidePage.waitForLoadState('domcontentloaded');
  const target = guidePage.locator('#order-placement-audit');
  await target.waitFor();
  if (!await target.evaluate((element) => element.open === true)) throw new Error('Contextual guide target did not open.');
  await guidePage.screenshot({ path: path.join(evidenceRoot, 'contextual-guide.png'), fullPage: false });

  const auditPage = await context.newPage();
  await auditPage.goto(`chrome-extension://${extensionId}/order-audit.html`, { waitUntil: 'domcontentloaded' });
  const inlineGuide = auditPage.locator('[data-gldn-inline-guide="order-placement-audit"] details');
  await inlineGuide.waitFor();
  await inlineGuide.locator('summary').click();
  await auditPage.locator('.gldn-inline-guide-section.approval').waitFor();
  await auditPage.screenshot({ path: path.join(evidenceRoot, 'inline-order-audit-guide.png'), fullPage: true });

  const result = {
    ok: pageErrors.length === 0,
    extensionId,
    guideCount,
    filteredTitles,
    screenshots: [
      path.join(evidenceRoot, 'popup-guides.png'),
      path.join(evidenceRoot, 'contextual-guide.png'),
      path.join(evidenceRoot, 'inline-order-audit-guide.png')
    ],
    pageErrors
  };
  await context.close();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
})().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
