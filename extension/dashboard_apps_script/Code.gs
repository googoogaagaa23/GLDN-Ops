/**
 * GLDN Ops Assistant — Shared Operations Dashboard
 *
 * SETUP / UPGRADE:
 * 1. Paste this entire file into the bound Apps Script project.
 * 2. Keep the same private SYNC_KEY used by the extension.
 * 3. Save and run setupSellerLevelDashboard() once.
 * 4. Deploy > Manage deployments > Edit > New version > Deploy.
 */

const SYNC_KEY = 'GLDN-Private-Seller-Level-2026-8291';
const SPREADSHEET_ID_PROPERTY = 'GLDN_SPREADSHEET_ID';
const TASKS_SPREADSHEET_ID = '1z3ouzNopLpiT3icJyhzLf3AkCO7I2thV1mQWnIEdIx8';
const TASKS_SHEET = 'Tasks';

const SELLER_DASHBOARD_SHEET = 'Seller Level Dashboard';
const SELLER_HISTORY_SHEET = 'Seller Level History';
const LISTING_DASHBOARD_SHEET = 'Listing Status Dashboard';
const LISTING_HISTORY_SHEET = 'Listing Status History';
const SHIPPING_HISTORY_SHEET = 'Mark Shipped History';

const SELLER_HEADERS = [
  'Computer', 'eBay Account', 'Current Seller Level', 'If Evaluated Today',
  'Transaction Defect Rate', 'Late Shipment Rate', 'Tracking On Time',
  'Cases Closed', 'Next Evaluation', 'Last Scanned', 'Overall Status', 'Source'
];

const SELLER_HISTORY_HEADERS = ['Timestamp', ...SELLER_HEADERS];

const LISTING_HEADERS = [
  'Computer', 'eBay Account', 'Store Plan', 'Active Listings',
  'In-Stock Quantity', 'Out of Stock', 'In-Stock Rate',
  'Subscription Limit', 'Listing Usage', 'Listing Status',
  'Dollar Used', 'Dollar Limit', 'Dollar Usage', 'Dollar Status',
  'Overall Status', 'Confirmed Month', 'Last Checked', 'Source'
];

const LISTING_HISTORY_HEADERS = ['Timestamp', ...LISTING_HEADERS];

const SHIPPING_HEADERS = [
  'Timestamp', 'Computer', 'eBay Account', 'Status',
  'Marked Shipped', 'Batches', 'Error', 'Source'
];

function setupSellerLevelDashboard() {
  validateConfiguredKey_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open the Google Sheet first, then run setupSellerLevelDashboard().');

  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_PROPERTY, ss.getId());

  const seller = ensureSheet_(ss, SELLER_DASHBOARD_SHEET, SELLER_HEADERS);
  const sellerHistory = ensureSheet_(ss, SELLER_HISTORY_SHEET, SELLER_HISTORY_HEADERS);
  const listing = ensureSheet_(ss, LISTING_DASHBOARD_SHEET, LISTING_HEADERS);
  const listingHistory = ensureSheet_(ss, LISTING_HISTORY_SHEET, LISTING_HISTORY_HEADERS);
  const shippingHistory = ensureSheet_(ss, SHIPPING_HISTORY_SHEET, SHIPPING_HEADERS);

  dedupeDashboardByComputer_(seller, SELLER_HEADERS.length, 10);
  dedupeDashboardByComputer_(listing, LISTING_HEADERS.length, 17);

  formatSellerDashboard_(seller);
  formatSellerHistory_(sellerHistory);
  formatListingDashboard_(listing);
  formatListingHistory_(listingHistory);
  formatShippingHistory_(shippingHistory);

  protectSheet_(sellerHistory, 'GLDN protected Seller Level history');
  protectSheet_(listingHistory, 'GLDN protected Listing Status history');
  protectSheet_(shippingHistory, 'GLDN protected Mark Shipped history');

  ss.setActiveSheet(seller);
  SpreadsheetApp.flush();
}

