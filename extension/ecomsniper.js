(() => {
  if (window.__GLDN_ECOMSNIPER_MONITOR__) return;
  window.__GLDN_ECOMSNIPER_MONITOR__ = true;

  const U = window.OrderNoteUtils;
  if (!U || document.getElementById('gldn-ops-ecomsniper-panel')) return;

  let statusElement = null;
  const setStatus = (message, type = 'ready') => {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  };

  const panel = document.createElement('div');
  panel.id = 'gldn-ops-ecomsniper-panel';
  panel.className = 'gldn-order-panel';
  panel.innerHTML = `
    <div class="gldn-panel-heading">
      <img class="gldn-logo-image" src="${chrome.runtime.getURL('icons/icon48.png')}" alt="GLDN Ops">
      <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v${chrome.runtime.getManifest().version}</span></div>
      <div class="gldn-drag-grip" aria-hidden="true">::</div>
    </div>
    <div class="gldn-panel-identity">EcomSniper status only</div>
    <button type="button" data-action="refresh" class="gldn-secondary">Refresh Handoff Status</button>
    <button type="button" data-action="dashboard" class="gldn-dashboard">Dashboard</button>
    <button type="button" data-action="health" class="gldn-secondary">Health Check</button>
    <button type="button" data-action="reload" class="gldn-dev-reload">Update &amp; Reload</button>
    <div class="gldn-status">GLDN does not run Extract Sellers, Scanner, Product Hunter, Bulk Poster, or listing controls.</div>`;
  document.documentElement.appendChild(panel);
  U.makePanelDraggable(panel, 'gldnEcomSniperPanelPosition');
  statusElement = panel.querySelector('.gldn-status');

  const readHandoffStatus = () => new Promise((resolve) => {
    try {
      chrome.storage.local.get(['ecomSniperHandoffStatus'], (result) => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          U.markExtensionContextInvalidated?.(error);
          resolve({});
          return;
        }
        resolve(result || {});
      });
    } catch (error) {
      U.markExtensionContextInvalidated?.(error);
      resolve({});
    }
  });

  const refreshStatus = async () => {
    const stored = await readHandoffStatus();
    const handoff = stored.ecomSniperHandoffStatus;
    if (handoff?.state === 'open') {
      setStatus(`${handoff.pageLabel || 'EcomSniper'} handoff tab is open. Internal processing status is unknown.`, 'ready');
      return;
    }
    if (handoff?.state === 'closed') {
      setStatus(`${handoff.pageLabel || 'EcomSniper'} handoff tab is closed. Closing it does not prove completion.`, 'ready');
      return;
    }
    setStatus('No GLDN-opened handoff is active. EcomSniper private processing status is unknown.', 'ready');
  };

  panel.querySelector('[data-action="refresh"]').addEventListener('click', refreshStatus);
  panel.querySelector('[data-action="dashboard"]').addEventListener('click', async () => {
    const response = await U.runtimeMessage({ type: 'openDashboard' });
    setStatus(response?.ok ? 'Dashboard opened.' : response?.error || 'Dashboard could not open.', response?.ok ? 'completed' : 'error');
  });
  panel.querySelector('[data-action="health"]').addEventListener('click', async () => {
    setStatus('Running feature health check...');
    const health = await U.runFeatureHealthCheck();
    setStatus(health.message, health.ok ? 'completed' : 'error');
  });
  panel.querySelector('[data-action="reload"]').addEventListener('click', async () => {
    setStatus('Checking the latest verified GLDN Ops...');
    const response = await U.runtimeMessage({ type: 'updateExtension', returnUrl: location.href, reloadWhenCurrent: true });
    if (!response?.ok) setStatus(response?.error || 'Verified update failed.', 'error');
    else if (!response.updated) setStatus(response.message || 'GLDN Ops is already current.', 'completed');
  });

  U.registerExtensionCleanup?.(() => {
    panel.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    setStatus('GLDN Ops was updated. Refresh this tab when you are ready.', 'error');
  });

  refreshStatus().catch((error) => setStatus(error?.message || 'Handoff status could not be read.', 'error'));
})();
