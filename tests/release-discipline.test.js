const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const checkRelease = fs.readFileSync('tools/check-release.ps1', 'utf8');

test('release gate requires current notes, changelog and matrix version', () => {
  assert.match(checkRelease, /Release .* is missing its Verification section/);
  assert.match(checkRelease, /CHANGELOG\.md is missing the current/);
  assert.match(checkRelease, /MASTER_FEATURE_MATRIX\.md does not identify current manifest/);
  assert.match(checkRelease, /MASTER_FEATURE_MATRIX\.md is missing the F-14/);
});

test('live-video release gate requires a Drive proof shared by notes and matrix', () => {
  assert.match(checkRelease, /driveLinkMatches/);
  assert.match(checkRelease, /matrixHasReleaseProof/);
  assert.match(checkRelease, /does not cite any proof-video link from release/);
  assert.match(checkRelease, /live proof video, Drive link and matrix citation/);
});
