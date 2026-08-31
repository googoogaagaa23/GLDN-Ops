const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const core = require(path.join(ROOT, 'extension', 'listing-preflight-core.js'));
const OFFICIAL_HUB = 'https://www.ebay.com/help/policies/prohibited-restricted-items/prohibited-restricted-items?id=4207';
const OFFICIAL_COUNTERFEIT = 'https://www.ebay.com/help/policies/prohibited-restricted-items/counterfeit-item-policy?id=4276';

function strictPack(rules = [], overrides = {}) {
  const completeRules = rules.map((rule, index) => ({
    id: rule.id || `rule-${index}`,
    type: rule.type || 'keyword',
    value: rule.value,
    allOf: rule.allOf || [],
    anyOf: rule.anyOf || [],
    noneOf: rule.noneOf || [],
    action: rule.action,
    reason: rule.reason || 'Reviewed official policy classification for this test.',
    policyTopic: rule.policyTopic || 'Test policy',
    evidenceKind: rule.evidenceKind || (rule.action === 'block' ? 'explicit-prohibition' : 'conditional-review'),
    reviewedBy: rule.reviewedBy || 'Test reviewer',
    reviewedAt: rule.reviewedAt || '2026-08-30',
    source: rule.source || 'official-ebay-policy-reviewed',
    sourceType: rule.sourceType || 'official-ebay',
    authority: rule.authority || 'eBay',
    evidenceUrls: rule.evidenceUrls || [OFFICIAL_COUNTERFEIT]
  }));
  return {
    schemaVersion: 2,
    version: 'test-2026-08-30',
    generatedAt: '2026-08-30T00:00:00.000Z',
    sourceGeneratedAt: '2026-08-30T00:00:00.000Z',
    ruleCount: completeRules.length,
    policyCoverage: [{ title: 'Prohibited and restricted items', disposition: 'reviewed', url: OFFICIAL_HUB }],
    clearancePolicy: {
      id: 'test-generic-clearance',
      version: '2026-08-30.1',
      mode: 'review-unless-generic-allowlist',
      reviewedAt: '2026-08-30',
      maxAgeDays: 3650,
      readyPhrases: ['kitchen drawer organizer', 'desk organizer'],
      genericTokens: ['stainless', 'steel', 'kitchen', 'drawer', 'organizer', 'desk', 'small', 'plain'],
      reviewPhrases: ['fan art', 'licensed', 'compatible with', 'replacement for'],
      genericBrandValues: ['generic', 'unbranded'],
      evidenceUrls: [OFFICIAL_HUB, OFFICIAL_COUNTERFEIT],
      reason: 'Generic-only test clearance profile.'
    },
    rules: completeRules,
    ...overrides
  };
}

function publishedPack() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight-rules.json'), 'utf8'));
}

test('listing preflight parses URLs, ASINs, and structured product fields without duplicates', () => {
  const rows = core.parseInputRows([
    'Title: Plain desk organizer | Brand: Generic | Category: Desk Organizers | Model: N/A | ASIN: B012345678 | https://www.amazon.com/plain-desk-organizer/dp/B012345678',
    'ASIN: B087654321 | Another item',
    'plain product title',
    'plain product title'
  ].join('\n'));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].asins, ['B012345678']);
  assert.equal(rows[0].brand, 'Generic');
  assert.equal(rows[0].category, 'Desk Organizers');
  assert.equal(rows[0].model, 'N/A');
  assert.deepEqual(rows[1].asins, ['B087654321']);
});

test('strict rules take precedence, generic allowlist creates Ready, and unknown text stays Review', () => {
  const pack = strictPack([
    { type: 'asin', value: 'B012345678', action: 'block' },
    { type: 'keyword', value: 'medical device', action: 'review' }
  ]);
  const rows = core.parseInputRows([
    'https://www.amazon.com/plain-desk-organizer/dp/B012345678',
    'Acme Medical Device Kit',
    'Title: Stainless Steel Kitchen Drawer Organizer | Brand: Generic',
    'Ordinary kitchen spoon'
  ].join('\n'));
  const results = core.evaluateRows(rows, pack);
  assert.deepEqual(results.map((row) => row.action), ['block', 'review', 'clear', 'review']);
  assert.match(results[2].reason, /not eBay approval/i);
  assert.match(results[3].reason, /explicit product-page brand evidence is missing/i);
});

