importScripts(
  'config.example.js',
  'theme-catalog.js',
  'foundation.js',
  'variation-core.js',
  'ebay-profit-core.js',
  'ebay-profit-background.js',
  'order-audit-core.js',
  'order-audit-background.js',
  'listing-preflight-core.js',
  'policy-listing-audit-core.js',
  'profit-backfill.js',
  'profit-backfill-background.js'
);

const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const DASHBOARD_URL_KEY = 'sellerDashboardUrl';
const DASHBOARD_SECRET_KEY = 'sellerDashboardKey';
const DASHBOARD_QUEUE_KEY = 'gldnDashboardQueue';
const DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY = 'gldnDashboardQueueMigrationAudit';
const DASHBOARD_RETRY_ALARM = 'gldnDashboardRetry';
const UPDATER_CHECK_ALARM = 'gldnUpdaterCheck';
const LOCAL_CONTROL_ALARM = 'gldnLocalControl';
const UPDATER_API = 'http://127.0.0.1:39417/v1';
const SETTINGS_BACKUP_KEY = 'gldnSettingsBackups';
const SETTINGS_SCHEMA_KEY = 'settingsSchemaVersion';
const ECOMSNIPER_EXTENSION_ID = String(globalThis.GLDN_CONFIG?.ecomSniperExtensionId || 'eohieelgcgopcnjjjanjgfjdaifolokm').trim();
const ECOMSNIPER_PAGES = Object.freeze({
  competitorScanner: '6c6aa5ed/index.html',
  productHunter: 'a6c45e6f/product_finder.html',
  bulkPoster: 'bb148b3c/bulk_post_settings.html'
});
const ECOMSNIPER_PAGE_CANDIDATES = Object.freeze({
  competitorScanner: Object.freeze([
    ECOMSNIPER_PAGES.competitorScanner,
    'Competitor_Research/index.html'
  ]),
  productHunter: Object.freeze([
    ECOMSNIPER_PAGES.productHunter,
    'Product_Finder/product_finder.html'
  ]),
  bulkPoster: Object.freeze([
    ECOMSNIPER_PAGES.bulkPoster,
    'bulk_post/bulk_post_settings.html'
  ])
});
const ECOMSNIPER_PAGE_TITLE_PATTERNS = Object.freeze({
  competitorScanner: /Competitor.*Scanner/i,
  productHunter: /Product.*Hunter/i,
  bulkPoster: /Bulk Poster/i
});
const ECOMSNIPER_RESOLVED_PAGES_KEY = 'gldnEcomSniperResolvedPages';
const ECOMSNIPER_PAGE_LABELS = Object.freeze({
  competitorScanner: 'Competitor Scanner',
  productHunter: 'Product Hunter',
  bulkPoster: 'Bulk Poster'
});
const DASHBOARD_REQUEST_TIMEOUT_MS = 15000;
const DASHBOARD_BATCH_REQUEST_TIMEOUT_MS = 90000;
const HISTORICAL_PROFIT_PAGE_ACTION_TIMEOUT_MS = 360000;
const HISTORICAL_PROFIT_SYNC_BATCH_SIZE = 50;
const FOUNDATION = globalThis.GLDN_FOUNDATION;
const EBAY_PROFIT_CORE = globalThis.GLDN_EBAY_PROFIT_CORE;
const EBAY_PROFIT_BACKGROUND = globalThis.GLDN_EBAY_PROFIT_BACKGROUND;
const ORDER_AUDIT_BACKGROUND = globalThis.GLDN_ORDER_PLACEMENT_AUDIT_BACKGROUND;
const LISTING_PREFLIGHT = globalThis.GLDN_LISTING_PREFLIGHT;
const POLICY_LISTING_AUDIT = globalThis.GLDN_POLICY_LISTING_AUDIT;
const PROFIT_BACKFILL_BACKGROUND = globalThis.GLDN_PROFIT_BACKFILL_BACKGROUND;
const VARIATION_CORE = globalThis.GLDN_VARIATION_CORE;
const COMPUTER_ACCOUNT_MAP = FOUNDATION.computerAccounts;
const COMPUTER_OPTIONS = FOUNDATION.computerOptions;
let move99ClaimQueue = Promise.resolve();
let workflowStartQueue = Promise.resolve();
let openReviewQueue = Promise.resolve();
let historicalProfitSyncPromise = null;
let ebayMonthlyProfitSyncPromise = null;
let localControlPollRunning = false;

const AUTOMATION_RESET_KEYS = Object.freeze([
  ...FOUNDATION.workflowStateKeys,
  'pendingEcomSniperBulkExtract',
  'pendingManualEcomSniperClick',
  'pendingAmazonBulkWorkflowStart',
  'bulkLinksAmazonQueue',
  'pendingPoshmarkProfitContext',
  'pendingAmazonOrderDetailMatch',
  'pendingAmazonOrderSearchSubmission',
  'variationAuditScanState',
  'ebayPolicyListingScanState'
]);
const VERSIONED_WORKFLOW_KEYS = Object.freeze([
  'gldnWorkflowReservation',
  'pendingVariationEndReview',
  'variationAuditScanState',
  'pendingPolicyListingEndReview',
  'ebayPolicyListingScanState',
  'orderPlacementAuditAmazonScan',
  'pendingMarkShippedRun',
  'pendingSellerLevelScan',
  'pendingReviewMonthlyLimits',
  'pendingEbaySnapshotScan',
  'pendingSnipingExtract',
  'pendingSnipingWinner',
  'pendingAmazonSnipingWorkflowStart',
  'pendingAmazonSubscribeSaveRun',
  'pendingPoshmarkStatsScan',
  'pendingWalmartAutoOrder',
  'pendingPoshmarkProfitContext',
  'pendingAmazonOrderDetailMatch',
  'pendingAmazonOrderSearchSubmission'
]);

function stampVersionedWorkflowValue(value) {
  if (value === true) {
    return { active: true, extensionVersion: EXTENSION_VERSION, stateUpdatedAt: new Date().toISOString() };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return {
    ...value,
    extensionVersion: EXTENSION_VERSION,
    stateUpdatedAt: new Date().toISOString()
  };
}

async function activeWorkflowStatus() {
  const stored = await storageGet(FOUNDATION.workflowStateKeys);
  const workflows = FOUNDATION.activeWorkflowEntries(stored);
  return { busy: workflows.length > 0, workflows };
}

function workflowBlockerMessage(operation, workflows) {
  const labels = workflows.map((entry) => `${entry.label}${entry.approvalReady ? " (approval/review open)" : ""}`);
  return `${operation} is blocked while ${labels.join(", ")} is in progress. Finish it or use Stop/Reset, then try again.`;
}

async function assertUpdaterIdle(operation) {
  const status = await activeWorkflowStatus();
  if (status.busy) throw new Error(workflowBlockerMessage(operation, status.workflows));
  return status;
}

async function assertRuntimeReloadSafe(operation) {
  const status = await activeWorkflowStatus();
  const unsafe = status.workflows.filter((entry) => !(
    ['ebayMonthlyProfit', 'poshmarkProfitBackfill'].includes(entry.key)
    && entry.phase === 'review'
  ));
  if (unsafe.length) throw new Error(workflowBlockerMessage(operation, unsafe));
  return { ...status, reviewCheckpointPreserved: status.workflows.length > 0 };
}

function claimWorkflowStart(id, label, sender = {}) {
  const claim = workflowStartQueue.then(async () => {
    const stored = await storageGet(FOUNDATION.workflowStateKeys);
    const blockers = FOUNDATION.activeWorkflowEntries(stored);
    if (blockers.length) {
      return { ok: false, busy: true, workflows: blockers, error: workflowBlockerMessage(`Starting ${label}`, blockers) };
    }
    const token = globalThis.crypto?.randomUUID?.() || `workflow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const claimedAt = Date.now();
    await storageSet({
      gldnWorkflowReservation: {
        active: true,
        id: String(id || "workflow"),
        label: String(label || "Workflow"),
        token,
        ownerTabId: sender?.tab?.id ?? null,
        claimedAt,
        expiresAt: claimedAt + 30000
      }
    });
    return { ok: true, token };
  });
  workflowStartQueue = claim.then(() => undefined, () => undefined);
  return claim;
}

async function releaseWorkflowStart(token) {
  const stored = await storageGet(["gldnWorkflowReservation"]);
  if (!stored.gldnWorkflowReservation) return { ok: true, released: false };
  if (token && stored.gldnWorkflowReservation.token !== token) {
    return { ok: false, released: false, error: "The workflow reservation belongs to another start request." };
  }
  await storageRemove(["gldnWorkflowReservation"]);
  return { ok: true, released: true };
}

const AUTOMATION_RESET_TAB_TIMEOUT_MS = 750;

function notifyTabOfAutomationReset(tabId) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, AUTOMATION_RESET_TAB_TIMEOUT_MS);
    try {
      chrome.tabs.sendMessage(tabId, { type: 'gldnAutomationReset' }, () => {
        void chrome.runtime.lastError;
        finish();
      });
    } catch {
      finish();
    }
  });
}

function broadcastAutomationReset(senderTabId = null) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true }, (tabs) => {
      void chrome.runtime.lastError;
      const tabIds = new Set((tabs || [])
        .filter((tab) => Number.isInteger(tab?.id) && /^https?:/i.test(String(tab.url || '')))
        .map((tab) => tab.id));
      if (Number.isInteger(senderTabId)) tabIds.add(senderTabId);
      Promise.all([...tabIds].map(notifyTabOfAutomationReset))
        .then(() => resolve({ notifiedTabs: tabIds.size }));
    });
  });
}

function openEbayDailyPanelFromCommand() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const target = (tabs || []).find((tab) => (
      Number.isInteger(tab?.id)
      && /^https:\/\/([a-z0-9-]+\.)*ebay\.com\//i.test(String(tab.url || ''))
    ));
    if (!target) return;
    chrome.tabs.sendMessage(target.id, { type: 'showEbayDailyPanel' }, (response) => {
      const error = chrome.runtime.lastError;
      if (error || !response?.ok) {
        recordExtensionLog({
          source: 'background',
          operation: 'open-ebay-daily-panel',
          message: error?.message || response?.error || 'The eBay tab did not open the daily panel.'
        });
      }
    });
  });
}

chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'open-ebay-daily-panel') openEbayDailyPanelFromCommand();
});

async function resetAutomationState(sender = {}) {
  await PROFIT_BACKFILL_BACKGROUND.reset().catch(() => ({ ok: false }));
  await EBAY_PROFIT_BACKGROUND.reset().catch(() => ({ ok: false }));
  await storageRemove(AUTOMATION_RESET_KEYS);
  await storageSet({ gldnStopRequested: false });
  void broadcastAutomationReset(sender?.tab?.id).catch((error) => {
    recordExtensionLog({ source: 'background', operation: 'reset-tab-notification', message: error.message });
  });
  return { ok: true, reset: true, tabNotification: 'scheduled' };
}

async function startPoshmarkProfitBackfillGuarded(options = {}, sender = {}) {
  const reservation = await claimWorkflowStart('poshmark-profit', 'Poshmark profit backfill', sender);
  if (!reservation.ok) return reservation;
  try {
    let startOptions = { ...options };
    if (['resolve-missing', 'resolve-ebay'].includes(startOptions.scope)) {
      const resolvingEbay = startOptions.scope === 'resolve-ebay';
      const profileSettings = await storageGet(['amazonProfileLabel']);
      const supplierProfile = String(profileSettings.amazonProfileLabel || '').trim();
      if (!supplierProfile) {
        return {
          ok: false,
          error: 'Set a permanent Amazon profile name in GLDN Ops Setup before resolving missing costs. This prevents the same Amazon profile from checking the same orders again.'
        };
      }
      const queue = await postToDashboard(resolvingEbay ? 'ebayCostQueueRead' : 'poshmarkCostQueueRead', {
        monthKey: String(startOptions.monthKey || ''),
        limit: Math.max(1, Math.min(100, Number(startOptions.maxOrders || 100))),
        supplierProfile
      });
      const seedSales = Array.isArray(queue.records) ? queue.records : [];
      if (!seedSales.length) {
        return {
          ok: false,
          error: `No open ${resolvingEbay ? 'eBay' : 'Poshmark'} cost rows remain for Amazon profile "${supplierProfile}". Continue from another signed-in Amazon profile.`
        };
      }
      startOptions = { ...startOptions, supplierProfile, seedSales };
    }
    return await PROFIT_BACKFILL_BACKGROUND.start(startOptions, sender);
  } finally {
    await releaseWorkflowStart(reservation.token);
  }
}

async function startEbayMonthlyProfitGuarded(options = {}, sender = {}) {
  const reservation = await claimWorkflowStart('ebay-monthly-profit', 'Monthly eBay profit', sender);
  if (!reservation.ok) return reservation;
  try {
    return await EBAY_PROFIT_BACKGROUND.start(options, sender);
  } finally {
    await releaseWorkflowStart(reservation.token);
  }
}

function updateOpenReviews(mutator) {
  const update = openReviewQueue.then(async () => {
    const stored = await storageGet(['gldnOpenReviews']);
    const now = Date.now();
    const reviews = Object.fromEntries(Object.entries(stored.gldnOpenReviews || {}).filter(([, review]) => (
      review?.active === true && Number(review.expiresAt || 0) > now
    )));
    const result = await mutator(reviews, now);
    await storageSet({ gldnOpenReviews: reviews });
    return result;
  });
  openReviewQueue = update.then(() => undefined, () => undefined);
  return update;
}

function registerOpenReview(message = {}, sender = {}) {
  return updateOpenReviews((reviews, now) => {
    const token = String(message.token || '').trim();
    if (!token) return { ok: false, error: 'The review window token is missing.' };
    const ownerTabId = sender?.tab?.id ?? null;
    for (const [key, review] of Object.entries(reviews)) {
      if (Number(review.ownerTabId) === Number(ownerTabId) && review.documentInstanceId !== message.documentInstanceId) delete reviews[key];
    }
    reviews[token] = {
      active: true,
      phase: 'review-open',
      token,
      label: String(message.label || 'GLDN review').slice(0, 120),
      page: String(sender?.tab?.url || message.page || '').slice(0, 1000),
      ownerTabId,
      documentInstanceId: String(message.documentInstanceId || ''),
      extensionVersion: EXTENSION_VERSION,
      openedAt: new Date(now).toISOString(),
      expiresAt: now + (4 * 60 * 60 * 1000)
    };
    return { ok: true, token };
  });
}

function releaseOpenReview(token) {
  return updateOpenReviews((reviews) => {
    const key = String(token || '').trim();
    const released = Boolean(key && reviews[key]);
    if (key) delete reviews[key];
    return { ok: true, released };
  });
}

function clearOpenReviewsForTab(sender = {}) {
  return updateOpenReviews((reviews) => {
    const ownerTabId = sender?.tab?.id;
    let cleared = 0;
    for (const [key, review] of Object.entries(reviews)) {
      if (Number.isInteger(ownerTabId) && Number(review.ownerTabId) === Number(ownerTabId)) {
        delete reviews[key];
        cleared += 1;
      }
    }
    return { ok: true, cleared };
  });
}

async function updaterRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 20000));
  try {
    const response = await fetch(`${UPDATER_API}${path}`, {
      method: options.method || 'GET',
      headers: {
        'X-GLDN-Updater': '1',
        'X-GLDN-Extension-Id': chrome.runtime.id,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || `GLDN Ops updater returned HTTP ${response.status}.`);
    }
    return result;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('The GLDN Ops updater timed out. Restart it from the one-time installer.');
    }
    if (/Failed to fetch|NetworkError/i.test(String(error?.message || error))) {
      throw new Error('The GLDN Ops updater is not running on this computer. Run the one-time GLDN Ops installer once.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const LOCAL_CONTROL_PLATFORM = Object.freeze({
  ebay: {
    patterns: ['*://*.ebay.com/*'],
    messageType: 'runEbayPageAction',
    actions: new Set(['show-panel', 'mark-shipped', 'approve-mark-shipped-review', 'approve-ebay-mark-shipped-confirmation', 'cancel-mark-shipped-review', 'seller-level', 'save-seller-level-review', 'sales-snapshot', 'save-sales-snapshot-review', 'listing-limits', 'save-listing-limits-review', 'prepare-order-note', 'start-monthly-profit', 'start-move99-scan', 'start-move99-reverse-scan', 'apply-saved-move99', 'approve-move99-submit'])
  },
  poshmark: {
    patterns: ['*://*.poshmark.com/*'],
    messageType: 'runPoshmarkPageAction',
    actions: new Set(['posh-stats', 'posh-profit', 'visible-sales', 'save-visible-sales-review', 'historical-profit', 'start-historical-profit-month', 'resume-historical-profit', 'approve-historical-profit-review'])
  },
  amazon: {
    patterns: ['*://*.amazon.com/*'],
    messageType: 'runAmazonPageAction',
    actions: new Set(['review-copy', 'sniping-seller-review', 'sniping-winner-review', 'subscribe-save-scan', 'subscribe-save-show-review', 'approve-subscribe-save', 'approve-historical-profit-review'])
  },
  ecomsniper: {
    patterns: ['https://ecomsniper.io/*']
  },
  tutorial: {
    patterns: ['https://rumble.com/*']
  }
});
const LOCAL_CONTROL_CONTENT_FILES = Object.freeze({
  ebay: ['config.example.js', 'theme-catalog.js', 'foundation.js', 'shared.js', 'control-heartbeat.js', 'profit-audit.js', 'ebay-profit-core.js', 'sniping-audit.js', 'ebay.js'],
  poshmark: ['config.example.js', 'theme-catalog.js', 'foundation.js', 'shared.js', 'control-heartbeat.js', 'profit-audit.js', 'profit-backfill.js', 'poshmark.js'],
  amazon: ['config.example.js', 'theme-catalog.js', 'foundation.js', 'shared.js', 'control-heartbeat.js', 'profit-audit.js', 'profit-backfill.js', 'sniping-audit.js', 'subscribe-save.js', 'amazon.js']
});
const LOCAL_CONTROL_EXTENSION_PAGES = Object.freeze({
  popup: 'popup.html',
  onboarding: 'onboarding.html',
  guide: 'guide.html',
  variations: 'variation-audit.html',
  policyaudit: 'policy-listing-audit.html',
  preflight: 'listing-preflight.html'
});
const LOCAL_CONTROL_EXTENSION_ACTIONS = new Set([
  'health-check',
  'dashboard-test',
  'dashboard-retry',
  'dashboard-setup',
  'variation-scan',
  'policy-listing-scan',
  'listing-preflight-proof',
  'ecomsniper-handoff-proof',
  'sync-ebay-monthly-profit',
  'start-ebay-amazon-resolution',
  'set-amazon-profile-label',
  'seed-order-placement-audit',
  'start-order-placement-audit-amazon',
  'read-order-placement-audit',
  'resume-order-placement-audit-amazon'
]);
const LOCAL_CONTROL_STATE_KEYS = new Set([
  'settingsSchemaVersion',
  'computerLabel',
  'ebayAccountLabel',
  'gldnUiOpacity',
  'gldnUiTheme',
  'move99AccountSettings',
  'dashboardConfigurationStatus',
  'dashboardQueueSummary',
  'pendingMove99Run',
  'pendingVariationEndReview',
  'lastVariationEndResult',
  'variationEndLedger',
  'ebayPolicyListingScanState',
  'ebayPolicyListingAudit',
  'pendingPolicyListingEndReview',
  'lastPolicyListingEndResult',
  'pendingMarkShippedRun',
  'pendingSellerLevelScan',
  'pendingEbaySnapshotScan',
  'pendingReviewMonthlyLimits',
  'pendingAmazonSubscribeSaveRun',
  'lastAmazonSubscribeSaveResult',
  'poshmarkProfitBackfill',
  'lastSellerLevelCheck',
  'latestAccountHealth',
  'lastEbaySalesSnapshot',
  'latestEbaySnapshot',
  'lastListingLimitCheck',
  'latestListingStatus',
  'lastPoshmarkStats',
  'latestPoshmarkStats',
  'latestPoshmarkVisibleSales',
  'latestMarketplaceProfit',
  'ebayMonthlyProfit',
  'amazonProfileLabel',
  'orderPlacementAuditAmazonScan',
  'lastPreparedNote',
  'gldnErrorLog'
]);

function queryTabs(queryInfo = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(tabs || []);
    });
  });
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const error = chrome.runtime.lastError;
      if (error || !tab) reject(new Error(error?.message || 'The requested Profile 2 tab is no longer open.'));
      else resolve(tab);
    });
  });
}

function sendTabMessage(tabId, message, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutMs = Math.max(1000, Math.min(600000, Number(options.timeoutMs || 12000)));
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('The Profile 2 page did not answer the background request before the safety timeout.'));
    }, timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const error = chrome.runtime.lastError;
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(new Error(error.message));
        else resolve(response || { ok: true });
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    }
  });
}

function focusChromeWindow(windowId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(windowId) || !chrome.windows?.update) {
      resolve(false);
      return;
    }
    chrome.windows.update(windowId, { focused: true }, () => {
      const error = chrome.runtime.lastError;
      resolve(!error);
    });
  });
}

function controlDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function controlPlatformForUrl(value) {
  const raw = String(value || '');
  const ownExtensionPrefix = `chrome-extension://${chrome.runtime.id}/`;
  if (raw.toLowerCase().startsWith(ownExtensionPrefix.toLowerCase())) return 'gldn';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol === 'https:' && (
    host === 'script.google.com'
    || host.endsWith('.script.google.com')
    || host === 'script.googleusercontent.com'
    || host.endsWith('.script.googleusercontent.com')
  )) return 'dashboard';
  if (host === 'ebay.com' || host.endsWith('.ebay.com')) return 'ebay';
  if (host === 'amazon.com' || host.endsWith('.amazon.com')) return 'amazon';
  if (host === 'poshmark.com' || host.endsWith('.poshmark.com')) return 'poshmark';
  if (host === 'ecomsniper.io' || host.endsWith('.ecomsniper.io')) return 'ecomsniper';
  if (host === 'rumble.com' || host.endsWith('.rumble.com')) return 'tutorial';
  return '';
}

function assertSafeControlUrl(value) {
  const url = new URL(String(value || ''));
  const platform = controlPlatformForUrl(url.href);
  if (url.protocol !== 'https:' || !LOCAL_CONTROL_PLATFORM[platform]) {
    throw new Error('Local control can only open approved HTTPS marketplace pages.');
  }
  return url;
}

function redactControlUrl(value, platform = controlPlatformForUrl(value)) {
  const raw = String(value || '');
  if (platform !== 'dashboard') return raw.slice(0, 2000);
  try {
    const url = new URL(raw);
    for (const key of ['key', 'token', 'code', 'secret']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, 'REDACTED');
    }
    return url.toString().slice(0, 2000);
  } catch {
    return '';
  }
}

function controlUrlsEqual(left, right) {
  try {
    const leftUrl = new URL(String(left || ''));
    const rightUrl = new URL(String(right || ''));
    leftUrl.hash = '';
    rightUrl.hash = '';
    return leftUrl.href === rightUrl.href;
  } catch {
    return false;
  }
}

async function waitForControlTabSettled(tabId, timeoutMs = 15000) {
  const deadline = Date.now() + Math.max(1000, Math.min(30000, Number(timeoutMs || 15000)));
  let tab = await getTab(tabId);
  while (tab.status !== 'complete' && Date.now() < deadline) {
    await controlDelay(250);
    tab = await getTab(tabId);
  }
  return tab;
}

function verifiedControlTab(tab, requestedUrl = '') {
  const summary = controlTabSummary(tab);
  return {
    tab: summary,
    verification: {
      allowedTarget: Boolean(summary.platform),
      target: summary.platform,
      loaded: summary.status === 'complete',
      exactUrl: requestedUrl ? controlUrlsEqual(tab?.url, requestedUrl) : true
    }
  };
}

function controlTabSummary(tab) {
  const platform = controlPlatformForUrl(tab?.url);
  return {
    id: Number.isInteger(tab?.id) ? tab.id : null,
    windowId: Number.isInteger(tab?.windowId) ? tab.windowId : null,
    active: Boolean(tab?.active),
    audible: Boolean(tab?.audible),
    discarded: Boolean(tab?.discarded),
    status: String(tab?.status || ''),
    title: String(tab?.title || '').slice(0, 300),
    url: redactControlUrl(tab?.url, platform),
    platform,
    lastAccessed: Number(tab?.lastAccessed || 0)
  };
}

async function resolveControlTab(payload = {}, requiredPlatform = '') {
  let tab = null;
  if (Number(payload.tabId) > 0) {
    try {
      tab = await getTab(Number(payload.tabId));
    } catch (error) {
      if (!/No tab with id|no longer open/i.test(String(error?.message || error))) throw error;
    }
  }
  if (!tab) {
    const platform = String(requiredPlatform || payload.platform || '').toLowerCase();
    const config = LOCAL_CONTROL_PLATFORM[platform];
    if (!config) throw new Error('A supported Profile 2 marketplace platform is required.');
    const requestedUrl = payload.url ? assertSafeControlUrl(payload.url).href : '';
    const candidates = (await queryTabs({ url: config.patterns }))
      .filter((candidate) => Number.isInteger(candidate?.id))
      .filter((candidate) => !requestedUrl || controlUrlsEqual(candidate.url, requestedUrl));
    if (candidates.length !== 1) {
      throw new Error(requestedUrl
        ? `Profile 2 has ${candidates.length} exact tabs for the requested URL.`
        : `Profile 2 has ${candidates.length} ${platform} tabs. An exact URL is required.`);
    }
    tab = candidates[0];
  }
  const platform = controlPlatformForUrl(tab?.url);
  if (!platform || (requiredPlatform && platform !== requiredPlatform)) {
    throw new Error(`The requested Profile 2 ${requiredPlatform || 'marketplace'} tab is not open.`);
  }
  return tab;
}

async function inspectLocalControlSession() {
  const [tabs, workflowStatus, stored] = await Promise.all([
    queryTabs({}),
    activeWorkflowStatus(),
    storageGet(['computerLabel', 'ebayAccountLabel', 'gldnOpenReviews'])
  ]);
  const marketplaceTabs = tabs
    .map(controlTabSummary)
    .filter((tab) => Boolean(tab.platform))
    .sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0));
  return {
    ok: true,
    runtimeVersion: EXTENSION_VERSION,
    profileLock: 'Profile 2',
    identity: {
      computerLabel: normalizeComputer(stored.computerLabel),
      ebayAccountLabel: String(stored.ebayAccountLabel || '')
    },
    workflowStatus,
    openReviews: Object.values(stored.gldnOpenReviews || {}).map((review) => ({
      label: String(review?.label || ''),
      page: String(review?.page || ''),
      phase: String(review?.phase || ''),
      openedAt: String(review?.openedAt || '')
    })),
    tabs: marketplaceTabs
  };
}

async function openLocalControlUrl(payload = {}) {
  const url = assertSafeControlUrl(payload.url);
  const existing = payload.reuse === false
    ? []
    : (await queryTabs({ url: `${url.origin}${url.pathname}*` })).filter((tab) => String(tab.url || '').split('#')[0] === url.href.split('#')[0]);
  let tab = existing.sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0];
  if (!tab) tab = await createChromeTab({ url: url.href, active: payload.active !== false });
  else if (payload.active !== false) tab = await updateChromeTab(tab.id, { active: true });
  if (payload.active !== false) await focusChromeWindow(tab.windowId);
  tab = await waitForControlTabSettled(tab.id, payload.timeoutMs);
  return { ok: true, reused: existing.length > 0, ...verifiedControlTab(tab, url.href) };
}

async function navigateLocalControlTab(payload = {}) {
  const url = assertSafeControlUrl(payload.url);
  const tab = await resolveControlTab(payload);
  let updated = await updateChromeTab(tab.id, { url: url.href, active: payload.active !== false });
  if (payload.active !== false) await focusChromeWindow(updated.windowId);
  updated = await waitForControlTabSettled(updated.id, payload.timeoutMs);
  return { ok: true, ...verifiedControlTab(updated, url.href) };
}

async function focusLocalControlTab(payload = {}) {
  const tab = await resolveControlTab(payload);
  const updated = await updateChromeTab(tab.id, { active: true });
  await focusChromeWindow(updated.windowId);
  return { ok: true, ...verifiedControlTab(updated) };
}

function poshmarkBackfillReviewRunIdFromUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (controlPlatformForUrl(url.href) !== 'poshmark') return '';
    if (url.pathname.replace(/\/+$/, '').toLowerCase() !== '/order/sales') return '';
    return String(url.searchParams.get('gldn_backfill_review') || '').trim();
  } catch {
    return '';
  }
}

async function exactPoshmarkReviewReloadPolicy(tab, status) {
  const reviewWorkflows = status.workflows.filter((entry) => String(entry?.key || '').startsWith('gldnOpenReviews:'));
  const backfillWorkflows = status.workflows.filter((entry) => entry?.key === 'poshmarkProfitBackfill');
  const exactWorkflowGate = status.workflows.length === 2
    && reviewWorkflows.length === 1
    && reviewWorkflows[0]?.phase === 'review-open'
    && backfillWorkflows.length === 1
    && backfillWorkflows[0]?.phase === 'review';
  if (!exactWorkflowGate) return null;

  const stored = await storageGet(['poshmarkProfitBackfill', 'gldnOpenReviews']);
  const run = stored.poshmarkProfitBackfill;
  const compact = FOUNDATION.compactPoshmarkProfitBackfillControlRecord(run);
  const runId = String(run?.runId || '').trim();
  const tabRunId = poshmarkBackfillReviewRunIdFromUrl(tab?.url);
  const sales = Array.isArray(run?.sales) ? run.sales : [];
  const results = Array.isArray(run?.results) ? run.results : [];
  const errors = Array.isArray(run?.errors) ? run.errors : [];
  const requiredApprovalCount = Number(compact?.requiredApprovalCount || 0);
  const exactCheckpoint = run?.phase === 'review'
    && run?.active !== true
    && run?.stopRequested !== true
    && runId
    && tabRunId === runId
    && Number(run?.workerTabId || 0) === Number(tab?.id || 0)
    && sales.length > 0
    && results.length === sales.length
    && sales.every((sale) => Boolean(sale?.detailCapturedAt))
    && compact?.approvalRequired === true
    && requiredApprovalCount > 0
    && requiredApprovalCount === Number(compact?.remainingReviewToSync || 0)
    && errors.length === 0;
  if (!exactCheckpoint) return null;

  const now = Date.now();
  const liveReviews = Object.entries(stored.gldnOpenReviews || {}).filter(([, review]) => (
    review?.active === true && Number(review?.expiresAt || 0) > now
  ));
  const exactReviews = liveReviews.filter(([, review]) => (
    Number(review?.ownerTabId || 0) === Number(tab?.id || 0)
      && controlUrlsEqual(review?.page, tab?.url)
  ));
  if (liveReviews.length !== 1 || exactReviews.length !== 1) return null;

  return {
    runId,
    requiredApprovalCount,
    salesIndexed: sales.length,
    resultsIndexed: results.length,
    reviewToken: exactReviews[0][0]
  };
}

async function assertSafeLocalControlTabReload(tab) {
  const status = await activeWorkflowStatus();
  if (!status.busy) return { status, reinjectMove99: false };
  const poshmarkReview = await exactPoshmarkReviewReloadPolicy(tab, status);
  if (poshmarkReview) {
    return { status, reinjectMove99: false, recoverPoshmarkReview: poshmarkReview };
  }
  const exactMove99Gate = status.workflows.length === 1
    && status.workflows[0]?.key === 'pendingMove99Run'
    && status.workflows[0]?.phase === 'awaiting-submit-approval';
  if (!exactMove99Gate) {
    throw new Error(workflowBlockerMessage('Reloading the Profile 2 marketplace tab', status.workflows));
  }

  const stored = await storageGet(['pendingMove99Run']);
  const pending = stored.pendingMove99Run;
  const expectedCount = Number(pending?.currentBatchCount || 0);
  const batchIds = [...new Set((pending?.currentBatchIds || []).map(String).filter(Boolean))];
  const workspaceId = String(pending?.approvalWorkspaceId || '');
  const exactBatch = pending?.reviewReady === true
    && expectedCount > 0
    && batchIds.length === expectedCount
    && Number(pending?.categoryUpdate?.attempted || 0) === expectedCount
    && Number(pending?.categoryUpdate?.updated || 0) === expectedCount;
  const exactApprovalTab = exactBatch
    && Number(pending?.approvalTabId || 0) === Number(tab?.id || 0)
    && controlUrlsEqual(tab?.url, pending?.approvalUrl)
    && isExactMove99ReviewUrl(tab?.url, workspaceId);

  let exactRecoveredTab = false;
  if (exactBatch && !exactApprovalTab) {
    const sourceIds = [...new Set((pending?.sourceStoreCategoryIds || []).map(String).filter(Boolean))];
    const allTabs = await queryTabs({});
    const openIds = new Set(allTabs.map((entry) => Number(entry?.id || 0)).filter(Boolean));
    const liveSourceWorkspaces = allTabs.filter((entry) => {
      if (entry?.discarded || entry?.status !== 'complete') return false;
      try {
        const outer = new URL(String(entry?.url || ''));
        if (controlPlatformForUrl(outer.href) !== 'ebay'
            || outer.pathname.replace(/\/+$/, '').toLowerCase() !== '/bulksell'
            || !outer.searchParams.get('workspaceId')) return false;
        const returnUrl = new URL(outer.searchParams.get('ru') || '');
        const storeCategoryIds = String(returnUrl.searchParams.get('storeCatIds') || '');
        return sourceIds.length > 0 && sourceIds.every((id) => storeCategoryIds.includes(id));
      } catch {
        return false;
      }
    });
    const recoveredTab = liveSourceWorkspaces.length === 1 ? liveSourceWorkspaces[0] : null;
    exactRecoveredTab = Boolean(recoveredTab)
      && Number(recoveredTab?.id || 0) === Number(tab?.id || 0)
      && controlUrlsEqual(recoveredTab?.url, pending?.approvalUrl)
      && isExactMove99ReviewUrl(recoveredTab?.url, workspaceId)
      && !openIds.has(Number(pending?.approvalTabId || 0))
      && !openIds.has(Number(pending?.ownerTabId || 0));
    if (exactRecoveredTab) {
      const reboundAt = new Date().toISOString();
      await storageSet({
        pendingMove99Run: {
          ...pending,
          previousOwnerTabId: Number(pending?.ownerTabId || 0) || null,
          previousApprovalTabId: Number(pending?.approvalTabId || 0) || null,
          ownerTabId: Number(tab.id),
          approvalTabId: Number(tab.id),
          reviewRecoveryEvidence: {
            ...(pending?.reviewRecoveryEvidence || {}),
            reboundTabId: Number(tab.id),
            controlReboundAt: reboundAt
          },
          localControlReviewReboundAt: reboundAt,
          updatedAt: reboundAt
        }
      });
    }
  }

  if (!exactApprovalTab && !exactRecoveredTab) {
    throw new Error(workflowBlockerMessage('Reloading the Profile 2 marketplace tab', status.workflows));
  }
  return { status, reinjectMove99: true };
}

async function reloadLocalControlTab(payload = {}) {
  const tab = await resolveControlTab(payload);
  if (/\/sh\/lst\/active(?:[/?#]|$)/i.test(String(tab.url || ''))) {
    await updateChromeTab(tab.id, { autoDiscardable: false });
  }
  const policy = await assertSafeLocalControlTabReload(tab);
  if (policy.recoverPoshmarkReview) {
    const before = await storageGet(['poshmarkProfitBackfill']);
    const checkpointBefore = JSON.stringify(before.poshmarkProfitBackfill || null);
    const release = await updateOpenReviews((reviews) => {
      let released = 0;
      for (const [token, review] of Object.entries(reviews)) {
        if (Number(review?.ownerTabId || 0) !== Number(tab.id)) continue;
        if (!controlUrlsEqual(review?.page, tab?.url)) continue;
        delete reviews[token];
        released += 1;
      }
      return { ok: released === 1, released };
    });
    if (!release?.ok) {
      throw new Error('The exact frozen Poshmark review window could not be isolated for recovery. No checkpoint data was changed.');
    }
    const reloaded = await new Promise((resolve, reject) => {
      chrome.tabs.reload(tab.id, {}, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(true);
      });
    });
    const settled = await waitForControlTabSettled(tab.id, payload.timeoutMs);
    const after = await storageGet(['poshmarkProfitBackfill']);
    const checkpointPreserved = checkpointBefore === JSON.stringify(after.poshmarkProfitBackfill || null);
    if (!checkpointPreserved) {
      throw new Error('The Poshmark checkpoint changed during review recovery. The page was refreshed, but no sync was requested.');
    }
    return {
      ok: reloaded,
      recoveredReview: true,
      checkpointPreserved,
      recovery: {
        runId: policy.recoverPoshmarkReview.runId,
        requiredApprovalCount: policy.recoverPoshmarkReview.requiredApprovalCount,
        salesIndexed: policy.recoverPoshmarkReview.salesIndexed,
        resultsIndexed: policy.recoverPoshmarkReview.resultsIndexed,
        releasedReviewCount: release.released
      },
      ...verifiedControlTab(settled)
    };
  }
  if (policy.reinjectMove99) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        document.getElementById('gldn-ebay-order-panel')?.remove();
        document.getElementById('gldn-move99-preview')?.remove();
        delete globalThis.__GLDN_EBAY_ORDER_ASSISTANT__;
        delete globalThis.GLDN_FOUNDATION;
        delete globalThis.OrderNoteUtils;
        delete globalThis.GLDN_PROFIT_AUDIT;
        delete globalThis.GLDN_SNIPING_AUDIT;
      }
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        'config.example.js',
        'theme-catalog.js',
        'foundation.js',
        'shared.js',
        'control-heartbeat.js',
        'profit-audit.js',
        'sniping-audit.js',
        'ebay.js'
      ]
    });
    const rebound = await getTab(tab.id);
    return { ok: true, reloaded: false, reinjected: true, ...verifiedControlTab(rebound) };
  }
  const reloaded = await new Promise((resolve, reject) => {
    chrome.tabs.reload(tab.id, {}, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(true);
    });
  });
  const settled = await waitForControlTabSettled(tab.id, payload.timeoutMs);
  return { ok: reloaded, ...verifiedControlTab(settled) };
}

