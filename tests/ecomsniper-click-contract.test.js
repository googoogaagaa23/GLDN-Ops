const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const ebay = fs.readFileSync(path.join(root, "extension", "ebay.js"), "utf8");
const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const foundation = fs.readFileSync(path.join(root, "extension", "foundation.js"), "utf8");
const amazon = fs.readFileSync(path.join(root, "extension", "amazon.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
const ecomSniper = fs.readFileSync(path.join(root, "extension", "ecomsniper.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));

test("retired Bulk Listing automation has no runnable entry point", () => {
  assert.doesNotMatch(popupHtml, /id="startBulkListingWorkflow"/);
  assert.doesNotMatch(popupJs, /pendingAmazonBulkWorkflowStart:\s*\{\s*active:\s*true/);
  assert.doesNotMatch(amazon, /function startBulkLinksFromAmazon\(/);
  assert.doesNotMatch(amazon, /claimWorkflowStart\("bulk-links"/);
  assert.doesNotMatch(amazon, /pendingEcomSniperBulkExtract:\s*\{/);
  assert.doesNotMatch(amazon, /bulkListing:\s*\{/);
});

test("eBay startup and heartbeat cannot resume retired seller-click automation", () => {
  assert.doesNotMatch(ebay, /findEcomSniperExtractSellersButton|clickEcomSniperButtonSemantically|installEcomSniperClickWatcher|runEcomSniperRecoveryProbeFromUrl|resumePendingEcomSniperBulkExtract|resumeAfterEcomSniperClick|extractBulkSellersForProductWorkflow/);
  assert.doesNotMatch(ebay, /pendingEcomSniperBulkExtract|pendingManualEcomSniperClick|bulkLinksAmazonQueue/);
  assert.doesNotMatch(ebay, /bulkListing:\s*\{/);
});

test("update migration clears retired Bulk Listing checkpoints", () => {
  assert.match(background, /async function clearRemovedBulkAutomationState\(\)/);
  for (const key of [
    "pendingEcomSniperBulkExtract",
    "pendingManualEcomSniperClick",
    "pendingAmazonBulkWorkflowStart",
    "bulkLinksAmazonQueue"
  ]) {
    assert.match(background, new RegExp(`['\"]${key}['\"]`));
    assert.doesNotMatch(foundation, new RegExp(`add\\(['\"]${key}['\"]`));
  }
  assert.match(background, /if \(removed\.length\) await storageRemove\(removed\)/);
  assert.match(background, /findProductsWorkflow\.workflows\.bulkListing/);
});

test("handoff monitor reports only GLDN-observable state", () => {
  assert.match(popupHtml, /id="ecomSniperMonitorCard"/);
  assert.match(popupHtml, /id="refreshEcomSniperMonitor"/);
  assert.doesNotMatch(popupHtml, /id="stopEcomSniperAssist"|Verified seller counts/);
  assert.match(popupJs, /function renderEcomSniperMonitor\(result = \{\}\)/);
  assert.match(popupJs, /Internal EcomSniper progress is unknown/);
  assert.match(popupJs, /Closing the tab does not prove completion/);
  assert.match(background, /observableScope: 'tab-lifecycle-only'/);
  assert.match(background, /chrome\.tabs\?\.onRemoved\?\.addListener/);
  assert.doesNotMatch(popupJs, /Bulk Poster (?:running|complete|completed)/i);
  assert.doesNotMatch(popupJs, /Extraction done|lastEcomSniperWorkflowResult|lastEcomSniperExtractResult/);
  assert.doesNotMatch(popupJs, /stop-requested|GLDN Assist will stop/);
});

test("EcomSniper page integration is read-only", () => {
  assert.ok(manifest.content_scripts.some((entry) => (entry.js || []).includes("ecomsniper.js")));
  assert.match(ecomSniper, /EcomSniper status only/);
  assert.match(ecomSniper, /GLDN does not run Extract Sellers, Scanner, Product Hunter, Bulk Poster, or listing controls/);
  assert.doesNotMatch(ecomSniper, /lastEcomSniperExtractResult|lastEcomSniperWorkflowResult|verified seller extraction/i);
  assert.doesNotMatch(ecomSniper, /\.click\(|MouseEvent|setNativeValue|runCompetitorScanner|prepProductHunter/);
});

test("read-only mode needs no debugger, extension management, or local helper", () => {
  assert.ok(!manifest.permissions.includes("debugger"));
  assert.ok(!manifest.permissions.includes("management"));
  assert.doesNotMatch(ecomSniper, /local helper/i);
});
