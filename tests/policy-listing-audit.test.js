const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const preflight = require(path.join(ROOT, 'extension', 'listing-preflight-core.js'));
const policyAudit = require(path.join(ROOT, 'extension', 'policy-listing-audit-core.js'));

const rulePack = {
  schemaVersion: 1,
  generatedAt: '2026-08-09T00:00:00.000Z',
  rules: [
    {
      id: 'block-baby-nest',
      type: 'keyword',
      value: 'baby nest',
      action: 'block',
      reason: 'Reviewed prohibited-product signal.',
      reviewedAt: '2026-08-09',
      source: 'official-policy',
      evidenceUrls: ['https://example.test/policy']
    },
    {
      id: 'review-laser',
      type: 'keyword',
      value: 'laser pointer',
      action: 'review',
      reason: 'Manual policy review required.',
      reviewedAt: '2026-08-09',
      source: 'official-policy'
    }
  ]
};

test('existing listing audit classifies every unique item and decodes SKU ASINs', () => {
  const encodedAsin = Buffer.from('B012345678').toString('base64');
  const audit = policyAudit.buildPolicyAudit([
    { itemId: '123456789012', title: 'Portable Baby Nest Sleeper', sku: encodedAsin, price: 29.99 },
    { itemId: '123456789013', title: 'Green Laser Pointer', sku: 'LOCAL-SKU', price: 9.99 },
    { itemId: '123456789014', title: 'Stainless Steel Measuring Cups', sku: 'B087654321', price: 14.99 }
  ], rulePack, {
    scannedAt: '2026-08-09T12:00:00.000Z',
    computerLabel: '0',
    ebayAccountLabel: 'FAK12'
  }, preflight);

  assert.equal(audit.totalListings, 3);
  assert.deepEqual(audit.summary, { total: 3, clear: 0, review: 2, block: 1, authenticityReview: 0 });
  assert.equal(audit.listings.find((row) => row.itemId === '123456789012').asin, 'B012345678');
  assert.equal(audit.listings.find((row) => row.itemId === '123456789012').action, 'block');
  assert.equal(audit.listings.find((row) => row.itemId === '123456789013').action, 'review');
  assert.equal(audit.listings.find((row) => row.itemId === '123456789014').action, 'review');
  assert.match(
    audit.listings.find((row) => row.itemId === '123456789014').reason,
    /Existing-listing evidence is limited|No valid generic-only clearance profile is loaded/i
  );
  assert.equal(audit.listings.find((row) => row.itemId === '123456789013').price, 9.99);
  assert.match(audit.reportFingerprint, /^policy-listings-/);
  assert.match(audit.rulesFingerprint, /^policy-rules-/);
});

test('only current reviewed Block rows can enter an end batch', () => {
  const audit = policyAudit.buildPolicyAudit([
    { itemId: '123456789012', title: 'Portable Baby Nest Sleeper' },
    { itemId: '123456789013', title: 'Green Laser Pointer' },
    { itemId: '123456789014', title: 'Stainless Steel Measuring Cups' }
  ], rulePack, {
    scannedAt: '2026-08-09T12:00:00.000Z',
    computerLabel: '0',
    ebayAccountLabel: 'FAK12'
  }, preflight);

  assert.deepEqual(policyAudit.blockItemIds(audit, ['123456789012'], []), ['123456789012']);
  assert.throws(() => policyAudit.blockItemIds(audit, ['123456789013'], []), /not a current reviewed Block match/);
  assert.throws(() => policyAudit.blockItemIds(audit, ['123456789014'], []), /not a current reviewed Block match/);
  assert.throws(() => policyAudit.blockItemIds(audit, ['123456789012'], ['123456789012']), /already recorded as ended/);
  assert.throws(() => policyAudit.blockItemIds(audit, ['123456789012', '123456789012'], []), /unique Block listings/);
});

test('an eBay missing-listing response never counts as a successful End', () => {
  const outcome = policyAudit.normalizeEndSubmissionOutcome(
    ['123456789012'],
    {
      ok: true,
      messageType: 'INFO',
      message: 'Listing item is missing.'
    }
  );
  assert.deepEqual(outcome.successfulItemIds, []);
  assert.deepEqual(outcome.failedItemIds, ['123456789012']);
  assert.equal(outcome.globalFailure, true);
});

