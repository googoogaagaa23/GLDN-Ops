/**
 * GLDN Ops Assistant - Shared Operations Dashboard
 *
 * SETUP / UPGRADE:
 * 1. Paste this entire file into the bound Apps Script project.
 * 2. Store the private setup code in the GLDN_SYNC_KEY script property.
 * 3. Save and run setupSellerLevelDashboard() once.
 * 4. Deploy > Manage deployments > Edit > New version > Deploy.
 */

const SYNC_KEY_PROPERTY = 'GLDN_SYNC_KEY';
const SPREADSHEET_ID_PROPERTY = 'GLDN_SPREADSHEET_ID';
const TASKS_SPREADSHEET_ID = '1z3ouzNopLpiT3icJyhzLf3AkCO7I2thV1mQWnIEdIx8';
const TASKS_SHEET = 'Tasks';

const SELLER_DASHBOARD_SHEET = 'Seller Level Dashboard';
const SELLER_HISTORY_SHEET = 'Seller Level History';
const LISTING_DASHBOARD_SHEET = 'Listing Status Dashboard';
const LISTING_HISTORY_SHEET = 'Listing Status History';
const SHIPPING_HISTORY_SHEET = 'Mark Shipped History';
const POSHMARK_STATS_DASHBOARD_SHEET = 'Poshmark Stats Dashboard';
const POSHMARK_STATS_HISTORY_SHEET = 'Poshmark Stats History';
const EBAY_SNAPSHOT_DASHBOARD_SHEET = 'eBay Snapshot Dashboard';
const EBAY_SNAPSHOT_HISTORY_SHEET = 'eBay Snapshot History';
const MARKETPLACE_PROFIT_HISTORY_SHEET = 'Marketplace Profit History';
const MARKETPLACE_PROFIT_PREFIX = 'Profit - ';
const POSHMARK_COST_QUEUE_SHEET = 'Poshmark Amazon Cost Queue';
const EBAY_COST_QUEUE_SHEET = 'eBay Profit Reconciliation';
const POSHMARK_ORDER_SHEET_ID = '1PV4Fpnjjd5tNwdwmqLDbi-RLBbIqMq94Gxj0YU4AOl4';
const AMAZON_SUBSCRIBE_SAVE_HISTORY_SHEET = 'Amazon Subscribe Save History';
const SYNC_RECEIPT_SHEET = 'Sync Receipts';
const ORDER_AUDIT_RUNS_SHEET = 'Order Audit Runs';
const ORDER_AUDIT_EXPECTED_SHEET = 'Order Audit - eBay Demand';
const ORDER_AUDIT_PURCHASES_SHEET = 'Order Audit - Amazon Purchases';
const SYNC_RECEIPT_HEADERS = ['Sync ID', 'Action', 'Received At', 'Computer', 'Account', 'Result'];
const ORDER_AUDIT_RUN_HEADERS = [
  'Last Updated', 'Run Key', 'Computer', 'eBay Account', 'Month',
  'Expected Amazon Profiles', 'Expected Units', 'Scanned Amazon Profiles', 'Status'
];
const ORDER_AUDIT_EXPECTED_HEADERS = [
  'Last Updated', 'Run Key', 'Computer', 'eBay Account', 'Month', 'eBay Order',
  'Order Date', 'ASIN', 'Unit', 'Quantity', 'Item', 'Order Status', 'Recipient',
  'Recipient Fingerprint', 'Address Fingerprint', 'Ship To', 'eBay URL'
];
const ORDER_AUDIT_PURCHASE_HEADERS = [
  'Last Updated', 'Run Key', 'Computer', 'eBay Account', 'Month', 'Amazon Profile',
  'Amazon Order', 'Purchase Date', 'ASIN', 'Unit', 'Quantity', 'Item', 'Cost',
  'Recipient', 'Recipient Fingerprint', 'Address Fingerprint', 'Ship To',
  'Amazon URL', 'Seen Profiles'
];
const PROFIT_COMPUTER_LABELS = ['M0', '2', '6', '0', 'M1', '7'];
const AMAZON_SUBSCRIBE_SAVE_HEADERS = [
  'Timestamp', 'Computer', 'eBay Account', 'Amazon Profile', 'Amazon Account',
  'Status', 'Cancelled', 'Remaining', 'Failed', 'Scope', 'Run ID', 'Source'
];
const TASK_COMPLETION_RULES = Object.freeze({
  move99: Object.freeze({
    taskStartsWith: 'Move $0.99 Listings from Sniped (Non-Sale) Category to Sale Category',
    platform: 'ebay',
    schemaKey: 'move99'
  }),
  'amazon-subscribe-save': Object.freeze({
    taskContains: 'Cancel All Subscribe & Save Items on ALL Amazon Accounts',
    platform: 'amazon',
    schemaKey: 'cancelSubscribe'
  })
});
const TASKS_COMPUTER_HEADERS = Object.freeze(['M0', '2', '6', '0', 'M1', '7']);
const TASKS_SCHEMA_TASKS = Object.freeze({
  performance: Object.freeze({ mode: 'contains', text: 'Check Performance of Each Store and Check Late Shipment Rate' }),
  transactionDefectRate: Object.freeze({ mode: 'startsWith', text: 'Transaction Defect Rate' }),
  lateShipmentRate: Object.freeze({ mode: 'startsWith', text: 'Late Shipment Rate' }),
  trackingOnTime: Object.freeze({ mode: 'startsWith', text: 'Tracking Uploaded On Time' }),
  casesClosed: Object.freeze({ mode: 'startsWith', text: 'Cases Closed without seller Resolution' }),
  listingConfirmed: Object.freeze({ mode: 'startsWith', text: 'Confirm Listings are under Subscription Listing Limit' }),
  itemsLimit: Object.freeze({ mode: 'startsWith', text: 'Items Limit' }),
  dollarLimit: Object.freeze({ mode: 'startsWith', text: '$ Amount Limit' }),
  markShipped: Object.freeze({ mode: 'startsWith', text: 'Mark All New Orders as Shipped' }),
  move99: Object.freeze({ mode: 'startsWith', text: 'Move $0.99 Listings from Sniped (Non-Sale) Category to Sale Category' }),
  addTracking: Object.freeze({ mode: 'contains', text: 'Ctl + F and "Add Tracking"' }),
  missingShip: Object.freeze({ mode: 'contains', text: 'Ctrl + F and look for any orders missing "Ship"' }),
  findCheck: Object.freeze({ mode: 'contains', text: 'Ctrl + F on "Check"' }),
  snipe: Object.freeze({ mode: 'contains', text: 'Snipe Items |' }),
  cancelSubscribe: Object.freeze({ mode: 'contains', text: 'Cancel All Subscribe & Save Items on ALL Amazon Accounts' })
});

const SELLER_HEADERS = [
  'Computer', 'eBay Account', 'Current Seller Level', 'If Evaluated Today',
  'Transaction Defect Rate', 'Late Shipment Rate', 'Tracking On Time',
  'Cases Closed', 'Next Evaluation', 'Last Scanned', 'Overall Status', 'Source'
];

const SELLER_HISTORY_HEADERS = ['Timestamp', ...SELLER_HEADERS];

const LISTING_HEADERS = [
  'Computer', 'eBay Account', 'Store Plan', 'Active Listings',
  'Available Quantity', 'Out of Stock', 'In-Stock Rate',
  'Store Allowance', 'Store Allowance Usage', 'Store Allowance Status',
  'Dollar Used', 'Dollar Limit', 'Dollar Usage', 'Dollar Status',
  'Overall Status', 'Confirmed Month', 'Last Checked', 'Source',
  'Store Allowance Used', 'Store Allowance Left',
  'Seller Quantity Used', 'Seller Quantity Limit',
  'Seller Quantity Usage', 'Seller Quantity Status', 'Calculation Basis'
];

const LISTING_HISTORY_HEADERS = ['Timestamp', ...LISTING_HEADERS];

const SHIPPING_HEADERS = [
  'Timestamp', 'Computer', 'eBay Account', 'Status',
  'Marked Shipped', 'Batches', 'Error', 'Source',
  'Awaiting Before', 'Selected', 'Remaining'
];

const POSHMARK_STATS_HEADERS = [
  'Computer', 'Poshmark Account', 'Posher Since',
  'Profile Listings', 'Profile Listings Change',
  'Followers', 'Followers Change',
  'Shipped Orders All Time', 'Shipped Orders All Time Change',
  'Shipped Orders Last 90 Days', 'Shipped Orders Last 90 Days Change',
  'Days To Ship Last 90 Days', 'Days To Ship Last 90 Days Change',
  'Days To Ship Average', 'Days To Ship Average Change',
  'Total Sales Last 90 Days', 'Total Sales Last 90 Days Change',
  'Seller Cancellations Last 90 Days', 'Seller Cancellations Last 90 Days Change',
  'Approved Return Cases Last 90 Days', 'Approved Return Cases Last 90 Days Change',
  'Moderator Removed Listings Last 30 Days', 'Moderator Removed Listings Last 30 Days Change',
  'Available Listings', 'Available Listings Change',
  'Average Discount Off Original Price', 'Average Discount Off Original Price Change',
  'Self Shares Last 30 Days', 'Self Shares Last 30 Days Change',
  'Sold Listings All Time', 'Sold Listings All Time Change',
  'Total Earned All Time', 'Total Earned All Time Change',
  'Average Rating', 'Average Rating Change',
  'Total Ratings', 'Total Ratings Change',
  'Last Checked', 'Source'
];

const POSHMARK_STATS_HISTORY_HEADERS = ['Timestamp', ...POSHMARK_STATS_HEADERS];

// Zero-based columns in a Poshmark Stats History data row.
const POSHMARK_STATS_HISTORY_DELTA_PAIRS = [
  [4, 5, false], [6, 7, false], [8, 9, false], [10, 11, false],
  [12, 13, false], [14, 15, false], [16, 17, false],
  [18, 19, true], [20, 21, true], [22, 23, false], [24, 25, false],
  [26, 27, true], [28, 29, false], [30, 31, false], [32, 33, false],
  [34, 35, false], [36, 37, false]
];

const EBAY_SNAPSHOT_HEADERS = [
  'Computer', 'eBay Account',
  'Sales Today', 'Sales Last 7 Days', 'Sales Last 31 Days', 'Sales Last 31 Days Change',
  'Sales Last 90 Days',
  'Feedback Positive 30 Days', 'Feedback Neutral 30 Days', 'Feedback Negative 30 Days',
  'Traffic Impressions', 'Traffic Page Views',
  'Advertising Sales', 'Advertising Cost',
  'Last Checked', 'Source', 'Advertising Clicks', 'Advertising ROAS'
];

const EBAY_SNAPSHOT_HISTORY_HEADERS = ['Timestamp', ...EBAY_SNAPSHOT_HEADERS];

const MARKETPLACE_PROFIT_HEADERS = [
  'Timestamp', 'Platform', 'Computer', 'Account', 'Order Number', 'Item Title',
  'Marketplace Earnings', 'Marketplace Sold Price', 'Supplier', 'Supplier Total',
  'Supplier Profile', 'ETA', 'Profit', 'Margin', 'SKU', 'Source', 'Page URL',
  'Supplier Item IDs', 'Supplier Order Numbers', 'Supplier Match Sources',
  'Supplier Page URLs', 'Supplier Item Evidence', 'Order Date', 'Order Status',
  'Earnings Status'
];

const POSHMARK_COST_QUEUE_HEADERS = [
  'Last Updated', 'Month', 'Poshmark Order', 'Poshmark Account', 'Item Title', 'Poshmark Earnings',
  'Sold Price', 'Order Date', 'SKU', 'ASINs', 'Status', 'Reason', 'Amazon Cost',
  'Amazon Profile', 'Amazon Order', 'Amazon Match Source', 'Amazon Evidence',
  'Poshmark URL', 'Amazon URL', 'Attempted Amazon Profiles', 'Resolved At'
];

const EBAY_COST_QUEUE_HEADERS = [
  'Last Updated', 'Month', 'Computer', 'eBay Account', 'eBay Order', 'Item Title',
  'eBay Earnings', 'Order Date', 'SKU', 'ASINs', 'Note Status', 'Note Amazon Cost',
  'Note Amazon Profile', 'Profit From Note', 'Amazon Order Status', 'Amazon Order Cost',
  'Amazon Profile', 'Amazon Order', 'Amazon Match Source', 'Amazon Evidence', 'Amazon URL',
  'Cost Difference', 'Profit From Amazon Orders', 'Profit Difference', 'Reason',
  'Attempted Amazon Profiles', 'eBay URL', 'Resolved At', 'Note eBay Earnings',
  'Earnings Difference'
];

const POSHMARK_MONTH_HEADERS = [
  'Item Name', 'Cost of Goods', 'Earnings', 'Profit', 'Status', 'Notes',
  'Order Date', 'Poshmark Order', 'ASIN', 'Amazon Order', 'Amazon Profile',
  'Poshmark URL', 'Amazon URL'
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
  const poshmarkStats = ensureSheet_(ss, POSHMARK_STATS_DASHBOARD_SHEET, POSHMARK_STATS_HEADERS);
  const poshmarkStatsHistory = ensureSheet_(ss, POSHMARK_STATS_HISTORY_SHEET, POSHMARK_STATS_HISTORY_HEADERS);
  const ebaySnapshot = ensureSheet_(ss, EBAY_SNAPSHOT_DASHBOARD_SHEET, EBAY_SNAPSHOT_HEADERS);
  const ebaySnapshotHistory = ensureSheet_(ss, EBAY_SNAPSHOT_HISTORY_SHEET, EBAY_SNAPSHOT_HISTORY_HEADERS);
  const marketplaceProfit = ensureSheet_(ss, MARKETPLACE_PROFIT_HISTORY_SHEET, MARKETPLACE_PROFIT_HEADERS);
  const poshmarkCostQueue = ensureSheet_(ss, POSHMARK_COST_QUEUE_SHEET, POSHMARK_COST_QUEUE_HEADERS);
  const ebayCostQueue = ensureSheet_(ss, EBAY_COST_QUEUE_SHEET, EBAY_COST_QUEUE_HEADERS);
  const amazonSubscribeSave = ensureSheet_(ss, AMAZON_SUBSCRIBE_SAVE_HISTORY_SHEET, AMAZON_SUBSCRIBE_SAVE_HEADERS);
  const syncReceipts = ensureSheet_(ss, SYNC_RECEIPT_SHEET, SYNC_RECEIPT_HEADERS);
  const orderAuditRuns = ensureSheet_(ss, ORDER_AUDIT_RUNS_SHEET, ORDER_AUDIT_RUN_HEADERS);
  const orderAuditExpected = ensureSheet_(ss, ORDER_AUDIT_EXPECTED_SHEET, ORDER_AUDIT_EXPECTED_HEADERS);
  const orderAuditPurchases = ensureSheet_(ss, ORDER_AUDIT_PURCHASES_SHEET, ORDER_AUDIT_PURCHASE_HEADERS);
  const computerProfitSheets = PROFIT_COMPUTER_LABELS.map((computer) => ensureSheet_(ss, `${MARKETPLACE_PROFIT_PREFIX}${computer}`, MARKETPLACE_PROFIT_HEADERS));

  dedupeDashboardByComputer_(seller, SELLER_HEADERS.length, 10);
  dedupeDashboardByComputer_(listing, LISTING_HEADERS.length, 17);
  repairPoshmarkStatsHistoryDaily_(poshmarkStatsHistory, spreadsheetTimeZone_(ss));

  formatSellerDashboard_(seller);
  formatSellerHistory_(sellerHistory);
  formatListingDashboard_(listing);
  formatListingHistory_(listingHistory);
  formatShippingHistory_(shippingHistory);
  formatPoshmarkStatsSheet_(poshmarkStats, false);
  formatPoshmarkStatsSheet_(poshmarkStatsHistory, true);
  formatGenericDashboard_(ebaySnapshot, EBAY_SNAPSHOT_HEADERS.length);
  formatGenericDashboard_(ebaySnapshotHistory, EBAY_SNAPSHOT_HISTORY_HEADERS.length);
  formatProfitSheet_(marketplaceProfit);
  formatPoshmarkCostQueue_(poshmarkCostQueue);
  formatEbayCostQueue_(ebayCostQueue);
  formatGenericDashboard_(amazonSubscribeSave, AMAZON_SUBSCRIBE_SAVE_HEADERS.length);
  formatGenericDashboard_(syncReceipts, SYNC_RECEIPT_HEADERS.length);
  formatOrderAuditSheets_(orderAuditRuns, orderAuditExpected, orderAuditPurchases);
  computerProfitSheets.forEach(formatProfitSheet_);

  protectSheet_(sellerHistory, 'GLDN protected Seller Level history');
  protectSheet_(listingHistory, 'GLDN protected Listing Status history');
  protectSheet_(shippingHistory, 'GLDN protected Mark Shipped history');
  protectSheet_(poshmarkStatsHistory, 'GLDN protected Poshmark Stats history');
  protectSheet_(ebaySnapshotHistory, 'GLDN protected eBay Snapshot history');
  protectSheet_(marketplaceProfit, 'GLDN protected Marketplace Profit history');
  protectSheet_(poshmarkCostQueue, 'GLDN protected Poshmark Amazon cost queue');
  protectSheet_(ebayCostQueue, 'GLDN protected eBay profit reconciliation');
  protectSheet_(amazonSubscribeSave, 'GLDN protected Amazon Subscribe Save history');
  protectSheet_(syncReceipts, 'GLDN protected sync receipts');
  protectSheet_(orderAuditRuns, 'GLDN protected order audit runs');
  protectSheet_(orderAuditExpected, 'GLDN protected order audit eBay demand');
  protectSheet_(orderAuditPurchases, 'GLDN protected order audit Amazon purchases');

  ss.setActiveSheet(seller);
  SpreadsheetApp.flush();
}

