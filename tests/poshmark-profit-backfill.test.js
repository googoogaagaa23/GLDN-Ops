const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const backfill = require("../extension/profit-backfill.js");

function sale(orderNumber, orderDate, asin = "B012345678", earnings = 16) {
  return {
    orderNumber,
    orderDate,
    itemTitle: `Poshmark item ${orderNumber}`,
    marketplaceEarnings: earnings,
    marketplaceSoldPrice: 20,
    sku: asin,
    skus: [asin],
    asins: [asin],
    pageUrl: `https://poshmark.com/order/sales/${orderNumber}`,
    detailCapturedAt: "2026-07-23T10:00:00.000Z"
  };
}

function purchase(orderId, purchaseDate, asin = "B012345678", cost = 9.99, quantity = 1) {
  return {
    orderId,
    purchaseDate,
    asin,
    cost,
    quantity,
    title: `Amazon item ${asin}`,
    orderUrl: `https://www.amazon.com/your-orders/order-details?orderID=${orderId}`,
    source: "amazon-order-detail-asin-row",
    capturedAt: "2026-07-23T10:01:00.000Z"
  };
}

test("sales pagination deduplicates order IDs and stops on a repeated page", () => {
  let run = backfill.createRun({ scope: "all", maxOrders: 100 });
  run = backfill.mergeSalesPage(run, [sale("p1", "Jul 22, 2026"), sale("p2", "Jul 21, 2026")], { hasNext: true });
  assert.equal(run.phase, "index-sales");
  assert.equal(run.sales.length, 2);
  run = backfill.mergeSalesPage(run, [sale("p2", "Jul 21, 2026"), sale("p3", "Jul 20, 2026")], { hasNext: true });
  assert.equal(run.sales.length, 3);
  run = backfill.mergeSalesPage(run, [sale("p2", "Jul 21, 2026"), sale("p3", "Jul 20, 2026")], { hasNext: true });
  assert.equal(run.phase, "capture-posh-details");
  assert.equal(run.pageFingerprints.length, 2);
});

test("pilot scope caps indexing at ten orders", () => {
  let run = backfill.createRun({ scope: "pilot" });
  const records = Array.from({ length: 20 }, (_, index) => sale(`pilot-${index}`, "Jul 22, 2026"));
  run = backfill.mergeSalesPage(run, records, { hasNext: true });
  assert.equal(run.sales.length, 10);
  assert.equal(run.phase, "capture-posh-details");
});

test("single-sale scope is capped to one exact order", () => {
  const run = backfill.createRun({ scope: "single" });
  assert.equal(run.scope, "single");
  assert.equal(run.maxOrders, 1);
});

test("month scope indexes only the requested calendar month and stops after it", () => {
  let run = backfill.createRun({ scope: "month", monthKey: "2026-04" });
  run = backfill.mergeSalesPage(run, [
    sale("may-1", "May 2, 2026"),
    sale("apr-2", "Apr 30, 2026"),
    sale("apr-1", "Apr 1, 2026")
  ], { hasNext: true });
  assert.equal(run.phase, "index-sales");
  assert.deepEqual(run.sales.map((item) => item.orderNumber), ["apr-2", "apr-1"]);
  run = backfill.mergeSalesPage(run, [sale("mar-1", "Mar 31, 2026")], { hasNext: true });
  assert.equal(run.phase, "capture-posh-details");
  assert.equal(run.monthKey, "2026-04");
  assert.equal(backfill.monthLabel(run.monthKey), "April 2026");
});

test("month scope rejects an invalid or missing month", () => {
  assert.throws(() => backfill.createRun({ scope: "month" }), /valid YYYY-MM month/);
  assert.throws(() => backfill.createRun({ scope: "month", monthKey: "04-2026" }), /valid YYYY-MM month/);
});

test("incremental scope stops when it reaches a locally known synced order", () => {
  let run = backfill.createRun({ scope: "incremental", knownOrderNumbers: ["known-1"] });
  run = backfill.mergeSalesPage(run, [sale("new-1", "Jul 23, 2026"), sale("known-1", "Jul 22, 2026"), sale("older-1", "Jul 21, 2026")], { hasNext: true });
  assert.equal(run.phase, "capture-posh-details");
  assert.deepEqual(run.sales.map((item) => item.orderNumber), ["new-1"]);
});