function doPost(e) {
  try {
    validateConfiguredKey_();
    const payload = parsePayload_(e);
    validateKey_(payload.key);

    if (payload.action === 'ping') {
      return json_({ ok: true, message: 'Dashboard connection works.', serverTime: new Date().toISOString() });
    }

    if (payload.action === 'sellerLevel') {
      const record = normalizeSellerRecord_(payload.record || {});
      const result = saveSellerLevel_(record);
      return json_({ ok: true, message: `Seller Level updated for ${record.computerLabel}.`, ...result });
    }

    if (payload.action === 'accountLimits') {
      const record = normalizeListingRecord_(payload.record || {});
      const result = saveListingStatus_(record);
      return json_({ ok: true, message: `Listing status updated for ${record.computerLabel}.`, ...result });
    }

    if (payload.action === 'markShipped') {
      const record = normalizeShippingRecord_(payload.record || {});
      saveMarkShipped_(record);
      return json_({ ok: true, message: `Mark as Shipped logged for ${record.computerLabel}.` });
    }

    throw new Error('Unsupported action.');
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function doGet(e) {
  try {
    validateConfiguredKey_();
    validateKey_(e && e.parameter ? e.parameter.key : '');
    return renderDashboard_();
  } catch (error) {
    return HtmlService.createHtmlOutput(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;padding:24px;color:#991b1b;background:#fff7f7}</style></head><body><h1>GLDN Ops Dashboard</h1><p>${escapeHtml_(error.message || String(error))}</p></body></html>`).setTitle('GLDN Ops Dashboard');
  }
}

function saveSellerLevel_(record) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const dashboard = ensureSheet_(ss, SELLER_DASHBOARD_SHEET, SELLER_HEADERS);
    const history = ensureSheet_(ss, SELLER_HISTORY_SHEET, SELLER_HISTORY_HEADERS);
    const overallStatus = sellerOverallStatus_(record);
    const timestamp = validDate_(record.savedAt || record.capturedAt);
    const rowValues = [
      record.computerLabel, record.ebayAccountLabel, record.currentSellerLevel,
      record.evaluatedToday, percentCell_(record.transactionDefectRate),
      percentCell_(record.lateShipmentRate), percentCell_(record.trackingOnTime),
      percentCell_(record.casesClosed), record.nextEvaluation, timestamp,
      overallStatus, record.pageUrl
    ];
    dedupeDashboardByComputer_(dashboard, SELLER_HEADERS.length, 10);
    const row = findDashboardRow_(dashboard, record.computerLabel);
    dashboard.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
    applySellerRowFormatting_(dashboard, row, record, overallStatus, 0);
    history.appendRow([timestamp, ...rowValues]);
    applySellerRowFormatting_(history, history.getLastRow(), record, overallStatus, 1);
    syncTasksSellerMetrics_(record);
    sortDashboard_(dashboard, SELLER_HEADERS.length, 10);
    SpreadsheetApp.flush();
    return { row, overallStatus };
  });
}

function saveListingStatus_(record) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const dashboard = ensureSheet_(ss, LISTING_DASHBOARD_SHEET, LISTING_HEADERS);
    const history = ensureSheet_(ss, LISTING_HISTORY_SHEET, LISTING_HISTORY_HEADERS);
    const timestamp = validDate_(record.confirmedAt || record.capturedAt);
    const rowValues = [
      record.computerLabel, record.ebayAccountLabel, record.storePlan,
      numberOrBlank_(record.activeListings), numberOrBlank_(record.inStockQuantity),
      numberOrBlank_(record.outOfStockCount), percentRatioCell_(record.inStockPercent),
      numberOrBlank_(record.subscriptionListingLimit), percentRatioCell_(record.subscriptionUsagePercent), record.subscriptionStatus,
      numberOrBlank_(record.currentDollarUsed), numberOrBlank_(record.monthlySellerDollarLimit),
      percentRatioCell_(record.dollarUsagePercent), record.dollarStatus,
      record.overallStatus, record.limitsConfirmedMonth, timestamp, record.pageUrl
    ];
    dedupeDashboardByComputer_(dashboard, LISTING_HEADERS.length, 17);
    const row = findDashboardRow_(dashboard, record.computerLabel);
    dashboard.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
    applyListingRowFormatting_(dashboard, row, record, 0);
    history.appendRow([timestamp, ...rowValues]);
    applyListingRowFormatting_(history, history.getLastRow(), record, 1);
    sortDashboard_(dashboard, LISTING_HEADERS.length, 17);
    SpreadsheetApp.flush();
    return { row, overallStatus: record.overallStatus };
  });
}

