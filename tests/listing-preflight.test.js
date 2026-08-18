const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'extension', 'listing-preflight-core.js'));

test('listing preflight parses URLs, raw ASINs, titles, and removes duplicate lines', () => {
  const rows = core.parseInputRows([
    'https://www.amazon.com/example/dp/B012345678 Product title',
    'ASIN: B087654321 | Another item',
    'plain product title',
    'plain product title'
  ].join('\n'));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].asins, ['B012345678']);
  assert.deepEqual(rows[1].asins, ['B087654321']);
});

test('reviewed rules produce block, review, and explicit no-match results', () => {
  const rows = core.parseInputRows([
    'https://www.amazon.com/dp/B012345678',
    'Acme Medical Device Kit',
    'Ordinary kitchen spoon'
  ].join('\n'));
  const results = core.evaluateRows(rows, {
    schemaVersion: 1,
    rules: [
      { type: 'asin', value: 'B012345678', action: 'block', reason: 'Reviewed prohibited product.', evidenceUrls: ['https://discord.com/channels/1/2/3'] },
      { type: 'keyword', value: 'medical device', action: 'review', reason: 'Needs policy review.', evidenceUrls: ['https://discord.com/channels/1/2/4'] }
    ]
  });
  assert.deepEqual(results.map((row) => row.action), ['block', 'review', 'clear']);
  assert.match(results[2].reason, /not an eBay approval/i);
  assert.deepEqual(core.summarizeResults(results), { total: 3, clear: 1, review: 1, block: 1 });
});

