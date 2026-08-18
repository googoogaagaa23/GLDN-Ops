const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const shared = fs.readFileSync(path.join(root, "extension", "shared.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "extension", "styles.css"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "extension", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
const themeCatalog = fs.readFileSync(path.join(root, "extension", "theme-catalog.js"), "utf8");
const poshmark = fs.readFileSync(path.join(root, "extension", "poshmark.js"), "utf8");

test("minimized panels restore mode and position in one coordinated read", () => {
  assert.match(shared, /chrome\.storage\.local\.get\(\[\s*storageKey,\s*modeStorageKey,\s*sizeStorageKey,/);
  assert.match(shared, /setPanelMode\(result\?\.\[modeStorageKey\] \|\| "full", false\)/);
  assert.match(styles, /\.gldn-panel-minimized\s*\{[\s\S]*?left: auto !important;[\s\S]*?top: 38% !important;[\s\S]*?right: 0 !important;/);
});

test("floating panels expose functional settings and persisted resize controls", () => {
  assert.match(shared, /data-gldn-settings-toggle/);
  assert.match(shared, /data-gldn-theme-select/);
  assert.match(shared, /data-gldn-opacity-input/);
  assert.match(shared, /data-gldn-reset-layout/);
  assert.match(shared, /className = "gldn-panel-resize-handle"/);
  assert.match(shared, /chrome\.storage\.local\.set\(\{ \[sizeStorageKey\]: savedSize \}\)/);
  assert.match(styles, /\.gldn-order-panel \.gldn-panel-resize-handle/);
});

test("all supported themes are available in the panel and popup", () => {
  assert.match(shared, /GLDN_THEME_CATALOG\?\.populateSelect\(themeSelect\)/);
  assert.match(popupJs, /GLDN_THEME_CATALOG\?\.ids/);
  assert.match(popupHtml, /<select id="uiTheme"><\/select>/);
  assert.match(themeCatalog, /'Limited Editions'/);
  assert.match(themeCatalog, /'Retired Editions'/);
  assert.match(styles, /html\[data-gldn-theme-ready="true"\] \.gldn-order-panel/);
});

test("all review modals expose independent transparency, movement, and persisted resize", () => {
  const modalEnhancer = shared.slice(shared.indexOf('const enhanceModal'), shared.indexOf('const initializeModalEnhancements'));
  assert.match(shared, /const enhanceModal = \(modal\) =>/);
  assert.match(shared, /data-gldn-modal-opacity/);
  assert.match(modalEnhancer, /min="0" max="100"/);
  assert.match(modalEnhancer, /Math\.max\(0,/);
  assert.match(modalEnhancer, /const surfaceAlpha = Math\.min\(0\.30, alpha \* 0\.28\)/);
  assert.match(modalEnhancer, /const raisedAlpha = Math\.min\(0\.38, alpha \* 0\.34\)/);
  assert.match(modalEnhancer, /opacity === 0 \? 'none'/);
  assert.match(modalEnhancer, /gldnModalOpacities/);
  assert.match(modalEnhancer, /gldnModalPositions/);
  assert.match(modalEnhancer, /gldn-modal-drag-handle/);
  assert.match(modalEnhancer, /gldnModalOpacityPercent/);
  assert.doesNotMatch(modalEnhancer, /dataset\.gldnModalOpacity\s*=/);
  assert.doesNotMatch(modalEnhancer, /set\(\{\s*gldnUiOpacity:/);
  assert.match(shared, /new ResizeObserver/);
  assert.match(shared, /gldnModalSizes/);
  assert.match(styles, /\.gldn-modal\s*\{[\s\S]*?resize: both/);
  assert.match(styles, /\.gldn-modal-appearance/);
  assert.match(styles, /--gldn-modal-alpha/);
  assert.match(styles, /\.gldn-modal \.gldn-existing[\s\S]*?--gldn-modal-surface-alpha/);
  assert.match(themeCatalog, /--gldn-theme-surface-rgb/);
});

test("panel and modal scrollbars use the seamless shared treatment", () => {
  assert.match(styles, /\.gldn-order-panel::\-webkit-scrollbar/);
  assert.match(styles, /\.gldn-modal::\-webkit-scrollbar/);
  assert.match(styles, /scrollbar-width: thin/);
});

test("Poshmark stats display money as USD and large counts with separators", () => {
  assert.match(poshmark, /function currencyDisplay\(value\)/);
  assert.match(poshmark, /style: "currency", currency: "USD"/);
  assert.match(poshmark, /\["Total sales last 90 days", currencyDisplay\(record\.totalSalesLast90\)\]/);
  assert.match(poshmark, /\["Total earned all time", currencyDisplay\(record\.totalEarnedAllTime\)\]/);
  assert.match(poshmark, /\["Profile listings", countDisplay\(record\.profileListings\)\]/);
});

test("panel layout is included in settings backup and restore", () => {
  assert.match(popupJs, /const PANEL_LAYOUT_STORAGE_KEYS = Object\.freeze/);
  assert.match(popupJs, /\.flatMap\(\(key\) => \[key, `\$\{key\}Mode`, `\$\{key\}Size`\]\)/);
  assert.match(popupJs, /\.\.\.PANEL_LAYOUT_STORAGE_KEYS/);
  assert.match(popupJs, /'gldnUniversalPanelPosition'/);
  assert.match(popupJs, /'gldnModalSizes'/);
  assert.match(popupJs, /'gldnModalPositions'/);
  assert.match(popupJs, /'gldnModalOpacities'/);
});
