async function handleOpsHealthMessage(message) {
  if (message.type === 'beginControlPairing') {
    const stored = await storageGet(['gldnInstallationId']);
    const installationId = stored.gldnInstallationId || crypto.randomUUID();
    await storageSet({ gldnInstallationId: installationId });
    const pair = await updaterRequest('/control/pair-start', { method: 'POST', body: { installationId } });
    await storageSet({ gldnPendingControlPair: { ...pair, installationId } });
    return { ok: true, code: pair.code, expiresAt: pair.expiresAt };
  }
  if (message.type === 'finishControlPairing') {
    const { gldnPendingControlPair: pending } = await storageGet(['gldnPendingControlPair']);
    if (!pending) throw new Error('Start a new pairing request first.');
    const result = await updaterRequest('/control/pair-status', { method: 'POST', body: { code: pending.code, token: pending.token } });
    if (result.approved) {
      await storageSet({ gldnControlPairing: { enabled: true, token: pending.token, installationId: pending.installationId, profileDirectory: result.profileDirectory } });
      await storageRemove(['gldnPendingControlPair']);
      localControlNextPollAt = 0;
      void pollLocalControl();
    }
    return result;
  }
  if (message.type === 'disableControlPairing') {
    const { gldnControlPairing: pairing } = await storageGet(['gldnControlPairing']);
    await storageRemove(['gldnControlPairing', 'gldnPendingControlPair']);
    if (pairing?.token) {
      const result = await updaterRequest('/control/unpair', { method: 'POST', profileToken: pairing.token }).catch(() => null);
      return { ok: true, disabled: true, agentRevoked: Boolean(result?.ok) };
    }
    return { ok: true, disabled: true };
  }
  const keys = [...FOUNDATION.workflowStateKeys, ...Object.keys(GLDN_OPS_HEALTH.runs), 'computerLabel', 'ebayAccountLabel', 'amazonProfileLabel', 'gldnControlPairing', 'gldnDashboardQueue', 'gldnErrorLog'];
  const stored = await storageGet(keys);
  const reviews = Object.values(stored.gldnOpenReviews || {}).filter((review) => review.active && review.expiresAt > Date.now()).map((review) => ({ label: review.label, ownerTabId: review.ownerTabId, openedAt: review.openedAt }));
  const result = {
    ok: true, version: EXTENSION_VERSION, extensionId: chrome.runtime.id,
    identity: { computer: stored.computerLabel || '', ebay: stored.ebayAccountLabel || '', amazon: stored.amazonProfileLabel || '' },
    pairing: { enabled: Boolean(stored.gldnControlPairing?.enabled), profileDirectory: stored.gldnControlPairing?.profileDirectory || '' },
    workflows: GLDN_OPS_HEALTH.summarize(stored), reviews,
    queuedRecords: Array.isArray(stored.gldnDashboardQueue) ? stored.gldnDashboardQueue.length : 0,
    errors: (stored.gldnErrorLog || []).filter((entry) => !entry.level || ['error', 'warn', 'warning'].includes(entry.level)).slice(0, 10).map((entry) => ({ at: entry.at, operation: entry.operation, message: entry.message })),
    observedAt: new Date().toISOString()
  };
  for (const run of result.workflows) {
    if (run.key === 'ebayMonthlyProfit') run.sheetUrl = `https://docs.google.com/spreadsheets/d/${SHARED_PROFIT_WORKBOOK_ID}/edit`;
    if (run.key === 'poshmarkProfitBackfill') {
      const id = stored.poshmarkProfitBackfill?.scope === 'month' ? POSHMARK_PROFIT_WORKBOOK_ID : SHARED_PROFIT_WORKBOOK_ID;
      run.sheetUrl = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    }
  }
  if (message.refreshInstallations) {
    if (globalThis.GLDN_DEPLOYMENT_CHANNEL === 'webstore') {
      result.updater = { ok: true, currentVersion: EXTENSION_VERSION, latestVersion: 'Chrome managed', channel: 'webstore' };
      result.installations = { ok: false, error: 'Store installations and updates are managed by Chrome. Local unpacked inventory does not verify store profiles.' };
      return result;
    }
    result.updater = await updaterRequest('/status', { timeoutMs: 5000 }).catch((error) => ({ ok: false, error: error.message }));
    result.installations = await updaterRequest('/installations', { timeoutMs: 10000 }).catch((error) => ({ ok: false, error: error.message }));
  }
  return result;
}
