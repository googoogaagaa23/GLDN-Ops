(() => {
  const U = window.OrderNoteUtils;
  const FOUNDATION = globalThis.GLDN_FOUNDATION;
  if (!U || !FOUNDATION || document.getElementById('gldn-universal-panel')) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  let statusElement = null;
  const setStatus = (message, type = 'ready') => {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  };

  const openExtensionPage = async (page) => {
    const response = await U.runtimeMessage({ type: 'openExtensionPage', page });
    if (!response?.ok) setStatus(response?.error || 'Could not open the extension page.', 'error');
  };

  const panel = document.createElement('div');
  panel.id = 'gldn-universal-panel';
  panel.className = 'gldn-order-panel gldn-universal-panel';
  panel.innerHTML = `
    <div class="gldn-panel-heading">
      <img class="gldn-logo-image" src="${chrome.runtime.getURL('icons/icon48.png')}" alt="GLDN Ops">
      <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v${chrome.runtime.getManifest().version}</span></div>
      <div class="gldn-drag-grip" aria-hidden="true">::</div>
    </div>
    <div class="gldn-panel-identity"></div>
    <button type="button" data-action="open-extension" class="gldn-primary">Open Extension</button>
    <button type="button" data-action="dashboard" class="gldn-dashboard">Dashboard</button>
    <button type="button" data-action="tour" class="gldn-secondary">Feature Tour</button>
    <button type="button" data-action="guide" class="gldn-secondary">Feature Guide</button>
    <div class="gldn-task-controls">
      <button type="button" data-action="setup" class="gldn-secondary">Setup</button>
      <button type="button" data-action="health" class="gldn-secondary">Health Check</button>
      <button type="button" data-action="stop" class="gldn-stop-task">Stop Task</button>
      <button type="button" data-action="reset" class="gldn-reset-task">Reset</button>
      <button type="button" data-action="reload" class="gldn-dev-reload">Update &amp; Reload</button>
    </div>
    <div class="gldn-status">Global controls ready. Marketplace actions appear only on supported sites.</div>`;
  document.documentElement.appendChild(panel);
  U.makePanelDraggable(panel, 'gldnUniversalPanelPosition');
  statusElement = panel.querySelector('.gldn-status');

  try {
    chrome.storage.local.get(['computerLabel'], (result) => {
      let error = null;
      try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
      if (error) {
        U.markExtensionContextInvalidated?.(error);
        return;
      }
      const computer = FOUNDATION.normalizeComputer(result.computerLabel);
      const identity = FOUNDATION.identityForComputer(computer);
      const account = identity.poshmarkOnly
        ? 'Poshmark only'
        : identity.ebayAccountLabel || 'Not configured';
      panel.querySelector('.gldn-panel-identity').innerHTML = `
        <span>Computer: <strong>${escapeHtml(computer || 'Not set')}</strong></span>
        <span>Account: <strong>${escapeHtml(account)}</strong></span>`;
    });
  } catch (error) {
    U.markExtensionContextInvalidated?.(error);
  }

  panel.querySelector('[data-action="open-extension"]').addEventListener('click', () => openExtensionPage('popup.html'));
  panel.querySelector('[data-action="tour"]').addEventListener('click', () => openExtensionPage('onboarding.html'));
  panel.querySelector('[data-action="guide"]').addEventListener('click', () => openExtensionPage('guide.html'));
  panel.querySelector('[data-action="dashboard"]').addEventListener('click', async () => {
    const response = await U.runtimeMessage({ type: 'openDashboard' });
    setStatus(response?.ok ? 'Dashboard opened.' : response?.error || 'Dashboard could not open.', response?.ok ? 'completed' : 'error');
  });
  panel.querySelector('[data-action="setup"]').addEventListener('click', async () => {
    const result = await U.promptAndSaveDashboardSetup();
    setStatus(result?.ok ? 'Dashboard setup saved.' : result?.error || 'Setup was not saved.', result?.ok ? 'completed' : 'error');
  });
  panel.querySelector('[data-action="health"]').addEventListener('click', async () => {
    setStatus('Running feature health check...');
    const health = await U.runFeatureHealthCheck();
    setStatus(health.message, health.ok ? 'completed' : 'error');
  });
  panel.querySelector('[data-action="stop"]').addEventListener('click', () => {
    chrome.storage.local.set({ gldnStopRequested: true }, () => setStatus('Stop requested at the next safe checkpoint.', 'error'));
  });
  panel.querySelector('[data-action="reset"]').addEventListener('click', async () => {
    if (!window.confirm('Reset unfinished GLDN Ops workflow state? Saved settings and completed records will be kept.')) return;
    setStatus('Resetting unfinished workflow state...');
    const response = await U.runtimeMessage({ type: 'resetAutomationState' });
    setStatus(response?.ok ? 'Unfinished workflow state cleared.' : response?.error || 'Reset failed.', response?.ok ? 'completed' : 'error');
  });
  panel.querySelector('[data-action="reload"]').addEventListener('click', async () => {
    setStatus('Checking and verifying the latest stable GLDN Ops...');
    const response = await U.runtimeMessage({ type: 'updateExtension', returnUrl: location.href, reloadWhenCurrent: true });
    if (!response?.ok) setStatus(response?.error || 'Verified update failed.', 'error');
    else if (!response.updated) setStatus(response.message || 'GLDN Ops is already current.', 'completed');
  });

  U.registerExtensionCleanup?.(() => {
    panel.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    setStatus('GLDN Ops was updated. Refresh this tab when you are ready.', 'error');
  });
})();
