const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const core = require("../extension/order-audit-core.js");
const root = path.join(__dirname, "..");

function expected(overrides = {}) {
  return {
    computerLabel: "0",
    accountLabel: "FAK12",
    monthKey: "2026-08",
    orderNumber: "18-10000-10000",
    orderDate: "2026-08-10",
    asin: "B012345678",
    unitIndex: 1,
    itemTitle: "Exact item",
    orderStatus: "Paid",
    recipient: "Alice Smith",
    recipientFingerprint: "alice smith",
    addressFingerprint: "101 main st houston tx 77001",
    shippingBlock: "Alice Smith | 101 Main St | Houston, TX 77001",
    pageUrl: "https://www.ebay.com/sh/ord/details?orderid=18-10000-10000",
    ...overrides
  };
}

function purchase(overrides = {}) {
  return {
    runKey: "0|FAK12|2026-08",
    computerLabel: "0",
    monthKey: "2026-08",
    supplierProfile: "Amazon Main",
    orderId: "111-1111111-1111111",
    purchaseDate: "2026-08-10",
    asin: "B012345678",
    unitIndex: 1,
    quantity: 1,
    title: "Exact item",
    cost: 9.99,
    recipient: "Alice Smith",
    recipientFingerprint: "alice smith",
    addressFingerprint: "101 main st houston tx 77001",
    shippingBlock: "Alice Smith | 101 Main St | Houston, TX 77001",
    orderUrl: "https://www.amazon.com/gp/your-account/order-details?orderID=111-1111111-1111111",
    ...overrides
  };
}

test("one eBay unit and one matching Amazon unit are covered", () => {
  const result = core.audit([expected()], [purchase()]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].status, "covered");
  assert.equal(result.findings[0].severity, "ok");
});

test("an extra Amazon unit for the same recipient is an exact duplicate warning", () => {
  const result = core.audit([expected()], [
    purchase(),
    purchase({ orderId: "222-2222222-2222222", unitKey: "", orderUrl: "https://www.amazon.com/gp/your-account/order-details?orderID=222-2222222-2222222" })
  ]);
  assert.deepEqual(result.findings.map((finding) => finding.status).sort(), ["covered", "duplicate-same-recipient"]);
  assert.equal(result.statusCounts["duplicate-same-recipient"], 1);
});

test("an extra Amazon unit for another recipient is possible extra, not an exact duplicate", () => {
  const result = core.audit([expected()], [
    purchase(),
    purchase({
      orderId: "333-3333333-3333333",
      unitKey: "",
      recipient: "Bob Jones",
      recipientFingerprint: "bob jones",
      addressFingerprint: "900 other rd dallas tx 75001",
      shippingBlock: "Bob Jones | 900 Other Rd | Dallas, TX 75001"
    })
  ]);
  assert.deepEqual(result.findings.map((finding) => finding.status).sort(), ["covered", "possible-extra-different-recipient"]);
});

test("two legitimate eBay customers sharing an ASIN consume two purchases without a false duplicate", () => {
  const result = core.audit([
    expected(),
    expected({
      orderNumber: "18-20000-20000",
      recipient: "Bob Jones",
      recipientFingerprint: "bob jones",
      addressFingerprint: "900 other rd dallas tx 75001",
      shippingBlock: "Bob Jones | 900 Other Rd | Dallas, TX 75001"
    })
  ], [
    purchase(),
    purchase({
      orderId: "444-4444444-4444444",
      unitKey: "",
      recipient: "Bob Jones",
      recipientFingerprint: "bob jones",
      addressFingerprint: "900 other rd dallas tx 75001",
      shippingBlock: "Bob Jones | 900 Other Rd | Dallas, TX 75001"
    })
  ]);
  assert.equal(result.statusCounts.covered, 2);
  assert.equal(result.statusCounts["duplicate-same-recipient"] || 0, 0);
  assert.equal(result.statusCounts["possible-extra-different-recipient"] || 0, 0);
});

test("the same Amazon order seen in two Chrome profiles is counted once", () => {
  const result = core.audit([expected()], [
    purchase({ supplierProfile: "Amazon Main" }),
    purchase({ supplierProfile: "Amazon Backup" })
  ]);
  assert.equal(result.amazonUnits, 1);
  assert.deepEqual(result.profilesSeen.sort(), ["Amazon Backup", "Amazon Main"]);
  assert.equal(result.statusCounts.covered, 1);
});

test("Amazon and eBay quantities expand to unit-level allocations", () => {
  const eBayUnits = core.expectedUnitsFromMonthlyRun({
    computerLabel: "0",
    accountLabel: "FAK12",
    monthKey: "2026-08",
    results: [{
      orderNumber: "18-30000-30000",
      orderDate: "2026-08-11",
      orderStatus: "Paid",
      recipient: "Alice Smith",
      recipientFingerprint: "alice smith",
      addressFingerprint: "101 main st houston tx 77001",
      shippingBlock: "Alice Smith | 101 Main St | Houston, TX 77001",
      pageUrl: "https://www.ebay.com/sh/ord/details?orderid=18-30000-30000",
      items: [{ asin: "B012345678", quantity: 2, itemTitle: "Two-pack demand" }]
    }]
  });
  const amazonUnits = core.expandPurchase(purchase({ quantity: 2 }));
  assert.equal(eBayUnits.length, 2);
  assert.deepEqual(eBayUnits.map((unit) => unit.unitIndex), [1, 2]);
  assert.equal(amazonUnits.length, 2);
  assert.deepEqual(amazonUnits.map((unit) => unit.unitIndex), [1, 2]);
  assert.equal(core.audit(eBayUnits, amazonUnits).statusCounts.covered, 2);
});

