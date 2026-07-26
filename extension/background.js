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
const UPDATER_API = 'http://127.0.0.1:39417/v1';
const MARKETPLACE_TAB_PATTERNS = [
  'https://*.ebay.com/*',
  'https://*.amazon.com/*',
  'https://*.walmart.com/*',
  'https://*.poshmark.com/*',
  'https://ecomsniper.io/*'
];
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

async function updaterRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 20000));
  try {
    const response = await fetch(`${UPDATER_API}${path}`, {
      method: options.method || 'GET',
      headers: {
        'X-GLDN-Updater': '1',
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

async function queueRuntimeReload({ returnUrl = '', sourceTabUrl = '', reason = 'manual-reload', targetVersion = '' } = {}) {
  await storageSet({
    lastExtensionReloadRequest: {
      at: new Date().toISOString(),
      version: EXTENSION_VERSION,
      targetVersion,
      reason,
      pending: true,
      returnUrl: String(returnUrl || ''),
      sourceTabUrl: String(sourceTabUrl || '')
    }
  });
  setTimeout(() => chrome.runtime.reload(), 350);
}

async function updateExtensionAndReload(message = {}, sender = {}) {
  recordExtensionLog({ source: 'updater', level: 'info', operation: 'update', message: 'Verified extension update requested.' });
  const result = await updaterRequest('/update', { method: 'POST', body: {}, timeoutMs: 180000 });
  if (result.updated) {
    await queueRuntimeReload({
      returnUrl: message.returnUrl,
      sourceTabUrl: sender?.tab?.url,
      reason: 'verified-update',
      targetVersion: result.currentVersion
    });
  }
  return { ...result, reloading: Boolean(result.updated) };
}

async function rollbackExtensionAndReload(message = {}, sender = {}) {
  recordExtensionLog({ source: 'updater', level: 'info', operation: 'rollback', message: 'Extension rollback requested.' });
  const result = await updaterRequest('/rollback', {
    method: 'POST',
    body: { snapshotId: String(message.snapshotId || '') },
    timeoutMs: 120000
  });
  await queueRuntimeReload({
    returnUrl: message.returnUrl,
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
    await storageSet({ gldnUpdaterAutoReloadAttempt: null });
    return { ok: true, current: true, diskVersion };
  }
  const stored = await storageGet(['gldnUpdaterAutoReloadAttempt']);
  const prior = stored.gldnUpdaterAutoReloadAttempt;
  if (prior?.fromVersion === EXTENSION_VERSION && prior?.targetVersion === diskVersion) {
    return { ok: false, pathMismatch: true, diskVersion };
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
  const runId = globalThis.crypto?.randomUUID?.() || `move99-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startedAt = new Date().toISOString();
  const runTab = await createChromeTab({ url: 'about:blank', active: true });

  try {
    await storageSet({
      gldnStopRequested: false,
      pendingMove99Run: {
        active: true,
        confirmed: true,
        runId,
        ownerTabId: runTab.id,
        phase: 'active-prepare',
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
      }
    });
    await updateChromeTab(runTab.id, { url: activeUrl, active: true });
    return { ok: true, started: true, tabId: runTab.id, runId, account, scanMode, activeUrl };
  } catch (error) {
    await storageRemove(['pendingMove99Run']).catch(() => {});
    await closeChromeTab(runTab.id);
    throw error;
  }
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

async function localClick(record = {}) {
  return {
    ok: false,
    disabled: true,
    localOnly: true,
    deprecated: true,
    error: 'The local click helper is retired. GLDN Ops now uses the semantic Extract Sellers control on the eBay page.'
  };
}

async function localHelperHealth() {
  return {
    ok: true,
    disabled: true,
    required: false,
    mode: 'semantic-dom',
    message: 'Built-in automation targets Extract Sellers by its visible label and waits for EcomSniper confirmation.'
  };
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
  const [helper, ecomSniper] = await Promise.all([localHelperHealth(), findEcomSniperExtension()]);

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
    ok: Boolean(dashboard.ok && (!ecomSniperRequired || ecomSniper.ok)),
    version: chrome.runtime.getManifest().version,
    name: chrome.runtime.getManifest().name,
    identity: {
      computerLabel,
      ebayAccountLabel: identity.ebayAccountLabel || ''
    },
    requirements: {
      ecomSniperRequired,
      localHelperRequired: false
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
    localHelper: helper,
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

const queryTabs = (queryInfo) => new Promise((resolve, reject) => {
  chrome.tabs.query(queryInfo, (tabs) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(tabs || []);
  });
});
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
        error: 'Reload request expired before marketplace tabs refreshed.'
      }
    });
    return { ok: false, expired: true };
  }

  const tabs = await queryTabs({ url: MARKETPLACE_TAB_PATTERNS });
  const tabIds = tabs.map((tab) => tab.id).filter(Number.isInteger);
  const results = await Promise.all(tabIds.map(reloadTab));
  const failed = results.filter((result) => !result.ok);
  const attempts = Number(request.attempts || 0) + 1;
  const shouldRetry = failed.length > 0 && attempts < 3;
  await storageSet({
    lastExtensionReloadRequest: {
      ...request,
      pending: shouldRetry,
      attempts,
      completedAt: shouldRetry ? '' : new Date().toISOString(),
      reloadedTabCount: results.filter((result) => result.ok).length,
      failedTabIds: failed.map((result) => result.tabId),
      error: failed.length ? failed.map((result) => result.error).filter(Boolean).join('; ') : '',
      activeVersion: chrome.runtime.getManifest().version
    }
  });
  if (shouldRetry) setTimeout(() => resumeExtensionReloadRequest().catch(() => {}), 1200);
  return {
    ok: failed.length === 0,
    retrying: shouldRetry,
    reloadedTabCount: results.filter((result) => result.ok).length,
    failedTabIds: failed.map((result) => result.tabId)
  };
}


chrome.runtime.onInstalled.addListener((details) => {
  seedAutomaticDashboardSetup(`installed:${details?.reason || 'unknown'}`);
  clearIncompatibleMove99State().catch((error) => {
    recordExtensionLog({ source: 'move99', operation: 'version-migration', message: error.message });
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
  }
});

migrateFoundationSettings('worker-start').catch((error) => {
  recordExtensionLog({ source: 'foundation', operation: 'settings-migration', message: error.message });
});
seedAutomaticDashboardSetup('worker-start');
scheduleDashboardRetry();
scheduleUpdaterCheck();
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
    PROFIT_BACKFILL_BACKGROUND.start(message.options || {}, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
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
      sourceTabUrl: sender?.tab?.url,
      reason: 'manual-reload'
    }).then(() => sendResponse({ ok: true, version: chrome.runtime.getManifest().version }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'getUpdaterStatus') {
    updaterRequest(`/status${message.refresh ? '?refresh=1' : ''}`, { timeoutMs: message.refresh ? 20000 : 3000 })
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

  if (message.type === 'localClick') {
    localClick(message.record || {}).then(sendResponse);
    return true;
  }

  if (message.type === 'localHelperHealth') {
    localHelperHealth().then(sendResponse);
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
