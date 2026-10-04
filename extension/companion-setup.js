(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  let busy = false;
  const labels = {
    opened: 'Provider page opened.',
    'login-required': 'Sign-in required. Passwords entered here are used once and not saved by GLDN.',
    'verification-required': 'Complete verification on the provider page, then check again.',
    'check-page': 'Waiting for the provider page. Check the open tab, then check again.',
    'awaiting-download': 'Waiting for Chrome to start the eComSniper download.',
    downloading: 'Downloading eComSniper. Installation has not been performed.',
    complete: 'Download complete. Installation has not been performed.',
    'download-interrupted': 'Chrome interrupted or blocked the download. Check Chrome before retrying.',
    'download-unconfirmed': 'No download was confirmed. Check the provider tab and Chrome before retrying.',
    'website-open': 'Trackerbot website is open. This does not verify extension installation or extension sign-in.'
  };
  function render(state = {}) {
    for (const [service, prefix] of [['ecomsniper','ecom'], ['trackerbot','tracker']]) {
      const item = state[service] || {};
      const store = item.storeOpened ? 'Chrome Web Store opened. Confirm Add to Chrome there. ' : '';
      byId(prefix + 'Status').textContent = store + (labels[item.status] || (item.storeOpened ? '' : 'Not started'));
      byId(prefix + 'Login').hidden = item.status !== 'login-required';
      byId(prefix + 'Check').hidden = !item.tabId;
      if (service === 'ecomsniper') {
        byId('ecomShow').hidden = item.status !== 'complete';
        byId('ecomPath').hidden = !item.filename;
        byId('ecomPath').textContent = item.savedPath || (item.filename ? 'Download location: ' + item.filename : '');
        byId('ecomStart').disabled = busy || ['awaiting-download','downloading'].includes(item.status);
      }
    }
  }
  async function send(action, service, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type: 'gldnCompanionSetup', action, service, ...extra });
    if (!response?.ok) throw new Error(response?.error || 'Setup did not respond. Reopen Optional Extension Setup.');
    render(response.state);
    return response;
  }
  async function act(fn) {
    if (busy) return;
    busy = true;
    byId('setupError').hidden = true;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await fn(); }
    catch (error) { byId('setupError').textContent = error.message; byId('setupError').hidden = false; }
    finally {
      busy = false;
      document.querySelectorAll('button').forEach(button => { button.disabled = false; });
      await send('status').catch(() => {});
    }
  }
  byId('ecomStart').addEventListener('click', () => {
    // Permission must be requested directly from this click, not after a message round trip.
    if (busy) return;
    const permission = chrome.permissions.request({ permissions: ['downloads'] });
    act(async () => {
      if (!await permission) throw new Error('Download permission was declined. Nothing was started.');
      await send('open', 'ecomsniper');
      await send('continue', 'ecomsniper');
    });
  });
  byId('trackerStore').addEventListener('click', () => act(() => send('store', 'trackerbot')));
  byId('trackerStart').addEventListener('click', () => act(async () => { await send('open', 'trackerbot'); await send('continue', 'trackerbot'); }));
  byId('ecomShow').addEventListener('click', () => act(() => send('show', 'ecomsniper')));
  for (const [service, prefix] of [['ecomsniper','ecom'], ['trackerbot','tracker']]) {
    byId(prefix + 'Check').addEventListener('click', () => act(() => send('continue', service)));
    byId(prefix + 'Login').addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const form = event.currentTarget;
      const email = form.elements.email.value;
      let password = form.elements.password.value;
      form.elements.password.value = '';
      act(async () => {
        let response;
        try { response = await send('login', service, { email, password }); }
        finally { password = ''; }
        if (!response.submitted) return;
        await new Promise(resolve => setTimeout(resolve, 1200));
        await send('continue', service);
      });
    });
  }
  window.addEventListener('pagehide', () => { document.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; }); });
  send('status').catch(() => {});
  setInterval(() => { if (!busy && !document.hidden) send('status').catch(() => {}); }, 3000);
})();
