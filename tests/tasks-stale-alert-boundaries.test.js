const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'GLDN_Ops_Dashboard_Code.gs'), 'utf8');
const packaged = fs.readFileSync(path.join(root, 'extension', 'dashboard_apps_script', 'Code.gs'), 'utf8');

function helpers() {
  const sandbox = {};
  vm.runInNewContext(
    `${dashboard}\nthis.api={dateFromNote_,daysSince_,daysUntilMonthEnd_,monthlyReminderDue_,staleTaskState_,snipeReminderState_};`,
    sandbox
  );
  return sandbox.api;
}

function note(date) {
  return `Last checked: ${date.toISOString()}\nEpoch: ${date.getTime()}`;
}

test('dashboard and packaged stale-alert Apps Script copies stay identical', () => {
  assert.equal(packaged, dashboard);
});

test('daily stale boundary is strictly more than three days and checked wins', () => {
  const api = helpers();
  const now = new Date('2026-07-30T12:00:00-05:00');
  const exactlyThree = new Date(now.getTime() - 3 * 86400000);
  const overThree = new Date(now.getTime() - 3.01 * 86400000);
  assert.equal(api.staleTaskState_(false, note(exactlyThree), 3, now), false);
  assert.equal(api.staleTaskState_(false, note(overThree), 3, now), true);
  assert.equal(api.staleTaskState_(true, note(overThree), 3, now), false);
  assert.equal(api.staleTaskState_(false, '', 3, now), true);
});

test('sniping reminder uses the latest computer timestamp and warns after five days', () => {
  const api = helpers();
  const now = new Date('2026-07-30T12:00:00-05:00');
  const headers = ['M0', '2', '6', '0', 'M1'];
  const notes = [10, 9, 8, 7, 5].map((days) => note(new Date(now.getTime() - days * 86400000)));
  const boundary = api.snipeReminderState_(notes, headers, now, 5);
  assert.equal(boundary.computer, 'M1');
  assert.equal(boundary.stale, false);
  notes[4] = note(new Date(now.getTime() - 5.01 * 86400000));
  assert.equal(api.snipeReminderState_(notes, headers, now, 5).stale, true);
});

test('month-end reminder begins one calendar day before month end', () => {
  const api = helpers();
  assert.equal(api.daysUntilMonthEnd_(new Date('2026-07-29T23:59:00-05:00')), 2);
  assert.equal(api.monthlyReminderDue_(new Date('2026-07-29T23:59:00-05:00')), false);
  assert.equal(api.daysUntilMonthEnd_(new Date('2026-07-30T00:01:00-05:00')), 1);
  assert.equal(api.monthlyReminderDue_(new Date('2026-07-30T00:01:00-05:00')), true);
});

test('T-04 live probe and refresh are confirmed, temporary, and marketplace-safe', () => {
  assert.match(dashboard, /action === 'tasksStaleBoundaryProbe'/);
  assert.match(dashboard, /input && input\.confirm\) !== 'T04_TEMP_SHEET_PROBE'/);
  assert.match(dashboard, /finally \{\s*if \(sheet\) ss\.deleteSheet\(sheet\);\s*\}/);
  assert.match(dashboard, /action === 'tasksStaleRefresh'/);
  assert.match(dashboard, /input && input\.confirm\) !== 'T04_REFRESH_TASKS'/);
  assert.match(dashboard, /marketplaceActions: 0/);
});

test('production reminder wiring is label-based and keeps the month-end formula automatic', () => {
  assert.match(dashboard, /findTaskRowByContains_\(sheet, 'Snipe Items \|'/);
  assert.match(dashboard, /setFormula\('=IF\(TODAY\(\)>=EOMONTH\(TODAY\(\),0\)-1,"CHECK",""\)'\)/);
  assert.match(dashboard, /whenTextContains\('NEED TO SNIPE'\)/);
  assert.match(dashboard, /const legacyDate = dateFromNote_\(labelCell\.getNote\(\)\) \|\| dateFromNote_\(computerCell\.getNote\(\)\)/);
});
