const computerInput = document.getElementById('computer');
const ebayInput = document.getElementById('ebayAccount');
const amazonInput = document.getElementById('profile');
const storePlanInput = document.getElementById('storePlan');
const freeListingsInput = document.getElementById('freeListings');
const monthlyDollarPresetInput = document.getElementById('monthlyDollarPreset');
const monthlyDollarInput = document.getElementById('monthlyDollarLimit');
const customListingLimitWrap = document.getElementById('customListingLimitWrap');
const customDollarLimitWrap = document.getElementById('customDollarLimitWrap');
const limitsSection = document.getElementById('limitsSection');
const limitsStatus = document.getElementById('limitsStatus');
const confirmLimitsButton = document.getElementById('confirmLimits');
const status = document.getElementById('status');
const uiOpacityInput = document.getElementById('uiOpacity');
const uiOpacityValue = document.getElementById('uiOpacityValue');
const uiThemeInput = document.getElementById('uiTheme');
const move99SourceCategoriesInput = document.getElementById('move99SourceCategories');
const move99DestinationCategoryInput = document.getElementById('move99DestinationCategory');
const move99SourceCategoryIdsInput = document.getElementById('move99SourceCategoryIds');
const move99BackburnerIdsInput = document.getElementById('move99BackburnerIds');
const currentMove99Destination = document.getElementById('currentMove99Destination');
const diagnosticLogElement = document.getElementById('diagnosticLog');
const updaterStatusElement = document.getElementById('updaterStatus');
const updateExtensionButton = document.getElementById('updateExtension');
const rollbackVersionInput = document.getElementById('rollbackVersion');
const rollbackExtensionButton = document.getElementById('rollbackExtension');
const productHunterClipboardReportElement = document.getElementById('productHunterClipboardReport');
const ecomSniperMonitorCard = document.getElementById('ecomSniperMonitorCard');
const ecomSniperMonitorBadge = document.getElementById('ecomSniperMonitorBadge');
const ecomSniperMonitorText = document.getElementById('ecomSniperMonitorText');
const dashboardAutoSetupElement = document.getElementById('dashboardAutoSetup');
const ebayOnlySections = [...document.querySelectorAll('[data-platform="ebay"]')];
const poshmarkOnlySections = [...document.querySelectorAll('[data-platform="poshmark"]')];
const popupTabButtons = [...document.querySelectorAll('[data-popup-tab]')];
const popupSections = [...document.querySelectorAll('[data-popup-section]')];
const workflowFilterButtons = [...document.querySelectorAll('[data-workflow-filter]')];
const workflowSections = [...document.querySelectorAll('[data-workflow-group]')];
const workflowEmptyElement = document.getElementById('workflowEmpty');
const POPUP_TAB_KEY = 'gldnPopupTab';
const WORKFLOW_GROUP_KEY = 'gldnWorkflowGroup';
const POPUP_TABS = Object.freeze(['workflows', 'status', 'settings']);
const WORKFLOW_GROUPS = Object.freeze(['daily', 'listings', 'research', 'profit', 'supplier', 'poshmark']);
let activeWorkflowGroup = 'daily';
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const SUBSCRIBE_SAVE_STATE_KEY = 'pendingAmazonSubscribeSaveRun';
const SUBSCRIBE_SAVE_RESULT_KEY = 'lastAmazonSubscribeSaveResult';
const SUBSCRIBE_SAVE_MANAGER_URL = 'https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions';
const LISTING_PREFLIGHT = globalThis.GLDN_LISTING_PREFLIGHT;

function installReliableRuntimeReloadBridge() {
  let reloading = false;
  const reloadIfPending = (request) => {
    if (reloading || request?.pending !== true) return;
    reloading = true;
    chrome.storage.local.set({
      lastExtensionReloadRequest: {
        ...request,
        pending: false,
        bridgeAcceptedAt: new Date().toISOString(),
        bridgeVersion: EXTENSION_VERSION
      }
    }, () => {
      if (chrome.runtime.lastError) {
        reloading = false;
        return;
      }
      chrome.runtime.reload();
    });
  };
  chrome.storage.local.get(['lastExtensionReloadRequest'], (stored) => reloadIfPending(stored.lastExtensionReloadRequest));
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.lastExtensionReloadRequest) {
      reloadIfPending(changes.lastExtensionReloadRequest.newValue);
    }
  });
}

installReliableRuntimeReloadBridge();

function reloadForPendingMove99FinalReviewRepair() {
  chrome.storage.local.get(['pendingMove99Run'], (stored) => {
    const pending = stored.pendingMove99Run;
    const expectedCount = Number(pending?.currentBatchCount || 0);
    const batchIds = [...new Set((pending?.currentBatchIds || []).map(String).filter(Boolean))];
    const stalePriorBatchReceipts = Boolean(
      globalThis.GLDN_FOUNDATION?.move99BatchActionStateIsStale?.(pending)
    );
    const exactPendingFinalReview = pending?.phase === 'awaiting-submit-approval'
      && pending?.reviewReady === true
      && expectedCount > 0
      && batchIds.length === expectedCount
      && Number(pending?.categoryUpdate?.attempted || 0) === expectedCount
      && Number(pending?.categoryUpdate?.updated || 0) === expectedCount
      && (
        stalePriorBatchReceipts
        || (
          pending?.finalActionApprovalToken === `APPROVE SUBMIT ${expectedCount}`
          && Number(pending?.finalActionClickCount || 0) === 1
          && Boolean(pending?.trustedSubmitDispatchAt)
          && Boolean(pending?.trustedSubmitReleasedAt)
          && !pending?.trustedFinalReviewDispatchAt
          && !pending?.trustedFinalReviewReleasedAt
          && Number(pending?.finalReviewActionClickCount || 0) === 0
        )
      );
    if (!exactPendingFinalReview) return;
    setTimeout(() => chrome.runtime.reload(), 350);
  });
}

reloadForPendingMove99FinalReviewRepair();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
function cleanConfigValue(value) {
  const text = String(value || '').trim();
  return /^YOUR_/i.test(text) || /YOUR_SCRIPT_ID/i.test(text) ? '' : text;
}

const BUILTIN_DASHBOARD_URL = cleanConfigValue(globalThis.GLDN_CONFIG?.dashboardUrl);
const BUILTIN_DASHBOARD_KEY = cleanConfigValue(globalThis.GLDN_CONFIG?.dashboardKey);
const DASHBOARD_URL_KEY = 'sellerDashboardUrl';
const DASHBOARD_SECRET_KEY = 'sellerDashboardKey';

const FOUNDATION = globalThis.GLDN_FOUNDATION;
const COMPUTER_ACCOUNT_MAP = FOUNDATION.computerAccounts;
const COMPUTER_OPTIONS = FOUNDATION.computerOptions;
const EBAY_ACCOUNT_OPTIONS = FOUNDATION.ebayAccountOptions;
const STORE_PLAN_LIMITS = { Premium: 10000, Anchor: 25000 };
const UI_THEMES = globalThis.GLDN_THEME_CATALOG?.ids || Object.freeze(['dark', 'light', 'graphite', 'signal', 'midnight', 'crimson']);
const normalizeUiTheme = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return UI_THEMES.includes(normalized) ? normalized : 'dark';
};
const applyPopupTheme = (value) => {
  const theme = normalizeUiTheme(value);
  if (globalThis.GLDN_THEME_CATALOG?.apply) globalThis.GLDN_THEME_CATALOG.apply(document.documentElement, theme);
  else document.documentElement.dataset.theme = theme;
  globalThis.GLDN_THEME_CATALOG?.renderPreview(document.getElementById('uiThemePreview'), theme);
  return theme;
};
globalThis.GLDN_THEME_CATALOG?.populateSelect(uiThemeInput);
const PANEL_LAYOUT_STORAGE_KEYS = Object.freeze([
  'gldnEbayPanelPosition',
  'gldnAmazonPanelPosition',
  'gldnPoshmarkPanelPosition',
  'gldnWalmartPanelPosition',
  'gldnEcomSniperPanelPosition',
  'gldnUniversalPanelPosition'
].flatMap((key) => [key, `${key}Mode`, `${key}Size`]));
const SETTINGS_BACKUP_KEYS = Object.freeze([
  'settingsSchemaVersion',
  'computerLabel',
  'ebayAccountLabel',
  'amazonProfileLabel',
  'gldnUiOpacity',
  'gldnUiTheme',
  'gldnModalSizes',
  'gldnModalPositions',
  'gldnModalOpacities',
  'gldnOnboardingState',
  POPUP_TAB_KEY,
  WORKFLOW_GROUP_KEY,
  'storePlan',
  'freeFixedPriceLimit',
  'monthlySellerDollarLimit',
  'limitsConfirmedMonth',
  'limitsConfirmedAt',
  'move99AccountSettings',
  ...PANEL_LAYOUT_STORAGE_KEYS,
  DASHBOARD_URL_KEY,
  DASHBOARD_SECRET_KEY
]);
const DIAGNOSTIC_STORAGE_KEYS = Object.freeze([
  ...SETTINGS_BACKUP_KEYS,
  'lastDashboardSync',
  'latestAccountHealth',
  'latestListingStatus',
  'lastMarkShippedResult',
  'latestEbaySnapshot',
  'latestPoshmarkStats',
  'latestMarketplaceProfit',
  'latestPoshmarkVisibleSales',
  'latestPoshmarkOrderProfit',
  'poshmarkProfitBackfill',
  'poshmarkProfitKnownOrders',
  'lastPreparedNote',
  'lastProductHunterClipboardPrep',
  'ecomSniperHandoffStatus',
  SUBSCRIBE_SAVE_STATE_KEY,
  SUBSCRIBE_SAVE_RESULT_KEY,
  'gldnDashboardQueue',
  'lastSettingsMigration',
  'gldnSettingsBackups',
  'gldnErrorLog'
]);

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

function storageSet(values) {
  const payload = { ...values };
  for (const key of ['pendingMove99Run', SUBSCRIBE_SAVE_STATE_KEY]) {
    if (!payload[key] || typeof payload[key] !== 'object') continue;
    payload[key] = {
      ...payload[key],
      extensionVersion: EXTENSION_VERSION,
      stateUpdatedAt: new Date().toISOString()
    };
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function runtimeMessage(message, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      finish({ ok: false, error: 'Extension request timed out. Reopen the popup and try again.' });
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          finish({ ok: false, error: error.message || 'The extension background service restarted.' });
          return;
        }
        finish(response || { ok: false, error: 'No response from the extension background service.' });
      });
    } catch (error) {
      finish({ ok: false, error: error?.message || 'The extension background service is unavailable.' });
    }
  });
}

async function claimWorkflowStart(workflowId, label) {
  const response = await runtimeMessage({ type: 'claimWorkflowStart', workflowId, label });
  if (!response?.ok) throw new Error(response?.error || `Could not start ${label}.`);
  return response.token;
}

async function releaseWorkflowStart(token) {
  if (!token) return;
  await runtimeMessage({ type: 'releaseWorkflowStart', token });
}

function normalizeComputer(value) {
  return FOUNDATION.normalizeComputer(value);
}