function saveMarkShipped_(record) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const history = ensureSheet_(ss, SHIPPING_HISTORY_SHEET, SHIPPING_HEADERS);
    const timestamp = validDate_(record.completedAt || record.startedAt);
    history.appendRow([
      timestamp, record.computerLabel, record.ebayAccountLabel, record.status,
      numberOrBlank_(record.markedCount), numberOrBlank_(record.batchCount),
      record.error, record.pageUrl
    ]);
    const row = history.getLastRow();
    history.getRange(row, 1, 1, SHIPPING_HEADERS.length)
      .setBorder(true, true, true, true, true, true, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
    const statusCell = history.getRange(row, 4);
    applyStateColor_(statusCell, /failed/i.test(record.status) ? 'critical' : 'good');
    SpreadsheetApp.flush();
  });
}

function normalizeSellerRecord_(input) {
  const identity = identity_(input);
  return {
    ...identity,
    currentSellerLevel: cleanText_(input.currentSellerLevel),
    evaluatedToday: cleanText_(input.evaluatedToday),
    transactionDefectRate: optionalNumber_(input.transactionDefectRate),
    lateShipmentRate: optionalNumber_(input.lateShipmentRate),
    trackingOnTime: optionalNumber_(input.trackingOnTime),
    casesClosed: optionalNumber_(input.casesClosed),
    nextEvaluation: cleanText_(input.nextEvaluation),
    pageUrl: cleanText_(input.pageUrl), capturedAt: cleanText_(input.capturedAt), savedAt: cleanText_(input.savedAt)
  };
}

function normalizeListingRecord_(input) {
  const identity = identity_(input);
  return {
    ...identity,
    storePlan: cleanText_(input.storePlan),
    activeListings: optionalNumber_(input.activeListings),
    inStockQuantity: optionalNumber_(input.inStockQuantity),
    outOfStockCount: optionalNumber_(input.outOfStockCount),
    inStockPercent: optionalNumber_(input.inStockPercent),
    subscriptionListingLimit: optionalNumber_(input.subscriptionListingLimit || input.freeFixedPriceLimit),
    subscriptionUsagePercent: optionalNumber_(input.subscriptionUsagePercent),
    subscriptionStatus: cleanText_(input.subscriptionStatus),
    currentDollarUsed: optionalNumber_(input.currentDollarUsed),
    monthlySellerDollarLimit: optionalNumber_(input.monthlySellerDollarLimit),
    dollarUsagePercent: optionalNumber_(input.dollarUsagePercent),
    dollarStatus: cleanText_(input.dollarStatus),
    overallStatus: cleanText_(input.overallStatus || 'GOOD'),
    limitsConfirmedMonth: cleanText_(input.limitsConfirmedMonth),
    confirmedAt: cleanText_(input.confirmedAt), capturedAt: cleanText_(input.capturedAt), pageUrl: cleanText_(input.pageUrl)
  };
}

function normalizeShippingRecord_(input) {
  const identity = identity_(input);
  return {
    ...identity,
    status: cleanText_(input.status || 'Unknown'),
    markedCount: optionalNumber_(input.markedCount),
    batchCount: optionalNumber_(input.batchCount),
    error: cleanText_(input.error), pageUrl: cleanText_(input.pageUrl),
    completedAt: cleanText_(input.completedAt), startedAt: cleanText_(input.startedAt)
  };
}

function identity_(input) {
  const computerLabel = cleanText_(input.computerLabel);
  const ebayAccountLabel = cleanText_(input.ebayAccountLabel);
  if (!computerLabel || !ebayAccountLabel) throw new Error('Computer and eBay account are required.');
  return { computerLabel, ebayAccountLabel };
}

function sellerOverallStatus_(record) {
  const states = [
    levelStatus_(record.currentSellerLevel), levelStatus_(record.evaluatedToday),
    record.transactionDefectRate == null ? 'unknown' : (record.transactionDefectRate > 0 ? 'critical' : 'good'),
    record.lateShipmentRate == null ? 'unknown' : (record.lateShipmentRate > 2.4 ? 'critical' : record.lateShipmentRate > 1.9 ? 'warning' : 'good'),
    record.trackingOnTime == null ? 'unknown' : (record.trackingOnTime < 80 ? 'critical' : record.trackingOnTime < 84 ? 'warning' : 'good'),
    record.casesClosed == null ? 'unknown' : (record.casesClosed > 0 ? 'critical' : 'good')
  ];
  if (states.includes('critical')) return 'CHECK';
  if (states.includes('warning')) return 'WATCH';
  if (states.every((state) => state === 'unknown')) return 'NO DATA';
  return 'OK';
}

