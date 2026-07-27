const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("the dashboard processes one sync ID only once", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "dashboard", "GLDN_Ops_Dashboard_Code.gs"), "utf8");
  const setupCode = "test-secret-123456789-abcdef";
  const properties = new Map([["GLDN_SYNC_KEY", setupCode]]);
  const receipts = [];
  const receiptSheet = {
    getLastRow() { return receipts.length + 1; },
    getRange(row, column) {
      return {
        createTextFinder(value) {
          return {
            matchEntireCell() { return this; },
            findNext() {
              const index = receipts.findIndex((entry) => entry[0] === value);
              return index >= 0 ? { getRow: () => index + 2 } : null;
            }
          };
        },
        getDisplayValue() { return String(receipts[row - 2]?.[column - 1] || ""); }
      };
    },
    appendRow(row) { receipts.push(row); },
    deleteRows(start, count) { receipts.splice(start - 2, count); }
  };
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
    isFinite,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.get(key) || null; },
          setProperty(key, value) { properties.set(key, value); }
        };
      }
    },
    LockService: {
      getScriptLock() { return { waitLock() {}, releaseLock() {} }; }
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) { return { text, setMimeType() { return this; } }; }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest() { throw new Error("digest should not be needed with a configured key"); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { timeout: 5000 });
  sandbox.getSpreadsheet_ = () => ({});
  sandbox.ensureSheet_ = () => receiptSheet;
  let writes = 0;
  sandbox.processDashboardAction_ = (action) => {
    writes += 1;
    return { ok: true, message: `${action} saved` };
  };

  const request = {
    postData: {
      contents: JSON.stringify({
        action: "marketplaceProfit",
        key: setupCode,
        syncId: "gldn-test-one",
        record: { computerLabel: "7", accountLabel: "@test" }
      })
    }
  };
  const first = JSON.parse(sandbox.doPost(request).text);
  const second = JSON.parse(sandbox.doPost(request).text);

  assert.equal(first.ok, true);
  assert.equal(first.duplicate, undefined);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(writes, 1);
  assert.equal(receipts.length, 1);
});
