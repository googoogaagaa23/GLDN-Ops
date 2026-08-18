'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const core = require(path.join(projectRoot, 'product-hunter-extension', 'hunter-core.js'));
const policy = require(path.join(projectRoot, 'product-hunter-extension', 'policy-core.js'));
const rulePack = JSON.parse(fs.readFileSync(path.join(projectRoot, 'product-hunter-extension', 'policy-rules.json'), 'utf8'));

function product(overrides = {}) {
  return {
    asin: 'B012345678',
    url: 'https://www.amazon.com/example/dp/B012345678?tag=test',
    title: 'Stainless Steel Mixing Bowl Set with Lids',
    brand: 'Kitchen Works',
    categories: ['Home & Kitchen', 'Kitchen & Dining'],
    bullets: ['Dishwasher safe durable kitchen bowls'],
    details: 'Six piece nesting bowl set for food preparation and storage.',
    availability: 'In Stock',
    price: '$24.99',
    rating: '4.6 out of 5 stars',
    reviewCount: '1,234 ratings',
    keyword: 'mixing bowls',
    searchPage: 1,
    sponsored: false,
    ...overrides
  };
}

function classify(overrides = {}, settings = {}, historyEntry = null, phase = 'detail') {
  return core.classifyProduct(product(overrides), rulePack, settings, historyEntry, {
    phase,
    policyApi: policy,
    now: '2026-08-09T12:00:00.000Z'
  });
}

test('loads the reviewed official eBay policy pack', () => {
  assert.equal(rulePack.ruleCount, 175);
  assert.equal(rulePack.rules.length, 175);
  assert.equal(rulePack.rules.filter((rule) => rule.action === 'block').length, 130);
  assert.equal(rulePack.rules.filter((rule) => rule.action === 'review').length, 45);
});

test('normalizes configurable hunt limits', () => {
  const settings = core.normalizeSettings({
    computerLabel: '  M0  ', desiredReady: 0, maxPagesPerKeyword: 99, maxCandidates: 20,
    minPrice: 10, maxPrice: 5, minRating: 8, minReviews: -2, reuseDays: 500,
    excludeFashion: false, excludeSponsored: false, requireInStock: false, navigationDelayMs: 20
  });
  assert.equal(settings.computerLabel, 'M0');
  assert.equal(settings.desiredReady, 1);
  assert.equal(settings.maxPagesPerKeyword, 20);
  assert.equal(settings.maxCandidates, 100);
  assert.equal(settings.minPrice, 10);
  assert.equal(settings.maxPrice, 10);
  assert.equal(settings.minRating, 5);
  assert.equal(settings.minReviews, 0);
  assert.equal(settings.reuseDays, 365);
  assert.equal(settings.excludeAlreadyListed, true);
  assert.equal(settings.excludeFashion, false);
  assert.equal(settings.excludeSponsored, false);
  assert.equal(settings.requireInStock, false);
  assert.equal(settings.navigationDelayMs, 1000);
});

test('decodes direct and eComSniper-style encoded ASIN values from eBay SKUs', () => {
  assert.equal(core.decodeSkuToAsin('B012345678'), 'B012345678');
  assert.equal(core.decodeSkuToAsin(Buffer.from('B087654321').toString('base64')), 'B087654321');
  assert.equal(core.decodeSkuToAsin('not-a-product-sku'), '');
});

test('builds a verified complete eBay index and detects exact ASIN and title matches', () => {
  const index = core.buildEbayListingIndex([
    { itemId: '123456789012', title: 'Stainless Steel Mixing Bowl Set with Lids', sku: 'B012345678', price: '$39.99' },
    { itemId: '123456789013', title: 'Solar Garden Lights Set', sku: Buffer.from('B087654321').toString('base64'), price: '$24.99' }
  ], { verified: true, totalListings: 2, computerLabel: '0', accountLabel: 'FAK12' });
  assert.equal(index.verified, true);
  assert.equal(index.recordCount, 2);
  assert.equal(index.asinCount, 2);
  assert.equal(core.findAlreadyListedMatch(product(), index).type, 'asin');
  assert.equal(core.findAlreadyListedMatch(product({ asin: 'B000000000' }), index).type, 'title');

  const incomplete = core.buildEbayListingIndex([
    { itemId: '123456789012', title: 'Only One Row', sku: 'B012345678' }
  ], { verified: true, totalListings: 2 });
  assert.equal(incomplete.verified, false);
});

test('protects Product Hunter from exact active eBay duplicates', () => {
  const index = core.buildEbayListingIndex([
    { itemId: '123456789012', title: 'Stainless Steel Mixing Bowl Set with Lids', sku: 'B012345678' }
  ], { verified: true, totalListings: 1, computerLabel: '0' });
  const exact = core.classifyProduct(product(), rulePack, { excludeAlreadyListed: true }, null, {
    phase: 'detail', policyApi: policy, ebayIndex: index, now: '2026-08-09T12:00:00.000Z'
  });
  assert.equal(exact.status, core.STATUS.EXCLUDED);
  assert.match(exact.reason, /already active on ebay/i);
  assert.equal(exact.ebayListingMatch.records[0].itemId, '123456789012');

  const possible = core.classifyProduct(product({ asin: 'B000000000' }), rulePack, { excludeAlreadyListed: true }, null, {
    phase: 'detail', policyApi: policy, ebayIndex: index, now: '2026-08-09T12:00:00.000Z'
  });
  assert.equal(possible.status, core.STATUS.REVIEW);
  assert.match(possible.reason, /possible ebay duplicate/i);
});

