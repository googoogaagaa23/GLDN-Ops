const statusElement = document.getElementById('status');

const FOUNDATION = globalThis.GLDN_FOUNDATION;
const COMPUTER_ACCOUNT_MAP = FOUNDATION.computerAccounts;
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

function normalizeEbayAccount(value) {
  return FOUNDATION.normalizeEbayAccount(value);
}

function normalizeComputer(value) {
  return FOUNDATION.normalizeComputer(value);
}

function accountForComputer(value) {
  const computer = normalizeComputer(value);
  return COMPUTER_ACCOUNT_MAP[computer] || {};
}

function asArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function buildMove99ActiveUrl(sourceStoreCategoryIds) {
  const ids = asArray(sourceStoreCategoryIds);
  if (!ids.length) return 'https://www.ebay.com/sh/lst/active';
  const url = new URL('https://www.ebay.com/sh/lst/active');
  url.searchParams.set('storeCatIds', ids.join(','));
  url.searchParams.set('source', 'filterpanel');
  url.searchParams.set('action', 'search');
  return url.toString();
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(values) {
  const payload = { ...values };
  if (payload.pendingMove99Run && typeof payload.pendingMove99Run === 'object') {
    payload.pendingMove99Run = {
      ...payload.pendingMove99Run,
      extensionVersion: EXTENSION_VERSION,
      stateUpdatedAt: new Date().toISOString()
    };
  }
  return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (tab) => {
      const error = chrome.runtime.lastError?.message;
      if (error || !Number.isInteger(tab?.id)) {
        reject(new Error(error || 'Chrome did not return the new eBay tab.'));
        return;
      }
      resolve(tab);
    });
  });
}

function createRunId() {
  return globalThis.crypto?.randomUUID?.() || `move99-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function configuredAccount(account) {
  const configured = globalThis.GLDN_CONFIG?.move99Accounts;
  if (!configured || typeof configured !== 'object') return {};
  return configured[account] || configured[account.toLowerCase()] || {};
}

async function start() {
  const params = new URLSearchParams(location.search);
  const scanMode = params.get('mode') === 'non99' ? 'non99' : 'price99';
  const stored = await getStorage(['computerLabel', 'ebayAccountLabel', 'move99AccountSettings']);
  const mapped = accountForComputer(stored.computerLabel);
  if (!mapped.ebayAccountLabel) {
    if (mapped.poshmarkOnly) throw new Error('Computer 7 is Poshmark-only. Move .99 is disabled for it.');
    throw new Error('Choose and save this computer in GLDN Ops before starting Move .99.');
  }
  const account = normalizeEbayAccount(mapped.ebayAccountLabel || stored.ebayAccountLabel);
  const saved = stored.move99AccountSettings?.[account] || {};
  const settings = FOUNDATION.move99SettingsForAccount(account, saved);
  const validation = FOUNDATION.validateMove99Settings(settings);
  if (!validation.ok) throw new Error(validation.errors[0] || 'Move .99 categories are not configured.');
  Object.assign(settings, validation.settings);

  const sourceCategories = scanMode === 'non99' ? [settings.destinationCategory] : settings.sourceCategories;
  const destinationCategory = scanMode === 'non99' ? settings.sourceCategories[0] : settings.destinationCategory;
  const sourceStoreCategoryIds = scanMode === 'non99' ? [] : settings.sourceStoreCategoryIds;
  const activeUrl = buildMove99ActiveUrl(sourceStoreCategoryIds);
  await setStorage({ gldnStopRequested: false, pendingMove99Run: null });
  const runTab = await createTab(activeUrl);
  const startedAt = new Date().toISOString();
  const runId = createRunId();
  await setStorage({
    gldnStopRequested: false,
    pendingMove99Run: {
      active: true,
      confirmed: true,
      runId,
      ownerTabId: runTab.id,
      scanStrategy: 'active-page-exact-id-v1',
      phase: 'active-prepare',
      scanMode,
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
      backburnerItemIds: settings.backburnerItemIds
    }
  });

  statusElement.textContent = `Started ${scanMode === 'non99' ? 'Non-.99 cleanup' : 'Move .99'} for ${account}.\nOpening ${activeUrl}`;
}

start().catch((error) => {
  statusElement.textContent = error.message || String(error);
});