function normalizePopupTab(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return POPUP_TABS.includes(normalized) ? normalized : 'workflows';
}

function normalizeWorkflowGroup(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return WORKFLOW_GROUPS.includes(normalized) ? normalized : 'daily';
}

function applyWorkflowFilter(value = activeWorkflowGroup) {
  activeWorkflowGroup = normalizeWorkflowGroup(value);
  const workflowsActive = popupTabButtons.some((button) => button.dataset.popupTab === 'workflows'
    && button.getAttribute('aria-selected') === 'true');
  let visibleCount = 0;
  workflowFilterButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.workflowFilter === activeWorkflowGroup));
  });
  workflowSections.forEach((section) => {
    const available = section.dataset.platformAvailable !== 'false';
    const visible = workflowsActive && available && section.dataset.workflowGroup === activeWorkflowGroup;
    section.hidden = !visible;
    if (visible) visibleCount += 1;
  });
  if (workflowEmptyElement) workflowEmptyElement.hidden = !workflowsActive || visibleCount > 0;
}

function activatePopupTab(value, { persist = true } = {}) {
  const selected = normalizePopupTab(value);
  popupTabButtons.forEach((button) => {
    const active = button.dataset.popupTab === selected;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  popupSections.forEach((section) => {
    const platformAvailable = section.dataset.platformAvailable !== 'false';
    section.hidden = section.dataset.popupSection !== selected || !platformAvailable;
  });
  applyWorkflowFilter(activeWorkflowGroup);
  if (persist) chrome.storage.local.set({ [POPUP_TAB_KEY]: selected });
  return selected;
}

popupTabButtons.forEach((button, index) => {
  button.addEventListener('click', () => {
    activatePopupTab(button.dataset.popupTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + popupTabButtons.length) % popupTabButtons.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % popupTabButtons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = popupTabButtons.length - 1;
    const next = popupTabButtons[nextIndex];
    activatePopupTab(next.dataset.popupTab);
    next.focus();
  });
});

function accountForComputer(value) {
  const computer = normalizeComputer(value);
  return COMPUTER_ACCOUNT_MAP[computer] || {};
}

function normalizeEbayAccount(value) {
  return FOUNDATION.normalizeEbayAccount(value);
}

function selectedComputerAccount() {
  const computerLabel = normalizeComputer(computerInput.value);
  const account = accountForComputer(computerLabel);
  return { computerLabel, ebayAccountLabel: account.ebayAccountLabel, poshmarkOnly: Boolean(account.poshmarkOnly) };
}

function syncDerivedEbayInput() {
  const account = accountForComputer(computerInput.value);
  ebayInput.value = account.poshmarkOnly ? 'FarPosh - Poshmark only' : account.ebayAccountLabel;
  applyPlatformVisibility(Boolean(account.poshmarkOnly));
}

function applyPlatformVisibility(poshmarkOnly) {
  const poshmarkIdentity = FOUNDATION.poshmarkIdentityForComputer(computerInput.value);
  ebayOnlySections.forEach((element) => {
    element.dataset.platformAvailable = String(!poshmarkOnly);
  });
  poshmarkOnlySections.forEach((element) => {
    element.style.display = '';
    element.dataset.platformAvailable = String(Boolean(poshmarkIdentity.enabled));
  });
  workflowFilterButtons.forEach((button) => {
    const group = button.dataset.workflowFilter;
    button.disabled = group === 'poshmark' ? !poshmarkIdentity.enabled : (poshmarkOnly && group !== 'supplier');
  });
  const currentButton = workflowFilterButtons.find((button) => button.dataset.workflowFilter === activeWorkflowGroup);
  if (currentButton?.disabled) activeWorkflowGroup = poshmarkIdentity.enabled ? 'poshmark' : 'supplier';
  const selectedTab = popupTabButtons.find((button) => button.getAttribute('aria-selected') === 'true')?.dataset.popupTab || 'workflows';
  activatePopupTab(selectedTab, { persist: false });
}

function csvToArray(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function arrayToCsv(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function configuredMove99Account(account) {
  const configured = globalThis.GLDN_CONFIG?.move99Accounts;
  if (!configured || typeof configured !== 'object') return {};
  return configured[account] || configured[String(account || '').toLowerCase()] || {};
}

function defaultMove99ForAccount(account) {
  return FOUNDATION.move99DefaultSettingsForAccount(account);
}

function buildMove99ActiveUrl(sourceStoreCategoryIds) {
  const ids = Array.isArray(sourceStoreCategoryIds) ? sourceStoreCategoryIds.filter(Boolean) : [];
  if (!ids.length) return 'https://www.ebay.com/sh/lst/active';

  const params = new URLSearchParams({
    storeCatIds: ids.join(','),
    source: 'filterpanel',
    action: 'search'
  });

  return `https://www.ebay.com/sh/lst/active?${params.toString()}`;
}

function currentMove99SettingsForAccount(account, allSettings = {}) {
  return FOUNDATION.move99SettingsForAccount(account, allSettings?.[account] || {});
}

function renderMove99Settings(allSettings, account) {
  const settings = currentMove99SettingsForAccount(account, allSettings);
  move99SourceCategoriesInput.value = arrayToCsv(settings.sourceCategories);
  move99DestinationCategoryInput.value = settings.destinationCategory || '';
  move99SourceCategoryIdsInput.value = arrayToCsv(settings.sourceStoreCategoryIds);
  move99BackburnerIdsInput.value = arrayToCsv(settings.backburnerItemIds);
  currentMove99Destination.textContent = settings.destinationCategory || 'Not set';
}

function normalizeMove99BackupAccounts(allSettings) {
  if (!allSettings || typeof allSettings !== 'object' || Array.isArray(allSettings)) {
    throw new Error('Move .99 account settings are not a valid object.');
  }
  const normalized = {};
  for (const [rawAccount, rawSettings] of Object.entries(allSettings)) {
    const account = normalizeEbayAccount(rawAccount);
    if (!account) throw new Error(`Move .99 settings contain an unknown eBay account: ${rawAccount}`);
    const validation = FOUNDATION.validateMove99Settings(rawSettings);
    if (!validation.ok) throw new Error(`${account}: ${validation.errors[0]}`);
    normalized[account] = validation.settings;
  }
  return normalized;
}

function planFromStored(plan, limit) {
  if (plan === 'Premium' || Number(limit) === 10000) return 'Premium';
  if (plan === 'Anchor' || Number(limit) === 25000) return 'Anchor';
  return 'Custom';
}

function applyPlanLimit() {
  const plan = storePlanInput.value;
  const fixed = STORE_PLAN_LIMITS[plan];
  const custom = plan === 'Custom';
  customListingLimitWrap.style.display = custom ? 'block' : 'none';
  if (!custom) freeListingsInput.value = fixed;
  freeListingsInput.readOnly = !custom;
}

function applyDollarPreset() {
  const custom = monthlyDollarPresetInput.value === 'custom';
  customDollarLimitWrap.style.display = custom ? 'block' : 'none';
  if (!custom) monthlyDollarInput.value = monthlyDollarPresetInput.value;
}


function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return '';
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function numberOrNull(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function formatWhole(value) {
  const number = numberOrNull(value);
  return number == null ? 'Not set' : Math.round(number).toLocaleString();
}

function formatCurrency(value) {
  const number = numberOrNull(value);
  return number == null ? 'Not set' : number.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusClass(value) {
  return ['good', 'warning', 'critical'].includes(value) ? value : 'unknown';
}

function setMessage(message, isError = false) {
  status.style.color = isError ? '#b91c1c' : '#166534';
  status.textContent = message;
}

function recordPopupLog(message, detail = '') {
  const payload = {
    at: new Date().toISOString(),
    source: 'popup',
    level: 'error',
    message: String(message || 'Popup error').slice(0, 800),
    detail: String(detail || '').slice(0, 1200),
    page: 'chrome-extension://popup',
    version: chrome.runtime.getManifest().version
  };
  chrome.storage.local.get(['gldnErrorLog'], (result) => {
    const current = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
    chrome.storage.local.set({ gldnErrorLog: [payload, ...current].slice(0, 80) }, () => renderDiagnostics([payload, ...current].slice(0, 80)));
  });
}

function formatDiagnosticEntry(entry) {
  const date = new Date(entry.at || '');
  const time = Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
  const operation = entry.operation ? ` / ${entry.operation}` : '';
  const identity = entry.computerLabel || entry.ebayAccountLabel
    ? ` / ${entry.computerLabel || '?'} ${entry.ebayAccountLabel || ''}`.trimEnd()
    : '';
  const header = `[${time}] ${entry.level || 'error'} ${entry.source || 'extension'}${operation}${identity} v${entry.version || '?'}`;
  const page = entry.page ? `\n${entry.page}` : '';
  const detail = entry.detail ? `\n${entry.detail}` : '';
  return `${header}\n${entry.message || 'Unknown issue'}${page}${detail}`;
}

function renderDiagnostics(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    diagnosticLogElement.classList.add('diagnostic-empty');
    diagnosticLogElement.textContent = 'No errors recorded.';
    return;
  }
  diagnosticLogElement.classList.remove('diagnostic-empty');
  diagnosticLogElement.textContent = list.slice(0, 12).map(formatDiagnosticEntry).join('\n\n---\n\n');
}

function renderFeatureHealth(result) {
  const lines = [];
  lines.push(`GLDN Ops v${result?.version || '?'}`);
  lines.push(`Computer: ${result?.identity?.computerLabel || 'not set'}`);
  lines.push(`eBay account: ${result?.identity?.ebayAccountLabel || 'none / Poshmark-only'}`);
  lines.push(`Dashboard: ${result?.dashboard?.ok ? 'OK' : `FAIL - ${result?.dashboard?.error || 'unknown'}`}`);
  lines.push(`Deployment: ${result?.foundation?.deploymentMode || 'unknown'}`);
  lines.push(`Settings schema: ${result?.foundation?.settingsSchemaVersion || 0}/${result?.foundation?.expectedSettingsSchemaVersion || '?'}`);
  lines.push(`Queued dashboard records: ${result?.foundation?.dashboardQueuedRecords || 0}`);
  lines.push('EcomSniper control: read-only handoff status');
  if (result?.ecomSniper?.ok) {
    lines.push(`EcomSniper route: ${result.ecomSniper.id || 'unknown id'} (${result.ecomSniper.storeSafe ? 'Chrome extension safe' : 'detected'})`);
  } else {
    const prefix = result?.requirements?.ecomSniperRequired ? 'FAIL' : 'NOT REQUIRED';
    lines.push(`EcomSniper: ${prefix} - ${result?.ecomSniper?.error || 'not found'}`);
  }
  diagnosticLogElement.classList.remove('diagnostic-empty');
  diagnosticLogElement.textContent = lines.join('\n');
}

function pickKeys(source, keys) {
  return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source || {}, key)).map((key) => [key, source[key]]));
}

function safeJsonClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function redactedSettings(source) {
  const copy = { ...(source || {}) };
  if (copy[DASHBOARD_SECRET_KEY]) copy[DASHBOARD_SECRET_KEY] = '[saved]';
  return copy;
}

function safeUrlHost(value) {
  try {
    return value ? new URL(value).host : '';
  } catch (_) {
    return '';
  }
}

function buildSettingsBackup(storageValues) {
  return {
    type: 'gldn-ops-settings-backup',
    schemaVersion: FOUNDATION.settingsSchemaVersion,
    exportedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    extensionId: chrome.runtime.id,
    settings: safeJsonClone(pickKeys(storageValues, SETTINGS_BACKUP_KEYS))
  };
}

function parseSettingsBackup(text) {
  const parsed = JSON.parse(String(text || '').trim());
  const rawSettings = parsed?.type === 'gldn-ops-settings-backup' ? parsed.settings : parsed;
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    throw new Error('Clipboard does not contain a GLDN Ops settings backup.');
  }
  const settings = pickKeys(rawSettings, SETTINGS_BACKUP_KEYS);
  if (!Object.keys(settings).length) {
    throw new Error('The backup did not contain any restorable GLDN Ops settings.');
  }
  const normalized = FOUNDATION.normalizeStoredSettings(settings);
  if (settings.computerLabel && !normalized.computerLabel) {
    throw new Error(`Backup contains an unknown computer: ${settings.computerLabel}`);
  }
  const hasMove99Settings = Object.prototype.hasOwnProperty.call(settings, 'move99AccountSettings');
  const move99AccountSettings = hasMove99Settings
    ? normalizeMove99BackupAccounts(settings.move99AccountSettings)
    : undefined;
  return {
    ...settings,
    settingsSchemaVersion: normalized.settingsSchemaVersion,
    computerLabel: normalized.computerLabel,
    ebayAccountLabel: normalized.ebayAccountLabel,
    gldnUiOpacity: normalized.gldnUiOpacity,
    gldnUiTheme: normalized.gldnUiTheme,
    ...(hasMove99Settings ? { move99AccountSettings } : {})
  };
}

async function copyTextToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

async function buildDiagnosticReport() {
  const [storageValues, health] = await Promise.all([
    storageGet(DIAGNOSTIC_STORAGE_KEYS),
    runtimeMessage({ type: 'extensionHealthCheck' })
  ]);
  const manifest = chrome.runtime.getManifest();
  const computer = normalizeComputer(storageValues.computerLabel);
  const account = accountForComputer(computer);
  const savedDashboardKey = String(storageValues[DASHBOARD_SECRET_KEY] || '').trim();
  const dashboardKeyAvailable = Boolean(BUILTIN_DASHBOARD_KEY || savedDashboardKey);
  return {
    type: 'gldn-ops-diagnostic-report',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    extension: {
      id: chrome.runtime.id,
      name: manifest.name,
      version: manifest.version,
      manifestVersion: manifest.manifest_version,
      permissions: manifest.permissions || [],
      hostPermissions: manifest.host_permissions || []
    },
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language
    },
    identity: {
      savedComputer: storageValues.computerLabel || '',
      normalizedComputer: computer,
      savedEbayAccount: storageValues.ebayAccountLabel || '',
      derivedEbayAccount: account.poshmarkOnly ? '' : account.ebayAccountLabel,
      poshmarkOnly: Boolean(account.poshmarkOnly),
      amazonProfile: storageValues.amazonProfileLabel || ''
    },
    dashboard: {
      configured: Boolean(BUILTIN_DASHBOARD_URL && dashboardKeyAvailable),
      host: safeUrlHost(BUILTIN_DASHBOARD_URL),
      setupCodeSaved: Boolean(savedDashboardKey),
      builtInSetupCode: Boolean(BUILTIN_DASHBOARD_KEY),
      lastSync: storageValues.lastDashboardSync || null,
      queue: Array.isArray(storageValues.gldnDashboardQueue)
        ? {
            count: storageValues.gldnDashboardQueue.length,
            oldestAt: storageValues.gldnDashboardQueue[0]?.createdAt || '',
            nextAttemptAt: storageValues.gldnDashboardQueue.map((item) => item?.nextAttemptAt).filter(Boolean).sort()[0] || ''
          }
        : { count: 0 },
      health: health?.dashboard || null
    },
    ecomSniper: {
      configuredId: String(globalThis.GLDN_CONFIG?.ecomSniperExtensionId || ''),
      health: health?.ecomSniper || null,
      mode: 'read-only-handoff'
    },
    settings: redactedSettings(pickKeys(storageValues, SETTINGS_BACKUP_KEYS)),
    latestRecords: {
      sellerLevel: storageValues.latestAccountHealth || null,
      listingStatus: storageValues.latestListingStatus || null,
      markShipped: storageValues.lastMarkShippedResult || null,
      ebaySnapshot: storageValues.latestEbaySnapshot || null,
      poshmarkStats: storageValues.latestPoshmarkStats || null,
      marketplaceProfit: storageValues.latestMarketplaceProfit || null,
      poshmarkVisibleSales: storageValues.latestPoshmarkVisibleSales || null,
      poshmarkOrderProfit: storageValues.latestPoshmarkOrderProfit || null,
      preparedNote: storageValues.lastPreparedNote || null
    },
    errorLog: Array.isArray(storageValues.gldnErrorLog) ? storageValues.gldnErrorLog.slice(0, 20) : []
  };
}

