const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dashboardFiles = [
  "dashboard/GLDN_Ops_Dashboard_Code.gs",
  "extension/dashboard_apps_script/Code.gs"
];
const dashboardSources = dashboardFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8"));
const ebaySource = fs.readFileSync(path.join(root, "extension/ebay.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(root, "extension/background.js"), "utf8");

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

test("dashboard Apps Script copies stay identical", () => {
  assert.equal(dashboardSources[0], dashboardSources[1]);
});

test("only exact Move .99 zero-remaining proof earns the task checkbox", () => {
  const sandbox = {};
  vm.runInNewContext(
    `${dashboardSources[0]}\nthis.taskCompletionProof = taskCompletionProof_;`,
    sandbox,
    { timeout: 5000 }
  );
  const exact = {
    featureKey: "move99",
    status: "Completed",
    scanMode: "price99",
    proofType: "final-zero-scan",
    verifiedZeroRemaining: true,
    remainingCount: 0,
    failedCount: 0
  };
  assert.equal(sandbox.taskCompletionProof(exact).ok, true);
  for (const rejected of [
    { ...exact, featureKey: "second-round" },
    { ...exact, featureKey: "bulk-listing" },
    { ...exact, featureKey: "sniping" },
    { ...exact, status: "Review ready" },
    { ...exact, scanMode: "non99" },
    { ...exact, proofType: "batch-submitted" },
    { ...exact, verifiedZeroRemaining: false },
    { ...exact, remainingCount: 1 },
    { ...exact, failedCount: 1 }
  ]) {
    assert.equal(sandbox.taskCompletionProof(rejected).ok, false);
  }
});

test("Move .99 emits completion sync only for exact final proof", () => {
  const sandbox = {};
  vm.runInNewContext(extractFunction(ebaySource, "move99TaskCompletionRecord"), sandbox);
  const exact = {
    computerLabel: "0",
    ebayAccountLabel: "FAK12",
    status: "Completed",
    scanMode: "price99",
    proofType: "final-zero-scan",
    verifiedZeroRemaining: true,
    remainingCount: 0,
    failedCount: 0,
    scannedRows: 288,
    completedAt: "2026-07-21T12:00:00.000Z",
    pageUrl: "https://www.ebay.com/sh/lst/active"
  };
  const completion = sandbox.move99TaskCompletionRecord(exact);
  assert.equal(completion.featureKey, "move99");
  assert.equal(completion.scannedCount, 288);
  assert.equal(sandbox.move99TaskCompletionRecord({ ...exact, remainingCount: 1 }), null);
  assert.equal(sandbox.move99TaskCompletionRecord({ ...exact, failedCount: 1 }), null);
  assert.equal(sandbox.move99TaskCompletionRecord({ ...exact, scanMode: "non99" }), null);
  assert.match(ebaySource, /type: "syncTaskCompletion", record: completion/);
  assert.match(backgroundSource, /message\.type === 'syncTaskCompletion'/);
  assert.match(backgroundSource, /handleSync\('taskCompletion'/);
});

test("task completion writes are idempotent and probe cleanup is zero-action", () => {
  const source = dashboardSources[0];
  assert.match(source, /writeActions = \[[^\]]*'taskCompletion'/);
  assert.match(source, /action === 'tasksCompletionBoundaryProbe'/);
  assert.match(source, /confirm\) !== 'T06_TEMP_SHEET_PROBE'/);
  assert.match(source, /rejectedCount !== rejected\.length/);
  assert.match(source, /marketplaceActions: 0/);
  assert.match(source, /finally \{\s*if \(sheet\) ss\.deleteSheet\(sheet\)/);
  assert.doesNotMatch(source.match(/const TASK_COMPLETION_RULES = Object\.freeze\([\s\S]*?\n\}\);/)?.[0] || "", /second-round|bulk-listing|sniping/i);
});
