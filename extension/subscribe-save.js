(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GLDN_SUBSCRIBE_SAVE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const APPROVAL_PREFIX = "APPROVE CANCEL SUBSCRIPTIONS";

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTitle(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function approvalToken(count) {
    const normalized = Number(count);
    if (!Number.isInteger(normalized) || normalized < 1) return "";
    return `${APPROVAL_PREFIX} ${normalized}`;
  }

  function validateApprovalToken(value, count) {
    const expected = approvalToken(count);
    return Boolean(expected) && cleanText(value) === expected;
  }

  function isRecommendationText(value) {
    const text = cleanText(value);
    return /\b(recommended for you|subscribe now|add new subscriptions|buy it again|shop subscriptions|more like this)\b/i.test(text);
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function reviewSignature(target = {}) {
    const subscriptionKey = cleanText(target.subscriptionKey).toLowerCase();
    if (subscriptionKey) return `key|${subscriptionKey}`;
    return [
      cleanText(target.asin).toUpperCase(),
      normalizeTitle(target.title),
      normalizeTitle(target.address),
      normalizeTitle(target.schedule)
    ].join("|");
  }

  function reviewSignatureList(targets) {
    return (Array.isArray(targets) ? targets : [])
      .map((target) => reviewSignature(target))
      .filter(Boolean)
      .sort();
  }

  function stableTargetId(target = {}, index = 0) {
    const subscriptionKey = cleanText(target.subscriptionKey).toLowerCase();
    if (subscriptionKey) return `subscription-${hashText(subscriptionKey)}`;
    const signature = reviewSignature(target);
    const occurrence = Math.max(1, Number(target.occurrence) || (Number(index) + 1) || 1);
    const source = `${signature || "unknown"}|occurrence-${occurrence}`;
    const asin = cleanText(target.asin).toUpperCase();
    return asin ? `asin-${asin}-${hashText(source)}` : `subscription-${hashText(source)}`;
  }

  function normalizeTarget(target = {}, index = 0) {
    const normalized = {
      id: cleanText(target.id),
      title: cleanText(target.title),
      asin: cleanText(target.asin).toUpperCase(),
      href: cleanText(target.href),
      address: cleanText(target.address),
      schedule: cleanText(target.schedule),
      subscriptionKey: cleanText(target.subscriptionKey),
      occurrence: Math.max(1, Number(target.occurrence) || (Number(index) + 1) || 1),
      layout: cleanText(target.layout),
      status: cleanText(target.status) || "pending"
    };
    if (!normalized.id) normalized.id = stableTargetId(normalized, index);
    return normalized;
  }

  function uniqueTargets(targets) {
    const result = [];
    const explicitKeys = new Set();
    const occurrences = new Map();
    for (const [index, raw] of (Array.isArray(targets) ? targets : []).entries()) {
      const target = normalizeTarget(raw, index);
      if (!target.title || isRecommendationText(target.title)) continue;
      const signature = reviewSignature(target);
      if (!signature.replace(/\|/g, "")) continue;
      const explicitKey = cleanText(target.subscriptionKey).toLowerCase();
      if (explicitKey) {
        if (explicitKeys.has(explicitKey)) continue;
        explicitKeys.add(explicitKey);
        result.push({ ...target, occurrence: 1, id: stableTargetId({ ...target, occurrence: 1 }, 0) });
        continue;
      }
      const occurrence = (occurrences.get(signature) || 0) + 1;
      occurrences.set(signature, occurrence);
      result.push({ ...target, occurrence, id: stableTargetId({ ...target, occurrence }, occurrence - 1) });
    }
    return result;
  }

  function completionProof(record = {}) {
    const remainingCount = Number(record.remainingCount);
    const failedCount = Number(record.failedCount);
    const cancelledCount = Number(record.cancelledCount);
    const scannedCount = Number(record.scannedCount);
    const verifiedScopes = Number(record.verifiedScopeCount);
    const expectedScopes = Number(record.expectedScopeCount);
    const ok = record.status === "Completed"
      && record.proofType === "verified-zero-active-subscriptions-current-profile"
      && record.currentProfileVerified === true
      && record.verifiedZeroRemaining === true
      && remainingCount === 0
      && failedCount === 0
      && verifiedScopes > 0
      && expectedScopes > 0
      && verifiedScopes === expectedScopes;
    return {
      ok,
      remainingCount,
      failedCount,
      cancelledCount: Number.isFinite(cancelledCount) ? cancelledCount : 0,
      scannedCount: Number.isFinite(scannedCount) ? scannedCount : 0,
      verifiedScopeCount: Number.isFinite(verifiedScopes) ? verifiedScopes : 0,
      expectedScopeCount: Number.isFinite(expectedScopes) ? expectedScopes : 0
    };
  }

  return Object.freeze({
    APPROVAL_PREFIX,
    cleanText,
    normalizeTitle,
    approvalToken,
    validateApprovalToken,
    isRecommendationText,
    reviewSignature,
    reviewSignatureList,
    stableTargetId,
    normalizeTarget,
    uniqueTargets,
    completionProof
  });
});
