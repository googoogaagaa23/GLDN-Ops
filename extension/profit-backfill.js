(function attachProfitBackfill(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GLDN_PROFIT_BACKFILL = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STATE_VERSION = 2;
  const DEFAULT_MATCH_WINDOW_DAYS = 7;
  const MONTH_KEY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

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

  function normalizeMonthKey(value) {
    const monthKey = text(value);
    return MONTH_KEY_PATTERN.test(monthKey) ? monthKey : "";
  }

  function monthKeyForDate(value) {
    const timestamp = parseDate(value);
    if (timestamp === null) return "";
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(value) {
    const monthKey = normalizeMonthKey(value);
    if (!monthKey) return "";
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function dayDifference(fromValue, toValue) {
    const from = parseDate(fromValue);
    const to = parseDate(toValue);
    if (from === null || to === null) return null;
    return Math.round((to - from) / 86400000);
  }

  function createRun(options = {}) {
    const now = String(options.now || new Date().toISOString());
    const scope = ["single", "pilot", "incremental", "last90", "month", "resolve-missing", "resolve-ebay", "all"].includes(options.scope) ? options.scope : "pilot";
    const monthKey = normalizeMonthKey(options.monthKey);
    if (scope === "month" && !monthKey) throw new Error("A valid YYYY-MM month is required for a monthly Poshmark run.");
    const maxOrders = scope === "single"
      ? 1
      : scope === "pilot"
      ? Math.max(1, Math.min(25, Number(options.maxOrders || 10)))
      : ["resolve-missing", "resolve-ebay"].includes(scope)
      ? Math.max(1, Math.min(100, Number(options.maxOrders || 100)))
      : Math.max(1, Math.min(10000, Number(options.maxOrders || (scope === "last90" ? 1500 : 10000))));
    return {
      stateVersion: STATE_VERSION,
      runId: text(options.runId) || `posh-backfill-${Date.now()}`,
      extensionVersion: text(options.extensionVersion),
      scope,
      platform: text(options.platform) || (scope === "resolve-ebay" ? "eBay" : "Poshmark"),
      supplierProfile: text(options.supplierProfile),
      monthKey,
      monthLabel: monthLabel(monthKey),
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
      if (run.scope === "month") {
        const recordMonth = monthKeyForDate(raw.orderDate);
        if (!recordMonth) return;
        if (recordMonth > run.monthKey) return;
        if (recordMonth < run.monthKey) {
          sawOlder = true;
          return;
        }
      }
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

  function amazonOrderIdFromMatch(match) {
    const direct = text(match?.orderId);
    if (direct) return direct;
    const orderDetailsUrl = text(match?.orderDetailsUrl);
    if (!orderDetailsUrl) return "";
    try {
      const parsed = new URL(orderDetailsUrl, "https://www.amazon.com");
      return text(
        parsed.searchParams.get("orderID")
        || parsed.searchParams.get("orderId")
        || parsed.searchParams.get("order-id")
      );
    } catch {
      return text(orderDetailsUrl.match(/[?&](?:orderID|orderId|order-id)=([^&#]+)/i)?.[1]);
    }
  }

  function amazonSearchMatchKey(match) {
    const orderId = amazonOrderIdFromMatch(match);
    return orderId ? `order:${orderId}` : `url:${text(match?.orderDetailsUrl)}`;
  }

  function mergeAmazonSearchMatches(...groups) {
    const matches = new Map();
    groups.flat().forEach((raw) => {
      const orderDetailsUrl = text(raw?.orderDetailsUrl);
      if (!orderDetailsUrl) return;
      const orderId = amazonOrderIdFromMatch(raw);
      const key = orderId ? `order:${orderId}` : `url:${orderDetailsUrl}`;
      const prior = matches.get(key) || {};
      matches.set(key, {
        ...prior,
        ...raw,
        orderId: orderId || text(prior.orderId),
        orderDetailsUrl: text(prior.orderDetailsUrl) || orderDetailsUrl,
        purchaseDate: text(raw?.purchaseDate) || text(prior.purchaseDate),
        asin: normalizeAsin(raw?.asin) || normalizeAsin(prior.asin)
      });
    });
    return [...matches.values()];
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
      const prior = existing.get(purchase.unitKey) || {};
      existing.set(purchase.unitKey, {
        ...prior,
        ...purchase,
        purchaseDate: text(purchase.purchaseDate) || text(prior.purchaseDate),
        orderUrl: text(purchase.orderUrl) || text(prior.orderUrl),
        capturedAt: text(purchase.capturedAt) || text(prior.capturedAt)
      });
    }
    return { ...run, purchases: [...existing.values()], updatedAt: new Date().toISOString() };
  }

  function resultForSale(sale, available, options = {}) {
    const asins = unique(sale.asins).map(normalizeAsin).filter(Boolean);
    if (!asins.length) return { status: "missing-sku", reason: "The marketplace SKU did not decode to an Amazon ASIN." };
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
    const platform = text(options.platform || sale.platform || "Poshmark");
    const computerLabel = text(sale.computerLabel || options.computerLabel || (platform === "Poshmark" ? "7" : ""));
    const accountLabel = text(sale.accountLabel || sale.poshmarkAccountLabel || sale.ebayAccountLabel);
    return {
      platform,
      computerLabel,
      accountLabel,
      ...(platform === "Poshmark" ? { poshmarkAccountLabel: accountLabel } : { ebayAccountLabel: accountLabel }),
      orderNumber: sale.orderNumber,
      itemTitle: sale.itemTitle,
      orderDate: sale.orderDate || "",
      orderStatus: sale.orderStatus || "",
      earningsStatus: sale.earningsStatus || "",
      monthKey: monthKeyForDate(sale.orderDate) || normalizeMonthKey(options.monthKey),
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
      source: text(options.source) || (platform === "eBay"
        ? options.scope === "resolve-ebay" ? "ebay-amazon-cost-resolution" : "ebay-amazon-order-reconciliation"
        : "poshmark-historical-profit-backfill"),
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
          record: buildProfitRecord(sale, outcome.purchases, { ...options, scope: run.scope, monthKey: run.monthKey }),
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

  function buildReviewRecord(run, result, options = {}) {
    const sale = (run.sales || []).find((item) => saleKey(item) === text(result?.orderNumber)) || {};
    const exact = result?.status === "exact" && result.record ? result.record : null;
    const supplierProfile = text(exact?.supplierProfile || options.supplierProfile);
    const platform = text(exact?.platform || sale.platform || run.platform || options.platform || "Poshmark");
    const earnings = Number(exact?.marketplaceEarnings ?? sale.marketplaceEarnings);
    const soldPrice = Number(exact?.marketplaceSoldPrice ?? sale.marketplaceSoldPrice);
    return {
      platform,
      computerLabel: text(exact?.computerLabel || sale.computerLabel || run.computerLabel || (platform === "Poshmark" ? "7" : "")),
      accountLabel: text(exact?.accountLabel || sale.accountLabel || sale.poshmarkAccountLabel),
      monthKey: normalizeMonthKey(exact?.monthKey) || monthKeyForDate(sale.orderDate) || normalizeMonthKey(run.monthKey),
      orderNumber: text(result?.orderNumber || sale.orderNumber),
      itemTitle: text(exact?.itemTitle || sale.itemTitle),
      marketplaceEarnings: Number.isFinite(earnings) ? earnings : null,
      marketplaceSoldPrice: Number.isFinite(soldPrice) ? soldPrice : null,
      orderDate: text(exact?.orderDate || sale.orderDate),
      orderStatus: text(exact?.orderStatus || sale.orderStatus),
      earningsStatus: text(exact?.earningsStatus || sale.earningsStatus),
      sku: text(exact?.sku || unique(sale.skus).join(", ") || sale.sku),
      supplierItemIds: text(exact?.supplierItemIds || unique(sale.asins).map(normalizeAsin).filter(Boolean).join(", ")),
      supplierTotal: exact && Number.isFinite(Number(exact.supplierTotal)) ? Number(exact.supplierTotal) : null,
      supplierProfile,
      supplierOrderNumber: text(exact?.supplierOrderNumber),
      supplierMatchSource: text(exact?.supplierMatchSource),
      supplierPageUrl: text(exact?.supplierPageUrl),
      supplierItemEvidence: text(exact?.supplierItemEvidence),
      profit: exact && Number.isFinite(Number(exact.profit)) ? Number(exact.profit) : null,
      margin: exact && Number.isFinite(Number(exact.margin)) ? Number(exact.margin) : null,
      noteStatus: text(sale.noteStatus),
      noteMarketplaceEarnings: sale.noteMarketplaceEarnings !== null && sale.noteMarketplaceEarnings !== undefined && sale.noteMarketplaceEarnings !== "" && Number.isFinite(Number(sale.noteMarketplaceEarnings))
        ? Number(sale.noteMarketplaceEarnings)
        : null,
      noteSupplierTotal: sale.noteSupplierTotal !== null && sale.noteSupplierTotal !== undefined && sale.noteSupplierTotal !== "" && Number.isFinite(Number(sale.noteSupplierTotal))
        ? Number(sale.noteSupplierTotal)
        : null,
      noteSupplierProfile: text(sale.noteSupplierProfile),
      noteProfit: sale.noteProfit !== null && sale.noteProfit !== undefined && sale.noteProfit !== "" && Number.isFinite(Number(sale.noteProfit))
        ? Number(sale.noteProfit)
        : null,
      noteText: text(sale.noteText),
      status: exact ? "resolved" : text(result?.status || "needs-review"),
      reason: exact ? "Exact Amazon order-item cost captured." : text(result?.reason || "Amazon cost still needs an exact order match."),
      pageUrl: text(exact?.pageUrl || sale.pageUrl),
      attemptedSupplierProfiles: supplierProfile ? [supplierProfile] : [],
      source: exact?.source || (run.scope === "resolve-ebay"
        ? "ebay-amazon-cost-resolution"
        : run.scope === "resolve-missing"
        ? "poshmark-amazon-cost-resolution"
        : "poshmark-monthly-profit-backfill"),
      capturedAt: new Date().toISOString()
    };
  }

  function reviewRecords(run, options = {}) {
    return (run.results || []).map((result) => buildReviewRecord(run, result, options));
  }

  function summary(run) {
    const results = run.results || [];
    const count = (status) => results.filter((result) => result.status === status).length;
    const exactRecords = results.filter((result) => result.status === "exact" && result.record).map((result) => result.record);
    return {
      runId: run.runId,
      scope: run.scope,
      supplierProfile: text(run.supplierProfile),
      monthKey: normalizeMonthKey(run.monthKey),
      monthLabel: monthLabel(run.monthKey),
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
      pending: results.filter((result) => !(run.syncedOrderNumbers || []).includes(result.orderNumber)).length,
      errors: (run.errors || []).length
    };
  }

  return Object.freeze({
    STATE_VERSION,
    DEFAULT_MATCH_WINDOW_DAYS,
    normalizeAsin,
    normalizeMonthKey,
    monthKeyForDate,
    monthLabel,
    parseDate,
    dayDifference,
    createRun,
    mergeSalesPage,
    mergeSaleDetail,
    amazonSearchMatchKey,
    mergeAmazonSearchMatches,
    addPurchase,
    allocate,
    summary,
    buildProfitRecord,
    buildReviewRecord,
    reviewRecords
  });
});