function doPost(e) {
  try {
    validateConfiguredKey_();
    const payload = parsePayload_(e);
    validateKey_(payload.key);
    const action = cleanText_(payload.action);
    const syncId = cleanText_(payload.syncId || (payload.record && payload.record.syncId)).slice(0, 180);
    const writeActions = ['sellerLevel', 'accountLimits', 'markShipped', 'taskCompletion', 'amazonSubscribeSaveProfile', 'poshmarkStats', 'ebaySnapshot', 'marketplaceProfit', 'marketplaceProfitBatch', 'ebayMonthlyProfitBatch', 'ebayCostResolutionBatch', 'poshmarkMonthlyProfitBatch', 'poshmarkCostResolutionBatch', 'orderPlacementAuditConfig', 'orderPlacementAuditExpectedBatch', 'orderPlacementAuditAmazonBatch', 'receiptTest'];

    if (writeActions.includes(action) && syncId) {
      const response = withLock_(() => {
        const duplicate = findSyncReceipt_(syncId);
        if (duplicate) return { ...duplicate, ok: true, duplicate: true, syncId };
        const result = processDashboardAction_(action, payload.record || {});
        saveSyncReceipt_(syncId, action, payload.record || {}, result);
        return { ...result, syncId };
      });
      return json_(response);
    }

    return json_(processDashboardAction_(action, payload.record || {}));
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function processDashboardAction_(action, input) {
  if (action === 'ping') {
    return { ok: true, message: 'Dashboard connection works.', serverTime: new Date().toISOString() };
  }
  if (action === 'contractTest') {
    return { ok: true, message: 'Dashboard contract test passed.', ...dashboardContractTest_() };
  }
  if (action === 'tasksSchemaAudit') {
    return { ok: true, message: 'Tasks schema audit completed.', ...tasksSchemaAudit_(input) };
  }
  if (action === 'tasksMetricBoundaryProbe') {
    return { ok: true, message: 'Tasks metric boundary probe passed.', ...tasksMetricBoundaryProbe_(input) };
  }
  if (action === 'tasksMetricRefresh') {
    return { ok: true, message: 'Tasks metric alerts refreshed.', ...refreshTasksMetricRows_(input) };
  }
  if (action === 'tasksStaleBoundaryProbe') {
    return { ok: true, message: 'Tasks stale-alert boundary probe passed.', ...tasksStaleBoundaryProbe_(input) };
  }
  if (action === 'tasksStaleRefresh') {
    return { ok: true, message: 'Tasks stale alerts refreshed.', ...refreshTasksStaleAlerts_(input) };
  }
  if (action === 'tasksCompletionBoundaryProbe') {
    return { ok: true, message: 'Tasks completion boundary probe passed.', ...tasksCompletionBoundaryProbe_(input) };
  }
  if (action === 'receiptTest') {
    return { ok: true, message: 'Dashboard receipt test passed.', marker: cleanText_(input.marker) };
  }
  if (action === 'sellerLevel') {
    const record = normalizeSellerRecord_(input);
    return { ok: true, message: `Seller Level updated for ${record.computerLabel}.`, ...saveSellerLevel_(record) };
  }
  if (action === 'accountLimits') {
    const record = normalizeListingRecord_(input);
    return { ok: true, message: `Listing status updated for ${record.computerLabel}.`, ...saveListingStatus_(record) };
  }
  if (action === 'markShipped') {
    const record = normalizeShippingRecord_(input);
    return { ok: true, message: `Mark as Shipped logged for ${record.computerLabel}.`, ...saveMarkShipped_(record) };
  }
  if (action === 'taskCompletion') {
    const record = normalizeTaskCompletionRecord_(input);
    return { ok: true, message: `Task completion saved for ${record.computerLabel}.`, ...saveTaskCompletion_(record) };
  }
  if (action === 'amazonSubscribeSaveProfile') {
    const record = normalizeAmazonSubscribeSaveProfileRecord_(input);
    return { ok: true, message: `Amazon Subscribe & Save profile proof saved for ${record.computerLabel}.`, ...saveAmazonSubscribeSaveProfile_(record) };
  }
  if (action === 'poshmarkStats') {
    const record = normalizePoshmarkStatsRecord_(input);
    return { ok: true, message: `Poshmark stats updated for ${record.computerLabel}.`, ...savePoshmarkStats_(record) };
  }
  if (action === 'ebaySnapshot') {
    const record = normalizeEbaySnapshotRecord_(input);
    return { ok: true, message: `eBay snapshot updated for ${record.computerLabel}.`, ...saveEbaySnapshot_(record) };
  }
  if (action === 'marketplaceProfit') {
    const record = normalizeMarketplaceProfitRecord_(input);
    return { ok: true, message: `${record.platform} profit logged for ${record.computerLabel}.`, ...saveMarketplaceProfit_(record) };
  }
  if (action === 'marketplaceProfitBatch') {
    const inputs = Array.isArray(input.records) ? input.records : [];
    if (!inputs.length) throw new Error('Marketplace profit batch is empty.');
    if (inputs.length > 100) throw new Error('Marketplace profit batch cannot exceed 100 records.');
    const records = inputs.map(normalizeMarketplaceProfitRecord_);
    const saved = saveMarketplaceProfitBatch_(records);
    return { ok: true, message: `${saved.count} marketplace profit rows saved.`, ...saved };
  }
  if (action === 'ebayMonthlyProfitBatch') {
    const saved = saveEbayMonthlyProfitBatch_(input);
    return { ok: true, message: `${saved.count} monthly eBay reconciliation rows saved.`, ...saved };
  }
  if (action === 'ebayCostResolutionBatch') {
    const saved = saveEbayCostResolutionBatch_(input);
    return { ok: true, message: `${saved.count} eBay Amazon-cost results saved.`, ...saved };
  }
  if (action === 'ebayCostQueueRead') {
    const records = readOpenEbayCostQueue_(input);
    return { ok: true, message: `${records.length} open eBay Amazon-cost rows loaded.`, count: records.length, records };
  }
  if (action === 'poshmarkMonthlyProfitBatch') {
    const saved = savePoshmarkMonthlyProfitBatch_(input);
    return { ok: true, message: `${saved.count} monthly Poshmark rows saved.`, ...saved };
  }
  if (action === 'poshmarkCostResolutionBatch') {
    const saved = savePoshmarkCostResolutionBatch_(input);
    return { ok: true, message: `${saved.count} Poshmark Amazon-cost results saved.`, ...saved };
  }
  if (action === 'poshmarkCostQueueRead') {
    const records = readOpenPoshmarkCostQueue_(input);
    return { ok: true, message: `${records.length} open Poshmark Amazon-cost rows loaded.`, count: records.length, records };
  }
  if (action === 'orderPlacementAuditConfig') {
    return { ok: true, message: 'Order placement audit configured.', ...saveOrderPlacementAuditConfig_(input) };
  }
  if (action === 'orderPlacementAuditExpectedBatch') {
    const saved = saveOrderPlacementAuditExpectedBatch_(input);
    return { ok: true, message: `${saved.count} eBay demand units saved for order auditing.`, ...saved };
  }
  if (action === 'orderPlacementAuditAmazonBatch') {
    const saved = saveOrderPlacementAuditAmazonBatch_(input);
    return { ok: true, message: `${saved.count} Amazon purchase units saved for order auditing.`, ...saved };
  }
  if (action === 'orderPlacementAuditRead') {
    return { ok: true, message: 'Order placement audit loaded.', ...readOrderPlacementAudit_(input) };
  }
  throw new Error('Unsupported action.');
}

function orderAuditProfiles_(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[|,\n]+/);
  const seen = {};
  return values.map(cleanText_).filter((profile) => {
    const key = profile.toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function orderAuditRunKey_(input) {
  const explicit = cleanText_(input.runKey);
  if (explicit) return explicit;
  const computer = cleanText_(input.computerLabel);
  const account = cleanText_(input.accountLabel || input.ebayAccountLabel).toUpperCase();
  const month = cleanText_(input.monthKey);
  if (!computer || !account || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Order audit requires a computer, eBay account and YYYY-MM month.');
  }
  return [computer, account, month].join('|');
}

function orderAuditSheetRows_(sheet, headers) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
}

function orderAuditRewriteRows_(sheet, headers, rows) {
  const bodyRows = Math.max(0, sheet.getLastRow() - 1);
  if (bodyRows) sheet.getRange(2, 1, bodyRows, headers.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function orderAuditRemoveRows_(sheet, headers, predicate) {
  const rows = orderAuditSheetRows_(sheet, headers);
  const kept = rows.filter((row) => !predicate(row));
  if (kept.length !== rows.length) orderAuditRewriteRows_(sheet, headers, kept);
  return rows.length - kept.length;
}

function orderAuditFindRunRow_(sheet, runKey) {
  const rows = orderAuditSheetRows_(sheet, ORDER_AUDIT_RUN_HEADERS);
  const index = rows.findIndex((row) => cleanText_(row[1]) === runKey);
  return { rows, index };
}

function orderAuditUpsertRun_(input) {
  const sheet = ensureSheet_(getSpreadsheet_(), ORDER_AUDIT_RUNS_SHEET, ORDER_AUDIT_RUN_HEADERS);
  const runKey = orderAuditRunKey_(input);
  const found = orderAuditFindRunRow_(sheet, runKey);
  const previous = found.index >= 0 ? found.rows[found.index] : [];
  const expectedProfiles = Object.prototype.hasOwnProperty.call(input, 'expectedProfiles')
    ? orderAuditProfiles_(input.expectedProfiles)
    : orderAuditProfiles_(previous[5]);
  const scannedProfiles = Object.prototype.hasOwnProperty.call(input, 'scannedProfiles')
    ? orderAuditProfiles_(input.scannedProfiles)
    : orderAuditProfiles_(previous[7]);
  const expectedUnits = input.expectedUnits === undefined || input.expectedUnits === null || input.expectedUnits === ''
    ? Number(previous[6] || 0)
    : Math.max(0, Number(input.expectedUnits || 0));
  const status = cleanText_(input.status || previous[8] || 'Waiting for Amazon profile scans');
  const row = [
    new Date(),
    runKey,
    cleanText_(input.computerLabel || previous[2]),
    cleanText_(input.accountLabel || input.ebayAccountLabel || previous[3]).toUpperCase(),
    cleanText_(input.monthKey || previous[4]),
    expectedProfiles.join(' | '),
    expectedUnits,
    scannedProfiles.join(' | '),
    status
  ];
  if (found.index >= 0) sheet.getRange(found.index + 2, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  return {
    runKey,
    expectedProfiles,
    scannedProfiles,
    expectedUnits,
    status,
    computerLabel: row[2],
    accountLabel: row[3],
    monthKey: row[4]
  };
}

function saveOrderPlacementAuditConfig_(input) {
  return withLock_(() => {
    const runKey = orderAuditRunKey_(input);
    if (input.resetPurchases === true) {
      const ss = getSpreadsheet_();
      orderAuditRemoveRows_(
        ensureSheet_(ss, ORDER_AUDIT_EXPECTED_SHEET, ORDER_AUDIT_EXPECTED_HEADERS),
        ORDER_AUDIT_EXPECTED_HEADERS,
        (row) => cleanText_(row[1]) === runKey
      );
      orderAuditRemoveRows_(
        ensureSheet_(ss, ORDER_AUDIT_PURCHASES_SHEET, ORDER_AUDIT_PURCHASE_HEADERS),
        ORDER_AUDIT_PURCHASE_HEADERS,
        (row) => cleanText_(row[1]) === runKey
      );
    }
    const config = {
      ...input,
      runKey,
      status: 'Waiting for Amazon profile scans'
    };
    if (input.resetPurchases === true) config.scannedProfiles = [];
    else if (!Object.prototype.hasOwnProperty.call(input, 'scannedProfiles')) delete config.scannedProfiles;
    return orderAuditUpsertRun_(config);
  });
}

function saveOrderPlacementAuditExpectedBatch_(input) {
  return withLock_(() => {
    const records = Array.isArray(input.records) ? input.records : [];
    if (!records.length) throw new Error('Order audit eBay demand batch is empty.');
    if (records.length > 100) throw new Error('Order audit eBay demand batch cannot exceed 100 records.');
    const runKey = orderAuditRunKey_(input);
    const ss = getSpreadsheet_();
    const sheet = ensureSheet_(ss, ORDER_AUDIT_EXPECTED_SHEET, ORDER_AUDIT_EXPECTED_HEADERS);
    if (input.replace === true) {
      orderAuditRemoveRows_(sheet, ORDER_AUDIT_EXPECTED_HEADERS, (row) => cleanText_(row[1]) === runKey);
    }
    const now = new Date();
    const rows = records.map((record) => [
      now,
      runKey,
      cleanText_(record.computerLabel || input.computerLabel),
      cleanText_(record.accountLabel || record.ebayAccountLabel || input.accountLabel).toUpperCase(),
      cleanText_(record.monthKey || input.monthKey),
      cleanText_(record.orderNumber),
      cleanText_(record.orderDate),
      cleanText_(record.asin).toUpperCase(),
      Math.max(1, Number(record.unitIndex || 1)),
      Math.max(1, Number(record.quantity || 1)),
      cleanText_(record.itemTitle),
      cleanText_(record.orderStatus),
      cleanText_(record.recipient),
      cleanText_(record.recipientFingerprint),
      cleanText_(record.addressFingerprint),
      cleanText_(record.shippingBlock),
      cleanText_(record.pageUrl)
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ORDER_AUDIT_EXPECTED_HEADERS.length).setValues(rows);
    return { runKey, count: rows.length };
  });
}

function saveOrderPlacementAuditAmazonBatch_(input) {
  return withLock_(() => {
    const records = Array.isArray(input.records) ? input.records : [];
    if (records.length > 100) throw new Error('Order audit Amazon batch cannot exceed 100 records.');
    const runKey = orderAuditRunKey_(input);
    const supplierProfile = cleanText_(input.supplierProfile);
    if (!supplierProfile) throw new Error('Order audit Amazon profile is missing.');
    const ss = getSpreadsheet_();
    const sheet = ensureSheet_(ss, ORDER_AUDIT_PURCHASES_SHEET, ORDER_AUDIT_PURCHASE_HEADERS);
    if (input.replaceProfile === true) {
      orderAuditRemoveRows_(sheet, ORDER_AUDIT_PURCHASE_HEADERS, (row) => (
        cleanText_(row[1]) === runKey
        && cleanText_(row[5]).toLowerCase() === supplierProfile.toLowerCase()
      ));
    }
    const now = new Date();
    const rows = records.map((record) => [
      now,
      runKey,
      cleanText_(record.computerLabel || input.computerLabel),
      cleanText_(input.accountLabel).toUpperCase(),
      cleanText_(record.monthKey || input.monthKey),
      cleanText_(record.supplierProfile || supplierProfile),
      cleanText_(record.orderId),
      cleanText_(record.purchaseDate),
      cleanText_(record.asin).toUpperCase(),
      Math.max(1, Number(record.unitIndex || 1)),
      Math.max(1, Number(record.quantity || 1)),
      cleanText_(record.title || record.itemTitle),
      numberOrBlank_(record.cost),
      cleanText_(record.recipient),
      cleanText_(record.recipientFingerprint),
      cleanText_(record.addressFingerprint),
      cleanText_(record.shippingBlock),
      cleanText_(record.orderUrl),
      orderAuditProfiles_(record.seenProfiles || [supplierProfile]).join(' | ')
    ]);
    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ORDER_AUDIT_PURCHASE_HEADERS.length).setValues(rows);
    }

    let metadata = orderAuditUpsertRun_(input);
    if (input.profileCompleted === true) {
      const scannedProfiles = orderAuditProfiles_([...(metadata.scannedProfiles || []), supplierProfile]);
      const expectedProfiles = metadata.expectedProfiles || [];
      const allExpectedScanned = expectedProfiles.length > 0
        && expectedProfiles.every((profile) => scannedProfiles.some((scanned) => scanned.toLowerCase() === profile.toLowerCase()));
      metadata = orderAuditUpsertRun_({
        ...metadata,
        runKey,
        scannedProfiles,
        status: allExpectedScanned
          ? 'All expected Amazon profiles scanned'
          : `Scanned ${scannedProfiles.length} Amazon profile${scannedProfiles.length === 1 ? '' : 's'}; more may remain`
      });
    }
    return { runKey, count: rows.length, metadata };
  });
}

function orderAuditDateText_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'America/Chicago', 'yyyy-MM-dd');
  }
  return cleanText_(value);
}

function readOrderPlacementAudit_(input) {
  const runKey = orderAuditRunKey_(input);
  const ss = getSpreadsheet_();
  const runSheet = ensureSheet_(ss, ORDER_AUDIT_RUNS_SHEET, ORDER_AUDIT_RUN_HEADERS);
  const runFound = orderAuditFindRunRow_(runSheet, runKey);
  const runRow = runFound.index >= 0 ? runFound.rows[runFound.index] : [];
  const metadata = {
    runKey,
    computerLabel: cleanText_(runRow[2] || input.computerLabel),
    accountLabel: cleanText_(runRow[3] || input.accountLabel).toUpperCase(),
    monthKey: cleanText_(runRow[4] || input.monthKey),
    expectedProfiles: orderAuditProfiles_(runRow[5]),
    expectedUnits: Number(runRow[6] || 0),
    scannedProfiles: orderAuditProfiles_(runRow[7]),
    status: cleanText_(runRow[8] || 'No audit seed saved'),
    updatedAt: orderAuditDateText_(runRow[0])
  };
  const expectedRows = orderAuditSheetRows_(
    ensureSheet_(ss, ORDER_AUDIT_EXPECTED_SHEET, ORDER_AUDIT_EXPECTED_HEADERS),
    ORDER_AUDIT_EXPECTED_HEADERS
  ).filter((row) => cleanText_(row[1]) === runKey);
  const purchaseRows = orderAuditSheetRows_(
    ensureSheet_(ss, ORDER_AUDIT_PURCHASES_SHEET, ORDER_AUDIT_PURCHASE_HEADERS),
    ORDER_AUDIT_PURCHASE_HEADERS
  ).filter((row) => cleanText_(row[1]) === runKey);
  const expected = expectedRows.map((row) => ({
    runKey,
    computerLabel: cleanText_(row[2]),
    accountLabel: cleanText_(row[3]),
    monthKey: cleanText_(row[4]),
    orderNumber: cleanText_(row[5]),
    orderDate: orderAuditDateText_(row[6]),
    asin: cleanText_(row[7]),
    unitIndex: Number(row[8] || 1),
    quantity: Number(row[9] || 1),
    itemTitle: cleanText_(row[10]),
    orderStatus: cleanText_(row[11]),
    recipient: cleanText_(row[12]),
    recipientFingerprint: cleanText_(row[13]),
    addressFingerprint: cleanText_(row[14]),
    shippingBlock: cleanText_(row[15]),
    pageUrl: cleanText_(row[16])
  }));
  const purchases = purchaseRows.map((row) => ({
    runKey,
    computerLabel: cleanText_(row[2]),
    accountLabel: cleanText_(row[3]),
    monthKey: cleanText_(row[4]),
    supplierProfile: cleanText_(row[5]),
    seenProfiles: orderAuditProfiles_(row[18] || row[5]),
    orderId: cleanText_(row[6]),
    purchaseDate: orderAuditDateText_(row[7]),
    asin: cleanText_(row[8]),
    unitIndex: Number(row[9] || 1),
    quantity: Number(row[10] || 1),
    title: cleanText_(row[11]),
    cost: optionalNumber_(row[12]),
    recipient: cleanText_(row[13]),
    recipientFingerprint: cleanText_(row[14]),
    addressFingerprint: cleanText_(row[15]),
    shippingBlock: cleanText_(row[16]),
    orderUrl: cleanText_(row[17])
  }));
  return { metadata, expected, purchases };
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

function dashboardContractTest_() {
  const now = '2026-07-08T12:00:00.000Z';
  const samples = {
    sellerLevel: normalizeSellerRecord_({
      computerLabel: '0',
      ebayAccountLabel: 'FAK12',
      currentSellerLevel: 'Above Standard',
      evaluatedToday: 'Top Rated',
      transactionDefectRate: 0,
      lateShipmentRate: 1.18,
      trackingOnTime: 85.45,
      casesClosed: 0,
      nextEvaluation: 'Jul 20',
      capturedAt: now,
      pageUrl: 'https://www.ebay.com/sh/performance'
    }),
    accountLimits: normalizeListingRecord_({
      computerLabel: '2',
      ebayAccountLabel: 'FANCYFI',
      storePlan: 'Premium',
      activeListings: '8901',
      inStockQuantity: '5868',
      outOfStockCount: 3033,
      subscriptionListingLimit: '10000',
      subscriptionUsedThisMonth: 3899,
      subscriptionLeftThisMonth: 6101,
      subscriptionUsagePercent: 38.99,
      subscriptionStatus: 'GOOD',
      currentQuantityUsed: 5917,
      monthlySellerQuantityLimit: 88000,
      sellerQuantityUsagePercent: 6.72,
      sellerQuantityStatus: 'GOOD',
      currentDollarUsed: '235353.57',
      monthlySellerDollarLimit: '1000000',
      dollarUsagePercent: 23.54,
      dollarStatus: 'GOOD',
      overallStatus: 'GOOD',
      calculationBasis: 'Store monthly zero-insertion allowance',
      capturedAt: now,
      pageUrl: 'https://www.ebay.com/sh/ovw'
    }),
    markShipped: normalizeShippingRecord_({
      computerLabel: 'M1',
      ebayAccountLabel: 'HEARTSTONE',
      status: 'completed',
      markedCount: 12,
      batchCount: 12,
      completedAt: now,
      pageUrl: 'https://www.ebay.com/sh/ord'
    }),
    poshmarkStats: normalizePoshmarkStatsRecord_({
      computerLabel: '7',
      poshmarkAccountLabel: '@jgigreatdeals',
      shippedOrdersAllTime: 3793,
      shippedOrdersLast90: 1099,
      daysToShipLast90: 2.5,
      daysToShipAverage: 3.5,
      totalSalesLast90: 32886,
      sellerCancellationsLast90: 2.7,
      approvedReturnCasesLast90: 0.7,
      moderatorRemovedListingsLast30: 35,
      profileListings: 124001,
      followers: 85870,
      availableListings: 115493,
      averageDiscountOffOriginalPrice: 27,
      selfSharesLast30: 220404,
      soldListingsAllTime: 3935,
      totalEarnedAllTime: 89785.91,
      averageRating: 4.8,
      totalRatings: 2067,
      capturedAt: now,
      pageUrl: 'https://poshmark.com/users/self/closet_stats'
    }),
    ebaySnapshot: normalizeEbaySnapshotRecord_({
      computerLabel: '6',
      ebayAccountLabel: 'FINTIME',
      salesToday: 162.43,
      salesLast7Days: 1229.67,
      salesLast31Days: 8232.99,
      salesLast31DaysChange: 15.7,
      salesLast90Days: 21970.22,
      feedbackPositive30Days: 249,
      feedbackNeutral30Days: 1,
      feedbackNegative30Days: 1,
      trafficImpressions: 4770831,
      trafficPageViews: 12532,
      advertisingClicks: 706,
      advertisingSales: 392.1,
      advertisingRoas: 9.52,
      advertisingCost: 41.2,
      capturedAt: now,
      pageUrl: 'https://www.ebay.com/sh/ovw'
    }),
    marketplaceProfit: normalizeMarketplaceProfitRecord_({
      platform: 'Poshmark',
      computerLabel: 'M0',
      poshmarkAccountLabel: '@example',
      orderNumber: 'TEST-123',
      itemTitle: 'Contract Test Item',
      marketplaceEarnings: 13.4,
      marketplaceSoldPrice: 17,
      supplier: 'Amazon',
      supplierTotal: 9.99,
      supplierProfile: 'F9132',
      eta: '7/6',
      sku: 'SKU123',
      capturedAt: now,
      pageUrl: 'https://poshmark.com/order/sales/test'
    })
  };

  const checks = [
    ['sellerLevel identity', samples.sellerLevel.computerLabel === '0' && samples.sellerLevel.ebayAccountLabel === 'FAK12'],
    ['accountLimits numeric conversion', samples.accountLimits.activeListings === 8901 && samples.accountLimits.subscriptionListingLimit === 10000],
    ['markShipped count conversion', samples.markShipped.markedCount === 12],
    ['poshmarkStats computer', samples.poshmarkStats.computerLabel === '7'],
    ['ebaySnapshot feedback', samples.ebaySnapshot.feedbackNeutral30Days === 1],
    ['marketplaceProfit account fallback', samples.marketplaceProfit.accountLabel === '@example' && samples.marketplaceProfit.supplierTotal === 9.99]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) throw new Error('Dashboard contract test failed: ' + failed.join(', '));
  return { checkedActions: Object.keys(samples), checkedAt: now };
}

function tasksCompletionBoundaryProbe_(input) {
  if (cleanText_(input && input.confirm) !== 'T06_TEMP_SHEET_PROBE') {
    throw new Error('T-06 probe confirmation is missing.');
  }
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const sheetName = `_GLDN_T06_${Utilities.getUuid().replace(/-/g, '').slice(0, 10)}`;
    let sheet = null;
    let result = null;
    try {
      sheet = ss.insertSheet(sheetName);
      sheet.hideSheet();
      sheet.getRange(3, 4, 1, 7).setValues([['Task', 'M0', '2', '6', '0', 'M1', '7']]);
      sheet.getRange(4, 4, 1, 7).setValues([['Platform', 'ebay', 'ebay', 'ebay', 'ebay', 'ebay', 'poshmark']]);
      sheet.getRange(5, 4).setValue(TASK_COMPLETION_RULES.move99.taskStartsWith);
      sheet.getRange(5, 5, 1, 5).setValues([[false, false, false, false, false]]);
      sheet.getRange(5, 10).setBackground('#666666');

      const accepted = normalizeTaskCompletionRecord_({
        featureKey: 'move99',
        computerLabel: '0',
        ebayAccountLabel: 'FAK12',
        status: 'Completed',
        scanMode: 'price99',
        proofType: 'final-zero-scan',
        verifiedZeroRemaining: true,
        remainingCount: 0,
        failedCount: 0,
        scannedCount: 288,
        completedAt: '2026-07-21T12:00:00.000Z',
        pageUrl: 'https://www.ebay.com/sh/lst/active'
      });
      const rejected = [
        { ...accepted, featureKey: 'second-round' },
        { ...accepted, featureKey: 'bulk-listing' },
        { ...accepted, featureKey: 'sniping' },
        { ...accepted, status: 'Review ready' },
        { ...accepted, verifiedZeroRemaining: false },
        { ...accepted, remainingCount: 1 },
        { ...accepted, failedCount: 1 },
        { ...accepted, scanMode: 'non99' }
      ];
      const rejectedCount = rejected.filter((record) => !taskCompletionProof_(record).ok).length;
      if (rejectedCount !== rejected.length) throw new Error('T-06 accepted an unproven workflow state.');

      const write = syncTasksCompletion_(accepted, sheet);
      SpreadsheetApp.flush();
      const checked = sheet.getRange(5, 8).getValue() === true;
      const poshmarkClear = sheet.getRange(5, 10).getDisplayValue() === ''
        && sheet.getRange(5, 10).getDataValidation() === null;
      const untouched = [5, 6, 7, 9].every((column) => sheet.getRange(5, column).getValue() === false);
      if (!write.checked || !checked || !poshmarkClear || !untouched) {
        throw new Error('T-06 temporary-sheet readback did not match the exact computer boundary.');
      }
      result = {
        acceptedCount: 1,
        rejectedCount,
        taskRow: write.row,
        computerColumn: 8,
        onlyComputer0Checked: true,
        poshmarkOnlyStayedGrey: true,
        marketplaceActions: 0,
        temporarySheetDeleted: false
      };
      return result;
    } finally {
      if (sheet) ss.deleteSheet(sheet);
      if (result) result.temporarySheetDeleted = true;
    }
  });
}

function tasksMetricBoundaryProbe_(input) {
  if (cleanText_(input && input.confirm) !== 'T03_TEMP_SHEET_PROBE') {
    throw new Error('T-03 probe confirmation is missing.');
  }
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const sheetName = `_GLDN_T03_${Utilities.getUuid().replace(/-/g, '').slice(0, 10)}`;
    let sheet = null;
    try {
      sheet = ss.insertSheet(sheetName);
      sheet.hideSheet();
      sheet.getRange(3, 5, 1, 5).setValues([['M0', '2', '6', '0', 'M1']]);
      sheet.getRange(4, 4, 4, 1).setValues([
        ['Transaction Defect Rate | Notify if Above Agreed Limit:'],
        ['Late Shipment Rate | Must be Below 3%:'],
        ['Tracking Uploaded On Time & Validated:'],
        ['Cases Closed without seller Resolution | Notify if Above 0%:']
      ]);
      sheet.getRange(4, 5, 4, 5).setValues([
        [0, 0.0001, 0, 0, 0],
        [0.015, 0.019, 0.024, 0.03, ''],
        [0.8499, 0.85, 0.90, '', true],
        [0, 0, 0, 0.0001, 0]
      ]).setNumberFormat('0.00%');

      applyTasksMetricAlerts_(sheet);
      SpreadsheetApp.flush();

      const colors = sheet.getRange(4, 5, 4, 5).getBackgrounds();
      const alerts = sheet.getRange(4, 11, 4, 1).getDisplayValues().map((row) => row[0]);
      const alertColors = sheet.getRange(4, 11, 4, 1).getBackgrounds().map((row) => row[0]);
      const expectedColors = [
        ['#ffffff', '#ff0000', '#ffffff', '#ffffff', '#ffffff'],
        ['#ffffff', '#f9cb9c', '#f9cb9c', '#ff0000', '#ffffff'],
        ['#f9cb9c', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
        ['#ffffff', '#ffffff', '#ffffff', '#ff0000', '#ffffff']
      ];
      const expectedAlerts = ['CHECK 2', 'CHECK 2 & 6 & 0', 'CHECK M0', 'CHECK 0'];
      const expectedAlertColors = ['#ff0000', '#ff0000', '#ff0000', '#ff0000'];
      const passed = JSON.stringify(colors) === JSON.stringify(expectedColors)
        && JSON.stringify(alerts) === JSON.stringify(expectedAlerts)
        && JSON.stringify(alertColors) === JSON.stringify(expectedAlertColors);
      if (!passed) throw new Error(`T-03 live readback mismatch: ${JSON.stringify({ colors, alerts, alertColors })}`);
      return {
        probe: 'T-03',
        passed: true,
        temporarySheet: sheetName,
        temporarySheetDeleted: true,
        marketplaceActions: 0,
        colors,
        alerts,
        alertColors
      };
    } finally {
      if (sheet) ss.deleteSheet(sheet);
    }
  });
}

