importScripts(
  'config.example.js',
  'theme-catalog.js',
  'foundation.js',
  'profit-backfill.js',
  'profit-backfill-background.js'
);

const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const DASHBOARD_URL_KEY = 'sellerDashboardUrl';
const DASHBOARD_SECRET_KEY = 'sellerDashboardKey';
const DASHBOARD_QUEUE_KEY = 'gldnDashboardQueue';
const DASHBOARD_RETRY_ALARM = 'gldnDashboardRetry';
const UPDATER_CHECK_ALARM = 'gldnUpdaterCheck';
const LOCAL_CONTROL_ALARM = 'gldnLocalControl';
const UPDATER_API = 'http://127.0.0.1:39417/v1';
const SETTINGS_BACKUP_KEY = 'gldnSettingsBackups';
const SETTINGS_SCHEMA_KEY = 'settingsSchemaVersion';
const ECOMSNIPER_EXTENSION_ID = String(globalThis.GLDN_CONFIG?.ecomSniperExtensionId || 'eohieelgcgopcnjjjanjgfjdaifolokm').trim();
const ECOMSNIPER_PAGES = Object.freeze({
  competitorScanner: 'Competitor_Research/index.html',
  productHunter: 'Product_Finder/product_finder.html'
});
const ECOMSNIPER_PAGE_LABELS = Object.freeze({
  competitorScanner: 'Competitor Scanner',
  productHunter: 'Product Hunter'
});
const DASHBOARD_REQUEST_TIMEOUT_MS = 15000;
const FOUNDATION = globalThis.GLDN_FOUNDATION;
const PROFIT_BACKFILL_BACKGROUND = globalThis.GLDN_PROFIT_BACKFILL_BACKGROUND;
const COMPUTER_ACCOUNT_MAP = FOUNDATION.computerAccounts;
const COMPUTER_OPTIONS = FOUNDATION.computerOptions;
let move99ClaimQueue = Promise.resolve();
let workflowStartQueue = Promise.resolve();
let openReviewQueue = Promise.resolve();
let localControlPollRunning = false;

const AUTOMATION_RESET_KEYS = Object.freeze([
  ...FOUNDATION.workflowStateKeys,
  'pendingEcomSniperBulkExtract',
  'pendingManualEcomSniperClick',
  'pendingAmazonBulkWorkflowStart',
  'bulkLinksAmazonQueue',
  'pendingPoshmarkProfitContext',
  'pendingAmazonOrderDetailMatch',
  'pendingAmazonOrderSearchSubmission'
]);
const VERSIONED_WORKFLOW_KEYS = Object.freeze([
  'gldnWorkflowReservation',
  'pendingMarkShippedRun',
  'pendingSellerLevelScan',
  'pendingReviewMonthlyLimits',
  'pendingEbaySnapshotScan',
  'pendingSnipingExtract',
  'pendingSnipingWinner',
  'pendingAmazonSnipingWorkflowStart',
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
    return await PROFIT_BACKFILL_BACKGROUND.start(options, sender);
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
    actions: new Set(['show-panel', 'mark-shipped', 'seller-level', 'sales-snapshot', 'listing-limits', 'prepare-order-note'])
  },
  poshmark: {
    patterns: ['*://*.poshmark.com/*'],
    messageType: 'runPoshmarkPageAction',
    actions: new Set(['posh-stats', 'posh-profit', 'visible-sales', 'historical-profit'])
  },
  amazon: {
    patterns: ['*://*.amazon.com/*'],
    messageType: 'runAmazonPageAction',
    actions: new Set(['review-copy', 'sniping-seller-review', 'sniping-winner-review'])
  },
  ecomsniper: {
    patterns: ['https://ecomsniper.io/*']
  }
});
const LOCAL_CONTROL_STATE_KEYS = new Set([
  'computerLabel',
  'ebayAccountLabel',
  'pendingMove99Run',
  'pendingMarkShippedRun',
  'pendingSellerLevelScan',
  'pendingEbaySnapshotScan',
  'pendingReviewMonthlyLimits',
  'poshmarkProfitBackfill',
  'lastSellerLevelCheck',
  'lastEbaySalesSnapshot',
  'lastListingLimitCheck',
  'lastPoshmarkStats',
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

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response || { ok: true });
    });
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
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase();
  if (host === 'ebay.com' || host.endsWith('.ebay.com')) return 'ebay';
  if (host === 'amazon.com' || host.endsWith('.amazon.com')) return 'amazon';
  if (host === 'poshmark.com' || host.endsWith('.poshmark.com')) return 'poshmark';
  if (host === 'ecomsniper.io' || host.endsWith('.ecomsniper.io')) return 'ecomsniper';
  return '';
}

function assertSafeControlUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || !controlPlatformForUrl(url.href)) {
    throw new Error('Local control can only open approved HTTPS marketplace pages.');
  }
  return url;
}

function controlTabSummary(tab) {
  return {
    id: Number.isInteger(tab?.id) ? tab.id : null,
    windowId: Number.isInteger(tab?.windowId) ? tab.windowId : null,
    active: Boolean(tab?.active),
    audible: Boolean(tab?.audible),
    discarded: Boolean(tab?.discarded),
    status: String(tab?.status || ''),
    title: String(tab?.title || '').slice(0, 300),
    url: String(tab?.url || '').slice(0, 2000),
    platform: controlPlatformForUrl(tab?.url),
    lastAccessed: Number(tab?.lastAccessed || 0)
  };
}

async function resolveControlTab(payload = {}, requiredPlatform = '') {
  let tab = null;
  if (Number(payload.tabId) > 0) tab = await getTab(Number(payload.tabId));
  if (!tab) {
    const platform = String(requiredPlatform || payload.platform || '').toLowerCase();
    const config = LOCAL_CONTROL_PLATFORM[platform];
    if (!config) throw new Error('A supported Profile 2 marketplace platform is required.');
    const tabs = await queryTabs({ url: config.patterns });
    tab = tabs
      .filter((candidate) => Number.isInteger(candidate?.id))
      .sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0];
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
  return { ok: true, reused: existing.length > 0, tab: controlTabSummary(tab) };
}

async function focusLocalControlTab(payload = {}) {
  const tab = await resolveControlTab(payload);
  const updated = await updateChromeTab(tab.id, { active: true });
  await focusChromeWindow(updated.windowId);
  return { ok: true, tab: controlTabSummary(updated) };
}

async function reloadLocalControlTab(payload = {}) {
  await assertUpdaterIdle('Reloading the Profile 2 marketplace tab');
  const tab = await resolveControlTab(payload);
  const reloaded = await new Promise((resolve, reject) => {
    chrome.tabs.reload(tab.id, {}, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(true);
    });
  });
  return { ok: reloaded, tab: controlTabSummary(tab) };
}

async function inspectLocalControlPage(payload = {}) {
  const tab = await resolveControlTab(payload, String(payload.platform || '').toLowerCase());
  const state = await sendTabMessage(tab.id, { type: 'inspectGldnPageState' });
  return { ok: state?.ok !== false, tab: controlTabSummary(tab), pageState: state };
}

async function readLocalControlState(payload = {}) {
  const keys = [...new Set((Array.isArray(payload.keys) ? payload.keys : []).map(String))]
    .filter((key) => LOCAL_CONTROL_STATE_KEYS.has(key));
  if (!keys.length) throw new Error('No approved GLDN Ops state keys were requested.');
  const state = await storageGet(keys);
  if (Array.isArray(state.gldnErrorLog)) state.gldnErrorLog = state.gldnErrorLog.slice(-25);
  return { ok: true, state };
}

async function reloadLocalControlExtension() {
  await assertUpdaterIdle('Reloading the Profile 2 extension');
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
  const focused = await updateChromeTab(tab.id, { active: true });
  await focusChromeWindow(focused.windowId);
  const accepted = await sendTabMessage(tab.id, { type: config.messageType, action });
  if (accepted?.ok === false) throw new Error(accepted.error || 'The Profile 2 page rejected the review action.');
  await controlDelay(Math.max(0, Math.min(15000, Number(payload.waitMs || 2500))));
  let pageState = null;
  try {
    pageState = await sendTabMessage(tab.id, { type: 'inspectGldnPageState' });
  } catch (error) {
    pageState = { ok: false, error: error.message };
  }
  return { ok: true, accepted, tab: controlTabSummary(focused), pageState };
}