test("detail capture replaces summary fields and advances one checkpoint", () => {
  let run = backfill.createRun({ scope: "pilot" });
  run.sales = [{ orderNumber: "detail-1", itemTitle: "summary" }];
  run.phase = "capture-posh-details";
  run = backfill.mergeSaleDetail(run, sale("detail-1", "Jul 22, 2026"));
  assert.equal(run.detailIndex, 1);
  assert.deepEqual(run.sales[0].asins, ["B012345678"]);
  assert.ok(run.sales[0].detailCapturedAt);
});

test("one Amazon unit can be allocated to only one Poshmark sale", () => {
  let run = backfill.createRun({ scope: "all" });
  run.sales = [sale("oldest", "Jul 20, 2026"), sale("newest", "Jul 21, 2026")];
  run = backfill.addPurchase(run, purchase("114-1111111-1111111", "Jul 20, 2026"));
  run = backfill.allocate(run, { computerLabel: "7", supplierProfile: "F9132" });
  assert.equal(run.results.find((result) => result.orderNumber === "oldest").status, "exact");
  assert.equal(run.results.find((result) => result.orderNumber === "newest").status, "amazon-not-found");
  assert.equal(run.purchases.filter((item) => item.allocatedTo).length, 1);
});

test("Amazon quantity expands into separately allocatable units", () => {
  let run = backfill.createRun({ scope: "all" });
  run.sales = [sale("q1", "Jul 20, 2026"), sale("q2", "Jul 21, 2026")];
  run = backfill.addPurchase(run, purchase("114-2222222-2222222", "Jul 20, 2026", "B012345678", 8.5, 2));
  run = backfill.allocate(run, { computerLabel: "7" });
  assert.equal(run.results.filter((result) => result.status === "exact").length, 2);
  assert.deepEqual(run.purchases.map((item) => item.unitIndex), [1, 2]);
});

test("multiple matching Amazon orders never become an automatic exact match", () => {
  let run = backfill.createRun({ scope: "all" });
  run.sales = [sale("ambiguous", "Jul 20, 2026")];
  run = backfill.addPurchase(run, purchase("114-3333333-3333333", "Jul 20, 2026", "B012345678", 8.5));
  run = backfill.addPurchase(run, purchase("114-4444444-4444444", "Jul 21, 2026", "B012345678", 9.5));
  run = backfill.allocate(run, { computerLabel: "7" });
  assert.equal(run.results[0].status, "needs-review-ambiguous-cost");
  assert.equal(run.results[0].record, undefined);
  assert.equal(run.purchases.some((item) => item.allocatedTo), false);
});

test("same-cost duplicates remain reviewable instead of fabricating order provenance", () => {
  let run = backfill.createRun({ scope: "all" });
  run.sales = [sale("same-cost", "Jul 20, 2026")];
  run = backfill.addPurchase(run, purchase("114-5555555-5555555", "Jul 20, 2026", "B012345678", 9.99));
  run = backfill.addPurchase(run, purchase("114-6666666-6666666", "Jul 21, 2026", "B012345678", 9.99));
  run = backfill.allocate(run, { computerLabel: "7" });
  assert.equal(run.results[0].status, "needs-review-same-cost");
});

test("exact records contain both earnings and traceable Amazon unit evidence", () => {
  let run = backfill.createRun({ scope: "all" });
  run.sales = [sale("exact-1", "Jul 20, 2026", "B012345678", 16)];
  run = backfill.addPurchase(run, purchase("114-7777777-7777777", "Jul 20, 2026", "B012345678", 9.99));
  run = backfill.allocate(run, { computerLabel: "7", supplierProfile: "F9132" });
  const record = run.results[0].record;
  assert.equal(record.marketplaceEarnings, 16);
  assert.equal(record.supplierTotal, 9.99);
  assert.equal(record.profit, 6.01);
  assert.equal(record.supplierOrderNumber, "114-7777777-7777777");
  assert.equal(JSON.parse(record.supplierItemEvidence)[0].unitKey, "114-7777777-7777777:B012345678:1");
  assert.equal(record.source, "poshmark-historical-profit-backfill");
  assert.equal(record.monthKey, "2026-07");
});

