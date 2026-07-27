const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const ebay = fs.readFileSync(path.join(root, "extension", "ebay.js"), "utf8");

test("F-09 probe is explicit, eBay-only, queue-safe, and zero-action", () => {
  assert.match(background, /async function runDashboardQueueProbe\(sender\)/);
  assert.match(background, /F-09 dashboard queue probe is allowed only on an eBay page/);
  assert.match(background, /baselineQueue\.length/);
  assert.match(background, /Existing records were left untouched/);
  assert.match(background, /forceTimeoutProbe: true/);
  assert.match(background, /enqueueDashboardSync\('ping', record/);
  assert.match(background, /afterDuplicate\.length === 1/);
  assert.match(background, /duplicate\?\.attempts === 2/);
  assert.match(background, /processDashboardQueue\(\{ force: true \}\)/);
  assert.match(background, /finalQueue\.length === 0/);
  assert.match(background, /marketplaceActions: 0/);
  assert.match(background, /dashboardMutations: 0/);
});

test("F-09 live launcher requires the explicit confirmation token", () => {
  assert.match(ebay, /gldnF09Probe/);
  assert.match(ebay, /gldnF09Confirm/);
  assert.match(ebay, /confirm: "F09_QUEUE_TIMEOUT_RETRY"/);
  assert.match(background, /message\.confirm !== 'F09_QUEUE_TIMEOUT_RETRY'/);
  assert.match(ebay, /no marketplace action ran/);
});
