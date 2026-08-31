(function initializePolicyListingAuditCore(root, factory) {
  "use strict";

  if (root.GLDN_POLICY_LISTING_AUDIT) return;
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GLDN_POLICY_LISTING_AUDIT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function policyListingAuditFactory(root) {
  "use strict";

  function normalizeText(value) {
    return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  }

  function validItemId(value) {
    const itemId = String(value || "").trim();
    return /^\d{9,15}$/.test(itemId) ? itemId : "";
  }

  function decodeBase64(value) {
    const input = String(value || "").trim().replace(/-/g, "+").replace(/_/g, "/");
    const padded = input.padEnd(Math.ceil(input.length / 4) * 4, "=");
    try {
      if (typeof root.atob === "function") return root.atob(padded);
      if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
    } catch (_) {
      return "";
    }
    return "";
  }

  function decodeSkuToAsin(value) {
    const sku = normalizeText(value);
    if (/^[A-Z0-9]{10}$/i.test(sku)) return sku.toUpperCase();
    const decoded = normalizeText(decodeBase64(sku));
    return /^[A-Z0-9]{10}$/i.test(decoded) ? decoded.toUpperCase() : "";
  }

  function normalizeListingRecord(value = {}) {
    const itemId = validItemId(value.itemId);
    if (!itemId) return null;
    const sku = normalizeText(value.sku);
    const asin = /^[A-Z0-9]{10}$/i.test(String(value.asin || "").trim())
      ? String(value.asin).trim().toUpperCase()
      : decodeSkuToAsin(sku);
    const price = value.price == null || value.price === "" ? NaN : Number(value.price);
    return {
      itemId,
      title: normalizeText(value.title),
      sku,
      asin,
      category: normalizeText(value.category),
      price: Number.isFinite(price) ? price : null
    };
  }

  function listingPreflightRow(listing, index) {
    const title = normalizeText(listing.title);
    const asin = normalizeText(listing.asin).toUpperCase();
    const category = normalizeText(listing.category);
    return {
      index: Number(index || 0) + 1,
      input: normalizeText([title, category, asin ? `ASIN: ${asin}` : ""].filter(Boolean).join(" | ")),
      title,
      urls: [],
      amazonUrls: [],
      asins: asin ? [asin] : [],
      urlSearchText: "",
      clearanceText: title,
      sourceKind: "active-listing-title-only",
      hasProductEvidence: Boolean(title || category)
    };
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function rulePackFingerprint(rulePack = {}, preflight = root.GLDN_LISTING_PREFLIGHT) {
    if (!preflight) throw new Error("Listing Preflight did not load.");
    const pack = preflight.normalizeRulePack(rulePack);
    const signature = JSON.stringify({
      schemaVersion: pack.schemaVersion,
      version: pack.version,
      generatedAt: pack.generatedAt,
      sourceGeneratedAt: pack.sourceGeneratedAt,
      valid: pack.valid,
      validationErrors: pack.validationErrors,
      clearancePolicy: pack.clearancePolicy,
      policyCoverage: pack.policyCoverage,
      rules: pack.rules.map((rule) => ({
        id: rule.id,
        type: rule.type,
        value: rule.value,
        allOf: rule.allOf,
        anyOf: rule.anyOf,
        noneOf: rule.noneOf,
        action: rule.action,
        reason: rule.reason,
        policyTopic: rule.policyTopic,
        evidenceKind: rule.evidenceKind,
        reviewedBy: rule.reviewedBy,
        reviewedAt: rule.reviewedAt,
        source: rule.source,
        sourceType: rule.sourceType,
        authority: rule.authority,
        evidenceUrls: rule.evidenceUrls
      }))
    });
    return `policy-rules-${fnv1a(signature)}`;
  }

  function buildPolicyAudit(records, rulePack, metadata = {}, preflight = root.GLDN_LISTING_PREFLIGHT) {
    if (!preflight) throw new Error("Listing Preflight did not load.");
    const pack = preflight.normalizeRulePack(rulePack);
    if (!pack.rules.length) throw new Error("No reviewed policy rules are loaded. Existing listings cannot be classified.");

    const unique = new Map();
    for (const raw of Array.isArray(records) ? records : []) {
      const record = normalizeListingRecord(raw);
      if (!record) continue;
      if (unique.has(record.itemId)) throw new Error(`Duplicate Active Listing item number: ${record.itemId}.`);
      unique.set(record.itemId, record);
    }
    const listings = [...unique.values()];
    const evaluated = preflight.evaluateRows(
      listings.map((listing, index) => listingPreflightRow(listing, index)),
      pack
    );
    const results = listings.map((listing, index) => {
      const result = evaluated[index];
      return {
        ...listing,
        action: String(result.action || "review"),
        status: String(result.status || "REVIEW"),
        reason: normalizeText(result.reason),
        matches: (Array.isArray(result.matches) ? result.matches : []).map((rule) => ({
          id: normalizeText(rule.id),
          type: normalizeText(rule.type),
          value: normalizeText(rule.value),
          allOf: Array.isArray(rule.allOf) ? rule.allOf.map(normalizeText).filter(Boolean) : [],
          anyOf: Array.isArray(rule.anyOf) ? rule.anyOf.map(normalizeText).filter(Boolean) : [],
          noneOf: Array.isArray(rule.noneOf) ? rule.noneOf.map(normalizeText).filter(Boolean) : [],
          action: normalizeText(rule.action),
          reason: normalizeText(rule.reason),
          policyTopic: normalizeText(rule.policyTopic),
          evidenceKind: normalizeText(rule.evidenceKind),
          source: normalizeText(rule.source),
          sourceType: normalizeText(rule.sourceType),
          authority: normalizeText(rule.authority),
          evidenceUrls: Array.isArray(rule.evidenceUrls) ? rule.evidenceUrls.map(normalizeText).filter(Boolean) : []
        }))
      };
    });
    results.sort((left, right) => {
      const rank = { block: 0, review: 1, clear: 2 };
      return Number(rank[left.action] ?? 3) - Number(rank[right.action] ?? 3)
        || left.title.localeCompare(right.title)
        || left.itemId.localeCompare(right.itemId);
    });

    const baseSummary = preflight.summarizeResults(results);
    const summary = {
      ...baseSummary,
      authenticityReview: results.filter((listing) => listing.action === "review" && listing.matches.some((match) => /counterfeit|intellectual property|authentic/i.test(match.policyTopic))).length
    };
    const scannedAt = String(metadata.scannedAt || new Date().toISOString());
    const computerLabel = normalizeText(metadata.computerLabel);
    const ebayAccountLabel = normalizeText(metadata.ebayAccountLabel).toUpperCase();
    const rulesFingerprint = rulePackFingerprint(pack, preflight);
    const resultSignature = results.map((listing) => `${listing.itemId}:${listing.action}:${listing.matches.map((match) => match.id || `${match.type}:${match.value}`).join(",")}`).join("|");
    return {
      schemaVersion: 2,
      source: "complete-active-listings-policy-scan",
      reportName: "Existing Listings Policy Audit",
      reportFingerprint: `policy-listings-${fnv1a(`${computerLabel}|${ebayAccountLabel}|${scannedAt}|${resultSignature}`)}`,
      rulesFingerprint,
      rulesGeneratedAt: pack.generatedAt,
      rulesVersion: pack.version,
      clearanceProfileVersion: pack.clearancePolicy.version,
      ruleCount: pack.ruleCount,
      scannedAt,
      importedAt: scannedAt,
      computerLabel,
      ebayAccountLabel,
      totalListings: listings.length,
      summary,
      listings: results
    };
  }

  function blockItemIds(audit, requestedIds = [], completedIds = []) {
    const completed = new Set((completedIds || []).map(String));
    const block = new Set((audit?.listings || [])
      .filter((listing) => listing.action === "block")
      .map((listing) => String(listing.itemId)));
    const requested = Array.isArray(requestedIds) ? requestedIds.map(String) : [];
    const unique = [...new Set(requested)];
    if (!unique.length || unique.length !== requested.length) {
      throw new Error("Choose one or more unique Block listings.");
    }
    for (const itemId of unique) {
      if (!block.has(itemId)) throw new Error(`Listing ${itemId} is not a current reviewed Block match.`);
      if (completed.has(itemId)) throw new Error(`Listing ${itemId} is already recorded as ended for this audit.`);
    }
    return unique;
  }

  function normalizeEndSubmissionOutcome(itemIds = [], response = {}) {
    const requestedItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
      .map(validItemId)
      .filter(Boolean))];
    const explicitFailedItemIds = [...new Set((Array.isArray(response.failedItemIds) ? response.failedItemIds : [])
      .map(validItemId)
      .filter((itemId) => requestedItemIds.includes(itemId)))];
    const messageType = normalizeText(response.messageType).toUpperCase();
    const message = normalizeText(response.message);
    const evidenceText = normalizeText(response.evidenceText);
    const combined = `${message} ${evidenceText}`.trim();
    const globalFailure = response.ok === false
      || /^(?:ERROR|FAIL|FAILED|FAILURE|WARNING)$/.test(messageType)
      || /\b(?:listing item|listing|item)\s+(?:is|was|are|were)\s+missing\b/i.test(combined)
      || /\bunable to process\b/i.test(combined)
      || /\b(?:could not|couldn't|cannot|can't|was not|were not|not)\s+(?:be\s+)?(?:processed|ended|removed)\b/i.test(combined)
      || /\b(?:request|operation|submission)\s+(?:has\s+)?failed\b/i.test(combined);
    const failedItemIds = globalFailure && !explicitFailedItemIds.length
      ? requestedItemIds
      : explicitFailedItemIds;
    const failed = new Set(failedItemIds);
    return {
      successfulItemIds: requestedItemIds.filter((itemId) => !failed.has(itemId)),
      failedItemIds,
      messageType,
      message,
      globalFailure
    };
  }

  function compactControlRecord(audit = {}) {
    const listings = Array.isArray(audit.listings) ? audit.listings : [];
    const allBlocks = listings.filter((listing) => listing?.action === "block");
    const blockListings = allBlocks.slice(0, 200).map((listing) => ({
      itemId: validItemId(listing.itemId),
      title: normalizeText(listing.title),
      sku: normalizeText(listing.sku),
      asin: normalizeText(listing.asin).toUpperCase(),
      category: normalizeText(listing.category),
      price: Number.isFinite(Number(listing.price)) ? Number(listing.price) : null,
      reason: normalizeText(listing.reason),
      matchedRules: (Array.isArray(listing.matches) ? listing.matches : []).map((match) => ({
        id: normalizeText(match.id),
        reason: normalizeText(match.reason),
        source: normalizeText(match.source),
        evidenceUrls: Array.isArray(match.evidenceUrls)
          ? match.evidenceUrls.map(normalizeText).filter(Boolean)
          : [],
        policyTopic: normalizeText(match.policyTopic)
      }))
    }));
    return {
      schemaVersion: Number(audit.schemaVersion || 0),
      source: normalizeText(audit.source),
      reportName: normalizeText(audit.reportName),
      reportFingerprint: normalizeText(audit.reportFingerprint),
      rulesFingerprint: normalizeText(audit.rulesFingerprint),
      rulesGeneratedAt: String(audit.rulesGeneratedAt || ""),
      rulesVersion: normalizeText(audit.rulesVersion),
      clearanceProfileVersion: normalizeText(audit.clearanceProfileVersion),
      ruleCount: Number(audit.ruleCount || 0),
      scannedAt: String(audit.scannedAt || ""),
      computerLabel: normalizeText(audit.computerLabel),
      ebayAccountLabel: normalizeText(audit.ebayAccountLabel).toUpperCase(),
      totalListings: Number(audit.totalListings || listings.length || 0),
      summary: {
        total: Number(audit.summary?.total || audit.totalListings || listings.length || 0),
        clear: Number(audit.summary?.clear || 0),
        review: Number(audit.summary?.review || 0),
        block: Number(audit.summary?.block || 0),
        authenticityReview: Number(audit.summary?.authenticityReview || 0)
      },
      blockListings,
      blockListingsTruncated: allBlocks.length > blockListings.length
    };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function auditCsv(audit) {
    const headers = [
      "Item number", "Title", "Custom label (SKU)", "Decoded ASIN", "Current price",
      "Classification", "Policy topic", "Reason", "Matched rules", "Evidence URLs"
    ];
    const body = (audit?.listings || []).map((listing) => [
      listing.itemId,
      listing.title,
      listing.sku,
      listing.asin,
      Number.isFinite(Number(listing.price)) ? Number(listing.price).toFixed(2) : "",
      listing.action,
      (listing.matches || []).map((match) => match.policyTopic).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" | "),
      listing.reason,
      (listing.matches || []).map((match) => `${match.action}:${match.type}:${match.value}`).join(" | "),
      (listing.matches || []).flatMap((match) => match.evidenceUrls || []).filter((url, index, values) => values.indexOf(url) === index).join(" | ")
    ]);
    return [headers, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  function formatMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `$${number.toFixed(2)}` : "Not reported";
  }

  return Object.freeze({
    normalizeText,
    validItemId,
    decodeSkuToAsin,
    normalizeListingRecord,
    listingPreflightRow,
    rulePackFingerprint,
    buildPolicyAudit,
    blockItemIds,
    normalizeEndSubmissionOutcome,
    compactControlRecord,
    auditCsv,
    formatMoney
  });
});