test("monthly review records keep unresolved Amazon costs blank and profile-attempt evidence", () => {
  let run = backfill.createRun({ scope: "month", monthKey: "2026-04" });
  run.sales = [sale("missing-april", "Apr 8, 2026")];
  run = backfill.allocate(run, { computerLabel: "7", supplierProfile: "Profile 2" });
  const review = backfill.reviewRecords(run, { supplierProfile: "Profile 2" })[0];
  assert.equal(review.monthKey, "2026-04");
  assert.equal(review.status, "amazon-not-found");
  assert.equal(review.supplierTotal, null);
  assert.deepEqual(review.attemptedSupplierProfiles, ["Profile 2"]);
});

test("historical review exposes the exact Amazon order and ASIN before sync", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  assert.match(poshmark, /showHistoricalProfitBackfillReview[\s\S]{0,220}gldn-posh-backfill-launcher/);
  assert.match(poshmark, /order \$\{record\.supplierOrderNumber \|\| "not captured"\}/);
  assert.match(poshmark, /ASIN \$\{record\.supplierItemIds \|\| "not captured"\}/);
});

test("historical review is paged and cannot recreate itself from its own DOM mutations", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  const styles = fs.readFileSync(path.resolve(__dirname, "..", "extension", "styles.css"), "utf8");
  assert.match(poshmark, /const BACKFILL_REVIEW_PAGE_SIZE = 25/);
  assert.match(poshmark, /results\.slice\(start, end\)/);
  assert.match(poshmark, /data-action="previous-results"/);
  assert.match(poshmark, /data-action="next-results"/);
  assert.match(poshmark, /restoredBackfillReviewRunId = String\(run\.runId/);
  assert.match(poshmark, /if \(restoredBackfillReviewRunId\) return;/);
  assert.match(poshmark, /restoredBackfillReviewRunId !== runId/);
  assert.match(styles, /\.gldn-review-pagination/);
  assert.match(poshmark, /APPROVE SYNC POSHMARK \$\{run\.monthKey\} \$\{remaining\}/);
});

test("missing SKU and out-of-window purchases are not synced as exact", () => {
  let run = backfill.createRun({ scope: "all" });
  run.sales = [
    { ...sale("missing", "Jul 20, 2026"), asins: [] },
    sale("old-amazon", "Jul 20, 2026")
  ];
  run = backfill.addPurchase(run, purchase("114-8888888-8888888", "Aug 15, 2026"));
  run = backfill.allocate(run, { computerLabel: "7" });
  assert.deepEqual(run.results.map((result) => result.status), ["missing-sku", "amazon-not-found"]);
  assert.match(run.results[0].reason, /marketplace SKU/i);
});

test("eBay resolution approval count includes unresolved rows for the next Amazon profile", () => {
  require("../extension/foundation.js");
  const foundation = globalThis.GLDN_FOUNDATION;
  let run = backfill.createRun({ scope: "resolve-ebay", platform: "eBay", monthKey: "2026-07" });
  run.sales = [sale("unresolved-ebay", "Jul 20, 2026")];
  run = backfill.allocate(run, { platform: "eBay", supplierProfile: "Profile 2" });
  const compact = foundation.compactPoshmarkProfitBackfillControlRecord(run);
  assert.equal(compact.remainingReviewToSync, 1);
  assert.equal(compact.requiredApprovalCount, 1);
  assert.equal(compact.approvalRequired, true);
});

test("Amazon cost resolution preserves the permanent supplier-profile identity", () => {
  const run = backfill.createRun({
    scope: "resolve-ebay",
    platform: "eBay",
    monthKey: "2026-07",
    supplierProfile: "Computer 0 - Amazon 2"
  });
  assert.equal(run.supplierProfile, "Computer 0 - Amazon 2");
  assert.equal(backfill.summary(run).supplierProfile, "Computer 0 - Amazon 2");
});

