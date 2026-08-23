const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const core = require("../extension/ebay-profit-core.js");

function order(orderNumber, orderDate, overrides = {}) {
  return {
    orderNumber,
    orderDate,
    itemTitle: `Item ${orderNumber}`,
    pageUrl: `https://www.ebay.com/sh/ord/details?orderid=${orderNumber}`,
    ...overrides
  };
}

test("saved eBay notes expose independent note-only earnings and cost", () => {
  const parsed = core.parseSavedNote("$20.46 - $9.99 - F9132 - 7/6", { visibleEarnings: 20.46 });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "verified");
  assert.equal(parsed.marketplaceEarnings, 20.46);
  assert.equal(parsed.supplierTotal, 9.99);
  assert.equal(parsed.supplierProfile, "F9132");
  assert.equal(parsed.eta, "7/6");
  assert.equal(core.parseSavedNote("").status, "missing-note");
  assert.equal(core.parseSavedNote("20.46 - 9.99").status, "verified-amounts");
  assert.equal(core.parseSavedNote("20.46 - 0 - F9132 - 7/6").status, "needs-note-confirmation");
});

test("note amount cleanup is automatic only when deterministic", () => {
  const normalized = core.parseSavedNote("$20,46 - $9,99 - F9132 - 7/6", { visibleEarnings: 20.46 });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.status, "normalized-note");
  assert.equal(normalized.marketplaceEarnings, 20.46);
  assert.equal(normalized.supplierTotal, 9.99);

  const misspelled = core.parseSavedNote("2O.46 - 9.O9 - F9132 - 7/6", { visibleEarnings: 20.46 });
  assert.equal(misspelled.status, "needs-note-confirmation");
  assert.equal(misspelled.suggestedMarketplaceEarnings, 20.46);
  assert.equal(misspelled.suggestedSupplierTotal, 9.09);

  const missingDecimal = core.parseSavedNote("20.46 - 999 - F9132 - 7/6", { visibleEarnings: 20.46 });
  assert.equal(missingDecimal.status, "needs-note-confirmation");
  assert.equal(missingDecimal.suggestedSupplierTotal, 9.99);
  assert.deepEqual(missingDecimal.supplierTotalCandidates, [9.99, 999]);
});

test("July indexing ignores newer August orders and stops after June", () => {
  let run = core.createRun({
    monthKey: "2026-07",
    computerLabel: "0",
    accountLabel: "FAK12",
    now: "2026-08-07T12:00:00.000Z"
  });
  run = core.mergeOrdersPage(run, [
    order("18-00001-00001", "Aug 2"),
    order("18-00002-00002", "Jul 31"),
    order("18-00003-00003", "Jul 15")
  ], { hasNext: true });
  assert.equal(run.phase, "index-orders");
  assert.deepEqual(run.orders.map((item) => item.orderNumber), ["18-00002-00002", "18-00003-00003"]);

  run = core.mergeOrdersPage(run, [
    order("18-00004-00004", "Jul 1"),
    order("18-00005-00005", "Jun 30")
  ], { hasNext: true });
  assert.equal(run.phase, "capture-details");
  assert.deepEqual(run.orders.map((item) => item.orderNumber), [
    "18-00002-00002",
    "18-00003-00003",
    "18-00004-00004"
  ]);
});

test("all-history indexing spans the rolling available range and infers year rollover", () => {
  let run = core.createRun({
    scope: "all",
    computerLabel: "0",
    accountLabel: "FAK12",
    now: "2026-08-23T12:00:00.000Z"
  });
  assert.equal(run.scope, "all");
  assert.equal(run.monthKey, "");
  assert.equal(run.monthLabel, "All available history");
  assert.equal(run.rangeStart, "2024-08-23");
  assert.equal(run.rangeEnd, "2026-08-23");
  assert.equal(run.maxOrders, 25000);

  run = core.mergeOrdersPage(run, [
    order("18-10001-10001", "Aug 22"),
    order("18-10002-10002", "Jan 2")
  ], { hasNext: true });
  assert.equal(run.phase, "index-orders");

  run = core.mergeOrdersPage(run, [
    order("18-10003-10003", "Dec 31"),
    order("18-10004-10004", "Aug 23"),
    order("18-10005-10005", "Aug 22, 2024")
  ], { hasNext: true });
  assert.equal(run.phase, "capture-details");
  assert.deepEqual(run.orders.map((item) => [item.orderNumber, item.orderDate]), [
    ["18-10001-10001", "2026-08-22"],
    ["18-10002-10002", "2026-01-02"],
    ["18-10003-10003", "2025-12-31"],
    ["18-10004-10004", "2025-08-23"]
  ]);
});

