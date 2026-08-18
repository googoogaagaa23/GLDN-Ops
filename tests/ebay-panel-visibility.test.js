const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ebay = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ebay.js'), 'utf8');

function extractFunction(name) {
  const start = ebay.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const signatureEnd = ebay.indexOf(') {', start);
  assert.notEqual(signatureEnd, -1, `${name} signature must be complete`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < ebay.length; index += 1) {
    if (ebay[index] === '{') depth += 1;
    if (ebay[index] === '}') depth -= 1;
    if (depth === 0) return ebay.slice(start, index + 1);
  }
  throw new Error(`${name} could not be extracted`);
}

function loadVisibilityContract() {
  const source = [
    "const EBAY_PANEL_WORKFLOW_KEYS = Object.freeze(['pendingMove99Run']);",
    extractFunction('isEbayOrderDetailsPage'),
    extractFunction('ebayPanelWorkflowStateVisible'),
    'return { isEbayOrderDetailsPage, ebayPanelWorkflowStateVisible };'
  ].join('\n');
  const FOUNDATION = {
    activeWorkflowEntries(stored) {
      return stored.active ? [{ key: 'pendingMove99Run' }] : [];
    }
  };
  return new Function('FOUNDATION', source)(FOUNDATION);
}

test('eBay order details always expose the daily panel while ordinary listings stay workflow-gated', () => {
  const { isEbayOrderDetailsPage, ebayPanelWorkflowStateVisible } = loadVisibilityContract();
  const orderDetails = 'https://www.ebay.com/mesh/ord/details?mode=SH&srn=6975&orderid=23-14970-50993';
  const legacyOrderDetails = 'https://www.ebay.com/sh/ord/details?orderid=23-14970-50993';
  const listings = 'https://www.ebay.com/sh/lst/active';

  assert.equal(isEbayOrderDetailsPage(orderDetails), true);
  assert.equal(isEbayOrderDetailsPage(legacyOrderDetails), true);
  assert.equal(isEbayOrderDetailsPage(listings), false);
  assert.equal(ebayPanelWorkflowStateVisible({}, orderDetails), true);
  assert.equal(ebayPanelWorkflowStateVisible({}, listings), false);
  assert.equal(ebayPanelWorkflowStateVisible({ active: true }, listings), true);
});

test('SPA navigation refreshes panel visibility before workflow resume checks', () => {
  const heartbeat = ebay.slice(
    ebay.indexOf('// SPA-navigation heartbeat'),
    ebay.indexOf('// Keep the page usable', ebay.indexOf('// SPA-navigation heartbeat'))
  );
  assert.match(heartbeat, /lastPanelVisibilityHref !== location\.href/);
  assert.match(heartbeat, /await refreshEbayPanelWorkflowVisibility\(\)/);
  assert.ok(
    heartbeat.indexOf('await refreshEbayPanelWorkflowVisibility()') < heartbeat.indexOf('if (move99Running) return'),
    'page-context visibility must refresh even during a workflow transition'
  );
});