async function executeLocalControlCommand(command = {}) {
  const action = String(command.action || '').toLowerCase();
  const payload = command.payload || {};
  switch (action) {
    case 'inspect-session': return inspectLocalControlSession();
    case 'open-url': return openLocalControlUrl(payload);
    case 'focus-tab': return focusLocalControlTab(payload);
    case 'reload-tab': return reloadLocalControlTab(payload);
    case 'inspect-page': return inspectLocalControlPage(payload);
    case 'read-state': return readLocalControlState(payload);
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
  await assertUpdaterIdle('Reloading GLDN Ops');
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
  const reservation = await claimWorkflowStart('move99', 'Move .99');
  if (!reservation.ok) throw new Error(reservation.error);
  let runId = '';
  let runTab = null;
  let stateReserved = false;
  try {
  const scanMode = message.scanMode === 'non99' ? 'non99' : 'price99';
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

function openTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url }, (tab) => {
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

async function openDashboardTab() {
  const { url, key } = await getDashboardConfig();
  const dashboard = new URL(url);
  dashboard.searchParams.set('key', key);
  const opened = await openTab(dashboard.toString());
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
  });

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

let dashboardQueueProcessing = false;

async function processDashboardQueue({ force = false } = {}) {
  if (dashboardQueueProcessing) return { ok: true, busy: true };
  dashboardQueueProcessing = true;
  try {
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

async function syncReviewedPoshmarkBackfill(confirmToken) {
  if (confirmToken !== 'SYNC_EXACT_POSHMARK_PROFITS') {
    return { ok: false, error: 'Explicit historical-profit sync approval is missing.' };
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
  for (let index = 0; index < pending.records.length; index += 100) {
    const records = pending.records.slice(index, index + 100);
    const response = await handleSync('marketplaceProfitBatch', { records }, 'Historical Poshmark profit batch synced');
    responses.push(response);
    if (!response.ok && !response.queued) break;
    handledOrders.push(...records.map((record) => String(record.orderNumber || '')).filter(Boolean));
  }
  const state = handledOrders.length ? await PROFIT_BACKFILL_BACKGROUND.markSynced(handledOrders) : pending.run;
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

async function openEcomSniperPage(pageKey) {
  const page = ECOMSNIPER_PAGES[pageKey];
  if (!page) return { ok: false, error: 'Unknown EcomSniper page.' };

  const extension = await findEcomSniperExtension();
  if (!extension.id) return { ok: false, error: 'EcomSniper extension ID is not configured.' };

  const url = `chrome-extension://${extension.id}/${page}`;
  const opened = await openTab(url);
  if (!opened.ok) return { ok: false, error: opened.error, extension };
  const now = new Date().toISOString();
  await storageSet({
    ecomSniperHandoffStatus: {
      state: 'open',
      pageKey,
      pageLabel: ECOMSNIPER_PAGE_LABELS[pageKey] || 'EcomSniper',
      tabId: opened.tabId,
      openedAt: now,
      updatedAt: now,
      observableScope: 'tab-lifecycle-only'
    }
  });
  return { ok: true, url, tabId: opened.tabId, extension };
}

async function openAmazonOrderSearch(asin) {
  const cleaned = String(asin || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(cleaned)) {
    return { ok: false, error: 'Amazon ASIN was not detected from the Poshmark SKU.' };
  }
  const url = `https://www.amazon.com/gp/your-account/order-history?orderFilter=last30`;
  return openTab(url);
}

async function runExtensionHealthCheck() {
  const [ecomSniper, workflowStatus, updater] = await Promise.all([
    findEcomSniperExtension(),
    activeWorkflowStatus(),
    getUpdaterRuntimeStatus(false).catch((error) => ({ ok: false, error: error.message }))
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
    DASHBOARD_QUEUE_KEY
  ]);
  const identity = identityForComputer(storedIdentity.computerLabel);
  const computerLabel = identity.computerLabel || String(storedIdentity.computerLabel || '').trim();
  const poshmarkOnly = identity.poshmarkOnly || computerLabel.toLowerCase() === '7';
  const ecomSniperRequired = !poshmarkOnly;
  const dashboardQueue = Array.isArray(storedIdentity[DASHBOARD_QUEUE_KEY])
    ? storedIdentity[DASHBOARD_QUEUE_KEY]
    : [];
  return {
    ok: Boolean(dashboard.ok && updater.ok && (!ecomSniperRequired || ecomSniper.ok)),
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
      dashboardQueuedRecords: dashboardQueue.length
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
seedAutomaticDashboardSetup('worker-start');
scheduleDashboardRetry();
scheduleUpdaterCheck();
scheduleLocalControl();
setTimeout(() => pollLocalControl(), 500);
setTimeout(() => {
  clearIncompatibleMove99State()
    .then(() => resumeExtensionReloadRequest())
    .catch((error) => {
      recordExtensionLog({ source: 'background', operation: 'reload-tabs', message: error.message });
    });
}, 150);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (sender?.id && sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'Message sender is not GLDN Ops.' });
    return false;
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
    claimMove99Tab(sender?.tab?.id, message.runId).then(sendResponse);
    return true;
  }

  if (message.type === 'getActiveWorkflowStatus') {
    activeWorkflowStatus().then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
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
    createMove99BulkWorkspace(sender?.tab?.id, message).then(sendResponse);
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
    const allowedPages = new Set(['guide.html', 'onboarding.html', 'popup.html']);
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
    handleSync('sellerLevel', message.record, 'Seller Level synced').then(sendResponse);
    return true;
  }

  if (message.type === 'syncAccountLimits') {
    handleSync('accountLimits', message.record, 'Listing status synced').then(sendResponse);
    return true;
  }

  if (message.type === 'syncMarkShipped') {
    handleSync('markShipped', message.record, 'Mark as Shipped result synced').then(sendResponse);
    return true;
  }

  if (message.type === 'syncTaskCompletion') {
    handleSync('taskCompletion', message.record, 'Task completion synced').then(sendResponse);
    return true;
  }

  if (message.type === 'syncPoshmarkStats') {
    handleSync('poshmarkStats', message.record, 'Poshmark stats synced').then(sendResponse);
    return true;
  }

  if (message.type === 'syncEbaySnapshot') {
    handleSync('ebaySnapshot', message.record, 'eBay snapshot synced').then(sendResponse);
    return true;
  }

  if (message.type === 'syncMarketplaceProfit') {
    handleSync('marketplaceProfit', message.record, 'Marketplace profit synced').then(sendResponse);
    return true;
  }

  if (message.type === 'syncMarketplaceProfits') {
    const records = Array.isArray(message.records) ? message.records : [];
    handleSync('marketplaceProfitBatch', { records }, 'Marketplace profit batch synced').then(sendResponse);
    return true;
  }

  if (message.type === 'openEcomSniperPage') {
    openEcomSniperPage(message.page).then(sendResponse);
    return true;
  }

  if (message.type === 'openSnipingEbaySearch') {
    openSnipingEbaySearch(message.title, sender?.tab?.windowId).then(sendResponse);
    return true;
  }

  if (message.type === 'handoffAmazonSnipingSellerReview') {
    handoffAmazonSnipingSellerReview(message.anchorAsin, message.anchorTabId, sender?.tab?.id).then(sendResponse);
    return true;
  }

  if (message.type === 'openAmazonOrderSearch') {
    openAmazonOrderSearch(message.asin).then(sendResponse);
    return true;
  }

  if (message.type === 'extensionHealthCheck') {
    runExtensionHealthCheck().then(sendResponse);
    return true;
  }

  if (message.type === 'seedDashboardSetupFromLocalConfig') {
    seedDashboardSetupFromLocalConfig().then(sendResponse);
    return true;
  }

  if (message.type === 'dashboardQueueStatus') {
    storageGet([DASHBOARD_QUEUE_KEY]).then((stored) => {
      const queue = Array.isArray(stored[DASHBOARD_QUEUE_KEY]) ? stored[DASHBOARD_QUEUE_KEY] : [];
      sendResponse({
        ok: true,
        count: queue.length,
        oldestAt: queue[0]?.createdAt || '',
        nextAttemptAt: queue.map((item) => item?.nextAttemptAt).filter(Boolean).sort()[0] || ''
      });
    });
    return true;
  }

  if (message.type === 'retryDashboardQueue') {
    processDashboardQueue({ force: true }).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message.type === 'testDashboard') {
    postToDashboard('ping')
      .then(async (data) => {
        await storageSet({ lastDashboardSync: { ok: true, at: new Date().toISOString(), message: 'Connection test passed' } });
        sendResponse({ ok: true, data });
      })
      .catch(async (error) => {
        await storageSet({ lastDashboardSync: { ok: false, at: new Date().toISOString(), error: error.message } });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
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
