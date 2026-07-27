const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const ebay = fs.readFileSync(path.join(root, "extension", "ebay.js"), "utf8");
const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const popup = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
const starter = fs.readFileSync(path.join(root, "extension", "start-move99.js"), "utf8");
const configExample = fs.readFileSync(path.join(root, "extension", "config.example.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));

function loadMove99Qualifier(scanMode, backburnerIds = []) {
  const listingPriceParts = ebay.match(/function listingPriceParts\(raw\) \{[\s\S]*?\n  \}/)?.[0];
  const priceEndsIn99 = ebay.match(/function priceEndsIn99\(raw\) \{[\s\S]*?\n  \}/)?.[0];
  const hasValidListingPrice = ebay.match(/function hasValidListingPrice\(raw\) \{[\s\S]*?\n  \}/)?.[0];
  const qualifier = ebay.match(/function move99QualifiesByMode\(entry, itemId\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(listingPriceParts && priceEndsIn99 && hasValidListingPrice && qualifier, "Move .99 price helpers must be extractable");
  return new Function("scanMode", "backburnerIds", `
    const MOVE99_SCAN_MODE = scanMode;
    const MOVE99_BACKBURNER_ITEM_IDS = new Set(backburnerIds.map(String));
    ${listingPriceParts}
    ${priceEndsIn99}
    ${hasValidListingPrice}
    ${qualifier}
    return move99QualifiesByMode;
  `)(scanMode, backburnerIds);
}

function loadMove99EditRangeBuilder() {
  const flatten = ebay.match(/function flattenMove99Pages\(pages\) \{[\s\S]*?\n  \}/)?.[0];
  const builder = ebay.match(/function buildMove99EditRanges\(pages, filteredCount, rangeLimit = MOVE99_EDIT_RANGE_LIMIT\) \{[\s\S]*?\n  \}/)?.[0];
  const normalize = ebay.match(/function normalizedMove99BatchTitle\(value\) \{[\s\S]*?\n  \}/)?.[0];
  const fingerprint = ebay.match(/function move99BatchFingerprint\(record\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(flatten && builder && normalize && fingerprint, "Move .99 range builder must be extractable");
  return new Function("MOVE99_EDIT_RANGE_LIMIT", `
    ${flatten}
    ${normalize}
    ${fingerprint}
    ${builder}
    return buildMove99EditRanges;
  `)(2000);
}

function loadMove99ExactBatchBuilder() {
  const flatten = ebay.match(/function flattenMove99Pages\(pages\) \{[\s\S]*?\n  \}/)?.[0];
  const builder = ebay.match(/function buildMove99ExactBatches\(pages, batchLimit = MOVE99_BULK_BATCH_LIMIT\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(flatten && builder, "Move .99 exact-ID batch builder must be extractable");
  return new Function("MOVE99_BULK_BATCH_LIMIT", `
    ${flatten}
    ${builder}
    return buildMove99ExactBatches;
  `)(500);
}

function loadMove99SavedSummaryDescriptor() {
  const flatten = ebay.match(/function flattenMove99Pages\(pages\) \{[\s\S]*?\n  \}/)?.[0];
  const descriptor = ebay.match(/function move99SavedSummaryDescriptor\(state\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(flatten && descriptor, "saved Move .99 summary helpers must be extractable");
  return new Function("MOVE99_SCAN_STRATEGY", `
    ${flatten}
    ${descriptor}
    return move99SavedSummaryDescriptor;
  `)("active-page-exact-id-v1");
}

function loadMove99FingerprintPlanner() {
  const normalize = ebay.match(/function normalizedMove99BatchTitle\(value\) \{[\s\S]*?\n  \}/)?.[0];
  const fingerprint = ebay.match(/function move99BatchFingerprint\(record\) \{[\s\S]*?\n  \}/)?.[0];
  const planner = ebay.match(/function buildMove99RangeFingerprintPlan\(range\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(normalize && fingerprint && planner, "Move .99 fingerprint planner must be extractable");
  return new Function(`
    ${normalize}
    ${fingerprint}
    ${planner}
    return buildMove99RangeFingerprintPlan;
  `)();
}

test("every Move .99 launcher performs a full exact-ID scan before opening a publish workspace", () => {
  assert.match(ebay, /scanStrategy:\s*MOVE99_SCAN_STRATEGY/);
  assert.match(background, /scanStrategy:\s*'active-page-exact-id-v1'/);
  for (const source of [popup, starter]) {
    assert.match(source, /sendMessage\(\{ type: 'startMove99Workflow', scanMode \}\)/);
    assert.doesNotMatch(source, /pendingMove99Run:\s*\{/);
  }
  for (const source of [ebay, background, popup, starter]) assert.doesNotMatch(source, /useEditAllBulkScan:\s*true/);
  const activePrepare = ebay.slice(
    ebay.indexOf('if (state.phase === "active-prepare")'),
    ebay.indexOf('if (state.phase === "scan-page"')
  );
  assert.match(activePrepare, /phase:\s*"scan-page"/);
  assert.match(activePrepare, /scanPages:\s*\{\}/);
  assert.match(activePrepare, /navigateToMove99ScanPage\(1, filteredUrl\)/);
  assert.doesNotMatch(activePrepare, /openAllFilteredListingsInBulkEditor\(filteredCount/);
  assert.doesNotMatch(activePrepare, /applyStrategy:\s*MOVE99_DIRECT_APPLY_STRATEGY/);
  assert.match(ebay, /const MOVE99_BULK_BATCH_LIMIT = 500/);
  assert.match(ebay, /const MOVE99_RENDER_BATCH_LIMIT = 500/);
});

test("Move .99 creates signed-in exact-ID Bulk Edit workspaces without a local helper", () => {
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.permissions.includes("webRequest"));
  assert.ok(!manifest.host_permissions.some((entry) => entry.includes("127.0.0.1")));
  assert.match(background, /async function createMove99BulkWorkspace/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /world:\s*'MAIN'/);
  assert.match(background, /\/bulksell\/switch-init/);
  assert.match(background, /fetch\('\/bulksell\/switch'/);
  assert.match(background, /originalEntityIds:\s*exactIds/);
  assert.match(background, /allowExistingWorkspaceDialog:\s*false/);
  assert.match(background, /workspaceUrl\.pathname !== '\/bulksell'/);
  assert.match(background, /message\.type === 'createMove99BulkWorkspace'/);
  assert.doesNotMatch(background, /chrome\.webRequest|127\.0\.0\.1:18765/);
});

test("direct Bulk Edit ranges preserve the filtered total and scan a bounded rendered batch", () => {
  const opener = ebay.slice(
    ebay.indexOf("async function openAllFilteredListingsInBulkEditor"),
    ebay.indexOf("async function openFilteredListingRangeInBulkEditor")
  );
  assert.match(opener, /requestedRangeStart/);
  assert.match(opener, /entry\.rangeStart === requestedRangeStart/);
  assert.match(opener, /filteredCount:\s*Number\(filteredCount \|\| actualFilteredCount\)/);
  assert.match(opener, /rangeCount:\s*actualFilteredCount/);
  assert.match(opener, /selectionSource:\s*"bulk-editor-price-scan"/);

  const selector = ebay.slice(
    ebay.indexOf("async function selectAll99Listings"),
    ebay.indexOf("async function selectSavedIdsInBulkRange")
  );
  assert.match(selector, /scanTarget = Math\.min\(processed\.total, MOVE99_RENDER_BATCH_LIMIT\)/);
  assert.match(ebay, /const MOVE99_DIRECT_SELECTION_LIMIT = 100/);
  assert.match(selector, /scanLimit: scanTarget, selectionLimit: MOVE99_DIRECT_SELECTION_LIMIT/);
  assert.match(selector, /scannedRows < loadTarget \|\| \(!partialScan && scannedRows !== processed\.total\)/);
  assert.doesNotMatch(selector, /0\.92|minimumExpected/);
  assert.match(selector, /uiSelected !== qualifyingCount/);
});

test("Move .99 accepts eBay's native Submit count as a cross-validated workspace readiness signal", () => {
  assert.match(ebay, /function parseBulkEditorSubmitTotal\(\)/);
  assert.match(ebay, /\^submit\\s\*\\\(\(\[\\d,\]\+\)\\\)\$/i);
  const readiness = ebay.slice(
    ebay.indexOf("async function waitForBulkEditorReady"),
    ebay.indexOf("function visibleCheckboxTarget")
  );
  assert.match(readiness, /const rowCount = bulkEditorRawRowCount\(\)/);
  assert.match(readiness, /source: selection\.total > 0 \? "selection-summary" : "submit-summary"/);
  assert.match(readiness, /nativeTotal === expected/);
  assert.match(readiness, /allowFewer && nativeTotal <= expected/);
  assert.match(readiness, /nativeStableSince/);
  assert.match(readiness, /now - nativeStableSince >= requiredStableMs/);
  assert.match(readiness, /now - processedStableSince >= 5000/);
  assert.match(ebay, /selectAll99Listings\(Number\(directRange\.rangeCount \|\| 0\)\)/);
});

test("Move .99 selection progress avoids reading the entire 2,000-row page text", () => {
  const progress = ebay.slice(
    ebay.indexOf("function bulkEditorSelectionProgress"),
    ebay.indexOf("async function waitForBulkEditorReady")
  );
  assert.doesNotMatch(progress, /document\.body\?\.innerText|document\.body\.innerText/);
  assert.match(progress, /tbody input\[type='checkbox'\]/);
  assert.match(progress, /selectedControls\.size/);
  assert.match(progress, /Math\.max\(parseBulkEditorSubmitTotal\(\), bulkEditorRawRowCount\(root\)\)/);
});

test("Move .99 yields while reading a large Bulk Edit working batch", () => {
  const processor = ebay.slice(
    ebay.indexOf("async function renderedBulkRowsCooperatively"),
    ebay.indexOf("async function settleVirtualRows")
  );
  assert.match(processor, /setTimeout\(resolve, 8\)/);
  assert.match(processor, /async function processRendered99Rows/);
  assert.match(processor, /await renderedBulkRowsCooperatively\(\)/);
  assert.match(processor, /scanState\.rowSignatures\.get\(row\)/);
  assert.match(processor, /signature = `loaded-row:\$\{scanState\.nextRowSignature\}`/);
  assert.match(processor, /signature = rowSignature\(row\)/);
  assert.match(ebay, /await processRendered99Rows\(scanState, \{ mutateSelection: false \}\)/);
  assert.match(ebay, /unexpectedSelected = Math\.max\(0, nativeSelected - selectedCandidateCount\)/);
  assert.match(ebay, /const useSelectAllThenExclude = !partialScan/);
  assert.match(ebay, /scanState\.acceptNewRows = false/);
  assert.match(ebay, /scanState\.allowedSelectionSignatures/);
});

test("Move .99 opens the 2,000-listing range without repeatedly reading the full Seller Hub page", () => {
  const opener = ebay.slice(
    ebay.indexOf("function findSavedBulkEditDialog"),
    ebay.indexOf("async function openFilteredListingRangeInBulkEditor")
  );
  assert.match(opener, /querySelectorAll\('\[role="dialog"\], dialog'\)/);
  assert.doesNotMatch(opener, /\[role="dialog"\], dialog, section, div/);
  assert.match(opener, /function bulkEditorNavigationProgressed\(\)/);
  assert.match(opener, /h1, h2, \[role='status'\], \[aria-live\]/);
  assert.doesNotMatch(opener, /document\.body\?\.innerText|document\.body\.innerText/);
  assert.match(opener, /continuePastSavedBulkEditDialog\(timeoutMs = 15000\)/);
});

test("Move .99 scans a safe subset of eBay's stable admitted count and records omissions", () => {
  const selector = ebay.slice(
    ebay.indexOf("async function selectAll99Listings"),
    ebay.indexOf("async function selectSavedIdsInBulkRange")
  );
  assert.match(selector, /allowFewer: true/);
  assert.match(selector, /processed\.total > Number\(expectedTotal\)/);
  assert.match(selector, /omittedCount = expectedTotal \? Math\.max/);
  assert.match(selector, /scannedRows < loadTarget/);
  assert.match(ebay, /const unrevisableCount = Number\(state\.unrevisableCount \|\| 0\) \+ Number\(summary\.omittedCount \|\| 0\)/);
  assert.match(ebay, /saveMove99Result\(\{[\s\S]*?status: "Completed",[\s\S]*?remainingCount: 0,[\s\S]*?failedCount: 0,[\s\S]*?scannedRows: summary\.scannedRows,[\s\S]*?proofType: "final-zero-scan",[\s\S]*?verifiedZeroRemaining: true/);
});

test("a confirmed direct range submit restarts at range one", () => {
  const nextBatch = ebay.slice(
    ebay.indexOf("function nextMove99BatchState"),
    ebay.indexOf("function parseMove99SubmitResult")
  );
  assert.match(nextBatch, /state\.applyStrategy === MOVE99_DIRECT_APPLY_STRATEGY/);
  assert.match(nextBatch, /phase:\s*"active-prepare"/);
  assert.match(nextBatch, /directRangeStart:\s*1/);
});

test("a confirmed exact workspace advances to the next saved ID batch", () => {
  const nextBatch = ebay.slice(
    ebay.indexOf("function nextMove99BatchState"),
    ebay.indexOf("function parseMove99SubmitResult")
  );
  assert.match(nextBatch, /state\.applyStrategy === MOVE99_EXACT_APPLY_STRATEGY/);
  assert.match(nextBatch, /phase:\s*"apply-exact-workspace"/);
  assert.match(nextBatch, /applyIndex:\s*Number\(state\.applyIndex \|\| 0\) \+ 1/);
});

test("Move .99 failures pause for explicit read-only reconciliation instead of auto-looping", () => {
  assert.match(ebay, /function pauseMove99ForReconciliation\(state, reason = ""\)/);
  assert.match(ebay, /phase:\s*"reconciliation-required"/);
  const start = ebay.indexOf("} else if (canRecoverMove99ThroughVerification(failedState))");
  const failureRecovery = ebay.slice(start, ebay.indexOf("} else {", start));
  assert.ok(start > -1);
  assert.match(failureRecovery, /pauseMove99ForReconciliation/);
  assert.doesNotMatch(failureRecovery, /navigateToMove99ScanPage|runMove99Automation/);
  assert.match(ebay, /interruptedState\?\.phase === "reconciliation-required"/);
  assert.match(ebay, /Starting the saved read-only reconciliation scan/);
});

test("Move .99 assigns one owner tab so duplicate eBay tabs cannot race", () => {
  assert.match(background, /function claimMove99Tab\(senderTabId, requestedRunId\)/);
  assert.match(background, /move99ClaimQueue = claim\.then/);
  assert.match(background, /owned: ownerTabId === senderTabId/);
  assert.match(ebay, /runtimeMessage\(\{ type: "claimMove99Tab"/);
  assert.match(ebay, /if \(!claim\?\.ok\)/);
  assert.match(ebay, /if \(!claim\.owned\)/);
  assert.match(ebay, /ownerTabId: claim\.ownerTabId/);
  assert.match(background, /ownerTabId: runTab\.id/);
  assert.match(background, /await storageSet\(\{[\s\S]*?pendingMove99Run:/);
  assert.match(background, /await updateChromeTab\(runTab\.id, \{ url: activeUrl, active: true \}\)/);
});

test("Move .99 saved state migrates only verified passive scans and never auto-resumes active work", () => {
  const storageWriter = ebay.slice(
    ebay.indexOf("const storageSet ="),
    ebay.indexOf("const storageRemove =")
  );
  assert.match(storageWriter, /extensionVersion:\s*EXTENSION_VERSION/);
  assert.match(storageWriter, /stateUpdatedAt:\s*new Date\(\)\.toISOString\(\)/);

  const resumer = ebay.slice(
    ebay.indexOf("async function resumePendingActions"),
    ebay.indexOf("function renderStatus")
  );
  assert.match(resumer, /String\(pendingMove99\.extensionVersion \|\| ""\) !== EXTENSION_VERSION/);
  assert.match(resumer, /FOUNDATION\.migratePortableMove99Summary\(pendingMove99, EXTENSION_VERSION\)/);
  assert.match(resumer, /pendingMove99Run: migrated, lastMove99Scan: migrated/);
  assert.match(resumer, /pendingMove99 = migrated/);
  assert.match(resumer, /storageRemove\(\["pendingMove99Run"\]\)/);
  assert.match(resumer, /pendingMove99 = null/);

  const backgroundWriter = background.slice(
    background.indexOf("function storageSet"),
    background.indexOf("function tabExists")
  );
  assert.match(backgroundWriter, /extensionVersion:\s*EXTENSION_VERSION/);
  assert.match(backgroundWriter, /async function clearIncompatibleMove99State/);
  assert.match(backgroundWriter, /FOUNDATION\.migratePortableMove99Summary\(pending, EXTENSION_VERSION\)/);
  assert.match(backgroundWriter, /pendingMove99Run: migrated, lastMove99Scan: migrated/);
  assert.match(backgroundWriter, /storageRemove\(\['pendingMove99Run'\]\)/);
  assert.match(background, /clearIncompatibleMove99State\(\)[\s\S]*?resumeExtensionReloadRequest\(\)/);
  assert.doesNotMatch(popup.slice(popup.indexOf("async function startMove99Workflow")), /pendingMove99Run:\s*\{/);
  assert.doesNotMatch(starter.slice(starter.indexOf("async function start")), /pendingMove99Run:\s*\{/);
});

test("popup Move .99 launcher delegates atomic state and tab creation to the background", () => {
  const launcher = popup.slice(
    popup.indexOf("async function startMove99Workflow"),
    popup.indexOf("document.getElementById('openFeatureGuide')")
  );
  const atomicLauncher = background.slice(
    background.indexOf("async function startMove99WorkflowFromExtension"),
    background.indexOf("async function createMove99BulkWorkspace")
  );
  assert.match(launcher, /sendMessage\(\{ type: 'startMove99Workflow', scanMode \}\)/);
  assert.match(launcher, /Number\.isInteger\(response\.tabId\)/);
  assert.doesNotMatch(launcher, /chrome\.tabs\.create|pendingMove99Run/);
  assert.match(atomicLauncher, /claimWorkflowStart\('move99', 'Move \.99'\)/);
  assert.match(atomicLauncher, /pendingMove99Run:\s*runState/);
  assert.match(atomicLauncher, /runTab = await createChromeTab\(\{ url: 'about:blank', active: true \}\)/);
  assert.match(atomicLauncher, /await storageSet\(\{[\s\S]*?pendingMove99Run:/);
  assert.match(atomicLauncher, /ownerTabId: runTab\.id/);
  assert.match(atomicLauncher, /await updateChromeTab\(runTab\.id, \{ url: activeUrl, active: true \}\)/);
  assert.ok(
    atomicLauncher.indexOf("pendingMove99Run: runState") < atomicLauncher.indexOf("runTab = await createChromeTab"),
    "the stamped pending run must exist before Chrome creates the exact eBay tab"
  );
});

test("Move .99 cannot apply an incomplete inventory scan", () => {
  assert.match(ebay, /scanned !== expectedTotal/);
  assert.match(ebay, /No category changes were attempted/);
  assert.match(ebay, /scanIntegrity:\s*"verified"/);
  assert.match(ebay, /uniqueInspected:\s*scanned/);
  assert.match(ebay, /state\.scanIntegrity !== "verified"/);
  assert.match(ebay, /Number\(state\.uniqueInspected \|\| 0\) !== Number\(state\.filteredCount \|\| 0\)/);
});

test("Move .99 waits for eBay's filtered Results total instead of the stale account heading", () => {
  assert.match(ebay, /function visibleFilteredResultTotal\(\)/);
  assert.match(ebay, /Never use it as filtered proof/);
  assert.match(ebay, /waitForStableFilteredResults\(true, 30000\)/);
  assert.match(ebay, /waitForStableFilteredResults\(false, 60000\)/);
  assert.match(ebay, /Date\.now\(\) - stableSince >= 4000/);
  assert.match(ebay, /filterBaselineRestarts: baselineRestarts \+ 1/);
  assert.match(ebay, /MOVE99_FILTER_BASELINE_RESTART_LIMIT = 2/);
  assert.match(ebay, /baselineRestarts < MOVE99_FILTER_BASELINE_RESTART_LIMIT/);
  assert.doesNotMatch(ebay, /targetPage === 1 && Object\.keys\(existingPages\)\.length === 0 && baselineRestarts < 2/);
  assert.match(ebay, /scanPageReloads: \{\}/);
  assert.match(ebay, /scanPassRestarts: 0/);
  assert.match(ebay, /Restarting a clean full scan/);
});

test("Move .99 rejects eBay's generic Store-category filter token", () => {
  const verifier = ebay.match(/function hasUnverifiableMove99SourceFilterUrl\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(verifier, "generic Store-category filter verifier must be extractable");
  const run = (href) => new Function("location", `
    ${verifier}
    return hasUnverifiableMove99SourceFilterUrl();
  `)({ href });

  assert.equal(run("https://www.ebay.com/sh/lst/active?storeCatIds=44678633011,1"), false);
  assert.equal(run("https://www.ebay.com/sh/lst/active?storeCatIds=storeCategories"), true);
  assert.equal(run("https://www.ebay.com/sh/lst/active?category_ids=Store%20categories"), true);
  assert.equal(run("https://www.ebay.com/sh/lst/active"), false);

  const filtering = ebay.slice(
    ebay.indexOf("async function ensureCategoryFilterSelected"),
    ebay.indexOf("function dispatchFullClick")
  );
  assert.match(filtering, /filterTransition === "unverifiable"/);
  assert.match(filtering, /instead of numeric category IDs\. No category changes were attempted/);
  assert.match(filtering, /waitForStableFilteredResults\(MOVE99_SOURCE_STORE_CATEGORY_IDS\.length > 0, 60000\)/);
});

test("Move .99 enters configured accounts through the exact numeric source URL", () => {
  const activePrepare = ebay.slice(
    ebay.indexOf('if (state.phase === "active-prepare")'),
    ebay.indexOf('if (state.phase === "scan-page"')
  );
  assert.match(activePrepare, /configuredSourceUrlRequired = MOVE99_SOURCE_STORE_CATEGORY_IDS\.length > 0/);
  assert.match(activePrepare, /configuredSourceUrlRequired && !isMove99SourceFilterUrl\(\)/);
  assert.match(activePrepare, /navigateToMove99ScanPage\(1, MOVE99_ACTIVE_URL\)/);
});

test("Move .99 recognizes the filtered Results total from every active page", () => {
  const counter = ebay.match(/function visibleFilteredResultTotal\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(counter, "filtered Results counter must be extractable");
  const visibleFilteredResultTotal = new Function("document", `
    ${counter}
    return visibleFilteredResultTotal;
  `)({ body: { innerText: "" } });

  assert.equal(visibleFilteredResultTotal.call(null), null);
  const run = (innerText) => new Function("document", `
    ${counter}
    return visibleFilteredResultTotal();
  `)({ body: { innerText } });
  assert.equal(run("Results: 1-200 of 5,591"), 5591);
  assert.equal(run("Results: 1\u2013200 of 5,591"), 5591);
  assert.equal(run("Results: 1\u2014200 of 5,591"), 5591);
  assert.equal(run("Results: 401-600 of 5,591"), 5591);
  assert.equal(run("Result: 5,401-5,591 of 5,591"), 5591);
  assert.equal(run("Results: 0"), 0);
});

test("Move .99 ignores unrelated Seller Hub progress bars after filtered results render", () => {
  const readiness = ebay.slice(
    ebay.indexOf("async function waitForStableFilteredResults"),
    ebay.indexOf("async function ensureCategoryFilterSelected")
  );
  assert.match(readiness, /stable filtered Results total plus the/);
  assert.doesNotMatch(readiness, /document\.querySelectorAll\('\[aria-busy=/);
  assert.doesNotMatch(readiness, /\[role=\"progressbar\"\]/);
  assert.doesNotMatch(readiness, /pageInfo\.total !== expectedPages/);
  assert.match(readiness, /pageInfo\.current > expectedPages/);
  assert.match(readiness, /const key = `\$\{total\}:\$\{pageInfo\.current\}:\$\{expectedPages\}`/);
});

test("Move .99 learns numeric Store category IDs and derives scan pages from Results", () => {
  assert.match(ebay, /function numericMove99SourceCategoryIdsFromUrl/);
  assert.match(ebay, /async function rememberDiscoveredMove99SourceCategoryIds/);
  assert.match(ebay, /move99AccountSettings: allSettings/);
  const prepare = ebay.slice(
    ebay.indexOf('if (state.phase === "active-prepare")'),
    ebay.indexOf('if (state.phase === "scan-page"')
  );
  assert.match(prepare, /numericMove99SourceCategoryIdsFromUrl\(filteredUrl\)/);
  assert.match(prepare, /rememberDiscoveredMove99SourceCategoryIds/);
  assert.match(prepare, /const totalPages = Math\.max\(1, Math\.ceil\(filteredCount \/ 200\)\)/);
  assert.match(prepare, /sourceStoreCategoryIds: MOVE99_SOURCE_STORE_CATEGORY_IDS/);
  assert.match(prepare, /totalPages,/);
  assert.doesNotMatch(prepare, /totalPages: pageInfo\.total/);
});

test("Move .99 recognizes eBay's normalized All filters counter", () => {
  const matcher = ebay.match(/function isAllFiltersButtonText\(raw\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(matcher, "All filters matcher must be extractable");
  const isAllFiltersButtonText = new Function("U", `
    ${matcher}
    return isAllFiltersButtonText;
  `)({
    normalizeText: (value = "") => String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  });

  assert.equal(isAllFiltersButtonText("All filters"), true);
  assert.equal(isAllFiltersButtonText("All filters (1)"), true);
  assert.equal(isAllFiltersButtonText("ALL FILTERS (28)"), true);
  assert.equal(isAllFiltersButtonText("Clear all"), false);
  assert.match(ebay, /I could not find All filters on Active Listings/);
});

test("Move .99 accepts an already-applied source category when See results is disabled", () => {
  const filtering = ebay.slice(
    ebay.indexOf("async function ensureCategoryFilterSelected"),
    ebay.indexOf("function dispatchFullClick")
  );
  assert.match(filtering, /let categoryChanged = false/);
  assert.match(filtering, /categoryChanged = true/);
  assert.match(filtering, /!seeResults && !categoryChanged && findSeeResults\(false\)/);
  assert.match(filtering, /await closeMove99FilterPanel\(filterPanel\)/);
  assert.match(filtering, /waitForStableFilteredResults\(false, 60000\)/);
});

test("Move .99 scans clean hard-loaded pages and recovers from pagination drift", () => {
  const builder = ebay.match(/function move99ScanPageUrl\(targetPage, baseUrl = location\.href\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(builder, "Move .99 scan URL builder must be extractable");
  const move99ScanPageUrl = new Function(`
    ${builder}
    return move99ScanPageUrl;
  `)();
  const url = new URL(move99ScanPageUrl(27, "https://www.ebay.com/sh/lst/active?storeCatIds=44619286011&source=filterpanel&action=search"));
  assert.equal(url.searchParams.get("storeCatIds"), "44619286011");
  assert.equal(url.searchParams.get("offset"), "5200");
  assert.equal(url.searchParams.get("limit"), "200");
  assert.equal(url.searchParams.get("sort"), "scheduledStartDate");
  assert.equal(url.searchParams.has("source"), false);
  assert.equal(url.searchParams.has("action"), false);

  const scanning = ebay.slice(
    ebay.indexOf('if (state.phase === "scan-page" || state.phase === "verify-page")'),
    ebay.indexOf('if (state.phase === "scan-summary")')
  );
  assert.match(scanning, /navigateToMove99ScanPage\(nextPage/);
  assert.match(scanning, /scanPageReloads/);
  assert.match(scanning, /scanPassRestarts/);
  assert.match(scanning, /passRestarts < 1/);
  assert.match(scanning, /move99LogicalTotalPages\(/);
  assert.doesNotMatch(scanning, /await goToActivePage\(nextPage\)/);
});

test("Move .99 finishes the last filtered page even when eBay retains an account-wide page count", () => {
  const helper = ebay.match(/function move99LogicalTotalPages\(resultTotal, filteredTotal, savedTotalPages, pageInfoTotal\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "logical filtered-page helper must be extractable");
  const logicalPages = new Function(`
    ${helper}
    return move99LogicalTotalPages;
  `)();

  assert.equal(logicalPages(232, 232, 2, 36), 2);
  assert.equal(logicalPages(null, 232, 2, 36), 2);
  assert.equal(logicalPages(null, null, 2, 36), 2);

  const verification = ebay.slice(
    ebay.indexOf('if (state.phase === "scan-page" || state.phase === "verify-page")'),
    ebay.indexOf('if (state.phase === "scan-summary")')
  );
  assert.match(verification, /if \(nextPage <= logicalTotalPages\)/);
  assert.match(verification, /phase: "completed"/);
  assert.match(verification, /active: false/);
  assert.match(verification, /ownerTabId: null/);
});

test("an invalidated unpacked-extension page retires dead controls without reloading the operator's tab", () => {
  const shutdown = ebay.slice(
    ebay.indexOf("function shutdownInvalidatedContext"),
    ebay.indexOf("function requireExtensionContext")
  );
  assert.match(shutdown, /GLDN Ops was updated\. Refresh this eBay tab when you are ready/);
  assert.match(shutdown, /data-gldn-context-invalidated/);
  assert.doesNotMatch(shutdown, /sessionStorage/);
  assert.doesNotMatch(shutdown, /location\.reload\(\)/);
});

test("finished Move .99 scans are passive and resume without tab-claim contention", () => {
  const runner = ebay.slice(
    ebay.indexOf("async function runMove99Automation"),
    ebay.indexOf("async function startMove99Listings")
  );
  const passiveIndex = runner.indexOf('const passiveSummary = state.phase === "scan-summary" || state.phase === "completed"');
  const claimIndex = runner.indexOf('runtimeMessage({ type: "claimMove99Tab"');
  assert.ok(passiveIndex >= 0, "runner must identify passive scan checkpoints");
  assert.ok(claimIndex > passiveIndex, "passive checkpoints must be handled before claiming a tab");
  assert.match(runner, /const passiveState = \{ \.\.\.state, active: false, ownerTabId: null \}/);
  assert.match(runner, /pendingMove99Run: passiveState, lastMove99Scan: passiveState/);

  const scanCompletion = runner.slice(
    runner.indexOf("const summaryState ="),
    runner.indexOf("const completedState =")
  );
  const verificationCompletion = runner.slice(
    runner.indexOf("const completedState ="),
    runner.indexOf('if (state.phase === "apply-all-pages")')
  );
  assert.match(scanCompletion, /active: false/);
  assert.match(scanCompletion, /ownerTabId: null/);
  assert.match(verificationCompletion, /active: false/);
  assert.match(verificationCompletion, /ownerTabId: null/);

  const resume = ebay.slice(
    ebay.indexOf("async function resumePendingActions"),
    ebay.indexOf("function renderStatus")
  );
  assert.match(resume, /passiveMove99Summary/);
  assert.match(resume, /passiveMove99Summary && isMove99ActiveListingsPage\(\)/);

  const heartbeat = ebay.slice(
    ebay.indexOf("// SPA-navigation heartbeat"),
    ebay.indexOf("// Keep the page usable", ebay.indexOf("// SPA-navigation heartbeat"))
  );
  assert.match(heartbeat, /pending\?\.active && pending\.confirmed/);
  assert.doesNotMatch(heartbeat, /scan-summary|completed/);
});

test("Apply transfers a saved Move .99 checkpoint to the current healthy tab", () => {
  const summary = ebay.slice(
    ebay.indexOf("function showMove99ScanSummary"),
    ebay.indexOf("function bulkEditorSelectionProgress")
  );
  assert.match(summary, /runtimeMessage\(\{ type: "currentTabInfo" \}\)/);
  assert.match(summary, /ownerTabId: tabInfo\.tabId/);
  assert.ok(
    summary.indexOf("ownerTabId: tabInfo.tabId") < summary.indexOf("runMove99Automation();"),
    "the active checkpoint must transfer ownership before the runner resumes"
  );
});

test("a verified completed scan remains actionable from the everyday panel without rescanning", () => {
  const describe = loadMove99SavedSummaryDescriptor();
  const qualifying = Array.from({ length: 136 }, (_, index) => ({
    itemId: String(318000000000 + index),
    title: `Reverse match ${index + 1}`,
    price: "10.00"
  }));
  const state = {
    phase: "scan-summary",
    scanMode: "non99",
    scanStrategy: "active-page-exact-id-v1",
    scanIntegrity: "verified",
    uniqueInspected: 15807,
    filteredCount: 15807,
    scanPages: { "1": { qualifying } }
  };
  assert.deepEqual(describe(state), {
    completed: false,
    count: 136,
    scanMode: "non99",
    buttonLabel: "Review 136 Non-.99 Matches"
  });
  assert.equal(describe({ ...state, phase: "scan-page" }), null);
  assert.equal(describe({ ...state, uniqueInspected: 15806 }), null);
  assert.equal(describe({ ...state, scanPages: {} }), null);

  const panelStart = ebay.indexOf("function createPanel");
  const panel = ebay.slice(panelStart, ebay.indexOf("chrome.storage.onChanged.addListener", panelStart));
  assert.match(panel, /data-action="review-move99-scan"[^>]*hidden/);
  assert.match(panel, /data-action="apply-move99-scan"[^>]*hidden/);
  assert.match(panel, /move99ReviewButtonElement\.addEventListener\("click", \(\) =>/);
  assert.match(panel, /move99ApplyButtonElement\.addEventListener\("click", \(\) =>/);
  assert.match(panel, /applySavedMove99Summary\(\)/);
  assert.match(panel, /refreshMove99ReviewButton\(\)/);

  const opener = ebay.slice(
    ebay.indexOf("async function openSavedMove99Summary"),
    ebay.indexOf("function canRecoverMove99FirstBatchFromVerifiedScan")
  );
  assert.match(opener, /move99SavedSummaryDescriptor\(state\)/);
  assert.match(opener, /showMove99ScanSummary\(\{ \.\.\.state, active: false, ownerTabId: null \}, descriptor\.completed\)/);
  assert.match(opener, /await revealMove99ScanSummary\(overlay\)/);
  assert.match(opener, /overlay\?\.querySelector\?\.\("\[data-action='apply'\]"\)/);
  assert.match(opener, /applyButton\.click\(\)/);
  assert.doesNotMatch(opener, /startMove99Listings|phase:\s*"active-prepare"|phase:\s*"scan-page"/);

  const storageListener = ebay.slice(
    ebay.indexOf("chrome.storage.onChanged.addListener"),
    ebay.indexOf("createPanel();", ebay.indexOf("chrome.storage.onChanged.addListener"))
  );
  assert.match(storageListener, /changes\.pendingMove99Run/);
  assert.match(storageListener, /refreshMove99ReviewButton\(\)/);
});

test("saved Move .99 review is forced into the viewport with a direct no-rescan Apply fallback", () => {
  const viewportRecovery = ebay.slice(
    ebay.indexOf("function forceMove99SummaryIntoViewport"),
    ebay.indexOf("function showMove99ScanSummary")
  );
  assert.match(viewportRecovery, /overlay\.style\.setProperty\("display", "flex", "important"\)/);
  assert.match(viewportRecovery, /overlay\.style\.setProperty\("z-index", "2147483647", "important"\)/);
  assert.match(viewportRecovery, /modal\.style\.setProperty\("visibility", "visible", "important"\)/);
  assert.match(viewportRecovery, /intersectsViewport/);
  assert.match(viewportRecovery, /requestAnimationFrame/);
  assert.match(viewportRecovery, /setTimeout\(resolve, 120\)/);

  const summary = ebay.slice(
    ebay.indexOf("function showMove99ScanSummary"),
    ebay.indexOf("function move99SavedSummaryDescriptor")
  );
  assert.match(summary, /if \(existing\) return existing/);
  assert.match(summary, /return overlay/);

  const recovery = ebay.slice(
    ebay.indexOf("async function applySavedMove99Summary"),
    ebay.indexOf("function canRecoverMove99FirstBatchFromVerifiedScan")
  );
  assert.match(recovery, /await openSavedMove99Summary\(\)/);
  assert.match(recovery, /applyButton\.click\(\)/);
  assert.doesNotMatch(recovery, /startMove99Listings|scan-page|active-prepare/);
});

test("Apply partitions only verified qualifying IDs into publishable eBay workspaces of at most 500", () => {
  const buildMove99ExactBatches = loadMove99ExactBatchBuilder();
  const records = Array.from({ length: 2_606 }, (_, index) => ({
    itemId: String(310000000000 + index),
    page: Math.floor(index / 200) + 1,
    title: `Verified listing ${index + 1}`,
    price: "9.99",
    qualifies: true
  }));
  const pages = {};
  for (const record of records) {
    const key = String(record.page);
    pages[key] ||= { qualifying: [] };
    pages[key].qualifying.push(record);
  }

  const batches = buildMove99ExactBatches(pages, 500);
  assert.deepEqual(batches.map((batch) => batch.length), [500, 500, 500, 500, 500, 106]);
  assert.deepEqual(batches.flat(), records.map((record) => record.itemId));

  const summary = ebay.slice(
    ebay.indexOf("function showMove99ScanSummary"),
    ebay.indexOf("function bulkEditorSelectionProgress")
  );
  assert.match(summary, /buildMove99ExactBatches\(sourcePages\)/);
  assert.match(summary, /phase:\s*"apply-exact-workspace"/);
  assert.match(summary, /applyStrategy:\s*MOVE99_EXACT_APPLY_STRATEGY/);
  assert.match(summary, /exactBatches/);

  const exactRunner = ebay.slice(
    ebay.indexOf('if (state.phase === "apply-exact-workspace")'),
    ebay.indexOf('if (state.phase === "apply-range")')
  );
  assert.match(exactRunner, /assertMove99ExactBatchIntegrity/);
  assert.match(exactRunner, /openExactMove99Workspace/);
});

test("Move .99 recovers an oversized variation workspace into 500-item batches", () => {
  assert.match(ebay, /function recoverMove99VariationLimitState\(state\)/);
  assert.match(ebay, /exceeded the 500 listing limit with variations/i);
  assert.match(ebay, /phase:\s*"apply-exact-workspace"/);
  assert.match(ebay, /exactBatches/);
});

test("Move .99 partitions a verified 2,808-listing scan into exact eBay edit ranges", () => {
  const buildMove99EditRanges = loadMove99EditRangeBuilder();
  const pages = {};
  const allIds = Array.from({ length: 2808 }, (_, index) => String(300000000000 + index));
  for (let offset = 0; offset < allIds.length; offset += 200) {
    const page = Math.floor(offset / 200) + 1;
    const itemIds = allIds.slice(offset, offset + 200);
    const records = itemIds.map((itemId) => ({
      itemId,
      page,
      price: Number(itemId) < 300000002688 ? "9.99" : "10.00",
      title: `Saved listing ${itemId}`,
      qualifies: Number(itemId) < 300000002688
    }));
    pages[String(page)] = {
      itemIds,
      records,
      qualifying: records.filter((record) => record.qualifies)
    };
  }

  const ranges = buildMove99EditRanges(pages, 2808, 2000);
  assert.deepEqual(ranges.map(({ rangeStart, rangeEnd, rangeCount, targetIds }) => ({
    rangeStart,
    rangeEnd,
    rangeCount,
    targetCount: targetIds.length
  })), [
    { rangeStart: 1, rangeEnd: 2000, rangeCount: 2000, targetCount: 2000 },
    { rangeStart: 2001, rangeEnd: 2808, rangeCount: 808, targetCount: 688 }
  ]);
  const assigned = ranges.flatMap((range) => range.targetIds);
  assert.equal(assigned.length, 2688);
  assert.equal(new Set(assigned).size, 2688);
  assert.deepEqual(assigned, allIds.slice(0, 2688));
  assert.deepEqual(ranges.map((range) => range.rangeRecords.length), [2000, 808]);
  assert.ok(ranges.every((range) => range.rangeRecords.every((record) => record.title && record.price)));
});

test("Move .99 fingerprint selection refuses mixed target and non-target duplicates", () => {
  const buildPlan = loadMove99FingerprintPlanner();
  const target = { itemId: "300000000001", title: "Same Product", price: "19.99", qualifies: true };
  const excludedDuplicate = { itemId: "300000000002", title: "Same Product", price: "19.99", qualifies: false };
  assert.throws(() => buildPlan({
    rangeCount: 2,
    rangeRecords: [target, excludedDuplicate],
    targetRecords: [target],
    targetIds: [target.itemId]
  }), /mix qualifying and non-qualifying listings/);

  const secondTarget = { itemId: "300000000003", title: "Same Product", price: "$19.99", qualifies: true };
  const nonTarget = { itemId: "300000000004", title: "Different Product", price: "20.00", qualifies: false };
  const plan = buildPlan({
    rangeCount: 3,
    rangeRecords: [target, secondTarget, nonTarget],
    targetRecords: [target, secondTarget],
    targetIds: [target.itemId, secondTarget.itemId]
  });
  assert.equal(plan.targetIds.length, 2);
  assert.equal([...plan.targetByFingerprint.values()][0].length, 2);
});

test("Move .99 persists every scanned listing record but keeps apply checkpoints compact", () => {
  const activeScan = ebay.slice(
    ebay.indexOf("async function scan99OnActivePage"),
    ebay.indexOf("async function selectSavedIdsOnActivePage")
  );
  assert.match(activeScan, /qualifying:\s*records\.filter\(\(record\) => record\.qualifies\),\s*records/);
  assert.match(ebay, /exactBatches = buildMove99ExactBatches\(sourcePages\)/);
  assert.match(ebay, /exactBatches,/);
  assert.doesNotMatch(ebay, /exactBatches = .*targetRecords|exactBatches = .*rangeRecords/);
});

test("Move .99 loads eBay Bulk Edit through its intersection sentinel before generic scrolling", () => {
  const rowProcessor = ebay.slice(
    ebay.indexOf("function processRendered99Rows"),
    ebay.indexOf("async function settleVirtualRows")
  );
  assert.doesNotMatch(rowProcessor, /scrollIntoView/);
  assert.match(rowProcessor, /clickElement\(checkbox, \{ preserveScroll: true \}\)/);
  assert.match(rowProcessor, /scanState\.deferSelection !== true/);
  assert.match(rowProcessor, /maxSelectionMutations/);
  assert.match(rowProcessor, /scanState\.selectionCandidates\.set\(signature, \{ signature, checkbox, itemId \}\)/);

  const clickHelper = ebay.slice(
    ebay.indexOf("function clickElement"),
    ebay.indexOf("function findCheckboxNearExactText")
  );
  assert.match(clickHelper, /if \(!options\.preserveScroll\)/);

  const loader = ebay.slice(
    ebay.indexOf("async function loadBulkEditorRowsThroughSentinel"),
    ebay.indexOf("async function scanOneScroller")
  );
  assert.match(loader, /\.bg-intersection-observer/);
  assert.doesNotMatch(loader, /wrapper\.style\.paddingBottom/);
  assert.match(loader, /wrapper\.scrollTo\(\{ top: max, behavior: "auto" \}\)/);
  assert.match(loader, /const retreatTop = Math\.max\(0, max - retreat\)/);
  assert.match(loader, /wrapper\.scrollTo\(\{ top: retreatTop, behavior: "auto" \}\)/);
  assert.match(loader, /wrapper\.scrollTo\(\{ top: refreshedMax, behavior: "auto" \}\)/);
  assert.match(loader, /wrapper\.scrollTop = max/);
  assert.match(loader, /wrapper\.scrollTop = retreatTop/);
  assert.match(loader, /wrapper\.scrollTop = refreshedMax/);
  assert.doesNotMatch(loader, /behavior: "smooth"/);
  assert.match(loader, /if \(wrapper\.isConnected === false\) wrapper = bulkEditorTableWrapper\(\)/);
  assert.match(loader, /settleVirtualRows\(700\)/);
  assert.match(loader, /settleVirtualRows\(550\)/);
  assert.match(loader, /settleVirtualRows\(1200\)/);
  assert.match(loader, /Math\.max\(1800, Math\.floor\(Number\(wrapper\.clientHeight \|\| 0\) \* 2\.5\)\)/);
  assert.match(loader, /setTimeout\(resolve, 55\)/);
  assert.match(loader, /sentinel\.style\.transform = `translateY\(\$\{Math\.max\(600, Number\(wrapper\.clientHeight \|\| 0\) \+ 120\)\}px\)`/);
  assert.doesNotMatch(loader, /scrollIntoView/);
  assert.match(loader, /while \(bulkEditorRawRowCount\(wrapper\) < processedTotal/);
  assert.match(loader, /waitForRawBulkRowProgress\(beforeRaw, 7000, deadline, wrapper\)/);
  assert.match(loader, /0 selected \(loading only\)/);
  assert.doesNotMatch(loader, /processRendered99Rows\(scanState/);

  const progressWaiter = ebay.slice(
    ebay.indexOf("async function settleVirtualRows"),
    ebay.indexOf("async function loadBulkEditorRowsThroughSentinel")
  );
  assert.match(progressWaiter, /const fallback = setTimeout\(done, 250\)/);
  assert.match(progressWaiter, /requestAnimationFrame\(\(\) => requestAnimationFrame\(done\)\)/);

  const rawProgressWaiter = ebay.slice(
    ebay.indexOf("async function waitForRawBulkRowProgress"),
    ebay.indexOf("async function loadBulkEditorRowsThroughSentinel")
  );
  assert.match(rawProgressWaiter, /bulkEditorRawRowCount\(preferredWrapper\) > beforeRaw/);
  assert.match(rawProgressWaiter, /settleVirtualRows\(650\)/);
  assert.doesNotMatch(rawProgressWaiter, /processRendered99Rows/);

  const fallbackLoader = ebay.slice(
    ebay.indexOf("async function scanOneScroller"),
    ebay.indexOf("async function scanVirtualizedBulkRows")
  );
  assert.match(fallbackLoader, /waitForRawBulkRowProgress\(beforeRaw, 3200, deadline\)/);
  assert.match(fallbackLoader, /0 selected \(loading only\)/);
  assert.doesNotMatch(fallbackLoader, /processRendered99Rows|renderedBulkRows/);

  const virtualScan = ebay.slice(
    ebay.indexOf("async function scanVirtualizedBulkRows"),
    ebay.indexOf("async function clearBulkEditorSelections")
  );
  assert.ok(
    virtualScan.indexOf("loadBulkEditorRowsThroughSentinel") < virtualScan.indexOf("findBulkEditorScrollCandidates"),
    "the cheap sentinel loader must run before the broad fallback scan"
  );
  assert.match(virtualScan, /deferSelection:\s*true/);
  assert.match(virtualScan, /makeElementScroller\(tableWrapper, "table-wrapper-fallback"\)/);
  assert.match(virtualScan, /if \(!sentinelScan\.supported\) \{[\s\S]*findBulkEditorScrollCandidates\(\)/);
  assert.match(virtualScan, /scanState\.deferSelection = false/);
  assert.match(virtualScan, /selectionCandidates:\s*new Map\(\)/);
  assert.match(virtualScan, /rowControls:\s*new Map\(\)/);
  assert.match(virtualScan, /rowSignatures:\s*new WeakMap\(\)/);
  assert.match(virtualScan, /Reading listing prices without changing selections/);
  assert.match(virtualScan, /const desiredSelectionCount = scanState\.selectionCandidates\.size/);
  assert.match(virtualScan, /const useSelectAllThenExclude = !partialScan/);
  assert.match(virtualScan, /selectAllBulkEditorListings\(processedTotal\)/);
  assert.match(virtualScan, /native\?\.selected === processedTotal && native\.total === processedTotal/);
  assert.match(virtualScan, /const next = pending\[0\]/);
  assert.match(virtualScan, /await settleVirtualRows\(900\)/);
  assert.match(virtualScan, /\(pass \+ 1\) % 5 === 0/);
  assert.match(virtualScan, /await settleVirtualRows\(2500\)/);
  assert.match(virtualScan, /scanState\.rowControls\.size !== processedTotal[\s\S]*checkbox\?\.isConnected/);
  assert.match(virtualScan, /clickElement\(next\.checkbox, \{ preserveScroll: true \}\)/);
  assert.match(virtualScan, /unexpectedSelected/);
  assert.match(virtualScan, /const loadedRawRows = bulkEditorRawRowCount\(\)/);
  assert.match(virtualScan, /No checkboxes or category fields were changed/);
  assert.match(virtualScan, /scanState\.allRows\.size < loadTarget/);
  assert.match(virtualScan, /All \$\{scanState\.allRows\.size\.toLocaleString\(\)\} rows loaded\. Selecting \.99 listings/);
  assert.ok(
    virtualScan.indexOf("loadBulkEditorRowsThroughSentinel")
      < virtualScan.indexOf("processRendered99Rows(scanState, { mutateSelection: false })"),
    "the native working-batch loader must finish before the first price scan"
  );
  assert.match(ebay, /function bulkEditorRawRowCount\(preferredWrapper = null\)/);
  assert.match(ebay, /preferredWrapper && preferredWrapper\.isConnected !== false/);
  assert.match(ebay, /const root = bulkEditorTableWrapper\(\) \|\| document/);
});

test("Move .99 opens only the exact eBay edit range and selects verified fingerprints", () => {
  assert.match(ebay, /function findEditListingsRangeMenuItem\(rangeStart, rangeEnd\)/);
  assert.match(ebay, /item\.rangeStart === start && item\.rangeEnd === end/);
  assert.match(ebay, /openFilteredListingRangeInBulkEditor\(range/);
  assert.match(ebay, /phase: "bulk-editor-range"/);
  assert.match(ebay, /selectionSource: "saved-id-range"/);
  assert.match(ebay, /currentBatchKey: `\$\{currentState\.runId/);
  assert.match(ebay, /const selectionPlan = buildMove99RangeFingerprintPlan\(range\)/);
  assert.match(ebay, /scanVirtualizedBulkRows\(processed\.total, selectionPlan\)/);
  assert.match(ebay, /scanState\.selectionPlan\.targetIdSet\.has\(itemId\)/);
  assert.match(ebay, /scanState\.unexpectedRows\.size/);
  assert.match(ebay, /selection\.selected !== selectedIds\.length/);
  assert.match(ebay, /choosePrimaryStoreCategory\(summary\.selectedIds\.length\)/);

  const menuItemsSource = ebay.match(/function findEditListingsMenuItems\(\) \{[\s\S]*?\n  \}/)?.[0];
  const rangeItemSource = ebay.match(/function findEditListingsRangeMenuItem\(rangeStart, rangeEnd\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(menuItemsSource && rangeItemSource, "exact Edit range finder must be extractable");
  const nodes = ["Edit listings 1–2,000", "Edit listings 2,001 - 2,808"].map((text) => ({
    innerText: text,
    textContent: text,
    closest() { return this; },
    matches() { return true; },
    getBoundingClientRect() { return { width: 200, height: 30 }; }
  }));
  let queriedSelector = "";
  const fakeDocument = {
    querySelectorAll(selector) {
      queriedSelector = selector;
      return nodes;
    }
  };
  const findRange = new Function("document", "U", `
    ${menuItemsSource}
    ${rangeItemSource}
    return findEditListingsRangeMenuItem;
  `)(fakeDocument, { isVisible: () => true });
  assert.equal(findRange(1, 2000)?.text, "Edit listings 1–2,000");
  assert.equal(findRange(2001, 2808)?.text, "Edit listings 2,001 - 2,808");
  assert.doesNotMatch(
    queriedSelector,
    /(^|,\s*)(div|span)(?=\s*(,|$))/i,
    "the menu poll must not scan every generic div or span on large Seller Hub pages"
  );
});

test("M0 ships with its saved ClickNCarry Store category pair", () => {
  const clickNCarry = configExample.slice(
    configExample.indexOf("CLICKNCARRY:"),
    configExample.indexOf("FINTIME:")
  );
  assert.match(clickNCarry, /sourceCategories: \["BEST SELLERS"\]/);
  assert.match(clickNCarry, /destinationCategory: "BALK"/);
});

test("Computer 2 ships with its FancyFi Store category defaults", () => {
  const fancyFi = configExample.slice(
    configExample.indexOf("FANCYFI:"),
    configExample.indexOf("HEARTSTONE:")
  );
  assert.match(fancyFi, /sourceCategories: \["SNI", "SNIPO v2"\]/);
  assert.match(fancyFi, /destinationCategory: "DAILY"/);
});

test("reverse cleanup admits only valid non-.99 prices and always excludes backburner items", () => {
  const normal = loadMove99Qualifier("price99", ["318521296686"]);
  const reverse = loadMove99Qualifier("non99", ["318521296686"]);

  assert.equal(normal({ price: "$9.99" }, "100000000001"), true);
  assert.equal(normal({ price: "$10.00" }, "100000000001"), false);
  assert.equal(reverse({ price: "$9.99" }, "100000000001"), false);
  assert.equal(reverse({ price: "$10.00" }, "100000000001"), true);
  assert.equal(reverse({ price: "$9.90" }, "100000000001"), true);
  assert.equal(reverse({ price: "10" }, "100000000001"), true);
  assert.equal(reverse({ price: "" }, "100000000001"), false);
  assert.equal(reverse({ price: "N/A" }, "100000000001"), false);
  assert.equal(reverse({ price: "$10.00" }, "318521296686"), false);
  assert.equal(normal({ price: "$10.99 - $28.99" }, "100000000001"), true);
  assert.equal(normal({ price: "$10.99 - $28.49" }, "100000000001"), false);
  assert.equal(reverse({ price: "$10.99 - $28.49" }, "100000000001"), true);
});

test("Move .99 reads variation price ranges from eBay's Buy It Now grid cell", () => {
  const finder = ebay.slice(
    ebay.indexOf("function findBuyItNowPriceInput"),
    ebay.indexOf("function bulkEditorTableWrapper")
  );
  assert.match(ebay, /function bulkEditorBuyItNowColumnIndex\(row\)/);
  assert.match(ebay, /includes\("buy it now"\)/);
  assert.match(ebay, /source: "variation-range"/);
  assert.match(ebay, /hasValidListingPrice\(priceText\)/);
  assert.doesNotMatch(finder, /if \(!inputs\.length\) return null/);
});

test("reverse cleanup launchers invert configured categories and always stop at scan summary", () => {
  assert.match(background, /scanMode === 'non99' \? \[normalized\.destinationCategory\] : normalized\.sourceCategories/);
  assert.match(background, /scanMode === 'non99' \? normalized\.sourceCategories\[0\] : normalized\.destinationCategory/);
  assert.match(background, /scanMode === 'non99' \? \[\] : normalized\.sourceStoreCategoryIds/);
  for (const source of [popup, starter, background]) assert.doesNotMatch(source, /autoApply\s*:\s*true/);
  const summary = ebay.slice(
    ebay.indexOf("function showMove99ScanSummary"),
    ebay.indexOf("function bulkEditorSelectionProgress")
  );
  assert.match(summary, /Scan Only \/ Close/);
  assert.doesNotMatch(summary, /state\.autoApply|data-action='apply'\]\)\?\.click/);
});

test("saved batches are exact, unique, bounded, and revalidated", () => {
  assert.match(ebay, /function assertMove99BatchIntegrity/);
  assert.match(ebay, /targetIds\.length > MOVE99_BULK_BATCH_LIMIT/);
  assert.match(ebay, /new Set\(targetIds\.map\(String\)\)\.size !== targetIds\.length/);
  assert.match(ebay, /!inspectedIds\.has\(itemId\)/);
  assert.match(ebay, /MOVE99_BACKBURNER_ITEM_IDS\.has\(itemId\)/);
  assert.match(ebay, /!move99QualifiesByMode\(record, itemId\)/);
  assert.match(ebay, /assertMove99BatchIntegrity\(state, pageRecord, targetIds, targetPage\)/);
});

test("Store category apply is exact and pauses before Submit", () => {
  assert.match(ebay, /selected category/);
  assert.match(ebay, /\[class\*="store-category"\]/);
  assert.match(ebay, /function findPrimaryStoreCategoryFieldset/);
  assert.match(ebay, /button\[name="storePrimaryCategory"\]/);
  assert.match(ebay, /findPrimaryStoreCategoryChooserByContract\(livePrimaryFieldset\)/);
  assert.match(ebay, /const livePrimaryTop = livePrimary\?\.getBoundingClientRect/);
  assert.match(ebay, /Number\(update\.updated \|\| 0\) !== expectedCount/);
  assert.match(ebay, /phase:\s*"awaiting-submit-approval"/);
  assert.match(ebay, /Waiting for approval before \$\{finalAction\}/);

  const gridVerifier = ebay.slice(
    ebay.indexOf("function storeCategoryGridUpdate"),
    ebay.indexOf("function findVisibleStoreCategoryCell")
  );
  assert.match(gridVerifier, /queryAllDeep\('td\[role="gridcell"\], \[role="gridcell"\]'\)/);
  assert.match(gridVerifier, /element\.closest\?\.\('tr, \[role="row"\]'\)/);
  assert.doesNotMatch(gridVerifier, /span, button, \[role="button"\], div/);

  const pauseFunction = ebay.slice(
    ebay.indexOf("async function pauseMove99AtReviewScreen"),
    ebay.indexOf("function nextMove99BatchState")
  );
  assert.doesNotMatch(pauseFunction, /submitButton\.click|clickElement\(submitButton\)|dispatchFullClick\(submitButton\)/);
});

test("an interrupted first Bulk Edit batch returns to the verified saved summary", () => {
  assert.match(ebay, /function canRecoverMove99FirstBatchFromVerifiedScan/);
  assert.match(ebay, /\["apply-exact-workspace", "apply-range", "bulk-editor-range", "bulk-editor"\]\.includes\(state\.phase\)/);
  assert.match(ebay, /Number\(state\.totals\?\.batches \|\| 0\) !== 0/);
  assert.match(ebay, /function recoverMove99VerifiedScanSummary/);
  assert.match(ebay, /phase: "scan-summary"/);
  assert.match(ebay, /lastMove99Scan: recoveredState/);
  assert.match(ebay, /lastMove99Scan: pendingMove99/);
});

test("Run Move .99 reclaims a verified first-range checkpoint without erasing its scan", () => {
  const starter = ebay.slice(
    ebay.indexOf("async function startMove99Listings"),
    ebay.indexOf("async function resumePendingActions")
  );
  const recoveryIndex = starter.indexOf("canRecoverMove99FirstBatchFromVerifiedScan(interruptedState)");
  const freshRunIndex = starter.indexOf("phase: \"active-prepare\"");
  assert.ok(recoveryIndex >= 0, "the panel launcher must recognize a verified interrupted first range");
  assert.ok(freshRunIndex > recoveryIndex, "recovery must run before a fresh scan can replace the checkpoint");
  assert.match(starter, /recoverMove99VerifiedScanSummary\(interruptedState\)/);
  assert.match(starter, /pendingMove99Run: recoveredState, lastMove99Scan: recoveredState/);
  assert.match(starter, /Review it and click Apply to continue/);
  assert.match(starter, /move99ScanPageUrl\(/);
});

test("Move .99 advances only after an explicit eBay submission result", () => {
  const parserSource = ebay.match(/function parseMove99SubmitResult\(raw, expectedCount = 0\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(parserSource, "Move .99 submission-result parser must be extractable");
  const parseMove99SubmitResult = new Function(`
    ${parserSource}
    return parseMove99SubmitResult;
  `)();

  assert.deepEqual(
    { ...parseMove99SubmitResult("43 listings are now live", 43), capturedAt: "ignored" },
    { confirmed: true, expected: 43, accounted: 43, live: 43, failed: 0, capturedAt: "ignored" }
  );
  assert.equal(parseMove99SubmitResult("15 listings are now live", 16).confirmed, false);
  assert.equal(parseMove99SubmitResult("Your listing was revised", 1).confirmed, true);
  assert.equal(parseMove99SubmitResult("Review and Submit (15)", 15), null);

  const resume = ebay.slice(
    ebay.indexOf("async function resumeMove99AfterManualSubmit"),
    ebay.indexOf("async function choosePrimaryStoreCategoryOneByOne")
  );
  assert.match(resume, /parseMove99SubmitResult\(document\.body\?\.innerText/);
  assert.match(resume, /if \(!outcome\?\.result\?\.confirmed\)/);
  assert.match(resume, /if \(!state\.approvalActionObservedAt\)/);
  assert.match(resume, /stopMove99AfterLostApproval/);
  assert.match(resume, /Waiting for approval before \$\{finalAction\}/);
  assert.match(resume, /recordMove99SubmittedBatch/);
  assert.doesNotMatch(resume, /recoverMove99ThroughVerification/);
  assert.doesNotMatch(resume, /Submit completed\. Continuing the next saved batch/);

  const confirmationGuard = resume.indexOf("if (!outcome?.result?.confirmed)");
  const nextBatch = resume.indexOf("nextMove99BatchState(recorded)");
  assert.ok(confirmationGuard >= 0 && nextBatch > confirmationGuard, "the next batch must remain behind explicit eBay confirmation");
  const ambiguousExitPath = resume.slice(0, resume.indexOf("const recorded = recordMove99SubmittedBatch"));
  assert.doesNotMatch(ambiguousExitPath, /navigateToMove99ScanPage|createMove99BulkWorkspace|nextMove99BatchState/);
});

test("Move .99 hard-locks the final review to one tab and never auto-recovers an ambiguous exit", () => {
  const pause = ebay.slice(
    ebay.indexOf("async function pauseMove99AtReviewScreen"),
    ebay.indexOf("function nextMove99BatchState")
  );
  assert.match(pause, /approvalTabId: tabInfo\.tabId/);
  assert.match(pause, /approvalUrl: location\.href/);
  assert.match(pause, /approvalWorkspaceId: currentBulkWorkspaceId\(\)/);
  assert.match(pause, /approvalActionObservedAt: ""/);
  assert.match(pause, /armMove99SubmitApprovalClick\(submitButton, approvalState\)/);

  const approvalClick = ebay.slice(
    ebay.indexOf("async function recordMove99ApprovalAction"),
    ebay.indexOf("async function currentMove99ApprovalState")
  );
  assert.match(approvalClick, /Number\(tabInfo\.tabId\) !== Number\(state\.approvalTabId\)/);
  assert.match(approvalClick, /if \(!event\.isTrusted\) return/);
  assert.match(approvalClick, /approvalActionObservedAt: marker\.observedAt/);

  const resumePending = ebay.slice(
    ebay.indexOf("async function resumePendingActions"),
    ebay.indexOf("function renderStatus", ebay.indexOf("async function resumePendingActions"))
  );
  assert.match(resumePending, /resumeMove99AfterManualSubmit\(pendingMove99\)/);
  assert.doesNotMatch(resumePending, /recoverMove99VariationLimitState/);

  const runner = ebay.slice(
    ebay.indexOf("async function runMove99Automation"),
    ebay.indexOf("async function startMove99Listings")
  );
  const approvalGate = runner.indexOf('state.phase === "awaiting-submit-approval"');
  const interruptionCheck = runner.indexOf('stopForEbayInterruption("Move .99")');
  assert.ok(approvalGate >= 0 && approvalGate < interruptionCheck, "approval must be gated before any normal workflow action");
  assert.match(runner, /if \(state\.phase === "approval-lost"\) return/);

  const claim = background.slice(
    background.indexOf("function claimMove99Tab"),
    background.indexOf("function createChromeTab")
  );
  assert.match(claim, /state\.phase === 'awaiting-submit-approval' \|\| state\.phase === 'approval-lost'/);
  assert.match(claim, /approvalLocked: true/);
});

test("Move .99 recovery is read-only, resumable, idempotent, and auditable", () => {
  assert.match(ebay, /function canRecoverMove99ThroughVerification/);
  assert.match(ebay, /function recoverMove99ThroughVerification/);
  assert.match(ebay, /phase:\s*"verify-page"/);
  assert.match(ebay, /submitResultUnknown:\s*true/);
  assert.match(ebay, /recoveryHistory:\s*recoveryHistory\.slice\(-50\)/);
  assert.match(ebay, /function recordMove99SubmittedBatch/);
  assert.match(ebay, /submittedBatchKeys\.has\(batchKey\)/);
  assert.match(ebay, /submittedBatchKeys:\s*\[\.\.\.submittedBatchKeys\]/);
  assert.match(ebay, /Submitted and confirmed/);
  assert.match(ebay, /Needs verification \/ retry/);
  assert.match(ebay, /Retry Failed Only/);

  const heartbeat = ebay.slice(
    ebay.indexOf("// SPA-navigation heartbeat"),
    ebay.indexOf("const observer = new MutationObserver", ebay.indexOf("// SPA-navigation heartbeat"))
  );
  assert.match(heartbeat, /pending\?\.phase === "awaiting-submit-approval"/);
  assert.match(heartbeat, /resumeMove99AfterManualSubmit\(pending\)/);

  const bulkPhase = ebay.slice(
    ebay.indexOf('if (state.phase === "bulk-editor")'),
    ebay.indexOf('if (state.phase === "awaiting-submit-approval")')
  );
  assert.doesNotMatch(bulkPhase, /Batch complete[^\n]*result\.live/);
});

test("one-listing audited batches use the single Revise editor and remain approval-gated", () => {
  assert.match(ebay, /function isMove99SingleListingEditorPage/);
  assert.match(ebay, /function singleListingEditorItemId/);
  assert.match(ebay, /actualId !== expectedId/);
  assert.match(ebay, /choosePrimaryStoreCategorySingleListing\(batchCount, state\)/);
  assert.match(ebay, /isMove99SingleListingEditorPage\(\) \? "Revise it" : "Submit"/);
  assert.match(ebay, /isMove99BulkEditorPage\(\) \|\| isMove99SingleListingEditorPage\(\)/);

  const singleCategory = ebay.slice(
    ebay.indexOf("async function choosePrimaryStoreCategorySingleListing"),
    ebay.indexOf("async function pauseMove99AtReviewScreen")
  );
  assert.doesNotMatch(singleCategory, /revise it/i);
});

test("eBay-omitted Bulk Edit rows are verified and deferred without shifting the saved page", () => {
  assert.match(ebay, /function reconcileBulkWorkspaceBatch/);
  assert.match(ebay, /eBay Bulk Edit contains a row that is not in the saved \$\{move99WorkflowLabel\(\)\} batch/);
  assert.match(ebay, /scan\.scanState\.qualifyingRows\.size !== admittedCount/);
  assert.match(ebay, /currentBatchSourceCount:\s*batchCount/);
  assert.match(ebay, /state\.currentBatchSourceCount \|\| state\.currentBatchIds\?\.length/);
  assert.match(ebay, /omitted listing will be retried during final verification/);
  assert.doesNotMatch(ebay, /processed\.total !== expectedCount/);
});

test("Move .99 reconciliation and category polling stay bounded and cooperative", () => {
  assert.match(ebay, /const deepQueryScopeCache = new WeakMap\(\)/);
  assert.match(ebay, /now - cached\.at < 250/);
  assert.match(ebay, /Math\.max\(120000, Math\.min\(1800000, loadTarget \* 900\)\)/);
  assert.match(ebay, /Date\.now\(\) < deadline/);
  assert.match(ebay, /async function waitForCategoryApplyResult/);
  assert.match(ebay, /function categoryDraftUpdates\(\)/);
  assert.match(ebay, /document\.querySelectorAll\("\[role='status'\], \[role='alert'\], \[aria-live\]"\)/);
  assert.match(ebay, /statusUpdate\.updated === statusUpdate\.attempted/);
  assert.match(ebay, /statusUpdate\.attempted === expectedCount/);
  assert.match(ebay, /const completedMatch = text\.match/);
  assert.match(ebay, /ebay-category-complete-status/);
  assert.doesNotMatch(ebay, /parseCategoryDraftUpdate\(document\.body\?\.textContent/);
  assert.match(ebay, /function nativeBulkSelectionSummary\(\)/);
  assert.match(ebay, /\.app-summary__bottom/);
  assert.match(ebay, /selected: native\?\.selected \?\? selectedControls\.size/);
  assert.match(ebay, /total: native\?\.total \?\? Math\.max/);
  assert.match(ebay, /getAttribute\?\.\("aria-label"\) \|\| ""\) === "select all items for bulk edit"/);
  assert.match(ebay, /source: "exact eBay aria-label"/);
  assert.match(ebay, /function categoryEditorEligibleCount\(dialog\)/);
  assert.match(ebay, /eligibleCount !== expectedCount/);
  assert.match(ebay, /acceptedSubmitCounts = new Set/);
  assert.match(ebay, /!acceptedSubmitCounts\.has\(submitCount\)/);
  assert.match(ebay, /values\.length === expectedCount && destinationCount === expectedCount/);
  assert.match(ebay, /function selectedStoreCategoryGridUpdate\(expectedCount = 0\)/);
  assert.match(ebay, /nativeSelection\.selected !== expected/);
  assert.match(ebay, /selectedRows\.length !== expected/);
  assert.match(ebay, /source: "selected-grid-draft-cross-check"/);
  assert.match(ebay, /selectedStoreCategoryGridUpdate\(expectedCount\)/);
  assert.match(ebay, /choosePrimaryStoreCategory\(summary\.qualifyingCount, summary\.workspaceTotal\)/);
  assert.match(ebay, /function currentBulkWorkspaceId\(\)/);
  assert.match(ebay, /currentWorkspaceId !== previousWorkspaceId/);
  assert.match(ebay, /Date\.now\(\) - bulkEditorSeenAt >= 6500/);
  assert.match(ebay, /did not create a fresh Bulk Edit workspace/);
  assert.match(ebay, /function bulkEditorOmittedNoticeCount\(\)/);
  assert.match(ebay, /because of \(\?:a \)\?failure/);
  assert.match(ebay, /const requiredStableMs = shortfall \? 12000 : 2500/);
  assert.match(ebay, /omitted !== shortfall/);
  assert.match(ebay, /workspace settled at/);
  assert.match(ebay, /nextGridCheckAt = now \+ 2500/);
  assert.match(ebay, /Final Submit located and left untouched/);

  const chooseCategory = ebay.slice(
    ebay.indexOf("async function choosePrimaryStoreCategory"),
    ebay.indexOf("function elementArea")
  );
  assert.doesNotMatch(chooseCategory, /document\.body\?\.innerText/);
});

test("legacy Move .99 scan states restart through the exact Active Listings scanner", () => {
  assert.match(ebay, /state\?\.scanStrategy !== MOVE99_SCAN_STRATEGY/);
  assert.match(ebay, /state\?\.phase === "bulk-editor-scan"/);
  assert.match(ebay, /state\?\.phase === "apply-all-pages"/);
  assert.match(ebay, /Restarting the saved Move \.99 task with the exact Active Listings scanner/);
});

test("eBay heartbeat does no page inspection while every resumable workflow is idle", () => {
  const heartbeat = ebay.slice(
    ebay.indexOf("// SPA-navigation heartbeat"),
    ebay.indexOf("ebayPageObserver = new MutationObserver")
  );
  const idleGate = heartbeat.indexOf("if (!hasPendingWork) return;");
  const interruptionCheck = heartbeat.indexOf('stopForEbayInterruption("eBay workflow heartbeat")');
  assert.ok(idleGate >= 0 && interruptionCheck > idleGate);
  assert.match(heartbeat, /pending\?\.active/);
  assert.match(heartbeat, /result\.pendingEbaySnapshotScan\?\.active/);
  assert.match(heartbeat, /result\.pendingSnipingExtract\?\.active/);
});

test("saved Bulk Edit prompts are watched only by the exact confirmed owner run", () => {
  const clicker = ebay.slice(
    ebay.indexOf("async function clickSavedBulkEditContinueIfPresent"),
    ebay.indexOf("async function continuePastSavedBulkEditDialog")
  );
  assert.match(clicker, /run\.confirmed !== true/);
  assert.match(clicker, /String\(run\.extensionVersion \|\| ""\) !== EXTENSION_VERSION/);
  assert.match(clicker, /runtimeMessage\(\{ type: "claimMove99Tab", runId \}\)/);
  assert.match(clicker, /!claim\?\.ok \|\| !claim\.owned/);

  const watcher = ebay.slice(
    ebay.indexOf("function installSavedBulkEditDialogWatcher"),
    ebay.indexOf("function bulkEditorNavigationProgressed")
  );
  assert.match(watcher, /const eligible = \(run\) => Boolean/);
  assert.match(watcher, /run\.confirmed === true/);
  assert.match(watcher, /chrome\.storage\.onChanged\.addListener\(storageListener\)/);
  assert.match(watcher, /if \(!eligible\(run\)\) \{[\s\S]*?stopWatching\(\)/);
  assert.match(watcher, /interval = setInterval\(inspect, 750\)/);
});

test("Move .99 stays out of daily controls and is available from panel settings", () => {
  const panelStart = ebay.indexOf("function createPanel()");
  const panelMarkup = ebay.slice(panelStart, ebay.indexOf("  createPanel();", panelStart));
  assert.doesNotMatch(panelMarkup, /data-action=["']move99-workflow["'][^\n]*<\/button>/);
  assert.match(panelMarkup, /move99Button\.dataset\.action = "move99-workflow"/);
  assert.match(panelMarkup, /move99Button\.textContent = "Run Move \.99 Workflow"/);
  assert.match(panelMarkup, /move99Button\.addEventListener\("click", \(\) =>/);
  assert.match(panelMarkup, /startMove99Listings\(\)/);
  assert.match(panelMarkup, /reverseMove99Button\.dataset\.action = "move-non99-workflow"/);
  assert.match(panelMarkup, /reverseMove99Button\.textContent = "Move Non-\.99 Out of Sale"/);
  assert.match(panelMarkup, /startMove99Listings\("non99"\)/);
});

test("panel reverse launcher uses the saved sale category as source", () => {
  const launcher = ebay.slice(
    ebay.indexOf('async function startMove99Listings(scanMode = "price99")'),
    ebay.indexOf("async function resumePendingActions")
  );
  assert.match(launcher, /const reverse = scanMode === "non99"/);
  assert.match(launcher, /reverse \? \[accountConfig\.destinationCategory\] : accountConfig\.sourceCategories/);
  assert.match(launcher, /reverse \? accountConfig\.sourceCategories\[0\] : accountConfig\.destinationCategory/);
  assert.match(launcher, /reverse \? \[\] : accountConfig\.sourceStoreCategoryIds/);
  assert.match(launcher, /scanMode: reverse \? "non99" : "price99"/);
});

test("reverse category discovery cannot overwrite forward Move .99 settings", () => {
  const remember = ebay.slice(
    ebay.indexOf("async function rememberDiscoveredMove99SourceCategoryIds"),
    ebay.indexOf("async function waitForStableFilteredResults")
  );
  assert.match(remember, /state\.scanMode === "non99" \|\| MOVE99_SCAN_MODE === "non99"/);
  assert.match(remember, /return false/);

  const activePrepare = ebay.slice(
    ebay.indexOf('if (state.phase === "active-prepare")'),
    ebay.indexOf('if (state.phase === "scan-page"')
  );
  assert.match(activePrepare, /if \(MOVE99_SCAN_MODE !== "non99"\)/);
  assert.match(activePrepare, /MOVE99_SOURCE_STORE_CATEGORY_IDS = discoveredSourceIds/);
  assert.match(activePrepare, /MOVE99_ACTIVE_URL = buildMove99ActiveUrl\(discoveredSourceIds\)/);
  assert.match(activePrepare, /filteredUrl = buildMove99ActiveUrl\(discoveredSourceIds\)/);
});