async function inspectLocalControlTab(payload = {}) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) throw new Error('A valid Profile 2 tab ID is required.');
  const tab = await getTab(tabId);
  const result = verifiedControlTab(tab);
  if (!result.verification.allowedTarget) {
    throw new Error('The requested tab is not an approved GLDN Ops, dashboard, or marketplace target.');
  }
  if (result.verification.target === 'tutorial') {
    return inspectLocalControlTutorialVideo({ tabId });
  }
  return { ok: true, ...result };
}

async function inspectLocalControlTutorialVideo(payload = {}) {
  const tab = await resolveControlTab(payload, 'tutorial');
  if (payload.url && !controlUrlsEqual(tab.url, assertSafeControlUrl(payload.url).href)) {
    throw new Error('The recovered Profile 2 tutorial tab no longer matches the exact requested URL.');
  }
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',
    func: async () => {
      const media = Array.from(document.querySelectorAll('video, audio, source'))
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName,
          src: element.getAttribute('src') || '',
          currentSrc: element.currentSrc || '',
          type: element.getAttribute('type') || '',
          poster: element.getAttribute('poster') || '',
          duration: Number.isFinite(element.duration) ? element.duration : null,
          readyState: Number.isFinite(element.readyState) ? element.readyState : null
        }));
      const resources = performance.getEntriesByType('resource')
        .map((entry) => String(entry.name || ''))
        .filter((url) => /(?:\.mp4(?:$|\?)|\.m3u8(?:$|\?)|\.webm(?:$|\?)|rumble\.com\/embed|rumble\.com\/video|rmbl\.ws)/i.test(url))
        .slice(-100);
      return {
        title: document.title,
        url: location.href,
        media,
        resources
      };
    }
  });
  return {
    ok: true,
    tab: controlTabSummary(tab),
    video: injected?.[0]?.result || null
  };
}