function levelStatus_(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('below standard')) return 'critical';
  if (text.includes('above standard') || text.includes('top rated')) return 'good';
  return 'unknown';
}

function computerKey_(value) {
  return String(value || '').trim().toLowerCase();
}

function findDashboardRow_(sheet, computerLabel) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const computer = computerKey_(computerLabel);
  for (let i = 0; i < values.length; i += 1) {
    if (computerKey_(values[i][0]) === computer) return i + 2;
  }
  return lastRow + 1;
}

function dedupeDashboardByComputer_(sheet, columnCount, timestampColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  const values = sheet.getRange(2, 1, lastRow - 1, columnCount).getValues();
  const keepByComputer = {};
  values.forEach((row, index) => {
    const key = computerKey_(row[0]);
    if (!key) return;
    const timestamp = row[timestampColumn - 1] instanceof Date ? row[timestampColumn - 1].getTime() : new Date(row[timestampColumn - 1] || 0).getTime();
    const normalizedTime = Number.isFinite(timestamp) ? timestamp : 0;
    const existing = keepByComputer[key];
    if (!existing || normalizedTime >= existing.timestamp) keepByComputer[key] = { rowNumber: index + 2, timestamp: normalizedTime };
  });
  const deleteRows = [];
  values.forEach((row, index) => {
    const key = computerKey_(row[0]);
    if (!key) return;
    const rowNumber = index + 2;
    if (keepByComputer[key] && keepByComputer[key].rowNumber !== rowNumber) deleteRows.push(rowNumber);
  });
  deleteRows.sort((a, b) => b - a).forEach((rowNumber) => sheet.deleteRow(rowNumber));
}

function sortDashboard_(sheet, columnCount, timestampColumn) {
  if (sheet.getLastRow() > 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, columnCount)
      .sort([{ column: timestampColumn, ascending: false }, { column: 1, ascending: true }]);
  }
}

function syncTasksSellerMetrics_(record) {
  const ss = SpreadsheetApp.openById(TASKS_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) return;

  const computerCol = findComputerColumn_(sheet, record.computerLabel);
  if (!computerCol) return;
  if (!isEbayMetricColumn_(sheet, computerCol)) return;

  const rows = {
    transactionDefectRate: findTaskRowByContains_(sheet, 'Transaction Defect Rate'),
    lateShipmentRate: findTaskRowByContains_(sheet, 'Late Shipment Rate'),
    trackingOnTime: findTaskRowByContains_(sheet, 'Tracking Uploaded On Time'),
    casesClosed: findTaskRowByContains_(sheet, 'Cases Closed without seller Resolution')
  };

  const updates = [
    [rows.transactionDefectRate, percentCell_(record.transactionDefectRate)],
    [rows.lateShipmentRate, percentCell_(record.lateShipmentRate)],
    [rows.trackingOnTime, percentCell_(record.trackingOnTime)],
    [rows.casesClosed, percentCell_(record.casesClosed)]
  ].filter(([row]) => row);

  clearMetricValidation_(sheet, rows);

  updates.forEach(([row, value]) => {
    const cell = sheet.getRange(row, computerCol);
    cell.setValue(value);
    cell.setNumberFormat('0.00%');
    cell.clearNote();
  });

  const parentRow = findTaskRowByContains_(sheet, 'Check Performance of Each Store and Check Late Shipment Rate');
  if (parentRow && updates.length === 4) {
    sheet.getRange(parentRow, computerCol).setValue(true);
  }

  clearComputerHeaderNotes_(sheet);
  clearVisibleLastUpdated_(sheet);
  applyTasksMetricAlerts_(sheet);
}

function clearMetricValidation_(sheet, rows) {
  const foundRows = Object.values(rows).filter(Boolean);
  if (!foundRows.length) return;
  const startRow = Math.min.apply(null, foundRows);
  const endRow = Math.max.apply(null, foundRows);
  sheet.getRange(startRow, 5, endRow - startRow + 1, 6)
    .clearDataValidations()
    .setNumberFormat('0.00%');
}

function findComputerColumn_(sheet, computerLabel) {
  const headers = sheet.getRange(3, 1, 1, Math.min(12, sheet.getLastColumn())).getDisplayValues()[0];
  const target = computerKey_(computerLabel);
  for (let i = 0; i < headers.length; i += 1) {
    if (computerKey_(headers[i]) === target) return i + 1;
  }
  return 0;
}

