const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const ebay = fs.readFileSync(path.join(root, 'extension', 'ebay.js'), 'utf8');
const amazon = fs.readFileSync(path.join(root, 'extension', 'amazon.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const ecomSniper = fs.readFileSync(path.join(root, 'extension', 'ecomsniper.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'extension', 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'extension', 'popup.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));

test('EcomSniper integration is a status-only handoff, not private UI automation', () => {
  assert.match(ecomSniper, /EcomSniper status only/);
  assert.match(ecomSniper, /GLDN does not run Extract Sellers, Scanner, Product Hunter, Bulk Poster, or listing controls/);
  assert.match(ecomSniper, /Internal processing status is unknown/);
  assert.doesNotMatch(ecomSniper, /MutationObserver/);
  assert.doesNotMatch(ecomSniper, /\.click\(\)/);
  assert.doesNotMatch(ebay, /clickEcomSniperButtonSemantically/);
  assert.doesNotMatch(ebay, /completeEcomSniperExtractStep/);
});

test('GLDN opens only the configured EcomSniper extension pages and records tab lifecycle', () => {
  assert.match(background, /const ECOMSNIPER_EXTENSION_ID/);
  assert.match(background, /const ECOMSNIPER_PAGE_CANDIDATES/);
  assert.match(background, /competitorScanner: '6c6aa5ed\/index\.html'/);
  assert.match(background, /productHunter: 'a6c45e6f\/product_finder\.html'/);
  assert.match(background, /bulkPoster: 'bb148b3c\/bulk_post_settings\.html'/);
  assert.match(background, /async function resolveEcomSniperPage/);
  assert.match(background, /function ecomSniperPageRendered/);
  assert.match(background, /titlePattern\.test\(title\)/);
  assert.match(background, /ecomSniperHandoffStatus:\s*\{/);
  assert.match(background, /renderVerified: true/);
  assert.match(background, /observableScope: 'tab-lifecycle-only'/);
  assert.match(background, /chrome\.tabs\?\.onRemoved\?\.addListener/);
  assert.match(popupJs, /openEcomSniperPage\('competitorScanner'/);
  assert.match(popupJs, /openEcomSniperPage\('productHunter'/);
});

test('Stop Handoff closes only the exact GLDN-opened EcomSniper tab', () => {
  assert.match(popupHtml, /id="stopEcomSniperAssist"/);
  assert.match(popupJs, /getElementById\('stopEcomSniperAssist'\)\.addEventListener/);
  assert.match(popupJs, /type: 'stopEcomSniperHandoff'/);
  assert.match(background, /async function stopEcomSniperHandoff\(\)/);
  assert.match(background, /const expectedPrefix = `chrome-extension:\/\/\$\{ECOMSNIPER_EXTENSION_ID\}\//);
  assert.match(background, /!String\(tab\.url \|\| ''\)\.startsWith\(expectedPrefix\)/);
  assert.match(background, /await closeChromeTab\(tabId\)/);
  assert.match(background, /closeReason: 'operator-stop'/);
  assert.match(background, /message\.type === 'stopEcomSniperHandoff'/);
});

test('handoff monitor reports only GLDN-observable open and closed state', () => {
  assert.match(popupHtml, /id="ecomSniperMonitorCard"/);
  assert.match(popupHtml, /id="refreshEcomSniperMonitor"/);
  assert.match(popupJs, /function renderEcomSniperMonitor\(result = \{\}\)/);
  assert.match(popupJs, /Internal EcomSniper progress is unknown/);
  assert.match(popupJs, /Closing the tab does not prove completion/);
  assert.doesNotMatch(popupJs, /Bulk Poster (?:running|complete|completed)/i);
});

test('Product Hunter handoff filters unsupported titles and preflights the rest before EcomSniper', () => {
  assert.match(popupJs, /FOUNDATION\.filterBulkProductTitles\(copied\)/);
  assert.match(popupJs, /LISTING_PREFLIGHT\.evaluateRows/);
  assert.match(popupJs, /pendingListingPreflightInput/);
  assert.match(popupJs, /Product Hunter was not opened/);
  assert.match(popupJs, /navigator\.clipboard\.writeText\(readyPayload\)/);
  assert.match(popupJs, /openEcomSniperPage\('productHunter'/);
  assert.match(amazon, /return FOUNDATION\.allowedBulkProductTitle\(title\)/);
});

test('removed bulk-list automation cannot be started from the popup or Amazon', () => {
  assert.doesNotMatch(popupHtml, /id="startBulkListingWorkflow"/);
  assert.doesNotMatch(popupJs, /pendingAmazonBulkWorkflowStart:\s*\{\s*active:\s*true/);
  assert.doesNotMatch(amazon, /pendingAmazonBulkWorkflowStart\?\.active[\s\S]{0,160}startBulkLinksFromAmazon\(\)/);
});

test('status-only handoff never uses debugger or extension-management APIs', () => {
  assert.ok(!manifest.permissions.includes('management'));
  assert.doesNotMatch(ecomSniper, /chrome\.debugger|Input\.dispatchMouseEvent/);
  const entry = manifest.content_scripts.find((item) => item.js.includes('ecomsniper.js'));
  assert.ok(entry);
  assert.deepEqual(entry.matches, ['https://ecomsniper.io/*']);
});