window.addEventListener('error', (event) => {
  recordPopupLog(event.message, `${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}\n${event.error?.stack || ''}`);
});

window.addEventListener('unhandledrejection', (event) => {
  recordPopupLog(event.reason?.message || String(event.reason || 'Unhandled promise rejection'), event.reason?.stack || '');
});

function renderSyncStatus(sync, hasConfig) {
  const element = document.getElementById('dashboardSync');
  if (!hasConfig) {
    element.textContent = 'Not configured.';
    element.style.color = '#64748b';
    return;
  }
  if (!sync) {
    element.textContent = 'Configured. Run Test Connection or save a scan.';
    element.style.color = '#475569';
    return;
  }
  const date = new Date(sync.at);
  const time = Number.isNaN(date.getTime()) ? '' : ` - ${date.toLocaleString()}`;
  if (sync.ok) {
    element.textContent = `${sync.message || 'Last sync succeeded'}${time}`;
    element.style.color = '#166534';
  } else {
    element.textContent = `Last sync failed: ${sync.error || 'Unknown error'}${time}`;
    element.style.color = '#b91c1c';
  }
}

function renderLimits(settings = {}) {
  const storedLimit = settings.freeFixedPriceLimit ?? '';
  const plan = planFromStored(settings.storePlan || '', storedLimit);
  storePlanInput.value = plan;
  freeListingsInput.value = storedLimit === '' ? (STORE_PLAN_LIMITS[plan] || '') : storedLimit;
  applyPlanLimit();

  const storedDollarLimit = settings.monthlySellerDollarLimit ?? 1000000;
  monthlyDollarPresetInput.value = Number(storedDollarLimit) === 1000000 ? '1000000' : 'custom';
  monthlyDollarInput.value = storedDollarLimit;
  applyDollarPreset();

  const confirmed = settings.limitsConfirmedMonth === currentMonthKey();
  const latestStatus = settings.latestListingStatus?.overallStatus || '';
  const needsReview = Boolean(latestStatus && latestStatus !== 'GOOD');
  const due = !confirmed;
  limitsSection.classList.toggle('due', due || needsReview);
  limitsSection.classList.toggle('confirmed', confirmed && !needsReview);
  limitsStatus.className = `limits-status ${(due || needsReview) ? 'due' : 'confirmed'}`;
  confirmLimitsButton.className = (due || needsReview) ? 'danger' : 'success';
  confirmLimitsButton.textContent = needsReview ? latestStatus : due ? 'Confirm Listings Under Limit' : 'Run Limit Check';

  if (needsReview) {
    limitsStatus.textContent = `${latestStatus}. Run Confirm Listings Under Limit on eBay to review current usage.`;
  } else if (confirmed) {
    const date = new Date(settings.limitsConfirmedAt || Date.now());
    const time = Number.isNaN(date.getTime()) ? '' : ` on ${date.toLocaleString()}`;
    limitsStatus.textContent = `Confirmed for ${monthLabel(currentMonthKey())}${time}.`;
  } else {
    const previous = settings.limitsConfirmedMonth ? ` Last confirmed for ${monthLabel(settings.limitsConfirmedMonth)}.` : '';
    limitsStatus.textContent = `Listing limits need monthly confirmation.${previous}`;
  }
}

function renderShipping(record) {
  const rows = document.getElementById('shippingRows');
  const time = document.getElementById('shippingTime');
  if (!record) {
    rows.innerHTML = '<div class="hint">No Mark as Shipped run recorded in this Chrome profile.</div>';
    time.textContent = '';
    return;
  }
  const values = [
    ['Computer', record.computerLabel || 'Not recorded'],
    ['eBay account', record.ebayAccountLabel || 'Not recorded'],
    ['Result', record.status || 'Unknown'],
    ['Awaiting before', String(record.beforeCount ?? 'Not recorded')],
    ['Selected', String(record.selectedCount ?? 'Not recorded')],
    ['Marked shipped', String(record.markedCount ?? 0)],
    ['Remaining', String(record.remainingCount ?? 'Not recorded')],
    ['Batches', String(record.batchCount ?? 0)]
  ];
  if (record.error) values.push(['Error', record.error]);
  rows.innerHTML = values.map(([label, value]) => `<div class="row"><span>${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`).join('');
  const date = new Date(record.completedAt || record.startedAt);
  time.textContent = Number.isNaN(date.getTime()) ? '' : `Completed ${date.toLocaleString()}`;
}

function renderListing(record) {
  const rows = document.getElementById('listingRows');
  const time = document.getElementById('listingTime');
  if (!rows || !time) return;
  if (!record) {
    rows.innerHTML = '<div class="hint">No listing confirmation saved in this Chrome profile.</div>';
    time.textContent = '';
    return;
  }
  const values = [
    ['Computer', record.computerLabel || 'Not recorded'],
    ['eBay account', record.ebayAccountLabel || 'Not recorded'],
    ['Active listings', formatWhole(record.activeListings)],
    ['Available item quantity', formatWhole(record.availableQuantity ?? record.inStockQuantity)],
    ['Store allowance used', formatWhole(record.subscriptionUsedThisMonth)],
    ['Store allowance left', formatWhole(record.subscriptionLeftThisMonth)],
    ['Store monthly allowance', formatWhole(record.subscriptionListingLimit)],
    ['Store allowance usage', record.subscriptionUsagePercent == null ? 'Not detected' : `${Number(record.subscriptionUsagePercent).toFixed(1)}%`],
    ['Store allowance status', record.subscriptionStatus || 'Unknown'],
    ['Seller quantity used', formatWhole(record.currentQuantityUsed)],
    ['Seller quantity limit', formatWhole(record.monthlySellerQuantityLimit)],
    ['Seller quantity status', record.sellerQuantityStatus || 'Unknown'],
    ['Dollar used', formatCurrency(record.currentDollarUsed)],
    ['Dollar limit', formatCurrency(record.monthlySellerDollarLimit)],
    ['Overall', record.overallStatus || 'Unknown']
  ];
  rows.innerHTML = values.map(([label, value]) => {
    const critical = /CHECK|CHANGED|NOT DETECTED|PRUNE/i.test(String(value));
    return `<div class="row"><span>${escapeHtml(label)}</span><span class="value ${critical ? 'critical' : ''}">${escapeHtml(value)}</span></div>`;
  }).join('');
  const date = new Date(record.confirmedAt || record.capturedAt);
  time.textContent = Number.isNaN(date.getTime()) ? '' : `Confirmed ${date.toLocaleString()}`;
}