function refreshTasksMetricRows_(input) {
  if (cleanText_(input && input.confirm) !== 'T03_REFRESH_TASKS') {
    throw new Error('T-03 Tasks refresh confirmation is missing.');
  }
  return withLock_(() => {
    const sheet = getSpreadsheet_().getSheetByName(TASKS_SHEET);
    if (!sheet) throw new Error(`Missing ${TASKS_SHEET} sheet.`);
    ensureTasksMetricConditionalFormatting_(sheet);
    applyTasksMetricRows_(sheet);
    SpreadsheetApp.flush();
    const rows = [
      findTaskRowByStartsWith_(sheet, 'Transaction Defect Rate'),
      findTaskRowByStartsWith_(sheet, 'Late Shipment Rate'),
      findTaskRowByStartsWith_(sheet, 'Tracking Uploaded On Time'),
      findTaskRowByStartsWith_(sheet, 'Cases Closed without seller Resolution')
    ];
    if (rows.some((row) => !row)) throw new Error('One or more Tasks metric rows are missing.');
    return {
      refreshed: true,
      sheet: TASKS_SHEET,
      rows,
      alerts: rows.map((row) => sheet.getRange(row, 11).getDisplayValue()),
      marketplaceActions: 0
    };
  });
}

function tasksStaleBoundaryProbe_(input) {
  if (cleanText_(input && input.confirm) !== 'T04_TEMP_SHEET_PROBE') {
    throw new Error('T-04 probe confirmation is missing.');
  }
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const sheetName = `_GLDN_T04_${Utilities.getUuid().replace(/-/g, '').slice(0, 10)}`;
    const now = new Date('2026-07-30T12:00:00-05:00');
    let sheet = null;
    try {
      sheet = ss.insertSheet(sheetName);
      sheet.hideSheet();
      sheet.getRange(3, 5, 1, 5).setValues([['M0', '2', '6', '0', 'M1']]);
      sheet.getRange(4, 4, 5, 1).setValues([
        ['Ctl + F and "Add Tracking" to any order that has been placed'],
        ['Ctrl + F and look for any orders missing "Ship" beyond today'],
        ['Ctrl + F on "Check"'],
        ['Snipe Items | 10 Items to Snipe Daily'],
        ['Cancel All Subscribe & Save Items on ALL Amazon Accounts']
      ]);
      sheet.getRange(4, 5, 3, 5).setValues([
        [false, false, true, false, false],
        [false, false, true, false, false],
        [false, false, true, false, false]
      ]);
      const noteAt = (days) => {
        const date = new Date(now.getTime() - days * 86400000);
        return `Last checked: ${date.toISOString()}\nEpoch: ${date.getTime()}`;
      };
      const dailyNotes = [noteAt(1), noteAt(3.1), noteAt(10), '', noteAt(2.9)];
      sheet.getRange(4, 5, 3, 5).setNotes([dailyNotes, dailyNotes, dailyNotes]);
      sheet.getRange(7, 5, 1, 5).setValues([[false, false, false, false, false]]);
      sheet.getRange(7, 5, 1, 5).setNotes([[noteAt(10), noteAt(9), noteAt(8), noteAt(7), noteAt(6)]]);

      applyStaleTaskAlerts_(sheet, now, false);
      SpreadsheetApp.flush();

      const dailyAlerts = sheet.getRange(4, 11, 3, 1).getDisplayValues().map((row) => row[0]);
      const dailyColors = sheet.getRange(4, 11, 3, 1).getBackgrounds().map((row) => row[0]);
      const snipe = sheet.getRange(7, 11, 1, 3).getDisplayValues()[0];
      const snipeColor = sheet.getRange(7, 13).getBackground();
      const monthly = sheet.getRange(8, 12).getDisplayValue();
      const monthlyColor = sheet.getRange(8, 12).getBackground();
      const expectedDaily = ['CHECK 2 & 0', 'CHECK 2 & 0', 'CHECK 2 & 0'];
      const passed = JSON.stringify(dailyAlerts) === JSON.stringify(expectedDaily)
        && dailyColors.every((color) => color === '#ff0000')
        && JSON.stringify(snipe) === JSON.stringify(['Last Sniped:', 'M1', 'NEED TO SNIPE'])
        && snipeColor === '#ff0000'
        && monthly === 'CHECK'
        && monthlyColor === '#ff0000';
      if (!passed) throw new Error(`T-04 live readback mismatch: ${JSON.stringify({ dailyAlerts, dailyColors, snipe, snipeColor, monthly, monthlyColor })}`);
      return {
        probe: 'T-04',
        passed: true,
        temporarySheet: sheetName,
        temporarySheetDeleted: true,
        dailyAlerts,
        snipe,
        monthly,
        marketplaceActions: 0
      };
    } finally {
      if (sheet) ss.deleteSheet(sheet);
    }
  });
}

function refreshTasksStaleAlerts_(input) {
  if (cleanText_(input && input.confirm) !== 'T04_REFRESH_TASKS') {
    throw new Error('T-04 Tasks refresh confirmation is missing.');
  }
  return withLock_(() => {
    const sheet = getSpreadsheet_().getSheetByName(TASKS_SHEET);
    if (!sheet) throw new Error(`Missing ${TASKS_SHEET} sheet.`);
    ensureStaleTaskConditionalFormatting_(sheet);
    applyStaleTaskAlerts_(sheet);
    SpreadsheetApp.flush();
    const dailyRows = [
      findTaskRowByContains_(sheet, 'Ctl + F and "Add Tracking"'),
      findTaskRowByContains_(sheet, 'Ctrl + F and look for any orders missing "Ship"'),
      findTaskRowByContains_(sheet, 'Ctrl + F on "Check"')
    ];
    const snipeRow = findTaskRowByContains_(sheet, 'Snipe Items |');
    const monthlyRow = findTaskRowByContains_(sheet, 'Cancel All Subscribe & Save Items on ALL Amazon Accounts');
    return {
      refreshed: true,
      sheet: TASKS_SHEET,
      dailyRows,
      dailyAlerts: dailyRows.map((row) => sheet.getRange(row, 11).getDisplayValue()),
      snipeRow,
      snipe: sheet.getRange(snipeRow, 11, 1, 3).getDisplayValues()[0],
      monthlyRow,
      monthlyFormula: sheet.getRange(monthlyRow, 12).getFormula(),
      monthlyValue: sheet.getRange(monthlyRow, 12).getDisplayValue(),
      marketplaceActions: 0
    };
  });
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
    formatHeader_(dashboard, LISTING_HEADERS.length, '#7c3aed');
    formatHeader_(history, LISTING_HISTORY_HEADERS.length, '#4c1d95');
    const timestamp = validDate_(record.confirmedAt || record.capturedAt);
    const rowValues = [
      record.computerLabel, record.ebayAccountLabel, record.storePlan,
      numberOrBlank_(record.activeListings), numberOrBlank_(record.availableQuantity),
      numberOrBlank_(record.outOfStockCount), percentRatioCell_(record.inStockPercent),
      numberOrBlank_(record.subscriptionListingLimit), percentRatioCell_(record.subscriptionUsagePercent), record.subscriptionStatus,
      numberOrBlank_(record.currentDollarUsed), numberOrBlank_(record.monthlySellerDollarLimit),
      percentRatioCell_(record.dollarUsagePercent), record.dollarStatus,
      record.overallStatus, record.limitsConfirmedMonth, timestamp, record.pageUrl,
      numberOrBlank_(record.subscriptionUsedThisMonth), numberOrBlank_(record.subscriptionLeftThisMonth),
      numberOrBlank_(record.currentQuantityUsed), numberOrBlank_(record.monthlySellerQuantityLimit),
      percentRatioCell_(record.sellerQuantityUsagePercent), record.sellerQuantityStatus,
      record.calculationBasis
    ];
    dedupeDashboardByComputer_(dashboard, LISTING_HEADERS.length, 17);
    const row = findDashboardRow_(dashboard, record.computerLabel);
    dashboard.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
    applyListingRowFormatting_(dashboard, row, record, 0);
    history.appendRow([timestamp, ...rowValues]);
    applyListingRowFormatting_(history, history.getLastRow(), record, 1);
    const task = syncTasksListingStatus_(record);
    sortDashboard_(dashboard, LISTING_HEADERS.length, 17);
    SpreadsheetApp.flush();
    return {
      row,
      overallStatus: record.overallStatus,
      taskRow: task.row,
      taskCell: task.cell,
      taskChecked: task.checked
    };
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
      record.error, record.pageUrl,
      numberOrBlank_(record.beforeCount), numberOrBlank_(record.selectedCount), numberOrBlank_(record.remainingCount)
    ]);
    const row = history.getLastRow();
    history.getRange(row, 1, 1, SHIPPING_HEADERS.length)
      .setBorder(true, true, true, true, true, true, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
    const statusCell = history.getRange(row, 4);
    const successful = /^(completed|no awaiting orders)$/i.test(record.status);
    applyStateColor_(statusCell, successful ? 'good' : 'critical');
    const task = syncTasksMarkShipped_(record);
    SpreadsheetApp.flush();
    return { row, taskRow: task.row, taskChecked: task.checked };
  });
}

function saveTaskCompletion_(record) {
  return withLock_(() => {
    const proof = taskCompletionProof_(record);
    if (!proof.ok) throw new Error(proof.error);
    const task = syncTasksCompletion_(record);
    SpreadsheetApp.flush();
    return { featureKey: record.featureKey, taskRow: task.row, taskChecked: task.checked };
  });
}

function saveAmazonSubscribeSaveProfile_(record) {
  return withLock_(() => {
    const proof = amazonSubscribeSaveProfileProof_(record);
    if (!proof.ok) throw new Error(proof.error);
    const ss = getSpreadsheet_();
    const history = ensureSheet_(ss, AMAZON_SUBSCRIBE_SAVE_HISTORY_SHEET, AMAZON_SUBSCRIBE_SAVE_HEADERS);
    const timestamp = validDate_(record.completedAt || new Date());
    history.appendRow([
      timestamp,
      record.computerLabel,
      record.ebayAccountLabel,
      record.amazonProfileLabel,
      record.amazonAccountLabel,
      record.status,
      numberOrBlank_(record.cancelledCount),
      numberOrBlank_(record.remainingCount),
      numberOrBlank_(record.failedCount),
      record.scopeSummary,
      record.runId,
      record.pageUrl
    ]);
    const row = history.getLastRow();
    history.getRange(row, 1, 1, AMAZON_SUBSCRIBE_SAVE_HEADERS.length)
      .setBorder(true, true, true, true, true, true, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
    formatGenericDashboard_(history, AMAZON_SUBSCRIBE_SAVE_HEADERS.length);
    SpreadsheetApp.flush();
    return { row, currentProfileVerified: true, taskChecked: false };
  });
}

function savePoshmarkStats_(record) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const dashboard = ensureSheet_(ss, POSHMARK_STATS_DASHBOARD_SHEET, POSHMARK_STATS_HEADERS);
    const history = ensureSheet_(ss, POSHMARK_STATS_HISTORY_SHEET, POSHMARK_STATS_HISTORY_HEADERS);
    formatPoshmarkStatsSheet_(dashboard, false);
    formatPoshmarkStatsSheet_(history, true);
    const timestamp = validDate_(record.capturedAt);
    const timeZone = spreadsheetTimeZone_(ss);
    const repair = repairPoshmarkStatsHistoryDaily_(history, timeZone);
    const historyContext = findPoshmarkStatsHistoryContext_(history, record.computerLabel, timestamp, timeZone);
    const previous = historyContext.previous;
    const row = findDashboardRow_(dashboard, record.computerLabel);
    const previousMetric = (columnIndex, isPercent) => {
      if (!previous.length) return null;
      return isPercent ? percentToNumber_(previous[columnIndex]) : previous[columnIndex];
    };

    const rowValues = [
      record.computerLabel,
      record.poshmarkAccountLabel,
      record.posherSince,
      numberOrBlank_(record.profileListings), deltaValue_(record.profileListings, previousMetric(4, false)),
      numberOrBlank_(record.followers), deltaValue_(record.followers, previousMetric(6, false)),
      numberOrBlank_(record.shippedOrdersAllTime), deltaValue_(record.shippedOrdersAllTime, previousMetric(8, false)),
      numberOrBlank_(record.shippedOrdersLast90), deltaValue_(record.shippedOrdersLast90, previousMetric(10, false)),
      numberOrBlank_(record.daysToShipLast90), deltaValue_(record.daysToShipLast90, previousMetric(12, false)),
      numberOrBlank_(record.daysToShipAverage), deltaValue_(record.daysToShipAverage, previousMetric(14, false)),
      numberOrBlank_(record.totalSalesLast90), deltaValue_(record.totalSalesLast90, previousMetric(16, false)),
      percentCell_(record.sellerCancellationsLast90), deltaValue_(record.sellerCancellationsLast90, previousMetric(18, true)),
      percentCell_(record.approvedReturnCasesLast90), deltaValue_(record.approvedReturnCasesLast90, previousMetric(20, true)),
      numberOrBlank_(record.moderatorRemovedListingsLast30), deltaValue_(record.moderatorRemovedListingsLast30, previousMetric(22, false)),
      numberOrBlank_(record.availableListings), deltaValue_(record.availableListings, previousMetric(24, false)),
      percentCell_(record.averageDiscountOffOriginalPrice), deltaValue_(record.averageDiscountOffOriginalPrice, previousMetric(26, true)),
      numberOrBlank_(record.selfSharesLast30), deltaValue_(record.selfSharesLast30, previousMetric(28, false)),
      numberOrBlank_(record.soldListingsAllTime), deltaValue_(record.soldListingsAllTime, previousMetric(30, false)),
      numberOrBlank_(record.totalEarnedAllTime), deltaValue_(record.totalEarnedAllTime, previousMetric(32, false)),
      numberOrBlank_(record.averageRating), deltaValue_(record.averageRating, previousMetric(34, false)),
      numberOrBlank_(record.totalRatings), deltaValue_(record.totalRatings, previousMetric(36, false)),
      timestamp,
      record.pageUrl
    ];

    dashboard.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
    formatGenericRow_(dashboard, row, rowValues.length);
    let historyRow = historyContext.todayRow;
    let historyMode = 'updated';
    if (historyRow) {
      history.getRange(historyRow, 1, 1, POSHMARK_STATS_HISTORY_HEADERS.length).setValues([[timestamp, ...rowValues]]);
    } else {
      history.appendRow([timestamp, ...rowValues]);
      historyRow = history.getLastRow();
      historyMode = 'appended';
    }
    rebuildPoshmarkStatsHistoryDeltas_(history);
    formatGenericRow_(history, historyRow, POSHMARK_STATS_HISTORY_HEADERS.length);
    sortDashboard_(dashboard, POSHMARK_STATS_HEADERS.length, 38);
    SpreadsheetApp.flush();
    return {
      row,
      historyRow,
      historyMode,
      historyDate: poshmarkStatsDayKey_(timestamp, timeZone),
      previousDate: historyContext.previousDate,
      removedDuplicateHistoryRows: repair.removedDuplicates
    };
  });
}