test('published official eBay baseline is nonempty and separates block, review, and ready rows', () => {
  const rulePack = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight-rules.json'), 'utf8'));
  assert.ok(rulePack.ruleCount >= 160, `Expected the expanded reviewed baseline, received ${rulePack.ruleCount}.`);
  assert.equal(rulePack.ruleCount, rulePack.rules.length);
  assert.ok(rulePack.rules.every((rule) => rule.sourceType === 'official-ebay'));
  assert.ok(rulePack.rules.every((rule) => rule.evidenceUrls.some((url) => /^https:\/\/(?:www\.)?ebay\.com\/help\/|^https:\/\/ocsnext\.ebay\.com\/help\//.test(url))));

  const rows = core.parseInputRows([
    'Replacement CPAP mask with headgear',
    'Organic weed killer concentrate',
    'Stainless steel kitchen spoon'
  ].join('\n'));
  const results = core.evaluateRows(rows, rulePack);
  assert.deepEqual(results.map((row) => row.action), ['block', 'review', 'clear']);
  assert.equal(results[0].matches[0].sourceType, 'official-ebay');
  assert.equal(results[0].matches[0].authority, 'eBay');
});

test('expanded official rules catch high-risk products without broad phrase false positives', () => {
  const rulePack = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight-rules.json'), 'utf8'));
  const rows = core.parseInputRows([
    '1080P Hidden Camera Alarm Clock WiFi Recorder',
    'Universal E-Bike Charger 42V Replacement',
    'Deployed Airbag Replacement Unit',
    'Slim Jim Original Smoked Snack Sticks',
    'Ivory Color Cotton Kitchen Towels',
    'Wall Mounted Wine Glass Rack',
    'Stainless Steel Kitchen Spoon'
  ].join('\n'));
  const results = core.evaluateRows(rows, rulePack);

  assert.deepEqual(results.map((row) => row.action), [
    'block',
    'review',
    'block',
    'clear',
    'clear',
    'clear',
    'clear'
  ]);
  assert.equal(results[0].matches[0].value.toLowerCase(), 'hidden camera');
  assert.equal(results[1].matches[0].value.toLowerCase(), 'universal e-bike charger');
  assert.equal(results[2].matches[0].value.toLowerCase(), 'deployed airbag');
});

test('conformity and counterfeit marketing claims require manual review', () => {
  const rulePack = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight-rules.json'), 'utf8'));
  const rows = core.parseInputRows([
    'Portable Charger CE Certified with Fast Charging',
    'Designer Inspired By Handbag Dupe',
    'Plain Stainless Steel Kitchen Spoon'
  ].join('\n'));
  const results = core.evaluateRows(rows, rulePack);

  assert.deepEqual(results.map((row) => row.action), ['review', 'review', 'clear']);
  assert.equal(results[0].matches[0].sourceType, 'official-ebay');
  assert.ok(results[1].matches.some((match) => match.value.toLowerCase() === 'dupe'));
  assert.ok(results[1].matches.some((match) => match.value.toLowerCase() === 'inspired by'));
});

test('unreviewed and malformed rule entries never affect preflight output', () => {
  const [row] = core.parseInputRows('Acme product B012345678');
  const [result] = core.evaluateRows([row], {
    rules: [
      { type: 'asin', value: 'B012345678', action: 'unreviewed' },
      { type: 'brand', value: '', action: 'block' },
      { type: 'unknown', value: 'Acme', action: 'block' }
    ]
  });
  assert.equal(result.action, 'review');
  assert.match(result.reason, /no reviewed rules are loaded/i);
});

test('an empty reviewed rule pack fails closed and never creates copy-ready links', () => {
  const rows = core.parseInputRows([
    'https://www.amazon.com/dp/B012345678',
    'Ordinary kitchen spoon'
  ].join('\n'));
  const results = core.evaluateRows(rows, { schemaVersion: 1, rules: [] });
  assert.deepEqual(results.map((row) => row.action), ['review', 'review']);
  assert.equal(core.copyPayload(results, 'clear'), '');
});

test('copy-ready output includes only clear inputs in their original order', () => {
  const rows = core.parseInputRows([
    'https://www.amazon.com/dp/B012345678',
    'Ordinary kitchen spoon',
    'Acme Medical Device Kit'
  ].join('\n'));
  const results = core.evaluateRows(rows, {
    rules: [
      { type: 'asin', value: 'B012345678', action: 'block', reason: 'Reviewed prohibited product.' },
      { type: 'keyword', value: 'medical device', action: 'review', reason: 'Needs policy review.' }
    ]
  });
  assert.equal(core.copyPayload(results, 'clear'), 'Ordinary kitchen spoon');
  assert.deepEqual(core.resultsForAction(results, 'block').map((row) => row.input), ['https://www.amazon.com/dp/B012345678']);
});

test('bulk-poster output canonicalizes only ready Amazon links and requires product-name evidence', () => {
  const rows = core.parseInputRows([
    'https://www.amazon.com/Stainless-Steel-Kitchen-Spoon/dp/B012345678?tag=tracking',
    'https://www.amazon.com/dp/B087654321',
    'https://example.com/not-amazon',
    'ASIN: B099999999 | Ordinary desk organizer'
  ].join('\n'));
  const results = core.evaluateRows(rows, { rules: [{ type: 'keyword', value: 'medical device', action: 'review' }] });
  assert.deepEqual(results.map((row) => row.action), ['clear', 'review', 'review', 'clear']);
  assert.equal(core.copyAmazonLinkPayload(results), [
    'https://www.amazon.com/dp/B012345678',
    'https://www.amazon.com/dp/B099999999'
  ].join('\n'));
});

test('popup exposes Listing Preflight and the page disclaims eBay API approval', () => {
  const popup = fs.readFileSync(path.join(ROOT, 'extension', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(ROOT, 'extension', 'popup.js'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.html'), 'utf8');
  assert.match(popup, /id="openListingPreflight"/);
  assert.match(popup, /<script src="listing-preflight-core\.js"><\/script>/);
  assert.match(popupJs, /listing-preflight\.html/);
  assert.match(page, /does not call an eBay API/i);
  assert.match(page, /does not mean eBay permits the listing/i);
  assert.match(page, /Copy Ready Links/);
  assert.match(page, /Copy Ready &amp; Open Product Hunter/);
  assert.match(popup, /id="preflightBulkPosterClipboard"/);
  assert.match(popupJs, /source: 'bulk-poster-clipboard'/);
  assert.match(popupJs, /targetPage: 'bulkPoster'/);
});

test('preflight renders official policy and community evidence as distinct sources', () => {
  const pageJs = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.js'), 'utf8');
  assert.match(pageJs, /Official eBay policy/);
  assert.match(pageJs, /Discord report/);
  assert.doesNotMatch(pageJs, /link\.textContent = `Discord evidence/);
});

test('reviewed-rule publisher accepts only exact official eBay or Discord evidence', () => {
  const publisher = fs.readFileSync(path.join(ROOT, 'tools', 'listing-preflight', 'publish-reviewed-rules.ps1'), 'utf8');
  assert.match(publisher, /official-ebay/);
  assert.match(publisher, /profile2-discord/);
  assert.ok(publisher.includes("ebay\\.com/help/"));
  assert.ok(publisher.includes("ebay\\.com/sellercenter/"));
  assert.ok(publisher.includes("discord\\.com/channels/"));
  assert.match(publisher, /Every shared rule needs a review date/);
});