function renderHealth(record) {
  const rows = document.getElementById('healthRows');
  const time = document.getElementById('healthTime');
  document.getElementById('healthComputer').textContent = record?.computerLabel || 'Not recorded';
  document.getElementById('healthEbay').textContent = record?.ebayAccountLabel || 'Not recorded';

  if (!record) {
    rows.innerHTML = '<div class="hint">No Seller Level check saved in this Chrome profile.</div>';
    time.textContent = '';
    return;
  }

  const values = [
    ['Current seller level', record.currentSellerLevel || 'Not captured', record.statuses?.currentSellerLevel],
    ['If evaluated today', record.evaluatedToday || 'Not captured', record.statuses?.evaluatedToday],
    ['Transaction defect rate', record.transactionDefectRate == null ? 'Not captured' : `${record.transactionDefectRate}%`, record.statuses?.transactionDefectRate],
    ['Late shipment rate', record.lateShipmentRate == null ? 'Not captured' : `${record.lateShipmentRate}%`, record.statuses?.lateShipmentRate],
    ['Tracking on time', record.trackingOnTime == null ? 'Not captured' : `${record.trackingOnTime}%`, record.statuses?.trackingOnTime],
    ['Cases closed', record.casesClosed == null ? 'Not captured' : `${record.casesClosed}%`, record.statuses?.casesClosed],
    ['Next evaluation', record.nextEvaluation || 'Not captured', 'unknown']
  ];

  rows.innerHTML = values.map(([label, value, state]) => `
    <div class="row"><span>${escapeHtml(label)}</span><span class="value ${statusClass(state)}">${escapeHtml(value)}</span></div>
  `).join('');

  const date = new Date(record.savedAt || record.capturedAt);
  time.textContent = Number.isNaN(date.getTime()) ? '' : `Saved ${date.toLocaleString()}`;
}

function renderProductHunterClipboardReport(report) {
  if (!productHunterClipboardReportElement) return;
  productHunterClipboardReportElement.textContent = report?.preparedAt
    ? `Product Hunter titles: ${Number(report.preflightReadyCount ?? report.keptCount).toLocaleString()} ready, ${Number(report.preflightReviewCount || 0).toLocaleString()} review, ${Number(report.preflightBlockCount || 0).toLocaleString()} blocked, ${Number(report.excludedCount).toLocaleString()} category exclusions, ${Number(report.duplicatesRemoved || 0).toLocaleString()} duplicates removed`
    : 'Product Hunter titles: Not prepared';
}

function relativeStatusTime(value) {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(timestamp).toLocaleString();
}

function renderEcomSniperMonitor(result = {}) {
  if (!ecomSniperMonitorCard || !ecomSniperMonitorBadge || !ecomSniperMonitorText) return;
  const handoff = result.ecomSniperHandoffStatus || null;
  let badge = 'Idle';
  let text = 'No GLDN-observable EcomSniper handoff is active.';
  let ready = false;

  if (handoff?.state === 'open') {
    badge = 'Handoff open';
    text = `${handoff.pageLabel || 'EcomSniper'} tab opened ${relativeStatusTime(handoff.openedAt)}. Internal EcomSniper progress is unknown.`;
    ready = true;
  } else if (handoff?.state === 'closed') {
    badge = 'Handoff closed';
    text = `${handoff.pageLabel || 'EcomSniper'} tab closed ${relativeStatusTime(handoff.closedAt)}. Closing the tab does not prove completion.`;
  }

  ecomSniperMonitorBadge.textContent = badge;
  ecomSniperMonitorText.textContent = text;
  ecomSniperMonitorCard.classList.toggle('ready', ready);
}

function renderUpdaterStatus(result) {
  updaterStatusElement.classList.remove('ready', 'warning', 'error');
  if (!result?.ok) {
    updaterStatusElement.classList.add('error');
    updaterStatusElement.textContent = result?.error || 'Automatic updater is not installed or running.';
    return;
  }
  const runtime = result.runtimeVersion || EXTENSION_VERSION;
  const current = result.currentVersion || result.diskVersion || runtime;
  const latest = result.latestVersion || '';
  if (result.workflowBusy) {
    updaterStatusElement.textContent = `Update waiting: ${result.workflows?.map((item) => item.label).join(', ') || 'a workflow'} is active. Finish it or use Stop/Reset.`;
    return;
  }
  if (result.autoReloadAttempt && current !== runtime) {
    updaterStatusElement.classList.add('error');
    updaterStatusElement.textContent = `Files are v${current}, but Chrome is still running v${runtime}. Update & Reload will retry; if it remains unchanged, this Chrome profile is loaded from a different folder.`;
    return;
  }
  if (result.releaseFeedBehind === true) {
    updaterStatusElement.classList.add('warning');
    updaterStatusElement.textContent = `Public release feed is behind: installed v${current}, published v${latest || 'unknown'}. This computer will not downgrade, but other computers cannot discover v${current} until that release is published.`;
    return;
  }
  if (result.error) {
    updaterStatusElement.classList.add('warning');
    updaterStatusElement.textContent = `Updater is running on v${current}, but the public release feed could not be verified: ${result.error}`;
    return;
  }
  const separateLoadedFolder = result.targetSource === 'chrome-profile'
    && result.targetMatchesConfiguredInstallRoot !== true;
  if (separateLoadedFolder) {
    updaterStatusElement.classList.add('warning');
    updaterStatusElement.textContent = result.updateAvailable
      ? `Update ready: v${current} -> v${latest}. This existing Chrome profile uses its own loaded folder, so the update applies there. Keep that folder in place to preserve this profile's extension identity and saved settings.`
      : `Updater connected to v${current} in this existing Chrome profile's own loaded folder. Keep that folder in place; updates apply there and preserve this profile's saved settings.`;
    return;
  }
  updaterStatusElement.classList.add('ready');
  const targetNote = result.targetMatchesConfiguredInstallRoot === true
    ? ' This Chrome profile uses the shared stable folder.'
    : '';
  updaterStatusElement.textContent = result.updateAvailable
    ? `Update ready: v${current} -> v${latest}. Settings and .99 categories will be preserved.${targetNote}`
    : latest
      ? `Automatic updater ready. v${current} is the latest stable release.${targetNote}`
      : `Automatic updater ready. Installed files: v${current}.${targetNote}`;
}

function renderAmazonSubscribeSave(state, record) {
  const element = document.getElementById('amazonSubscribeSaveStatus');
  if (!element) return;
  const phase = String(state?.phase || '');
  if (phase === 'awaiting-approval') {
    element.textContent = `${Number(state.expectedCount || 0).toLocaleString()} exact active subscription(s) awaiting review in the Amazon tab.`;
    return;
  }
  if (state?.active) {
    const cancelled = Number(state.cancelledIds?.length || 0);
    element.textContent = `Running: ${phase || 'working'} | ${cancelled}/${Number(state.expectedCount || 0)} cancelled.`;
    return;
  }
  if (record?.status === 'Completed') {
    const date = new Date(record.completedAt || Date.now());
    element.textContent = `Current Amazon profile complete: ${Number(record.cancelledCount || 0)} cancelled, 0 active remaining. ALL Amazon Accounts remains unchecked. ${Number.isNaN(date.getTime()) ? '' : date.toLocaleString()}`.trim();
    return;
  }
  if (state?.error) {
    element.textContent = `Stopped safely: ${state.error}`;
    return;
  }
  element.textContent = 'No Subscribe & Save run saved in this Chrome profile.';
}

async function refreshUpdaterStatus({ refresh = false } = {}) {
  try {
    const [statusResult, versionsResult] = await Promise.all([
      runtimeMessage({ type: 'getUpdaterStatus', refresh }),
      runtimeMessage({ type: 'getUpdaterVersions' })
    ]);
    renderUpdaterStatus(statusResult);
    const versions = Array.isArray(versionsResult?.versions) ? versionsResult.versions : [];
    rollbackVersionInput.innerHTML = versions.length
      ? versions.map((item) => `<option value="${escapeHtml(item.id)}">v${escapeHtml(item.version)} - ${escapeHtml(new Date(item.createdAt).toLocaleString())}</option>`).join('')
      : '<option value="">No rollback version yet</option>';
    rollbackExtensionButton.disabled = !versions.length;
  } catch (error) {
    renderUpdaterStatus({ ok: false, error: error.message });
    rollbackVersionInput.innerHTML = '<option value="">Updater unavailable</option>';
    rollbackExtensionButton.disabled = true;
  }
}

function refresh() {
  chrome.storage.local.get([
    'computerLabel',
    'ebayAccountLabel',
    'amazonProfileLabel',
    'latestAccountHealth',
    'latestListingStatus',
    'gldnUiOpacity',
    'gldnUiTheme',
    POPUP_TAB_KEY,
    WORKFLOW_GROUP_KEY,
    'lastDashboardSync',
    'storePlan',
    'freeFixedPriceLimit',
    'monthlySellerDollarLimit',
    'limitsConfirmedMonth',
    'limitsConfirmedAt',
    'lastMarkShippedResult',
    'lastProductHunterClipboardPrep',
    'ecomSniperHandoffStatus',
    SUBSCRIBE_SAVE_STATE_KEY,
    SUBSCRIBE_SAVE_RESULT_KEY,
    'move99AccountSettings',
    DASHBOARD_URL_KEY,
    DASHBOARD_SECRET_KEY,
    'gldnErrorLog'
  ], (result) => {
    const computer = normalizeComputer(result.computerLabel);
    const mapped = accountForComputer(computer);
    const ebay = mapped.ebayAccountLabel || '';
    const amazon = (result.amazonProfileLabel || '').trim();

    activeWorkflowGroup = normalizeWorkflowGroup(result[WORKFLOW_GROUP_KEY]);
    computerInput.value = computer;
    syncDerivedEbayInput();
    amazonInput.value = amazon;
    const opacity = Number(result.gldnUiOpacity || globalThis.GLDN_CONFIG?.defaultUiOpacity || 75);
    const theme = normalizeUiTheme(result.gldnUiTheme || globalThis.GLDN_CONFIG?.defaultUiTheme || 'dark');
    uiOpacityInput.value = String(opacity);
    uiOpacityValue.textContent = `${opacity}%`;
    uiThemeInput.value = theme;
    applyPopupTheme(theme);
    activatePopupTab(result[POPUP_TAB_KEY], { persist: false });

    document.getElementById('currentComputer').textContent = computer || 'Not set';
    document.getElementById('currentEbay').textContent = computer
      ? (mapped.poshmarkOnly ? 'Poshmark only' : ebay || 'Not set')
      : 'Not set';
    document.getElementById('currentAmazon').textContent = amazon || 'Not set';
    renderMove99Settings(result.move99AccountSettings || {}, ebay);

    renderLimits(result);
    renderListing(result.latestListingStatus);
    renderHealth(result.latestAccountHealth);
    renderShipping(result.lastMarkShippedResult);
    renderAmazonSubscribeSave(result[SUBSCRIBE_SAVE_STATE_KEY], result[SUBSCRIBE_SAVE_RESULT_KEY]);
    renderProductHunterClipboardReport(result.lastProductHunterClipboardPrep);
    renderEcomSniperMonitor(result);
    renderDiagnostics(result.gldnErrorLog);
    renderSyncStatus(result.lastDashboardSync, Boolean(BUILTIN_DASHBOARD_URL && (BUILTIN_DASHBOARD_KEY || result[DASHBOARD_SECRET_KEY])));
  });
}

