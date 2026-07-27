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
