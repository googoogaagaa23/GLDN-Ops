const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const api = require(path.join(root, 'extension', 'subscribe-save.js'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Subscribe & Save approval is exact and count-bound', () => {
  assert.equal(api.approvalToken(12), 'APPROVE CANCEL SUBSCRIPTIONS 12');
  assert.equal(api.validateApprovalToken('APPROVE CANCEL SUBSCRIPTIONS 12', 12), true);
  assert.equal(api.validateApprovalToken('approve cancel subscriptions 12', 12), false);
  assert.equal(api.validateApprovalToken('APPROVE CANCEL SUBSCRIPTIONS 11', 12), false);
  assert.equal(api.validateApprovalToken('APPROVE CANCEL SUBSCRIPTIONS 12 ', 12), true);
  assert.equal(api.approvalToken(0), '');
});

test('recommendations are excluded and distinct duplicate subscriptions are preserved', () => {
  assert.equal(api.isRecommendationText('Subscribe now'), true);
  assert.equal(api.isRecommendationText('Recommended for you'), true);
  assert.equal(api.isRecommendationText('Coffee Filters 200 Count'), false);
  const forward = api.uniqueTargets([
    { title: 'Recommended for you - Subscribe now', asin: 'B000000001' },
    { title: 'Coffee Filters 200 Count', asin: 'B000000002', address: 'Home' },
    { title: 'Dish Soap Refill', asin: 'B000000003', address: 'Office' }
  ]);
  const reverse = api.uniqueTargets([
    { title: 'Dish Soap Refill', asin: 'B000000003', address: 'Office' },
    { title: 'Coffee Filters 200 Count', asin: 'B000000002', address: 'Home' }
  ]);
  assert.deepEqual(forward.map((item) => item.title), ['Coffee Filters 200 Count', 'Dish Soap Refill']);
  assert.deepEqual(new Set(forward.map((item) => item.id)), new Set(reverse.map((item) => item.id)));
  const duplicates = api.uniqueTargets([
    { title: 'Coffee Filters 200 Count', asin: 'B000000002', address: 'Home', schedule: '1 unit every 2 months' },
    { title: 'Coffee Filters 200 Count', asin: 'B000000002', address: 'Home', schedule: '1 unit every 2 months' }
  ]);
  assert.equal(duplicates.length, 2);
  assert.equal(new Set(duplicates.map((item) => item.id)).size, 2);
  assert.deepEqual(api.reviewSignatureList(duplicates), api.reviewSignatureList([...duplicates].reverse()));
  const repeatedWrapper = api.uniqueTargets([
    { subscriptionKey: 'sub-123', title: 'Coffee Filters 200 Count', asin: 'B000000002' },
    { subscriptionKey: 'sub-123', title: 'Coffee Filters 200 Count', asin: 'B000000002' }
  ]);
  assert.equal(repeatedWrapper.length, 1);
});

test('completion proof requires verified zero, no failures, and full scope', () => {
  const valid = {
    status: 'Completed',
    proofType: 'verified-zero-active-subscriptions-current-profile',
    currentProfileVerified: true,
    verifiedZeroRemaining: true,
    remainingCount: 0,
    failedCount: 0,
    cancelledCount: 4,
    scannedCount: 4,
    expectedScopeCount: 6,
    verifiedScopeCount: 6
  };
  assert.equal(api.completionProof(valid).ok, true);
  assert.equal(api.completionProof({ ...valid, remainingCount: 1 }).ok, false);
  assert.equal(api.completionProof({ ...valid, failedCount: 1 }).ok, false);
  assert.equal(api.completionProof({ ...valid, verifiedScopeCount: 5 }).ok, false);
  assert.equal(api.completionProof({ ...valid, currentProfileVerified: false }).ok, false);
  assert.equal(api.completionProof({ ...valid, proofType: 'scan-only' }).ok, false);
});