storePlanInput.addEventListener('change', () => {
  applyPlanLimit();
  if (storePlanInput.value === 'Custom') freeListingsInput.focus();
});

monthlyDollarPresetInput.addEventListener('change', () => {
  applyDollarPreset();
  if (monthlyDollarPresetInput.value === 'custom') monthlyDollarInput.focus();
});

document.getElementById('saveIdentity').addEventListener('click', () => {
  const { computerLabel, ebayAccountLabel, poshmarkOnly } = selectedComputerAccount();
  if (!computerLabel) {
    setMessage('Choose the computer first.', true);
    return;
  }
  chrome.storage.local.set({ computerLabel, ebayAccountLabel }, () => {
    document.getElementById('currentComputer').textContent = computerLabel;
    document.getElementById('currentEbay').textContent = poshmarkOnly ? 'Poshmark only' : ebayAccountLabel;
    setMessage(poshmarkOnly ? 'Computer saved as Poshmark-only.' : `Computer saved. eBay account is ${ebayAccountLabel}.`);
  });
});

computerInput.addEventListener('change', () => {
  syncDerivedEbayInput();
  chrome.storage.local.get(['move99AccountSettings'], (result) => {
    const account = selectedComputerAccount();
    renderMove99Settings(result.move99AccountSettings || {}, account.ebayAccountLabel || '');
  });
});

document.getElementById('saveMove99Categories').addEventListener('click', async () => {
  const selected = selectedComputerAccount();
  const account = selected.ebayAccountLabel;
  const sourceCategories = csvToArray(move99SourceCategoriesInput.value);
  const destinationCategory = move99DestinationCategoryInput.value.trim();
  const sourceStoreCategoryIds = csvToArray(move99SourceCategoryIdsInput.value);
  const backburnerItemIds = csvToArray(move99BackburnerIdsInput.value);

  if (!account) {
    setMessage('Computer 7 is Poshmark-only and does not have .99 eBay categories.', true);
    return;
  }
  const validation = FOUNDATION.validateMove99Settings({
    sourceCategories,
    destinationCategory,
    sourceStoreCategoryIds,
    backburnerItemIds
  });
  if (!validation.ok) {
    setMessage(validation.errors[0], true);
    return;
  }

  try {
    const result = await storageGet(['move99AccountSettings']);
    const move99AccountSettings = { ...(result.move99AccountSettings || {}) };
    move99AccountSettings[account] = JSON.parse(JSON.stringify(validation.settings));
    await storageSet({ move99AccountSettings });
    const verified = await storageGet(['move99AccountSettings']);
    const saved = verified.move99AccountSettings?.[account];
    const savedValidation = FOUNDATION.validateMove99Settings(saved || {});
    if (!savedValidation.ok || JSON.stringify(savedValidation.settings) !== JSON.stringify(validation.settings)) {
      throw new Error(`Saved .99 categories for ${account} could not be verified.`);
    }
    renderMove99Settings(verified.move99AccountSettings || {}, account);
    setMessage(`Saved and verified .99 categories for ${account}.`);
  } catch (error) {
    recordPopupLog(error.message || 'Could not save Move .99 categories.', error.stack || '');
    setMessage(error.message || 'Could not save Move .99 categories.', true);
  }
});

document.getElementById('openMove99Workflow').addEventListener('click', () => {
  startMove99Workflow('price99').catch((error) => {
    recordPopupLog(error.message || 'Could not start Move .99.', error.stack || '');
    setMessage(error.message || 'Could not start Move .99.', true);
  });
});

document.getElementById('openNon99Workflow').addEventListener('click', () => {
  startMove99Workflow('non99').catch((error) => {
    recordPopupLog(error.message || 'Could not start Non-.99 cleanup.', error.stack || '');
    setMessage(error.message || 'Could not start Non-.99 cleanup.', true);
  });
});

workflowFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.disabled) return;
    applyWorkflowFilter(button.dataset.workflowFilter);
    chrome.storage.local.set({ [WORKFLOW_GROUP_KEY]: activeWorkflowGroup });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

document.getElementById('openVariationAudit').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('variation-audit.html') });
});

document.getElementById('openPolicyListingAudit').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('policy-listing-audit.html') });
});

document.getElementById('openListingPreflight').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('listing-preflight.html') });
});

document.getElementById('openEbayMonthlyProfit').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('ebay-profit.html') });
});

function requestReverseMove99SaleEventStatus() {
  const dialog = document.getElementById('reverseMove99SaleEventDialog');
  if (!dialog?.showModal) return Promise.resolve('unconfirmed');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      resolve(value);
    };
    dialog.querySelectorAll('[data-sale-event-status]').forEach((button) => {
      button.onclick = () => finish(String(button.dataset.saleEventStatus || 'unconfirmed'));
    });
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish('unconfirmed');
    };
    dialog.showModal();
  });
}

async function startMove99Workflow(scanMode) {
  const saleEventStatus = scanMode === 'non99'
    ? await requestReverseMove99SaleEventStatus()
    : '';
  const saleEventDecision = scanMode === 'non99'
    ? FOUNDATION.reverseMove99SaleEventDecision(saleEventStatus)
    : { ok: true, status: '' };
  if (!saleEventDecision.ok) {
    setMessage(saleEventDecision.error, true);
    return;
  }
  const selected = selectedComputerAccount();
  const account = selected.ebayAccountLabel;
  if (!account) {
    setMessage('Computer 7 is Poshmark-only. Move .99 is disabled for it.', true);
    return;
  }
  const result = await storageGet(['move99AccountSettings']);
  const settings = currentMove99SettingsForAccount(account, result.move99AccountSettings || {});
  if (!settings.sourceCategories?.length || !settings.destinationCategory) {
    throw new Error('Save source and destination .99 categories first.');
  }
  setMessage(scanMode === 'non99' ? 'Starting Non-.99 cleanup...' : 'Starting Move .99...');
  const response = await runtimeMessage({
    type: 'startMove99Workflow',
    scanMode,
    saleEventStatus: saleEventDecision.status
  });
  if (!response?.ok || !response.started || !Number.isInteger(response.tabId)) {
    throw new Error(response?.error || 'Chrome did not verify the new Move .99 tab.');
  }
  setMessage(scanMode === 'non99'
    ? `Non-.99 cleanup started and verified in tab ${response.tabId}.`
    : `Move .99 started and verified in tab ${response.tabId}.`);
}

document.getElementById('openFeatureGuide').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') });
});

function queryChromeTabs(options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(options, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(tabs || []);
    });
  });
}

function sendChromeTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function createChromeTab(options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(options, (tab) => {
      const error = chrome.runtime.lastError;
      if (error || !tab) reject(new Error(error?.message || 'Chrome could not open the workflow tab.'));
      else resolve(tab);
    });
  });
}

function updateChromeTab(tabId, options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, options, (tab) => {
      const error = chrome.runtime.lastError;
      if (error || !tab) reject(new Error(error?.message || 'Chrome could not update the workflow tab.'));
      else resolve(tab);
    });
  });
}

async function startAmazonSubscribeSaveFromPopup() {
  let reservationToken = '';
  try {
    const stored = await storageGet([SUBSCRIBE_SAVE_STATE_KEY, 'computerLabel', 'amazonProfileLabel']);
    const pending = stored[SUBSCRIBE_SAVE_STATE_KEY];
    if (pending?.active && Number.isInteger(Number(pending.ownerTabId))) {
      const ownerTabId = Number(pending.ownerTabId);
      await updateChromeTab(ownerTabId, { active: true });
      try {
        await sendChromeTabMessage(ownerTabId, { type: 'runAmazonPageAction', action: 'subscribe-save-show-review' });
      } catch (_) {
        await updateChromeTab(ownerTabId, { url: SUBSCRIBE_SAVE_MANAGER_URL, active: true });
      }
      setMessage(`Subscribe & Save resumed in tab ${ownerTabId}.`);
      return;
    }

    reservationToken = await claimWorkflowStart('amazon-subscribe-save', 'Amazon Subscribe & Save');
    const tab = await createChromeTab({ url: 'about:blank', active: true });
    const startedAt = new Date().toISOString();
    await storageSet({
      [SUBSCRIBE_SAVE_STATE_KEY]: {
        active: true,
        phase: 'opening-manager',
        runId: globalThis.crypto?.randomUUID?.() || `subscribe-save-${Date.now()}`,
        ownerTabId: tab.id,
        computerLabel: String(stored.computerLabel || '').trim(),
        amazonProfileLabel: String(stored.amazonProfileLabel || '').trim(),
        targets: [],
        cancelledIds: [],
        failures: [],
        startedAt
      }
    });
    await releaseWorkflowStart(reservationToken);
    reservationToken = '';
    await updateChromeTab(tab.id, { url: SUBSCRIBE_SAVE_MANAGER_URL, active: true });
    setMessage('Opening the signed-in Amazon subscription manager for an exact read-only scan.');
  } catch (error) {
    setMessage(error.message || 'Could not start Subscribe & Save.', true);
  } finally {
    await releaseWorkflowStart(reservationToken);
  }
}

document.getElementById('openAmazonSubscribeSave').addEventListener('click', startAmazonSubscribeSaveFromPopup);

async function runEbayPageAction(action, label) {
  const tabs = await queryChromeTabs({ currentWindow: true });
  const ebayTabs = tabs
    .filter((tab) => /^https:\/\/([a-z0-9-]+\.)*ebay\.com\//i.test(String(tab.url || '')))
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  const target = ebayTabs[0];
  if (!Number.isInteger(target?.id)) {
    throw new Error('Open the signed-in eBay tab for this Chrome profile, then start the workflow again.');
  }
  if (action === 'prepare-order-note' && !/\/mesh\/ord\/details|\/sh\/ord\/details|\/ord\/details/i.test(String(target.url || ''))) {
    throw new Error('Prepare Order Note requires the matching eBay Order Details page. Open that order, then press the button again.');
  }
  setMessage(`Starting ${label} in the signed-in eBay tab...`);
  const response = await sendChromeTabMessage(target.id, { type: 'runEbayPageAction', action });
  if (!response?.ok || !response.accepted) {
    throw new Error(response?.error || `${label} was not accepted by the eBay tab.`);
  }
  await chrome.tabs.update(target.id, { active: true });
  setMessage(response.message || `${label} request accepted. Follow the visible review in the eBay tab; GLDN Ops will not finalize it without approval.`);
}

for (const button of document.querySelectorAll('[data-ebay-action]')) {
  button.addEventListener('click', async () => {
    const label = button.textContent.trim();
    button.disabled = true;
    try {
      await runEbayPageAction(button.dataset.ebayAction, label);
    } catch (error) {
      recordPopupLog(error.message || `Could not start ${label}.`, error.stack || '');
      setMessage(error.message || `Could not start ${label}.`, true);
    } finally {
      button.disabled = false;
    }
  });
}

document.getElementById('openFeatureTour').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});

