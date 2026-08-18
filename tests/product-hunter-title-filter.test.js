const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const foundationSource = fs.readFileSync(path.join(root, 'extension', 'foundation.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'extension', 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'extension', 'popup.js'), 'utf8');
const amazonJs = fs.readFileSync(path.join(root, 'extension', 'amazon.js'), 'utf8');

function loadFoundation() {
  const context = { GLDN_CONFIG: {} };
  context.globalThis = context;
  vm.runInNewContext(foundationSource, context);
  return context.GLDN_FOUNDATION;
}

test('scanner clipboard filter removes apparel, shoes, costumes, and fashion accessories', () => {
  const foundation = loadFoundation();
  const titles = [
    'Kpop Demon Hunter Rumi Water bottle for kids',
    'Rumi KPop Demon Hunters Costume Viral Kpop Girl Outfit Halloween Kids Costume',
    'Water Shoes for Women Men Quick-Dry Aqua Socks Swim Beach Barefoot Yoga Exercise',
    'Water Shoes for Men Quick-Dry Aqua Socks Swim Beach Barefoot Yoga Exercise',
    'original Owala Kids FreeSip Insulated Stainless Steel Water Bottle 16 oz',
    'KPOP Demon Hunters kids Crossbody Bag Single Shoulder Pouch Coin Wallet Purse',
    'Girls Rumi Kpop Cosplay Costume Set Idol Outfit Jacket with Accessories',
    'Microfiber Reusable Mop Cover Set of 6 Washable Mop Cover resuable swiffer cover',
    'VEVOR Push Lawn Sweeper, 21inch Leaf & Grass Collector, Heavy Duty Steel',
    'Rumi KPop Demon Hunters Costume Viral Kpop Girl Outfit birthday Kids Costume',
    'Inflatable Tanning Pool Lounger Float - Jasonwell 4 in 1 Sun Tan Tub Sunbathing'
  ];
  const result = foundation.filterBulkProductTitles(titles.join('\n'));
  assert.equal(result.originalCount, 11);
  assert.equal(result.kept.length, 5);
  assert.equal(result.excluded.length, 6);
  assert.deepEqual(Array.from(result.kept), [titles[0], titles[4], titles[7], titles[8], titles[10]]);
});

test('scanner clipboard filter removes exact duplicate titles', () => {
  const foundation = loadFoundation();
  const result = foundation.filterBulkProductTitles('Reusable Mop Cover\nreusable mop cover\nWater Bottle');
  assert.equal(result.originalCount, 3);
  assert.equal(result.kept.length, 2);
  assert.equal(result.duplicatesRemoved, 1);
});

test('popup runs filtered clipboard through preflight before opening Product Hunter', () => {
  assert.match(popupHtml, /id="prepareProductHunterClipboard"/);
  assert.match(popupHtml, /id="productHunterClipboardReport"/);
  assert.match(popupJs, /FOUNDATION\.filterBulkProductTitles\(copied\)/);
  assert.match(popupJs, /LISTING_PREFLIGHT\.evaluateRows/);
  assert.match(popupJs, /pendingListingPreflightInput/);
  assert.match(popupJs, /Product Hunter was not opened/);
  assert.match(popupJs, /navigator\.clipboard\.writeText\(readyPayload\)/);
  assert.match(popupJs, /lastProductHunterClipboardPrep: report/);
  assert.match(popupJs, /openEcomSniperPage\('productHunter'/);
});

test('Amazon Best Sellers and Product Hunter use the same exclusion policy', () => {
  assert.match(amazonJs, /const FOUNDATION = window\.GLDN_FOUNDATION/);
  assert.match(amazonJs, /return FOUNDATION\.allowedBulkProductTitle\(title\)/);
});