function repairPoshmarkStatsDailyHistory() {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const history = ensureSheet_(ss, POSHMARK_STATS_HISTORY_SHEET, POSHMARK_STATS_HISTORY_HEADERS);
    const result = repairPoshmarkStatsHistoryDaily_(history, spreadsheetTimeZone_(ss));
    formatPoshmarkStatsSheet_(history, true);
    SpreadsheetApp.flush();
    return result;
  });
}

function repairPoshmarkStatsHistoryDaily_(history, timeZone) {
  const removedDuplicates = dedupePoshmarkStatsHistoryDaily_(history, timeZone);
  const rebuiltRows = rebuildPoshmarkStatsHistoryDeltas_(history);
  return { removedDuplicates, rebuiltRows };
}

function dedupePoshmarkStatsHistoryDaily_(history, timeZone) {
  const lastRow = history.getLastRow();
  if (lastRow < 3) return 0;
  const values = history.getRange(2, 1, lastRow - 1, POSHMARK_STATS_HISTORY_HEADERS.length).getValues();
  const keepByComputerDay = {};
  values.forEach((value, index) => {
    const computer = computerKey_(value[1]);
    const timestamp = timestampMs_(value[0]);
    if (!computer || timestamp == null) return;
    const day = poshmarkStatsDayKey_(value[0], timeZone);
    const key = `${computer}\u0000${day}`;
    const existing = keepByComputerDay[key];
    if (!existing || timestamp >= existing.timestamp) {
      keepByComputerDay[key] = { rowNumber: index + 2, timestamp };
    }
  });

  const deleteRows = [];
  values.forEach((value, index) => {
    const computer = computerKey_(value[1]);
    const timestamp = timestampMs_(value[0]);
    if (!computer || timestamp == null) return;
    const key = `${computer}\u0000${poshmarkStatsDayKey_(value[0], timeZone)}`;
    const rowNumber = index + 2;
    if (keepByComputerDay[key] && keepByComputerDay[key].rowNumber !== rowNumber) deleteRows.push(rowNumber);
  });
  deleteSheetRowsInGroups_(history, deleteRows);
  return deleteRows.length;
}

function deleteSheetRowsInGroups_(sheet, rowNumbers) {
  const rows = [...new Set(rowNumbers)].sort((a, b) => a - b);
  if (!rows.length) return 0;
  const groups = [];
  let start = rows[0];
  let end = rows[0];
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index] === end + 1) {
      end = rows[index];
      continue;
    }
    groups.push({ start, count: end - start + 1 });
    start = rows[index];
    end = rows[index];
  }
  groups.push({ start, count: end - start + 1 });
  groups.sort((a, b) => b.start - a.start).forEach((group) => sheet.deleteRows(group.start, group.count));
  return groups.length;
}

function rebuildPoshmarkStatsHistoryDeltas_(history) {
  const lastRow = history.getLastRow();
  if (lastRow < 2) return 0;
  const rowCount = lastRow - 1;
  const values = history.getRange(2, 1, rowCount, POSHMARK_STATS_HISTORY_HEADERS.length).getValues();
  const ordered = values.map((value, index) => ({ value, index, timestamp: timestampMs_(value[0]) || 0 }))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
  const previousByComputer = {};
  ordered.forEach((entry) => {
    const computer = computerKey_(entry.value[1]);
    if (!computer) return;
    const previous = previousByComputer[computer];
    POSHMARK_STATS_HISTORY_DELTA_PAIRS.forEach(([valueIndex, deltaIndex, isPercent]) => {
      if (!previous) {
        entry.value[deltaIndex] = '';
        return;
      }
      const currentValue = isPercent ? percentToNumber_(entry.value[valueIndex]) : entry.value[valueIndex];
      const previousValue = isPercent ? percentToNumber_(previous[valueIndex]) : previous[valueIndex];
      entry.value[deltaIndex] = deltaValue_(currentValue, previousValue);
    });
    previousByComputer[computer] = entry.value;
  });
  history.getRange(2, 1, rowCount, POSHMARK_STATS_HISTORY_HEADERS.length).setValues(values);
  return rowCount;
}

function findPoshmarkStatsHistoryContext_(history, computerLabel, timestamp, timeZone) {
  const lastRow = history.getLastRow();
  if (lastRow < 2) return { todayRow: 0, previous: [], previousDate: '' };
  const values = history.getRange(2, 1, lastRow - 1, POSHMARK_STATS_HISTORY_HEADERS.length).getValues();
  const computer = computerKey_(computerLabel);
  const targetDay = poshmarkStatsDayKey_(timestamp, timeZone);
  let today = null;
  let previous = null;
  values.forEach((value, index) => {
    if (computerKey_(value[1]) !== computer) return;
    const candidateTime = timestampMs_(value[0]);
    if (candidateTime == null) return;
    const candidateDay = poshmarkStatsDayKey_(value[0], timeZone);
    const candidate = { row: index + 2, value, timestamp: candidateTime, day: candidateDay };
    if (candidateDay === targetDay && (!today || candidateTime >= today.timestamp)) today = candidate;
    if (candidateDay < targetDay && (!previous || candidateTime >= previous.timestamp)) previous = candidate;
  });
  return {
    todayRow: today ? today.row : 0,
    previous: previous ? previous.value : [],
    previousDate: previous ? previous.day : ''
  };
}

function poshmarkStatsDayKey_(value, timeZone) {
  return Utilities.formatDate(validDate_(value), timeZone || Session.getScriptTimeZone() || 'America/Chicago', 'yyyy-MM-dd');
}

function spreadsheetTimeZone_(ss) {
  const spreadsheetZone = ss && typeof ss.getSpreadsheetTimeZone === 'function' ? ss.getSpreadsheetTimeZone() : '';
  return spreadsheetZone || Session.getScriptTimeZone() || 'America/Chicago';
}

function timestampMs_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function saveEbaySnapshot_(record) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const dashboard = ensureSheet_(ss, EBAY_SNAPSHOT_DASHBOARD_SHEET, EBAY_SNAPSHOT_HEADERS);
    const history = ensureSheet_(ss, EBAY_SNAPSHOT_HISTORY_SHEET, EBAY_SNAPSHOT_HISTORY_HEADERS);
    const timestamp = validDate_(record.capturedAt);
    const rowValues = [
      record.computerLabel,
      record.ebayAccountLabel,
      numberOrBlank_(record.salesToday),
      numberOrBlank_(record.salesLast7Days),
      numberOrBlank_(record.salesLast31Days),
      percentCell_(record.salesLast31DaysChange),
      numberOrBlank_(record.salesLast90Days),
      numberOrBlank_(record.feedbackPositive30Days),
      numberOrBlank_(record.feedbackNeutral30Days),
      numberOrBlank_(record.feedbackNegative30Days),
      numberOrBlank_(record.trafficImpressions),
      numberOrBlank_(record.trafficPageViews),
      numberOrBlank_(record.advertisingSales),
      numberOrBlank_(record.advertisingCost),
      timestamp,
      record.pageUrl,
      numberOrBlank_(record.advertisingClicks),
      numberOrBlank_(record.advertisingRoas)
    ];
    dedupeDashboardByComputer_(dashboard, EBAY_SNAPSHOT_HEADERS.length, 15);
    const row = findDashboardRow_(dashboard, record.computerLabel);
    dashboard.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
    formatGenericRow_(dashboard, row, rowValues.length);
    history.appendRow([timestamp, ...rowValues]);
    formatGenericRow_(history, history.getLastRow(), EBAY_SNAPSHOT_HISTORY_HEADERS.length);
    sortDashboard_(dashboard, EBAY_SNAPSHOT_HEADERS.length, 15);
    SpreadsheetApp.flush();
    return { row };
  });
}

function saveMarketplaceProfit_(record) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const history = ensureSheet_(ss, MARKETPLACE_PROFIT_HISTORY_SHEET, MARKETPLACE_PROFIT_HEADERS);
    const computerSheet = ensureSheet_(ss, `${MARKETPLACE_PROFIT_PREFIX}${record.computerLabel}`, MARKETPLACE_PROFIT_HEADERS);
    const timestamp = validDate_(record.capturedAt || record.preparedAt || record.completedAt || new Date());
    const profit = record.profit == null && record.marketplaceEarnings != null && record.supplierTotal != null
      ? record.marketplaceEarnings - record.supplierTotal
      : record.profit;
    const margin = record.margin == null && profit != null && record.marketplaceEarnings
      ? profit / record.marketplaceEarnings
      : record.margin;
    const rowValues = [
      timestamp,
      record.platform,
      record.computerLabel,
      record.accountLabel,
      record.orderNumber,
      record.itemTitle,
      numberOrBlank_(record.marketplaceEarnings),
      numberOrBlank_(record.marketplaceSoldPrice),
      record.supplier,
      numberOrBlank_(record.supplierTotal),
      record.supplierProfile,
      record.eta,
      numberOrBlank_(profit),
      margin === null || margin === undefined ? '' : Number(margin),
      record.sku,
      record.source,
      record.pageUrl,
      record.supplierItemIds,
      record.supplierOrderNumber,
      record.supplierMatchSource,
      record.supplierPageUrl,
      record.supplierItemEvidence,
      record.orderDate,
      record.orderStatus,
      record.earningsStatus
    ];

    let historyRow = 0;
    [history, computerSheet].forEach((sheet) => {
      const row = upsertProfitRow_(sheet, record, rowValues);
      if (sheet.getName() === MARKETPLACE_PROFIT_HISTORY_SHEET) historyRow = row;
      formatProfitSheet_(sheet);
      formatProfitRow_(sheet, row);
    });
    SpreadsheetApp.flush();
    return { row: historyRow, computerSheet: computerSheet.getName() };
  });
}

function saveMarketplaceProfitBatch_(records) {
  return withLock_(() => {
    const ss = getSpreadsheet_();
    const history = ensureSheet_(ss, MARKETPLACE_PROFIT_HISTORY_SHEET, MARKETPLACE_PROFIT_HEADERS);
    const formatHistory = history.getLastRow() < 2;
    const computerSheets = {};
    const formatComputerSheets = {};
    const rowValues = records.map((record) => {
      const timestamp = validDate_(record.capturedAt || record.preparedAt || record.completedAt || new Date());
      const profit = record.profit == null && record.marketplaceEarnings != null && record.supplierTotal != null
        ? record.marketplaceEarnings - record.supplierTotal
        : record.profit;
      const margin = record.margin == null && profit != null && record.marketplaceEarnings
        ? profit / record.marketplaceEarnings
        : record.margin;
      return [
        timestamp, record.platform, record.computerLabel, record.accountLabel, record.orderNumber,
        record.itemTitle, numberOrBlank_(record.marketplaceEarnings), numberOrBlank_(record.marketplaceSoldPrice),
        record.supplier, numberOrBlank_(record.supplierTotal), record.supplierProfile, record.eta,
        numberOrBlank_(profit), margin === null || margin === undefined ? '' : Number(margin), record.sku,
        record.source, record.pageUrl, record.supplierItemIds, record.supplierOrderNumber,
        record.supplierMatchSource, record.supplierPageUrl, record.supplierItemEvidence,
        record.orderDate, record.orderStatus, record.earningsStatus
      ];
    });

    const historyRows = upsertProfitRowsBatch_(history, records, rowValues);
    const computerRows = {};
    records.forEach((record, index) => {
      if (!computerRows[record.computerLabel]) computerRows[record.computerLabel] = [];
      computerRows[record.computerLabel].push(index);
    });
    Object.keys(computerRows).forEach((computerLabel) => {
      const computerSheet = ensureSheet_(ss, `${MARKETPLACE_PROFIT_PREFIX}${computerLabel}`, MARKETPLACE_PROFIT_HEADERS);
      computerSheets[computerLabel] = computerSheet;
      formatComputerSheets[computerLabel] = computerSheet.getLastRow() < 2;
      const indexes = computerRows[computerLabel];
      const savedRows = upsertProfitRowsBatch_(
        computerSheet,
        indexes.map((index) => records[index]),
        indexes.map((index) => rowValues[index])
      );
      indexes.forEach((recordIndex, position) => { computerRows[computerLabel][position] = savedRows[position]; });
    });

    if (formatHistory) formatProfitSheet_(history);
    Object.keys(computerSheets).forEach((key) => {
      if (formatComputerSheets[key]) formatProfitSheet_(computerSheets[key]);
    });
    rowValues.forEach((values, index) => {
      if (values[12] === '') return;
      formatProfitRow_(history, historyRows[index]);
      const computerLabel = records[index].computerLabel;
      const position = records.slice(0, index + 1).filter((record) => record.computerLabel === computerLabel).length - 1;
      formatProfitRow_(computerSheets[computerLabel], computerRows[computerLabel][position]);
    });
    SpreadsheetApp.flush();
    const results = records.map((record, index) => {
      const position = records.slice(0, index + 1).filter((item) => item.computerLabel === record.computerLabel).length - 1;
      const computerSheet = computerSheets[record.computerLabel];
      return {
        orderNumber: record.orderNumber,
        row: historyRows[index],
        computerRow: computerRows[record.computerLabel][position],
        computerSheet: computerSheet.getName()
      };
    });
    return { count: results.length, results };
  });
}

function normalizePoshmarkMonthKey_(value, orderDate) {
  const direct = cleanText_(value);
  if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(direct)) return direct;
  const parsed = orderDate ? new Date(orderDate) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromSheetCell_(value) {
  const direct = cleanText_(value);
  if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(direct)) return direct;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function normalizePoshmarkReviewRecord_(input) {
  const orderNumber = cleanText_(input.orderNumber);
  if (!orderNumber) throw new Error('A Poshmark order number is required.');
  const status = cleanText_(input.status || 'needs-review').toLowerCase();
  const attempted = Array.isArray(input.attemptedSupplierProfiles)
    ? input.attemptedSupplierProfiles
    : cleanText_(input.attemptedSupplierProfiles).split(/[,|]/);
  return {
    computerLabel: cleanText_(input.computerLabel || '7') || '7',
    accountLabel: cleanText_(input.accountLabel || input.poshmarkAccountLabel),
    monthKey: normalizePoshmarkMonthKey_(input.monthKey, input.orderDate),
    orderNumber,
    itemTitle: cleanText_(input.itemTitle),
    marketplaceEarnings: optionalNumber_(input.marketplaceEarnings),
    marketplaceSoldPrice: optionalNumber_(input.marketplaceSoldPrice),
    orderDate: cleanText_(input.orderDate),
    orderStatus: cleanText_(input.orderStatus),
    earningsStatus: cleanText_(input.earningsStatus),
    sku: cleanText_(input.sku),
    supplierItemIds: cleanText_(input.supplierItemIds || input.asins),
    supplierTotal: optionalNumber_(input.supplierTotal),
    supplierProfile: cleanText_(input.supplierProfile),
    supplierOrderNumber: cleanText_(input.supplierOrderNumber),
    supplierMatchSource: cleanText_(input.supplierMatchSource),
    supplierPageUrl: cleanText_(input.supplierPageUrl),
    supplierItemEvidence: cleanText_(input.supplierItemEvidence),
    profit: optionalNumber_(input.profit),
    margin: optionalNumber_(input.margin),
    status,
    reason: cleanText_(input.reason),
    pageUrl: cleanText_(input.pageUrl),
    attemptedSupplierProfiles: [...new Set(attempted.map(cleanText_).filter(Boolean))],
    capturedAt: cleanText_(input.capturedAt) || new Date().toISOString()
  };
}

function normalizeEbayReviewRecord_(input) {
  const orderNumber = cleanText_(input.orderNumber);
  if (!orderNumber) throw new Error('An eBay order number is required.');
  const status = cleanText_(input.status || 'amazon-pending').toLowerCase();
  const attempted = Array.isArray(input.attemptedSupplierProfiles)
    ? input.attemptedSupplierProfiles
    : cleanText_(input.attemptedSupplierProfiles).split(/[,|]/);
  return {
    platform: 'eBay',
    computerLabel: cleanText_(input.computerLabel),
    accountLabel: cleanText_(input.accountLabel || input.ebayAccountLabel),
    monthKey: normalizePoshmarkMonthKey_(input.monthKey, input.orderDate),
    orderNumber,
    itemTitle: cleanText_(input.itemTitle),
    marketplaceEarnings: optionalNumber_(input.marketplaceEarnings),
    orderDate: cleanText_(input.orderDate),
    orderStatus: cleanText_(input.orderStatus),
    earningsStatus: cleanText_(input.earningsStatus),
    sku: cleanText_(input.sku),
    supplierItemIds: cleanText_(input.supplierItemIds || input.asins),
    noteStatus: cleanText_(input.noteStatus),
    noteMarketplaceEarnings: optionalNumber_(input.noteMarketplaceEarnings),
    noteSupplierTotal: optionalNumber_(input.noteSupplierTotal),
    noteSupplierProfile: cleanText_(input.noteSupplierProfile),
    noteProfit: optionalNumber_(input.noteProfit),
    noteText: cleanText_(input.noteText),
    supplierTotal: optionalNumber_(input.supplierTotal),
    supplierProfile: cleanText_(input.supplierProfile),
    supplierOrderNumber: cleanText_(input.supplierOrderNumber),
    supplierMatchSource: cleanText_(input.supplierMatchSource),
    supplierPageUrl: cleanText_(input.supplierPageUrl),
    supplierItemEvidence: cleanText_(input.supplierItemEvidence),
    profit: optionalNumber_(input.profit),
    status,
    reason: cleanText_(input.reason),
    pageUrl: cleanText_(input.pageUrl),
    attemptedSupplierProfiles: [...new Set(attempted.map(cleanText_).filter(Boolean))],
    capturedAt: cleanText_(input.capturedAt) || new Date().toISOString()
  };
}

function ebayQueueStatus_(record) {
  if (record.status === 'resolved') {
    if (record.noteSupplierTotal == null || record.noteMarketplaceEarnings == null) return 'RESOLVED - AMAZON ONLY';
    const costMatches = Math.abs(Number(record.supplierTotal) - Number(record.noteSupplierTotal)) <= 0.01;
    const earningsMatches = record.marketplaceEarnings != null
      && Math.abs(Number(record.marketplaceEarnings) - Number(record.noteMarketplaceEarnings)) <= 0.01;
    return costMatches && earningsMatches
      ? 'RESOLVED - MATCH'
      : 'RESOLVED - DISCREPANCY';
  }
  if (record.status === 'amazon-not-found') return 'OPEN - AMAZON NOT FOUND';
  if (record.status === 'missing-sku') return 'OPEN - MISSING SKU';
  if (/ambiguous|same-cost/.test(record.status)) return 'REVIEW - AMBIGUOUS';
  return 'OPEN - AMAZON PENDING';
}

function ebayQueueKey_(computerLabel, orderNumber) {
  return [cleanText_(computerLabel), cleanText_(orderNumber)].join('\u001f');
}

function saveEbayCostQueueBatch_(records) {
  if (!records.length) return { count: 0, open: 0, resolved: 0, discrepancies: 0 };
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, EBAY_COST_QUEUE_SHEET, EBAY_COST_QUEUE_HEADERS);
  const existingCount = Math.max(0, sheet.getLastRow() - 1);
  const rows = existingCount
    ? sheet.getRange(2, 1, existingCount, EBAY_COST_QUEUE_HEADERS.length).getValues()
    : [];
  const indexByOrder = {};
  rows.forEach((row, index) => {
    const key = ebayQueueKey_(row[2], row[4]);
    if (cleanText_(row[4])) indexByOrder[key] = index;
  });

  records.forEach((record) => {
    const status = ebayQueueStatus_(record);
    const resolved = status.indexOf('RESOLVED') === 0;
    const noteCost = record.noteSupplierTotal;
    const amazonCost = record.supplierTotal;
    const earnings = record.marketplaceEarnings;
    const noteEarnings = record.noteMarketplaceEarnings;
    const noteProfit = record.noteProfit == null && (noteEarnings != null || earnings != null) && noteCost != null
      ? Number(((noteEarnings == null ? earnings : noteEarnings) - noteCost).toFixed(2))
      : record.noteProfit;
    const amazonProfit = resolved && earnings != null && amazonCost != null
      ? Number((earnings - amazonCost).toFixed(2))
      : null;
    const costDifference = noteCost != null && amazonCost != null
      ? Number((amazonCost - noteCost).toFixed(2))
      : null;
    const profitDifference = noteProfit != null && amazonProfit != null
      ? Number((amazonProfit - noteProfit).toFixed(2))
      : null;
    const earningsDifference = noteEarnings != null && earnings != null
      ? Number((earnings - noteEarnings).toFixed(2))
      : null;
    const incoming = [
      validDate_(record.capturedAt), record.monthKey, record.computerLabel, record.accountLabel,
      record.orderNumber, record.itemTitle, numberOrBlank_(earnings), record.orderDate,
      record.sku, record.supplierItemIds, record.noteStatus, numberOrBlank_(noteCost),
      record.noteSupplierProfile, numberOrBlank_(noteProfit), status, numberOrBlank_(amazonCost),
      record.supplierProfile, record.supplierOrderNumber, record.supplierMatchSource,
      record.supplierItemEvidence, record.supplierPageUrl, numberOrBlank_(costDifference),
      numberOrBlank_(amazonProfit), numberOrBlank_(profitDifference), record.reason,
      record.attemptedSupplierProfiles.join(', '), record.pageUrl, resolved ? new Date() : '',
      numberOrBlank_(noteEarnings), numberOrBlank_(earningsDifference)
    ];
    const key = ebayQueueKey_(record.computerLabel, record.orderNumber);
    const existingIndex = indexByOrder[key];
    if (existingIndex === undefined) {
      indexByOrder[key] = rows.length;
      rows.push(incoming);
      return;
    }

    const existing = rows[existingIndex];
    incoming[25] = mergeListText_(existing[25], incoming[25]);
    const existingResolved = cleanText_(existing[14]).indexOf('RESOLVED') === 0;
    if (existingResolved && !resolved) {
      for (let column = 14; column <= 24; column += 1) incoming[column] = existing[column];
      incoming[27] = existing[27];
    }
    rows[existingIndex] = incoming.map((value, index) => (
      value === '' || value === null || value === undefined ? existing[index] || '' : value
    ));
  });

  if (existingCount) sheet.getRange(2, 1, existingCount, EBAY_COST_QUEUE_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, EBAY_COST_QUEUE_HEADERS.length).setValues(rows);
  formatEbayCostQueue_(sheet);
  const resolvedCount = rows.filter((row) => cleanText_(row[14]).indexOf('RESOLVED') === 0).length;
  const discrepancyCount = rows.filter((row) => cleanText_(row[14]) === 'RESOLVED - DISCREPANCY').length;
  SpreadsheetApp.flush();
  return { count: records.length, open: rows.length - resolvedCount, resolved: resolvedCount, discrepancies: discrepancyCount };
}