function isEbayMetricColumn_(sheet, col) {
  const platform = String(sheet.getRange(4, col).getDisplayValue() || '').trim();
  if (platform === '') return col >= 5 && col <= 9;
  return platform.toLowerCase() !== 'false';
}

function findTaskRowByContains_(sheet, text) {
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(1, 4, lastRow, 1).getDisplayValues();
  const needle = String(text || '').toLowerCase();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').toLowerCase().includes(needle)) return i + 1;
  }
  return 0;
}

function clearComputerHeaderNotes_(sheet) {
  sheet.getRange(3, 5, 1, 6).clearNote();
}

function clearVisibleLastUpdated_(sheet) {
  const values = sheet.getRange(1, 1, Math.min(60, sheet.getLastRow()), Math.min(14, sheet.getLastColumn())).getDisplayValues();
  values.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (/^last updated:?$/i.test(String(value || '').trim())) {
        sheet.getRange(rowIndex + 1, colIndex + 1, 1, 2).clearContent().clearNote();
      }
    });
  });
}

function applyTasksMetricAlerts_(sheet) {
  const transactionRow = findTaskRowByContains_(sheet, 'Transaction Defect Rate');
  const lateRow = findTaskRowByContains_(sheet, 'Late Shipment Rate');
  const trackingRow = findTaskRowByContains_(sheet, 'Tracking Uploaded On Time');
  const casesRow = findTaskRowByContains_(sheet, 'Cases Closed without seller Resolution');

  applyTasksMetricRow_(sheet, transactionRow, (value) => parseTaskPercent_(value) > 0);
  applyTasksMetricRow_(sheet, lateRow, (value) => parseTaskPercent_(value) > 1.5);
  applyTasksMetricRow_(sheet, trackingRow, (value) => parseTaskPercent_(value) < 90);
  applyTasksMetricRow_(sheet, casesRow, (value) => parseTaskPercent_(value) > 0);
}

function applyTasksMetricRow_(sheet, row, isBad) {
  if (!row) return;
  const range = sheet.getRange(row, 5, 1, 5);
  const values = range.getValues()[0];
  const headers = sheet.getRange(3, 5, 1, 5).getDisplayValues()[0];
  const computers = [];
  values.forEach((value, index) => {
    if (value === '' || value === null || typeof value === 'boolean') return;
    if (isBad(value)) computers.push(headers[index]);
  });
  const alertCell = sheet.getRange(row, 11);
  if (computers.length) {
    alertCell.setValue('CHECK ' + computers.join(' & ')).setBackground('#ff0000').setFontColor('#000000').setFontWeight('bold');
  } else {
    alertCell.clearContent().setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
  }
}

function parseTaskPercent_(value) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return NaN;
  const n = Number(value);
  if (Number.isFinite(n)) return n <= 1 ? n * 100 : n;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function formatHeader_(sheet, count, color) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, count).setBackground(color).setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
}

function formatSellerDashboard_(sheet) {
  formatHeader_(sheet, SELLER_HEADERS.length, '#1d4ed8');
  sheet.setColumnWidths(1, 2, 120); sheet.setColumnWidths(3, 2, 155); sheet.setColumnWidths(5, 4, 135);
  sheet.setColumnWidth(9, 120); sheet.setColumnWidth(10, 165); sheet.setColumnWidth(11, 110); sheet.setColumnWidth(12, 250);
  sheet.getRange('E:H').setNumberFormat('0.00%'); sheet.getRange('J:J').setNumberFormat('m/d/yyyy h:mm AM/PM');
}

function formatSellerHistory_(sheet) {
  formatHeader_(sheet, SELLER_HISTORY_HEADERS.length, '#334155');
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM'); sheet.getRange('F:I').setNumberFormat('0.00%');
}