async function inspectLocalControlAmazonSubscribeSave(payload = {}) {
  const tab = await resolveControlTab(payload, 'amazon');
  if (payload.url && !controlUrlsEqual(tab.url, assertSafeControlUrl(payload.url).href)) {
    throw new Error('The recovered Profile 2 Amazon tab no longer matches the requested URL.');
  }
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',
    func: () => {
      const visible = (element) => {
        if (!(element instanceof Element)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
      };
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const descriptor = (element) => ({
        tag: element.tagName.toLowerCase(),
        id: String(element.id || '').slice(0, 160),
        className: clean(element.className).slice(0, 300),
        text: clean(element.innerText || element.textContent).slice(0, 500),
        href: String(element.href || element.getAttribute?.('href') || '').slice(0, 800),
        role: String(element.getAttribute?.('role') || ''),
        ariaLabel: clean(element.getAttribute?.('aria-label')).slice(0, 240),
        dataAsin: clean(element.getAttribute?.('data-asin')).slice(0, 40)
      });
      const controls = [...document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')]
        .filter(visible)
        .map(descriptor)
        .filter((entry) => /subscription|subscribe|delivery|deliver to|address|edit|cancel/i.test(`${entry.text} ${entry.ariaLabel} ${entry.href}`))
        .slice(0, 250);
      const headings = [...document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')]
        .filter(visible)
        .map(descriptor)
        .slice(0, 100);
      const identifiers = [...document.querySelectorAll('[data-asin], [data-subscription-id], [data-testid], [id*="subscription" i], [class*="subscription" i]')]
        .filter(visible)
        .map(descriptor)
        .slice(0, 250);
      return {
        title: document.title,
        url: location.href,
        bodySignals: clean(document.body?.innerText).slice(0, 12000),
        headings,
        controls,
        identifiers
      };
    }
  });
  return {
    ok: true,
    tab: controlTabSummary(tab),
    subscribeSave: injected?.[0]?.result || null
  };
}

async function inspectLocalControlEbayVariations(payload = {}) {
  const requestedUrl = payload.url ? assertSafeControlUrl(payload.url) : null;
  const compatibilityApproval = String(requestedUrl?.searchParams?.get('gldnVariationApproval') || '').trim();
  if (compatibilityApproval) {
    if (!/^APPROVE END VARIATIONS [1-9]\d*$/.test(compatibilityApproval)) {
      throw new Error('Variation ending requires the exact live-count approval token.');
    }
    // Confirm the approved tab still belongs to eBay, then let the submit
    // path validate the exact saved Active Listings or Bulk Edit review URL.
    await resolveControlTab({ tabId: payload.tabId }, 'ebay');
    return submitEbayVariationEndReview({ confirmationToken: compatibilityApproval });
  }
  const compatibilityIds = String(requestedUrl?.searchParams?.get('gldnVariationIds') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (compatibilityIds.length) {
    const tab = await resolveControlTab({ tabId: payload.tabId }, 'ebay');
    if (!/\/sh\/lst\/active(?:[/?#]|$)/i.test(String(tab.url || ''))) {
      throw new Error('The variation end review requires eBay Seller Hub Active Listings.');
    }
    return prepareLocalControlVariationEndReview({
      itemIds: compatibilityIds,
      selectedTotal: Number(requestedUrl.searchParams.get('gldnVariationTotal') || compatibilityIds.length),
      reportFingerprint: requestedUrl.searchParams.get('gldnVariationFingerprint') || '',
      reportName: requestedUrl.searchParams.get('gldnVariationReport') || ''
    });
  }
  const tab = await resolveControlTab(payload, 'ebay');
  if (requestedUrl && !controlUrlsEqual(tab.url, requestedUrl.href)) {
    throw new Error('The recovered Profile 2 eBay tab no longer matches the requested URL.');
  }
  if (!/\/sh\/lst\/active(?:[/?#]|$)/i.test(String(tab.url || ''))) {
    throw new Error('The variation audit requires eBay Seller Hub Active Listings.');
  }
  await updateChromeTab(tab.id, { autoDiscardable: false });
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',
    func: async () => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = (element) => {
        if (!(element instanceof Element)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
      };
      const itemIdFromRow = (row) => {
        const text = clean(row?.innerText || row?.textContent);
        const explicit = text.match(/Buy It Now\s*[\u00b7\u2022-]?\s*(\d{11,14})/i);
        if (explicit) return explicit[1];
        const matches = [...text.matchAll(/\b(\d{11,14})\b/g)].map((match) => match[1]);
        return matches.at(-1) || '';
      };
      const titleFromRow = (row) => [...row.querySelectorAll('a')]
        .filter(visible)
        .map((anchor) => clean(anchor.innerText || anchor.textContent))
        .find((text) => text.length >= 8 && !/^(edit|restock|research prices|add or review discounts)$/i.test(text)) || '';
      const rowCandidates = [...document.querySelectorAll('tr, [role="row"]')].filter(visible);
      const records = [];
      const seen = new Set();
      for (const row of rowCandidates) {
        const text = clean(row.innerText || row.textContent);
        if (!/Buy It Now/i.test(text)) continue;
        const itemId = itemIdFromRow(row);
        if (!itemId || seen.has(itemId)) continue;
        seen.add(itemId);
        const metadata = clean([
          ...[row, ...row.querySelectorAll('[aria-label], [data-testid], [data-variation], [class*="variation" i], a[href]')]
            .flatMap((element) => [
              element.getAttribute?.('aria-label'),
              element.getAttribute?.('data-testid'),
              element.getAttribute?.('data-variation'),
              element.getAttribute?.('class'),
              element.getAttribute?.('href')
            ])
        ].filter(Boolean).join(' '));
        const priceRange = text.match(/\$\s*[\d,]+\.\d{2}\s*(?:-|to|\u2013|\u2014)\s*\$\s*[\d,]+\.\d{2}/i)?.[0] || '';
        const textSignal = /\bvariations?\b/i.test(text);
        const metadataSignal = /\bvariations?\b/i.test(metadata);
        records.push({
          itemId,
          title: titleFromRow(row),
          variation: Boolean(textSignal || metadataSignal || priceRange),
          signals: [textSignal ? 'row-text' : '', metadataSignal ? 'metadata' : '', priceRange ? 'price-range' : ''].filter(Boolean),
          priceRange,
          rowText: text.slice(0, 350)
        });
      }
      const body = clean(document.body?.innerText);
      const range = body.match(/Results?:\s*([\d,]+)\s*[-\u2012\u2013\u2014]\s*([\d,]+)\s+of\s+([\d,]+)/i);
      const page = body.match(/\bPage\s*(\d+)\s*\/\s*(\d+)\b/i);
      const controls = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"]')]
        .filter(visible)
        .map((element) => ({
          text: clean(element.innerText || element.textContent).slice(0, 250),
          ariaLabel: clean(element.getAttribute('aria-label')).slice(0, 250),
          href: String(element.getAttribute('href') || element.href || '').slice(0, 500),
          testId: String(element.getAttribute('data-testid') || '').slice(0, 250)
        }))
        .filter((entry) => /variation|download|customize|filter/i.test(`${entry.text} ${entry.ariaLabel} ${entry.href} ${entry.testId}`))
        .slice(0, 30);
      const controlByText = (label) => [...document.querySelectorAll('button, a, [role="button"]')]
        .filter(visible)
        .find((element) => clean(element.innerText || element.textContent).toLowerCase() === label.toLowerCase());
      const visibleActionDescriptors = () => [...document.querySelectorAll('a, button, [role="menuitem"], [role="option"], li')]
        .filter(visible)
        .map((element) => ({
          text: clean(element.innerText || element.textContent).slice(0, 250),
          ariaLabel: clean(element.getAttribute('aria-label')).slice(0, 250),
          href: String(element.getAttribute('href') || element.href || '').slice(0, 500),
          role: String(element.getAttribute('role') || ''),
          testId: String(element.getAttribute('data-testid') || '').slice(0, 250)
        }))
        .filter((entry) => entry.text || entry.ariaLabel)
        .slice(0, 300);
      const uniqueDescriptors = (entries, limit = 20) => {
        const keys = new Set();
        return entries.filter((entry) => {
          const key = JSON.stringify(entry);
          if (keys.has(key)) return false;
          keys.add(key);
          return true;
        }).slice(0, limit);
      };

      let downloadMenu = [];
      const downloadControl = controlByText('Download');
      if (downloadControl) {
        downloadControl.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        downloadMenu = uniqueDescriptors(visibleActionDescriptors()
          .filter((entry) => /download|listing|report|csv|variation/i.test(`${entry.text} ${entry.ariaLabel} ${entry.href} ${entry.testId}`)), 20);
        downloadControl.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      let filtersPanel = { text: '', variationSignals: [], variationControls: [] };
      const allFiltersControl = controlByText('All filters');
      if (allFiltersControl) {
        allFiltersControl.click();
        await new Promise((resolve) => setTimeout(resolve, 700));
        const filterElements = [...document.querySelectorAll('[role="dialog"], aside, [class*="filter" i], [data-testid*="filter" i]')]
          .filter(visible);
        const filterTexts = [...new Set(filterElements
          .map((element) => clean(element.innerText || element.textContent))
          .filter(Boolean))]
          .sort((left, right) => right.length - left.length);
        const variationSignals = [...new Set(filterElements
          .flatMap((element) => String(element.innerText || element.textContent || '').split(/\r?\n/))
          .map(clean)
          .filter((line) => /variation/i.test(line)))]
          .map((line) => line.slice(0, 300))
          .slice(0, 30);
        filtersPanel = {
          text: String(filterTexts[0] || '').slice(0, 8000),
          variationSignals,
          variationControls: uniqueDescriptors(visibleActionDescriptors()
            .filter((entry) => /variation/i.test(`${entry.text} ${entry.ariaLabel} ${entry.href} ${entry.testId}`)), 20)
        };
        const close = [...document.querySelectorAll('button, [role="button"]')]
          .filter(visible)
          .find((element) => /^close$/i.test(clean(element.getAttribute('aria-label') || element.innerText || element.textContent)));
        if (close) close.click();
      }
      return {
        title: document.title,
        url: location.href,
        bodySignals: clean(document.body?.innerText || document.body?.textContent).slice(0, 12000),
        results: range ? {
          start: Number(range[1].replace(/,/g, '')),
          end: Number(range[2].replace(/,/g, '')),
          total: Number(range[3].replace(/,/g, ''))
        } : null,
        page: page ? { current: Number(page[1]), total: Number(page[2]) } : null,
        rowsRead: records.length,
        variationCount: records.filter((record) => record.variation).length,
        records: records.filter((record) => record.variation),
        sampleRows: records.slice(0, 5),
        controls,
        downloadMenu,
        filtersPanel
      };
    }
  });
  return {
    ok: true,
    tab: controlTabSummary(tab),
    variations: injected?.[0]?.result || null
  };
}

async function closeLocalControlTab(payload = {}) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) throw new Error('A valid Profile 2 tab ID is required.');
  const tab = await getTab(tabId);
  const summary = controlTabSummary(tab);
  if (!['gldn', 'dashboard'].includes(summary.platform)) {
    throw new Error('Local cleanup can close only GLDN Ops or dashboard tabs.');
  }
  await closeChromeTab(tabId);
  return { ok: true, closed: true, tab: summary };
}

async function openLocalControlExtensionPage(payload = {}) {
  const page = String(payload.page || '').toLowerCase();
  const path = LOCAL_CONTROL_EXTENSION_PAGES[page];
  if (!path) throw new Error('The requested GLDN Ops page is not on the approved page list.');
  const url = chrome.runtime.getURL(path);
  const existing = (await queryTabs({})).filter((tab) => controlUrlsEqual(tab?.url, url));
  let tab = existing.sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0];
  if (!tab) tab = await createChromeTab({ url, active: payload.active !== false });
  else if (payload.active !== false) tab = await updateChromeTab(tab.id, { active: true });
  if (payload.active !== false) await focusChromeWindow(tab.windowId);
  tab = await waitForControlTabSettled(tab.id, payload.timeoutMs);
  const result = verifiedControlTab(tab, url);
  if (result.verification.target !== 'gldn' || !result.verification.exactUrl) {
    throw new Error(`Chrome did not land on the approved GLDN Ops extension page (${result.verification.target || 'unknown'}: ${result.tab.url || 'no URL'}).`);
  }
  return { ok: true, page, reused: existing.length > 0, ...result };
}

async function runLocalControlListingPreflight(payload = {}) {
  const input = [
    'https://www.amazon.com/Acme-Stainless-Steel-Measuring-Spoons/dp/B012345678',
    'https://www.amazon.com/Baby-Nest-Portable-Lounger/dp/B0REVIEW01',
    'https://www.amazon.com/Fresh-Ackee-Fruit-Pack/dp/B0BLOCK001'
  ].join('\n');
  if (!LISTING_PREFLIGHT) throw new Error('Listing Preflight did not load.');

  const ruleResponse = await fetch(chrome.runtime.getURL('listing-preflight-rules.json'), { cache: 'no-store' });
  if (!ruleResponse.ok) throw new Error(`Listing Preflight rules returned ${ruleResponse.status}.`);
  const rulePack = LISTING_PREFLIGHT.normalizeRulePack(await ruleResponse.json());
  const rows = LISTING_PREFLIGHT.parseInputRows(input);
  if (!rows.length) throw new Error('Listing Preflight did not find any usable rows.');
  const results = LISTING_PREFLIGHT.evaluateRows(rows, rulePack);
  const summary = LISTING_PREFLIGHT.summarizeResults(results);
  const readyPayload = LISTING_PREFLIGHT.copyAmazonLinkPayload(results, 'clear');

  await storageSet({
    pendingListingPreflightInput: {
      input,
      source: 'bulk-poster-clipboard',
      candidateCount: rows.length,
      originalCount: rows.length,
      rejectedCount: 0,
      createdAt: new Date().toISOString()
    }
  });
  const opened = await openLocalControlExtensionPage({ page: 'preflight', active: payload.active !== false });
  if (opened.reused) {
    await reloadChromeTab(opened.tab.id);
    await waitForControlTabSettled(opened.tab.id, 20000);
  }
  await new Promise((resolve) => setTimeout(resolve, 800));

  const pageCommand = async (action) => {
    const token = globalThis.crypto?.randomUUID?.() || `preflight-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let lastError = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'gldnListingPreflightDiagnostic',
            targetTabId: opened.tab.id,
            token,
            action
          }, (result) => {
            const error = chrome.runtime.lastError;
            if (error) reject(new Error(error.message));
            else resolve(result);
          });
        });
        if (response?.ok && response.token === token && Number(response.tabId) === Number(opened.tab.id)) return response;
        if (response?.error) throw new Error(response.error);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(lastError?.message || 'The visible Listing Preflight page did not answer its diagnostic request.');
  };

  let pageResult = await pageCommand('inspect');
  let ui = pageResult.ui || null;
  const uiSummaryMatches = Boolean(ui)
    && ui.total === summary.total
    && ui.clear === summary.clear
    && ui.review === summary.review
    && ui.block === summary.block;
  if (!uiSummaryMatches) throw new Error('The visible Listing Preflight result did not match the independent rule-engine result.');

  let handoff = null;
  if (payload.openHandoff !== false) {
    if (!readyPayload) throw new Error('Listing Preflight has no Ready Amazon link to hand off.');
    pageResult = await pageCommand('handoff');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    ui = pageResult.ui || null;
    const handoffState = (await storageGet(['ecomSniperHandoffStatus'])).ecomSniperHandoffStatus || null;
    const newestHandoff = handoffState?.pageKey === 'bulkPoster' && Number.isInteger(Number(handoffState?.tabId))
      ? await getTab(Number(handoffState.tabId)).catch(() => null)
      : null;
    const rendered = Boolean(newestHandoff)
      && ecomSniperPageRendered('bulkPoster', newestHandoff, handoffState?.url || '');
    handoff = {
      opened: rendered,
      tab: newestHandoff ? controlTabSummary(newestHandoff) : null,
      path: String(handoffState?.pagePath || ''),
      renderVerified: rendered,
      copyStatus: ui?.copyStatus || ''
    };
    if (!handoff.opened || !/opened Bulk Poster/i.test(handoff.copyStatus)) {
      throw new Error('Listing Preflight did not confirm the Ready-only Bulk Poster handoff.');
    }
  }

  return {
    ok: true,
    ruleCount: rulePack.ruleCount,
    summary,
    readyPayload,
    results: results.map((result) => ({
      input: result.input,
      status: result.status === 'CLEAR' ? 'READY' : result.status,
      reason: result.reason,
      canonicalAmazonUrl: LISTING_PREFLIGHT.canonicalAmazonProductUrl(result)
    })),
    page: opened.tab,
    ui,
    uiSummaryMatches,
    handoff
  };
}

async function runLocalControlEcomSniperHandoffProof() {
  const proofDwellMs = 1800;
  const scanner = await openEcomSniperPage('competitorScanner');
  if (!scanner?.ok || !Number.isInteger(scanner.tabId)) {
    throw new Error(scanner?.error || 'EcomSniper Competitor Scanner did not open.');
  }
  const scannerTab = await waitForControlTabSettled(scanner.tabId, 20000);
  const scannerUrl = String(scanner.url || '');
  if (!scanner.renderVerified || !ecomSniperPageRendered('competitorScanner', scannerTab, scannerUrl)) {
    await closeChromeTab(scanner.tabId).catch(() => {});
    throw new Error('The GLDN-opened Competitor Scanner did not render its expected page.');
  }
  await new Promise((resolve) => setTimeout(resolve, proofDwellMs));

  const productHunter = await openEcomSniperPage('productHunter');
  if (!productHunter?.ok || !Number.isInteger(productHunter.tabId)) {
    await closeChromeTab(scanner.tabId).catch(() => {});
    throw new Error(productHunter?.error || 'EcomSniper Product Hunter did not open.');
  }
  const productTab = await waitForControlTabSettled(productHunter.tabId, 20000);
  const productUrl = String(productHunter.url || '');
  if (!productHunter.renderVerified || !ecomSniperPageRendered('productHunter', productTab, productUrl)) {
    await closeChromeTab(productHunter.tabId).catch(() => {});
    await closeChromeTab(scanner.tabId).catch(() => {});
    throw new Error('The GLDN-opened Product Hunter did not render its expected page.');
  }
  await new Promise((resolve) => setTimeout(resolve, proofDwellMs));

  const openedState = (await storageGet(['ecomSniperHandoffStatus'])).ecomSniperHandoffStatus || null;
  const stopped = await stopEcomSniperHandoff();
  const closedState = (await storageGet(['ecomSniperHandoffStatus'])).ecomSniperHandoffStatus || null;
  const scannerStillExact = await getTab(scanner.tabId).then((tab) => controlUrlsEqual(tab?.url, scannerUrl)).catch(() => false);
  if (scannerStillExact) await closeChromeTab(scanner.tabId);

  const passed = openedState?.state === 'open'
    && openedState?.pageKey === 'productHunter'
    && openedState?.observableScope === 'tab-lifecycle-only'
    && Number(openedState?.tabId) === Number(productHunter.tabId)
    && stopped?.ok === true
    && stopped?.closed === true
    && closedState?.state === 'closed'
    && closedState?.observableScope === 'tab-lifecycle-only';
  if (!passed) throw new Error('The EcomSniper handoff monitor did not preserve an exact tab-lifecycle-only result.');

  return {
    ok: true,
    scanner: {
      tabId: scanner.tabId,
      exactUrl: true,
      pagePath: scanner.pagePath,
      title: scanner.title,
      renderVerified: true,
      closedAfterProof: scannerStillExact
    },
    productHunter: {
      tabId: productHunter.tabId,
      exactUrl: true,
      pagePath: productHunter.pagePath,
      title: productHunter.title,
      renderVerified: true
    },
    monitor: {
      openedState: openedState.state,
      openedPage: openedState.pageKey,
      observableScope: openedState.observableScope,
      stoppedState: closedState.state,
      stoppedClosedOnlyGldnOpenedTab: true,
      privateProcessingClaimed: false
    },
    marketplaceActions: 0
  };
}

async function openLocalControlDashboard(payload = {}) {
  const opened = await openDashboardTab({ active: payload.active !== false });
  if (!Number.isInteger(opened?.tabId)) throw new Error('The dashboard did not return a Chrome tab ID.');
  const tab = await waitForControlTabSettled(opened.tabId, payload.timeoutMs || 20000);
  if (payload.active !== false) await focusChromeWindow(tab.windowId);
  const result = verifiedControlTab(tab, opened.url);
  if (result.verification.target !== 'dashboard') {
    throw new Error('The dashboard tab did not remain on the approved Google Apps Script host.');
  }
  return { ok: true, ...result };
}

async function runLocalControlExtensionAction(payload = {}) {
  const action = String(payload.action || '').toLowerCase();
  if (!LOCAL_CONTROL_EXTENSION_ACTIONS.has(action)) {
    throw new Error('The requested GLDN Ops action is not on the approved action list.');
  }
  if (action === 'health-check') {
    return { ok: true, action, result: await runExtensionHealthCheck() };
  }
  if (action === 'dashboard-test') {
    const result = await testDashboardConnection();
    if (!result.ok) throw new Error(result.error || 'Dashboard connection failed.');
    return { ok: true, action, result };
  }
  if (action === 'dashboard-retry') {
    const result = await processDashboardQueue({ force: true });
    if (!result?.ok) throw new Error(result?.error || 'Dashboard queue retry failed.');
    return { ok: true, action, result };
  }
  if (action === 'listing-preflight-proof') {
    return { ok: true, action, result: await runLocalControlListingPreflight(payload) };
  }
  if (action === 'ecomsniper-handoff-proof') {
    return { ok: true, action, result: await runLocalControlEcomSniperHandoffProof() };
  }
  if (action === 'start-ebay-amazon-resolution') {
    const monthKey = String(payload.monthKey || '').trim();
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthKey)) {
      throw new Error('The eBay Amazon-cost resolver requires a valid YYYY-MM month.');
    }
    const result = await startPoshmarkProfitBackfillGuarded({
      scope: 'resolve-ebay',
      monthKey,
      maxOrders: 100
    }, {});
    if (!result?.ok) throw new Error(result?.error || 'The eBay Amazon-cost resolver could not start.');
    return { ok: true, action, result };
  }
  if (action === 'set-amazon-profile-label') {
    const amazonProfileLabel = String(payload.amazonProfileLabel || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(amazonProfileLabel)) {
      throw new Error('The Amazon profile label must contain 1 to 64 letters, numbers, spaces, periods, underscores, or hyphens.');
    }
    await storageSet({ amazonProfileLabel });
    return { ok: true, action, result: { amazonProfileLabel } };
  }
  if (action === 'seed-order-placement-audit') {
    const monthKey = String(payload.monthKey || '').trim();
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthKey)) {
      throw new Error('The order-placement audit requires a valid YYYY-MM month.');
    }
    const stored = await storageGet(['ebayMonthlyProfit']);
    const result = await ORDER_AUDIT_BACKGROUND.seedExpectedFromMonthlyRun(
      stored.ebayMonthlyProfit || null,
      { monthKey, expectedProfiles: [] },
      { postToDashboard }
    );
    return { ok: true, action, result };
  }
  if (action === 'start-order-placement-audit-amazon') {
    const monthKey = String(payload.monthKey || '').trim();
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthKey)) {
      throw new Error('The order-placement audit requires a valid YYYY-MM month.');
    }
    const stored = await storageGet([
      'ebayMonthlyProfit',
      'computerLabel',
      'ebayAccountLabel',
      'amazonProfileLabel',
      'lastAmazonSubscribeSaveResult',
      'lastPreparedNote',
      'latestMarketplaceProfit'
    ]);
    const monthlyRun = stored.ebayMonthlyProfit || null;
    if (!monthlyRun || String(monthlyRun.phase || '') !== 'review' || String(monthlyRun.monthKey || '') !== monthKey) {
      throw new Error('Finish the selected Monthly eBay Profit read before scanning Amazon for this month.');
    }
    let amazonProfileLabel = String(stored.amazonProfileLabel || '').trim();
    if (!amazonProfileLabel) {
      const candidates = [
        stored.lastAmazonSubscribeSaveResult?.amazonProfileLabel,
        stored.lastPreparedNote?.payload?.profileLabel,
        stored.lastPreparedNote?.profitRecord?.supplierProfile,
        stored.latestMarketplaceProfit?.supplierProfile
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      const unique = [...new Map(candidates.map((value) => [value.toLowerCase(), value])).values()];
      if (unique.length !== 1) {
        throw new Error('Name this signed-in Amazon profile once in GLDN Ops Setup before scanning it. No single prior same-profile identity could be restored safely.');
      }
      amazonProfileLabel = unique[0];
      await storageSet({ amazonProfileLabel });
    }
    const result = await ORDER_AUDIT_BACKGROUND.startAmazonScan({
      monthKey,
      computerLabel: monthlyRun.computerLabel || stored.computerLabel,
      accountLabel: monthlyRun.accountLabel || stored.ebayAccountLabel,
      supplierProfile: amazonProfileLabel
    }, {}, { postToDashboard });
    return { ok: true, action, result };
  }
  if (action === 'resume-order-placement-audit-amazon') {
    const result = await ORDER_AUDIT_BACKGROUND.resume({}, { postToDashboard });
    return { ok: true, action, result };
  }
  if (action === 'read-order-placement-audit') {
    const monthKey = String(payload.monthKey || '').trim();
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthKey)) {
      throw new Error('The order-placement audit requires a valid YYYY-MM month.');
    }
    const stored = await storageGet(['ebayMonthlyProfit', 'computerLabel', 'ebayAccountLabel']);
    const monthlyRun = stored.ebayMonthlyProfit || {};
    const computerLabel = String(monthlyRun.computerLabel || stored.computerLabel || '').trim();
    const accountLabel = String(monthlyRun.accountLabel || stored.ebayAccountLabel || '').trim();
    const shared = await ORDER_AUDIT_BACKGROUND.readShared({ computerLabel, accountLabel, monthKey }, { postToDashboard });
    const worker = await ORDER_AUDIT_BACKGROUND.getStatus();
    const metadata = shared.metadata || {};
    return {
      ok: true,
      action,
      result: {
        runKey: String(shared.runKey || metadata.runKey || ''),
        computerLabel,
        accountLabel,
        monthKey,
        expectedProfiles: Array.isArray(metadata.expectedProfiles) ? metadata.expectedProfiles : [],
        scannedProfiles: Array.isArray(metadata.scannedProfiles) ? metadata.scannedProfiles : [],
        coverageStatus: String(metadata.status || ''),
        summary: shared.summary || {},
        worker: worker.summary || null
      }
    };
  }
  if (action === 'sync-ebay-monthly-profit') {
    const confirmationToken = String(payload.confirmationToken || '').trim();
    if (!/^APPROVE SYNC EBAY \d{4}-(?:0[1-9]|1[0-2]) [1-9]\d*$/.test(confirmationToken)) {
      throw new Error('Monthly eBay profit sync requires the exact month and live-count approval token.');
    }
    const result = await syncReviewedEbayMonthlyProfit(confirmationToken);
    if (!result?.ok && !result?.queued) throw new Error(result?.error || 'Monthly eBay profit sync failed.');
    return { ok: true, action, result };
  }
  if (action === 'variation-scan') {
    const scan = await scanEbayVariationListings({});
    if (!scan?.ok) throw new Error(scan?.error || 'The automated variation scan stopped safely.');
    const audit = scan.audit;
    if (!audit?.variationListingCount) {
      return {
        ok: true,
        action,
        scannedListings: Number(scan.scannedListings || 0),
        variationParents: 0,
        remainingVariationParents: 0,
        review: null
      };
    }
    const stored = await storageGet([VARIATION_END_LEDGER_KEY]);
    const completedIds = new Set(
      (stored[VARIATION_END_LEDGER_KEY]?.[audit.reportFingerprint]?.successfulItemIds || []).map(String)
    );
    const remainingIds = audit.listings
      .map((listing) => String(listing.itemId || ''))
      .filter((itemId) => /^\d{9,15}$/.test(itemId) && !completedIds.has(itemId));
    if (!remainingIds.length) {
      return {
        ok: true,
        action,
        scannedListings: Number(scan.scannedListings || 0),
        variationParents: Number(audit.variationListingCount || 0),
        remainingVariationParents: 0,
        review: null
      };
    }
    const review = await prepareEbayVariationEndReview({
      itemIds: remainingIds.slice(0, VARIATION_END_BATCH_LIMIT),
      selectedTotal: remainingIds.length,
      reportFingerprint: audit.reportFingerprint,
      reportName: audit.reportName,
      sourceTabId: audit.sourceTabId
    }, {});
    if (!review?.ok) throw new Error(review?.error || 'eBay did not create the exact variation review.');
    return {
      ok: true,
      action,
      scannedListings: Number(scan.scannedListings || 0),
      variationParents: Number(audit.variationListingCount || 0),
      remainingVariationParents: remainingIds.length,
      review: {
        tabId: Number(review.tabId),
        requestedCount: Number(review.requestedCount || 0),
        eligibleCount: Number(review.eligibleCount || 0),
        remainingSelectedCount: Number(review.remainingSelectedCount || 0),
        pageTitle: String(review.pageTitle || ''),
        workspaceId: String(review.workspaceId || ''),
        workspaceUrl: String(review.workspaceUrl || ''),
        approvalToken: `APPROVE END VARIATIONS ${Number(review.requestedCount || 0)}`
      }
    };
  }
  if (action === 'policy-listing-scan') {
    const canceledReview = await cancelEbayPolicyListingEndReview();
    const scan = await scanEbayPolicyListings({ fresh: true }, {});
    if (!scan?.ok) throw new Error(scan?.error || 'The complete read-only policy scan stopped safely.');
    return {
      ok: true,
      action,
      canceledReview: Boolean(canceledReview?.changed),
      scannedListings: Number(scan.scannedListings || 0),
      summary: {
        total: Number(scan.summary?.total || 0),
        clear: Number(scan.summary?.clear || 0),
        review: Number(scan.summary?.review || 0),
        block: Number(scan.summary?.block || 0)
      },
      reportFingerprint: String(scan.audit?.reportFingerprint || ''),
      scannedAt: String(scan.audit?.scannedAt || '')
    };
  }
  const result = await seedDashboardSetupFromLocalConfig();
  if (!result?.ok) throw new Error(result?.error || 'Automatic dashboard setup failed.');
  return { ok: true, action, result };
}

async function inspectLocalControlPage(payload = {}) {
  const platform = String(payload.platform || '').toLowerCase();
  const tab = await resolveControlTab(payload, platform);
  const state = await sendTabMessage(tab.id, { type: 'inspectGldnPageState' });
  if (platform === 'ebay') {
    try {
      state.markShipped = await sendTabMessage(tab.id, { type: 'inspectEbayMarkShippedDom' });
    } catch (error) {
      state.markShipped = { ok: false, error: error.message };
    }
  }
  if (platform === 'amazon' && /\/(?:gp\/subscribe-and-save\/manager\/viewsubscriptions|auto-deliveries\/)/i.test(String(tab.url || ''))) {
    try {
      const inspected = await inspectLocalControlAmazonSubscribeSave({ tabId: tab.id });
      state.subscribeSave = inspected.subscribeSave;
    } catch (error) {
      state.subscribeSave = { ok: false, error: error.message };
    }
  }
  return { ok: state?.ok !== false, tab: controlTabSummary(tab), pageState: state };
}

async function inspectLocalControlMove99(payload = {}) {
  const tab = await resolveControlTab(payload, 'ebay');
  const state = await sendTabMessage(tab.id, { type: 'inspectEbayMove99Dom' });
  return { ok: state?.ok !== false, tab: controlTabSummary(tab), move99State: state };
}

async function inspectLocalControlMove99FinalReview(payload = {}) {
  const tab = await resolveControlTab(payload, 'ebay');
  if (payload.url && !controlUrlsEqual(tab.url, assertSafeControlUrl(payload.url).href)) {
    throw new Error('The recovered Profile 2 tab no longer matches the exact Move .99 review URL.');
  }
  return inspectTrustedMove99FinalReview(tab, payload, { persistEvidence: true });
}

async function approveLocalControlMove99FinalReview(payload = {}) {
  const confirmationToken = String(payload.confirmationToken || '').trim();
  if (!/^APPROVE SUBMIT [1-9]\d*$/.test(confirmationToken)) {
    throw new Error('Move .99 final review approval requires the exact live-count confirmation token.');
  }
  const tab = await resolveControlTab(payload, 'ebay');
  if (payload.url && !controlUrlsEqual(tab.url, assertSafeControlUrl(payload.url).href)) {
    throw new Error('The recovered Profile 2 tab no longer matches the exact Move .99 review URL.');
  }
  const stored = await storageGet(['pendingMove99Run']);
  if (String(stored.pendingMove99Run?.phase || '') === 'manual-reconciliation-required') {
    if (stored.pendingMove99Run?.finalReviewRecoveryNoEffect === true
        && Number(stored.pendingMove99Run?.finalReviewRecoveryClickCount || 0) === 1) {
      return activateTrustedMove99FinalReviewNoEffect(tab, payload);
    }
    return recoverTrustedMove99FinalReviewNoEffect(tab, payload);
  }
  return dispatchTrustedMove99FinalReview(tab, payload);
}

async function prepareLocalControlVariationEndReview(payload = {}) {
  return prepareEbayVariationEndReview({
    itemIds: payload.itemIds,
    selectedTotal: payload.selectedTotal,
    reportFingerprint: payload.reportFingerprint,
    reportName: payload.reportName
  }, {});
}

async function readLocalControlState(payload = {}) {
  const keys = [...new Set((Array.isArray(payload.keys) ? payload.keys : []).map(String))]
    .filter((key) => LOCAL_CONTROL_STATE_KEYS.has(key));
  if (!keys.length) throw new Error('No approved GLDN Ops state keys were requested.');
  const wantsDashboardStatus = keys.includes('dashboardConfigurationStatus');
  const wantsDashboardQueueSummary = keys.includes('dashboardQueueSummary');
  const storageKeys = keys.filter((key) => key !== 'dashboardConfigurationStatus' && key !== 'dashboardQueueSummary');
  if (wantsDashboardStatus) storageKeys.push(DASHBOARD_URL_KEY, DASHBOARD_SECRET_KEY);
  if (wantsDashboardQueueSummary) storageKeys.push(DASHBOARD_QUEUE_KEY, DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY);
  const state = await storageGet([...new Set(storageKeys)]);
  if (wantsDashboardStatus) {
    const urlConfigured = Boolean(cleanWebAppUrl(state[DASHBOARD_URL_KEY] || globalThis.GLDN_CONFIG?.dashboardUrl || ''));
    const keyConfigured = Boolean(String(state[DASHBOARD_SECRET_KEY] || globalThis.GLDN_CONFIG?.dashboardKey || '').trim());
    state.dashboardConfigurationStatus = {
      configured: urlConfigured && keyConfigured,
      urlConfigured,
      keyConfigured
    };
    delete state[DASHBOARD_URL_KEY];
    delete state[DASHBOARD_SECRET_KEY];
  }
  if (wantsDashboardQueueSummary) {
    const queue = Array.isArray(state[DASHBOARD_QUEUE_KEY]) ? state[DASHBOARD_QUEUE_KEY] : [];
    state.dashboardQueueSummary = {
      count: queue.length,
      items: queue.slice(0, 25).map((item) => ({
        action: String(item?.action || ''),
        syncId: String(item?.syncId || item?.record?.syncId || ''),
        attempts: Number(item?.attempts || 0),
        createdAt: String(item?.createdAt || ''),
        nextAttemptAt: String(item?.nextAttemptAt || ''),
        lastError: String(item?.lastError || '').slice(0, 300)
      })),
      migrationAudit: state[DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY] || null
    };
    delete state[DASHBOARD_QUEUE_KEY];
    delete state[DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY];
  }
  if (state.pendingMove99Run) {
    state.pendingMove99Run = FOUNDATION.compactMove99ControlRecord(state.pendingMove99Run);
  }
  if (state.ebayPolicyListingAudit) {
    state.ebayPolicyListingAudit = POLICY_LISTING_AUDIT.compactControlRecord(state.ebayPolicyListingAudit);
  }
  if (state.ebayMonthlyProfit) {
    state.ebayMonthlyProfit = EBAY_PROFIT_CORE.compactControlRecord(state.ebayMonthlyProfit);
  }
  if (state.poshmarkProfitBackfill) {
    state.poshmarkProfitBackfill = FOUNDATION.compactPoshmarkProfitBackfillControlRecord(state.poshmarkProfitBackfill);
  }
  if (Array.isArray(state.gldnErrorLog)) state.gldnErrorLog = state.gldnErrorLog.slice(0, 25);
  return { ok: true, state: FOUNDATION.fitControlStateToBudget(state) };
}

async function readLocalControlEbayProfitReview(payload = {}) {
  const offset = Math.max(0, Math.min(5000, Number(payload.offset || 0)));
  const limit = Math.max(1, Math.min(100, Number(payload.limit || 50)));
  const status = String(payload.status || 'all').trim().toLowerCase();
  if (!['all', 'exact', 'unresolved'].includes(status)) {
    throw new Error('eBay profit review status must be all, exact, or unresolved.');
  }
  const stored = await storageGet(['ebayMonthlyProfit']);
  const run = stored.ebayMonthlyProfit || null;
  if (!run || !['review', 'completed'].includes(String(run.phase || ''))) {
    throw new Error('Monthly eBay profit has not reached review.');
  }
  const source = Array.isArray(run.results) ? run.results : [];
  const filtered = source.filter((item) => {
    if (status === 'exact') return item?.status === 'exact' && item?.record;
    if (status === 'unresolved') return item?.status !== 'exact' || !item?.record;
    return true;
  });
  return {
    ok: true,
    runId: String(run.runId || ''),
    monthKey: String(run.monthKey || ''),
    phase: String(run.phase || ''),
    summary: EBAY_PROFIT_CORE.summary(run),
    status,
    offset,
    limit,
    total: filtered.length,
    hasMore: offset + limit < filtered.length,
    items: filtered.slice(offset, offset + limit)
  };
}

async function readLocalControlProfitBackfillReview(payload = {}) {
  const offset = Math.max(0, Math.min(5000, Number(payload.offset || 0)));
  const limit = Math.max(1, Math.min(100, Number(payload.limit || 50)));
  const status = String(payload.status || 'all').trim().toLowerCase();
  if (!['all', 'exact', 'unresolved'].includes(status)) {
    throw new Error('Profit backfill review status must be all, exact, or unresolved.');
  }
  const stored = await storageGet(['poshmarkProfitBackfill', 'amazonProfileLabel']);
  const run = stored.poshmarkProfitBackfill || null;
  if (!run || !['review', 'completed'].includes(String(run.phase || ''))) {
    throw new Error('Marketplace Amazon-cost resolution has not reached review.');
  }
  const salesByOrder = new Map((run.sales || []).map((sale) => [String(sale?.orderNumber || ''), sale]));
  const source = Array.isArray(run.results) ? run.results : [];
  const filtered = source.filter((item) => {
    if (status === 'exact') return item?.status === 'exact' && item?.record;
    if (status === 'unresolved') return item?.status !== 'exact' || !item?.record;
    return true;
  });
  const items = filtered.slice(offset, offset + limit).map((result) => {
    const sale = salesByOrder.get(String(result?.orderNumber || '')) || {};
    const asins = [...new Set((sale.asins || []).map((asin) => String(asin || '').trim().toUpperCase()).filter(Boolean))];
    const candidates = (run.purchases || [])
      .filter((purchase) => asins.includes(String(purchase?.asin || '').trim().toUpperCase()))
      .map((purchase) => ({
        asin: String(purchase?.asin || ''),
        orderId: String(purchase?.orderId || ''),
        purchaseDate: String(purchase?.purchaseDate || ''),
        cost: Number.isFinite(Number(purchase?.cost)) ? Number(purchase.cost) : null,
        quantity: Number(purchase?.quantity || 1),
        unitIndex: Number(purchase?.unitIndex || 1),
        source: String(purchase?.source || '')
      }));
    return {
      orderNumber: String(result?.orderNumber || ''),
      status: String(result?.status || ''),
      reason: String(result?.reason || ''),
      orderDate: String(sale.orderDate || ''),
      itemTitle: String(sale.itemTitle || ''),
      asins,
      marketplaceEarnings: Number.isFinite(Number(sale.marketplaceEarnings)) ? Number(sale.marketplaceEarnings) : null,
      noteStatus: String(sale.noteStatus || ''),
      noteSupplierTotal: Number.isFinite(Number(sale.noteSupplierTotal)) ? Number(sale.noteSupplierTotal) : null,
      candidates
    };
  });
  return {
    ok: true,
    runId: String(run.runId || ''),
    scope: String(run.scope || ''),
    monthKey: String(run.monthKey || ''),
    phase: String(run.phase || ''),
    supplierProfile: String(stored.amazonProfileLabel || ''),
    summary: globalThis.GLDN_PROFIT_BACKFILL.summary(run),
    status,
    offset,
    limit,
    total: filtered.length,
    hasMore: offset + limit < filtered.length,
    items
  };
}

async function reloadLocalControlExtension() {
  await assertRuntimeReloadSafe('Reloading the Profile 2 extension');
  await storageSet({
    lastExtensionReloadRequest: {
      at: new Date().toISOString(),
      version: EXTENSION_VERSION,
      targetVersion: EXTENSION_VERSION,
      reason: 'local-control',
      pending: true,
      returnUrl: '',
      sourceTabId: null,
      sourceTabUrl: ''
    }
  });
  setTimeout(() => chrome.runtime.reload(), 1500);
  return { ok: true, reloading: true, version: EXTENSION_VERSION };
}

async function runLocalControlPageAction(payload = {}) {
  const platform = String(payload.platform || '').toLowerCase();
  const action = String(payload.action || '').toLowerCase();
  const config = LOCAL_CONTROL_PLATFORM[platform];
  if (!config?.messageType || !config.actions.has(action)) {
    throw new Error('The requested page action is not on the safe review-only allowlist.');
  }
  const tab = await resolveControlTab(payload, platform);
  if (payload.url && !controlUrlsEqual(tab.url, assertSafeControlUrl(payload.url).href)) {
    throw new Error('The recovered Profile 2 tab no longer matches the exact requested URL.');
  }
  const confirmationToken = String(payload.confirmationToken || '').trim();
  const monthKey = String(payload.monthKey || '').trim();
  if ((action === 'start-historical-profit-month' || action === 'start-monthly-profit')
      && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new Error('Monthly profit start requires a valid YYYY-MM month.');
  }
  if (action === 'approve-mark-shipped-review' && !/^APPROVE MARK SHIPPED [1-9]\d*$/.test(confirmationToken)) {
    throw new Error('Mark as Shipped approval requires the exact live-count confirmation token.');
  }
  if (action === 'approve-ebay-mark-shipped-confirmation' && !/^APPROVE EBAY CONTINUE [1-9]\d*$/.test(confirmationToken)) {
    throw new Error('eBay Continue approval requires the exact live-count confirmation token.');
  }
  if (action === 'approve-move99-submit' && !/^APPROVE SUBMIT [1-9]\d*$/.test(confirmationToken)) {
    throw new Error('Move .99 Submit approval requires the exact live-count confirmation token.');
  }
  if (action === 'approve-subscribe-save' && !/^APPROVE CANCEL SUBSCRIPTIONS [1-9]\d*$/.test(confirmationToken)) {
    throw new Error('Subscribe & Save approval requires the exact live-count confirmation token.');
  }
  if (action === 'save-visible-sales-review' && !/^APPROVE SAVE VISIBLE SALES [1-9]\d*$/.test(confirmationToken)) {
    throw new Error('Visible-sales save requires the exact live-count confirmation token.');
  }
  if (action === 'approve-historical-profit-review'
      && !/^APPROVE (?:SYNC POSHMARK \d{4}-(?:0[1-9]|1[0-2])|RESOLVE (?:POSHMARK|EBAY) COSTS) [1-9]\d*$/.test(confirmationToken)) {
    throw new Error('Historical-profit save requires the exact month and live-count confirmation token.');
  }
  let controlledTab = tab;
  if (payload.active === true) {
    controlledTab = await updateChromeTab(tab.id, { active: true });
    await focusChromeWindow(controlledTab.windowId);
  }
  const pageMessage = { type: config.messageType, action };
  if (action === 'start-historical-profit-month' || action === 'start-monthly-profit') pageMessage.monthKey = monthKey;
  if (action === 'approve-mark-shipped-review'
      || action === 'approve-ebay-mark-shipped-confirmation'
      || action === 'approve-move99-submit'
      || action === 'approve-subscribe-save'
      || action === 'save-visible-sales-review'
      || action === 'approve-historical-profit-review') {
    pageMessage.confirmationToken = confirmationToken;
  }
  let accepted;
  const pageActionOptions = action === 'approve-historical-profit-review'
    ? { timeoutMs: HISTORICAL_PROFIT_PAGE_ACTION_TIMEOUT_MS }
    : {};
  try {
    accepted = await sendTabMessage(tab.id, pageMessage, pageActionOptions);
  } catch (error) {
    if (!/receiving end does not exist|could not establish connection/i.test(String(error?.message || error))) throw error;
    const files = LOCAL_CONTROL_CONTENT_FILES[platform];
    if (!Array.isArray(files) || !files.length) throw error;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
    accepted = await sendTabMessage(tab.id, pageMessage, pageActionOptions);
  }
  if (accepted?.ok === false) throw new Error(accepted.error || 'The Profile 2 page rejected the review action.');
  await controlDelay(Math.max(0, Math.min(15000, Number(payload.waitMs || 2500))));
  let pageState = null;
  try {
    pageState = await sendTabMessage(tab.id, { type: 'inspectGldnPageState' });
  } catch (error) {
    pageState = { ok: false, error: error.message };
  }
  return { ok: true, accepted, tab: controlTabSummary(controlledTab), pageState };
}

async function executeLocalControlCommand(command = {}) {
  const action = String(command.action || '').toLowerCase();
  const payload = command.payload || {};
  switch (action) {
    case 'inspect-session': return inspectLocalControlSession();
    case 'open-url': return openLocalControlUrl(payload);
    case 'navigate-tab': return navigateLocalControlTab(payload);
    case 'focus-tab': return focusLocalControlTab(payload);
    case 'reload-tab': return reloadLocalControlTab(payload);
    case 'inspect-tab': return inspectLocalControlTab(payload);
    case 'inspect-tutorial-video': return inspectLocalControlTutorialVideo(payload);
    case 'inspect-amazon-subscribe-save': return inspectLocalControlAmazonSubscribeSave(payload);
    case 'inspect-ebay-variations': return inspectLocalControlEbayVariations(payload);
    case 'close-tab': return closeLocalControlTab(payload);
    case 'open-extension-page': return openLocalControlExtensionPage(payload);
    case 'open-dashboard': return openLocalControlDashboard(payload);
    case 'extension-action': return runLocalControlExtensionAction(payload);
    case 'inspect-page': return inspectLocalControlPage(payload);
    case 'inspect-move99': return inspectLocalControlMove99(payload);
    case 'inspect-move99-final-review': return inspectLocalControlMove99FinalReview(payload);
    case 'approve-move99-final-review': return approveLocalControlMove99FinalReview(payload);
    case 'prepare-variation-end-review': return prepareLocalControlVariationEndReview(payload);
    case 'read-state': return readLocalControlState(payload);
    case 'read-ebay-profit-review': return readLocalControlEbayProfitReview(payload);
    case 'read-profit-backfill-review': return readLocalControlProfitBackfillReview(payload);
    case 'page-action': return runLocalControlPageAction(payload);
    case 'reset-state': return resetAutomationState({});
    case 'reload-extension': return reloadLocalControlExtension();
    default: throw new Error('The local-control command is not supported by this GLDN Ops version.');
  }
}

async function pollLocalControl() {
  if (localControlPollRunning) return { ok: true, skipped: true };
  localControlPollRunning = true;
  let hadCommand = false;
  try {
    const response = await updaterRequest('/control/next', { timeoutMs: 4000 });
    const command = response?.command;
    if (!command?.id) return { ok: true, empty: true };
    hadCommand = true;
    let result;
    try {
      result = await executeLocalControlCommand(command);
      await updaterRequest('/control/results', {
        method: 'POST',
        body: { commandId: command.id, ok: true, result },
        timeoutMs: 10000
      });
    } catch (error) {
      await updaterRequest('/control/results', {
        method: 'POST',
        body: { commandId: command.id, ok: false, error: error?.message || String(error) },
        timeoutMs: 10000
      }).catch(() => {});
      throw error;
    }
    return { ok: true, commandId: command.id };
  } catch (error) {
    if (hadCommand) {
      await recordExtensionLog({
        source: 'local-control',
        operation: 'execute-command',
        message: error?.message || String(error)
      });
    }
    return { ok: false, unavailable: !hadCommand, error: error?.message || String(error) };
  } finally {
    localControlPollRunning = false;
    if (hadCommand) setTimeout(() => pollLocalControl(), 100);
  }
}

function scheduleLocalControl() {
  chrome.alarms.create(LOCAL_CONTROL_ALARM, { delayInMinutes: 0.05, periodInMinutes: 0.5 });
}

async function queueRuntimeReload({ returnUrl = '', sourceTabId = null, sourceTabUrl = '', reason = 'manual-reload', targetVersion = '' } = {}) {
  await assertRuntimeReloadSafe('Reloading GLDN Ops');
  await storageSet({
    lastExtensionReloadRequest: {
      at: new Date().toISOString(),
      version: EXTENSION_VERSION,
      targetVersion,
      reason,
      pending: true,
      returnUrl: String(returnUrl || ''),
      sourceTabId: Number.isInteger(sourceTabId) ? sourceTabId : null,
      sourceTabUrl: String(sourceTabUrl || '')
    }
  });
  setTimeout(() => chrome.runtime.reload(), 350);
}

async function updateExtensionAndReload(message = {}, sender = {}) {
  await assertUpdaterIdle('Updating GLDN Ops');
  recordExtensionLog({ source: 'updater', level: 'info', operation: 'update', message: 'Verified extension update requested.' });
  const result = await updaterRequest('/update', { method: 'POST', body: {}, timeoutMs: 180000 });
  const diskVersion = String(result.currentVersion || result.diskVersion || '');
  const needsRuntimeReload = Boolean(
    result.updated
    || (diskVersion && diskVersion !== EXTENSION_VERSION)
    || message.reloadWhenCurrent === true
  );
  if (needsRuntimeReload) {
    await queueRuntimeReload({
      returnUrl: message.returnUrl,
      sourceTabId: Number.isInteger(message.sourceTabId) ? message.sourceTabId : sender?.tab?.id,
      sourceTabUrl: sender?.tab?.url,
      reason: 'verified-update',
      targetVersion: diskVersion
    });
  }
  return { ...result, runtimeVersion: EXTENSION_VERSION, diskVersion, reloading: needsRuntimeReload };
}

async function rollbackExtensionAndReload(message = {}, sender = {}) {
  await assertUpdaterIdle('Rolling back GLDN Ops');
  recordExtensionLog({ source: 'updater', level: 'info', operation: 'rollback', message: 'Extension rollback requested.' });
  const result = await updaterRequest('/rollback', {
    method: 'POST',
    body: { snapshotId: String(message.snapshotId || '') },
    timeoutMs: 120000
  });
  await queueRuntimeReload({
    returnUrl: message.returnUrl,
    sourceTabId: Number.isInteger(message.sourceTabId) ? message.sourceTabId : sender?.tab?.id,
    sourceTabUrl: sender?.tab?.url,
    reason: 'rollback',
    targetVersion: result.currentVersion
  });
  return { ...result, reloading: true };
}

function scheduleUpdaterCheck() {
  chrome.alarms.create(UPDATER_CHECK_ALARM, { delayInMinutes: 2, periodInMinutes: 5 });
}

async function checkUpdaterDiskVersion() {
  let status;
  try {
    status = await updaterRequest('/status', { timeoutMs: 3000 });
  } catch {
    return { ok: false, unavailable: true };
  }
  const diskVersion = String(status.diskVersion || '');
  if (!diskVersion || diskVersion === EXTENSION_VERSION) {
    await storageSet({ gldnUpdaterAutoReloadAttempt: null, gldnUpdaterDeferredReload: null });
    return { ok: true, current: true, diskVersion };
  }
  const stored = await storageGet(['gldnUpdaterAutoReloadAttempt']);
  const prior = stored.gldnUpdaterAutoReloadAttempt;
  if (prior?.fromVersion === EXTENSION_VERSION && prior?.targetVersion === diskVersion) {
    return { ok: false, pathMismatch: true, diskVersion };
  }
  const workflowStatus = await activeWorkflowStatus();
  if (workflowStatus.busy) {
    const deferred = {
      at: new Date().toISOString(),
      fromVersion: EXTENSION_VERSION,
      targetVersion: diskVersion,
      workflows: workflowStatus.workflows
    };
    await storageSet({ gldnUpdaterDeferredReload: deferred });
    return { ok: true, deferred: true, diskVersion, workflows: workflowStatus.workflows };
  }
  await storageSet({
    gldnUpdaterAutoReloadAttempt: {
      fromVersion: EXTENSION_VERSION,
      targetVersion: diskVersion,
      attemptedAt: new Date().toISOString()
    }
  });
  await queueRuntimeReload({ reason: 'shared-folder-update', targetVersion: diskVersion });
  return { ok: true, reloading: true, diskVersion };
}

async function getUpdaterRuntimeStatus(refresh = false) {
  const [status, workflowStatus, stored] = await Promise.all([
    updaterRequest(`/status${refresh ? '?refresh=1' : ''}`, { timeoutMs: refresh ? 20000 : 3000 }),
    activeWorkflowStatus(),
    storageGet(['gldnUpdaterDeferredReload', 'gldnUpdaterAutoReloadAttempt'])
  ]);
  return {
    ...status,
    runtimeVersion: EXTENSION_VERSION,
    workflowBusy: workflowStatus.busy,
    workflows: workflowStatus.workflows,
    deferredReload: stored.gldnUpdaterDeferredReload || null,
    autoReloadAttempt: stored.gldnUpdaterAutoReloadAttempt || null
  };
}

function normalizeComputer(value) {
  return FOUNDATION.normalizeComputer(value);
}

function identityForComputer(value) {
  return FOUNDATION.identityForComputer(value);
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

function storageSet(values) {
  const payload = { ...values };
  for (const key of VERSIONED_WORKFLOW_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      payload[key] = stampVersionedWorkflowValue(payload[key]);
    }
  }
  if (payload.pendingMove99Run && typeof payload.pendingMove99Run === 'object') {
    payload.pendingMove99Run = {
      ...payload.pendingMove99Run,
      extensionVersion: EXTENSION_VERSION,
      stateUpdatedAt: new Date().toISOString()
    };
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function debuggerAttach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, '1.3', () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function debuggerCommand(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result || {});
    });
  });
}

function debuggerDetach(target) {
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function isExactAwaitingShipmentUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    const filter = String(url.searchParams.get('filter') || '').trim().toLowerCase();
    return url.protocol === 'https:'
      && (host === 'ebay.com' || host.endsWith('.ebay.com'))
      && path === '/sh/ord'
      && filter === 'status:awaiting_shipment';
  } catch {
    return false;
  }
}

function validateTrustedMarkShippedDispatch(pending, request, tabId) {
  const selectedCount = Number(pending?.selectedCount || 0);
  const beforeCount = Number(pending?.beforeCount || 0);
  const requestedSelected = Number(request?.selectedCount || 0);
  const requestedBefore = Number(request?.beforeCount || 0);
  if (!pending?.active || pending.phase !== 'awaiting-result') {
    throw new Error('The approved eBay confirmation is not awaiting its one trusted dispatch.');
  }
  if (!Number.isInteger(selectedCount) || selectedCount <= 0 || selectedCount !== beforeCount) {
    throw new Error('The approved eBay confirmation no longer has an exact all-orders count.');
  }
  if (requestedSelected !== selectedCount || requestedBefore !== beforeCount) {
    throw new Error('The trusted dispatch request does not match the approved order count.');
  }
  if (!Number.isInteger(tabId) || Number(pending.ownerTabId) !== tabId) {
    throw new Error('The approved eBay confirmation belongs to a different tab.');
  }
  if (Number(pending.finalActionClickCount) !== 1
      || pending.finalActionApprovalToken !== `APPROVE EBAY CONTINUE ${selectedCount}`) {
    throw new Error('The exact final eBay approval token is missing.');
  }
  if (pending.trustedFinalActionDispatchAt || pending.trustedFinalActionReleasedAt) {
    throw new Error('The approved eBay confirmation already received its one trusted dispatch.');
  }
  const actionLabel = String(pending.confirmationActionLabel || '').trim().toLowerCase();
  if (!['continue', 'confirm', 'mark as shipped', 'mark orders as shipped'].includes(actionLabel)) {
    throw new Error('The reviewed eBay final action label is no longer approved.');
  }
  return { selectedCount, beforeCount, actionLabel };
}

function validateTrustedMarkShippedActivation(pending, request, tabId) {
  const selectedCount = Number(pending?.selectedCount || 0);
  const beforeCount = Number(pending?.beforeCount || 0);
  const requestedSelected = Number(request?.selectedCount || 0);
  const requestedBefore = Number(request?.beforeCount || 0);
  if (!pending?.active || pending.phase !== 'activating-approved-action' || !pending.activationApprovedAt) {
    throw new Error('The approved Mark as Shipped action is not awaiting its trusted activation click.');
  }
  if (!Number.isInteger(selectedCount) || selectedCount <= 0 || selectedCount !== beforeCount) {
    throw new Error('The approved Mark as Shipped action no longer has an exact all-orders count.');
  }
  if (requestedSelected !== selectedCount || requestedBefore !== beforeCount) {
    throw new Error('The trusted activation request does not match the approved order count.');
  }
  if (!Number.isInteger(tabId) || Number(pending.ownerTabId) !== tabId) {
    throw new Error('The approved Mark as Shipped action belongs to a different tab.');
  }
  if (pending.trustedActivationDispatchAt || pending.trustedActivationReleasedAt) {
    throw new Error('The approved Mark as Shipped action already received its one trusted activation click.');
  }
  return { selectedCount, beforeCount };
}

function buildMarkShippedActivationTargetProbe() {
  return `(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\\s+/g, ' ');
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none'
        && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const actionableSelector = 'button, a, li, [role="menuitem"], [role="button"], [tabindex]:not([tabindex="-1"])';
    const seen = new Set();
    const matches = [...document.querySelectorAll(actionableSelector)]
      .filter(visible)
      .filter((element) => !element.closest('[id^="gldn-"], .gldn-order-panel, .gldn-modal-backdrop'))
      .filter((element) => normalize(element.getAttribute('aria-label') || element.innerText || element.textContent || element.title) === 'mark as shipped')
      .map((element) => element.closest(actionableSelector) || element)
      .filter((element) => {
        if (seen.has(element)) return false;
        seen.add(element);
        return !element.disabled && element.getAttribute('aria-disabled') !== 'true';
      });
    if (matches.length !== 1) {
      return { ok: false, error: 'Expected exactly one enabled eBay Mark as shipped menu action.', matches: matches.length };
    }
    const target = matches[0];
    target.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = target.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === target || target.contains(hit) || hit.contains(target))) {
      return { ok: false, error: 'The eBay Mark as shipped menu action is not the hit-tested target.' };
    }
    return {
      ok: true,
      x,
      y,
      id: String(target.id || ''),
      label: normalize(target.getAttribute('aria-label') || target.innerText || target.textContent || target.title)
    };
  })()`;
}

async function dispatchTrustedEbayMarkShippedActivation(message, sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) throw new Error('The exact eBay tab could not be identified.');
  const [tab, stored] = await Promise.all([
    getTab(tabId),
    storageGet(['pendingMarkShippedRun'])
  ]);
  if (!isExactAwaitingShipmentUrl(tab.url) || !isExactAwaitingShipmentUrl(sender?.tab?.url)) {
    throw new Error('The trusted eBay activation is limited to Awaiting shipment.');
  }
  const approved = validateTrustedMarkShippedActivation(stored.pendingMarkShippedRun, message, tabId);
  const target = { tabId };
  let attached = false;
  let dispatchRecorded = false;
  try {
    await debuggerAttach(target);
    attached = true;
    const evaluation = await debuggerCommand(target, 'Runtime.evaluate', {
      expression: buildMarkShippedActivationTargetProbe(),
      returnByValue: true,
      awaitPromise: true
    });
    if (evaluation.exceptionDetails) throw new Error('The eBay Mark as shipped activation probe failed.');
    const probe = evaluation?.result?.value;
    if (!probe?.ok || !Number.isFinite(probe.x) || !Number.isFinite(probe.y) || probe.label !== 'mark as shipped') {
      throw new Error(probe?.error || 'The approved eBay Mark as shipped action could not be verified.');
    }

    const dispatchAt = new Date().toISOString();
    await storageSet({
      pendingMarkShippedRun: {
        ...stored.pendingMarkShippedRun,
        trustedActivationDispatchAt: dispatchAt,
        trustedActivationTarget: {
          id: String(probe.id || ''),
          label: String(probe.label || ''),
          x: Math.round(probe.x),
          y: Math.round(probe.y)
        },
        updatedAt: dispatchAt
      }
    });
    dispatchRecorded = true;
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    const releasedAt = new Date().toISOString();
    const refreshed = await storageGet(['pendingMarkShippedRun']);
    await storageSet({
      pendingMarkShippedRun: {
        ...(refreshed.pendingMarkShippedRun || stored.pendingMarkShippedRun),
        trustedActivationReleasedAt: releasedAt,
        updatedAt: releasedAt
      }
    });
    return { ok: true, dispatched: true, selectedCount: approved.selectedCount, target: { id: probe.id, label: probe.label } };
  } catch (error) {
    error.dispatchRecorded = dispatchRecorded;
    throw error;
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

function buildMarkShippedTargetProbe(actionLabel) {
  const expectedLabel = JSON.stringify(String(actionLabel || '').trim().toLowerCase());
  return `(() => {
    const expectedLabel = ${expectedLabel};
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\\s+/g, ' ');
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none'
        && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const dialogSelector = '[role="dialog"], [aria-modal="true"], .lightbox-dialog__window, .lightbox-dialog, .dialog';
    const matches = [...document.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true')
      .filter((button) => normalize(button.getAttribute('aria-label') || button.innerText || button.textContent || button.title) === expectedLabel)
      .map((button) => ({ button, dialog: button.closest(dialogSelector) }))
      .filter(({ dialog }) => {
        if (!visible(dialog)) return false;
        const text = normalize(dialog.innerText || dialog.textContent);
        const mentionsMarkingShipped = /\\bmark(?:ing)?\\b.*\\bshipped\\b|\\bshipped\\b.*\\bmark(?:ing)?\\b/.test(text);
        return mentionsMarkingShipped && /are you sure|confirm|continue/.test(text);
      });
    if (matches.length !== 1) {
      return { ok: false, error: 'Expected exactly one reviewed eBay final action.', matches: matches.length };
    }
    const { button, dialog } = matches[0];
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === button || button.contains(hit) || hit.contains(button))) {
      return { ok: false, error: 'The reviewed eBay final action is not the hit-tested target.' };
    }
    return {
      ok: true,
      x,
      y,
      label: normalize(button.getAttribute('aria-label') || button.innerText || button.textContent || button.title),
      id: String(button.id || ''),
      dialogText: normalize(dialog.innerText || dialog.textContent).slice(0, 500)
    };
  })()`;
}

async function dispatchTrustedEbayMarkShippedContinue(message, sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) throw new Error('The exact eBay tab could not be identified.');
  const [tab, stored] = await Promise.all([
    getTab(tabId),
    storageGet(['pendingMarkShippedRun'])
  ]);
  if (!isExactAwaitingShipmentUrl(tab.url) || !isExactAwaitingShipmentUrl(sender?.tab?.url)) {
    throw new Error('The trusted eBay dispatch is limited to Awaiting shipment.');
  }
  const approved = validateTrustedMarkShippedDispatch(stored.pendingMarkShippedRun, message, tabId);
  const target = { tabId };
  let attached = false;
  let dispatchRecorded = false;
  try {
    await debuggerAttach(target);
    attached = true;
    const evaluation = await debuggerCommand(target, 'Runtime.evaluate', {
      expression: buildMarkShippedTargetProbe(approved.actionLabel),
      returnByValue: true,
      awaitPromise: true
    });
    if (evaluation.exceptionDetails) throw new Error('The eBay final-action probe failed.');
    const probe = evaluation?.result?.value;
    if (!probe?.ok || !Number.isFinite(probe.x) || !Number.isFinite(probe.y) || probe.label !== approved.actionLabel) {
      throw new Error(probe?.error || 'The reviewed eBay final action could not be verified.');
    }

    const dispatchAt = new Date().toISOString();
    await storageSet({
      pendingMarkShippedRun: {
        ...stored.pendingMarkShippedRun,
        phase: 'awaiting-result',
        trustedFinalActionDispatchAt: dispatchAt,
        finalActionClickedAt: dispatchAt,
        trustedFinalActionTarget: {
          id: String(probe.id || ''),
          label: String(probe.label || ''),
          x: Math.round(probe.x),
          y: Math.round(probe.y)
        },
        updatedAt: dispatchAt
      }
    });
    dispatchRecorded = true;
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    const releasedAt = new Date().toISOString();
    const refreshed = await storageGet(['pendingMarkShippedRun']);
    await storageSet({
      pendingMarkShippedRun: {
        ...(refreshed.pendingMarkShippedRun || stored.pendingMarkShippedRun),
        trustedFinalActionReleasedAt: releasedAt,
        updatedAt: releasedAt
      }
    });
    return { ok: true, dispatched: true, selectedCount: approved.selectedCount, target: { id: probe.id, label: probe.label } };
  } catch (error) {
    error.dispatchRecorded = dispatchRecorded;
    throw error;
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

function isExactMove99ReviewUrl(value, workspaceId) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    return url.protocol === 'https:'
      && (host === 'ebay.com' || host.endsWith('.ebay.com'))
      && path === '/bulksell'
      && Boolean(String(workspaceId || ''))
      && url.searchParams.get('workspaceId') === String(workspaceId);
  } catch {
    return false;
  }
}

function trustedMove99ClearedSelectionAllowed(pending, expectedCount, workspaceId, tabId) {
  const recoveryEvidence = pending?.reviewRecoveryEvidence || {};
  return Boolean(pending?.reviewRecoveredAfterReloadAt)
    && Number(recoveryEvidence.expectedCount || 0) === Number(expectedCount || 0)
    && String(recoveryEvidence.workspaceId || '') === String(workspaceId || '')
    && Number(recoveryEvidence.reboundTabId || 0) === Number(tabId || 0)
    && Number(recoveryEvidence.selectionSelected) === 0
    && Number(recoveryEvidence.selectionTotal || 0) === Number(expectedCount || 0)
    && Number(recoveryEvidence.submitCount || 0) === Number(expectedCount || 0)
    && Number(recoveryEvidence.destinationMatches || 0) > 0;
}

function validateTrustedMove99Dispatch(pending, request, tabId, tabUrl) {
  const expectedCount = Number(pending?.currentBatchCount || 0);
  const requestedCount = Number(request?.expectedCount || 0);
  const workspaceId = String(pending?.approvalWorkspaceId || '');
  const requestedWorkspaceId = String(request?.workspaceId || '');
  const batchIds = [...new Set((pending?.currentBatchIds || []).map(String).filter(Boolean))];
  const batchKey = String(pending?.currentBatchKey || '');
  const attempted = Number(pending?.categoryUpdate?.attempted || 0);
  const updated = Number(pending?.categoryUpdate?.updated || 0);
  const destinationCategory = String(pending?.destinationCategory || '').trim();
  if (pending?.phase !== 'awaiting-submit-approval' || pending?.reviewReady !== true) {
    throw new Error('The Move .99 review is no longer awaiting its approved Submit.');
  }
  if (!Number.isInteger(expectedCount) || expectedCount <= 0 || batchIds.length !== expectedCount) {
    throw new Error('The Move .99 review no longer has an exact saved listing batch.');
  }
  if (attempted !== expectedCount || updated !== expectedCount) {
    throw new Error('The Store category update count no longer matches the approved listing count.');
  }
  if (!Number.isInteger(tabId) || Number(pending?.approvalTabId) !== tabId) {
    throw new Error('The Move .99 review belongs to a different tab.');
  }
  if (requestedCount !== expectedCount || requestedWorkspaceId !== workspaceId) {
    throw new Error('The trusted Move .99 dispatch request does not match the approved review.');
  }
  if (!isExactMove99ReviewUrl(tabUrl, workspaceId)
      || !controlUrlsEqual(tabUrl, pending?.approvalUrl)) {
    throw new Error('The Move .99 review URL or workspace changed after approval.');
  }
  if (!destinationCategory) {
    throw new Error('The approved destination Store category is missing.');
  }
  if (Number(pending?.finalActionClickCount) !== 1
      || pending?.finalActionApprovalToken !== `APPROVE SUBMIT ${expectedCount}`) {
    throw new Error('The exact Move .99 Submit approval token is missing.');
  }
  if (pending?.trustedSubmitDispatchAt || pending?.trustedSubmitReleasedAt) {
    if (String(pending?.trustedSubmitWorkspaceId || '') !== workspaceId
        || String(pending?.trustedSubmitBatchKey || '') !== batchKey) {
      throw new Error('Stale Move .99 Submit receipt belongs to a different batch. Reload the repaired extension before retrying.');
    }
    throw new Error('The approved Move .99 Submit already received its one trusted dispatch.');
  }
  const allowClearedSelection = trustedMove99ClearedSelectionAllowed(
    pending,
    expectedCount,
    workspaceId,
    tabId
  );
  return { expectedCount, workspaceId, batchKey, destinationCategory, allowClearedSelection };
}

function buildMove99SubmitTargetProbe(expectedCount, destinationCategory, allowClearedSelection = false, options = {}) {
  const count = Number(expectedCount || 0);
  const expectedLabel = JSON.stringify(`submit (${count})`);
  const expectedDestination = JSON.stringify(String(destinationCategory || '').trim().toLowerCase());
  const allowCleared = allowClearedSelection === true;
  const activateTarget = options.activateTarget === true;
  return `(() => {
    const expectedCount = ${count};
    const expectedLabel = ${expectedLabel};
    const expectedDestination = ${expectedDestination};
    const allowClearedSelection = ${allowCleared};
    const activateTarget = ${activateTarget};
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\\s+/g, ' ');
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none'
        && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const selectionPattern = /^\\s*([\\d,]+)\\s+of\\s+([\\d,]+)\\s+item\\(s\\)\\s+selected\\s*$/i;
    const selectionCandidates = [
      ...document.querySelectorAll('.app-summary__bottom'),
      ...document.querySelectorAll('[role="status"], [aria-live]')
    ];
    const selection = selectionCandidates.map((element) => {
      const match = String(element.textContent || '').match(selectionPattern);
      return match ? { selected: Number(match[1].replace(/,/g, '')), total: Number(match[2].replace(/,/g, '')) } : null;
    }).find(Boolean);
    const exactSelection = selection?.selected === expectedCount && selection?.total === expectedCount;
    const recoveredClearedSelection = allowClearedSelection
      && selection?.selected === 0
      && selection?.total === expectedCount;
    if (!selection || (!exactSelection && !recoveredClearedSelection)) {
      return { ok: false, error: 'The native eBay selected count no longer matches the approved batch.', selection };
    }
    if (!normalize(document.body?.innerText || document.body?.textContent).includes(expectedDestination)) {
      return { ok: false, error: 'The approved destination Store category is no longer present on the review.' };
    }
    const matches = [...document.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true')
      .filter((button) => normalize(button.getAttribute('aria-label') || button.innerText || button.textContent || button.title) === expectedLabel);
    if (matches.length !== 1) {
      return { ok: false, error: 'Expected exactly one approved eBay Submit button.', matches: matches.length };
    }
    const button = matches[0];
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === button || button.contains(hit) || hit.contains(button))) {
      return { ok: false, error: 'The approved eBay Submit button is not the hit-tested target.' };
    }
    if (activateTarget) button.click();
    return {
      ok: true,
      activated: activateTarget,
      x,
      y,
      label: normalize(button.getAttribute('aria-label') || button.innerText || button.textContent || button.title),
      id: String(button.id || ''),
      selection
    };
  })()`;
}

function validateTrustedMove99FinalReviewContext(pending, request, tabId, tabUrl, { allowFinalDispatch = false } = {}) {
  const expectedCount = Number(pending?.currentBatchCount || 0);
  const requestedCount = Number(request?.expectedCount || 0);
  const workspaceId = String(pending?.approvalWorkspaceId || '');
  const requestedWorkspaceId = String(request?.workspaceId || '');
  const destinationCategory = String(pending?.destinationCategory || '').trim();
  const batchIds = [...new Set((pending?.currentBatchIds || []).map(String).filter(Boolean))];
  const batchKey = String(pending?.currentBatchKey || '');
  const attempted = Number(pending?.categoryUpdate?.attempted || 0);
  const updated = Number(pending?.categoryUpdate?.updated || 0);
  const expectedToken = `APPROVE SUBMIT ${expectedCount}`;
  const phase = String(pending?.phase || '');
  const isPendingReview = ['awaiting-submit-approval', 'awaiting-submit-result'].includes(phase)
    && pending?.reviewReady === true;
  const isReadOnlyReconciliation = allowFinalDispatch
    && phase === 'manual-reconciliation-required'
    && pending?.reviewReady === false
    && Number(pending?.finalReviewActionClickCount || 0) === 1
    && Boolean(pending?.trustedFinalReviewDispatchAt)
    && Boolean(pending?.trustedFinalReviewReleasedAt);
  if (!isPendingReview && !isReadOnlyReconciliation) {
    throw new Error('The Move .99 batch is no longer at its approved final review.');
  }
  if (pending?.applyStrategy !== 'exact-id-workspaces-v1' || pending?.scanIntegrity !== 'verified') {
    throw new Error('The final review is not backed by the verified exact-ID Move .99 workflow.');
  }
  if (!Number.isInteger(expectedCount) || expectedCount <= 0 || batchIds.length !== expectedCount) {
    throw new Error('The Move .99 final review no longer has an exact saved listing batch.');
  }
  if (attempted !== expectedCount || updated !== expectedCount) {
    throw new Error('The Store category update count no longer matches the approved listing count.');
  }
  if (!Number.isInteger(tabId) || Number(pending?.approvalTabId) !== tabId) {
    throw new Error('The Move .99 final review belongs to a different tab.');
  }
  if (requestedCount !== expectedCount || requestedWorkspaceId !== workspaceId) {
    throw new Error('The final review request does not match the approved Move .99 batch.');
  }
  if (!isExactMove99ReviewUrl(tabUrl, workspaceId)
      || !controlUrlsEqual(tabUrl, pending?.approvalUrl)) {
    throw new Error('The Move .99 final review URL or workspace changed after approval.');
  }
  if (!destinationCategory) {
    throw new Error('The approved destination Store category is missing.');
  }
  if (String(request?.confirmationToken || '').trim() !== expectedToken
      || pending?.finalActionApprovalToken !== expectedToken
      || Number(pending?.finalActionClickCount) !== 1) {
    throw new Error('The exact Move .99 Submit approval token is missing.');
  }
  if (!pending?.trustedSubmitDispatchAt || !pending?.trustedSubmitReleasedAt
      || String(pending?.trustedSubmitTarget?.label || '') !== `submit (${expectedCount})`) {
    throw new Error('The approved first eBay Submit click was not recorded exactly once.');
  }
  if (String(pending?.trustedSubmitWorkspaceId || '') !== workspaceId
      || String(pending?.trustedSubmitBatchKey || '') !== batchKey) {
    throw new Error('The recorded first eBay Submit click belongs to a different Move .99 batch.');
  }
  const finalClickCount = Number(pending?.finalReviewActionClickCount || 0);
  const finalDispatched = Boolean(pending?.trustedFinalReviewDispatchAt || pending?.trustedFinalReviewReleasedAt);
  if (finalDispatched
      && (String(pending?.trustedFinalReviewWorkspaceId || '') !== workspaceId
        || String(pending?.trustedFinalReviewBatchKey || '') !== batchKey)) {
    throw new Error('The recorded eBay Review fees action belongs to a different Move .99 batch.');
  }
  if (!allowFinalDispatch && (finalClickCount || finalDispatched)) {
    throw new Error('The eBay Review fees action already received its one trusted dispatch.');
  }
  if (finalClickCount > 1) {
    throw new Error('The eBay Review fees action has an invalid click count.');
  }
  return { expectedCount, workspaceId, batchKey, destinationCategory, expectedToken };
}

function buildMove99FinalReviewProbe(expectedCount, destinationCategory, options = {}) {
  const count = Number(expectedCount || 0);
  const destination = JSON.stringify(String(destinationCategory || '').trim().toLowerCase());
  const expectedFingerprint = JSON.stringify(String(options.expectedFingerprint || ''));
  const expectedActionLabel = JSON.stringify(String(options.expectedActionLabel || '').trim().toLowerCase());
  const prepareTarget = options.prepareTarget === true;
  const activateTarget = options.activateTarget === true;
  return `(() => {
    const expectedCount = ${count};
    const expectedDestination = ${destination};
    const expectedFingerprint = ${expectedFingerprint};
    const expectedActionLabel = ${expectedActionLabel};
    const prepareTarget = ${prepareTarget};
    const activateTarget = ${activateTarget};
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\\s+/g, ' ');
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none' && Number(style.opacity || 1) > 0
        && rect.width > 0 && rect.height > 0;
    };
    const pageText = String(document.body?.innerText || document.body?.textContent || '').replace(/\\s+/g, ' ').trim();
    const liveValues = [...pageText.matchAll(/\\b([\\d,]+)\\s+listings?\\s+(?:are|is)\\s+now\\s+live\\b/gi)]
      .map((match) => Number(match[1].replace(/,/g, ''))).filter(Number.isFinite);
    const failedValues = [...pageText.matchAll(/\\b([\\d,]+)\\s+listings?\\s+(?:failed|could not be revised|were not revised|weren't revised)\\b/gi)]
      .map((match) => Number(match[1].replace(/,/g, ''))).filter(Number.isFinite);
    if (liveValues.length || failedValues.length) {
      const live = expectedCount && liveValues.includes(expectedCount)
        ? expectedCount
        : Number(liveValues.at(-1) || 0);
      const failed = Number(failedValues.at(-1) || 0);
      const accounted = live + failed;
      return {
        ok: true,
        stage: 'result',
        result: {
          confirmed: accounted === expectedCount,
          expected: expectedCount,
          accounted,
          live,
          failed,
          capturedAt: new Date().toISOString()
        },
        url: location.href,
        title: document.title
      };
    }
    const candidates = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
      .filter(visible)
      .filter((dialog) => !dialog.closest('.gldn-modal-backdrop'));
    const dialogs = candidates.filter((dialog) => {
      const heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
      const title = normalize(heading?.textContent || dialog.getAttribute('aria-label') || '');
      return title === 'review fees';
    });
    if (dialogs.length !== 1) {
      return {
        ok: false,
        stage: 'unknown',
        error: dialogs.length
          ? 'Expected exactly one eBay Review fees dialog.'
          : 'The exact eBay Review fees dialog is not visible yet.',
        matchingDialogs: dialogs.length,
        visibleDialogTitles: candidates.map((dialog) => normalize(
          dialog.querySelector('h1, h2, h3, [role="heading"]')?.textContent
            || dialog.getAttribute('aria-label')
            || ''
        )).filter(Boolean).slice(0, 12)
      };
    }
    const dialog = dialogs[0];
    const heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
    const title = normalize(heading?.textContent || dialog.getAttribute('aria-label') || '');
    const dialogText = String(dialog.innerText || dialog.textContent || '').replace(/\\s+/g, ' ').trim();
    const buttons = [...dialog.querySelectorAll('button, [role="button"]')]
      .filter(visible)
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true')
      .map((button) => ({
        element: button,
        label: normalize(button.getAttribute('aria-label') || button.innerText || button.textContent || button.title),
        id: String(button.id || '')
      }))
      .filter((button) => button.label);
    const safeActions = buttons.filter((button) => (
      /^(?:submit|submit changes|submit listings|confirm|confirm and submit|confirm & submit|revise|revise listings)$/.test(button.label)
    ));
    const fingerprintSource = [
      title,
      expectedCount,
      expectedDestination,
      dialogText.slice(0, 1200),
      buttons.map((button) => button.label).join('|')
    ].join('||');
    let hash = 2166136261;
    for (let index = 0; index < fingerprintSource.length; index += 1) {
      hash ^= fingerprintSource.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const fingerprint = 'review-fees-' + (hash >>> 0).toString(16).padStart(8, '0');
    const response = {
      ok: safeActions.length === 1,
      stage: 'review-fees',
      title,
      dialogText: dialogText.slice(0, 1600),
      buttons: buttons.map(({ label, id }) => ({ label, id })).slice(0, 20),
      safeActionLabel: safeActions.length === 1 ? safeActions[0].label : '',
      safeActionCount: safeActions.length,
      fingerprint,
      url: location.href,
      pageTitle: document.title
    };
    if (safeActions.length !== 1) {
      response.error = 'Expected exactly one final action inside eBay Review fees.';
      return response;
    }
    if (expectedFingerprint && fingerprint !== expectedFingerprint) {
      return { ...response, ok: false, error: 'The eBay Review fees content changed after inspection.' };
    }
    if (expectedActionLabel && safeActions[0].label !== expectedActionLabel) {
      return { ...response, ok: false, error: 'The eBay Review fees action changed after inspection.' };
    }
    if (!prepareTarget && !activateTarget) return response;
    const button = safeActions[0].element;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === button || button.contains(hit) || hit.contains(button))) {
      return { ...response, ok: false, error: 'The eBay Review fees action is not the hit-tested target.' };
    }
    if (activateTarget) {
      button.click();
      return { ...response, activated: true, x, y, targetId: String(button.id || '') };
    }
    return { ...response, x, y, targetId: String(button.id || '') };
  })()`;
}

async function evaluateMove99FinalReviewProbe(target, approved, options = {}) {
  const evaluation = await debuggerCommand(target, 'Runtime.evaluate', {
    expression: buildMove99FinalReviewProbe(
      approved.expectedCount,
      approved.destinationCategory,
      options
    ),
    returnByValue: true,
    awaitPromise: true
  });
  if (evaluation.exceptionDetails) throw new Error('The eBay Review fees probe failed.');
  return evaluation?.result?.value || { ok: false, stage: 'unknown', error: 'The eBay Review fees probe returned no result.' };
}

async function waitForMove99FinalReviewProbe(target, approved, timeoutMs = 20000) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs || 20000));
  let lastProbe = null;
  while (Date.now() < deadline) {
    try {
      lastProbe = await evaluateMove99FinalReviewProbe(target, approved);
      if (lastProbe?.stage === 'result' || lastProbe?.stage === 'review-fees') return lastProbe;
    } catch (_) {
      // eBay can replace the execution context while opening the final modal.
    }
    await controlDelay(300);
  }
  return lastProbe || { ok: false, stage: 'unknown', error: 'eBay did not expose Review fees or an explicit result before the safety timeout.' };
}

function move99FinalReviewEvidenceFromProbe(probe, approved, tab) {
  return {
    expectedCount: approved.expectedCount,
    workspaceId: approved.workspaceId,
    batchKey: approved.batchKey,
    destinationCategory: approved.destinationCategory,
    tabId: tab.id,
    url: tab.url,
    title: String(probe.title || ''),
    fingerprint: String(probe.fingerprint || ''),
    safeActionLabel: String(probe.safeActionLabel || ''),
    buttons: Array.isArray(probe.buttons) ? probe.buttons.slice(0, 20) : [],
    dialogText: String(probe.dialogText || '').slice(0, 1600),
    inspectedAt: new Date().toISOString()
  };
}

function recordTrustedMove99SubmittedBatch(state, result) {
  const sourceIds = [...new Set((state.currentBatchIds || []).map(String).filter(Boolean))];
  const omitted = new Set((state.bulkEditorOmittedIds || []).map(String));
  const admittedIds = sourceIds.filter((itemId) => !omitted.has(itemId));
  const exactAllLive = result.confirmed
    && Number(result.failed || 0) === 0
    && Number(result.live || 0) === Number(state.currentBatchCount || admittedIds.length || 0);
  const processedIds = new Set((state.processedIds || []).map(String));
  if (exactAllLive) admittedIds.forEach((itemId) => processedIds.add(itemId));
  const failedIds = new Set((state.failedIds || []).map(String));
  sourceIds.filter((itemId) => omitted.has(itemId)).forEach((itemId) => failedIds.add(itemId));
  if (!exactAllLive) admittedIds.forEach((itemId) => failedIds.add(itemId));
  const batchKey = String(state.currentBatchKey || '');
  const submittedBatchKeys = new Set((state.submittedBatchKeys || []).map(String));
  if (batchKey) submittedBatchKeys.add(batchKey);
  const batchHistory = Array.isArray(state.batchHistory) ? [...state.batchHistory] : [];
  batchHistory.push({
    batchKey,
    itemIds: sourceIds,
    admittedIds,
    expected: Number(state.currentBatchCount || 0),
    live: Number(result.live || 0),
    failed: Number(result.failed || 0),
    confirmed: Boolean(result.confirmed),
    capturedAt: result.capturedAt || new Date().toISOString()
  });
  const totals = state.totals || {};
  const recorded = {
    ...state,
    processedIds: [...processedIds],
    failedIds: [...failedIds],
    submittedBatchKeys: [...submittedBatchKeys],
    batchHistory: batchHistory.slice(-100),
    submitResult: result,
    totals: {
      batches: Number(totals.batches || 0) + 1,
      selected: Number(totals.selected || 0) + Number(state.currentBatchSourceCount || sourceIds.length || state.currentBatchCount || 0),
      categoryApplied: Number(totals.categoryApplied || 0) + Number(state.currentBatchCount || 0),
      live: Number(totals.live || 0) + Number(result.live || 0),
      failed: Number(totals.failed || 0) + Number(result.failed || 0)
    }
  };
  const exactBatches = Array.isArray(state.exactBatches) ? state.exactBatches : [];
  const nextIndex = Number(state.applyIndex || 0) + 1;
  const completedAt = new Date().toISOString();
  const failed = Number(result.failed || 0);
  const phase = !result.confirmed
    ? 'submitted-result-uncertain'
    : (failed ? 'submitted-with-failures' : 'submitted');
  return {
    ...recorded,
    active: false,
    confirmed: true,
    phase,
    reviewReady: false,
    reviewRequested: false,
    reviewRequestedAt: '',
    applyIndex: nextIndex,
    remainingSavedBatchCount: Math.max(0, exactBatches.length - nextIndex),
    submittedBatchIds: sourceIds,
    currentBatchIds: [],
    currentBatchCount: 0,
    currentBatchSourceCount: 0,
    currentBatchKey: '',
    submitResultUnknown: !result.confirmed,
    propagationPending: true,
    propagationPendingAt: completedAt,
    terminalAfterSubmit: true,
    completedAt,
    error: !result.confirmed
      ? `eBay accounted for ${Number(result.accounted || 0)} of ${Number(result.expected || 0)} submitted listings. The workflow stopped and did not rescan.`
      : (failed ? `${failed} listings failed during eBay submission.` : ''),
    updatedAt: completedAt
  };
}

function stopTrustedMove99ForPropagation(state, approved, submittedAt = new Date().toISOString()) {
  const sourceIds = [...new Set((state.currentBatchIds || []).map(String).filter(Boolean))];
  const batchKey = String(state.currentBatchKey || approved.batchKey || '');
  const submittedBatchKeys = new Set((state.submittedBatchKeys || []).map(String));
  const alreadyRecorded = batchKey && submittedBatchKeys.has(batchKey);
  if (batchKey) submittedBatchKeys.add(batchKey);
  const batchHistory = Array.isArray(state.batchHistory) ? [...state.batchHistory] : [];
  if (!alreadyRecorded) {
    batchHistory.push({
      batchKey,
      itemIds: sourceIds,
      admittedIds: sourceIds,
      expected: Number(approved.expectedCount || state.currentBatchCount || sourceIds.length),
      live: null,
      failed: null,
      confirmed: false,
      status: 'submitted-propagation-pending',
      capturedAt: submittedAt
    });
  }
  const totals = state.totals || {};
  const exactBatches = Array.isArray(state.exactBatches) ? state.exactBatches : [];
  const nextIndex = Number(state.applyIndex || 0) + 1;
  return {
    ...state,
    active: false,
    confirmed: true,
    phase: 'submitted-propagation-pending',
    reviewReady: false,
    reviewRequested: false,
    reviewRequestedAt: '',
    propagationPending: true,
    propagationPendingAt: submittedAt,
    terminalAfterSubmit: true,
    submittedBatchIds: sourceIds,
    submittedBatchKeys: [...submittedBatchKeys],
    batchHistory: batchHistory.slice(-100),
    applyIndex: nextIndex,
    remainingSavedBatchCount: Math.max(0, exactBatches.length - nextIndex),
    currentBatchIds: [],
    currentBatchCount: 0,
    currentBatchSourceCount: 0,
    currentBatchKey: '',
    submitResult: null,
    submitResultUnknown: false,
    totals: alreadyRecorded ? totals : {
      ...totals,
      batches: Number(totals.batches || 0) + 1,
      selected: Number(totals.selected || 0) + Number(approved.expectedCount || sourceIds.length),
      categoryApplied: Number(totals.categoryApplied || 0) + Number(approved.expectedCount || sourceIds.length)
    },
    error: '',
    completedAt: submittedAt,
    updatedAt: submittedAt
  };
}

async function persistTrustedMove99Result(result) {
  const stored = await storageGet(['pendingMove99Run']);
  const pending = stored.pendingMove99Run;
  const recorded = recordTrustedMove99SubmittedBatch(pending, result);
  await storageSet({
    pendingMove99Run: recorded,
    lastMove99Scan: FOUNDATION.compactMove99HistoryRecord(recorded)
  });
  return recorded;
}

async function inspectTrustedMove99FinalReview(tab, request, { persistEvidence = false } = {}) {
  const stored = await storageGet(['pendingMove99Run']);
  const pending = stored.pendingMove99Run;
  const approved = validateTrustedMove99FinalReviewContext(pending, request, tab.id, tab.url, { allowFinalDispatch: true });
  const target = { tabId: tab.id };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    const probe = await evaluateMove99FinalReviewProbe(target, approved);
    let evidence = null;
    if (probe?.stage === 'review-fees' && probe?.ok) {
      evidence = move99FinalReviewEvidenceFromProbe(probe, approved, tab);
      if (persistEvidence) {
        const refreshed = await storageGet(['pendingMove99Run']);
        await storageSet({
          pendingMove99Run: {
            ...(refreshed.pendingMove99Run || pending),
            finalReviewEvidence: evidence,
            updatedAt: evidence.inspectedAt
          }
        });
      }
    }
    return {
      ok: probe?.ok === true,
      tab: controlTabSummary(tab),
      expectedCount: approved.expectedCount,
      workspaceId: approved.workspaceId,
      destinationCategory: approved.destinationCategory,
      probe,
      evidence
    };
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

async function monitorTrustedMove99SubmitResult(target, approved, timeoutMs = 60000) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs || 60000));
  let lastProbe = null;
  while (Date.now() < deadline) {
    try {
      lastProbe = await evaluateMove99FinalReviewProbe(target, approved);
      if (lastProbe?.stage === 'result' && lastProbe?.result) return lastProbe.result;
    } catch (_) {
      // Navigation can briefly replace the execution context after final Submit.
    }
    await controlDelay(500);
  }
  return null;
}

async function dispatchTrustedMove99FinalReview(tab, request, options = {}) {
  let stored = await storageGet(['pendingMove99Run']);
  let pending = stored.pendingMove99Run;
  const approved = validateTrustedMove99FinalReviewContext(pending, request, tab.id, tab.url);
  const target = options.target || { tabId: tab.id };
  let attached = false;
  let dispatchRecorded = false;
  try {
    if (!options.target) {
      await debuggerAttach(target);
      attached = true;
    }
    const initialProbe = await waitForMove99FinalReviewProbe(target, approved, options.waitForModalMs || 20000);
    if (initialProbe?.stage === 'result' && initialProbe.result) {
      const recorded = await persistTrustedMove99Result(initialProbe.result);
      return { ok: true, dispatched: false, alreadySubmitted: true, result: initialProbe.result, phase: recorded.phase };
    }
    if (initialProbe?.stage !== 'review-fees' || initialProbe?.ok !== true) {
      throw new Error(initialProbe?.error || 'The exact eBay Review fees dialog could not be verified.');
    }
    const evidence = move99FinalReviewEvidenceFromProbe(initialProbe, approved, tab);
    const targetProbe = await evaluateMove99FinalReviewProbe(target, approved, {
      expectedFingerprint: evidence.fingerprint,
      expectedActionLabel: evidence.safeActionLabel,
      prepareTarget: true
    });
    if (!targetProbe?.ok || targetProbe?.stage !== 'review-fees'
        || !Number.isFinite(targetProbe.x) || !Number.isFinite(targetProbe.y)
        || targetProbe.safeActionLabel !== evidence.safeActionLabel
        || targetProbe.fingerprint !== evidence.fingerprint) {
      throw new Error(targetProbe?.error || 'The exact eBay Review fees action could not be verified.');
    }

    stored = await storageGet(['pendingMove99Run']);
    pending = stored.pendingMove99Run;
    validateTrustedMove99FinalReviewContext(pending, request, tab.id, tab.url);
    const dispatchAt = new Date().toISOString();
    await storageSet({
      pendingMove99Run: {
        ...pending,
        phase: 'awaiting-submit-result',
        finalReviewEvidence: evidence,
        finalReviewActionClickCount: 1,
        trustedFinalReviewDispatchAt: dispatchAt,
        trustedFinalReviewWorkspaceId: approved.workspaceId,
        trustedFinalReviewBatchKey: approved.batchKey,
        trustedFinalReviewTarget: {
          id: String(targetProbe.targetId || ''),
          label: String(targetProbe.safeActionLabel || ''),
          x: Math.round(targetProbe.x),
          y: Math.round(targetProbe.y)
        },
        updatedAt: dispatchAt
      }
    });
    dispatchRecorded = true;
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: targetProbe.x,
      y: targetProbe.y,
      button: 'left',
      clickCount: 1
    });
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: targetProbe.x,
      y: targetProbe.y,
      button: 'left',
      clickCount: 1
    });
    const releasedAt = new Date().toISOString();
    const refreshed = await storageGet(['pendingMove99Run']);
    await storageSet({
      pendingMove99Run: {
        ...(refreshed.pendingMove99Run || pending),
        trustedFinalReviewReleasedAt: releasedAt,
        updatedAt: releasedAt
      }
    });

    const latest = await storageGet(['pendingMove99Run']);
    const recorded = stopTrustedMove99ForPropagation(latest.pendingMove99Run || pending, approved, releasedAt);
    await storageSet({
      pendingMove99Run: recorded,
      lastMove99Scan: FOUNDATION.compactMove99HistoryRecord(recorded)
    });
    return {
      ok: true,
      dispatched: true,
      expectedCount: approved.expectedCount,
      workspaceId: approved.workspaceId,
      target: { id: targetProbe.targetId, label: targetProbe.safeActionLabel },
      propagationPending: true,
      phase: recorded.phase
    };
  } catch (error) {
    error.dispatchRecorded = dispatchRecorded;
    throw error;
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

async function recoverTrustedMove99FinalReviewNoEffect(tab, request) {
  let stored = await storageGet(['pendingMove99Run']);
  let pending = stored.pendingMove99Run;
  const approved = validateTrustedMove99FinalReviewContext(
    pending,
    request,
    tab.id,
    tab.url,
    { allowFinalDispatch: true }
  );
  if (String(pending?.phase || '') !== 'manual-reconciliation-required'
      || Number(pending?.finalReviewActionClickCount || 0) !== 1
      || Number(pending?.finalReviewRecoveryClickCount || 0) !== 0) {
    throw new Error('The unchanged eBay Review fees dialog is not eligible for a bounded recovery click.');
  }
  const originalEvidence = pending?.finalReviewEvidence || {};
  if (!originalEvidence.fingerprint || originalEvidence.safeActionLabel !== 'submit') {
    throw new Error('The original eBay Review fees evidence is incomplete.');
  }

  const focusedTab = await updateChromeTab(tab.id, { active: true });
  await focusChromeWindow(focusedTab.windowId);
  await controlDelay(250);

  const target = { tabId: tab.id };
  let attached = false;
  let dispatchRecorded = false;
  try {
    await debuggerAttach(target);
    attached = true;
    const probe = await evaluateMove99FinalReviewProbe(target, approved, {
      expectedFingerprint: originalEvidence.fingerprint,
      expectedActionLabel: originalEvidence.safeActionLabel,
      prepareTarget: true
    });
    if (!probe?.ok || probe?.stage !== 'review-fees'
        || probe.fingerprint !== originalEvidence.fingerprint
        || probe.safeActionLabel !== originalEvidence.safeActionLabel
        || !Number.isFinite(probe.x) || !Number.isFinite(probe.y)) {
      throw new Error(probe?.error || 'The unchanged eBay Review fees dialog could not be verified for recovery.');
    }

    stored = await storageGet(['pendingMove99Run']);
    pending = stored.pendingMove99Run;
    validateTrustedMove99FinalReviewContext(
      pending,
      request,
      tab.id,
      tab.url,
      { allowFinalDispatch: true }
    );
    if (Number(pending?.finalReviewRecoveryClickCount || 0) !== 0) {
      throw new Error('The eBay Review fees recovery action was already attempted.');
    }
    const dispatchAt = new Date().toISOString();
    await storageSet({
      pendingMove99Run: {
        ...pending,
        phase: 'awaiting-submit-result',
        reviewReady: false,
        finalReviewRecoveryClickCount: 1,
        trustedFinalReviewRecoveryDispatchAt: dispatchAt,
        trustedFinalReviewRecoveryTarget: {
          id: String(probe.targetId || ''),
          label: String(probe.safeActionLabel || ''),
          x: Math.round(probe.x),
          y: Math.round(probe.y)
        },
        error: '',
        updatedAt: dispatchAt
      }
    });
    dispatchRecorded = true;
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    const releasedAt = new Date().toISOString();
    stored = await storageGet(['pendingMove99Run']);
    await storageSet({
      pendingMove99Run: {
        ...(stored.pendingMove99Run || pending),
        trustedFinalReviewRecoveryReleasedAt: releasedAt,
        updatedAt: releasedAt
      }
    });

    const result = await monitorTrustedMove99SubmitResult(target, approved, 60000);
    if (result) {
      const recorded = await persistTrustedMove99Result(result);
      return {
        ok: result.confirmed === true,
        recovered: true,
        expectedCount: approved.expectedCount,
        result,
        phase: recorded.phase
      };
    }

    const finalProbe = await evaluateMove99FinalReviewProbe(target, approved);
    const unchanged = finalProbe?.stage === 'review-fees'
      && finalProbe?.fingerprint === originalEvidence.fingerprint;
    const uncertainAt = new Date().toISOString();
    stored = await storageGet(['pendingMove99Run']);
    await storageSet({
      pendingMove99Run: {
        ...(stored.pendingMove99Run || pending),
        active: false,
        phase: 'manual-reconciliation-required',
        reviewReady: false,
        submitResultUnknown: true,
        finalReviewRecoveryNoEffect: unchanged,
        error: unchanged
          ? 'The unchanged eBay Review fees dialog remained after the one bounded recovery click. No further click was attempted.'
          : 'eBay changed the Review fees screen but did not show an explicit live or failed listing count. No further click was attempted.',
        updatedAt: uncertainAt
      }
    });
    return {
      ok: false,
      recovered: true,
      uncertain: true,
      unchanged,
      expectedCount: approved.expectedCount,
      probe: finalProbe,
      error: unchanged
        ? 'The eBay Review fees dialog did not react to the bounded recovery click.'
        : 'eBay changed state without exposing an exact result count.'
    };
  } catch (error) {
    error.dispatchRecorded = dispatchRecorded;
    throw error;
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

async function activateTrustedMove99FinalReviewNoEffect(tab, request) {
  let stored = await storageGet(['pendingMove99Run']);
  let pending = stored.pendingMove99Run;
  const approved = validateTrustedMove99FinalReviewContext(
    pending,
    request,
    tab.id,
    tab.url,
    { allowFinalDispatch: true }
  );
  if (pending?.finalReviewRecoveryNoEffect !== true
      || Number(pending?.finalReviewRecoveryClickCount || 0) !== 1
      || Number(pending?.finalReviewProgrammaticActivationCount || 0) !== 0) {
    throw new Error('The unchanged eBay Review fees dialog is not eligible for final activation recovery.');
  }
  const originalEvidence = pending?.finalReviewEvidence || {};
  if (!originalEvidence.fingerprint || originalEvidence.safeActionLabel !== 'submit') {
    throw new Error('The original eBay Review fees evidence is incomplete.');
  }

  const target = { tabId: tab.id };
  let attached = false;
  let activationRecorded = false;
  try {
    await debuggerAttach(target);
    attached = true;
    const probe = await evaluateMove99FinalReviewProbe(target, approved, {
      expectedFingerprint: originalEvidence.fingerprint,
      expectedActionLabel: originalEvidence.safeActionLabel,
      prepareTarget: true
    });
    if (!probe?.ok || probe?.stage !== 'review-fees'
        || probe.fingerprint !== originalEvidence.fingerprint
        || probe.safeActionLabel !== originalEvidence.safeActionLabel) {
      throw new Error(probe?.error || 'The unchanged eBay Review fees dialog could not be verified for final activation.');
    }

    stored = await storageGet(['pendingMove99Run']);
    pending = stored.pendingMove99Run;
    validateTrustedMove99FinalReviewContext(
      pending,
      request,
      tab.id,
      tab.url,
      { allowFinalDispatch: true }
    );
    if (Number(pending?.finalReviewProgrammaticActivationCount || 0) !== 0) {
      throw new Error('The eBay Review fees final activation was already attempted.');
    }
    const activatedAt = new Date().toISOString();
    await storageSet({
      pendingMove99Run: {
        ...pending,
        phase: 'awaiting-submit-result',
        reviewReady: false,
        finalReviewProgrammaticActivationCount: 1,
        trustedFinalReviewProgrammaticActivationAt: activatedAt,
        error: '',
        updatedAt: activatedAt
      }
    });
    activationRecorded = true;
    const activation = await evaluateMove99FinalReviewProbe(target, approved, {
      expectedFingerprint: originalEvidence.fingerprint,
      expectedActionLabel: originalEvidence.safeActionLabel,
      activateTarget: true
    });
    if (!activation?.ok || activation?.activated !== true) {
      throw new Error(activation?.error || 'The exact eBay Review fees action did not activate.');
    }

    const result = await monitorTrustedMove99SubmitResult(target, approved, 60000);
    if (result) {
      const recorded = await persistTrustedMove99Result(result);
      return {
        ok: result.confirmed === true,
        activated: true,
        expectedCount: approved.expectedCount,
        result,
        phase: recorded.phase
      };
    }

    const finalProbe = await evaluateMove99FinalReviewProbe(target, approved);
    const unchanged = finalProbe?.stage === 'review-fees'
      && finalProbe?.fingerprint === originalEvidence.fingerprint;
    const uncertainAt = new Date().toISOString();
    stored = await storageGet(['pendingMove99Run']);
    await storageSet({
      pendingMove99Run: {
        ...(stored.pendingMove99Run || pending),
        active: false,
        phase: 'manual-reconciliation-required',
        reviewReady: false,
        submitResultUnknown: true,
        finalReviewProgrammaticActivationNoEffect: unchanged,
        error: unchanged
          ? 'The unchanged eBay Review fees dialog remained after the final bounded activation. No further action was attempted.'
          : 'eBay changed the Review fees screen after final activation but did not show an explicit live or failed listing count.',
        updatedAt: uncertainAt
      }
    });
    return {
      ok: false,
      activated: true,
      uncertain: true,
      unchanged,
      expectedCount: approved.expectedCount,
      probe: finalProbe,
      error: unchanged
        ? 'The eBay Review fees dialog did not react to final activation.'
        : 'eBay changed state without exposing an exact result count.'
    };
  } catch (error) {
    error.dispatchRecorded = activationRecorded;
    throw error;
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

async function recoverTrustedEbayMove99SubmitNoEffect(message, sender, tab, pending) {
  const tabId = sender?.tab?.id;
  const approved = validateTrustedMove99FinalReviewContext(pending, message, tabId, tab.url);
  if (!isExactMove99ReviewUrl(sender?.tab?.url, approved.workspaceId)) {
    throw new Error('The Move .99 Submit recovery is limited to the approved eBay review workspace.');
  }
  if (Number(pending?.trustedSubmitRecoveryActivationCount || 0) !== 0) {
    throw new Error('The unchanged Move .99 Submit already received its one bounded recovery activation.');
  }
  const allowClearedSelection = trustedMove99ClearedSelectionAllowed(
    pending,
    approved.expectedCount,
    approved.workspaceId,
    tabId
  );

  const focusedTab = await updateChromeTab(tab.id, { active: true });
  await focusChromeWindow(focusedTab.windowId);
  await controlDelay(250);

  const target = { tabId };
  let attached = false;
  let activationRecorded = false;
  try {
    await debuggerAttach(target);
    attached = true;

    const initialProbe = await evaluateMove99FinalReviewProbe(target, approved);
    if (initialProbe?.stage === 'result' && initialProbe?.result) {
      const recorded = await persistTrustedMove99Result(initialProbe.result);
      return {
        ok: true,
        dispatched: true,
        recovered: true,
        alreadySubmitted: true,
        result: initialProbe.result,
        phase: recorded.phase
      };
    }
    if (initialProbe?.stage === 'review-fees' && initialProbe?.ok === true) {
      const finalResult = await dispatchTrustedMove99FinalReview(tab, message, { target });
      return { ...finalResult, dispatched: true, recovered: true };
    }

    const targetEvaluation = await debuggerCommand(target, 'Runtime.evaluate', {
      expression: buildMove99SubmitTargetProbe(
        approved.expectedCount,
        approved.destinationCategory,
        allowClearedSelection
      ),
      returnByValue: true,
      awaitPromise: true
    });
    if (targetEvaluation.exceptionDetails) throw new Error('The unchanged Move .99 Submit recovery probe failed.');
    const targetProbe = targetEvaluation?.result?.value;
    if (!targetProbe?.ok || !Number.isFinite(targetProbe.x) || !Number.isFinite(targetProbe.y)
        || targetProbe.label !== `submit (${approved.expectedCount})`) {
      throw new Error(targetProbe?.error || 'The unchanged Move .99 Submit target could not be verified.');
    }

    const activationAt = new Date().toISOString();
    const latestBeforeActivation = await storageGet(['pendingMove99Run']);
    const latestPending = latestBeforeActivation.pendingMove99Run;
    validateTrustedMove99FinalReviewContext(latestPending, message, tabId, tab.url);
    if (Number(latestPending?.trustedSubmitRecoveryActivationCount || 0) !== 0) {
      throw new Error('The unchanged Move .99 Submit recovery activation was already attempted.');
    }
    await storageSet({
      pendingMove99Run: {
        ...latestPending,
        trustedSubmitRecoveryActivationCount: 1,
        trustedSubmitRecoveryDispatchAt: activationAt,
        trustedSubmitRecoveryTarget: {
          id: String(targetProbe.id || ''),
          label: String(targetProbe.label || ''),
          x: Math.round(targetProbe.x),
          y: Math.round(targetProbe.y)
        },
        updatedAt: activationAt
      }
    });
    activationRecorded = true;

    const activationEvaluation = await debuggerCommand(target, 'Runtime.evaluate', {
      expression: buildMove99SubmitTargetProbe(
        approved.expectedCount,
        approved.destinationCategory,
        allowClearedSelection,
        { activateTarget: true }
      ),
      returnByValue: true,
      awaitPromise: true
    });
    if (activationEvaluation.exceptionDetails) throw new Error('The bounded Move .99 Submit recovery activation failed.');
    const activation = activationEvaluation?.result?.value;
    if (!activation?.ok || activation.activated !== true
        || activation.label !== `submit (${approved.expectedCount})`) {
      throw new Error(activation?.error || 'The bounded Move .99 Submit recovery did not activate the exact target.');
    }
    const releasedAt = new Date().toISOString();
    const refreshed = await storageGet(['pendingMove99Run']);
    await storageSet({
      pendingMove99Run: {
        ...(refreshed.pendingMove99Run || latestPending),
        trustedSubmitRecoveryReleasedAt: releasedAt,
        updatedAt: releasedAt
      }
    });

    const finalResult = await dispatchTrustedMove99FinalReview(tab, message, {
      target,
      waitForModalMs: 30000,
      resultTimeoutMs: 90000
    });
    return { ...finalResult, dispatched: true, recovered: true };
  } catch (error) {
    if (activationRecorded) {
      const failedAt = new Date().toISOString();
      const latest = await storageGet(['pendingMove99Run']);
      await storageSet({
        pendingMove99Run: {
          ...(latest.pendingMove99Run || pending),
          active: false,
          phase: 'manual-reconciliation-required',
          reviewReady: false,
          submitResultUnknown: true,
          error: error?.message || 'The bounded Move .99 Submit recovery did not produce a verifiable eBay transition.',
          updatedAt: failedAt
        }
      });
    }
    error.dispatchRecorded = activationRecorded;
    throw error;
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

async function dispatchTrustedEbayMove99Submit(message, sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId)) throw new Error('The exact Move .99 review tab could not be identified.');
  const [tab, stored] = await Promise.all([
    getTab(tabId),
    storageGet(['pendingMove99Run'])
  ]);
  const pending = stored.pendingMove99Run;
  if (pending?.trustedSubmitDispatchAt || pending?.trustedSubmitReleasedAt) {
    return recoverTrustedEbayMove99SubmitNoEffect(message, sender, tab, pending);
  }
  const approved = validateTrustedMove99Dispatch(pending, message, tabId, tab.url);
  if (!isExactMove99ReviewUrl(sender?.tab?.url, approved.workspaceId)) {
    throw new Error('The trusted Move .99 dispatch is limited to the approved eBay review workspace.');
  }
  const target = { tabId };
  let attached = false;
  let dispatchRecorded = false;
  try {
    await debuggerAttach(target);
    attached = true;
    const evaluation = await debuggerCommand(target, 'Runtime.evaluate', {
      expression: buildMove99SubmitTargetProbe(
        approved.expectedCount,
        approved.destinationCategory,
        approved.allowClearedSelection
      ),
      returnByValue: true,
      awaitPromise: true
    });
    if (evaluation.exceptionDetails) throw new Error('The Move .99 Submit probe failed.');
    const probe = evaluation?.result?.value;
    if (!probe?.ok || !Number.isFinite(probe.x) || !Number.isFinite(probe.y)
        || probe.label !== `submit (${approved.expectedCount})`) {
      throw new Error(probe?.error || 'The approved Move .99 Submit target could not be verified.');
    }

    const dispatchAt = new Date().toISOString();
    await storageSet({
      pendingMove99Run: {
        ...pending,
        approvalActionObservedAt: dispatchAt,
        approvalAction: 'submit',
        finalActionApprovedAt: dispatchAt,
        finalActionApprovalToken: `APPROVE SUBMIT ${approved.expectedCount}`,
        finalActionClickCount: 1,
        trustedSubmitDispatchAt: dispatchAt,
        trustedSubmitWorkspaceId: approved.workspaceId,
        trustedSubmitBatchKey: approved.batchKey,
        trustedSubmitTarget: {
          id: String(probe.id || ''),
          label: String(probe.label || ''),
          x: Math.round(probe.x),
          y: Math.round(probe.y)
        },
        updatedAt: dispatchAt
      }
    });
    dispatchRecorded = true;
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    await debuggerCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: probe.x,
      y: probe.y,
      button: 'left',
      clickCount: 1
    });
    const releasedAt = new Date().toISOString();
    const refreshed = await storageGet(['pendingMove99Run']);
    await storageSet({
      pendingMove99Run: {
        ...(refreshed.pendingMove99Run || pending),
        trustedSubmitReleasedAt: releasedAt,
        updatedAt: releasedAt
      }
    });
    setTimeout(() => {
      dispatchTrustedMove99FinalReview(tab, {
        expectedCount: approved.expectedCount,
        workspaceId: approved.workspaceId,
        confirmationToken: `APPROVE SUBMIT ${approved.expectedCount}`
      }).catch((error) => {
        recordExtensionLog({
          source: 'move99',
          operation: 'review-fees-final-action',
          level: 'error',
          message: error?.message || String(error)
        });
      });
    }, 250);
    return {
      ok: true,
      dispatched: true,
      expectedCount: approved.expectedCount,
      workspaceId: approved.workspaceId,
      target: { id: probe.id, label: probe.label },
      finalReviewPending: true
    };
  } catch (error) {
    error.dispatchRecorded = dispatchRecorded;
    throw error;
  } finally {
    if (attached) await debuggerDetach(target);
  }
}

async function resumePendingTrustedMove99FinalReview() {
  const stored = await storageGet(['pendingMove99Run']);
  const pending = stored.pendingMove99Run;
  const expectedCount = Number(pending?.currentBatchCount || 0);
  if (!pending?.trustedSubmitDispatchAt || !pending?.trustedSubmitReleasedAt
      || Number(pending?.finalActionClickCount || 0) !== 1
      || pending?.finalActionApprovalToken !== `APPROVE SUBMIT ${expectedCount}`
      || pending?.trustedFinalReviewDispatchAt || pending?.trustedFinalReviewReleasedAt
      || Number(pending?.finalReviewActionClickCount || 0) > 0) {
    return { ok: true, resumed: false };
  }
  const tabId = Number(pending?.approvalTabId || 0);
  if (!Number.isInteger(tabId) || tabId <= 0) return { ok: true, resumed: false };
  const tab = await getTab(tabId);
  const result = await dispatchTrustedMove99FinalReview(tab, {
    expectedCount,
    workspaceId: String(pending.approvalWorkspaceId || ''),
    confirmationToken: `APPROVE SUBMIT ${expectedCount}`
  });
  return { ok: result?.ok !== false, resumed: true, result };
}

async function clearIncompatibleMove99State() {
  const stored = await storageGet(['pendingMove99Run']);
  const pending = stored.pendingMove99Run;
  if (!pending || String(pending.extensionVersion || '') === EXTENSION_VERSION) return false;
  const migrated = FOUNDATION.migratePortableMove99Summary(pending, EXTENSION_VERSION);
  if (migrated) {
    await storageSet({ pendingMove99Run: migrated, lastMove99Scan: FOUNDATION.compactMove99HistoryRecord(migrated) });
    recordExtensionLog({
      source: 'move99',
      level: 'info',
      operation: 'version-migration',
      message: `Preserved a verified read-only Move .99 scan from extension v${pending.extensionVersion || 'unknown'} for review in v${EXTENSION_VERSION}.`
    });
    return true;
  }
  await storageRemove(['pendingMove99Run']);
  recordExtensionLog({
    source: 'move99',
    level: 'info',
    operation: 'version-migration',
    message: `Cleared unfinished Move .99 state from extension v${pending.extensionVersion || 'unknown'} before loading v${EXTENSION_VERSION}.`
  });
  return true;
}

function tabExists(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId)) {
      resolve(false);
      return;
    }
    chrome.tabs.get(tabId, (tab) => {
      resolve(!chrome.runtime.lastError && Boolean(tab));
    });
  });
}

function claimMove99Tab(senderTabId, requestedRunId) {
  const claim = move99ClaimQueue.then(async () => {
    if (!Number.isInteger(senderTabId)) {
      return { ok: false, owned: false, error: 'The current eBay tab could not be identified.' };
    }

    const stored = await storageGet(['pendingMove99Run']);
    const state = stored.pendingMove99Run;
    if (!state) return { ok: false, owned: false, error: 'No Move .99 run is pending.' };

    const runId = String(state.runId || state.startedAt || '');
    if (requestedRunId && runId && String(requestedRunId) !== runId) {
      return { ok: false, owned: false, stale: true, ownerTabId: state.ownerTabId ?? null };
    }

    if (state.phase === 'awaiting-submit-approval' || state.phase === 'approval-lost') {
      const approvalTabId = Number(state.approvalTabId ?? state.ownerTabId);
      return {
        ok: Number.isInteger(approvalTabId),
        owned: approvalTabId === senderTabId,
        ownerTabId: Number.isInteger(approvalTabId) ? approvalTabId : null,
        runId,
        approvalLocked: true,
        error: Number.isInteger(approvalTabId) ? '' : 'The saved Move .99 approval tab is missing.'
      };
    }

    let ownerTabId = Number(state.ownerTabId);
    if (Number.isInteger(ownerTabId) && ownerTabId !== senderTabId && !(await tabExists(ownerTabId))) {
      ownerTabId = NaN;
    }
    if (!Number.isInteger(ownerTabId)) {
      ownerTabId = senderTabId;
      await storageSet({ pendingMove99Run: { ...state, ownerTabId, runId } });
    }

    return { ok: true, owned: ownerTabId === senderTabId, ownerTabId, runId };
  });
  move99ClaimQueue = claim.then(() => undefined, () => undefined);
  return claim;
}

function createChromeTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const error = chrome.runtime.lastError;
      if (error || !Number.isInteger(tab?.id)) {
        reject(new Error(error?.message || 'Chrome did not create the Move .99 tab.'));
        return;
      }
      resolve(tab);
    });
  });
}

function updateChromeTab(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      const error = chrome.runtime.lastError;
      if (error || !tab) {
        reject(new Error(error?.message || 'Chrome did not open eBay in the Move .99 tab.'));
        return;
      }
      resolve(tab);
    });
  });
}

function reloadChromeTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, {}, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || 'Chrome did not reload the GLDN Ops tab.'));
        return;
      }
      resolve();
    });
  });
}

function closeChromeTab(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId)) {
      resolve();
      return;
    }
    chrome.tabs.remove(tabId, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function move99ActiveUrl(sourceStoreCategoryIds) {
  const ids = Array.isArray(sourceStoreCategoryIds)
    ? sourceStoreCategoryIds.map(String).map((value) => value.trim()).filter(Boolean)
    : [];
  const url = new URL('https://www.ebay.com/sh/lst/active');
  if (ids.length) {
    url.searchParams.set('storeCatIds', ids.join(','));
    url.searchParams.set('source', 'filterpanel');
    url.searchParams.set('action', 'search');
  }
  return url.toString();
}

async function startMove99WorkflowFromExtension(message = {}) {
  const scanMode = message.scanMode === 'non99' ? 'non99' : 'price99';
  const saleEventDecision = scanMode === 'non99'
    ? FOUNDATION.reverseMove99SaleEventDecision(message.saleEventStatus)
    : { ok: true, status: '' };
  if (!saleEventDecision.ok) throw new Error(saleEventDecision.error);
  const reservation = await claimWorkflowStart('move99', 'Move .99');
  if (!reservation.ok) throw new Error(reservation.error);
  let runId = '';
  let runTab = null;
  let stateReserved = false;
  try {
  const stored = await storageGet(['computerLabel', 'ebayAccountLabel', 'move99AccountSettings']);
  const identity = identityForComputer(stored.computerLabel);
  const account = FOUNDATION.normalizeEbayAccount(identity.ebayAccountLabel || stored.ebayAccountLabel);
  if (!account) {
    throw new Error(identity.poshmarkOnly
      ? 'Computer 7 is Poshmark-only. Move .99 is disabled for it.'
      : 'Choose and save this computer before starting Move .99.');
  }

  const saved = stored.move99AccountSettings?.[account] || {};
  const settings = FOUNDATION.move99SettingsForAccount(account, saved);
  const validation = FOUNDATION.validateMove99Settings(settings);
  if (!validation.ok) throw new Error(validation.errors[0] || 'Move .99 categories are not configured.');

  const normalized = validation.settings;
  const sourceCategories = scanMode === 'non99' ? [normalized.destinationCategory] : normalized.sourceCategories;
  const destinationCategory = scanMode === 'non99' ? normalized.sourceCategories[0] : normalized.destinationCategory;
  const sourceStoreCategoryIds = scanMode === 'non99' ? [] : normalized.sourceStoreCategoryIds;
  const activeUrl = move99ActiveUrl(sourceStoreCategoryIds);
  runId = globalThis.crypto?.randomUUID?.() || `move99-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startedAt = new Date().toISOString();
  const runState = {
    active: true,
    confirmed: true,
    runId,
    ownerTabId: null,
    phase: 'starting-tab',
    scanMode,
    saleEventStatus: saleEventDecision.status,
    saleEventConfirmedAt: scanMode === 'non99' ? startedAt : '',
    scanStrategy: 'active-page-exact-id-v1',
    ebayAccountLabel: account,
    currentPage: 1,
    scanPages: {},
    verificationPages: {},
    failedIds: [],
    processedIds: [],
    totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
    startedAt,
    sourceCategories,
    destinationCategory,
    sourceStoreCategoryIds,
    backburnerItemIds: normalized.backburnerItemIds
  };
  await storageSet({
    gldnStopRequested: false,
    pendingMove99Run: runState
  });
  stateReserved = true;
  await releaseWorkflowStart(reservation.token);
  runTab = await createChromeTab({ url: 'about:blank', active: true });
  await storageSet({
      gldnStopRequested: false,
      pendingMove99Run: {
        ...runState,
        ownerTabId: runTab.id,
        phase: 'active-prepare',
      }
  });
  await updateChromeTab(runTab.id, { url: activeUrl, active: true });
  return { ok: true, started: true, tabId: runTab.id, runId, account, scanMode, activeUrl };
  } catch (error) {
    if (stateReserved && runId) {
      const current = await storageGet(['pendingMove99Run']).catch(() => ({}));
      if (current.pendingMove99Run?.runId === runId) await storageRemove(['pendingMove99Run']).catch(() => {});
    }
    await releaseWorkflowStart(reservation.token).catch(() => {});
    if (runTab?.id) await closeChromeTab(runTab.id);
    throw error;
  }
}

