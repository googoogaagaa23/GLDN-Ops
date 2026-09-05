(() => {
  const runs = Object.freeze({
    pendingMove99Run: ['Move .99', null],
    pendingMarkShippedRun: ['Mark as Shipped', null],
    pendingSellerLevelScan: ['Seller Level', null],
    pendingEbaySnapshotScan: ['Sales Snapshot', null],
    pendingReviewMonthlyLimits: ['Listing Limits', null],
    ebayMonthlyProfit: ['eBay Profit', 'ebay-profit.html'],
    poshmarkProfitBackfill: ['Amazon Cost / Poshmark Profit', 'profit-progress.html'],
    orderPlacementAuditAmazonScan: ['Order Placement Audit', 'order-audit.html'],
    ebayPolicyListingScanState: ['Listing Policy Audit', 'policy-listing-audit.html'],
    variationAuditScanState: ['Variation Listings', 'variation-audit.html'],
    pendingAmazonSubscribeSaveRun: ['Subscribe & Save', null]
  });
  function stateName(run) {
    const phase = String(run?.phase || '').toLowerCase();
    if (run?.error || /failed|error/.test(phase)) return 'Failed';
    if (/paused|stopped|canceled|cancelled|approval-lost/.test(phase)) return 'Paused';
    if (/sync|saving|submit/.test(phase) && !/await|approval/.test(phase)) return 'Saving';
    if (/review|approval/.test(phase)) return 'Awaiting approval';
    if (/complete|finished|done/.test(phase)) {
      if (run.syncDelivery === 'queued') return 'Queued';
      if (run.syncDelivery === 'confirmed') return 'Saved';
      return 'Completed';
    }
    if (/start|prepare/.test(phase)) return 'Starting';
    if (run?.active || run === true) return 'Reading';
    return 'Paused';
  }
  function summarize(stored, now = Date.now()) {
    return Object.entries(runs).flatMap(([key, [label, page]]) => {
      const run = stored[key];
      if (!run || (typeof run !== 'object' && run !== true)) return [];
      const stamp = run.updatedAt || run.stateUpdatedAt || run.lastProgressAt || run.startedAt || '';
      const parsed = typeof stamp === 'number' ? stamp : Date.parse(stamp);
      return [{ key, label, page, state: stateName(run), phase: String(run.phase || ''),
        progress: String(run.progressMessage || run.statusMessage || run.message || ''),
        error: String(run.error?.message || run.error || run.pauseReason || ''),
        updatedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : '',
        stale: Boolean(run.active && Number.isFinite(parsed) && now - parsed > 300000),
        workerTabId: Number.isInteger(run.workerTabId) ? run.workerTabId : null,
        month: String(run.monthKey || ''),
        synced: run.syncDelivery === 'confirmed' && Array.isArray(run.syncedOrderNumbers) ? new Set(run.syncedOrderNumbers).size : null
      }];
    });
  }
  globalThis.GLDN_OPS_HEALTH = Object.freeze({ runs, stateName, summarize });
})();
