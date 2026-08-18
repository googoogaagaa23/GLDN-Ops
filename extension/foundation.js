(function initializeGldnFoundation(root) {
  "use strict";

  if (root.GLDN_FOUNDATION) return;

  const config = root.GLDN_CONFIG || {};
  const fallbackAccounts = {
    M0: { ebayAccountLabel: "CLICKNCARRY", display: "M0 - ClickNCarry", poshmarkComputerLabel: "M0" },
    "2": { ebayAccountLabel: "FANCYFI", display: "2 - FancyFi" },
    "6": { ebayAccountLabel: "FINTIME", display: "6 - Fintime" },
    "0": { ebayAccountLabel: "FAK12", display: "0 - FAK12", poshmarkComputerLabel: "7" },
    M1: { ebayAccountLabel: "HEARTSTONE", display: "M1 - Heartstone" },
    "7": { ebayAccountLabel: "", display: "7 - FarPosh", poshmarkOnly: true, poshmarkComputerLabel: "7" }
  };

  const accountEntries = Object.entries(config.computerAccounts || fallbackAccounts);
  const computerAccounts = Object.freeze(Object.fromEntries(accountEntries.map(([computer, account]) => [
    String(computer),
    Object.freeze({
      ebayAccountLabel: String(account?.ebayAccountLabel || "").trim().toUpperCase(),
      display: String(account?.display || computer).trim(),
      poshmarkOnly: Boolean(account?.poshmarkOnly),
      poshmarkComputerLabel: String(account?.poshmarkComputerLabel || "").trim()
    })
  ])));
  const preferredComputerOrder = Object.freeze(["M0", "2", "6", "0", "M1", "7"]);
  const computerOptions = Object.freeze([
    ...preferredComputerOrder.filter((computer) => Object.prototype.hasOwnProperty.call(computerAccounts, computer)),
    ...Object.keys(computerAccounts).filter((computer) => !preferredComputerOrder.includes(computer))
  ]);
  const ebayAccountOptions = Object.freeze(Array.from(new Set(
    computerOptions.map((computer) => computerAccounts[computer]?.ebayAccountLabel).filter(Boolean)
  )));
  const genericMove99Defaults = Object.freeze({
    sourceCategories: Object.freeze(["Not .99", "Other"]),
    destinationCategory: "Abra Cadabra .99",
    sourceStoreCategoryIds: Object.freeze([]),
    backburnerItemIds: Object.freeze([])
  });
  const canonicalMove99AccountDefaults = Object.freeze({
    FAK12: Object.freeze({
      sourceCategories: Object.freeze(["Not .99", "Other"]),
      destinationCategory: "Abra Cadabra .99",
      sourceStoreCategoryIds: Object.freeze(["44678633011", "1"]),
      backburnerItemIds: Object.freeze([
        "318521296686",
        "318572900833",
        "318576390693",
        "318576892301",
        "318601468678"
      ])
    }),
    FANCYFI: Object.freeze({
      sourceCategories: Object.freeze(["SNI", "SNIPO v2"]),
      destinationCategory: "DAILY",
      sourceStoreCategoryIds: Object.freeze(["23845190015", "24051049015"]),
      backburnerItemIds: Object.freeze([])
    }),
    HEARTSTONE: Object.freeze({
      sourceCategories: Object.freeze(["SNIP'D"]),
      destinationCategory: ".99",
      sourceStoreCategoryIds: Object.freeze([]),
      backburnerItemIds: Object.freeze([])
    })
  });
  const workflowStateKeys = Object.freeze([
    "gldnWorkflowReservation",
    "gldnOpenReviews",
    "pendingMove99Run",
    "pendingVariationEndReview",
    "pendingPolicyListingEndReview",
    "ebayPolicyListingScanState",
    "pendingMarkShippedRun",
    "pendingSellerLevelScan",
    "pendingReviewMonthlyLimits",
    "pendingEbaySnapshotScan",
    "pendingSnipingExtract",
    "pendingSnipingWinner",
    "pendingAmazonSnipingWorkflowStart",
    "pendingAmazonSubscribeSaveRun",
    "pendingPoshmarkStatsScan",
    "ebayMonthlyProfit",
    "poshmarkProfitBackfill",
    "pendingWalmartAutoOrder"
  ]);
  const BULK_PRODUCT_EXCLUSION_RE = /\b(shoe|shoes|sneaker|sneakers|sandals?|slippers?|boots?|clogs?|crocs|socks?|shirt|shirts|t-?shirt|hoodie|sweater|jacket|coat|dress|dresses|skirt|jeans|pants|leggings|shorts?|underwear|boxers?|briefs?|bra|bras|lingerie|swimsuit|bikini|clothing|apparel|fashion|costumes?|cosplay|outfits?|handbags?|purses?|crossbody|wallets?|clutch)\b/i;
  const PORTABLE_MOVE99_SCAN_STRATEGY = "active-page-exact-id-v1";
  const REVERSE_MOVE99_SALE_EVENT_PROMPT = [
    "Is a sale event active right now?",
    "Move Non-.99 Out of Sale reads the displayed eBay prices and only works when the sale event is OFF.",
    "Choose Sale Event Is OFF to continue, or Sale Event Is ON to stop."
  ].join("\n\n");
  const REVERSE_MOVE99_SALE_EVENT_BLOCKED_MESSAGE = "Sale event must be turned off for Move Non-.99 Out of Sale to work properly. No scan was started.";

  function normalizeComputer(value, fallback = "") {
    const cleaned = String(value || "").trim().toLowerCase().replace(/^comp(?:uter)?\s*/i, "");
    return computerOptions.find((option) => option.toLowerCase() === cleaned)
      || (computerOptions.includes(String(fallback)) ? String(fallback) : "");
  }

  function normalizeEbayAccount(value) {
    const cleaned = String(value || "").trim().toUpperCase();
    return ebayAccountOptions.find((option) => option === cleaned) || "";
  }

  function identityForComputer(value, fallback = "") {
    const computerLabel = normalizeComputer(value, fallback);
    const mapped = computerAccounts[computerLabel] || {};
    return Object.freeze({
      computerLabel,
      ebayAccountLabel: mapped.ebayAccountLabel || "",
      display: mapped.display || computerLabel,
      poshmarkOnly: Boolean(mapped.poshmarkOnly),
      poshmarkComputerLabel: mapped.poshmarkComputerLabel || ""
    });
  }

  function poshmarkIdentityForComputer(value, fallback = "") {
    const identity = identityForComputer(value, fallback);
    return Object.freeze({
      savedComputerLabel: identity.computerLabel,
      computerLabel: identity.poshmarkComputerLabel || "",
      enabled: Boolean(identity.poshmarkComputerLabel),
      displayComputerLabel: identity.poshmarkComputerLabel && identity.poshmarkComputerLabel !== identity.computerLabel
        ? `${identity.computerLabel} + ${identity.poshmarkComputerLabel}`
        : identity.computerLabel
    });
  }

  function poshmarkAccountLabel(signals = {}) {
    const normalize = (value) => {
      const candidate = String(value || "").trim().replace(/^@/, "");
      if (!/^[a-z0-9_.-]{2,40}$/i.test(candidate)) return "";
      if (/poshmark|search|sell|logo|icon|united states|country|menu/i.test(candidate)) return "";
      return candidate;
    };

    for (const href of signals.closetHrefs || []) {
      const match = String(href || "").match(/^(?:https?:\/\/[^/]+)?\/(?:closet|user|users)\/([a-z0-9_.-]+)\/?(?:[?#].*)?$/i);
      const candidate = normalize(match?.[1]);
      if (candidate) return candidate;
    }

    for (const alt of signals.avatarAlts || []) {
      const candidate = normalize(alt);
      if (candidate) return candidate;
    }
    return "";
  }

  function clampUiOpacity(value) {
    const minimum = Number(config.minimumUiOpacity ?? 0);
    const maximum = Number(config.maximumUiOpacity ?? 100);
    const fallback = Number(config.defaultUiOpacity ?? 75);
    const parsed = Number(value);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback));
  }

  function allowedBulkProductTitle(value) {
    return !BULK_PRODUCT_EXCLUSION_RE.test(String(value || ""));
  }

  function filterBulkProductTitles(value) {
    const input = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
    const seen = new Set();
    const kept = [];
    const excluded = [];
    let duplicatesRemoved = 0;

    input.forEach((entry) => {
      const title = String(entry || "").replace(/\s+/g, " ").trim();
      if (!title) return;
      const key = title.toLowerCase();
      if (seen.has(key)) {
        duplicatesRemoved += 1;
        return;
      }
      seen.add(key);
      (allowedBulkProductTitle(title) ? kept : excluded).push(title);
    });

    return Object.freeze({
      originalCount: kept.length + excluded.length + duplicatesRemoved,
      kept: Object.freeze(kept),
      excluded: Object.freeze(excluded),
      duplicatesRemoved
    });
  }

  function trimmedStrings(value) {
    return Array.isArray(value)
      ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
  }

  function firstDuplicate(values, caseInsensitive = false) {
    const seen = new Set();
    for (const value of values) {
      const key = caseInsensitive ? value.toLowerCase() : value;
      if (seen.has(key)) return value;
      seen.add(key);
    }
    return "";
  }

  function validateMove99Settings(input = {}) {
    const sourceCategories = trimmedStrings(input.sourceCategories);
    const destinationCategory = String(input.destinationCategory || "").trim();
    const sourceStoreCategoryIds = trimmedStrings(input.sourceStoreCategoryIds);
    const backburnerItemIds = trimmedStrings(input.backburnerItemIds);
    const errors = [];

    if (!sourceCategories.length) errors.push("Enter at least one source Store category.");
    if (!destinationCategory) errors.push("Enter a destination Store category.");

    const duplicateSource = firstDuplicate(sourceCategories, true);
    if (duplicateSource) errors.push(`Source Store category "${duplicateSource}" is duplicated.`);
    if (destinationCategory && sourceCategories.some((value) => value.toLowerCase() === destinationCategory.toLowerCase())) {
      errors.push("The destination Store category cannot also be a source Store category.");
    }

    const invalidSourceId = sourceStoreCategoryIds.find((value) => !/^\d+$/.test(value));
    if (invalidSourceId) errors.push(`Source Store category ID "${invalidSourceId}" must contain digits only.`);
    const duplicateSourceId = firstDuplicate(sourceStoreCategoryIds);
    if (duplicateSourceId) errors.push(`Source Store category ID "${duplicateSourceId}" is duplicated.`);

    const invalidBackburnerId = backburnerItemIds.find((value) => !/^\d{9,15}$/.test(value));
    if (invalidBackburnerId) errors.push(`Backburner item ID "${invalidBackburnerId}" is not a valid eBay item number.`);
    const duplicateBackburnerId = firstDuplicate(backburnerItemIds);
    if (duplicateBackburnerId) errors.push(`Backburner item ID "${duplicateBackburnerId}" is duplicated.`);

    return Object.freeze({
      ok: errors.length === 0,
      errors: Object.freeze(errors),
      settings: Object.freeze({
        sourceCategories: Object.freeze(sourceCategories),
        destinationCategory,
        sourceStoreCategoryIds: Object.freeze(sourceStoreCategoryIds),
        backburnerItemIds: Object.freeze(backburnerItemIds)
      })
    });
  }

  function move99DefaultSettingsForAccount(value) {
    const account = normalizeEbayAccount(value);
    const configuredAccounts = config.move99Accounts && typeof config.move99Accounts === "object"
      ? config.move99Accounts
      : {};
    const configured = configuredAccounts[account] || configuredAccounts[account.toLowerCase()] || {};
    const canonical = canonicalMove99AccountDefaults[account] || {};
    return {
      ...genericMove99Defaults,
      ...configured,
      ...canonical,
      sourceCategories: trimmedStrings(canonical.sourceCategories || configured.sourceCategories || genericMove99Defaults.sourceCategories),
      destinationCategory: String(canonical.destinationCategory || configured.destinationCategory || genericMove99Defaults.destinationCategory).trim(),
      sourceStoreCategoryIds: trimmedStrings(canonical.sourceStoreCategoryIds || configured.sourceStoreCategoryIds),
      backburnerItemIds: trimmedStrings(canonical.backburnerItemIds || configured.backburnerItemIds)
    };
  }

  function isLegacyFancyFiMove99Settings(settings = {}) {
    const sources = trimmedStrings(settings.sourceCategories).map((entry) => entry.toLowerCase());
    return sources.length === 2
      && sources[0] === "not .99"
      && sources[1] === "other"
      && String(settings.destinationCategory || "").trim().toLowerCase() === "abra cadabra .99";
  }

  function isFancyFiCanonicalCategoryPair(settings = {}) {
    const sources = trimmedStrings(settings.sourceCategories).map((entry) => entry.toLowerCase());
    return sources.length === 2
      && sources[0] === "sni"
      && sources[1] === "snipo v2"
      && String(settings.destinationCategory || "").trim().toLowerCase() === "daily";
  }

  function isLegacyHeartstoneMove99Settings(settings = {}) {
    const sources = trimmedStrings(settings.sourceCategories).map((entry) => entry.toLowerCase());
    return sources.length === 2
      && sources[0] === "not .99"
      && sources[1] === "other"
      && String(settings.destinationCategory || "").trim().toLowerCase() === "abra cadabra .99";
  }

  function move99SettingsForAccount(value, stored = {}) {
    const account = normalizeEbayAccount(value);
    const defaults = move99DefaultSettingsForAccount(account);
    const saved = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const shouldMigrateFancyFi = account === "FANCYFI" && (
      isLegacyFancyFiMove99Settings(saved)
      || (isFancyFiCanonicalCategoryPair(saved) && trimmedStrings(saved.sourceStoreCategoryIds).length === 0)
    );
    const shouldMigrateHeartstone = account === "HEARTSTONE" && isLegacyHeartstoneMove99Settings(saved);
    const migrated = shouldMigrateFancyFi || shouldMigrateHeartstone
      ? {
          ...saved,
          sourceCategories: defaults.sourceCategories,
          destinationCategory: defaults.destinationCategory,
          sourceStoreCategoryIds: defaults.sourceStoreCategoryIds
        }
      : saved;
    return {
      ...defaults,
      ...migrated,
      sourceCategories: trimmedStrings(migrated.sourceCategories || defaults.sourceCategories),
      destinationCategory: String(migrated.destinationCategory || defaults.destinationCategory).trim(),
      sourceStoreCategoryIds: trimmedStrings(migrated.sourceStoreCategoryIds || defaults.sourceStoreCategoryIds),
      backburnerItemIds: Array.from(new Set([
        ...trimmedStrings(defaults.backburnerItemIds),
        ...trimmedStrings(migrated.backburnerItemIds)
      ]))
    };
  }

  function portableMove99ScanSummary(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return false;
    if (state.phase !== "scan-summary" || state.active === true) return false;
    if (state.scanStrategy !== PORTABLE_MOVE99_SCAN_STRATEGY || state.scanIntegrity !== "verified") return false;
    if (!['price99', 'non99'].includes(String(state.scanMode || ''))) return false;
    if (state.scanMode === 'non99' && !reverseMove99SaleEventDecision(state.saleEventStatus).ok) return false;

    const filteredCount = Number(state.filteredCount || 0);
    const uniqueInspected = Number(state.uniqueInspected || 0);
    if (!Number.isSafeInteger(filteredCount) || filteredCount < 1 || uniqueInspected !== filteredCount) return false;
    if (!trimmedStrings(state.sourceCategories).length || !String(state.destinationCategory || "").trim()) return false;

    const pages = state.scanPages;
    if (!pages || typeof pages !== "object" || Array.isArray(pages)) return false;
    const inspectedIds = new Set();
    const qualifyingIds = new Set();
    let qualifyingCount = 0;

    for (const page of Object.values(pages)) {
      if (!page || typeof page !== "object" || Array.isArray(page)) return false;
      const itemIds = Array.isArray(page.itemIds) ? page.itemIds : [];
      if (Number(page.inspected) !== itemIds.length) return false;
      for (const rawId of itemIds) {
        const itemId = String(rawId || "");
        if (!/^\d{9,15}$/.test(itemId) || inspectedIds.has(itemId)) return false;
        inspectedIds.add(itemId);
      }

      const qualifying = Array.isArray(page.qualifying) ? page.qualifying : [];
      for (const record of qualifying) {
        const itemId = String(record?.itemId || "");
        if (!/^\d{9,15}$/.test(itemId)
          || !inspectedIds.has(itemId)
          || qualifyingIds.has(itemId)
          || record?.qualifies !== true) {
          return false;
        }
        qualifyingIds.add(itemId);
        qualifyingCount += 1;
      }
    }

    if (inspectedIds.size !== filteredCount || qualifyingCount < 1) return false;
    if (state.qualifyingCount !== undefined && Number(state.qualifyingCount) !== qualifyingCount) return false;

    const totals = state.totals && typeof state.totals === "object" ? state.totals : {};
    for (const key of ["batches", "selected", "categoryApplied", "live", "failed"]) {
      if (Number(totals[key] || 0) !== 0) return false;
    }
    for (const key of ["processedIds", "failedIds", "currentBatchIds"]) {
      if (Array.isArray(state[key]) && state[key].length) return false;
    }
    if (Number(state.applyIndex || 0) !== 0
      || (Array.isArray(state.exactBatches) && state.exactBatches.length)
      || (state.applySourcePages && Object.keys(state.applySourcePages).length)) {
      return false;
    }
    return true;
  }

  function migratePortableMove99Summary(state, targetVersion, now = Date.now()) {
    const version = String(targetVersion || "").trim();
    if (!version || !portableMove99ScanSummary(state)) return null;
    const parsedAt = new Date(now);
    const timestamp = Number.isNaN(parsedAt.getTime()) ? new Date().toISOString() : parsedAt.toISOString();
    const migrated = {
      ...state,
      active: false,
      confirmed: false,
      ownerTabId: null,
      phase: "scan-summary",
      reviewRequested: false,
      reviewRequestedAt: "",
      processedIds: [],
      failedIds: [],
      currentBatchIds: [],
      currentBatchCount: 0,
      totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
      extensionVersion: version,
      stateUpdatedAt: timestamp,
      migratedFromExtensionVersion: String(state.extensionVersion || "unknown"),
      migratedAt: timestamp
    };
    delete migrated.approvalTabId;
    delete migrated.applySourcePages;
    delete migrated.exactBatches;
    delete migrated.applyIndex;
    delete migrated.applyStrategy;
    return migrated;
  }

  function compactMove99HistoryRecord(state, now = Date.now()) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    const parsedAt = new Date(now);
    const recordedAt = Number.isNaN(parsedAt.getTime()) ? new Date().toISOString() : parsedAt.toISOString();
    const totals = state.totals && typeof state.totals === "object" ? state.totals : {};
    return {
      compact: true,
      extensionVersion: String(state.extensionVersion || ""),
      scanMode: String(state.scanMode || ""),
      scanStrategy: String(state.scanStrategy || ""),
      scanIntegrity: String(state.scanIntegrity || ""),
      saleEventStatus: String(state.saleEventStatus || ""),
      saleEventConfirmedAt: String(state.saleEventConfirmedAt || ""),
      phase: String(state.phase || ""),
      active: state.active === true,
      sourceCategories: trimmedStrings(state.sourceCategories),
      destinationCategory: String(state.destinationCategory || "").trim(),
      filteredCount: Number(state.filteredCount || 0),
      uniqueInspected: Number(state.uniqueInspected || 0),
      qualifyingCount: Number(state.qualifyingCount || 0),
      processedCount: Array.isArray(state.processedIds) ? state.processedIds.length : 0,
      failedCount: Array.isArray(state.failedIds) ? state.failedIds.length : Number(totals.failed || 0),
      totals: {
        batches: Number(totals.batches || 0),
        selected: Number(totals.selected || 0),
        categoryApplied: Number(totals.categoryApplied || 0),
        live: Number(totals.live || 0),
        failed: Number(totals.failed || 0)
      },
      startedAt: String(state.startedAt || ""),
      completedAt: String(state.completedAt || ""),
      recordedAt
    };
  }

  function compactMove99ControlRecord(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return state;
    const totals = state.totals && typeof state.totals === "object" ? state.totals : {};
    const categoryUpdate = state.categoryUpdate && typeof state.categoryUpdate === "object"
      ? state.categoryUpdate
      : {};
    const phase = String(state.phase || "");
    const currentBatchCount = Number(state.currentBatchCount || 0);
    return {
      compact: true,
      extensionVersion: String(state.extensionVersion || ""),
      runId: String(state.runId || ""),
      scanMode: String(state.scanMode || ""),
      scanStrategy: String(state.scanStrategy || ""),
      scanIntegrity: String(state.scanIntegrity || ""),
      saleEventStatus: String(state.saleEventStatus || ""),
      saleEventConfirmedAt: String(state.saleEventConfirmedAt || ""),
      phase,
      active: state.active === true,
      confirmed: state.confirmed === true,
      reviewReady: state.reviewReady === true,
      sourceCategories: trimmedStrings(state.sourceCategories),
      sourceStoreCategoryIds: trimmedStrings(state.sourceStoreCategoryIds),
      destinationCategory: String(state.destinationCategory || "").trim(),
      filteredCount: Number(state.filteredCount || 0),
      uniqueInspected: Number(state.uniqueInspected || 0),
      qualifyingCount: Number(state.qualifyingCount || 0),
      scanPageCount: state.scanPages && typeof state.scanPages === "object"
        ? Object.keys(state.scanPages).length
        : 0,
      exactBatchCount: Array.isArray(state.exactBatches) ? state.exactBatches.length : 0,
      applyIndex: Number(state.applyIndex || 0),
      currentBatchCount,
      currentBatchIdCount: Array.isArray(state.currentBatchIds) ? state.currentBatchIds.length : 0,
      currentBatchKey: String(state.currentBatchKey || ""),
      workspaceId: String(state.workspaceId || ""),
      approvalWorkspaceId: String(state.approvalWorkspaceId || ""),
      ownerTabId: Number.isInteger(Number(state.ownerTabId)) ? Number(state.ownerTabId) : null,
      approvalTabId: Number.isInteger(Number(state.approvalTabId)) ? Number(state.approvalTabId) : null,
      previousOwnerTabId: Number.isInteger(Number(state.previousOwnerTabId)) ? Number(state.previousOwnerTabId) : null,
      previousApprovalTabId: Number.isInteger(Number(state.previousApprovalTabId)) ? Number(state.previousApprovalTabId) : null,
      localControlReviewReboundAt: String(state.localControlReviewReboundAt || ""),
      staleBatchActionStateClearedAt: String(state.staleBatchActionStateClearedAt || ""),
      reviewRecoveredAfterReloadAt: String(state.reviewRecoveredAfterReloadAt || ""),
      trustedSubmitDispatchAt: String(state.trustedSubmitDispatchAt || ""),
      trustedSubmitReleasedAt: String(state.trustedSubmitReleasedAt || ""),
      trustedSubmitRecoveryActivationCount: Number(state.trustedSubmitRecoveryActivationCount || 0),
      trustedSubmitRecoveryDispatchAt: String(state.trustedSubmitRecoveryDispatchAt || ""),
      trustedSubmitRecoveryReleasedAt: String(state.trustedSubmitRecoveryReleasedAt || ""),
      staleBatchActionStateEvidence: state.staleBatchActionStateEvidence && typeof state.staleBatchActionStateEvidence === "object"
        ? { ...state.staleBatchActionStateEvidence }
        : null,
      reviewRecoveryEvidence: state.reviewRecoveryEvidence && typeof state.reviewRecoveryEvidence === "object"
        ? { ...state.reviewRecoveryEvidence }
        : null,
      processedCount: Array.isArray(state.processedIds) ? state.processedIds.length : 0,
      failedCount: Array.isArray(state.failedIds) ? state.failedIds.length : Number(totals.failed || 0),
      categoryUpdate: {
        attempted: Number(categoryUpdate.attempted || 0),
        updated: Number(categoryUpdate.updated || 0),
        verified: Number(categoryUpdate.verified || 0)
      },
      totals: {
        batches: Number(totals.batches || 0),
        selected: Number(totals.selected || 0),
        categoryApplied: Number(totals.categoryApplied || 0),
        live: Number(totals.live || 0),
        failed: Number(totals.failed || 0)
      },
      approvalRequired: ["awaiting-submit-approval", "approval-lost"].includes(phase),
      requiredApprovalCount: ["awaiting-submit-approval", "approval-lost"].includes(phase)
        ? currentBatchCount
        : 0,
      startedAt: String(state.startedAt || ""),
      stateUpdatedAt: String(state.stateUpdatedAt || ""),
      completedAt: String(state.completedAt || "")
    };
  }

  function compactPoshmarkProfitBackfillControlRecord(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return state;
    const sales = Array.isArray(state.sales) ? state.sales : [];
    const purchases = Array.isArray(state.purchases) ? state.purchases : [];
    const results = Array.isArray(state.results) ? state.results : [];
    const syncedOrderNumbers = [...new Set((Array.isArray(state.syncedOrderNumbers) ? state.syncedOrderNumbers : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean))];
    const countResult = (status) => results.filter((result) => String(result?.status || "") === status).length;
    const exact = countResult("exact");
    const needsReview = countResult("needs-review-same-cost") + countResult("needs-review-ambiguous-cost");
    const exactProfit = Number(results
      .filter((result) => String(result?.status || "") === "exact" && result?.record)
      .reduce((total, result) => total + Number(result.record.profit || 0), 0)
      .toFixed(2));
    const phase = String(state.phase || "");
    const remainingExactToSync = Math.max(0, exact - syncedOrderNumbers.length);
    const syncedOrderSet = new Set(syncedOrderNumbers);
    const remainingReviewToSync = results.filter((result) => {
      const orderNumber = String(result?.orderNumber || "");
      return orderNumber && !syncedOrderSet.has(orderNumber);
    }).length;
    const savesEveryReviewRow = state.scope === "month" || ["resolve-missing", "resolve-ebay"].includes(state.scope);
    const requiredApprovalCount = savesEveryReviewRow ? remainingReviewToSync : remainingExactToSync;
    const boundedText = (value, limit = 500) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
    const positiveInteger = (value) => {
      const number = Number(value);
      return Number.isInteger(number) && number > 0 ? number : null;
    };
    const recentErrors = (Array.isArray(state.errors) ? state.errors : []).slice(-5).map((error) => ({
      phase: boundedText(error?.phase, 80),
      message: boundedText(error?.message, 500),
      at: boundedText(error?.at, 80)
    }));
    const normalizedPurchaseAsins = new Set(purchases
      .map((purchase) => String(purchase?.asin || "").trim().toUpperCase())
      .filter((asin) => /^[A-Z0-9]{10}$/.test(asin)));
    const salesWithAsin = sales.filter((sale) => (sale?.asins || []).some((asin) => /^[A-Z0-9]{10}$/.test(String(asin || "").trim().toUpperCase())));
    const salesWithCapturedAsin = salesWithAsin.filter((sale) => (sale?.asins || []).some((asin) => normalizedPurchaseAsins.has(String(asin || "").trim().toUpperCase())));
    const sampleSale = (sale) => ({
      orderNumber: boundedText(sale?.orderNumber, 40),
      orderDate: boundedText(sale?.orderDate, 80),
      asins: (sale?.asins || []).slice(0, 4).map((asin) => boundedText(asin, 20)),
      detailCaptured: Boolean(sale?.detailCapturedAt)
    });
    const samplePurchase = (purchase) => ({
      orderId: boundedText(purchase?.orderId, 40),
      purchaseDate: boundedText(purchase?.purchaseDate, 80),
      asin: boundedText(purchase?.asin, 20),
      cost: Number.isFinite(Number(purchase?.cost)) ? Number(purchase.cost) : null
    });
    return {
      compact: true,
      stateVersion: Number(state.stateVersion || 0),
      extensionVersion: String(state.extensionVersion || ""),
      runId: String(state.runId || ""),
      scope: String(state.scope || ""),
      supplierProfile: String(state.supplierProfile || ""),
      maxOrders: Number(state.maxOrders || 0),
      rangeDays: state.rangeDays === null || state.rangeDays === undefined || state.rangeDays === ""
        ? null
        : (Number.isFinite(Number(state.rangeDays)) ? Number(state.rangeDays) : null),
      matchWindowDays: Number(state.matchWindowDays || 0),
      computerLabel: String(state.computerLabel || ""),
      phase,
      resumePhase: String(state.resumePhase || ""),
      active: state.active === true,
      stopRequested: state.stopRequested === true,
      currentPage: Number(state.currentPage || 0),
      pagesScanned: Array.isArray(state.pageFingerprints) ? state.pageFingerprints.length : 0,
      salesIndexed: sales.length,
      detailsCaptured: sales.filter((sale) => Boolean(sale?.detailCapturedAt)).length,
      detailIndex: Number(state.detailIndex || 0),
      currentOrderNumber: String(state.currentOrderNumber || ""),
      asinsIndexed: Array.isArray(state.asins) ? state.asins.length : 0,
      asinIndex: Number(state.asinIndex || 0),
      currentAsin: String(state.currentAsin || ""),
      amazonSearchMatchCount: Array.isArray(state.amazonSearchMatches) ? state.amazonSearchMatches.length : 0,
      amazonSearchCollectedCount: Array.isArray(state.amazonSearchCollected) ? state.amazonSearchCollected.length : 0,
      amazonSearchPageCount: Array.isArray(state.amazonSearchFingerprints) ? state.amazonSearchFingerprints.length : 0,
      amazonCandidateIndex: Number(state.amazonCandidateIndex || 0),
      amazonUnitsCaptured: purchases.length,
      matchingDiagnostics: {
        salesWithAsin: salesWithAsin.length,
        salesWithCapturedAsin: salesWithCapturedAsin.length,
        salesMissingDate: sales.filter((sale) => !String(sale?.orderDate || "").trim()).length,
        purchasesMissingDate: purchases.filter((purchase) => !String(purchase?.purchaseDate || "").trim()).length,
        saleSamples: [...sales.slice(0, 2), ...sales.slice(-2)].map(sampleSale),
        purchaseSamples: [...purchases.slice(0, 2), ...purchases.slice(-2)].map(samplePurchase)
      },
      resultCounts: {
        exact,
        missingSku: countResult("missing-sku"),
        amazonNotFound: countResult("amazon-not-found"),
        needsReview
      },
      exactProfit,
      syncedCount: syncedOrderNumbers.length,
      remainingExactToSync,
      remainingReviewToSync,
      approvalRequired: phase === "review" && requiredApprovalCount > 0,
      requiredApprovalCount: phase === "review" ? requiredApprovalCount : 0,
      knownOrderCount: Array.isArray(state.knownOrderNumbers) ? state.knownOrderNumbers.length : 0,
      errorCount: Array.isArray(state.errors) ? state.errors.length : 0,
      recentErrors,
      ownerTabId: positiveInteger(state.ownerTabId),
      ownerWindowId: positiveInteger(state.ownerWindowId),
      workerTabId: positiveInteger(state.workerTabId),
      pausedReason: boundedText(state.pausedReason),
      migrationReason: boundedText(state.migrationReason),
      syncDelivery: boundedText(state.syncDelivery, 40),
      startedAt: String(state.startedAt || ""),
      updatedAt: String(state.updatedAt || ""),
      completedAt: String(state.completedAt || "")
    };
  }

  function serializedUtf8Bytes(value) {
    let text;
    try {
      text = JSON.stringify(value);
    } catch (_) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (typeof text !== "string") return 0;
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4;
          index += 1;
        } else {
          bytes += 3;
        }
      } else bytes += 3;
    }
    return bytes;
  }

  function fitControlStateToBudget(state, maxBytes = 524288) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return state;
    const budgetBytes = Math.max(8192, Number(maxBytes || 0));
    const originalBytes = serializedUtf8Bytes(state);
    if (originalBytes <= budgetBytes) return state;
    const compacted = { ...state };
    const candidates = Object.entries(compacted)
      .map(([key, value]) => ({ key, value, bytes: serializedUtf8Bytes(value) }))
      .sort((left, right) => right.bytes - left.bytes);
    const omittedKeys = [];
    const metadataReserveBytes = 2048;
    for (const candidate of candidates) {
      if (serializedUtf8Bytes(compacted) <= budgetBytes - metadataReserveBytes) break;
      const value = candidate.value;
      compacted[candidate.key] = {
        compact: true,
        omittedForLocalControl: true,
        originalBytes: candidate.bytes,
        valueType: Array.isArray(value) ? "array" : typeof value,
        itemCount: Array.isArray(value) ? value.length : null,
        propertyCount: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : null
      };
      omittedKeys.push(candidate.key);
    }
    compacted.localControlCompaction = {
      compact: true,
      reason: "local-control-response-budget",
      budgetBytes,
      originalBytes,
      omittedCount: omittedKeys.length,
      omittedKeys
    };
    compacted.localControlCompaction.finalBytes = serializedUtf8Bytes(compacted);
    return compacted;
  }

  function resetMove99BatchActionState(state = {}, identity = {}) {
    const workspaceId = String(identity.workspaceId ?? state.approvalWorkspaceId ?? "");
    const batchKey = String(identity.batchKey ?? state.currentBatchKey ?? "");
    return {
      ...state,
      approvalActionObservedAt: "",
      approvalAction: "",
      finalActionApprovedAt: "",
      finalActionApprovalToken: "",
      finalActionClickCount: 0,
      trustedSubmitDispatchAt: "",
      trustedSubmitReleasedAt: "",
      trustedSubmitTarget: null,
      trustedSubmitWorkspaceId: "",
      trustedSubmitBatchKey: "",
      finalReviewEvidence: null,
      finalReviewActionClickCount: 0,
      trustedFinalReviewDispatchAt: "",
      trustedFinalReviewReleasedAt: "",
      trustedFinalReviewTarget: null,
      trustedFinalReviewWorkspaceId: "",
      trustedFinalReviewBatchKey: "",
      finalReviewRecoveryClickCount: 0,
      trustedFinalReviewRecoveryDispatchAt: "",
      trustedFinalReviewRecoveryReleasedAt: "",
      trustedFinalReviewRecoveryTarget: null,
      finalReviewRecoveryNoEffect: false,
      finalReviewProgrammaticActivationCount: 0,
      trustedFinalReviewProgrammaticActivationAt: "",
      finalReviewProgrammaticActivationNoEffect: false,
      reviewRecoveredAfterReloadAt: "",
      reviewRecoveryEvidence: null,
      approvalCycleWorkspaceId: workspaceId,
      approvalCycleBatchKey: batchKey
    };
  }

  function move99BatchActionStateIsStale(state = {}) {
    const workspaceId = String(state.approvalWorkspaceId || "");
    const batchKey = String(state.currentBatchKey || "");
    if (!workspaceId || !batchKey) return false;

    const hasReceipt = Boolean(
      state.trustedSubmitDispatchAt
      || state.trustedSubmitReleasedAt
      || state.trustedFinalReviewDispatchAt
      || state.trustedFinalReviewReleasedAt
      || Number(state.finalReviewActionClickCount || 0)
      || Number(state.finalReviewRecoveryClickCount || 0)
      || Number(state.finalReviewProgrammaticActivationCount || 0)
      || state.finalReviewEvidence
    );
    if (!hasReceipt) return false;

    const identities = [
      [state.trustedSubmitWorkspaceId, state.trustedSubmitBatchKey],
      [state.trustedFinalReviewWorkspaceId, state.trustedFinalReviewBatchKey]
    ];
    for (const [receiptWorkspaceId, receiptBatchKey] of identities) {
      if (receiptWorkspaceId && String(receiptWorkspaceId) !== workspaceId) return true;
      if (receiptBatchKey && String(receiptBatchKey) !== batchKey) return true;
    }

    const evidence = state.finalReviewEvidence || {};
    if (evidence.workspaceId && String(evidence.workspaceId) !== workspaceId) return true;
    if (evidence.batchKey && String(evidence.batchKey) !== batchKey) return true;
    return false;
  }

  function activeWorkflowEntries(stored = {}, now = Date.now()) {
    const entries = [];
    const add = (key, id, label, value, { busy = false, approvalReady = false } = {}) => {
      if (!busy) return;
      entries.push(Object.freeze({
        key,
        id,
        label,
        phase: String(value?.phase || (value === true ? "starting" : "active")),
        approvalReady: Boolean(approvalReady)
      }));
    };
    const active = (value) => value === true || Boolean(value && typeof value === "object" && value.active === true);

    const reservation = stored.gldnWorkflowReservation;
    const reservationLive = active(reservation)
      && Number(reservation.expiresAt || 0) > Number(now || Date.now());
    add("gldnWorkflowReservation", String(reservation?.id || "workflow-start"), String(reservation?.label || "Workflow start"), reservation, {
      busy: reservationLive
    });

    const openReviews = stored.gldnOpenReviews && typeof stored.gldnOpenReviews === "object"
      ? stored.gldnOpenReviews
      : {};
    for (const [token, review] of Object.entries(openReviews)) {
      add(`gldnOpenReviews:${token}`, `review:${token}`, String(review?.label || "GLDN review"), review, {
        busy: active(review) && Number(review.expiresAt || 0) > Number(now || Date.now()),
        approvalReady: true
      });
    }

    const move99 = stored.pendingMove99Run;
    const move99Approval = ["awaiting-submit-approval", "approval-lost"].includes(String(move99?.phase || ""));
    add("pendingMove99Run", "move99", "Move .99", move99, {
      busy: active(move99) || move99Approval,
      approvalReady: move99Approval
    });

    const variationEnd = stored.pendingVariationEndReview;
    const variationApproval = ["workspace-ready", "awaiting-approval"].includes(String(variationEnd?.phase || ""));
    add("pendingVariationEndReview", "ebay-variations", "Variation listing end review", variationEnd, {
      busy: active(variationEnd),
      approvalReady: variationApproval
    });

    const policyEnd = stored.pendingPolicyListingEndReview;
    const policyApproval = ["review-ready", "awaiting-approval"].includes(String(policyEnd?.phase || ""));
    add("pendingPolicyListingEndReview", "ebay-policy-listings", "Policy listing end review", policyEnd, {
      busy: active(policyEnd),
      approvalReady: policyApproval
    });

    const policyScan = stored.ebayPolicyListingScanState;
    add("ebayPolicyListingScanState", "ebay-policy-scan", "Existing listings policy scan", policyScan, {
      busy: active(policyScan)
    });

    const markShipped = stored.pendingMarkShippedRun;
    const markShippedApproval = String(markShipped?.phase || "") === "awaiting-approval";
    add("pendingMarkShippedRun", "mark-shipped", "Mark as Shipped", markShipped, {
      busy: active(markShipped) || markShippedApproval,
      approvalReady: markShippedApproval
    });
    add("pendingSellerLevelScan", "seller-level", "Seller Level scan", stored.pendingSellerLevelScan, { busy: active(stored.pendingSellerLevelScan) });
    add("pendingReviewMonthlyLimits", "listing-limits", "Listing limit check", stored.pendingReviewMonthlyLimits, { busy: active(stored.pendingReviewMonthlyLimits) });
    add("pendingEbaySnapshotScan", "ebay-snapshot", "eBay sales snapshot", stored.pendingEbaySnapshotScan, { busy: active(stored.pendingEbaySnapshotScan) });
    add("pendingSnipingExtract", "sniping", "Sniping workflow", stored.pendingSnipingExtract, { busy: active(stored.pendingSnipingExtract) });
    add("pendingSnipingWinner", "sniping-review", "Sniping winner review", stored.pendingSnipingWinner, {
      busy: active(stored.pendingSnipingWinner),
      approvalReady: active(stored.pendingSnipingWinner)
    });
    add("pendingAmazonSnipingWorkflowStart", "amazon-sniping-start", "Amazon sniping handoff", stored.pendingAmazonSnipingWorkflowStart, { busy: active(stored.pendingAmazonSnipingWorkflowStart) });
    const subscribeSave = stored.pendingAmazonSubscribeSaveRun;
    const subscribeSaveApproval = String(subscribeSave?.phase || "") === "awaiting-approval";
    add("pendingAmazonSubscribeSaveRun", "amazon-subscribe-save", "Amazon Subscribe & Save", subscribeSave, {
      busy: active(subscribeSave) || subscribeSaveApproval,
      approvalReady: subscribeSaveApproval
    });
    add("pendingPoshmarkStatsScan", "poshmark-stats", "Poshmark stats scan", stored.pendingPoshmarkStatsScan, { busy: active(stored.pendingPoshmarkStatsScan) });

    const ebayProfit = stored.ebayMonthlyProfit;
    const ebayProfitReview = String(ebayProfit?.phase || "") === "review";
    add("ebayMonthlyProfit", "ebay-monthly-profit", "Monthly eBay profit", ebayProfit, {
      busy: active(ebayProfit) || ebayProfitReview,
      approvalReady: ebayProfitReview
    });

    const poshmarkBackfill = stored.poshmarkProfitBackfill;
    const poshmarkReview = String(poshmarkBackfill?.phase || "") === "review";
    add("poshmarkProfitBackfill", "poshmark-profit", "Poshmark profit backfill", poshmarkBackfill, {
      busy: active(poshmarkBackfill) || poshmarkReview,
      approvalReady: poshmarkReview
    });

    const walmartOrder = stored.pendingWalmartAutoOrder;
    add("pendingWalmartAutoOrder", "walmart-order", "Walmart order review", walmartOrder, {
      busy: Boolean(walmartOrder && typeof walmartOrder === "object"),
      approvalReady: Boolean(walmartOrder && typeof walmartOrder === "object")
    });
    return Object.freeze(entries);
  }

  function normalizeStoredSettings(stored = {}) {
    const identity = identityForComputer(stored.computerLabel);
    const requestedTheme = String(stored.gldnUiTheme || config.defaultUiTheme || "dark").trim().toLowerCase();
    const theme = root.GLDN_THEME_CATALOG?.normalize
      ? root.GLDN_THEME_CATALOG.normalize(requestedTheme)
      : (["dark", "light", "graphite", "signal", "midnight", "crimson"].includes(requestedTheme) ? requestedTheme : "dark");
    return {
      settingsSchemaVersion: Number(config.settingsSchemaVersion || 2),
      computerLabel: identity.computerLabel,
      ebayAccountLabel: identity.ebayAccountLabel,
      gldnUiOpacity: clampUiOpacity(stored.gldnUiOpacity),
      gldnUiTheme: theme
    };
  }

  function reverseMove99SaleEventDecision(value) {
    const status = String(value || "").trim().toLowerCase();
    if (status === "off") return Object.freeze({ ok: true, status: "off", error: "" });
    return Object.freeze({
      ok: false,
      status: status === "on" ? "on" : "unconfirmed",
      error: REVERSE_MOVE99_SALE_EVENT_BLOCKED_MESSAGE
    });
  }

  root.GLDN_FOUNDATION = Object.freeze({
    settingsSchemaVersion: Number(config.settingsSchemaVersion || 2),
    deploymentMode: String(config.deploymentMode || "local-unpacked"),
    computerAccounts,
    computerOptions,
    ebayAccountOptions,
    normalizeComputer,
    normalizeEbayAccount,
    identityForComputer,
    poshmarkIdentityForComputer,
    poshmarkAccountLabel,
    clampUiOpacity,
    allowedBulkProductTitle,
    filterBulkProductTitles,
    validateMove99Settings,
    move99DefaultSettingsForAccount,
    move99SettingsForAccount,
    portableMove99ScanSummary,
    migratePortableMove99Summary,
    compactMove99HistoryRecord,
    compactMove99ControlRecord,
    compactPoshmarkProfitBackfillControlRecord,
    serializedUtf8Bytes,
    fitControlStateToBudget,
    resetMove99BatchActionState,
    move99BatchActionStateIsStale,
    reverseMove99SaleEventDecision,
    reverseMove99SaleEventPrompt: REVERSE_MOVE99_SALE_EVENT_PROMPT,
    reverseMove99SaleEventBlockedMessage: REVERSE_MOVE99_SALE_EVENT_BLOCKED_MESSAGE,
    workflowStateKeys,
    activeWorkflowEntries,
    normalizeStoredSettings
  });
})(globalThis);
