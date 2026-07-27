const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadFoundation() {
  const root = path.resolve(__dirname, "..");
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "config.example.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "theme-catalog.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "foundation.js"), "utf8"), context);
  return context.GLDN_FOUNDATION;
}

test("computer identities come from one shared map", () => {
  const foundation = loadFoundation();
  assert.deepEqual(
    JSON.parse(JSON.stringify(foundation.identityForComputer("Computer 0"))),
    {
      computerLabel: "0",
      ebayAccountLabel: "FAK12",
      display: "0 - FAK12",
      poshmarkOnly: false,
      poshmarkComputerLabel: "7"
    }
  );
  assert.equal(foundation.identityForComputer("7").poshmarkOnly, true);
  assert.equal(foundation.identityForComputer("M0").ebayAccountLabel, "CLICKNCARRY");
  assert.equal(foundation.normalizeComputer("unknown"), "");
});

test("combined and Poshmark-only computers resolve to dashboard computer 7", () => {
  const foundation = loadFoundation();
  assert.equal(foundation.poshmarkIdentityForComputer("0").computerLabel, "7");
  assert.equal(foundation.poshmarkIdentityForComputer("0").displayComputerLabel, "0 + 7");
  assert.equal(foundation.poshmarkIdentityForComputer("7").computerLabel, "7");
  assert.equal(foundation.poshmarkIdentityForComputer("2").enabled, false);
});

test("Computer 2 defaults to the FancyFi Move .99 category pair", () => {
  const foundation = loadFoundation();
  const defaults = foundation.move99DefaultSettingsForAccount("FANCYFI");
  assert.deepEqual(JSON.parse(JSON.stringify(defaults)), {
    sourceCategories: ["SNI", "SNIPO v2"],
    destinationCategory: "DAILY",
    sourceStoreCategoryIds: [],
    backburnerItemIds: []
  });

  const migrated = foundation.move99SettingsForAccount("FANCYFI", {
    sourceCategories: ["Not .99", "Other"],
    destinationCategory: "Abra Cadabra .99",
    sourceStoreCategoryIds: ["123"],
    backburnerItemIds: ["318521296686"]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(migrated)), {
    sourceCategories: ["SNI", "SNIPO v2"],
    destinationCategory: "DAILY",
    sourceStoreCategoryIds: [],
    backburnerItemIds: ["318521296686"]
  });

  const custom = foundation.move99SettingsForAccount("FANCYFI", {
    sourceCategories: ["CUSTOM SOURCE"],
    destinationCategory: "CUSTOM SALE",
    sourceStoreCategoryIds: ["987654321"],
    backburnerItemIds: []
  });
  assert.equal(custom.sourceCategories[0], "CUSTOM SOURCE");
  assert.equal(custom.destinationCategory, "CUSTOM SALE");
  assert.equal(custom.sourceStoreCategoryIds[0], "987654321");
});

test("Poshmark account detection prefers the signed-in closet and ignores chrome labels", () => {
  const foundation = loadFoundation();
  assert.equal(foundation.poshmarkAccountLabel({
    closetHrefs: ["/feed", "/closet/igivegreatdeals"],
    avatarAlts: ["poshmark-logo", "search-icon-black", "igivegreatdeals"]
  }), "igivegreatdeals");
  assert.equal(foundation.poshmarkAccountLabel({
    closetHrefs: [],
    avatarAlts: ["poshmark-logo", "sell", "igivegreatdeals"]
  }), "igivegreatdeals");
  assert.equal(foundation.poshmarkAccountLabel({
    closetHrefs: [],
    avatarAlts: ["poshmark-logo", "search-icon-black", "sell"]
  }), "");
});

