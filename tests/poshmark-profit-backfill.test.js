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
});

test("historical review exposes the exact Amazon order and ASIN before sync", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  assert.match(poshmark, /showHistoricalProfitBackfillReview[\s\S]{0,220}gldn-posh-backfill-launcher/);
  assert.match(poshmark, /order \$\{record\.supplierOrderNumber \|\| "not captured"\}/);
  assert.match(poshmark, /ASIN \$\{record\.supplierItemIds \|\| "not captured"\}/);
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
});

test("runtime workflow uses one worker tab and an explicit spreadsheet approval token", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "profit-backfill-background.js"), "utf8");
  const serviceWorker = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  assert.match(background, /tabCreate\(\{ url: "about:blank", active: false/);
  assert.match(background, /workerTabId: worker\.id/);
  assert.match(background, /run\.scope === "single"/);
  assert.match(background, /existing\?\.workerTabId/);
  assert.doesNotMatch(background, /Promise\.all\([^)]*tabCreate/);
  assert.match(serviceWorker, /confirmToken !== 'SYNC_EXACT_POSHMARK_PROFITS'/);
  assert.match(poshmark, /dataset\.confirmSync !== "true"/);
  assert.match(poshmark, /Confirm Sync \$\{remaining\} Row/);
  assert.match(poshmark, /confirm: "SYNC_EXACT_POSHMARK_PROFITS"/);
  assert.match(poshmark, /showHistoricalProfitBackfillReview\(response\.state\)/);
  assert.match(serviceWorker, /summary: globalThis\.GLDN_PROFIT_BACKFILL\.summary\(state\),[\s\S]{0,80}state,/);
  assert.doesNotMatch(poshmark, /syncPoshmarkProfitBackfill[\s\S]{0,120}captureVisibleSales/);
  assert.match(background, /pauseIncompatibleVersion/);
  assert.match(background, /Paused safely because GLDN Ops changed from/);
  assert.match(background, /workerTabId: null/);
  assert.match(background, /extensionVersion: runtimeVersion\(\)/);
  assert.match(serviceWorker, /pauseIncompatibleProfitBackfill\('worker-start'\)/);
});

test("Poshmark and Amazon adapters cover 100-row and paginated collection", () => {
  const poshmark = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  const amazon = fs.readFileSync(path.resolve(__dirname, "..", "extension", "amazon.js"), "utf8");
  assert.match(poshmark, /ensureHistoricalSalesPageSize/);
  assert.match(poshmark, /ensureHistoricalSalesPageSize[\s\S]{0,900}100/);
  assert.match(poshmark, /instruction === "next-page"/);
  assert.match(amazon, /findAmazonOrderSearchMatches/);
  assert.match(amazon, /amazonOrderSearchResultCards/);
  assert.match(amazon, /amazonOrderSearchResultsReady/);
  assert.match(amazon, /attempt < 12 && !purchase/);
  assert.match(amazon, /ORDER PLACED\|Ordered on/);
  assert.match(amazon, /\.a-pagination \.a-last a/);
  assert.match(amazon, /slides\|carousel/);
  assert.match(amazon, /instruction === "next-amazon-page"/);
  assert.match(amazon, /extractAmazonOrderDetailItemCostByAsin/);
});
