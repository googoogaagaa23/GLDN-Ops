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
    operatorRuleId: rule.operatorRuleId || '',
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
      id: 'test-keyword-clearance',
      version: '2026-08-31.1',
      mode: 'keyword-blocklist',
      reviewedAt: '2026-08-31',
      maxAgeDays: 3650,
      readyPhrases: ['kitchen drawer organizer', 'desk organizer'],
      genericTokens: ['stainless', 'steel', 'kitchen', 'drawer', 'organizer', 'desk', 'small', 'plain'],
      reviewPhrases: ['fan art', 'licensed', 'compatible with', 'replacement for'],
      genericBrandValues: ['generic', 'unbranded'],
      evidenceUrls: [OFFICIAL_HUB, OFFICIAL_COUNTERFEIT],
      reason: 'Keyword-only test clearance profile.'
    },
    rules: completeRules,
    ...overrides
  };
}

function publishedPack() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight-rules.json'), 'utf8'));
}

const COMPLETE_HUMAN_ATTESTATIONS = [
  'Visual Review: Complete',
  'Image Rights: Owned or Permitted',
  'Description Rights: Original or Permitted',
  'Packaging Review: Generic Unbranded',
  'Source Proof: Retained'
];

function evidenceProduct(overrides = {}) {
  return {
    asin: 'B012345678',
    url: 'https://www.amazon.com/dp/B012345678',
    title: 'Stainless Steel Kitchen Drawer Organizer',
    brand: 'Generic',
    manufacturer: 'Generic',
    categories: ['Kitchen Drawer Organizers'],
    model: '',
    bullets: ['Plain stainless steel kitchen drawer organizer'],
    details: 'Plain kitchen drawer organizer',
    soldBy: 'Example Seller',
    shipsFrom: 'Amazon.com',
    imageUrls: ['https://m.media-amazon.com/images/I/plain-organizer.jpg'],
    imageText: 'Plain product on white background',
    capturedAt: new Date().toISOString(),
    ...overrides
  };
}

