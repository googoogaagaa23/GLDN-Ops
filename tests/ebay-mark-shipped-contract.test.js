const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const ebaySource = fs.readFileSync(path.join(root, "extension/ebay.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(root, "extension/background.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
const dashboardFiles = [
  "apps-script-live/Code.js",
  "dashboard/GLDN_Ops_Dashboard_Code.gs",
  "extension/dashboard_apps_script/Code.gs"
];
const dashboardSources = dashboardFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8"));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  let parenDepth = 0;
  let sawParameters = false;
  let brace = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") {
      parenDepth += 1;
      sawParameters = true;
    } else if (source[index] === ")") {
      parenDepth -= 1;
    } else if (source[index] === "{" && sawParameters && parenDepth === 0) {
      brace = index;
      break;
    }
  }
  assert.notEqual(brace, -1, `${name} body is missing`);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function blockBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `${startMarker} is missing`);
  assert.notEqual(end, -1, `${endMarker} is missing`);
  return source.slice(start, end);
}

test("Mark as Shipped confirmation requires every awaiting order", () => {
  const sandbox = {
    U: {
      isVisible: () => true,
      normalizeText: (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
    }
  };
  vm.runInNewContext([
    extractFunction(ebaySource, "isMarkShippedDialogText"),
    extractFunction(ebaySource, "findMarkShippedFinalAction"),
    extractFunction(ebaySource, "parseSelectedOrdersCount"),
    extractFunction(ebaySource, "resolveMarkShippedSelectedCount"),
    extractFunction(ebaySource, "parseMarkShippedSelectedCount"),
    extractFunction(ebaySource, "resolveMarkShippedConfirmationCount"),
    extractFunction(ebaySource, "validateMarkShippedConfirmation")
  ].join("\n"), sandbox);
  assert.equal(sandbox.parseSelectedOrdersCount("27 orders selected"), 27);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.resolveMarkShippedSelectedCount(null, 1, true, 1, true))),
    { count: 1, source: "checked-order-controls" }
  );
  assert.equal(sandbox.resolveMarkShippedSelectedCount(null, 2, true, 1, true), null);
  assert.equal(sandbox.resolveMarkShippedSelectedCount(null, 1, false, 1, true), null);
  assert.equal(sandbox.resolveMarkShippedSelectedCount(null, 1, true, 1, false), null);
  assert.equal(sandbox.parseMarkShippedSelectedCount("Are you sure you want to mark 27 orders as shipped?"), 27);
  assert.equal(sandbox.parseMarkShippedSelectedCount("Mark selected orders as shipped"), null);
  assert.equal(sandbox.isMarkShippedDialogText("Mark as shipped Are you sure you want to mark 4 orders as shipped? Continue"), true);
  assert.equal(sandbox.isMarkShippedDialogText("Confirm marking the selected orders as shipped"), true);
  assert.equal(sandbox.isMarkShippedDialogText("Shipping labels are ready"), false);
  const continueButton = {
    getAttribute: () => null,
    innerText: "Continue",
    textContent: "Continue",
    title: ""
  };
  const cancelButton = {
    getAttribute: () => null,
    innerText: "Cancel",
    textContent: "Cancel",
    title: ""
  };
  assert.equal(
    sandbox.findMarkShippedFinalAction({ querySelectorAll: () => [cancelButton, continueButton] }),
    continueButton
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.resolveMarkShippedConfirmationCount(null, 1, 1))),
    { count: 1, source: "pre-confirm-selection" }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.resolveMarkShippedConfirmationCount(1, 1, 1))),
    { count: 1, source: "confirmation-dialog" }
  );
  assert.equal(sandbox.resolveMarkShippedConfirmationCount(null, 1, 2), null);
  assert.equal(sandbox.validateMarkShippedConfirmation(27, 27).ok, true);
  const partial = sandbox.validateMarkShippedConfirmation(27, 20);
  assert.equal(partial.ok, false);
  assert.match(partial.error, /20 of 27/);
});

