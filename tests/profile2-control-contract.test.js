const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const ebay = fs.readFileSync(path.join(root, 'extension', 'ebay.js'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8');
const heartbeat = fs.readFileSync(path.join(root, 'extension', 'control-heartbeat.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'extension', 'popup.html'), 'utf8');
const onboarding = fs.readFileSync(path.join(root, 'extension', 'onboarding.html'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'extension', 'guide.html'), 'utf8');
const listingPreflightPage = fs.readFileSync(path.join(root, 'extension', 'listing-preflight.js'), 'utf8');
const foundation = fs.readFileSync(path.join(root, 'extension', 'foundation.js'), 'utf8');
const control = fs.readFileSync(path.join(root, 'tools', 'gldn-control.ps1'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'tools', 'gldn-update-agent.ps1'), 'utf8');

test('Profile 2 control exposes the reverse Store-category scan without a submit action', () => {
  assert.match(agent, /"start-move99-reverse-scan"/);
  assert.match(background, /'start-move99-reverse-scan'/);
  assert.match(ebay, /"start-move99-reverse-scan": \(\) => startMove99Listings\("non99"\)/);
});

test('Profile 2 control exposes a read-only Move .99 DOM inspection path', () => {
  assert.match(control, /"InspectMove99"/);
  assert.match(control, /action = "inspect-move99"/);
  assert.match(agent, /"inspect-move99"/);
  assert.match(background, /async function inspectLocalControlMove99/);
  assert.match(background, /type: 'inspectEbayMove99Dom'/);
  assert.match(background, /case 'inspect-move99': return inspectLocalControlMove99/);
  assert.match(ebay, /message\?\.type === "inspectEbayMove99Dom"/);
  assert.match(ebay, /function inspectMove99Dom\(\)/);
  assert.match(ebay, /nativeSelection: nativeBulkSelectionSummary\(\)/);
  assert.doesNotMatch(
    ebay.slice(ebay.indexOf('function inspectMove99Dom()'), ebay.indexOf('async function recordMove99Diagnostic')),
    /clickElement|dispatchFullClick|location\.(?:assign|replace)/
  );
});

test('stalled Category shells get one bounded retry with selected-count revalidation', () => {
  assert.match(ebay, /async function closeStalledCategoryEditor\(\)/);
  assert.match(ebay, /async function openBulkCategoryEditor\(expectedCount, attempt\)/);
  assert.match(ebay, /for \(let attempt = 1; attempt <= 2; attempt \+= 1\)/);
  assert.match(ebay, /attempt === 1 \? 45000 : 90000/);
  assert.match(ebay, /nativeBeforeMenu\.selected !== expectedCount/);
  assert.match(ebay, /Category editor shell stalled; closing and retrying once/);
});

test('unusable Category batches are deferred and cannot loop into another exact workspace', () => {
  assert.match(ebay, /function move99DeferredItemIds\(state = null\)/);
  assert.match(ebay, /function deferMove99StalledBatch\(state, reason = ""\)/);
  assert.match(ebay, /isMove99DeferrableBatchFailure\(error\) && canRecoverMove99FirstBatchFromVerifiedScan/);
  assert.match(ebay, /buildMove99ExactBatches\(sourcePages, MOVE99_BULK_BATCH_LIMIT, move99DeferredItemIds\(state\)\)/);
  assert.match(ebay, /excludedItemIds instanceof Set/);
  assert.match(ebay, /new Set\(\[\.\.\.MOVE99_BACKBURNER_ITEM_IDS, \.\.\.dynamicExclusions\]\)/);
  assert.match(ebay, /location\.replace\(move99ScanPageUrl\(1, recoveredState\.filteredUrl \|\| MOVE99_ACTIVE_URL\)\)/);
});

test('zero-row Bulk Edit workspaces settle quickly and defer the exact batch', () => {
  assert.match(ebay, /allowZeroOmitted = false/);
  assert.match(ebay, /explicitOmissions === expected \? 2500 : 20000/);
  assert.match(ebay, /source: explicitOmissions === expected \? "omission-notice" : "zero-admission"/);
  assert.match(ebay, /allowZeroOmitted: true/);
  assert.match(ebay, /eBay admitted 0 of \$\{expectedCount\.toLocaleString\(\)\} listings into Bulk Edit/);
  assert.match(ebay, /admitted 0 of \[\\d,\]\+ listings\? into Bulk Edit/);
});

test('FAK12 built-in backburner includes the four proven persistent failures', () => {
  for (const itemId of ['318572900833', '318576390693', '318576892301', '318601468678']) {
    assert.match(ebay, new RegExp(`"${itemId}"`));
  }
});

test('Profile 2 control can safely navigate the existing signed-in tab without opening another profile', () => {
  assert.match(control, /"Navigate"/);
  assert.match(control, /action = "navigate-tab"/);
  assert.match(agent, /"navigate-tab"/);
  assert.match(background, /async function navigateLocalControlTab/);
  assert.match(background, /case 'navigate-tab': return navigateLocalControlTab/);
});

test('Profile 2 control opens only approved GLDN Ops pages without Windows URL inference', () => {
  assert.match(manifest, /"tabs"/);
  assert.match(control, /"OpenExtension"/);
  assert.match(control, /action = "open-extension-page"/);
  assert.match(control, /ValidateSet\("", "popup", "onboarding", "guide", "variations", "policyaudit", "preflight"\)/);
  assert.match(agent, /"open-extension-page"/);
  assert.match(agent, /\$page -notin @\("popup", "onboarding", "guide", "variations", "policyaudit", "preflight"\)/);
  assert.match(background, /const LOCAL_CONTROL_EXTENSION_PAGES = Object\.freeze/);
  assert.match(background, /popup: 'popup\.html'/);
  assert.match(background, /onboarding: 'onboarding\.html'/);
  assert.match(background, /guide: 'guide\.html'/);
  assert.match(background, /variations: 'variation-audit\.html'/);
  assert.match(background, /policyaudit: 'policy-listing-audit\.html'/);
  assert.match(background, /preflight: 'listing-preflight\.html'/);
  assert.match(background, /runLocalControlListingPreflight/);
  assert.match(background, /if \(opened\.reused\) \{[\s\S]*reloadChromeTab\(opened\.tab\.id\)/);
  assert.match(background, /gldnListingPreflightDiagnostic/);
  assert.match(background, /pageCommand\('handoff'\)/);
  assert.doesNotMatch(background.slice(background.indexOf('async function runLocalControlListingPreflight'), background.indexOf('async function openLocalControlDashboard')), /chrome\.scripting\.executeScript/);
  assert.match(listingPreflightPage, /visibleDiagnosticState/);
  assert.match(background, /uiSummaryMatches/);
  assert.match(background, /opened Bulk Poster/);
  assert.match(control, /listing-preflight-proof/);
  assert.match(agent, /listing-preflight-proof/);
  assert.match(background, /runLocalControlEcomSniperHandoffProof/);
  assert.match(background, /ecomSniperPageRendered\('competitorScanner'/);
  assert.match(background, /ecomSniperPageRendered\('productHunter'/);
  assert.match(background, /renderVerified: true/);
  assert.match(control, /ecomsniper-handoff-proof/);
  assert.match(agent, /ecomsniper-handoff-proof/);
  assert.match(background, /privateProcessingClaimed: false/);
  assert.match(background, /chrome\.runtime\.getURL\(path\)/);
  assert.match(background, /case 'open-extension-page': return openLocalControlExtensionPage/);
});

test('Profile 2 control reports the actual tab URL and structured verification', () => {
  assert.match(control, /"InspectTab"/);
  assert.match(control, /action = "inspect-tab"/);
  assert.match(agent, /"inspect-tab"/);
  assert.match(background, /async function waitForControlTabSettled/);
  assert.match(background, /function verifiedControlTab/);
  assert.match(background, /allowedTarget: Boolean\(summary\.platform\)/);
  assert.match(background, /exactUrl: requestedUrl \? controlUrlsEqual/);
  assert.match(background, /case 'inspect-tab': return inspectLocalControlTab/);
});

test('Profile 2 can reload only the exact preserved Move .99 approval workspace', () => {
  assert.match(background, /async function assertSafeLocalControlTabReload/);
  assert.match(background, /status\.workflows\.length === 1/);
  assert.match(background, /status\.workflows\[0\]\?\.key === 'pendingMove99Run'/);
  assert.match(background, /status\.workflows\[0\]\?\.phase === 'awaiting-submit-approval'/);
  assert.match(background, /batchIds\.length === expectedCount/);
  assert.match(background, /Number\(pending\?\.categoryUpdate\?\.updated \|\| 0\) === expectedCount/);
  assert.match(background, /Number\(pending\?\.approvalTabId \|\| 0\) === Number\(tab\?\.id \|\| 0\)/);
  assert.match(background, /controlUrlsEqual\(tab\?\.url, pending\?\.approvalUrl\)/);
  assert.match(background, /isExactMove99ReviewUrl\(tab\?\.url, workspaceId\)/);
  assert.match(background, /liveSourceWorkspaces\.length === 1/);
  assert.match(background, /!openIds\.has\(Number\(pending\?\.approvalTabId \|\| 0\)\)/);
  assert.match(background, /await assertSafeLocalControlTabReload\(tab\)/);
  assert.match(background, /reinjectMove99/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /'foundation\.js'[\s\S]*'ebay\.js'/);
});

test('Profile 2 can recover only the exact durable Poshmark review tab', () => {
  assert.match(background, /function poshmarkBackfillReviewRunIdFromUrl/);
  assert.match(background, /url\.searchParams\.get\('gldn_backfill_review'\)/);
  assert.match(background, /async function exactPoshmarkReviewReloadPolicy/);
  assert.match(background, /status\.workflows\.length === 2/);
  assert.match(background, /reviewWorkflows\[0\]\?\.phase === 'review-open'/);
  assert.match(background, /backfillWorkflows\[0\]\?\.phase === 'review'/);
  assert.match(background, /tabRunId === runId/);
  assert.match(background, /Number\(run\?\.workerTabId \|\| 0\) === Number\(tab\?\.id \|\| 0\)/);
  assert.match(background, /results\.length === sales\.length/);
  assert.match(background, /sales\.every\(\(sale\) => Boolean\(sale\?\.detailCapturedAt\)\)/);
  assert.match(background, /requiredApprovalCount === Number\(compact\?\.remainingReviewToSync \|\| 0\)/);
  assert.match(background, /liveReviews\.length !== 1 \|\| exactReviews\.length !== 1/);
  assert.match(background, /checkpointBefore === JSON\.stringify\(after\.poshmarkProfitBackfill \|\| null\)/);
  assert.match(background, /releasedReviewCount: release\.released/);
  assert.match(background, /recoveredReview: true/);
});

test('Profile 2 cleanup cannot close marketplace work', () => {
  assert.match(control, /"CloseTab"/);
  assert.match(control, /action = "close-tab"/);
  assert.match(agent, /"close-tab"/);
  assert.match(background, /async function closeLocalControlTab/);
  assert.match(background, /\['gldn', 'dashboard'\]\.includes\(summary\.platform\)/);
  assert.match(background, /case 'close-tab': return closeLocalControlTab/);
});

test('Profile 2 control owns dashboard navigation and safe extension checks', () => {
  assert.match(control, /"OpenDashboard"/);
  assert.match(control, /action = "open-dashboard"/);
  assert.match(control, /"ExtensionAction"/);
  assert.match(control, /action = "extension-action"/);
  assert.match(agent, /"health-check", "dashboard-test", "dashboard-retry", "dashboard-setup"/);
  assert.match(background, /async function openLocalControlDashboard/);
  assert.match(background, /async function runLocalControlExtensionAction/);
  assert.match(background, /case 'open-dashboard': return openLocalControlDashboard/);
  assert.match(background, /case 'extension-action': return runLocalControlExtensionAction/);
  assert.match(background, /url\.searchParams\.set\(key, 'REDACTED'\)/);
});

test('Profile 2 control syncs monthly eBay profit only with the exact reviewed token', () => {
  assert.match(control, /"sync-ebay-monthly-profit"/);
  assert.match(agent, /"sync-ebay-monthly-profit"/);
  assert.match(control, /confirmationToken = \$ConfirmationToken/);
  assert.match(agent, /confirmationToken = \$confirmationToken/);
  assert.match(agent, /\^APPROVE SYNC EBAY \\d\{4\}-\(\?:0\[1-9\]\|1\[0-2\]\) \[1-9\]\\d\*\$/);
  assert.match(background, /'sync-ebay-monthly-profit'/);
  assert.match(background, /\^APPROVE SYNC EBAY \\d\{4\}-\(\?:0\[1-9\]\|1\[0-2\]\) \[1-9\]\\d\*\$/);
  assert.match(background, /syncReviewedEbayMonthlyProfit\(confirmationToken\)/);
});

test('Profile 2 control starts the read-only eBay Amazon-cost resolver for one exact month', () => {
  assert.match(control, /"start-ebay-amazon-resolution"/);
  assert.match(control, /start-ebay-amazon-resolution requires -MonthKey YYYY-MM/);
  assert.match(agent, /"start-ebay-amazon-resolution"/);
  assert.match(agent, /monthKey = \$monthKey/);
  assert.match(background, /'start-ebay-amazon-resolution'/);
  assert.match(background, /scope: 'resolve-ebay'/);
  assert.match(background, /maxOrders: 100/);
});

test('Profile 2 control can seed, run, resume, and read the cross-profile order-placement audit without marketplace writes', () => {
  for (const action of [
    'set-amazon-profile-label',
    'seed-order-placement-audit',
    'start-order-placement-audit-amazon',
    'read-order-placement-audit',
    'resume-order-placement-audit-amazon'
  ]) {
    assert.match(control, new RegExp(action));
    assert.match(agent, new RegExp(action));
    assert.match(background, new RegExp(`'${action}'`));
  }
  const actionSource = background.slice(
    background.indexOf("if (action === 'seed-order-placement-audit')"),
    background.indexOf("if (action === 'sync-ebay-monthly-profit')")
  );
  assert.match(actionSource, /seedExpectedFromMonthlyRun/);
  assert.match(actionSource, /startAmazonScan/);
  assert.match(actionSource, /ORDER_AUDIT_BACKGROUND\.resume/);
  assert.match(actionSource, /lastAmazonSubscribeSaveResult/);
  assert.match(actionSource, /lastPreparedNote\?\.payload\?\.profileLabel/);
  assert.match(actionSource, /latestMarketplaceProfit\?\.supplierProfile/);
  assert.match(actionSource, /supplierProfile: amazonProfileLabel/);
  assert.match(control, /AmazonProfileLabel/);
  assert.match(agent, /amazonProfileLabel = \(\[string\]\$value\.amazonProfileLabel\)\.Trim\(\)/);
  assert.match(agent, /"amazonProfileLabel"/);
  assert.match(agent, /"orderPlacementAuditAmazonScan"/);
  assert.match(background, /await storageSet\(\{ amazonProfileLabel \}\)/);
  assert.match(actionSource, /readShared/);
  assert.doesNotMatch(actionSource, /click|submit|cancel|refund|mark.*ship/i);
});

test('Profile 2 control exposes a bounded read-only Amazon-cost reconciliation review', () => {
  assert.match(control, /"ReadProfitBackfillReview"/);
  assert.match(control, /action = "read-profit-backfill-review"/);
  assert.match(agent, /"read-profit-backfill-review"/);
  assert.match(background, /async function readLocalControlProfitBackfillReview/);
  assert.match(background, /case 'read-profit-backfill-review': return readLocalControlProfitBackfillReview/);
  assert.match(background, /candidates = \(run\.purchases \|\| \[\]\)/);
});

test('Profile 2 control launches automated variation discovery without an End action', () => {
  assert.match(control, /"variation-scan"/);
  assert.match(agent, /"variation-scan"/);
  const action = background.slice(
    background.indexOf("if (action === 'variation-scan')"),
    background.indexOf('const result = await seedDashboardSetupFromLocalConfig')
  );
  assert.match(action, /scanEbayVariationListings/);
  assert.match(action, /prepareEbayVariationEndReview/);
  assert.match(action, /APPROVE END VARIATIONS/);
  assert.doesNotMatch(action, /submitEbayVariationEndReview/);
});

test('visible Profile 2 pages wake local control without waiting for the 30-second alarm', () => {
  assert.match(background, /message\.type === 'gldnLocalControlHeartbeat'/);
  assert.match(background, /respondToExtensionMessage\(pollLocalControl\(\), sendResponse, 'local-control-heartbeat'\)/);
  assert.match(heartbeat, /document\.visibilityState !== 'visible'/);
  assert.match(heartbeat, /HEARTBEAT_MS = 2000/);
  assert.match(heartbeat, /type: 'gldnLocalControlHeartbeat'/);
  assert.equal((manifest.match(/"control-heartbeat\.js"/g) || []).length, 6);
  for (const html of [popup, onboarding, guide]) {
    assert.match(html, /<script src="control-heartbeat\.js"><\/script>/);
  }
});

test('background feature messages always return a guarded async failure response', () => {
  assert.match(background, /function respondToExtensionMessage\(promise, sendResponse, operation\)/);
  assert.match(background, /source: 'background-message'/);
  assert.match(background, /sendResponse\(\{ ok: false, error: message \}\)/);
  assert.doesNotMatch(background, /\.then\(sendResponse\);/);
  for (const operation of [
    'claim-move99-tab',
    'create-move99-workspace',
    'sync-seller-level',
    'sync-account-limits',
    'sync-mark-shipped',
    'sync-ebay-snapshot',
    'sync-marketplace-profit-batch',
    'open-ecomsniper-page',
    'open-amazon-order-search',
    'extension-health-check',
    'dashboard-queue-status',
    'test-dashboard-connection'
  ]) {
    assert.match(background, new RegExp(`'${operation}'`));
  }
});

test('eBay page requests use the shared bounded runtime channel', () => {
  assert.match(ebay, /const runtimeMessage = \(message, timeoutMs = 30000\) => U\.runtimeMessage\(message, timeoutMs\)/);
  assert.doesNotMatch(ebay, /const runtimeMessage = \(message\) => new Promise/);
});

test('background control can save only the open GLDN eBay snapshot review', () => {
  assert.match(background, /'save-sales-snapshot-review'/);
  assert.match(agent, /"save-sales-snapshot-review"/);
  assert.match(ebay, /"save-sales-snapshot-review": saveOpenEbaySnapshotReview/);
  assert.match(ebay, /clickExactOpenEbayReview\("gldn-ebay-snapshot-preview", "button\[data-action='save'\]", "Save eBay Snapshot"\)/);
  assert.match(background, /'latestEbaySnapshot'/);
  assert.match(agent, /"latestEbaySnapshot"/);
});

test('background control can confirm reviewed seller metrics and listing limits', () => {
  assert.match(background, /'save-seller-level-review'/);
  assert.match(background, /'save-listing-limits-review'/);
  assert.match(agent, /"save-seller-level-review"/);
  assert.match(agent, /"save-listing-limits-review"/);
  assert.match(ebay, /"save-seller-level-review": saveOpenSellerLevelReview/);
  assert.match(ebay, /"save-listing-limits-review": saveOpenListingLimitsReview/);
  assert.match(ebay, /clickExactOpenEbayReview\("gldn-health-preview", "button\[data-action='save-health'\]", "Save Seller Level Check"\)/);
  assert.match(ebay, /clickExactOpenEbayReview\("gldn-listings-preview", "button\[data-action='confirm-listings'\]", "Confirm Listings Under Limit"\)/);
});

test('stale Chrome tab IDs recover only through one exact approved URL', () => {
  assert.match(background, /if \(!\/No tab with id\|no longer open\/i/);
  assert.match(background, /controlUrlsEqual\(candidate\.url, requestedUrl\)/);
  assert.match(background, /An exact URL is required/);
  assert.match(control, /url = \$Url[\s\S]*waitMs = 3500/);
  assert.match(agent, /Page actions can recover only an exact approved HTTPS URL/);
});

test('live feature readback exposes the keys that the content scripts actually save', () => {
  for (const key of ['latestAccountHealth', 'latestEbaySnapshot', 'latestListingStatus', 'latestPoshmarkStats', 'latestPoshmarkVisibleSales', 'latestMarketplaceProfit']) {
    assert.match(background, new RegExp(`'${key}'`));
    assert.match(agent, new RegExp(`"${key}"`));
    assert.match(control, new RegExp(`"${key}"`));
  }
});

test('large Move .99 checkpoints are compacted before local-control readback', () => {
  assert.match(background, /state\.pendingMove99Run = FOUNDATION\.compactMove99ControlRecord\(state\.pendingMove99Run\)/);
  assert.match(background, /if \(Array\.isArray\(state\.gldnErrorLog\)\) state\.gldnErrorLog = state\.gldnErrorLog\.slice\(0, 25\)/);
});

test('large Poshmark profit checkpoints are compacted before local-control readback', () => {
  assert.match(background, /state\.poshmarkProfitBackfill = FOUNDATION\.compactPoshmarkProfitBackfillControlRecord\(state\.poshmarkProfitBackfill\)/);
  assert.match(foundation, /matchingDiagnostics/);
  assert.match(foundation, /salesWithCapturedAsin/);
  assert.match(foundation, /purchasesMissingDate/);
  assert.match(background, /state: FOUNDATION\.fitControlStateToBudget\(state\)/);
});

test('Profile 2 control can start one validated Poshmark calendar month without saving it', () => {
  assert.match(control, /\[string\]\$MonthKey = ""/);
  assert.match(control, /monthKey = \$MonthKey/);
  assert.match(agent, /"start-historical-profit-month"/);
  assert.match(agent, /Historical-profit month start requires a valid YYYY-MM month/);
  assert.match(background, /'start-historical-profit-month'/);
  assert.match(background, /pageMessage\.monthKey = monthKey/);
  const pageActionBlock = background.slice(
    background.indexOf('async function runLocalControlPageAction'),
    background.indexOf('async function executeLocalControlCommand')
  );
  assert.match(pageActionBlock, /const monthKey = String\(payload\.monthKey \|\| ''\)\.trim\(\)/);
  assert.match(pageActionBlock, /action === 'start-historical-profit-month'/);
  const move99ApprovalBlock = background.slice(
    background.indexOf('async function approveLocalControlMove99FinalReview'),
    background.indexOf('async function openLocalControlExtensionPage')
  );
  assert.doesNotMatch(move99ApprovalBlock, /start-historical-profit-month|monthKey/);
  assert.match(
    fs.readFileSync(path.join(root, 'extension', 'poshmark.js'), 'utf8'),
    /"start-historical-profit-month": \(\) => startHistoricalProfitBackfill\("month", message\.monthKey\)/
  );
});

test('Profile 2 page actions repair one missing packaged content-script receiver', () => {
  assert.match(background, /const LOCAL_CONTROL_CONTENT_FILES = Object\.freeze/);
  assert.match(background, /receiving end does not exist\|could not establish connection/i);
  assert.match(background, /chrome\.scripting\.executeScript\(\{ target: \{ tabId: tab\.id \}, files \}\)/);
  assert.match(background, /accepted = await sendTabMessage\(tab\.id, pageMessage, pageActionOptions\)/);
});

test('historical-profit approval waits for the complete durable dashboard save', () => {
  assert.match(background, /HISTORICAL_PROFIT_PAGE_ACTION_TIMEOUT_MS = 360000/);
  assert.match(background, /action === 'approve-historical-profit-review'[\s\S]{0,120}timeoutMs: HISTORICAL_PROFIT_PAGE_ACTION_TIMEOUT_MS/);
  assert.match(background, /sendTabMessage\(tab\.id, pageMessage, pageActionOptions\)/);
  assert.match(background, /amazon:[\s\S]{0,500}approve-historical-profit-review/);
  assert.match(background, /RESOLVE \(\?:POSHMARK\|EBAY\) COSTS/);
});

test('Profile 2 can resume a discarded Poshmark month worker from its saved checkpoint', () => {
  assert.match(agent, /poshmark = @\([^\r\n]*"resume-historical-profit"/);
  assert.match(background, /'resume-historical-profit'/);
  assert.match(
    fs.readFileSync(path.join(root, 'extension', 'poshmark.js'), 'utf8'),
    /"resume-historical-profit": resumeHistoricalProfitBackfill/
  );
});

test('Profile 2 state readback exposes preservation evidence without the dashboard secret', () => {
  for (const key of [
    'settingsSchemaVersion',
    'gldnUiOpacity',
    'gldnUiTheme',
    'move99AccountSettings',
    'dashboardConfigurationStatus'
  ]) {
    assert.match(background, new RegExp(`'${key}'`));
    assert.match(agent, new RegExp(`"${key}"`));
    assert.match(control, new RegExp(`"${key}"`));
  }
  assert.match(background, /configured: urlConfigured && keyConfigured/);
  assert.match(background, /delete state\[DASHBOARD_URL_KEY\]/);
  assert.match(background, /delete state\[DASHBOARD_SECRET_KEY\]/);
  const allowedKeys = background.slice(
    background.indexOf('const LOCAL_CONTROL_STATE_KEYS'),
    background.indexOf('function queryTabs')
  );
  assert.doesNotMatch(allowedKeys, /sellerDashboardKey/);
  assert.match(control, /\[string\]\$_ -split ','/);
});

test('Profile 2 state readback exposes the read-only listing-policy audit result', () => {
  for (const key of [
    'ebayPolicyListingScanState',
    'ebayPolicyListingAudit',
    'pendingPolicyListingEndReview',
    'lastPolicyListingEndResult'
  ]) {
    assert.match(background, new RegExp(`'${key}'`));
    assert.match(control, new RegExp(`"${key}"`));
  }
});

test('background control can cancel Mark as Shipped without approving it', () => {
  assert.match(background, /'cancel-mark-shipped-review'/);
  assert.match(agent, /"cancel-mark-shipped-review"/);
  assert.match(ebay, /"cancel-mark-shipped-review": cancelOpenMarkShippedReview/);
  assert.match(ebay, /clickExactOpenEbayReview\("gldn-mark-shipped-activation-approval", "button\[data-action='cancel'\]", "Cancel safely"\)/);
});

test('Profile 2 control approves only the exact live Mark as Shipped count', () => {
  assert.match(background, /'approve-mark-shipped-review'/);
  assert.match(agent, /"approve-mark-shipped-review"/);
  assert.match(control, /ConfirmationToken/);
  assert.match(background, /\^APPROVE MARK SHIPPED \[1-9\]\\d\*\$/);
  assert.match(agent, /\^APPROVE MARK SHIPPED \[1-9\]\\d\*\$/);
  assert.match(ebay, /selectedCount !== beforeCount/);
  assert.match(ebay, /`APPROVE MARK SHIPPED \$\{selectedCount\}`/);
  assert.match(ebay, /"approve-mark-shipped-review": \(\) => approveOpenMarkShippedReview\(message\.confirmationToken\)/);
  assert.match(ebay, /clickExactOpenEbayReview\(\s*"gldn-mark-shipped-activation-approval",\s*"button\[data-action='approve'\]",\s*"Approve Mark as Shipped"\s*\)/);
});

test('Profile 2 control separately approves eBay Continue once for the exact live count', () => {
  assert.match(background, /'approve-ebay-mark-shipped-confirmation'/);
  assert.match(agent, /"approve-ebay-mark-shipped-confirmation"/);
  assert.match(background, /\^APPROVE EBAY CONTINUE \[1-9\]\\d\*\$/);
  assert.match(agent, /\^APPROVE EBAY CONTINUE \[1-9\]\\d\*\$/);
  assert.match(ebay, /`APPROVE EBAY CONTINUE \$\{selectedCount\}`/);
  assert.match(ebay, /phase:\s*"awaiting-result"/);
  assert.match(ebay, /finalActionClickCount:\s*1/);
  assert.match(ebay, /type:\s*"dispatchTrustedEbayMarkShippedContinue"/);
  assert.doesNotMatch(
    ebay.slice(
      ebay.indexOf('async function approveOpenEbayMarkShippedConfirmation'),
      ebay.indexOf('function markShippedElementDescriptor')
    ),
    /dispatchFullClick\(finalAction\)|finalAction\.click\(/
  );
  assert.match(background, /async function dispatchTrustedEbayMarkShippedContinue/);
  assert.match(background, /Input\.dispatchMouseEvent/);
  assert.match(background, /trustedFinalActionDispatchAt/);
  assert.ok(JSON.parse(manifest).permissions.includes('debugger'));
  assert.match(ebay, /"approve-ebay-mark-shipped-confirmation": \(\) => approveOpenEbayMarkShippedConfirmation\(message\.confirmationToken\)/);
});

test('Profile 2 control dispatches Move .99 Submit once for the exact approved review', () => {
  assert.match(background, /'approve-move99-submit'/);
  assert.match(agent, /"approve-move99-submit"/);
  assert.match(background, /\^APPROVE SUBMIT \[1-9\]\\d\*\$/);
  assert.match(agent, /\^APPROVE SUBMIT \[1-9\]\\d\*\$/);
  assert.match(ebay, /`APPROVE SUBMIT \$\{expectedCount\}`/);
  assert.match(ebay, /"approve-move99-submit": \(\) => approveOpenMove99Submit\(message\.confirmationToken\)/);
  assert.match(ebay, /type: "dispatchTrustedEbayMove99Submit"/);
  assert.match(background, /async function dispatchTrustedEbayMove99Submit/);
  assert.match(background, /trustedSubmitDispatchAt/);
  assert.match(background, /Input\.dispatchMouseEvent/);
  assert.match(background, /probe\.label !== `submit \(\$\{approved\.expectedCount\}\)`/);
  const approval = ebay.slice(
    ebay.indexOf('async function approveOpenMove99Submit'),
    ebay.indexOf('function markShippedElementDescriptor')
  );
  assert.doesNotMatch(approval, /submitButton\.click\(|clickElement\(submitButton\)|dispatchFullClick\(submitButton\)/);
  assert.ok(JSON.parse(manifest).permissions.includes('debugger'));
});

test('Profile 2 control can inspect and finish only the approved Move .99 Review fees stage', () => {
  assert.match(control, /"InspectMove99FinalReview"/);
  assert.match(control, /"ApproveMove99FinalReview"/);
  assert.match(control, /action = "inspect-move99-final-review"/);
  assert.match(control, /action = "approve-move99-final-review"/);
  assert.match(control, /expectedCount = \$ExpectedCount/);
  assert.match(control, /workspaceId = \$WorkspaceId/);
  assert.match(agent, /"inspect-move99-final-review"/);
  assert.match(agent, /"approve-move99-final-review"/);
  assert.match(agent, /APPROVE SUBMIT \$expectedCount/);
  assert.match(background, /case 'inspect-move99-final-review': return inspectLocalControlMove99FinalReview/);
  assert.match(background, /case 'approve-move99-final-review': return approveLocalControlMove99FinalReview/);
  assert.match(background, /async function inspectTrustedMove99FinalReview/);
  assert.match(background, /async function dispatchTrustedMove99FinalReview/);
  assert.match(background, /async function resumePendingTrustedMove99FinalReview/);
});

test('Profile 2 page inspection exposes read-only Mark as Shipped target evidence', () => {
  assert.match(background, /inspectEbayMarkShippedDom/);
  assert.match(ebay, /function inspectMarkShippedDom\(\)/);
  assert.match(ebay, /function markShippedElementDescriptor\(element\)/);
  const inspection = ebay.slice(
    ebay.indexOf('function inspectMarkShippedDom()'),
    ebay.indexOf('chrome.storage.onChanged.addListener', ebay.indexOf('function inspectMarkShippedDom()'))
  );
  assert.doesNotMatch(inspection, /\.click\(|dispatchFullClick|storageSet\(/);
  assert.match(inspection, /orderNumbers:/);
  assert.match(inspection, /dialogButtons:/);
  assert.match(inspection, /finalActionHit:/);
});