function evidenceBundleLine(pack, overrides = {}, attestations = COMPLETE_HUMAN_ATTESTATIONS) {
  const bundle = core.buildProductHunterEvidenceBundle(
    evidenceProduct(overrides),
    pack.clearancePolicy.version
  );
  return [bundle, ...attestations].join(' | ');
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

test('strict rules take precedence while readable no-match product text becomes Ready', () => {
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
  assert.deepEqual(results.map((row) => row.action), ['block', 'review', 'clear', 'clear']);
  assert.match(results[2].reason, /no reviewed prohibited-item or restricted-item keyword matched/i);
  assert.match(results[3].reason, /keyword check, not eBay approval/i);
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
  const inventedOperatorBlock = strictPack([{
    value: 'invented operator block',
    action: 'block',
    sourceType: 'gldn-operator',
    source: 'gldn-operator-reviewed',
    authority: 'GLDN Ops operator rule',
    operatorRuleId: 'GLDN-NO-INVENTED-PRODUCTS'
  }]);
  for (const pack of [countMismatch, communityBlock, inventedOperatorBlock]) {
    const normalized = core.normalizeRulePack(pack);
    assert.equal(normalized.valid, false);
    assert.equal(normalized.ruleCount, 0);
    const [result] = core.evaluateRows([row], pack);
    assert.equal(result.action, 'review');
    assert.match(result.reason, /unavailable or invalid/i);
  }
});

test('published full-hub pack is valid, source-separated, and uses keyword-only clearance', () => {
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
  assert.equal(pack.clearancePolicy.mode, 'keyword-blocklist');
  const official = pack.rules.filter((rule) => rule.sourceType === 'official-ebay');
  const operator = pack.rules.filter((rule) => rule.sourceType === 'gldn-operator');
  const discord = pack.rules.filter((rule) => rule.sourceType === 'profile2-discord');
  const telegram = pack.rules.filter((rule) => rule.sourceType === 'profile2-telegram');
  assert.ok(official.length >= 575);
  assert.equal(operator.length, 2);
  assert.deepEqual(operator.map((rule) => rule.operatorRuleId).sort(), ['GLDN-NO-AEROSOL-SPRAY-CANS', 'GLDN-NO-PESTICIDES']);
  assert.ok(operator.every((rule) => rule.action === 'block' && rule.authority === 'GLDN Ops operator rule'));
  assert.equal(discord.length, 2);
  assert.equal(telegram.length, 0);
  assert.ok(official.every((rule) => rule.evidenceUrls.every((url) => /^https:\/\/(?:www\.)?ebay\.com\/(?:help\/|sellercenter\/)|^https:\/\/ocsnext\.ebay\.com\/help\//.test(url))));
  assert.ok(discord.every((rule) => rule.action === 'review'));
  const coveredUrls = new Set(official.flatMap((rule) => rule.evidenceUrls));
  for (const page of [...raw.policyCoverage.pages, ...raw.policyCoverage.supplementalPages]) {
    assert.ok(coveredUrls.has(page.url), `No direct reviewed decision cites ${page.title}: ${page.url}`);
  }
});

test('GLDN no-list rules block every pesticide and aerosol spray can while leaving ordinary pump bottles separate', () => {
  const rows = core.parseInputRows([
    'EPA Registered Garden Insecticide Pesticide Spray Bottle',
    'Roundup Weed Killer Herbicide Concentrate',
    'Flea and Tick Collar for Dogs',
    'Pool Shock Chlorine Granules',
    'Hospital Disinfectant and Sanitizer Concentrate',
    'Red Aerosol Spray Paint Can',
    'Compressed Canned Air Duster',
    'Olive Oil Cooking Spray Can',
    'Generic Empty Trigger Pump Spray Bottle'
  ].join('\n'));
  const results = core.evaluateRows(rows, publishedPack());
  assert.deepEqual(results.slice(0, 8).map((row) => row.action), Array(8).fill('block'));
  assert.ok(results.slice(0, 5).every((row) => row.matches.some((rule) => rule.operatorRuleId === 'GLDN-NO-PESTICIDES')));
  assert.ok(results.slice(5, 8).every((row) => row.matches.some((rule) => rule.operatorRuleId === 'GLDN-NO-AEROSOL-SPRAY-CANS')));
  assert.notEqual(results[8].action, 'block');
  assert.ok(results[8].matches.every((rule) => rule.sourceType !== 'gldn-operator'));
});

test('full-hub rules classify explicit prohibitions and conditions without stopping ordinary no-match words', () => {
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
  assert.deepEqual(results.map((row) => row.action), ['block', 'review', 'block', 'clear', 'clear', 'clear', 'clear']);
  assert.equal(results[0].matches[0].value.toLowerCase(), 'hidden camera');
  assert.ok(results[1].matches.some((match) => match.value.toLowerCase() === 'universal e-bike charger'));
  assert.equal(results[2].matches[0].value.toLowerCase(), 'deployed airbag');
  assert.equal(results[3].matches.length, 0, 'Snack brand context must not hit the lockpicking Block rule.');
});

test('counterfeit language Blocks while brand names alone do not stop a product', () => {
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
  assert.deepEqual(results.slice(1).map((row) => row.action), [
    'clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'review', 'clear', 'clear'
  ]);
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
  assert.match(result.reason, /bare ASIN or opaque URL|product title or details/i);
});

test('readable pasted product text can become Ready without a Product Hunter bundle', () => {
  const pack = strictPack([{ value: 'medical device', action: 'review' }]);
  const rows = core.parseInputRows([
    'Title: Stainless Steel Kitchen Drawer Organizer | Brand: Generic',
    'Title: Stainless Steel Kitchen Drawer Organizer | Brand: Generic | ASIN: B012345678 | https://www.amazon.com/dp/B012345678',
    `Title: Stainless Steel Kitchen Drawer Organizer | Brand: Generic | ASIN: B012345678 | https://www.amazon.com/dp/B012345678 | ${COMPLETE_HUMAN_ATTESTATIONS.join(' | ')}`
  ].join('\n'));
  const results = core.evaluateRows(rows, pack);
  assert.deepEqual(results.map((row) => row.action), ['clear', 'clear', 'clear']);
  assert.equal(core.copyAmazonLinkPayload(results), 'https://www.amazon.com/dp/B012345678');
});

test('a valid Product Hunter bundle is checked by its product words without extra attestations', () => {
  const pack = strictPack([{ value: 'medical device', action: 'review' }]);
  const bundle = core.buildProductHunterEvidenceBundle(evidenceProduct(), pack.clearancePolicy.version);
  const [result] = core.evaluateRows(core.parseInputRows(bundle), pack);
  assert.equal(result.sourceKind, 'product-hunter-bundle');
  assert.equal(result.evidenceBundleValid, true);
  assert.equal(result.action, 'clear');
  assert.match(result.reason, /keyword check, not eBay approval/i);
  assert.equal(core.copyAmazonLinkPayload([result]), 'https://www.amazon.com/dp/B012345678');
});

test('brand and manufacturer values do not create a review by themselves', () => {
  const pack = publishedPack();
  const fixtures = [
    { brand: 'N/A', manufacturer: 'Generic' },
    { brand: 'none', manufacturer: 'Generic' },
    { brand: 'Generic', manufacturer: 'N/A' },
    { brand: 'Generic', manufacturer: 'none' }
  ];
  for (const fixture of fixtures) {
    const [result] = core.evaluateRows(
      core.parseInputRows(evidenceBundleLine(pack, fixture)),
      pack
    );
    assert.equal(result.action, 'clear', JSON.stringify(fixture));
  }
});

test('tampered and ASIN-mismatched bundles stay Review while readable valid bundles use current rules', () => {
  const pack = strictPack([{ value: 'medical device', action: 'review' }]);
  const complete = evidenceBundleLine(pack);
  const bareBundle = complete.split(' | ')[0];
  const parts = bareBundle.split('.');
  const replacement = parts[2].endsWith('0') ? '1' : '0';
  const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${replacement} | ${COMPLETE_HUMAN_ATTESTATIONS.join(' | ')}`;
  const stale = evidenceBundleLine(pack, { capturedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString() });
  const differentPolicy = {
    ...pack,
    clearancePolicy: { ...pack.clearancePolicy, version: '2026-08-30.9' }
  };
  const policyMismatch = evidenceBundleLine(differentPolicy);
  const asinMismatch = evidenceBundleLine(pack, {
    asin: 'B099999999',
    url: 'https://www.amazon.com/dp/B012345678'
  });
  const results = [bareBundle, tampered, stale, policyMismatch, asinMismatch].map((input) => (
    core.evaluateRows(core.parseInputRows(input), pack)[0]
  ));
  assert.deepEqual(results.map((result) => result.action), ['clear', 'review', 'clear', 'clear', 'review']);
  assert.match(results[1].reason, /checksum does not match/i);
  assert.match(results[4].reason, /incomplete|does not match its Amazon ASIN/i);
});

test('brand and IP cue words alone do not stop otherwise unmatched products', () => {
  const pack = strictPack([{ value: 'medical device', action: 'review' }]);
  const inputs = [
    evidenceBundleLine(pack, { bullets: ['Officially licensed character art'] }),
    evidenceBundleLine(pack, { details: 'Disney fan art logo pattern' }),
    evidenceBundleLine(pack, { imageText: 'Mickey Mouse character logo printed on package' })
  ];
  const results = inputs.map((input) => core.evaluateRows(core.parseInputRows(input), pack)[0]);
  assert.deepEqual(results.map((result) => result.action), ['clear', 'clear', 'clear']);
});

test('arbitrary readable product words clear when no forbidden or restricted rule matches', () => {
  const base = strictPack([{ value: 'medical device', action: 'review' }]);
  const pack = {
    ...base,
    clearancePolicy: {
      ...base.clearancePolicy,
      readyPhrases: [...base.clearancePolicy.readyPhrases, 'napkin ring set', 'tile grout brush'],
      genericTokens: [...base.clearancePolicy.genericTokens, 'napkin', 'ring', 'set', 'tile', 'grout', 'brush']
    }
  };
  const results = ['Ring Kitchen Drawer Organizer', 'Tile Kitchen Drawer Organizer'].map((title) => (
    core.evaluateRows(core.parseInputRows(evidenceBundleLine(pack, { title })), pack)[0]
  ));
  assert.deepEqual(results.map((result) => result.action), ['clear', 'clear']);
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
  assert.equal(results[0].action, 'clear', 'A title word does not match a field-scoped brand rule.');
  assert.equal(results[0].matches.length, 0);
  assert.equal(results[1].action, 'review');
  assert.equal(results[1].matches[0].type, 'brand');
  assert.equal(results[2].action, 'block');
  assert.equal(results[3].action, 'clear');
});

test('copy output contains only Ready Amazon links and excludes unreadable or matched rows', () => {
  const pack = strictPack([{ value: 'medical device', action: 'review' }]);
  const firstBundle = evidenceBundleLine(pack);
  const secondBundle = evidenceBundleLine(pack, {
    asin: 'B099999999',
    url: 'https://www.amazon.com/dp/B099999999',
    brand: 'Unbranded',
    manufacturer: 'Unbranded'
  });
  const rows = core.parseInputRows([
    firstBundle,
    'https://www.amazon.com/dp/B087654321',
    'https://example.com/not-amazon',
    secondBundle,
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

test('popup opens Product Hunter and the paste-first policy check directly', () => {
  const popup = fs.readFileSync(path.join(ROOT, 'extension', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(ROOT, 'extension', 'popup.js'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.html'), 'utf8');
  const pageJs = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.js'), 'utf8');
  assert.match(popup, /id="openListingPreflight"/);
  assert.match(popup, /Open EcomSniper Product Hunter/);
  assert.match(popup, /Open Listing Policy Check/);
  assert.match(popupJs, /openEcomSniperProductHunter[^]+openEcomSniperPage\('productHunter'/);
  assert.match(popupJs, /preflightBulkPosterClipboard[^]+listing-preflight\.html/);
  assert.match(page, /does not call an eBay API/i);
  assert.match(page, /not eBay approval/i);
  assert.match(page, /No copied handoff is required/i);
  assert.match(page, /A brand name alone does not stop a product/i);
  assert.match(page, /Copy Ready Links/);
  assert.match(page, /id="copyAndOpenProductHunter"[^>]*disabled>Copy Ready &amp; Open Bulk Poster</i);
  assert.match(pageJs, /byId\(['"]copyAndOpenProductHunter['"]\)\.disabled\s*=\s*!summary\.clear/);
  assert.match(pageJs, /copyAmazonLinkPayload\(latestResults, ['"]clear['"]\)/);
  assert.match(pageJs, /targetPage\s*=\s*['"]bulkPoster['"]/);
  assert.match(pageJs, /openEcomSniperPage['"],?\s*page:\s*targetPage|openEcomSniperPage['"][^]+page:\s*targetPage/);
});

test('preflight hides research words and source cards and reads links in one inactive Amazon tab', () => {
  const page = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.html'), 'utf8');
  const pageJs = fs.readFileSync(path.join(ROOT, 'extension', 'listing-preflight.js'), 'utf8');
  assert.doesNotMatch(page, /Current lower-risk starting words|Official eBay policy|EcomSniper Discord|EcomSniper Telegram/);
  assert.match(pageJs, /chrome\.tabs\.create\(\{ url, active: false \}\)/);
  assert.match(pageJs, /collectListingPolicyProduct/);
  assert.match(pageJs, /gldnListingPolicyProductCacheV1/);
});

test('reviewed-rule publisher validates source authority, community Review-only, and a fail-closed clearance profile', () => {
  const publisher = fs.readFileSync(path.join(ROOT, 'tools', 'listing-preflight', 'publish-reviewed-rules.ps1'), 'utf8');
  assert.match(publisher, /official-ebay/);
  assert.match(publisher, /gldn-operator/);
  assert.match(publisher, /profile2-discord/);
  assert.match(publisher, /profile2-telegram/);
  assert.match(publisher, /Community research may publish Review rules only/);
  assert.match(publisher, /keyword-blocklist/);
  assert.match(publisher, /product-hunter-extension\\policy-rules\.json/);
});

test('the separate research artifact remains source-auditable without controlling operator input', () => {
  const output = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'product-research-output.json'), 'utf8'));
  assert.equal(output.schemaVersion, 2);
  assert.match(output.version, /^2\.1\.0-/);
  assert.equal(output.searchSeeds.length, 500);
  assert.equal(new Set(output.searchSeeds.map((seed) => seed.term.toLowerCase())).size, 500);
  assert.ok(output.searchSeeds.every((seed) => !/\b(?:nike|disney|gucci|apple|airpods|vero|replica|licensed|medical device|supplement|weapon|tobacco)\b/i.test(seed.term)));
  assert.deepEqual(output.sourceCoverage.map((source) => source.sourceType), ['official-ebay', 'profile2-discord', 'profile2-telegram']);
  const pack = publishedPack();
  const expectedCounts = ['official-ebay', 'profile2-discord', 'profile2-telegram']
    .map((sourceType) => pack.rules.filter((rule) => rule.sourceType === sourceType).length);
  assert.deepEqual(output.sourceCoverage.map((source) => source.publishedRules), expectedCounts);
  assert.equal(output.sourceCoverage[2].status, 'reviewed-ignore');
  assert.match(output.disclaimer, /not eBay approval/i);
});