test("Amazon cost review exposes out-of-window exact-ASIN purchase evidence", () => {
  const amazon = fs.readFileSync(path.resolve(__dirname, "..", "extension", "amazon.js"), "utf8");
  assert.match(amazon, /outsideWindowPurchaseSummary/);
  assert.match(amazon, /Captured exact-ASIN purchase/);
  assert.match(amazon, /purchase\.purchaseDate/);
  assert.match(amazon, /purchase\.orderId/);
});

test("eBay resolution retains note evidence while adding an independent Amazon cost", () => {
  let run = backfill.createRun({ scope: "resolve-ebay", platform: "eBay", monthKey: "2026-07" });
  run.sales = [{
    ...sale("18-14818-27804", "Jul 20, 2026"),
    platform: "eBay",
    computerLabel: "0",
    accountLabel: "FAK12",
    noteStatus: "verified",
    noteSupplierTotal: 9.99,
    noteSupplierProfile: "F9132",
    noteProfit: 10.47,
    marketplaceEarnings: 20.46
  }];
  run = backfill.addPurchase(run, purchase("113-2518790-9385867", "Jul 20, 2026", "B012345678", 10.49));
  run = backfill.allocate(run, { platform: "eBay", supplierProfile: "Amazon profile 2" });
  const review = backfill.reviewRecords(run, { supplierProfile: "Amazon profile 2" })[0];
  assert.equal(review.platform, "eBay");
  assert.equal(review.computerLabel, "0");
  assert.equal(review.accountLabel, "FAK12");
  assert.equal(review.status, "resolved");
  assert.equal(review.noteSupplierTotal, 9.99);
  assert.equal(review.noteProfit, 10.47);
  assert.equal(review.supplierTotal, 10.49);
  assert.equal(review.profit, 9.97);
  assert.equal(review.source, "ebay-amazon-cost-resolution");
});

