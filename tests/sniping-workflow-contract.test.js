const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('manifest loads the sniping audit before Amazon and eBay workflow code', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  for (const host of ['amazon.com', 'ebay.com']) {
    const script = manifest.content_scripts.find((entry) => entry.matches.some((match) => match.includes(host)));
    assert.ok(script, `${host} content script is missing`);
    const auditIndex = script.js.indexOf('sniping-audit.js');
    const workflowIndex = script.js.indexOf(host === 'amazon.com' ? 'amazon.js' : 'ebay.js');
    assert.ok(auditIndex >= 0 && auditIndex < workflowIndex, `${host} must load sniping-audit.js first`);
  }
});

test('seller extraction cannot mark the Amazon match complete from markup alone', () => {
  const source = read('extension/ebay.js');
  const start = source.indexOf('async function extractSnipingSellersForProductWorkflow()');
  const end = source.indexOf('async function resumePendingSnipingExtract()', start);
  const extraction = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(extraction, /handoffAmazonSnipingSellerReview/);
  assert.match(extraction, /chooseCompetitors:\s*false/);
  assert.match(extraction, /matchAmazon:\s*false/);
  assert.doesNotMatch(extraction, /matchAmazon:\s*true/);
  assert.match(extraction, /allowedBulkProductTitle/);
});

test('seller extraction supports the current eBay s-card result markup', () => {
  const source = read('extension/ebay.js');
  const start = source.indexOf('function extractEbayResultCards()');
  const end = source.indexOf('async function waitForSnipingSearchResultsStable', start);
  const extraction = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(extraction, /li\.s-card/);
  assert.match(extraction, /\.s-card__title/);
  assert.match(extraction, /\.s-card__price/);
  assert.match(extraction, /img\.s-card__image/);
  assert.match(extraction, /%\\s\+positive/);
});

test('seller and winner gates require exact manual identity checks', () => {
  const ebay = read('extension/ebay.js');
  const amazon = read('extension/amazon.js');
  assert.match(amazon, /data-check="title"/);
  assert.match(amazon, /data-check="image"/);
  assert.match(amazon, /data-check="variant"/);
  assert.match(ebay, /data-check="seller"/);
  assert.match(ebay, /data-check="demand"/);
  assert.match(ebay, /pendingSnipingWinner/);
  assert.match(ebay, /openEcomSniperPage", page: "productHunter"/);
});

test('seller review leaves the heavy eBay results page and returns to Amazon', () => {
  const amazon = read('extension/amazon.js');
  const ebay = read('extension/ebay.js');
  const background = read('extension/background.js');
  assert.match(background, /_ipg=60/);
  assert.match(amazon, /openSnipingEbaySearch/);
  assert.match(amazon, /const runtimeMessage = U\.runtimeMessage/);
  assert.match(amazon, /lastSnipingLaunchDiagnostic/);
  assert.match(amazon, /gldnSnipingLaunchResult/);
  assert.match(amazon, /holdWorkflowStatus/);
  assert.match(amazon, /anchorTabId:\s*tabInfo\.tabId/);
  assert.match(amazon, /changes\.findProductsWorkflow/);
  assert.match(amazon, /reviewPendingSnipingSellerCandidates\(\)/);
  assert.match(amazon, /tabInfo\?\.tabId !== sniping\.anchorTabId/);
  assert.match(amazon, /showSnipingSellerReviewOnAmazon/);
  assert.match(amazon, /Save Verified Seller/);
  assert.match(amazon, /openEcomSniperPage/);
  assert.match(ebay, /waitForSnipingSearchResultsStable/);
  assert.match(ebay, /handoffAmazonSnipingSellerReview/);
  assert.match(ebay, /anchorTabId:\s*sniping\.anchorTabId/);
  assert.doesNotMatch(ebay, /id = "gldn-sniping-seller-review"/);
  assert.match(background, /showSnipingSellerReview/);
  assert.match(background, /amazon\.com/);
  assert.match(background, /closeTab\(sourceTabId\)/);
  assert.match(background, /tab\.id === preferredTabId/);
  assert.match(background, /active:\s*false/);
  assert.match(background, /createOptions\.windowId = windowId/);
  assert.match(background, /sender\?\.tab\?\.windowId/);
  assert.match(background, /windowId:\s*tab\?\.windowId/);
  const handoffStart = background.indexOf('function handoffAmazonSnipingSellerReview');
  const handoffEnd = background.indexOf('function openSnipingEbaySearch', handoffStart);
  const handoff = background.slice(handoffStart, handoffEnd);
  assert.doesNotMatch(handoff, /tabs\.update|windows\.update/);
  assert.doesNotMatch(background, /sniping-review\.html/);
});

test('Amazon finishes at a read-only pre-list review and never submits', () => {
  const amazon = read('extension/amazon.js');
  const audit = read('extension/sniping-audit.js');
  assert.match(amazon, /(?:data-action\s*=\s*"start-sniping-workflow"|dataset\.action\s*=\s*"start-sniping-workflow")/);
  assert.match(amazon, /startSnipingWorkflowFromAmazon\(\)/);
  assert.match(amazon, /showSnipingPreListReview/);
  assert.match(amazon, /Save Read-Only Review/);
  assert.match(amazon, /Nothing has been listed or submitted/);
  assert.match(amazon, /preListReview:\s*true/);
  assert.match(audit, /listingSubmitted:\s*false/);
  assert.doesNotMatch(amazon, /listingSubmitted:\s*true/);
});

test('release scripts include the sniping audit module', () => {
  for (const relativePath of [
    'tools/build-local-package.ps1',
    'tools/build-webstore-zip.ps1',
    'tools/check-release.ps1',
    'tools/universal-release-check.ps1'
  ]) {
    assert.match(read(relativePath), /sniping-audit\.js/, `${relativePath} omits sniping-audit.js`);
    assert.match(read(relativePath), /sniping-review\.js/, `${relativePath} omits sniping-review.js`);
  }
});
