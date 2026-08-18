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

const storageGet = (keys) => new Promise((resolve, reject) => {
  chrome.storage.local.get(keys, (result) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(result || {});
  });
});

const storageSet = (values) => new Promise((resolve, reject) => {
  chrome.storage.local.set(values, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(true);
  });
});

const queryTabs = () => new Promise((resolve, reject) => {
  chrome.tabs.query({}, (tabs) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(tabs || []);
  });
});

function normalizedUrl(value) {
  const url = new URL(String(value || ''));
  url.hash = '';
  return url.href;
}

function exactMove99ReviewUrl(value, workspaceId) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && (host === 'ebay.com' || host.endsWith('.ebay.com'))
      && url.pathname.replace(/\/+$/, '').toLowerCase() === '/bulksell'
      && Boolean(String(workspaceId || ''))
      && url.searchParams.get('workspaceId') === String(workspaceId);
  } catch {
    return false;
  }
}

async function reloadExactMove99Recovery(params, message) {
  if (params.get('trustedMove99Recovery') !== '1') return false;
  const workspaceId = String(params.get('workspaceId') || '').trim();
  const expectedCount = Number(params.get('count') || 0);
  const approvalToken = String(params.get('approval') || '').trim();
  const expectedToken = `APPROVE SUBMIT ${expectedCount}`;
  if (!workspaceId || !Number.isInteger(expectedCount) || expectedCount <= 0 || approvalToken !== expectedToken) {
    throw new Error('The exact Move .99 recovery reload authorization is invalid.');
  }

  const stored = await storageGet(['pendingMove99Run']);
  const pending = stored.pendingMove99Run;
  const batchIds = [...new Set((pending?.currentBatchIds || []).map(String).filter(Boolean))];
  const exactPending = pending?.phase === 'awaiting-submit-approval'
    && pending?.reviewReady === true
    && Number(pending?.currentBatchCount || 0) === expectedCount
    && batchIds.length === expectedCount
    && Number(pending?.categoryUpdate?.attempted || 0) === expectedCount
    && Number(pending?.categoryUpdate?.updated || 0) === expectedCount
    && String(pending?.approvalWorkspaceId || '') === workspaceId
    && exactMove99ReviewUrl(pending?.approvalUrl, workspaceId)
    && Number(pending?.finalActionClickCount || 0) === 1
    && String(pending?.finalActionApprovalToken || '') === expectedToken
    && Boolean(pending?.trustedSubmitDispatchAt)
    && Boolean(pending?.trustedSubmitReleasedAt)
    && String(pending?.trustedSubmitWorkspaceId || '') === workspaceId
    && String(pending?.trustedSubmitBatchKey || '') === String(pending?.currentBatchKey || '')
    && Number(pending?.trustedSubmitRecoveryActivationCount || 0) === 0;
  if (!exactPending) {
    throw new Error('The preserved Move .99 review no longer matches the approved exact batch.');
  }

  const approvedUrl = normalizedUrl(pending.approvalUrl);
  const tabs = await queryTabs();
  const exactTabs = tabs.filter((tab) => {
    try {
      return !tab.discarded
        && normalizedUrl(tab.url) === approvedUrl
        && exactMove99ReviewUrl(tab.url, workspaceId);
    } catch {
      return false;
    }
  });
  if (exactTabs.length !== 1 || !Number.isInteger(exactTabs[0]?.id)) {
    throw new Error('The exact preserved eBay review tab is not uniquely available.');
  }

  const reboundAt = new Date().toISOString();
  const tabId = Number(exactTabs[0].id);
  await storageSet({
    pendingMove99Run: {
      ...pending,
      previousOwnerTabId: Number(pending?.ownerTabId || 0) || null,
      previousApprovalTabId: Number(pending?.approvalTabId || 0) || null,
      ownerTabId: tabId,
      approvalTabId: tabId,
      reviewRecoveryEvidence: {
        ...(pending?.reviewRecoveryEvidence || {}),
        reboundTabId: tabId,
        controlReboundAt: reboundAt
      },
      localControlReviewReboundAt: reboundAt,
      updatedAt: reboundAt
    },
    lastExtensionReloadRequest: {
      at: reboundAt,
      version: chrome.runtime.getManifest().version,
      targetVersion: chrome.runtime.getManifest().version,
      reason: 'trusted-move99-recovery',
      pending: true,
      returnUrl: approvedUrl,
      sourceTabId: tabId,
      sourceTabUrl: approvedUrl
    }
  });
  message.textContent = `Reloading the repaired files for the exact approved Submit (${expectedCount}) review...`;
  setTimeout(() => chrome.runtime.reload(), 250);
  return true;
}

async function resumeExactPoshmarkCheckpoint(params, message) {
  if (params.get('trustedPoshmarkResume') !== '1') return false;
  const runId = String(params.get('runId') || '').trim();
  if (!/^posh-backfill-\d+$/.test(runId)) {
    throw new Error('The Poshmark checkpoint recovery authorization is invalid.');
  }

  const stored = await storageGet(['poshmarkProfitBackfill']);
  const checkpoint = stored.poshmarkProfitBackfill;
  if (!checkpoint || String(checkpoint.runId || '') !== runId) {
    throw new Error('The saved Poshmark checkpoint no longer matches this recovery request.');
  }
  if (!['index-sales', 'capture-details', 'scan-amazon', 'review'].includes(String(checkpoint.phase || ''))) {
    throw new Error('The saved Poshmark checkpoint is not resumable.');
  }

  message.textContent = `Resuming saved Poshmark checkpoint ${runId}...`;
  const response = await runtimeMessage({ type: 'resumePoshmarkProfitBackfill' }, 60000);
  if (!response?.ok) throw new Error(response?.error || 'The saved Poshmark checkpoint did not resume.');
  message.textContent = `Checkpoint resumed: ${response.summary?.phase || checkpoint.phase}. This tab can be closed.`;
  return true;
}

async function reloadEbayProfitReviewExport(params, message) {
  if (params.get('trustedEbayProfitExport') !== '1') return false;
  const runId = String(params.get('runId') || '').trim();
  if (!/^ebay-profit-\d{4}-\d{2}-\d+$/.test(runId)) {
    throw new Error('The eBay profit review export authorization is invalid.');
  }
  const stored = await storageGet(['ebayMonthlyProfit']);
  const review = stored.ebayMonthlyProfit;
  if (!review
      || String(review.runId || '') !== runId
      || String(review.phase || '') !== 'review'
      || review.active === true
      || !Array.isArray(review.results)
      || review.results.length < 1) {
    throw new Error('The preserved eBay profit review no longer matches this read-only export request.');
  }
  message.textContent = `Reloading read-only export support for ${review.monthLabel || review.monthKey}...`;
  setTimeout(() => chrome.runtime.reload(), 250);
  return true;
}

(async () => {
  const message = document.getElementById('message');
  try {
    const params = new URLSearchParams(location.search);
    if (await reloadExactMove99Recovery(params, message)) return;
    if (await resumeExactPoshmarkCheckpoint(params, message)) return;
    if (await reloadEbayProfitReviewExport(params, message)) return;
    const info = chrome.runtime.getManifest();
    message.innerHTML = `Reload requested for <strong>${info.name} ${info.version}</strong>. Refresh open eBay/Amazon tabs after this finishes.`;
    const response = await runtimeMessage({ type: 'reloadExtension' });
    if (!response?.ok) throw new Error(response?.error || 'Reload request failed.');
  } catch (error) {
    message.textContent = error?.message || 'Reload request failed.';
  }
})();
