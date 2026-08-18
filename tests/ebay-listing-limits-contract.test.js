const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const ebaySource = fs.readFileSync(path.join(root, "extension/ebay.js"), "utf8");
const dashboardFiles = [
  "apps-script-live/Code.js",
  "dashboard/GLDN_Ops_Dashboard_Code.gs",
  "extension/dashboard_apps_script/Code.gs"
];
const dashboardSources = dashboardFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8"));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test("Store allowance parser selects the Premium 10,000 offer instead of the 50,000 category offer", () => {
  const sandbox = { STORE_PLAN_LIMITS: { Premium: 10000, Anchor: 25000 } };
  vm.runInNewContext([
    extractFunction(ebaySource, "integerValue"),
    extractFunction(ebaySource, "parseStoreSubscriptionAllowance")
  ].join("\n"), sandbox);
  const fixture = `
    Premium Store Subscription - 10,000 Fixed Price Listings
    Used/Left:3,899 Promotional offers, 3899 used, 6101 left. /6,101
    Additional Fixed Price Free Insertions in Select Categories
    Used/Left:329 Promotional offers, 329 used, 49671 left. /49,671
  `;
  const parsed = sandbox.parseStoreSubscriptionAllowance(fixture, "Premium");
  assert.equal(parsed.limit, 10000);
  assert.equal(parsed.used, 3899);
  assert.equal(parsed.left, 6101);
});

test("missing review values remain Not detected instead of becoming zero", () => {
  const sandbox = {};
  vm.runInNewContext([
    extractFunction(ebaySource, "formatInteger"),
    extractFunction(ebaySource, "formatCurrency")
  ].join("\n"), sandbox);
  assert.equal(sandbox.formatInteger(null), "Not detected");
  assert.equal(sandbox.formatCurrency(null), "Not detected");
});

test("eBay Qty is stored as available quantity without inventing out-of-stock listings", () => {
  assert.match(ebaySource, /availableQuantity:\s*qty \? integerValue/);
  assert.match(ebaySource, /outOfStockCount:\s*null/);
  assert.match(ebaySource, /inStockPercent:\s*null/);
  assert.doesNotMatch(ebaySource, /outOfStockCount:\s*activeListings/);
});

test("Store allowance usage comes from monthly insertion events, not active listings", () => {
  const sandbox = { PRUNE_THRESHOLD: 0.9 };
  vm.runInNewContext([
    extractFunction(ebaySource, "usageEvaluation"),
    extractFunction(ebaySource, "evaluateListingLimits")
  ].join("\n"), sandbox);
  const result = sandbox.evaluateListingLimits({
    activeListings: 7670,
    subscriptionUsedThisMonth: 3925,
    subscriptionListingLimit: 10000,
    currentQuantityUsed: 9880,
    monthlySellerQuantityLimit: 88000,
    currentDollarUsed: 473834.67,
    monthlySellerDollarLimit: 1000000,
    limitChanged: false
  });
  assert.equal(result.storeAllowance.percent, 39.25);
  assert.ok(Math.abs(result.sellerQuantity.percent - 11.2272727273) < 0.000001);
  assert.ok(Math.abs(result.sellerDollar.percent - 47.383467) < 0.000001);
  assert.equal(result.overallStatus, "GOOD");
  assert.notEqual(result.storeAllowance.percent, 76.7);
});

test("missing Store allowance data cannot produce a false GOOD result", () => {
  const sandbox = { PRUNE_THRESHOLD: 0.9 };
  vm.runInNewContext([
    extractFunction(ebaySource, "usageEvaluation"),
    extractFunction(ebaySource, "evaluateListingLimits")
  ].join("\n"), sandbox);
  const result = sandbox.evaluateListingLimits({
    subscriptionUsedThisMonth: null,
    subscriptionListingLimit: 10000,
    currentQuantityUsed: 9880,
    monthlySellerQuantityLimit: 88000,
    currentDollarUsed: 473834.67,
    monthlySellerDollarLimit: 1000000,
    limitChanged: false
  });
  assert.equal(result.storeAllowance.label, "NOT DETECTED");
  assert.equal(result.overallStatus, "NOT DETECTED");
});

