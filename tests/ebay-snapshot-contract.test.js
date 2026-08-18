const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const ebaySource = fs.readFileSync(path.join(root, "extension/ebay.js"), "utf8");
const dashboardFiles = [
  "apps-script-live/Code.js",
  "dashboard/GLDN_Ops_Dashboard_Code.gs",
  "extension/dashboard_apps_script/Code.gs"
];
const dashboardSources = dashboardFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8"));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function snapshotSandbox() {
  const sandbox = {};
  vm.runInNewContext([
    extractFunction(ebaySource, "parseDashboardNumber"),
    extractFunction(ebaySource, "normalizeSnapshotText"),
    extractFunction(ebaySource, "snapshotLines"),
    extractFunction(ebaySource, "findSnapshotMetric"),
    extractFunction(ebaySource, "findSnapshotPercentChange"),
    extractFunction(ebaySource, "findSnapshotFeedbackCount")
  ].join("\n"), sandbox);
  return sandbox;
}

test("Seller Hub Sales card parser keeps the visible decline direction", () => {
  const parser = snapshotSandbox();
  const sales = `
    Sales
    $0
    $500
    $1,000
    Today
    Sales for today are $10.87.
    $10.87
    Last 7 days
    Sales for the last 7 days are $1,029.39.
    Last 31 days
    Sales for the last 31 days are $7,134.87.
    9.6%
    Down
    Last 90 days
    Sales for the last 90 days are $21,401.74.
  `;
  assert.equal(parser.findSnapshotMetric(sales, "Today", { moneyOnly: true }), 10.87);
  assert.equal(parser.findSnapshotMetric(sales, "Last 7 days", { moneyOnly: true }), 1029.39);
  assert.equal(parser.findSnapshotMetric(sales, "Last 31 days", { moneyOnly: true }), 7134.87);
  assert.equal(parser.findSnapshotPercentChange(sales, "Last 31 days"), -9.6);
  assert.equal(parser.findSnapshotMetric(sales, "Last 90 days", { moneyOnly: true }), 21401.74);
});

test("Seller Hub Feedback card parser handles counts joined to labels", () => {
  const parser = snapshotSandbox();
  const feedback = `
    Feedback
    (2,513 is your feedback score with 99.7% positive feedback)
    Last 30 days
    261Positive
    Feedback
    3Neutral
    Feedback
    0Negative
    Feedback
  `;
  assert.equal(parser.findSnapshotFeedbackCount(feedback, "Positive"), 261);
  assert.equal(parser.findSnapshotFeedbackCount(feedback, "Neutral"), 3);
  assert.equal(parser.findSnapshotFeedbackCount(feedback, "Negative"), 0);
});

test("Seller Hub Traffic and Advertising stay scoped to their cards", () => {
  const parser = snapshotSandbox();
  const traffic = `
    Traffic
    Listing impressions
    4,744,767
    18.8%
    Down
    Listing page views
    22,800
    1.9%
    Down
    Data for Jun 15 - Jul 15 at 12:46pm PDT.
  `;
  const advertising = `
    Advertising NEW
    All campaigns
    (Past 7 days)
    Clicks
    706
    10.86%
    Negative
    Ad sales
    $721.28
    30.12%
    Negative
    ROAS
    19.55
    70.24%
    Positive
  `;
  assert.equal(parser.findSnapshotMetric(traffic, "Listing impressions", { integerOnly: true }), 4744767);
  assert.equal(parser.findSnapshotMetric(traffic, "Listing page views", { integerOnly: true }), 22800);
  assert.equal(parser.findSnapshotMetric(advertising, "Clicks", { integerOnly: true }), 706);
  assert.equal(parser.findSnapshotMetric(advertising, "Ad sales", { moneyOnly: true }), 721.28);
  assert.equal(parser.findSnapshotMetric(advertising, "ROAS", { numberOnly: true }), 19.55);
});

test("snapshot sync keeps all Apps Script copies aligned and persists visible ad metrics", () => {
  assert.equal(dashboardSources[1], dashboardSources[0]);
  assert.equal(dashboardSources[2], dashboardSources[0]);
  const source = dashboardSources[0];
  assert.match(source, /'Last Checked', 'Source', 'Advertising Clicks', 'Advertising ROAS'/);
  assert.match(source, /advertisingClicks: optionalNumber_\(input\.advertisingClicks\)/);
  assert.match(source, /advertisingRoas: optionalNumber_\(input\.advertisingRoas\)/);
  const saveEbaySnapshot = extractFunction(source, "saveEbaySnapshot_");
  const savePoshmarkStats = extractFunction(source, "savePoshmarkStats_");
  assert.match(saveEbaySnapshot, /numberOrBlank_\(record\.advertisingClicks\)/);
  assert.match(saveEbaySnapshot, /numberOrBlank_\(record\.advertisingRoas\)/);
  assert.doesNotMatch(savePoshmarkStats, /advertisingClicks|advertisingRoas/);
  assert.match(source, /\['Ad clicks', snapshot\['Advertising Clicks'\]\]/);
  assert.match(source, /\['ROAS', snapshot\['Advertising ROAS'\]\]/);
  assert.match(ebaySource, /\["Advertising clicks", plain\(record\.advertisingClicks\)\]/);
  assert.match(ebaySource, /\["Advertising ROAS", plain\(record\.advertisingRoas\)\]/);
  assert.match(ebaySource, /waitForSellerHubSnapshotCards\(\)/);
  assert.match(ebaySource, /retryCount < 1/);
  assert.match(ebaySource, /location\.reload\(\)/);
  assert.match(ebaySource, /Review partial snapshot - Seller Hub still omitted/);
});
