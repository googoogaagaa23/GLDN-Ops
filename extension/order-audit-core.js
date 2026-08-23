(function attachOrderPlacementAuditCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GLDN_ORDER_PLACEMENT_AUDIT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STATE_VERSION = 1;
  const MONTH_KEY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
  const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
  const DEFAULT_MATCH_WINDOW_DAYS = 14;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set((values || []).map(text).filter(Boolean))];
  }

  function normalizeAsin(value) {
    const asin = text(value).toUpperCase();
    return ASIN_PATTERN.test(asin) ? asin : "";
  }

  function normalizeMonthKey(value) {
    const monthKey = text(value);
    return MONTH_KEY_PATTERN.test(monthKey) ? monthKey : "";
  }

  function monthLabel(value) {
    const monthKey = normalizeMonthKey(value);
    if (!monthKey) return "";
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });
  }

  function parseDate(value) {
    const raw = text(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  }

  function isoDate(value) {
    const timestamp = parseDate(value);
    if (timestamp === null) return "";
    const date = new Date(timestamp);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function dayDifference(fromValue, toValue) {
    const from = parseDate(fromValue);
    const to = parseDate(toValue);
    if (from === null || to === null) return null;
    return Math.round((to - from) / 86400000);
  }

  function normalizeIdentityText(value) {
    return text(value)
      .toLowerCase()
      .replace(/\b(?:ship(?:ping)? to|deliver(?:ing)? to|address|united states|usa|phone)\b/g, " ")
      .replace(/\b(?:apt|apartment|suite|ste|unit|floor|fl)\b/g, " unit ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function identityTokens(value) {
    return new Set(normalizeIdentityText(value).split(" ").filter((token) => token.length > 1));
  }

  function tokenSimilarity(left, right) {
    const a = identityTokens(left);
    const b = identityTokens(right);
    if (!a.size || !b.size) return null;
    let shared = 0;
    a.forEach((token) => {
      if (b.has(token)) shared += 1;
    });
    return shared / Math.min(a.size, b.size);
  }

  function shippingIdentity(shippingBlock) {
    const raw = text(shippingBlock);
    const lines = String(shippingBlock || "")
      .split(/\s*\|\s*|\n+/)
      .map(text)
      .filter(Boolean)
      .filter((line) => !/^(?:ship(?:ping)? to|deliver(?:ing)? to|shipping address|address)$/i.test(line))
      .filter((line) => !/^\d{3}-\d{7}-\d{7}$/.test(line))
      .filter((line) => !/^view invoice$/i.test(line));
    const recipient = lines.find((line) => (
      !/\d/.test(line)
      && !/\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|cir)\b/i.test(line)
    )) || lines[0] || "";
    const addressLines = lines.filter((line) => line !== recipient);
    return {
      shippingBlock: raw,
      recipient: text(recipient),
      recipientFingerprint: normalizeIdentityText(recipient),
      addressFingerprint: normalizeIdentityText(addressLines.join(" ") || raw)
    };
  }

  function runKey(input = {}) {
    const computer = text(input.computerLabel);
    const account = text(input.accountLabel || input.ebayAccountLabel).toUpperCase();
    const monthKey = normalizeMonthKey(input.monthKey);
    if (!computer || !account || !monthKey) return "";
    return [computer, account, monthKey].join("|");
  }

  function normalizeExpectedUnit(raw = {}) {
    const identity = shippingIdentity(raw.shippingBlock);
    const asin = normalizeAsin(raw.asin);
    const orderNumber = text(raw.orderNumber);
    const unitIndex = Math.max(1, Number.parseInt(raw.unitIndex || 1, 10) || 1);
    const computerLabel = text(raw.computerLabel);
    const accountLabel = text(raw.accountLabel || raw.ebayAccountLabel).toUpperCase();
    const monthKey = normalizeMonthKey(raw.monthKey) || isoDate(raw.orderDate).slice(0, 7);
    return {
      runKey: text(raw.runKey) || runKey({ computerLabel, accountLabel, monthKey }),
      computerLabel,
      accountLabel,
      ebayAccountLabel: accountLabel,
      monthKey,
      orderNumber,
      orderDate: isoDate(raw.orderDate),
      asin,
      unitIndex,
      unitKey: text(raw.unitKey) || [orderNumber, asin, unitIndex].join(":"),
      quantity: Math.max(1, Number.parseInt(raw.quantity || 1, 10) || 1),
      itemTitle: text(raw.itemTitle),
      orderStatus: text(raw.orderStatus),
      recipient: text(raw.recipient) || identity.recipient,
      recipientFingerprint: text(raw.recipientFingerprint) || identity.recipientFingerprint,
      addressFingerprint: text(raw.addressFingerprint) || identity.addressFingerprint,
      shippingBlock: text(raw.shippingBlock),
      pageUrl: text(raw.pageUrl),
      capturedAt: text(raw.capturedAt) || new Date().toISOString()
    };
  }

  function expectedUnitsFromMonthlyRun(run) {
    const units = [];
    (run?.results || []).forEach((result) => {
      const rawItems = Array.isArray(result?.items) && result.items.length
        ? result.items
        : unique(result?.asins).map((asin) => ({ asin, quantity: 1, itemTitle: result?.itemTitle }));
      rawItems.forEach((item) => {
        const asin = normalizeAsin(item?.asin);
        if (!asin) return;
        const quantity = Math.max(1, Math.min(100, Number.parseInt(item?.quantity || 1, 10) || 1));
        for (let unitIndex = 1; unitIndex <= quantity; unitIndex += 1) {
          units.push(normalizeExpectedUnit({
            runKey: runKey(run),
            computerLabel: run?.computerLabel,
            accountLabel: run?.accountLabel,
            monthKey: run?.monthKey,
            orderNumber: result?.orderNumber,
            orderDate: result?.orderDate,
            asin,
            unitIndex,
            quantity,
            itemTitle: item?.itemTitle || result?.itemTitle,
            orderStatus: result?.orderStatus,
            shippingBlock: result?.shippingBlock,
            recipient: result?.recipient,
            recipientFingerprint: result?.recipientFingerprint,
            addressFingerprint: result?.addressFingerprint,
            pageUrl: result?.pageUrl,
            capturedAt: result?.capturedAt
          }));
        }
      });
    });
    return units.filter((unit) => unit.runKey && unit.orderNumber && unit.asin);
  }

  function normalizePurchaseUnit(raw = {}) {
    const identity = shippingIdentity(raw.shippingBlock);
    const asin = normalizeAsin(raw.asin);
    const orderId = text(raw.orderId || raw.amazonOrderNumber);
    const unitIndex = Math.max(1, Number.parseInt(raw.unitIndex || 1, 10) || 1);
    const cost = Number(raw.cost ?? raw.total);
    return {
      runKey: text(raw.runKey),
      computerLabel: text(raw.computerLabel),
      monthKey: normalizeMonthKey(raw.monthKey),
      supplierProfile: text(raw.supplierProfile || raw.amazonProfile),
      seenProfiles: unique(raw.seenProfiles || [raw.supplierProfile || raw.amazonProfile]),
      orderId,
      purchaseDate: isoDate(raw.purchaseDate),
      asin,
      unitIndex,
      unitKey: text(raw.unitKey) || [orderId, asin, unitIndex].join(":"),
      quantity: Math.max(1, Number.parseInt(raw.quantity || 1, 10) || 1),
      title: text(raw.title || raw.itemTitle),
      cost: Number.isFinite(cost) && cost >= 0 ? Number(cost.toFixed(2)) : null,
      recipient: text(raw.recipient) || identity.recipient,
      recipientFingerprint: text(raw.recipientFingerprint) || identity.recipientFingerprint,
      addressFingerprint: text(raw.addressFingerprint) || identity.addressFingerprint,
      shippingBlock: text(raw.shippingBlock),
      orderUrl: text(raw.orderUrl || raw.amazonUrl),
      source: text(raw.source) || "amazon-order-detail-asin-row",
      capturedAt: text(raw.capturedAt) || new Date().toISOString()
    };
  }

  function expandPurchase(raw = {}) {
    const quantity = Math.max(1, Math.min(100, Number.parseInt(raw.quantity || 1, 10) || 1));
    return Array.from({ length: quantity }, (_, index) => normalizePurchaseUnit({
      ...raw,
      quantity,
      unitIndex: index + 1
    })).filter((purchase) => purchase.orderId && purchase.asin);
  }

  function dedupePurchases(records) {
    const byUnit = new Map();
    (records || []).flatMap((record) => record?.unitIndex ? [normalizePurchaseUnit(record)] : expandPurchase(record)).forEach((purchase) => {
      if (!purchase.orderId || !purchase.asin) return;
      const key = [purchase.orderId, purchase.asin, purchase.unitIndex].join(":");
      const previous = byUnit.get(key);
      byUnit.set(key, previous ? {
        ...previous,
        ...purchase,
        supplierProfile: previous.supplierProfile || purchase.supplierProfile,
        seenProfiles: unique([...(previous.seenProfiles || []), ...(purchase.seenProfiles || []), previous.supplierProfile, purchase.supplierProfile]),
        shippingBlock: previous.shippingBlock || purchase.shippingBlock,
        recipient: previous.recipient || purchase.recipient,
        recipientFingerprint: previous.recipientFingerprint || purchase.recipientFingerprint,
        addressFingerprint: previous.addressFingerprint || purchase.addressFingerprint
      } : purchase);
    });
    return [...byUnit.values()];
  }

  function identityMatch(expected, purchase) {
    const recipientSimilarity = tokenSimilarity(expected?.recipientFingerprint || expected?.recipient, purchase?.recipientFingerprint || purchase?.recipient);
    const addressSimilarity = tokenSimilarity(expected?.addressFingerprint || expected?.shippingBlock, purchase?.addressFingerprint || purchase?.shippingBlock);
    const recipientExact = Boolean(expected?.recipientFingerprint && purchase?.recipientFingerprint
      && expected.recipientFingerprint === purchase.recipientFingerprint);
    const addressExact = Boolean(expected?.addressFingerprint && purchase?.addressFingerprint
      && expected.addressFingerprint === purchase.addressFingerprint);
    const strong = addressExact
      || (addressSimilarity !== null && addressSimilarity >= 0.82)
      || (recipientExact && addressSimilarity !== null && addressSimilarity >= 0.55);
    return { recipientSimilarity, addressSimilarity, recipientExact, addressExact, strong };
  }

  function candidateScore(expected, purchase, windowDays = DEFAULT_MATCH_WINDOW_DAYS) {
    if (normalizeAsin(expected?.asin) !== normalizeAsin(purchase?.asin)) return null;
    const days = dayDifference(expected?.orderDate, purchase?.purchaseDate);
    if (days === null || days < -1 || days > windowDays) return null;
    const identity = identityMatch(expected, purchase);
    let score = Math.max(0, 30 - (Math.abs(days) * 3));
    if (identity.addressExact) score += 120;
    else if (identity.addressSimilarity !== null) score += identity.addressSimilarity * 90;
    if (identity.recipientExact) score += 70;
    else if (identity.recipientSimilarity !== null) score += identity.recipientSimilarity * 45;
    return { score, days, ...identity };
  }

  function isCanceledOrder(expected) {
    return /cancelled|canceled|refunded/i.test(text(expected?.orderStatus));
  }

  function audit(expectedRecords, purchaseRecords, options = {}) {
    const windowDays = Math.max(1, Number(options.matchWindowDays || DEFAULT_MATCH_WINDOW_DAYS));
    const expected = (expectedRecords || []).map(normalizeExpectedUnit).filter((unit) => unit.orderNumber && unit.asin);
    const purchases = dedupePurchases(purchaseRecords);
    const findings = [];
    const expectedByAsin = new Map();
    const purchasesByAsin = new Map();
    expected.forEach((unit) => {
      if (!expectedByAsin.has(unit.asin)) expectedByAsin.set(unit.asin, []);
      expectedByAsin.get(unit.asin).push(unit);
    });
    purchases.forEach((unit) => {
      if (!purchasesByAsin.has(unit.asin)) purchasesByAsin.set(unit.asin, []);
      purchasesByAsin.get(unit.asin).push(unit);
    });

    const allAsins = unique([...expectedByAsin.keys(), ...purchasesByAsin.keys()]);
    allAsins.forEach((asin) => {
      const demand = [...(expectedByAsin.get(asin) || [])].sort((a, b) => {
        const cancellationOrder = Number(isCanceledOrder(a)) - Number(isCanceledOrder(b));
        return cancellationOrder || String(a.orderDate).localeCompare(String(b.orderDate));
      });
      const supply = [...(purchasesByAsin.get(asin) || [])].sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
      const available = new Set(supply.map((_, index) => index));
      const matchedExpected = new Set();

      const strongCandidates = [];
      demand.forEach((expectedUnit, expectedIndex) => {
        supply.forEach((purchaseUnit, purchaseIndex) => {
          const score = candidateScore(expectedUnit, purchaseUnit, windowDays);
          if (score?.strong) strongCandidates.push({
            expectedIndex,
            purchaseIndex,
            allocationScore: score.score - (isCanceledOrder(expectedUnit) ? 1000 : 0),
            ...score
          });
        });
      });
      strongCandidates.sort((a, b) => b.allocationScore - a.allocationScore);
      strongCandidates.forEach((candidate) => {
        if (matchedExpected.has(candidate.expectedIndex) || !available.has(candidate.purchaseIndex)) return;
        matchedExpected.add(candidate.expectedIndex);
        available.delete(candidate.purchaseIndex);
        const expectedUnit = demand[candidate.expectedIndex];
        const purchaseUnit = supply[candidate.purchaseIndex];
        findings.push({
          status: isCanceledOrder(expectedUnit) ? "purchased-for-canceled-ebay" : "covered",
          severity: isCanceledOrder(expectedUnit) ? "high" : "ok",
          asin,
          expected: expectedUnit,
          purchase: purchaseUnit,
          match: candidate,
          reason: isCanceledOrder(expectedUnit)
            ? "Amazon purchase matches an eBay order that is now canceled or refunded."
            : "One Amazon purchase strongly matches one eBay order unit."
        });
      });

      const remainingExpected = demand.map((unit, index) => ({ unit, index })).filter(({ index }) => !matchedExpected.has(index));
      const remainingPurchases = supply.map((unit, index) => ({ unit, index })).filter(({ index }) => available.has(index));
      const weakCandidates = [];
      remainingExpected.forEach(({ unit: expectedUnit, index: expectedIndex }) => {
        remainingPurchases.forEach(({ unit: purchaseUnit, index: purchaseIndex }) => {
          const score = candidateScore(expectedUnit, purchaseUnit, windowDays);
          if (score) weakCandidates.push({
            expectedIndex,
            purchaseIndex,
            allocationScore: score.score - (isCanceledOrder(expectedUnit) ? 1000 : 0),
            ...score
          });
        });
      });
      weakCandidates.sort((a, b) => b.allocationScore - a.allocationScore);
      weakCandidates.forEach((candidate) => {
        if (matchedExpected.has(candidate.expectedIndex) || !available.has(candidate.purchaseIndex)) return;
        matchedExpected.add(candidate.expectedIndex);
        available.delete(candidate.purchaseIndex);
        const expectedUnit = demand[candidate.expectedIndex];
        const purchaseUnit = supply[candidate.purchaseIndex];
        findings.push({
          status: isCanceledOrder(expectedUnit) ? "purchased-for-canceled-ebay" : "covered-needs-review",
          severity: isCanceledOrder(expectedUnit) ? "high" : "review",
          asin,
          expected: expectedUnit,
          purchase: purchaseUnit,
          match: candidate,
          reason: isCanceledOrder(expectedUnit)
            ? "Amazon purchase may belong to an eBay order that is now canceled or refunded."
            : "Counts and dates align, but recipient/address evidence is incomplete or differs."
        });
      });

      demand.forEach((expectedUnit, index) => {
        if (matchedExpected.has(index)) return;
        const canceled = isCanceledOrder(expectedUnit);
        findings.push({
          status: canceled ? "canceled-no-amazon-purchase" : "missing-amazon-purchase",
          severity: canceled ? "ok" : "review",
          asin,
          expected: expectedUnit,
          purchase: null,
          reason: canceled
            ? "The eBay order is canceled or refunded and no Amazon purchase was found for it."
            : "No unused Amazon purchase for this eBay order unit was found in the scanned profiles and date window."
        });
      });

      supply.forEach((purchaseUnit, index) => {
        if (!available.has(index)) return;
        const sameRecipient = demand
          .map((expectedUnit) => ({ expectedUnit, identity: identityMatch(expectedUnit, purchaseUnit) }))
          .filter(({ identity }) => identity.strong)
          .sort((left, right) => Number(right.identity.addressSimilarity || 0) - Number(left.identity.addressSimilarity || 0))[0];
        findings.push({
          status: sameRecipient ? "duplicate-same-recipient" : "possible-extra-different-recipient",
          severity: sameRecipient ? "critical" : "high",
          asin,
          expected: sameRecipient?.expectedUnit || null,
          purchase: purchaseUnit,
          match: sameRecipient?.identity || null,
          reason: sameRecipient
            ? "Amazon has more units than eBay demand, and this extra unit strongly matches an eBay recipient/address."
            : "Amazon has more units than total eBay demand for this ASIN. The recipient differs or could not be verified."
        });
      });
    });

    const statusCounts = {};
    findings.forEach((finding) => {
      statusCounts[finding.status] = Number(statusCounts[finding.status] || 0) + 1;
    });
    return {
      generatedAt: new Date().toISOString(),
      expectedUnits: expected.length,
      amazonUnits: purchases.length,
      uniqueAmazonOrders: unique(purchases.map((purchase) => purchase.orderId)).length,
      profilesSeen: unique(purchases.flatMap((purchase) => purchase.seenProfiles || [purchase.supplierProfile])),
      statusCounts,
      findings: findings.sort((left, right) => {
        const order = { critical: 0, high: 1, review: 2, ok: 3 };
        return Number(order[left.severity] ?? 9) - Number(order[right.severity] ?? 9);
      })
    };
  }

  function summary(result) {
    const counts = result?.statusCounts || {};
    return {
      expectedUnits: Number(result?.expectedUnits || 0),
      amazonUnits: Number(result?.amazonUnits || 0),
      uniqueAmazonOrders: Number(result?.uniqueAmazonOrders || 0),
      profilesSeen: unique(result?.profilesSeen),
      covered: Number(counts.covered || 0),
      coveredNeedsReview: Number(counts["covered-needs-review"] || 0),
      duplicateSameRecipient: Number(counts["duplicate-same-recipient"] || 0),
      possibleExtraDifferentRecipient: Number(counts["possible-extra-different-recipient"] || 0),
      purchasedForCanceledEbay: Number(counts["purchased-for-canceled-ebay"] || 0),
      canceledNoAmazonPurchase: Number(counts["canceled-no-amazon-purchase"] || 0),
      missingAmazonPurchase: Number(counts["missing-amazon-purchase"] || 0)
    };
  }

  return Object.freeze({
    STATE_VERSION,
    DEFAULT_MATCH_WINDOW_DAYS,
    text,
    unique,
    normalizeAsin,
    normalizeMonthKey,
    monthLabel,
    isoDate,
    dayDifference,
    normalizeIdentityText,
    tokenSimilarity,
    shippingIdentity,
    runKey,
    normalizeExpectedUnit,
    expectedUnitsFromMonthlyRun,
    normalizePurchaseUnit,
    expandPurchase,
    dedupePurchases,
    identityMatch,
    candidateScore,
    isCanceledOrder,
    audit,
    summary
  });
});
