const statusElement = document.getElementById('status');

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
