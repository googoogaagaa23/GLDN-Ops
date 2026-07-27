const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class MemorySheet {
  constructor(columnCount) {
    this.columnCount = columnCount;
    this.rows = [Array(columnCount).fill("")];
    this.deleteBatchCalls = [];
  }

  getLastRow() {
    return this.rows.length;
  }

  appendRow(values) {
    this.rows.push(this.normalize(values));
  }

  deleteRow(rowNumber) {
    this.rows.splice(rowNumber - 1, 1);
  }

  deleteRows(startRow, rowCount) {
    this.deleteBatchCalls.push({ startRow, rowCount });
    this.rows.splice(startRow - 1, rowCount);
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      getValues: () => this.read(row, column, rowCount, columnCount),
      getDisplayValues: () => this.read(row, column, rowCount, columnCount)
        .map((values) => values.map((value) => String(value == null ? "" : value))),
      setValues: (values) => {
        values.forEach((sourceRow, rowOffset) => {
          const targetRow = row - 1 + rowOffset;
          while (this.rows.length <= targetRow) this.rows.push(Array(this.columnCount).fill(""));
          sourceRow.forEach((value, columnOffset) => {
            this.rows[targetRow][column - 1 + columnOffset] = value;
          });
        });
        return this;
      }
    };
  }

  read(row, column, rowCount, columnCount) {
    return Array.from({ length: rowCount }, (_, rowOffset) => {
      const source = this.rows[row - 1 + rowOffset] || [];
      return Array.from({ length: columnCount }, (_, columnOffset) => source[column - 1 + columnOffset] ?? "");
    });
  }

  normalize(values) {
    return Array.from({ length: this.columnCount }, (_, index) => values[index] ?? "");
  }
}

function dayKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildHarness() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "dashboard", "GLDN_Ops_Dashboard_Code.gs"), "utf8");
  const dashboard = new MemorySheet(39);
  const history = new MemorySheet(40);
  const spreadsheet = { getSpreadsheetTimeZone: () => "America/Chicago" };
  const sandbox = {
    console,
    Date,
    Intl,
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
    isFinite,
    Session: { getScriptTimeZone: () => "America/Chicago" },
    Utilities: {
      formatDate: (value, timeZone, format) => {
        assert.equal(format, "yyyy-MM-dd");
        return dayKey(value, timeZone);
      }
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
    },
    SpreadsheetApp: {
      BorderStyle: { SOLID: "SOLID" },
      flush() {}
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });
  sandbox.getSpreadsheet_ = () => spreadsheet;
  sandbox.ensureSheet_ = (_ss, name) => name === "Poshmark Stats Dashboard" ? dashboard : history;
  sandbox.formatPoshmarkStatsSheet_ = () => {};
  sandbox.formatGenericRow_ = () => {};
  sandbox.sortDashboard_ = () => {};
  return { sandbox, dashboard, history };
}

function statsRecord(capturedAt, profileListings) {
  return {
    computerLabel: "7",
    poshmarkAccountLabel: "igivegreatdeals",
    posherSince: "Jan 25 2025",
    profileListings,
    followers: 86000,
    shippedOrdersAllTime: 3800,
    shippedOrdersLast90: 1100,
    daysToShipLast90: 2.3,
    daysToShipAverage: 3.4,
    totalSalesLast90: 32000,
    sellerCancellationsLast90: 2.9,
    approvedReturnCasesLast90: 0.7,
    moderatorRemovedListingsLast30: 66,
    availableListings: 112000,
    averageDiscountOffOriginalPrice: 25,
    selfSharesLast30: 217000,
    soldListingsAllTime: 3985,
    totalEarnedAllTime: 91322.4,
    averageRating: 4.8,
    totalRatings: 2097,
    capturedAt,
    pageUrl: "https://poshmark.com/users/self/closet_stats"
  };
}

test("Poshmark stats keep one history row per Chicago day and compare with the prior day", () => {
  const { sandbox, dashboard, history } = buildHarness();

  const first = sandbox.savePoshmarkStats_(statsRecord("2026-07-10T15:00:00.000Z", 100));
  const second = sandbox.savePoshmarkStats_(statsRecord("2026-07-10T20:00:00.000Z", 105));
  const third = sandbox.savePoshmarkStats_(statsRecord("2026-07-11T15:00:00.000Z", 110));
  const fourth = sandbox.savePoshmarkStats_(statsRecord("2026-07-11T20:00:00.000Z", 113));

  assert.equal(first.historyMode, "appended");
  assert.equal(second.historyMode, "updated");
  assert.equal(third.historyMode, "appended");
  assert.equal(fourth.historyMode, "updated");
  assert.equal(history.rows.length, 3, "header plus exactly two daily rows");
  assert.equal(history.rows[1][4], 105, "latest scan is retained for day one");
  assert.equal(history.rows[1][5], "", "first day has no prior-day delta");
  assert.equal(history.rows[2][4], 113, "latest scan is retained for day two");
  assert.equal(history.rows[2][5], 8, "same-day repeat still compares with the prior day's final value");
  assert.equal(dashboard.rows[1][3], 113);
  assert.equal(dashboard.rows[1][4], 8);
  assert.equal(fourth.previousDate, "2026-07-10");
});

test("Poshmark history repair removes legacy same-day duplicates and rebuilds daily deltas", () => {
  const { sandbox, history } = buildHarness();
  const legacyRow = (capturedAt, profileListings) => {
    const row = Array(40).fill("");
    row[0] = new Date(capturedAt);
    row[1] = "7";
    row[2] = "igivegreatdeals";
    row[4] = profileListings;
    row[38] = new Date(capturedAt);
    return row;
  };
  for (let index = 0; index < 7; index += 1) {
    history.appendRow(legacyRow(`2026-07-08T${String(14 + index).padStart(2, "0")}:00:00.000Z`, 100 + index));
  }
  for (let index = 0; index < 4; index += 1) {
    history.appendRow(legacyRow(`2026-07-09T${String(14 + index).padStart(2, "0")}:00:00.000Z`, 107 + index));
  }
  for (let index = 0; index < 7; index += 1) {
    history.appendRow(legacyRow(`2026-07-10T${String(14 + index).padStart(2, "0")}:00:00.000Z`, 111 + index));
  }

  const result = sandbox.repairPoshmarkStatsHistoryDaily_(history, "America/Chicago");

  assert.equal(result.removedDuplicates, 15);
  assert.equal(result.rebuiltRows, 3);
  assert.equal(history.rows.length, 4);
  assert.equal(history.deleteBatchCalls.length, 3, "fifteen duplicate rows are removed in three contiguous batches");
  assert.equal(history.rows[1][4], 106, "newest duplicate is kept");
  assert.equal(history.rows[1][5], "");
  assert.equal(history.rows[2][4], 110);
  assert.equal(history.rows[2][5], 4);
  assert.equal(history.rows[3][4], 117);
  assert.equal(history.rows[3][5], 7);
});