test("purchases for canceled orders are flagged while canceled orders with no purchase are clean", () => {
  const canceled = expected({ orderStatus: "Canceled" });
  const purchased = core.audit([canceled], [purchase()]);
  assert.equal(purchased.findings[0].status, "purchased-for-canceled-ebay");
  assert.equal(purchased.findings[0].severity, "high");

  const notPurchased = core.audit([canceled], []);
  assert.equal(notPurchased.findings[0].status, "canceled-no-amazon-purchase");
  assert.equal(notPurchased.findings[0].severity, "ok");
});

test("active demand is allocated before canceled demand for the same item and recipient", () => {
  const result = core.audit([
    expected({ orderNumber: "18-CANCELED", orderStatus: "Canceled" }),
    expected({ orderNumber: "18-ACTIVE", orderStatus: "Paid" })
  ], [purchase()]);
  const byOrder = new Map(result.findings.filter((finding) => finding.expected).map((finding) => [finding.expected.orderNumber, finding.status]));
  assert.equal(byOrder.get("18-ACTIVE"), "covered");
  assert.equal(byOrder.get("18-CANCELED"), "canceled-no-amazon-purchase");
});

test("an unmatched active eBay order remains visible for another Amazon profile", () => {
  const result = core.audit([expected()], []);
  assert.equal(result.findings[0].status, "missing-amazon-purchase");
  assert.equal(result.findings[0].severity, "review");
});

test("ship-to evidence normalizes recipient and address without confusing the label for a name", () => {
  const identity = core.shippingIdentity("Ship to | Alice Smith | 101 Main St Apt 4 | Houston, TX 77001 | United States");
  assert.equal(identity.recipient, "Alice Smith");
  assert.equal(identity.recipientFingerprint, "alice smith");
  assert.match(identity.addressFingerprint, /101 main st unit 4 houston tx 77001/);
});

test("extension and dashboard contracts expose the read-only cross-profile workflow", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));
  const amazon = manifest.content_scripts.find((entry) => entry.matches.includes("https://*.amazon.com/*"));
  const ebay = manifest.content_scripts.find((entry) => entry.matches.includes("https://*.ebay.com/*"));
  assert.ok(amazon.js.indexOf("order-audit-core.js") < amazon.js.indexOf("amazon.js"));
  assert.ok(ebay.js.indexOf("order-audit-core.js") < ebay.js.indexOf("ebay.js"));

  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  assert.match(background, /'orderPlacementAuditConfig'/);
  const worker = fs.readFileSync(path.join(root, "extension", "order-audit-background.js"), "utf8");
  const popup = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
  const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  const page = fs.readFileSync(path.join(root, "extension", "order-audit.html"), "utf8");
  const pageJs = fs.readFileSync(path.join(root, "extension", "order-audit.js"), "utf8");
  const amazonJs = fs.readFileSync(path.join(root, "extension", "amazon.js"), "utf8");
  const apps = fs.readFileSync(path.join(root, "extension", "dashboard_apps_script", "Code.gs"), "utf8");
  const dashboardApps = fs.readFileSync(path.join(root, "dashboard", "GLDN_Ops_Dashboard_Code.gs"), "utf8");

  [
    "seedOrderPlacementAuditExpected", "configureOrderPlacementAudit", "readOrderPlacementAudit",
    "startOrderPlacementAuditAmazon", "resumeOrderPlacementAuditAmazon",
    "stopOrderPlacementAuditAmazon", "resetOrderPlacementAuditAmazon",
    "orderPlacementAuditAmazonIndex", "orderPlacementAuditAmazonDetail"
  ].forEach((message) => assert.match(background, new RegExp(message)));
  assert.match(worker, /active:\s*false/);
  assert.match(worker, /replaceProfile/);
  assert.match(popup, /Open Order Placement Audit/);
  assert.match(popupJs, /order-audit\.html/);
  assert.match(page, /This audit is read-only/);
  assert.match(page, /Save Profile List/);
  assert.match(page, /Download CSV/);
  assert.match(pageJs, /completedExpected/);
  assert.doesNotMatch(`${worker}\n${pageJs}`, /cancel(?:Order|Purchase)|refund(?:Order|Purchase)|markAsShipped|deleteOrder/);

  assert.match(amazonJs, /extractOrderPlacementAuditHistory/);
  assert.match(amazonJs, /extractAmazonOrderDetailItemCostByAsin/);
  assert.match(amazonJs, /(?:qty|quantity)/i);
  assert.match(amazonJs, /recipientFingerprint/);
  assert.match(amazonJs, /addressFingerprint/);
  assert.match(amazonJs, /did not expose an exact item row/);

  [
    "Order Audit Runs", "Order Audit - eBay Demand", "Order Audit - Amazon Purchases",
    "orderPlacementAuditConfig", "orderPlacementAuditExpectedBatch",
    "orderPlacementAuditAmazonBatch", "orderPlacementAuditRead"
  ].forEach((contract) => assert.match(apps, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.match(apps, /if \(input\.resetPurchases === true\) config\.scannedProfiles = \[\];/);
  assert.match(apps, /else if \(!Object\.prototype\.hasOwnProperty\.call\(input, 'scannedProfiles'\)\) delete config\.scannedProfiles;/);
  assert.equal(apps, dashboardApps, "the packaged and dashboard Apps Script copies must stay identical");
});
