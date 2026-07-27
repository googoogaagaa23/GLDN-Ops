const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const background = fs.readFileSync('extension/background.js', 'utf8');
const popupHtml = fs.readFileSync('extension/popup.html', 'utf8');
const popupJs = fs.readFileSync('extension/popup.js', 'utf8');
const core = fs.readFileSync('tools/gldn-update-core.ps1', 'utf8');
const agent = fs.readFileSync('tools/gldn-update-agent.ps1', 'utf8');

test('extension exposes verified update, current-file reload, and rollback controls', () => {
  assert.match(popupHtml, /id="updateExtension"[^>]*>Update &amp; Reload<\/button>/);
  assert.match(popupHtml, /id="reloadExtension"[^>]*>Reload Current Files<\/button>/);
  assert.match(popupHtml, /id="rollbackExtension"[^>]*>Roll Back &amp; Reload<\/button>/);
  assert.match(popupJs, /type: 'updateExtension'/);
  assert.match(popupJs, /type: 'rollbackExtension'/);
  assert.match(background, /POST \/v1\/update|updaterRequest\('\/update'/);
  assert.match(background, /updaterRequest\('\/rollback'/);
});

test('updater is fixed-source, checksum verified, transactional, and preserves config', () => {
  assert.match(core, /GldnDefaultMetadataUrl/);
  assert.match(core, /Get-FileHash[^\n]+SHA256/);
  assert.match(core, /Release checksum verification failed/);
  assert.match(core, /TrimStart\(\[char\]0xFEFF\)/);
  assert.match(core, /New-GldnSnapshot/);
  assert.match(core, /Restore-GldnExtensionTree/);
  assert.match(core, /preservedConfig/);
  assert.doesNotMatch(agent, /body\.url|request\.url|metadataUrl\s*=\s*\[string\]\$Body/i);
});

test('updater resolves the requesting unpacked extension folder from Chrome and fails closed', () => {
  assert.match(core, /Get-GldnChromeExtensionInstalls/);
  assert.match(core, /Resolve-GldnExtensionRequestTarget/);
  assert.match(core, /\[int\]\$entry\.location -ne 4/);
  assert.match(core, /\[string\]\$manifest\.name -ne "GLDN Ops"/);
  assert.match(core, /more than one loaded folder/);
  assert.match(agent, /Get-AgentExtensionId/);
  assert.match(agent, /RequestOrigin/);
  assert.match(background, /'X-GLDN-Extension-Id': chrome\.runtime\.id/);
  assert.match(agent, /RequestExtensionId/);
  assert.match(agent, /sec-fetch-site[^\n]+none/i);
  assert.match(agent, /sec-fetch-mode[^\n]+cors/i);
  assert.match(agent, /targetSource/);
  assert.doesNotMatch(agent, /Body\.(installRoot|extensionRoot|path)/i);
});

test('background checks shared disk version without an infinite reload loop', () => {
  assert.match(background, /UPDATER_CHECK_ALARM/);
  assert.match(background, /gldnUpdaterAutoReloadAttempt/);
  assert.match(background, /pathMismatch: true/);
  assert.match(background, /periodInMinutes: 5/);
});

test('Update and Reload refreshes an older or explicitly requested current runtime', () => {
  assert.match(background, /const needsRuntimeReload = Boolean\([\s\S]*?message\.reloadWhenCurrent === true[\s\S]*?\);/);
  assert.match(background, /runtimeVersion:\s*EXTENSION_VERSION,\s*diskVersion,\s*reloading:\s*needsRuntimeReload/);
  assert.match(popupJs, /reloadWhenCurrent:\s*true/);
  assert.match(popupJs, /if \(response\.reloading\)/);
});

test('update, rollback, and reload refuse to invalidate an active workflow or review', () => {
  assert.match(background, /async function assertUpdaterIdle/);
  assert.match(background, /await assertUpdaterIdle\('Updating GLDN Ops'\)/);
  assert.match(background, /await assertUpdaterIdle\('Rolling back GLDN Ops'\)/);
  assert.match(background, /await assertUpdaterIdle\('Reloading GLDN Ops'\)/);
  assert.match(background, /gldnUpdaterDeferredReload/);
  assert.match(background, /deferred: true/);
  assert.match(background, /registerOpenReview/);
  assert.match(background, /clearOpenReviewsForTab/);
});

test('health reports updater path/version state and active workflow blockers', () => {
  assert.match(background, /getUpdaterRuntimeStatus/);
  assert.match(background, /runtimeVersion:\s*EXTENSION_VERSION/);
  assert.match(background, /workflowBusy:\s*workflowStatus\.busy/);
  assert.match(background, /updaterRequired:\s*true/);
  assert.match(background, /workflows:\s*workflowStatus/);
});
