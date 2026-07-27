const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "extension/popup.html"), "utf8");
const js = fs.readFileSync(path.join(root, "extension/popup.js"), "utf8");

test("advanced popup is organized into persistent workflow, status, and settings tabs", () => {
  for (const tab of ["workflows", "status", "settings"]) {
    assert.match(html, new RegExp(`data-popup-tab="${tab}"`));
    assert.match(html, new RegExp(`data-popup-section="${tab}"`));
  }
  assert.match(js, /const POPUP_TAB_KEY = 'gldnPopupTab'/);
  assert.match(js, /function activatePopupTab\(value, \{ persist = true \} = \{\}\)/);
  assert.match(js, /chrome\.storage\.local\.set\(\{ \[POPUP_TAB_KEY\]: selected \}\)/);
  assert.match(js, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(js, /activatePopupTab\(result\[POPUP_TAB_KEY\], \{ persist: false \}\)/);
});

test("all advanced controls remain reachable and the duplicate inline guide is hidden", () => {
  for (const id of [
    "reloadExtension",
    "updateExtension",
    "rollbackExtension",
    "openFeatureGuide",
    "openFeatureTour",
    "startSnipingWorkflow",
    "refreshEcomSniperMonitor",
    "openMove99Workflow",
    "openNon99Workflow",
    "saveMove99Categories",
    "runHealthCheck",
    "copyDiagnosticReport",
    "copyErrorLog",
    "clearErrorLog",
    "copySettingsBackup",
    "restoreSettingsBackup",
    "testDashboard",
    "openDashboard"
  ]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} must appear once`);
    assert.match(js, new RegExp(`getElementById\\('${id}'\\)\\.addEventListener`));
  }
  assert.match(html, /<section class="section" hidden aria-hidden="true">\s*<h2>Feature guide<\/h2>/);
  assert.equal((html.match(/id="status"/g) || []).length, 1);
});

test("popup copy reflects the verified local updater model", () => {
  assert.doesNotMatch(html, /Web Store|manual mode/i);
  assert.match(html, /Update &amp; Reload/);
  assert.match(html, /Reload Current Files/);
  assert.match(js, /latest stable GLDN Ops release/);
  assert.match(html, /EcomSniper owns Scanner, Product Hunter, Bulk Poster/);
  assert.match(html, /Handoff monitor/);
  assert.match(js, /Internal EcomSniper progress is unknown/);
  assert.doesNotMatch(html, /Start Bulk Listing Workflow/);
  assert.doesNotMatch(js, /pendingAmazonBulkWorkflowStart:\s*\{\s*active:\s*true/);
  assert.match(js, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(html, /html\[data-theme="graphite"\]/);
  assert.match(html, /html\[data-theme="signal"\]/);
  assert.match(html, /html\[data-theme="midnight"\]/);
  assert.match(html, /html\[data-theme="crimson"\]/);
});

test("every popup button has an interaction path", () => {
  const ids = [...html.matchAll(/<button[^>]*id="([^"]+)"/g)].map((match) => match[1]);
  const missing = ids.filter((id) => !new RegExp(`getElementById\\('${id}'\\)\\.addEventListener`).test(js));
  assert.deepEqual(missing, []);
});

test("saved marketplace history is escaped before popup HTML rendering", () => {
  assert.match(js, /rows\.innerHTML = values\.map\(\(\[label, value\]\) => `<div class="row"><span>\$\{escapeHtml\(label\)\}<\/span><span class="value">\$\{escapeHtml\(value\)\}<\/span><\/div>`\)/);
  assert.match(js, /<span>\$\{escapeHtml\(label\)\}<\/span><span class="value \$\{critical \? 'critical' : ''\}">\$\{escapeHtml\(value\)\}<\/span>/);
  assert.match(js, /<span>\$\{escapeHtml\(label\)\}<\/span><span class="value \$\{statusClass\(state\)\}">\$\{escapeHtml\(value\)\}<\/span>/);
});
