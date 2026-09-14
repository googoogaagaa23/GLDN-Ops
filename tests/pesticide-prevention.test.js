const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const preflight = require('../extension/listing-preflight-core');
const audit = require('../extension/policy-listing-audit-core');
const hunter = require('../product-hunter-extension/hunter-core');
const hunterPolicy = require('../product-hunter-extension/policy-core');
const pack = require('../extension/listing-preflight-rules.json');

const blockedTitles = [
  'Houseplant & Garden Insect Killer for Organic Gardening 32 Oz',
  'Neem Oil & Peppermint Plant Nutrient Spray Natural Leaf Shine for Indoor Plants',
  'Septic Chlorine Tablet 6 Tablet Pail NOT for USE in Swimming Pools',
  'Toy Disinfectant Spray Kills 99.9% of Viruses and Bacteria Rinse Free',
  'Rooting Gel High Performance Rooting Compound for Plant Cuttings',
  'Rodent Repellent Spray Peppermint Oil for Mice',
  'Mosquito Repellents for Camping', 'Ant-Killer Granules', 'Mosquito Repellant Pump Spray',
  'Natural Organic Garden Pestiside', 'Disinfectent Spray for Toys',
  'Weed\u2011Killer Ready to Use', 'Flea & Tick Treatment Drops for Dogs',
  'Moth Balls Cedar Scented', 'Slug Bait Pellets', 'Mouse Poison Bait Blocks',
  'Mice Repellent Pouches Peppermint', 'Natural Spray Repels Indoor Rodents',
  'Cleaner Kills 99.9% of Bacteria', 'Spray Eliminates Germs and Viruses',
  'Surface Antimicrobial Wipes 75 Count', 'Antibacterial Kitchen Cleaner',
  'Plant Growth Regulators Concentrate', 'Rooting Powder Plant Hormone',
  'Indole-3-Butyric Acid Rooting Solution', 'Neem Oil for Houseplants Leaf Shine',
  'Peppermint Oil Garden Plant Spray', 'Citronella Candles Outdoor',
  'Mosquito Dunks for Standing Water', 'Mosquito Bits Larvicide',
  'Water Purification Tablets Camping', 'Water Purification Drops',
  'Bromine Tablets for Hot Tubs', 'Chlorine Granules for Septic Systems',
  'Spa Shock Treatment', 'Diatomaceous Earth Crawling Insect Control',
  'Boric Acid Ant Bait', 'Permethrin Clothing Treatment', 'Pyrethrins Concentrate',
  'EPA Registered Natural Garden Care Concentrate', 'Glyphosate Concentrate',
  'Fungicides for Garden Plants', 'Tick Collar for Dogs', 'Insecticidal Soap Concentrate',
  'Natural Organic Pet Safe Insect Repelling Spray', 'Plant Spray Prevents Aphids',
  'Pesticide-free Packaging with Included Ant Killer',
  'Ant Killer with Empty Spray Bottle Included',
  'Fast Liquid Kills Tough Ants and Roaches', 'Natural Spray Repels Rats',
  'Flying Insect Spray Kills Flies', 'Granules Kills Moles', 'Liquid Repels Mice'
];
const ordinaryTitles = [
  'Empty Trigger Pump Spray Bottle', 'Replacement Garden Sprayer Nozzle',
  'Stackable Storage Bins', 'Garden Gloves for Weeding', 'Handheld Mechanical Weed Puller',
  'Plant Propagation Station Glass Tubes', 'Rooting Plant Cuttings Holder',
  'Nutrition Only Plant Fertilizer 10-10-10', 'Septic Tank Lid Cover',
  'Swimming Pool Vacuum Brush', 'Chlorine Test Strips', 'Chlorine-Free Water Filter',
  'Bacteria Culture for Composting', 'Ant Farm Habitat', 'Computer Mouse Wireless Control',
  'Peppermint Oil Aromatherapy', 'Neem Oil Cosmetic Hair Conditioner',
  'Organic Pesticide-Free Cotton Fabric', 'Vegetable Seeds Without Pesticides',
  'Antimicrobial Shelf Liner', 'Stainless Steel Water Bottle', 'Flea Comb for Dogs'
];
const isPesticide = (row) => row.matches.some((rule) => rule.operatorRuleId === 'GLDN-NO-PESTICIDES');

