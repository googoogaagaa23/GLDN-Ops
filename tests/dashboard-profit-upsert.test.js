const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "dashboard", "GLDN_Ops_Dashboard_Code.gs"), "utf8");

test("profit upsert keeps one row per platform, computer, and order", () => {
  const sandbox = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    parseFloat,
    parseInt,
    isFinite
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });

  const header = Array.from({ length: 22 }, (_, index) => `H${index}`);
  const matching = ["old", "eBay", "0", "FAK12", "18-14818-27804", "Old title", 5.68];
  const rows = [
    header,
    [...matching, ...Array(15).fill("")],
    [...matching, ...Array(15).fill("")],
    ["old", "eBay", "M0", "CLICKNCARRY", "18-14818-27804", "Other computer", ...Array(16).fill("")],
    ["old", "Poshmark", "0", "@other", "18-14818-27804", "Other platform", ...Array(16).fill("")]
  ];
  const sheet = {
    getLastRow() { return rows.length; },
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getValues() {
          return rows.slice(row - 1, row - 1 + rowCount)
            .map((entry) => entry.slice(column - 1, column - 1 + columnCount));
        },
        setValues(values) {
          values.forEach((valueRow, rowOffset) => {
            valueRow.forEach((value, columnOffset) => {
              rows[row - 1 + rowOffset][column - 1 + columnOffset] = value;
            });
          });
        }
      };
    },
    appendRow(value) { rows.push([...value]); },
    deleteRow(row) { rows.splice(row - 1, 1); }
  };

  const incoming = [
    "new", "eBay", "0", "FAK12", "18-14818-27804", "Exact title", 5.68, "",
    "Amazon", 7.17, "F9132", "6/30", -1.49, -1.49 / 5.68, "QjA5WjYxRzc3TA==",
    "ebay-order-profit", "https://www.ebay.com/order", "B09Z61G77L", "113-2518790-9385867",
    "amazon-order-details-card", "https://www.amazon.com/order", "[]"
  ];
  const record = { platform: "eBay", computerLabel: "0", orderNumber: "18-14818-27804" };
  const targetRow = sandbox.upsertProfitRow_(sheet, record, incoming);

  assert.equal(targetRow, 2);
  assert.equal(rows.length, 4);
  const exactRows = rows.filter((row) => row[1] === "eBay" && row[2] === "0" && row[4] === record.orderNumber);
  assert.equal(exactRows.length, 1);
  assert.equal(exactRows[0][5], "Exact title");
  assert.equal(exactRows[0][18], "113-2518790-9385867");
});

test("eBay reconciliation keeps note and independent Amazon values separate", () => {
  const sandbox = {
    console, Date, JSON, Math, Number, String, Boolean, Array, Object, RegExp,
    parseFloat, parseInt, isFinite
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });

  const record = sandbox.normalizeEbayReviewRecord_({
    computerLabel: "0",
    ebayAccountLabel: "FAK12",
    monthKey: "2026-07",
    orderNumber: "18-14818-27804",
    marketplaceEarnings: 20.46,
    sku: "QjA5WjYxRzc3TA==",
    supplierItemIds: "B09Z61G77L",
    noteStatus: "verified",
    noteMarketplaceEarnings: 19.46,
    noteSupplierTotal: 9.99,
    noteSupplierProfile: "F9132",
    noteProfit: 9.47,
    supplierTotal: 10.49,
    supplierProfile: "Amazon profile 2",
    supplierOrderNumber: "113-2518790-9385867",
    status: "resolved",
    attemptedSupplierProfiles: ["Amazon profile 2"]
  });

  assert.equal(record.noteMarketplaceEarnings, 19.46);
  assert.equal(record.noteSupplierTotal, 9.99);
  assert.equal(record.supplierTotal, 10.49);
  assert.equal(sandbox.ebayQueueStatus_(record), "RESOLVED - DISCREPANCY");
  assert.notEqual(
    sandbox.ebayQueueKey_("0", record.orderNumber),
    sandbox.ebayQueueKey_("M0", record.orderNumber)
  );

  const resolutionBody = source.match(/function saveEbayCostResolutionBatch_\(input\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(resolutionBody, /saveEbayCostQueueBatch_/);
  assert.doesNotMatch(resolutionBody, /saveMarketplaceProfitBatch_/);
  assert.match(source, /'Note eBay Earnings',\s*'Earnings Difference'/);
  assert.match(source, /const noteEarnings = record\.noteMarketplaceEarnings/);
  assert.match(source, /const earningsDifference = noteEarnings != null && earnings != null/);
  assert.match(source, /noteMarketplaceEarnings: optionalNumber_\(row\[28\]\)/);
});

test("eBay reconciliation marks an earnings-only disagreement as a discrepancy", () => {
  const sandbox = {
    console, Date, JSON, Math, Number, String, Boolean, Array, Object, RegExp,
    parseFloat, parseInt, isFinite
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });
  const record = sandbox.normalizeEbayReviewRecord_({
    computerLabel: "0",
    orderNumber: "18-14818-27804",
    marketplaceEarnings: 20.46,
    noteMarketplaceEarnings: 19.46,
    noteSupplierTotal: 9.99,
    supplierTotal: 9.99,
    status: "resolved"
  });
  assert.equal(sandbox.ebayQueueStatus_(record), "RESOLVED - DISCREPANCY");
});

test("monthly cost queues accept Google Sheets date-formatted month cells", () => {
  const sandbox = {
    console, Date, JSON, Math, Number, String, Boolean, Array, Object, RegExp,
    parseFloat, parseInt, isFinite
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });

  assert.equal(sandbox.monthKeyFromSheetCell_("2026-07"), "2026-07");
  assert.equal(sandbox.monthKeyFromSheetCell_(new Date(2026, 6, 1)), "2026-07");
  const ebayReader = source.match(/function readOpenEbayCostQueue_\(input\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const poshmarkReader = source.match(/function readOpenPoshmarkCostQueue_\(input\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(ebayReader, /monthKeyFromSheetCell_\(row\[1\]\)/);
  assert.match(poshmarkReader, /monthKeyFromSheetCell_\(row\[1\]\)/);
  assert.match(ebayReader, /supplierProfileWasAttempted_\(row\[25\], supplierProfile\)/);
  assert.match(poshmarkReader, /supplierProfileWasAttempted_\(row\[19\], supplierProfile\)/);
  assert.equal(sandbox.supplierProfileWasAttempted_("Profile 2, Profile 3", "profile 2"), true);
  assert.equal(sandbox.supplierProfileWasAttempted_("Profile 2, Profile 3", "Profile 4"), false);
});