test("all-history results retain each order month for profit and reconciliation", () => {
  const run = core.createRun({
    scope: "all",
    rangeStart: "2024-08-23",
    rangeEnd: "2026-08-23",
    computerLabel: "0",
    accountLabel: "FAK12"
  });
  run.orders = [order("18-20001-20001", "2025-12-31")];
  const result = core.buildResult(run, run.orders[0], {
    orderNumber: "18-20001-20001",
    orderDate: "Dec 31",
    itemTitle: "History item",
    marketplaceEarnings: 30,
    note: "30.00 - 12.00 - F9132 - 1/3",
    asins: ["B012345678"],
    pageUrl: run.orders[0].pageUrl
  });
  assert.equal(result.status, "exact");
  assert.equal(result.orderDate, "2025-12-31");
  assert.equal(result.record.monthKey, "2025-12");
  const review = core.buildReconciliationRecord({ ...run, results: [result] }, result);
  assert.equal(review.monthKey, "2025-12");
  assert.equal(core.approvalToken({ ...run, results: [result] }), "APPROVE SYNC EBAY ALL 1");
});

test("monthly order indexing requires All orders plus rendered evidence", () => {
  const awaiting = core.classifyOrdersIndexPage({
    heading: "Manage orders awaiting shipment",
    selectedStatus: "Awaiting shipment (4)",
    detailLinkCount: 4,
    bodyText: "All orders Awaiting shipment"
  });
  assert.equal(awaiting.awaitingShipment, true);
  assert.equal(awaiting.allOrders, false);
  assert.equal(awaiting.ready, false);

  const shellOnly = core.classifyOrdersIndexPage({
    heading: "Manage orders",
    selectedStatus: "All orders",
    detailLinkCount: 0,
    bodyText: "Manage orders"
  });
  assert.equal(shellOnly.allOrders, true);
  assert.equal(shellOnly.ready, false);

  const rendered = core.classifyOrdersIndexPage({
    heading: "Manage orders",
    selectedStatus: "All orders",
    detailLinkCount: 20,
    bodyText: "Results: 1-20 of 317"
  });
  assert.equal(rendered.ready, true);
  assert.equal(rendered.explicitEmpty, false);

  const urlVerified = core.classifyOrdersIndexPage({
    heading: "Orders",
    selectedStatus: "",
    detailLinkCount: 20,
    bodyText: "Results: 1-20 of 317",
    url: "https://www.ebay.com/sh/ord/?filter=status%3AALL_ORDERS"
  });
  assert.equal(urlVerified.allOrdersFromUrl, true);
  assert.equal(urlVerified.ready, true);

  const awaitingUrl = core.classifyOrdersIndexPage({
    heading: "Orders",
    selectedStatus: "",
    detailLinkCount: 4,
    bodyText: "Results: 1-4 of 4",
    url: "https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT"
  });
  assert.equal(awaitingUrl.awaitingShipment, true);
  assert.equal(awaitingUrl.ready, false);

  const empty = core.classifyOrdersIndexPage({
    heading: "Manage orders",
    selectedStatus: "All orders",
    detailLinkCount: 0,
    bodyText: "Results: 0 of 0"
  });
  assert.equal(empty.ready, true);
  assert.equal(empty.explicitEmpty, true);

  const staleEmptyText = core.classifyOrdersIndexPage({
    heading: "Manage orders",
    selectedStatus: "All orders",
    detailLinkCount: 20,
    bodyText: "Results: 0 of 0 Results: 1-20 of 317"
  });
  assert.equal(staleEmptyText.ready, true);
  assert.equal(staleEmptyText.explicitEmpty, false);
});