function readOpenEbayCostQueue_(input) {
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, EBAY_COST_QUEUE_SHEET, EBAY_COST_QUEUE_HEADERS);
  const count = Math.max(0, sheet.getLastRow() - 1);
  if (!count) return [];
  const monthKey = normalizePoshmarkMonthKey_(input.monthKey, '');
  const limit = Math.max(1, Math.min(100, Number(input.limit || 100)));
  const supplierProfile = cleanText_(input.supplierProfile);
  return sheet.getRange(2, 1, count, EBAY_COST_QUEUE_HEADERS.length).getValues()
    .filter((row) => cleanText_(row[14]).indexOf('RESOLVED') !== 0)
    .filter((row) => !monthKey || monthKeyFromSheetCell_(row[1]) === monthKey)
    .filter((row) => !supplierProfileWasAttempted_(row[25], supplierProfile))
    .slice(0, limit)
    .map((row) => ({
      platform: 'eBay',
      computerLabel: cleanText_(row[2]),
      accountLabel: cleanText_(row[3]),
      ebayAccountLabel: cleanText_(row[3]),
      monthKey: monthKeyFromSheetCell_(row[1]),
      orderNumber: cleanText_(row[4]),
      itemTitle: cleanText_(row[5]),
      marketplaceEarnings: optionalNumber_(row[6]),
      orderDate: cleanText_(row[7]),
      sku: cleanText_(row[8]),
      skus: cleanText_(row[8]).split(/[,|]/).map(cleanText_).filter(Boolean),
      supplierItemIds: cleanText_(row[9]),
      asins: cleanText_(row[9]).split(/[,|]/).map(cleanText_).filter(Boolean),
      noteStatus: cleanText_(row[10]),
      noteMarketplaceEarnings: optionalNumber_(row[28]),
      noteSupplierTotal: optionalNumber_(row[11]),
      noteSupplierProfile: cleanText_(row[12]),
      noteProfit: optionalNumber_(row[13]),
      pageUrl: cleanText_(row[26]),
      attemptedSupplierProfiles: cleanText_(row[25]).split(/[,|]/).map(cleanText_).filter(Boolean),
      detailCapturedAt: new Date().toISOString()
    }));
}

function saveEbayMonthlyProfitBatch_(input) {
  const reviewInputs = Array.isArray(input.reviewRecords) ? input.reviewRecords : [];
  if (!reviewInputs.length) throw new Error('The monthly eBay reconciliation batch is empty.');
  if (reviewInputs.length > 100) throw new Error('The monthly eBay reconciliation batch cannot exceed 100 rows.');
  const reviewRecords = reviewInputs.map(normalizeEbayReviewRecord_);
  const profitInputs = Array.isArray(input.records) ? input.records : [];
  const profits = profitInputs.map(normalizeMarketplaceProfitRecord_);
  const profitResult = profits.length ? saveMarketplaceProfitBatch_(profits) : { count: 0, results: [] };
  const queueResult = saveEbayCostQueueBatch_(reviewRecords);
  return {
    count: reviewRecords.length,
    exact: profits.length,
    unresolved: reviewRecords.length - profits.length,
    profitResult,
    queueResult
  };
}

function saveEbayCostResolutionBatch_(input) {
  const reviewInputs = Array.isArray(input.reviewRecords) ? input.reviewRecords : [];
  if (!reviewInputs.length) throw new Error('The eBay Amazon-cost resolution batch is empty.');
  if (reviewInputs.length > 100) throw new Error('The eBay Amazon-cost resolution batch cannot exceed 100 rows.');
  const reviewRecords = reviewInputs.map(normalizeEbayReviewRecord_);
  const queueResult = saveEbayCostQueueBatch_(reviewRecords);
  const exact = reviewRecords.filter((record) => record.status === 'resolved').length;
  return {
    count: reviewRecords.length,
    exact,
    unresolved: reviewRecords.length - exact,
    queueResult
  };
}

function poshmarkQueueStatus_(record) {
  if (record.status === 'resolved') return 'RESOLVED';
  if (record.status === 'amazon-not-found') return 'OPEN - AMAZON NOT FOUND';
  if (record.status === 'missing-sku') return 'OPEN - MISSING SKU';
  if (/ambiguous|same-cost/.test(record.status)) return 'REVIEW - AMBIGUOUS';
  return 'OPEN - NEEDS REVIEW';
}

function mergeListText_(left, right) {
  return [...new Set([left, right].flatMap((value) => cleanText_(value).split(/[,|]/)).map(cleanText_).filter(Boolean))].join(', ');
}

function supplierProfileWasAttempted_(cellValue, supplierProfile) {
  const target = cleanText_(supplierProfile).toLowerCase();
  if (!target) return false;
  return cleanText_(cellValue).split(/[,|]/)
    .map((value) => cleanText_(value).toLowerCase())
    .filter(Boolean)
    .some((value) => value === target);
}

function savePoshmarkCostQueueBatch_(records) {
  if (!records.length) return { count: 0, open: 0, resolved: 0 };
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, POSHMARK_COST_QUEUE_SHEET, POSHMARK_COST_QUEUE_HEADERS);
  const existingCount = Math.max(0, sheet.getLastRow() - 1);
  const rows = existingCount
    ? sheet.getRange(2, 1, existingCount, POSHMARK_COST_QUEUE_HEADERS.length).getValues()
    : [];
  const indexByOrder = {};
  rows.forEach((row, index) => {
    const orderNumber = cleanText_(row[2]);
    if (orderNumber) indexByOrder[orderNumber] = index;
  });

  records.forEach((record) => {
    const status = poshmarkQueueStatus_(record);
    const resolved = status === 'RESOLVED';
    const incoming = [
      validDate_(record.capturedAt), record.monthKey, record.orderNumber, record.accountLabel,
      record.itemTitle, numberOrBlank_(record.marketplaceEarnings), numberOrBlank_(record.marketplaceSoldPrice),
      record.orderDate, record.sku, record.supplierItemIds, status, record.reason,
      numberOrBlank_(record.supplierTotal), record.supplierProfile, record.supplierOrderNumber,
      record.supplierMatchSource, record.supplierItemEvidence, record.pageUrl, record.supplierPageUrl,
      record.attemptedSupplierProfiles.join(', '), resolved ? new Date() : ''
    ];
    const existingIndex = indexByOrder[record.orderNumber];
    if (existingIndex === undefined) {
      indexByOrder[record.orderNumber] = rows.length;
      rows.push(incoming);
      return;
    }
    const existing = rows[existingIndex];
    incoming[19] = mergeListText_(existing[19], incoming[19]);
    if (cleanText_(existing[10]) === 'RESOLVED' && !resolved) return;
    rows[existingIndex] = incoming.map((value, index) => (
      value === '' || value === null || value === undefined ? existing[index] || '' : value
    ));
  });

  if (existingCount) sheet.getRange(2, 1, existingCount, POSHMARK_COST_QUEUE_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, POSHMARK_COST_QUEUE_HEADERS.length).setValues(rows);
  formatPoshmarkCostQueue_(sheet);
  const resolvedCount = rows.filter((row) => cleanText_(row[10]) === 'RESOLVED').length;
  SpreadsheetApp.flush();
  return { count: records.length, open: rows.length - resolvedCount, resolved: resolvedCount };
}

function readOpenPoshmarkCostQueue_(input) {
  const ss = getSpreadsheet_();
  const sheet = ensureSheet_(ss, POSHMARK_COST_QUEUE_SHEET, POSHMARK_COST_QUEUE_HEADERS);
  const count = Math.max(0, sheet.getLastRow() - 1);
  if (!count) return [];
  const monthKey = normalizePoshmarkMonthKey_(input.monthKey, '');
  const limit = Math.max(1, Math.min(100, Number(input.limit || 100)));
  const supplierProfile = cleanText_(input.supplierProfile);
  return sheet.getRange(2, 1, count, POSHMARK_COST_QUEUE_HEADERS.length).getValues()
    .filter((row) => cleanText_(row[10]) !== 'RESOLVED')
    .filter((row) => !monthKey || monthKeyFromSheetCell_(row[1]) === monthKey)
    .filter((row) => !supplierProfileWasAttempted_(row[19], supplierProfile))
    .slice(0, limit)
    .map((row) => ({
      computerLabel: '7',
      accountLabel: cleanText_(row[3]),
      monthKey: monthKeyFromSheetCell_(row[1]),
      orderNumber: cleanText_(row[2]),
      itemTitle: cleanText_(row[4]),
      marketplaceEarnings: optionalNumber_(row[5]),
      marketplaceSoldPrice: optionalNumber_(row[6]),
      orderDate: cleanText_(row[7]),
      sku: cleanText_(row[8]),
      skus: [cleanText_(row[8])].filter(Boolean),
      supplierItemIds: cleanText_(row[9]),
      asins: cleanText_(row[9]).split(/[,|]/).map(cleanText_).filter(Boolean),
      pageUrl: cleanText_(row[17]),
      attemptedSupplierProfiles: cleanText_(row[19]).split(/[,|]/).map(cleanText_).filter(Boolean),
      detailCapturedAt: new Date().toISOString()
    }));
}