document.getElementById('startSnipingWorkflow').addEventListener('click', async () => {
  let reservationToken = '';
  try {
    reservationToken = await claimWorkflowStart('amazon-sniping-start', 'Sniping workflow');
    await storageSet({
      gldnStopRequested: false,
      pendingAmazonSnipingWorkflowStart: { active: true, startedAt: Date.now() }
    });
    await releaseWorkflowStart(reservationToken);
    reservationToken = '';
    chrome.tabs.create({ url: 'https://www.amazon.com/gp/bestsellers' });
    setMessage('Sniping Workflow will start from the opened Amazon page if a product and price are visible.');
  } catch (error) {
    setMessage(error.message || 'Sniping workflow could not start.', true);
  } finally {
    await releaseWorkflowStart(reservationToken);
  }
});

document.getElementById('openEcomSniperCompetitorScanner').addEventListener('click', () => {
  openEcomSniperPage('competitorScanner', 'Opening EcomSniper Competitor Scanner...');
});

document.getElementById('prepareProductHunterClipboard').addEventListener('click', async () => {
  setMessage('Filtering and checking copied scanner titles...');
  try {
    const copied = await navigator.clipboard.readText();
    const filtered = FOUNDATION.filterBulkProductTitles(copied);
    if (!filtered.originalCount) throw new Error('Copy scanner titles first. The clipboard does not contain any titles.');
    if (!filtered.kept.length) throw new Error(`All ${filtered.originalCount} copied titles were excluded as apparel, shoes, costumes, or fashion accessories.`);

    if (!LISTING_PREFLIGHT) throw new Error('Listing Preflight did not load. No Product Hunter items were copied.');
    const ruleResponse = await fetch(chrome.runtime.getURL('listing-preflight-rules.json'), { cache: 'no-store' });
    if (!ruleResponse.ok) throw new Error(`Listing Preflight rules returned ${ruleResponse.status}.`);
    const rulePack = LISTING_PREFLIGHT.normalizeRulePack(await ruleResponse.json());
    const preflightResults = LISTING_PREFLIGHT.evaluateRows(
      LISTING_PREFLIGHT.parseInputRows(filtered.kept.join('\n')),
      rulePack
    );
    const preflightSummary = LISTING_PREFLIGHT.summarizeResults(preflightResults);
    const report = {
      preparedAt: new Date().toISOString(),
      originalCount: filtered.originalCount,
      keptCount: filtered.kept.length,
      excludedCount: filtered.excluded.length,
      duplicatesRemoved: filtered.duplicatesRemoved,
      ruleCount: rulePack.ruleCount,
      preflightReadyCount: preflightSummary.clear,
      preflightReviewCount: preflightSummary.review,
      preflightBlockCount: preflightSummary.block,
      excludedTitles: [...filtered.excluded],
      keptTitles: [...filtered.kept],
      preflightResults
    };
    await storageSet({ lastProductHunterClipboardPrep: report });
    renderProductHunterClipboardReport(report);
    if (preflightSummary.review || preflightSummary.block) {
      await storageSet({
        pendingListingPreflightInput: {
          input: filtered.kept.join('\n'),
          originalCount: filtered.originalCount,
          preparedAt: report.preparedAt,
          source: 'product-hunter-clipboard'
        }
      });
      chrome.tabs.create({ url: chrome.runtime.getURL('listing-preflight.html') });
      setMessage(`Preflight stopped the handoff: ${preflightSummary.review} need review and ${preflightSummary.block} are blocked. Product Hunter was not opened.`);
      return;
    }

    const readyPayload = LISTING_PREFLIGHT.copyPayload(preflightResults, 'clear');
    await navigator.clipboard.writeText(readyPayload);
    await openEcomSniperPage('productHunter', 'Opening EcomSniper Product Hunter...');
    setMessage(`Copied ${preflightSummary.clear} ready Product Hunter titles. ${report.excludedCount} category exclusions were removed.`);
  } catch (error) {
    recordPopupLog(error.message || 'Could not prepare Product Hunter titles.', error.stack || '');
    setMessage(error.message || 'Could not prepare Product Hunter titles.', true);
  }
});

document.getElementById('openEcomSniperProductHunter').addEventListener('click', () => {
  openEcomSniperPage('productHunter', 'Opening EcomSniper Product Hunter...');
});

document.getElementById('preflightBulkPosterClipboard').addEventListener('click', async () => {
  setMessage('Loading copied Amazon links into Listing Preflight...');
  try {
    if (!LISTING_PREFLIGHT) throw new Error('Listing Preflight did not load. No links were changed.');
    const copied = await navigator.clipboard.readText();
    const rows = LISTING_PREFLIGHT.parseInputRows(copied);
    const candidates = rows.filter((row) => row.amazonUrls.length || row.asins.length);
    if (!rows.length) throw new Error('Copy Product Hunter Amazon links first. The clipboard is empty.');
    if (!candidates.length) throw new Error('The clipboard does not contain any Amazon product links or ASINs.');
    await storageSet({
      pendingListingPreflightInput: {
        input: candidates.map((row) => row.input).join('\n'),
        originalCount: rows.length,
        candidateCount: candidates.length,
        rejectedCount: rows.length - candidates.length,
        preparedAt: new Date().toISOString(),
        source: 'bulk-poster-clipboard',
        copyMode: 'amazon-links',
        targetPage: 'bulkPoster'
      }
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('listing-preflight.html') });
    setMessage(`Opened preflight for ${candidates.length} Amazon link${candidates.length === 1 ? '' : 's'}. Review and Block rows will not be copied to Bulk Poster.`);
  } catch (error) {
    recordPopupLog(error.message || 'Could not preflight Bulk Poster links.', error.stack || '');
    setMessage(error.message || 'Could not preflight Bulk Poster links.', true);
  }
});

document.getElementById('openPoshmarkStats').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://poshmark.com/users/self/closet_stats' });
});

document.getElementById('openPoshmarkOrders').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://poshmark.com/order/sales' });
});

function formatPoshmarkBackfillStatus(summary) {
  if (!summary) return 'Historical profit: no checkpoint';
  const label = summary.scope === 'resolve-ebay' ? 'eBay Amazon costs' : 'Historical profit';
  const profile = String(summary.supplierProfile || '').trim();
  const profileText = profile ? ` | profile ${profile}` : '';
  const pendingText = Number.isFinite(Number(summary.pending)) ? ` | ${Number(summary.pending)} pending` : '';
  return `${label}: ${summary.phase}${profileText} | ${summary.salesIndexed} orders | ${summary.detailsCaptured} details | ${summary.exact} exact | ${summary.needsReview} review | ${summary.synced} synced${pendingText}`;
}

async function refreshPoshmarkBackfillStatus() {
  const response = await runtimeMessage({ type: 'getPoshmarkProfitBackfill' });
  const element = document.getElementById('poshmarkBackfillStatus');
  const ebayElement = document.getElementById('ebayCostResolutionStatus');
  const status = response?.ok ? formatPoshmarkBackfillStatus(response.summary) : response?.error || 'Profit status unavailable.';
  if (element) element.textContent = status;
  if (ebayElement) ebayElement.textContent = response?.summary?.scope === 'resolve-ebay'
    ? status
    : 'Independent Amazon-cost matching: no active eBay checkpoint';
  return response;
}

document.getElementById('resolveEbayCosts').addEventListener('click', async () => {
  const monthKey = document.getElementById('ebayCostResolutionMonth').value;
  if (!monthKey) {
    setMessage('Choose the eBay profit month first.', true);
    return;
  }
  const profileSettings = await storageGet(['amazonProfileLabel']);
  if (!String(profileSettings.amazonProfileLabel || '').trim()) {
    setMessage('Set this Amazon profile name in Setup before resolving eBay costs.', true);
    return;
  }
  setMessage('Loading the shared eBay Amazon-cost queue...');
  const response = await runtimeMessage({
    type: 'startPoshmarkProfitBackfill',
    options: { scope: 'resolve-ebay', monthKey, maxOrders: 100 }
  });
  setMessage(response?.ok
    ? 'eBay Amazon-cost resolver started in one background Amazon tab.'
    : response?.error || 'Could not start the eBay Amazon-cost resolver.', !response?.ok);
  await refreshPoshmarkBackfillStatus();
});

document.getElementById('startPoshmarkBackfill').addEventListener('click', async () => {
  const scope = document.getElementById('poshmarkBackfillScope').value;
  const monthKey = document.getElementById('poshmarkBackfillMonth').value;
  setMessage(`Starting ${scope} historical Poshmark profit worker...`);
  const response = await runtimeMessage({ type: 'startPoshmarkProfitBackfill', options: { scope, ...(scope === 'month' ? { monthKey } : {}) } });
  setMessage(response?.ok ? 'Historical-profit worker started in one background tab.' : response?.error || 'Could not start historical-profit worker.', !response?.ok);
  await refreshPoshmarkBackfillStatus();
});

document.getElementById('resolvePoshmarkCosts').addEventListener('click', async () => {
  const monthKey = document.getElementById('poshmarkBackfillMonth').value;
  const profileSettings = await storageGet(['amazonProfileLabel']);
  if (!String(profileSettings.amazonProfileLabel || '').trim()) {
    setMessage('Set this Amazon profile name in Setup before resolving Poshmark costs.', true);
    return;
  }
  setMessage('Loading the shared missing-Amazon-cost queue...');
  const response = await runtimeMessage({
    type: 'startPoshmarkProfitBackfill',
    options: { scope: 'resolve-missing', monthKey, maxOrders: 100 }
  });
  setMessage(response?.ok
    ? 'Missing-cost resolver started in one background Amazon tab.'
    : response?.error || 'Could not start the missing-cost resolver.', !response?.ok);
  await refreshPoshmarkBackfillStatus();
});

document.getElementById('resumePoshmarkBackfill').addEventListener('click', async () => {
  const response = await runtimeMessage({ type: 'resumePoshmarkProfitBackfill' });
  setMessage(response?.ok ? `Historical-profit checkpoint is ${response.summary.phase}.` : response?.error || 'No checkpoint found.', !response?.ok);
  await refreshPoshmarkBackfillStatus();
});

document.getElementById('stopPoshmarkBackfill').addEventListener('click', async () => {
  const response = await runtimeMessage({ type: 'stopPoshmarkProfitBackfill' });
  setMessage(response?.ok ? response.message : response?.error || 'Could not pause the historical-profit worker.', !response?.ok);
  await refreshPoshmarkBackfillStatus();
});

async function openEcomSniperPage(page, workingMessage) {
  setMessage(workingMessage);
  try {
    const response = await runtimeMessage({ type: 'openEcomSniperPage', page });
    if (!response?.ok) throw new Error(response?.error || 'Could not open EcomSniper.');
    setMessage(`Opened ${response.extension?.name || 'EcomSniper'}.`);
  } catch (error) {
    recordPopupLog(error.message || 'Could not open EcomSniper.', error.stack || '');
    setMessage(error.message || 'Could not open EcomSniper.', true);
  }
}