test("monthly order indexing fails closed on an eBay interruption", () => {
  const interrupted = core.classifyOrdersIndexPage({
    heading: "Manage orders",
    selectedStatus: "All orders",
    detailLinkCount: 0,
    bodyText: "Pardon Our Interruption. Something about your browser made us think you are a bot."
  });
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.ready, false);
});

test("accepts eBay row dates that omit the year", () => {
  assert.equal(core.extractOrderDateText("Buyer Date sold Jul 31 Total $24.00"), "Jul 31");
  assert.equal(core.isoDate(core.extractOrderDateText("Jul 31 $24.00"), "2026-07"), "2026-07-31");
  assert.equal(core.extractOrderDateText("Date paid: July 4, 2026"), "July 4, 2026");
});

test("detail review keeps note-only profit separate from visible eBay earnings", () => {
  const run = core.createRun({
    monthKey: "2026-07",
    computerLabel: "0",
    accountLabel: "FAK12"
  });
  run.orders = [order("18-14818-27804", "Jul 14, 2026")];

  const exact = core.buildResult(run, run.orders[0], {
    orderNumber: "18-14818-27804",
    orderDate: "Jul 14, 2026",
    itemTitle: "Exact item",
    marketplaceEarnings: 20.46,
    note: "20.46 - 9.99 - F9132 - 7/16",
    skus: ["QjAxMjM0NTY3OA=="],
    asins: ["B012345678"],
    orderStatus: "Shipped",
    pageUrl: "https://www.ebay.com/sh/ord/details?orderid=18-14818-27804"
  });
  assert.equal(exact.status, "exact");
  assert.equal(exact.record.profit, 10.47);
  assert.equal(exact.record.supplierTotal, 9.99);
  assert.equal(exact.record.marketplaceEarnings, 20.46);
  assert.equal(exact.record.noteMarketplaceEarnings, 20.46);
  assert.equal(exact.record.visibleMarketplaceEarnings, 20.46);
  assert.equal(exact.record.supplierProfile, "F9132");
  assert.equal(exact.record.source, "ebay-monthly-profit-note");

  const mismatch = core.buildResult(run, run.orders[0], {
    ...exact.record,
    marketplaceEarnings: 21.46,
    note: "20.46 - 9.99 - F9132 - 7/16"
  });
  assert.equal(mismatch.status, "needs-note-confirmation");
  assert.equal(mismatch.noteReview.suggestedMarketplaceEarnings, 20.46);
  assert.equal(mismatch.visibleEarnings, 21.46);

  const confirmedRun = core.confirmNoteAmounts({ ...run, results: [mismatch] }, mismatch.orderNumber, {
    marketplaceEarnings: 20.46,
    supplierTotal: 9.99
  });
  const confirmed = confirmedRun.results[0];
  assert.equal(confirmed.status, "exact");
  assert.equal(confirmed.record.noteMarketplaceEarnings, 20.46);
  assert.equal(confirmed.record.visibleMarketplaceEarnings, 21.46);
  assert.equal(confirmed.record.profit, 10.47);
  assert.equal(confirmed.record.noteStatus, "confirmed-note");
  assert.equal(confirmed.record.source, "ebay-monthly-profit-note-confirmed");

  const reconciliation = core.buildReconciliationRecord(confirmedRun, confirmed);
  assert.equal(reconciliation.marketplaceEarnings, 21.46);
  assert.equal(reconciliation.noteMarketplaceEarnings, 20.46);
  assert.equal(reconciliation.noteSupplierTotal, 9.99);
  assert.equal(reconciliation.noteProfit, 10.47);
});

