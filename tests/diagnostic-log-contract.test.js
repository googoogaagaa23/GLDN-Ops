const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
const ebay = fs.readFileSync(path.join(ROOT, 'extension', 'ebay.js'), 'utf8');
const popup = fs.readFileSync(path.join(ROOT, 'extension', 'popup.js'), 'utf8');
const shared = fs.readFileSync(path.join(ROOT, 'extension', 'shared.js'), 'utf8');

test('F-11 probe writes through the production logger and verifies exact readback', () => {
  assert.match(background, /async function runDiagnosticLogProbe\(sender\)/);
  assert.match(background, /operation: 'f11-controlled-failure'/);
  assert.match(background, /detail: `probeId=\$\{probeId\}; marketplaceActions=0`/);
  assert.match(background, /readback\.computerLabel/);
  assert.match(background, /readback\.ebayAccountLabel/);
  assert.match(background, /marketplaceActions: 0/);
  assert.match(background, /lastDiagnosticLogProbe: result/);
});

test('F-11 probe is explicit, eBay-only, and cannot perform marketplace actions', () => {
  const probeStart = background.indexOf('async function runDiagnosticLogProbe(sender)');
  const probeEnd = background.indexOf("self.addEventListener('error'", probeStart);
  const probeSource = background.slice(probeStart, probeEnd);
  assert.ok(probeStart >= 0 && probeEnd > probeStart);
  assert.match(background, /message\.confirm !== 'F11_CONTROLLED_FAILURE'/);
  assert.match(probeSource, /\(\^\|\\\.\)ebay\\\.com\$/);
  assert.doesNotMatch(probeSource, /createMove99BulkWorkspace|handleSync|chrome\.tabs\.create|chrome\.scripting/);
  assert.match(ebay, /gldnF11Probe/);
  assert.match(ebay, /gldnF11Confirm/);
  assert.match(ebay, /confirm: "F11_CONTROLLED_FAILURE"/);
  assert.match(ebay, /type: "gldn-ops-f11-diagnostic-export"/);
  assert.match(ebay, /dataset\.action = "verify-f11-export"/);
  assert.match(ebay, /verifyButton\.addEventListener\("click", async \(\) =>/);
  assert.match(ebay, /await navigator\.clipboard\.writeText\(exportText\)/);
  assert.match(ebay, /\(await navigator\.clipboard\.readText\(\)\) === exportText/);
  assert.match(ebay, /document\.execCommand\("copy"\) === true/);
  assert.match(ebay, /clipboardMethod = clipboardExported \? "trusted-exec-command"/);
  assert.match(ebay, /saved\?\.clipboardExported === true/);
  assert.match(ebay, /no marketplace action ran/);
});

test('full diagnostic export includes the verified production error log', () => {
  assert.match(popup, /errorLog: Array\.isArray\(storageValues\.gldnErrorLog\)/);
  assert.match(popup, /copyTextToClipboard\(JSON\.stringify\(report, null, 2\)\)/);
});

test('page errors retain phase and identity through the background logger', () => {
  assert.match(shared, /operation: String\(entry\?\.operation \|\| entry\?\.phase/);
  assert.match(shared, /type: "recordExtensionLog", entry: payload/);
  assert.match(shared, /"computerLabel", "ebayAccountLabel"/);
  assert.match(background, /\.then\(\(entry\) => sendResponse\(\{ ok: true, entry \}\)\)/);
});