test('Amazon implementation supports both layouts and excludes recommendation controls', () => {
  const source = read('extension', 'amazon.js');
  assert.match(source, /#subscription-page-container/);
  assert.match(source, /#totalSubscriptionCount/);
  assert.match(source, /your subscriptions/);
  assert.match(source, /next delivery/);
  assert.match(source, /units\?\\s\+every/);
  assert.match(source, /subscribeSaveSchedule/);
  assert.match(source, /element\.isConnected/);
  assert.match(source, /SUBSCRIBE_SAVE\.isRecommendationText/);
  assert.match(source, /Cancel subscription/);
  assert.match(source, /Cancel my subscription/);
  assert.match(source, /Cancellation Confirmed/i);
});

test('no final Amazon cancellation can dispatch without persisted exact approval and one-click guard', () => {
  const source = read('extension', 'amazon.js');
  const finalClick = source.indexOf('finalButton.click()');
  const approvalCheck = source.lastIndexOf('SUBSCRIBE_SAVE.validateApprovalToken', finalClick);
  const clickGuard = source.lastIndexOf('finalClickCount', finalClick);
  const persistedCheckpoint = source.lastIndexOf('finalClickDispatchedAt', finalClick);
  assert.ok(finalClick > 0);
  assert.ok(approvalCheck > 0 && approvalCheck < finalClick);
  assert.ok(clickGuard > approvalCheck && clickGuard < finalClick);
  assert.ok(persistedCheckpoint > clickGuard && persistedCheckpoint < finalClick);
  assert.match(source, /ownerTabId/);
  assert.match(source, /active subscriptions changed after review/i);
  assert.doesNotMatch(source, /if \(opened\.missing\) \{[\s\S]{0,400}cancelledIds/);
  assert.match(source, /Nothing was counted as cancelled/);
});

test('popup, local control, and dashboard expose the bounded workflow', () => {
  const popupHtml = read('extension', 'popup.html');
  const popupJs = read('extension', 'popup.js');
  const background = read('extension', 'background.js');
  const control = read('tools', 'gldn-control.ps1');
  const agent = read('tools', 'gldn-update-agent.ps1');
  const dashboard = read('extension', 'dashboard_apps_script', 'Code.gs');
  assert.match(popupHtml, /id="openAmazonSubscribeSave"/);
  assert.match(popupJs, /opening-manager/);
  assert.match(background, /approve-subscribe-save/);
  assert.match(background, /APPROVE CANCEL SUBSCRIPTIONS/);
  assert.match(background, /syncAmazonSubscribeSaveProfile/);
  assert.match(control, /InspectAmazonSubscribeSave/);
  assert.match(agent, /"inspect-amazon-subscribe-save"/);
  assert.match(agent, /approve-subscribe-save/);
  assert.match(dashboard, /'amazon-subscribe-save'/);
  assert.match(dashboard, /verified-zero-active-subscriptions-current-profile/);
  assert.match(dashboard, /verified-zero-active-subscriptions-all-profiles/);
  assert.match(dashboard, /APPROVE ALL AMAZON PROFILES/);
  assert.match(dashboard, /Cancel All Subscribe & Save Items on ALL Amazon Accounts/);
});

test('current-profile completion is logged without falsely checking the all-accounts task', () => {
  const source = read('extension', 'amazon.js');
  const dashboard = read('extension', 'dashboard_apps_script', 'Code.gs');
  const identityStart = source.indexOf('async function amazonSubscribeSaveIdentity()');
  const identityEnd = source.indexOf('function subscribeSaveRunId()', identityStart);
  const completionStart = source.indexOf('async function completeAmazonSubscribeSaveRun');
  const completionEnd = source.indexOf('async function stopAmazonSubscribeSaveRun', completionStart);
  const normalizeStart = dashboard.indexOf('function normalizeTaskCompletionRecord_');
  const normalizeEnd = dashboard.indexOf('function normalizePoshmarkStatsRecord_', normalizeStart);
  const identitySource = source.slice(identityStart, identityEnd);
  const completionSource = source.slice(completionStart, completionEnd);
  const normalizeSource = dashboard.slice(normalizeStart, normalizeEnd);
  assert.ok(identityStart > 0 && identityEnd > identityStart);
  assert.ok(completionStart > 0 && completionEnd > completionStart);
  assert.ok(normalizeStart > 0 && normalizeEnd > normalizeStart);
  assert.match(identitySource, /storageGet\(\["computerLabel", "ebayAccountLabel", "amazonProfileLabel"\]\)/);
  assert.match(identitySource, /FOUNDATION\.identityForComputer\(computerLabel\)/);
  assert.match(completionSource, /ebayAccountLabel:\s*state\.ebayAccountLabel/);
  assert.match(completionSource, /syncAmazonSubscribeSaveProfile/);
  assert.doesNotMatch(completionSource, /syncTaskCompletion/);
  assert.match(completionSource, /allProfilesVerified:\s*false/);
  assert.match(normalizeSource, /expectedScopeCount:\s*optionalNumber_\(input\.expectedScopeCount\)/);
  assert.match(normalizeSource, /verifiedScopeCount:\s*optionalNumber_\(input\.verifiedScopeCount\)/);
  assert.match(dashboard, /taskChecked:\s*false/);
});

test('all maintained dashboard source copies stay identical', () => {
  const canonical = read('extension', 'dashboard_apps_script', 'Code.gs');
  assert.equal(read('apps-script-live', 'Code.js'), canonical);
  assert.equal(read('dashboard', 'GLDN_Ops_Dashboard_Code.gs'), canonical);
});
