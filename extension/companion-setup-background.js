(function () {
  'use strict';
  const core = globalThis.GLDN_COMPANION_SETUP;
  const key = 'gldnCompanionSetupSession';
  const pageUrl = chrome.runtime.getURL('companion-setup.html');
  let queue = Promise.resolve();
  let stateQueue = Promise.resolve();
  let commandQueue = Promise.resolve();
  let downloadsRegistered = false;
  const read = async () => (await chrome.storage.session.get(key))[key] || {};
  const write = state => chrome.storage.session.set({ [key]: state });
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  function update(service, patch) {
    const result = stateQueue.then(async () => {
      const state = await read();
      state[service] = { ...state[service], ...patch };
      await write(state);
      return state[service];
    });
    stateQueue = result.catch(() => {});
    return result;
  }
  async function runPage(service, action, credentials, version) {
    const current = (await read())[service];
    if (!current?.tabId) throw new Error('Open this provider from Optional Extension Setup first.');
    const tab = await chrome.tabs.get(current.tabId);
    if (!core.allowedPage(tab.url, service)) throw new Error('The provider tab moved or was blocked. Check the open tab; no download or sign-in is confirmed.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['companion-setup-page.js'] });
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (s, a, c, v) => globalThis.gldnCompanionPage(s, a, c, v), args: [service, action, credentials || null, version || null] });
    if (!result[0]?.result) throw new Error('The provider page did not respond.');
    return result[0].result;
  }
  async function inspect(service) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = (await read())[service];
      const tab = state?.tabId ? await chrome.tabs.get(state.tabId) : null;
      if (tab?.status === 'loading') { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
      const result = await runPage(service, 'inspect');
      if (result.status !== 'check-page') return result;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return { status: 'check-page' };
  }
  async function proceed(service) {
    const state = (await read())[service];
    if (state?.status === 'downloading' || state?.status === 'complete') return state;
    if (state?.status === 'awaiting-download' && state.expiresAt > Date.now()) return state;
    const result = await inspect(service);
    if (result.status !== 'ready') return update(service, result);
    if (!await chrome.permissions.contains({ permissions: ['downloads'] })) throw new Error('Allow downloads for the eComSniper setup first.');
    const filename = core.downloadPath(result.version);
    await update(service, { status: 'awaiting-download', version: result.version, filename, startedAt: Date.now(), expiresAt: Date.now() + 120000, downloadId: null });
    try {
      const clicked = await runPage(service, 'download', null, result.version);
      if (clicked.status !== 'download-clicked') await update(service, { ...clicked, expiresAt: 0 });
    }
    catch (_) {
      // Provider downloads may navigate away before the script response returns.
      // Completion is determined only by Chrome's download events, never the click.
    }
    return (await read())[service];
  }
  function registerDownloads() {
    if (downloadsRegistered || !chrome.downloads?.onDeterminingFilename) return;
    downloadsRegistered = true;
    chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
      let suggested = false;
      const once = value => { if (!suggested) { suggested = true; suggest(value); } };
      serial(async () => {
        const pending = (await read()).ecomsniper;
        if (!core.mayRouteDownload(item, pending, Date.now(), chrome.runtime.id)) { once(); return; }
        await update('ecomsniper', { status: 'downloading', downloadId: item.id });
        once({ filename: pending.filename, conflictAction: 'uniquify' });
      }).catch(() => once());
      return true;
    });
    chrome.downloads.onChanged.addListener(delta => {
      if (!delta.state && !delta.error) return;
      serial(async () => {
        const state = (await read()).ecomsniper;
        if (state?.downloadId !== delta.id) return;
        if (delta.state?.current === 'complete') {
          const [item] = await chrome.downloads.search({ id: delta.id });
          if (item?.state === 'complete' && item.exists !== false) {
            await update('ecomsniper', { status: 'complete', savedPath: item.filename });
          } else if (!item || item.exists === false) {
            await update('ecomsniper', { status: 'download-interrupted' });
          }
        } else if (delta.error || delta.state?.current === 'interrupted') {
          await update('ecomsniper', { status: 'download-interrupted', error: 'Chrome interrupted or blocked the download. Check Chrome before retrying.' });
        }
      }).catch(() => {});
    });
  }
  registerDownloads();
  chrome.permissions?.onAdded?.addListener(registerDownloads);
  async function handle(message) {
    const service = message.service;
    if (message.action === 'status') {
      const state = await read();
      if (state.ecomsniper?.status === 'downloading' && Number.isInteger(state.ecomsniper.downloadId)
          && await chrome.permissions.contains({ permissions: ['downloads'] })) {
        const [item] = await chrome.downloads.search({ id: state.ecomsniper.downloadId });
        if (item?.state === 'complete' && item.exists !== false) await update('ecomsniper', { status: 'complete', savedPath: item.filename });
        if (!item || item.exists === false || item.state === 'interrupted') await update('ecomsniper', { status: 'download-interrupted' });
        return { ok: true, state: await read() };
      }
      if (state.ecomsniper?.status === 'awaiting-download' && state.ecomsniper.expiresAt <= Date.now()) {
        await update('ecomsniper', { status: 'download-unconfirmed', error: 'No matching download was confirmed. Check the provider tab and Chrome downloads before retrying.' });
        return { ok: true, state: await read() };
      }
      return { ok: true, state };
    }
    if (message.action === 'store') {
      await chrome.tabs.create({ url: core.urls.trackerbotStore });
      await update('trackerbot', { storeOpened: true });
      return { ok: true, state: await read() };
    }
    if (!['ecomsniper', 'trackerbot'].includes(service)) throw new Error('Unknown setup provider.');
    if (message.action === 'open') {
      if (service === 'ecomsniper' && !await chrome.permissions.contains({ permissions: ['downloads'] })) throw new Error('Download permission was not granted. Nothing was downloaded.');
      const previous = (await read())[service];
      if (previous?.status === 'downloading' || (previous?.status === 'awaiting-download' && previous.expiresAt > Date.now())) return { ok: true, state: await read() };
      const tab = await chrome.tabs.create({ url: core.urls[service] });
      await update(service, { tabId: tab.id, status: 'opened', downloadId: null, error: '', savedPath: '', filename: '', version: '', expiresAt: 0 });
      return { ok: true, state: await read() };
    }
    if (message.action === 'login') {
      // Credentials are passed once to the exact provider tab; never persisted or logged.
      let result;
      try { result = await runPage(service, 'login', { email: String(message.email || ''), password: String(message.password || '') }); }
      finally { message.password = ''; message.email = ''; }
      if (result.status !== 'login-submitted') await update(service, result);
      return { ok: true, state: await read(), submitted: result.status === 'login-submitted' };
    }
    if (message.action === 'continue') {
      await proceed(service);
      return { ok: true, state: await read() };
    }
    if (message.action === 'show') {
      const state = (await read())[service];
      if (state?.status === 'complete' && Number.isInteger(state.downloadId)) chrome.downloads.show(state.downloadId);
      return { ok: true, state: await read() };
    }
    throw new Error('Unknown setup action.');
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'gldnCompanionSetup') return false;
    if (sender?.id !== chrome.runtime.id || sender?.url !== pageUrl || sender.frameId > 0) {
      respond({ ok: false, error: 'Open Optional Extension Setup from GLDN Ops.' });
      return false;
    }
    // Page operations stay outside the event queue so a provider navigation cannot
    // hold up the download filename callback. UI disables overlapping commands.
    const result = message.action === 'status' ? handle(message) : commandQueue.then(() => handle(message));
    if (message.action !== 'status') commandQueue = result.catch(() => {});
    result.then(respond).catch(() => respond({ ok: false, error: 'Setup could not confirm this step. Check the provider tab or sign in there, then choose Check again.' }));
    return true;
  });
})();