test("listing sync updates the dashboard and label-based Tasks rows in every Apps Script copy", () => {
  assert.equal(dashboardSources[1], dashboardSources[0]);
  assert.equal(dashboardSources[2], dashboardSources[0]);
  const source = dashboardSources[0];
  assert.match(source, /syncTasksListingStatus_\(record\)/);
  assert.match(source, /findTaskRowByStartsWith_\(sheet, 'Confirm Listings are under Subscription Listing Limit'\)/);
  assert.match(source, /findTaskRowByStartsWith_\(sheet, 'Items Limit'\)/);
  assert.match(source, /findTaskRowByStartsWith_\(sheet, '\$ Amount Limit'\)/);
  assert.match(source, /setNumberFormat\(numberFormat\)\.setNote\(note\)/);
  assert.match(source, /'Store Allowance Used', 'Store Allowance Left'/);
  assert.match(source, /'Seller Quantity Usage', 'Seller Quantity Status'/);
  assert.match(source, /function hardLimitState_\(used, limit\)/);
  assert.match(source, /storeAllowanceUnderLimit === true/);
  assert.match(source, /sellerDollarUnderLimit === true/);
  assert.match(source, /sellerQuantityUnderLimit !== false/);
  assert.match(source, /sheet\.getRange\(rows\.confirmed, computerCol\)[\s\S]*?\.setValue\(underLimit\)/);
  assert.match(source, /Under limit: ' \+ \(underLimit \? 'YES' : 'NO'\)/);
  assert.match(ebaySource, /subscriptionUsagePercent:\s*evaluations\.storeAllowance\.percent/);
  assert.doesNotMatch(ebaySource, /subscriptionUsagePercent:\s*activeEvaluation\.percent/);
  assert.doesNotMatch(ebaySource, /statusSummary\("Active listings"/);
  assert.match(ebaySource, /sync\?\.queued/);
  assert.doesNotMatch(source, /formatListingDashboard_\(dashboard\);\s*formatListingHistory_\(history\);/);
});

test("hard-limit listing checks verify the exact Tasks checkbox without suppressing near-limit warnings", () => {
  const source = dashboardSources[0];
  const target = {
    value: false,
    note: "",
    setValue(value) { this.value = value; return this; },
    setNote(value) { this.note = value; return this; },
    getValue() { return this.value; },
    getA1Notation() { return "H20"; }
  };
  const sheet = {
    getRange(row, column) {
      if (row === 20 && column === 8) return target;
      return { row, column };
    }
  };
  const sandbox = {
    TASKS_SPREADSHEET_ID: "fixture-spreadsheet",
    TASKS_SHEET: "Tasks",
    TASKS_SPREADSHEET_ID: "tasks-sheet",
    TASKS_SHEET: "Tasks",
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet }),
      flush: () => {}
    },
    Utilities: { formatDate: () => "07/22/2026 10:00:00 AM" },
    Session: { getScriptTimeZone: () => "America/Chicago" },
    validDate_: (value) => value,
    requireTasksSchema_: () => ({ computerColumn: 8 }),
    isEbayMetricColumn_: () => true,
    findTaskRowByStartsWith_: (_sheet, label) => label.startsWith("Confirm") ? 20 : label.startsWith("Items") ? 21 : 22,
    applyCheckboxRange_: () => {},
    setMergedTaskValue_: () => {},
    clearPoshmarkOnlyMetricCells_: () => {},
    clearComputerHeaderNotes_: () => {},
    clearVisibleLastUpdated_: () => {}
  };
  vm.runInNewContext([
    extractFunction(source, "hardLimitState_"),
    extractFunction(source, "syncTasksListingStatus_"),
    "this.syncTasksListingStatus = syncTasksListingStatus_;"
  ].join("\n"), sandbox);

  const good = sandbox.syncTasksListingStatus({
    computerLabel: "0",
    confirmedAt: "2026-07-22T15:00:00.000Z",
    overallStatus: "GOOD",
    subscriptionStatus: "GOOD",
    sellerQuantityStatus: "GOOD",
    dollarStatus: "GOOD",
    subscriptionUsedThisMonth: 5000,
    subscriptionListingLimit: 10000,
    currentQuantityUsed: 5000,
    monthlySellerQuantityLimit: 88000,
    currentDollarUsed: 200000,
    monthlySellerDollarLimit: 1000000
  });
  assert.equal(good.checked, true);
  assert.equal(good.cell, "H20");
  assert.equal(target.value, true);
  assert.match(target.note, /Under limit: YES/);

  const goodWithUnavailableSellerQuantity = sandbox.syncTasksListingStatus({
    computerLabel: "0",
    confirmedAt: "2026-07-23T20:43:01.000Z",
    overallStatus: "GOOD",
    subscriptionStatus: "GOOD",
    sellerQuantityStatus: "Unknown",
    dollarStatus: "GOOD",
    subscriptionUsedThisMonth: 6000,
    subscriptionListingLimit: 10000,
    currentDollarUsed: 300000,
    monthlySellerDollarLimit: 1000000
  });
  assert.equal(goodWithUnavailableSellerQuantity.checked, true);
  assert.equal(target.value, true);
  assert.match(target.note, /Seller quantity: Unknown/);
  assert.match(target.note, /Under limit: YES/);

  const nearLimitWarnings = sandbox.syncTasksListingStatus({
    computerLabel: "0",
    confirmedAt: "2026-07-23T20:43:01.000Z",
    overallStatus: "CHECK LIMITS",
    subscriptionStatus: "CHECK INSERTION ALLOWANCE",
    sellerQuantityStatus: "CHECK SELLING LIMIT",
    dollarStatus: "GOOD",
    subscriptionUsedThisMonth: 9879,
    subscriptionListingLimit: 10000,
    currentQuantityUsed: 87000,
    monthlySellerQuantityLimit: 88000,
    currentDollarUsed: 445276.41,
    monthlySellerDollarLimit: 1000000
  });
  assert.equal(nearLimitWarnings.checked, true);
  assert.equal(target.value, true);
  assert.match(target.note, /Store allowance: CHECK INSERTION ALLOWANCE/);
  assert.match(target.note, /Under limit: YES/);

  const atHardLimit = sandbox.syncTasksListingStatus({
    computerLabel: "0",
    confirmedAt: "2026-07-22T15:00:00.000Z",
    overallStatus: "CHECK LIMITS",
    subscriptionStatus: "CHECK INSERTION ALLOWANCE",
    sellerQuantityStatus: "GOOD",
    dollarStatus: "GOOD",
    subscriptionUsedThisMonth: 10000,
    subscriptionListingLimit: 10000,
    currentQuantityUsed: 5000,
    monthlySellerQuantityLimit: 88000,
    currentDollarUsed: 445276.41,
    monthlySellerDollarLimit: 1000000
  });
  assert.equal(atHardLimit.checked, false);
  assert.equal(target.value, false);
  assert.match(target.note, /Under limit: NO/);

  const missingRequiredValue = sandbox.syncTasksListingStatus({
    computerLabel: "0",
    confirmedAt: "2026-07-22T15:00:00.000Z",
    overallStatus: "NOT DETECTED",
    subscriptionStatus: "NOT DETECTED",
    sellerQuantityStatus: "GOOD",
    dollarStatus: "GOOD",
    subscriptionListingLimit: 10000,
    currentQuantityUsed: 5000,
    monthlySellerQuantityLimit: 88000,
    currentDollarUsed: 445276.41,
    monthlySellerDollarLimit: 1000000
  });
  assert.equal(missingRequiredValue.checked, false);
  assert.equal(target.value, false);
  assert.match(target.note, /Under limit: NO/);
});