test("Mark as Shipped completion evidence distinguishes exact and partial results", () => {
  const sandbox = {};
  vm.runInNewContext(extractFunction(ebaySource, "markShippedCompletionEvidence"), sandbox);
  const exact = sandbox.markShippedCompletionEvidence("27 orders have been marked as shipped", 27, 27, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(exact)), { marked: 27, remaining: 0, exact: true });
  assert.equal(sandbox.markShippedCompletionEvidence("2 orders have been marked as shipped", 2, 2, 2), null);
  const partial = sandbox.markShippedCompletionEvidence("20 orders have been marked as shipped", 27, 27, 7);
  assert.equal(partial.marked, 20);
  assert.equal(partial.exact, false);
  assert.equal(sandbox.markShippedCompletionEvidence("Awaiting shipment", 27, 27, 27), null);
});

test("Mark as Shipped stops before activation and again at eBay Continue", () => {
  const preparation = blockBetween(
    ebaySource,
    "async function runOneMarkShippedBatch()",
    "async function finalizePendingMarkShipped"
  );
  assert.match(preparation, /awaitingActivationApproval:\s*true/);
  assert.match(ebaySource, /phase:\s*"awaiting-activation-approval"/);
  assert.match(ebaySource, /Approve Mark as Shipped/);
  assert.match(preparation, /The confirmation opened, but eBay's final confirmation button was not found/);
  assert.doesNotMatch(preparation, /dispatchFullClick\(continueButton\)|continueButton\.click\(/);
  assert.match(ebaySource, /phase:\s*"awaiting-approval"/);
  assert.match(preparation, /currentMarkShippedSelectionEvidence\(checkbox, ready\.count\)/);
  assert.match(ebaySource, /source:\s*"checked-order-controls"/);
  assert.match(ebaySource, /selectionSource:\s*result\.selectionSource/);
  assert.match(preparation, /resolveMarkShippedConfirmationCount/);
  assert.match(ebaySource, /confirmationCountSource:\s*confirmationSelection\?\.source/);
  assert.match(ebaySource, /Do not click eBay's final confirmation button without approval/);
  assert.match(ebaySource, /monitorPendingMarkShippedApproval/);
  assert.match(preparation, /findMarkShippedDialog\(\{ requireLayout: false \}\)/);
  assert.match(preparation, /findMarkShippedFinalAction\(dialog, \{ requireLayout: false \}\)/);
});

test("background-sized eBay confirmation recovers only to the second approval gate", async () => {
  let saved = null;
  let status = "";
  const dialog = { innerText: "Mark as shipped Are you sure you want to mark this order as shipped? Cancel Continue" };
  const finalAction = { innerText: "Continue", textContent: "Continue" };
  const sandbox = {
    Date,
    U: { normalizeText: (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ") },
    parseAwaitingResultsCount: () => 1,
    findMarkShippedDialog: (options) => options?.requireLayout === false ? dialog : null,
    parseMarkShippedSelectedCount: () => null,
    resolveMarkShippedConfirmationCount: () => ({ count: 1, source: "pre-confirm-selection" }),
    validateMarkShippedConfirmation: () => ({ ok: true }),
    findMarkShippedFinalAction: (_dialog, options) => options?.requireLayout === false ? finalAction : null,
    storageSet: async (value) => { saved = structuredClone(value); },
    renderStatus: (value) => { status = value; }
  };
  vm.runInNewContext(`async ${extractFunction(ebaySource, "recoverPendingMarkShippedFinalApproval")}`, sandbox);

  const recovered = await sandbox.recoverPendingMarkShippedFinalApproval({
    active: true,
    phase: "manual-review-required",
    activationApprovedAt: "2026-07-31T00:00:00.000Z",
    beforeCount: 1,
    selectedCount: 1,
    ownerTabId: 29
  });
  assert.equal(recovered.phase, "awaiting-approval");
  assert.equal(recovered.confirmationActionLabel, "continue");
  assert.equal(saved.pendingMarkShippedRun.phase, "awaiting-approval");
  assert.match(status, /Second approval required - 1 orders selected/);
  assert.doesNotMatch(extractFunction(ebaySource, "recoverPendingMarkShippedFinalApproval"), /\.click\(|dispatchFullClick|dispatchTrusted/);

  const refused = await sandbox.recoverPendingMarkShippedFinalApproval({
    active: true,
    phase: "manual-review-required",
    activationApprovedAt: "2026-07-31T00:00:00.000Z",
    finalActionApprovedAt: "2026-07-31T00:01:00.000Z",
    beforeCount: 1,
    selectedCount: 1
  });
  assert.equal(refused, null);
});

test("approved eBay Continue requests one trusted dispatch and then only monitors", () => {
  const approval = blockBetween(
    ebaySource,
    "async function approveOpenEbayMarkShippedConfirmation(confirmationToken)",
    "function markShippedElementDescriptor(element)"
  );
  assert.match(approval, /pending\.phase !== "awaiting-approval"/);
  assert.match(approval, /selectedCount !== beforeCount/);
  assert.match(approval, /`APPROVE EBAY CONTINUE \$\{selectedCount\}`/);
  assert.match(approval, /phase:\s*"awaiting-result"/);
  assert.match(approval, /finalActionApprovalToken:\s*expectedToken/);
  assert.match(approval, /finalActionClickCount:\s*1/);
  assert.equal((approval.match(/dispatchTrustedEbayMarkShippedContinue/g) || []).length, 1);
  assert.doesNotMatch(approval, /dispatchFullClick\(finalAction\)|finalAction\.click\(/);
  assert.doesNotMatch(approval, /while\s*\(|for\s*\(/);
  assert.match(ebaySource, /No second click was attempted/);
  assert.match(ebaySource, /eBay kept its final confirmation open after the approved click/);
});

test("approved Mark as Shipped activation requests one trusted dispatch", () => {
  const activation = extractFunction(ebaySource, "activateApprovedMarkShipped");
  assert.equal((activation.match(/dispatchTrustedEbayMarkShippedActivation/g) || []).length, 1);
  assert.match(activation, /selectedCount:\s*Number\(state\.selectedCount \|\| 0\)/);
  assert.match(activation, /beforeCount:\s*Number\(state\.beforeCount \|\| 0\)/);
  assert.doesNotMatch(activation, /dispatchFullClick|\.click\(/);
  assert.doesNotMatch(activation, /for\s*\(/);
});

test("trusted Mark as Shipped activation rejects mismatched, stale, and duplicate requests", () => {
  assert.ok(manifest.permissions.includes("debugger"));
  const sandbox = { URL };
  vm.runInNewContext([
    extractFunction(backgroundSource, "isExactAwaitingShipmentUrl"),
    extractFunction(backgroundSource, "validateTrustedMarkShippedActivation")
  ].join("\n"), sandbox);

  const tabId = 29;
  const pending = {
    active: true,
    phase: "activating-approved-action",
    activationApprovedAt: "2026-08-02T00:00:00.000Z",
    ownerTabId: tabId,
    beforeCount: 4,
    selectedCount: 4
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.validateTrustedMarkShippedActivation(pending, { beforeCount: 4, selectedCount: 4 }, tabId))),
    { selectedCount: 4, beforeCount: 4 }
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedActivation(pending, { beforeCount: 3, selectedCount: 3 }, tabId),
    /does not match/
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedActivation(pending, { beforeCount: 4, selectedCount: 4 }, tabId + 1),
    /different tab/
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedActivation({ ...pending, phase: "manual-review-required" }, { beforeCount: 4, selectedCount: 4 }, tabId),
    /not awaiting/
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedActivation({ ...pending, trustedActivationDispatchAt: new Date().toISOString() }, { beforeCount: 4, selectedCount: 4 }, tabId),
    /already received/
  );
});

test("trusted Mark as Shipped activation records one press-release pair and always detaches", async () => {
  const calls = [];
  let stored = {
    pendingMarkShippedRun: {
      active: true,
      phase: "activating-approved-action",
      activationApprovedAt: "2026-08-02T00:00:00.000Z",
      ownerTabId: 29,
      beforeCount: 4,
      selectedCount: 4
    }
  };
  const sandbox = {
    URL,
    Date,
    getTab: async (tabId) => ({ id: tabId, url: "https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT" }),
    storageGet: async () => structuredClone(stored),
    storageSet: async (value) => {
      calls.push({ type: "storageSet", value: structuredClone(value) });
      stored = structuredClone(value);
    },
    debuggerAttach: async (target) => calls.push({ type: "attach", target }),
    debuggerDetach: async (target) => calls.push({ type: "detach", target }),
    debuggerCommand: async (_target, method, params) => {
      calls.push({ type: method, params: structuredClone(params) });
      if (method === "Runtime.evaluate") {
        return { result: { value: { ok: true, x: 140, y: 260, id: "mark-shipped", label: "mark as shipped" } } };
      }
      return {};
    },
    buildMarkShippedActivationTargetProbe: () => "probe()"
  };
  vm.runInNewContext([
    extractFunction(backgroundSource, "isExactAwaitingShipmentUrl"),
    extractFunction(backgroundSource, "validateTrustedMarkShippedActivation"),
    `async ${extractFunction(backgroundSource, "dispatchTrustedEbayMarkShippedActivation")}`
  ].join("\n"), sandbox);

  const result = await sandbox.dispatchTrustedEbayMarkShippedActivation(
    { beforeCount: 4, selectedCount: 4 },
    { tab: { id: 29, url: "https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT" } }
  );
  assert.equal(result.ok, true);
  assert.equal(result.selectedCount, 4);
  const mouse = calls.filter((call) => call.type === "Input.dispatchMouseEvent");
  assert.deepEqual(mouse.map((call) => call.params.type), ["mousePressed", "mouseReleased"]);
  const dispatchStorageIndex = calls.findIndex((call) => call.type === "storageSet" && call.value.pendingMarkShippedRun.trustedActivationDispatchAt);
  const pressIndex = calls.findIndex((call) => call.type === "Input.dispatchMouseEvent" && call.params.type === "mousePressed");
  const releaseIndex = calls.findIndex((call) => call.type === "Input.dispatchMouseEvent" && call.params.type === "mouseReleased");
  const detachIndex = calls.findIndex((call) => call.type === "detach");
  assert.ok(dispatchStorageIndex >= 0 && dispatchStorageIndex < pressIndex);
  assert.ok(pressIndex < releaseIndex && releaseIndex < detachIndex);
  assert.ok(stored.pendingMarkShippedRun.trustedActivationReleasedAt);
  await assert.rejects(
    () => sandbox.dispatchTrustedEbayMarkShippedActivation(
      { beforeCount: 4, selectedCount: 4 },
      { tab: { id: 29, url: "https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT" } }
    ),
    /already received/
  );
  assert.equal(calls.filter((call) => call.type === "Input.dispatchMouseEvent").length, 2);
});

test("trusted Mark as Shipped activation probes one exact hit-tested menu action", () => {
  const probe = extractFunction(backgroundSource, "buildMarkShippedActivationTargetProbe");
  assert.match(probe, /matches\.length !== 1/);
  assert.match(probe, /mark as shipped/);
  assert.match(probe, /document\.elementFromPoint/);
  assert.match(probe, /not the hit-tested target/);
  assert.match(backgroundSource, /dispatchTrustedEbayMarkShippedActivation\(message, sender\)/);
});

test("trusted eBay Continue rejects mismatched, stale, and duplicate approvals", () => {
  assert.ok(manifest.permissions.includes("debugger"));
  const sandbox = { URL };
  vm.runInNewContext([
    extractFunction(backgroundSource, "isExactAwaitingShipmentUrl"),
    extractFunction(backgroundSource, "validateTrustedMarkShippedDispatch")
  ].join("\n"), sandbox);

  const tabId = 29;
  const pending = {
    active: true,
    phase: "awaiting-result",
    ownerTabId: tabId,
    beforeCount: 3,
    selectedCount: 3,
    confirmationActionLabel: "continue",
    finalActionClickCount: 1,
    finalActionApprovalToken: "APPROVE EBAY CONTINUE 3"
  };
  assert.equal(
    sandbox.isExactAwaitingShipmentUrl("https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT"),
    true
  );
  assert.equal(sandbox.isExactAwaitingShipmentUrl("https://www.ebay.com/sh/ord/?filter=status%3APAID_SHIPPED"), false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.validateTrustedMarkShippedDispatch(pending, { beforeCount: 3, selectedCount: 3 }, tabId))),
    { selectedCount: 3, beforeCount: 3, actionLabel: "continue" }
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedDispatch(pending, { beforeCount: 2, selectedCount: 2 }, tabId),
    /does not match/
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedDispatch(pending, { beforeCount: 3, selectedCount: 3 }, tabId + 1),
    /different tab/
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedDispatch({ ...pending, finalActionApprovalToken: "" }, { beforeCount: 3, selectedCount: 3 }, tabId),
    /approval token/
  );
  assert.throws(
    () => sandbox.validateTrustedMarkShippedDispatch({ ...pending, trustedFinalActionDispatchAt: new Date().toISOString() }, { beforeCount: 3, selectedCount: 3 }, tabId),
    /already received/
  );
});

test("trusted eBay Continue records before exactly one press-release pair and always detaches", async () => {
  const calls = [];
  let stored = {
    pendingMarkShippedRun: {
      active: true,
      phase: "awaiting-result",
      ownerTabId: 29,
      beforeCount: 1,
      selectedCount: 1,
      confirmationActionLabel: "continue",
      finalActionClickCount: 1,
      finalActionApprovalToken: "APPROVE EBAY CONTINUE 1"
    }
  };
  const sandbox = {
    URL,
    Date,
    getTab: async (tabId) => ({ id: tabId, url: "https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT" }),
    storageGet: async () => structuredClone(stored),
    storageSet: async (value) => {
      calls.push({ type: "storageSet", value: structuredClone(value) });
      stored = structuredClone(value);
    },
    debuggerAttach: async (target) => calls.push({ type: "attach", target }),
    debuggerDetach: async (target) => calls.push({ type: "detach", target }),
    debuggerCommand: async (_target, method, params) => {
      calls.push({ type: method, params: structuredClone(params) });
      if (method === "Runtime.evaluate") {
        return { result: { value: { ok: true, x: 120, y: 240, id: "gen-dialog-ok", label: "continue" } } };
      }
      return {};
    },
    buildMarkShippedTargetProbe: () => "probe()"
  };
  vm.runInNewContext([
    extractFunction(backgroundSource, "isExactAwaitingShipmentUrl"),
    extractFunction(backgroundSource, "validateTrustedMarkShippedDispatch"),
    `async ${extractFunction(backgroundSource, "dispatchTrustedEbayMarkShippedContinue")}`
  ].join("\n"), sandbox);

  const result = await sandbox.dispatchTrustedEbayMarkShippedContinue(
    { beforeCount: 1, selectedCount: 1 },
    { tab: { id: 29, url: "https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT" } }
  );
  assert.equal(result.ok, true);
  const mouse = calls.filter((call) => call.type === "Input.dispatchMouseEvent");
  assert.deepEqual(mouse.map((call) => call.params.type), ["mousePressed", "mouseReleased"]);
  const dispatchStorageIndex = calls.findIndex((call) => call.type === "storageSet" && call.value.pendingMarkShippedRun.trustedFinalActionDispatchAt);
  const pressIndex = calls.findIndex((call) => call.type === "Input.dispatchMouseEvent" && call.params.type === "mousePressed");
  const releaseIndex = calls.findIndex((call) => call.type === "Input.dispatchMouseEvent" && call.params.type === "mouseReleased");
  const detachIndex = calls.findIndex((call) => call.type === "detach");
  assert.ok(dispatchStorageIndex >= 0 && dispatchStorageIndex < pressIndex);
  assert.ok(pressIndex < releaseIndex && releaseIndex < detachIndex);
  assert.ok(stored.pendingMarkShippedRun.trustedFinalActionReleasedAt);
  await assert.rejects(
    () => sandbox.dispatchTrustedEbayMarkShippedContinue(
      { beforeCount: 1, selectedCount: 1 },
      { tab: { id: 29, url: "https://www.ebay.com/sh/ord/?filter=status%3AAWAITING_SHIPMENT" } }
    ),
    /already received/
  );
  assert.equal(calls.filter((call) => call.type === "Input.dispatchMouseEvent").length, 2);
});

test("trusted eBay Continue probes one exact hit-tested confirmation target", () => {
  const probe = extractFunction(backgroundSource, "buildMarkShippedTargetProbe");
  assert.match(probe, /matches\.length !== 1/);
  assert.match(probe, /button\.closest\(dialogSelector\)/);
  assert.match(probe, /mentionsMarkingShipped/);
  assert.match(probe, /document\.elementFromPoint/);
  assert.match(probe, /reviewed eBay final action is not the hit-tested target/);
});

test("Mark as Shipped temporarily uncovers eBay and restores the review after activation failure", () => {
  const approval = blockBetween(
    ebaySource,
    "function showMarkShippedActivationApproval(state)",
    "async function finalizePendingMarkShipped"
  );
  const preflightIndex = approval.indexOf("const approvedLabel = await ensureMarkShippedMenuForApproval(current)");
  const hideIndex = approval.indexOf('overlay.style.display = "none"', preflightIndex);
  const activateIndex = approval.indexOf("activateApprovedMarkShipped(current, approvedLabel)", hideIndex);
  const successRemoveIndex = approval.indexOf("overlay.remove()", activateIndex);
  const restoreIndex = approval.indexOf('overlay.style.display = "flex"', successRemoveIndex);
  assert.ok(preflightIndex >= 0, "approval preflight is missing");
  assert.ok(hideIndex > preflightIndex, "the review must remain visible through the final preflight");
  assert.ok(activateIndex > hideIndex, "the GLDN review must uncover eBay before activating it");
  assert.ok(successRemoveIndex > activateIndex, "the review must be removed only after eBay responds");
  assert.ok(restoreIndex > successRemoveIndex, "a failed activation must restore the approval review");
  assert.match(approval, /activationBusy/);
  assert.match(approval, /aria-busy/);
  const activation = extractFunction(ebaySource, "activateApprovedMarkShipped");
  assert.match(activation, /dispatchTrustedEbayMarkShippedActivation/);
  assert.doesNotMatch(activation, /dispatchFullClick|\.click\(/);
  assert.match(ebaySource, /function markShippedActivationTargets\(label\)/);
  assert.match(ebaySource, /function findMarkShippedMenuAction\(\)/);
  assert.match(ebaySource, /element\.closest\('\[id\^="gldn-"\], \.gldn-order-panel, \.gldn-modal-backdrop'\)/);
  assert.match(ebaySource, /U\.waitFor\(findMarkShippedMenuAction/);
  assert.doesNotMatch(ebaySource, /findExactVisible\("Mark as shipped"\)/);
  assert.match(ebaySource, /const hit = document\.elementFromPoint/);
  assert.match(activation, /if \(!findMarkShippedMenuAction\(\)\) return waitForMarkShippedActivationOutcome\(state, 8000\)/);
});

test("successful Mark as Shipped syncs exact counts and checks only its matching Tasks row", () => {
  assert.equal(dashboardSources[1], dashboardSources[0]);
  assert.equal(dashboardSources[2], dashboardSources[0]);
  const source = dashboardSources[0];
  assert.match(source, /'Awaiting Before', 'Selected', 'Remaining'/);
  assert.match(source, /beforeCount:\s*optionalNumber_\(input\.beforeCount\)/);
  assert.match(source, /selectedCount:\s*optionalNumber_\(input\.selectedCount\)/);
  assert.match(source, /remainingCount:\s*optionalNumber_\(input\.remainingCount\)/);
  assert.match(source, /findTaskRowByStartsWith_\(sheet, 'Mark All New Orders as Shipped'\)/);
  assert.match(source, /\^\(completed\|no awaiting orders\)\$/i);
  assert.match(source, /'Marked shipped: ' \+ Number\(record\.markedCount \|\| 0\)/);
  assert.match(source, /taskChecked:\s*task\.checked/);
});
