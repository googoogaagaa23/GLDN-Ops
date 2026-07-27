const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dashboardPath = path.join(root, 'dashboard', 'GLDN_Ops_Dashboard_Code.gs');
const extensionPath = path.join(root, 'extension', 'dashboard_apps_script', 'Code.gs');
const dashboard = fs.readFileSync(dashboardPath, 'utf8');
const extensionCopy = fs.readFileSync(extensionPath, 'utf8');

function loadClassifier() {
  const classifierStart = dashboard.indexOf('function taskMetricAlertState_');
  const classifierEnd = dashboard.indexOf('function applyTasksMetricRow_', classifierStart);
  const parserStart = dashboard.indexOf('function parseTaskPercent_');
  const parserEnd = dashboard.indexOf('function percentToNumber_', parserStart);
  assert.ok(classifierStart >= 0 && classifierEnd > classifierStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart);
  const context = {};
  vm.runInNewContext(
    `${dashboard.slice(parserStart, parserEnd)}\n${dashboard.slice(classifierStart, classifierEnd)}\nthis.classify = taskMetricAlertState_;`,
    context
  );
  return context.classify;
}

test('dashboard and packaged Apps Script copies stay identical', () => {
  assert.equal(extensionCopy, dashboard);
});

test('transaction defects and unresolved cases warn only above zero', () => {
  const classify = loadClassifier();
  assert.deepEqual({ ...classify('defect', '0.00%') }, { bad: false, color: 'clear' });
  assert.deepEqual({ ...classify('defect', '0.01%') }, { bad: true, color: 'red' });
  assert.deepEqual({ ...classify('cases', 0) }, { bad: false, color: 'clear' });
  assert.deepEqual({ ...classify('cases', 0.0001) }, { bad: true, color: 'red' });
});

test('late shipment boundaries stay clear through 1.5, orange below 3, and red at 3', () => {
  const classify = loadClassifier();
  assert.deepEqual({ ...classify('late', '1.50%') }, { bad: false, color: 'clear' });
  assert.deepEqual({ ...classify('late', '1.90%') }, { bad: true, color: 'orange' });
  assert.deepEqual({ ...classify('late', '2.40%') }, { bad: true, color: 'orange' });
  assert.deepEqual({ ...classify('late', '3.00%') }, { bad: true, color: 'red' });
});

test('tracking is orange only below 85 percent', () => {
  const classify = loadClassifier();
  assert.deepEqual({ ...classify('tracking', '80.00%') }, { bad: true, color: 'orange' });
  assert.deepEqual({ ...classify('tracking', '84.99%') }, { bad: true, color: 'orange' });
  assert.deepEqual({ ...classify('tracking', '85.00%') }, { bad: false, color: 'clear' });
});

test('missing and boolean task values never create false warnings', () => {
  const classify = loadClassifier();
  for (const value of ['', null, undefined, true, false]) {
    assert.deepEqual({ ...classify('tracking', value) }, { bad: false, color: 'clear' });
  }
});

test('live T-03 probe uses a confirmed temporary sheet and always deletes it', () => {
  assert.match(dashboard, /action === 'tasksMetricBoundaryProbe'/);
  assert.match(dashboard, /input && input\.confirm\) !== 'T03_TEMP_SHEET_PROBE'/);
  assert.match(dashboard, /sheet\.hideSheet\(\)/);
  assert.match(dashboard, /finally \{\s*if \(sheet\) ss\.deleteSheet\(sheet\);\s*\}/);
  assert.match(dashboard, /marketplaceActions: 0/);
});

test('production T-03 refresh is confirmed and limited to metric rows', () => {
  assert.match(dashboard, /action === 'tasksMetricRefresh'/);
  assert.match(dashboard, /input && input\.confirm\) !== 'T03_REFRESH_TASKS'/);
  assert.match(dashboard, /function refreshTasksMetricRows_\(input\)[\s\S]*applyTasksMetricRows_\(sheet\)/);
  assert.match(dashboard, /function applyTasksMetricAlerts_\(sheet\) \{\s*applyTasksMetricRows_\(sheet\);\s*applyStaleTaskAlerts_\(sheet\);/);
});

test('production conditional formatting matches T-03 boundaries', () => {
  assert.match(dashboard, /whenNumberGreaterThanOrEqualTo\(0\.03\).*rangeFor\(lateRow\)/);
  assert.match(dashboard, /whenNumberGreaterThan\(0\.015\).*rangeFor\(lateRow\)/);
  assert.match(dashboard, /whenNumberLessThan\(0\.85\).*rangeFor\(trackingRow\)/);
  assert.doesNotMatch(dashboard, /whenNumberLessThan\(0\.8\).*rangeFor\(trackingRow\)/);
  assert.match(dashboard, /ensureTasksMetricConditionalFormatting_\(sheet\);\s*applyTasksMetricRows_\(sheet\);/);
});