test("settings migration never silently assigns a computer", () => {
  const foundation = loadFoundation();
  const empty = foundation.normalizeStoredSettings({});
  assert.equal(empty.computerLabel, "");
  assert.equal(empty.ebayAccountLabel, "");
  assert.equal(empty.gldnUiOpacity, 75);
  assert.equal(empty.gldnUiTheme, "dark");

  const existing = foundation.normalizeStoredSettings({
    computerLabel: "m1",
    ebayAccountLabel: "WRONG",
    gldnUiOpacity: 20,
    gldnUiTheme: "light"
  });
  assert.equal(existing.computerLabel, "M1");
  assert.equal(existing.ebayAccountLabel, "HEARTSTONE");
  assert.equal(existing.gldnUiOpacity, 20);
  assert.equal(existing.gldnUiTheme, "light");

  const graphite = foundation.normalizeStoredSettings({ gldnUiTheme: "graphite" });
  assert.equal(graphite.gldnUiTheme, "graphite");
  const signal = foundation.normalizeStoredSettings({ gldnUiTheme: "signal" });
  assert.equal(signal.gldnUiTheme, "signal");
  const midnight = foundation.normalizeStoredSettings({ gldnUiTheme: "midnight" });
  assert.equal(midnight.gldnUiTheme, "midnight");
  const crimson = foundation.normalizeStoredSettings({ gldnUiTheme: "crimson" });
  assert.equal(crimson.gldnUiTheme, "crimson");
  const circuitBoard = foundation.normalizeStoredSettings({ gldnUiTheme: "circuit-board" });
  assert.equal(circuitBoard.gldnUiTheme, "circuit-board");
  const invalid = foundation.normalizeStoredSettings({ gldnUiTheme: "random" });
  assert.equal(invalid.gldnUiTheme, "dark");
});

test("manifest loads the theme catalog and foundation before shared code on every supported page class", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "extension", "manifest.json"), "utf8"));
  assert.equal(manifest.content_scripts.length, 6);
  for (const entry of manifest.content_scripts) {
    assert.deepEqual(entry.js.slice(0, 4), ["config.example.js", "theme-catalog.js", "foundation.js", "shared.js"]);
  }
  const universal = manifest.content_scripts.find((entry) => entry.js.includes("universal.js"));
  assert.deepEqual(universal.matches, ["http://*/*", "https://*/*"]);
  for (const marketplace of ["amazon.com", "walmart.com", "ebay.com", "poshmark.com", "ecomsniper.io"]) {
    assert.ok(universal.exclude_matches.some((pattern) => pattern.includes(marketplace)));
  }
});

test("workflow classifier protects active runs and approval-ready reviews", () => {
  const foundation = loadFoundation();
  const workflows = foundation.activeWorkflowEntries({
    pendingMove99Run: { active: false, phase: "awaiting-submit-approval" },
    pendingMarkShippedRun: { active: true, phase: "awaiting-approval" },
    poshmarkProfitBackfill: { active: false, phase: "review" },
    pendingWalmartAutoOrder: { ebayOrderNumber: "12-345" },
    pendingSellerLevelScan: false,
    pendingEbaySnapshotScan: { active: false, phase: "failed" }
  }, 1000);
  assert.deepEqual(
    JSON.parse(JSON.stringify(workflows.map((entry) => [entry.id, entry.approvalReady]))),
    [
      ["move99", true],
      ["mark-shipped", true],
      ["poshmark-profit", true],
      ["walmart-order", true]
    ]
  );
});

test("workflow classifier ignores expired reservations and protects open GLDN review windows", () => {
  const foundation = loadFoundation();
  const workflows = foundation.activeWorkflowEntries({
    gldnWorkflowReservation: { active: true, id: "old", label: "Old start", expiresAt: 999 },
    gldnOpenReviews: {
      stale: { active: true, label: "Stale review", expiresAt: 999 },
      current: { active: true, label: "Review Seller Level", expiresAt: 2000 }
    },
    pendingReviewMonthlyLimits: true
  }, 1000);
  assert.deepEqual(
    JSON.parse(JSON.stringify(workflows.map((entry) => entry.label))),
    ["Review Seller Level", "Listing limit check"]
  );
  assert.ok(foundation.workflowStateKeys.includes("gldnOpenReviews"));
});

