const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("extension/profit-progress.html");
const source = read("extension/profit-progress.js");
const background = read("extension/background.js");
const popup = read("extension/popup.html");
const popupSource = read("extension/popup.js");
const poshmark = read("extension/poshmark.js");

test("profit runs expose one durable live progress page", () => {
  assert.match(html, /Profit Run Progress/);
  for (const id of ["resumeRun", "pauseRun", "openWorker", "openReview", "resetRun", "openMonthlySheet", "openSharedSheet"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(source, /type: "getPoshmarkProfitBackfill"/);
  assert.match(source, /changes\.poshmarkProfitBackfill/);
  assert.match(source, /setInterval\(refresh, POLL_INTERVAL_MS\)/);
  assert.doesNotMatch(source, /startPoshmarkProfitBackfill/);
});

test("Amazon search and detail remain one progress stage", () => {
  assert.match(source, /"amazon-search": 2/);
  assert.match(source, /"amazon-detail": 2/);
  assert.match(source, /setStage\("stageAmazon", stateFor\(2\)/);
  assert.match(source, /setStage\("stageReview", stateFor\(3\)/);
});

test("start and resume reuse the same progress tab", () => {
  assert.match(background, /openProfitProgressAfter\(startPoshmarkProfitBackfillGuarded/);
  assert.match(background, /openProfitProgressAfter\(PROFIT_BACKFILL_BACKGROUND\.resume/);
  assert.match(background, /openOrFocusExtensionPage\('profit-progress\.html', true\)/);
  assert.match(background, /message\.reuse === true/);
  assert.match(popup, /id="openProfitProgress"/);
  assert.match(popupSource, /page: 'profit-progress\.html', reuse: true/);
  assert.match(poshmark, /data-action="progress"/);
  assert.match(poshmark, /page: "profit-progress\.html", reuse: true/);
});

test("the real workbook opens only after a confirmed non-queued sync", () => {
  assert.match(background, /async function syncPoshmarkProfitAndOpenWorkbook/);
  assert.match(background, /if \(!result\?\.ok \|\| result\.queued\) return result/);
  assert.match(background, /result\.state\?\.scope === 'resolve-ebay'/);
  assert.match(background, /SHARED_PROFIT_WORKBOOK_ID/);
  assert.match(background, /POSHMARK_PROFIT_WORKBOOK_ID/);
  assert.match(source, /1PV4Fpnjjd5tNwdwmqLDbi-RLBbIqMq94Gxj0YU4AOl4/);
  assert.match(source, /1z3ouzNopLpiT3icJyhzLf3AkCO7I2thV1mQWnIEdIx8/);
});
