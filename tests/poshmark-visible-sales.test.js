const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDashboard() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "dashboard", "GLDN_Ops_Dashboard_Code.gs"), "utf8");
  const sandbox = {
    console, Date, JSON, Math, Number, String, Boolean, Array, Object, RegExp, parseFloat, parseInt, isFinite,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });
  return sandbox;
}

test("visible-sale records preserve the live Poshmark date and statuses", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  assert.match(source, /my-sales-desktop-table__date-col/);
  assert.match(source, /my-sales-desktop-table__status-col/);
  assert.match(source, /orderDate:\s*record\.orderDate/);
  assert.match(source, /orderStatus:\s*record\.orderStatus/);
  assert.match(source, /earningsStatus:\s*record\.earningsStatus/);
  assert.match(source, /type: "syncMarketplaceProfits", records/);
  assert.match(source, /Saving \$\{records\.length\} visible sale rows in one dashboard batch/);
  assert.match(source, /saveButton\.disabled = true/);
  assert.doesNotMatch(source, /for \(const record of records\)[\s\S]{0,200}syncMarketplaceProfit/);
});

test("visible-sales preview uses its own readable table instead of the warning box", () => {
  const script = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  const styles = fs.readFileSync(path.resolve(__dirname, "..", "extension", "styles.css"), "utf8");
  const preview = script.slice(script.indexOf("function showVisibleSalesPreview"), script.indexOf("async function captureVisibleSales"));
  assert.match(preview, /gldn-sales-list/);
  assert.match(preview, /gldn-sales-order/);
  assert.match(preview, /gldn-sales-title/);
  assert.match(preview, /gldn-sales-earnings/);
  assert.doesNotMatch(preview, /gldn-existing/);
  assert.match(styles, /\.gldn-sales-row[\s\S]*color: #0f172a/);
  assert.match(styles, /data-gldn-theme="graphite"[^\n]*\.gldn-sales-title/);
  assert.match(styles, /\.gldn-sales-earnings \{ color: #86efac !important; \}/);
});

test("visible-sales local approval is exact-count bound", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "extension", "poshmark.js"), "utf8");
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(source, /APPROVE SAVE VISIBLE SALES \$\{records\.length\}/);
  assert.match(source, /"save-visible-sales-review": \(\) => approveVisibleSalesReview\(message\.confirmationToken\)/);
  assert.match(background, /APPROVE SAVE VISIBLE SALES \[1-9\]\\d\*/);
});