function poshmarkMonthSheetName_(monthKey) {
  const normalized = normalizePoshmarkMonthKey_(monthKey, '');
  if (!normalized) throw new Error('A valid Poshmark month is required.');
  const parts = normalized.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[parts[1] - 1]} ${parts[0]} - 7`;
}

function savePoshmarkMonthRows_(records) {
  const groups = {};
  records.forEach((record) => {
    if (!record.monthKey) throw new Error(`The month is missing for Poshmark order ${record.orderNumber}.`);
    if (!groups[record.monthKey]) groups[record.monthKey] = [];
    groups[record.monthKey].push(record);
  });
  const workbook = SpreadsheetApp.openById(POSHMARK_ORDER_SHEET_ID);
  const saved = [];
  Object.keys(groups).sort().forEach((monthKey) => {
    const name = poshmarkMonthSheetName_(monthKey);
    const sheet = ensureSheet_(workbook, name, POSHMARK_MONTH_HEADERS);
    const existingCount = Math.max(0, sheet.getLastRow() - 1);
    const rows = existingCount ? sheet.getRange(2, 1, existingCount, POSHMARK_MONTH_HEADERS.length).getValues() : [];
    const indexByOrder = {};
    rows.forEach((row, index) => {
      const orderNumber = cleanText_(row[7]);
      if (orderNumber) indexByOrder[orderNumber] = index;
    });
    groups[monthKey].forEach((record) => {
      const resolved = record.status === 'resolved';
      const status = resolved ? 'Resolved' : /ambiguous|same-cost/.test(record.status) ? 'Needs Review' : 'Missing Amazon Cost';
      const incoming = [
        record.itemTitle, numberOrBlank_(record.supplierTotal), numberOrBlank_(record.marketplaceEarnings),
        numberOrBlank_(record.profit), status, resolved ? '' : record.reason, record.orderDate,
        record.orderNumber, record.supplierItemIds, record.supplierOrderNumber, record.supplierProfile,
        record.pageUrl, record.supplierPageUrl
      ];
      const existingIndex = indexByOrder[record.orderNumber];
      if (existingIndex === undefined) {
        indexByOrder[record.orderNumber] = rows.length;
        rows.push(incoming);
        return;
      }
      const existing = rows[existingIndex];
      const merged = incoming.map((value, index) => (
        value === '' || value === null || value === undefined ? existing[index] || '' : value
      ));
      if (existing[5]) merged[5] = existing[5];
      rows[existingIndex] = merged;
    });
    if (existingCount) sheet.getRange(2, 1, existingCount, POSHMARK_MONTH_HEADERS.length).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, POSHMARK_MONTH_HEADERS.length).setValues(rows);
    formatPoshmarkMonthSheet_(sheet);
    saved.push({ monthKey, sheet: name, count: groups[monthKey].length });
  });
  SpreadsheetApp.flush();
  return saved;
}

function savePoshmarkMonthlyProfitBatch_(input) {
  const reviewInputs = Array.isArray(input.reviewRecords) ? input.reviewRecords : [];
  if (!reviewInputs.length) throw new Error('The monthly Poshmark review batch is empty.');
  if (reviewInputs.length > 100) throw new Error('The monthly Poshmark review batch cannot exceed 100 rows.');
  const reviewRecords = reviewInputs.map(normalizePoshmarkReviewRecord_);
  const profitInputs = Array.isArray(input.records) ? input.records : [];
  const profits = profitInputs.map(normalizeMarketplaceProfitRecord_);
  const profitResult = profits.length ? saveMarketplaceProfitBatch_(profits) : { count: 0, results: [] };
  const queueResult = savePoshmarkCostQueueBatch_(reviewRecords);
  const monthlySheets = savePoshmarkMonthRows_(reviewRecords);
  return {
    count: reviewRecords.length,
    exact: profits.length,
    unresolved: reviewRecords.length - profits.length,
    profitResult,
    queueResult,
    monthlySheets
  };
}

function savePoshmarkCostResolutionBatch_(input) {
  const reviewInputs = Array.isArray(input.reviewRecords) ? input.reviewRecords : [];
  if (!reviewInputs.length) throw new Error('The Poshmark Amazon-cost resolution batch is empty.');
  if (reviewInputs.length > 100) throw new Error('The Poshmark Amazon-cost resolution batch cannot exceed 100 rows.');
  const reviewRecords = reviewInputs.map(normalizePoshmarkReviewRecord_);
  const profits = (Array.isArray(input.records) ? input.records : []).map(normalizeMarketplaceProfitRecord_);
  const profitResult = profits.length ? saveMarketplaceProfitBatch_(profits) : { count: 0, results: [] };
  const queueResult = savePoshmarkCostQueueBatch_(reviewRecords);
  const resolvedRows = reviewRecords.filter((record) => record.status === 'resolved');
  const monthlySheets = resolvedRows.length ? savePoshmarkMonthRows_(resolvedRows) : [];
  return {
    count: reviewRecords.length,
    exact: profits.length,
    unresolved: reviewRecords.length - profits.length,
    profitResult,
    queueResult,
    monthlySheets
  };
}

function upsertProfitRowsBatch_(sheet, records, incomingRows) {
  const existingCount = Math.max(0, sheet.getLastRow() - 1);
  const existingRows = existingCount
    ? sheet.getRange(2, 1, existingCount, MARKETPLACE_PROFIT_HEADERS.length).getValues()
    : [];
  const compactRows = [];
  const indexByKey = {};
  existingRows.forEach((row) => {
    const key = profitRowKey_(row[4], row[1], row[2]);
    if (key && indexByKey[key] !== undefined) {
      compactRows[indexByKey[key]] = mergeProfitRowValues_(compactRows[indexByKey[key]], row);
      return;
    }
    if (key) indexByKey[key] = compactRows.length;
    compactRows.push(row);
  });

  const savedRows = records.map((record, index) => {
    const key = profitRowKey_(record.orderNumber, record.platform, record.computerLabel);
    if (key && indexByKey[key] !== undefined) {
      const target = indexByKey[key];
      compactRows[target] = mergeProfitRowValues_(compactRows[target], incomingRows[index]);
      return target + 2;
    }
    const target = compactRows.length;
    compactRows.push(incomingRows[index]);
    if (key) indexByKey[key] = target;
    return target + 2;
  });

  if (existingCount) sheet.getRange(2, 1, existingCount, MARKETPLACE_PROFIT_HEADERS.length).clearContent();
  if (compactRows.length) sheet.getRange(2, 1, compactRows.length, MARKETPLACE_PROFIT_HEADERS.length).setValues(compactRows);
  return savedRows;
}

function profitRowKey_(orderNumber, platform, computerLabel) {
  const order = cleanText_(orderNumber);
  if (!order) return '';
  return [order, cleanText_(platform), cleanText_(computerLabel)].join('\u001f');
}

function upsertProfitRow_(sheet, record, rowValues) {
  const rows = findProfitRows_(sheet, record);
  if (!rows.length) {
    sheet.appendRow(rowValues);
    return sheet.getLastRow();
  }

  const targetRow = rows[0];
  const existing = sheet.getRange(targetRow, 1, 1, MARKETPLACE_PROFIT_HEADERS.length).getValues()[0];
  const merged = mergeProfitRowValues_(existing, rowValues);
  sheet.getRange(targetRow, 1, 1, MARKETPLACE_PROFIT_HEADERS.length).setValues([merged]);
  rows.slice(1).reverse().forEach((row) => sheet.deleteRow(row));
  return targetRow;
}

function findProfitRows_(sheet, record) {
  const orderNumber = cleanText_(record.orderNumber);
  if (!orderNumber || sheet.getLastRow() < 2) return [];
  const platform = cleanText_(record.platform);
  const computerLabel = cleanText_(record.computerLabel);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, MARKETPLACE_PROFIT_HEADERS.length).getValues();
  const rows = [];
  values.forEach((row, index) => {
    const sameOrder = cleanText_(row[4]) === orderNumber;
    const samePlatform = !platform || cleanText_(row[1]) === platform;
    const sameComputer = !computerLabel || cleanText_(row[2]) === computerLabel;
    if (sameOrder && samePlatform && sameComputer) rows.push(index + 2);
  });
  return rows;
}

function mergeProfitRowValues_(existing, incoming) {
  return incoming.map((value, index) => {
    if (value === '' || value === null || value === undefined) return existing[index] || '';
    const incomingSource = index === 15 ? cleanText_(value).toLowerCase() : '';
    if (incomingSource === 'poshmark-visible-sales' && existing[index]) return existing[index];
    return value;
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
    availableQuantity: optionalNumber_(input.availableQuantity ?? input.inStockQuantity),
    outOfStockCount: optionalNumber_(input.outOfStockCount),
    inStockPercent: optionalNumber_(input.inStockPercent),
    subscriptionListingLimit: optionalNumber_(input.subscriptionListingLimit || input.freeFixedPriceLimit),
    subscriptionUsedThisMonth: optionalNumber_(input.subscriptionUsedThisMonth),
    subscriptionLeftThisMonth: optionalNumber_(input.subscriptionLeftThisMonth),
    subscriptionUsagePercent: optionalNumber_(input.subscriptionUsagePercent),
    subscriptionStatus: cleanText_(input.subscriptionStatus),
    currentQuantityUsed: optionalNumber_(input.currentQuantityUsed),
    monthlySellerQuantityLimit: optionalNumber_(input.monthlySellerQuantityLimit),
    sellerQuantityUsagePercent: optionalNumber_(input.sellerQuantityUsagePercent),
    sellerQuantityStatus: cleanText_(input.sellerQuantityStatus),
    currentDollarUsed: optionalNumber_(input.currentDollarUsed),
    monthlySellerDollarLimit: optionalNumber_(input.monthlySellerDollarLimit),
    dollarUsagePercent: optionalNumber_(input.dollarUsagePercent),
    dollarStatus: cleanText_(input.dollarStatus),
    overallStatus: cleanText_(input.overallStatus || 'GOOD'),
    calculationBasis: cleanText_(input.calculationBasis),
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
    beforeCount: optionalNumber_(input.beforeCount),
    selectedCount: optionalNumber_(input.selectedCount),
    remainingCount: optionalNumber_(input.remainingCount),
    error: cleanText_(input.error), pageUrl: cleanText_(input.pageUrl),
    completedAt: cleanText_(input.completedAt), startedAt: cleanText_(input.startedAt)
  };
}

function normalizeTaskCompletionRecord_(input) {
  const identity = identity_(input);
  return {
    ...identity,
    featureKey: cleanText_(input.featureKey).toLowerCase(),
    status: cleanText_(input.status),
    scanMode: cleanText_(input.scanMode).toLowerCase(),
    proofType: cleanText_(input.proofType).toLowerCase(),
    verifiedZeroRemaining: input.verifiedZeroRemaining === true || cleanText_(input.verifiedZeroRemaining).toLowerCase() === 'true',
    remainingCount: optionalNumber_(input.remainingCount),
    failedCount: optionalNumber_(input.failedCount),
    scannedCount: optionalNumber_(input.scannedCount),
    cancelledCount: optionalNumber_(input.cancelledCount),
    expectedScopeCount: optionalNumber_(input.expectedScopeCount),
    verifiedScopeCount: optionalNumber_(input.verifiedScopeCount),
    scopeSummary: cleanText_(input.scopeSummary),
    amazonProfileLabel: cleanText_(input.amazonProfileLabel),
    amazonAccountLabel: cleanText_(input.amazonAccountLabel),
    allProfilesVerified: input.allProfilesVerified === true || cleanText_(input.allProfilesVerified).toLowerCase() === 'true',
    expectedProfileCount: optionalNumber_(input.expectedProfileCount),
    verifiedProfileCount: optionalNumber_(input.verifiedProfileCount),
    operatorApprovalToken: cleanText_(input.operatorApprovalToken),
    completedAt: cleanText_(input.completedAt),
    pageUrl: cleanText_(input.pageUrl)
  };
}

function normalizeAmazonSubscribeSaveProfileRecord_(input) {
  const identity = identity_(input);
  return {
    ...identity,
    amazonProfileLabel: cleanText_(input.amazonProfileLabel),
    amazonAccountLabel: cleanText_(input.amazonAccountLabel),
    status: cleanText_(input.status),
    proofType: cleanText_(input.proofType).toLowerCase(),
    currentProfileVerified: input.currentProfileVerified === true || cleanText_(input.currentProfileVerified).toLowerCase() === 'true',
    verifiedZeroRemaining: input.verifiedZeroRemaining === true || cleanText_(input.verifiedZeroRemaining).toLowerCase() === 'true',
    cancelledCount: optionalNumber_(input.cancelledCount),
    remainingCount: optionalNumber_(input.remainingCount),
    failedCount: optionalNumber_(input.failedCount),
    expectedScopeCount: optionalNumber_(input.expectedScopeCount),
    verifiedScopeCount: optionalNumber_(input.verifiedScopeCount),
    scopeSummary: cleanText_(input.scopeSummary),
    runId: cleanText_(input.runId),
    completedAt: cleanText_(input.completedAt),
    pageUrl: cleanText_(input.pageUrl)
  };
}

function normalizePoshmarkStatsRecord_(input) {
  const computerLabel = cleanText_(input.computerLabel || '7');
  if (!computerLabel) throw new Error('Computer is required.');
  return {
    computerLabel,
    poshmarkAccountLabel: cleanText_(input.poshmarkAccountLabel),
    shippedOrdersAllTime: optionalNumber_(input.shippedOrdersAllTime),
    shippedOrdersLast90: optionalNumber_(input.shippedOrdersLast90),
    daysToShipLast90: optionalNumber_(input.daysToShipLast90),
    daysToShipAverage: optionalNumber_(input.daysToShipAverage),
    totalSalesLast90: optionalNumber_(input.totalSalesLast90),
    sellerCancellationsLast90: optionalNumber_(input.sellerCancellationsLast90),
    approvedReturnCasesLast90: optionalNumber_(input.approvedReturnCasesLast90),
    moderatorRemovedListingsLast30: optionalNumber_(input.moderatorRemovedListingsLast30),
    profileListings: optionalNumber_(input.profileListings),
    followers: optionalNumber_(input.followers),
    availableListings: optionalNumber_(input.availableListings),
    averageDiscountOffOriginalPrice: optionalNumber_(input.averageDiscountOffOriginalPrice),
    selfSharesLast30: optionalNumber_(input.selfSharesLast30),
    soldListingsAllTime: optionalNumber_(input.soldListingsAllTime),
    totalEarnedAllTime: optionalNumber_(input.totalEarnedAllTime),
    averageRating: optionalNumber_(input.averageRating),
    totalRatings: optionalNumber_(input.totalRatings),
    posherSince: cleanText_(input.posherSince),
    capturedAt: cleanText_(input.capturedAt),
    pageUrl: cleanText_(input.pageUrl)
  };
}

function normalizeEbaySnapshotRecord_(input) {
  const identity = identity_(input);
  return {
    ...identity,
    salesToday: optionalNumber_(input.salesToday),
    salesLast7Days: optionalNumber_(input.salesLast7Days),
    salesLast31Days: optionalNumber_(input.salesLast31Days),
    salesLast31DaysChange: optionalNumber_(input.salesLast31DaysChange),
    salesLast90Days: optionalNumber_(input.salesLast90Days),
    feedbackPositive30Days: optionalNumber_(input.feedbackPositive30Days),
    feedbackNeutral30Days: optionalNumber_(input.feedbackNeutral30Days),
    feedbackNegative30Days: optionalNumber_(input.feedbackNegative30Days),
    trafficImpressions: optionalNumber_(input.trafficImpressions),
    trafficPageViews: optionalNumber_(input.trafficPageViews),
    advertisingClicks: optionalNumber_(input.advertisingClicks),
    advertisingSales: optionalNumber_(input.advertisingSales),
    advertisingRoas: optionalNumber_(input.advertisingRoas),
    advertisingCost: optionalNumber_(input.advertisingCost),
    capturedAt: cleanText_(input.capturedAt),
    pageUrl: cleanText_(input.pageUrl)
  };
}

function normalizeMarketplaceProfitRecord_(input) {
  const platform = cleanText_(input.platform || 'eBay') || 'eBay';
  const computerLabel = cleanText_(input.computerLabel);
  if (!computerLabel) throw new Error('Computer is required.');
  return {
    platform,
    computerLabel,
    accountLabel: cleanText_(input.accountLabel || input.ebayAccountLabel || input.poshmarkAccountLabel),
    orderNumber: cleanText_(input.orderNumber),
    itemTitle: cleanText_(input.itemTitle),
    marketplaceEarnings: optionalNumber_(input.marketplaceEarnings ?? input.earnings ?? input.poshmarkEarnings),
    marketplaceSoldPrice: optionalNumber_(input.marketplaceSoldPrice ?? input.soldPrice),
    supplier: cleanText_(input.supplier || 'Amazon'),
    supplierTotal: optionalNumber_(input.supplierTotal ?? input.amazonTotal ?? input.amazonCost),
    supplierProfile: cleanText_(input.supplierProfile || input.amazonProfile || input.amazonProfileLabel),
    eta: cleanText_(input.eta),
    profit: optionalNumber_(input.profit),
    margin: optionalNumber_(input.margin),
    sku: cleanText_(input.sku),
    source: cleanText_(input.source || 'extension'),
    pageUrl: cleanText_(input.pageUrl),
    supplierItemIds: cleanText_(input.supplierItemIds || input.asins),
    supplierOrderNumber: cleanText_(input.supplierOrderNumber || input.amazonOrderNumber),
    supplierMatchSource: cleanText_(input.supplierMatchSource),
    supplierPageUrl: cleanText_(input.supplierPageUrl || input.amazonOrderUrl),
    supplierItemEvidence: cleanText_(input.supplierItemEvidence),
    orderDate: cleanText_(input.orderDate),
    orderStatus: cleanText_(input.orderStatus),
    earningsStatus: cleanText_(input.earningsStatus),
    capturedAt: cleanText_(input.capturedAt),
    preparedAt: cleanText_(input.preparedAt),
    completedAt: cleanText_(input.completedAt)
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
    record.trackingOnTime == null ? 'unknown' : (record.trackingOnTime < 80 ? 'critical' : record.trackingOnTime < 85 ? 'warning' : 'good'),
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

  const checkedAt = validDate_(record.savedAt || record.capturedAt || new Date());
  const checkedNote = 'Last checked: ' + Utilities.formatDate(checkedAt, Session.getScriptTimeZone(), 'MM/dd/yyyy hh:mm:ss a');
  const schema = requireTasksSchema_(sheet, [
    'performance', 'transactionDefectRate', 'lateShipmentRate', 'trackingOnTime', 'casesClosed'
  ], record.computerLabel);
  const computerCol = schema.computerColumn;
  if (!isEbayMetricColumn_(sheet, computerCol)) return;

  const rows = {
    transactionDefectRate: findTaskRowByStartsWith_(sheet, 'Transaction Defect Rate'),
    lateShipmentRate: findTaskRowByStartsWith_(sheet, 'Late Shipment Rate'),
    trackingOnTime: findTaskRowByStartsWith_(sheet, 'Tracking Uploaded On Time'),
    casesClosed: findTaskRowByStartsWith_(sheet, 'Cases Closed without seller Resolution')
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
    cell.setNote(checkedNote);
  });

  const parentRow = findTaskRowByContains_(sheet, 'Check Performance of Each Store and Check Late Shipment Rate');
  if (parentRow && updates.length === 4) {
    applyCheckboxRange_(sheet.getRange(parentRow, 5, 1, 5));
    const parentCell = sheet.getRange(parentRow, computerCol);
    parentCell.setValue(true).setNote(checkedNote);
  }

  clearPoshmarkOnlyMetricCells_(sheet, [...Object.values(rows), parentRow].filter(Boolean));
  clearComputerHeaderNotes_(sheet);
  clearVisibleLastUpdated_(sheet);
  applyTasksMetricAlerts_(sheet);
}

function applyCheckboxRange_(range) {
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  const values = range.getValues().map((row) => row.map((value) => {
    if (value === true || value === false) return value;
    const text = String(value || '').trim().toUpperCase();
    return text === 'TRUE' || text === 'YES' || text === 'CHECKED';
  }));
  range.clearDataValidations()
    .setDataValidation(rule)
    .setNumberFormat('General')
    .setHorizontalAlignment('center')
    .setValues(values);
}

function clearPoshmarkOnlyMetricCells_(sheet, rows) {
  const uniqueRows = [...new Set(rows.filter(Boolean))];
  uniqueRows.forEach((row) => {
    const cell = sheet.getRange(row, 10);
    cell.clearContent()
      .clearDataValidations()
      .clearNote()
      .setBackground('#666666')
      .setFontColor('#000000')
      .setFontWeight('normal');
  });
}

function clearMetricValidation_(sheet, rows) {
  const foundRows = Object.values(rows).filter(Boolean);
  if (!foundRows.length) return;
  const startRow = Math.min.apply(null, foundRows);
  const endRow = Math.max.apply(null, foundRows);
  sheet.getRange(startRow, 5, endRow - startRow + 1, 5)
    .clearDataValidations()
    .setNumberFormat('0.00%');
}

function findComputerColumn_(sheet, computerLabel) {
  const headers = sheet.getRange(3, 1, 1, Math.min(12, sheet.getLastColumn())).getDisplayValues()[0];
  const target = computerKey_(computerLabel);
  const matches = [];
  for (let i = 0; i < headers.length; i += 1) {
    if (computerKey_(headers[i]) === target) matches.push(i + 1);
  }
  return matches.length === 1 ? matches[0] : 0;
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
  const matches = [];
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0] || '').toLowerCase().includes(needle)) matches.push(i + 1);
  }
  return matches.length === 1 ? matches[0] : 0;
}

function taskSchemaMatches_(label, rule) {
  const haystack = String(label || '').trim().toLowerCase();
  const needle = String(rule && rule.text || '').trim().toLowerCase();
  if (!needle) return false;
  return rule.mode === 'startsWith' ? haystack.startsWith(needle) : haystack.includes(needle);
}

function discoverTasksSchemaFromValues_(values) {
  const rows = Array.isArray(values) ? values : [];
  const header = rows[2] || [];
  const computerMatches = {};
  const computerColumns = {};
  const taskMatches = {};
  const taskRows = {};
  const errors = [];

  TASKS_COMPUTER_HEADERS.forEach((computer) => {
    const matches = [];
    header.forEach((value, index) => {
      if (computerKey_(value) === computerKey_(computer)) matches.push(index + 1);
    });
    computerMatches[computer] = matches;
    computerColumns[computer] = matches.length === 1 ? matches[0] : 0;
    if (matches.length !== 1) errors.push(`Computer ${computer} matched ${matches.length} header cells.`);
  });

  Object.keys(TASKS_SCHEMA_TASKS).forEach((key) => {
    const rule = TASKS_SCHEMA_TASKS[key];
    const matches = [];
    rows.forEach((row, index) => {
      if (taskSchemaMatches_((row || [])[3], rule)) matches.push(index + 1);
    });
    taskMatches[key] = matches;
    taskRows[key] = matches.length === 1 ? matches[0] : 0;
    if (matches.length !== 1) errors.push(`Task ${key} matched ${matches.length} rows.`);
  });

  const expectedColumns = { M0: 5, 2: 6, 6: 7, 0: 8, M1: 9, 7: 10 };
  Object.keys(expectedColumns).forEach((computer) => {
    if (computerColumns[computer] && computerColumns[computer] !== expectedColumns[computer]) {
      errors.push(`Computer ${computer} is in column ${computerColumns[computer]}, expected ${expectedColumns[computer]}.`);
    }
  });

  const usedRows = Object.values(taskRows).filter(Boolean);
  if (new Set(usedRows).size !== usedRows.length) errors.push('Two schema task keys resolved to the same row.');

  return {
    ok: errors.length === 0,
    headerRow: 3,
    taskColumn: 4,
    computerMatches,
    computerColumns,
    taskMatches,
    taskRows,
    errors
  };
}

function discoverTasksSchema_(sheet) {
  if (!sheet) throw new Error('Tasks sheet is missing.');
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 3 || lastColumn < 10) {
    return {
      ok: false,
      headerRow: 3,
      taskColumn: 4,
      computerMatches: {},
      computerColumns: {},
      taskMatches: {},
      taskRows: {},
      errors: [`Tasks dimensions ${lastRow}x${lastColumn} are too small.`],
      lastRow,
      lastColumn
    };
  }
  const values = sheet.getRange(1, 1, lastRow, Math.min(lastColumn, 14)).getDisplayValues();
  return { ...discoverTasksSchemaFromValues_(values), lastRow, lastColumn };
}

function requireTasksSchema_(sheet, taskKeys, computerLabel) {
  const report = discoverTasksSchema_(sheet);
  const computer = computerKey_(computerLabel);
  const computerMatches = report.computerMatches[computer] || [];
  const invalidTasks = (taskKeys || []).filter((key) => !report.taskMatches[key] || report.taskMatches[key].length !== 1);
  if (computerMatches.length !== 1 || invalidTasks.length) {
    const details = [];
    if (computerMatches.length !== 1) details.push(`computer ${computer || '(blank)'} matched ${computerMatches.length} columns`);
    if (invalidTasks.length) details.push(`invalid task keys: ${invalidTasks.join(', ')}`);
    throw new Error('Tasks schema check failed: ' + details.join('; ') + '. Run the read-only Tasks schema audit.');
  }
  return {
    report,
    computerColumn: computerMatches[0],
    taskRows: report.taskRows
  };
}

function tasksSchemaAudit_(input) {
  if (cleanText_(input && input.confirm) !== 'F10_READ_ONLY_SCHEMA') {
    throw new Error('F-10 read-only schema confirmation is missing.');
  }
  const ss = SpreadsheetApp.openById(TASKS_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(TASKS_SHEET);
  const report = discoverTasksSchema_(sheet);
  return {
    ...report,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetName: sheet ? sheet.getName() : TASKS_SHEET,
    readOnly: true,
    spreadsheetWrites: 0,
    marketplaceActions: 0,
    generatedAt: new Date().toISOString()
  };
}

function syncTasksMarkShipped_(record) {
  const status = String(record.status || '').trim();
  if (!/^(completed|no awaiting orders)$/i.test(status)) return { row: 0, checked: false };
  const ss = SpreadsheetApp.openById(TASKS_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) return { row: 0, checked: false };
  const schema = requireTasksSchema_(sheet, ['markShipped'], record.computerLabel);
  const computerCol = schema.computerColumn;
  if (!isEbayMetricColumn_(sheet, computerCol)) return { row: 0, checked: false };
  const row = findTaskRowByStartsWith_(sheet, 'Mark All New Orders as Shipped');
  if (!row) return { row: 0, checked: false };
  const checkedAt = validDate_(record.completedAt || new Date());
  const note = [
    'Last checked: ' + Utilities.formatDate(checkedAt, Session.getScriptTimeZone(), 'MM/dd/yyyy hh:mm:ss a'),
    'Status: ' + status,
    'Marked shipped: ' + Number(record.markedCount || 0)
  ].join('\n');
  applyCheckboxRange_(sheet.getRange(row, 5, 1, 5));
  sheet.getRange(row, computerCol).setValue(true).setNote(note);
  clearPoshmarkOnlyMetricCells_(sheet, [row]);
  clearComputerHeaderNotes_(sheet);
  clearVisibleLastUpdated_(sheet);
  return { row, checked: true };
}

function amazonSubscribeSaveProfileProof_(record) {
  if (record.status !== 'Completed') return { ok: false, error: 'The current Amazon profile did not finish with exact Completed status.' };
  if (record.proofType !== 'verified-zero-active-subscriptions-current-profile' || record.currentProfileVerified !== true || record.verifiedZeroRemaining !== true) {
    return { ok: false, error: 'The current Amazon profile needs a final zero-active-subscriptions verification scan.' };
  }
  if (Number(record.remainingCount) !== 0 || Number(record.failedCount) !== 0) {
    return { ok: false, error: 'The current Amazon profile still has remaining or failed subscriptions.' };
  }
  const expectedScopes = Number(record.expectedScopeCount);
  const verifiedScopes = Number(record.verifiedScopeCount);
  if (!(expectedScopes > 0) || verifiedScopes !== expectedScopes) {
    return { ok: false, error: 'The current Amazon profile did not verify its complete address scope.' };
  }
  if (!cleanText_(record.amazonProfileLabel || record.amazonAccountLabel)) {
    return { ok: false, error: 'The Amazon profile/account identity is missing.' };
  }
  return { ok: true };
}

function taskCompletionProof_(record) {
  const featureKey = cleanText_(record && record.featureKey).toLowerCase();
  const rule = TASK_COMPLETION_RULES[featureKey];
  if (!rule) return { ok: false, error: 'This workflow is not approved for automatic task completion.' };

  if (featureKey === 'move99') {
    if (record.scanMode !== 'price99') return { ok: false, error: 'Only the Move .99 sale-category workflow can complete this task.' };
    if (record.status !== 'Completed') return { ok: false, error: 'Move .99 did not finish with exact Completed status.' };
    if (record.proofType !== 'final-zero-scan' || record.verifiedZeroRemaining !== true) {
      return { ok: false, error: 'Move .99 needs a final zero-remaining verification scan.' };
    }
    if (Number(record.remainingCount) !== 0 || Number(record.failedCount) !== 0) {
      return { ok: false, error: 'Move .99 still has remaining or failed listings.' };
    }
  }
  if (featureKey === 'amazon-subscribe-save') {
    if (record.status !== 'Completed') return { ok: false, error: 'Subscribe & Save did not finish with exact Completed status.' };
    if (record.proofType !== 'verified-zero-active-subscriptions-all-profiles' || record.verifiedZeroRemaining !== true || record.allProfilesVerified !== true) {
      return { ok: false, error: 'Subscribe & Save needs explicit proof that every expected Amazon Chrome profile is clear.' };
    }
    if (Number(record.remainingCount) !== 0 || Number(record.failedCount) !== 0) {
      return { ok: false, error: 'Subscribe & Save still has remaining or failed subscriptions.' };
    }
    const expectedProfiles = Number(record.expectedProfileCount);
    const verifiedProfiles = Number(record.verifiedProfileCount);
    if (!(expectedProfiles > 0) || verifiedProfiles !== expectedProfiles) {
      return { ok: false, error: 'Subscribe & Save did not verify every expected Amazon Chrome profile.' };
    }
    if (record.operatorApprovalToken !== `APPROVE ALL AMAZON PROFILES ${expectedProfiles}`) {
      return { ok: false, error: 'Subscribe & Save all-profile completion approval is missing or does not match the exact profile count.' };
    }
  }
  return { ok: true, rule };
}

function syncTasksCompletion_(record, providedSheet) {
  const proof = taskCompletionProof_(record);
  if (!proof.ok) throw new Error(proof.error);
  const sheet = providedSheet || SpreadsheetApp.openById(TASKS_SPREADSHEET_ID).getSheetByName(TASKS_SHEET);
  if (!sheet) return { row: 0, checked: false };
  const schema = record.featureKey === 'amazon-subscribe-save'
    ? requireTasksSchema_(sheet, ['cancelSubscribe'], record.computerLabel)
    : requireTasksSchema_(sheet, ['move99'], record.computerLabel);
  const computerCol = schema.computerColumn;
  if ((proof.rule.platform === 'ebay' || proof.rule.platform === 'amazon') && !isEbayMetricColumn_(sheet, computerCol)) {
    return { row: 0, checked: false };
  }
  const row = proof.rule.taskStartsWith
    ? findTaskRowByStartsWith_(sheet, proof.rule.taskStartsWith)
    : findTaskRowByContains_(sheet, proof.rule.taskContains);
  if (!row) return { row: 0, checked: false };
  const checkedAt = validDate_(record.completedAt || new Date());
  const note = record.featureKey === 'amazon-subscribe-save'
    ? [
      'Last checked: ' + Utilities.formatDate(checkedAt, Session.getScriptTimeZone(), 'MM/dd/yyyy hh:mm:ss a'),
      'Workflow: Amazon Subscribe & Save',
      'Proof: verified every expected Amazon Chrome profile with 0 active subscriptions and 0 failures',
      'Cancelled: ' + Number(record.cancelledCount || 0),
      'Amazon profiles: ' + Number(record.verifiedProfileCount || 0) + ' / ' + Number(record.expectedProfileCount || 0),
      'Approval: ' + cleanText_(record.operatorApprovalToken)
    ].join('\n')
    : [
      'Last checked: ' + Utilities.formatDate(checkedAt, Session.getScriptTimeZone(), 'MM/dd/yyyy hh:mm:ss a'),
      'Workflow: Move .99',
      'Proof: final verification found 0 remaining and 0 failed',
      'Rows scanned: ' + Number(record.scannedCount || 0)
    ].join('\n');
  applyCheckboxRange_(sheet.getRange(row, 5, 1, 5));
  sheet.getRange(row, computerCol).setValue(true).setNote(note);
  clearPoshmarkOnlyMetricCells_(sheet, [row]);
  clearComputerHeaderNotes_(sheet);
  clearVisibleLastUpdated_(sheet);
  return { row, checked: true };
}

function syncTasksListingStatus_(record) {
  const ss = SpreadsheetApp.openById(TASKS_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) return { row: 0, cell: '', checked: false };

  const checkedAt = validDate_(record.confirmedAt || record.capturedAt || new Date());
  const checkedNote = 'Last checked: ' + Utilities.formatDate(checkedAt, Session.getScriptTimeZone(), 'MM/dd/yyyy hh:mm:ss a');
  const schema = requireTasksSchema_(sheet, ['listingConfirmed', 'itemsLimit', 'dollarLimit'], record.computerLabel);
  const computerCol = schema.computerColumn;
  if (!isEbayMetricColumn_(sheet, computerCol)) return { row: 0, cell: '', checked: false };

  const rows = {
    confirmed: findTaskRowByStartsWith_(sheet, 'Confirm Listings are under Subscription Listing Limit'),
    items: findTaskRowByStartsWith_(sheet, 'Items Limit'),
    dollars: findTaskRowByStartsWith_(sheet, '$ Amount Limit')
  };
  const storeAllowanceUnderLimit = hardLimitState_(record.subscriptionUsedThisMonth, record.subscriptionListingLimit);
  const sellerQuantityUnderLimit = hardLimitState_(record.currentQuantityUsed, record.monthlySellerQuantityLimit);
  const sellerDollarUnderLimit = hardLimitState_(record.currentDollarUsed, record.monthlySellerDollarLimit);
  const underLimit = storeAllowanceUnderLimit === true
    && sellerDollarUnderLimit === true
    && sellerQuantityUnderLimit !== false;

  if (rows.confirmed) {
    applyCheckboxRange_(sheet.getRange(rows.confirmed, 5, 1, 5));
    const checkbox = sheet.getRange(rows.confirmed, computerCol);
    checkbox
      .setValue(underLimit)
      .setNote([
        checkedNote,
        'Listing status: ' + (record.overallStatus || 'Unknown'),
        'Store allowance: ' + (record.subscriptionStatus || 'Unknown'),
        'Seller quantity: ' + (record.sellerQuantityStatus || 'Unknown'),
        'Seller dollars: ' + (record.dollarStatus || 'Unknown'),
        'Under limit: ' + (underLimit ? 'YES' : 'NO')
      ].join('\n'));
    SpreadsheetApp.flush();
    const checked = checkbox.getValue() === true;
    if (underLimit && !checked) {
      throw new Error(`Listing hard limits were below their caps, but Tasks ${checkbox.getA1Notation()} did not read back as checked.`);
    }
    setMergedTaskValue_(sheet, rows.items, computerCol, record.subscriptionListingLimit, '#,##0', checkedNote);
    setMergedTaskValue_(sheet, rows.dollars, computerCol, record.monthlySellerDollarLimit, '$#,##0', checkedNote);
    clearPoshmarkOnlyMetricCells_(sheet, Object.values(rows).filter(Boolean));
    clearComputerHeaderNotes_(sheet);
    clearVisibleLastUpdated_(sheet);
    return { row: rows.confirmed, cell: checkbox.getA1Notation(), checked };
  }
  return { row: 0, cell: '', checked: false };
}

function hardLimitState_(used, limit) {
  if (used === null || used === undefined || used === '' || limit === null || limit === undefined || limit === '') return null;
  const usedNumber = Number(used);
  const limitNumber = Number(limit);
  if (!Number.isFinite(usedNumber) || !Number.isFinite(limitNumber) || limitNumber <= 0) return null;
  return usedNumber < limitNumber;
}

function setMergedTaskValue_(sheet, row, col, value, numberFormat, note) {
  if (!row || value === null || value === undefined || value === '') return;
  const requested = sheet.getRange(row, col);
  const merged = requested.getMergedRanges();
  const cell = merged.length ? sheet.getRange(merged[0].getRow(), merged[0].getColumn()) : requested;
  cell.setValue(Number(value)).setNumberFormat(numberFormat).setNote(note);
}

function findTaskRowByStartsWith_(sheet, text) {
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(1, 4, lastRow, 1).getDisplayValues();
  const needle = String(text || '').trim().toLowerCase();
  const matches = [];
  for (let i = 0; i < values.length; i += 1) {
    const label = String(values[i][0] || '').trim().toLowerCase();
    if (label.startsWith(needle)) matches.push(i + 1);
  }
  return matches.length === 1 ? matches[0] : 0;
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
  applyTasksMetricRows_(sheet);
  applyStaleTaskAlerts_(sheet);
}

function applyTasksMetricRows_(sheet) {
  const transactionRow = findTaskRowByStartsWith_(sheet, 'Transaction Defect Rate');
  const lateRow = findTaskRowByStartsWith_(sheet, 'Late Shipment Rate');
  const trackingRow = findTaskRowByStartsWith_(sheet, 'Tracking Uploaded On Time');
  const casesRow = findTaskRowByStartsWith_(sheet, 'Cases Closed without seller Resolution');

  applyTasksMetricRow_(sheet, transactionRow, (value) => taskMetricAlertState_('defect', value));
  applyTasksMetricRow_(sheet, lateRow, (value) => taskMetricAlertState_('late', value));
  applyTasksMetricRow_(sheet, trackingRow, (value) => taskMetricAlertState_('tracking', value));
  applyTasksMetricRow_(sheet, casesRow, (value) => taskMetricAlertState_('cases', value));
}

function ensureTasksMetricConditionalFormatting_(sheet) {
  const transactionRow = findTaskRowByStartsWith_(sheet, 'Transaction Defect Rate');
  const lateRow = findTaskRowByStartsWith_(sheet, 'Late Shipment Rate');
  const trackingRow = findTaskRowByStartsWith_(sheet, 'Tracking Uploaded On Time');
  const casesRow = findTaskRowByStartsWith_(sheet, 'Cases Closed without seller Resolution');
  const metricRows = [transactionRow, lateRow, trackingRow, casesRow];
  if (metricRows.some((row) => !row)) throw new Error('One or more Tasks metric rows are missing.');

  const metricRowSet = new Set(metricRows);
  const retainedRules = sheet.getConditionalFormatRules().filter((rule) => {
    const ranges = rule.getRanges();
    return !ranges.length || !ranges.every((range) => (
      range.getColumn() === 5
      && range.getNumColumns() === 5
      && range.getNumRows() === 1
      && metricRowSet.has(range.getRow())
    ));
  });
  const red = '#ff0000';
  const orange = '#f9cb9c';
  const rangeFor = (row) => sheet.getRange(row, 5, 1, 5);
  const metricRules = [
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(0.03).setBackground(red).setBold(true).setRanges([rangeFor(lateRow)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0.015).setBackground(orange).setBold(true).setRanges([rangeFor(lateRow)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0.85).setBackground(orange).setBold(true).setRanges([rangeFor(trackingRow)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground(red).setBold(true).setRanges([rangeFor(transactionRow)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground(red).setBold(true).setRanges([rangeFor(casesRow)]).build()
  ];
  sheet.setConditionalFormatRules(metricRules.concat(retainedRules));
}

function taskMetricAlertState_(metric, value) {
  const percent = parseTaskPercent_(value);
  if (!Number.isFinite(percent)) return { bad: false, color: 'clear' };
  if (metric === 'defect' || metric === 'cases') {
    return { bad: percent > 0, color: percent > 0 ? 'red' : 'clear' };
  }
  if (metric === 'late') {
    if (percent >= 3) return { bad: true, color: 'red' };
    if (percent > 1.5) return { bad: true, color: 'orange' };
    return { bad: false, color: 'clear' };
  }
  if (metric === 'tracking') {
    return { bad: percent < 85, color: percent < 85 ? 'orange' : 'clear' };
  }
  return { bad: false, color: 'clear' };
}

function applyTasksMetricRow_(sheet, row, evaluate) {
  if (!row) return;
  const range = sheet.getRange(row, 5, 1, 5);
  const values = range.getValues()[0];
  const headers = sheet.getRange(3, 5, 1, 5).getDisplayValues()[0];
  const computers = [];
  values.forEach((value, index) => {
    const cell = sheet.getRange(row, 5 + index);
    if (value === '' || value === null || typeof value === 'boolean') {
      cell.setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
      return;
    }
    const result = evaluate(value) || {};
    applyTaskMetricColor_(cell, result.color);
    if (result.bad) computers.push(headers[index]);
  });
  const alertCell = sheet.getRange(row, 11);
  if (computers.length) {
    alertCell.setValue('CHECK ' + computers.join(' & ')).setBackground('#ff0000').setFontColor('#000000').setFontWeight('bold');
  } else {
    alertCell.clearContent().setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
  }
}

function applyTaskMetricColor_(cell, color) {
  if (color === 'red') {
    cell.setBackground('#ff0000').setFontColor('#000000').setFontWeight('bold');
    return;
  }
  if (color === 'orange') {
    cell.setBackground('#f9cb9c').setFontColor('#000000').setFontWeight('bold');
    return;
  }
  cell.setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
}

function applyStaleTaskAlerts_(sheet, now = new Date(), useMonthlyFormula = true) {
  const staleChecks = [
    { text: 'Ctl + F and "Add Tracking"', days: 3 },
    { text: 'Ctrl + F and look for any orders missing "Ship"', days: 3 },
    { text: 'Ctrl + F on "Check"', days: 3 }
  ];
  staleChecks.forEach(({ text, days }) => {
    const row = findTaskRowByContains_(sheet, text);
    if (!row) return;
    applyStaleTaskRow_(sheet, row, days, 'CHECK', now);
  });

  applySnipeReminder_(sheet, now);
  const cancelSubscribeRow = findTaskRowByContains_(sheet, 'Cancel All Subscribe & Save Items on ALL Amazon Accounts');
  if (cancelSubscribeRow) applyMonthlySubscribeReminder_(sheet, cancelSubscribeRow, now, useMonthlyFormula);
}

function applyStaleTaskRow_(sheet, row, maxDays, label, now = new Date()) {
  const range = sheet.getRange(row, 5, 1, 5);
  const values = range.getValues()[0];
  const notes = range.getNotes()[0];
  const headers = sheet.getRange(3, 5, 1, 5).getDisplayValues()[0];
  const stale = [];
  values.forEach((value, index) => {
    if (staleTaskState_(value, notes[index], maxDays, now)) stale.push(headers[index]);
  });
  const alertCell = sheet.getRange(row, 11);
  if (stale.length) {
    alertCell.setValue(`${label} ${stale.join(' & ')}`).setBackground('#ff0000').setFontColor('#000000').setFontWeight('bold');
  } else {
    alertCell.clearContent().setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
  }
}

function staleTaskState_(value, note, maxDays, now = new Date()) {
  if (value === true) return false;
  const lastChecked = dateFromNote_(note);
  return !lastChecked || daysSince_(lastChecked, now) > maxDays;
}

function snipeReminderState_(notes, headers, now = new Date(), maxDays = 5) {
  let latestDate = null;
  let latestComputer = '';
  (notes || []).forEach((note, index) => {
    const date = dateFromNote_(note);
    if (date && (!latestDate || date.getTime() > latestDate.getTime())) {
      latestDate = date;
      latestComputer = String((headers || [])[index] || '').trim();
    }
  });
  return {
    computer: latestComputer,
    date: latestDate,
    stale: !latestDate || daysSince_(latestDate, now) > maxDays
  };
}

function applySnipeReminder_(sheet, now = new Date()) {
  const row = findTaskRowByContains_(sheet, 'Snipe Items |');
  if (!row) return;
  const notes = sheet.getRange(row, 5, 1, 5).getNotes()[0];
  const headers = sheet.getRange(3, 5, 1, 5).getDisplayValues()[0];
  const labelCell = sheet.getRange(row, 11);
  const computerCell = sheet.getRange(row, 12);
  let state = snipeReminderState_(notes, headers, now, 5);
  if (!state.date) {
    const legacyDate = dateFromNote_(labelCell.getNote()) || dateFromNote_(computerCell.getNote());
    const legacyComputer = computerCell.getDisplayValue();
    if (legacyDate) {
      state = {
        computer: legacyComputer,
        date: legacyDate,
        stale: daysSince_(legacyDate, now) > 5
      };
    }
  }
  labelCell.setValue('Last Sniped:');
  computerCell.setValue(state.computer || 'NONE');
  const statusCell = sheet.getRange(row, 13);
  if (state.stale) {
    statusCell.setValue('NEED TO SNIPE').setBackground('#ff0000').setFontColor('#000000').setFontWeight('bold');
  } else {
    statusCell.setValue(Utilities.formatDate(state.date, 'America/Chicago', 'MM/dd/yyyy')).setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
  }
}

function applyMonthlySubscribeReminder_(sheet, row, now = new Date(), useFormula = true) {
  const cell = sheet.getRange(row, 12);
  if (useFormula) {
    cell.setFormula('=IF(TODAY()>=EOMONTH(TODAY(),0)-1,"CHECK","")');
    return;
  }
  if (monthlyReminderDue_(now)) {
    cell.setValue('CHECK').setBackground('#ff0000').setFontColor('#000000').setFontWeight('bold');
  } else {
    cell.clearContent().setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
  }
}

function ensureStaleTaskConditionalFormatting_(sheet) {
  const dailyRows = [
    findTaskRowByContains_(sheet, 'Ctl + F and "Add Tracking"'),
    findTaskRowByContains_(sheet, 'Ctrl + F and look for any orders missing "Ship"'),
    findTaskRowByContains_(sheet, 'Ctrl + F on "Check"')
  ];
  const snipeRow = findTaskRowByContains_(sheet, 'Snipe Items |');
  const monthlyRow = findTaskRowByContains_(sheet, 'Cancel All Subscribe & Save Items on ALL Amazon Accounts');
  const targetCells = dailyRows.map((row) => `${row}:11`).concat([`${snipeRow}:13`, `${monthlyRow}:12`]);
  if (dailyRows.some((row) => !row) || !snipeRow || !monthlyRow) throw new Error('One or more stale-alert task rows are missing.');
  const retained = sheet.getConditionalFormatRules().filter((rule) => {
    const ranges = rule.getRanges();
    return !ranges.length || !ranges.every((range) => range.getNumRows() === 1 && range.getNumColumns() === 1 && targetCells.includes(`${range.getRow()}:${range.getColumn()}`));
  });
  const red = '#ff0000';
  const alertRanges = dailyRows.map((row) => sheet.getRange(row, 11));
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('CHECK').setBackground(red).setBold(true).setRanges(alertRanges).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('NEED TO SNIPE').setBackground(red).setBold(true).setRanges([sheet.getRange(snipeRow, 13)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('CHECK').setBackground(red).setBold(true).setRanges([sheet.getRange(monthlyRow, 12)]).build()
  ];
  sheet.setConditionalFormatRules(rules.concat(retained));
}

function dateFromNote_(note) {
  const text = String(note || '');
  const epoch = text.match(/Epoch:\s*(\d{10,})/i);
  if (epoch) {
    const date = new Date(Number(epoch[1]));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const match = text.match(/(?:Last checked|Value entered):\s*([^\n]+)/i);
  if (!match) return null;
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince_(date, now = new Date()) {
  return (now.getTime() - date.getTime()) / 86400000;
}

function daysUntilMonthEnd_(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

function monthlyReminderDue_(now = new Date()) {
  return daysUntilMonthEnd_(now) <= 1;
}

function parseTaskPercent_(value) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return NaN;
  const n = Number(value);
  if (Number.isFinite(n)) return n <= 1 ? n * 100 : n;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function percentToNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return n <= 1 ? n * 100 : n;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function deltaValue_(current, previous) {
  const a = optionalNumber_(current);
  const b = optionalNumber_(previous);
  if (a == null || b == null) return '';
  const delta = a - b;
  return Math.abs(delta) < 0.00001 ? 0 : delta;
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
  sheet.getRange('S:V').setNumberFormat('#,##0');
  sheet.getRange('W:W').setNumberFormat('0.0%');
}

function formatListingHistory_(sheet) {
  formatHeader_(sheet, LISTING_HISTORY_HEADERS.length, '#4c1d95');
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange('H:H').setNumberFormat('0.0%');
  sheet.getRange('J:J').setNumberFormat('0.0%');
  sheet.getRange('L:M').setNumberFormat('$#,##0.00');
  sheet.getRange('N:N').setNumberFormat('0.0%');
  sheet.getRange('T:W').setNumberFormat('#,##0');
  sheet.getRange('X:X').setNumberFormat('0.0%');
}

function formatShippingHistory_(sheet) {
  formatHeader_(sheet, SHIPPING_HEADERS.length, '#15803d');
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
}

function formatProfitSheet_(sheet) {
  formatHeader_(sheet, MARKETPLACE_PROFIT_HEADERS.length, '#111827');
  sheet.setColumnWidths(1, MARKETPLACE_PROFIT_HEADERS.length, 130);
  sheet.setColumnWidth(6, 260);
  sheet.setColumnWidth(18, 150);
  sheet.setColumnWidth(19, 190);
  sheet.setColumnWidth(20, 190);
  sheet.setColumnWidth(21, 260);
  sheet.setColumnWidth(22, 320);
  sheet.setColumnWidth(23, 120);
  sheet.setColumnWidth(24, 160);
  sheet.setColumnWidth(25, 140);
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange('G:H').setNumberFormat('$#,##0.00');
  sheet.getRange('J:J').setNumberFormat('$#,##0.00');
  sheet.getRange('M:M').setNumberFormat('$#,##0.00');
  sheet.getRange('N:N').setNumberFormat('0.0%');
}

function formatProfitRow_(sheet, row) {
  sheet.getRange(row, 1, 1, MARKETPLACE_PROFIT_HEADERS.length)
    .setBorder(true, true, true, true, true, true, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
  const profit = Number(sheet.getRange(row, 13).getValue());
  const cell = sheet.getRange(row, 13);
  if (Number.isFinite(profit)) {
    cell.setBackground(profit >= 0 ? '#dcfce7' : '#fee2e2').setFontColor(profit >= 0 ? '#166534' : '#991b1b').setFontWeight('bold');
  }
}

function formatPoshmarkCostQueue_(sheet) {
  formatHeader_(sheet, POSHMARK_COST_QUEUE_HEADERS.length, '#172554');
  sheet.setColumnWidths(1, POSHMARK_COST_QUEUE_HEADERS.length, 125);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 320);
  sheet.setColumnWidth(10, 150);
  sheet.setColumnWidth(11, 190);
  sheet.setColumnWidth(12, 280);
  sheet.setColumnWidth(16, 180);
  sheet.setColumnWidth(17, 320);
  sheet.setColumnWidths(18, 2, 260);
  sheet.setColumnWidth(20, 210);
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange('F:G').setNumberFormat('$#,##0.00');
  sheet.getRange('M:M').setNumberFormat('$#,##0.00');
  sheet.getRange('U:U').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), POSHMARK_COST_QUEUE_HEADERS.length).setWrap(true).setVerticalAlignment('middle');
  const statusRange = sheet.getRange(2, 11, Math.max(1, sheet.getMaxRows() - 1), 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('RESOLVED').setBackground('#dcfce7').setFontColor('#166534').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('OPEN').setBackground('#fee2e2').setFontColor('#991b1b').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('REVIEW').setBackground('#fef3c7').setFontColor('#92400e').setRanges([statusRange]).build()
  ]);
}

function formatEbayCostQueue_(sheet) {
  formatHeader_(sheet, EBAY_COST_QUEUE_HEADERS.length, '#111827');
  sheet.setColumnWidths(1, EBAY_COST_QUEUE_HEADERS.length, 125);
  sheet.setColumnWidth(3, 95);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 190);
  sheet.setColumnWidth(6, 320);
  sheet.setColumnWidth(9, 170);
  sheet.setColumnWidth(10, 150);
  sheet.setColumnWidth(11, 190);
  sheet.setColumnWidth(15, 210);
  sheet.setColumnWidth(19, 180);
  sheet.setColumnWidth(20, 320);
  sheet.setColumnWidths(21, 2, 240);
  sheet.setColumnWidth(25, 300);
  sheet.setColumnWidth(26, 220);
  sheet.setColumnWidth(27, 260);
  sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange('G:G').setNumberFormat('$#,##0.00');
  sheet.getRange('L:L').setNumberFormat('$#,##0.00');
  sheet.getRange('N:N').setNumberFormat('$#,##0.00');
  sheet.getRange('P:P').setNumberFormat('$#,##0.00');
  sheet.getRange('V:X').setNumberFormat('$#,##0.00');
  sheet.getRange('AB:AB').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange('AC:AD').setNumberFormat('$#,##0.00');
  sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), EBAY_COST_QUEUE_HEADERS.length).setWrap(true).setVerticalAlignment('middle');
  const statusRange = sheet.getRange(2, 15, Math.max(1, sheet.getMaxRows() - 1), 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('RESOLVED - MATCH').setBackground('#dcfce7').setFontColor('#166534').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('RESOLVED - AMAZON ONLY').setBackground('#dbeafe').setFontColor('#1e40af').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('DISCREPANCY').setBackground('#fee2e2').setFontColor('#991b1b').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('OPEN').setBackground('#fff7ed').setFontColor('#9a3412').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('REVIEW').setBackground('#fef3c7').setFontColor('#92400e').setRanges([statusRange]).build()
  ]);
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(2, sheet.getLastRow()), EBAY_COST_QUEUE_HEADERS.length).createFilter();
}

function formatPoshmarkMonthSheet_(sheet) {
  formatHeader_(sheet, POSHMARK_MONTH_HEADERS.length, '#111827');
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 360);
  sheet.setColumnWidths(2, 3, 115);
  sheet.setColumnWidth(5, 170);
  sheet.setColumnWidth(6, 300);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 210);
  sheet.setColumnWidth(9, 150);
  sheet.setColumnWidth(10, 190);
  sheet.setColumnWidth(11, 150);
  sheet.setColumnWidths(12, 2, 270);
  sheet.getRange('B:D').setNumberFormat('$#,##0.00');
  sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), POSHMARK_MONTH_HEADERS.length).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(1, 1, 1, POSHMARK_MONTH_HEADERS.length).setFontSize(11);
  const statusRange = sheet.getRange(2, 5, Math.max(1, sheet.getMaxRows() - 1), 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Resolved').setBackground('#dcfce7').setFontColor('#166534').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Missing Amazon Cost').setBackground('#fee2e2').setFontColor('#991b1b').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Needs Review').setBackground('#fef3c7').setFontColor('#92400e').setRanges([statusRange]).build()
  ]);
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(2, sheet.getLastRow()), POSHMARK_MONTH_HEADERS.length).createFilter();
}

function formatGenericDashboard_(sheet, count) {
  formatHeader_(sheet, count, '#111827');
  sheet.autoResizeColumns(1, Math.min(count, 12));
  if (count > 12) sheet.setColumnWidths(13, count - 12, 125);
}

function formatOrderAuditSheets_(runs, expected, purchases) {
  formatHeader_(runs, ORDER_AUDIT_RUN_HEADERS.length, '#111827');
  runs.setColumnWidths(1, ORDER_AUDIT_RUN_HEADERS.length, 145);
  runs.setColumnWidth(2, 260);
  runs.setColumnWidths(6, 1, 260);
  runs.setColumnWidth(8, 260);
  runs.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');

  formatHeader_(expected, ORDER_AUDIT_EXPECTED_HEADERS.length, '#1d4ed8');
  expected.setColumnWidths(1, ORDER_AUDIT_EXPECTED_HEADERS.length, 130);
  expected.setColumnWidth(2, 260);
  expected.setColumnWidth(11, 320);
  expected.setColumnWidth(16, 360);
  expected.setColumnWidth(17, 280);
  expected.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');

  formatHeader_(purchases, ORDER_AUDIT_PURCHASE_HEADERS.length, '#047857');
  purchases.setColumnWidths(1, ORDER_AUDIT_PURCHASE_HEADERS.length, 130);
  purchases.setColumnWidth(2, 260);
  purchases.setColumnWidth(12, 320);
  purchases.setColumnWidth(17, 360);
  purchases.setColumnWidth(18, 280);
  purchases.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
  purchases.getRange('M:M').setNumberFormat('$#,##0.00');
}

function formatPoshmarkStatsSheet_(sheet, history) {
  const count = history ? POSHMARK_STATS_HISTORY_HEADERS.length : POSHMARK_STATS_HEADERS.length;
  const offset = history ? 1 : 0;
  formatGenericDashboard_(sheet, count);
  if (history) sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange(1, 1 + offset, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.getRange(1, 16 + offset, sheet.getMaxRows(), 2).setNumberFormat('$#,##0.00');
  sheet.getRange(1, 18 + offset, sheet.getMaxRows(), 1).setNumberFormat('0.00%');
  sheet.getRange(1, 20 + offset, sheet.getMaxRows(), 1).setNumberFormat('0.00%');
  sheet.getRange(1, 26 + offset, sheet.getMaxRows(), 1).setNumberFormat('0.00%');
  sheet.getRange(1, 32 + offset, sheet.getMaxRows(), 2).setNumberFormat('$#,##0.00');
  sheet.getRange(1, 38 + offset, sheet.getMaxRows(), 1).setNumberFormat('m/d/yyyy h:mm AM/PM');
}

function formatGenericRow_(sheet, row, count) {
  sheet.getRange(row, 1, 1, count)
    .setBorder(true, true, true, true, true, true, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
  for (let col = 4; col <= count; col += 2) {
    const header = String(sheet.getRange(1, col).getDisplayValue() || '').toLowerCase();
    if (header.includes('change')) {
      const cell = sheet.getRange(row, col);
      const value = Number(cell.getValue());
      if (Number.isFinite(value) && value !== 0) {
        cell.setBackground(value > 0 ? '#dcfce7' : '#fee2e2').setFontWeight('bold');
      } else {
        cell.setBackground('#ffffff').setFontWeight('normal');
      }
    }
  }
}

function applySellerRowFormatting_(sheet, row, record, status, offset) {
  sheet.getRange(row, 1, 1, SELLER_HEADERS.length + offset).setBorder(true, true, true, true, true, true, '#d1d5db', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(row, 5 + offset, 1, 4).setNumberFormat('0.00%');
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
  sheet.getRange(row, 7 + offset).setNumberFormat('0.0%');
  sheet.getRange(row, 9 + offset).setNumberFormat('0.0%');
  sheet.getRange(row, 11 + offset, 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(row, 13 + offset).setNumberFormat('0.0%');
  sheet.getRange(row, 17 + offset).setNumberFormat('m/d/yyyy h:mm AM/PM');
  sheet.getRange(row, 19 + offset, 1, 4).setNumberFormat('#,##0');
  sheet.getRange(row, 23 + offset).setNumberFormat('0.0%');
  if (offset) sheet.getRange(row, 1).setNumberFormat('m/d/yyyy h:mm AM/PM');
  colorTextStatus_(sheet.getRange(row, 10 + offset), record.subscriptionStatus);
  colorTextStatus_(sheet.getRange(row, 14 + offset), record.dollarStatus);
  colorTextStatus_(sheet.getRange(row, 15 + offset), record.overallStatus);
  colorTextStatus_(sheet.getRange(row, 24 + offset), record.sellerQuantityStatus);
}

function colorLevel_(cell, value) { applyStateColor_(cell, levelStatus_(value)); }
function colorMetric_(cell, value, type) {
  if (value == null || value === '') return applyStateColor_(cell, 'unknown');
  let state = 'good';
  if (type === 'defect' || type === 'cases') state = Number(value) > 0 ? 'critical' : 'good';
  if (type === 'late') state = Number(value) > 2.4 ? 'critical' : Number(value) > 1.9 ? 'warning' : 'good';
  if (type === 'tracking') state = Number(value) < 80 ? 'critical' : Number(value) < 85 ? 'warning' : 'good';
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
  const snapshotRows = sheetObjects_(ensureSheet_(ss, EBAY_SNAPSHOT_DASHBOARD_SHEET, EBAY_SNAPSHOT_HEADERS), EBAY_SNAPSHOT_HEADERS);
  const poshmarkRows = sheetObjects_(ensureSheet_(ss, POSHMARK_STATS_DASHBOARD_SHEET, POSHMARK_STATS_HEADERS), POSHMARK_STATS_HEADERS);
  const profitRows = sheetObjects_(ensureSheet_(ss, MARKETPLACE_PROFIT_HISTORY_SHEET, MARKETPLACE_PROFIT_HEADERS), MARKETPLACE_PROFIT_HEADERS);

  const sellerMap = objectMap_(sellerRows);
  const listingMap = objectMap_(listingRows);
  const shippingMap = latestShippingMap_(shippingRows);
  const snapshotMap = objectMap_(snapshotRows);
  const poshmarkMap = objectMap_(poshmarkRows);
  const profitMap = latestProfitMap_(profitRows);
  const keys = [...new Set([...Object.keys(sellerMap), ...Object.keys(listingMap), ...Object.keys(shippingMap), ...Object.keys(snapshotMap), ...Object.keys(poshmarkMap), ...Object.keys(profitMap)])]
    .sort((a, b) => latestComputerTimestamp_(sellerMap[b], listingMap[b], shippingMap[b], snapshotMap[b], poshmarkMap[b], profitMap[b]) - latestComputerTimestamp_(sellerMap[a], listingMap[a], shippingMap[a], snapshotMap[a], poshmarkMap[a], profitMap[a]));
  const cards = keys.length ? keys.map((key) => renderOpsCard_(sellerMap[key], listingMap[key], shippingMap[key], snapshotMap[key], poshmarkMap[key], profitMap[key])).join('') : '<div class="empty">No data has been synced yet.</div>';

  return HtmlService.createHtmlOutput(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GLDN Ops Dashboard</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;color:#0f172a}header{background:#111827;color:white;padding:18px 20px;position:sticky;top:0;z-index:2;box-shadow:0 2px 10px rgba(0,0,0,.2)}h1{font-size:21px;margin:0}.sub{font-size:12px;color:#cbd5e1;margin-top:4px}main{max-width:1400px;margin:0 auto;padding:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.card{background:white;border-radius:14px;padding:15px;box-shadow:0 2px 8px rgba(15,23,42,.08);border:1px solid #e2e8f0}.head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.computer{font-size:18px;font-weight:800}.account{font-size:12px;color:#64748b;margin-top:2px}.badges{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.badge{padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800}.ok{background:#dcfce7;color:#166534}.watch{background:#ffedd5;color:#9a3412}.check{background:#fee2e2;color:#991b1b}.nodata{background:#e5e7eb;color:#4b5563}.section{margin-top:13px;border-top:1px solid #e2e8f0;padding-top:10px}.section h2{font-size:13px;margin:0 0 5px}.grid{display:grid;grid-template-columns:1fr auto;font-size:12px}.grid div{padding:5px 0;border-top:1px solid #f8fafc}.value{font-weight:700;text-align:right}.footer{margin-top:8px;font-size:10px;color:#64748b}.empty{background:white;padding:28px;border-radius:14px}</style><script>setTimeout(()=>location.reload(),60000);</script></head><body><header><h1>GLDN Ops Dashboard</h1><div class="sub">Latest Seller Level, listing capacity and Mark as Shipped by computer • prior syncs remain in the History tabs • refreshes every 60 seconds</div></header><main>${cards}</main></body></html>`).setTitle('GLDN Ops Dashboard');
}