test('schema-2 packs fail closed atomically when partial, malformed, or carrying a community Block', () => {
  const row = core.parseInputRows('Stainless Steel Kitchen Drawer Organizer')[0];
  const countMismatch = strictPack([{ value: 'counterfeit', action: 'block' }], { ruleCount: 2 });
  const communityBlock = strictPack([{
    value: 'community rumor',
    action: 'block',
    sourceType: 'profile2-discord',
    source: 'profile2-discord-reviewed',
    authority: 'EcomSniper Discord community report',
    evidenceUrls: ['https://discord.com/channels/1225761896289009684/1291126334893981776/1534487049707454474']
  }]);
  for (const pack of [countMismatch, communityBlock]) {
    const normalized = core.normalizeRulePack(pack);
    assert.equal(normalized.valid, false);
    assert.equal(normalized.ruleCount, 0);
    const [result] = core.evaluateRows([row], pack);
    assert.equal(result.action, 'review');
    assert.match(result.reason, /unavailable or invalid/i);
  }
});

test('published full-hub pack is valid, source-separated, and includes the 500-word clearance profile', () => {
  const raw = publishedPack();
  const pack = core.normalizeRulePack(raw);
  assert.equal(raw.schemaVersion, 2);
  assert.equal(pack.valid, true, pack.validationErrors.join(' | '));
  assert.equal(pack.ruleCount, raw.rules.length);
  assert.ok(pack.ruleCount >= 577);
  assert.equal(raw.policyCoverage.pages.length, 70);
  assert.equal(raw.policyCoverage.supplementalPages.length, 1);
  assert.equal(pack.policyCoverage.length, 71);
  assert.deepEqual(raw.policyCoverage.excludedTopics, ['Dropshipping policy']);
  assert.equal(pack.clearancePolicy.readyPhrases.length, 500);
  assert.equal(pack.clearancePolicy.mode, 'review-unless-generic-allowlist');
  const official = pack.rules.filter((rule) => rule.sourceType === 'official-ebay');
  const discord = pack.rules.filter((rule) => rule.sourceType === 'profile2-discord');
  const telegram = pack.rules.filter((rule) => rule.sourceType === 'profile2-telegram');
  assert.ok(official.length >= 575);
  assert.equal(discord.length, 2);
  assert.equal(telegram.length, 0);
  assert.ok(official.every((rule) => rule.evidenceUrls.every((url) => /^https:\/\/(?:www\.)?ebay\.com\/(?:help\/|sellercenter\/)|^https:\/\/ocsnext\.ebay\.com\/help\//.test(url))));
  assert.ok(discord.every((rule) => rule.action === 'review'));
  const coveredUrls = new Set(official.flatMap((rule) => rule.evidenceUrls));
  for (const page of [...raw.policyCoverage.pages, ...raw.policyCoverage.supplementalPages]) {
    assert.ok(coveredUrls.has(page.url), `No direct reviewed decision cites ${page.title}: ${page.url}`);
  }
});

test('full-hub rules and generic profile classify explicit prohibitions, conditions, and false-positive examples conservatively', () => {
  const rows = core.parseInputRows([
    '1080P Hidden Camera Alarm Clock WiFi Recorder',
    'Universal E-Bike Charger 42V Replacement',
    'Deployed Airbag Replacement Unit',
    'Slim Jim Original Smoked Snack Sticks',
    'Ivory Color Cotton Kitchen Towels',
    'Wall Mounted Wine Glass Rack',
    'Title: Stainless Steel Kitchen Drawer Organizer | Brand: Generic'
  ].join('\n'));
  const results = core.evaluateRows(rows, publishedPack());
  assert.deepEqual(results.map((row) => row.action), ['block', 'review', 'block', 'review', 'review', 'review', 'clear']);
  assert.equal(results[0].matches[0].value.toLowerCase(), 'hidden camera');
  assert.ok(results[1].matches.some((match) => match.value.toLowerCase() === 'universal e-bike charger'));
  assert.equal(results[2].matches[0].value.toLowerCase(), 'deployed airbag');
  assert.equal(results[3].matches.length, 0, 'Snack brand context must not hit the lockpicking Block rule.');
});

test('counterfeit language Blocks while brands, VeRO/IP, character, compatibility, and unknown terms remain Review', () => {
  const rows = core.parseInputRows([
    'counterfeit Nike shoes',
    'Nike phone case',
    'Disney Mickey Mouse wall decal',
    'Gucci handbag',
    'Apple AirPods replacement case',
    'handmade fan art mug',
    'licensed superhero poster',
    'compatible with iPhone desk organizer',
    'VEVOR push lawn sweeper',
    'Owala water bottle organizer'
  ].join('\n'));
  const results = core.evaluateRows(rows, publishedPack());
  assert.equal(results[0].action, 'block');
  assert.deepEqual(results.slice(1).map((row) => row.action), Array(9).fill('review'));
  assert.ok(results[0].matches.some((match) => match.type === 'compound'));
});

test('counterfeit safeguards block explicit violations without blocking detector products', () => {
  const rows = core.parseInputRows([
    'Nike inspired by sneaker dupe',
    'Unauthorized art reproduction print',
    'Bootleg concert recording DVD',
    'Counterfeit Detector UV Marker Pen',
    'Generic perfume atomizer bottle'
  ].join('\n'));
  const results = core.evaluateRows(rows, publishedPack());
  assert.deepEqual(results.slice(0, 3).map((row) => row.action), ['block', 'block', 'block']);
  assert.notEqual(results[3].action, 'block');
  assert.notEqual(results[4].action, 'block');
});

test('URL-only input stays Review until live product details are collected', () => {
  const [result] = core.evaluateRows(
    core.parseInputRows('https://www.amazon.com/dp/B012345678'),
    publishedPack()
  );
  assert.equal(result.action, 'review');
  assert.match(result.reason, /product (?:name|evidence)|open or export product details|manual review/i);
});

test('brand rules are field-scoped and compound rules honor required and excluded context', () => {
  const pack = strictPack([
    { type: 'brand', value: 'apple', action: 'review' },
    { type: 'compound', value: 'fake branded product', allOf: ['fake'], anyOf: ['nike', 'gucci'], noneOf: ['detector'], action: 'block' }
  ]);
  const rows = core.parseInputRows([
    'Title: Apple-shaped desk organizer | Brand: Generic',
    'Title: Plain desk organizer | Brand: Apple',
    'Fake Nike desk organizer',
    'Fake Nike detector desk organizer'
  ].join('\n'));
  const results = core.evaluateRows(rows, pack);
  assert.equal(results[0].action, 'review', 'The unreviewed token still requires Review, but not because the brand rule matched.');
  assert.equal(results[0].matches.length, 0);
  assert.equal(results[1].action, 'review');
  assert.equal(results[1].matches[0].type, 'brand');
  assert.equal(results[2].action, 'block');
  assert.equal(results[3].action, 'review');
});

test('copy output contains only generic Ready rows and canonicalizes only evidence-bearing Amazon links', () => {
  const pack = strictPack([{ value: 'medical device', action: 'review' }]);
  const rows = core.parseInputRows([
    'Title: Stainless Steel Kitchen Drawer Organizer | Brand: Generic | ASIN: B012345678 | https://www.amazon.com/stainless-steel-kitchen-drawer-organizer/dp/B012345678?tag=tracking',
    'https://www.amazon.com/dp/B087654321',
    'https://example.com/not-amazon',
    'Title: Stainless Steel Kitchen Drawer Organizer | Brand: Unbranded | ASIN: B099999999',
    'Acme Medical Device Kit'
  ].join('\n'));
  const results = core.evaluateRows(rows, pack);
  assert.deepEqual(results.map((row) => row.action), ['clear', 'review', 'review', 'clear', 'review']);
  assert.equal(core.copyAmazonLinkPayload(results), [
    'https://www.amazon.com/dp/B012345678',
    'https://www.amazon.com/dp/B099999999'
  ].join('\n'));
  assert.equal(core.copyPayload(results), [rows[0].input, rows[3].input].join('\n'));
});

test('clearance profile freshness is enforced', () => {
  const policy = strictPack().clearancePolicy;
  assert.equal(core.policyProfileIsStale(policy, new Date('2026-09-01T00:00:00.000Z')), false);
  assert.equal(core.policyProfileIsStale({ ...policy, maxAgeDays: 1 }, new Date('2026-09-02T00:00:00.000Z')), true);
});

test('popup routes Product Hunter through the desk and the page states the non-approval boundary', () => {
  const popup = fs.readFileSync(path.join(ROOT, 'extension', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(ROOT, 'extension', 'popup.js'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.html'), 'utf8');
  assert.match(popup, /id="openListingPreflight"/);
  assert.match(popup, /Choose Reviewed Words for Product Hunter/);
  assert.match(popupJs, /openEcomSniperProductHunter[^]+listing-preflight\.html/);
  assert.match(page, /does not call an eBay API/i);
  assert.match(page, /does not mean eBay permits the listing/i);
  assert.match(page, /Invalid or stale policy data fails closed/i);
  assert.match(page, /raw URL, or ASIN never becomes Ready by itself/i);
  assert.match(page, /Copy Ready Links/);
  assert.match(page, /Copy Ready &amp; Open Bulk Poster/);
});

test('preflight renders official policy and community evidence as distinct sources', () => {
  const pageJs = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.js'), 'utf8');
  assert.match(pageJs, /Official eBay policy/);
  assert.match(pageJs, /Discord report/);
  assert.match(pageJs, /Telegram report/);
  assert.match(pageJs, /Official policy profile/);
});

test('reviewed-rule publisher validates source authority, community Review-only, and a fail-closed clearance profile', () => {
  const publisher = fs.readFileSync(path.join(ROOT, 'tools', 'listing-preflight', 'publish-reviewed-rules.ps1'), 'utf8');
  assert.match(publisher, /official-ebay/);
  assert.match(publisher, /profile2-discord/);
  assert.match(publisher, /profile2-telegram/);
  assert.match(publisher, /Community research may publish Review rules only/);
  assert.match(publisher, /review-unless-generic-allowlist/);
  assert.match(publisher, /product-hunter-extension\\policy-rules\.json/);
});

test('Product Research Desk publishes exactly 500 versioned generic words and the mandatory handoff order', () => {
  const output = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'product-research-output.json'), 'utf8'));
  assert.equal(output.schemaVersion, 2);
  assert.match(output.version, /^2\.0\.0-/);
  assert.equal(output.searchSeeds.length, 500);
  assert.equal(new Set(output.searchSeeds.map((seed) => seed.term.toLowerCase())).size, 500);
  assert.ok(output.searchSeeds.every((seed) => !/\b(?:nike|disney|gucci|apple|airpods|vero|replica|licensed|medical device|supplement|weapon|tobacco)\b/i.test(seed.term)));
  assert.deepEqual(output.sourceCoverage.map((source) => source.sourceType), ['official-ebay', 'profile2-discord', 'profile2-telegram']);
  const pack = publishedPack();
  const expectedCounts = ['official-ebay', 'profile2-discord', 'profile2-telegram']
    .map((sourceType) => pack.rules.filter((rule) => rule.sourceType === sourceType).length);
  assert.deepEqual(output.sourceCoverage.map((source) => source.publishedRules), expectedCounts);
  assert.equal(output.sourceCoverage[2].status, 'reviewed-ignore');
  assert.deepEqual(output.workflow.map((step) => step.title), [
    'Choose reviewed generic words',
    'Run Product Hunter',
    'Run Listing Preflight',
    'Continue Ready links only',
    'Final human review'
  ]);
  assert.match(output.disclaimer, /not eBay approval/i);
});