function verifiedMove99Summary(overrides = {}) {
  const qualifying = Array.from({ length: 136 }, (_, index) => ({
    itemId: String(318000000000 + index),
    title: `Reverse match ${index + 1}`,
    price: 10,
    qualifies: true
  }));
  const otherIds = Array.from({ length: 15807 - qualifying.length }, (_, index) => String(319000000000 + index));
  const itemIds = [...qualifying.map((record) => record.itemId), ...otherIds];
  return {
    active: false,
    confirmed: true,
    phase: "scan-summary",
    scanMode: "non99",
    scanStrategy: "active-page-exact-id-v1",
    scanIntegrity: "verified",
    extensionVersion: "3.11.6",
    uniqueInspected: 15807,
    filteredCount: 15807,
    qualifyingCount: 136,
    sourceCategories: ["DAILY"],
    destinationCategory: "SNI",
    scanPages: {
      "1": {
        inspected: itemIds.length,
        itemIds,
        qualifying,
        records: qualifying
      }
    },
    processedIds: [],
    failedIds: [],
    currentBatchIds: [],
    totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
    ...overrides
  };
}

test("verified read-only Move .99 summaries survive an extension update without rescanning", () => {
  const foundation = loadFoundation();
  const previous = verifiedMove99Summary();
  const migrated = foundation.migratePortableMove99Summary(previous, "3.11.8", "2026-07-26T18:00:00.000Z");

  assert.ok(migrated);
  assert.equal(migrated.extensionVersion, "3.11.8");
  assert.equal(migrated.migratedFromExtensionVersion, "3.11.6");
  assert.equal(migrated.migratedAt, "2026-07-26T18:00:00.000Z");
  assert.equal(migrated.phase, "scan-summary");
  assert.equal(migrated.active, false);
  assert.equal(migrated.confirmed, false);
  assert.equal(migrated.ownerTabId, null);
  assert.equal(migrated.scanPages["1"].qualifying.length, 136);
  assert.equal(migrated.scanPages["1"].itemIds.length, 15807);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.totals)), {
    batches: 0,
    selected: 0,
    categoryApplied: 0,
    live: 0,
    failed: 0
  });
  assert.equal(previous.extensionVersion, "3.11.6", "migration must not mutate the saved checkpoint");
});

test("Move .99 cross-version migration rejects active, mutated, or inconsistent checkpoints", () => {
  const foundation = loadFoundation();
  const rejects = [
    verifiedMove99Summary({ active: true }),
    verifiedMove99Summary({ phase: "apply-exact-workspace" }),
    verifiedMove99Summary({ phase: "awaiting-submit-approval" }),
    verifiedMove99Summary({ totals: { batches: 1 } }),
    verifiedMove99Summary({ totals: { selected: 1 } }),
    verifiedMove99Summary({ totals: { categoryApplied: 1 } }),
    verifiedMove99Summary({ totals: { live: 1 } }),
    verifiedMove99Summary({ totals: { failed: 1 } }),
    verifiedMove99Summary({ processedIds: ["318000000000"] }),
    verifiedMove99Summary({ failedIds: ["318000000000"] }),
    verifiedMove99Summary({ currentBatchIds: ["318000000000"] }),
    verifiedMove99Summary({ uniqueInspected: 15806 }),
    verifiedMove99Summary({ qualifyingCount: 135 }),
    verifiedMove99Summary({ sourceCategories: [] }),
    verifiedMove99Summary({ destinationCategory: "" })
  ];

  for (const state of rejects) {
    assert.equal(foundation.migratePortableMove99Summary(state, "3.11.8"), null);
  }

  const duplicate = verifiedMove99Summary();
  duplicate.scanPages["1"].qualifying[1].itemId = duplicate.scanPages["1"].qualifying[0].itemId;
  assert.equal(foundation.migratePortableMove99Summary(duplicate, "3.11.8"), null);

  const invalid = verifiedMove99Summary();
  invalid.scanPages["1"].qualifying[0].itemId = "invalid";
  assert.equal(foundation.migratePortableMove99Summary(invalid, "3.11.8"), null);
});
