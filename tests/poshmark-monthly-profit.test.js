const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.rows = [[]];
    this.maxColumns = 26;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if ((this.rows[index] || []).some((value) => value !== "" && value != null)) return index + 1;
    }
    return 0;
  }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  getMaxColumns() { return this.maxColumns; }
  insertColumnsAfter(_after, count) { this.maxColumns += count; }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      getValues: () => Array.from({ length: rowCount }, (_, rowOffset) =>
        Array.from({ length: columnCount }, (_, columnOffset) =>
          this.rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? "")),
      setValues: (values) => {
        values.forEach((valueRow, rowOffset) => {
          const target = row - 1 + rowOffset;
          if (!this.rows[target]) this.rows[target] = [];
          valueRow.forEach((value, columnOffset) => {
            this.rows[target][column - 1 + columnOffset] = value;
          });
        });
      },
      clearContent: () => {
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
          const target = row - 1 + rowOffset;
          if (!this.rows[target]) continue;
          for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
            this.rows[target][column - 1 + columnOffset] = "";
          }
        }
      }
    };
  }
}

class FakeSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new FakeSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function loadDashboard() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "apps-script-live", "Code.js"), "utf8");
  const tasks = new FakeSpreadsheet();
  const orders = new FakeSpreadsheet();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Boolean, Array, Object, RegExp, Set, Map,
    parseFloat, parseInt, isFinite,
    SpreadsheetApp: {
      flush() {},
      openById(id) {
        assert.equal(id, "1PV4Fpnjjd5tNwdwmqLDbi-RLBbIqMq94Gxj0YU4AOl4");
        return orders;
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });
  sandbox.getSpreadsheet_ = () => tasks;
  sandbox.formatPoshmarkCostQueue_ = () => {};
  sandbox.formatPoshmarkMonthSheet_ = () => {};
  sandbox.formatProfitSheet_ = () => {};
  sandbox.formatProfitRow_ = () => {};
  return { sandbox, tasks, orders };
}

function review(status = "amazon-not-found") {
  return {
    computerLabel: "7",
    accountLabel: "igivegreatdeals",
    monthKey: "2026-04",
    orderNumber: "april-order-1",
    itemTitle: "April item",
    marketplaceEarnings: 16,
    marketplaceSoldPrice: 20,
    orderDate: "Apr 8, 2026",
    sku: "B012345678",
    supplierItemIds: "B012345678",
    supplierTotal: status === "resolved" ? 9.99 : null,
    supplierProfile: "Profile 2",
    supplierOrderNumber: status === "resolved" ? "114-1111111-1111111" : "",
    supplierPageUrl: status === "resolved" ? "https://www.amazon.com/order" : "",
    profit: status === "resolved" ? 6.01 : null,
    status,
    reason: status === "resolved" ? "Exact Amazon order-item cost captured." : "No exact purchase found.",
    pageUrl: "https://poshmark.com/order/sales/april-order-1",
    attemptedSupplierProfiles: ["Profile 2"],
    capturedAt: "2026-08-02T12:00:00.000Z"
  };
}

test("monthly sheet names and records follow the April 2026 contract", () => {
  const { sandbox } = loadDashboard();
  assert.equal(sandbox.poshmarkMonthSheetName_("2026-04"), "April 2026 - 7");
  const normalized = sandbox.normalizePoshmarkReviewRecord_(review());
  assert.equal(normalized.monthKey, "2026-04");
  assert.equal(normalized.supplierTotal, null);
  assert.deepEqual(Array.from(normalized.attemptedSupplierProfiles), ["Profile 2"]);
});

test("missing Amazon costs stay open, then resolve in place without duplicating the order", () => {
  const { sandbox, tasks, orders } = loadDashboard();
  const openRecord = sandbox.normalizePoshmarkReviewRecord_(review());
  sandbox.savePoshmarkCostQueueBatch_([openRecord]);
  sandbox.savePoshmarkMonthRows_([openRecord]);

  const queue = tasks.getSheetByName("Poshmark Amazon Cost Queue");
  const month = orders.getSheetByName("April 2026 - 7");
  assert.equal(queue.getLastRow(), 2);
  assert.equal(queue.rows[1][10], "OPEN - AMAZON NOT FOUND");
  assert.equal(queue.rows[1][12], "");
  assert.equal(month.getLastRow(), 2);
  assert.equal(month.rows[1][1], "");
  assert.equal(month.rows[1][4], "Missing Amazon Cost");

  const resolvedRecord = sandbox.normalizePoshmarkReviewRecord_(review("resolved"));
  sandbox.savePoshmarkCostQueueBatch_([resolvedRecord]);
  sandbox.savePoshmarkMonthRows_([resolvedRecord]);
  assert.equal(queue.getLastRow(), 2);
  assert.equal(queue.rows[1][10], "RESOLVED");
  assert.equal(queue.rows[1][12], 9.99);
  assert.equal(month.getLastRow(), 2);
  assert.equal(month.rows[1][1], 9.99);
  assert.equal(month.rows[1][3], 6.01);
  assert.equal(month.rows[1][4], "Resolved");
  assert.equal(month.rows[1][5], "No exact purchase found.");
});

test("the extension and Apps Script expose monthly save and cross-profile resolution actions", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const popup = fs.readFileSync(path.resolve(__dirname, "..", "extension", "popup.html"), "utf8");
  const dashboard = fs.readFileSync(path.resolve(__dirname, "..", "apps-script-live", "Code.js"), "utf8");
  assert.match(background, /poshmarkMonthlyProfitBatch/);
  assert.match(background, /poshmarkCostResolutionBatch/);
  assert.match(background, /poshmarkCostQueueRead/);
  assert.match(popup, /Resolve Missing Amazon Costs/);
  assert.match(dashboard, /Poshmark Amazon Cost Queue/);
  assert.match(dashboard, /April 2026 - 7|poshmarkMonthSheetName_/);
});