test('explicit per-listing End failures preserve successful item IDs', () => {
  const outcome = policyAudit.normalizeEndSubmissionOutcome(
    ['123456789012', '123456789013'],
    {
      ok: true,
      messageType: 'SUCCESS',
      failedItemIds: ['123456789013']
    }
  );
  assert.deepEqual(outcome.successfulItemIds, ['123456789012']);
  assert.deepEqual(outcome.failedItemIds, ['123456789013']);
});

test('control readback keeps exact totals and Block evidence without every listing row', () => {
  const audit = policyAudit.buildPolicyAudit([
    { itemId: '123456789012', title: 'Portable Baby Nest Sleeper', sku: 'B012345678', price: 29.99 },
    { itemId: '123456789013', title: 'Green Laser Pointer', sku: 'LOCAL-SKU', price: 9.99 },
    { itemId: '123456789014', title: 'Stainless Steel Measuring Cups', sku: 'B087654321', price: 14.99 }
  ], rulePack, {
    scannedAt: '2026-08-09T12:00:00.000Z',
    computerLabel: '0',
    ebayAccountLabel: 'FAK12'
  }, preflight);

  const compact = policyAudit.compactControlRecord(audit);
  assert.deepEqual(compact.summary, { total: 3, clear: 0, review: 2, block: 1, authenticityReview: 0 });
  assert.equal(compact.totalListings, 3);
  assert.equal(compact.blockListings.length, 1);
  assert.equal(compact.blockListings[0].itemId, '123456789012');
  assert.equal(compact.blockListings[0].price, 29.99);
  assert.equal(compact.blockListingsTruncated, false);
  assert.equal(Object.hasOwn(compact, 'listings'), false);
});

test('policy audit CSV keeps both classifications and reviewed evidence', () => {
  const audit = policyAudit.buildPolicyAudit([
    { itemId: '123456789012', title: 'Portable Baby Nest Sleeper', price: 29.99 }
  ], rulePack, {
    scannedAt: '2026-08-09T12:00:00.000Z',
    computerLabel: '0',
    ebayAccountLabel: 'FAK12'
  }, preflight);
  const csv = policyAudit.auditCsv(audit);
  assert.match(csv, /Classification/);
  assert.match(csv, /123456789012/);
  assert.match(csv, /block:keyword:baby nest/);
  assert.match(csv, /https:\/\/example\.test\/policy/);
});

