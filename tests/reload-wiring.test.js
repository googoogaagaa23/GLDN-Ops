const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("in-extension reload survives the old content-script context", () => {
  const root = path.resolve(__dirname, "..");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const poshmark = fs.readFileSync(path.join(root, "extension", "poshmark.js"), "utf8");
  const amazon = fs.readFileSync(path.join(root, "extension", "amazon.js"), "utf8");
  const ebay = fs.readFileSync(path.join(root, "extension", "ebay.js"), "utf8");
  const popupHtml = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
  const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");

  assert.match(background, /pending:\s*true/);
  assert.match(background, /resumeExtensionReloadRequest/);
  assert.match(background, /chrome\.tabs\.reload/);
  assert.match(background, /reloadScope:\s*'requesting-tab-only'/);
  assert.doesNotMatch(background, /MARKETPLACE_TAB_PATTERNS/);
  assert.doesNotMatch(poshmark, /setTimeout\(\(\) => location\.reload\(\), 2500\)/);
  assert.doesNotMatch(amazon, /setTimeout\(\(\) => location\.reload\(\), 2500\)/);
  assert.doesNotMatch(ebay, /setTimeout\(\(\) => location\.reload\(\), 2500\)/);
  assert.match(popupHtml, /id="updateExtension"[^>]*>Update &amp; Reload<\/button>/);
  assert.match(popupHtml, /id="reloadExtension"[^>]*>Reload Current Files<\/button>/);
  assert.match(popupJs, /getElementById\('reloadExtension'\)\.addEventListener\('click'/);
  assert.match(popupJs, /getElementById\('updateExtension'\)\.addEventListener\('click'/);
  assert.match(popupJs, /type:\s*'reloadExtension'/);
  assert.match(popupJs, /type:\s*'updateExtension'/);
  assert.match(popupJs, /sourceTabId:\s*activeTab\?\.id/);
});