test("background and dashboard expose one idempotent marketplace-profit batch action", () => {
  const background = fs.readFileSync(path.resolve(__dirname, "..", "extension", "background.js"), "utf8");
  const dashboardSource = fs.readFileSync(path.resolve(__dirname, "..", "dashboard", "GLDN_Ops_Dashboard_Code.gs"), "utf8");
  assert.match(background, /message\.type === 'syncMarketplaceProfits'/);
  assert.match(background, /handleSync\('marketplaceProfitBatch', \{ records \}/);
  assert.match(dashboardSource, /action === 'marketplaceProfitBatch'/);
  assert.match(dashboardSource, /saveMarketplaceProfitBatch_\(records\)/);
  assert.match(dashboardSource, /inputs\.length > 100/);
});

test("a repeated 20-row visible-sales batch upserts without duplicate profit rows", () => {
  class FakeSheet {
    constructor(name, headers) {
      this.name = name;
      this.rows = [Array.from(headers)];
    }
    getName() { return this.name; }
    getLastRow() { return this.rows.length; }
    appendRow(row) { this.rows.push(Array.from(row)); }
    deleteRow(row) { this.rows.splice(row - 1, 1); }
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getValues: () => Array.from({ length: rowCount }, (_, rowOffset) =>
          Array.from({ length: columnCount }, (_, columnOffset) =>
            this.rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? "")),
        setValues: (values) => {
          values.forEach((valuesRow, rowOffset) => {
            const target = row - 1 + rowOffset;
            if (!this.rows[target]) this.rows[target] = [];
            valuesRow.forEach((value, columnOffset) => {
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

  const dashboard = loadDashboard();
  const headers = vm.runInContext("MARKETPLACE_PROFIT_HEADERS", dashboard);
  const sheets = new Map();
  dashboard.getSpreadsheet_ = () => ({});
  dashboard.ensureSheet_ = (_ss, name) => {
    if (!sheets.has(name)) sheets.set(name, new FakeSheet(name, headers));
    return sheets.get(name);
  };
  dashboard.formatProfitSheet_ = () => {};
  dashboard.formatProfitRow_ = () => {};

  const inputs = Array.from({ length: 20 }, (_, index) => dashboard.normalizeMarketplaceProfitRecord_({
    platform: "Poshmark",
    computerLabel: "7",
    poshmarkAccountLabel: "igivegreatdeals",
    orderNumber: `live-${String(index + 1).padStart(2, "0")}`,
    itemTitle: `Visible sale ${index + 1}`,
    marketplaceEarnings: 16 + index,
    marketplaceSoldPrice: 20 + index,
    source: "poshmark-visible-sales",
    orderDate: "Jul 22, 2026",
    orderStatus: "Shipped",
    earningsStatus: "Processing"
  }));

  const first = dashboard.saveMarketplaceProfitBatch_(inputs);
  const second = dashboard.saveMarketplaceProfitBatch_(inputs);
  assert.equal(first.count, 20);
  assert.equal(second.count, 20);
  assert.equal(sheets.get("Marketplace Profit History").rows.length, 21);
  assert.equal(sheets.get("Profit - 7").rows.length, 21);
  assert.equal(new Set(sheets.get("Profit - 7").rows.slice(1).map((row) => row[4])).size, 20);
});

test("profit-sheet upserts retain exact Amazon evidence while refreshing visible-sale status", () => {
  const dashboard = loadDashboard();
  const headers = vm.runInContext("MARKETPLACE_PROFIT_HEADERS", dashboard);
  assert.deepEqual(Array.from(headers.slice(-3)), ["Order Date", "Order Status", "Earnings Status"]);

  const existing = Array(headers.length).fill("");
  const incoming = Array(headers.length).fill("");
  const index = (name) => headers.indexOf(name);
  existing[index("Platform")] = "Poshmark";
  existing[index("Computer")] = "7";
  existing[index("Order Number")] = "abc123";
  existing[index("Supplier Total")] = 9.99;
  existing[index("Supplier Order Numbers")] = "114-TEST";
  existing[index("Source")] = "poshmark-order-profit";
  existing[index("Order Status")] = "Awaiting Shipment";

  incoming[index("Platform")] = "Poshmark";
  incoming[index("Computer")] = "7";
  incoming[index("Order Number")] = "abc123";
  incoming[index("Marketplace Earnings")] = 13.4;
  incoming[index("Source")] = "poshmark-visible-sales";
  incoming[index("Order Date")] = "Jul 09, 2026";
  incoming[index("Order Status")] = "Order Complete";
  incoming[index("Earnings Status")] = "Completed";

  const merged = dashboard.mergeProfitRowValues_(existing, incoming);
  assert.equal(merged[index("Supplier Total")], 9.99);
  assert.equal(merged[index("Supplier Order Numbers")], "114-TEST");
  assert.equal(merged[index("Source")], "poshmark-order-profit");
  assert.equal(merged[index("Marketplace Earnings")], 13.4);
  assert.equal(merged[index("Order Status")], "Order Complete");
  assert.equal(merged[index("Earnings Status")], "Completed");
});

test("all packaged dashboard copies stay identical", () => {
  const files = [
    path.resolve(__dirname, "..", "dashboard", "GLDN_Ops_Dashboard_Code.gs"),
    path.resolve(__dirname, "..", "extension", "dashboard_apps_script", "Code.gs"),
    path.resolve(__dirname, "..", "apps-script-live", "Code.js")
  ];
  const sources = files.map((file) => fs.readFileSync(file, "utf8"));
  assert.equal(new Set(sources).size, 1);
});