async function clearIncompatibleWorkflowState(reason = 'extension-start') {
  const stored = await storageGet([...VERSIONED_WORKFLOW_KEYS, 'gldnOpenReviews']);
  const remove = [];
  for (const key of VERSIONED_WORKFLOW_KEYS) {
    const value = stored[key];
    if (value == null || value === false) continue;
    if (value === true || typeof value !== 'object' || String(value.extensionVersion || '') !== EXTENSION_VERSION) {
      remove.push(key);
    }
  }
  const reviews = stored.gldnOpenReviews && typeof stored.gldnOpenReviews === 'object'
    ? stored.gldnOpenReviews
    : {};
  const compatibleReviews = Object.fromEntries(Object.entries(reviews).filter(([, review]) => (
    review?.active === true
      && String(review.extensionVersion || '') === EXTENSION_VERSION
      && Number(review.expiresAt || 0) > Date.now()
  )));
  const reviewsChanged = Object.keys(compatibleReviews).length !== Object.keys(reviews).length;
  if (remove.length) await storageRemove(remove);
  if (reviewsChanged) await storageSet({ gldnOpenReviews: compatibleReviews });
  if (!remove.length && !reviewsChanged) return { ok: true, changed: false };
  await recordExtensionLog({
    source: 'foundation',
    level: 'info',
    operation: 'workflow-version-migration',
    message: `Cleared workflow state from an incompatible extension context: ${[...remove, ...(reviewsChanged ? ['gldnOpenReviews'] : [])].join(', ')}.`,
    detail: reason
  });
  return { ok: true, changed: true, removed: remove, reviewsChanged };
}

