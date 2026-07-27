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
