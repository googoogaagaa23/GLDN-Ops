const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'extension', name), 'utf8');
const ebay = read('ebay.js');
const amazon = read('amazon.js');
const poshmark = read('poshmark.js');
const ecomsniper = read('ecomsniper.js');
const universal = read('universal.js');
const popup = read('popup.js');

test('invalidated marketplace pages disable every GLDN control', () => {
  for (const source of [ebay, amazon, poshmark]) {
    assert.match(source, /querySelectorAll\?\.\("button, input, select, textarea"\)/);
    assert.match(source, /control\.disabled = true/);
  }
});

test('Amazon storage and startup failures retire the old page cleanly', () => {
  assert.match(amazon, /function amazonStorageError\(error\)/);
  assert.match(amazon, /stopInvalidatedAmazonContext\(normalized\)/);
  assert.match(amazon, /await startSnipingWorkflowFromAmazon\(\)/);
  assert.match(amazon, /Amazon workflow startup stopped/);
});

test('Poshmark sync and resume use bounded failure-aware paths', () => {
  assert.match(poshmark, /await runtimeMessage\(\{ type: "syncPoshmarkStats", record \}\)/);
  assert.match(poshmark, /resumePendingPoshmarkStatsScan\(\)\.catch/);
  assert.match(poshmark, /Poshmark stats resume stopped/);
});

test('status-only surfaces consume Chrome storage errors during an update', () => {
  assert.match(ecomsniper, /const readHandoffStatus = \(\) => new Promise/);
  assert.match(ecomsniper, /U\.markExtensionContextInvalidated\?\.\(error\)/);
  assert.match(universal, /chrome\.runtime\.lastError/);
  assert.match(universal, /U\.markExtensionContextInvalidated\?\.\(error\)/);
});

test('marketplace pages never block unattended runs with native alerts', () => {
  assert.doesNotMatch(ebay, /\balert\s*\(/);
  assert.doesNotMatch(amazon, /\balert\s*\(/);
  assert.doesNotMatch(poshmark, /\balert\s*\(/);
  assert.match(ebay, /Move \.99 Listings failed:/);
  assert.match(ebay, /Mark as Shipped failed:/);
  assert.match(amazon, /Profile label cannot be blank/);
  assert.match(poshmark, /No visible Poshmark sale orders were found/);
});

test('every advanced-popup background action uses a bounded response channel', () => {
  assert.match(popup, /function runtimeMessage\(message, timeoutMs = 30000\)/);
  assert.match(popup, /Extension request timed out/);
  assert.doesNotMatch(popup, /await chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(popup, /chrome\.runtime\.sendMessage\([^\n]+\)\.catch/);
  assert.match(amazon, /await runtimeMessage\(\{ type: "updateExtension"/);
  assert.match(poshmark, /await runtimeMessage\(\{ type: "updateExtension"/);
  assert.doesNotMatch(amazon, /await chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(poshmark, /await chrome\.runtime\.sendMessage/);
  assert.match(ebay, /const opened = await runtimeMessage\(\{ type: "openEcomSniperPage", page: "productHunter" \}\)/);
});