document.getElementById('refreshEcomSniperMonitor').addEventListener('click', () => {
  refresh();
  setMessage('EcomSniper handoff status refreshed. Only GLDN-observable state is reported.');
});

document.getElementById('stopEcomSniperAssist').addEventListener('click', async () => {
  const response = await runtimeMessage({ type: 'stopEcomSniperHandoff' });
  setMessage(response?.ok ? response.message : response?.error || 'The EcomSniper handoff could not be stopped.', !response?.ok);
  await refresh();
});

async function saveLimits() {
  const storePlan = storePlanInput.value;
  const freeFixedPriceLimit = STORE_PLAN_LIMITS[storePlan] ?? numberOrNull(freeListingsInput.value);
  const monthlySellerDollarLimit = monthlyDollarPresetInput.value === 'custom'
    ? numberOrNull(monthlyDollarInput.value)
    : numberOrNull(monthlyDollarPresetInput.value);
  const { computerLabel, ebayAccountLabel } = selectedComputerAccount();

  if (!storePlan) {
    setMessage('Choose the Store subscription.', true);
    return;
  }
  if (freeFixedPriceLimit == null || monthlySellerDollarLimit == null) {
    setMessage('Enter the custom Store allowance or dollar limit.', true);
    return;
  }
  if (!computerLabel || !ebayAccountLabel) {
    setMessage('This computer is Poshmark-only. Listing limit checks require an eBay computer.', true);
    return;
  }

  chrome.storage.local.set({ storePlan, freeFixedPriceLimit, monthlySellerDollarLimit }, () => {
    setMessage('Limit settings saved. Use Confirm Listings Under Limit on eBay to scan and confirm the current month.');
    refresh();
  });
}

async function openListingsCheck() {
  let reservationToken = '';
  try {
    reservationToken = await claimWorkflowStart('listing-limits', 'Listing limit check');
    await storageSet({ pendingReviewMonthlyLimits: { active: true, phase: 'active-listings', startedAt: new Date().toISOString() } });
    await releaseWorkflowStart(reservationToken);
    reservationToken = '';
    chrome.tabs.create({ url: 'https://www.ebay.com/sh/lst/active' });
  } catch (error) {
    setMessage(error.message || 'Listing limit check could not start.', true);
  } finally {
    await releaseWorkflowStart(reservationToken);
  }
}

document.getElementById('saveLimits').addEventListener('click', saveLimits);
document.getElementById('confirmLimits').addEventListener('click', openListingsCheck);
document.getElementById('openLimitsPage').addEventListener('click', openListingsCheck);

document.getElementById('saveAmazon').addEventListener('click', () => {
  const amazonProfileLabel = amazonInput.value.trim();
  if (!amazonProfileLabel) {
    setMessage('Enter an Amazon profile name first.', true);
    return;
  }
  chrome.storage.local.set({ amazonProfileLabel }, () => {
    document.getElementById('currentAmazon').textContent = amazonProfileLabel;
    setMessage('Amazon profile saved.');
  });
});

document.getElementById('clearAmazon').addEventListener('click', () => {
  chrome.storage.local.remove(['amazonProfileLabel'], () => {
    amazonInput.value = '';
    document.getElementById('currentAmazon').textContent = 'Not set';
    setMessage('Saved Amazon profile cleared.');
  });
});


uiThemeInput.addEventListener('change', () => {
  const theme = applyPopupTheme(uiThemeInput.value);
  chrome.storage.local.set({ gldnUiTheme: theme });
});

uiOpacityInput.addEventListener('input', () => {
  const value = Number(uiOpacityInput.value || 75);
  uiOpacityValue.textContent = `${value}%`;
  chrome.storage.local.set({ gldnUiOpacity: value });
});

document.getElementById('stopCurrentTask').addEventListener('click', () => {
  chrome.storage.local.set({ gldnStopRequested: true }, () => {
    setMessage('Stop requested. The current task will stop at the next safe checkpoint.');
  });
});

document.getElementById('resetAutomation').addEventListener('click', async () => {
  setMessage('Resetting every GLDN workflow and worker...');
  try {
    const response = await runtimeMessage({ type: 'resetAutomationState' });
    if (!response?.ok) throw new Error(response?.error || 'Reset request failed.');
    setMessage('Automation state reset. Marketplace panels are ready for a new task.');
  } catch (error) {
    setMessage(error?.message || 'Automation reset failed.', true);
  }
});

function reviewCheckpointReloadIsSafe(stored, workflows) {
  if (!Array.isArray(workflows) || workflows.length < 1) return false;
  const durableReviews = workflows.filter((entry) => (
    ['ebayMonthlyProfit', 'poshmarkProfitBackfill'].includes(entry.key)
      && entry.phase === 'review'
  ));
  const openReviews = workflows.filter((entry) => (
    String(entry.key || '').startsWith('gldnOpenReviews:')
      && entry.phase === 'review-open'
  ));
  if (durableReviews.length < 1 || durableReviews.length + openReviews.length !== workflows.length) return false;
  if (!openReviews.length) return true;

  const checkpoint = stored?.poshmarkProfitBackfill;
  if (!checkpoint || checkpoint.active === true || checkpoint.phase !== 'review') return false;
  const workerTabId = Number(checkpoint.workerTabId || 0);
  if (!Number.isInteger(workerTabId) || workerTabId <= 0) return false;
  const liveReviews = Object.entries(stored?.gldnOpenReviews || {}).filter(([, review]) => (
    review?.active === true
      && review?.phase === 'review-open'
      && Number(review?.expiresAt || 0) > Date.now()
  ));
  if (liveReviews.length !== openReviews.length || liveReviews.length !== 1) return false;
  const expectedHost = checkpoint.scope === 'resolve-ebay' ? 'amazon.com' : 'poshmark.com';
  return liveReviews.every(([, review]) => {
    if (Number(review?.ownerTabId || 0) !== workerTabId) return false;
    try {
      const host = new URL(String(review?.page || '')).hostname.toLowerCase();
      return host === expectedHost || host.endsWith(`.${expectedHost}`);
    } catch (_) {
      return false;
    }
  });
}

async function autoRecoverBlockedReviewCheckpointReload() {
  const markerKey = 'gldnReviewCheckpointReloadRecovery';
  const keys = [...new Set([
    ...globalThis.GLDN_FOUNDATION.workflowStateKeys,
    'gldnErrorLog',
    markerKey
  ])];
  const stored = await storageGet(keys);
  const latestError = Array.isArray(stored.gldnErrorLog)
    ? stored.gldnErrorLog.find((entry) => (
      entry?.source === 'popup'
        && entry?.level === 'error'
        && String(entry?.message || '').startsWith('Reloading GLDN Ops is blocked while ')
        && String(entry?.message || '').includes('approval/review open')
    ))
    : null;
  if (!latestError) return false;

  const errorAt = Date.parse(String(latestError.at || ''));
  if (!Number.isFinite(errorAt) || Date.now() - errorAt > 20 * 60 * 1000) return false;
  const workflows = globalThis.GLDN_FOUNDATION.activeWorkflowEntries(stored);
  if (!reviewCheckpointReloadIsSafe(stored, workflows)) return false;

  const checkpoint = stored.poshmarkProfitBackfill || stored.ebayMonthlyProfit || {};
  const marker = stored[markerKey];
  if (String(marker?.errorAt || '') === String(latestError.at || '')
      && String(marker?.runId || '') === String(checkpoint.runId || '')) return false;

  await storageSet({
    [markerKey]: {
      errorAt: String(latestError.at || ''),
      runId: String(checkpoint.runId || ''),
      version: EXTENSION_VERSION,
      recoveredAt: new Date().toISOString()
    },
    lastExtensionReloadRequest: {
      at: new Date().toISOString(),
      version: EXTENSION_VERSION,
      targetVersion: EXTENSION_VERSION,
      reason: 'review-checkpoint-auto-recovery',
      pending: false,
      checkpointPreserved: true
    }
  });
  chrome.runtime.reload();
  return true;
}

document.getElementById('reloadExtension').addEventListener('click', async () => {
  const version = chrome.runtime.getManifest().version;
  setMessage(`Reloading GLDN Ops v${version}...`);
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await runtimeMessage({
      type: 'reloadExtension',
      sourceTabId: activeTab?.id,
      returnUrl: activeTab?.url || ''
    });
    if (!response?.ok) {
      const stored = await storageGet(globalThis.GLDN_FOUNDATION.workflowStateKeys);
      const workflows = globalThis.GLDN_FOUNDATION.activeWorkflowEntries(stored);
      const reviewOnly = reviewCheckpointReloadIsSafe(stored, workflows);
      if (!reviewOnly) throw new Error(response?.error || 'Reload request failed.');
      await storageSet({
        lastExtensionReloadRequest: {
          at: new Date().toISOString(),
          version: EXTENSION_VERSION,
          targetVersion: EXTENSION_VERSION,
          reason: 'review-checkpoint-reload',
          pending: false,
          returnUrl: activeTab?.url || '',
          sourceTabId: activeTab?.id ?? null,
          sourceTabUrl: activeTab?.url || '',
          checkpointPreserved: true
        }
      });
      chrome.runtime.reload();
      return;
    }
    setMessage('Reload requested. Only the current tab will refresh; other tabs stay untouched.');
  } catch (error) {
    recordPopupLog(error.message || 'Reload request failed.', error.stack || '');
    setMessage(error.message || 'Reload request failed.', true);
  }
});

document.getElementById('updateExtension').addEventListener('click', async () => {
  updateExtensionButton.disabled = true;
  setMessage('Downloading and verifying the latest stable GLDN Ops release...');
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await runtimeMessage({
      type: 'updateExtension',
      sourceTabId: activeTab?.id,
      returnUrl: activeTab?.url || '',
      reloadWhenCurrent: true
    });
    if (!response?.ok) throw new Error(response?.error || 'Verified update failed.');
    if (response.reloading) {
      setMessage(`Verified files v${response.currentVersion || response.diskVersion}. Reloading running v${response.runtimeVersion || EXTENSION_VERSION}...`);
    } else {
      setMessage(response.message || 'GLDN Ops is already current.');
      updateExtensionButton.disabled = false;
      refreshUpdaterStatus({ refresh: true });
    }
  } catch (error) {
    recordPopupLog(error.message || 'Verified update failed.', error.stack || '');
    setMessage(error.message || 'Verified update failed.', true);
    updateExtensionButton.disabled = false;
    refreshUpdaterStatus();
  }
});

document.getElementById('rollbackExtension').addEventListener('click', async () => {
  const snapshotId = rollbackVersionInput.value;
  if (!snapshotId) {
    setMessage('No rollback version is available yet.', true);
    return;
  }
  rollbackExtensionButton.disabled = true;
  setMessage('Restoring the selected verified backup...');
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await runtimeMessage({
      type: 'rollbackExtension',
      snapshotId,
      sourceTabId: activeTab?.id,
      returnUrl: activeTab?.url || ''
    });
    if (!response?.ok) throw new Error(response?.error || 'Rollback failed.');
    setMessage(`Restored v${response.currentVersion}. Reloading GLDN Ops...`);
  } catch (error) {
    recordPopupLog(error.message || 'Rollback failed.', error.stack || '');
    setMessage(error.message || 'Rollback failed.', true);
    rollbackExtensionButton.disabled = false;
    refreshUpdaterStatus();
  }
});

