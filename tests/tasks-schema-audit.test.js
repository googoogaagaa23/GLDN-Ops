const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dashboardPath = path.join(root, 'dashboard', 'GLDN_Ops_Dashboard_Code.gs');
const extensionPath = path.join(root, 'extension', 'dashboard_apps_script', 'Code.gs');
const source = fs.readFileSync(dashboardPath, 'utf8');

function loadDiscovery() {
  const constantsStart = source.indexOf('const TASKS_COMPUTER_HEADERS');
  const constantsEnd = source.indexOf('const SELLER_HEADERS', constantsStart);
  const keyStart = source.indexOf('function computerKey_');
  const keyEnd = source.indexOf('function findDashboardRow_', keyStart);
  const discoveryStart = source.indexOf('function taskSchemaMatches_');
  const discoveryEnd = source.indexOf('function discoverTasksSchema_(', discoveryStart);
  assert.ok(constantsStart >= 0 && constantsEnd > constantsStart);
  assert.ok(keyStart >= 0 && keyEnd > keyStart);
  assert.ok(discoveryStart >= 0 && discoveryEnd > discoveryStart);
  const context = {};
  vm.runInNewContext(
    `${source.slice(constantsStart, constantsEnd)}\n${source.slice(keyStart, keyEnd)}\n${source.slice(discoveryStart, discoveryEnd)}\nthis.discover = discoverTasksSchemaFromValues_;`,
    context
  );
  return context.discover;
}

function validFixture() {
  const rows = Array.from({ length: 30 }, () => Array(14).fill(''));
  rows[2].splice(4, 6, 'M0', '2', '6', '0', 'M1', '7');
  const labels = [
    'Check Performance of Each Store and Check Late Shipment Rate',
    'Transaction Defect Rate | Notify if Above Agreed Limit:',
    'Late Shipment Rate | Must be Below 3%:',
    'Tracking Uploaded On Time & Validated:',
    'Cases Closed without seller Resolution | Notify if Above 0%:',
    'Confirm Listings are under Subscription Listing Limit',
    'Items Limit',
    '$ Amount Limit',
    'Mark All New Orders as Shipped',
    'Move $0.99 Listings from Sniped (Non-Sale) Category to Sale Category',
    'Ctl + F and "Add Tracking" to any order that has been placed',
    'Ctrl + F and look for any orders missing "Ship" beyond today',
    'Ctrl + F on "Check"',
    'Snipe Items | 10 Items to Snipe Daily',
    'Cancel All Subscribe & Save Items on ALL Amazon Accounts'
  ];
  labels.forEach((label, index) => { rows[5 + index][3] = label; });
  return rows;
}

test('all deployed Apps Script copies stay identical', () => {
  assert.equal(fs.readFileSync(extensionPath, 'utf8'), source);
});

test('read-only Tasks schema discovery survives task row reordering', () => {
  const discover = loadDiscovery();
  const fixture = validFixture();
  const moved = fixture.splice(10, 1)[0];
  fixture.splice(24, 0, moved);
  const report = discover(fixture);
  assert.equal(report.ok, true);
  assert.equal(report.computerColumns['0'], 8);
  assert.equal(report.computerColumns['7'], 10);
  assert.equal(report.taskMatches.lateShipmentRate.length, 1);
  assert.equal(report.errors.length, 0);
});

test('schema discovery fails closed on duplicate task labels or computer headers', () => {
  const discover = loadDiscovery();
  const fixture = validFixture();
  fixture[25][3] = 'Late Shipment Rate | duplicate';
  fixture[2][10] = '0';
  const report = discover(fixture);
  assert.equal(report.ok, false);
  assert.equal(report.taskMatches.lateShipmentRate.length, 2);
  assert.equal(report.computerMatches['0'].length, 2);
  assert.ok(report.errors.some((error) => error.includes('lateShipmentRate')));
  assert.ok(report.errors.some((error) => error.includes('Computer 0')));
});

test('F-10 endpoint is explicitly confirmed and reports zero writes', () => {
  assert.match(source, /action === 'tasksSchemaAudit'/);
  assert.match(source, /F10_READ_ONLY_SCHEMA/);
  assert.match(source, /readOnly: true/);
  assert.match(source, /spreadsheetWrites: 0/);
  assert.match(source, /marketplaceActions: 0/);
  const start = source.indexOf('function tasksSchemaAudit_');
  const end = source.indexOf('function syncTasksMarkShipped_', start);
  const audit = source.slice(start, end);
  assert.doesNotMatch(audit, /\.setValue\(|\.setValues\(|\.clear|\.insert|\.delete/);
});

test('every Tasks write path requires schema validation first', () => {
  assert.match(source, /syncTasksSellerMetrics_\(record\)[\s\S]*requireTasksSchema_\(sheet, \[[\s\S]*'performance'/);
  assert.match(source, /syncTasksMarkShipped_\(record\)[\s\S]*requireTasksSchema_\(sheet, \['markShipped'\]/);
  assert.match(source, /syncTasksCompletion_\(record, providedSheet\)[\s\S]*requireTasksSchema_\(sheet, \['move99'\]/);
  assert.match(source, /syncTasksListingStatus_\(record\)[\s\S]*requireTasksSchema_\(sheet, \['listingConfirmed', 'itemsLimit', 'dollarLimit'\]/);
});