function formatListingDashboard_(sheet) {
  formatHeader_(sheet, LISTING_HEADERS.length, '#7c3aed');
  sheet.setColumnWidths(1, 3, 120);
  sheet.setColumnWidths(4, 4, 125);
  sheet.setColumnWidth(8, 125); sheet.setColumnWidth(9, 110); sheet.setColumnWidth(10, 135);
  sheet.setColumnWidths(11, 2, 135); sheet.setColumnWidth(13, 110); sheet.setColumnWidth(14, 135); sheet.setColumnWidth(15, 135);
  sheet.setColumnWidth(16, 115); sheet.setColumnWidth(17, 165); sheet.setColumnWidth(18, 250);
  sheet.getRange('G:G').setNumberFormat('0.0%');
  sheet.getRange('I:I').setNumberFormat('0.0%');
  sheet.getRange('K:L').setNumberFormat('$#,##0.00');
  sheet.getRange('M:M').setNumberFormat('0.0%');
  sheet.getRange('Q:Q').setNumberFormat('m/d/yyyy h:mm AM/PM');
}

function formatListingHistory_(sheet) {
  formatHeader_(sheet, LISTING_HISTORY_HEADERS.length, '#4c1d95');
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange('H:H').setNumberFormat('0.0%');
  sheet.getRange('J:J').setNumberFormat('0.0%');
  sheet.getRange('L:M').setNumberFormat('$#,##0.00');
  sheet.getRange('N:N').setNumberFormat('0.0%');
}

function formatShippingHistory_(sheet) {
  formatHeader_(sheet, SHIPPING_HEADERS.length, '#15803d');
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
}

function applySellerRowFormatting_(sheet, row, record, status, offset) {
  sheet.getRange(row, 1, 1, SELLER_HEADERS.length + offset).setBorder(true, true, true, true, true, true, '#d1d5db', SpreadsheetApp.BorderStyle.SOLID);
  colorLevel_(sheet.getRange(row, 3 + offset), record.currentSellerLevel);
  colorLevel_(sheet.getRange(row, 4 + offset), record.evaluatedToday);
  colorMetric_(sheet.getRange(row, 5 + offset), record.transactionDefectRate, 'defect');
  colorMetric_(sheet.getRange(row, 6 + offset), record.lateShipmentRate, 'late');
  colorMetric_(sheet.getRange(row, 7 + offset), record.trackingOnTime, 'tracking');
  colorMetric_(sheet.getRange(row, 8 + offset), record.casesClosed, 'cases');
  colorOverall_(sheet.getRange(row, 11 + offset), status);
}

function applyListingRowFormatting_(sheet, row, record, offset) {
  sheet.getRange(row, 1, 1, LISTING_HEADERS.length + offset).setBorder(true, true, true, true, true, true, '#d1d5db', SpreadsheetApp.BorderStyle.SOLID);
  colorTextStatus_(sheet.getRange(row, 10 + offset), record.subscriptionStatus);
  colorTextStatus_(sheet.getRange(row, 14 + offset), record.dollarStatus);
  colorTextStatus_(sheet.getRange(row, 15 + offset), record.overallStatus);
}

function colorLevel_(cell, value) { applyStateColor_(cell, levelStatus_(value)); }
function colorMetric_(cell, value, type) {
  if (value == null || value === '') return applyStateColor_(cell, 'unknown');
  let state = 'good';
  if (type === 'defect' || type === 'cases') state = Number(value) > 0 ? 'critical' : 'good';
  if (type === 'late') state = Number(value) > 2.4 ? 'critical' : Number(value) > 1.9 ? 'warning' : 'good';
  if (type === 'tracking') state = Number(value) < 80 ? 'critical' : Number(value) < 84 ? 'warning' : 'good';
  applyStateColor_(cell, state);
}
function colorOverall_(cell, status) { colorTextStatus_(cell, status); cell.setFontWeight('bold').setHorizontalAlignment('center'); }
function colorTextStatus_(cell, value) {
  const text = String(value || '').toUpperCase();
  const state = /PRUNE|CHANGED|CHECK|FAILED/.test(text) ? 'critical' : /WATCH/.test(text) ? 'warning' : /GOOD|OK|COMPLETED/.test(text) ? 'good' : 'unknown';
  applyStateColor_(cell, state); cell.setFontWeight('bold');
}
function applyStateColor_(cell, state) {
  const colors = { good: ['#d9ead3', '#166534'], warning: ['#fce5cd', '#9a3412'], critical: ['#f4cccc', '#991b1b'], unknown: ['#f3f4f6', '#6b7280'] };
  const selected = colors[state] || colors.unknown;
  cell.setBackground(selected[0]).setFontColor(selected[1]);
}

