const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/listing-preflight-core.js');
const audit = require('../extension/policy-listing-audit-core.js');
const pack = require('../extension/listing-preflight-rules.json');
const hunterPack = require('../product-hunter-extension/policy-rules.json');

test('IP refresh is valid, shared with Product Hunter and preserves older hub review dates', () => {
  assert.equal(core.normalizeRulePack(pack).valid, true);
  assert.deepEqual(hunterPack, pack);
  assert.equal(pack.policyCoverage.ipReview.reviewedAt, '2026-09-13');
  assert.equal(pack.policyCoverage.reviewedAt, '2026-08-31');
  assert.equal(pack.clearancePolicy.reviewedAt, '2026-08-31');
  assert.equal(pack.rules.filter((rule) => rule.sourceType === 'gldn-operator').length, 2);
  assert.equal(pack.rules.filter((rule) => /discord|telegram/.test(rule.sourceType) && rule.action === 'block').length, 0);
});

const samples = [
  ['Zeta knockoff designer handbag', 'block'],
  ['Knock-offs designer handbags', 'block'],
  ['Unauthorized character merchandise logo decals', 'block'],
  ['Unauthorised copies of protected artwork', 'block'],
  ['Unlicensed logo patches', 'block'],
  ['Bootleg DVDs movie collection', 'block'],
  ['Pirated software collection', 'block'],
  ['Copied product photos without permission', 'block'],
  ['Unknownbrand perfume dupe', 'review'],
  ['Mirror quality luxury handbag', 'review'],
  ['Museum replica ceramic sculpture', 'review'],
  ['Fan-made character mug', 'review'],
  ['Disney Mickey Mouse stickers officially licensed', 'review'],
  ['Pokemon Pikachu plush toy', 'review'],
  ['NFL jersey home colors', 'review'],
  ['Replacement logo car badge', 'review'],
  ['Genuine OEM emblem', 'review'],
  ['Bosch drill bit set', 'clear'],
  ['Bosch drill with manufacturer warranty', 'clear'],
  ['Genuine OEM replacement water filter compatible with Samsung', 'clear'],
  ['AAA quality alkaline batteries', 'clear'],
  ['Nature inspired by mountain scenery wall print', 'clear'],
  ['Fancy Feast canned cat food', 'clear'],
  ['Nike running shoes', 'clear'],
  ['Samsung phone charger', 'clear'],
  ['Replacement filter fits Dyson V10', 'clear'],
  ['Silicone case compatible with iPhone 15', 'clear'],
  ['Empty refillable trigger pump spray bottle', 'clear'],
  ['Generic silicone phone case fits iPhone 15', 'clear'],
  ['White ceramic mug blank', 'clear'],
  ['Garden insecticide', 'block'],
  ['Blue aerosol spray paint can', 'block']
];

test('preflight and existing-listing audit use the same stronger, targeted IP decisions', () => {
  for (const [title, expected] of samples) {
    const row = { title, input: title, hasProductEvidence: true, asins: ['B012345678'] };
    const result = core.evaluateRows([row], pack)[0];
    assert.equal(result.action, expected, title);
    const existing = audit.buildPolicyAudit([{ itemId: '300000000001', title }], pack, {}, core);
    assert.equal(existing.listings[0].action, expected, `existing: ${title}`);
    if (expected !== 'clear') assert.equal(core.copyAmazonLinkPayload([result]), '', 'review and block links cannot enter the bulk handoff');
  }
});

test('changing-store coverage survives audit storage metadata without relaxing ending approval', () => {
  const coverage = { followUpRecommended: true, initialTotal: 18640, latestTotal: 18641, observedUnique: 2, duplicatesRemoved: 1 };
  const result = audit.buildPolicyAudit([
    { itemId: '300000000001', title: 'Knockoff designer handbag' },
    { itemId: '300000000002', title: 'Disney Mickey Mouse stickers' }
  ], pack, { coverage }, core);
  assert.deepEqual(result.coverage, coverage);
  assert.equal(result.source, 'changing-active-listings-policy-snapshot');
  assert.deepEqual(audit.blockItemIds(result, ['300000000001']), ['300000000001']);
  assert.throws(() => audit.blockItemIds(result, ['300000000002']), /not a current reviewed Block/);
});