test("runtime workflow uses one worker tab and an explicit spreadsheet approval token", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  const serviceWorker = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  const amazon = fs.readFileSync(path.resolve(__dirname, "..", "extension", "amazon.js"), "utf8");
  assert.match(background, /tabCreate\(\{ url: "about:blank", active: false/);
  assert.match(background, /workerTabId: worker\.id/);
  assert.match(background, /run\.scope === "single"/);
  assert.match(background, /resolvingPoshmark = options\.scope === "resolve-missing"/);
  assert.match(background, /resolvingEbay = options\.scope === "resolve-ebay"/);
  assert.match(background, /resolvingMissing = resolvingPoshmark \|\| resolvingEbay/);
  assert.match(background, /existing\?\.workerTabId/);
  assert.doesNotMatch(background, /Promise\.all\([^)]*tabCreate/);
  assert.match(serviceWorker, /APPROVE SYNC POSHMARK/);
  assert.match(serviceWorker, /APPROVE RESOLVE POSHMARK COSTS/);
  assert.match(serviceWorker, /APPROVE RESOLVE EBAY COSTS/);
  assert.match(amazon, /async function approveAmazonCostResolutionReview/);
  assert.match(amazon, /APPROVE RESOLVE EBAY COSTS \$\{remaining\}/);
  assert.match(amazon, /syncPoshmarkProfitBackfill", confirm: approvalToken \}, 360000/);
  assert.doesNotMatch(amazon, /button\.dataset\.confirmSync/);
  assert.match(amazon, /applyAmazonCostResolutionSuccess\(overlay, response, marketplaceName, resolvingEbay, remaining\)/);
  assert.match(amazon, /Results Saved/);
  assert.match(amazon, /Monthly eBay Profit run remains in the Chrome profile signed into eBay/);
  assert.match(amazon, /"approve-historical-profit-review": \(\) => approveAmazonCostResolutionReview/);
  assert.match(amazon, /message\.action === "approve-historical-profit-review"/);
  assert.match(serviceWorker, /Set a permanent Amazon profile name/);
  assert.match(poshmark, /dataset\.confirmSync !== "true"/);
  assert.match(poshmark, /Confirm \$\{remaining\} Row/);
  assert.match(poshmark, /: "SYNC_EXACT_POSHMARK_PROFITS"/);
  assert.match(poshmark, /syncPoshmarkProfitBackfill", confirm/);
  assert.match(poshmark, /showHistoricalProfitBackfillReview\(response\.state\)/);
  assert.match(serviceWorker, /summary: globalThis\.GLDN_PROFIT_BACKFILL\.summary\(state\),[\s\S]{0,80}state,/);
  assert.doesNotMatch(poshmark, /syncPoshmarkProfitBackfill[\s\S]{0,120}captureVisibleSales/);
});

test("monthly sync batches are durable, count every reviewed row, and finish the checkpoint", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  const serviceWorker = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  assert.match(serviceWorker, /HISTORICAL_PROFIT_SYNC_BATCH_SIZE = 50/);
  assert.match(serviceWorker, /DASHBOARD_BATCH_REQUEST_TIMEOUT_MS = 90000/);
  assert.match(serviceWorker, /'ebayMonthlyProfitBatch'/);
  assert.match(serviceWorker, /'ebayCostResolutionBatch'/);
  assert.match(serviceWorker, /batchActions\.has\(String\(action \|\| ''\)\)/);
  assert.match(serviceWorker, /historicalProfitBatchSyncId/);
  assert.match(serviceWorker, /if \(historicalProfitSyncPromise\) return historicalProfitSyncPromise/);
  assert.match(serviceWorker, /markSynced\(handledOrders,\s*\{\s*queued:/);
  assert.match(serviceWorker, /keepWorkerOpen: \['resolve-missing', 'resolve-ebay'\]\.includes\(run\.scope\)/);
  assert.match(background, /phase: "completed"/);
  assert.match(background, /workerTabId: null/);
  assert.match(background, /syncDelivery: options\.queued === true \? "queued" : "confirmed"/);
  assert.match(background, /options\.keepWorkerOpen !== true[\s\S]{0,100}void tabRemove\(workerTabId\)/);
  assert.match(poshmark, /syncPoshmarkProfitBackfill", confirm \}, 360000/);
  assert.match(poshmark, /\["review", "completed"\]\.includes/);
});

test("Poshmark and Amazon adapters cover 100-row and paginated collection", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  const amazon = fs.readFileSync(path.resolve(__dirname, "..", "extension", "amazon.js"), "utf8");
  assert.match(poshmark, /ensureHistoricalSalesPageSize/);
  assert.match(poshmark, /ensureHistoricalSalesPageSize[\s\S]{0,900}100/);
  assert.match(poshmark, /\[data-test='dropdown'\], \.dropdown, \.dropdown__selector/);
  assert.match(poshmark, /\[data-test='dropdown_menu_list'\] \.dropdown__link/);
  assert.match(poshmark, /instruction === "next-page"/);
  assert.match(amazon, /findAmazonOrderSearchMatches/);
  assert.match(amazon, /amazonOrderSearchResultCards/);
  assert.match(amazon, /amazonOrderSearchResultsReady/);
  assert.match(amazon, /attempt < 12 && !purchase/);
  assert.match(amazon, /ORDER PLACED\|Ordered on/);
  assert.match(amazon, /amazonPurchaseDateFromOrderDetail/);
  assert.match(amazon, /\.a-pagination \.a-last a/);
  assert.match(amazon, /slides\|carousel/);
  assert.match(amazon, /instruction === "next-amazon-page"/);
  assert.match(amazon, /extractAmazonOrderDetailItemCostByAsin/);
});

test("transient Poshmark detail shells retry before a sale is left unresolved", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  assert.match(background, /MAX_POSH_DETAIL_ATTEMPTS = 3/);
  assert.match(background, /poshDetailAttempts/);
  assert.match(background, /gldn_detail_retry/);
  assert.match(background, /instruction: "retry-posh-detail"/);
  assert.match(background, /after \$\{MAX_POSH_DETAIL_ATTEMPTS\} attempts/);
});

test("a pre-update missing Poshmark detail can repair from review without rescanning the month", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  assert.match(background, /function nextMissingDetailIndex\(run, startIndex = 0\)/);
  assert.match(background, /async function advanceMissingDetailRepair\(run\)/);
  assert.match(background, /run\.phase === "review"/);
  assert.match(background, /gldn_detail_repair/);
  assert.match(background, /repairMissingDetails: true/);
  assert.match(background, /const recoveredAsins =/);
  assert.match(background, /asinIndex: priorAsins\.length/);
  assert.match(background, /poshDetailFailures/);
  assert.match(background, /resolvedErrors/);
});

test("Amazon backfill checkpoints navigate directly to the exact ASIN search", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  assert.match(background, /function amazonOrdersSearchUrl\(asin\)/);
  assert.match(background, /url\.searchParams\.set\("search", normalized\)/);
  assert.match(background, /navigateWorker\(next, amazonOrdersSearchUrl\(next\.currentAsin\)\)/);
  assert.match(background, /navigateWorker\(run, amazonOrdersSearchUrl\(run\.currentAsin\)\)/);
});

test("Poshmark historical indexing waits for rendered sale rows and cannot complete on an empty loading shell", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  assert.match(poshmark, /async function waitForHistoricalSalesRecords\(timeoutMs = 30000, options = \{\}\)/);
  assert.match(poshmark, /records\.length >= expectedCount/);
  assert.match(poshmark, /historicalSalesPageSize\(\) \|\| 20/);
  assert.match(poshmark, /found \$\{visibleSaleSummaries\(\)\.length\}, expected/);
  const reportBlock = poshmark.slice(
    poshmark.indexOf("async function reportHistoricalSalesPage"),
    poshmark.indexOf("function backfillResultRows")
  );
  assert.match(reportBlock, /await waitForHistoricalSalesRecords\(\)/);
  assert.match(reportBlock, /minimumCount: pageSizeChanged \? 100 : 0/);
  assert.doesNotMatch(reportBlock, /const records = visibleSaleSummaries\(\)/);
  assert.match(reportBlock, /instruction === "retry-current-page"/);
  assert.match(reportBlock, /instruction === "paused-empty-month"/);
  assert.match(background, /if \(!records\.length\)/);
  assert.match(background, /instruction: "retry-current-page"/);
  assert.match(background, /instruction: "paused-empty-page"/);
  assert.match(background, /No empty page was accepted as a completed month/);
  assert.match(background, /No \$\{run\.monthLabel \|\| run\.monthKey\} sales were verified/);
  assert.match(background, /instruction: "paused-empty-month"/);
});

