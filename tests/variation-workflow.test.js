const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const coreSource = fs.readFileSync(path.join(root, 'extension', 'variation-core.js'), 'utf8');
const sandbox = { globalThis: {}, Date, Map, Set, Number, String, Object, Array, Math };
vm.runInNewContext(coreSource, sandbox);
const CORE = sandbox.globalThis.GLDN_VARIATION_CORE;

function sampleCsv() {
  return [
    'Item number,Title,Variation details,Custom label (SKU),Available quantity,Format,Currency,Start price,Current price,Sold quantity,eBay category 1 name',
    '318000000001,"Paint, 15ml","Color=Red;Blue",SKU-A,4,FIXED_PRICE,USD,19.99,19.99,1,Paint',
    '318000000001,"Paint, 15ml",Color=Red,SKU-A-RED,2,FIXED_PRICE,USD,19.99,19.99,1,Paint',
    '318000000001,"Paint, 15ml",Color=Blue,SKU-A-BLUE,2,FIXED_PRICE,USD,21.99,21.99,0,Paint',
    '318000000002,Plain item,,SKU-B,1,FIXED_PRICE,USD,9.99,9.99,0,Other',
    '318000000003,"Quoted ""title""",Size=Large,SKU-C,1,FIXED_PRICE,USD,29.99,29.99,0,Other'
  ].join('\r\n');
}

test('variation report parser deduplicates child rows to exact parent item numbers', () => {
  const audit = CORE.buildVariationAudit(sampleCsv(), { name: 'active.csv', lastModified: Date.UTC(2026, 7, 4) });
  assert.equal(audit.totalReportRows, 5);
  assert.equal(audit.uniqueListingCount, 3);
  assert.equal(audit.variationRowCount, 4);
  assert.equal(audit.variationListingCount, 2);
  assert.deepEqual([...audit.listings.map((listing) => listing.itemId)].sort(), ['318000000001', '318000000003']);
  const paint = audit.listings.find((listing) => listing.itemId === '318000000001');
  assert.equal(paint.title, 'Paint, 15ml');
  assert.equal(paint.variationRowCount, 3);
  assert.equal(paint.minPrice, 19.99);
  assert.equal(paint.maxPrice, 21.99);
});

test('variation prices always display as an explicit minimum and maximum range', () => {
  assert.equal(CORE.formatPriceRange(19.99, 21.99), '$19.99 - $21.99');
  assert.equal(CORE.formatPriceRange(43.99, 43.99), '$43.99 - $43.99');
  assert.equal(CORE.formatPriceRange(null, 12.5), '$12.50 - $12.50');
  assert.equal(CORE.formatPriceRange(null, null), 'Not reported');
});

test('variation parser accepts quoted commas and escaped quotes', () => {
  const parsed = CORE.csvRecords(sampleCsv());
  assert.equal(parsed.records[0].Title, 'Paint, 15ml');
  assert.equal(parsed.records[4].Title, 'Quoted "title"');
});

test('variation parser rejects a non-eBay or incomplete report', () => {
  assert.throws(
    () => CORE.buildVariationAudit('Item number,Title\r\n318000000001,Missing variation header'),
    /Missing: Variation details/
  );
});

test('variation audit export contains one row per selected parent', () => {
  const audit = CORE.buildVariationAudit(sampleCsv(), { name: 'active.csv' });
  const csv = CORE.auditCsv(audit, ['318000000003']);
  const rows = CORE.parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], '318000000003');
});

test('live variation scan audit accepts only eBay-confirmed variation parents', () => {
  const audit = CORE.buildLiveVariationAudit([
    { itemId: '318000000010', title: 'Variation item', price: 22.99, variationLabel: 'Color: 3 options', multiVariationListing: true },
    { itemId: '318000000011', title: 'Plain item', price: 9.99, multiVariationListing: false }
  ], { name: 'Automated eBay Active Listings scan', totalListings: 7230, sourceTabId: 77, scannedAt: '2026-08-05T12:00:00.000Z' });
  assert.equal(audit.source, 'automated-ebay-scan');
  assert.equal(audit.sourceTabId, 77);
  assert.equal(audit.totalReportRows, 7230);
  assert.equal(audit.uniqueListingCount, 7230);
  assert.equal(audit.variationListingCount, 1);
  assert.equal(audit.listings[0].itemId, '318000000010');
  assert.equal(audit.listings[0].variationSummary, 'Color: 3 options');
});

