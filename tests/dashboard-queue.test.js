const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("failed dashboard writes queue and later retry without losing identity", async () => {
  const root = path.resolve(__dirname, "..");
  const storage = {
    sellerDashboardUrl: "https://script.google.com/macros/s/example/exec",
    sellerDashboardKey: "test-secret-123456789",
    computerLabel: "0",
    ebayAccountLabel: "FAK12"
  };
  let networkWorks = false;
  const event = () => ({ addListener() {} });
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
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    self: { addEventListener() {} },
    chrome: {
      storage: {
        local: {
          get(keys, callback) {
            const requested = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(requested.map((key) => [key, storage[key]])));
          },
          set(values, callback) { Object.assign(storage, values); if (callback) callback(); },
          remove(keys, callback) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
            if (callback) callback();
          }
        }
      },
      runtime: {
        getManifest: () => ({ name: "GLDN Ops", version: "9.9.9" }),
        getURL: (file) => `chrome-extension://test/${file}`,
        onInstalled: event(),
        onStartup: event(),
        onMessage: event(),
        reload() {},
        lastError: null
      },
      alarms: { create() {}, onAlarm: event() },
      tabs: { create(options, callback) { callback({ id: 1, url: options.url }); } }
    },
    fetch: async () => {
      if (!networkWorks) throw new Error("offline");
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, message: "saved" }) };
    },
    importScripts() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "config.example.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "foundation.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "background.js"), "utf8"), sandbox);

  const failed = await sandbox.handleSync("marketplaceProfit", {
    computerLabel: "0",
    ebayAccountLabel: "FAK12",
    orderNumber: "test-order"
  }, "saved");
  assert.equal(failed.ok, false);
  assert.equal(failed.queued, true);
  assert.equal(storage.gldnDashboardQueue.length, 1);
  assert.equal(storage.gldnDashboardQueue[0].record.computerLabel, "0");

  networkWorks = true;
  const retried = await sandbox.processDashboardQueue({ force: true });
  assert.equal(retried.ok, true);
  assert.equal(retried.processed, 1);
  assert.equal(storage.gldnDashboardQueue.length, 0);
  assert.equal(storage.lastDashboardSync.retried, true);
});