function renderOpsCard_(seller, listing, shipping, snapshot, poshmark, profit) {
  const computer = (seller && seller.Computer) || (listing && listing.Computer) || (shipping && shipping.Computer) || (snapshot && snapshot.Computer) || (poshmark && poshmark.Computer) || (profit && profit.Computer) || 'Unknown';
  const account = (seller && seller['eBay Account']) || (listing && listing['eBay Account']) || (snapshot && snapshot['eBay Account']) || (poshmark && poshmark['Poshmark Account']) || (profit && profit.Account) || 'Unknown';
  const sellerStatus = seller ? seller['Overall Status'] : 'NO DATA';
  const listingStatus = listing ? listing['Overall Status'] : 'NO DATA';
  const platformLabel = poshmark && !seller && !listing ? 'Poshmark account' : 'Account';
  return `<section class="card"><div class="head"><div><div class="computer">${escapeHtml_(computer)}</div><div class="account">${escapeHtml_(platformLabel)}: ${escapeHtml_(account)}</div></div><div class="badges">${badge_(sellerStatus, 'Seller')}${badge_(listingStatus, 'Listings')}</div></div>
    <div class="section"><h2>Seller Level</h2>${grid_([
      ['Current level', seller && seller['Current Seller Level']], ['Evaluated today', seller && seller['If Evaluated Today']],
      ['Late shipment', seller && seller['Late Shipment Rate']], ['Tracking on time', seller && seller['Tracking On Time']],
      ['Cases closed', seller && seller['Cases Closed']], ['Next evaluation', seller && seller['Next Evaluation']]
    ])}<div class="footer">Last scanned: ${escapeHtml_(seller && seller['Last Scanned'] || '—')}</div></div>
    <div class="section"><h2>Listings</h2>${grid_([
      ['Active listings', listing && listing['Active Listings']], ['Available quantity', listing && listing['Available Quantity']],
      ['Store allowance used', listing && listing['Store Allowance Used']], ['Store allowance left', listing && listing['Store Allowance Left']],
      ['Store monthly allowance', listing && listing['Store Allowance']], ['Store allowance usage', listing && listing['Store Allowance Usage']],
      ['Store allowance status', listing && listing['Store Allowance Status']],
      ['Seller quantity used', listing && listing['Seller Quantity Used']], ['Seller quantity limit', listing && listing['Seller Quantity Limit']],
      ['Seller quantity usage', listing && listing['Seller Quantity Usage']], ['Seller quantity status', listing && listing['Seller Quantity Status']],
      ['Dollar used', listing && listing['Dollar Used']], ['Dollar limit', listing && listing['Dollar Limit']],
      ['Dollar status', listing && listing['Dollar Status']]
    ])}<div class="footer">Last checked: ${escapeHtml_(listing && listing['Last Checked'] || '—')}</div></div>
    <div class="section"><h2>Latest Mark as Shipped</h2>${grid_([
      ['Result', shipping && shipping.Status], ['Awaiting before', shipping && shipping['Awaiting Before']],
      ['Selected', shipping && shipping.Selected], ['Marked shipped', shipping && shipping['Marked Shipped']],
      ['Remaining', shipping && shipping.Remaining], ['Batches', shipping && shipping.Batches], ['Time', shipping && shipping.Timestamp]
    ])}</div>
    ${snapshot ? `<div class="section"><h2>eBay Sales Snapshot</h2>${grid_([
      ['Today', snapshot['Sales Today']], ['Last 7 days', snapshot['Sales Last 7 Days']],
      ['Last 31 days', snapshot['Sales Last 31 Days']], ['Last 90 days', snapshot['Sales Last 90 Days']],
      ['Neutral feedback', snapshot['Feedback Neutral 30 Days']], ['Negative feedback', snapshot['Feedback Negative 30 Days']],
      ['Impressions', snapshot['Traffic Impressions']], ['Page views', snapshot['Traffic Page Views']],
      ['Ad clicks', snapshot['Advertising Clicks']], ['Ad sales', snapshot['Advertising Sales']],
      ['ROAS', snapshot['Advertising ROAS']], ['Ad cost', snapshot['Advertising Cost']]
    ])}<div class="footer">Last checked: ${escapeHtml_(snapshot['Last Checked'] || '-')}</div></div>` : ''}
    ${poshmark ? `<div class="section"><h2>Poshmark Stats</h2>${grid_([
      ['Shipped orders all time', poshmark['Shipped Orders All Time']], ['Shipped orders 90 days', poshmark['Shipped Orders Last 90 Days']],
      ['Days to ship 90 days', poshmark['Days To Ship Last 90 Days']], ['Days to ship average', poshmark['Days To Ship Average']],
      ['Seller cancellations', poshmark['Seller Cancellations Last 90 Days']], ['Approved returns', poshmark['Approved Return Cases Last 90 Days']],
      ['Removed listings 30 days', poshmark['Moderator Removed Listings Last 30 Days']], ['Available listings', poshmark['Available Listings']],
      ['Average rating', poshmark['Average Rating']]
    ])}<div class="footer">Last checked: ${escapeHtml_(poshmark['Last Checked'] || '-')}</div></div>` : ''}
    ${profit ? `<div class="section"><h2>Latest Profit</h2>${grid_([
      ['Platform', profit.Platform], ['Order', profit['Order Number']], ['Earnings', profit['Marketplace Earnings']],
      ['Supplier total', profit['Supplier Total']], ['Profit', profit.Profit], ['Margin', profit.Margin]
    ])}<div class="footer">Logged: ${escapeHtml_(profit.Timestamp || '-')}</div></div>` : ''}
  </section>`;
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
function latestProfitMap_(rows) { const map = {}; rows.forEach((r) => { const k = computerKey_(r.Computer); if (!k) return; const current = map[k]; if (!current || dateMillis_(r.Timestamp) >= dateMillis_(current.Timestamp)) map[k] = r; }); return map; }
function dateMillis_(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0; }
function latestComputerTimestamp_(seller, listing, shipping, snapshot, poshmark, profit) { return Math.max(dateMillis_(seller && seller['Last Scanned']), dateMillis_(listing && listing['Last Checked']), dateMillis_(shipping && shipping.Timestamp), dateMillis_(snapshot && snapshot['Last Checked']), dateMillis_(poshmark && poshmark['Last Checked']), dateMillis_(profit && profit.Timestamp)); }

function findSyncReceipt_(syncId) {
  if (!syncId) return null;
  const sheet = ensureSheet_(getSpreadsheet_(), SYNC_RECEIPT_SHEET, SYNC_RECEIPT_HEADERS);
  if (sheet.getLastRow() < 2) return null;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(syncId)
    .matchEntireCell(true)
    .findNext();
  if (!match) return null;
  const rawResult = sheet.getRange(match.getRow(), 6).getDisplayValue();
  try {
    return JSON.parse(rawResult);
  } catch (_) {
    return { message: 'Dashboard record was already processed.' };
  }
}

function saveSyncReceipt_(syncId, action, record, result) {
  const sheet = ensureSheet_(getSpreadsheet_(), SYNC_RECEIPT_SHEET, SYNC_RECEIPT_HEADERS);
  sheet.appendRow([
    syncId,
    action,
    new Date(),
    cleanText_(record.computerLabel),
    cleanText_(record.ebayAccountLabel || record.accountLabel || record.poshmarkAccountLabel),
    JSON.stringify(result)
  ]);
  const excess = sheet.getLastRow() - 5001;
  if (excess > 0) sheet.deleteRows(2, excess);
}

function getSpreadsheet_() {
  const id = TASKS_SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY);
  if (!id) throw new Error('Set TASKS_SPREADSHEET_ID before deploying the web app.');
  return SpreadsheetApp.openById(id);
}
function parsePayload_(e) { if (!e || !e.postData || !e.postData.contents) throw new Error('Missing request body.'); try { return JSON.parse(e.postData.contents); } catch (_) { throw new Error('Request body is not valid JSON.'); } }
function configuredSyncKey_() { return String(PropertiesService.getScriptProperties().getProperty(SYNC_KEY_PROPERTY) || ''); }
function validateConfiguredKey_() { if (configuredSyncKey_().length < 24) throw new Error(`Set the ${SYNC_KEY_PROPERTY} script property to a private setup code of at least 24 characters.`); }
function validateKey_(provided) {
  const candidate = String(provided || '');
  const configured = configuredSyncKey_();
  if (configured && candidate === configured) return;
  throw new Error('Invalid dashboard key.');
}
function configureDashboardSyncKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('GLDN dashboard setup', 'Enter the private setup code used by the extension.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const value = String(response.getResponseText() || '').trim();
  if (value.length < 24) throw new Error('The setup code must be at least 24 characters.');
  PropertiesService.getScriptProperties().setProperty(SYNC_KEY_PROPERTY, value);
  ui.alert('Dashboard setup code saved.');
}
function optionalNumber_(value) { if (value === null || value === undefined || value === '') return null; const n = Number(String(value).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; }
function numberOrBlank_(value) { return value === null || value === undefined || value === '' ? '' : Number(value); }
function percentCell_(value) { return value === null || value === undefined || value === '' ? '' : Number(value) / 100; }
function percentRatioCell_(value) { return value === null || value === undefined || value === '' ? '' : Number(value) / 100; }
function validDate_(value) { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? new Date() : d; }
function cleanText_(value) { return String(value == null ? '' : value).trim().slice(0, 1000); }
let SCRIPT_LOCK_DEPTH_ = 0;
function withLock_(fn) {
  if (SCRIPT_LOCK_DEPTH_ > 0) {
    SCRIPT_LOCK_DEPTH_ += 1;
    try { return fn(); } finally { SCRIPT_LOCK_DEPTH_ -= 1; }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  SCRIPT_LOCK_DEPTH_ = 1;
  try { return fn(); } finally { SCRIPT_LOCK_DEPTH_ = 0; lock.releaseLock(); }
}
function escapeHtml_(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