test("review totals queue every unsynced order while preserving exact note totals", () => {
  let run = core.createRun({ monthKey: "2026-07", computerLabel: "0", accountLabel: "FAK12" });
  run.orders = [order("one", "Jul 1, 2026"), order("two", "Jul 2, 2026"), order("three", "Jul 3, 2026")];
  const exactDetail = (number, earnings, cost) => ({
    orderNumber: number,
    orderDate: `Jul ${number === "one" ? 1 : 2}, 2026`,
    itemTitle: number,
    marketplaceEarnings: earnings,
    note: `${earnings.toFixed(2)} - ${cost.toFixed(2)} - F9132 - 7/6`,
    pageUrl: `https://www.ebay.com/sh/ord/details?orderid=${number}`
  });
  run = core.mergeDetail(run, exactDetail("one", 20, 10));
  run = core.mergeDetail(run, exactDetail("two", 30, 12));
  run = core.mergeDetail(run, {
    orderNumber: "three",
    orderDate: "Jul 3, 2026",
    marketplaceEarnings: 15,
    note: ""
  });
  run.syncedOrderNumbers = ["one"];
  const summary = core.summary(run);
  assert.equal(summary.exact, 2);
  assert.equal(summary.unresolved, 1);
  assert.equal(summary.unsyncedExact, 1);
  assert.equal(summary.unsyncedReviewed, 2);
  assert.deepEqual(summary.totals, { earnings: 50, amazonCost: 22, profit: 28, visibleEbayEarnings: 65 });
  assert.equal(summary.approvalToken, "APPROVE SYNC EBAY 2026-07 2");
  const reviewRecords = core.reviewRecords(run);
  assert.equal(reviewRecords.length, 2);
  assert.equal(reviewRecords[0].noteStatus, "verified");
  assert.equal(reviewRecords[0].noteSupplierTotal, 12);
  assert.equal(reviewRecords[0].status, "missing-sku");
  assert.equal(reviewRecords[1].noteStatus, "missing-note");
});

test("runtime uses one inactive signed-in eBay worker and survives checkpoints", () => {
  const worker = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay-profit-background.js"), "utf8");
  const ebay = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "extension", "manifest.json"), "utf8"));
  const ebayScripts = manifest.content_scripts.find((entry) => entry.matches.includes("https://*.ebay.com/*")).js;
  assert.match(worker, /url: "about:blank",\s*active: false/);
  const createWorkerOptions = worker.match(/const worker = await tabCreate\(\{([\s\S]*?)\}\);/)?.[1] || "";
  assert.doesNotMatch(createWorkerOptions, /autoDiscardable:/);
  assert.match(worker, /tabUpdate\(worker\.id, \{ url, active: false, autoDiscardable: false \}\)/);
  assert.match(worker, /workerTabId: worker\.id/);
  assert.match(worker, /phase: "paused"/);
  assert.match(worker, /resumePhase/);
  assert.doesNotMatch(worker, /Promise\.all\([^)]*tabCreate/);
  assert.match(ebay, /extractEbayMonthlyProfitOrdersPage/);
  assert.match(ebay, /prepareEbayMonthlyProfitOrdersPage/);
  assert.match(ebay, /ebayProfitPeriodMatchesCustomRange/);
  assert.match(ebay, /ebayProfitExactControl\("All orders"\)/);
  assert.match(ebay, /ebayProfitExactControl\("Last 90 days"\)/);
  assert.match(ebay, /ebayProfitExactControl\("Custom"\)/);
  assert.match(ebay, /ebayMonthlyProfitPeriodPrepared/);
  assert.match(ebay, /url: location\.href/);
  assert.match(ebay, /nested\?\.closest\?\.\(clickableSelector\)/);
  assert.doesNotMatch(ebay, /document\.querySelector\("a\[href\*='\/ord\/details'\]"\) \|\| document\.readyState === "complete"/);
  assert.match(ebay, /ebayMonthlyProfitOrdersPage/);
  assert.match(ebay, /ebayMonthlyProfitOrderDetail/);
  assert.match(ebay, /ebayMonthlyProfitWorkerError/);
  assert.match(worker, /handleWorkerError/);
  assert.match(worker, /handleWorkerTabClosed/);
  assert.match(worker, /pauseMissingWorker\(await readRun\(\)\)/);
  assert.match(worker, /The eBay profit worker tab closed before completion/);
  assert.match(worker, /ebayMonthlyProfitProgress[\s\S]*state: paused/);
  assert.ok(ebayScripts.indexOf("ebay-profit-core.js") < ebayScripts.indexOf("ebay.js"));
});

test("unexpected monthly-profit worker closure is wired to a resumable pause", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(background, /chrome\.tabs\.onRemoved\.addListener/);
  assert.match(background, /EBAY_PROFIT_BACKGROUND\.handleWorkerTabClosed\(tabId\)/);
  assert.match(background, /operation: 'worker-tab-closed'/);
});