test("Poshmark page-size automation supports the live custom dropdown and waits for 100 rows", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  assert.match(poshmark, /candidates\.find\(\(element\) => element\.matches\("\[data-test='dropdown'\], \.dropdown"\)\)/);
  assert.match(poshmark, /\[data-test='dropdown_menu_list'\] \.dropdown__link/);
  assert.match(poshmark, /element\.matches\("button, a, li, \[role='option'\], \[role='menuitem'\], \.dropdown__link/);
  assert.match(poshmark, /historicalSalesPageSize\(\) !== 100/);
  assert.match(poshmark, /pageSizeChanged \? 45000 : 30000/);
});

test("Poshmark monthly traversal targets the real sales-table Next control", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  assert.match(poshmark, /\.my-sales-desktop-table__pagination-btn/);
  assert.match(poshmark, /tablePagination\[tablePagination\.length - 1\]/);
});

test("discarded monthly workers restart only the read-only index and cannot false-complete on page one", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  const popup = fs.readFileSync(path.resolve(__dirname, "..", "extension", "popup.js"), "utf8");
  assert.match(background, /autoDiscardable: false/);
  assert.match(background, /const workerUnavailable = !worker \|\| worker\.discarded === true \|\| worker\.status === "unloaded"/);
  assert.match(background, /pageFingerprints: \[\]/);
  assert.match(background, /indexRestartReason: workerUnavailable \? "worker-recreated" : "false-empty-month"/);
  assert.match(popup, /indexRestartReason: 'false-empty-month'/);
  assert.match(popup, /resumePhase: 'index-sales'/);
  assert.match(popup, /chrome\.tabs\.update\(tabId, \{ autoDiscardable: false \}/);
});
