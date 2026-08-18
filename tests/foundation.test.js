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
  assert.deepEqual(JSON.parse(JSON.stringify(foundation.computerOptions)), ["M0", "2", "6", "0", "M1", "7"]);
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
    sourceStoreCategoryIds: ["23845190015", "24051049015"],
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
    sourceStoreCategoryIds: ["23845190015", "24051049015"],
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

test("M1 defaults to the Heartstone Move .99 category pair", () => {
  const foundation = loadFoundation();
  const defaults = foundation.move99DefaultSettingsForAccount("HEARTSTONE");
  assert.deepEqual(JSON.parse(JSON.stringify(defaults)), {
    sourceCategories: ["SNIP'D"],
    destinationCategory: ".99",
    sourceStoreCategoryIds: [],
    backburnerItemIds: []
  });

  const migrated = foundation.move99SettingsForAccount("HEARTSTONE", {
    sourceCategories: ["Not .99", "Other"],
    destinationCategory: "Abra Cadabra .99",
    sourceStoreCategoryIds: ["123"],
    backburnerItemIds: ["318521296686"]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(migrated)), {
    sourceCategories: ["SNIP'D"],
    destinationCategory: ".99",
    sourceStoreCategoryIds: [],
    backburnerItemIds: ["318521296686"]
  });

  const custom = foundation.move99SettingsForAccount("HEARTSTONE", {
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

test("Move .99 resets every one-use action receipt before a new batch", () => {
  const foundation = loadFoundation();
  const reset = JSON.parse(JSON.stringify(foundation.resetMove99BatchActionState({
    currentBatchIds: ["one", "two"],
    totals: { batches: 2, live: 999 },
    approvalActionObservedAt: "old",
    finalActionApprovalToken: "APPROVE SUBMIT 500",
    finalActionClickCount: 1,
    trustedSubmitDispatchAt: "old",
    trustedSubmitReleasedAt: "old",
    trustedSubmitTarget: { label: "submit (500)" },
    trustedSubmitWorkspaceId: "old-workspace",
    trustedSubmitBatchKey: "old-batch",
    finalReviewEvidence: { workspaceId: "old-workspace", batchKey: "old-batch" },
    finalReviewActionClickCount: 1,
    trustedFinalReviewDispatchAt: "old",
    trustedFinalReviewReleasedAt: "old",
    finalReviewRecoveryClickCount: 1,
    finalReviewProgrammaticActivationCount: 1,
    reviewRecoveredAfterReloadAt: "old",
    reviewRecoveryEvidence: { expectedCount: 500 }
  }, {
    workspaceId: "new-workspace",
    batchKey: "new-batch"
  })));

  assert.deepEqual(reset.currentBatchIds, ["one", "two"]);
  assert.deepEqual(reset.totals, { batches: 2, live: 999 });
  assert.equal(reset.approvalActionObservedAt, "");
  assert.equal(reset.finalActionApprovalToken, "");
  assert.equal(reset.finalActionClickCount, 0);
  assert.equal(reset.trustedSubmitDispatchAt, "");
  assert.equal(reset.trustedSubmitReleasedAt, "");
  assert.equal(reset.trustedSubmitTarget, null);
  assert.equal(reset.finalReviewEvidence, null);
  assert.equal(reset.finalReviewActionClickCount, 0);
  assert.equal(reset.trustedFinalReviewDispatchAt, "");
  assert.equal(reset.trustedFinalReviewReleasedAt, "");
  assert.equal(reset.finalReviewRecoveryClickCount, 0);
  assert.equal(reset.finalReviewProgrammaticActivationCount, 0);
  assert.equal(reset.reviewRecoveredAfterReloadAt, "");
  assert.equal(reset.reviewRecoveryEvidence, null);
  assert.equal(reset.approvalCycleWorkspaceId, "new-workspace");
  assert.equal(reset.approvalCycleBatchKey, "new-batch");
});

test("Move .99 detects action receipts copied from a prior workspace", () => {
  const foundation = loadFoundation();
  assert.equal(foundation.move99BatchActionStateIsStale({
    approvalWorkspaceId: "workspace-3",
    currentBatchKey: "batch-3",
    trustedSubmitDispatchAt: "old",
    trustedSubmitWorkspaceId: "workspace-2",
    trustedSubmitBatchKey: "batch-2"
  }), true);
  assert.equal(foundation.move99BatchActionStateIsStale({
    approvalWorkspaceId: "workspace-3",
    currentBatchKey: "batch-3",
    finalReviewEvidence: { workspaceId: "workspace-2", batchKey: "batch-2" }
  }), true);
});

test("Move .99 never clears a receipt belonging to the current workspace", () => {
  const foundation = loadFoundation();
  assert.equal(foundation.move99BatchActionStateIsStale({
    approvalWorkspaceId: "workspace-3",
    currentBatchKey: "batch-3",
    trustedSubmitDispatchAt: "current",
    trustedSubmitWorkspaceId: "workspace-3",
    trustedSubmitBatchKey: "batch-3",
    finalReviewEvidence: { workspaceId: "workspace-3", batchKey: "batch-3" }
  }), false);
  assert.equal(foundation.move99BatchActionStateIsStale({
    approvalWorkspaceId: "workspace-3",
    currentBatchKey: "batch-3"
  }), false);
});

test("Move .99 version migration makes an old saved summary passive", () => {
  const foundation = loadFoundation();
  const itemId = "318000000001";
  const migrated = JSON.parse(JSON.stringify(foundation.migratePortableMove99Summary({
    extensionVersion: "3.11.14",
    active: false,
    confirmed: true,
    ownerTabId: 42,
    phase: "scan-summary",
    reviewRequested: true,
    reviewRequestedAt: "2026-08-02T11:59:00.000Z",
    scanMode: "price99",
    scanStrategy: "active-page-exact-id-v1",
    scanIntegrity: "verified",
    sourceCategories: ["Not .99"],
    destinationCategory: "Abra Cadabra .99",
    filteredCount: 1,
    uniqueInspected: 1,
    qualifyingCount: 1,
    scanPages: {
      1: {
        inspected: 1,
        itemIds: [itemId],
        qualifying: [{ itemId, qualifies: true }]
      }
    },
    totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
    processedIds: [],
    failedIds: [],
    currentBatchIds: []
  }, "3.11.34", Date.parse("2026-08-02T12:00:00.000Z"))));

  assert.equal(migrated.extensionVersion, "3.11.34");
  assert.equal(migrated.phase, "scan-summary");
  assert.equal(migrated.active, false);
  assert.equal(migrated.ownerTabId, null);
  assert.equal(migrated.reviewRequested, false);
  assert.equal(migrated.reviewRequestedAt, "");
  assert.equal(foundation.activeWorkflowEntries({ pendingMove99Run: migrated }).length, 0);
});

test("reverse Move .99 requires an explicit sale-event-off confirmation", () => {
  const foundation = loadFoundation();
  const off = JSON.parse(JSON.stringify(foundation.reverseMove99SaleEventDecision("off")));
  const on = JSON.parse(JSON.stringify(foundation.reverseMove99SaleEventDecision("on")));
  const missing = JSON.parse(JSON.stringify(foundation.reverseMove99SaleEventDecision("")));

  assert.deepEqual(off, { ok: true, status: "off", error: "" });
  assert.equal(on.ok, false);
  assert.equal(on.status, "on");
  assert.equal(missing.ok, false);
  assert.equal(missing.status, "unconfirmed");
  assert.equal(on.error, foundation.reverseMove99SaleEventBlockedMessage);
  assert.equal(missing.error, foundation.reverseMove99SaleEventBlockedMessage);
  assert.match(foundation.reverseMove99SaleEventPrompt, /sale event active/i);
  assert.match(foundation.reverseMove99SaleEventPrompt, /Sale Event Is OFF/);
  assert.match(foundation.reverseMove99SaleEventBlockedMessage, /must be turned off/i);
});

test("local control compacts large Move .99 checkpoints without losing approval evidence", () => {
  const foundation = loadFoundation();
  const itemIds = Array.from({ length: 7851 }, (_, index) => String(318000000000 + index));
  const qualifyingIds = itemIds.slice(0, 5651);
  const scanPages = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [
    String(index + 1),
    {
      itemIds: itemIds.slice(index * 200, (index + 1) * 200),
      qualifying: qualifyingIds.slice(index * 145, (index + 1) * 145).map((itemId) => ({ itemId, qualifies: true }))
    }
  ]));
  const state = {
    extensionVersion: "3.11.29",
    runId: "reverse-run",
    scanMode: "non99",
    saleEventStatus: "off",
    saleEventConfirmedAt: "2026-08-01T19:00:00.000Z",
    scanStrategy: "active-page-exact-id-v1",
    scanIntegrity: "verified",
    phase: "awaiting-submit-approval",
    active: true,
    confirmed: true,
    reviewReady: true,
    sourceCategories: ["Abra Cadabra .99"],
    sourceStoreCategoryIds: ["44619286011"],
    destinationCategory: "Not .99",
    filteredCount: 7851,
    uniqueInspected: 7851,
    qualifyingCount: 5651,
    scanPages,
    exactBatches: Array.from({ length: 12 }, (_, index) => qualifyingIds.slice(index * 500, (index + 1) * 500)),
    applyIndex: 0,
    currentBatchCount: 500,
    currentBatchIds: qualifyingIds.slice(0, 500),
    currentBatchKey: "batch-1",
    workspaceId: "4152179884050",
    approvalWorkspaceId: "workspace-500",
    ownerTabId: 515884563,
    approvalTabId: 515884563,
    previousApprovalTabId: 41,
    reviewRecoveryEvidence: { expectedCount: 500, workspaceId: "workspace-500" },
    processedIds: [],
    failedIds: [],
    categoryUpdate: { attempted: 500, updated: 500, verified: 500 },
    totals: { batches: 0, selected: 500, categoryApplied: 500, live: 0, failed: 0 }
  };

  const compact = JSON.parse(JSON.stringify(foundation.compactMove99ControlRecord(state)));
  assert.equal(compact.compact, true);
  assert.equal(compact.filteredCount, 7851);
  assert.equal(compact.qualifyingCount, 5651);
  assert.equal(compact.saleEventStatus, "off");
  assert.equal(compact.saleEventConfirmedAt, "2026-08-01T19:00:00.000Z");
  assert.equal(compact.scanPageCount, 40);
  assert.equal(compact.exactBatchCount, 12);
  assert.equal(compact.currentBatchCount, 500);
  assert.equal(compact.currentBatchIdCount, 500);
  assert.equal(compact.approvalWorkspaceId, "workspace-500");
  assert.equal(compact.previousApprovalTabId, 41);
  assert.equal(compact.reviewRecoveryEvidence.expectedCount, 500);
  assert.equal(compact.workspaceId, "4152179884050");
  assert.equal(compact.requiredApprovalCount, 500);
  assert.deepEqual(compact.categoryUpdate, { attempted: 500, updated: 500, verified: 500 });
  assert.ok(JSON.stringify(compact).length < 5000);
  assert.doesNotMatch(JSON.stringify(compact), new RegExp(itemIds[0]));
});

test("local control compacts a full Poshmark profit backfill without losing progress or approval counts", () => {
  const foundation = loadFoundation();
  const sales = Array.from({ length: 10000 }, (_, index) => ({
    orderNumber: `order-${index}`,
    itemTitle: `Historical item ${index}`,
    detailCapturedAt: index < 9250 ? "2026-08-01T00:00:00.000Z" : "",
    payload: "x".repeat(250)
  }));
  const purchases = Array.from({ length: 8100 }, (_, index) => ({
    orderId: `amazon-${index}`,
    asin: `B${String(index).padStart(9, "0")}`,
    cost: 9.99,
    evidence: "y".repeat(250)
  }));
  const results = sales.map((sale, index) => {
    if (index < 7900) return { orderNumber: sale.orderNumber, status: "exact", record: { profit: 6.01, evidence: "z".repeat(250) } };
    if (index < 8500) return { orderNumber: sale.orderNumber, status: "missing-sku" };
    if (index < 9200) return { orderNumber: sale.orderNumber, status: "amazon-not-found" };
    return { orderNumber: sale.orderNumber, status: index % 2 ? "needs-review-same-cost" : "needs-review-ambiguous-cost" };
  });
  const state = {
    stateVersion: 1,
    extensionVersion: "3.11.29",
    runId: "posh-backfill-full",
    scope: "all",
    supplierProfile: "F9132",
    maxOrders: 10000,
    matchWindowDays: 7,
    computerLabel: "7",
    phase: "review",
    active: false,
    currentPage: 101,
    pageFingerprints: Array.from({ length: 100 }, (_, index) => `page-${index}-${"p".repeat(1000)}`),
    sales,
    detailIndex: 10000,
    asins: purchases.map((purchase) => purchase.asin),
    asinIndex: 8100,
    purchases,
    results,
    syncedOrderNumbers: sales.slice(0, 125).map((sale) => sale.orderNumber),
    knownOrderNumbers: sales.slice(0, 5000).map((sale) => sale.orderNumber),
    errors: [{ phase: "amazon-search", message: "A".repeat(5000), at: "2026-08-01T00:00:00.000Z" }],
    ownerTabId: 21,
    ownerWindowId: 22,
    workerTabId: 23
  };

  const compact = JSON.parse(JSON.stringify(foundation.compactPoshmarkProfitBackfillControlRecord(state)));
  assert.equal(compact.compact, true);
  assert.equal(compact.rangeDays, null);
  assert.equal(compact.supplierProfile, "F9132");
  assert.equal(compact.salesIndexed, 10000);
  assert.equal(compact.detailsCaptured, 9250);
  assert.equal(compact.pagesScanned, 100);
  assert.equal(compact.amazonUnitsCaptured, 8100);
  assert.deepEqual(compact.resultCounts, { exact: 7900, missingSku: 600, amazonNotFound: 700, needsReview: 800 });
  assert.equal(compact.syncedCount, 125);
  assert.equal(compact.remainingExactToSync, 7775);
  assert.equal(compact.remainingReviewToSync, 9875);
  assert.equal(compact.requiredApprovalCount, 7775);
  assert.equal(compact.approvalRequired, true);
  assert.equal(compact.knownOrderCount, 5000);
  assert.equal(compact.errorCount, 1);
  assert.ok(compact.recentErrors[0].message.length <= 500);
  assert.ok(JSON.stringify(compact).length < 5000);
  assert.doesNotMatch(JSON.stringify(compact), /Historical item 9999/);
  assert.match(JSON.stringify(compact), /amazon-8099/);
  assert.doesNotMatch(JSON.stringify(compact), /amazon-5000/);

  const monthly = JSON.parse(JSON.stringify(foundation.compactPoshmarkProfitBackfillControlRecord({ ...state, scope: "month" })));
  assert.equal(monthly.remainingExactToSync, 7775);
  assert.equal(monthly.remainingReviewToSync, 9875);
  assert.equal(monthly.requiredApprovalCount, 9875);
  assert.equal(monthly.approvalRequired, true);
});

test("local control applies a final response budget without changing the stored source object", () => {
  const foundation = loadFoundation();
  const state = {
    computerLabel: "0",
    ebayAccountLabel: "FAK12",
    futureLargeCheckpoint: {
      rows: Array.from({ length: 10000 }, (_, index) => ({ index, evidence: "proof".repeat(50) }))
    },
    smallDiagnostic: { ok: true, count: 12 }
  };

  assert.ok(foundation.serializedUtf8Bytes(state) > 1024 * 1024);
  const compact = JSON.parse(JSON.stringify(foundation.fitControlStateToBudget(state, 524288)));
  assert.equal(compact.computerLabel, "0");
  assert.equal(compact.ebayAccountLabel, "FAK12");
  assert.deepEqual(compact.smallDiagnostic, { ok: true, count: 12 });
  assert.equal(compact.futureLargeCheckpoint.omittedForLocalControl, true);
  assert.equal(compact.futureLargeCheckpoint.itemCount, null);
  assert.equal(compact.futureLargeCheckpoint.propertyCount, 1);
  assert.equal(compact.localControlCompaction.reason, "local-control-response-budget");
  assert.ok(compact.localControlCompaction.omittedKeys.includes("futureLargeCheckpoint"));
  assert.ok(foundation.serializedUtf8Bytes(compact) < 524288);
  assert.equal(state.futureLargeCheckpoint.rows.length, 10000);
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