test('imports quoted eBay Active Listings CSV rows without string splitting', () => {
  const csv = [
    'Item number,Title,Custom label (SKU),Current price',
    '123456789012,"Bowl Set, Stainless Steel",B012345678,$39.99',
    `123456789013,Solar Lights,${Buffer.from('B087654321').toString('base64')},$24.99`
  ].join('\r\n');
  const parsed = core.parseEbayActiveListingsCsv(csv);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].title, 'Bowl Set, Stainless Steel');
  assert.equal(parsed.records[1].asin, 'B087654321');
});

test('parses Amazon prices, ratings, counts, and canonical links', () => {
  assert.equal(core.parsePrice('US $1,249.50'), 1249.5);
  assert.equal(core.parseRating('4.7 out of 5 stars'), 4.7);
  assert.equal(core.parseCount('1.2K ratings'), 1200);
  assert.equal(core.parseCount('2,087'), 2087);
  assert.equal(core.canonicalAmazonUrl('https://www.amazon.com/name/dp/B012345678?ref=x'), 'https://www.amazon.com/dp/B012345678');
});

test('marks a fully evidenced clear product Ready without implying eBay approval', () => {
  const result = classify();
  assert.equal(result.status, core.STATUS.READY);
  assert.match(result.reason, /not eBay approval/i);
  assert.equal(result.price, 24.99);
  assert.equal(result.rating, 4.6);
  assert.equal(result.reviewCount, 1234);
});

test('blocks a product matched by an official eBay prohibited-item rule', () => {
  const result = classify({ title: 'Fresh Ackee Fruit Imported Food', details: 'Canned ackee fruit.' });
  assert.equal(result.status, core.STATUS.BLOCKED);
  assert.match(result.reason, /prohibits ackee fruit/i);
  assert.ok(result.policyMatches.some((match) => match.evidenceUrls.includes('https://www.ebay.com/help/policies/prohibited-restricted-items/food-policy?id=4295')));
});

test('routes a restricted-policy ambiguity to Review', () => {
  const result = classify({ title: 'Portable Baby Nest Lounger', details: 'Soft infant resting nest.' });
  assert.equal(result.status, core.STATUS.REVIEW);
  assert.match(result.reason, /baby nest/i);
});

test('excludes fashion and sponsored products before detail processing', () => {
  assert.equal(classify({ title: 'Women Fashion Leather Crossbody Handbag' }).status, core.STATUS.EXCLUDED);
  assert.match(classify({ sponsored: true }).reason, /sponsored/i);
});

test('enforces price, rating, review-count, and stock filters', () => {
  assert.match(classify({ price: 8 }, { minPrice: 10 }).reason, /outside/i);
  assert.match(classify({ rating: 3.9 }, { minRating: 4.2 }).reason, /below/i);
  assert.match(classify({ reviewCount: 12 }, { minReviews: 25 }).reason, /below/i);
  assert.equal(classify({ availability: 'Currently unavailable' }).status, core.STATUS.EXCLUDED);
  assert.equal(classify({ availability: '' }, { requireInStock: true }).status, core.STATUS.REVIEW);
});

test('requires missing rating or review evidence when a minimum is configured', () => {
  assert.match(classify({ rating: '' }, { minRating: 4 }).reason, /rating could not be verified/i);
  assert.match(classify({ reviewCount: '' }, { minReviews: 10 }).reason, /review count could not be verified/i);
});

test('keeps search-only clear products queued until the full product page is read', () => {
  const result = classify({ details: '', availability: '' }, {}, null, 'search');
  assert.equal(result.status, core.STATUS.QUEUED);
});

test('excludes ASINs copied inside the configured reuse window', () => {
  const result = classify({}, { reuseDays: 60 }, { usedAt: '2026-07-20T12:00:00.000Z' });
  assert.equal(result.status, core.STATUS.EXCLUDED);
  assert.match(result.reason, /last 60 days/i);
});

test('creates resumable jobs and deduplicates keywords', () => {
  const job = core.createJob({ keywords: 'mixing bowls\nMixing Bowls\nsolar lights', settings: { computerLabel: '2' } }, '2026-08-09T12:00:00.000Z');
  assert.deepEqual(job.keywords, ['mixing bowls', 'solar lights']);
  assert.equal(job.status, 'running');
  assert.equal(job.phase, 'search');
  assert.equal(job.settings.computerLabel, '2');
});

test('copies only unique Ready links and records auditable decisions', () => {
  const ready = classify();
  const blocked = classify({ asin: 'B087654321', url: 'https://www.amazon.com/dp/B087654321', title: 'Fresh Ackee Fruit' });
  assert.deepEqual(core.readyLinks([ready, blocked, ready]), ['https://www.amazon.com/dp/B012345678']);
  const csv = core.buildAuditCsv([ready, blocked]);
  assert.match(csv, /Rating,Review Count/);
  assert.match(csv, /B012345678/);
  assert.match(csv, /blocked/i);
});

test('marks and prunes the cross-run ASIN history', () => {
  const ready = classify();
  const history = core.markHistory({}, [ready], { jobId: 'hunt-1', computerLabel: 'M1' }, '2026-08-09T12:00:00.000Z');
  assert.equal(history.B012345678.computerLabel, 'M1');
  assert.equal(Object.keys(core.pruneHistory(history, '2026-08-10T12:00:00.000Z', 400)).length, 1);
  assert.equal(Object.keys(core.pruneHistory(history, '2028-01-20T12:00:00.000Z', 400)).length, 0);
});
