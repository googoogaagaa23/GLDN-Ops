importScripts('config.js');

const DASHBOARD_URL_KEY = 'sellerDashboardUrl';
const DASHBOARD_SECRET_KEY = 'sellerDashboardKey';

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function recordExtensionLog(entry) {
  const payload = {
    at: new Date().toISOString(),
    source: entry?.source || 'background',
    level: entry?.level || 'error',
    message: String(entry?.message || 'Unknown extension issue').slice(0, 800),
    detail: String(entry?.detail || '').slice(0, 1200),
    page: entry?.page || '',
    version: chrome.runtime.getManifest().version
  };
  chrome.storage.local.get(['gldnErrorLog'], (result) => {
    const current = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
    chrome.storage.local.set({ gldnErrorLog: [payload, ...current].slice(0, 80) });
  });
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
  const url = cleanWebAppUrl(config.dashboardUrl);
  const key = String(config.dashboardKey || '').trim();
  if (!url || !key) {
    throw new Error('The built-in shared dashboard connection is missing from config.js.');
  }
  return { url, key };
}

async function postToDashboard(action, record = null) {
  const { url, key } = await getDashboardConfig();
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      key,
      record,
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

async function handleSync(action, record, successMessage) {
  try {
    const data = await postToDashboard(action, record);
    await storageSet({
      lastDashboardSync: {
        ok: true,
        at: new Date().toISOString(),
        computerLabel: record?.computerLabel || '',
        ebayAccountLabel: record?.ebayAccountLabel || '',
        message: data.message || successMessage
      }
    });
    return { ok: true, data };
  } catch (error) {
    recordExtensionLog({ source: 'background-sync', message: error.message, detail: action });
    await storageSet({ lastDashboardSync: { ok: false, at: new Date().toISOString(), error: error.message } });
    return { ok: false, error: error.message };
  }
}

async function localClick(record = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch('http://127.0.0.1:18765/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Local click helper failed (${response.status}).`);
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'Local click helper timed out.' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function localHelperHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch('http://127.0.0.1:18765/health', { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && data.ok), data };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'Local helper timed out.' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}


chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['gldnUiOpacity', 'gldnUiTheme'], (result) => {
    const updates = {};
    if (!Number.isFinite(Number(result.gldnUiOpacity))) {
      updates.gldnUiOpacity = Number(globalThis.GLDN_CONFIG?.defaultUiOpacity || 75);
    }
    if (!['light', 'dark'].includes(String(result.gldnUiTheme || '').toLowerCase())) {
      updates.gldnUiTheme = String(globalThis.GLDN_CONFIG?.defaultUiTheme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
    }
    if (Object.keys(updates).length) chrome.storage.local.set(updates);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'reloadExtension') {
    recordExtensionLog({ source: 'background', level: 'info', message: 'Extension reload requested.' });
    sendResponse({ ok: true });
    setTimeout(() => chrome.runtime.reload(), 50);
    return true;
  }

  if (message.type === 'recordExtensionLog') {
    recordExtensionLog(message.entry || {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'versionInfo') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version, name: chrome.runtime.getManifest().name });
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

  if (message.type === 'localClick') {
    localClick(message.record || {}).then(sendResponse);
    return true;
  }

  if (message.type === 'localHelperHealth') {
    localHelperHealth().then(sendResponse);
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

  return false;
});
