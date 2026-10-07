const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const core = require('../extension/order-audit-core.js');

const source = fs.readFileSync(path.join(__dirname, '../dashboard/GLDN_Ops_Dashboard_Code.gs'), 'utf8');
const scope = { runKey: 'M0|CLICKNCARRY|2026-10', computerLabel: 'M0', accountLabel: 'CLICKNCARRY', monthKey: '2026-10' };

function harness() {
  const sheets = new Map();
  const sandbox = {
    Date,
    Utilities: { formatDate: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` },
    Session: { getScriptTimeZone: () => 'America/Chicago' }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  sandbox.getSpreadsheet_ = () => ({});
  sandbox.withLock_ = (callback) => callback();
  sandbox.ensureSheet_ = (_ss, name, headers) => {
    if (!sheets.has(name)) {
      const rows = [Array.from(headers)], formats = new Map();
      const sheet = {
        rows, formats,
        getLastRow: () => rows.reduce((last, row, index) => row.some((value) => value !== '') ? index + 1 : last, 0),
        getRange(row, column, rowCount = 1, columnCount = 1) {
          const range = {
            getValues: () => Array.from({ length: rowCount }, (_v, index) => Array.from({ length: columnCount }, (_c, offset) => rows[row + index - 1]?.[column + offset - 1] ?? '')),
            clearContent() {
              return range.setValues(Array.from({ length: rowCount }, () => Array(columnCount).fill('')));
            },
            setNumberFormat(format) {
              for (let r = row; r < row + rowCount; r++) {
                for (let c = column; c < column + columnCount; c++) formats.set(`${r}:${c}`, format);
              }
              return range;
            },
            setValues(values) {
              values.forEach((entries, offset) => {
                rows[row + offset - 1] ||= [];
                entries.forEach((value, col) => {
                  // Emulate Sheets coercing an unformatted YYYY-MM cell to a date.
                  const actualColumn = column + col;
                  rows[row + offset - 1][actualColumn - 1] = actualColumn === 5 && /^\d{4}-\d{2}$/.test(value)
                    && formats.get(`${row + offset}:${actualColumn}`) !== '@'
                    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5)) - 1, 1) : value;
                });
              });
              return range;
            }
          };
          return range;
        }
      };
      sheets.set(name, sheet);
    }
    return sheets.get(name);
  };
  return { api: sandbox, sheets };
}

test('legacy date-formatted audit months read back as canonical scope without rewriting saved evidence', () => {
  const { api, sheets } = harness();
  api.readOrderPlacementAudit_(scope);
  const month = new Date(2026, 9, 1);
  sheets.get('Order Audit Runs').rows.push([new Date(), scope.runKey, 'M0', 'CLICKNCARRY', month, 'M7', 1, '', 'Waiting for Amazon profile scans']);
  sheets.get('Order Audit - eBay Demand').rows.push([new Date(), scope.runKey, 'M0', 'CLICKNCARRY', month, '11-10000-10000', new Date(2026, 9, 4), 'B012345678', 1, 1, 'Example', '', 'Buyer', 'buyer', 'address', 'Buyer | address', 'https://www.ebay.com/order']);
  sheets.get('Order Audit - Amazon Purchases').rows.push([new Date(), scope.runKey, 'M0', 'CLICKNCARRY', month, 'M7', '112-1000000-1000000', new Date(2026, 9, 4), 'B012345678', 1, 1, 'Example', 10, 'Buyer', 'buyer', 'address', 'Buyer | address', 'https://www.amazon.com/order', 'M7']);
  const result = api.readOrderPlacementAudit_(scope);
  assert.equal(result.metadata.monthKey, '2026-10');
  assert.equal(result.expected[0].monthKey, '2026-10');
  assert.equal(result.purchases[0].monthKey, '2026-10');
  assert.equal(core.sharedDemandReadiness(result, scope).ready, true);
  assert.equal(sheets.get('Order Audit Runs').rows[1][4], month);
});

test('new audit configuration and both batch writers protect month cells from automatic date conversion', () => {
  const { api, sheets } = harness();
  api.saveOrderPlacementAuditConfig_({ ...scope, expectedUnits: 1, expectedProfiles: ['M7'] });
  api.saveOrderPlacementAuditExpectedBatch_({ ...scope, records: [{ orderNumber: '11-10000-10000', asin: 'B012345678' }] });
  api.saveOrderPlacementAuditAmazonBatch_({ ...scope, supplierProfile: 'M7', records: [{ orderId: '112-1000000-1000000', asin: 'B012345678' }], profileCompleted: true });
  for (const sheet of sheets.values()) {
    assert.equal(sheet.rows[1][4], '2026-10');
    assert.equal(sheet.formats.get('2:5'), '@');
  }
  const result = api.readOrderPlacementAudit_(scope);
  assert.equal(result.metadata.expectedUnits, 1);
  assert.deepEqual(Array.from(result.metadata.scannedProfiles), ['M7']);
  assert.equal(core.sharedDemandReadiness(result, scope).ready, true);
});

test('updating an existing run normalizes its legacy date month and preserves unit counts and scanned profiles', () => {
  const { api, sheets } = harness();
  api.readOrderPlacementAudit_(scope);
  sheets.get('Order Audit Runs').rows.push([new Date(), scope.runKey, 'M0', 'CLICKNCARRY', new Date(2026, 9, 1), 'M7 | M8', 143, 'M7', 'Waiting']);
  const result = api.orderAuditUpsertRun_({ runKey: scope.runKey, status: 'Updated' });
  assert.equal(result.monthKey, '2026-10');
  assert.equal(result.expectedUnits, 143);
  assert.deepEqual(Array.from(result.scannedProfiles), ['M7']);
  assert.equal(sheets.get('Order Audit Runs').rows[1][4], '2026-10');
});

test('rewriting audit rows retains other scopes and text month formatting', () => {
  const { api, sheets } = harness();
  api.saveOrderPlacementAuditExpectedBatch_({ ...scope, records: [{ orderNumber: '11-10000-10000', asin: 'B012345678' }] });
  const other = { runKey: '2|FANCYFI|2026-09', computerLabel: '2', accountLabel: 'FANCYFI', monthKey: '2026-09' };
  api.saveOrderPlacementAuditExpectedBatch_({ ...other, records: [{ orderNumber: '11-20000-20000', asin: 'B087654321' }] });
  api.saveOrderPlacementAuditExpectedBatch_({ ...scope, replace: true, records: [{ orderNumber: '11-30000-30000', asin: 'B012345678' }] });
  assert.equal(api.readOrderPlacementAudit_(other).expected[0].monthKey, '2026-09');
  assert.equal(api.readOrderPlacementAudit_(other).expected[0].orderNumber, '11-20000-20000');
  assert.equal(api.readOrderPlacementAudit_(scope).expected[0].orderNumber, '11-30000-30000');
  const sheet = sheets.get('Order Audit - eBay Demand');
  assert.equal(sheet.formats.get('2:5'), '@');
  assert.equal(sheet.formats.get('3:5'), '@');
});
