const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const ebaySource = fs.readFileSync(path.join(root, "extension/ebay.js"), "utf8");
const dashboardFiles = [
  "dashboard/GLDN_Ops_Dashboard_Code.gs",
  "extension/dashboard_apps_script/Code.gs"
];
const dashboardSources = dashboardFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8"));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf("{", start);
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
  const sandbox = {};
  vm.runInNewContext([
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

test("Mark as Shipped requires approval before activation and again at eBay Continue", () => {
  const preparation = blockBetween(
    ebaySource,
    "async function runOneMarkShippedBatch()",
    "async function finalizePendingMarkShipped"
  );
  const selectionOnly = extractFunction(ebaySource, "runOneMarkShippedBatch");
  assert.match(preparation, /awaitingActivationApproval:\s*true/);
  assert.doesNotMatch(selectionOnly, /dispatchFullClick\(target, label\)/);
  assert.match(ebaySource, /phase:\s*"awaiting-activation-approval"/);
  assert.match(ebaySource, /Approve Mark as Shipped/);
  assert.match(ebaySource, /No eBay order has been changed by this run yet/);
  assert.match(ebaySource, /activationApprovedAt/);
  assert.match(ebaySource, /dispatchFullClick\(target, label\)/);
  assert.doesNotMatch(ebaySource, /for \(const clickTarget of clickTargets\)/);
  assert.match(ebaySource, /phase:\s*"manual-review-required"/);
  assert.match(ebaySource, /result\.pendingMarkShippedRun\.phase === "prepare" && isAwaitingShipmentPage\(\)/);
  assert.match(ebaySource, /reconcileApprovedMarkShippedActivation/);
  assert.match(ebaySource, /The confirmation opened, but the Continue button was not found/);
  assert.doesNotMatch(preparation, /dispatchFullClick\(continueButton\)|continueButton\.click\(/);
  assert.match(ebaySource, /phase:\s*"awaiting-approval"/);
  assert.match(preparation, /currentMarkShippedSelectionEvidence\(checkbox, ready\.count\)/);
  assert.match(ebaySource, /source:\s*"checked-order-controls"/);
  assert.match(ebaySource, /selectionSource:\s*result\.selectionSource/);
  assert.match(preparation, /resolveMarkShippedConfirmationCount/);
  assert.match(ebaySource, /confirmationCountSource:\s*confirmationSelection\?\.source/);
  assert.match(ebaySource, /Do not click Continue without approval/);
  assert.match(ebaySource, /monitorPendingMarkShippedApproval/);
});

test("successful Mark as Shipped syncs exact counts and checks only its matching Tasks row", () => {
  assert.equal(dashboardSources[1], dashboardSources[0]);
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
