const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'extension', 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'extension', 'popup.js'), 'utf8');
const publicConfig = fs.readFileSync(path.join(root, 'extension', 'config.example.js'), 'utf8');
const installer = fs.readFileSync(path.join(root, 'bootstrap-install.ps1'), 'utf8');

test('dashboard operations use saved Chrome-profile setup and migrate legacy local config only when needed', () => {
  assert.match(background, /async function getDashboardConfig\(\)\s*\{[\s\S]*?storageGet[\s\S]*?await seedDashboardSetupFromLocalConfig\(\);[\s\S]*?storageGet/);
  assert.match(background, /source: 'saved-profile'/);
  assert.match(background, /return \{ ok: true, changed, source: 'private-package' \}/);
  assert.match(background, /Dashboard setup code is missing\. Open GLDN Ops Setup and choose Connect Dashboard\./);
});

test('saved dashboard setup is checked across every extension lifecycle', () => {
  assert.match(background, /onInstalled\.addListener\(\(details\) => \{\s*seedAutomaticDashboardSetup\(`/);
  assert.match(background, /onStartup\.addListener\(\(\) => \{\s*seedAutomaticDashboardSetup\('chrome-startup'\)/);
  assert.match(background, /seedAutomaticDashboardSetup\('worker-start'\);/);
  assert.match(popupJs, /async function initializePopup\(\) \{[\s\S]*?await ensureAutomaticDashboardSetup\(\);/);
});

test('popup has saved-profile status and a secure one-time connection prompt', () => {
  assert.match(popupHtml, /id="dashboardAutoSetup"/);
  assert.match(popupHtml, /id="repairDashboardSetup"[^>]*>Connect Dashboard<\/button>/);
  assert.doesNotMatch(popupHtml, /dashboardSetupKey|Save Setup Code|Clear Setup Code/);
  assert.doesNotMatch(popupJs, /saveDashboardSetup|clearDashboardSetup|dashboardSetupKeyInput/);
  assert.match(popupJs, /type: 'seedDashboardSetupFromLocalConfig'/);
  assert.match(popupJs, /promptAndSaveDashboardSetup\(\)/);
});

test('installer preserves profile-local dashboard setup and public config stays empty', () => {
  assert.match(installer, /Dashboard setup stays in each Chrome profile and is preserved across extension updates\./);
  assert.match(installer, /Use Setup > Connect Dashboard once in a new Chrome profile\./);
  assert.doesNotMatch(installer, /Read-Host\s+"Enter the private dashboard setup code/);
  assert.doesNotMatch(installer, /automatic dashboard connection included in this private package/i);
  assert.match(publicConfig, /dashboardKey:\s*""/);
});