test('pesticide policy pack is valid, targeted and identical in Product Hunter', () => {
  assert.equal(preflight.normalizeRulePack(pack).valid, true);
  assert.equal(pack.version, '2026-09-13.3');
  assert.deepEqual(pack, require('../product-hunter-extension/policy-rules.json'));
  assert.equal(pack.clearancePolicy.reviewedAt, '2026-08-31');
  assert.equal(pack.policyCoverage.pesticideReview.reviewedAt, '2026-09-13');
  assert.ok(pack.rules.filter((rule) => rule.operatorRuleId === 'GLDN-NO-PESTICIDES').every((rule) =>
    rule.action === 'block' && rule.sourceType === 'gldn-operator'));
});
test('observed removal families, variants and claims all hard-block before copy', () => {
  const rows = blockedTitles.map((title, index) => ({ title, asins: [`B${String(index).padStart(9, '0')}`] }));
  const results = preflight.evaluateRows(rows, pack);
  for (const result of results) {
    assert.equal(result.action, 'block', result.title);
    assert.ok(isPesticide(result), result.title);
  }
  assert.equal(preflight.copyAmazonLinkPayload(results), '');
});
test('ordinary tools containers and non-pesticidal claims are not pesticide blocks', () => {
  for (const row of preflight.evaluateRows(ordinaryTitles.map((title) => ({ title })), pack)) {
    assert.equal(isPesticide(row), false, row.title);
    assert.notEqual(row.action, 'block', row.title);
  }
});
test('product evidence fields cannot hide pesticide claims behind a harmless title', () => {
  for (const field of ['input', 'title', 'brand', 'manufacturer', 'category', 'model', 'bullets', 'details', 'imageText']) {
    const [result] = preflight.evaluateRows([{ title: 'Garden Care Refill', [field]: 'Kills 99.9% of bacteria' }], pack);
    assert.equal(result.action, 'block', field);
  }
});
test('existing-store checks apply the same pesticide hard blocks to every affected title', () => {
  const items = blockedTitles.map((title, index) => ({ title, itemId: String(123450000000 + index), price: 25 }));
  const result = audit.buildPolicyAudit(items, pack, { scannedAt: '2026-09-13T12:00:00Z' }, preflight);
  assert.equal(result.listings.length, blockedTitles.length);
  assert.ok(result.listings.every((row) => row.action === 'block' && isPesticide(row)));
});
test('Product Hunter rejects pesticide search and detail results with filters disabled', () => {
  for (const phase of ['search', 'detail']) {
    for (const title of blockedTitles) {
      const result = hunter.classifyProduct({
        title, asin: 'B012345678', url: 'https://www.amazon.com/dp/B012345678',
        brand: 'Ordinary Brand', categories: ['Garden'], bullets: [], details: title,
        price: '$25.99', availability: 'In Stock', rating: '4.8', reviewCount: '1000'
      }, pack, { excludeFashion: false, excludeSponsored: false, requireInStock: false }, null,
      { phase, policyApi: hunterPolicy, now: '2026-09-13T12:00:00Z' });
      assert.equal(result.status, hunter.STATUS.BLOCKED, `${phase}: ${title}`);
      assert.equal(result.policyAction, 'block', title);
    }
  }
});
test('pesticide normalization does not loosen unrelated exact IP matching', () => {
  const [result] = preflight.evaluateRows([{ title: 'Replacement anti-counterfeit-detector label' }], {
    rules: [{ id: 'test', type: 'keyword', value: 'counterfeit detector', action: 'block' }]
  });
  assert.notEqual(result.action, 'block');
});
test('full-hub rebuild preserves the newer pesticide prevention refresh', () => {
  assert.match(fs.readFileSync(require.resolve('../tools/listing-preflight/rebuild-official-policy-pack.mjs'), 'utf8'), /refreshPesticidePolicyPack\(\)/);
});

test('old saved Ready pesticides are rechecked before export and copy-history writes', () => {
  const oldReady = blockedTitles.map((title, i) => ({ title, asin: `B${String(i).padStart(9, '0')}`, status: hunter.STATUS.READY }));
  const ordinary = { title: 'Empty Trigger Pump Spray Bottle', asin: 'B999999999', status: hunter.STATUS.READY };
  const selected = hunter.recheckReadyProducts([...oldReady, ordinary], pack, hunterPolicy);
  assert.deepEqual(selected, [ordinary]);
  assert.equal(hunter.recheckReadyProducts([ordinary], { ...pack, rules: [] }, hunterPolicy).length, 0);
  assert.throws(() => hunter.recheckReadyProducts([ordinary], pack, {}), /Nothing can be copied/);
  const source = fs.readFileSync(require.resolve('../product-hunter-extension/background.js'), 'utf8');
  assert.match(source.slice(source.indexOf('async function readyPayload()'), source.indexOf('async function openDashboard(')), /CORE\.recheckReadyProducts/g);
  assert.equal((source.match(/CORE\.recheckReadyProducts/g) || []).length, 2);
});