async function clearRemovedBulkAutomationState() {
  const keys = [
    'pendingEcomSniperBulkExtract',
    'pendingManualEcomSniperClick',
    'pendingAmazonBulkWorkflowStart',
    'bulkLinksAmazonQueue'
  ];
  const stored = await storageGet([...keys, 'findProductsWorkflow']);
  const removed = keys.filter((key) => stored[key] != null);
  const workflow = stored.findProductsWorkflow && typeof stored.findProductsWorkflow === 'object'
    ? stored.findProductsWorkflow
    : null;
  const nestedWorkflows = workflow?.workflows && typeof workflow.workflows === 'object'
    ? workflow.workflows
    : null;
  const hadLegacyBulkListing = Boolean(nestedWorkflows && Object.prototype.hasOwnProperty.call(nestedWorkflows, 'bulkListing'));
  if (!removed.length && !hadLegacyBulkListing) return false;
  if (removed.length) await storageRemove(removed);
  if (hadLegacyBulkListing) {
    const { bulkListing: _retiredBulkListing, ...remainingWorkflows } = nestedWorkflows;
    await storageSet({
      findProductsWorkflow: {
        ...workflow,
        workflows: remainingWorkflows,
        savedAt: new Date().toISOString()
      }
    });
  }
  await recordExtensionLog({
    source: 'ecomsniper',
    level: 'info',
    operation: 'removed-bulk-automation-migration',
    message: `Cleared retired Bulk Listing automation state: ${[...removed, ...(hadLegacyBulkListing ? ['findProductsWorkflow.workflows.bulkListing'] : [])].join(', ')}.`
  });
  return true;
}

async function createMove99BulkWorkspace(tabId, request = {}) {
  if (!Number.isInteger(tabId)) {
    return { ok: false, error: 'The current eBay tab could not be identified.' };
  }

  const requestedIds = Array.isArray(request.itemIds) ? request.itemIds : [];
  const itemIds = [...new Set(requestedIds.map(String).filter((itemId) => /^\d{9,15}$/.test(itemId)))];
  if (!itemIds.length || itemIds.length > 2000 || itemIds.length !== requestedIds.length) {
    return { ok: false, error: 'The exact Move .99 batch must contain 1 to 2,000 unique eBay item numbers.' };
  }

  try {
    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (args) => {
        try {
          if (!/(^|\.)ebay\.com$/i.test(location.hostname)) {
            throw new Error('The active tab is not an eBay page.');
          }

          const requestedItemIds = Array.isArray(args.itemIds) ? args.itemIds : [];
          const exactIds = [...new Set(requestedItemIds.map(String))];
          if (!exactIds.length || exactIds.length > 2000 || exactIds.length !== requestedItemIds.length
            || exactIds.some((itemId) => !/^\d{9,15}$/.test(itemId))) {
            throw new Error('The exact eBay item-number batch is invalid.');
          }

          const clientUuid = crypto.randomUUID();
          const refererPathname = location.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
          const returnUrl = encodeURIComponent(String(args.returnUrl || location.href));
          const initParams = new URLSearchParams({
            actionType: 'REVISE',
            refererPathname,
            _: String(Date.now())
          });
          const initResponse = await fetch(`/bulksell/switch-init?${initParams.toString()}`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
          });
          if (!initResponse.ok) {
            throw new Error(`eBay workspace initialization returned HTTP ${initResponse.status}.`);
          }
          const init = await initResponse.json();
          const token = String(init?.token || '');
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers.srt = token;

          const switchResponse = await fetch('/bulksell/switch', {
            method: 'POST',
            credentials: 'same-origin',
            headers,
            body: JSON.stringify({
              blingData: {
                originalEntityIds: exactIds,
                originalEntityType: 'ITEM',
                actionType: 'REVISE',
                returnUrl,
                allowExistingWorkspaceDialog: false,
                hb: performance.now(),
                clientUuid,
                refererPathname,
                shouldPassTokenInSwitch: Boolean(init?.shouldPassTokenInSwitch)
              }
            })
          });
          if (!switchResponse.ok) {
            throw new Error(`eBay workspace creation returned HTTP ${switchResponse.status}.`);
          }
          const result = await switchResponse.json();
          if (!result?.url) {
            throw new Error(String(result?.error || 'eBay did not return a Bulk Edit workspace URL.'));
          }
          const workspaceUrl = new URL(String(result.url), location.origin);
          if (workspaceUrl.origin !== location.origin
            || workspaceUrl.pathname !== '/bulksell'
            || !workspaceUrl.searchParams.get('workspaceId')) {
            throw new Error('eBay returned an invalid Bulk Edit workspace URL.');
          }
          return {
            ok: true,
            url: workspaceUrl.toString(),
            workspaceId: workspaceUrl.searchParams.get('workspaceId'),
            requestedCount: exactIds.length
          };
        } catch (error) {
          return { ok: false, error: error?.message || String(error) };
        }
      },
      args: [{ itemIds, returnUrl: String(request.returnUrl || '') }]
    });
    return injection?.[0]?.result || { ok: false, error: 'The eBay page did not return a workspace result.' };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

const VARIATION_END_BATCH_LIMIT = 200;
const VARIATION_END_LEDGER_KEY = 'variationEndLedger';
const VARIATION_AUDIT_STATE_KEY = 'variationAuditState';
const VARIATION_SCAN_STATE_KEY = 'variationAuditScanState';
const VARIATION_SCAN_PAGE_SIZE = 200;
const VARIATION_SCAN_NAVIGATION_DELAY_MS = 900;

function exactVariationItemIds(values) {
  const requested = Array.isArray(values) ? values.map(String) : [];
  const itemIds = [...new Set(requested.filter((itemId) => /^\d{9,15}$/.test(itemId)))];
  if (!itemIds.length
      || itemIds.length > VARIATION_END_BATCH_LIMIT
      || itemIds.length !== requested.length) {
    throw new Error(`The variation batch must contain 1 to ${VARIATION_END_BATCH_LIMIT} unique eBay parent item numbers.`);
  }
  return itemIds;
}

function mergedVariationEndLedger(value, pending, successfulItemIds, failedItemIds, completedAt) {
  const ledger = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  const reportFingerprint = String(pending?.reportFingerprint || '').trim();
  if (!reportFingerprint) return ledger;
  const previous = ledger[reportFingerprint] && typeof ledger[reportFingerprint] === 'object'
    ? ledger[reportFingerprint]
    : {};
  const successful = new Set([
    ...(Array.isArray(previous.successfulItemIds) ? previous.successfulItemIds : []),
    ...successfulItemIds
  ].map(String).filter((itemId) => /^\d{9,15}$/.test(itemId)));
  const failed = new Set([
    ...(Array.isArray(previous.failedItemIds) ? previous.failedItemIds : []),
    ...failedItemIds
  ].map(String).filter((itemId) => /^\d{9,15}$/.test(itemId)));
  successful.forEach((itemId) => failed.delete(itemId));
  ledger[reportFingerprint] = {
    schemaVersion: 1,
    reportFingerprint,
    reportName: String(pending?.reportName || previous.reportName || ''),
    successfulItemIds: [...successful],
    failedItemIds: [...failed],
    successfulCount: successful.size,
    failedCount: failed.size,
    updatedAt: completedAt
  };
  return Object.fromEntries(Object.entries(ledger)
    .sort((left, right) => String(right[1]?.updatedAt || '').localeCompare(String(left[1]?.updatedAt || '')))
    .slice(0, 12));
}

async function activeEbayListingsTab() {
  const candidates = (await queryTabs({ url: [
    'https://www.ebay.com/sh/lst/active*',
    'https://ebay.com/sh/lst/active*'
  ] }))
    .filter((tab) => Number.isInteger(tab?.id))
    .sort((left, right) => Number(right.active) - Number(left.active)
      || Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0));
  let tab = candidates[0];
  if (!tab) {
    tab = await createChromeTab({ url: 'https://www.ebay.com/sh/lst/active', active: true });
  } else if (!tab.active) {
    tab = await updateChromeTab(tab.id, { active: true });
  }
  await focusChromeWindow(tab.windowId);
  tab = await waitForControlTabSettled(tab.id, 30000);
  if (controlPlatformForUrl(tab.url) !== 'ebay' || !/^\/sh\/lst\/active(?:\/|$)/i.test(new URL(tab.url).pathname)) {
    throw new Error('GLDN Ops could not verify eBay Seller Hub Active Listings in this Chrome profile.');
  }
  return tab;
}

function variationScanPageUrl(page) {
  const targetPage = Math.max(1, Number(page || 1));
  const url = new URL('https://www.ebay.com/sh/lst/active');
  url.searchParams.set('offset', String((targetPage - 1) * VARIATION_SCAN_PAGE_SIZE));
  url.searchParams.set('limit', String(VARIATION_SCAN_PAGE_SIZE));
  url.searchParams.set('sort', 'scheduledStartDate');
  return url.toString();
}

async function inspectEbayVariationScanPage(tabId, expectedOffset) {
  const injection = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (offset) => {
      const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const bodyText = String(document.body?.innerText || '');
      const interruption = /Pardon Our Interruption|made us think you were a bot|verify you are human|captcha/i.test(bodyText);
      const expectedStart = Number(offset || 0) + 1;
      const ranges = [...bodyText.matchAll(/Results?:\s*([\d,]+)\s*[-\u2012\u2013\u2014]\s*([\d,]+)\s+of\s+([\d,]+)/gi)]
        .map((match) => ({
          start: Number(match[1].replace(/,/g, '')),
          end: Number(match[2].replace(/,/g, '')),
          total: Number(match[3].replace(/,/g, ''))
        }))
        .filter((entry) => entry.start >= 1 && entry.end >= entry.start && entry.total >= entry.start);
      const range = ranges.find((entry) => entry.start === expectedStart)
        || ranges.find((entry) => expectedStart >= entry.start && expectedStart <= Math.min(entry.end, entry.total))
        || null;
      const idFromHref = (href) => {
        const match = String(href || '').match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})(?:[/?#]|$)/i);
        return match?.[1] || '';
      };
      const records = [];
      const seen = new Set();
      for (const row of [...document.querySelectorAll("tr, [role='row']")]) {
        if (!visible(row)) continue;
        const rowText = String(row.innerText || row.textContent || '');
        const itemLink = [...row.querySelectorAll("a[href*='/itm/']")]
          .find((anchor) => /^\d{9,15}$/.test(idFromHref(anchor.href)));
        let itemId = idFromHref(itemLink?.href);
        if (!itemId) {
          const explicit = rowText.match(/Buy It Now\s*[\u00b7\u2022-]?\s*(\d{9,15})/i);
          itemId = explicit?.[1] || '';
        }
        if (!itemId) {
          const candidates = [...rowText.matchAll(/\b(\d{11,14})\b/g)].map((match) => match[1]);
          itemId = candidates.at(-1) || '';
        }
        if (!/^\d{9,15}$/.test(itemId) || seen.has(itemId)) continue;
        const checkbox = row.querySelector("input[type='checkbox'], [role='checkbox']");
        if (!checkbox) continue;
        seen.add(itemId);
        const title = clean(itemLink?.innerText || itemLink?.textContent || [...row.querySelectorAll('a')]
          .map((anchor) => clean(anchor.innerText || anchor.textContent))
          .find((value) => value.length >= 8 && !/^(Edit|Restock|View message|Research prices|Add or review discounts)$/i.test(value)) || '');
        const money = [...rowText.matchAll(/\$\s*([\d,]+\.\d{2})/g)]
          .map((match) => Number(match[1].replace(/,/g, '')))
          .find(Number.isFinite);
        const skuMatch = rowText.match(/Custom label\s*\(SKU\)\s*:?\s*([^\s]+)/i);
        records.push({
          itemId,
          title,
          sku: clean(skuMatch?.[1] || ''),
          price: Number.isFinite(money) ? money : null
        });
      }
      const total = Number(range?.total || 0);
      const effectiveEnd = range ? Math.min(range.end, range.total) : 0;
      const expected = range ? Math.max(0, effectiveEnd - range.start + 1) : 0;
      return {
        ok: !interruption && Boolean(range) && expected > 0 && records.length === expected,
        interruption,
        url: location.href,
        start: Number(range?.start || 0),
        end: effectiveEnd,
        total,
        expected,
        recordCount: records.length,
        records
      };
    },
    args: [Math.max(0, Number(expectedOffset || 0))]
  });
  return injection?.[0]?.result || null;
}

async function waitForEbayVariationScanPage(tabId, expectedOffset, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await inspectEbayVariationScanPage(tabId, expectedOffset);
    if (last?.interruption) {
      throw new Error('eBay paused the read-only scan with its browser check. No listings were changed.');
    }
    if (last?.ok) return last;
    await controlDelay(700);
  }
  throw new Error(
    `eBay page ${Math.floor(Number(expectedOffset || 0) / VARIATION_SCAN_PAGE_SIZE) + 1} loaded `
    + `${Number(last?.recordCount || 0).toLocaleString()} of ${Number(last?.expected || VARIATION_SCAN_PAGE_SIZE).toLocaleString()} expected listings. No listings were changed.`
  );
}

async function scanAllEbayActiveListingRecords(tabId) {
  for (let pass = 1; pass <= 2; pass += 1) {
    const records = [];
    const seen = new Set();
    let total = 0;
    let countChanged = false;
    for (let page = 1; ; page += 1) {
      const offset = (page - 1) * VARIATION_SCAN_PAGE_SIZE;
      await storageSet({
        [VARIATION_SCAN_STATE_KEY]: {
          active: true,
          phase: 'listing-scan',
          pass,
          page,
          totalPages: total ? Math.ceil(total / VARIATION_SCAN_PAGE_SIZE) : null,
          scannedListings: records.length,
          totalListings: total || null,
          updatedAt: new Date().toISOString()
        }
      });
      await updateChromeTab(tabId, { url: variationScanPageUrl(page), active: false });
      await waitForControlTabSettled(tabId, 30000);
      const snapshot = await waitForEbayVariationScanPage(tabId, offset);
      if (!total) total = snapshot.total;
      if (snapshot.total !== total) {
        countChanged = true;
        break;
      }
      for (const record of snapshot.records) {
        if (seen.has(record.itemId)) continue;
        seen.add(record.itemId);
        records.push(record);
      }
      await storageSet({
        [VARIATION_SCAN_STATE_KEY]: {
          active: true,
          phase: 'listing-scan',
          pass,
          page,
          totalPages: Math.ceil(total / VARIATION_SCAN_PAGE_SIZE),
          scannedListings: records.length,
          totalListings: total,
          updatedAt: new Date().toISOString()
        }
      });
      if (snapshot.end >= total) break;
      await controlDelay(VARIATION_SCAN_NAVIGATION_DELAY_MS);
    }
    if (countChanged && pass < 2) continue;
    if (countChanged) throw new Error('The Active Listings total changed twice during the scan. Run it again after eBay settles. No listings were changed.');
    if (!total || records.length !== total || seen.size !== total) {
      throw new Error(`The complete scan expected ${total.toLocaleString()} unique listings but verified ${seen.size.toLocaleString()}. No listings were changed.`);
    }
    return { total, records };
  }
  throw new Error('The complete Active Listings scan could not stabilize. No listings were changed.');
}

function variationCardPrices(value, fallback) {
  const prices = [...String(value || '').matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)]
    .map((match) => Number(match[1].replace(/,/g, '')))
    .filter(Number.isFinite);
  if (!prices.length && Number.isFinite(Number(fallback))) prices.push(Number(fallback));
  return {
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null
  };
}

async function classifyEbayVariationParents(tabId, scan) {
  const byId = new Map(scan.records.map((record) => [String(record.itemId), record]));
  const variationRecords = [];
  const batchCount = Math.ceil(scan.records.length / VARIATION_END_BATCH_LIMIT);
  for (let index = 0; index < scan.records.length; index += VARIATION_END_BATCH_LIMIT) {
    const batch = scan.records.slice(index, index + VARIATION_END_BATCH_LIMIT);
    const review = await fetchEbayVariationEndReview(tabId, { itemIds: batch.map((record) => record.itemId) });
    if (!Array.isArray(review.cards) || review.cards.length !== batch.length) {
      throw new Error(`eBay classified ${Number(review.cards?.length || 0).toLocaleString()} of ${batch.length.toLocaleString()} listings in review batch ${Math.floor(index / VARIATION_END_BATCH_LIMIT) + 1}. No listings were changed.`);
    }
    for (const card of review.cards) {
      if (card.multiVariationListing !== true) continue;
      const source = byId.get(String(card.listingId)) || {};
      const prices = variationCardPrices(card.displayPrice, source.price);
      variationRecords.push({
        ...source,
        ...prices,
        itemId: String(card.listingId),
        title: String(card.title || source.title || ''),
        variationLabel: String(card.variationLabel || 'Multiple variations'),
        variationSummary: String(card.variationLabel || 'Multiple variations'),
        multiVariationListing: true
      });
    }
    await storageSet({
      [VARIATION_SCAN_STATE_KEY]: {
        active: true,
        phase: 'classifying',
        classificationBatch: Math.floor(index / VARIATION_END_BATCH_LIMIT) + 1,
        classificationBatches: batchCount,
        classifiedListings: Math.min(scan.records.length, index + batch.length),
        totalListings: scan.total,
        variationParents: variationRecords.length,
        updatedAt: new Date().toISOString()
      }
    });
    await controlDelay(250);
  }
  return variationRecords;
}

async function scanEbayVariationListings(sender = {}) {
  const pending = await storageGet(['pendingVariationEndReview']);
  if (pending.pendingVariationEndReview?.active) {
    return { ok: false, error: 'An exact variation End review is already awaiting approval. Finish or cancel that review before rescanning.' };
  }
  const reservation = await claimWorkflowStart('ebay-variation-scan', 'Variation listing scan', sender);
  if (!reservation?.ok) return reservation;
  let scanTab = null;
  let keepTab = false;
  try {
    await storageSet({
      [VARIATION_SCAN_STATE_KEY]: {
        active: true,
        phase: 'starting',
        scannedListings: 0,
        variationParents: 0,
        updatedAt: new Date().toISOString()
      }
    });
    scanTab = await createChromeTab({ url: variationScanPageUrl(1), active: false });
    await waitForControlTabSettled(scanTab.id, 30000);
    const scan = await scanAllEbayActiveListingRecords(scanTab.id);
    const variations = await classifyEbayVariationParents(scanTab.id, scan);
    const scannedAt = new Date().toISOString();
    const audit = VARIATION_CORE.buildLiveVariationAudit(variations, {
      name: 'Automated eBay Active Listings scan',
      scannedAt,
      sourceTabId: scanTab.id,
      totalListings: scan.total
    });
    await storageSet({
      [VARIATION_AUDIT_STATE_KEY]: audit,
      [VARIATION_SCAN_STATE_KEY]: {
        active: false,
        phase: 'complete',
        scannedListings: scan.total,
        totalListings: scan.total,
        variationParents: audit.variationListingCount,
        sourceTabId: scanTab.id,
        completedAt: scannedAt,
        updatedAt: scannedAt
      }
    });
    keepTab = audit.variationListingCount > 0;
    if (!keepTab) await closeChromeTab(scanTab.id);
    return {
      ok: true,
      audit,
      sourceTabId: keepTab ? scanTab.id : null,
      scannedListings: scan.total,
      variationParents: audit.variationListingCount
    };
  } catch (error) {
    await storageSet({
      [VARIATION_SCAN_STATE_KEY]: {
        active: false,
        phase: 'error',
        error: error?.message || String(error),
        failedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }).catch(() => {});
    throw error;
  } finally {
    if (scanTab?.id && !keepTab) await closeChromeTab(scanTab.id);
    await releaseWorkflowStart(reservation.token);
  }
}

async function openEbayVariationReports() {
  const url = 'https://www.ebay.com/sh/reports/downloads';
  const existing = (await queryTabs({ url: 'https://www.ebay.com/sh/reports/downloads*' }))
    .filter((tab) => Number.isInteger(tab?.id))
    .sort((left, right) => Number(right.active) - Number(left.active)
      || Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0];
  let tab = existing
    ? await updateChromeTab(existing.id, { active: true })
    : await createChromeTab({ url, active: true });
  await focusChromeWindow(tab.windowId);
  tab = await waitForControlTabSettled(tab.id, 30000);
  return { ok: true, tabId: tab.id, url: tab.url };
}

async function focusEbayVariationEndReview() {
  const stored = await storageGet(['pendingVariationEndReview']);
  const pending = stored.pendingVariationEndReview;
  if (!pending?.active || !Number.isInteger(Number(pending.sourceTabId))) {
    throw new Error('There is no active variation End review to resume.');
  }
  const tab = await getTab(Number(pending.sourceTabId));
  const tabUrl = new URL(String(tab?.url || ''));
  const exactWorkspace = pending.reviewMode === 'native-endpoint-visible-workspace'
    && tabUrl.pathname === '/bulksell'
    && tabUrl.searchParams.get('workspaceId') === String(pending.workspaceId || '');
  const exactActiveReview = pending.reviewMode === 'native-endpoint'
    && /^\/sh\/lst\/active(?:\/|$)/i.test(tabUrl.pathname);
  if (controlPlatformForUrl(tab?.url) !== 'ebay' || (!exactWorkspace && !exactActiveReview)) {
    throw new Error('The exact saved eBay variation review tab is no longer available.');
  }
  await updateChromeTab(tab.id, { active: true });
  await focusChromeWindow(tab.windowId);
  return {
    ok: true,
    tabId: tab.id,
    url: tab.url,
    requestedCount: Number(pending.requestedCount || 0),
    confirmationToken: `APPROVE END VARIATIONS ${Number(pending.requestedCount || 0)}`
  };
}

async function fetchEbayVariationEndReview(tabId, request = {}) {
  if (!Number.isInteger(tabId)) throw new Error('The eBay Active Listings tab could not be identified.');
  const itemIds = exactVariationItemIds(request.itemIds);
  const injection = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (args) => {
      try {
        if (!/(^|\.)ebay\.com$/i.test(location.hostname)) {
          throw new Error('The active tab is not an eBay page.');
        }
        const exactIds = [...new Set((Array.isArray(args.itemIds) ? args.itemIds : []).map(String))];
        if (!exactIds.length || exactIds.length > 200
            || exactIds.some((itemId) => !/^\d{9,15}$/.test(itemId))) {
          throw new Error('The exact eBay variation item-number batch is invalid.');
        }

        const reviewResponse = await fetch(
          `/sh/lst/active/end-listings?listingIds=${exactIds.join(',')}&usecase=SELLER_HUB`,
          {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' }
          }
        );
        if (!reviewResponse.ok) {
          throw new Error(`eBay End review returned HTTP ${reviewResponse.status}.`);
        }
        const result = await reviewResponse.json();
        const errors = Array.isArray(result?.errors) ? result.errors : [];
        if (errors.length) {
          throw new Error(String(errors[0]?.longMessage || errors[0]?.message || 'eBay rejected the End review.'));
        }
        const module = result?.modules?.END_LISTINGS_EXPERIENCE_MODULE
          || result?.modules?.STATUS_MESSAGE_MODULE;
        const cards = Array.isArray(module?.itemCardContainer?.cards)
          ? module.itemCardContainer.cards
          : [];
        const eligibleItemIds = [...new Set(cards
          .map((card) => String(card?.listingId || ''))
          .filter((itemId) => /^\d{9,15}$/.test(itemId)))];
        const text = (value) => String(value?.textSpans?.map((span) => span?.text || '').join('') || '');
        return {
          ok: true,
          requestedCount: exactIds.length,
          eligibleItemIds,
          eligibleCount: eligibleItemIds.length,
          csrfToken: String(result?.csrfToken || ''),
          pageTitle: String(result?.meta?.pageTitle || 'End listings'),
          itemCardTitle: text(module?.itemCardTitle),
          actionLabel: String(module?.actions?.find((action) => action?.type === 'PRIMARY')?.text || 'End listings'),
          cards: cards.map((card) => ({
            listingId: String(card?.listingId || ''),
            title: text(card?.title),
            variationLabel: text(card?.variationsLabel),
            displayPrice: text(card?.displayPrice),
            multiVariationListing: card?.multiVariationListing === true
          }))
        };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    },
    args: [{ itemIds }]
  });
  const result = injection?.[0]?.result;
  if (!result?.ok) throw new Error(result?.error || 'The eBay page did not return an End review.');
  const eligible = exactVariationItemIds(result.eligibleItemIds || []);
  if (eligible.length !== itemIds.length || eligible.some((itemId, index) => itemId !== itemIds[index])) {
    throw new Error(`eBay accepted ${eligible.length.toLocaleString()} of ${itemIds.length.toLocaleString()} exact variation listings. Nothing was ended.`);
  }
  if (!result.csrfToken) throw new Error('eBay did not return the End review security token.');
  return result;
}

