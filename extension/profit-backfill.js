(function attachProfitBackfill(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GLDN_PROFIT_BACKFILL = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STATE_VERSION = 1;
  const DEFAULT_MATCH_WINDOW_DAYS = 7;

  function text(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set((values || []).map(text).filter(Boolean))];
  }

  function normalizeAsin(value) {
    const asin = text(value).toUpperCase();
    return /^[A-Z0-9]{10}$/.test(asin) ? asin : "";
  }

  function parseDate(value) {
    const raw = text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  }

  function dayDifference(fromValue, toValue) {
    const from = parseDate(fromValue);
    const to = parseDate(toValue);
    if (from === null || to === null) return null;
    return Math.round((to - from) / 86400000);
  }

  function createRun(options = {}) {
    const now = String(options.now || new Date().toISOString());
    const scope = ["single", "pilot", "incremental", "last90", "all"].includes(options.scope) ? options.scope : "pilot";
    const maxOrders = scope === "single"
      ? 1
      : scope === "pilot"
      ? Math.max(1, Math.min(25, Number(options.maxOrders || 10)))
      : Math.max(1, Math.min(10000, Number(options.maxOrders || (scope === "last90" ? 1500 : 10000))));
    return {
      stateVersion: STATE_VERSION,
      runId: text(options.runId) || `posh-backfill-${Date.now()}`,
      extensionVersion: text(options.extensionVersion),
      scope,
      maxOrders,
      rangeDays: scope === "last90" ? 90 : null,
      knownOrderNumbers: unique(options.knownOrderNumbers),
      matchWindowDays: Number(options.matchWindowDays || DEFAULT_MATCH_WINDOW_DAYS),
      active: true,
      stopRequested: false,
      phase: "index-sales",
      startedAt: now,
      updatedAt: now,
      ownerTabId: Number.isInteger(options.ownerTabId) ? options.ownerTabId : null,
      ownerWindowId: Number.isInteger(options.ownerWindowId) ? options.ownerWindowId : null,
      workerTabId: null,
      currentPage: 1,
      pageFingerprints: [],
      sales: [],
      detailIndex: 0,
      asinIndex: 0,
      currentAsin: "",
      amazonSearchMatches: [],
      amazonSearchCollected: [],
      amazonSearchFingerprints: [],
      amazonCandidateIndex: 0,
      purchases: [],
      results: [],
      syncedOrderNumbers: [],
      errors: []
    };
  }

  function saleKey(record) {
    return text(record?.orderNumber);
  }

  function mergeSalesPage(run, records, options = {}) {
    const byOrder = new Map((run.sales || []).map((record) => [saleKey(record), { ...record }]));
    const cutoff = run.rangeDays
      ? Date.now() - Number(run.rangeDays) * 86400000
      : null;
    let sawOlder = false;
    let sawKnown = false;
    const knownOrders = new Set(run.knownOrderNumbers || []);
    (records || []).forEach((raw) => {
      if (run.scope === "incremental" && sawKnown) return;
      const orderNumber = saleKey(raw);
      if (!orderNumber) return;
      if (run.scope === "incremental" && knownOrders.has(orderNumber)) {
        sawKnown = true;
        return;
      }
      const orderTime = parseDate(raw.orderDate);
      if (cutoff !== null && orderTime !== null && orderTime < cutoff) {
        sawOlder = true;
        return;
      }
      byOrder.set(orderNumber, { ...(byOrder.get(orderNumber) || {}), ...raw, orderNumber });
    });
    const fingerprint = unique((records || []).map(saleKey)).sort().join("|");
    const repeatedPage = Boolean(fingerprint && (run.pageFingerprints || []).includes(fingerprint));
    const sales = [...byOrder.values()].slice(0, run.maxOrders);
    const reachedLimit = sales.length >= run.maxOrders;
    const noNextPage = options.hasNext === false;
    const indexComplete = reachedLimit || sawOlder || sawKnown || noNextPage || repeatedPage;
    return {
      ...run,
      sales,
      pageFingerprints: fingerprint && !repeatedPage
        ? [...(run.pageFingerprints || []), fingerprint]
        : [...(run.pageFingerprints || [])],
      currentPage: Number(run.currentPage || 1) + (indexComplete ? 0 : 1),
      phase: indexComplete ? "capture-posh-details" : "index-sales",
      detailIndex: indexComplete ? 0 : Number(run.detailIndex || 0),
      updatedAt: new Date().toISOString()
    };
  }

  function mergeSaleDetail(run, detail) {
    const orderNumber = saleKey(detail);
    const sales = (run.sales || []).map((sale) => saleKey(sale) === orderNumber
      ? {
          ...sale,
          ...detail,
          orderNumber,
          skus: unique(detail.skus),
          asins: unique(detail.asins).map(normalizeAsin).filter(Boolean),
          detailCapturedAt: new Date().toISOString()
        }
      : sale);
    return {
      ...run,
      sales,
      detailIndex: Math.min(sales.length, Number(run.detailIndex || 0) + 1),
      updatedAt: new Date().toISOString()
    };
  }

  function purchaseKey(purchase) {
    return [text(purchase?.orderId), normalizeAsin(purchase?.asin), Number(purchase?.unitIndex || 1)].join(":");
  }

  function addPurchase(run, raw) {
    const asin = normalizeAsin(raw?.asin);
    const cost = Number(raw?.cost ?? raw?.total);
    const orderId = text(raw?.orderId);
    if (!asin || !orderId || !Number.isFinite(cost) || cost <= 0) return run;
    const quantity = Math.max(1, Math.min(100, Number.parseInt(raw.quantity || 1, 10) || 1));
    const existing = new Map((run.purchases || []).map((purchase) => [purchaseKey(purchase), purchase]));
    for (let unitIndex = 1; unitIndex <= quantity; unitIndex += 1) {
      const purchase = {
        ...raw,
        asin,
        cost: Number(cost.toFixed(2)),
        orderId,
        quantity,
        unitIndex,
        unitKey: [orderId, asin, unitIndex].join(":"),
        source: text(raw.source) || "amazon-order-detail-asin-row"
      };
      existing.set(purchase.unitKey, purchase);
    }
    return { ...run, purchases: [...existing.values()], updatedAt: new Date().toISOString() };
  }

  function resultForSale(sale, available, options = {}) {
    const asins = unique(sale.asins).map(normalizeAsin).filter(Boolean);
    if (!asins.length) return { status: "missing-sku", reason: "The Poshmark SKU did not decode to an Amazon ASIN." };
    const windowDays = Number(options.matchWindowDays || DEFAULT_MATCH_WINDOW_DAYS);
    const chosen = [];
    for (const asin of asins) {
      const candidates = available.filter((purchase) => {
        if (purchase.allocatedTo || normalizeAsin(purchase.asin) !== asin) return false;
        const delta = dayDifference(sale.orderDate, purchase.purchaseDate);
        return delta !== null && delta >= -1 && delta <= windowDays;
      });
      if (!candidates.length) {
        return { status: "amazon-not-found", reason: `No unused exact Amazon purchase was found for ${asin} in the date window.`, asins };
      }
      if (candidates.length > 1) {
        const costs = unique(candidates.map((candidate) => Number(candidate.cost).toFixed(2)));
        const orders = unique(candidates.map((candidate) => candidate.orderId));
        if (orders.length === 1 && costs.length === 1) {
          chosen.push(candidates.sort((left, right) => Number(left.unitIndex || 1) - Number(right.unitIndex || 1))[0]);
          continue;
        }
        return {
          status: costs.length === 1 ? "needs-review-same-cost" : "needs-review-ambiguous-cost",
          reason: `${candidates.length} unused Amazon purchases match ${asin}; exact order allocation needs review.`,
          asins,
          candidateUnitKeys: candidates.map((candidate) => candidate.unitKey),
          candidateCosts: costs.map(Number)
        };
      }
      chosen.push(candidates[0]);
    }
    return { status: "exact", purchases: chosen, asins };
  }

  function buildProfitRecord(sale, purchases, options = {}) {
    const supplierTotal = Number(purchases.reduce((sum, purchase) => sum + Number(purchase.cost), 0).toFixed(2));
    const earnings = Number(sale.marketplaceEarnings);
    const profit = Number.isFinite(earnings) ? Number((earnings - supplierTotal).toFixed(2)) : null;
    const supplierItems = purchases.map((purchase) => ({
      asin: purchase.asin,
      cost: purchase.cost,
      title: purchase.title || "",
      orderId: purchase.orderId,
      orderUrl: purchase.orderUrl || "",
      purchaseDate: purchase.purchaseDate || "",
      quantity: purchase.quantity || 1,
      unitIndex: purchase.unitIndex || 1,
      unitKey: purchase.unitKey,
      source: purchase.source,
      capturedAt: purchase.capturedAt || ""
    }));
    return {
      platform: "Poshmark",
      computerLabel: text(options.computerLabel || "7"),
      accountLabel: text(sale.accountLabel || sale.poshmarkAccountLabel),
      poshmarkAccountLabel: text(sale.accountLabel || sale.poshmarkAccountLabel),
      orderNumber: sale.orderNumber,
      itemTitle: sale.itemTitle,
      orderDate: sale.orderDate || "",
      orderStatus: sale.orderStatus || "",
      earningsStatus: sale.earningsStatus || "",
      marketplaceEarnings: Number.isFinite(earnings) ? earnings : null,
      marketplaceSoldPrice: Number.isFinite(Number(sale.marketplaceSoldPrice)) ? Number(sale.marketplaceSoldPrice) : null,
      supplier: "Amazon",
      supplierTotal,
      supplierProfile: text(options.supplierProfile),
      eta: "",
      profit,
      margin: profit !== null && earnings > 0 ? profit / earnings : null,
      sku: unique(sale.skus).join(", ") || text(sale.sku),
      supplierItemIds: unique(supplierItems.map((item) => item.asin)).join(", "),
      supplierOrderNumber: unique(supplierItems.map((item) => item.orderId)).join(", "),
      supplierMatchSource: unique(supplierItems.map((item) => item.source)).join(", "),
      supplierPageUrl: unique(supplierItems.map((item) => item.orderUrl)).join(" | "),
      supplierItemEvidence: JSON.stringify(supplierItems),
      source: "poshmark-historical-profit-backfill",
      capturedAt: new Date().toISOString(),
      pageUrl: sale.pageUrl || ""
    };
  }

  function allocate(run, options = {}) {
    const purchases = (run.purchases || []).map((purchase) => ({ ...purchase, allocatedTo: "" }));
    const results = [];
    const orderedSales = [...(run.sales || [])].sort((left, right) => (parseDate(left.orderDate) || 0) - (parseDate(right.orderDate) || 0));
    orderedSales.forEach((sale) => {
      const outcome = resultForSale(sale, purchases, { matchWindowDays: run.matchWindowDays });
      if (outcome.status === "exact") {
        outcome.purchases.forEach((purchase) => { purchase.allocatedTo = sale.orderNumber; });
        results.push({
          orderNumber: sale.orderNumber,
          status: "exact",
          record: buildProfitRecord(sale, outcome.purchases, options),
          purchaseUnitKeys: outcome.purchases.map((purchase) => purchase.unitKey)
        });
      } else {
        results.push({ orderNumber: sale.orderNumber, ...outcome });
      }
    });
    return {
      ...run,
      active: false,
      phase: "review",
      purchases,
      results,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function summary(run) {
    const results = run.results || [];
    const count = (status) => results.filter((result) => result.status === status).length;
    const exactRecords = results.filter((result) => result.status === "exact" && result.record).map((result) => result.record);
    return {
      runId: run.runId,
      scope: run.scope,
      phase: run.phase,
      active: Boolean(run.active),
      pagesScanned: (run.pageFingerprints || []).length,
      salesIndexed: (run.sales || []).length,
      detailsCaptured: (run.sales || []).filter((sale) => sale.detailCapturedAt).length,
      amazonUnitsCaptured: (run.purchases || []).length,
      exact: exactRecords.length,
      missingSku: count("missing-sku"),
      amazonNotFound: count("amazon-not-found"),
      needsReview: count("needs-review-same-cost") + count("needs-review-ambiguous-cost"),
      exactProfit: Number(exactRecords.reduce((sum, record) => sum + Number(record.profit || 0), 0).toFixed(2)),
      synced: unique(run.syncedOrderNumbers).length,
      errors: (run.errors || []).length
    };
  }

  return Object.freeze({
    STATE_VERSION,
    DEFAULT_MATCH_WINDOW_DAYS,
    normalizeAsin,
    parseDate,
    dayDifference,
    createRun,
    mergeSalesPage,
    mergeSaleDetail,
    addPurchase,
    allocate,
    summary,
    buildProfitRecord
  });
});