function protectSheet_(sheet, description) {
  const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).find((p) => p.getDescription() === description);
  if (existing) return;
  const protection = sheet.protect().setDescription(description).setWarningOnly(false);
  const owner = Session.getEffectiveUser();
  if (owner && owner.getEmail()) protection.addEditor(owner);
  protection.getEditors().forEach((editor) => { if (!owner || editor.getEmail() !== owner.getEmail()) protection.removeEditor(editor); });
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

function renderDashboard_() {
  const ss = getSpreadsheet_();
  const sellerRows = sheetObjects_(ensureSheet_(ss, SELLER_DASHBOARD_SHEET, SELLER_HEADERS), SELLER_HEADERS);
  const listingRows = sheetObjects_(ensureSheet_(ss, LISTING_DASHBOARD_SHEET, LISTING_HEADERS), LISTING_HEADERS);
  const shippingRows = sheetObjects_(ensureSheet_(ss, SHIPPING_HISTORY_SHEET, SHIPPING_HEADERS), SHIPPING_HEADERS);

  const sellerMap = objectMap_(sellerRows);
  const listingMap = objectMap_(listingRows);
  const shippingMap = latestShippingMap_(shippingRows);
  const keys = [...new Set([...Object.keys(sellerMap), ...Object.keys(listingMap), ...Object.keys(shippingMap)])]
    .sort((a, b) => latestComputerTimestamp_(sellerMap[b], listingMap[b], shippingMap[b]) - latestComputerTimestamp_(sellerMap[a], listingMap[a], shippingMap[a]));
  const cards = keys.length ? keys.map((key) => renderOpsCard_(sellerMap[key], listingMap[key], shippingMap[key])).join('') : '<div class="empty">No data has been synced yet.</div>';

  return HtmlService.createHtmlOutput(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GLDN Ops Dashboard</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;color:#0f172a}header{background:#111827;color:white;padding:18px 20px;position:sticky;top:0;z-index:2;box-shadow:0 2px 10px rgba(0,0,0,.2)}h1{font-size:21px;margin:0}.sub{font-size:12px;color:#cbd5e1;margin-top:4px}main{max-width:1400px;margin:0 auto;padding:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.card{background:white;border-radius:14px;padding:15px;box-shadow:0 2px 8px rgba(15,23,42,.08);border:1px solid #e2e8f0}.head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.computer{font-size:18px;font-weight:800}.account{font-size:12px;color:#64748b;margin-top:2px}.badges{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.badge{padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800}.ok{background:#dcfce7;color:#166534}.watch{background:#ffedd5;color:#9a3412}.check{background:#fee2e2;color:#991b1b}.nodata{background:#e5e7eb;color:#4b5563}.section{margin-top:13px;border-top:1px solid #e2e8f0;padding-top:10px}.section h2{font-size:13px;margin:0 0 5px}.grid{display:grid;grid-template-columns:1fr auto;font-size:12px}.grid div{padding:5px 0;border-top:1px solid #f8fafc}.value{font-weight:700;text-align:right}.footer{margin-top:8px;font-size:10px;color:#64748b}.empty{background:white;padding:28px;border-radius:14px}</style><script>setTimeout(()=>location.reload(),60000);</script></head><body><header><h1>GLDN Ops Dashboard</h1><div class="sub">Latest Seller Level, listing capacity and Mark as Shipped by computer • prior syncs remain in the History tabs • refreshes every 60 seconds</div></header><main>${cards}</main></body></html>`).setTitle('GLDN Ops Dashboard');
}

function renderOpsCard_(seller, listing, shipping) {
  const computer = (seller && seller.Computer) || (listing && listing.Computer) || (shipping && shipping.Computer) || 'Unknown';
  const account = (seller && seller['eBay Account']) || (listing && listing['eBay Account']) || (shipping && shipping['eBay Account']) || 'Unknown';
  const sellerStatus = seller ? seller['Overall Status'] : 'NO DATA';
  const listingStatus = listing ? listing['Overall Status'] : 'NO DATA';
  return `<section class="card"><div class="head"><div><div class="computer">${escapeHtml_(computer)}</div><div class="account">eBay account: ${escapeHtml_(account)}</div></div><div class="badges">${badge_(sellerStatus, 'Seller')}${badge_(listingStatus, 'Listings')}</div></div>
    <div class="section"><h2>Seller Level</h2>${grid_([
      ['Current level', seller && seller['Current Seller Level']], ['Evaluated today', seller && seller['If Evaluated Today']],
      ['Late shipment', seller && seller['Late Shipment Rate']], ['Tracking on time', seller && seller['Tracking On Time']],
      ['Cases closed', seller && seller['Cases Closed']], ['Next evaluation', seller && seller['Next Evaluation']]
    ])}<div class="footer">Last scanned: ${escapeHtml_(seller && seller['Last Scanned'] || '—')}</div></div>
    <div class="section"><h2>Listings</h2>${grid_([
      ['Active listings', listing && listing['Active Listings']], ['In-stock quantity', listing && listing['In-Stock Quantity']],
      ['Out of stock', listing && listing['Out of Stock']], ['In-stock rate', listing && listing['In-Stock Rate']],
      ['Subscription limit', listing && listing['Subscription Limit']], ['Listing usage', listing && listing['Listing Usage']],
      ['Listing status', listing && listing['Listing Status']], ['Dollar used', listing && listing['Dollar Used']], ['Dollar limit', listing && listing['Dollar Limit']],
      ['Dollar status', listing && listing['Dollar Status']]
    ])}<div class="footer">Last checked: ${escapeHtml_(listing && listing['Last Checked'] || '—')}</div></div>
    <div class="section"><h2>Latest Mark as Shipped</h2>${grid_([
      ['Result', shipping && shipping.Status], ['Marked shipped', shipping && shipping['Marked Shipped']], ['Time', shipping && shipping.Timestamp]
    ])}</div></section>`;
}

function badge_(status, label) {
  const text = String(status || 'NO DATA').toUpperCase();
  const cls = /PRUNE|CHANGED|CHECK|FAILED/.test(text) ? 'check' : /WATCH/.test(text) ? 'watch' : /GOOD|OK|COMPLETED/.test(text) ? 'ok' : 'nodata';
  return `<span class="badge ${cls}">${escapeHtml_(label)}: ${escapeHtml_(status || 'NO DATA')}</span>`;
}
function grid_(items) { return `<div class="grid">${items.map(([l,v]) => `<div>${escapeHtml_(l)}</div><div class="value">${escapeHtml_(v || '—')}</div>`).join('')}</div>`; }

function sheetObjects_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues().map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}
function objectMap_(rows) { const map = {}; rows.forEach((r) => { map[computerKey_(r.Computer)] = r; }); return map; }
function latestShippingMap_(rows) { const map = {}; rows.forEach((r) => { const k = computerKey_(r.Computer); if (!k) return; const current = map[k]; if (!current || dateMillis_(r.Timestamp) >= dateMillis_(current.Timestamp)) map[k] = r; }); return map; }
function dateMillis_(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0; }
function latestComputerTimestamp_(seller, listing, shipping) { return Math.max(dateMillis_(seller && seller['Last Scanned']), dateMillis_(listing && listing['Last Checked']), dateMillis_(shipping && shipping.Timestamp)); }

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY);
  if (!id) throw new Error('Run setupSellerLevelDashboard() once before deploying the web app.');
  return SpreadsheetApp.openById(id);
}
function parsePayload_(e) { if (!e || !e.postData || !e.postData.contents) throw new Error('Missing request body.'); try { return JSON.parse(e.postData.contents); } catch (_) { throw new Error('Request body is not valid JSON.'); } }
function validateConfiguredKey_() { if (!SYNC_KEY || SYNC_KEY === 'CHANGE_THIS_TO_A_LONG_PRIVATE_KEY' || SYNC_KEY.length < 16) throw new Error('Change SYNC_KEY to the same private value used by the extension.'); }
function validateKey_(provided) { if (String(provided || '') !== String(SYNC_KEY)) throw new Error('Invalid dashboard key.'); }
function optionalNumber_(value) { if (value === null || value === undefined || value === '') return null; const n = Number(String(value).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; }
function numberOrBlank_(value) { return value === null || value === undefined || value === '' ? '' : Number(value); }
function percentCell_(value) { return value === null || value === undefined || value === '' ? '' : Number(value) / 100; }
function percentRatioCell_(value) { return value === null || value === undefined || value === '' ? '' : Number(value) / 100; }
function validDate_(value) { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? new Date() : d; }
function cleanText_(value) { return String(value == null ? '' : value).trim().slice(0, 1000); }
function withLock_(fn) { const lock = LockService.getScriptLock(); lock.waitLock(20000); try { return fn(); } finally { lock.releaseLock(); } }
function escapeHtml_(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
