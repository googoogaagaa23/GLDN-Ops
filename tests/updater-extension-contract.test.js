const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const background = fs.readFileSync('extension/background.js', 'utf8');
const popupHtml = fs.readFileSync('extension/popup.html', 'utf8');
const popupJs = fs.readFileSync('extension/popup.js', 'utf8');
const core = fs.readFileSync('tools/gldn-update-core.ps1', 'utf8');
const agent = fs.readFileSync('tools/gldn-update-agent.ps1', 'utf8');
const bootstrap = fs.readFileSync('bootstrap-install.ps1', 'utf8');

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
  assert.match(core, /Invoke-GldnExtensionRollback[\s\S]+ReadAllBytes\(\$configPath\)[\s\S]+WriteAllBytes/);
  assert.doesNotMatch(core, /Set-Content[^\n]+Secure Preferences|WriteAll(?:Bytes|Text)[^\n]+Secure Preferences/i);
  assert.doesNotMatch(agent, /body\.url|request\.url|metadataUrl\s*=\s*\[string\]\$Body/i);
});

test('background checks shared disk version without an infinite reload loop', () => {
  assert.match(background, /UPDATER_CHECK_ALARM/);
  assert.match(background, /gldnUpdaterAutoReloadAttempt/);
  assert.match(background, /pathMismatch: true/);
  assert.match(background, /periodInMinutes: 5/);
});

test('one-time setup can safely replace a folder whose updater is already running', () => {
  assert.match(agent, /updater-agent\.pid/);
  assert.match(agent, /processStartTimeUtc/);
  assert.match(agent, /processId = \$PID/);
  assert.match(bootstrap, /recordedAgentPath -ieq \$agentPath/);
  assert.match(bootstrap, /\[Math\]::Abs\(\(\$actualStart - \$recordedStart\)\.TotalSeconds\) -lt 2/);
  assert.match(bootstrap, /Stopping the existing GLDN Ops updater before installation/);
  assert.match(bootstrap, /for \(\$attempt = 0; \$attempt -lt 20; \$attempt\+\+\)/);
});

test('updater status distinguishes the shared stable folder from a separate loaded folder', () => {
  assert.match(agent, /configuredExtensionRoot/);
  assert.match(agent, /targetMatchesConfiguredInstallRoot/);
  assert.match(popupJs, /separateLoadedFolder/);
  assert.match(popupJs, /Keep that folder in place/);
  assert.match(popupJs, /preserve this profile's extension identity and saved settings/);
  assert.match(popupJs, /uses the shared stable folder/);
  assert.match(popupHtml, /#updaterStatus\.warning/);
});
