const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sources = [
  "dashboard/GLDN_Ops_Dashboard_Code.gs",
  "extension/dashboard_apps_script/Code.gs"
].map((file) => ({ file, text: fs.readFileSync(path.join(root, file), "utf8") }));

test("dashboard Apps Script copies stay identical", () => {
  assert.equal(sources[1].text, sources[0].text);
});

test("seller metrics use row-safe task-label lookup", () => {
  const source = sources[0].text;
  const sandbox = {};
  vm.runInNewContext(`${source}\nthis.findTaskRowByStartsWith = findTaskRowByStartsWith_;`, sandbox);
  const labels = [
    ["Check Performance of Each Store and Check Late Shipment Rate"],
    ["Transaction Defect Rate | Notify if Above Agreed Limit:"],
    ["Late Shipment Rate | Must be Below 3%:"],
    ["Tracking Uploaded On Time & Validated:"],
    ["Cases Closed without seller Resolution | Notify if Above 0%:"]
  ];
  const sheet = {
    getLastRow: () => labels.length,
    getRange: () => ({ getDisplayValues: () => labels })
  };

  assert.equal(sandbox.findTaskRowByStartsWith(sheet, "Late Shipment Rate"), 3);
  assert.equal(sandbox.findTaskRowByStartsWith(sheet, "Transaction Defect Rate"), 2);
  assert.equal(sandbox.findTaskRowByStartsWith(sheet, "Tracking Uploaded On Time"), 4);
  assert.equal(sandbox.findTaskRowByStartsWith(sheet, "Cases Closed without seller Resolution"), 5);

  const metricLookups = source.match(/findTaskRowByStartsWith_\(sheet, '(?:Transaction Defect Rate|Late Shipment Rate|Tracking Uploaded On Time|Cases Closed without seller Resolution)'\)/g) || [];
  assert.ok(metricLookups.length >= 8 && metricLookups.length % 4 === 0);
});

test("seller dashboard and history metric cells use percentage formatting", () => {
  assert.match(
    sources[0].text,
    /getRange\(row, 5 \+ offset, 1, 4\)\.setNumberFormat\('0\.00%'\)/
  );
});