test("monthly-profit page failures preserve the worker while deliberate pause still closes it", () => {
  const worker = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay-profit-background.js"), "utf8");
  const ebay = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay.js"), "utf8");
  const pauseBlock = worker.slice(
    worker.indexOf("async function pauseAtCheckpoint"),
    worker.indexOf("async function pauseMissingWorker")
  );
  const errorBlock = worker.slice(
    worker.indexOf("async function handleWorkerError"),
    worker.indexOf("async function handleOrderDetail")
  );
  const resumeBlock = worker.slice(
    worker.indexOf("async function resume"),
    worker.indexOf("async function handleOrdersPage")
  );
  const stopBlock = worker.slice(
    worker.indexOf("async function stop"),
    worker.indexOf("async function reset")
  );

  assert.match(pauseBlock, /closeWorker = options\.closeWorker !== false/);
  assert.match(pauseBlock, /workerTabId: preservedWorker \? workerTabId : null/);
  assert.match(pauseBlock, /if \(closeWorker &&[\s\S]*tabRemove\(workerTabId\)/);
  assert.match(errorBlock, /closeWorker: false/);
  assert.match(errorBlock, /The failed eBay tab was left open for inspection; Resume will reuse it\./);
  assert.doesNotMatch(errorBlock, /tabRemove\(/);
  assert.match(resumeBlock, /const preservedWorker = await tabGet\(Number\(run\.workerTabId\)\)/);
  assert.match(resumeBlock, /if \(!preservedWorker\) run = await createWorker\(run, sender\)/);
  assert.match(stopBlock, /return pauseAtCheckpoint\(run, "Paused by the operator\./);
  assert.match(ebay, /let workerPhase = "unknown"/);
  assert.match(ebay, /phase: workerPhase/);
});

test("monthly-profit review preserves its final eBay page until sync or reset", () => {
  const worker = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay-profit-background.js"), "utf8");
  const review = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay-profit.js"), "utf8");
  const finishBlock = worker.slice(
    worker.indexOf("async function finishReview"),
    worker.indexOf("async function pauseAtCheckpoint")
  );
  const syncBlock = worker.slice(
    worker.indexOf("async function markSynced"),
    worker.indexOf("async function pauseIncompatibleVersion")
  );

  assert.match(finishBlock, /workerTabId: preservedWorker \? workerTabId : null/);
  assert.match(finishBlock, /workerPreserved: preservedWorker/);
  assert.doesNotMatch(finishBlock, /tabRemove\(/);
  assert.match(syncBlock, /if \(!remaining\.length[\s\S]*tabRemove\(workerTabId\)/);
  assert.match(review, /final eBay worker page was left open/);
  assert.match(review, /final eBay worker page remains open until this run is synced or reset/);
});

test("dashboard sync is count-bound and sends exact notes plus every reconciliation row", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const review = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay-profit.js"), "utf8");
  assert.match(background, /const expectedToken = EBAY_PROFIT_CORE\.approvalToken\(pending\.run\)/);
  assert.match(background, /String\(confirmToken \|\| ''\)\.trim\(\) !== expectedToken/);
  assert.match(background, /pending\.reviewRecords\.slice/);
  assert.match(background, /handleSync\('ebayMonthlyProfitBatch'/);
  assert.match(background, /reviewRecords/);
  assert.match(review, /summary\.approvalToken/);
  assert.match(review, /syncEbayMonthlyProfit/);
  assert.match(review, /confirmEbayMonthlyProfitNoteAmounts/);
  assert.match(review, /Confirm note amounts/);
  assert.match(review, /This changes only the internal note-based profit read/i);
  assert.match(review, /approved reviewed range/i);
  assert.match(review, /independent Amazon-cost queue/i);
});

test("popup and eBay panel settings expose profit audit without cluttering daily actions", () => {
  const popupHtml = fs.readFileSync(path.resolve(__dirname, "..", "extension", "popup.html"), "utf8");
  const popupJs = fs.readFileSync(path.resolve(__dirname, "..", "extension", "popup.js"), "utf8");
  const ebay = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay.js"), "utf8");
  assert.match(popupHtml, /id="openEbayMonthlyProfit"/);
  assert.match(popupJs, /getURL\('ebay-profit\.html'\)/);
  assert.match(ebay, /monthlyProfitButton\.dataset\.action = "monthly-profit"/);
  const dailyPanel = ebay.match(/panel\.innerHTML = `([\s\S]*?)`;\s*document\.documentElement\.appendChild\(panel\)/)?.[1] || "";
  assert.doesNotMatch(dailyPanel, /monthly-profit|Monthly eBay Profit/);
  assert.match(ebay, /panelSettingsMenu\.appendChild\(monthlyProfitButton\)/);
  assert.match(ebay, /showEbayMonthlyProfitLauncher/);
  assert.match(ebay, /startEbayProfitForRange\(scopeInput\.value, monthInput\.value\)/);
  assert.match(ebay, /Read All History/);
  assert.ok(ebay.includes('if (/\\/sh\\/ord\\/?(?:[?#]|$)/i.test(String(href || ""))) return true;'));
  const panelKeys = ebay.match(/const EBAY_PANEL_WORKFLOW_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.doesNotMatch(panelKeys, /ebayMonthlyProfit/);
});

test("profit review labels both methods clearly and never presents missing coverage as zero profit", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay-profit.html"), "utf8");
  const review = fs.readFileSync(path.resolve(__dirname, "..", "extension", "ebay-profit.js"), "utf8");
  assert.match(html, /Profit from saved notes/);
  assert.match(html, /Independent Amazon profit/);
  assert.match(html, /All available history/);
  assert.match(html, /Saved-note profit coverage/);
  assert.doesNotMatch(html, /Read 1|Read 2/);
  assert.match(review, /exact \? money\(totals\.profit\) : "Pending"/);
  assert.match(review, /this is a partial total/);
});

test("Profile 2 control can start and read one exact eBay profit month", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const control = fs.readFileSync(path.resolve(__dirname, "..", "tools", "gldn-control.ps1"), "utf8");
  const agent = fs.readFileSync(path.resolve(__dirname, "..", "tools", "gldn-update-agent.ps1"), "utf8");
  assert.match(background, /'start-monthly-profit'/);
  assert.match(background, /'ebayMonthlyProfit'/);
  assert.match(background, /'ebay-profit-core\.js'/);
  assert.match(control, /"ebayMonthlyProfit"/);
  assert.match(agent, /"start-monthly-profit"/);
  assert.match(agent, /pageAction -eq "start-monthly-profit"/);
  assert.match(agent, /Monthly eBay profit start requires a valid YYYY-MM month/);
  assert.match(agent, /"ebayMonthlyProfit"/);
});

test("Profile 2 control can page through reviewed eBay profit rows without syncing", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const control = fs.readFileSync(path.resolve(__dirname, "..", "tools", "gldn-control.ps1"), "utf8");
  const agent = fs.readFileSync(path.resolve(__dirname, "..", "tools", "gldn-update-agent.ps1"), "utf8");
  assert.match(background, /async function readLocalControlEbayProfitReview/);
  assert.match(background, /case 'read-ebay-profit-review': return readLocalControlEbayProfitReview/);
  assert.match(background, /filtered\.slice\(offset, offset \+ limit\)/);
  assert.match(control, /"ReadEbayProfitReview"/);
  assert.match(control, /action = "read-ebay-profit-review"/);
  assert.match(agent, /"read-ebay-profit-review"/);
  assert.doesNotMatch(
    background.slice(
      background.indexOf("async function readLocalControlEbayProfitReview"),
      background.indexOf("async function reloadLocalControlExtension")
    ),
    /performReviewedEbayMonthlyProfitSync|markSynced|handleSync/
  );
  const reload = fs.readFileSync(path.resolve(__dirname, "..", "extension", "reload.js"), "utf8");
  assert.match(reload, /async function reloadEbayProfitReviewExport/);
  assert.match(reload, /String\(review\.phase \|\| ''\) !== 'review'/);
  assert.match(reload, /review\.active === true/);
  assert.match(reload, /setTimeout\(\(\) => chrome\.runtime\.reload\(\), 250\)/);
});
