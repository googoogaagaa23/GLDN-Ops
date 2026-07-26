(function attachProfitAudit(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GLDN_PROFIT_AUDIT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function unique(values) {
    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function normalizeAsin(value) {
    const asin = String(value || "").trim().toUpperCase();
    return /^[A-Z0-9]{10}$/.test(asin) ? asin : "";
  }

  function selectMarketplaceItemTitle(candidates) {
    const noise = /^(skip to main content|main content|seller's other items|edit profile|message|message buyer|learn more|show contact info|view more details|add tracking)$/i;
    const normalized = (candidates || []).map((candidate) => {
      if (typeof candidate === "string") return { text: candidate.trim(), href: "" };
      return {
        text: String(candidate?.text || candidate?.title || "").trim(),
        href: String(candidate?.href || "").trim(),
        visible: candidate?.visible !== false
      };
    }).filter((candidate) => (
      candidate.text.length >= 12
      && candidate.text.length <= 500
      && !noise.test(candidate.text)
    ));
    const isItemLink = (candidate) => /(?:^|\/)(?:itm)\/(?:[^/?#]+\/)?\d+(?:[/?#]|$)/i.test(candidate.href);
    const itemLink = normalized.find((candidate) => candidate.visible && isItemLink(candidate))
      || normalized.find(isItemLink);
    return itemLink?.text || normalized[0]?.text || "";
  }

  function normalizeItem(item) {
    const asin = normalizeAsin(item?.asin);
    const cost = Number(item?.cost ?? item?.total);
    return {
      asin,
      cost: Number.isFinite(cost) ? Number(cost.toFixed(2)) : null,
      title: String(item?.title || "").trim(),
      orderId: String(item?.orderId || "").trim(),
      orderUrl: String(item?.orderUrl || item?.url || "").trim(),
      source: String(item?.source || "").trim(),
      capturedAt: String(item?.capturedAt || "").trim()
    };
  }

  function hasExactEvidence(item) {
    const normalized = normalizeItem(item);
    return Boolean(
      normalized.asin
      && normalized.cost !== null
      && normalized.cost > 0
      && normalized.orderId
      && /^https:\/\/www\.amazon\.com\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(normalized.orderUrl)
      && /^amazon-order-detail-/i.test(normalized.source)
    );
  }

  function mergeItems(existing, incoming) {
    const byAsin = new Map();
    for (const raw of [...(existing || []), ...(incoming || [])]) {
      const item = normalizeItem(raw);
      if (!item.asin || !hasExactEvidence(item)) continue;
      byAsin.set(item.asin, item);
    }
    return [...byAsin.values()];
  }

  function exactItemsForAsins(items, asins) {
    const byAsin = new Map(mergeItems([], items).map((item) => [item.asin, item]));
    return unique(asins).map(normalizeAsin).filter(Boolean).map((asin) => byAsin.get(asin) || null);
  }

  function sumItemCosts(items) {
    const normalized = (items || []).map(normalizeItem);
    if (!normalized.length || normalized.some((item) => item.cost === null || item.cost <= 0)) return null;
    return Number(normalized.reduce((sum, item) => sum + item.cost, 0).toFixed(2));
  }

  function validateAmazonPayloadForOrder(payload, order, options = {}) {
    if (!payload || payload.source !== "amazon") return { ok: false, error: "Amazon payload is missing." };
    const context = payload.marketplaceContext || {};
    if (context.platform !== "Poshmark") return { ok: false, error: "Amazon payload is not linked to Poshmark." };
    if (String(context.orderNumber || "") !== String(order?.orderNumber || "")) {
      return { ok: false, error: "Amazon payload belongs to a different Poshmark order." };
    }

    const requiredAsins = unique(order?.asins).map(normalizeAsin).filter(Boolean);
    if (!requiredAsins.length) return { ok: false, error: "No decoded Poshmark ASIN was supplied." };
    const contextAsins = unique(context.asins).map(normalizeAsin).filter(Boolean);
    if (!requiredAsins.every((asin) => contextAsins.includes(asin))) {
      return { ok: false, error: "Amazon context does not contain every decoded Poshmark ASIN." };
    }

    const exactItems = exactItemsForAsins(payload.items, requiredAsins);
    const missingAsins = requiredAsins.filter((asin, index) => !exactItems[index]);
    if (missingAsins.length) {
      return { ok: false, error: `Exact Amazon order evidence is missing for ${missingAsins.join(", ")}.`, missingAsins };
    }

    const total = sumItemCosts(exactItems);
    const payloadTotal = Number(payload.total);
    if (total === null || !Number.isFinite(payloadTotal) || Math.abs(total - payloadTotal) > 0.009) {
      return { ok: false, error: "Amazon total does not equal the exact matched item costs." };
    }

    const now = Number(options.now || Date.now());
    const ttlMs = Number(options.ttlMs || 2 * 60 * 60 * 1000);
    const linkedAt = new Date(context.linkedAt || payload.capturedAt || 0).getTime();
    if (!Number.isFinite(linkedAt) || now - linkedAt > ttlMs || linkedAt - now > 60 * 1000) {
      return { ok: false, error: "Amazon match is stale." };
    }
    return { ok: true, items: exactItems, total };
  }

  function supplierAuditFields(items) {
    const exact = mergeItems([], items);
    return {
      supplierItemIds: unique(exact.map((item) => item.asin)).join(", "),
      supplierOrderNumber: unique(exact.map((item) => item.orderId)).join(", "),
      supplierMatchSource: unique(exact.map((item) => item.source)).join(", "),
      supplierPageUrl: unique(exact.map((item) => item.orderUrl)).join(" | "),
      supplierItemEvidence: JSON.stringify(exact)
    };
  }

  function orderIdFromAmazonUrl(value) {
    const match = String(value || "").match(/[?&]orderI[Dd]=([^&#]+)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]).trim();
    } catch (_) {
      return String(match[1] || "").trim();
    }
  }

  function validateAmazonPayloadForEbayOrder(payload, order, options = {}) {
    if (!payload || payload.source !== "amazon") return { ok: false, error: "Amazon payload is missing." };

    const orderNumber = String(order?.orderNumber || "").trim();
    if (!orderNumber) return { ok: false, error: "The eBay order number was not detected." };

    const skus = unique(order?.skus);
    const requiredAsins = unique(order?.asins).map(normalizeAsin).filter(Boolean);
    if (!skus.length || !requiredAsins.length) {
      return { ok: false, error: "The eBay Custom label (SKU) did not decode into an Amazon ASIN." };
    }

    const payloadAsins = unique(payload.asins).map(normalizeAsin).filter(Boolean);
    const sameAsins = payloadAsins.length === requiredAsins.length
      && requiredAsins.every((asin) => payloadAsins.includes(asin));
    if (!sameAsins) {
      return {
        ok: false,
        error: `Amazon ASINs ${payloadAsins.join(", ") || "not detected"} do not exactly match eBay SKU ASINs ${requiredAsins.join(", ")}.`
      };
    }

    const orderIds = unique([payload.orderId, ...(payload.orderIds || [])]);
    if (orderIds.length !== 1 || !/^\d{3}-\d{7}-\d{7}$/.test(orderIds[0])) {
      return { ok: false, error: "The Amazon payload does not identify one exact supplier order." };
    }
    const supplierOrderNumber = orderIds[0];
    const supplierPageUrl = String(payload.url || "").trim();
    const urlOrderId = orderIdFromAmazonUrl(supplierPageUrl);
    if (!/^https:\/\/www\.amazon\.com\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(supplierPageUrl)
      || urlOrderId !== supplierOrderNumber) {
      return { ok: false, error: "The Amazon order URL does not match the captured supplier order." };
    }

    const supplierMatchSource = String(payload.evidenceSource || "").trim();
    if (payload.exactOrderDetails !== true || supplierMatchSource !== "amazon-order-details-card") {
      return { ok: false, error: "The Amazon payload was not captured from one verified order-details card." };
    }

    const total = Number(payload.total);
    if (!Number.isFinite(total) || total <= 0) return { ok: false, error: "The exact Amazon order total is missing." };

    const now = Number(options.now || Date.now());
    const ttlMs = Number(options.ttlMs || 2 * 60 * 60 * 1000);
    const capturedAt = new Date(payload.capturedAt || 0).getTime();
    if (!Number.isFinite(capturedAt) || now - capturedAt > ttlMs || capturedAt - now > 60 * 1000) {
      return { ok: false, error: "Amazon order evidence is stale. Copy it again from the exact Amazon order." };
    }

    const evidence = requiredAsins.map((asin) => ({
      asin,
      orderId: supplierOrderNumber,
      orderUrl: supplierPageUrl,
      orderTotal: Number(total.toFixed(2)),
      source: supplierMatchSource,
      capturedAt: String(payload.capturedAt || ""),
      exactOrderDetails: true
    }));
    return {
      ok: true,
      total: Number(total.toFixed(2)),
      orderNumber,
      skus,
      asins: requiredAsins,
      supplierAudit: {
        supplierItemIds: requiredAsins.join(", "),
        supplierOrderNumber,
        supplierMatchSource,
        supplierPageUrl,
        supplierItemEvidence: JSON.stringify(evidence)
      }
    };
  }

  function amazonOrderSearchQueries(context) {
    const stop = new Set(["a", "an", "and", "for", "from", "in", "of", "the", "to", "with"]);
    const titleTokens = String(context?.itemTitle || "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length >= 2 && !stop.has(token.toLowerCase()));
    const distinctTokens = unique(titleTokens.map((token) => token.toLowerCase()));
    const longTitleQuery = distinctTokens.slice(0, 7).join(" ");
    const shortTitleQuery = distinctTokens.slice(0, 4).join(" ");
    const asins = unique(context?.asins).map(normalizeAsin).filter(Boolean);
    return unique([longTitleQuery, shortTitleQuery, ...asins]);
  }

  return {
    normalizeAsin,
    selectMarketplaceItemTitle,
    normalizeItem,
    hasExactEvidence,
    mergeItems,
    exactItemsForAsins,
    sumItemCosts,
    validateAmazonPayloadForOrder,
    validateAmazonPayloadForEbayOrder,
    supplierAuditFields,
    amazonOrderSearchQueries
  };
});
