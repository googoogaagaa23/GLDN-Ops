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
  const response = await chrome.runtime.sendMessage({ type: 'startMove99Workflow', scanMode });
  if (!response?.ok || !response.started || !Number.isInteger(response.tabId)) {
    throw new Error(response?.error || 'Chrome did not verify the new Move .99 tab.');
  }
  statusElement.textContent = `Started ${scanMode === 'non99' ? 'Non-.99 cleanup' : 'Move .99'} for ${response.account}.\nVerified tab ${response.tabId}.`;
}

start().catch((error) => {
  statusElement.textContent = error.message || String(error);
});
