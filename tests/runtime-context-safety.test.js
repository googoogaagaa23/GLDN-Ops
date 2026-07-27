const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const shared = fs.readFileSync('extension/shared.js', 'utf8');
const ebay = fs.readFileSync('extension/ebay.js', 'utf8');
const amazon = fs.readFileSync('extension/amazon.js', 'utf8');
const poshmark = fs.readFileSync('extension/poshmark.js', 'utf8');
const background = fs.readFileSync('extension/background.js', 'utf8');
const profitBackfillBackground = fs.readFileSync('extension/profit-backfill-background.js', 'utf8');
const popup = fs.readFileSync('extension/popup.js', 'utf8');
const walmart = fs.readFileSync('extension/walmart.js', 'utf8');
const ecomSniper = fs.readFileSync('extension/ecomsniper.js', 'utf8');
const universal = fs.readFileSync('extension/universal.js', 'utf8');

test('shared observers and listeners are released when an unpacked extension context is replaced', () => {
  assert.match(shared, /const extensionCleanupCallbacks = new Set\(\)/);
  assert.match(shared, /registerExtensionCleanup\(\(\) => observer\.disconnect\(\)\)/);
  assert.match(shared, /observer\.observe\(document\.documentElement, \{ childList: true, subtree: false \}\)/);
  assert.match(shared, /chrome\.storage\.onChanged\.removeListener\(appearanceListener\)/);
  assert.match(shared, /releaseOpenReviewsInNode/);
});

test('all signed-in marketplace adapters retire stale controls without refreshing unrelated work', () => {
  assert.match(ebay, /Refresh this eBay tab when you are ready/);
  assert.doesNotMatch(ebay, /gldnInvalidContextReloadAt/);
  assert.match(amazon, /Refresh this Amazon tab when you are ready/);
  assert.match(amazon, /data-gldn-context-invalidated/);
  assert.doesNotMatch(amazon, /gldnAmazonInvalidContextReloadAt/);
  assert.match(poshmark, /Refresh this Poshmark tab when you are ready/);
  assert.match(poshmark, /requirePoshmarkContext/);
  assert.doesNotMatch(poshmark, /gldnPoshmarkInvalidContextReloadAt/);
  assert.doesNotMatch(walmart, /gldnWalmartInvalidContextReloadAt/);
  assert.doesNotMatch(ecomSniper, /gldnEcomSniperInvalidContextReloadAt/);
  assert.doesNotMatch(universal, /gldnUniversalInvalidContextReloadAt/);
  for (const source of [walmart, ecomSniper, universal]) {
    assert.match(source, /Refresh this .*tab when you are ready/);
  }
});

test('extension reload targets only the requesting tab', () => {
  assert.match(background, /sourceTabId: Number\.isInteger\(sourceTabId\)/);
  assert.match(background, /reloadScope: 'requesting-tab-only'/);
  assert.doesNotMatch(background, /MARKETPLACE_TAB_PATTERNS/);
  assert.doesNotMatch(background, /Promise\.all\(tabIds\.map\(reloadTab\)\)/);
  assert.match(popup, /chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)/);
  assert.match(popup, /sourceTabId: activeTab\?\.id/);
});

test('primary workflow starts reserve shared ownership before writing active state', () => {
  assert.match(ebay, /claimWorkflowStart\("mark-shipped", "Mark as Shipped"\)/);
  assert.match(ebay, /claimWorkflowStart\("seller-level", "Seller Level scan"\)/);
  assert.match(ebay, /claimWorkflowStart\("listing-limits", "Listing limit check"\)/);
  assert.match(ebay, /claimWorkflowStart\("move99", "Move \.99"\)/);
  assert.match(amazon, /claimWorkflowStart\("sniping", "Sniping workflow"\)/);
  assert.match(poshmark, /claimWorkflowStart\("poshmark-stats", "Poshmark stats scan"\)/);
});

test('Reset clears every shared workflow key and closes the background profit worker', () => {
  assert.match(background, /const AUTOMATION_RESET_KEYS = Object\.freeze\(\[/);
  assert.match(background, /\.\.\.FOUNDATION\.workflowStateKeys/);
  assert.match(background, /PROFIT_BACKFILL_BACKGROUND\.reset\(\)/);
  assert.match(background, /storageRemove\(AUTOMATION_RESET_KEYS\)/);
  assert.match(background, /message\.type === 'resetAutomationState'/);
  assert.match(popup, /sendMessage\(\{ type: 'resetAutomationState' \}\)/);
  assert.match(shared, /message\?\.type !== 'gldnAutomationReset'/);
});

test('Reset acknowledges immediately and bounds best-effort active-tab cleanup', () => {
  assert.match(background, /const AUTOMATION_RESET_TAB_TIMEOUT_MS = 750/);
  assert.match(background, /chrome\.tabs\.query\(\{ active: true \}/);
  assert.match(background, /void broadcastAutomationReset\(sender\?\.tab\?\.id\)\.catch/);
  assert.doesNotMatch(background, /await broadcastAutomationReset\(/);
  assert.match(background, /resetAutomationState\(sender\)\.then\(sendResponse\)/);
  assert.match(background, /tabNotification: 'scheduled'/);
  assert.match(profitBackfillBackground, /const TAB_REMOVE_TIMEOUT_MS = 750/);
  assert.match(profitBackfillBackground, /await storageRemove\(\[STORAGE_KEY\]\);\s*if \(run\?\.workerTabId\) void tabRemove/);
  assert.doesNotMatch(profitBackfillBackground, /if \(run\?\.workerTabId\) await tabRemove/);
  assert.match(profitBackfillBackground, /workerClose: run\?\.workerTabId \? "scheduled" : "not-needed"/);
});

test('workflow checkpoints are versioned and stale contexts are cleared before resuming', () => {
  assert.match(background, /const VERSIONED_WORKFLOW_KEYS = Object\.freeze\(\[/);
  assert.match(background, /async function clearIncompatibleWorkflowState/);
  assert.match(background, /String\(value\.extensionVersion \|\| ''\) !== EXTENSION_VERSION/);
  assert.match(background, /clearIncompatibleWorkflowState\('worker-start'\)/);
  assert.match(background, /extensionVersion: EXTENSION_VERSION/);
  assert.match(ebay, /for \(const key of FOUNDATION\.workflowStateKeys\)/);
  assert.match(amazon, /const VERSIONED_WORKFLOW_KEYS = new Set/);
  assert.match(poshmark, /const VERSIONED_WORKFLOW_KEYS = new Set/);
  assert.match(walmart, /extensionVersion: EXTENSION_VERSION/);
});