async function inspectEbayVariationWorkspaceProcessing(tabId) {
  let result = { unable: false, endedCount: 0, message: '' };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const heading = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')]
          .find((element) => visible(element) && /^unable to process$/i.test(String(element.textContent || '').trim()));
        if (!heading) return { unable: false, endedCount: 0, message: '' };
        const dialog = heading.closest('[role="dialog"], [aria-modal="true"]') || heading.parentElement?.parentElement || heading.parentElement;
        const message = String(dialog?.innerText || document.body?.innerText || '').replace(/\s+/g, ' ').trim();
        const ended = message.match(/([\d,]+)\s+listings?\s+were not processed because (?:the )?listings? (?:are|were) ended/i);
        return {
          unable: true,
          endedCount: Number(String(ended?.[1] || '0').replace(/,/g, '')) || 0,
          message: message.slice(0, 600)
        };
      }
    });
    result = injection?.[0]?.result || result;
    if (result.unable) return result;
    await controlDelay(600);
  }
  return result;
}

async function submitEbayVariationEndReview(request = {}) {
  const stored = await storageGet(['pendingVariationEndReview']);
  const pending = stored.pendingVariationEndReview;
  const itemIds = exactVariationItemIds(pending?.itemIds || []);
  const expectedCount = Number(pending?.requestedCount || 0);
  const expectedToken = `APPROVE END VARIATIONS ${expectedCount}`;
  const supportedReviewMode = pending?.reviewMode === 'native-endpoint'
    || pending?.reviewMode === 'native-endpoint-visible-workspace';
  if (!pending?.active || !supportedReviewMode || expectedCount !== itemIds.length) {
    throw new Error('There is no exact eBay variation End review ready for approval.');
  }
  if (String(request.confirmationToken || '').trim() !== expectedToken) {
    throw new Error(`Variation ending requires exactly: ${expectedToken}`);
  }
  const tab = await getTab(Number(pending.sourceTabId));
  const tabUrl = new URL(tab.url);
  const activeListingsReview = /^\/sh\/lst\/active(?:\/|$)/i.test(tabUrl.pathname);
  const visibleWorkspaceReview = pending.reviewMode === 'native-endpoint-visible-workspace'
    && tabUrl.pathname === '/bulksell'
    && tabUrl.searchParams.get('workspaceId') === String(pending.workspaceId || '');
  if (controlPlatformForUrl(tab?.url) !== 'ebay' || (!activeListingsReview && !visibleWorkspaceReview)) {
    throw new Error('The exact eBay Active Listings review tab is no longer available.');
  }
  const review = await fetchEbayVariationEndReview(tab.id, { itemIds });
  const refreshedIds = review.eligibleItemIds.map(String);
  if (refreshedIds.length !== itemIds.length || refreshedIds.some((itemId, index) => itemId !== itemIds[index])) {
    throw new Error('eBay changed the exact eligible variation set during approval. Nothing was ended.');
  }
  const injection = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: async (args) => {
      try {
        const response = await fetch('/sh/lst/active/submit-end-listings?usecase=SELLER_HUB', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            srt: args.csrfToken,
            listingIds: args.itemIds,
            endReason: 'NotAvailable'
          })
        });
        if (!response.ok) throw new Error(`eBay End submission returned HTTP ${response.status}.`);
        const result = await response.json();
        const fragments = result?.moduleFragments || {};
        const statusMessage = fragments?.STATUS_MESSAGE_FRAGMENT?.message || {};
        const failureIds = [...new Set(Object.entries(fragments)
          .filter(([key]) => key !== 'STATUS_MESSAGE_FRAGMENT')
          .map(([, value]) => String(value?.listingId || ''))
          .filter((itemId) => /^\d{9,15}$/.test(itemId)))];
        const failedItemIds = statusMessage?.messageType === 'ERROR' && !failureIds.length
          ? args.itemIds
          : failureIds;
        const failed = new Set(failedItemIds);
        return {
          ok: true,
          successfulItemIds: args.itemIds.filter((itemId) => !failed.has(itemId)),
          failedItemIds,
          messageType: String(statusMessage?.messageType || ''),
          message: String(statusMessage?.longMessage || statusMessage?.message || '')
        };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    },
    args: [{ itemIds, csrfToken: review.csrfToken }]
  });
  const result = injection?.[0]?.result;
  if (!result?.ok) throw new Error(result?.error || 'eBay did not return an End result.');
  const completedAt = new Date().toISOString();
  const successfulItemIds = [...new Set((result.successfulItemIds || []).map(String))];
  const failedItemIds = [...new Set((result.failedItemIds || []).map(String))];
  const ledgerStored = await storageGet([VARIATION_END_LEDGER_KEY]);
  const variationEndLedger = mergedVariationEndLedger(
    ledgerStored[VARIATION_END_LEDGER_KEY],
    pending,
    successfulItemIds,
    failedItemIds,
    completedAt
  );
  await storageSet({
    [VARIATION_END_LEDGER_KEY]: variationEndLedger,
    lastVariationEndResult: {
      runId: String(pending.runId || ''),
      reportFingerprint: String(pending.reportFingerprint || ''),
      reportName: String(pending.reportName || ''),
      requestedCount: itemIds.length,
      successfulCount: successfulItemIds.length,
      failedCount: failedItemIds.length,
      successfulItemIds,
      failedItemIds,
      selectedTotal: Number(pending.selectedTotal || itemIds.length),
      remainingSelectedCount: Math.max(0, Number(pending.selectedTotal || itemIds.length) - successfulItemIds.length),
      messageType: String(result.messageType || ''),
      message: String(result.message || ''),
      completedAt
    }
  });
  await storageRemove(['pendingVariationEndReview']);
  let resultTabId = tab.id;
  if (visibleWorkspaceReview && pending.returnUrl) {
    try {
      const returnedTab = await updateChromeTab(tab.id, { url: String(pending.returnUrl), active: true });
      await waitForControlTabSettled(returnedTab.id, 30000);
      resultTabId = returnedTab.id;
    } catch (_) {
      // Ending already completed. A failed return navigation must not change the recorded result.
    }
  }
  await sendTabMessage(resultTabId, {
    type: 'showEbayVariationEndResult',
    result: {
      requestedCount: itemIds.length,
      successfulCount: successfulItemIds.length,
      failedCount: failedItemIds.length,
      message: String(result.message || '')
    }
  }).catch(() => null);
  return {
    ok: failedItemIds.length === 0,
    runId: String(pending.runId || ''),
    reportFingerprint: String(pending.reportFingerprint || ''),
    reportName: String(pending.reportName || ''),
    requestedCount: itemIds.length,
    successfulCount: successfulItemIds.length,
    failedCount: failedItemIds.length,
    failedItemIds,
    successfulItemIds,
    remainingSelectedCount: Math.max(0, Number(pending.selectedTotal || itemIds.length) - successfulItemIds.length),
    message: String(result.message || '')
  };
}

async function prepareEbayVariationEndReview(request = {}, sender = {}) {
  const itemIds = exactVariationItemIds(request.itemIds);
  const selectedTotal = Math.max(itemIds.length, Number(request.selectedTotal || itemIds.length));
  const reservation = await claimWorkflowStart('ebay-variations', 'Variation listing end review', sender);
  if (!reservation?.ok) return reservation;
  try {
    let tab = null;
    const requestedSourceTabId = Number(request.sourceTabId);
    if (Number.isInteger(requestedSourceTabId)) {
      const candidate = await getTab(requestedSourceTabId).catch(() => null);
      if (candidate && controlPlatformForUrl(candidate.url) === 'ebay'
          && /^\/sh\/lst\/active(?:\/|$)/i.test(new URL(candidate.url).pathname)) {
        tab = candidate;
      }
    }
    if (!tab) tab = await activeEbayListingsTab();
    const review = await fetchEbayVariationEndReview(tab.id, { itemIds });
    const returnUrl = String(tab.url || 'https://www.ebay.com/sh/lst/active');
    const workspace = await createMove99BulkWorkspace(tab.id, { itemIds, returnUrl });
    if (!workspace?.ok) {
      throw new Error(workspace?.error || 'eBay did not create the visible variation listing review.');
    }
    let reviewTab = await updateChromeTab(tab.id, { url: workspace.url, active: true });
    await focusChromeWindow(reviewTab.windowId);
    reviewTab = await waitForControlTabSettled(reviewTab.id, 30000);
    const reviewUrl = new URL(reviewTab.url);
    if (reviewUrl.pathname !== '/bulksell'
        || reviewUrl.searchParams.get('workspaceId') !== String(workspace.workspaceId || '')) {
      throw new Error('eBay did not open the exact visible variation listing review.');
    }
    const processing = await inspectEbayVariationWorkspaceProcessing(reviewTab.id);
    if (processing.unable) {
      await updateChromeTab(reviewTab.id, { url: returnUrl, active: true }).catch(() => null);
      if (processing.endedCount) {
        throw new Error(`eBay reports ${processing.endedCount.toLocaleString()} listings in this batch are already ended. Import a fresh All active listings report before continuing.`);
      }
      throw new Error(processing.message || 'eBay could not process the exact variation batch. Nothing was ended.');
    }
    const now = new Date().toISOString();
    const runId = globalThis.crypto?.randomUUID?.() || `variations-${Date.now()}`;
    await storageSet({
      pendingVariationEndReview: {
        active: true,
        phase: 'review-ready',
        reviewMode: 'native-endpoint-visible-workspace',
        runId,
        itemIds,
        requestedCount: itemIds.length,
        selectedTotal,
        remainingSelectedCount: Math.max(0, selectedTotal - itemIds.length),
        reportFingerprint: String(request.reportFingerprint || ''),
        reportName: String(request.reportName || ''),
        ebayEligibleCount: Number(review.eligibleCount || 0),
        ebayPageTitle: String(review.pageTitle || 'End listings'),
        ebayActionLabel: String(review.actionLabel || 'End listings'),
        reviewCards: review.cards || [],
        sourceTabId: reviewTab.id,
        workspaceId: String(workspace.workspaceId || ''),
        workspaceUrl: String(workspace.url || ''),
        returnUrl,
        createdAt: now,
        updatedAt: now
      }
    });
    await sendTabMessage(reviewTab.id, {
      type: 'showEbayVariationEndReview',
      deferApproval: true,
      state: {
        active: true,
        phase: 'review-ready',
        reviewMode: 'native-endpoint-visible-workspace',
        runId,
        itemIds,
        requestedCount: itemIds.length,
        selectedTotal,
        remainingSelectedCount: Math.max(0, selectedTotal - itemIds.length),
        reportName: String(request.reportName || ''),
        ebayEligibleCount: Number(review.eligibleCount || 0),
        ebayPageTitle: String(review.pageTitle || 'End listings'),
        ebayActionLabel: String(review.actionLabel || 'End listings'),
        reviewCards: review.cards || [],
        workspaceId: String(workspace.workspaceId || ''),
        workspaceUrl: String(workspace.url || ''),
        returnUrl
      }
    });
    await recordExtensionLog({
      source: 'ebay-variations',
      level: 'info',
      operation: 'prepare-end-review',
      message: `Prepared exact eBay End review for ${itemIds.length} variation parent listings.`,
      detail: { runId, requestedCount: itemIds.length, eligibleCount: review.eligibleCount }
    });
    return {
      ok: true,
      runId,
      tabId: reviewTab.id,
      requestedCount: itemIds.length,
      eligibleCount: review.eligibleCount,
      pageTitle: review.pageTitle,
      actionLabel: review.actionLabel,
      workspaceId: String(workspace.workspaceId || ''),
      workspaceUrl: String(workspace.url || ''),
      reviewCards: review.cards,
      remainingSelectedCount: Math.max(0, selectedTotal - itemIds.length)
    };
  } catch (error) {
    await storageRemove(['pendingVariationEndReview']);
    throw error;
  } finally {
    await releaseWorkflowStart(reservation.token);
  }
}

const POLICY_LISTING_AUDIT_STATE_KEY = 'ebayPolicyListingAudit';
const POLICY_LISTING_SCAN_STATE_KEY = 'ebayPolicyListingScanState';
const POLICY_LISTING_SCAN_CHUNK_PREFIX = 'ebayPolicyListingScanChunk:';
const POLICY_LISTING_END_LEDGER_KEY = 'policyListingEndLedger';
const PENDING_POLICY_LISTING_END_REVIEW_KEY = 'pendingPolicyListingEndReview';
const LAST_POLICY_LISTING_END_RESULT_KEY = 'lastPolicyListingEndResult';
const POLICY_LISTING_END_BATCH_LIMIT = 200;
const POLICY_LISTING_AUDIT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function exactPolicyListingItemIds(values) {
  const requested = Array.isArray(values) ? values.map(String) : [];
  const itemIds = [...new Set(requested.filter((itemId) => /^\d{9,15}$/.test(itemId)))];
  if (!itemIds.length
      || itemIds.length > POLICY_LISTING_END_BATCH_LIMIT
      || itemIds.length !== requested.length) {
    throw new Error(`The policy batch must contain 1 to ${POLICY_LISTING_END_BATCH_LIMIT} unique eBay item numbers.`);
  }
  return itemIds;
}

function policyListingScanChunkKey(runId, page) {
  return `${POLICY_LISTING_SCAN_CHUNK_PREFIX}${String(runId || '')}:${Math.max(1, Number(page || 1))}`;
}

async function removePolicyListingScanChunks(runId = '') {
  const stored = await storageGet(null);
  const prefix = runId
    ? `${POLICY_LISTING_SCAN_CHUNK_PREFIX}${String(runId)}:`
    : POLICY_LISTING_SCAN_CHUNK_PREFIX;
  const keys = Object.keys(stored || {}).filter((key) => key.startsWith(prefix));
  if (keys.length) await storageRemove(keys);
  return keys.length;
}

async function loadListingPreflightRulePack() {
  if (!LISTING_PREFLIGHT || !POLICY_LISTING_AUDIT) {
    throw new Error('The existing-listings policy engine did not load.');
  }
  const response = await fetch(chrome.runtime.getURL('listing-preflight-rules.json'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Listing Preflight rules returned ${response.status}.`);
  const rulePack = LISTING_PREFLIGHT.normalizeRulePack(await response.json());
  if (!rulePack.ruleCount) {
    throw new Error('No reviewed policy rules are loaded. Existing listings cannot be classified.');
  }
  return rulePack;
}

async function currentPolicyListingIdentity() {
  const stored = await storageGet(['computerLabel', 'ebayAccountLabel']);
  const identity = identityForComputer(stored.computerLabel);
  const computerLabel = String(identity.computerLabel || stored.computerLabel || '').trim();
  const ebayAccountLabel = FOUNDATION.normalizeEbayAccount(identity.ebayAccountLabel || stored.ebayAccountLabel);
  if (!computerLabel || !ebayAccountLabel) {
    throw new Error(identity.poshmarkOnly
      ? 'Computer 7 is Poshmark-only. Existing eBay listing scans are disabled.'
      : 'Choose and save this computer before scanning eBay listings.');
  }
  return { computerLabel, ebayAccountLabel };
}

async function readCompletePolicyListingScan(runId, totalListings) {
  const total = Number(totalListings || 0);
  const totalPages = Math.ceil(total / VARIATION_SCAN_PAGE_SIZE);
  if (!total || !totalPages) throw new Error('eBay did not report a positive Active Listings total.');
  const keys = Array.from({ length: totalPages }, (_, index) => policyListingScanChunkKey(runId, index + 1));
  const stored = await storageGet(keys);
  const records = [];
  const seen = new Set();
  for (let index = 0; index < keys.length; index += 1) {
    const page = index + 1;
    const chunk = stored[keys[index]];
    const expectedOffset = index * VARIATION_SCAN_PAGE_SIZE;
    const expectedCount = Math.min(VARIATION_SCAN_PAGE_SIZE, total - expectedOffset);
    if (!chunk || Number(chunk.page) !== page || Number(chunk.totalListings) !== total
        || !Array.isArray(chunk.records) || chunk.records.length !== expectedCount) {
      throw new Error(`Saved scan page ${page.toLocaleString()} is missing or incomplete. Resume the scan before reviewing results.`);
    }
    for (const record of chunk.records) {
      const itemId = String(record?.itemId || '');
      if (!/^\d{9,15}$/.test(itemId) || seen.has(itemId)) {
        throw new Error(`Saved scan page ${page.toLocaleString()} contains an invalid or duplicate eBay item number.`);
      }
      seen.add(itemId);
      records.push(record);
    }
  }
  if (records.length !== total || seen.size !== total) {
    throw new Error(`The completed scan expected ${total.toLocaleString()} unique listings but verified ${seen.size.toLocaleString()}.`);
  }
  return records;
}

async function scanEbayPolicyListings(request = {}, sender = {}) {
  const pending = await storageGet([PENDING_POLICY_LISTING_END_REVIEW_KEY, 'pendingVariationEndReview']);
  if (pending[PENDING_POLICY_LISTING_END_REVIEW_KEY]?.active) {
    return { ok: false, error: 'An exact policy End review is awaiting approval. Finish or cancel it before rescanning.' };
  }
  if (pending.pendingVariationEndReview?.active) {
    return { ok: false, error: 'A variation End review is awaiting approval. Finish it before starting a policy scan.' };
  }

  const reservation = await claimWorkflowStart('ebay-policy-scan', 'Existing listings policy scan', sender);
  if (!reservation?.ok) return reservation;
  let scanTab = null;
  let runId = '';
  let nextPage = 1;
  let totalListings = 0;
  let totalPages = 0;
  try {
    const identity = await currentPolicyListingIdentity();
    const rulePack = await loadListingPreflightRulePack();
    const rulesFingerprint = POLICY_LISTING_AUDIT.rulePackFingerprint(rulePack, LISTING_PREFLIGHT);
    const stored = await storageGet([POLICY_LISTING_SCAN_STATE_KEY, POLICY_LISTING_AUDIT_STATE_KEY]);
    const previous = stored[POLICY_LISTING_SCAN_STATE_KEY] || {};
    const canResume = request.fresh !== true
      && String(previous.runId || '')
      && ['paused', 'error', 'scanning'].includes(String(previous.phase || ''))
      && String(previous.computerLabel || '') === identity.computerLabel
      && String(previous.ebayAccountLabel || '') === identity.ebayAccountLabel
      && String(previous.rulesFingerprint || '') === rulesFingerprint;

    if (canResume) {
      runId = String(previous.runId);
      nextPage = Math.max(1, Number(previous.nextPage || previous.page || 1));
      totalListings = Math.max(0, Number(previous.totalListings || 0));
      totalPages = totalListings ? Math.ceil(totalListings / VARIATION_SCAN_PAGE_SIZE) : 0;
    } else {
      if (previous.runId) await removePolicyListingScanChunks(previous.runId);
      runId = globalThis.crypto?.randomUUID?.() || `policy-listings-${Date.now()}`;
      nextPage = 1;
      totalListings = 0;
      totalPages = 0;
    }

    const startedAt = canResume && previous.startedAt ? String(previous.startedAt) : new Date().toISOString();
    await storageSet({
      [POLICY_LISTING_SCAN_STATE_KEY]: {
        active: true,
        phase: 'scanning',
        runId,
        computerLabel: identity.computerLabel,
        ebayAccountLabel: identity.ebayAccountLabel,
        rulesFingerprint,
        ruleCount: rulePack.ruleCount,
        page: nextPage,
        nextPage,
        completedPages: Math.max(0, nextPage - 1),
        totalPages: totalPages || null,
        scannedListings: Math.min(totalListings || 0, Math.max(0, nextPage - 1) * VARIATION_SCAN_PAGE_SIZE),
        totalListings: totalListings || null,
        stopRequested: false,
        startedAt,
        updatedAt: new Date().toISOString()
      }
    });

    scanTab = await createChromeTab({ url: variationScanPageUrl(nextPage), active: false });
    await waitForControlTabSettled(scanTab.id, 30000);
    for (let page = nextPage; ; page += 1) {
      const latest = await storageGet([POLICY_LISTING_SCAN_STATE_KEY]);
      const latestState = latest[POLICY_LISTING_SCAN_STATE_KEY] || {};
      if (String(latestState.runId || '') !== runId) {
        throw new Error('This saved policy scan was replaced by a newer run.');
      }
      if (latestState.stopRequested === true) {
        const pausedAt = new Date().toISOString();
        await storageSet({
          [POLICY_LISTING_SCAN_STATE_KEY]: {
            ...latestState,
            active: false,
            phase: 'paused',
            page,
            nextPage: page,
            stopRequested: false,
            pausedAt,
            updatedAt: pausedAt
          }
        });
        return { ok: false, paused: true, resumable: true, runId, nextPage: page, error: 'The scan paused at a verified page boundary. No listings were changed.' };
      }

      const offset = (page - 1) * VARIATION_SCAN_PAGE_SIZE;
      await updateChromeTab(scanTab.id, { url: variationScanPageUrl(page), active: false });
      await waitForControlTabSettled(scanTab.id, 30000);
      const snapshot = await waitForEbayVariationScanPage(scanTab.id, offset);
      if (!totalListings) {
        totalListings = Number(snapshot.total || 0);
        totalPages = Math.ceil(totalListings / VARIATION_SCAN_PAGE_SIZE);
      }
      if (Number(snapshot.total || 0) !== totalListings) {
        throw new Error(`The Active Listings total changed from ${totalListings.toLocaleString()} to ${Number(snapshot.total || 0).toLocaleString()} during the scan. Start a fresh scan after eBay settles.`);
      }

      const chunkKey = policyListingScanChunkKey(runId, page);
      const updatedAt = new Date().toISOString();
      await storageSet({
        [chunkKey]: {
          schemaVersion: 1,
          runId,
          page,
          start: Number(snapshot.start || 0),
          end: Number(snapshot.end || 0),
          totalListings,
          records: snapshot.records,
          verifiedAt: updatedAt
        },
        [POLICY_LISTING_SCAN_STATE_KEY]: {
          active: true,
          phase: 'scanning',
          runId,
          computerLabel: identity.computerLabel,
          ebayAccountLabel: identity.ebayAccountLabel,
          rulesFingerprint,
          ruleCount: rulePack.ruleCount,
          page,
          nextPage: page + 1,
          completedPages: page,
          totalPages,
          scannedListings: Math.min(totalListings, Number(snapshot.end || page * VARIATION_SCAN_PAGE_SIZE)),
          totalListings,
          stopRequested: false,
          startedAt,
          updatedAt
        }
      });
      if (Number(snapshot.end || 0) >= totalListings) break;
      await controlDelay(VARIATION_SCAN_NAVIGATION_DELAY_MS);
    }

    const records = await readCompletePolicyListingScan(runId, totalListings);
    const scannedAt = new Date().toISOString();
    const audit = POLICY_LISTING_AUDIT.buildPolicyAudit(records, rulePack, {
      scannedAt,
      computerLabel: identity.computerLabel,
      ebayAccountLabel: identity.ebayAccountLabel
    }, LISTING_PREFLIGHT);
    if (Number(audit.totalListings || 0) !== totalListings
        || Number(audit.summary?.total || 0) !== totalListings) {
      throw new Error('The policy classification did not cover every verified Active Listing. No review was created.');
    }
    await storageSet({
      [POLICY_LISTING_AUDIT_STATE_KEY]: audit,
      [POLICY_LISTING_SCAN_STATE_KEY]: {
        active: false,
        phase: 'complete',
        runId,
        computerLabel: identity.computerLabel,
        ebayAccountLabel: identity.ebayAccountLabel,
        rulesFingerprint,
        ruleCount: rulePack.ruleCount,
        page: totalPages,
        nextPage: totalPages + 1,
        completedPages: totalPages,
        totalPages,
        scannedListings: totalListings,
        totalListings,
        summary: audit.summary,
        stopRequested: false,
        startedAt,
        completedAt: scannedAt,
        updatedAt: scannedAt
      }
    });
    await removePolicyListingScanChunks(runId);
    await recordExtensionLog({
      source: 'ebay-policy-listings',
      level: 'info',
      operation: 'complete-read-only-scan',
      message: `Classified all ${totalListings} active listings: ${audit.summary.block} Block, ${audit.summary.review} Review, ${audit.summary.clear} no current rule match.`,
      detail: { runId, reportFingerprint: audit.reportFingerprint, rulesFingerprint, summary: audit.summary }
    });
    return { ok: true, audit, scannedListings: totalListings, summary: audit.summary };
  } catch (error) {
    const now = new Date().toISOString();
    const latest = await storageGet([POLICY_LISTING_SCAN_STATE_KEY]).catch(() => ({}));
    const state = latest[POLICY_LISTING_SCAN_STATE_KEY] || {};
    if (!runId || String(state.runId || '') === runId) {
      await storageSet({
        [POLICY_LISTING_SCAN_STATE_KEY]: {
          ...state,
          active: false,
          phase: 'error',
          runId: runId || String(state.runId || ''),
          error: error?.message || String(error),
          resumable: Boolean(runId),
          stopRequested: false,
          updatedAt: now
        }
      }).catch(() => null);
    }
    return { ok: false, error: error?.message || String(error), resumable: Boolean(runId), runId };
  } finally {
    if (Number.isInteger(Number(scanTab?.id))) await closeChromeTab(Number(scanTab.id)).catch(() => null);
    await releaseWorkflowStart(reservation.token);
  }
}

async function stopEbayPolicyListingScan() {
  const stored = await storageGet([POLICY_LISTING_SCAN_STATE_KEY]);
  const state = stored[POLICY_LISTING_SCAN_STATE_KEY];
  if (!state?.active || state.phase !== 'scanning') {
    return { ok: true, changed: false, message: 'No existing-listings policy scan is currently running.' };
  }
  await storageSet({
    [POLICY_LISTING_SCAN_STATE_KEY]: {
      ...state,
      stopRequested: true,
      updatedAt: new Date().toISOString()
    }
  });
  return { ok: true, changed: true, message: 'The scan will pause after its current verified page. No listings will be changed.' };
}

async function clearEbayPolicyListingScan() {
  const stored = await storageGet([POLICY_LISTING_SCAN_STATE_KEY, PENDING_POLICY_LISTING_END_REVIEW_KEY]);
  if (stored[PENDING_POLICY_LISTING_END_REVIEW_KEY]?.active) {
    throw new Error('Finish or cancel the exact policy End review before discarding its audit.');
  }
  const runId = String(stored[POLICY_LISTING_SCAN_STATE_KEY]?.runId || '');
  if (runId) await removePolicyListingScanChunks(runId);
  await storageRemove([POLICY_LISTING_SCAN_STATE_KEY, POLICY_LISTING_AUDIT_STATE_KEY, LAST_POLICY_LISTING_END_RESULT_KEY]);
  return { ok: true };
}

function mergedPolicyListingEndLedger(value, pending, successfulItemIds, failedItemIds, completedAt) {
  const ledger = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  const reportFingerprint = String(pending?.reportFingerprint || '').trim();
  if (!reportFingerprint) return ledger;
  const previous = ledger[reportFingerprint] && typeof ledger[reportFingerprint] === 'object'
    ? ledger[reportFingerprint]
    : {};
  const successful = new Set([
    ...(Array.isArray(previous.successfulItemIds) ? previous.successfulItemIds : []),
    ...successfulItemIds
  ].map(String).filter((itemId) => /^\d{9,15}$/.test(itemId)));
  const failed = new Set([
    ...(Array.isArray(previous.failedItemIds) ? previous.failedItemIds : []),
    ...failedItemIds
  ].map(String).filter((itemId) => /^\d{9,15}$/.test(itemId)));
  successful.forEach((itemId) => failed.delete(itemId));
  ledger[reportFingerprint] = {
    schemaVersion: 1,
    reportFingerprint,
    reportName: String(pending?.reportName || previous.reportName || ''),
    successfulItemIds: [...successful],
    failedItemIds: [...failed],
    successfulCount: successful.size,
    failedCount: failed.size,
    updatedAt: completedAt
  };
  return Object.fromEntries(Object.entries(ledger)
    .sort((left, right) => String(right[1]?.updatedAt || '').localeCompare(String(left[1]?.updatedAt || '')))
    .slice(0, 20));
}

async function validateCurrentPolicyListingAudit(audit) {
  if (!audit?.schemaVersion || !Array.isArray(audit.listings) || !String(audit.reportFingerprint || '')) {
    throw new Error('Run a complete existing-listings policy scan before preparing an End review.');
  }
  if (Number(audit.totalListings || 0) !== audit.listings.length
      || Number(audit.summary?.total || 0) !== audit.listings.length) {
    throw new Error('The saved policy audit is incomplete. Run a fresh complete scan.');
  }
  const identity = await currentPolicyListingIdentity();
  if (String(audit.computerLabel || '') !== identity.computerLabel
      || String(audit.ebayAccountLabel || '') !== identity.ebayAccountLabel) {
    throw new Error('The saved policy audit belongs to a different computer or eBay account. Run a fresh scan in this Chrome profile.');
  }
  const scannedAt = Date.parse(String(audit.scannedAt || ''));
  if (!Number.isFinite(scannedAt) || Date.now() - scannedAt > POLICY_LISTING_AUDIT_MAX_AGE_MS) {
    throw new Error('This policy audit is older than 48 hours. Run a fresh complete scan before ending listings.');
  }
  const rulePack = await loadListingPreflightRulePack();
  const rulesFingerprint = POLICY_LISTING_AUDIT.rulePackFingerprint(rulePack, LISTING_PREFLIGHT);
  if (String(audit.rulesFingerprint || '') !== rulesFingerprint) {
    throw new Error('The reviewed policy rules changed after this scan. Run a fresh complete scan before ending listings.');
  }
  return { identity, rulePack, rulesFingerprint };
}

async function focusEbayPolicyListingEndReview() {
  const stored = await storageGet([PENDING_POLICY_LISTING_END_REVIEW_KEY]);
  const pending = stored[PENDING_POLICY_LISTING_END_REVIEW_KEY];
  if (!pending?.active || !Number.isInteger(Number(pending.sourceTabId))) {
    throw new Error('There is no active policy listing End review to resume.');
  }
  const tab = await getTab(Number(pending.sourceTabId));
  const tabUrl = new URL(String(tab?.url || ''));
  const exactWorkspace = tabUrl.pathname === '/bulksell'
    && tabUrl.searchParams.get('workspaceId') === String(pending.workspaceId || '');
  if (controlPlatformForUrl(tab?.url) !== 'ebay' || !exactWorkspace) {
    throw new Error('The exact saved eBay policy review tab is no longer available. No listings were changed.');
  }
  await updateChromeTab(tab.id, { active: true });
  await focusChromeWindow(tab.windowId);
  return {
    ok: true,
    tabId: tab.id,
    url: tab.url,
    requestedCount: Number(pending.requestedCount || 0),
    confirmationToken: `APPROVE END POLICY LISTINGS ${Number(pending.requestedCount || 0)}`
  };
}

async function cancelEbayPolicyListingEndReview() {
  const stored = await storageGet([PENDING_POLICY_LISTING_END_REVIEW_KEY]);
  const pending = stored[PENDING_POLICY_LISTING_END_REVIEW_KEY];
  if (!pending?.active) {
    return { ok: true, changed: false, message: 'No exact policy listing review is currently open.' };
  }
  const tabId = Number(pending.sourceTabId);
  if (Number.isInteger(tabId) && pending.returnUrl) {
    const tab = await getTab(tabId).catch(() => null);
    const tabUrl = (() => {
      try { return new URL(String(tab?.url || '')); } catch (_) { return null; }
    })();
    const isSavedWorkspace = tabUrl?.pathname === '/bulksell'
      && tabUrl.searchParams.get('workspaceId') === String(pending.workspaceId || '');
    if (isSavedWorkspace) {
      await updateChromeTab(tabId, { url: String(pending.returnUrl), active: false }).catch(() => null);
    }
  }
  await storageRemove([PENDING_POLICY_LISTING_END_REVIEW_KEY]);
  await recordExtensionLog({
    source: 'ebay-policy-listings',
    level: 'info',
    operation: 'cancel-end-review',
    message: `Canceled the saved ${Number(pending.requestedCount || 0)}-listing policy End review. No listing was changed.`,
    detail: { runId: String(pending.runId || ''), requestedCount: Number(pending.requestedCount || 0) }
  });
  return { ok: true, changed: true, message: 'The saved eBay review was canceled. No listing was changed.' };
}

async function prepareEbayPolicyListingEndReview(request = {}, sender = {}) {
  const requestedIds = exactPolicyListingItemIds(request.itemIds);
  const pendingStored = await storageGet([PENDING_POLICY_LISTING_END_REVIEW_KEY, 'pendingVariationEndReview']);
  if (pendingStored[PENDING_POLICY_LISTING_END_REVIEW_KEY]?.active) {
    throw new Error('An exact policy End review is already awaiting approval.');
  }
  if (pendingStored.pendingVariationEndReview?.active) {
    throw new Error('A variation End review is already awaiting approval.');
  }
  const reservation = await claimWorkflowStart('ebay-policy-listings', 'Policy listing end review', sender);
  if (!reservation?.ok) return reservation;
  try {
    const stored = await storageGet([POLICY_LISTING_AUDIT_STATE_KEY, POLICY_LISTING_END_LEDGER_KEY]);
    const audit = stored[POLICY_LISTING_AUDIT_STATE_KEY];
    await validateCurrentPolicyListingAudit(audit);
    if (String(request.reportFingerprint || '') !== String(audit.reportFingerprint || '')) {
      throw new Error('The requested policy rows do not belong to the current complete audit.');
    }
    const ledgerEntry = stored[POLICY_LISTING_END_LEDGER_KEY]?.[audit.reportFingerprint] || {};
    const itemIds = POLICY_LISTING_AUDIT.blockItemIds(
      audit,
      requestedIds,
      ledgerEntry.successfulItemIds || []
    );
    const tab = await activeEbayListingsTab();
    const review = await fetchEbayVariationEndReview(tab.id, { itemIds });
    const returnUrl = String(tab.url || 'https://www.ebay.com/sh/lst/active');
    const workspace = await createMove99BulkWorkspace(tab.id, { itemIds, returnUrl });
    if (!workspace?.ok) throw new Error(workspace?.error || 'eBay did not create the visible policy listing review.');
    let reviewTab = await updateChromeTab(tab.id, { url: workspace.url, active: true });
    await focusChromeWindow(reviewTab.windowId);
    reviewTab = await waitForControlTabSettled(reviewTab.id, 30000);
    const reviewUrl = new URL(reviewTab.url);
    if (reviewUrl.pathname !== '/bulksell'
        || reviewUrl.searchParams.get('workspaceId') !== String(workspace.workspaceId || '')) {
      throw new Error('eBay did not open the exact visible policy listing review.');
    }
    const processing = await inspectEbayVariationWorkspaceProcessing(reviewTab.id);
    if (processing.unable) {
      await updateChromeTab(reviewTab.id, { url: returnUrl, active: true }).catch(() => null);
      throw new Error(processing.endedCount
        ? `eBay reports ${processing.endedCount.toLocaleString()} listings in this batch are already ended. Run a fresh policy scan.`
        : processing.message || 'eBay could not process the exact policy batch. Nothing was ended.');
    }
    const now = new Date().toISOString();
    const runId = globalThis.crypto?.randomUUID?.() || `policy-end-${Date.now()}`;
    await storageSet({
      [PENDING_POLICY_LISTING_END_REVIEW_KEY]: {
        active: true,
        phase: 'review-ready',
        reviewMode: 'native-endpoint-visible-workspace',
        runId,
        itemIds,
        requestedCount: itemIds.length,
        reportFingerprint: String(audit.reportFingerprint || ''),
        reportName: String(audit.reportName || 'Existing Listings Policy Audit'),
        rulesFingerprint: String(audit.rulesFingerprint || ''),
        computerLabel: String(audit.computerLabel || ''),
        ebayAccountLabel: String(audit.ebayAccountLabel || ''),
        ebayEligibleCount: Number(review.eligibleCount || 0),
        reviewCards: review.cards || [],
        sourceTabId: reviewTab.id,
        workspaceId: String(workspace.workspaceId || ''),
        workspaceUrl: String(workspace.url || ''),
        returnUrl,
        createdAt: now,
        updatedAt: now
      }
    });
    await recordExtensionLog({
      source: 'ebay-policy-listings',
      level: 'info',
      operation: 'prepare-end-review',
      message: `Prepared an exact visible eBay review for ${itemIds.length} reviewed Block listings.`,
      detail: { runId, requestedCount: itemIds.length, reportFingerprint: audit.reportFingerprint }
    });
    return {
      ok: true,
      runId,
      tabId: reviewTab.id,
      requestedCount: itemIds.length,
      eligibleCount: Number(review.eligibleCount || 0),
      workspaceId: String(workspace.workspaceId || ''),
      workspaceUrl: String(workspace.url || ''),
      reviewCards: review.cards || [],
      confirmationToken: `APPROVE END POLICY LISTINGS ${itemIds.length}`
    };
  } catch (error) {
    await storageRemove([PENDING_POLICY_LISTING_END_REVIEW_KEY]);
    throw error;
  } finally {
    await releaseWorkflowStart(reservation.token);
  }
}

async function submitExactEbayPolicyListingEnds(tabId, itemIds, csrfToken) {
  const injection = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (args) => {
      try {
        const response = await fetch('/sh/lst/active/submit-end-listings?usecase=SELLER_HUB', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ srt: args.csrfToken, listingIds: args.itemIds, endReason: 'NotAvailable' })
        });
        if (!response.ok) throw new Error(`eBay End submission returned HTTP ${response.status}.`);
        const result = await response.json();
        const fragments = result?.moduleFragments || {};
        const statusMessage = fragments?.STATUS_MESSAGE_FRAGMENT?.message || {};
        const failureIds = [...new Set(Object.entries(fragments)
          .filter(([key]) => key !== 'STATUS_MESSAGE_FRAGMENT')
          .map(([, value]) => String(value?.listingId || ''))
          .filter((itemId) => /^\d{9,15}$/.test(itemId)))];
        return {
          ok: true,
          failedItemIds: failureIds,
          messageType: String(statusMessage?.messageType || ''),
          message: String(statusMessage?.longMessage || statusMessage?.message || ''),
          evidenceText: JSON.stringify(result).slice(0, 50000)
        };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    },
    args: [{ itemIds, csrfToken }]
  });
  const result = injection?.[0]?.result;
  if (!result?.ok) throw new Error(result?.error || 'eBay did not return an End result.');
  return POLICY_LISTING_AUDIT.normalizeEndSubmissionOutcome(itemIds, result);
}

async function submitEbayPolicyListingEndReview(request = {}) {
  const stored = await storageGet([
    PENDING_POLICY_LISTING_END_REVIEW_KEY,
    POLICY_LISTING_AUDIT_STATE_KEY,
    POLICY_LISTING_END_LEDGER_KEY
  ]);
  const pending = stored[PENDING_POLICY_LISTING_END_REVIEW_KEY];
  const itemIds = exactPolicyListingItemIds(pending?.itemIds || []);
  const expectedCount = Number(pending?.requestedCount || 0);
  const expectedToken = `APPROVE END POLICY LISTINGS ${expectedCount}`;
  if (!pending?.active || pending.reviewMode !== 'native-endpoint-visible-workspace'
      || expectedCount !== itemIds.length) {
    throw new Error('There is no exact eBay policy End review ready for approval.');
  }
  if (String(request.confirmationToken || '').trim() !== expectedToken) {
    throw new Error(`Policy listing ending requires exactly: ${expectedToken}`);
  }
  const audit = stored[POLICY_LISTING_AUDIT_STATE_KEY];
  await validateCurrentPolicyListingAudit(audit);
  if (String(pending.reportFingerprint || '') !== String(audit.reportFingerprint || '')
      || String(pending.rulesFingerprint || '') !== String(audit.rulesFingerprint || '')) {
    throw new Error('The policy audit or reviewed rules changed after this review opened. Nothing was ended.');
  }
  const ledgerEntry = stored[POLICY_LISTING_END_LEDGER_KEY]?.[audit.reportFingerprint] || {};
  POLICY_LISTING_AUDIT.blockItemIds(audit, itemIds, ledgerEntry.successfulItemIds || []);

  const tab = await getTab(Number(pending.sourceTabId));
  const tabUrl = new URL(String(tab?.url || ''));
  const exactWorkspace = tabUrl.pathname === '/bulksell'
    && tabUrl.searchParams.get('workspaceId') === String(pending.workspaceId || '');
  if (controlPlatformForUrl(tab?.url) !== 'ebay' || !exactWorkspace) {
    throw new Error('The exact eBay policy review tab is no longer available. Nothing was ended.');
  }
  const review = await fetchEbayVariationEndReview(tab.id, { itemIds });
  const refreshedIds = review.eligibleItemIds.map(String);
  if (refreshedIds.length !== itemIds.length || refreshedIds.some((itemId, index) => itemId !== itemIds[index])) {
    throw new Error('eBay changed the exact eligible policy set during approval. Nothing was ended.');
  }
  const result = await submitExactEbayPolicyListingEnds(tab.id, itemIds, review.csrfToken);
  const completedAt = new Date().toISOString();
  const successfulItemIds = [...new Set((result.successfulItemIds || []).map(String))];
  const failedItemIds = [...new Set((result.failedItemIds || []).map(String))];
  const policyListingEndLedger = mergedPolicyListingEndLedger(
    stored[POLICY_LISTING_END_LEDGER_KEY],
    pending,
    successfulItemIds,
    failedItemIds,
    completedAt
  );
  await storageSet({
    [POLICY_LISTING_END_LEDGER_KEY]: policyListingEndLedger,
    [LAST_POLICY_LISTING_END_RESULT_KEY]: {
      runId: String(pending.runId || ''),
      reportFingerprint: String(pending.reportFingerprint || ''),
      reportName: String(pending.reportName || ''),
      requestedCount: itemIds.length,
      successfulCount: successfulItemIds.length,
      failedCount: failedItemIds.length,
      successfulItemIds,
      failedItemIds,
      messageType: String(result.messageType || ''),
      message: String(result.message || ''),
      completedAt
    }
  });
  await storageRemove([PENDING_POLICY_LISTING_END_REVIEW_KEY]);
  if (pending.returnUrl) {
    await updateChromeTab(tab.id, { url: String(pending.returnUrl), active: true }).catch(() => null);
  }
  await recordExtensionLog({
    source: 'ebay-policy-listings',
    level: failedItemIds.length ? 'warn' : 'info',
    operation: 'approved-end-result',
    message: `Approved policy End batch completed: ${successfulItemIds.length} ended, ${failedItemIds.length} failed. The workflow stopped.`,
    detail: { requestedCount: itemIds.length, successfulItemIds, failedItemIds }
  });
  return {
    ok: failedItemIds.length === 0,
    stopped: true,
    requestedCount: itemIds.length,
    successfulCount: successfulItemIds.length,
    failedCount: failedItemIds.length,
    successfulItemIds,
    failedItemIds,
    message: String(result.message || 'The approved batch finished. GLDN Ops stopped and will not prepare another batch automatically.')
  };
}

function openTab(url, options = {}) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: options.active !== false }, (tab) => {
      const error = chrome.runtime.lastError?.message;
      if (error) resolve({ ok: false, error });
      else resolve({ ok: true, tabId: tab?.id, url });
    });
  });
}

function openBackgroundTab(url, windowId) {
  return new Promise((resolve) => {
    const createOptions = { url, active: false };
    if (Number.isInteger(windowId)) createOptions.windowId = windowId;
    chrome.tabs.create(createOptions, (tab) => {
      const error = chrome.runtime.lastError?.message;
      if (error) resolve({ ok: false, error });
      else resolve({ ok: true, tabId: tab?.id, windowId: tab?.windowId ?? null, url, active: false });
    });
  });
}

function closeTab(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId)) {
      resolve(false);
      return;
    }
    chrome.tabs.remove(tabId, () => resolve(!chrome.runtime.lastError));
  });
}

function handoffAmazonSnipingSellerReview(anchorAsin, anchorTabId, sourceTabId) {
  const asin = String(anchorAsin || '').trim().toUpperCase();
  const preferredTabId = Number(anchorTabId);
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ['*://www.amazon.com/*', '*://amazon.com/*'] }, (tabs) => {
      const queryError = chrome.runtime.lastError?.message;
      if (queryError) {
        resolve({ ok: false, error: queryError });
        return;
      }
      const matches = (tabs || []).filter((tab) => {
        const url = String(tab?.url || '').toUpperCase();
        return Number.isInteger(tab?.id) && asin && (url.includes(`/DP/${asin}`) || url.includes(`/GP/PRODUCT/${asin}`));
      });
      const target = matches.find((tab) => tab.id === preferredTabId)
        || matches.sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0];
      if (!target) {
        resolve({ ok: false, error: `The signed-in Amazon product tab for ${asin || 'this ASIN'} is no longer open.` });
        return;
      }
      chrome.tabs.sendMessage(target.id, { type: 'showSnipingSellerReview' }, (response) => {
        const messageError = chrome.runtime.lastError?.message;
        if (messageError || !response?.ok) {
          resolve({ ok: false, error: messageError || response?.error || 'Amazon did not open the seller review.' });
          return;
        }
        if (Number.isInteger(sourceTabId)) setTimeout(() => closeTab(sourceTabId), 150);
        resolve({ ok: true, tabId: target.id, sourceTabWillClose: Number.isInteger(sourceTabId), stayedInBackground: true });
      });
    });
  });
}

function openSnipingEbaySearch(title, windowId) {
  const query = String(title || '').replace(/\s+/g, ' ').trim();
  if (query.length < 8 || query.length > 500) {
    return Promise.resolve({ ok: false, error: 'A valid Amazon product title is required for the sniping search.' });
  }
  return openBackgroundTab(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_ipg=60`, windowId);
}

function recordExtensionLog(entry) {
  const basePayload = {
    at: new Date().toISOString(),
    source: entry?.source || 'background',
    level: entry?.level || 'error',
    operation: String(entry?.operation || entry?.phase || '').slice(0, 120),
    message: String(entry?.message || 'Unknown extension issue').slice(0, 800),
    detail: String(entry?.detail || '').slice(0, 1200),
    page: entry?.page || '',
    version: chrome.runtime.getManifest().version
  };
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['gldnErrorLog', 'computerLabel', 'ebayAccountLabel'], (result) => {
      const readError = chrome.runtime.lastError;
      if (readError) {
        reject(new Error(readError.message));
        return;
      }
      const payload = {
        ...basePayload,
        computerLabel: String(entry?.computerLabel || result.computerLabel || ''),
        ebayAccountLabel: String(entry?.ebayAccountLabel || result.ebayAccountLabel || '')
      };
      const current = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
      chrome.storage.local.set({ gldnErrorLog: [payload, ...current].slice(0, 120) }, () => {
        const writeError = chrome.runtime.lastError;
        if (writeError) {
          reject(new Error(writeError.message));
          return;
        }
        resolve(payload);
      });
    });
  });
}