test('background policy workflow is resumable, exact, approval-gated, and stops after submit', () => {
  const background = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
  assert.match(background, /policy-listing-audit-core\.js/);
  assert.match(background, /const POLICY_LISTING_END_BATCH_LIMIT = 200/);
  assert.match(background, /ebayPolicyListingScanChunk:/);
  assert.match(background, /readCompletePolicyListingScan/);
  assert.match(background, /records\.length !== total \|\| seen\.size !== total/);
  assert.match(background, /POLICY_LISTING_AUDIT\.buildPolicyAudit/);
  assert.match(background, /policyaudit:\s*'policy-listing-audit\.html'/);
  assert.match(background, /audit is older than 48 hours/i);
  assert.match(background, /reviewed policy rules changed/i);
  assert.match(background, /APPROVE END POLICY LISTINGS \$\{expectedCount\}/);
  assert.match(background, /message\.type === 'scanEbayPolicyListings'/);
  assert.match(background, /message\.type === 'prepareEbayPolicyListingEndReview'/);
  assert.match(background, /message\.type === 'submitEbayPolicyListingEndReview'/);
  assert.match(background, /message\.type === 'cancelEbayPolicyListingEndReview'/);
  const submitStart = background.indexOf('async function submitEbayPolicyListingEndReview');
  const submitEnd = background.indexOf('\nfunction openTab', submitStart);
  const submitSource = background.slice(submitStart, submitEnd);
  assert.match(submitSource, /stopped: true/);
  assert.doesNotMatch(submitSource, /prepareEbayPolicyListingEndReview\(/);
});

test('Profile 2 control can run only the complete read-only policy scan', () => {
  const background = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
  const control = fs.readFileSync(path.join(ROOT, 'tools', 'gldn-control.ps1'), 'utf8');
  const agent = fs.readFileSync(path.join(ROOT, 'tools', 'gldn-update-agent.ps1'), 'utf8');
  assert.match(background, /'policy-listing-scan'/);
  assert.match(control, /"policy-listing-scan"/);
  assert.match(agent, /"policy-listing-scan"/);
  const start = background.indexOf("if (action === 'policy-listing-scan')");
  const end = background.indexOf('const result = await seedDashboardSetupFromLocalConfig', start);
  const source = background.slice(start, end);
  assert.match(source, /cancelEbayPolicyListingEndReview\(\)/);
  assert.match(source, /scanEbayPolicyListings\(\{ fresh: true \}/);
  assert.doesNotMatch(source, /prepareEbayPolicyListingEndReview|submitEbayPolicyListingEndReview/);
});

test('policy audit page exposes complete recovery and CSV review but guards all listing-ending controls off', () => {
  const ebay = fs.readFileSync(path.join(ROOT, 'extension', 'ebay.js'), 'utf8');
  const background = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
  const popup = fs.readFileSync(path.join(ROOT, 'extension', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(ROOT, 'extension', 'popup.js'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'extension', 'policy-listing-audit.html'), 'utf8');
  const pageJs = fs.readFileSync(path.join(ROOT, 'extension', 'policy-listing-audit.js'), 'utf8');
  assert.match(popup, /id="openPolicyListingAudit"/);
  assert.match(popupJs, /policy-listing-audit\.html/);
  assert.match(ebay, /dataset\.action = "policy-listing-audit-settings"/);
  assert.match(ebay, /page: "policy-listing-audit\.html"/);
  assert.match(ebay, /data-action="policy-listing-audit"[^>]+hidden>Audit Listing Policies/);
  assert.match(ebay, /button\.hidden = !isActiveListingsPage\(\)/);
  assert.match(ebay, /function showPolicyListingAuditLauncher\(autoStart = false\)/);
  assert.match(ebay, /showPolicyListingAuditLauncher\(true\)/);
  assert.match(ebay, /if \(autoStart && !active && !complete\) run\(true\)/);
  assert.match(ebay, /Start Fresh Complete Scan/);
  assert.match(ebay, /This window never exposes an End control/);
  assert.match(ebay, /scanEbayPolicyListings/);
  assert.match(background, /allowedPages[^;]+policy-listing-audit\.html/);
  assert.match(page, /Start Fresh Complete Scan/);
  assert.match(page, /Resume Scan/);
  assert.match(page, /Pause Safely/);
  assert.match(page, /class="audit-only"/);
  assert.match(page, /id="selectAllBlock"[^>]+hidden/);
  assert.match(page, /id="prepareReview"[^>]+hidden/);
  assert.match(page, /Read-only audit mode/);
  assert.match(page, /exposes no selection, revision, relisting, or End control/i);
  assert.match(pageJs, /const AUDIT_ONLY = true/);
  assert.match(pageJs, /if \(AUDIT_ONLY\)[^]+No eBay End review can be prepared here/);
  assert.match(pageJs, /if \(AUDIT_ONLY\)[^]+No listing can be ended here/);
  assert.match(pageJs, /elements\.currentReview\.hidden = AUDIT_ONLY/);
});

test('policy audit fingerprint changes with source evidence and clearance semantics', () => {
  const base = policyAudit.rulePackFingerprint(rulePack, preflight);
  const evidenceChanged = JSON.parse(JSON.stringify(rulePack));
  evidenceChanged.rules[0].evidenceUrls = ['https://example.test/different-policy'];
  const profileChanged = JSON.parse(JSON.stringify(rulePack));
  profileChanged.clearancePolicy = {
    id: 'profile', version: '2', mode: 'review-unless-generic-allowlist', reviewedAt: '2026-08-30',
    maxAgeDays: 0, readyPhrases: ['desk organizer'], genericTokens: ['desk', 'organizer'],
    reviewPhrases: [], genericBrandValues: ['generic'], evidenceUrls: ['https://www.ebay.com/help/policies/prohibited-restricted-items/prohibited-restricted-items?id=4207']
  };
  assert.notEqual(policyAudit.rulePackFingerprint(evidenceChanged, preflight), base);
  assert.notEqual(policyAudit.rulePackFingerprint(profileChanged, preflight), base);
});