test('variation ending is exact-ID, native eBay 200-item capped, and count-bound', () => {
  const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
  const ebay = fs.readFileSync(path.join(root, 'extension', 'ebay.js'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'extension', 'popup.html'), 'utf8');
  const control = fs.readFileSync(path.join(root, 'tools', 'gldn-control.ps1'), 'utf8');
  const agent = fs.readFileSync(path.join(root, 'tools', 'gldn-update-agent.ps1'), 'utf8');
  assert.match(background, /const VARIATION_END_BATCH_LIMIT = 200/);
  assert.match(background, /const VARIATION_END_LEDGER_KEY = 'variationEndLedger'/);
  assert.match(background, /function mergedVariationEndLedger/);
  assert.match(background, /\/sh\/lst\/active\/end-listings\?listingIds=/);
  assert.match(background, /\/sh\/lst\/active\/submit-end-listings\?usecase=SELLER_HUB/);
  assert.match(background, /native-endpoint-visible-workspace/);
  assert.match(background, /createMove99BulkWorkspace\(tab\.id, \{ itemIds, returnUrl \}\)/);
  assert.match(background, /workspaceUrl\.pathname !== '\/bulksell'/);
  assert.match(background, /deferApproval: true/);
  assert.match(background, /endReason: 'NotAvailable'/);
  assert.match(background, /eligible\.some\(\(itemId, index\) => itemId !== itemIds\[index\]\)/);
  assert.match(background, /prepareEbayVariationEndReview/);
  assert.match(background, /scanEbayVariationListings/);
  assert.match(background, /scanAllEbayActiveListingRecords/);
  assert.match(background, /classifyEbayVariationParents/);
  assert.match(background, /multiVariationListing !== true/);
  assert.match(background, /active: false/);
  assert.match(background, /message\.type === 'scanEbayVariationListings'/);
  assert.match(background, /message\.type === 'prepareEbayVariationEndReview'/);
  assert.match(background, /message\.type === 'focusEbayVariationEndReview'/);
  assert.match(background, /message\.type === 'submitEbayVariationEndReview'/);
  assert.match(background, /inspectEbayVariationWorkspaceProcessing/);
  assert.match(background, /already ended\. Import a fresh All active listings report before continuing/);
  assert.match(background, /\[VARIATION_END_LEDGER_KEY\]: variationEndLedger/);
  assert.match(background, /successfulItemIds,/);
  assert.match(background, /failedItemIds,/);
  assert.match(background, /case 'prepare-variation-end-review': return prepareLocalControlVariationEndReview/);
  assert.match(background, /gldnVariationIds/);
  assert.match(background, /gldnVariationApproval/);
  assert.match(background, /await resolveControlTab\(\{ tabId: payload\.tabId \}, 'ebay'\);\s*return submitEbayVariationEndReview/);
  assert.match(background, /return prepareLocalControlVariationEndReview/);
  assert.match(control, /PrepareVariationEndReview/);
  assert.match(control, /action = "prepare-variation-end-review"/);
  assert.match(agent, /"prepare-variation-end-review"/);
  assert.match(agent, /itemIds\.Count -gt 200/);
  assert.match(ebay, /APPROVE END VARIATIONS \$\{expectedCount\}/);
  assert.match(ebay, /displayedCount === expectedCount/);
  assert.match(ebay, /requestedCount <= 200/);
  assert.match(ebay, /reviewMode === "native-endpoint"/);
  assert.match(ebay, /native-endpoint-visible-workspace/);
  assert.match(ebay, /type: "submitEbayVariationEndReview"/);
  assert.match(ebay, /showEbayVariationEndReview/);
  assert.match(popup, /Find \/ End Variation Listings/);
});

test('variation review is a user-facing internal extension page', () => {
  const popupJs = fs.readFileSync(path.join(root, 'extension', 'popup.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'extension', 'variation-audit.html'), 'utf8');
  const pageJs = fs.readFileSync(path.join(root, 'extension', 'variation-audit.js'), 'utf8');
  assert.match(popupJs, /chrome\.runtime\.getURL\('variation-audit\.html'\)/);
  assert.match(html, /Scan &amp; Prepare Review/);
  assert.match(html, /No report download or import is required/);
  assert.match(html, /Prepare Next Batch/);
  assert.match(html, /Current eBay review/);
  assert.match(html, /Exact approval token/);
  assert.match(html, /approvalInstruction/);
  assert.match(html, /Price range/);
  assert.match(html, /End Exact Batch/);
  assert.match(html, /at most 200 exact parent item numbers/);
  assert.match(pageJs, /slice\(0, END_BATCH_LIMIT\)/);
  assert.match(pageJs, /const END_BATCH_LIMIT = 200/);
  assert.match(pageJs, /scanEbayVariationListings/);
  assert.match(pageJs, /20 \* 60 \* 1000/);
  assert.match(pageJs, /await prepareNextReview\(true\)/);
  assert.match(pageJs, /sourceTabId: audit\.sourceTabId/);
  assert.match(pageJs, /variationEndLedger/);
  assert.match(pageJs, /focusEbayVariationEndReview/);
  assert.match(pageJs, /submitEbayVariationEndReview/);
  assert.match(pageJs, /APPROVE END VARIATIONS/);
  assert.match(pageJs, /CORE\.formatPriceRange/);
  assert.match(pageJs, /After reviewing eBay, type exactly/);
  assert.match(pageJs, /legacyProgressUnknown/);
  assert.match(html, /Download Audit CSV/);
  assert.doesNotMatch(html, /Import Active Listings CSV/);
  assert.doesNotMatch(html, /Open eBay Reports/);
});

test('Profile 2 control can launch the same automated scan and stop at exact review', () => {
  const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
  const control = fs.readFileSync(path.join(root, 'tools', 'gldn-control.ps1'), 'utf8');
  const agent = fs.readFileSync(path.join(root, 'tools', 'gldn-update-agent.ps1'), 'utf8');
  assert.match(background, /'variation-scan'/);
  assert.match(background, /const scan = await scanEbayVariationListings\(\{\}\)/);
  assert.match(background, /remainingIds\.slice\(0, VARIATION_END_BATCH_LIMIT\)/);
  assert.match(background, /sourceTabId: audit\.sourceTabId/);
  assert.match(background, /approvalToken: `APPROVE END VARIATIONS \$\{Number\(review\.requestedCount \|\| 0\)\}`/);
  assert.doesNotMatch(
    background.slice(background.indexOf("if (action === 'variation-scan')"), background.indexOf('const result = await seedDashboardSetupFromLocalConfig')),
    /submitEbayVariationEndReview/
  );
  assert.match(control, /"variation-scan"/);
  assert.match(agent, /"variation-scan"/);
});