async function runDiagnosticLogProbe(sender) {
  const pageUrl = String(sender?.tab?.url || '');
  const parsedUrl = new URL(pageUrl);
  if (!/(^|\.)ebay\.com$/i.test(parsedUrl.hostname)) {
    throw new Error('F-11 diagnostic probe is allowed only on an eBay page.');
  }

  const probeId = `F-11-${Date.now()}`;
  const expectedMessage = 'Controlled diagnostic test failure. No marketplace action was attempted.';
  const entry = await recordExtensionLog({
    source: 'diagnostic-probe',
    level: 'error',
    operation: 'f11-controlled-failure',
    message: expectedMessage,
    detail: `probeId=${probeId}; marketplaceActions=0`,
    page: pageUrl
  });
  const stored = await storageGet(['gldnErrorLog']);
  const readback = (Array.isArray(stored.gldnErrorLog) ? stored.gldnErrorLog : [])
    .find((item) => String(item?.detail || '').includes(`probeId=${probeId}`));
  const ok = Boolean(
    readback
    && readback.at === entry.at
    && readback.source === 'diagnostic-probe'
    && readback.level === 'error'
    && readback.operation === 'f11-controlled-failure'
    && readback.message === expectedMessage
    && readback.page === pageUrl
    && readback.version === chrome.runtime.getManifest().version
    && readback.computerLabel
    && readback.ebayAccountLabel
  );
  const result = {
    id: 'F-11',
    ok,
    probeId,
    marketplaceActions: 0,
    completedAt: new Date().toISOString(),
    entry: readback || null,
    message: ok
      ? 'Controlled failure was logged and verified with page, phase, identity, and error details.'
      : 'Controlled failure log readback was incomplete.'
  };
  await storageSet({ lastDiagnosticLogProbe: result });
  return result;
}

self.addEventListener('error', (event) => {
  recordExtensionLog({
    source: 'background',
    message: event.message,
    detail: `${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}\n${event.error?.stack || ''}`
  });
});

self.addEventListener('unhandledrejection', (event) => {
  recordExtensionLog({
    source: 'background',
    message: event.reason?.message || String(event.reason || 'Unhandled promise rejection'),
    detail: event.reason?.stack || ''
  });
});

function cleanWebAppUrl(value) {
  const raw = String(value || '').trim();
  if (/YOUR_SCRIPT_ID/i.test(raw)) return '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!/script\.google\.com$|script\.googleusercontent\.com$/i.test(url.hostname)) {
      throw new Error('Use the Google Apps Script web app URL ending in /exec.');
    }
    if (!/\/exec\/?$/i.test(url.pathname)) {
      throw new Error('Use the deployed web app URL ending in /exec, not a /dev test URL.');
    }
    return url.toString();
  } catch (error) {
    throw new Error(error.message || 'The dashboard URL is not valid.');
  }
}

async function getDashboardConfig() {
  const config = globalThis.GLDN_CONFIG || {};
  let stored = await storageGet([DASHBOARD_URL_KEY, DASHBOARD_SECRET_KEY]);
  if (!String(stored[DASHBOARD_SECRET_KEY] || '').trim()) {
    await seedDashboardSetupFromLocalConfig();
    stored = await storageGet([DASHBOARD_URL_KEY, DASHBOARD_SECRET_KEY]);
  }
  let url = cleanWebAppUrl(stored[DASHBOARD_URL_KEY] || config.dashboardUrl);
  let key = String(stored[DASHBOARD_SECRET_KEY] || config.dashboardKey || '').trim();
  if (!url || !key || /^YOUR_/i.test(key)) {
    throw new Error('Dashboard setup code is missing. Open GLDN Ops Setup and choose Connect Dashboard.');
  }
  return { url, key };
}

async function openDashboardTab(options = {}) {
  const { url, key } = await getDashboardConfig();
  const dashboard = new URL(url);
  dashboard.searchParams.set('key', key);
  const opened = await openTab(dashboard.toString(), { active: options.active !== false });
  if (!opened.ok) throw new Error(opened.error || 'Could not open the dashboard.');
  return opened;
}

async function seedDashboardSetupFromLocalConfig() {
  try {
    const stored = await storageGet([DASHBOARD_URL_KEY, DASHBOARD_SECRET_KEY]);
    if (String(stored[DASHBOARD_SECRET_KEY] || '').trim()) {
      return { ok: true, changed: false, source: 'saved-profile' };
    }
    const response = await fetch(chrome.runtime.getURL('config.js'), { cache: 'no-store' });
    if (!response.ok) return { ok: false, error: 'Local config.js was not found.' };

    const text = await response.text();
    const urlMatch = text.match(/dashboardUrl\s*:\s*["']([^"']+)["']/);
    const keyMatch = text.match(/dashboardKey\s*:\s*["']([^"']+)["']/);
    const dashboardUrl = cleanWebAppUrl(urlMatch?.[1] || globalThis.GLDN_CONFIG?.dashboardUrl || '');
    const dashboardKey = String(keyMatch?.[1] || '').trim();

    if (!dashboardKey || /^YOUR_/i.test(dashboardKey)) {
      return { ok: false, error: 'Local config.js does not contain a dashboard setup code.' };
    }

    const changed = stored[DASHBOARD_URL_KEY] !== dashboardUrl || stored[DASHBOARD_SECRET_KEY] !== dashboardKey;
    if (changed) {
      await storageSet({
        [DASHBOARD_URL_KEY]: dashboardUrl,
        [DASHBOARD_SECRET_KEY]: dashboardKey
      });
    }
    return { ok: true, changed, source: 'private-package' };
  } catch (error) {
    return { ok: false, error: error.message || 'Could not read local config.js.' };
  }
}

function seedAutomaticDashboardSetup(operation) {
  seedDashboardSetupFromLocalConfig().then((result) => {
    if (result.ok || result.error === 'Local config.js was not found.') return;
    recordExtensionLog({ source: 'dashboard', operation, message: result.error });
  }).catch((error) => {
    recordExtensionLog({ source: 'dashboard', operation, message: error.message });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DASHBOARD_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Dashboard request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function dashboardRequestTimeoutMs(action) {
  const batchActions = new Set([
    'marketplaceProfitBatch',
    'ebayMonthlyProfitBatch',
    'ebayCostResolutionBatch',
    'poshmarkMonthlyProfitBatch',
    'poshmarkCostResolutionBatch',
    'orderPlacementAuditConfig',
    'orderPlacementAuditExpectedBatch',
    'orderPlacementAuditAmazonBatch'
  ]);
  return batchActions.has(String(action || ''))
    ? DASHBOARD_BATCH_REQUEST_TIMEOUT_MS
    : DASHBOARD_REQUEST_TIMEOUT_MS;
}

async function postToDashboard(action, record = null) {
  const { url, key } = await getDashboardConfig();
  const syncId = String(record?.syncId || '').trim();
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      key,
      record,
      syncId,
      extensionVersion: chrome.runtime.getManifest().version,
      sentAt: new Date().toISOString()
    })
  }, dashboardRequestTimeoutMs(action));

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    const preview = text.replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(`Dashboard returned an unexpected response: ${preview || response.status}`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Dashboard request failed (${response.status}).`);
  }
  return data;
}

async function testDashboardConnection() {
  try {
    const data = await postToDashboard('ping');
    await storageSet({
      lastDashboardSync: {
        ok: true,
        at: new Date().toISOString(),
        message: 'Connection test passed'
      }
    });
    return { ok: true, data };
  } catch (error) {
    await storageSet({
      lastDashboardSync: {
        ok: false,
        at: new Date().toISOString(),
        error: error.message
      }
    });
    return { ok: false, error: error.message };
  }
}

function createSyncId(action, record = {}) {
  const existing = String(record?.syncId || '').trim();
  if (existing) return existing;
  const unique = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `gldn-${String(action || 'sync')}-${unique}`;
}

function recordWithSyncId(action, record = {}) {
  return {
    ...(record || {}),
    syncId: createSyncId(action, record),
    recordedAt: String(record?.recordedAt || record?.savedAt || new Date().toISOString())
  };
}

function dashboardRetryDelayMs(attempts) {
  const minutes = Math.min(360, Math.max(1, 2 ** Math.min(Number(attempts || 1) - 1, 8)));
  return minutes * 60 * 1000;
}

async function enqueueDashboardSync(action, record, errorMessage) {
  const stored = await storageGet([DASHBOARD_QUEUE_KEY]);
  const queue = Array.isArray(stored[DASHBOARD_QUEUE_KEY]) ? stored[DASHBOARD_QUEUE_KEY] : [];
  const syncId = String(record?.syncId || createSyncId(action, record));
  const now = new Date().toISOString();
  const existingIndex = queue.findIndex((item) => item?.syncId === syncId);
  const previous = existingIndex >= 0 ? queue[existingIndex] : null;
  const attempts = Number(previous?.attempts || 0) + 1;
  const queued = {
    action,
    record: { ...(record || {}), syncId },
    syncId,
    createdAt: previous?.createdAt || now,
    lastAttemptAt: now,
    attempts,
    nextAttemptAt: new Date(Date.now() + dashboardRetryDelayMs(attempts)).toISOString(),
    lastError: String(errorMessage || 'Dashboard sync failed').slice(0, 800)
  };
  if (existingIndex >= 0) queue.splice(existingIndex, 1, queued);
  else queue.push(queued);
  await storageSet({ [DASHBOARD_QUEUE_KEY]: queue.slice(-250) });
  chrome.alarms.create(DASHBOARD_RETRY_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  return queued;
}

async function removeQueuedDashboardSync(syncId) {
  if (!syncId) return;
  const stored = await storageGet([DASHBOARD_QUEUE_KEY]);
  const queue = Array.isArray(stored[DASHBOARD_QUEUE_KEY]) ? stored[DASHBOARD_QUEUE_KEY] : [];
  const remaining = queue.filter((item) => item?.syncId !== syncId);
  if (remaining.length !== queue.length) await storageSet({ [DASHBOARD_QUEUE_KEY]: remaining });
}

function isObsoleteSubscribeSaveTaskCompletion(item = {}) {
  const record = item?.record || {};
  if (String(item?.action || '') !== 'taskCompletion') return false;
  if (String(record.featureKey || '') !== 'amazon-subscribe-save') return false;
  return String(record.scopeMode || '') === 'current-amazon-account'
    || String(record.proofType || '') === 'verified-zero-active-subscriptions-current-profile'
    || record.allProfilesVerified !== true;
}

async function migrateObsoleteDashboardQueue(reason = 'startup') {
  const stored = await storageGet([DASHBOARD_QUEUE_KEY, DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY]);
  const queue = Array.isArray(stored[DASHBOARD_QUEUE_KEY]) ? stored[DASHBOARD_QUEUE_KEY] : [];
  const removed = queue.filter(isObsoleteSubscribeSaveTaskCompletion);
  if (!removed.length) {
    return { ok: true, removed: 0, remaining: queue.length, audit: stored[DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY] || null };
  }

  const remaining = queue.filter((item) => !isObsoleteSubscribeSaveTaskCompletion(item));
  const audit = {
    at: new Date().toISOString(),
    reason: String(reason || 'startup'),
    removedCount: removed.length,
    remainingCount: remaining.length,
    items: removed.slice(-25).map((item) => ({
      action: String(item?.action || ''),
      syncId: String(item?.syncId || item?.record?.syncId || ''),
      attempts: Number(item?.attempts || 0),
      lastError: String(item?.lastError || '').slice(0, 300)
    }))
  };
  await storageSet({
    [DASHBOARD_QUEUE_KEY]: remaining,
    [DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY]: audit
  });
  await recordExtensionLog({
    source: 'background-sync',
    operation: 'legacy-queue-migration',
    level: 'info',
    message: `Removed ${removed.length} obsolete current-profile Subscribe & Save task-completion retry.`,
    detail: JSON.stringify({ reason: audit.reason, syncIds: audit.items.map((item) => item.syncId) })
  });
  return { ok: true, removed: removed.length, remaining: remaining.length, audit };
}

let dashboardQueueProcessing = false;

async function processDashboardQueue({ force = false } = {}) {
  if (dashboardQueueProcessing) return { ok: true, busy: true };
  dashboardQueueProcessing = true;
  try {
    await migrateObsoleteDashboardQueue('queue-processing');
    const stored = await storageGet([DASHBOARD_QUEUE_KEY]);
    const queue = Array.isArray(stored[DASHBOARD_QUEUE_KEY]) ? stored[DASHBOARD_QUEUE_KEY] : [];
    if (!queue.length) return { ok: true, processed: 0, remaining: 0 };

    const now = Date.now();
    let processed = 0;
    const remaining = [];
    for (const item of queue) {
      const due = force || !item?.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now;
      if (!due || processed >= 20) {
        remaining.push(item);
        continue;
      }
      try {
        const data = await postToDashboard(item.action, item.record);
        processed += 1;
        await storageSet({
          lastDashboardSync: {
            ok: true,
            retried: true,
            at: new Date().toISOString(),
            syncId: item.syncId,
            computerLabel: item.record?.computerLabel || '',
            ebayAccountLabel: item.record?.ebayAccountLabel || '',
            message: data.message || 'Queued dashboard record synced'
          }
        });
      } catch (error) {
        const attempts = Number(item?.attempts || 0) + 1;
        remaining.push({
          ...item,
          attempts,
          lastAttemptAt: new Date().toISOString(),
          nextAttemptAt: new Date(Date.now() + dashboardRetryDelayMs(attempts)).toISOString(),
          lastError: String(error.message || error).slice(0, 800)
        });
      }
    }
    await storageSet({ [DASHBOARD_QUEUE_KEY]: remaining });
    return { ok: true, processed, remaining: remaining.length };
  } finally {
    dashboardQueueProcessing = false;
  }
}

async function forceDashboardTimeoutForProbe() {
  await new Promise((resolve) => setTimeout(resolve, 25));
  throw new Error('Dashboard request timed out.');
}

async function handleSync(action, record, successMessage, options = {}) {
  const syncedRecord = recordWithSyncId(action, record);
  try {
    if (options.forceTimeoutProbe === true) await forceDashboardTimeoutForProbe();
    const data = await postToDashboard(action, syncedRecord);
    await removeQueuedDashboardSync(syncedRecord.syncId);
    await storageSet({
      lastDashboardSync: {
        ok: true,
        at: new Date().toISOString(),
        syncId: syncedRecord.syncId,
        computerLabel: syncedRecord.computerLabel || '',
        ebayAccountLabel: syncedRecord.ebayAccountLabel || '',
        message: data.message || successMessage
      }
    });
    return { ok: true, data, syncId: syncedRecord.syncId };
  } catch (error) {
    const queued = await enqueueDashboardSync(action, syncedRecord, error.message);
    recordExtensionLog({
      source: 'background-sync',
      operation: action,
      message: error.message,
      detail: `Queued as ${syncedRecord.syncId}`,
      computerLabel: syncedRecord.computerLabel,
      ebayAccountLabel: syncedRecord.ebayAccountLabel
    });
    await storageSet({
      lastDashboardSync: {
        ok: false,
        queued: true,
        at: new Date().toISOString(),
        syncId: syncedRecord.syncId,
        error: error.message
      }
    });
    return { ok: false, queued: true, syncId: syncedRecord.syncId, attempts: queued.attempts, error: error.message };
  }
}

function historicalProfitBatchSyncId(action, run, batchIndex, recordCount) {
  const runId = String(run?.runId || 'unknown-run').replace(/[^a-z0-9_-]+/gi, '-');
  return `gldn-${action}-${runId}-${batchIndex}-${recordCount}`;
}

async function performReviewedPoshmarkBackfillSync(confirmToken) {
  const pendingReview = await PROFIT_BACKFILL_BACKGROUND.pendingReviewForSync();
  const run = pendingReview.run;
  const pendingCount = pendingReview.reviewRecords.length;
  const expectedToken = run.scope === 'month'
    ? `APPROVE SYNC POSHMARK ${run.monthKey} ${pendingCount}`
    : run.scope === 'resolve-ebay'
    ? `APPROVE RESOLVE EBAY COSTS ${pendingCount}`
    : run.scope === 'resolve-missing'
    ? `APPROVE RESOLVE POSHMARK COSTS ${pendingCount}`
    : 'SYNC_EXACT_POSHMARK_PROFITS';
  if (confirmToken !== expectedToken) {
    return { ok: false, error: `Explicit historical-profit sync approval is missing. Expected ${expectedToken}.` };
  }

  if (run.scope === 'month' || ['resolve-missing', 'resolve-ebay'].includes(run.scope)) {
    if (!pendingCount) {
      return {
        ok: true,
        count: 0,
        message: 'No reviewed Poshmark rows need syncing.',
        summary: globalThis.GLDN_PROFIT_BACKFILL.summary(run),
        state: run
      };
    }
    const handledOrders = [];
    const responses = [];
    const exactByOrder = new Map(pendingReview.exactRecords.map((record) => [String(record.orderNumber || ''), record]));
    for (let index = 0; index < pendingReview.reviewRecords.length; index += HISTORICAL_PROFIT_SYNC_BATCH_SIZE) {
      const reviewRecords = pendingReview.reviewRecords.slice(index, index + HISTORICAL_PROFIT_SYNC_BATCH_SIZE);
      const records = reviewRecords.map((record) => exactByOrder.get(String(record.orderNumber || ''))).filter(Boolean);
      const action = run.scope === 'month'
        ? 'poshmarkMonthlyProfitBatch'
        : run.scope === 'resolve-ebay'
        ? 'ebayCostResolutionBatch'
        : 'poshmarkCostResolutionBatch';
      const batchIndex = Math.floor(index / HISTORICAL_PROFIT_SYNC_BATCH_SIZE);
      const response = await handleSync(action, {
        monthKey: run.monthKey || '',
        runId: run.runId,
        syncId: historicalProfitBatchSyncId(action, run, batchIndex, reviewRecords.length),
        batchIndex,
        records,
        reviewRecords
      }, run.scope === 'month'
        ? 'Monthly Poshmark profit batch synced'
        : run.scope === 'resolve-ebay'
        ? 'eBay Amazon-cost resolution batch synced'
        : 'Poshmark Amazon-cost resolution batch synced');
      responses.push(response);
      if (!response.ok && !response.queued) break;
      handledOrders.push(...reviewRecords.map((record) => String(record.orderNumber || '')).filter(Boolean));
    }
    const state = handledOrders.length
      ? await PROFIT_BACKFILL_BACKGROUND.markSynced(handledOrders, {
        queued: responses.some((response) => response.queued),
        keepWorkerOpen: ['resolve-missing', 'resolve-ebay'].includes(run.scope)
      })
      : run;
    return {
      ok: handledOrders.length === pendingReview.reviewRecords.length,
      queued: responses.some((response) => response.queued),
      count: handledOrders.length,
      requested: pendingReview.reviewRecords.length,
      exact: pendingReview.exactRecords.length,
      unresolved: pendingReview.reviewRecords.length - pendingReview.exactRecords.length,
      summary: globalThis.GLDN_PROFIT_BACKFILL.summary(state),
      state,
      responses
    };
  }

  const pending = await PROFIT_BACKFILL_BACKGROUND.exactRecordsForSync();
  if (!pending.records.length) {
    return {
      ok: true,
      count: 0,
      message: 'No new exact Poshmark profit rows need syncing.',
      summary: globalThis.GLDN_PROFIT_BACKFILL.summary(pending.run),
      state: pending.run
    };
  }
  const handledOrders = [];
  const responses = [];
  for (let index = 0; index < pending.records.length; index += HISTORICAL_PROFIT_SYNC_BATCH_SIZE) {
    const records = pending.records.slice(index, index + HISTORICAL_PROFIT_SYNC_BATCH_SIZE);
    const batchIndex = Math.floor(index / HISTORICAL_PROFIT_SYNC_BATCH_SIZE);
    const response = await handleSync('marketplaceProfitBatch', {
      syncId: historicalProfitBatchSyncId('marketplaceProfitBatch', pending.run, batchIndex, records.length),
      runId: pending.run.runId,
      batchIndex,
      records
    }, 'Historical Poshmark profit batch synced');
    responses.push(response);
    if (!response.ok && !response.queued) break;
    handledOrders.push(...records.map((record) => String(record.orderNumber || '')).filter(Boolean));
  }
  const state = handledOrders.length
    ? await PROFIT_BACKFILL_BACKGROUND.markSynced(handledOrders, { queued: responses.some((response) => response.queued) })
    : pending.run;
  return {
    ok: handledOrders.length === pending.records.length,
    queued: responses.some((response) => response.queued),
    count: handledOrders.length,
    requested: pending.records.length,
    summary: globalThis.GLDN_PROFIT_BACKFILL.summary(state),
    state,
    responses
  };
}

async function syncReviewedPoshmarkBackfill(confirmToken) {
  if (historicalProfitSyncPromise) return historicalProfitSyncPromise;
  historicalProfitSyncPromise = performReviewedPoshmarkBackfillSync(confirmToken);
  try {
    return await historicalProfitSyncPromise;
  } finally {
    historicalProfitSyncPromise = null;
  }
}

async function performReviewedEbayMonthlyProfitSync(confirmToken) {
  const pending = await EBAY_PROFIT_BACKGROUND.pendingForSync();
  const expectedToken = EBAY_PROFIT_CORE.approvalToken(pending.run);
  if (String(confirmToken || '').trim() !== expectedToken) {
    return { ok: false, error: `Explicit monthly eBay profit approval is missing. Expected ${expectedToken}.` };
  }
  if (!pending.reviewRecords.length) {
    return {
      ok: true,
      count: 0,
      message: 'No reviewed eBay profit rows need syncing.',
      state: pending.run,
      summary: EBAY_PROFIT_CORE.summary(pending.run)
    };
  }

  const handledOrders = [];
  const responses = [];
  const exactByOrder = new Map(pending.records.map((record) => [String(record.orderNumber || ''), record]));
  for (let index = 0; index < pending.reviewRecords.length; index += HISTORICAL_PROFIT_SYNC_BATCH_SIZE) {
    const reviewRecords = pending.reviewRecords.slice(index, index + HISTORICAL_PROFIT_SYNC_BATCH_SIZE);
    const records = reviewRecords.map((record) => exactByOrder.get(String(record.orderNumber || ''))).filter(Boolean);
    const batchIndex = Math.floor(index / HISTORICAL_PROFIT_SYNC_BATCH_SIZE);
    const response = await handleSync('ebayMonthlyProfitBatch', {
      syncId: historicalProfitBatchSyncId('ebayMonthlyProfitBatch', pending.run, batchIndex, reviewRecords.length),
      runId: pending.run.runId,
      monthKey: pending.run.monthKey,
      batchIndex,
      records,
      reviewRecords
    }, 'Monthly eBay note-profit and Amazon reconciliation batch synced');
    responses.push(response);
    if (!response.ok && !response.queued) break;
    handledOrders.push(...reviewRecords.map((record) => String(record.orderNumber || '')).filter(Boolean));
  }

  const state = handledOrders.length
    ? await EBAY_PROFIT_BACKGROUND.markSynced(handledOrders, { queued: responses.some((response) => response.queued) })
    : pending.run;
  return {
    ok: handledOrders.length === pending.reviewRecords.length,
    queued: responses.some((response) => response.queued),
    count: handledOrders.length,
    requested: pending.reviewRecords.length,
    exact: pending.records.length,
    unresolved: pending.reviewRecords.length - pending.records.length,
    state,
    summary: EBAY_PROFIT_CORE.summary(state),
    responses
  };
}

async function syncReviewedEbayMonthlyProfit(confirmToken) {
  if (ebayMonthlyProfitSyncPromise) return ebayMonthlyProfitSyncPromise;
  ebayMonthlyProfitSyncPromise = performReviewedEbayMonthlyProfitSync(confirmToken);
  try {
    return await ebayMonthlyProfitSyncPromise;
  } finally {
    ebayMonthlyProfitSyncPromise = null;
  }
}

async function runDashboardQueueProbe(sender) {
  const pageUrl = String(sender?.tab?.url || '');
  const parsedUrl = new URL(pageUrl);
  if (!/(^|\.)ebay\.com$/i.test(parsedUrl.hostname)) {
    throw new Error('F-09 dashboard queue probe is allowed only on an eBay page.');
  }

  const stored = await storageGet([DASHBOARD_QUEUE_KEY, 'computerLabel', 'ebayAccountLabel']);
  const baselineQueue = Array.isArray(stored[DASHBOARD_QUEUE_KEY]) ? stored[DASHBOARD_QUEUE_KEY] : [];
  if (baselineQueue.length) {
    return {
      id: 'F-09',
      ok: false,
      stoppedSafely: true,
      baselineCount: baselineQueue.length,
      marketplaceActions: 0,
      dashboardMutations: 0,
      error: 'The dashboard queue is not empty. Existing records were left untouched.'
    };
  }

  const probeId = `F-09-${Date.now()}`;
  const syncId = `gldn-ping-${probeId}`;
  const record = {
    syncId,
    probeId,
    probe: 'F-09',
    computerLabel: String(stored.computerLabel || ''),
    ebayAccountLabel: String(stored.ebayAccountLabel || ''),
    page: pageUrl,
    marketplaceActions: 0,
    dashboardMutations: 0
  };

  const failed = await handleSync('ping', record, 'Dashboard queue probe ping succeeded', {
    forceTimeoutProbe: true
  });
  const afterFailureStored = await storageGet([DASHBOARD_QUEUE_KEY]);
  const afterFailure = Array.isArray(afterFailureStored[DASHBOARD_QUEUE_KEY])
    ? afterFailureStored[DASHBOARD_QUEUE_KEY]
    : [];

  const duplicate = await enqueueDashboardSync('ping', record, 'Dashboard request timed out.');
  const afterDuplicateStored = await storageGet([DASHBOARD_QUEUE_KEY]);
  const afterDuplicate = Array.isArray(afterDuplicateStored[DASHBOARD_QUEUE_KEY])
    ? afterDuplicateStored[DASHBOARD_QUEUE_KEY]
    : [];

  const retried = await processDashboardQueue({ force: true });
  const finalStored = await storageGet([DASHBOARD_QUEUE_KEY, 'lastDashboardSync']);
  const finalQueue = Array.isArray(finalStored[DASHBOARD_QUEUE_KEY]) ? finalStored[DASHBOARD_QUEUE_KEY] : [];
  const passed = Boolean(
    failed?.queued === true
    && failed?.syncId === syncId
    && afterFailure.length === 1
    && afterFailure[0]?.syncId === syncId
    && afterDuplicate.length === 1
    && afterDuplicate[0]?.syncId === syncId
    && duplicate?.attempts === 2
    && retried?.processed === 1
    && retried?.remaining === 0
    && finalQueue.length === 0
    && finalStored.lastDashboardSync?.retried === true
    && finalStored.lastDashboardSync?.syncId === syncId
  );

  if (!passed) await removeQueuedDashboardSync(syncId);
  const cleanupStored = await storageGet([DASHBOARD_QUEUE_KEY]);
  const cleanupQueue = Array.isArray(cleanupStored[DASHBOARD_QUEUE_KEY]) ? cleanupStored[DASHBOARD_QUEUE_KEY] : [];
  const result = {
    id: 'F-09',
    ok: passed,
    probeId,
    syncId,
    baselineCount: baselineQueue.length,
    queuedAfterFailure: afterFailure.length,
    queuedAfterDuplicate: afterDuplicate.length,
    duplicateAttempts: duplicate?.attempts || 0,
    retryProcessed: Number(retried?.processed || 0),
    retryRemaining: Number(retried?.remaining || 0),
    finalQueueCount: cleanupQueue.length,
    retriedWithSameSyncId: finalStored.lastDashboardSync?.syncId === syncId,
    marketplaceActions: 0,
    dashboardMutations: 0,
    completedAt: new Date().toISOString(),
    message: passed
      ? 'Controlled timeout queued once, duplicate enqueue kept one sync ID, retry succeeded, and the queue cleared.'
      : 'Dashboard queue probe did not complete every queue and retry assertion.'
  };
  await storageSet({ lastDashboardQueueProbe: result });
  await recordExtensionLog({
    source: 'dashboard-queue-probe',
    level: passed ? 'info' : 'error',
    operation: 'f09-timeout-queue-retry',
    message: result.message,
    detail: JSON.stringify(result),
    page: pageUrl,
    computerLabel: record.computerLabel,
    ebayAccountLabel: record.ebayAccountLabel
  });
  return result;
}

async function findEcomSniperExtension() {
  return {
    ok: true,
    installed: null,
    enabled: null,
    id: ECOMSNIPER_EXTENSION_ID,
    name: 'EcomSniper',
    storeSafe: true,
    message: 'Chrome extension mode uses the configured EcomSniper extension ID. Open the page to confirm it is installed in this Chrome profile.'
  };
}

function ecomSniperPageRendered(pageKey, tab, expectedUrl = '') {
  const title = String(tab?.title || '').trim();
  const titlePattern = ECOMSNIPER_PAGE_TITLE_PATTERNS[pageKey];
  return Boolean(titlePattern)
    && String(tab?.status || '') === 'complete'
    && (!expectedUrl || controlUrlsEqual(tab?.url, expectedUrl))
    && titlePattern.test(title)
    && !/file couldn't be accessed|err_file_not_found/i.test(title);
}

async function resolveEcomSniperPage(pageKey, extensionId) {
  const candidates = ECOMSNIPER_PAGE_CANDIDATES[pageKey];
  if (!Array.isArray(candidates) || !candidates.length) throw new Error('Unknown EcomSniper page.');

  const stored = await storageGet([ECOMSNIPER_RESOLVED_PAGES_KEY]);
  const resolvedPages = stored[ECOMSNIPER_RESOLVED_PAGES_KEY] && typeof stored[ECOMSNIPER_RESOLVED_PAGES_KEY] === 'object'
    ? stored[ECOMSNIPER_RESOLVED_PAGES_KEY]
    : {};
  const paths = [...new Set([String(resolvedPages[pageKey] || '').trim(), ...candidates].filter(Boolean))];

  for (const pagePath of paths) {
    const url = `chrome-extension://${extensionId}/${pagePath}`;
    const opened = await openTab(url, { active: false });
    if (!opened.ok || !Number.isInteger(opened.tabId)) continue;
    const tab = await waitForControlTabSettled(opened.tabId, 20000).catch(() => null);
    if (ecomSniperPageRendered(pageKey, tab, url)) {
      if (resolvedPages[pageKey] !== pagePath) {
        await storageSet({
          [ECOMSNIPER_RESOLVED_PAGES_KEY]: {
            ...resolvedPages,
            [pageKey]: pagePath
          }
        });
      }
      return { tab, tabId: opened.tabId, pagePath, url };
    }
    await closeChromeTab(opened.tabId);
  }

  throw new Error(`${ECOMSNIPER_PAGE_LABELS[pageKey] || 'EcomSniper'} is installed, but none of its supported page routes rendered. Update EcomSniper or GLDN Ops before retrying.`);
}

