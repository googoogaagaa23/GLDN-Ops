const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));
const source = fs.readFileSync(path.join(root, "extension", "universal.js"), "utf8");
const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

test("ordinary HTTP pages receive one lightweight universal launcher", () => {
  const entry = manifest.content_scripts.find((item) => item.js.includes("universal.js"));
  assert.ok(entry);
  assert.deepEqual(entry.js, [
    "config.example.js",
    "theme-catalog.js",
    "foundation.js",
    "shared.js",
    "control-heartbeat.js",
    "universal.js"
  ]);
  assert.deepEqual(entry.matches, ["http://*/*", "https://*/*"]);
  assert.notEqual(entry.all_frames, true);
  assert.match(source, /panel\.id = ['"]gldn-universal-panel['"]/);
  assert.match(source, /gldnUniversalPanelPosition/);
});

test("universal launcher exposes docs, onboarding, dashboard, and reload without marketplace actions", () => {
  for (const action of ["dashboard", "tour", "guide", "reload"]) {
    assert.match(source, new RegExp(`data-action=["']${action}["']`));
  }
  assert.doesNotMatch(source, /submit|mark.*shipped|move99|place.*order/i);
  assert.match(background, /message\.type === 'openExtensionPage'/);
  assert.match(background, /'guide\.html', 'onboarding\.html', 'popup\.html'/);
});