document.getElementById('copyErrorLog').addEventListener('click', async () => {
  chrome.storage.local.get(['gldnErrorLog'], async (result) => {
    const entries = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
    if (!entries.length) {
      setMessage('No error log to copy.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(entries.map(formatDiagnosticEntry).join('\n\n---\n\n'));
      setMessage('Error log copied.');
    } catch (error) {
      recordPopupLog(error.message || 'Could not copy error log.', error.stack || '');
      setMessage('Could not copy error log.', true);
    }
  });
});

document.getElementById('copyDiagnosticReport').addEventListener('click', async () => {
  setMessage('Building diagnostic report...');
  try {
    const report = await buildDiagnosticReport();
    await copyTextToClipboard(JSON.stringify(report, null, 2));
    diagnosticLogElement.classList.remove('diagnostic-empty');
    diagnosticLogElement.textContent = [
      `Diagnostic report copied for GLDN Ops v${report.extension.version}.`,
      `Computer: ${report.identity.normalizedComputer || 'not set'}`,
      `Dashboard: ${report.dashboard.health?.ok ? 'OK' : 'CHECK'}`,
      `Click mode: ${report.clickMode}`,
      `Errors included: ${report.errorLog.length}`
    ].join('\n');
    setMessage('Full diagnostic report copied.');
  } catch (error) {
    recordPopupLog(error.message || 'Could not copy diagnostic report.', error.stack || '');
    setMessage(error.message || 'Could not copy diagnostic report.', true);
  }
});

document.getElementById('copySettingsBackup').addEventListener('click', async () => {
  setMessage('Copying settings backup...');
  try {
    const values = await storageGet(SETTINGS_BACKUP_KEYS);
    const backup = buildSettingsBackup(values);
    await copyTextToClipboard(JSON.stringify(backup, null, 2));
    setMessage('Settings backup copied.');
  } catch (error) {
    recordPopupLog(error.message || 'Could not copy settings backup.', error.stack || '');
    setMessage(error.message || 'Could not copy settings backup.', true);
  }
});

document.getElementById('restoreSettingsBackup').addEventListener('click', async () => {
  setMessage('Reading settings backup from clipboard...');
  try {
    const text = await navigator.clipboard.readText();
    const settings = parseSettingsBackup(text);
    await storageSet(settings);
    refresh();
    setMessage(`Restored ${Object.keys(settings).length} GLDN Ops setting(s).`);
  } catch (error) {
    recordPopupLog(error.message || 'Could not restore settings backup.', error.stack || '');
    setMessage(error.message || 'Could not restore settings backup.', true);
  }
});

document.getElementById('runHealthCheck').addEventListener('click', async () => {
  setMessage('Running feature health check...');
  try {
    const response = await runtimeMessage({ type: 'extensionHealthCheck' });
    renderFeatureHealth(response);
    setMessage(response?.ok ? 'Feature health check complete.' : 'Feature health check found issues.', !response?.ok);
  } catch (error) {
    recordPopupLog(error.message || 'Feature health check failed.', error.stack || '');
    setMessage(error.message || 'Feature health check failed.', true);
  }
});

document.getElementById('retryDashboardQueue').addEventListener('click', async () => {
  setMessage('Retrying queued dashboard records...');
  try {
    const response = await runtimeMessage({ type: 'retryDashboardQueue' });
    if (!response?.ok) throw new Error(response?.error || 'Dashboard retry failed.');
    setMessage(`Dashboard retry complete: ${response.processed || 0} sent, ${response.remaining || 0} remaining.`);
    refresh();
  } catch (error) {
    recordPopupLog(error.message || 'Dashboard retry failed.', error.stack || '');
    setMessage(error.message || 'Dashboard retry failed.', true);
  }
});

document.getElementById('clearErrorLog').addEventListener('click', () => {
  chrome.storage.local.remove(['gldnErrorLog'], () => {
    renderDiagnostics([]);
    setMessage('Error log cleared.');
  });
});

document.getElementById('testDashboard').addEventListener('click', async () => {
  setMessage('Testing dashboard connection...');
  try {
    const response = await runtimeMessage({ type: 'testDashboard' });
    if (!response?.ok) throw new Error(response?.error || 'Connection failed.');
    setMessage('Dashboard connection works.');
    refresh();
  } catch (error) {
    setMessage(error.message || 'Connection failed.', true);
    refresh();
  }
});

async function ensureAutomaticDashboardSetup({ announce = false } = {}) {
  if (dashboardAutoSetupElement) dashboardAutoSetupElement.textContent = 'Checking dashboard connection...';
  try {
    const response = await runtimeMessage({ type: 'seedDashboardSetupFromLocalConfig' });
    if (!response?.ok) throw new Error(response?.error || 'Automatic dashboard setup failed.');
    if (dashboardAutoSetupElement) {
      dashboardAutoSetupElement.textContent = response.changed
        ? 'Dashboard connection restored from this computer.'
        : 'Dashboard setup code is saved in this Chrome profile.';
    }
    if (announce) setMessage('Dashboard connection is ready.');
    return true;
  } catch (error) {
    if (dashboardAutoSetupElement) {
      dashboardAutoSetupElement.textContent = 'Not connected. Choose Connect Dashboard once for this Chrome profile.';
    }
    if (announce) setMessage(error.message || 'Dashboard setup is missing.', true);
    return false;
  }
}

document.getElementById('repairDashboardSetup').addEventListener('click', async () => {
  const saved = await U.promptAndSaveDashboardSetup();
  if (!saved?.ok) {
    setMessage(saved?.error || 'Dashboard setup was not saved.', true);
    return;
  }
  setMessage('Testing the saved dashboard connection...');
  const tested = await runtimeMessage({ type: 'testDashboard' });
  if (!tested?.ok) {
    setMessage(tested?.error || 'The dashboard rejected that setup code.', true);
    return;
  }
  if (dashboardAutoSetupElement) dashboardAutoSetupElement.textContent = 'Dashboard connection ready.';
  setMessage('Dashboard connected securely.');
  refresh();
});

document.getElementById('openDashboard').addEventListener('click', async () => {
  try {
    const response = await runtimeMessage({ type: 'openDashboard' });
    if (!response?.ok) throw new Error(response?.error || 'Dashboard could not open.');
    setMessage('Dashboard opened.');
  } catch (error) {
    setMessage(error.message || 'Dashboard could not open.', true);
  }
});

document.getElementById('currentVersion').textContent = `v${chrome.runtime.getManifest().version}`;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.gldnErrorLog) renderDiagnostics(changes.gldnErrorLog.newValue);
  if (changes.ecomSniperHandoffStatus) refresh();
  if (changes.poshmarkProfitBackfill) refreshPoshmarkBackfillStatus();
});

function getChromeTab(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId) || tabId <= 0) {
      resolve(null);
      return;
    }
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
  });
}

function keepChromeTabAlive(tabId) {
  return new Promise((resolve) => {
    if (!Number.isInteger(tabId) || tabId <= 0) {
      resolve(false);
      return;
    }
    chrome.tabs.update(tabId, { autoDiscardable: false }, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(tab));
    });
  });
}

async function autoResumeDiscardedPoshmarkWorker() {
  const stored = await storageGet(['poshmarkProfitBackfill', 'gldnPoshmarkBackfillAutoHeal']);
  let checkpoint = stored.poshmarkProfitBackfill;
  const falseEmptyMonth = checkpoint?.scope === 'month'
    && !(checkpoint.sales || []).length
    && checkpoint.phase === 'paused'
    && checkpoint.resumePhase === 'capture-posh-details'
    && /No .+ sales were verified before Poshmark reported the end of the list/i.test(String(checkpoint.pausedReason || ''));
  if (falseEmptyMonth) {
    checkpoint = {
      ...checkpoint,
      currentPage: 1,
      pagesScanned: 0,
      pageFingerprints: [],
      emptySalesPageAttempts: 0,
      lastListUrl: '',
      resumePhase: 'index-sales',
      pausedReason: 'Restarting the read-only month index after the worker tab was recreated.',
      indexRestartedAt: new Date().toISOString(),
      indexRestartReason: 'false-empty-month'
    };
    await new Promise((resolve, reject) => chrome.storage.local.set({ poshmarkProfitBackfill: checkpoint }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(true);
    }));
  }
  if ((!checkpoint?.active && !falseEmptyMonth)
      || !['index-sales', 'capture-posh-details', 'amazon-search', 'amazon-detail', 'paused'].includes(String(checkpoint.phase || ''))) return false;

  const workerTabId = Number(checkpoint.workerTabId || 0);
  const worker = await getChromeTab(workerTabId);
  const workerNeedsWake = !worker || worker.discarded === true || worker.status === 'unloaded';
  if (!falseEmptyMonth && !workerNeedsWake) {
    await keepChromeTabAlive(workerTabId);
    return false;
  }

  const prior = stored.gldnPoshmarkBackfillAutoHeal;
  const attemptedAt = Date.parse(String(prior?.attemptedAt || ''));
  const sameAttempt = String(prior?.runId || '') === String(checkpoint.runId || '')
    && Number(prior?.workerTabId || 0) === workerTabId;
  if (sameAttempt && Number.isFinite(attemptedAt) && Date.now() - attemptedAt < 120000) return false;

  await new Promise((resolve) => chrome.storage.local.set({
    gldnPoshmarkBackfillAutoHeal: {
      runId: String(checkpoint.runId || ''),
      workerTabId,
      attemptedAt: new Date().toISOString()
    }
  }, resolve));
  const response = await runtimeMessage({ type: 'resumePoshmarkProfitBackfill' }, 60000);
  if (!response?.ok) throw new Error(response?.error || 'The saved Poshmark checkpoint did not resume.');
  await keepChromeTabAlive(Number(response?.state?.workerTabId || checkpoint.workerTabId || 0));
  setMessage(`Recovered Poshmark checkpoint: ${response.summary?.phase || checkpoint.phase}.`);
  return true;
}

async function initializePopup() {
  try {
    if (await autoRecoverBlockedReviewCheckpointReload()) return;
  } catch (error) {
    recordPopupLog(error?.message || 'The blocked review reload could not recover automatically.', error?.stack || '');
  }
  await ensureAutomaticDashboardSetup();
  const ebayCostMonth = document.getElementById('ebayCostResolutionMonth');
  if (ebayCostMonth && !ebayCostMonth.value) {
    const now = new Date();
    const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    ebayCostMonth.value = `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}`;
  }
  try {
    await autoResumeDiscardedPoshmarkWorker();
  } catch (error) {
    setMessage(error?.message || 'The saved Poshmark checkpoint could not resume.', true);
  }
  refresh();
  refreshUpdaterStatus({ refresh: true });
  refreshPoshmarkBackfillStatus();
}

initializePopup();