async function openEcomSniperPage(pageKey) {
  if (!ECOMSNIPER_PAGE_CANDIDATES[pageKey]) return { ok: false, error: 'Unknown EcomSniper page.' };

  const extension = await findEcomSniperExtension();
  if (!extension.id) return { ok: false, error: 'EcomSniper extension ID is not configured.' };

  let resolved;
  try {
    resolved = await resolveEcomSniperPage(pageKey, extension.id);
  } catch (error) {
    return { ok: false, error: String(error?.message || error), extension };
  }
  const tab = await updateChromeTab(resolved.tabId, { active: true });
  await focusChromeWindow(tab.windowId);
  const now = new Date().toISOString();
  await storageSet({
    ecomSniperHandoffStatus: {
      state: 'open',
      pageKey,
      pageLabel: ECOMSNIPER_PAGE_LABELS[pageKey] || 'EcomSniper',
      pagePath: resolved.pagePath,
      url: resolved.url,
      title: String(tab?.title || resolved.tab?.title || ''),
      renderVerified: true,
      tabId: resolved.tabId,
      openedAt: now,
      updatedAt: now,
      observableScope: 'tab-lifecycle-only'
    }
  });
  return {
    ok: true,
    url: resolved.url,
    pagePath: resolved.pagePath,
    title: String(tab?.title || resolved.tab?.title || ''),
    renderVerified: true,
    tabId: resolved.tabId,
    extension
  };
}

async function stopEcomSniperHandoff() {
  const stored = await storageGet(['ecomSniperHandoffStatus']);
  const handoff = stored.ecomSniperHandoffStatus;
  const tabId = Number(handoff?.tabId);
  if (!handoff || handoff.state !== 'open' || !Number.isInteger(tabId)) {
    return { ok: true, closed: false, message: 'No GLDN-opened EcomSniper handoff is active.' };
  }

  let tab = null;
  try {
    tab = await getTab(tabId);
  } catch {
    tab = null;
  }
  const expectedPrefix = `chrome-extension://${ECOMSNIPER_EXTENSION_ID}/`;
  if (tab && !String(tab.url || '').startsWith(expectedPrefix)) {
    return { ok: false, closed: false, error: 'The saved handoff tab no longer belongs to EcomSniper, so GLDN left it open.' };
  }
  if (tab) await closeChromeTab(tabId);

  const now = new Date().toISOString();
  await storageSet({
    ecomSniperHandoffStatus: {
      ...handoff,
      state: 'closed',
      closedAt: now,
      updatedAt: now,
      closeReason: 'operator-stop',
      observableScope: 'tab-lifecycle-only'
    }
  });
  return { ok: true, closed: Boolean(tab), message: tab ? 'The GLDN-opened EcomSniper handoff tab was closed.' : 'The handoff tab was already closed.' };
}

async function openAmazonOrderSearch(asin) {
  const cleaned = String(asin || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(cleaned)) {
    return { ok: false, error: 'Amazon ASIN was not detected from the marketplace SKU.' };
  }
  const url = `https://www.amazon.com/gp/your-account/order-history?orderFilter=last30`;
  return openTab(url);
}

async function runExtensionHealthCheck() {
  const queueMigration = await migrateObsoleteDashboardQueue('health-check');
  const [ecomSniper, workflowStatus, updater] = await Promise.all([
    findEcomSniperExtension(),
    activeWorkflowStatus(),
    getUpdaterRuntimeStatus(true).catch((error) => ({ ok: false, error: error.message }))
  ]);

  let dashboard = { ok: false, error: 'Not tested.' };
  try {
    const data = await postToDashboard('ping');
    dashboard = { ok: true, message: data.message || 'Dashboard connection works.' };
  } catch (error) {
    dashboard = { ok: false, error: error.message };
  }

  const storedIdentity = await storageGet([
    'computerLabel',
    'ebayAccountLabel',
    SETTINGS_SCHEMA_KEY,
    SETTINGS_BACKUP_KEY,
    DASHBOARD_QUEUE_KEY,
    DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY
  ]);
  const identity = identityForComputer(storedIdentity.computerLabel);
  const computerLabel = identity.computerLabel || String(storedIdentity.computerLabel || '').trim();
  const poshmarkOnly = identity.poshmarkOnly || computerLabel.toLowerCase() === '7';
  const ecomSniperRequired = !poshmarkOnly;
  const dashboardQueue = Array.isArray(storedIdentity[DASHBOARD_QUEUE_KEY])
    ? storedIdentity[DASHBOARD_QUEUE_KEY]
    : [];
  return {
    ok: Boolean(
      dashboard.ok
      && updater.ok
      && !updater.error
      && updater.releaseFeedBehind !== true
      && (!ecomSniperRequired || ecomSniper.ok)
    ),
    version: chrome.runtime.getManifest().version,
    name: chrome.runtime.getManifest().name,
    identity: {
      computerLabel,
      ebayAccountLabel: identity.ebayAccountLabel || ''
    },
    requirements: {
      ecomSniperRequired,
      localHelperRequired: false,
      updaterRequired: true
    },
    foundation: {
      deploymentMode: FOUNDATION.deploymentMode,
      settingsSchemaVersion: Number(storedIdentity[SETTINGS_SCHEMA_KEY] || 0),
      expectedSettingsSchemaVersion: FOUNDATION.settingsSchemaVersion,
      settingsBackupCount: Array.isArray(storedIdentity[SETTINGS_BACKUP_KEY])
        ? storedIdentity[SETTINGS_BACKUP_KEY].length
        : 0,
      dashboardQueuedRecords: dashboardQueue.length,
      dashboardQueueMigration: queueMigration.audit || storedIdentity[DASHBOARD_QUEUE_MIGRATION_AUDIT_KEY] || null
    },
    dashboard,
    updater,
    workflows: workflowStatus,
    ecomSniper
  };
}

async function migrateFoundationSettings(reason = 'startup') {
  const stored = await storageGet([
    SETTINGS_SCHEMA_KEY,
    SETTINGS_BACKUP_KEY,
    'computerLabel',
    'ebayAccountLabel',
    'gldnUiOpacity',
    'gldnUiTheme'
  ]);
  const normalized = FOUNDATION.normalizeStoredSettings(stored);
  const updates = {
    [SETTINGS_SCHEMA_KEY]: normalized.settingsSchemaVersion,
    gldnUiOpacity: normalized.gldnUiOpacity,
    gldnUiTheme: normalized.gldnUiTheme
  };
  if (normalized.computerLabel) {
    updates.computerLabel = normalized.computerLabel;
    updates.ebayAccountLabel = normalized.ebayAccountLabel;
  }

  const changed = Object.entries(updates).some(([key, value]) => stored[key] !== value);
  if (!changed) return { ok: true, changed: false, settings: normalized };

  const backups = Array.isArray(stored[SETTINGS_BACKUP_KEY]) ? stored[SETTINGS_BACKUP_KEY] : [];
  const backup = {
    at: new Date().toISOString(),
    reason,
    fromSchemaVersion: Number(stored[SETTINGS_SCHEMA_KEY] || 0),
    settings: {
      computerLabel: stored.computerLabel || '',
      ebayAccountLabel: stored.ebayAccountLabel || '',
      gldnUiOpacity: stored.gldnUiOpacity,
      gldnUiTheme: stored.gldnUiTheme
    }
  };
  await storageSet({
    ...updates,
    [SETTINGS_BACKUP_KEY]: [...backups, backup].slice(-10),
    lastSettingsMigration: {
      at: new Date().toISOString(),
      reason,
      schemaVersion: normalized.settingsSchemaVersion
    }
  });
  recordExtensionLog({
    source: 'foundation',
    level: 'info',
    operation: 'settings-migration',
    message: `Settings migrated to schema ${normalized.settingsSchemaVersion}.`,
    detail: reason
  });
  return { ok: true, changed: true, settings: normalized };
}

function scheduleDashboardRetry() {
  chrome.alarms.create(DASHBOARD_RETRY_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
}

function pauseIncompatibleProfitBackfill(reason) {
  if (!PROFIT_BACKFILL_BACKGROUND?.pauseIncompatibleVersion) {
    return Promise.resolve({ ok: true, changed: false, unavailable: true });
  }
  return PROFIT_BACKFILL_BACKGROUND.pauseIncompatibleVersion(reason);
}

function pauseIncompatibleEbayProfit(reason) {
  if (!EBAY_PROFIT_BACKGROUND?.pauseIncompatibleVersion) {
    return Promise.resolve({ ok: true, changed: false, unavailable: true });
  }
  return EBAY_PROFIT_BACKGROUND.pauseIncompatibleVersion(reason);
}

const reloadTab = (tabId) => new Promise((resolve) => {
  chrome.tabs.reload(tabId, () => {
    const error = chrome.runtime.lastError;
    resolve({ tabId, ok: !error, error: error?.message || '' });
  });
});

async function resumeExtensionReloadRequest() {
  const stored = await storageGet(['lastExtensionReloadRequest']);
  const request = stored.lastExtensionReloadRequest;
  if (!request?.pending) return { ok: true, skipped: true };

  const requestedAt = new Date(request.at || 0).getTime();
  if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > 2 * 60 * 1000) {
    await storageSet({
      lastExtensionReloadRequest: {
        ...request,
        pending: false,
        completedAt: new Date().toISOString(),
        error: 'Reload request expired before the requesting tab refreshed.'
      }
    });
    return { ok: false, expired: true };
  }

  const sourceTabId = Number.isInteger(request.sourceTabId) ? request.sourceTabId : null;
  const result = Number.isInteger(sourceTabId)
    ? await reloadTab(sourceTabId)
    : { tabId: null, ok: true, skipped: true, error: '' };
  const failed = result.ok ? [] : [result];
  const attempts = Number(request.attempts || 0) + 1;
  const shouldRetry = failed.length > 0 && attempts < 3;
  await storageSet({
    lastExtensionReloadRequest: {
      ...request,
      pending: shouldRetry,
      attempts,
      completedAt: shouldRetry ? '' : new Date().toISOString(),
      reloadedTabCount: result.ok && !result.skipped ? 1 : 0,
      reloadScope: 'requesting-tab-only',
      failedTabIds: failed.map((result) => result.tabId),
      error: failed.length ? failed.map((result) => result.error).filter(Boolean).join('; ') : '',
      activeVersion: chrome.runtime.getManifest().version
    }
  });
  if (shouldRetry) setTimeout(() => resumeExtensionReloadRequest().catch(() => {}), 1200);
  return {
    ok: failed.length === 0,
    retrying: shouldRetry,
    reloadedTabCount: result.ok && !result.skipped ? 1 : 0,
    reloadScope: 'requesting-tab-only',
    failedTabIds: failed.map((result) => result.tabId)
  };
}


chrome.runtime.onInstalled.addListener((details) => {
  seedAutomaticDashboardSetup(`installed:${details?.reason || 'unknown'}`);
  clearIncompatibleMove99State().catch((error) => {
    recordExtensionLog({ source: 'move99', operation: 'version-migration', message: error.message });
  });
  clearIncompatibleWorkflowState(`installed:${details?.reason || 'unknown'}`).catch((error) => {
    recordExtensionLog({ source: 'foundation', operation: 'workflow-version-migration', message: error.message });
  });
  clearRemovedBulkAutomationState().catch((error) => {
    recordExtensionLog({ source: 'ecomsniper', operation: 'removed-bulk-automation-migration', message: error.message });
  });
  pauseIncompatibleProfitBackfill(`installed:${details?.reason || 'unknown'}`).catch((error) => {
    recordExtensionLog({ source: 'poshmark-profit', operation: 'version-migration', message: error.message });
  });
  pauseIncompatibleEbayProfit(`installed:${details?.reason || 'unknown'}`).catch((error) => {
    recordExtensionLog({ source: 'ebay-profit', operation: 'version-migration', message: error.message });
  });
  migrateFoundationSettings(`installed:${details?.reason || 'unknown'}`).catch((error) => {
    recordExtensionLog({ source: 'foundation', operation: 'settings-migration', message: error.message });
  });
  scheduleDashboardRetry();
  scheduleUpdaterCheck();
  if (details?.reason === 'install') {
    storageGet(['gldnOnboardingState']).then((result) => {
      if (result.gldnOnboardingState?.status) return;
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    }).catch((error) => {
      recordExtensionLog({ source: 'onboarding', operation: 'first-install', message: error.message });
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  seedAutomaticDashboardSetup('chrome-startup');
  clearIncompatibleMove99State().catch((error) => {
    recordExtensionLog({ source: 'move99', operation: 'version-migration', message: error.message });
  });
  clearIncompatibleWorkflowState('chrome-startup').catch((error) => {
    recordExtensionLog({ source: 'foundation', operation: 'workflow-version-migration', message: error.message });
  });
  clearRemovedBulkAutomationState().catch((error) => {
    recordExtensionLog({ source: 'ecomsniper', operation: 'removed-bulk-automation-migration', message: error.message });
  });
  pauseIncompatibleProfitBackfill('chrome-startup').catch((error) => {
    recordExtensionLog({ source: 'poshmark-profit', operation: 'version-migration', message: error.message });
  });
  pauseIncompatibleEbayProfit('chrome-startup').catch((error) => {
    recordExtensionLog({ source: 'ebay-profit', operation: 'version-migration', message: error.message });
  });
  migrateFoundationSettings('chrome-startup').catch((error) => {
    recordExtensionLog({ source: 'foundation', operation: 'settings-migration', message: error.message });
  });
  scheduleDashboardRetry();
  scheduleUpdaterCheck();
  processDashboardQueue().catch((error) => {
    recordExtensionLog({ source: 'background-sync', operation: 'queue-retry', message: error.message });
  });
});

if (chrome.tabs?.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    EBAY_PROFIT_BACKGROUND.handleWorkerTabClosed(tabId).catch((error) => {
      recordExtensionLog({ source: 'ebay-profit', operation: 'worker-tab-closed', message: error.message });
    });
    ORDER_AUDIT_BACKGROUND.handleWorkerTabClosed(tabId).catch((error) => {
      recordExtensionLog({ source: 'order-placement-audit', operation: 'worker-tab-closed', message: error.message });
    });
    clearOpenReviewsForTab({ tab: { id: tabId } }).catch((error) => {
      recordExtensionLog({ source: 'background', operation: 'review-tab-closed', message: error.message });
    });
    storageGet(['ecomSniperHandoffStatus']).then((result) => {
      const handoff = result.ecomSniperHandoffStatus;
      if (!handoff || handoff.state !== 'open' || Number(handoff.tabId) !== Number(tabId)) return;
      const now = new Date().toISOString();
      return storageSet({
        ecomSniperHandoffStatus: {
          ...handoff,
          state: 'closed',
          closedAt: now,
          updatedAt: now
        }
      });
    }).catch((error) => {
      recordExtensionLog({ source: 'ecomsniper', operation: 'handoff-tab-closed', message: error.message });
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === DASHBOARD_RETRY_ALARM) {
    processDashboardQueue().catch((error) => {
      recordExtensionLog({ source: 'background-sync', operation: 'queue-retry', message: error.message });
    });
    return;
  }
  if (alarm?.name === UPDATER_CHECK_ALARM) {
    checkUpdaterDiskVersion().catch((error) => {
      recordExtensionLog({ source: 'updater', operation: 'disk-version-check', message: error.message });
    });
    return;
  }
  if (alarm?.name === LOCAL_CONTROL_ALARM) {
    pollLocalControl();
  }
});

migrateFoundationSettings('worker-start').catch((error) => {
  recordExtensionLog({ source: 'foundation', operation: 'settings-migration', message: error.message });
});
clearRemovedBulkAutomationState().catch((error) => {
  recordExtensionLog({ source: 'ecomsniper', operation: 'removed-bulk-automation-migration', message: error.message });
});
clearIncompatibleWorkflowState('worker-start').catch((error) => {
  recordExtensionLog({ source: 'foundation', operation: 'workflow-version-migration', message: error.message });
});
pauseIncompatibleProfitBackfill('worker-start').catch((error) => {
  recordExtensionLog({ source: 'poshmark-profit', operation: 'version-migration', message: error.message });
});
pauseIncompatibleEbayProfit('worker-start').catch((error) => {
  recordExtensionLog({ source: 'ebay-profit', operation: 'version-migration', message: error.message });
});
seedAutomaticDashboardSetup('worker-start');
scheduleDashboardRetry();
scheduleUpdaterCheck();
scheduleLocalControl();
setTimeout(() => pollLocalControl(), 500);
setTimeout(() => {
  clearIncompatibleMove99State()
    .then(() => resumeExtensionReloadRequest())
    .then(() => resumePendingTrustedMove99FinalReview())
    .catch((error) => {
      recordExtensionLog({ source: 'background', operation: 'reload-tabs', message: error.message });
    });
  }, 150);

function respondToExtensionMessage(promise, sendResponse, operation) {
  Promise.resolve(promise)
    .then((result) => {
      try {
        sendResponse(result);
      } catch (_) {
        // The requesting tab can close while the background action finishes.
      }
    })
    .catch((error) => {
      const message = error?.message || String(error);
      recordExtensionLog({
        source: 'background-message',
        operation,
        level: 'error',
        message
      }).catch(() => {});
      try {
        sendResponse({ ok: false, error: message });
      } catch (_) {
        // There is no response port left to notify.
      }
    });
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (sender?.id && sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'Message sender is not GLDN Ops.' });
    return false;
  }

  if (message.type === 'gldnLocalControlHeartbeat') {
    return respondToExtensionMessage(pollLocalControl(), sendResponse, 'local-control-heartbeat');
  }

  if (message.type === 'currentTabInfo') {
    sendResponse({
      ok: Number.isInteger(sender?.tab?.id),
      tabId: sender?.tab?.id ?? null,
      windowId: sender?.tab?.windowId ?? null,
      url: sender?.tab?.url || ''
    });
    return true;
  }

  if (message.type === 'claimMove99Tab') {
    return respondToExtensionMessage(
      claimMove99Tab(sender?.tab?.id, message.runId),
      sendResponse,
      'claim-move99-tab'
    );
  }

  if (message.type === 'getActiveWorkflowStatus') {
    activeWorkflowStatus().then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'dispatchTrustedEbayMarkShippedContinue') {
    return respondToExtensionMessage(
      dispatchTrustedEbayMarkShippedContinue(message, sender),
      sendResponse,
      'dispatch-trusted-ebay-mark-shipped-continue'
    );
  }

  if (message.type === 'dispatchTrustedEbayMarkShippedActivation') {
    return respondToExtensionMessage(
      dispatchTrustedEbayMarkShippedActivation(message, sender),
      sendResponse,
      'dispatch-trusted-ebay-mark-shipped-activation'
    );
  }

  if (message.type === 'dispatchTrustedEbayMove99Submit') {
    return respondToExtensionMessage(
      dispatchTrustedEbayMove99Submit(message, sender),
      sendResponse,
      'dispatch-trusted-ebay-move99-submit'
    );
  }

  if (message.type === 'claimWorkflowStart') {
    claimWorkflowStart(message.workflowId, message.label, sender).then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'releaseWorkflowStart') {
    releaseWorkflowStart(message.token).then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'resetAutomationState') {
    resetAutomationState(sender).then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'registerOpenReview') {
    registerOpenReview(message, sender).then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'releaseOpenReview') {
    releaseOpenReview(message.token).then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'clearOpenReviewsForTab') {
    clearOpenReviewsForTab(sender).then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'startMove99Workflow') {
    startMove99WorkflowFromExtension(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'createMove99BulkWorkspace') {
    return respondToExtensionMessage(
      createMove99BulkWorkspace(sender?.tab?.id, message),
      sendResponse,
      'create-move99-workspace'
    );
  }

  if (message.type === 'openEbayVariationReports') {
    return respondToExtensionMessage(
      openEbayVariationReports(),
      sendResponse,
      'open-ebay-variation-reports'
    );
  }

  if (message.type === 'scanEbayVariationListings') {
    return respondToExtensionMessage(
      scanEbayVariationListings(sender),
      sendResponse,
      'scan-ebay-variation-listings'
    );
  }

  if (message.type === 'focusEbayVariationEndReview') {
    return respondToExtensionMessage(
      focusEbayVariationEndReview(),
      sendResponse,
      'focus-ebay-variation-end-review'
    );
  }

  if (message.type === 'prepareEbayVariationEndReview') {
    return respondToExtensionMessage(
      prepareEbayVariationEndReview(message, sender),
      sendResponse,
      'prepare-ebay-variation-end-review'
    );
  }

  if (message.type === 'submitEbayVariationEndReview') {
    return respondToExtensionMessage(
      submitEbayVariationEndReview(message),
      sendResponse,
      'submit-ebay-variation-end-review'
    );
  }

  if (message.type === 'scanEbayPolicyListings') {
    return respondToExtensionMessage(
      scanEbayPolicyListings(message, sender),
      sendResponse,
      'scan-ebay-policy-listings'
    );
  }

  if (message.type === 'stopEbayPolicyListingScan') {
    return respondToExtensionMessage(
      stopEbayPolicyListingScan(),
      sendResponse,
      'stop-ebay-policy-listing-scan'
    );
  }

  if (message.type === 'clearEbayPolicyListingScan') {
    return respondToExtensionMessage(
      clearEbayPolicyListingScan(),
      sendResponse,
      'clear-ebay-policy-listing-scan'
    );
  }

  if (message.type === 'focusEbayPolicyListingEndReview') {
    return respondToExtensionMessage(
      focusEbayPolicyListingEndReview(),
      sendResponse,
      'focus-ebay-policy-listing-end-review'
    );
  }

  if (message.type === 'cancelEbayPolicyListingEndReview') {
    return respondToExtensionMessage(
      cancelEbayPolicyListingEndReview(),
      sendResponse,
      'cancel-ebay-policy-listing-end-review'
    );
  }

  if (message.type === 'prepareEbayPolicyListingEndReview') {
    return respondToExtensionMessage(
      prepareEbayPolicyListingEndReview(message, sender),
      sendResponse,
      'prepare-ebay-policy-listing-end-review'
    );
  }

  if (message.type === 'submitEbayPolicyListingEndReview') {
    return respondToExtensionMessage(
      submitEbayPolicyListingEndReview(message),
      sendResponse,
      'submit-ebay-policy-listing-end-review'
    );
  }

  if (message.type === 'startEbayMonthlyProfit') {
    startEbayMonthlyProfitGuarded(message.options || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'resumeEbayMonthlyProfit') {
    EBAY_PROFIT_BACKGROUND.resume(sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'stopEbayMonthlyProfit') {
    EBAY_PROFIT_BACKGROUND.stop().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'resetEbayMonthlyProfit') {
    EBAY_PROFIT_BACKGROUND.reset().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'getEbayMonthlyProfit') {
    EBAY_PROFIT_BACKGROUND.getStatus().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'ebayMonthlyProfitOrdersPage') {
    EBAY_PROFIT_BACKGROUND.handleOrdersPage(message.payload || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'ebayMonthlyProfitOrderDetail') {
    EBAY_PROFIT_BACKGROUND.handleOrderDetail(message.detail || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'confirmEbayMonthlyProfitNoteAmounts') {
    EBAY_PROFIT_BACKGROUND.confirmNoteAmounts(message.orderNumber, message.values || {}).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'ebayMonthlyProfitWorkerError') {
    EBAY_PROFIT_BACKGROUND.handleWorkerError(message.error || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'syncEbayMonthlyProfit') {
    syncReviewedEbayMonthlyProfit(message.confirm).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'seedOrderPlacementAuditExpected') {
    storageGet(['ebayMonthlyProfit'])
      .then((stored) => ORDER_AUDIT_BACKGROUND.seedExpectedFromMonthlyRun(
        stored.ebayMonthlyProfit || null,
        message.options || {},
        { postToDashboard }
      ))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'readOrderPlacementAudit') {
    ORDER_AUDIT_BACKGROUND.readShared(message.options || {}, { postToDashboard })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'configureOrderPlacementAudit') {
    ORDER_AUDIT_BACKGROUND.configure(message.options || {}, { postToDashboard })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'startOrderPlacementAuditAmazon') {
    ORDER_AUDIT_BACKGROUND.startAmazonScan(message.options || {}, sender, { postToDashboard })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'getOrderPlacementAuditAmazon') {
    ORDER_AUDIT_BACKGROUND.getStatus()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'resumeOrderPlacementAuditAmazon') {
    ORDER_AUDIT_BACKGROUND.resume(sender, { postToDashboard })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'stopOrderPlacementAuditAmazon') {
    ORDER_AUDIT_BACKGROUND.stop()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'resetOrderPlacementAuditAmazon') {
    ORDER_AUDIT_BACKGROUND.reset()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'orderPlacementAuditAmazonIndex') {
    ORDER_AUDIT_BACKGROUND.handleAmazonIndex(message.payload || {}, sender, { postToDashboard })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'orderPlacementAuditAmazonDetail') {
    ORDER_AUDIT_BACKGROUND.handleAmazonDetail(message.payload || {}, sender, { postToDashboard })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'orderPlacementAuditWorkerError') {
    ORDER_AUDIT_BACKGROUND.workerError(message.error || {}, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'startPoshmarkProfitBackfill') {
    startPoshmarkProfitBackfillGuarded(message.options || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'resumePoshmarkProfitBackfill') {
    PROFIT_BACKFILL_BACKGROUND.resume(sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'stopPoshmarkProfitBackfill') {
    PROFIT_BACKFILL_BACKGROUND.stop().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'resetPoshmarkProfitBackfill') {
    PROFIT_BACKFILL_BACKGROUND.reset().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'getPoshmarkProfitBackfill') {
    PROFIT_BACKFILL_BACKGROUND.getStatus().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'poshmarkBackfillSalesPage') {
    PROFIT_BACKFILL_BACKGROUND.handleSalesPage(message.payload || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'poshmarkBackfillOrderDetail') {
    PROFIT_BACKFILL_BACKGROUND.handlePoshDetail(message.detail || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'poshmarkBackfillAmazonSearch') {
    PROFIT_BACKFILL_BACKGROUND.handleAmazonSearch(message.payload || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'poshmarkBackfillAmazonDetail') {
    PROFIT_BACKFILL_BACKGROUND.handleAmazonDetail(message.payload || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'syncPoshmarkProfitBackfill') {
    syncReviewedPoshmarkBackfill(message.confirm).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'reloadExtension') {
    recordExtensionLog({ source: 'background', level: 'info', message: 'Extension reload requested.' });
    queueRuntimeReload({
      returnUrl: message.returnUrl,
      sourceTabId: Number.isInteger(message.sourceTabId) ? message.sourceTabId : sender?.tab?.id,
      sourceTabUrl: sender?.tab?.url,
      reason: 'manual-reload'
    }).then(() => sendResponse({ ok: true, version: chrome.runtime.getManifest().version }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'getUpdaterStatus') {
    getUpdaterRuntimeStatus(Boolean(message.refresh))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'updateExtension') {
    updateExtensionAndReload(message, sender)
      .then(sendResponse)
      .catch((error) => {
        recordExtensionLog({ source: 'updater', operation: 'update', message: error.message });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'getUpdaterVersions') {
    updaterRequest('/versions', { timeoutMs: 5000 })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'rollbackExtension') {
    rollbackExtensionAndReload(message, sender)
      .then(sendResponse)
      .catch((error) => {
        recordExtensionLog({ source: 'updater', operation: 'rollback', message: error.message });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'recordExtensionLog') {
    recordExtensionLog(message.entry || {})
      .then((entry) => sendResponse({ ok: true, entry }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'runDiagnosticLogProbe') {
    if (message.confirm !== 'F11_CONTROLLED_FAILURE') {
      sendResponse({ ok: false, error: 'F-11 diagnostic probe confirmation is missing.' });
      return true;
    }
    runDiagnosticLogProbe(sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'runDashboardQueueProbe') {
    if (message.confirm !== 'F09_QUEUE_TIMEOUT_RETRY') {
      sendResponse({ ok: false, error: 'F-09 dashboard queue probe confirmation is missing.' });
      return true;
    }
    runDashboardQueueProbe(sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'versionInfo') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version, name: chrome.runtime.getManifest().name });
    return true;
  }

  if (message.type === 'openExtensionPage') {
    const allowedPages = new Set(['guide.html', 'onboarding.html', 'popup.html', 'ebay-profit.html', 'order-audit.html', 'policy-listing-audit.html']);
    const page = String(message.page || '');
    if (!allowedPages.has(page)) {
      sendResponse({ ok: false, error: 'Unknown extension page.' });
      return true;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL(page) }, (tab) => {
      const error = chrome.runtime.lastError;
      sendResponse(error
        ? { ok: false, error: error.message }
        : { ok: true, tabId: tab?.id ?? null });
    });
    return true;
  }

  if (message.type === 'syncSellerLevel') {
    return respondToExtensionMessage(
      handleSync('sellerLevel', message.record, 'Seller Level synced'),
      sendResponse,
      'sync-seller-level'
    );
  }

  if (message.type === 'syncAccountLimits') {
    return respondToExtensionMessage(
      handleSync('accountLimits', message.record, 'Listing status synced'),
      sendResponse,
      'sync-account-limits'
    );
  }

  if (message.type === 'syncMarkShipped') {
    return respondToExtensionMessage(
      handleSync('markShipped', message.record, 'Mark as Shipped result synced'),
      sendResponse,
      'sync-mark-shipped'
    );
  }

  if (message.type === 'syncTaskCompletion') {
    return respondToExtensionMessage(
      handleSync('taskCompletion', message.record, 'Task completion synced'),
      sendResponse,
      'sync-task-completion'
    );
  }

  if (message.type === 'syncAmazonSubscribeSaveProfile') {
    return respondToExtensionMessage(
      handleSync('amazonSubscribeSaveProfile', message.record, 'Amazon Subscribe & Save profile proof synced'),
      sendResponse,
      'sync-amazon-subscribe-save-profile'
    );
  }

  if (message.type === 'syncPoshmarkStats') {
    return respondToExtensionMessage(
      handleSync('poshmarkStats', message.record, 'Poshmark stats synced'),
      sendResponse,
      'sync-poshmark-stats'
    );
  }

  if (message.type === 'syncEbaySnapshot') {
    return respondToExtensionMessage(
      handleSync('ebaySnapshot', message.record, 'eBay snapshot synced'),
      sendResponse,
      'sync-ebay-snapshot'
    );
  }

  if (message.type === 'syncMarketplaceProfit') {
    return respondToExtensionMessage(
      handleSync('marketplaceProfit', message.record, 'Marketplace profit synced'),
      sendResponse,
      'sync-marketplace-profit'
    );
  }

  if (message.type === 'syncMarketplaceProfits') {
    const records = Array.isArray(message.records) ? message.records : [];
    return respondToExtensionMessage(
      handleSync('marketplaceProfitBatch', { records }, 'Marketplace profit batch synced'),
      sendResponse,
      'sync-marketplace-profit-batch'
    );
  }

  if (message.type === 'openEcomSniperPage') {
    return respondToExtensionMessage(
      openEcomSniperPage(message.page),
      sendResponse,
      'open-ecomsniper-page'
    );
  }

  if (message.type === 'stopEcomSniperHandoff') {
    return respondToExtensionMessage(
      stopEcomSniperHandoff(),
      sendResponse,
      'stop-ecomsniper-handoff'
    );
  }

  if (message.type === 'openSnipingEbaySearch') {
    return respondToExtensionMessage(
      openSnipingEbaySearch(message.title, sender?.tab?.windowId),
      sendResponse,
      'open-sniping-ebay-search'
    );
  }

  if (message.type === 'handoffAmazonSnipingSellerReview') {
    return respondToExtensionMessage(
      handoffAmazonSnipingSellerReview(message.anchorAsin, message.anchorTabId, sender?.tab?.id),
      sendResponse,
      'handoff-amazon-sniping-review'
    );
  }

  if (message.type === 'openAmazonOrderSearch') {
    return respondToExtensionMessage(
      openAmazonOrderSearch(message.asin),
      sendResponse,
      'open-amazon-order-search'
    );
  }

  if (message.type === 'extensionHealthCheck') {
    return respondToExtensionMessage(
      runExtensionHealthCheck(),
      sendResponse,
      'extension-health-check'
    );
  }

  if (message.type === 'seedDashboardSetupFromLocalConfig') {
    return respondToExtensionMessage(
      seedDashboardSetupFromLocalConfig(),
      sendResponse,
      'seed-dashboard-setup'
    );
  }

  if (message.type === 'dashboardQueueStatus') {
    return respondToExtensionMessage(storageGet([DASHBOARD_QUEUE_KEY]).then((stored) => {
      const queue = Array.isArray(stored[DASHBOARD_QUEUE_KEY]) ? stored[DASHBOARD_QUEUE_KEY] : [];
      return {
        ok: true,
        count: queue.length,
        oldestAt: queue[0]?.createdAt || '',
        nextAttemptAt: queue.map((item) => item?.nextAttemptAt).filter(Boolean).sort()[0] || ''
      };
    }), sendResponse, 'dashboard-queue-status');
  }

  if (message.type === 'retryDashboardQueue') {
    processDashboardQueue({ force: true }).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message.type === 'testDashboard') {
    return respondToExtensionMessage(
      testDashboardConnection(),
      sendResponse,
      'test-dashboard-connection'
    );
  }

  if (message.type === 'openDashboard') {
    openDashboardTab()
      .then(sendResponse)
      .catch((error) => {
        recordExtensionLog({
          source: 'dashboard-open',
          level: 'error',
          message: error.message || 'Could not open the dashboard.',
          detail: error.stack || ''
        });
        sendResponse({ ok: false, error: error.message || 'Could not open the dashboard.' });
      });
    return true;
  }

  return false;
});
