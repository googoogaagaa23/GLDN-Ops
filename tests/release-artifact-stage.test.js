const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const stageScript = fs.readFileSync('tools/stage-public-release.ps1', 'utf8');
const releaseCheck = fs.readFileSync('tools/check-release.ps1', 'utf8');

test('public release staging rebuilds every distributable before assembly', () => {
  assert.match(stageScript, /build-extension-package\.ps1/);
  assert.match(stageScript, /build-updater-metadata\.ps1/);
  assert.match(stageScript, /build-local-package\.ps1/);
  assert.match(stageScript, /build-installer\.ps1/);
  assert.match(stageScript, /build-product-hunter-package\.ps1/);
});

test('public release staging verifies exact updater version URL and checksum', () => {
  assert.match(stageScript, /metadata\.version/);
  assert.match(stageScript, /metadata\.url/);
  assert.match(stageScript, /metadata\.sha256/);
  assert.match(stageScript, /Staged latest\.json does not match its staged extension package/);
});

test('public release staging preserves publish ordering and recovery artifacts', () => {
  const targetCopy = stageScript.indexOf('Copy-Item -LiteralPath $extensionZip');
  const metadataCopy = stageScript.indexOf('Copy-Item -LiteralPath $metadataPath');
  assert.ok(targetCopy >= 0 && metadataCopy > targetCopy);
  assert.match(stageScript, /GLDN-Ops-Setup\.exe/);
  assert.match(stageScript, /bootstrap-install\.ps1/);
  assert.match(stageScript, /install-latest\.ps1/);
  assert.match(stageScript, /release-manifest-v\$Version\.json/);
  assert.match(stageScript, /GLDN-Product-Hunter-v\$productHunterVersion\.zip/);
  assert.match(stageScript, /Product Hunter checksum file does not match its package/);
});

test('release gate assembles and verifies a single public release directory', () => {
  assert.match(releaseCheck, /stage-public-release\.ps1/);
  assert.match(releaseCheck, /Public release artifact staging failed/);
});
