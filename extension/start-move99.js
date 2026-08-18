const statusElement = document.getElementById('status');

const runtimeMessage = (message, timeoutMs = 30000) => new Promise((resolve) => {
  const timeout = setTimeout(() => resolve({ ok: false, error: 'Extension request timed out.' }), timeoutMs);
  try {
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      resolve(response || { ok: false, error: 'No response from the extension background service.' });
    });
  } catch (error) {
    clearTimeout(timeout);
    resolve({ ok: false, error: error?.message || String(error) });
  }
});

function requestReverseMove99SaleEventStatus() {
  const gate = document.getElementById('saleEventGate');
  if (!gate) return Promise.resolve('unconfirmed');
  gate.hidden = false;
  statusElement.textContent = 'Confirm the sale-event status before the reverse scan can start.';
  return new Promise((resolve) => {
    gate.querySelectorAll('[data-sale-event-status]').forEach((button) => {
      button.onclick = () => {
        const value = String(button.dataset.saleEventStatus || 'unconfirmed');
        gate.hidden = true;
        resolve(value);
      };
    });
  });
}

async function start() {
  const params = new URLSearchParams(location.search);
  const scanMode = params.get('mode') === 'non99' ? 'non99' : 'price99';
  const saleEventStatus = scanMode === 'non99'
    ? await requestReverseMove99SaleEventStatus()
    : '';
  const saleEventDecision = scanMode === 'non99'
    ? globalThis.GLDN_FOUNDATION.reverseMove99SaleEventDecision(saleEventStatus)
    : { ok: true, status: '' };
  if (!saleEventDecision.ok) {
    statusElement.textContent = saleEventDecision.error;
    return;
  }
  const response = await runtimeMessage({
    type: 'startMove99Workflow',
    scanMode,
    saleEventStatus: saleEventDecision.status
  });
  if (!response?.ok || !response.started || !Number.isInteger(response.tabId)) {
    throw new Error(response?.error || 'Chrome did not verify the new Move .99 tab.');
  }
  statusElement.textContent = `Started ${scanMode === 'non99' ? 'Non-.99 cleanup' : 'Move .99'} for ${response.account}.\nVerified tab ${response.tabId}.`;
}

start().catch((error) => {
  statusElement.textContent = error.message || String(error);
});
