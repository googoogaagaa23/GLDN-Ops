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
  const computerOptions = Object.freeze(Object.keys(computerAccounts));
  const ebayAccountOptions = Object.freeze(Array.from(new Set(
    Object.values(computerAccounts).map((entry) => entry.ebayAccountLabel).filter(Boolean)
  )));
  const genericMove99Defaults = Object.freeze({
    sourceCategories: Object.freeze(["Not .99", "Other"]),
    destinationCategory: "Abra Cadabra .99",
    sourceStoreCategoryIds: Object.freeze([]),
    backburnerItemIds: Object.freeze([])
  });
  const canonicalMove99AccountDefaults = Object.freeze({
    FANCYFI: Object.freeze({
      sourceCategories: Object.freeze(["SNI", "SNIPO v2"]),
      destinationCategory: "DAILY",
      sourceStoreCategoryIds: Object.freeze([]),
      backburnerItemIds: Object.freeze([])
    })
  });
  const workflowStateKeys = Object.freeze([
    "gldnWorkflowReservation",
    "gldnOpenReviews",
    "pendingMove99Run",
    "pendingMarkShippedRun",
    "pendingSellerLevelScan",
    "pendingReviewMonthlyLimits",
    "pendingEbaySnapshotScan",
    "pendingSnipingExtract",
    "pendingSnipingWinner",
    "pendingAmazonSnipingWorkflowStart",
    "pendingPoshmarkStatsScan",
    "poshmarkProfitBackfill",
    "pendingWalmartAutoOrder"
  ]);
  const BULK_PRODUCT_EXCLUSION_RE = /\b(shoe|shoes|sneaker|sneakers|sandals?|slippers?|boots?|clogs?|crocs|socks?|shirt|shirts|t-?shirt|hoodie|sweater|jacket|coat|dress|dresses|skirt|jeans|pants|leggings|shorts?|underwear|boxers?|briefs?|bra|bras|lingerie|swimsuit|bikini|clothing|apparel|fashion|costumes?|cosplay|outfits?|handbags?|purses?|crossbody|wallets?|clutch)\b/i;
  const PORTABLE_MOVE99_SCAN_STRATEGY = "active-page-exact-id-v1";

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

  function move99SettingsForAccount(value, stored = {}) {
    const account = normalizeEbayAccount(value);
    const defaults = move99DefaultSettingsForAccount(account);
    const saved = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const migrated = account === "FANCYFI" && isLegacyFancyFiMove99Settings(saved)
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
      backburnerItemIds: trimmedStrings(migrated.backburnerItemIds || defaults.backburnerItemIds)
    };
  }

  function portableMove99ScanSummary(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return false;
    if (state.phase !== "scan-summary" || state.active === true) return false;
    if (state.scanStrategy !== PORTABLE_MOVE99_SCAN_STRATEGY || state.scanIntegrity !== "verified") return false;
    if (!['price99', 'non99'].includes(String(state.scanMode || ''))) return false;

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
    add("pendingPoshmarkStatsScan", "poshmark-stats", "Poshmark stats scan", stored.pendingPoshmarkStatsScan, { busy: active(stored.pendingPoshmarkStatsScan) });

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
    workflowStateKeys,
    activeWorkflowEntries,
    normalizeStoredSettings
  });
})(globalThis);
