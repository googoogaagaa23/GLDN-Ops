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
  const BULK_PRODUCT_EXCLUSION_RE = /\b(shoe|shoes|sneaker|sneakers|sandals?|slippers?|boots?|clogs?|crocs|socks?|shirt|shirts|t-?shirt|hoodie|sweater|jacket|coat|dress|dresses|skirt|jeans|pants|leggings|shorts?|underwear|boxers?|briefs?|bra|bras|lingerie|swimsuit|bikini|clothing|apparel|fashion|costumes?|cosplay|outfits?|handbags?|purses?|crossbody|wallets?|clutch)\b/i;

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
    const minimum = Number(config.minimumUiOpacity || 65);
    const maximum = Number(config.maximumUiOpacity || 100);
    const fallback = Number(config.defaultUiOpacity || 75);
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
    normalizeStoredSettings
  });
})(globalThis);
