(() => {
  if (window.__GLDN_EBAY_ORDER_ASSISTANT__) return;
  window.__GLDN_EBAY_ORDER_ASSISTANT__ = true;

  const U = window.OrderNoteUtils;
  const AUDIT = window.GLDN_PROFIT_AUDIT;
  const SNIPING = window.GLDN_SNIPING_AUDIT;
  let panel;
  let statusElement;
  let expectedSavedNote = null;
  let previousSavedNote = "";
  let expectedProfitRecord = null;
  let noteSaveDetectionPending = false;
  let panelIdentityElement;
  let limitsButtonElement;
  let move99ReviewButtonElement;
  let move99ApplyButtonElement;
  let markShippedRunning = false;
  let markShippedMonitorRunning = false;
  let snipingWinnerButtonElement;
  let ebayInterruptionStopped = false;
  let extensionContextInvalidated = false;
  let ebayHeartbeatTimer = 0;
  let ebayPageObserver = null;
  let savedBulkEditCleanup = null;

  const AWAITING_SHIPMENT_URL = "https://www.ebay.com/sh/ord/?filter=status:AWAITING_SHIPMENT";
  const SELLER_LEVEL_URL = "https://www.ebay.com/sh/performance";
  const SELLER_HUB_OVERVIEW_URL = "https://www.ebay.com/sh/ovw";
  const ACTIVE_LISTINGS_URL = "https://www.ebay.com/sh/lst/active";
  const PRUNE_THRESHOLD = 0.95;
  const FOUNDATION = globalThis.GLDN_FOUNDATION;
  const COMPUTER_ACCOUNT_MAP = FOUNDATION.computerAccounts;
  const COMPUTER_OPTIONS = FOUNDATION.computerOptions;
  const EBAY_ACCOUNT_OPTIONS = FOUNDATION.ebayAccountOptions;
  const STORE_PLAN_LIMITS = { Premium: 10000, Anchor: 25000 };
  const DEFAULT_DOLLAR_LIMIT = 1000000;
  const EXTENSION_VERSION = chrome.runtime.getManifest().version;

  const MOVE99_DEFAULT_CONFIG = Object.freeze({
    sourceStoreCategoryIds: [],
    sourceCategories: ["Not .99", "Other"],
    destinationCategory: "Abra Cadabra .99",
    backburnerItemIds: []
  });
  const MOVE99_BUILTIN_ACCOUNT_CONFIGS = Object.freeze({
    FAK12: {
      sourceStoreCategoryIds: ["44678633011", "1"],
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
      backburnerItemIds: ["318521296686"]
    }
  });
  let MOVE99_SOURCE_STORE_CATEGORY_IDS = [];
  let MOVE99_ACTIVE_URL = ACTIVE_LISTINGS_URL;
  let MOVE99_SOURCE_CATEGORIES = [...MOVE99_DEFAULT_CONFIG.sourceCategories];
  let MOVE99_DESTINATION_CATEGORY = MOVE99_DEFAULT_CONFIG.destinationCategory;
  let MOVE99_BACKBURNER_ITEM_IDS = new Set(MOVE99_DEFAULT_CONFIG.backburnerItemIds);
  let MOVE99_SCAN_MODE = "price99";
  let move99Running = false;
  let move99SubmitMonitorRunning = false;
  const MOVE99_APPROVAL_ACTION_SESSION_KEY = "gldnMove99ApprovalAction";
  // eBay can create larger workspaces, but rejects publishing more than 500
  // listings when any listing in the workspace has variations.
  const MOVE99_BULK_BATCH_LIMIT = 500;
  // eBay can publish 500, but hundreds of individual checkbox updates can
  // still lock the virtualized editor. Keep direct price-scan passes smaller.
  const MOVE99_DIRECT_SELECTION_LIMIT = 100;
  const MOVE99_EDIT_RANGE_LIMIT = 2000;
  // eBay only offers 2,000-listing edit ranges, but mounting every row can
  // exhaust Chrome. Scan a smaller rendered window and repeat after each batch.
  const MOVE99_RENDER_BATCH_LIMIT = 500;
  const MOVE99_FILTER_BASELINE_RESTART_LIMIT = 2;
  const MOVE99_NAVIGATION_COOLDOWN_MS = 8000;
  const MOVE99_NAVIGATION_JITTER_MS = 2500;
  const EBAY_HEARTBEAT_MS = 4000;
  const MOVE99_APPLY_STRATEGY = "fingerprint-edit-ranges-v2";
  const MOVE99_DIRECT_APPLY_STRATEGY = "direct-bulk-edit-ranges-v1";
  const MOVE99_EXACT_APPLY_STRATEGY = "exact-id-workspaces-v1";
  const MOVE99_SCAN_STRATEGY = "active-page-exact-id-v1";

  const invalidContextError = (error) => U?.isExtensionContextInvalidated?.(error)
    || /extension context invalidated|context invalidated/i.test(String(error?.message || error || ""));

  function shutdownInvalidatedContext(error) {
    if (extensionContextInvalidated) return;
    extensionContextInvalidated = true;
    if (ebayHeartbeatTimer) clearInterval(ebayHeartbeatTimer);
    ebayHeartbeatTimer = 0;
    ebayPageObserver?.disconnect?.();
    ebayPageObserver = null;
    savedBulkEditCleanup?.();
    savedBulkEditCleanup = null;
    move99Running = false;
    move99SubmitMonitorRunning = false;
    markShippedRunning = false;
    markShippedMonitorRunning = false;
    const message = "GLDN Ops was updated. Refresh this eBay tab when you are ready.";
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.dataset.type = "error";
    }
    panel?.setAttribute?.("data-gldn-context-invalidated", "true");
    if (error) U?.markExtensionContextInvalidated?.(error);
  }

  function requireExtensionContext() {
    if (extensionContextInvalidated || !U?.extensionContextAvailable?.()) {
      const error = new Error("Extension context invalidated. Refresh this eBay tab.");
      shutdownInvalidatedContext(error);
      throw error;
    }
  }

  window.addEventListener("gldn-extension-context-invalidated", (event) => {
    shutdownInvalidatedContext(event.detail?.message || "Extension context invalidated.");
  });

  const storageGet = (keys) => new Promise((resolve, reject) => {
    try {
      requireExtensionContext();
      chrome.storage.local.get(keys, (result) => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          if (invalidContextError(error)) shutdownInvalidatedContext(error);
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve(result);
      });
    } catch (error) {
      if (invalidContextError(error)) shutdownInvalidatedContext(error);
      reject(error);
    }
  });
  const storageSet = (values) => new Promise((resolve, reject) => {
    const payload = { ...values };
    for (const key of FOUNDATION.workflowStateKeys) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      const value = payload[key];
      if (value === true) {
        payload[key] = { active: true, extensionVersion: EXTENSION_VERSION, stateUpdatedAt: new Date().toISOString() };
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        payload[key] = { ...value, extensionVersion: EXTENSION_VERSION, stateUpdatedAt: new Date().toISOString() };
      }
    }
    try {
      requireExtensionContext();
      chrome.storage.local.set(payload, () => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          if (invalidContextError(error)) shutdownInvalidatedContext(error);
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve();
      });
    } catch (error) {
      if (invalidContextError(error)) shutdownInvalidatedContext(error);
      reject(error);
    }
  });
  const storageRemove = (keys) => new Promise((resolve, reject) => {
    try {
      requireExtensionContext();
      chrome.storage.local.remove(keys, () => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          if (invalidContextError(error)) shutdownInvalidatedContext(error);
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve();
      });
    } catch (error) {
      if (invalidContextError(error)) shutdownInvalidatedContext(error);
      reject(error);
    }
  });

  function ebayInterruptionReason() {
    const text = String(document.body?.innerText || document.body?.textContent || "").replace(/\s+/g, " ");
    if (/pardon our interruption/i.test(text)) return "eBay displayed Pardon Our Interruption.";
    if (/made us think you were a bot/i.test(text)) return "eBay reported suspected automated browsing.";
    if (/verify (?:that )?you are (?:a )?human|security challenge|complete the captcha/i.test(text)) {
      return "eBay displayed a human-verification challenge.";
    }
    if (/captcha|challenge/i.test(location.pathname) && /ebay\./i.test(location.hostname)) {
      return "eBay redirected to a verification page.";
    }
    return "";
  }

  async function stopForEbayInterruption(operation = "eBay automation") {
    const reason = ebayInterruptionReason();
    if (!reason) {
      ebayInterruptionStopped = false;
      return false;
    }
    if (ebayInterruptionStopped) return true;
    ebayInterruptionStopped = true;
    const detectedAt = new Date().toISOString();
    const stored = await storageGet(["pendingMove99Run"]);
    const pending = stored.pendingMove99Run;
    const values = {
      gldnStopRequested: true,
      lastEbayInterruption: {
        operation,
        reason,
        detectedAt,
        pageUrl: location.href,
        extensionVersion: EXTENSION_VERSION
      }
    };
    if (pending) {
      values.pendingMove99Run = {
        ...pending,
        active: false,
        confirmed: false,
        phase: "blocked-by-ebay",
        interruptionDetected: true,
        interruptionReason: reason,
        interruptionDetectedAt: detectedAt,
        error: `${reason} Clear the eBay interruption manually, then use Reset before starting again.`
      };
    }
    await storageSet(values);
    renderStatus(`${reason} GLDN Ops stopped and will not retry. Clear the interruption manually, then use Reset.`, "error");
    chrome.runtime.sendMessage({
      type: "recordExtensionLog",
      entry: { source: "ebay", operation, level: "error", message: reason, detail: location.href }
    }, () => void chrome.runtime.lastError);
    return true;
  }

  function asStringArray(value) {
    return Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
  }

  function buildMove99ActiveUrl(sourceStoreCategoryIds) {
    const ids = asStringArray(sourceStoreCategoryIds);
    if (!ids.length) return ACTIVE_LISTINGS_URL;
    const url = new URL(ACTIVE_LISTINGS_URL);
    url.searchParams.set("storeCatIds", ids.join(","));
    url.searchParams.set("source", "filterpanel");
    url.searchParams.set("action", "search");
    return url.toString();
  }

  function move99ConfiguredAccounts() {
    const configured = globalThis.GLDN_CONFIG?.move99Accounts;
    return configured && typeof configured === "object" ? configured : {};
  }

  function configuredMove99AccountConfig(account) {
    const configuredAccounts = move99ConfiguredAccounts();
    return configuredAccounts[account] || configuredAccounts[account.toLowerCase()] || {};
  }

  async function storedMove99AccountConfig(account) {
    const result = await storageGet(["move99AccountSettings"]);
    const settings = result.move99AccountSettings || {};
    return settings[account] || settings[account.toLowerCase()] || {};
  }

  async function move99AccountConfig(accountLabel) {
    const account = normalizedEbayAccount(accountLabel);
    const configured = configuredMove99AccountConfig(account);
    const builtin = MOVE99_BUILTIN_ACCOUNT_CONFIGS[account] || {};
    const stored = await storedMove99AccountConfig(account);
    const merged = FOUNDATION.move99SettingsForAccount(account, { ...builtin, ...configured, ...stored });
    const validation = FOUNDATION.validateMove99Settings(merged);
    if (!validation.ok) throw new Error(validation.errors[0] || "Move .99 categories are not configured.");
    const settings = validation.settings;
    const sourceStoreCategoryIds = settings.sourceStoreCategoryIds;
    return {
      account,
      sourceStoreCategoryIds,
      activeUrl: String(merged.activeUrl || buildMove99ActiveUrl(sourceStoreCategoryIds)).trim() || ACTIVE_LISTINGS_URL,
      sourceCategories: settings.sourceCategories,
      destinationCategory: settings.destinationCategory,
      backburnerItemIds: settings.backburnerItemIds
    };
  }

  async function applyMove99AccountConfig(accountLabel) {
    const config = await move99AccountConfig(accountLabel);
    MOVE99_SOURCE_STORE_CATEGORY_IDS = config.sourceStoreCategoryIds;
    MOVE99_ACTIVE_URL = config.activeUrl;
    MOVE99_SOURCE_CATEGORIES = config.sourceCategories;
    MOVE99_DESTINATION_CATEGORY = config.destinationCategory;
    MOVE99_BACKBURNER_ITEM_IDS = new Set(config.backburnerItemIds);
    return config;
  }

  function move99Csv(value) {
    return String(value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  async function showMove99SettingsModal() {
    document.getElementById("gldn-move99-settings")?.remove();
    const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    const identity = normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel);
    const account = identity.poshmarkOnly ? "" : identity.ebayAccountLabel;
    if (!account) {
      renderStatus("This computer is Poshmark-only and does not have eBay Store categories.", "error");
      return;
    }

    let current;
    try {
      current = await move99AccountConfig(account);
    } catch (error) {
      renderStatus(error.message || "Could not load Store category settings.", "error");
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "gldn-move99-settings";
    overlay.className = "gldn-modal-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-move99-settings-modal">
        <button type="button" class="gldn-close" aria-label="Close Store category settings">&times;</button>
        <h2>Store Category Settings</h2>
        <p class="gldn-help-text">Saved only for eBay account <strong>${escapeHtml(account)}</strong>. This screen cannot move or revise listings.</p>
        <label class="gldn-field-row" for="gldn-move99-source-categories">
          <span class="gldn-label">Source Store categories</span>
          <input id="gldn-move99-source-categories" class="gldn-text-input" type="text" value="${escapeHtml(current.sourceCategories.join(", "))}">
          <span class="gldn-field-help">Exact category names, separated by commas.</span>
        </label>
        <label class="gldn-field-row" for="gldn-move99-destination-category">
          <span class="gldn-label">Destination Store category</span>
          <input id="gldn-move99-destination-category" class="gldn-text-input" type="text" value="${escapeHtml(current.destinationCategory)}">
        </label>
        <label class="gldn-field-row" for="gldn-move99-source-category-ids">
          <span class="gldn-label">Source Store category IDs</span>
          <input id="gldn-move99-source-category-ids" class="gldn-text-input" type="text" value="${escapeHtml(current.sourceStoreCategoryIds.join(", "))}">
          <span class="gldn-field-help">Optional numeric IDs, separated by commas.</span>
        </label>
        <label class="gldn-field-row" for="gldn-move99-backburner-ids">
          <span class="gldn-label">Backburner item IDs</span>
          <input id="gldn-move99-backburner-ids" class="gldn-text-input" type="text" value="${escapeHtml(current.backburnerItemIds.join(", "))}">
          <span class="gldn-field-help">Items that the mover must always skip.</span>
        </label>
        <div class="gldn-actions gldn-move99-settings-actions">
          <button type="button" class="gldn-secondary" data-action="copy-category-backup">Copy Category Backup</button>
          <button type="button" class="gldn-secondary" data-action="restore-category-backup">Restore Category Backup</button>
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save">Save and Verify</button>
        </div>
        <div class="gldn-modal-status" role="status" aria-live="polite">Loaded verified settings for ${escapeHtml(account)}.</div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnMove99SettingsModalPosition");

    const modal = overlay.querySelector(".gldn-modal");
    const status = modal.querySelector(".gldn-modal-status");
    const sourceInput = modal.querySelector("#gldn-move99-source-categories");
    const destinationInput = modal.querySelector("#gldn-move99-destination-category");
    const sourceIdsInput = modal.querySelector("#gldn-move99-source-category-ids");
    const backburnerInput = modal.querySelector("#gldn-move99-backburner-ids");
    const setModalStatus = (message, error = false) => {
      status.textContent = message;
      status.dataset.type = error ? "error" : "completed";
    };
    const readForm = () => FOUNDATION.validateMove99Settings({
      sourceCategories: move99Csv(sourceInput.value),
      destinationCategory: destinationInput.value.trim(),
      sourceStoreCategoryIds: move99Csv(sourceIdsInput.value),
      backburnerItemIds: move99Csv(backburnerInput.value)
    });
    const renderSettings = (settings) => {
      sourceInput.value = settings.sourceCategories.join(", ");
      destinationInput.value = settings.destinationCategory;
      sourceIdsInput.value = settings.sourceStoreCategoryIds.join(", ");
      backburnerInput.value = settings.backburnerItemIds.join(", ");
    };
    const saveAndVerify = async (settings) => {
      const storageSettings = JSON.parse(JSON.stringify(settings));
      const result = await storageGet(["move99AccountSettings"]);
      const allSettings = { ...(result.move99AccountSettings || {}), [account]: storageSettings };
      await storageSet({ move99AccountSettings: allSettings });
      const verified = await storageGet(["move99AccountSettings"]);
      const saved = verified.move99AccountSettings?.[account];
      const savedValidation = FOUNDATION.validateMove99Settings(saved || {});
      if (!savedValidation.ok || JSON.stringify(savedValidation.settings) !== JSON.stringify(settings)) {
        throw new Error(`Saved Store categories for ${account} could not be verified.`);
      }
      await applyMove99AccountConfig(account);
      renderSettings(savedValidation.settings);
      return savedValidation.settings;
    };

    const close = () => overlay.remove();
    modal.querySelector(".gldn-close").addEventListener("click", close);
    modal.querySelector("[data-action='cancel']").addEventListener("click", close);
    modal.querySelector("[data-action='save']").addEventListener("click", async () => {
      const validation = readForm();
      if (!validation.ok) {
        setModalStatus(validation.errors[0], true);
        return;
      }
      try {
        await saveAndVerify(validation.settings);
        setModalStatus(`Saved and verified Store categories for ${account}.`);
      } catch (error) {
        setModalStatus(error.message || "Could not save Store categories.", true);
      }
    });
    modal.querySelector("[data-action='copy-category-backup']").addEventListener("click", async () => {
      const validation = readForm();
      if (!validation.ok) {
        setModalStatus(validation.errors[0], true);
        return;
      }
      try {
        const backup = {
          type: "gldn-move99-category-backup",
          version: 1,
          account,
          settings: validation.settings
        };
        await navigator.clipboard.writeText(JSON.stringify(backup, null, 2));
        setModalStatus(`Copied verified Store category backup for ${account}.`);
      } catch (error) {
        setModalStatus(error.message || "Could not copy the Store category backup.", true);
      }
    });
    modal.querySelector("[data-action='restore-category-backup']").addEventListener("click", async () => {
      try {
        const backup = JSON.parse(await navigator.clipboard.readText());
        if (backup?.type !== "gldn-move99-category-backup" || Number(backup?.version) !== 1) {
          throw new Error("Clipboard does not contain a GLDN Store category backup.");
        }
        if (normalizedEbayAccount(backup.account) !== account) {
          throw new Error(`This backup belongs to ${backup.account || "another account"}, not ${account}.`);
        }
        const validation = FOUNDATION.validateMove99Settings(backup.settings);
        if (!validation.ok) throw new Error(validation.errors[0]);
        await saveAndVerify(validation.settings);
        setModalStatus(`Restored and verified Store categories for ${account}.`);
      } catch (error) {
        setModalStatus(error.message || "Could not restore the Store category backup.", true);
      }
    });
  }

  function move99QualifiesByMode(entry, itemId) {
    if (MOVE99_BACKBURNER_ITEM_IDS.has(itemId)) return false;
    if (!hasValidListingPrice(entry.price)) return false;
    const is99 = priceEndsIn99(entry.price);
    return MOVE99_SCAN_MODE === "non99" ? !is99 : is99;
  }

  function move99WorkflowLabel() {
    return MOVE99_SCAN_MODE === "non99" ? "Move Non-.99 Out of Sale" : "Move .99 Listings";
  }

  function move99FoundLabel() {
    return MOVE99_SCAN_MODE === "non99" ? "non-.99 found" : ".99 found";
  }



  const TASK_STOP_MESSAGE = "Stopped by user.";

  async function ensureTaskCanContinue() {
    const result = await storageGet(["gldnStopRequested"]);
    if (result.gldnStopRequested) throw new Error(TASK_STOP_MESSAGE);
  }

  function normalizeSellerName(value) {
    const cleaned = String(value || "")
      .trim()
      .replace(/^seller:\s*/i, "")
      .replace(/\s+\(\d[\d,]*\).*$/, "")
      .replace(/\s+\d{1,3}(?:\.\d+)?%\s+positive.*$/i, "")
      .replace(/[^a-z0-9_.-]/gi, "");
    if (cleaned.length < 3 || cleaned.length > 64) return "";
    if (/^(seller|shop|search|feedback|sponsored|located|shipping|condition|brand)$/i.test(cleaned)) return "";
    return cleaned;
  }

  function extractVisibleEbaySellerNames() {
    const sellers = new Set();
    [...document.querySelectorAll("a[href*='/usr/'], a[href*='/str/']")].forEach((link) => {
      const href = String(link.getAttribute("href") || "");
      const match = href.match(/\/(?:usr|str)\/([^/?#]+)/i);
      const seller = normalizeSellerName(decodeURIComponent(match?.[1] || link.textContent || ""));
      if (seller) sellers.add(seller);
    });
    const lines = String(document.body?.innerText || "").split(/\n+/).slice(0, 1200);
    lines.forEach((line) => {
      const text = line.trim();
      const sellerMatch = text.match(/^([a-z0-9][a-z0-9_.-]{2,63})\s+\d{1,3}(?:\.\d+)?%\s+positive/i);
      const bySellerMatch = text.match(/\bby\s+([a-z0-9][a-z0-9_.-]{2,63})\b/i);
      const seller = normalizeSellerName(sellerMatch?.[1] || bySellerMatch?.[1] || "");
      if (seller) sellers.add(seller);
    });
    return [...sellers].sort((a, b) => a.localeCompare(b));
  }

  function numberFromMoneyText(value) {
    const match = String(value || "").replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{2})?)/);
    return match ? Number(match[1]) : null;
  }

  function productWorkflowDefaults() {
    return {
      workflows: {
        sniping: { steps: {}, counters: {}, sellers: [], amazonPrice: "", minMarkupPercent: 70, candidates: [] },
        substitution: { steps: {}, counters: {} }
      },
      notes: "",
      savedAt: ""
    };
  }

  async function loadProductWorkflow() {
    const stored = await storageGet(["findProductsWorkflow", "lastAmazonProductPrice"]);
    const defaults = productWorkflowDefaults();
    const previous = stored.findProductsWorkflow || {};
    const workflow = { ...defaults, ...previous, workflows: { ...defaults.workflows, ...(previous.workflows || {}) } };
    workflow.workflows.sniping = { ...defaults.workflows.sniping, ...(workflow.workflows.sniping || {}) };
    workflow.workflows.substitution = { ...defaults.workflows.substitution, ...(workflow.workflows.substitution || {}) };
    if (!workflow.workflows.sniping.amazonPrice && stored.lastAmazonProductPrice) {
      workflow.workflows.sniping.amazonPrice = String(stored.lastAmazonProductPrice);
    }
    return workflow;
  }

  function isEbaySearchResultsPage() {
    return /\/sch\/i\.html/i.test(location.pathname) || document.querySelector(".srp-results, ul.srp-results");
  }

  function extractEbayResultCards() {
    const cards = [...document.querySelectorAll("li.s-card, div.s-card, li.s-item, div.s-item, .srp-results .s-item")];
    const domCards = cards.map((card) => {
      const sellerLink = card.querySelector("a[href*='/usr/'], a[href*='/str/']");
      const href = String(sellerLink?.getAttribute("href") || "");
      const sellerFromHref = href.match(/\/(?:usr|str)\/([^/?#]+)/i)?.[1] || "";
      const cardText = String(card.innerText || card.textContent || "").replace(/\s+/g, " ").trim();
      const sellerFromPositive = cardText.match(/\b([a-z0-9][a-z0-9_.-]{2,63})\s+\d{1,3}(?:\.\d+)?%\s+positive\b/i)?.[1] || "";
      const seller = normalizeSellerName(decodeURIComponent(sellerFromHref || sellerLink?.textContent || sellerFromPositive));
      const priceText = card.querySelector(".s-card__price, .s-item__price, [class*='price']")?.textContent || "";
      const price = numberFromMoneyText(priceText);
      const title = String(card.querySelector(".s-card__title, .s-item__title, [role='heading']")?.textContent || "")
        .replace(/\s*Opens in a new window or tab\s*$/i, "")
        .trim();
      const itemUrl = card.querySelector("a.s-card__link[href*='/itm/'], a.s-item__link[href*='/itm/'], a[href*='/itm/']")?.href || "";
      const itemNumber = SNIPING.normalizeItemNumber(itemUrl.match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})(?:[/?#]|$)/i)?.[1]);
      const image = card.querySelector("img.s-card__image, img.s-item__image-img, img");
      return {
        seller,
        price,
        title,
        itemUrl,
        itemNumber,
        imageUrl: String(image?.currentSrc || image?.src || "")
      };
    }).filter((record) => record.seller && Number.isFinite(record.price) && record.price > 0);
    if (domCards.length) return domCards;

    const lines = String(document.body?.innerText || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const textCards = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const sellerMatch = line.match(/^([a-z0-9][a-z0-9_.-]{2,63})\s+\d{1,3}(?:\.\d+)?%\s+positive\b/i);
      if (!sellerMatch) continue;
      const seller = normalizeSellerName(sellerMatch[1]);
      const priceIndex = Math.max(0, index - 8);
      const previous = lines.slice(priceIndex, index);
      const priceLine = [...previous].reverse().find((candidate) => /^\$\d[\d,.]*(?:\.\d{2})?$/.test(candidate));
      const price = numberFromMoneyText(priceLine);
      const titleLine = [...previous].reverse().find((candidate) => (
        candidate.length > 14 &&
        !/^(Brand New|Buy It Now|or Best Offer|Free delivery|Located in|Opens in|Shop on eBay|derosnopS)$/i.test(candidate) &&
        !/^\$/.test(candidate)
      ));
      const itemLine = lines.slice(index, index + 6).find((candidate) => /^Item:\s*\d+/i.test(candidate));
      const itemNumber = SNIPING.normalizeItemNumber(itemLine?.replace(/^Item:\s*/i, ""));
      if (seller && Number.isFinite(price) && price > 0) {
        textCards.push({
          seller,
          price,
          title: titleLine || "",
          itemNumber,
          itemUrl: itemNumber ? `https://www.ebay.com/itm/${itemNumber}` : "",
          imageUrl: ""
        });
      }
    }
    return textCards;
  }

  async function waitForSnipingSearchResultsStable(timeoutMs = 10000) {
    const selector = "li.s-card, div.s-card, li.s-item, div.s-item, .srp-results .s-item";
    const deadline = Date.now() + timeoutMs;
    let previousCount = -1;
    let stablePasses = 0;
    while (Date.now() < deadline) {
      const count = document.querySelectorAll(selector).length;
      const busy = Boolean(document.querySelector('[aria-busy="true"], [role="progressbar"]'));
      stablePasses = count > 0 && count === previousCount && !busy ? stablePasses + 1 : 0;
      if (stablePasses >= 2) return count;
      previousCount = count;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return document.querySelectorAll(selector).length;
  }

  async function extractSnipingSellersForProductWorkflow() {
    const workflow = await loadProductWorkflow();
    const sniping = workflow.workflows.sniping || { steps: {}, counters: {}, sellers: [], amazonPrice: "", minMarkupPercent: 70 };
    const anchorProduct = sniping.anchorProduct;
    const amazonPrice = numberFromMoneyText(anchorProduct?.price || sniping.amazonPrice || workflow.lastAmazonPrice);
    const minMarkupPercent = Math.max(0, Number(sniping.minMarkupPercent || 70));
    if (!anchorProduct?.title || !amazonPrice || !anchorProduct.asin || !SNIPING.amazonUrlMatchesAsin(anchorProduct.url, anchorProduct.asin)) {
      renderStatus("Sniping needs one exact Amazon ASIN and price first.", "error");
      alert("Open the exact Amazon product page and start Sniping Workflow again. A visible price and ASIN are required.");
      return;
    }

    const cards = extractEbayResultCards();
    const candidates = cards
      .filter((record) => FOUNDATION.allowedBulkProductTitle(record.title))
      .map((record) => SNIPING.buildSellerCandidate(anchorProduct, record, { minMarkupPercent }))
      .filter((candidate) => (
        candidate.seller
        && candidate.ebayItemNumber
        && SNIPING.ebayUrlMatchesItem(candidate.ebayUrl, candidate.ebayItemNumber)
        && candidate.economics.qualifiesMarkup
        && candidate.economics.profitableEstimate
      ))
      .sort((left, right) => right.titleSimilarity - left.titleSimilarity || right.economics.markupPercent - left.economics.markupPercent)
      .slice(0, 12);
    if (!candidates.length) {
      const minimum = SNIPING.calculateEconomics({ amazonPrice, ebayPrice: amazonPrice * (1 + minMarkupPercent / 100), minMarkupPercent }).minimumEbayPrice;
      renderStatus(`No exact-review candidates met ${minMarkupPercent}% markup over $${amazonPrice.toFixed(2)}.`, "error");
      alert(`No eligible seller candidates were found.\n\nAmazon price: $${amazonPrice.toFixed(2)}\nMinimum eBay price: $${minimum.toFixed(2)}\nApparel, missing item IDs, and non-profitable estimates were excluded.`);
      return;
    }

    workflow.workflows.sniping = {
      ...sniping,
      phase: "seller-review",
      candidates,
      counters: { ...(sniping.counters || {}), sellerCandidates: candidates.length },
      steps: { ...(sniping.steps || {}), anchorCaptured: true, chooseCompetitors: false, matchAmazon: false }
    };
    workflow.savedAt = new Date().toISOString();
    await storageSet({ findProductsWorkflow: workflow });
    renderStatus(`Returning to Amazon to review ${candidates.length.toLocaleString()} seller candidate(s).`, "ready");
    const opened = await runtimeMessage({
      type: "handoffAmazonSnipingSellerReview",
      anchorAsin: anchorProduct.asin,
      anchorTabId: sniping.anchorTabId
    });
    if (!opened?.ok) throw new Error(opened?.error || "The Amazon seller review could not open.");
    return true;
  }

  let snipingExtractRunning = false;

  async function resumePendingSnipingExtract() {
    if (snipingExtractRunning) return false;
    const result = await storageGet(["pendingSnipingExtract"]);
    const pending = result.pendingSnipingExtract;
    if (!pending?.active) return false;
    if (Date.now() - Number(pending.startedAt || 0) > 120000) {
      await storageRemove(["pendingSnipingExtract"]);
      renderStatus("Sniping workflow timed out. Start again from Amazon product page.", "error");
      return false;
    }
    if (!isEbaySearchResultsPage()) return false;
    snipingExtractRunning = true;
    try {
      const resultCount = await waitForSnipingSearchResultsStable();
      if (!resultCount) throw new Error("eBay did not finish rendering any search results.");
      await extractSnipingSellersForProductWorkflow();
      await storageRemove(["pendingSnipingExtract"]);
      return true;
    } catch (error) {
      await storageSet({
        pendingSnipingExtract: {
          ...pending,
          active: false,
          phase: "failed",
          failedAt: Date.now(),
          error: error?.message || String(error)
        }
      });
      renderStatus(`Sniping scan stopped safely: ${error?.message || String(error)}`, "error");
      chrome.runtime.sendMessage({
        type: "recordExtensionLog",
        entry: { source: "sniping", operation: "seller-scan", message: error?.message || String(error) }
      }, () => void chrome.runtime.lastError);
      return false;
    } finally {
      snipingExtractRunning = false;
    }
  }

  function taskWasStopped(error) {
    return String(error?.message || error || "") === TASK_STOP_MESSAGE;
  }

  async function stopCurrentTask() {
    await storageSet({ gldnStopRequested: true });
    renderStatus("Stop requested — waiting for the next safe checkpoint…", "error");
  }

  async function resetAutomation() {
    const result = await runtimeMessage({ type: "resetAutomationState" });
    if (!result?.ok) {
      renderStatus(`Reset failed: ${result?.error || "extension background unavailable"}`, "error");
      return;
    }
    markShippedRunning = false;
    move99Running = false;
    document.querySelectorAll(".gldn-modal-backdrop").forEach((element) => element.remove());
    renderStatus("Automation reset — ready.", "ready");
  }

  const runtimeMessage = (message) => new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response from extension background service." });
    });
  });

  async function reloadExtensionFromPanel() {
    const version = chrome.runtime.getManifest().version;
    renderStatus(`Checking for a verified update after v${version}...`, "ready");
    const response = await runtimeMessage({ type: "updateExtension", returnUrl: location.href, reloadWhenCurrent: true });
    if (!response?.ok) {
      renderStatus(`Update failed: ${response?.error || "extension background unavailable"}`, "error");
      return;
    }
    if (!response.updated) renderStatus(response.message || "GLDN Ops is already current.", "completed");
  }

  async function syncSellerLevelRecord(record) {
    return runtimeMessage({ type: "syncSellerLevel", record });
  }

  async function syncAccountLimitsRecord(record) {
    return runtimeMessage({ type: "syncAccountLimits", record });
  }

  async function syncMarkShippedRecord(record) {
    return runtimeMessage({ type: "syncMarkShipped", record });
  }

  async function runFeatureHealthFromPanel() {
    try {
      renderStatus("Running GLDN Ops health check...", "ready");
      const health = await U.runFeatureHealthCheck();
      renderStatus(health.message, health.ok ? "completed" : "error");
      return health;
    } catch (error) {
      const message = error?.message || "Unknown health-check failure.";
      renderStatus(`Health failed: ${message}`, "error");
      return { ok: false, message };
    }
  }

  async function setupDashboardFromPanel() {
    const saved = await U.promptAndSaveDashboardSetup();
    if (!saved.ok) {
      renderStatus(`Dashboard setup failed: ${saved.error}`, "error");
      return;
    }
    renderStatus("Dashboard setup saved. Running health check...", "ready");
    await runFeatureHealthFromPanel();
  }

  async function syncMarketplaceProfitRecord(record) {
    return runtimeMessage({ type: "syncMarketplaceProfit", record });
  }

  async function refreshProfitForMatchingSavedNote(record) {
    const sync = await syncMarketplaceProfitRecord(record);
    if (!sync?.ok && !sync?.queued) throw new Error(sync?.error || "Dashboard profit refresh failed.");
    await storageSet({
      latestMarketplaceProfit: record,
      lastProfitRefresh: {
        platform: record.platform,
        computerLabel: record.computerLabel,
        orderNumber: record.orderNumber,
        refreshedAt: new Date().toISOString()
      }
    });
    return sync;
  }

  async function openDashboard() {
    renderStatus("Opening shared dashboard...", "ready");
    const response = await runtimeMessage({ type: "openDashboard" });
    if (!response?.ok) {
      renderStatus(`Dashboard could not open: ${response?.error || "unknown error"}`, "error");
      return;
    }
    renderStatus("Dashboard opened.", "completed");
  }

  async function openEcomSniperPageFromContent(page) {
    const response = await runtimeMessage({ type: "openEcomSniperPage", page });
    if (!response?.ok) {
      renderStatus(`Could not open EcomSniper: ${response?.error || "unknown error"}`, "error");
      return false;
    }
    return true;
  }

  function currentEbaySnipingWinner() {
    const itemNumber = SNIPING.normalizeItemNumber(location.href.match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})(?:[/?#]|$)/i)?.[1]);
    if (!itemNumber) return null;
    const title = String([
      document.querySelector("h1.x-item-title__mainTitle"),
      document.querySelector("h1[itemprop='name']"),
      document.querySelector("[data-testid='x-item-title'] h1"),
      document.querySelector("h1")
    ].find((element) => element?.textContent?.trim())?.textContent || "").replace(/\s+/g, " ").trim();
    const price = [
      document.querySelector(".x-price-primary .ux-textspans"),
      document.querySelector("[itemprop='price']"),
      document.querySelector(".x-bin-price__content .ux-textspans")
    ].map((element) => numberFromMoneyText(element?.getAttribute?.("content") || element?.textContent || ""))
      .find((value) => Number.isFinite(value) && value > 0);
    const sellerLink = [...document.querySelectorAll("a[href*='/usr/'], a[href*='/str/']")]
      .find((element) => U.isVisible(element));
    const sellerHref = String(sellerLink?.href || sellerLink?.getAttribute?.("href") || "");
    const seller = normalizeSellerName(decodeURIComponent(sellerHref.match(/\/(?:usr|str)\/([^/?#]+)/i)?.[1] || sellerLink?.textContent || ""));
    const image = [
      document.querySelector("#icImg"),
      document.querySelector(".ux-image-carousel-item img"),
      document.querySelector("[data-testid='x-item-image'] img")
    ].find((element) => element?.currentSrc || element?.src);
    const visibleText = String(document.body?.innerText || "").slice(0, 120000);
    const soldForPeriod = (days) => {
      const patterns = [
        new RegExp(`(?:sold|sales)[^\\d]{0,20}(\\d[\\d,]*)[^\\n]{0,24}(?:last\\s*)?${days}\\s*days?`, "i"),
        new RegExp(`${days}\\s*days?[^\\d]{0,24}(\\d[\\d,]*)`, "i")
      ];
      const match = patterns.map((pattern) => visibleText.match(pattern)).find(Boolean);
      return match ? Number(match[1].replace(/,/g, "")) : 0;
    };
    return {
      itemNumber,
      url: `https://www.ebay.com/itm/${itemNumber}`,
      title,
      price,
      seller,
      image: String(image?.currentSrc || image?.src || ""),
      sold30: soldForPeriod(30),
      sold90: soldForPeriod(90)
    };
  }

  function showSnipingWinnerCapture(winner, qualifiedSeller) {
    document.getElementById("gldn-sniping-winner-capture")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-sniping-winner-capture";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-review-modal gldn-sniping-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Capture EcomSniper Winner</h2>
        <p class="gldn-help-text">This must be a recent-selling item from the verified competitor. Capturing it copies the title and opens Product Hunter. It does not create a listing.</p>
        <div class="gldn-sniping-anchor">
          ${winner.image ? `<img src="${escapeHtml(winner.image)}" alt="eBay winner">` : ""}
          <div>
            <strong>${escapeHtml(winner.seller || "Seller not detected")} - $${Number(winner.price || 0).toFixed(2)}</strong>
            <span>${escapeHtml(winner.title)}</span>
            <a href="${escapeHtml(winner.url)}" target="_blank" rel="noopener">Open eBay item ${escapeHtml(winner.itemNumber)}</a>
          </div>
        </div>
        <div class="gldn-grid">
          <div><label class="gldn-label" for="gldn-sniping-sold30">Sold last 30 days</label><input id="gldn-sniping-sold30" class="gldn-text-input" inputmode="numeric" value="${Number(winner.sold30 || 0)}"></div>
          <div><label class="gldn-label" for="gldn-sniping-sold90">Sold last 90 days</label><input id="gldn-sniping-sold90" class="gldn-text-input" inputmode="numeric" value="${Number(winner.sold90 || 0)}"></div>
        </div>
        <label class="gldn-confirm"><input type="checkbox" data-check="seller"> This winner belongs to verified seller ${escapeHtml(qualifiedSeller)}</label>
        <label class="gldn-confirm"><input type="checkbox" data-check="demand"> I verified the recent sold counts in EcomSniper</label>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="capture" disabled>Capture &amp; Open Product Hunter</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    makeReviewModalDraggable(overlay);
    const status = overlay.querySelector(".gldn-modal-status");
    const capture = overlay.querySelector("[data-action='capture']");
    const update = () => {
      capture.disabled = ![...overlay.querySelectorAll("[data-check]")].every((input) => input.checked);
    };
    overlay.addEventListener("change", update);
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    capture.addEventListener("click", async () => {
      const sold30 = Math.max(0, Number(overlay.querySelector("#gldn-sniping-sold30")?.value || 0));
      const sold90 = Math.max(0, Number(overlay.querySelector("#gldn-sniping-sold90")?.value || 0));
      if (!Number.isFinite(sold30) || !Number.isFinite(sold90) || sold90 <= 0 || sold30 > sold90) {
        status.textContent = "Enter verified recent sold counts. Sold last 90 days must be positive and at least the 30-day count.";
        status.dataset.type = "error";
        return;
      }
      const workflow = await loadProductWorkflow();
      const sniping = workflow.workflows.sniping || {};
      const capturedWinner = {
        ...winner,
        sold30,
        sold90,
        capturedAt: new Date().toISOString(),
        source: "ecomsniper-verified-winner"
      };
      workflow.workflows.sniping = {
        ...sniping,
        phase: "winner-captured",
        winner: capturedWinner,
        counters: { ...(sniping.counters || {}), winnersFound: Number(sniping.counters?.winnersFound || 0) + 1 },
        steps: { ...(sniping.steps || {}), scanRecentSold: true, filterWinners: true, matchAmazon: false, profitCheck: false, preListReview: false }
      };
      workflow.savedAt = new Date().toISOString();
      await storageSet({
        findProductsWorkflow: workflow,
        pendingSnipingWinner: { active: true, winner: capturedWinner, startedAt: Date.now() }
      });
      try { await navigator.clipboard.writeText(capturedWinner.title); } catch (_) {}
      renderStatus("Winner captured. Product Hunter is opening for the exact Amazon match.", "completed");
      close();
      chrome.runtime.sendMessage({ type: "openEcomSniperPage", page: "productHunter" }, () => void chrome.runtime.lastError);
    });
  }

  async function captureSnipingWinner() {
    const workflow = await loadProductWorkflow();
    const sniping = workflow.workflows.sniping || {};
    const qualifiedSeller = normalizeSellerName(sniping.qualifiedSeller?.seller || "");
    if (!qualifiedSeller || sniping.qualifiedSeller?.exactAnchorMatch !== true) {
      renderStatus("Verify a markup-qualified competitor before capturing a winner.", "error");
      return;
    }
    const winner = currentEbaySnipingWinner();
    if (!winner?.title || !winner.price || !winner.itemNumber || !SNIPING.ebayUrlMatchesItem(winner.url, winner.itemNumber)) {
      renderStatus("Open the exact eBay winner listing first.", "error");
      return;
    }
    if (!FOUNDATION.allowedBulkProductTitle(winner.title)) {
      renderStatus("This winner is in an excluded apparel, shoes, costume, or fashion category.", "error");
      return;
    }
    if (winner.seller && normalizeSellerName(winner.seller) !== qualifiedSeller) {
      renderStatus(`This listing belongs to ${winner.seller}, not verified seller ${qualifiedSeller}.`, "error");
      return;
    }
    showSnipingWinnerCapture(winner, qualifiedSeller);
  }

  async function refreshSnipingWinnerButton() {
    if (!snipingWinnerButtonElement) return;
    const workflow = await loadProductWorkflow();
    const sniping = workflow.workflows.sniping || {};
    const active = Boolean(sniping.qualifiedSeller?.exactAnchorMatch && !sniping.preListReview?.preListReady);
    snipingWinnerButtonElement.hidden = !active;
  }

  const formatCountLabel = (value) => Number(value || 0).toLocaleString();
  const formatCurrencyLabel = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const parseNumericText = (value) => {
    const raw = String(value ?? "").replace(/[^0-9.-]/g, "");
    return raw === "" ? NaN : Number(raw);
  };

  function extractEbayEarnings() {
    return U.findMoneyNearLabel([/^Order earnings$/i, /^Order earnings\b/i]);
  }

  function extractEbayOrderNumber() {
    const text = document.body?.innerText || "";
    const standard = text.match(/\b\d{2}-\d{5}-\d{5}\b/);
    if (standard) return standard[0];
    const orderLine = text.match(/\bOrder\s*\n?\s*([A-Z0-9-]{8,})/i);
    return orderLine ? orderLine[1] : "";
  }

  function extractEbayTitleCandidates() {
    return [...document.querySelectorAll("a")].map((anchor) => ({
      text: (anchor.innerText || anchor.textContent || "").trim(),
      href: anchor.getAttribute("href") || anchor.href || "",
      visible: Boolean(anchor.getClientRects?.().length)
    }));
  }

  function extractEbayTitles() {
    const candidates = extractEbayTitleCandidates();
    const primary = AUDIT?.selectMarketplaceItemTitle?.(candidates) || "";
    const fallback = candidates
      .map((candidate) => candidate.text)
      .filter((text) => text.length >= 12 && text.length <= 500)
      .filter((text) => !/^(skip to main content|main content|learn more|view more details|message buyer|add tracking|show contact info)$/i.test(text));
    return [...new Set([primary, ...fallback].filter(Boolean))].slice(0, 20);
  }

  function extractShipToBlock() {
    const lines = U.getBodyLines();
    const start = lines.findIndex((line) => /^Ship to\b/i.test(line));
    if (start === -1) return "";
    const collected = [];
    for (let i = start; i < Math.min(lines.length, start + 8); i += 1) {
      if (i > start && /^(phone|buyer selected|tracking|item|payment)/i.test(lines[i])) break;
      collected.push(lines[i]);
    }
    return collected.join(" | ");
  }

  function findExistingNoteContainer() {
    const markers = [...document.querySelectorAll("span, div, dt, dd, p")]
      .filter(U.isVisible)
      .filter((element) => !element.closest?.("[id^='gldn-'], .gldn-modal-backdrop"))
      .filter((element) => U.normalizeText(element.textContent || element.innerText) === "my note");
    const seen = new Set();
    for (const marker of markers) {
      let container = marker.parentElement;
      for (let depth = 0; container && depth < 6; depth += 1, container = container.parentElement) {
        if (container.closest?.("[id^='gldn-'], .gldn-modal-backdrop")) break;
        if (seen.has(container)) continue;
        seen.add(container);
        const edits = [...container.querySelectorAll("button, a, [role='button']")]
          .filter(U.isVisible)
          .filter((element) => U.normalizeText(element.textContent || element.innerText) === "edit");
        if (edits.length === 1) return container;
        if (edits.length > 1) break;
      }
    }
    return null;
  }

  function decodeSkuToAsin(sku) {
    const text = String(sku || "").trim();
    if (/^[A-Z0-9]{10}$/i.test(text)) return text.toUpperCase();
    try {
      const decoded = atob(text).trim();
      return /^[A-Z0-9]{10}$/i.test(decoded) ? decoded.toUpperCase() : "";
    } catch (_) {
      return "";
    }
  }

  function extractEbaySkuValues() {
    const text = String(document.body?.innerText || "");
    return [...new Set(
      [...text.matchAll(/Custom label\s*\(SKU\)\s*:?\s*([A-Za-z0-9+/=_-]+)/gi)]
        .map((match) => String(match[1] || "").trim())
        .filter(Boolean)
    )];
  }

  function extractEbayOrderIdentity() {
    const skus = extractEbaySkuValues();
    return {
      orderNumber: extractEbayOrderNumber(),
      skus,
      asins: [...new Set(skus.map(decodeSkuToAsin).filter(Boolean))]
    };
  }

  function extractExistingNote() {
    const container = findExistingNoteContainer();
    if (!container) return "";
    return String(container.innerText || container.textContent || "")
      .replace(/\s+/g, " ")
      .replace(/^\s*My note\s*:?\s*/i, "")
      .replace(/\s+(?:Edit|Delete)(?:\s+(?:Edit|Delete))*\s*$/i, "")
      .trim();
  }

  function buildEtaText(etas) {
    const unique = [...new Set((etas || []).filter(Boolean))];
    if (unique.length <= 1) return unique[0] || "";
    return unique.map((eta, index) => `Item ${index + 1} ETA ${eta}`).join("; ");
  }

  function calculateMatch(amazonPayload) {
    const ebayShip = extractShipToBlock();
    const ebayTitles = extractEbayTitles().join(" ");
    const nameScore = U.tokenSimilarity(ebayShip.split("|")[1] || ebayShip, amazonPayload.shippingBlock || "");
    const addressScore = U.tokenSimilarity(ebayShip, amazonPayload.shippingBlock || "");
    const titleScore = U.tokenSimilarity(ebayTitles, (amazonPayload.titles || []).join(" "));
    const available = [nameScore, addressScore, titleScore].filter((score) => score !== null);
    const overall = available.length ? available.reduce((sum, score) => sum + score, 0) / available.length : 0;
    return { overall, nameScore, addressScore, titleScore, ebayShip };
  }

  function firstUsefulEbayTitle() {
    return AUDIT?.selectMarketplaceItemTitle?.(extractEbayTitleCandidates())
      || extractEbayTitles()[0]
      || "";
  }

  function buildEbayProfitRecord({ payload, earnings, note, identity, source, order, supplierAudit }) {
    const amazonTotal = Number(payload.total);
    const ebayEarnings = Number(earnings);
    const profit = Number.isFinite(ebayEarnings) && Number.isFinite(amazonTotal) ? ebayEarnings - amazonTotal : null;
    return {
      platform: "eBay",
      computerLabel: identity.computerLabel || "0",
      accountLabel: identity.ebayAccountLabel || "",
      ebayAccountLabel: identity.ebayAccountLabel || "",
      orderNumber: order.orderNumber,
      itemTitle: firstUsefulEbayTitle(),
      marketplaceEarnings: Number.isFinite(ebayEarnings) ? ebayEarnings : null,
      marketplaceSoldPrice: null,
      supplier: "Amazon",
      supplierTotal: Number.isFinite(amazonTotal) ? amazonTotal : null,
      supplierProfile: payload.profileLabel || "",
      eta: buildEtaText(payload.etas),
      profit,
      margin: profit !== null && ebayEarnings > 0 ? profit / ebayEarnings : null,
      sku: order.skus.join(", "),
      ...supplierAudit,
      source,
      note,
      capturedAt: new Date().toISOString(),
      pageUrl: location.href
    };
  }

  async function readAmazonClipboard() {
    const text = await navigator.clipboard.readText();
    if (!text.startsWith(U.PAYLOAD_PREFIX)) {
      throw new Error("Clipboard does not contain Amazon order information. Click Copy Amazon Info in the Amazon profile first.");
    }
    const payload = JSON.parse(text.slice(U.PAYLOAD_PREFIX.length));
    if (!payload || payload.source !== "amazon") throw new Error("Amazon clipboard data is invalid.");
    return payload;
  }

  function showPreview({ payload, earnings, match, order, supplierAudit }) {
    document.getElementById("gldn-note-preview")?.remove();
    const existingNote = extractExistingNote();
    const etaText = buildEtaText(payload.etas);
    const defaultNote = `${U.formatMoney(earnings)} - ${U.formatMoney(payload.total)} - ${payload.profileLabel} - ${etaText}`;
    const existingNoteMatchesDefault = Boolean(existingNote)
      && U.normalizeText(existingNote) === U.normalizeText(defaultNote);
    const confidencePercent = Math.round(match.overall * 100);
    const needsManualConfirm = match.overall < 0.45;

    const overlay = document.createElement("div");
    overlay.id = "gldn-note-preview";
    overlay.className = "gldn-modal-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal">
        <button type="button" class="gldn-close" aria-label="Close">×</button>
        <h2>Review eBay Note</h2>
        <label class="gldn-label">Editable note</label>
        <textarea class="gldn-note-input" rows="3"></textarea>
        <div class="gldn-grid">
          <div><strong>eBay earnings</strong><span>${U.formatMoney(earnings)}</span></div>
          <div><strong>Amazon total</strong><span>${U.formatMoney(payload.total)}</span></div>
          <div><strong>Amazon profile</strong><span>${escapeHtml(payload.profileLabel)}</span></div>
          <div><strong>ETA</strong><span>${escapeHtml(etaText)}</span></div>
          <div><strong>Order</strong><span>${escapeHtml(extractEbayOrderNumber() || "Not detected")}</span></div>
          <div><strong>Decoded SKU ASINs</strong><span>${escapeHtml(order.asins.join(", ") || "Not detected")}</span></div>
          <div><strong>Amazon order</strong><span>${escapeHtml(supplierAudit.supplierOrderNumber || "Not detected")}</span></div>
          <div><strong>Evidence</strong><span>${escapeHtml(supplierAudit.supplierMatchSource || "Not detected")}</span></div>
          <div><strong>Match confidence</strong><span class="${needsManualConfirm ? "gldn-warning-text" : "gldn-good-text"}">${confidencePercent}%</span></div>
        </div>
        ${existingNote ? `<div class="gldn-existing"><strong>Existing note:</strong> ${escapeHtml(existingNote)}</div>` : ""}
        ${needsManualConfirm ? `<label class="gldn-confirm"><input type="checkbox"> I checked the buyer, address, and item match.</label>` : ""}
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="fill" ${needsManualConfirm ? "disabled" : ""}>${existingNoteMatchesDefault ? "Refresh Profit Row" : existingNote ? "Fill Edit Note Box" : "Fill Add Note Box"}</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnEbayNoteModalPosition");
    const textarea = overlay.querySelector(".gldn-note-input");
    textarea.value = defaultNote;
    const fillButton = overlay.querySelector("[data-action='fill']");
    const modalStatus = overlay.querySelector(".gldn-modal-status");

    overlay.querySelector(".gldn-close").addEventListener("click", () => overlay.remove());
    overlay.querySelector("[data-action='cancel']").addEventListener("click", () => overlay.remove());
    overlay.querySelector(".gldn-confirm input")?.addEventListener("change", (event) => {
      fillButton.disabled = !event.target.checked;
    });

    fillButton.addEventListener("click", async () => {
      fillButton.disabled = true;
      modalStatus.textContent = "Opening eBay note box...";
      try {
        const note = textarea.value.trim();
        if (!note) throw new Error("The note is blank.");
        const existingNoteBeforeFill = extractExistingNote();
        const unchangedExistingNote = Boolean(existingNoteBeforeFill)
          && U.normalizeText(existingNoteBeforeFill) === U.normalizeText(note);
        if (!unchangedExistingNote) await openAndFillAddNote(note);
        expectedSavedNote = unchangedExistingNote ? null : note;
        previousSavedNote = existingNoteBeforeFill;
        const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel"]);
        const identity = normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel);
        const profitRecord = buildEbayProfitRecord({
          payload,
          earnings,
          note,
          identity,
          source: "ebay-order-profit",
          order,
          supplierAudit
        });
        expectedProfitRecord = unchangedExistingNote ? null : profitRecord;
        await storageSet({
          lastPreparedNote: {
            note,
            payload,
            earnings,
            profitRecord,
            orderNumber: extractEbayOrderNumber(),
            computerLabel: identity.computerLabel,
            ebayAccountLabel: identity.ebayAccountLabel,
            preparedAt: new Date().toISOString(),
            status: unchangedExistingNote
              ? "refreshing_matching_saved_note"
              : "filled_waiting_for_manual_save"
          }
        });
        if (unchangedExistingNote) {
          await refreshProfitForMatchingSavedNote(profitRecord);
          await storageSet({
            lastPreparedNote: {
              note,
              payload,
              earnings,
              profitRecord,
              orderNumber: extractEbayOrderNumber(),
              computerLabel: identity.computerLabel,
              ebayAccountLabel: identity.ebayAccountLabel,
              preparedAt: new Date().toISOString(),
              status: "profit_refreshed_from_matching_saved_note"
            }
          });
          modalStatus.textContent = "The saved eBay note already matches. The profit row was refreshed without changing eBay.";
          renderStatus("Matching saved note - profit row refreshed", "completed");
        } else {
          modalStatus.textContent = "Filled. Review it in eBay. Nothing is saved or synced until you click eBay's Save button.";
          renderStatus("Note filled - waiting for your manual eBay Save", "ready");
        }
        setTimeout(() => overlay.remove(), 1600);
      } catch (error) {
        modalStatus.textContent = error.message;
        fillButton.disabled = false;
      }
    });
  }

  async function openAndFillAddNote(note) {
    await navigator.clipboard.writeText(note);
    let textarea = findVisibleNoteTextarea();
    if (!textarea) {
      const editNote = findExistingNoteEditButton();
      if (editNote) {
        dispatchFullClick(editNote);
      } else {
        const moreActions = U.findVisibleByText("More actions") || U.findVisibleContainingText("More actions");
        if (!moreActions) throw new Error("I could not find More actions or the existing note's Edit button. Open the eBay note box manually, then press Fill again.");
        dispatchFullClick(moreActions);

        const addNote = await U.waitFor(() => U.findVisibleByText("Add note") || U.findVisibleContainingText("Add note"), 4000);
        if (!addNote) throw new Error("I opened More actions but could not find Add note. Open Add note manually, then press Fill again.");
        dispatchFullClick(addNote);
      }

      textarea = await U.waitFor(findVisibleNoteTextarea, 5000);
    }
    if (!textarea) throw new Error("The eBay note box did not open. Open it manually and try again.");
    textarea.focus();
    U.setNativeValue(textarea, note);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: note }));
  }

  function findExistingNoteEditButton() {
    const container = findExistingNoteContainer();
    if (!container) return null;
    const edits = [...container.querySelectorAll("button, a, [role='button']")]
      .filter(U.isVisible)
      .filter((element) => U.normalizeText(element.textContent || element.innerText) === "edit");
    return edits.length === 1 ? edits[0] : null;
  }

  function findVisibleNoteTextarea() {
    const candidates = [...document.querySelectorAll("textarea")]
      .filter(U.isVisible)
      .filter((textarea) => !textarea.closest?.("[id^='gldn-'], .gldn-modal-backdrop"));
    if (!candidates.length) return null;

    const noteCandidates = candidates.filter((textarea) => {
      const dialog = textarea.closest?.("[role='dialog'], .dialog, .lightbox-dialog");
      const signal = U.normalizeText([
        textarea.id,
        textarea.name,
        textarea.placeholder,
        textarea.getAttribute?.("aria-label"),
        textarea.getAttribute?.("data-testid"),
        dialog?.innerText
      ].filter(Boolean).join(" "));
      return signal.includes("add note")
        || signal.includes("edit note")
        || signal.includes("note to self")
        || signal.includes("your note");
    });

    if (noteCandidates.length === 1) return noteCandidates[0];
    if (noteCandidates.length > 1) return null;
    return candidates.length === 1 ? candidates[0] : null;
  }

  async function prepareNote() {
    try {
      renderStatus("Reading Amazon clipboard…");
      const payload = await readAmazonClipboard();
      const earnings = extractEbayEarnings();
      if (earnings === null) throw new Error("I could not find Order earnings. Make sure the eBay Order Details page is open and the What you earned section is visible.");
      if (payload.total === null || payload.total === undefined) throw new Error("Amazon order total is missing.");
      if (!AUDIT?.validateAmazonPayloadForEbayOrder) throw new Error("The exact supplier-order validator is unavailable. Reload GLDN Ops.");
      const order = extractEbayOrderIdentity();
      const audit = AUDIT.validateAmazonPayloadForEbayOrder(payload, order, { now: Date.now() });
      if (!audit.ok) throw new Error(audit.error);
      const match = calculateMatch(payload);
      showPreview({ payload, earnings, match, order, supplierAudit: audit.supplierAudit });
      renderStatus("Preview ready", "ready");
    } catch (error) {
      renderStatus(error.message, "error");
      alert(error.message);
    }
  }

  async function detectSavedNote() {
    if (!expectedSavedNote || noteSaveDetectionPending) return;
    if (findVisibleNoteTextarea()) return;
    const savedNote = extractExistingNote();
    if (U.normalizeText(savedNote) !== U.normalizeText(expectedSavedNote)) return;
    if (U.normalizeText(previousSavedNote) === U.normalizeText(expectedSavedNote)) return;

    noteSaveDetectionPending = true;
    const completedNote = expectedSavedNote;
    const completedProfitRecord = expectedProfitRecord;
    try {
      const result = await storageGet(["orderNoteHistory", "computerLabel", "ebayAccountLabel", "lastPreparedNote"]);
      const identity = normalizedIdentity(result.computerLabel, result.ebayAccountLabel);
      const record = {
        note: completedNote,
        orderNumber: extractEbayOrderNumber(),
        computerLabel: identity.computerLabel,
        ebayAccountLabel: identity.ebayAccountLabel,
        profitRecord: completedProfitRecord || result.lastPreparedNote?.profitRecord || null,
        completedAt: new Date().toISOString(),
        status: "completed"
      };
      const history = Array.isArray(result.orderNoteHistory) ? result.orderNoteHistory : [];
      history.push(record);
      await storageSet({
        orderNoteHistory: history.slice(-1000),
        lastPreparedNote: record,
        latestMarketplaceProfit: record.profitRecord
      });
      if (record.profitRecord) {
        const sync = await syncMarketplaceProfitRecord(record.profitRecord);
        if (!sync?.ok && !sync?.queued) throw new Error(sync?.error || "Dashboard profit sync failed.");
      }
      renderStatus("Saved note detected - Completed", "completed");
      expectedSavedNote = null;
      previousSavedNote = "";
      expectedProfitRecord = null;
    } catch (error) {
      renderStatus(`Saved note detected - profit sync failed: ${error.message}`, "error");
    } finally {
      noteSaveDetectionPending = false;
    }
  }


  function firstPercent(text) {
    const match = String(text || "").match(/(-?\d+(?:\.\d+)?)\s*%/);
    return match ? Number.parseFloat(match[1]) : null;
  }

  const SELLER_LEVEL_LABELS = [
    /^current seller level\b/i,
    /^if we evaluated you today\b/i,
    /^transaction defect rate\b/i,
    /^late shipment rate\b/i,
    /^tracking uploaded on time and validated\b/i,
    /^cases closed without seller resolution\b/i,
    /^next evaluation\b/i
  ];

  function cleanLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function countSellerLabels(text) {
    const normalized = cleanLine(text);
    return SELLER_LEVEL_LABELS.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
  }

  function parseLevelValue(text) {
    const normalized = cleanLine(text);
    const match = normalized.match(/\b(Top Rated Plus|Top Rated|Above Standard|Below Standard)\b/i);
    return match ? match[1] : "";
  }

  function parseDateValue(text) {
    const normalized = cleanLine(text).replace(/^next evaluation\s*/i, "").replace(/^[:\-\s]+/, "");
    const match = normalized.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/i);
    return match ? match[0] : normalized;
  }

  function parseMetricValue(text, type, labelPattern) {
    if (!text) return type === "percent" ? null : "";
    const normalized = cleanLine(text);
    const withoutLabel = cleanLine(normalized.replace(labelPattern, "").replace(/^[:\-\s]+/, ""));
    const source = withoutLabel || normalized;

    if (type === "level") return parseLevelValue(source);
    if (type === "percent") return firstPercent(source);
    if (type === "date") return parseDateValue(source);
    return source;
  }

  function isRenderedAnywhere(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
    return [...element.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
  }

  function findMetricElement(labelPattern) {
    const candidates = [...document.querySelectorAll("body *")]
      .filter((element) => isRenderedAnywhere(element))
      .map((element) => ({
        element,
        text: cleanLine(element.innerText || element.textContent || "")
      }))
      .filter(({ text }) => text && labelPattern.test(text) && text.length <= 220)
      .sort((a, b) => {
        const aLabels = countSellerLabels(a.text);
        const bLabels = countSellerLabels(b.text);
        if (aLabels !== bLabels) return aLabels - bLabels;
        return a.text.length - b.text.length;
      });

    return candidates[0]?.element || null;
  }

  function extractMetricNearLabel(labelPattern, type) {
    const labelElement = findMetricElement(labelPattern);
    if (!labelElement) return type === "percent" ? null : "";

    const candidateTexts = [];
    const addCandidate = (node) => {
      if (!node || !(node instanceof Element) || !isRenderedAnywhere(node)) return;
      const text = cleanLine(node.innerText || node.textContent || "");
      if (!text || candidateTexts.includes(text)) return;
      candidateTexts.push(text);
    };

    // Same element first. Many eBay rows contain both the label and value.
    addCandidate(labelElement);

    // Immediate siblings often hold the value in a second column.
    addCandidate(labelElement.nextElementSibling);
    let sibling = labelElement.parentElement?.firstElementChild;
    while (sibling) {
      if (sibling !== labelElement) addCandidate(sibling);
      sibling = sibling.nextElementSibling;
    }
    addCandidate(labelElement.parentElement?.nextElementSibling);

    // Walk upward and inspect the smallest row-like containers first.
    let ancestor = labelElement.parentElement;
    for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
      const text = cleanLine(ancestor.innerText || ancestor.textContent || "");
      if (text && countSellerLabels(text) <= 1) addCandidate(ancestor);

      for (const child of ancestor.children || []) {
        addCandidate(child);
      }
    }

    for (const text of candidateTexts) {
      const value = parseMetricValue(text, type, labelPattern);
      if (type === "percent") {
        if (value !== null) return value;
      } else if (value) {
        return value;
      }
    }

    return type === "percent" ? null : "";
  }

  function extractHealthMetrics(identity = {}) {
    const currentSellerLevel = extractMetricNearLabel(/^current seller level\b/i, "level");
    const evaluatedToday = extractMetricNearLabel(/^if we evaluated you today\b/i, "level");
    const transactionDefectRate = extractMetricNearLabel(/^transaction defect rate\b/i, "percent");
    const lateShipmentRate = extractMetricNearLabel(/^late shipment rate\b/i, "percent");
    const trackingOnTime = extractMetricNearLabel(/^tracking uploaded on time and validated\b/i, "percent");
    const casesClosed = extractMetricNearLabel(/^cases closed without seller resolution\b/i, "percent");
    const nextEvaluation = extractMetricNearLabel(/^next evaluation\b/i, "date");

    return {
      computerLabel: identity.computerLabel || "0",
      ebayAccountLabel: identity.ebayAccountLabel || "",
      currentSellerLevel,
      evaluatedToday,
      transactionDefectRate,
      lateShipmentRate,
      trackingOnTime,
      casesClosed,
      nextEvaluation,
      pageTitle: document.title,
      pageUrl: location.href,
      detectedAny: [
        currentSellerLevel,
        evaluatedToday,
        transactionDefectRate,
        lateShipmentRate,
        trackingOnTime,
        casesClosed,
        nextEvaluation
      ].some((value) => value !== null && value !== ""),
      capturedAt: new Date().toISOString()
    };
  }

  function metricStatus(metric, value) {
    if (metric === "currentSellerLevel" || metric === "evaluatedToday") {
      const text = String(value || "").toLowerCase();
      if (!text) return "unknown";
      if (text.includes("below standard")) return "critical";
      if (text.includes("above standard") || text.includes("top rated")) return "good";
      return "unknown";
    }

    const number = value === "" || value === null || value === undefined ? null : Number(value);
    if (!Number.isFinite(number)) return "unknown";
    if (metric === "lateShipmentRate") {
      if (number > 2.4) return "critical";
      if (number > 1.9) return "warning";
      return "good";
    }
    if (metric === "trackingOnTime") {
      if (number < 80) return "critical";
      if (number < 85) return "warning";
      return "good";
    }
    if (metric === "casesClosed") return number > 0 ? "critical" : "good";
    if (metric === "transactionDefectRate") return number > 0 ? "critical" : "good";
    return "unknown";
  }

  function healthField(label, id, value, suffix = "") {
    const display = value === null || value === undefined ? "" : value;
    return `
      <div class="gldn-health-field">
        <label class="gldn-label" for="${id}">${label}</label>
        <div class="gldn-health-input-wrap">
          <input id="${id}" class="gldn-text-input" value="${escapeHtml(display)}">
          ${suffix ? `<span>${suffix}</span>` : ""}
        </div>
      </div>`;
  }


  function normalizedComputer(value) {
    return FOUNDATION.normalizeComputer(value);
  }

  function accountForComputer(value) {
    const computer = normalizedComputer(value);
    return COMPUTER_ACCOUNT_MAP[computer] || {};
  }

  function normalizedIdentity(computerValue, accountValue = "") {
    const computerLabel = normalizedComputer(computerValue);
    const mapped = accountForComputer(computerLabel);
    return {
      computerLabel,
      ebayAccountLabel: mapped.ebayAccountLabel || "",
      poshmarkOnly: Boolean(mapped.poshmarkOnly),
      display: mapped.display,
      storedAccountMismatch: Boolean(accountValue && mapped.ebayAccountLabel && normalizedEbayAccount(accountValue) !== mapped.ebayAccountLabel)
    };
  }

  function normalizedEbayAccount(value) {
    return FOUNDATION.normalizeEbayAccount(value);
  }

  function derivedAccountField(label, id, identity) {
    const value = identity.poshmarkOnly ? "Poshmark only" : identity.ebayAccountLabel;
    return `
      <div class="gldn-health-field">
        <label class="gldn-label" for="${id}">${escapeHtml(label)}</label>
        <input id="${id}" class="gldn-text-input" value="${escapeHtml(value)}" readonly>
      </div>`;
  }

  function normalizedStorePlan(plan, limit) {
    const text = String(plan || "").trim().toLowerCase();
    if (text === "premium" || Number(limit) === 10000) return "Premium";
    if (text === "anchor" || Number(limit) === 25000) return "Anchor";
    return "Custom";
  }

  function selectField(label, id, value, options) {
    const selected = String(value || "").toLowerCase();
    return `
      <div class="gldn-health-field">
        <label class="gldn-label" for="${id}">${escapeHtml(label)}</label>
        <select id="${id}" class="gldn-text-input">
          ${options.map((option) => {
            const item = typeof option === "string" ? { value: option, label: option } : option;
            return `<option value="${escapeHtml(item.value)}" ${String(item.value).toLowerCase() === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`;
          }).join("")}
        </select>
      </div>`;
  }

  function makeReviewModalDraggable(overlay) {
    U.enhanceModal(overlay?.querySelector?.(".gldn-modal"));
  }

  function showHealthPreview(metrics) {
    const initialIdentity = normalizedIdentity(metrics.computerLabel, metrics.ebayAccountLabel);
    document.getElementById("gldn-health-preview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-health-preview";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal">
        <button type="button" class="gldn-close" aria-label="Close">×</button>
        <h2>Review Seller Level</h2>
        <p class="gldn-help-text">The values below come only from eBay's Seller level box. Correct anything before saving.</p>
        <div class="gldn-health-grid gldn-identity-grid">
          ${selectField("Computer", "gldn-health-computer", initialIdentity.computerLabel, COMPUTER_OPTIONS)}
          ${derivedAccountField("eBay account", "gldn-health-ebay-account", initialIdentity)}
        </div>
        <div class="gldn-health-grid">
          ${healthField("Current seller level", "gldn-health-current-level", metrics.currentSellerLevel)}
          ${healthField("If evaluated today", "gldn-health-evaluated-today", metrics.evaluatedToday)}
          ${healthField("Transaction defect rate", "gldn-health-defect", metrics.transactionDefectRate, "%")}
          ${healthField("Late shipment rate", "gldn-health-late", metrics.lateShipmentRate, "%")}
          ${healthField("Tracking uploaded on time and validated", "gldn-health-tracking", metrics.trackingOnTime, "%")}
          ${healthField("Cases closed without seller resolution", "gldn-health-cases", metrics.casesClosed, "%")}
          ${healthField("Next evaluation", "gldn-health-next-evaluation", metrics.nextEvaluation)}
        </div>
        <div class="gldn-existing"><strong>Source:</strong> ${escapeHtml(metrics.pageTitle)}<br>${escapeHtml(metrics.pageUrl)}</div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save-health">Save Seller Level Check</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    makeReviewModalDraggable(overlay);
    const computerSelect = overlay.querySelector("#gldn-health-computer");
    const accountInput = overlay.querySelector("#gldn-health-ebay-account");
    computerSelect.addEventListener("change", () => {
      const identity = normalizedIdentity(computerSelect.value);
      accountInput.value = identity.poshmarkOnly ? "Poshmark only" : identity.ebayAccountLabel;
    });

    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    overlay.querySelector("[data-action='save-health']").addEventListener("click", async () => {
      const read = (id) => overlay.querySelector(id).value.trim();
      const parseOptionalNumber = (value) => value === "" ? null : Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
      const identity = normalizedIdentity(read("#gldn-health-computer"));
      if (!identity.computerLabel || !identity.ebayAccountLabel) {
        overlay.querySelector(".gldn-modal-status").textContent = "This computer is Poshmark-only. Seller Level checks require an eBay computer.";
        return;
      }
      const record = {
        ...metrics,
        computerLabel: identity.computerLabel,
        ebayAccountLabel: identity.ebayAccountLabel,
        currentSellerLevel: read("#gldn-health-current-level"),
        evaluatedToday: read("#gldn-health-evaluated-today"),
        transactionDefectRate: parseOptionalNumber(read("#gldn-health-defect")),
        lateShipmentRate: parseOptionalNumber(read("#gldn-health-late")),
        trackingOnTime: parseOptionalNumber(read("#gldn-health-tracking")),
        casesClosed: parseOptionalNumber(read("#gldn-health-cases")),
        nextEvaluation: read("#gldn-health-next-evaluation"),
        savedAt: new Date().toISOString()
      };
      record.statuses = {
        currentSellerLevel: metricStatus("currentSellerLevel", record.currentSellerLevel),
        evaluatedToday: metricStatus("evaluatedToday", record.evaluatedToday),
        transactionDefectRate: metricStatus("transactionDefectRate", record.transactionDefectRate),
        lateShipmentRate: metricStatus("lateShipmentRate", record.lateShipmentRate),
        trackingOnTime: metricStatus("trackingOnTime", record.trackingOnTime),
        casesClosed: metricStatus("casesClosed", record.casesClosed)
      };
      const result = await storageGet(["accountHealthHistory"]);
      const history = Array.isArray(result.accountHealthHistory) ? result.accountHealthHistory : [];
      history.push(record);
      await storageSet({
        computerLabel: identity.computerLabel,
        ebayAccountLabel: identity.ebayAccountLabel,
        latestAccountHealth: record,
        accountHealthHistory: history.slice(-1000)
      });
      refreshPanelIdentity();
      renderStatus("Seller level saved locally. Syncing in background...", "ready");
      close();

      syncSellerLevelRecord(record).then((syncResult) => {
        if (syncResult?.ok) {
          renderStatus("Seller level synced", "completed");
          return;
        }
        const error = syncResult?.error || "Dashboard sync failed.";
        renderStatus(`Saved locally - dashboard sync failed: ${error}`, "error");
      }).catch((error) => {
        renderStatus(`Saved locally - dashboard sync failed: ${error.message || error}`, "error");
      });
    });
  }

  function isSellerLevelPage() {
    return /\/sh\/performance/i.test(location.href);
  }

  async function scanHealthPage() {
    if (await stopForEbayInterruption("Seller Level scan")) return;
    const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    const identity = normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel);
    if (!identity.computerLabel || !identity.ebayAccountLabel) {
      alert("This computer is Poshmark-only or is not configured. Seller Level checks require an eBay computer.");
      await storageSet({ pendingSellerLevelScan: false });
      return;
    }

    if (!isSellerLevelPage()) {
      await storageSet({ pendingSellerLevelScan: true });
      renderStatus("Opening Seller Level page…", "ready");
      location.assign(SELLER_LEVEL_URL);
      return;
    }

    renderStatus("Reading Seller Level…", "ready");
    const metrics = await U.waitFor(() => {
      const result = extractHealthMetrics(identity);
      return result.detectedAny ? result : null;
    }, 25000, 300);

    await storageSet({ pendingSellerLevelScan: false });
    if (!metrics) {
      renderStatus("Seller Level could not be read.", "error");
      alert("I could not read the Seller Level metrics after opening the Performance page. Refresh the page and try again.");
      return;
    }

    const sellerHeading = [...document.querySelectorAll("h1, h2, h3, a, div")].find((element) => {
      if (!U.isVisible(element)) return false;
      return /^Seller level(?:\s*\(|$)/i.test(cleanLine(element.innerText || element.textContent || ""));
    });
    sellerHeading?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    showHealthPreview(metrics);
    renderStatus("Seller Level review ready", "ready");
  }

  async function startSellerLevelScan() {
    let reservationToken = "";
    try {
      reservationToken = await U.claimWorkflowStart("seller-level", "Seller Level scan");
      await storageSet({ gldnStopRequested: false, pendingSellerLevelScan: true });
    } catch (error) {
      renderStatus(error.message || "Seller Level scan could not start.", "error");
      return;
    } finally {
      await U.releaseWorkflowStart(reservationToken);
    }
    scanHealthPage();
  }


  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function isAwaitingShipmentPage() {
    let href = location.href;
    try { href = decodeURIComponent(href); } catch (_) {}
    return /\/sh\/ord\//i.test(href) && /filter=status:AWAITING_SHIPMENT/i.test(href);
  }

  function parseAwaitingResultsCount() {
    const text = document.body?.innerText || "";
    const full = text.match(/Results:\s*\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
    if (full) return Number(full[1].replace(/,/g, ""));
    const simple = text.match(/Results:\s*([\d,]+)/i);
    if (simple) return Number(simple[1].replace(/,/g, ""));
    const status = text.match(/Awaiting shipment\s*\(([\d,]+)\)/i);
    if (status) return Number(status[1].replace(/,/g, ""));
    if (/We didn['’]t find any results/i.test(text)) return 0;
    return null;
  }

  function isCheckedControl(control) {
    if (!control) return false;
    if (control instanceof HTMLInputElement) return Boolean(control.checked);
    return control.getAttribute("aria-checked") === "true" || control.dataset?.state === "checked";
  }

  function findActionsMasterCheckbox() {
    const controls = [...document.querySelectorAll('input[type="checkbox"], [role="checkbox"]')].filter(U.isVisible);
    for (const control of controls) {
      let node = control;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        const text = U.normalizeText(node.innerText || node.textContent || "");
        if (text === "actions" || text.startsWith("actions order")) return control;
        if (text.length > 180) break;
      }
    }

    const actionLabel = [...document.querySelectorAll("label, span, div, th")].find((element) => {
      if (!U.isVisible(element)) return false;
      return U.normalizeText(element.innerText || element.textContent || "") === "actions";
    });
    if (!actionLabel) return null;
    return actionLabel.querySelector('input[type="checkbox"], [role="checkbox"]')
      || actionLabel.parentElement?.querySelector('input[type="checkbox"], [role="checkbox"]')
      || actionLabel.previousElementSibling?.matches?.('input[type="checkbox"], [role="checkbox"]') && actionLabel.previousElementSibling
      || null;
  }

  function findExactVisible(text, selector = 'button, a, [role="button"], [role="menuitem"], li, div, span') {
    const target = U.normalizeText(text);
    return [...document.querySelectorAll(selector)].find((element) => {
      if (!U.isVisible(element)) return false;
      const value = U.normalizeText(element.innerText || element.textContent || "");
      return value === target;
    }) || null;
  }

  async function saveMarkShippedResult(partial) {
    const identity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    const record = {
      computerLabel: identity.computerLabel || "0",
      ebayAccountLabel: identity.ebayAccountLabel || "",
      completedAt: new Date().toISOString(),
      ...partial
    };
    await storageSet({ lastMarkShippedResult: record, pendingMarkShippedRun: null });
    const sync = await syncMarkShippedRecord(record).catch((error) => ({ ok: false, error: error.message || String(error) }));
    const saved = { ...record, sync };
    await storageSet({ lastMarkShippedResult: saved });
    return saved;
  }

  function findMarkShippedDialog() {
    const candidates = [...document.querySelectorAll('[role="dialog"], .lightbox-dialog, .dialog, [aria-modal="true"], section, div')]
      .filter((element) => U.isVisible(element))
      .map((element) => ({
        element,
        text: U.normalizeText(element.innerText || element.textContent || ""),
        rect: element.getBoundingClientRect()
      }))
      .filter(({ text, rect }) => {
        if (!text.includes("mark as shipped") || (!text.includes("continue") && !text.includes("are you sure"))) return false;
        if (rect.width < 240 || rect.height < 120 || rect.width > 1000 || rect.height > 850) return false;
        return true;
      })
      .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));
    return candidates[0]?.element || null;
  }

  async function closeCompletedMarkShippedDialog() {
    const dialog = findMarkShippedDialog();
    if (!dialog) return false;
    const closeButton = [...dialog.querySelectorAll('button, [role="button"]')].find((element) => {
      if (!U.isVisible(element)) return false;
      const label = U.normalizeText([element.getAttribute("aria-label"), element.title, element.innerText, element.textContent].filter(Boolean).join(" "));
      return label === "close" || label === "x" || label === "×";
    });
    if (!closeButton) return false;
    dispatchFullClick(closeButton);
    await U.waitFor(() => !U.isVisible(dialog) ? true : null, 5000, 150);
    return true;
  }

  async function dismissAnyMarkShippedConfirmation() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const closed = await closeCompletedMarkShippedDialog();
      if (closed) return true;
      const dialog = [...document.querySelectorAll('[role="dialog"], .lightbox-dialog, .dialog, [aria-modal="true"], section, div')]
        .filter(U.isVisible)
        .map((element) => ({ element, text: U.normalizeText(element.innerText || element.textContent || ""), rect: element.getBoundingClientRect() }))
        .filter(({ text, rect }) => text.includes("mark as shipped") && text.includes("are you sure") && rect.width >= 240 && rect.height >= 120)
        .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0]?.element;
      if (!dialog) return false;
      const cancel = [...dialog.querySelectorAll('button, [role="button"]')].find((element) => {
        if (!U.isVisible(element)) return false;
        const label = U.normalizeText([element.getAttribute("aria-label"), element.title, element.innerText, element.textContent].filter(Boolean).join(" "));
        return label === "cancel" || label === "close" || label === "x" || label === "×";
      });
      if (cancel) {
        dispatchFullClick(cancel);
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
      }
      const gone = await U.waitFor(() => !U.isVisible(dialog) ? true : null, 2500, 150);
      if (gone) return true;
    }
    return false;
  }

  async function runOneMarkShippedBatch() {
    await ensureTaskCanContinue();
    const ready = await U.waitFor(() => {
      const count = parseAwaitingResultsCount();
      return count !== null ? { count } : null;
    }, 20000, 250);
    if (!ready) throw new Error("The Awaiting shipment page did not finish loading.");
    if (ready.count === 0) return { selected: 0, marked: 0, noOrders: true };

    const checkbox = await U.waitFor(findActionsMasterCheckbox, 10000, 200);
    if (!checkbox) throw new Error("I could not find the Actions checkbox.");
    if (!isCheckedControl(checkbox)) checkbox.click();

    const selectedStatus = await U.waitFor(
      () => currentMarkShippedSelectionEvidence(checkbox, ready.count),
      8000,
      150
    );
    if (!selectedStatus) {
      throw new Error("eBay did not expose a trustworthy all-orders selection. The selected rows, master checkbox, and Shipping control did not agree.");
    }
    const selectedValidation = validateMarkShippedConfirmation(ready.count, selectedStatus.count);
    if (!selectedValidation.ok) throw new Error(selectedValidation.error);

    const shippingButton = await U.waitFor(() => {
      const button = findExactVisible("Shipping", 'button, [role="button"]');
      if (!button) return null;
      const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
      return disabled ? null : button;
    }, 8000, 200);
    if (!shippingButton) throw new Error("I selected the orders but could not find the enabled Shipping button.");
    shippingButton.click();
    const menuItem = await U.waitFor(() => findExactVisible("Mark as shipped"), 5000, 120);
    if (!menuItem) throw new Error("I selected the orders, but eBay did not open the Mark as shipped menu item.");
    return {
      selected: selectedStatus.count,
      selectionSource: selectedStatus.source,
      beforeCount: ready.count,
      noOrders: false,
      awaitingActivationApproval: true,
      menuOpenedAt: new Date().toISOString()
    };
  }

  async function ensureMarkShippedMenuForApproval(state) {
    if (!isAwaitingShipmentPage()) throw new Error("Return to eBay Awaiting shipment before approving Mark as Shipped.");
    const currentCount = parseAwaitingResultsCount();
    if (currentCount === null || currentCount !== Number(state.beforeCount)) {
      throw new Error(`The awaiting order count changed from ${Number(state.beforeCount || 0).toLocaleString()} to ${currentCount === null ? "unknown" : currentCount.toLocaleString()}. Reset and review the orders again.`);
    }
    const checkbox = findActionsMasterCheckbox();
    const selection = checkbox && currentMarkShippedSelectionEvidence(checkbox, currentCount);
    const validation = validateMarkShippedConfirmation(currentCount, selection?.count ?? null);
    if (!validation.ok) throw new Error("The approved order selection is no longer intact. Reset and review the orders again.");
    let label = findExactVisible("Mark as shipped");
    if (!label) {
      const shippingButton = findExactVisible("Shipping", 'button, [role="button"]');
      if (!shippingButton || shippingButton.disabled || shippingButton.getAttribute("aria-disabled") === "true") {
        throw new Error("The Shipping menu is no longer available. Reset and review the orders again.");
      }
      dispatchFullClick(shippingButton);
      label = await U.waitFor(() => findExactVisible("Mark as shipped"), 4000, 120);
    }
    if (!label) throw new Error("The Mark as shipped menu item is no longer available. Reset and review the orders again.");
    return label;
  }

  async function activateApprovedMarkShipped(state) {
    const label = await ensureMarkShippedMenuForApproval(state);
    const target = label.closest('button, a, li, [role="menuitem"], [role="button"], [tabindex]') || label;
    target.scrollIntoView?.({ block: "center", inline: "center" });
    await storageSet({
      pendingMarkShippedRun: {
        ...state,
        phase: "activating-approved-action",
        activationApprovedAt: new Date().toISOString()
      }
    });
    dispatchFullClick(target, label);
    return U.waitFor(() => {
      const dialog = findMarkShippedDialog();
      if (dialog) return { dialog };
      const count = parseAwaitingResultsCount();
      if (count !== null && count < Number(state.beforeCount)) {
        return { markedWithoutDialog: Number(state.beforeCount) - count, remaining: count };
      }
      return null;
    }, 10000, 150);
  }

  async function cancelMarkShippedActivationApproval() {
    const checkbox = findActionsMasterCheckbox();
    if (checkbox && isCheckedControl(checkbox)) checkbox.click();
    await storageSet({ pendingMarkShippedRun: null, gldnStopRequested: false });
    document.getElementById("gldn-mark-shipped-activation-approval")?.remove();
    renderStatus("Mark as Shipped canceled before eBay was changed.", "ready");
  }

  async function reconcileApprovedMarkShippedActivation(state) {
    const remaining = parseAwaitingResultsCount();
    const evidence = markShippedCompletionEvidence(
      document.body?.innerText || "",
      state.beforeCount,
      state.selectedCount,
      remaining
    );
    if (evidence) {
      await finalizePendingMarkShipped(state, evidence);
      return;
    }
    renderStatus("Mark as Shipped was approved, but its result is not yet provable. Review eBay, then use Reset only after confirming the order state.", "error");
  }

  function showMarkShippedActivationApproval(state) {
    if (document.getElementById("gldn-mark-shipped-activation-approval")) return;
    const overlay = document.createElement("div");
    overlay.id = "gldn-mark-shipped-activation-approval";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-review-modal">
        <h2>Approve Mark as Shipped</h2>
        <p>eBay reports <strong>${Number(state.selectedCount || 0).toLocaleString()}</strong> of <strong>${Number(state.beforeCount || 0).toLocaleString()}</strong> awaiting orders selected.</p>
        <p>This next click may mark every selected order as shipped immediately. Review the eBay rows behind this window before approving.</p>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel safely</button>
          <button type="button" class="gldn-primary" data-action="approve">Approve Mark as Shipped</button>
        </div>
        <div class="gldn-modal-status">No eBay order has been changed by this run yet.</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.enhanceModal?.(overlay.querySelector(".gldn-modal"));
    const status = overlay.querySelector(".gldn-modal-status");
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      cancelMarkShippedActivationApproval().catch((error) => {
        status.textContent = error.message || String(error);
      });
    });
    overlay.querySelector('[data-action="approve"]').addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const cancelButton = overlay.querySelector('[data-action="cancel"]');
      button.disabled = true;
      cancelButton.disabled = true;
      status.textContent = "Applying your approval to eBay...";
      try {
        const stored = await storageGet(["pendingMarkShippedRun"]);
        const current = stored.pendingMarkShippedRun;
        if (!current?.active || current.phase !== "awaiting-activation-approval") {
          throw new Error("This approval is stale. Reset and review the orders again.");
        }
        const activation = await activateApprovedMarkShipped(current);
        if (!activation) throw new Error("eBay did not show a confirmation or report a changed order count. Reset and review before retrying.");
        overlay.remove();
        if (activation.markedWithoutDialog) {
          const evidence = {
            marked: activation.markedWithoutDialog,
            remaining: activation.remaining,
            exact: activation.markedWithoutDialog === Number(current.selectedCount)
          };
          await finalizePendingMarkShipped(current, evidence);
          return;
        }
        const dialog = activation.dialog;
        const dialogText = dialog.innerText || dialog.textContent || "";
        const confirmationSelection = resolveMarkShippedConfirmationCount(
          parseMarkShippedSelectedCount(dialogText),
          current.selectedCount,
          current.beforeCount
        );
        const selected = confirmationSelection?.count ?? null;
        const validation = validateMarkShippedConfirmation(current.beforeCount, selected);
        const continueButton = [...dialog.querySelectorAll('button, [role="button"]')].find((element) => {
          return U.isVisible(element) && U.normalizeText(element.innerText || element.textContent || "") === "continue";
        });
        if (!continueButton) throw new Error("The confirmation opened, but the Continue button was not found.");
        if (!validation.ok) {
          await dismissAnyMarkShippedConfirmation();
          throw new Error(validation.error);
        }
        const approvalState = {
          ...current,
          phase: "awaiting-approval",
          selectedCount: selected,
          confirmationCountSource: confirmationSelection?.source || "",
          confirmationText: U.normalizeText(dialogText),
          confirmationOpenedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await storageSet({ pendingMarkShippedRun: approvalState });
        renderStatus(`Second approval required - ${selected.toLocaleString()} orders selected. Do not click Continue without approval.`, "error");
        monitorPendingMarkShippedApproval();
      } catch (error) {
        const stored = await storageGet(["pendingMarkShippedRun"]).catch(() => ({}));
        const actionMayHaveRun = stored.pendingMarkShippedRun?.phase === "activating-approved-action";
        if (actionMayHaveRun) {
          await storageSet({
            pendingMarkShippedRun: {
              ...stored.pendingMarkShippedRun,
              phase: "manual-review-required",
              error: error.message || String(error),
              updatedAt: new Date().toISOString()
            }
          });
          status.textContent = `${error.message || String(error)} Review eBay before using Reset.`;
        } else {
          button.disabled = false;
          cancelButton.disabled = false;
          status.textContent = error.message || String(error);
        }
        renderStatus(`Mark as Shipped stopped safely: ${error.message || String(error)}`, "error");
      }
    });
  }

  async function finalizePendingMarkShipped(state, evidence) {
    const marked = Number(evidence?.marked || 0);
    const exact = Boolean(evidence?.exact && marked === Number(state.selectedCount));
    await storageSet({
      pendingMarkShippedRun: {
        ...state,
        phase: "finalizing",
        finalizingAt: new Date().toISOString()
      }
    });
    const record = await saveMarkShippedResult({
      startedAt: state.startedAt,
      status: exact ? "Completed" : "Partial",
      markedCount: marked,
      selectedCount: Number(state.selectedCount || 0),
      beforeCount: Number(state.beforeCount || 0),
      remainingCount: evidence?.remaining,
      batchCount: 1,
      error: exact ? "" : `Expected ${Number(state.selectedCount || 0).toLocaleString()} marked shipped, but eBay confirmed ${marked.toLocaleString()}.`,
      pageUrl: location.href
    });
    await dismissAnyMarkShippedConfirmation();
    if (!exact) {
      renderStatus(`Mark as Shipped needs review: ${marked} of ${state.selectedCount} confirmed`, "error");
      alert(`Mark as Shipped needs review.\n\nExpected ${state.selectedCount} orders, but eBay confirmed ${marked}.`);
      return record;
    }
    const syncLabel = record.sync?.ok ? " and synced" : record.sync?.queued ? "; dashboard sync queued" : "; dashboard sync failed";
    renderStatus(`Completed - ${marked.toLocaleString()} marked as shipped${syncLabel}`, record.sync?.ok ? "completed" : "ready");
    return record;
  }

  async function monitorPendingMarkShippedApproval() {
    if (markShippedMonitorRunning) return;
    markShippedMonitorRunning = true;
    try {
      const stored = await storageGet(["pendingMarkShippedRun"]);
      const state = stored.pendingMarkShippedRun;
      if (!state?.active || state.phase !== "awaiting-approval") return;

      const remaining = parseAwaitingResultsCount();
      const evidence = markShippedCompletionEvidence(
        document.body?.innerText || "",
        state.beforeCount,
        state.selectedCount,
        remaining
      );
      if (evidence) {
        await finalizePendingMarkShipped(state, evidence);
        return;
      }

      const dialog = findMarkShippedDialog();
      if (dialog) {
        renderStatus(`Approval required - ${Number(state.selectedCount || 0).toLocaleString()} orders selected. Do not click Continue without approval.`, "error");
      } else {
        renderStatus("Waiting for eBay confirmation/result. Use Reset if the confirmation was canceled.", "ready");
      }
      setTimeout(monitorPendingMarkShippedApproval, 750);
    } finally {
      markShippedMonitorRunning = false;
    }
  }

  async function runMarkShippedAutomation() {
    if (await stopForEbayInterruption("Mark as Shipped")) return;
    await ensureTaskCanContinue();
    if (markShippedRunning) return;
    markShippedRunning = true;
    try {
      const pending = await storageGet(["pendingMarkShippedRun"]);
      const state = pending.pendingMarkShippedRun || {
        active: true,
        phase: "prepare",
        startedAt: new Date().toISOString(),
        markedCount: 0,
        batchCount: 0
      };
      if (state.phase === "awaiting-activation-approval") {
        showMarkShippedActivationApproval(state);
        return;
      }
      if (state.phase === "awaiting-approval") {
        monitorPendingMarkShippedApproval();
        return;
      }
      if (state.phase !== "prepare") {
        renderStatus("Mark as Shipped needs manual review before another run. Review eBay, then use Reset.", "error");
        return;
      }
      if (!isAwaitingShipmentPage()) {
        await storageSet({ pendingMarkShippedRun: state });
        location.assign(AWAITING_SHIPMENT_URL);
        return;
      }

      renderStatus("Selecting every awaiting shipment order for review...", "ready");
      const result = await runOneMarkShippedBatch();
      if (result.noOrders) {
        const record = await saveMarkShippedResult({
          startedAt: state.startedAt,
          status: "No awaiting orders",
          markedCount: 0,
          batchCount: 0,
          pageUrl: location.href
        });
        const syncLabel = record.sync?.ok ? " and synced" : record.sync?.queued ? "; dashboard sync queued" : "";
        renderStatus(`No awaiting shipment orders${syncLabel}`, "completed");
        return;
      }

      const approvalState = {
        ...state,
        active: true,
        phase: "awaiting-activation-approval",
        beforeCount: result.beforeCount,
        selectedCount: result.selected,
        selectionSource: result.selectionSource,
        menuOpenedAt: result.menuOpenedAt,
        updatedAt: new Date().toISOString()
      };
      await storageSet({ pendingMarkShippedRun: approvalState });
      renderStatus(`Approval required - review ${result.selected.toLocaleString()} selected orders before activating Mark as Shipped.`, "error");
      showMarkShippedActivationApproval(approvalState);
    } catch (error) {
      const stopped = taskWasStopped(error);
      await saveMarkShippedResult({
        status: stopped ? "Stopped" : "Failed",
        markedCount: 0,
        batchCount: 0,
        error: error.message,
        pageUrl: location.href
      });
      renderStatus(`Mark as Shipped failed: ${error.message}`, "error");
      alert(`Mark as Shipped stopped safely.\n\n${error.message}`);
    } finally {
      markShippedRunning = false;
    }
  }

  async function startMarkShipped() {
    let reservationToken = "";
    try {
      const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel"]);
      const identity = normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel);
      if (!identity.computerLabel || !identity.ebayAccountLabel) {
        alert("This computer is Poshmark-only or is not configured. Mark as Shipped requires an eBay computer.");
        return;
      }
      reservationToken = await U.claimWorkflowStart("mark-shipped", "Mark as Shipped");
      await storageSet({
        gldnStopRequested: false,
        pendingMarkShippedRun: {
          active: true,
          phase: "prepare",
          startedAt: new Date().toISOString(),
          markedCount: 0,
          batchCount: 0
        }
      });
    } catch (error) {
      renderStatus(error.message || "Mark as Shipped could not start.", "error");
      return;
    } finally {
      await U.releaseWorkflowStart(reservationToken);
    }
    runMarkShippedAutomation();
  }

  function parseDashboardNumber(value) {
    const cleaned = String(value || "").replace(/,/g, "");
    const number = Number.parseFloat(cleaned.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function findNumberNearDashboardLabel(label, options = {}) {
    const list = U.getBodyLines();
    const target = U.normalizeText(label);
    const moneyOnly = Boolean(options.moneyOnly);
    const integerOnly = Boolean(options.integerOnly);
    for (let i = 0; i < list.length; i += 1) {
      if (!U.normalizeText(list[i]).includes(target)) continue;
      for (let offset = -3; offset <= 4; offset += 1) {
        if (offset === 0) continue;
        const line = list[i + offset];
        if (!line) continue;
        if (moneyOnly && !/\$/.test(line)) continue;
        if (integerOnly && /[%$]/.test(line)) continue;
        const parsed = parseDashboardNumber(line);
        if (integerOnly && !Number.isInteger(parsed)) continue;
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }

  function normalizeSnapshotText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function snapshotCardText(headingLabel) {
    const target = normalizeSnapshotText(headingLabel);
    const heading = [...document.querySelectorAll("h2, h3")].find((element) => {
      const text = normalizeSnapshotText(element.innerText || element.textContent || "");
      return text === target || (target === "advertising" && text.startsWith(target));
    });
    if (!heading) return "";
    const card = heading.closest?.(".card-old, .widget") || heading.parentElement?.parentElement || heading.parentElement;
    return card?.innerText || card?.textContent || "";
  }

  function snapshotLines(value) {
    return String(value || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function findSnapshotMetric(cardText, label, options = {}) {
    const lines = snapshotLines(cardText);
    const target = normalizeSnapshotText(label);
    const index = lines.findIndex((line) => normalizeSnapshotText(line) === target);
    if (index < 0) return null;
    const candidates = lines.slice(index, index + 5);
    for (const line of candidates) {
      if (options.moneyOnly) {
        const money = line.match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/);
        if (money) return parseDashboardNumber(money[1]);
        continue;
      }
      if (options.integerOnly && !/^-?[0-9][0-9,]*$/.test(line)) continue;
      if (options.numberOnly && !/^-?[0-9][0-9,]*(?:\.\d+)?$/.test(line)) continue;
      const parsed = parseDashboardNumber(line);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function findSnapshotPercentChange(cardText, label) {
    const lines = snapshotLines(cardText);
    const target = normalizeSnapshotText(label);
    const index = lines.findIndex((line) => normalizeSnapshotText(line) === target);
    if (index < 0) return null;
    const nearby = lines.slice(index + 1, index + 8);
    const percentLine = nearby.find((line) => /[+-]?\d+(?:\.\d+)?\s*%/.test(line));
    if (!percentLine) return null;
    const match = percentLine.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    if (!match) return null;
    const magnitude = Number(match[1]);
    if (!Number.isFinite(magnitude)) return null;
    if (nearby.some((line) => /^down$/i.test(line))) return -Math.abs(magnitude);
    if (nearby.some((line) => /^up$/i.test(line))) return Math.abs(magnitude);
    return magnitude;
  }

  function findSnapshotFeedbackCount(cardText, rating) {
    const match = String(cardText || "").match(new RegExp(`([0-9][0-9,]*)\\s*${rating}\\b`, "i"));
    return match ? parseDashboardNumber(match[1]) : null;
  }

  function parseSelectedOrdersCount(text) {
    const match = String(text || "").match(/([\d,]+)\s+orders?\s+selected/i);
    return match ? Number(match[1].replace(/,/g, "")) : null;
  }

  function resolveMarkShippedSelectedCount(summaryCount, expectedCount, masterChecked, checkedOrderCount, shippingEnabled) {
    const summary = summaryCount == null ? null : Number(summaryCount);
    if (Number.isInteger(summary) && summary > 0) {
      return { count: summary, source: "selection-summary" };
    }

    const expected = Number(expectedCount);
    const checked = Number(checkedOrderCount);
    if (
      Number.isInteger(expected)
      && expected > 0
      && Number.isInteger(checked)
      && checked === expected
      && Boolean(masterChecked)
      && Boolean(shippingEnabled)
    ) {
      return { count: checked, source: "checked-order-controls" };
    }
    return null;
  }

  function isMarkShippedOrderCheckbox(control) {
    const label = U.normalizeText([
      control?.getAttribute?.("aria-label"),
      control?.getAttribute?.("title")
    ].filter(Boolean).join(" "));
    if (label.includes("select all orders on this page")) return false;
    if (label.startsWith("bulk actions checkbox for record")) return true;

    const row = control?.closest?.('tr, [role="row"]');
    if (!row) return false;
    const rowText = String(row.innerText || row.textContent || "");
    return /\b\d{2}-\d{5}-\d{5}\b/.test(rowText);
  }

  function currentMarkShippedSelectionEvidence(masterCheckbox, expectedCount) {
    const controls = [...document.querySelectorAll('input[type="checkbox"], [role="checkbox"]')]
      .filter(U.isVisible)
      .filter(isMarkShippedOrderCheckbox);
    const checkedOrderCount = controls.filter(isCheckedControl).length;
    const shippingButton = findExactVisible("Shipping", 'button, [role="button"]');
    const shippingEnabled = Boolean(
      shippingButton
      && !shippingButton.disabled
      && shippingButton.getAttribute("aria-disabled") !== "true"
    );
    return resolveMarkShippedSelectedCount(
      parseSelectedOrdersCount(document.body?.innerText || ""),
      expectedCount,
      isCheckedControl(masterCheckbox),
      checkedOrderCount,
      shippingEnabled
    );
  }

  function parseMarkShippedSelectedCount(dialogText) {
    const text = String(dialogText || "");
    const match = text.match(/mark\s+([\d,]+)\s+orders?\s+as shipped/i)
      || text.match(/mark\s+as shipped[^\d]*([\d,]+)\s+orders?/i);
    if (match) return Number(match[1].replace(/,/g, ""));
    return null;
  }

  function resolveMarkShippedConfirmationCount(dialogCount, preselectedCount, expectedCount) {
    const dialog = dialogCount == null ? null : Number(dialogCount);
    if (Number.isInteger(dialog) && dialog > 0) {
      return { count: dialog, source: "confirmation-dialog" };
    }

    const preselected = Number(preselectedCount);
    const expected = Number(expectedCount);
    if (
      Number.isInteger(preselected)
      && Number.isInteger(expected)
      && expected > 0
      && preselected === expected
    ) {
      return { count: preselected, source: "pre-confirm-selection" };
    }
    return null;
  }

  function validateMarkShippedConfirmation(beforeCount, selectedCount) {
    const before = Number(beforeCount);
    const selected = Number(selectedCount);
    if (!Number.isInteger(before) || before <= 0) {
      return { ok: false, error: "The awaiting-shipment total is missing or invalid." };
    }
    if (!Number.isInteger(selected) || selected <= 0) {
      return { ok: false, error: "eBay did not report how many orders are selected." };
    }
    if (selected !== before) {
      return {
        ok: false,
        error: `eBay selected ${selected.toLocaleString()} of ${before.toLocaleString()} awaiting orders. Nothing was submitted.`
      };
    }
    return { ok: true, beforeCount: before, selectedCount: selected };
  }

  function markShippedCompletionEvidence(bodyText, beforeCount, selectedCount, remainingCount) {
    const text = String(bodyText || "");
    const before = Number(beforeCount);
    const selected = Number(selectedCount);
    const remaining = remainingCount == null ? null : Number(remainingCount);
    const match = text.match(/([\d,]+)\s+orders?\s+(?:has|have)\s+been marked as shipped/i);
    let marked = match ? Number(match[1].replace(/,/g, "")) : null;
    if (marked == null && Number.isFinite(remaining) && Number.isFinite(before) && remaining < before) {
      marked = before - remaining;
    }
    if (marked == null && remaining === 0 && Number.isFinite(selected)) marked = selected;
    if (!Number.isFinite(marked) || marked <= 0) return null;
    const expectedRemainingFromMarked = Number.isFinite(before) ? Math.max(0, before - marked) : null;
    if (Number.isFinite(remaining) && expectedRemainingFromMarked != null && remaining !== expectedRemainingFromMarked) {
      return null;
    }
    const expectedRemaining = Number.isFinite(before) && Number.isFinite(selected) ? Math.max(0, before - selected) : null;
    return {
      marked,
      remaining: Number.isFinite(remaining) ? remaining : null,
      exact: marked === selected && (expectedRemaining == null || remaining == null || remaining === expectedRemaining)
    };
  }

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  async function warmSellerHubSnapshotCards() {
    const pageHeight = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      window.innerHeight || 0
    );
    const points = [0, Math.round(pageHeight * 0.25), Math.round(pageHeight * 0.5), Math.round(pageHeight * 0.75), pageHeight];
    for (const top of points) {
      window.scrollTo({ top, behavior: "auto" });
      await wait(450);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    await wait(500);
  }

  function missingSellerHubSnapshotCards() {
    return ["Sales", "Traffic", "Feedback"].filter((heading) => !snapshotCardText(heading));
  }

  async function waitForSellerHubSnapshotCards(timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    let missing = missingSellerHubSnapshotCards();
    while (missing.length && Date.now() < deadline) {
      await wait(500);
      missing = missingSellerHubSnapshotCards();
    }
    return missing;
  }

  function extractEbaySnapshot(identity) {
    const salesCard = snapshotCardText("Sales");
    const trafficCard = snapshotCardText("Traffic");
    const advertisingCard = snapshotCardText("Advertising");
    const feedbackCard = snapshotCardText("Feedback");

    return {
      computerLabel: identity.computerLabel,
      ebayAccountLabel: identity.ebayAccountLabel,
      salesToday: findSnapshotMetric(salesCard, "Today", { moneyOnly: true }),
      salesLast7Days: findSnapshotMetric(salesCard, "Last 7 days", { moneyOnly: true }),
      salesLast31Days: findSnapshotMetric(salesCard, "Last 31 days", { moneyOnly: true }),
      salesLast31DaysChange: findSnapshotPercentChange(salesCard, "Last 31 days"),
      salesLast90Days: findSnapshotMetric(salesCard, "Last 90 days", { moneyOnly: true }),
      feedbackPositive30Days: findSnapshotFeedbackCount(feedbackCard, "Positive"),
      feedbackNeutral30Days: findSnapshotFeedbackCount(feedbackCard, "Neutral"),
      feedbackNegative30Days: findSnapshotFeedbackCount(feedbackCard, "Negative"),
      trafficImpressions: findSnapshotMetric(trafficCard, "Listing impressions", { integerOnly: true }),
      trafficPageViews: findSnapshotMetric(trafficCard, "Listing page views", { integerOnly: true }),
      advertisingClicks: findSnapshotMetric(advertisingCard, "Clicks", { integerOnly: true }),
      advertisingSales: findSnapshotMetric(advertisingCard, "Ad sales", { moneyOnly: true }),
      advertisingRoas: findSnapshotMetric(advertisingCard, "ROAS", { numberOnly: true }),
      advertisingCost: findSnapshotMetric(advertisingCard, "Ad fees", { moneyOnly: true }),
      capturedAt: new Date().toISOString(),
      pageTitle: document.title,
      pageUrl: location.href
    };
  }

  function showEbaySnapshotPreview(record) {
    document.getElementById("gldn-ebay-snapshot-preview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-ebay-snapshot-preview";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    const money = (value) => value == null ? "Not captured" : Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
    const plain = (value) => value == null ? "Not captured" : String(value);
    const rows = [
      ["Sales today", money(record.salesToday)],
      ["Sales last 7 days", money(record.salesLast7Days)],
      ["Sales last 31 days", money(record.salesLast31Days)],
      ["Sales last 31 days change", record.salesLast31DaysChange == null ? "Not captured" : `${record.salesLast31DaysChange}%`],
      ["Sales last 90 days", money(record.salesLast90Days)],
      ["Feedback positive", plain(record.feedbackPositive30Days)],
      ["Feedback neutral", plain(record.feedbackNeutral30Days)],
      ["Feedback negative", plain(record.feedbackNegative30Days)],
      ["Traffic impressions", plain(record.trafficImpressions)],
      ["Traffic page views", plain(record.trafficPageViews)],
      ["Advertising clicks", plain(record.advertisingClicks)],
      ["Advertising sales", money(record.advertisingSales)],
      ["Advertising ROAS", plain(record.advertisingRoas)],
      ["Advertising cost", money(record.advertisingCost)]
    ];
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Review eBay Snapshot</h2>
        <p class="gldn-help-text">These values come from Seller Hub Overview. Some cards may require scrolling or a different Seller Hub layout.</p>
        <div class="gldn-existing">
          ${rows.map(([label, value]) => `<div class="gldn-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save">Save eBay Snapshot</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    makeReviewModalDraggable(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    overlay.querySelector("[data-action='save']").addEventListener("click", async () => {
      const status = overlay.querySelector(".gldn-modal-status");
      status.textContent = "Saving eBay snapshot...";
      await storageSet({ latestEbaySnapshot: record });
      runtimeMessage({ type: "syncEbaySnapshot", record }).then((response) => {
        if (response?.ok) {
          status.textContent = "eBay snapshot synced.";
          renderStatus("eBay snapshot synced.", "completed");
          setTimeout(close, 900);
        } else {
          const error = response?.error || "Dashboard sync failed.";
          status.textContent = error;
          renderStatus(`Snapshot saved locally - sync failed: ${error}`, "error");
        }
      });
    });
  }

  async function scanEbaySnapshot(options = {}) {
    const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    const identity = normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel);
    if (!identity.computerLabel || !identity.ebayAccountLabel) {
      alert("This computer is Poshmark-only or is not configured. eBay snapshot requires an eBay computer.");
      await storageRemove(["pendingEbaySnapshotScan"]);
      return;
    }
    if (!/\/sh\/ovw/i.test(location.href)) {
      renderStatus("Opening Seller Hub Overview...", "ready");
      await storageSet({ pendingEbaySnapshotScan: { active: true, startedAt: Date.now(), retryCount: Number(options.retryCount || 0) } });
      location.assign(SELLER_HUB_OVERVIEW_URL);
      return;
    }
    renderStatus("Loading Seller Hub cards before reading snapshot...", "ready");
    await warmSellerHubSnapshotCards();
    const missingCards = await waitForSellerHubSnapshotCards();
    const retryCount = Number(options.retryCount || 0);
    if (missingCards.length && retryCount < 1) {
      renderStatus(`Seller Hub omitted ${missingCards.join(" and ")}. Reloading once...`, "ready");
      await storageSet({
        pendingEbaySnapshotScan: {
          active: true,
          startedAt: Date.now(),
          retryCount: retryCount + 1,
          missingCards
        }
      });
      location.reload();
      return;
    }
    await storageRemove(["pendingEbaySnapshotScan"]);
    renderStatus("Reading Seller Hub snapshot...", "ready");
    showEbaySnapshotPreview(extractEbaySnapshot(identity));
    renderStatus(
      missingCards.length
        ? `Review partial snapshot - Seller Hub still omitted ${missingCards.join(" and ")}.`
        : "Review eBay snapshot before saving.",
      missingCards.length ? "error" : "ready"
    );
  }

  async function startEbaySnapshotScan() {
    let reservationToken = "";
    try {
      reservationToken = await U.claimWorkflowStart("ebay-snapshot", "eBay sales snapshot");
      await storageSet({
        gldnStopRequested: false,
        pendingEbaySnapshotScan: { active: true, startedAt: Date.now(), retryCount: 0 }
      });
    } catch (error) {
      renderStatus(error.message || "eBay snapshot could not start.", "error");
      return;
    } finally {
      await U.releaseWorkflowStart(reservationToken);
    }
    await scanEbaySnapshot();
  }

  async function resumePendingEbaySnapshotScan() {
    const result = await storageGet(["pendingEbaySnapshotScan"]);
    const pending = result.pendingEbaySnapshotScan;
    if (!pending?.active) return false;
    if (Date.now() - Number(pending.startedAt || 0) > 120000) {
      await storageRemove(["pendingEbaySnapshotScan"]);
      renderStatus("Sales snapshot scan timed out. Open Seller Hub Overview and try again.", "error");
      return false;
    }
    if (!/\/sh\/ovw/i.test(location.href)) return false;
    await storageRemove(["pendingEbaySnapshotScan"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await scanEbaySnapshot({ retryCount: Number(pending.retryCount || 0) });
    return true;
  }

  function expandAbbreviatedNumber(raw) {
    const match = String(raw || "").trim().replace(/,/g, "").match(/^\$?([0-9]+(?:\.[0-9]+)?)\s*([KMB])?$/i);
    if (!match) return null;
    const multipliers = { K: 1e3, M: 1e6, B: 1e9 };
    return Number(match[1]) * (match[2] ? multipliers[match[2].toUpperCase()] : 1);
  }

  function integerValue(raw) {
    const cleaned = String(raw ?? "").replace(/[^0-9-]/g, "");
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function moneyValue(raw) {
    const cleaned = String(raw ?? "").replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function parseStoreSubscriptionAllowance(text, storePlan) {
    const source = String(text || "");
    const explicitAllowance = source.match(/\b(?:Starter|Basic|Premium|Anchor|Enterprise)\s+Store\s+Subscription\s*[\u2013\u2014-]?\s*([\d,]+)\s+Fixed\s+Price\s+Listings/i)
      || source.match(/Store\s+Subscription[\s\S]{0,500}?([\d,]+)\s+Fixed\s+Price\s+Listings/i);
    const expectedLimit = explicitAllowance
      ? integerValue(explicitAllowance[1])
      : (STORE_PLAN_LIMITS[storePlan] ?? null);
    const candidates = [];
    const addCandidate = (usedRaw, leftRaw) => {
      const used = integerValue(usedRaw);
      const left = integerValue(leftRaw);
      if (used == null || left == null) return;
      if (!candidates.some((entry) => entry.used === used && entry.left === left)) {
        candidates.push({ used, left, total: used + left });
      }
    };

    [...source.matchAll(/Promotional offers,\s*([\d,]+)\s*used,\s*([\d,]+)\s*left/gi)]
      .forEach((match) => addCandidate(match[1], match[2]));
    [...source.matchAll(/Used\s*\/\s*Left\s*:\s*([\d,]+)\s*\/\s*([\d,]+)/gi)]
      .forEach((match) => addCandidate(match[1], match[2]));

    const selected = expectedLimit != null
      ? candidates.find((entry) => entry.total === expectedLimit)
      : (candidates.length === 1 ? candidates[0] : null);
    return {
      limit: expectedLimit ?? selected?.total ?? null,
      used: selected?.used ?? null,
      left: selected?.left ?? null
    };
  }

  function isActiveListingsPage() {
    return /\/sh\/lst\/active/i.test(location.href);
  }

  function parseActiveListingsSummary() {
    const text = String(document.body?.innerText || "");
    const results = text.match(/Results:\s*(?:[\d,]+\s*-\s*)?[\d,]+\s+of\s+([\d,]+)/i)
      || text.match(/Results:\s*([\d,]+)/i);
    const qty = text.match(/\bQty:\s*([\d,]+)/i);
    return {
      activeListings: results ? integerValue(results[1]) : null,
      availableQuantity: qty ? integerValue(qty[1]) : null,
      pageUrl: location.href,
      capturedAt: new Date().toISOString()
    };
  }

  async function clearActiveListingsFiltersIfNeeded() {
    const clear = [...document.querySelectorAll('button, a, [role="button"]')].find((element) => {
      return U.isVisible(element) && U.normalizeText(element.innerText || element.textContent || "") === "clear all";
    });
    if (!clear) return;
    const before = String(document.body?.innerText || "");
    dispatchFullClick(clear);
    await U.waitFor(() => {
      const text = String(document.body?.innerText || "");
      const chipStillFiltered = /All filters\s*\(\d+\)/i.test(text);
      return !chipStillFiltered && text !== before ? true : null;
    }, 25000, 300);
  }

  function scanListingsOverview() {
    const text = document.body?.innerText || "";

    // Active listings card. eBay may render the number before or after the label.
    const activeAfterLabel = text.match(/ACTIVE\s+LISTINGS[\s:]*([\d,]+)/i);
    const activeBeforeLabel = text.match(/([\d,]+)[\s\n]+ACTIVE\s+LISTINGS/i);
    const activeListings = activeAfterLabel
      ? integerValue(activeAfterLabel[1])
      : activeBeforeLabel ? integerValue(activeBeforeLabel[1]) : null;

    // Store plan and monthly free-listing allowance are shown in the Promotional offers area.
    // Do not require the allowance to be on the same line as the plan because eBay renders
    // those pieces in separate DOM blocks.
    const planMatch = text.match(/\b(Starter|Basic|Premium|Anchor|Enterprise)\s+Store\s+Subscription\b/i);
    const storePlan = planMatch ? planMatch[1] : "";

    const storeAllowance = parseStoreSubscriptionAllowance(text, storePlan);
    const subscriptionListingLimit = storeAllowance.limit;
    const subscriptionUsedThisMonth = storeAllowance.used;
    const subscriptionLeftThisMonth = storeAllowance.left;

    // Monthly limits card. Keep the expressions flexible because eBay can insert line breaks
    // or omit the explanatory suffix after "limit".
    const quantity = text.match(/([\d,]+)\s*(?:items?\s+)?listed\s+and\s+sold\s*\/\s*([\d,]+)\s+limit(?:\s+on\s+quantity\s+of\s+items)?/i);
    const dollar = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s+listed\s+and\s+sold\s*\/\s*\$\s*([0-9.,]+\s*[KMB]?)\s+limit/i);

    // Fallbacks from the "more" figures shown in Seller Hub when the detailed line is delayed.
    const quantityMore = text.match(/([\d,]+)\s+more\s+items/i);
    const quantityLimitOnly = text.match(/\/\s*([\d,]+)\s+limit\s+on\s+quantity\s+of\s+items/i);
    const dollarMore = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s+more/i);
    const dollarLimitOnly = text.match(/\/\s*\$\s*([0-9.,]+\s*[KMB]?)\s+limit/i);

    let currentQuantityUsed = quantity ? integerValue(quantity[1]) : null;
    let monthlySellerQuantityLimit = quantity ? integerValue(quantity[2]) : null;
    if (currentQuantityUsed == null && quantityMore && quantityLimitOnly) {
      monthlySellerQuantityLimit = integerValue(quantityLimitOnly[1]);
      const remaining = integerValue(quantityMore[1]);
      if (monthlySellerQuantityLimit != null && remaining != null) currentQuantityUsed = monthlySellerQuantityLimit - remaining;
    }

    let currentDollarUsed = dollar ? moneyValue(dollar[1]) : null;
    let monthlySellerDollarLimit = dollar ? expandAbbreviatedNumber(dollar[2]) : null;
    if (currentDollarUsed == null && dollarMore && dollarLimitOnly) {
      monthlySellerDollarLimit = expandAbbreviatedNumber(dollarLimitOnly[1]);
      const remaining = moneyValue(dollarMore[1]);
      if (monthlySellerDollarLimit != null && remaining != null) currentDollarUsed = monthlySellerDollarLimit - remaining;
    }

    return {
      activeListings,
      storePlan,
      subscriptionListingLimit,
      subscriptionUsedThisMonth,
      subscriptionLeftThisMonth,
      currentQuantityUsed,
      monthlySellerQuantityLimit,
      currentDollarUsed,
      monthlySellerDollarLimit,
      capturedAt: new Date().toISOString(),
      pageUrl: location.href
    };
  }

  function usageEvaluation(used, limit, criticalLabel = "CHECK LIMIT") {
    if (used === null || used === undefined || used === "" || limit === null || limit === undefined || limit === ""
      || !Number.isFinite(Number(used)) || !Number.isFinite(Number(limit)) || Number(limit) <= 0) {
      return { ratio: null, percent: null, state: "unknown", label: "NOT DETECTED" };
    }
    const ratio = Number(used) / Number(limit);
    if (ratio >= PRUNE_THRESHOLD) {
      return { ratio, percent: ratio * 100, state: "critical", label: criticalLabel };
    }
    return { ratio, percent: ratio * 100, state: "good", label: "GOOD" };
  }

  function limitChanged(previous, detected) {
    // Missing data must never be interpreted as zero. Only flag a change when both limits
    // were actually present and numeric.
    if (previous === null || previous === undefined || previous === "") return false;
    if (detected === null || detected === undefined || detected === "") return false;
    const previousNumber = Number(previous);
    const detectedNumber = Number(detected);
    return Number.isFinite(previousNumber) && Number.isFinite(detectedNumber) && previousNumber !== detectedNumber;
  }

  function listingField(label, id, value, type = "text", readOnly = false) {
    const safe = value === null || value === undefined ? "" : value;
    return `<div class="gldn-health-field"><label class="gldn-label" for="${id}">${label}</label><input id="${id}" class="gldn-text-input" type="${type}" value="${escapeHtml(safe)}" ${readOnly ? "readonly" : ""}></div>`;
  }

  function formatInteger(value) {
    if (value === null || value === undefined || value === "") return "Not detected";
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "Not detected";
  }

  function evaluateListingLimits(values) {
    const storeAllowance = usageEvaluation(
      values.subscriptionUsedThisMonth,
      values.subscriptionListingLimit,
      "CHECK INSERTION ALLOWANCE"
    );
    const sellerQuantity = usageEvaluation(
      values.currentQuantityUsed,
      values.monthlySellerQuantityLimit,
      "CHECK SELLING LIMIT"
    );
    const sellerDollar = usageEvaluation(
      values.currentDollarUsed,
      values.monthlySellerDollarLimit,
      "CHECK DOLLAR LIMIT"
    );
    const evaluations = [storeAllowance, sellerQuantity, sellerDollar];
    const requiredEvaluations = [storeAllowance, sellerDollar];
    const overallStatus = evaluations.some((entry) => entry.state === "critical")
      ? "CHECK LIMITS"
      : values.limitChanged
        ? "LIMIT CHANGED"
        : requiredEvaluations.some((entry) => entry.state === "unknown")
          ? "NOT DETECTED"
          : "GOOD";
    return { storeAllowance, sellerQuantity, sellerDollar, overallStatus };
  }

  function formatCurrency(value) {
    if (value === null || value === undefined || value === "") return "Not detected";
    return Number.isFinite(Number(value))
      ? Number(value).toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "Not detected";
  }

  function statusSummary(label, evaluation) {
    const stateClass = evaluation.state === "critical" ? "gldn-usage-critical" : evaluation.state === "good" ? "gldn-usage-good" : "gldn-usage-unknown";
    const percent = evaluation.percent == null ? "" : ` (${evaluation.percent.toFixed(1)}%)`;
    return `<div class="gldn-usage-row ${stateClass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(evaluation.label)}${percent}</strong></div>`;
  }

  async function showListingsPreview(activeSummary = null) {
    const stored = await storageGet([
      "computerLabel", "ebayAccountLabel", "storePlan", "freeFixedPriceLimit",
      "monthlySellerQuantityLimit", "monthlySellerDollarLimit", "limitsConfirmedMonth"
    ]);
    const initialIdentity = normalizedIdentity(stored.computerLabel, stored.ebayAccountLabel);
    const detected = scanListingsOverview();
    if (activeSummary?.activeListings != null) detected.activeListings = activeSummary.activeListings;
    detected.availableQuantity = activeSummary?.availableQuantity ?? activeSummary?.inStockQuantity ?? null;
    const detectedOrStoredLimit = detected.subscriptionListingLimit ?? stored.freeFixedPriceLimit ?? "";
    const storePlan = normalizedStorePlan(detected.storePlan || stored.storePlan, detectedOrStoredLimit);
    const subscriptionLimit = STORE_PLAN_LIMITS[storePlan] ?? detectedOrStoredLimit;
    const quantityLimit = detected.monthlySellerQuantityLimit ?? stored.monthlySellerQuantityLimit ?? "";
    const dollarLimit = detected.monthlySellerDollarLimit ?? stored.monthlySellerDollarLimit ?? DEFAULT_DOLLAR_LIMIT;
    const subscriptionChanged = limitChanged(stored.freeFixedPriceLimit, detected.subscriptionListingLimit);
    const dollarChanged = limitChanged(stored.monthlySellerDollarLimit, detected.monthlySellerDollarLimit);

    document.getElementById("gldn-listings-preview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-listings-preview";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal">
        <button type="button" class="gldn-close" aria-label="Close">×</button>
        <h2>Confirm Listings Under Limit</h2>
        <p class="gldn-help-text">This separates current inventory, the monthly zero-insertion-fee allowance, and eBay's quantity and dollar selling limits.</p>
        <div class="gldn-health-grid gldn-identity-grid">
          ${selectField("Computer", "gldn-listings-computer", initialIdentity.computerLabel, COMPUTER_OPTIONS)}
          ${derivedAccountField("eBay account", "gldn-listings-account", initialIdentity)}
        </div>
        <div class="gldn-health-grid">
          ${selectField("Store monthly zero-insertion allowance", "gldn-listings-plan", storePlan, [
            { value: "Premium", label: "Premium - 10,000 fixed-price insertions" },
            { value: "Anchor", label: "Anchor - 25,000 fixed-price insertions" },
            { value: "Custom", label: "Custom monthly allowance" }
          ])}
          ${listingField("Active listings", "gldn-listings-active", formatInteger(detected.activeListings), "text", true)}
          ${listingField("Available item quantity (eBay Qty)", "gldn-listings-in-stock", formatInteger(detected.availableQuantity), "text", true)}
          <div id="gldn-custom-listing-wrap" class="gldn-health-field" style="display:${storePlan === "Custom" ? "block" : "none"}">
            <label class="gldn-label" for="gldn-listings-limit">Custom monthly insertion allowance</label>
            <input id="gldn-listings-limit" class="gldn-text-input" type="number" value="${escapeHtml(subscriptionLimit)}">
          </div>
          ${listingField("Dollar amount listed and sold", "gldn-listings-dollar-used", formatCurrency(detected.currentDollarUsed), "text", true)}
          ${selectField("Monthly dollar limit", "gldn-dollar-preset", Number(dollarLimit) === DEFAULT_DOLLAR_LIMIT ? String(DEFAULT_DOLLAR_LIMIT) : "custom", [
            { value: String(DEFAULT_DOLLAR_LIMIT), label: "$1,000,000" },
            { value: "custom", label: "Custom amount" }
          ])}
          <div id="gldn-custom-dollar-wrap" class="gldn-health-field" style="display:${Number(dollarLimit) === DEFAULT_DOLLAR_LIMIT ? "none" : "block"}">
            <label class="gldn-label" for="gldn-listings-dollar-limit">Custom monthly dollar limit</label>
            <input id="gldn-listings-dollar-limit" class="gldn-text-input" type="number" value="${escapeHtml(dollarLimit)}">
          </div>
        </div>
        <div class="gldn-usage-box"></div>
        <div class="gldn-inventory-box"></div>
        <div class="gldn-existing">
          <strong>Detected from eBay:</strong><br>
          Store zero-insertion allowance used/left this month: ${formatInteger(detected.subscriptionUsedThisMonth)} / ${formatInteger(detected.subscriptionLeftThisMonth)}<br>
          Seller quantity listed and sold: ${formatInteger(detected.currentQuantityUsed)} / ${formatInteger(quantityLimit)}<br>
          Dollar listed and sold: ${formatCurrency(detected.currentDollarUsed)} / ${formatCurrency(dollarLimit)}
          ${(subscriptionChanged || dollarChanged) ? `<div class="gldn-limit-changed">LIMIT CHANGED — review before confirming.</div>` : ""}
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="confirm-listings">Confirm Listings Under Limit</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    makeReviewModalDraggable(overlay);

    const planSelect = overlay.querySelector("#gldn-listings-plan");
    const computerSelect = overlay.querySelector("#gldn-listings-computer");
    const accountInput = overlay.querySelector("#gldn-listings-account");
    const customListingWrap = overlay.querySelector("#gldn-custom-listing-wrap");
    const listingLimitInput = overlay.querySelector("#gldn-listings-limit");
    const dollarPreset = overlay.querySelector("#gldn-dollar-preset");
    const customDollarWrap = overlay.querySelector("#gldn-custom-dollar-wrap");
    const dollarLimitInput = overlay.querySelector("#gldn-listings-dollar-limit");
    const usageBox = overlay.querySelector(".gldn-usage-box");
    const inventoryBox = overlay.querySelector(".gldn-inventory-box");

    const selectedListingLimit = () => STORE_PLAN_LIMITS[planSelect.value] ?? Number(listingLimitInput.value);
    const selectedDollarLimit = () => dollarPreset.value === "custom" ? Number(dollarLimitInput.value) : Number(dollarPreset.value);
    computerSelect.addEventListener("change", () => {
      const identity = normalizedIdentity(computerSelect.value);
      accountInput.value = identity.poshmarkOnly ? "Poshmark only" : identity.ebayAccountLabel;
    });

    const refreshUsage = () => {
      const active = parseNumericText(overlay.querySelector("#gldn-listings-active").value);
      const available = parseNumericText(overlay.querySelector("#gldn-listings-in-stock").value);
      const dollars = parseNumericText(overlay.querySelector("#gldn-listings-dollar-used").value);
      const evaluations = evaluateListingLimits({
        subscriptionUsedThisMonth: detected.subscriptionUsedThisMonth,
        subscriptionListingLimit: selectedListingLimit(),
        currentQuantityUsed: detected.currentQuantityUsed,
        monthlySellerQuantityLimit: quantityLimit,
        currentDollarUsed: dollars,
        monthlySellerDollarLimit: selectedDollarLimit(),
        limitChanged: false
      });
      usageBox.innerHTML = statusSummary("Monthly zero-insertion allowance", evaluations.storeAllowance)
        + statusSummary("Seller quantity limit", evaluations.sellerQuantity)
        + statusSummary("Seller dollar limit", evaluations.sellerDollar);
      const activeText = Number.isFinite(active) ? `${active.toLocaleString()} current listing records` : "Active listings not detected";
      const availableText = Number.isFinite(available) ? `${available.toLocaleString()} available units shown by eBay Qty` : "Available quantity not detected";
      inventoryBox.innerHTML = `<div class="gldn-inventory-summary"><strong>Current inventory (informational)</strong><span>${activeText}</span><span>${availableText}</span><span>Neither inventory number is the monthly insertion-allowance counter.</span></div>`;
    };

    const applyPlan = () => {
      const fixedLimit = STORE_PLAN_LIMITS[planSelect.value];
      const custom = planSelect.value === "Custom";
      customListingWrap.style.display = custom ? "block" : "none";
      if (!custom) listingLimitInput.value = fixedLimit;
      refreshUsage();
    };

    const applyDollar = () => {
      const custom = dollarPreset.value === "custom";
      customDollarWrap.style.display = custom ? "block" : "none";
      if (!custom) dollarLimitInput.value = dollarPreset.value;
      refreshUsage();
    };

    planSelect.addEventListener("change", applyPlan);
    dollarPreset.addEventListener("change", applyDollar);
    listingLimitInput.addEventListener("input", refreshUsage);
    dollarLimitInput.addEventListener("input", refreshUsage);
    refreshUsage();

    const close = async () => {
      await storageSet({ pendingReviewMonthlyLimits: false });
      overlay.remove();
    };
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);

    overlay.querySelector("[data-action='confirm-listings']").addEventListener("click", async () => {
      const read = (id) => overlay.querySelector(id).value.trim();
      const number = (id) => {
        const raw = read(id).replace(/[^0-9.-]/g, "");
        return raw === "" ? null : Number(raw);
      };
      const identity = normalizedIdentity(read("#gldn-listings-computer"));
      const selectedPlan = read("#gldn-listings-plan");
      const activeListings = number("#gldn-listings-active");
      const availableQuantity = number("#gldn-listings-in-stock");
      const confirmedSubscriptionLimit = STORE_PLAN_LIMITS[selectedPlan] ?? number("#gldn-listings-limit");
      const currentDollarUsed = number("#gldn-listings-dollar-used");
      const confirmedDollarLimit = read("#gldn-dollar-preset") === "custom"
        ? number("#gldn-listings-dollar-limit")
        : Number(read("#gldn-dollar-preset"));

      if (!identity.computerLabel || !identity.ebayAccountLabel || !selectedPlan || confirmedSubscriptionLimit == null || confirmedDollarLimit == null) {
        overlay.querySelector(".gldn-modal-status").textContent = "This computer is Poshmark-only or the listing limits are incomplete. eBay listing checks require an eBay computer.";
        return;
      }

      const detectedLimitChanged = limitChanged(stored.freeFixedPriceLimit, detected.subscriptionListingLimit)
        || limitChanged(stored.monthlySellerDollarLimit, detected.monthlySellerDollarLimit);
      const evaluations = evaluateListingLimits({
        subscriptionUsedThisMonth: detected.subscriptionUsedThisMonth,
        subscriptionListingLimit: confirmedSubscriptionLimit,
        currentQuantityUsed: detected.currentQuantityUsed,
        monthlySellerQuantityLimit: quantityLimit,
        currentDollarUsed,
        monthlySellerDollarLimit: confirmedDollarLimit,
        limitChanged: detectedLimitChanged
      });
      const overallStatus = evaluations.overallStatus;

      const record = {
        computerLabel: identity.computerLabel,
        ebayAccountLabel: identity.ebayAccountLabel,
        storePlan: selectedPlan,
        activeListings,
        availableQuantity,
        inStockQuantity: availableQuantity,
        outOfStockCount: null,
        inStockPercent: null,
        subscriptionListingLimit: confirmedSubscriptionLimit,
        subscriptionUsagePercent: evaluations.storeAllowance.percent,
        subscriptionStatus: evaluations.storeAllowance.label,
        subscriptionUsedThisMonth: detected.subscriptionUsedThisMonth,
        subscriptionLeftThisMonth: detected.subscriptionLeftThisMonth,
        currentQuantityUsed: detected.currentQuantityUsed,
        monthlySellerQuantityLimit: quantityLimit === "" ? null : Number(quantityLimit),
        sellerQuantityUsagePercent: evaluations.sellerQuantity.percent,
        sellerQuantityStatus: evaluations.sellerQuantity.label,
        currentDollarUsed,
        monthlySellerDollarLimit: confirmedDollarLimit,
        dollarUsagePercent: evaluations.sellerDollar.percent,
        dollarStatus: evaluations.sellerDollar.label,
        limitChanged: detectedLimitChanged,
        overallStatus,
        calculationBasis: "Store monthly zero-insertion allowance",
        limitsConfirmedMonth: currentMonthKey(),
        confirmedAt: new Date().toISOString(),
        pageUrl: location.href
      };

      const previous = await storageGet(["listingStatusHistory"]);
      const history = Array.isArray(previous.listingStatusHistory) ? previous.listingStatusHistory : [];
      history.push(record);
      await storageSet({
        computerLabel: identity.computerLabel,
        ebayAccountLabel: identity.ebayAccountLabel,
        storePlan: selectedPlan,
        freeFixedPriceLimit: confirmedSubscriptionLimit,
        monthlySellerQuantityLimit: record.monthlySellerQuantityLimit,
        monthlySellerDollarLimit: confirmedDollarLimit,
        limitsConfirmedMonth: record.limitsConfirmedMonth,
        limitsConfirmedAt: record.confirmedAt,
        latestListingStatus: record,
        listingStatusHistory: history.slice(-1000),
        pendingReviewMonthlyLimits: false
      });

      refreshLimitsButton();
      renderStatus(overallStatus === "GOOD" ? "Listings confirmed — GOOD" : overallStatus, overallStatus === "GOOD" ? "completed" : "error");
      await close();
      syncAccountLimitsRecord(record).then((sync) => {
        if (sync?.ok) {
          if (overallStatus === "GOOD" && sync.data?.taskChecked !== true) {
            renderStatus("Listings synced, but the Tasks checkbox did not read back as checked. Copy diagnostics before retrying.", "error");
          } else {
            const taskCell = sync.data?.taskCell ? ` (${sync.data.taskCell})` : "";
            renderStatus(`Listings confirmed, synced, and Tasks checkbox verified${taskCell}`, "completed");
          }
        } else if (sync?.queued) {
          renderStatus("Listings saved locally - dashboard sync continuing in background", "ready");
        } else {
          renderStatus(`Listings saved locally - dashboard sync failed: ${sync?.error || "Unknown error"}`, "error");
        }
      });
    });
  }

  async function reviewMonthlyLimits() {
    if (await stopForEbayInterruption("Listing limit check")) return;
    const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel", "pendingReviewMonthlyLimits"]);
    const identity = {
      ...normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel),
      pendingReviewMonthlyLimits: storedIdentity.pendingReviewMonthlyLimits
    };
    if (!identity.computerLabel || !identity.ebayAccountLabel) {
      alert("This computer is Poshmark-only or is not configured. Listing limit checks require an eBay computer.");
      await storageSet({ pendingReviewMonthlyLimits: false });
      return;
    }

    let state = identity.pendingReviewMonthlyLimits;
    if (!state || state === true) state = { active: true, phase: "active-listings", startedAt: new Date().toISOString() };

    if (state.phase === "active-listings") {
      if (!isActiveListingsPage()) {
        await storageSet({ pendingReviewMonthlyLimits: state });
        renderStatus("Opening Active Listings…", "ready");
        location.assign(ACTIVE_LISTINGS_URL);
        return;
      }
      renderStatus("Reading active listings and available item quantity...", "ready");
      await clearActiveListingsFiltersIfNeeded();
      const summary = await U.waitFor(() => {
        const result = parseActiveListingsSummary();
        return result.activeListings != null && result.availableQuantity != null ? result : null;
      }, 45000, 350);
      if (!summary) {
        await storageSet({ pendingReviewMonthlyLimits: false });
        renderStatus("Active Listings totals could not be read.", "error");
        alert("I could not read Results and Qty from Active Listings. Wait for the page to finish loading, then try again.");
        return;
      }
      const next = { ...state, phase: "overview", activeSummary: summary };
      await storageSet({ pendingReviewMonthlyLimits: next });
      renderStatus("Opening Seller Hub Overview for monthly dollar usage…", "ready");
      location.assign(SELLER_HUB_OVERVIEW_URL);
      return;
    }

    if (!/\/sh\/ovw/i.test(location.href)) {
      await storageSet({ pendingReviewMonthlyLimits: state });
      location.assign(SELLER_HUB_OVERVIEW_URL);
      return;
    }

    renderStatus("Reading monthly dollar usage…", "ready");
    const loaded = await U.waitFor(() => {
      const scan = scanListingsOverview();
      return scan.currentDollarUsed != null ? scan : null;
    }, 45000, 350);
    if (!loaded) {
      await storageSet({ pendingReviewMonthlyLimits: false });
      renderStatus("Monthly dollar usage could not be read.", "error");
      alert("I could not read the current monthly dollar amount. Wait for Seller Hub Overview to finish loading, then try again.");
      return;
    }

    const monthlyHeading = [...document.querySelectorAll("h1, h2, h3, div")].find((element) => {
      if (!U.isVisible(element)) return false;
      return cleanLine(element.innerText || element.textContent || "") === "Monthly limits";
    });
    monthlyHeading?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    await showListingsPreview(state.activeSummary || null);
    renderStatus("Listings review ready", "ready");
  }

  async function refreshLimitsButton() {
    if (!limitsButtonElement) return;
    const result = await storageGet(["limitsConfirmedMonth", "latestListingStatus"]);
    const due = result.limitsConfirmedMonth !== currentMonthKey();
    const status = result.latestListingStatus?.overallStatus || "";
    const needsPrune = status === "PRUNE LISTINGS" || status === "LIMIT CHANGED";
    limitsButtonElement.classList.toggle("gldn-danger", due || needsPrune);
    limitsButtonElement.classList.toggle("gldn-success", !due && !needsPrune);
    limitsButtonElement.textContent = needsPrune
      ? status
      : due ? "Confirm Listings Under Limit" : "Under Limit";
  }

  function isMove99ActiveListingsPage() {
    return /\/sh\/lst\/active/i.test(location.pathname);
  }

  function isMove99BulkEditorPage() {
    const path = location.pathname || "";
    const body = document.body?.innerText || "";
    return /^\/bulksell2?(?:\/|$)/i.test(path)
      || /\/bulkedit/i.test(path)
      || (/\brevise listings\b/i.test(body) && /\b(item\(s\) selected|listings processed|bulk edit|review fees|store category 1)\b/i.test(body));
  }

  function isMove99SingleListingEditorPage() {
    const url = new URL(location.href);
    return /^\/lstng\/?$/i.test(url.pathname)
      && U.normalizeText(url.searchParams.get("mode") || "") === "reviseitem";
  }

  function singleListingEditorItemId() {
    for (const script of document.scripts || []) {
      const match = String(script.textContent || "").match(/["']itemId["']\s*:\s*["'](\d{9,15})["']/i);
      if (match) return match[1];
    }
    return "";
  }

  function exactTextElements(text, selector = "button, a, label, span, div, li, [role='button'], [role='menuitem'], [role='option']") {
    const target = U.normalizeText(text);
    return [...document.querySelectorAll(selector)].filter((element) => {
      if (!U.isVisible(element)) return false;
      return U.normalizeText(element.innerText || element.textContent || "") === target;
    });
  }

  function findSmallestExactText(text, selector) {
    const items = exactTextElements(text, selector);
    items.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
    return items[0] || null;
  }

  function clickElement(element, options = {}) {
    if (!element) return false;
    if (!options.preserveScroll) {
      element.scrollIntoView?.({ block: "center", inline: "center" });
    }
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
    return true;
  }

  function findCheckboxNearExactText(text, root = document) {
    const target = U.normalizeText(text);
    const candidates = [...root.querySelectorAll("label, span, div, li")]
      .filter(U.isVisible)
      .filter((element) => U.normalizeText(element.innerText || element.textContent || "") === target)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });

    for (const label of candidates) {
      if (label.matches("label")) {
        const direct = label.querySelector('input[type="checkbox"], [role="checkbox"]');
        if (direct) return { control: direct, clickTarget: label };
        const htmlFor = label.getAttribute("for");
        if (htmlFor) {
          const linked = document.getElementById(htmlFor);
          if (linked) return { control: linked, clickTarget: label };
        }
      }
      let node = label;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        const control = node.querySelector?.('input[type="checkbox"], [role="checkbox"]');
        if (control) return { control, clickTarget: label };
      }
      const previous = label.previousElementSibling;
      if (previous?.matches?.('input[type="checkbox"], [role="checkbox"]')) {
        return { control: previous, clickTarget: label };
      }
    }
    return null;
  }

  function controlChecked(control) {
    if (!control) return false;
    if (control instanceof HTMLInputElement) return Boolean(control.checked);
    return control.getAttribute("aria-checked") === "true" || control.dataset?.state === "checked";
  }

  function findMove99FilterPanel() {
    const candidates = [...document.querySelectorAll("aside, [role='dialog'], section, div")]
      .filter((element) => U.isVisible(element))
      .map((element) => {
        const text = U.normalizeText(element.innerText || element.textContent || "");
        const rect = element.getBoundingClientRect();
        return { element, text, rect };
      })
      .filter(({ text, rect }) => {
        if (!text.includes("see results")) return false;
        if (!(text.includes("filters") || text.includes("categories") || text.includes("store categories"))) return false;
        if (rect.width < 220 || rect.width > 700 || rect.height < 250) return false;
        return rect.right >= window.innerWidth - 40 && rect.left >= window.innerWidth * 0.55;
      })
      .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));
    return candidates[0]?.element || null;
  }

  function findExactWithin(root, text, selector = "button, a, label, span, div, li, [role='button'], [role='menuitem'], [role='option']") {
    if (!root) return null;
    const target = U.normalizeText(text);
    const candidates = [...root.querySelectorAll(selector)]
      .filter((element) => U.isVisible(element))
      .filter((element) => U.normalizeText(element.innerText || element.textContent || "") === target)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return candidates[0] || null;
  }

  function clickableForTextElement(element) {
    if (!element) return null;
    return element.closest("button, a, label, li, [role='button'], [role='menuitem'], [role='option']") || element;
  }

  function visibleActiveListingsTable() {
    return [...document.querySelectorAll("table, [role='grid'], [role='table']")]
      .some((element) => U.isVisible(element));
  }

  function visibleFilteredResultTotal() {
    const text = document.body?.innerText || "";
    const result = text.match(/Results?:\s*[\d,]+\s*[-\u2012\u2013\u2014]\s*[\d,]+\s+of\s+([\d,]+)/i);
    if (result) return Number(result[1].replace(/,/g, ""));
    if (/\bResults?:\s*0\b/i.test(text) || /\b0\s+results?\b/i.test(text)) return 0;
    return null;
  }

  function visibleFilteredListingCount() {
    const text = document.body?.innerText || "";
    const filteredTotal = visibleFilteredResultTotal();
    if (filteredTotal !== null) return filteredTotal;
    const editAll = text.match(/Edit all\s+([\d,]+)\s+listings/i);
    if (editAll) return Number(editAll[1].replace(/,/g, ""));

    // The Manage active listings heading is the account-wide total and can remain
    // stale after a Store category filter is applied. Never use it as filtered proof.
    if (new URL(location.href).searchParams.has("storeCatIds")) return null;
    const active = text.match(/([\d,]+)\s+active listings/i);
    return active ? Number(active[1].replace(/,/g, "")) : null;
  }

  function isMove99SourceFilterUrl() {
    try {
      if (!MOVE99_SOURCE_STORE_CATEGORY_IDS.length) return false;
      const url = new URL(location.href);
      const rawIds = url.searchParams.get("storeCatIds") || url.searchParams.get("category_ids") || "";
      const ids = new Set(rawIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean));
      return MOVE99_SOURCE_STORE_CATEGORY_IDS.every((id) => ids.has(id));
    } catch (_) {
      return false;
    }
  }

  function hasUnverifiableMove99SourceFilterUrl() {
    try {
      const url = new URL(location.href);
      const rawIds = url.searchParams.get("storeCatIds") || url.searchParams.get("category_ids") || "";
      if (!rawIds) return false;
      return rawIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .some((value) => !/^\d+$/.test(value));
    } catch (_) {
      return true;
    }
  }

  function numericMove99SourceCategoryIdsFromUrl(href = location.href) {
    try {
      const url = new URL(href);
      const rawIds = url.searchParams.get("storeCatIds") || url.searchParams.get("category_ids") || "";
      const ids = rawIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      return ids.length && ids.every((value) => /^\d+$/.test(value)) ? ids : [];
    } catch (_) {
      return [];
    }
  }

  async function rememberDiscoveredMove99SourceCategoryIds(accountLabel, ids, state = {}) {
    const normalizedIds = asStringArray(ids).filter((value) => /^\d+$/.test(value));
    const account = normalizedEbayAccount(accountLabel);
    if (!account || !normalizedIds.length) return false;
    if (state.scanMode === "non99" || MOVE99_SCAN_MODE === "non99") return false;

    const result = await storageGet(["move99AccountSettings"]);
    const allSettings = { ...(result.move99AccountSettings || {}) };
    const existing = allSettings[account] || allSettings[account.toLowerCase()] || {};
    const validation = FOUNDATION.validateMove99Settings({
      ...existing,
      sourceCategories: asStringArray(state.sourceCategories).length
        ? asStringArray(state.sourceCategories)
        : MOVE99_SOURCE_CATEGORIES,
      destinationCategory: String(state.destinationCategory || MOVE99_DESTINATION_CATEGORY || "").trim(),
      sourceStoreCategoryIds: normalizedIds,
      backburnerItemIds: asStringArray(state.backburnerItemIds).length
        ? asStringArray(state.backburnerItemIds)
        : [...MOVE99_BACKBURNER_ITEM_IDS]
    });
    if (!validation.ok) return false;

    allSettings[account] = JSON.parse(JSON.stringify(validation.settings));
    await storageSet({ move99AccountSettings: allSettings });
    MOVE99_SOURCE_STORE_CATEGORY_IDS = normalizedIds;
    MOVE99_ACTIVE_URL = buildMove99ActiveUrl(normalizedIds);
    return true;
  }

  async function waitForStableFilteredResults(requireSourceUrl = false, timeoutMs = 60000) {
    let lastKey = "";
    let stableSince = 0;
    return U.waitFor(() => {
      if (hasUnverifiableMove99SourceFilterUrl()) {
        lastKey = "";
        stableSince = 0;
        return null;
      }
      if (requireSourceUrl && !isMove99SourceFilterUrl()) {
        lastKey = "";
        stableSince = 0;
        return null;
      }

      const total = visibleFilteredResultTotal();
      const tableReady = total === 0 || visibleActiveListingsTable();
      const panelStillOpen = Boolean(findMove99FilterPanel());
      // Seller Hub can keep unrelated promotional progress bars and loading
      // markers visible indefinitely. A stable filtered Results total plus the
      // listings table is the authoritative readiness signal for this scan.
      if (total === null || !tableReady || panelStillOpen) {
        lastKey = "";
        stableSince = 0;
        return null;
      }

      const pageInfo = activePageInfo();
      const expectedPages = Math.max(1, Math.ceil(total / 200));
      if (total > 0 && (pageInfo.current < 1 || pageInfo.current > expectedPages)) {
        lastKey = "";
        stableSince = 0;
        return null;
      }

      // eBay sometimes leaves the account-wide Page x/y widget behind after a
      // Store category filter is applied. Derive the scan size from Results.
      const key = `${total}:${pageInfo.current}:${expectedPages}`;
      if (key !== lastKey) {
        lastKey = key;
        stableSince = Date.now();
        return null;
      }
      return Date.now() - stableSince >= 4000 ? total : null;
    }, timeoutMs, 250);
  }

  async function ensureCategoryFilterSelected() {
    if (MOVE99_SOURCE_STORE_CATEGORY_IDS.length) {
      const directUrlReady = await waitForStableFilteredResults(true, 30000);
      if (directUrlReady !== null) return directUrlReady;
    }

    // Use eBay's full right-side All filters workflow. The compact Categories
    // dropdown is a different UI and does not contain the See results panel.
    const allFiltersButton = await U.waitFor(() => {
      return [...document.querySelectorAll("button, [role='button']")].find((element) => {
        if (!U.isVisible(element)) return false;
        return isAllFiltersButtonText(element.innerText || element.textContent || "");
      }) || null;
    }, 20000, 250);
    if (!allFiltersButton) throw new Error("I could not find All filters on Active Listings.");
    clickElement(allFiltersButton);

    let filterPanel = await U.waitFor(findMove99FilterPanel, 10000, 180);
    if (!filterPanel) throw new Error("The All filters panel did not open.");

    // First screen: Filters → Categories.
    if (!findCheckboxNearExactText(MOVE99_SOURCE_CATEGORIES[0], filterPanel)) {
      const categoriesLabel = findExactWithin(filterPanel, "Categories");
      if (categoriesLabel) clickElement(clickableForTextElement(categoriesLabel));

      filterPanel = await U.waitFor(() => {
        const panel = findMove99FilterPanel();
        if (!panel) return null;
        const text = U.normalizeText(panel.innerText || panel.textContent || "");
        return text.includes("ebay categories") && text.includes("store categories") ? panel : null;
      }, 7000, 160);
      if (!filterPanel) throw new Error("The Categories section in All filters did not open.");
    }

    // Categories screen: expand Store categories to expose the account's
    // custom store-category checkboxes.
    if (!findCheckboxNearExactText(MOVE99_SOURCE_CATEGORIES[0], filterPanel)) {
      const storeCategoriesLabel = findExactWithin(filterPanel, "Store categories");
      if (!storeCategoriesLabel) throw new Error("I could not find Store categories inside the Categories panel.");
      clickElement(clickableForTextElement(storeCategoriesLabel));

      filterPanel = await U.waitFor(() => {
        const panel = findMove99FilterPanel();
        return panel && findCheckboxNearExactText(MOVE99_SOURCE_CATEGORIES[0], panel) ? panel : null;
      }, 7000, 160);
      if (!filterPanel) throw new Error(`Store categories opened, but “${MOVE99_SOURCE_CATEGORIES[0]}” did not appear.`);
    }

    let categoryChanged = false;
    for (const category of MOVE99_SOURCE_CATEGORIES) {
      const found = findCheckboxNearExactText(category, filterPanel);
      if (!found) throw new Error(`I could not find the Store category “${category}”.`);
      if (!controlChecked(found.control)) {
        clickElement(found.clickTarget || found.control);
        await U.waitFor(() => controlChecked(found.control), 2500, 120);
        categoryChanged = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const findSeeResults = (enabledOnly = false) => [...filterPanel.querySelectorAll("button, [role='button']")].find((element) => {
      return U.isVisible(element)
        && U.normalizeText(element.innerText || element.textContent || "") === "see results"
        && (!enabledOnly || (!element.disabled && element.getAttribute("aria-disabled") !== "true"));
    });
    const seeResults = await U.waitFor(() => findSeeResults(true) || null, categoryChanged ? 10000 : 1500, 150);
    if (!seeResults && !categoryChanged && findSeeResults(false)) {
      await closeMove99FilterPanel(filterPanel);
      const currentReady = await waitForStableFilteredResults(false, 60000);
      if (currentReady !== null) return currentReady;
      throw new Error("The already-selected source category did not produce stable filtered results.");
    }
    if (!seeResults) throw new Error("I selected the source categories but could not find an enabled See results button.");
    clickElement(seeResults);

    const filterTransition = await U.waitFor(() => {
      if (hasUnverifiableMove99SourceFilterUrl()) return "unverifiable";
      return findMove99FilterPanel() ? null : "closed";
    }, 15000, 180);
    if (filterTransition === "unverifiable") {
      throw new Error("eBay returned an unverifiable Store category filter instead of numeric category IDs. No category changes were attempted.");
    }

    const ready = await waitForStableFilteredResults(MOVE99_SOURCE_STORE_CATEGORY_IDS.length > 0, 60000);
    if (ready === null) throw new Error("The source category filter did not finish applying.");
    const remainingPanel = findMove99FilterPanel();
    if (remainingPanel) await closeMove99FilterPanel(remainingPanel);
    return ready;
  }

  function dispatchFullClick(target, fallbackLabel = null) {
    const element = target || fallbackLabel;
    if (!element) return false;
    const rectSource = typeof fallbackLabel === "object" && fallbackLabel?.getBoundingClientRect
      ? fallbackLabel
      : element;
    const rect = rectSource.getBoundingClientRect();
    const clientX = Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const clientY = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    element.scrollIntoView?.({ block: "center", inline: "center", behavior: "auto" });
    element.focus?.({ preventScroll: true });
    const base = { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 0, buttons: 1, view: window };
    try {
      if (typeof PointerEvent === "function") {
        element.dispatchEvent(new PointerEvent("pointerover", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        element.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        element.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
      }
    } catch (_) {}
    element.dispatchEvent(new MouseEvent("mouseover", base));
    element.dispatchEvent(new MouseEvent("mousedown", base));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    // Activate once. A synthetic click plus .click() toggles eBay dropdowns
    // open and immediately closed.
    try {
      element.click?.();
    } catch (_) {
      element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
    }
    return true;
  }

  function findEditListingsMenuItems() {
    const actionableSelector = 'button, a, li, [role="button"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])';
    const seenTargets = new Set();
    return [...document.querySelectorAll(actionableSelector)]
      .map((element) => {
        // Read text before visibility/layout checks so large Seller Hub pages do
        // not reflow thousands of unrelated nodes while this menu is opening.
        const text = (element.textContent || "").trim().replace(/\s+/g, " ");
        const allMatch = text.match(/^Edit all ([\d,]+) listings$/i);
        const chunkMatch = text.match(/^Edit listings ([\d,]+)\s*[-\u2012\u2013\u2014]\s*([\d,]+)$/i);
        if (!allMatch && !chunkMatch) return null;
        if (!U.isVisible(element)) return null;
        const start = chunkMatch ? Number(chunkMatch[1].replace(/,/g, "")) : 1;
        const end = chunkMatch ? Number(chunkMatch[2].replace(/,/g, "")) : Number(allMatch[1].replace(/,/g, ""));
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
        const target = element.closest(actionableSelector) || element;
        if (seenTargets.has(target)) return null;
        seenTargets.add(target);
        const actionable = target.matches('button, a, [role="button"], [role="menuitem"], [role="option"]') ? 0 : 1;
        return {
          element,
          label: element,
          target,
          text,
          rangeStart: start,
          rangeEnd: end,
          count: end - start + 1,
          chunked: Boolean(chunkMatch),
          actionable
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.actionable !== b.actionable) return a.actionable - b.actionable;
        if (a.chunked !== b.chunked) return a.chunked ? 1 : -1;
        return a.rangeStart - b.rangeStart;
      });
  }

  function findEditAllListingsMenuItem() {
    return findEditListingsMenuItems()[0] || null;
  }

  function findEditListingsRangeMenuItem(rangeStart, rangeEnd) {
    const start = Number(rangeStart || 0);
    const end = Number(rangeEnd || 0);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return null;
    return findEditListingsMenuItems().find((item) => {
      return item.rangeStart === start && item.rangeEnd === end;
    }) || null;
  }

  function findSavedBulkEditDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog')]
      .filter((element) => U.isVisible(element))
      .map((element) => ({
        element,
        text: U.normalizeText(element.innerText || element.textContent || ""),
        rect: element.getBoundingClientRect()
      }))
      .filter(({ text, rect }) => {
        return text.includes("want to complete your previous bulk edits")
          && text.includes("finish previous")
          && text.includes("continue")
          && rect.width >= 350
          && rect.height >= 150;
      })
      .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));
    return dialogs[0]?.element || null;
  }

  let savedBulkEditContinueInProgress = false;

  function currentBulkWorkspaceId() {
    try {
      return new URL(location.href).searchParams.get("workspaceId") || "";
    } catch (_) {
      return "";
    }
  }

  function findSavedBulkEditContinueButton() {
    // Prefer the exact Continue button and verify it belongs to the saved-draft
    // dialog by requiring nearby “Finish previous” and heading text. eBay can
    // render this modal several seconds after Edit all is clicked.
    const buttons = [...document.querySelectorAll('button, [role="button"], a')]
      .filter((element) => U.normalizeText(element.innerText || element.textContent || "") === "continue")
      .filter((element) => U.isVisible(element))
      .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");

    for (const button of buttons) {
      let container = button;
      for (let depth = 0; depth < 8 && container; depth += 1, container = container.parentElement) {
        const text = U.normalizeText(container.innerText || container.textContent || "");
        if (text.includes("want to complete your previous bulk edits")
            && text.includes("finish previous")
            && text.includes("continue")) {
          return { button, dialog: container };
        }
      }
    }

    const dialog = findSavedBulkEditDialog();
    if (!dialog) return null;
    const button = [...dialog.querySelectorAll('button, [role="button"], a')].find((element) => {
      return U.isVisible(element)
        && U.normalizeText(element.innerText || element.textContent || "") === "continue"
        && !element.disabled
        && element.getAttribute("aria-disabled") !== "true";
    });
    return button ? { button, dialog } : null;
  }

  async function clickSavedBulkEditContinueIfPresent() {
    if (savedBulkEditContinueInProgress) return false;
    const stored = await storageGet(["pendingMove99Run"]);
    const run = stored.pendingMove99Run;
    const runId = String(run?.runId || "");
    const eligiblePhase = ["bulk-editor", "bulk-editor-scan", "bulk-editor-range"].includes(String(run?.phase || ""));
    if (
      !run?.active
      || run.confirmed !== true
      || !runId
      || !eligiblePhase
      || String(run.extensionVersion || "") !== EXTENSION_VERSION
    ) return false;
    const claim = await runtimeMessage({ type: "claimMove99Tab", runId });
    if (!claim?.ok || !claim.owned || String(claim.runId || "") !== runId) return false;
    const found = findSavedBulkEditContinueButton();
    if (!found) return false;
    savedBulkEditContinueInProgress = true;
    try {
      const previousWorkspaceId = currentBulkWorkspaceId();
      renderStatus("Previous Bulk Edit draft found — clicking Continue…", "ready");
      found.button.scrollIntoView?.({ block: "center", inline: "center" });
      dispatchFullClick(found.button);
      const closed = await U.waitFor(() => !findSavedBulkEditDialog(), 12000, 150);
      if (!closed) {
        // One retry using the native click path. This still targets only the
        // verified Continue button inside the saved-draft dialog.
        try { HTMLElement.prototype.click.call(found.button); } catch (_) { found.button.click?.(); }
        await U.waitFor(() => !findSavedBulkEditDialog(), 12000, 150);
      }
      if (previousWorkspaceId) {
        const freshWorkspace = await U.waitFor(() => {
          const currentWorkspaceId = currentBulkWorkspaceId();
          return currentWorkspaceId && currentWorkspaceId !== previousWorkspaceId ? currentWorkspaceId : null;
        }, 30000, 250);
        if (!freshWorkspace) {
          throw new Error("eBay closed the previous-draft prompt but did not create a fresh Bulk Edit workspace. No listings were scanned or changed.");
        }
      }
      return true;
    } finally {
      savedBulkEditContinueInProgress = false;
    }
  }

  async function continuePastSavedBulkEditDialog(timeoutMs = 15000) {
    const started = Date.now();
    let bulkEditorSeenAt = 0;
    while (Date.now() - started < timeoutMs) {
      const found = findSavedBulkEditContinueButton();
      if (found) return clickSavedBulkEditContinueIfPresent();
      if (isMove99BulkEditorPage()) {
        if (!bulkEditorSeenAt) bulkEditorSeenAt = Date.now();
        // Large workspaces can render this prompt several seconds after the
        // URL changes. Do not scan rows while the page can still be replaced.
        if (Date.now() - bulkEditorSeenAt >= 6500) return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }

  async function runDiagnosticLogProbeFromUrl() {
    const url = new URL(location.href);
    if (
      url.searchParams.get("gldnF11Probe") !== "controlled-failure"
      || url.searchParams.get("gldnF11Confirm") !== "1"
    ) return false;

    const sessionKey = `gldn-f11-probe:${url.href}`;
    if (sessionStorage.getItem(sessionKey)) return false;
    sessionStorage.setItem(sessionKey, new Date().toISOString());

    const response = await runtimeMessage({
      type: "runDiagnosticLogProbe",
      confirm: "F11_CONTROLLED_FAILURE"
    });
    await storageSet({ lastDiagnosticLogProbe: { ...response, clipboardExported: false } });
    if (!response?.ok || !response?.entry) {
      renderStatus(
        `F-11 live diagnostic failed: ${response?.error || response?.message || "log readback was incomplete"}`,
        "error"
      );
      return true;
    }

    panel?.querySelector("[data-action='verify-f11-export']")?.remove();
    const verifyButton = document.createElement("button");
    verifyButton.type = "button";
    verifyButton.dataset.action = "verify-f11-export";
    verifyButton.className = "gldn-secondary";
    verifyButton.textContent = "Verify F-11 Diagnostic Export";
    statusElement?.before(verifyButton);
    renderStatus("F-11 log readback passed. Verify its diagnostic clipboard export.", "ready");

    verifyButton.addEventListener("click", async () => {
      verifyButton.disabled = true;
      let clipboardExported = false;
      let exportLength = 0;
      let exportError = "";
      let clipboardMethod = "";
      const exportText = JSON.stringify({
        type: "gldn-ops-f11-diagnostic-export",
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        marketplaceActions: 0,
        errorLog: [response.entry]
      }, null, 2);
      exportLength = exportText.length;
      try {
        await navigator.clipboard.writeText(exportText);
        clipboardExported = (await navigator.clipboard.readText()) === exportText;
        if (clipboardExported) clipboardMethod = "navigator-readback";
      } catch (error) {
        exportError = error?.message || String(error);
      }
      if (!clipboardExported) {
        try {
          const copyField = document.createElement("textarea");
          copyField.value = exportText;
          copyField.setAttribute("readonly", "");
          copyField.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
          document.documentElement.appendChild(copyField);
          copyField.focus();
          copyField.select();
          clipboardExported = document.execCommand("copy") === true;
          clipboardMethod = clipboardExported ? "trusted-exec-command" : "";
          copyField.remove();
        } catch (error) {
          exportError = [exportError, error?.message || String(error)].filter(Boolean).join("; ");
        }
      }
      const savedResult = { ...response, clipboardExported, clipboardMethod, exportLength, exportError };
      await storageSet({ lastDiagnosticLogProbe: savedResult });
      const saved = (await storageGet(["lastDiagnosticLogProbe"])).lastDiagnosticLogProbe;
      const passed = Boolean(
        saved?.ok === true
        && saved?.id === "F-11"
        && saved?.marketplaceActions === 0
        && saved?.probeId === response.probeId
        && saved?.entry?.operation === "f11-controlled-failure"
        && saved?.entry?.computerLabel
        && saved?.entry?.ebayAccountLabel
        && saved?.clipboardExported === true
        && saved?.exportLength > 0
      );
      renderStatus(
        passed
          ? "F-11 live diagnostic passed: controlled failure log and clipboard export verified; no marketplace action ran."
          : `F-11 live diagnostic failed: ${exportError || "log or export readback was incomplete"}`,
        passed ? "completed" : "error"
      );
      if (passed) verifyButton.remove();
      else verifyButton.disabled = false;
    });
    return true;
  }

  async function runDashboardQueueProbeFromUrl() {
    const url = new URL(location.href);
    if (
      url.searchParams.get("gldnF09Probe") !== "queue-timeout"
      || url.searchParams.get("gldnF09Confirm") !== "1"
    ) return false;

    const sessionKey = `gldn-f09-probe:${url.href}`;
    if (sessionStorage.getItem(sessionKey)) return false;
    sessionStorage.setItem(sessionKey, new Date().toISOString());
    renderStatus("F-09: forcing one harmless dashboard timeout and verifying queue recovery...", "ready");

    const response = await runtimeMessage({
      type: "runDashboardQueueProbe",
      confirm: "F09_QUEUE_TIMEOUT_RETRY"
    }, 45000);
    renderStatus(
      response?.ok
        ? `F-09 live queue passed: ${response.queuedAfterFailure} queued, ${response.queuedAfterDuplicate} after duplicate, ${response.retryProcessed} retried, ${response.finalQueueCount} remaining; no marketplace action ran.`
        : `F-09 live queue stopped safely: ${response?.error || response?.message || "queue recovery was incomplete"}`,
      response?.ok ? "completed" : "error"
    );
    return true;
  }

  function installSavedBulkEditDialogWatcher() {
    let observerTimer = 0;
    let interval = 0;
    let watching = false;
    const eligible = (run) => Boolean(
      run?.active
      && run.confirmed === true
      && run.runId
      && String(run.extensionVersion || "") === EXTENSION_VERSION
      && ["bulk-editor", "bulk-editor-scan", "bulk-editor-range"].includes(String(run.phase || ""))
    );
    const inspect = async () => {
      try {
        const state = await storageGet(["pendingMove99Run"]);
        if (!eligible(state.pendingMove99Run)) return;
        if (findSavedBulkEditContinueButton()) await clickSavedBulkEditContinueIfPresent();
      } catch (error) {
        if (invalidContextError(error)) shutdownInvalidatedContext(error);
      }
    };
    const observer = new MutationObserver(() => {
      if (!watching) return;
      clearTimeout(observerTimer);
      observerTimer = setTimeout(inspect, 300);
    });
    const stopWatching = () => {
      watching = false;
      observer.disconnect();
      clearInterval(interval);
      interval = 0;
      clearTimeout(observerTimer);
    };
    const syncWatcher = (run) => {
      if (!eligible(run)) {
        stopWatching();
        return;
      }
      if (watching) return;
      watching = true;
      observer.observe(document.documentElement, { childList: true, subtree: true });
      // Mutation notifications can be coalesced on eBay's virtualized editor,
      // so poll only while this exact confirmed run owns a Bulk Edit phase.
      interval = setInterval(inspect, 750);
      inspect();
    };
    const storageListener = (changes, areaName) => {
      if (areaName === "local" && changes.pendingMove99Run) syncWatcher(changes.pendingMove99Run.newValue);
    };
    chrome.storage.onChanged.addListener(storageListener);
    storageGet(["pendingMove99Run"])
      .then((state) => syncWatcher(state.pendingMove99Run))
      .catch((error) => {
        if (invalidContextError(error)) shutdownInvalidatedContext(error);
      });
    savedBulkEditCleanup = () => {
      stopWatching();
      try { chrome.storage.onChanged.removeListener(storageListener); } catch (_) {}
    };
    window.addEventListener("beforeunload", () => {
      savedBulkEditCleanup?.();
      savedBulkEditCleanup = null;
    }, { once: true });
  }

  function bulkEditorNavigationProgressed() {
    if (isMove99BulkEditorPage()) return true;
    const signals = document.querySelectorAll("h1, h2, [role='status'], [aria-live]");
    for (const element of signals) {
      const text = U.normalizeText(element.textContent || "");
      if (text.includes("listings processed") || text.includes("revise listings")) return true;
    }
    return false;
  }

  async function openAllFilteredListingsInBulkEditor(filteredCount, currentState = {}) {
    const editButton = await U.waitFor(() => {
      return [...document.querySelectorAll('button, [role="button"]')].find((element) => {
        const text = U.normalizeText(element.innerText || element.textContent || "");
        return text === "edit"
          && U.isVisible(element)
          && !element.disabled
          && element.getAttribute("aria-disabled") !== "true";
      }) || null;
    }, 10000, 180);
    if (!editButton) throw new Error("I could not find the Edit dropdown after filtering.");
    clickElement(editButton);

    const requestedRangeStart = Math.max(1, Number(currentState.directRangeStart || 1));
    const item = await U.waitFor(() => {
      const items = findEditListingsMenuItems();
      if (!items.length) return null;
      if (requestedRangeStart === 1) return items.find((entry) => entry.rangeStart === 1) || items[0];
      return items.find((entry) => entry.rangeStart === requestedRangeStart) || null;
    }, 8000, 150);
    if (!item) {
      const available = findEditListingsMenuItems().map((entry) => entry.text);
      const detail = available.length ? ` Available ranges: ${available.join(" | ")}.` : "";
      throw new Error(`The Edit menu did not offer a range starting at ${requestedRangeStart.toLocaleString()}.${detail}`);
    }

    const editAllText = (item.label.innerText || item.label.textContent || "").trim();
    const allMatch = editAllText.match(/Edit all\s+([\d,]+)\s+listings/i);
    const rangeMatch = editAllText.match(/Edit listings\s+([\d,]+)\s*[-\u2012\u2013\u2014]\s*([\d,]+)/i);
    const parsedCount = rangeMatch
      ? Number(rangeMatch[2].replace(/,/g, "")) - Number(rangeMatch[1].replace(/,/g, "")) + 1
      : Number((allMatch?.[1] || "0").replace(/,/g, ""));
    const actualFilteredCount = parsedCount || (filteredCount > 0 ? filteredCount : 0);
    const rangeStart = rangeMatch ? Number(rangeMatch[1].replace(/,/g, "")) : 1;
    const rangeEnd = rangeMatch ? Number(rangeMatch[2].replace(/,/g, "")) : actualFilteredCount;

    await storageSet({
      pendingMove99Run: {
        ...currentState,
        active: true,
        confirmed: true,
        phase: "bulk-editor-scan",
        scanStrategy: MOVE99_SCAN_STRATEGY,
        applyStrategy: MOVE99_DIRECT_APPLY_STRATEGY,
        selectionSource: "bulk-editor-price-scan",
        startedAt: currentState.startedAt || new Date().toISOString(),
        filteredCount: Number(filteredCount || actualFilteredCount),
        currentEditRange: {
          rangeStart,
          rangeEnd,
          rangeCount: actualFilteredCount
        },
        sourceCategories: asStringArray(currentState.sourceCategories).length ? asStringArray(currentState.sourceCategories) : MOVE99_SOURCE_CATEGORIES,
        destinationCategory: currentState.destinationCategory || MOVE99_DESTINATION_CATEGORY,
        bulkScanStartedAt: new Date().toISOString()
      }
    });

    // Do not navigate to the href directly. eBay's visible menu link points to
    // an internal route that only works after eBay's click handler creates a
    // Bulk Edit workspace. Directly loading that href produces “Cannot GET”.
    const primaryTarget = item.target.closest?.('a, button, [role="menuitem"], [role="option"], li') || item.target;
    primaryTarget.scrollIntoView?.({ block: "center", inline: "center" });
    primaryTarget.focus?.({ preventScroll: true });
    try {
      HTMLElement.prototype.click.call(primaryTarget);
    } catch (_) {
      primaryTarget.click?.();
    }

    // eBay may interrupt with a saved-draft choice. The correct action for this
    // workflow is Continue, which discards the older incomplete draft and opens
    // the newly filtered listings.
    await continuePastSavedBulkEditDialog();

    const progressed = await U.waitFor(bulkEditorNavigationProgressed, 45000, 300);
    if (progressed) return;

    // Retry once using the element physically beneath the center of the menu
    // row. This preserves eBay's JavaScript click flow and never loads the raw
    // internal href ourselves.
    const currentItem = requestedRangeStart === 1
      ? (findEditListingsMenuItems().find((entry) => entry.rangeStart === 1) || item)
      : (findEditListingsRangeMenuItem(requestedRangeStart, rangeEnd) || item);
    const rect = currentItem.label.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const hitTarget = hit?.closest?.('a, button, li, [role="menuitem"], [role="option"], [tabindex]') || hit;
    if (hitTarget) {
      hitTarget.scrollIntoView?.({ block: "center", inline: "center" });
      hitTarget.focus?.({ preventScroll: true });
      try {
        HTMLElement.prototype.click.call(hitTarget);
      } catch (_) {
        hitTarget.click?.();
      }
      await continuePastSavedBulkEditDialog();
    }

    const retryProgressed = await U.waitFor(bulkEditorNavigationProgressed, 45000, 300);
    if (!retryProgressed) {
      await storageSet({ pendingMove99Run: null });
      throw new Error(`eBay did not create the Bulk Edit workspace after clicking ${editAllText} twice.`);
    }
  }

  async function openFilteredListingRangeInBulkEditor(range, currentState = {}) {
    const rangeStart = Number(range?.rangeStart || 0);
    const rangeEnd = Number(range?.rangeEnd || 0);
    const rangeCount = Number(range?.rangeCount || (rangeEnd - rangeStart + 1));
    const targetIds = [...new Set((range?.targetIds || []).map(String).filter(Boolean))];
    if (!rangeStart || rangeEnd < rangeStart || rangeCount !== rangeEnd - rangeStart + 1) {
      throw new Error("The saved eBay edit range is invalid. No category changes were attempted.");
    }
    if (!targetIds.length || targetIds.length > rangeCount || rangeCount > MOVE99_EDIT_RANGE_LIMIT) {
      throw new Error("The saved eBay edit range does not contain a safe exact-ID batch. No category changes were attempted.");
    }

    const editButton = await U.waitFor(() => {
      return [...document.querySelectorAll('button, [role="button"]')].find((element) => {
        const text = U.normalizeText(element.innerText || element.textContent || "");
        return text === "edit"
          && U.isVisible(element)
          && !element.disabled
          && element.getAttribute("aria-disabled") !== "true";
      }) || null;
    }, 10000, 180);
    if (!editButton) throw new Error("I could not find eBay's Edit dropdown for the saved 2,000-listing range.");
    dispatchFullClick(editButton);

    let item = await U.waitFor(() => findEditListingsRangeMenuItem(rangeStart, rangeEnd), 10000, 250);
    if (!item) {
      const available = findEditListingsMenuItems().map((entry) => entry.text);
      const detail = available.length ? ` Available ranges: ${available.join(" | ")}.` : "";
      throw new Error(`eBay did not offer the exact Edit listings ${rangeStart.toLocaleString()} - ${rangeEnd.toLocaleString()} range.${detail}`);
    }

    const rangeState = {
      ...currentState,
      active: true,
      confirmed: true,
      phase: "bulk-editor-range",
      selectionSource: "saved-id-range",
      currentBatchIds: targetIds,
      currentBatchCount: targetIds.length,
      currentBatchSourceCount: targetIds.length,
      currentEditRange: {
        rangeStart,
        rangeEnd,
        rangeCount,
        targetIds
      },
      currentBatchKey: `${currentState.runId || currentState.startedAt || "move99"}:range:${rangeStart}-${rangeEnd}`
    };
    await storageSet({ pendingMove99Run: rangeState });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const target = item.target.closest?.('a, button, [role="menuitem"], [role="option"], li') || item.target;
      target.scrollIntoView?.({ block: "center", inline: "center" });
      target.focus?.({ preventScroll: true });
      try {
        HTMLElement.prototype.click.call(target);
      } catch (_) {
        target.click?.();
      }
      await continuePastSavedBulkEditDialog();

      const progressed = await U.waitFor(() => {
        if (isMove99BulkEditorPage()) return true;
        const body = U.normalizeText(document.body?.textContent || "");
        return body.includes("listings processed") || body.includes("revise listings") ? true : null;
      }, 45000, 250);
      if (progressed) return rangeState;

      if (attempt < 2) {
        dispatchFullClick(editButton);
        item = await U.waitFor(() => findEditListingsRangeMenuItem(rangeStart, rangeEnd), 6000, 250);
        if (!item) break;
      }
    }
    throw new Error(`eBay did not open Bulk Edit for listings ${rangeStart.toLocaleString()} - ${rangeEnd.toLocaleString()}.`);
  }

  function parseProcessedProgress() {
    const candidates = document.querySelectorAll("[role='status'], [aria-live]");
    for (const candidate of candidates) {
      const text = String(candidate.innerText || candidate.textContent || "");
      const match = text.match(/([\d,]+)\s+of\s+([\d,]+)\s+listings processed/i);
      if (match) {
        return {
          processed: Number(match[1].replace(/,/g, "")),
          total: Number(match[2].replace(/,/g, ""))
        };
      }
    }
    return null;
  }

  function bulkEditorOmittedNoticeCount() {
    const candidates = document.querySelectorAll("[role='dialog'], dialog, [role='status'], [role='alert'], [aria-live]");
    for (const candidate of candidates) {
      const match = String(candidate.textContent || "").match(
        /([\d,]+)\s+listings?\s+(?:was|were)\s+not processed\s+(?:due to policy violations|because of (?:a )?failure)/i
      );
      if (match) return Number(match[1].replace(/,/g, ""));
    }
    return 0;
  }

  function parseBulkEditorSubmitTotal() {
    const controls = [...document.querySelectorAll("button, [role='button']")];
    const visible = controls.filter((control) => U.isVisible(control));
    for (const control of [...visible, ...controls]) {
      const text = String(control.innerText || control.textContent || control.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim();
      const match = text.match(/^submit\s*\(([\d,]+)\)$/i);
      if (match) return Number(match[1].replace(/,/g, ""));
    }
    return 0;
  }

  function nativeBulkSelectionSummary() {
    const exact = /^\s*([\d,]+)\s+of\s+([\d,]+)\s+item\(s\)\s+selected\s*$/i;
    const candidates = [
      ...document.querySelectorAll(".app-summary__bottom"),
      ...document.querySelectorAll("[role='status'], [aria-live]")
    ];
    for (const candidate of candidates) {
      const match = String(candidate.textContent || "").match(exact);
      if (!match) continue;
      return {
        selected: Number(match[1].replace(/,/g, "")),
        total: Number(match[2].replace(/,/g, "")),
        source: "ebay-selection-summary"
      };
    }
    return null;
  }

  function listingPriceParts(raw) {
    const cleaned = String(raw ?? "")
      .trim()
      .replace(/\bUS\b/gi, "")
      .replace(/[$,\s]/g, "");
    const match = cleaned.match(/^(\d+(?:\.\d{1,2})?)(?:(?:-|\u2013|\u2014|to)(\d+(?:\.\d{1,2})?))?$/i);
    return match ? [match[1], match[2]].filter(Boolean) : [];
  }

  function priceEndsIn99(raw) {
    const prices = listingPriceParts(raw);
    return prices.length > 0 && prices.every((price) => {
      const match = price.match(/^\d+\.(\d{1,2})$/);
      return Boolean(match) && match[1].padEnd(2, "0") === "99";
    });
  }

  function isAllFiltersButtonText(raw) {
    // normalizeText strips punctuation, so "All filters (1)" becomes
    // "all filters 1" before this matcher runs.
    return /^all filters(?:\s+\d+)?$/.test(U.normalizeText(raw));
  }

  async function closeMove99FilterPanel(panel) {
    const close = panel?.querySelector('button[aria-label="Close" i], button[title="Close" i]')
      || findExactWithin(panel, "×", "button, [role='button'], span")
      || findExactWithin(panel, "Close", "button, [role='button'], span");
    if (!close) throw new Error("The category filter was ready, but its Close button was not available.");
    clickElement(clickableForTextElement(close));
    await U.waitFor(() => !findMove99FilterPanel(), 5000, 120);
  }

  function hasValidListingPrice(raw) {
    return listingPriceParts(raw).length > 0;
  }

  function findRowForInput(input) {
    return input.closest("tr, [role='row']") || (() => {
      let node = input.parentElement;
      for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
        if (node.querySelector?.('input[type="checkbox"], [role="checkbox"]') && node.querySelectorAll?.("input").length >= 2) return node;
      }
      return null;
    })();
  }

  function findRowCheckbox(row) {
    if (!row) return null;
    return [...row.querySelectorAll('input[type="checkbox"], [role="checkbox"]')].find((control) => {
      if (control.disabled || control.getAttribute("aria-disabled") === "true") return false;
      return true;
    }) || null;
  }

  function bulkEditorRowItemIdCandidates(row) {
    const candidates = [];
    const seen = new Set();
    const addMatches = (value) => {
      for (const match of String(value || "").matchAll(/\b\d{11,14}\b/g)) {
        const itemId = match[0];
        if (seen.has(itemId)) continue;
        seen.add(itemId);
        candidates.push(itemId);
      }
    };
    if (!row) return candidates;

    const attributes = ["data-item-id", "data-itemid", "data-listing-id", "data-listingid", "data-row-key", "id"];
    const identityNodes = [
      row,
      ...row.querySelectorAll('[data-item-id], [data-itemid], [data-listing-id], [data-listingid], [data-row-key], a[href], input[id], input[name], [aria-label]')
    ];
    for (const element of identityNodes) {
      for (const name of attributes) addMatches(element.getAttribute?.(name));
      addMatches(element.getAttribute?.("href"));
      addMatches(element.getAttribute?.("name"));
      addMatches(element.getAttribute?.("aria-label"));
      if (element.matches?.('input[type="checkbox"], [role="checkbox"]')) addMatches(element.getAttribute?.("value"));
    }

    // Some Bulk Edit builds expose the item number only in visually-hidden row
    // text. It remains an exact eBay item ID and is preferable to title matching.
    addMatches(row.innerText || row.textContent || "");
    return candidates;
  }

  function bulkEditorRowItemId(row, targetIds = null) {
    const candidates = bulkEditorRowItemIdCandidates(row);
    if (targetIds instanceof Set) {
      const exact = candidates.find((itemId) => targetIds.has(itemId));
      if (exact) return exact;
    }
    return candidates[0] || "";
  }

  function rowSignature(row, targetIds = null) {
    if (!row) return "";
    const itemId = bulkEditorRowItemId(row, targetIds);
    if (itemId) return `item:${itemId}`;

    // Use only identifiers that are likely to be unique per listing. Generic
    // test IDs are intentionally excluded because virtual rows often share them.
    const attributes = ["data-row-key", "data-item-id", "data-listing-id", "data-id", "id"];
    for (const name of attributes) {
      const value = String(row.getAttribute?.(name) || "").trim();
      if (value && value.length > 4 && !/^(row|item|listing)[-_]?\d?$/i.test(value)) return `${name}:${value}`;
    }

    const draftCheckboxId = findRowCheckbox(row)?.id;
    if (/^draft-checkbox-/i.test(String(draftCheckboxId || ""))) return `draft:${draftCheckboxId}`;

    const sku = row.querySelector('input[aria-labelledby="customLabel"], input[name*="sku" i], input[aria-label*="sku" i]')?.value;
    if (sku) return `sku:${String(sku).trim()}`;

    const title = row.querySelector('textarea[aria-labelledby="itemTitle"], input[aria-labelledby="itemTitle"], input[aria-label*="title" i], textarea[aria-label*="title" i]')?.value;
    if (title) return `title:${U.normalizeText(title).slice(0, 140)}`;

    return `row:${U.normalizeText(row.innerText || row.textContent || "").slice(0, 260)}`;
  }

  const bulkEditorPriceColumnCache = new WeakMap();

  function bulkEditorBuyItNowColumnIndex(row) {
    const table = row?.closest?.("table");
    if (!table) return -1;
    if (bulkEditorPriceColumnCache.has(table)) return bulkEditorPriceColumnCache.get(table);
    const headers = [...table.querySelectorAll("thead th, thead [role='columnheader']")];
    const index = headers.findIndex((header) => U.normalizeText(header.innerText || header.textContent).includes("buy it now"));
    bulkEditorPriceColumnCache.set(table, index);
    return index;
  }

  function findBuyItNowPriceInput(row) {
    if (!row) return null;
    const inputs = [...row.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')]
      .filter((input) => !input.disabled && input.getAttribute("aria-disabled") !== "true")
      .filter((input) => /^\s*\$?\s*-?\d[\d,]*(?:\.\d{1,2})?\s*$/.test(String(input.value || "")));

    const preferred = inputs.find((input) => {
      const metadata = U.normalizeText([
        input.getAttribute("aria-label"),
        input.getAttribute("name"),
        input.getAttribute("data-testid"),
        input.closest("td, [role='gridcell']")?.getAttribute?.("aria-label")
      ].filter(Boolean).join(" "));
      return metadata.includes("buy it now") || metadata.includes("current price") || metadata.includes("price");
    });
    if (preferred) return preferred;

    // Quantity fields are normally integers. Prefer a decimal-valued field,
    // which is the Buy It Now price in eBay's current bulk editor.
    const decimal = inputs.find((input) => /\.\d{1,2}\s*$/.test(String(input.value || "").trim()));
    if (decimal) return decimal;

    // Variation listings expose their Buy It Now value as a range in the
    // price grid cell (for example, "$10.99 - $28.99") instead of an input.
    const priceColumnIndex = bulkEditorBuyItNowColumnIndex(row);
    const cells = row.cells?.length
      ? [...row.cells]
      : [...row.querySelectorAll(":scope > td, :scope > [role='gridcell']")];
    const priceCell = priceColumnIndex >= 0 ? cells[priceColumnIndex] : null;
    const priceText = String(priceCell?.innerText || priceCell?.textContent || "").trim();
    return hasValidListingPrice(priceText) ? { value: priceText, source: "variation-range" } : null;
  }

  function bulkEditorTableWrapper() {
    const wrappers = [...document.querySelectorAll(".table-wrapper")]
      .filter((element) => element.querySelector("tbody tr, [role='rowgroup'] [role='row']"));
    if (!wrappers.length) return null;
    return wrappers.find((element) => element.querySelector(".bg-intersection-observer"))
      || wrappers.sort((a, b) => b.querySelectorAll("tbody tr").length - a.querySelectorAll("tbody tr").length)[0];
  }

  function bulkEditorRawRowCount(preferredWrapper = null) {
    const wrapper = preferredWrapper && preferredWrapper.isConnected !== false
      ? preferredWrapper
      : bulkEditorTableWrapper();
    if (!wrapper) return 0;
    const tableBody = wrapper.querySelector("tbody");
    const tableRows = Number(tableBody?.rows?.length || 0)
      || Number(tableBody?.children?.length || 0);
    if (tableRows) return tableRows;
    return wrapper.querySelectorAll("[role='rowgroup'] [role='row']").length;
  }

  function renderedBulkRows({ visibleOnly = false } = {}) {
    const root = bulkEditorTableWrapper() || document;
    const candidateRows = [...root.querySelectorAll("tbody tr, [role='rowgroup'] [role='row']")];
    const rows = [];
    const seen = new Set();
    for (const row of candidateRows) {
      if (!row || seen.has(row)) continue;
      const control = findRowCheckbox(row);
      if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") continue;
      if (visibleOnly && !U.isVisible(control)) continue;
      const priceInput = findBuyItNowPriceInput(row);
      if (!priceInput) continue;
      seen.add(row);
      rows.push({ row, checkbox: control, priceInput });
    }
    if (rows.length || root !== document) return rows;

    // Older Bulk Edit builds do not expose a semantic table. Retain the
    // checkbox-based fallback, scoped to those builds only.
    for (const control of document.querySelectorAll('input[type="checkbox"], [role="checkbox"]')) {
      if (control.disabled || control.getAttribute("aria-disabled") === "true") continue;
      if (visibleOnly && !U.isVisible(control)) continue;
      const row = control.closest("tr, [role='row']") || findRowForInput(control);
      if (!row || seen.has(row)) continue;
      const priceInput = findBuyItNowPriceInput(row);
      if (!priceInput) continue;
      seen.add(row);
      rows.push({ row, checkbox: findRowCheckbox(row) || control, priceInput });
    }
    return rows;
  }

  async function renderedBulkRowsCooperatively({ visibleOnly = false, chunkSize = 10 } = {}) {
    const root = bulkEditorTableWrapper() || document;
    const candidateRows = [...root.querySelectorAll("tbody tr, [role='rowgroup'] [role='row']")];
    const rows = [];
    const seen = new Set();
    const yieldEvery = Math.max(1, Number(chunkSize) || 20);

    for (let index = 0; index < candidateRows.length; index += 1) {
      if (index > 0 && index % yieldEvery === 0) {
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      const row = candidateRows[index];
      if (!row || seen.has(row)) continue;
      const control = findRowCheckbox(row);
      if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") continue;
      if (visibleOnly && !U.isVisible(control)) continue;
      const priceInput = findBuyItNowPriceInput(row);
      if (!priceInput) continue;
      seen.add(row);
      rows.push({ row, checkbox: control, priceInput });
    }
    if (rows.length || root !== document) return rows;

    const controls = [...document.querySelectorAll('input[type="checkbox"], [role="checkbox"]')];
    for (let index = 0; index < controls.length; index += 1) {
      if (index > 0 && index % yieldEvery === 0) {
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      const control = controls[index];
      if (control.disabled || control.getAttribute("aria-disabled") === "true") continue;
      if (visibleOnly && !U.isVisible(control)) continue;
      const row = control.closest("tr, [role='row']") || findRowForInput(control);
      if (!row || seen.has(row)) continue;
      const priceInput = findBuyItNowPriceInput(row);
      if (!priceInput) continue;
      seen.add(row);
      rows.push({ row, checkbox: findRowCheckbox(row) || control, priceInput });
    }
    return rows;
  }

  function normalizedMove99BatchTitle(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 160);
  }

  function move99BatchFingerprint(record) {
    const price = Number(String(record?.price ?? "").replace(/[$,\s]/g, ""));
    const title = normalizedMove99BatchTitle(record?.title);
    if (!Number.isFinite(price) || !title) return "";
    return `${Math.round(price * 100)}:${title}`;
  }

  function bulkEditorRowRecord(row, priceInput = null) {
    const titleControl = row?.querySelector?.(
      'textarea[aria-labelledby="itemTitle"], input[aria-labelledby="itemTitle"], input[aria-label*="title" i], textarea[aria-label*="title" i]'
    );
    const resolvedPrice = priceInput || findBuyItNowPriceInput(row);
    const record = {
      title: String(titleControl?.value || "").trim(),
      price: String(resolvedPrice?.value || "").trim()
    };
    return { ...record, fingerprint: move99BatchFingerprint(record) };
  }

  function buildMove99RangeFingerprintPlan(range) {
    const rangeCount = Number(range?.rangeCount || 0);
    const rangeRecords = Array.isArray(range?.rangeRecords) ? range.rangeRecords : [];
    const targetRecords = Array.isArray(range?.targetRecords) ? range.targetRecords : [];
    const targetIds = (range?.targetIds || []).map(String).filter(Boolean);
    if (!rangeCount || rangeRecords.length !== rangeCount) {
      throw new Error("Safety stop: the saved edit range does not contain one title/price record for every listing. No category changes were attempted.");
    }
    if (!targetIds.length || targetRecords.length !== targetIds.length) {
      throw new Error("Safety stop: the saved edit range target records are incomplete. No category changes were attempted.");
    }

    const rangeIds = new Set();
    const expectedByFingerprint = new Map();
    for (const record of rangeRecords) {
      const itemId = String(record?.itemId || "");
      const fingerprint = move99BatchFingerprint(record);
      if (!itemId || rangeIds.has(itemId) || !fingerprint) {
        throw new Error("Safety stop: the saved edit range contains a missing, duplicate, or unreadable listing fingerprint. No category changes were attempted.");
      }
      rangeIds.add(itemId);
      const queue = expectedByFingerprint.get(fingerprint) || [];
      queue.push({ ...record, itemId, fingerprint });
      expectedByFingerprint.set(fingerprint, queue);
    }

    const targetByFingerprint = new Map();
    const targetRecordIds = [];
    for (const record of targetRecords) {
      const itemId = String(record?.itemId || "");
      const fingerprint = move99BatchFingerprint(record);
      if (!itemId || !rangeIds.has(itemId) || !fingerprint) {
        throw new Error("Safety stop: a saved target is missing from its verified edit range. No category changes were attempted.");
      }
      targetRecordIds.push(itemId);
      const queue = targetByFingerprint.get(fingerprint) || [];
      queue.push({ ...record, itemId, fingerprint });
      targetByFingerprint.set(fingerprint, queue);
    }
    if (targetRecordIds.join("|") !== targetIds.join("|")) {
      throw new Error("Safety stop: the saved target fingerprints no longer match the verified item-number order. No category changes were attempted.");
    }

    const ambiguousFingerprints = [];
    for (const [fingerprint, records] of targetByFingerprint) {
      const expected = expectedByFingerprint.get(fingerprint) || [];
      if (records.length !== expected.length) ambiguousFingerprints.push(fingerprint);
    }
    if (ambiguousFingerprints.length) {
      throw new Error(
        `Safety stop: ${ambiguousFingerprints.length.toLocaleString()} title/price fingerprint${ambiguousFingerprints.length === 1 ? "" : "s"} mix qualifying and non-qualifying listings, so eBay's ID-free Bulk Edit rows cannot be selected safely. No category changes were attempted.`
      );
    }

    return {
      rangeCount,
      targetIds,
      targetIdSet: new Set(targetIds),
      expectedByFingerprint,
      targetByFingerprint
    };
  }

  function currentMove99BatchRecords(state) {
    const targetIds = new Set((state?.currentBatchIds || []).map(String));
    const sourcePages = state?.applySourcePages || state?.scanPages || {};
    return flattenMove99Pages(sourcePages)
      .filter((record) => targetIds.has(String(record.itemId)))
      .map((record) => ({ ...record, fingerprint: move99BatchFingerprint(record) }));
  }

  function reconcileBulkWorkspaceBatch(state, bulkRecords, expectedCount) {
    const expectedRecords = currentMove99BatchRecords(state);
    if (expectedRecords.length !== expectedCount || expectedRecords.some((record) => !record.fingerprint)) {
      throw new Error("Safety stop: the saved listing fingerprints for this batch are incomplete. No category changes were attempted.");
    }

    const expectedByFingerprint = new Map();
    for (const record of expectedRecords) {
      const queue = expectedByFingerprint.get(record.fingerprint) || [];
      queue.push(record);
      expectedByFingerprint.set(record.fingerprint, queue);
    }

    for (const record of bulkRecords) {
      const queue = expectedByFingerprint.get(record.fingerprint);
      if (!record.fingerprint || !queue?.length) {
        throw new Error(`Safety stop: eBay Bulk Edit contains a row that is not in the saved ${move99WorkflowLabel()} batch. No category changes were attempted.`);
      }
      queue.shift();
    }

    const omittedRecords = [...expectedByFingerprint.values()].flat();
    return {
      admittedCount: bulkRecords.length,
      omittedCount: omittedRecords.length,
      omittedIds: omittedRecords.map((record) => String(record.itemId))
    };
  }

  function makeElementScroller(element, label) {
    return {
      kind: label || "element",
      element,
      getTop: () => Number(element.scrollTop || 0),
      setTop: (value) => {
        const top = Math.max(0, Number(value || 0));
        try { element.scrollTo?.({ top, behavior: "auto" }); } catch (_) {}
        try { element.scrollTop = top; } catch (_) {}
        try { element.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
      },
      getMax: () => Math.max(0, Number(element.scrollHeight || 0) - Number(element.clientHeight || 0)),
      getViewport: () => Math.max(300, Number(element.clientHeight || 0)),
      nudge: (delta) => {
        const next = Math.max(0, Math.min(Math.max(0, Number(element.scrollHeight || 0) - Number(element.clientHeight || 0)), Number(element.scrollTop || 0) + delta));
        try { element.scrollTo?.({ top: next, behavior: "auto" }); } catch (_) {}
        try { element.scrollTop = next; } catch (_) {}
        try { element.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
        try { element.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, bubbles: true, cancelable: true })); } catch (_) {}
      }
    };
  }

  function makeDocumentScroller() {
    const scrolling = document.scrollingElement || document.documentElement;
    return {
      kind: "document",
      element: scrolling,
      getTop: () => Number(window.scrollY || scrolling.scrollTop || document.documentElement.scrollTop || 0),
      setTop: (value) => {
        const top = Math.max(0, Number(value || 0));
        try { window.scrollTo({ top, behavior: "auto" }); } catch (_) { window.scrollTo(0, top); }
        try { scrolling.scrollTop = top; } catch (_) {}
        try { document.documentElement.scrollTop = top; } catch (_) {}
        try { document.body.scrollTop = top; } catch (_) {}
        try { window.dispatchEvent(new Event("scroll")); } catch (_) {}
      },
      getMax: () => Math.max(
        0,
        Number(scrolling.scrollHeight || 0),
        Number(document.documentElement.scrollHeight || 0),
        Number(document.body?.scrollHeight || 0)
      ) - Math.max(300, Number(window.innerHeight || 0)),
      getViewport: () => Math.max(300, Number(window.innerHeight || 0)),
      nudge: (delta) => {
        try { window.scrollBy({ top: delta, behavior: "auto" }); } catch (_) { window.scrollBy(0, delta); }
        try { window.dispatchEvent(new Event("scroll")); } catch (_) {}
        try { window.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, bubbles: true, cancelable: true })); } catch (_) {}
      }
    };
  }

  function findBulkEditorScrollCandidates() {
    const seedRows = renderedBulkRows();
    const seedRow = seedRows[0]?.row || null;
    const candidates = [];

    let node = seedRow?.parentElement || null;
    for (let depth = 0; node && depth < 20; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 };
      const range = Number(node.scrollHeight || 0) - Number(node.clientHeight || 0);
      if (range > 80 && rect.width > 450 && rect.height > 180) candidates.push(node);
    }

    for (const element of document.querySelectorAll('div, section, main, article, [role="grid"], [role="table"]')) {
      if (!U.isVisible(element)) continue;
      if (seedRow && !element.contains(seedRow)) continue;
      const rect = element.getBoundingClientRect();
      const range = Number(element.scrollHeight || 0) - Number(element.clientHeight || 0);
      if (range <= 80 || rect.width < 450 || rect.height < 180) continue;
      candidates.push(element);
    }

    for (const element of document.querySelectorAll('div, section, main, article, table, tbody, [role="grid"], [role="table"], [role="rowgroup"]')) {
      if (!U.isVisible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 350 || rect.height < 120) continue;
      const text = U.normalizeText(element.innerText || element.textContent || "");
      if (!text.includes("buy it now") && !text.includes("store category") && !text.includes("item category")) continue;
      candidates.push(element);
      let parent = element.parentElement;
      for (let depth = 0; parent && depth < 8; depth += 1, parent = parent.parentElement) {
        const parentRect = parent.getBoundingClientRect?.() || { width: 0, height: 0 };
        if (parentRect.width >= 350 && parentRect.height >= 120) candidates.push(parent);
      }
    }

    const unique = [...new Set(candidates)]
      .filter((element) => element !== document.body && element !== document.documentElement)
      .sort((a, b) => {
        const aRange = Math.max(0, Number(a.scrollHeight || 0) - Number(a.clientHeight || 0));
        const bRange = Math.max(0, Number(b.scrollHeight || 0) - Number(b.clientHeight || 0));
        const aRows = a.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length;
        const bRows = b.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length;
        const aArea = (a.getBoundingClientRect?.().width || 0) * (a.getBoundingClientRect?.().height || 0);
        const bArea = (b.getBoundingClientRect?.().width || 0) * (b.getBoundingClientRect?.().height || 0);
        return ((bRows * 1000000) + (bRange * 1000) + bArea) - ((aRows * 1000000) + (aRange * 1000) + aArea);
      });

    const result = unique.slice(0, 6).map((element, index) => makeElementScroller(element, `element-${index + 1}`));
    result.push(makeDocumentScroller());
    return result;
  }

  async function processRendered99Rows(scanState, options = {}) {
    let newlySeen = 0;
    let newlyQualified = 0;
    let newlySelected = 0;
    let selectionMutations = 0;
    const targetMode = Boolean(scanState.selectionPlan);
    const mutateSelection = options.mutateSelection !== false && scanState.deferSelection !== true;
    const requestedMutationLimit = Number(options.maxSelectionMutations);
    const maxSelectionMutations = Number.isFinite(requestedMutationLimit)
      ? Math.max(0, requestedMutationLimit)
      : Infinity;
    if (!scanState.selectionCandidates) scanState.selectionCandidates = new Map();
    if (!scanState.rowControls) scanState.rowControls = new Map();
    if (!scanState.rowSignatures) scanState.rowSignatures = new WeakMap();
    if (!Number.isFinite(scanState.nextRowSignature)) scanState.nextRowSignature = 0;
    const currentRows = await renderedBulkRowsCooperatively();
    for (let rowIndex = 0; rowIndex < currentRows.length; rowIndex += 1) {
      if (rowIndex > 0 && rowIndex % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      const { row, checkbox, priceInput } = currentRows[rowIndex];
      // Saved 1-2,000 ranges are matched by their verified title/price
      // fingerprints below. Do not force an innerText/layout walk over every
      // large Bulk Edit row merely to create a key; that can lock Chrome once
      // eBay has mounted the complete table.
      let signature = "";
      if (targetMode) {
        signature = scanState.rowSignatures.get(row) || "";
        if (!signature) {
          scanState.nextRowSignature += 1;
          signature = `loaded-row:${scanState.nextRowSignature}`;
          scanState.rowSignatures.set(row, signature);
        }
      } else {
        signature = rowSignature(row);
      }
      if (!signature) continue;
      if (!scanState.bulkRecords) scanState.bulkRecords = new Map();
      if (scanState.acceptNewRows === false && !scanState.bulkRecords.has(signature)) continue;
      if (!scanState.bulkRecords.has(signature)) {
        const rowRecord = bulkEditorRowRecord(row, priceInput);
        let itemId = targetMode ? "" : bulkEditorRowItemId(row);
        if (targetMode) {
          const fingerprint = rowRecord.fingerprint;
          const fingerprintIndex = Number(scanState.fingerprintCounts.get(fingerprint) || 0);
          const expectedRecords = scanState.selectionPlan.expectedByFingerprint.get(fingerprint) || [];
          const targetRecords = scanState.selectionPlan.targetByFingerprint.get(fingerprint) || [];
          if (!fingerprint || fingerprintIndex >= expectedRecords.length) {
            scanState.unexpectedRows.add(signature);
          } else if (targetRecords.length) {
            itemId = String(targetRecords[fingerprintIndex]?.itemId || "");
            if (!itemId) scanState.unexpectedRows.add(signature);
          }
          scanState.fingerprintCounts.set(fingerprint, fingerprintIndex + 1);
        }
        scanState.bulkRecords.set(signature, { ...rowRecord, itemId });
      }
      const savedRow = scanState.bulkRecords.get(signature);
      const itemId = String(savedRow?.itemId || "");
      if (!scanState.allRows.has(signature)) {
        scanState.allRows.add(signature);
        newlySeen += 1;
      }
      if (itemId) scanState.readableItemIds?.add(itemId);
      const isTarget = targetMode && Boolean(itemId) && scanState.selectionPlan.targetIdSet.has(itemId);
      const qualifies = move99QualifiesByMode({ price: priceInput.value }, itemId);
      if (isTarget) {
        scanState.seenTargetIds.add(itemId);
        if (!qualifies) scanState.invalidTargetIds.add(itemId);
      }
      const allowedForBatch = !scanState.allowedSelectionSignatures
        || scanState.allowedSelectionSignatures.has(signature);
      const shouldSelect = qualifies && (!targetMode || isTarget) && allowedForBatch;
      scanState.rowControls.set(signature, { signature, checkbox, itemId });
      if (!shouldSelect) {
        scanState.qualifyingRows.delete(signature);
        scanState.selectionCandidates.delete(signature);
        if (mutateSelection && controlChecked(checkbox) && selectionMutations < maxSelectionMutations) {
          clickElement(checkbox, { preserveScroll: true });
          selectionMutations += 1;
        }
        if (isTarget) scanState.selectedTargetIds.delete(itemId);
        continue;
      }
      if (!scanState.qualifyingRows.has(signature)) {
        scanState.qualifyingRows.add(signature);
        newlyQualified += 1;
      }
      scanState.selectionCandidates.set(signature, { signature, checkbox, itemId });
      if (!mutateSelection) continue;
      if (!controlChecked(checkbox) && selectionMutations >= maxSelectionMutations) continue;
      if (!controlChecked(checkbox)) {
        // eBay keeps loaded Bulk Edit rows mounted off-screen. Clicking the
        // mounted checkbox directly preserves the loader's bottom position;
        // scrolling each match into view fights the down-up-down lazy loader.
        clickElement(checkbox, { preserveScroll: true });
        selectionMutations += 1;
        if (controlChecked(checkbox)) newlySelected += 1;
      }
      if (isTarget) {
        if (controlChecked(checkbox)) {
          scanState.selectedTargetIds.add(itemId);
          scanState.selectionFailureIds.delete(itemId);
        } else {
          scanState.selectionFailureIds.add(itemId);
        }
      }
    }
    return { newlySeen, newlyQualified, newlySelected, selectionMutations, rendered: currentRows.length };
  }

  async function settleVirtualRows(delay = 650) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    await new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(fallback);
        resolve();
      };
      const fallback = setTimeout(done, 250);
      try {
        requestAnimationFrame(() => requestAnimationFrame(done));
      } catch (_) {
        done();
      }
    });
  }

  async function waitForRawBulkRowProgress(beforeRaw, timeout = 5000, deadline = Infinity, preferredWrapper = null) {
    const started = Date.now();
    while (Date.now() - started < timeout && Date.now() < deadline) {
      await settleVirtualRows(650);
      if (bulkEditorRawRowCount(preferredWrapper) > beforeRaw) return true;
    }
    return bulkEditorRawRowCount(preferredWrapper) > beforeRaw;
  }

  async function loadBulkEditorRowsThroughSentinel(scanState, processedTotal, deadline) {
    let wrapper = bulkEditorTableWrapper();
    if (!wrapper?.querySelector(".bg-intersection-observer")) {
      return { supported: false, cycles: 0 };
    }

    let cycles = 0;
    let stagnation = 0;
    while (bulkEditorRawRowCount(wrapper) < processedTotal && Date.now() < deadline && stagnation < 8) {
      await ensureTaskCanContinue();
      cycles += 1;
      const beforeRaw = bulkEditorRawRowCount(wrapper);
      if (wrapper.isConnected === false) wrapper = bulkEditorTableWrapper();
      if (!wrapper) break;
      const sentinel = wrapper.querySelector(".bg-intersection-observer");
      if (!sentinel) break;

      const max = Math.max(0, Number(wrapper.scrollHeight || 0) - Number(wrapper.clientHeight || 0));
      if (max > 0) {
        // Match the reliable manual gesture with three paced jumps. Avoid
        // smooth animation here because thousands of intermediate scroll
        // events can overwhelm eBay once the 2,000-row editor grows large.
        try { wrapper.scrollTo({ top: max, behavior: "auto" }); } catch (_) {}
        try { wrapper.scrollTop = max; } catch (_) {}
        await settleVirtualRows(700);
        const retreat = Math.max(1800, Math.floor(Number(wrapper.clientHeight || 0) * 2.5));
        const retreatTop = Math.max(0, max - retreat);
        try { wrapper.scrollTo({ top: retreatTop, behavior: "auto" }); } catch (_) {}
        try { wrapper.scrollTop = retreatTop; } catch (_) {}
        await settleVirtualRows(550);
        const refreshedMax = Math.max(0, Number(wrapper.scrollHeight || 0) - Number(wrapper.clientHeight || 0));
        try { wrapper.scrollTo({ top: refreshedMax, behavior: "auto" }); } catch (_) {}
        try { wrapper.scrollTop = refreshedMax; } catch (_) {}
        await settleVirtualRows(1200);
      } else {
        // The first tiny block has no scroll range. Pulse the observer below
        // its viewport once without altering table layout or padding.
        const originalTransform = sentinel.style.transform;
        const originalWillChange = sentinel.style.willChange;
        sentinel.style.willChange = "transform";
        sentinel.style.transform = `translateY(${Math.max(600, Number(wrapper.clientHeight || 0) + 120)}px)`;
        await new Promise((resolve) => setTimeout(resolve, 55));
        sentinel.style.transform = originalTransform;
        sentinel.style.willChange = originalWillChange;
        await new Promise((resolve) => setTimeout(resolve, 55));
      }

      const progressed = await waitForRawBulkRowProgress(beforeRaw, 7000, deadline, wrapper);
      const afterRaw = bulkEditorRawRowCount(wrapper);
      if (progressed) {
        // Give eBay progressively more room to finish mounting the growing
        // table. This profile can become unresponsive well before 1,000 rows,
        // so slow down before the 500-row working-batch ceiling.
        const growthPause = afterRaw >= 450 ? 2800 : afterRaw >= 300 ? 1900 : 1100;
        await settleVirtualRows(growthPause);
        if (afterRaw >= 300 && cycles % 3 === 0) {
          await settleVirtualRows(2800);
        }
      }
      stagnation = progressed || afterRaw > beforeRaw ? 0 : stagnation + 1;

      renderStatus(
        `Loading Bulk Edit rows first: ${Math.min(afterRaw, processedTotal).toLocaleString()} / ${processedTotal.toLocaleString()} rows; 0 selected (loading only)...`,
        "ready"
      );
    }
    return { supported: true, cycles };
  }

  async function scanOneScroller(scroller, processedTotal, deadline) {
    scroller.setTop(0);
    await settleVirtualRows(900);

    let stagnation = 0;
    let cycles = 0;
    let previousTop = -1;
    const maxCycles = Math.max(40, Math.min(600, processedTotal * 3));

    while (cycles < maxCycles && bulkEditorRawRowCount() < processedTotal && Date.now() < deadline) {
      await ensureTaskCanContinue();
      cycles += 1;
      const beforeRaw = bulkEditorRawRowCount();

      const topBefore = scroller.getTop();
      const maxBefore = scroller.getMax();
      const step = Math.max(280, Math.floor(scroller.getViewport() * 0.72));
      const target = Math.min(maxBefore, Math.max(topBefore + step, topBefore + 1));
      scroller.setTop(target);
      scroller.nudge(Math.max(120, Math.floor(step * 0.18)));

      const progressed = await waitForRawBulkRowProgress(beforeRaw, 3200, deadline);
      const topAfter = scroller.getTop();
      const maxAfter = scroller.getMax();
      const rawRows = bulkEditorRawRowCount();

      renderStatus(
        `Loading ${scroller.kind}: ${Math.min(rawRows, processedTotal).toLocaleString()} / ${processedTotal.toLocaleString()} rows; 0 selected (loading only)...`,
        "ready"
      );

      if (progressed) {
        stagnation = 0;
      } else {
        stagnation += 1;
        // eBay commonly loads the next block only after the final rendered row
        // has remained at the bottom for several seconds. Nudge upward and back
        // down to retrigger the lazy loader, then wait longer.
        const nearBottom = topAfter >= maxAfter - Math.max(20, scroller.getViewport() * 0.05);
        if (nearBottom || Math.abs(topAfter - previousTop) < 2) {
          scroller.nudge(-Math.max(180, Math.floor(scroller.getViewport() * 0.22)));
          await settleVirtualRows(450);
          scroller.setTop(scroller.getMax());
          scroller.nudge(Math.max(180, Math.floor(scroller.getViewport() * 0.28)));
          await waitForRawBulkRowProgress(beforeRaw, 9000, deadline);
        }
      }

      previousTop = topAfter;
      if (stagnation >= 10) break;
    }

    return cycles;
  }

  async function scanVirtualizedBulkRows(processedTotal, selectionPlan = null, options = {}) {
    const requestedScanLimit = Number(options.scanLimit || processedTotal);
    const loadTarget = Math.max(
      1,
      Math.min(processedTotal, Number.isFinite(requestedScanLimit) ? Math.floor(requestedScanLimit) : processedTotal)
    );
    const partialScan = loadTarget < processedTotal;
    const scanState = {
      allRows: new Set(),
      qualifyingRows: new Set(),
      bulkRecords: new Map(),
      readableItemIds: new Set(),
      selectionPlan,
      fingerprintCounts: new Map(),
      unexpectedRows: new Set(),
      seenTargetIds: new Set(),
      selectedTargetIds: new Set(),
      invalidTargetIds: new Set(),
      selectionFailureIds: new Set(),
      selectionCandidates: new Map(),
      rowControls: new Map(),
      rowSignatures: new WeakMap(),
      nextRowSignature: 0,
      deferSelection: true
    };
    let totalCycles = 0;
    const triedKinds = [];
    const scanBudgetMs = Math.max(120000, Math.min(1800000, loadTarget * 900));
    const deadline = Date.now() + scanBudgetMs;

    // Match the native manual workflow with down/up/down scroll pulses, but do
    // not mount more than the configured working batch when eBay opens 2,000.
    const sentinelScan = await loadBulkEditorRowsThroughSentinel(scanState, loadTarget, deadline);
    if (sentinelScan.supported) {
      triedKinds.push("intersection-sentinel");
      totalCycles += sentinelScan.cycles;
    }

    const fallbackScrollers = [];
    if (bulkEditorRawRowCount() < loadTarget) {
      const tableWrapper = bulkEditorTableWrapper();
      if (tableWrapper) fallbackScrollers.push(makeElementScroller(tableWrapper, "table-wrapper-fallback"));
      if (!sentinelScan.supported) {
        for (const candidate of findBulkEditorScrollCandidates()) {
          if (!fallbackScrollers.some((scroller) => scroller.element === candidate.element)) {
            fallbackScrollers.push(candidate);
          }
        }
      }
    }

    for (const scroller of fallbackScrollers) {
      if (bulkEditorRawRowCount() >= loadTarget) break;
      triedKinds.push(scroller.kind);
      renderStatus(
        `Loading ${scroller.kind}: ${bulkEditorRawRowCount().toLocaleString()} / about ${loadTarget.toLocaleString()} rows; 0 selected (loading only)...`,
        "ready"
      );
      totalCycles += await scanOneScroller(scroller, loadTarget, deadline);
    }

    // Final document pass with deliberately slow, page-sized movement. This is
    // a fallback for eBay builds whose lazy loader ignores direct scrollTop
    // changes until the browser viewport itself moves.
    if (bulkEditorRawRowCount() < loadTarget) {
      const doc = makeDocumentScroller();
      doc.setTop(0);
      await settleVirtualRows(900);
      let noGrowth = 0;
      while (bulkEditorRawRowCount() < loadTarget && noGrowth < 12 && Date.now() < deadline) {
        await ensureTaskCanContinue();
        const beforeRaw = bulkEditorRawRowCount();
        doc.nudge(Math.max(300, Math.floor(doc.getViewport() * 0.82)));
        const grew = await waitForRawBulkRowProgress(beforeRaw, 7000, deadline);
        noGrowth = grew ? 0 : noGrowth + 1;
        renderStatus(
          `Slow load: ${bulkEditorRawRowCount().toLocaleString()} / about ${loadTarget.toLocaleString()} rows; 0 selected (loading only)...`,
          "ready"
        );
      }
    }

    const loadedRawRows = bulkEditorRawRowCount();
    if (loadedRawRows < loadTarget) {
      throw new Error(
        `Only ${loadedRawRows.toLocaleString()} of the ${loadTarget.toLocaleString()}-row working batch finished loading. `
        + "No checkboxes or category fields were changed."
      );
    }

    makeDocumentScroller().setTop(0);
    await settleVirtualRows(1000);
    renderStatus(
      `${loadedRawRows.toLocaleString()} Bulk Edit rows loaded for this batch. Reading listing prices without changing selections...`,
      "ready"
    );
    await processRendered99Rows(scanState, { mutateSelection: false });
    if (partialScan) scanState.acceptNewRows = false;
    const foundQualifyingCount = scanState.selectionCandidates.size;
    const requestedSelectionLimit = Number(options.selectionLimit);
    if (Number.isFinite(requestedSelectionLimit) && requestedSelectionLimit > 0
        && scanState.selectionCandidates.size > Math.floor(requestedSelectionLimit)) {
      const allowed = [...scanState.selectionCandidates.keys()].slice(0, Math.floor(requestedSelectionLimit));
      scanState.allowedSelectionSignatures = new Set(allowed);
      for (const signature of [...scanState.selectionCandidates.keys()]) {
        if (scanState.allowedSelectionSignatures.has(signature)) continue;
        scanState.selectionCandidates.delete(signature);
        scanState.qualifyingRows.delete(signature);
      }
    }
    renderStatus(
      `Read ${scanState.allRows.size.toLocaleString()} listing prices; preparing ${scanState.selectionCandidates.size.toLocaleString()} of ${foundQualifyingCount.toLocaleString()} verified .99 matches...`,
      "ready"
    );
    if (scanState.allRows.size < loadTarget || (!partialScan && scanState.allRows.size !== processedTotal)) {
      throw new Error(
        `Only ${scanState.allRows.size.toLocaleString()} of the ${loadTarget.toLocaleString()}-row working batch contained readable listing prices. `
        + "No checkboxes or category fields were changed."
      );
    }

    // Match the proven manual workflow: finish eBay's down/up/down lazy-load
    // cycle before touching any row checkbox. Selecting while rows are still
    // being appended makes the 2,000-listing grid re-render and can freeze it.
    const desiredSelectionCount = scanState.selectionCandidates.size;
    scanState.deferSelection = false;
    let selectionStagnation = 0;
    const scannedRowTotal = scanState.allRows.size;
    const excludedSelectionCount = scannedRowTotal - desiredSelectionCount;
    // Select-all would select unseen rows from the full 2,000-listing workspace.
    // A partial working batch must always select its verified rows individually.
    const useSelectAllThenExclude = !partialScan
      && desiredSelectionCount > 0
      && excludedSelectionCount < desiredSelectionCount;

    if (useSelectAllThenExclude) {
      renderStatus(
        `All ${scanState.allRows.size.toLocaleString()} rows loaded. Selecting all once, then excluding ${excludedSelectionCount.toLocaleString()} non-.99 listings...`,
        "ready"
      );
      const selectedAll = await selectAllBulkEditorListings(processedTotal);
      if (!selectedAll) {
        throw new Error(`Safety stop: eBay could not select all ${processedTotal.toLocaleString()} loaded rows. No category changes were attempted.`);
      }
      const nativeAllSelected = await U.waitFor(() => {
        const native = nativeBulkSelectionSummary();
        return native?.selected === processedTotal && native.total === processedTotal ? native : null;
      }, 12000, 250);
      if (!nativeAllSelected) {
        throw new Error(`Safety stop: eBay did not confirm all ${processedTotal.toLocaleString()} loaded rows were selected. No category changes were attempted.`);
      }
      await settleVirtualRows(5000);

      // Select all usually updates checkbox state in place. Reuse the verified
      // row map unless eBay actually remounted the table; rescanning 2,000 rows
      // immediately after the native selection is needless renderer pressure.
      if (scanState.rowControls.size !== processedTotal
          || [...scanState.rowControls.values()].some(({ checkbox }) => !checkbox?.isConnected)) {
        await processRendered99Rows(scanState, { mutateSelection: false });
      }
      if (scanState.rowControls.size !== processedTotal) {
        throw new Error(`Safety stop: only ${scanState.rowControls.size.toLocaleString()} of ${processedTotal.toLocaleString()} row controls were available after Select all. No category changes were attempted.`);
      }

      const maxExclusionPasses = Math.max(1, excludedSelectionCount + 5);
      let exclusions = [...scanState.rowControls.values()]
        .filter(({ signature }) => !scanState.selectionCandidates.has(signature));
      if (exclusions.length !== excludedSelectionCount) {
        throw new Error(
          `Safety stop: expected ${excludedSelectionCount.toLocaleString()} non-.99 rows, but ${exclusions.length.toLocaleString()} were available to exclude. No category changes were attempted.`
        );
      }
      for (let pass = 0; pass < maxExclusionPasses && excludedSelectionCount > 0; pass += 1) {
        await ensureTaskCanContinue();
        if (exclusions.some(({ checkbox }) => !checkbox?.isConnected)) {
          await processRendered99Rows(scanState, { mutateSelection: false });
          exclusions = [...scanState.rowControls.values()]
            .filter(({ signature }) => !scanState.selectionCandidates.has(signature));
        }
        if (exclusions.length !== excludedSelectionCount) {
          throw new Error(
            `Safety stop: expected ${excludedSelectionCount.toLocaleString()} non-.99 rows, but ${exclusions.length.toLocaleString()} were available to exclude. No category changes were attempted.`
          );
        }
        const pending = exclusions.filter(({ checkbox }) => checkbox?.isConnected && controlChecked(checkbox));
        const next = pending[0];
        if (!next) break;
        const beforeSelected = nativeBulkSelectionSummary()?.selected ?? bulkEditorSelectionProgress().selected;
        clickElement(next.checkbox, { preserveScroll: true });
        await settleVirtualRows(900);
        let afterSelected = nativeBulkSelectionSummary()?.selected ?? bulkEditorSelectionProgress().selected;
        if (afterSelected >= beforeSelected || controlChecked(next.checkbox)) {
          await settleVirtualRows(1800);
          afterSelected = nativeBulkSelectionSummary()?.selected ?? bulkEditorSelectionProgress().selected;
        }
        if ((pass + 1) % 5 === 0 || afterSelected === desiredSelectionCount) {
          renderStatus(
            `All ${scanState.allRows.size.toLocaleString()} rows loaded. Keeping .99 listings: ${afterSelected.toLocaleString()} / ${desiredSelectionCount.toLocaleString()} selected...`,
            "ready"
          );
        }
        if (afterSelected === desiredSelectionCount) break;
        selectionStagnation = afterSelected === beforeSelected - 1 && !controlChecked(next.checkbox)
          ? 0
          : selectionStagnation + 1;
        if (selectionStagnation >= 3) break;
        if ((pass + 1) % 5 === 0) await settleVirtualRows(2500);
      }
    } else {
      const maxSelectionPasses = Math.max(1, desiredSelectionCount + 5);
      for (let pass = 0; pass < maxSelectionPasses && desiredSelectionCount > 0; pass += 1) {
        await ensureTaskCanContinue();
        let candidates = [...scanState.selectionCandidates.values()];
        if (candidates.some(({ checkbox }) => !checkbox?.isConnected)) {
          await processRendered99Rows(scanState, { mutateSelection: false });
          candidates = [...scanState.selectionCandidates.values()];
        }
        const pending = candidates.filter(({ checkbox }) => checkbox?.isConnected && !controlChecked(checkbox));
        const next = pending[0];
        if (!next) break;
        const beforeSelected = nativeBulkSelectionSummary()?.selected ?? bulkEditorSelectionProgress().selected;
        clickElement(next.checkbox, { preserveScroll: true });
        await settleVirtualRows(partialScan ? 250 : 900);
        let afterSelected = nativeBulkSelectionSummary()?.selected ?? bulkEditorSelectionProgress().selected;
        if (afterSelected <= beforeSelected || !controlChecked(next.checkbox)) {
          await settleVirtualRows(partialScan ? 700 : 1800);
          afterSelected = nativeBulkSelectionSummary()?.selected ?? bulkEditorSelectionProgress().selected;
        }
        if ((pass + 1) % 5 === 0 || afterSelected >= desiredSelectionCount) {
          renderStatus(
            `All ${scanState.allRows.size.toLocaleString()} rows loaded. Selecting .99 listings: ${afterSelected.toLocaleString()} / ${desiredSelectionCount.toLocaleString()}...`,
            "ready"
          );
        }
        if (afterSelected >= desiredSelectionCount) break;
        selectionStagnation = afterSelected === beforeSelected + 1 && controlChecked(next.checkbox)
          ? 0
          : selectionStagnation + 1;
        if (selectionStagnation >= 3) break;
        if ((pass + 1) % (partialScan ? 10 : 5) === 0) {
          await settleVirtualRows(partialScan ? 900 : 2500);
        }
      }
    }

    await processRendered99Rows(scanState, { mutateSelection: false });
    scanState.selectedTargetIds.clear();
    scanState.selectionFailureIds.clear();
    let selectedCandidateCount = 0;
    for (const { checkbox, itemId } of scanState.selectionCandidates.values()) {
      if (controlChecked(checkbox)) {
        selectedCandidateCount += 1;
        if (itemId) scanState.selectedTargetIds.add(itemId);
      } else if (itemId) {
        scanState.selectionFailureIds.add(itemId);
      }
    }
    const nativeSelected = bulkEditorSelectionProgress().selected;
    const unexpectedSelected = Math.max(0, nativeSelected - selectedCandidateCount);
    if (
      selectedCandidateCount !== desiredSelectionCount
      || nativeSelected !== desiredSelectionCount
      || unexpectedSelected > 0
    ) {
      throw new Error(
        `Safety stop: expected exactly ${desiredSelectionCount.toLocaleString()} verified .99 rows selected, `
        + `but eBay shows ${nativeSelected.toLocaleString()} selected (${selectedCandidateCount.toLocaleString()} verified; `
        + `${unexpectedSelected.toLocaleString()} unexpected). No category changes were attempted.`
      );
    }

    return {
      scanState,
      scrollerKinds: triedKinds,
      iterations: totalCycles,
      loadTarget,
      workspaceTotal: processedTotal,
      partialScan,
      foundQualifyingCount,
      timedOut: Date.now() >= deadline && scanState.allRows.size < loadTarget
    };
  }

  async function clearBulkEditorSelections() {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const current = bulkEditorSelectionProgress();
      if (!current.selected) return true;
      const selectAll = bulkEditorSelectAllControl();
      if (!selectAll?.target && !selectAll?.control) break;
      renderStatus(`Clearing ${current.selected.toLocaleString()} pre-selected Bulk Edit rows before scanning...`, "ready");
      for (const target of bulkSelectAllClickTargets(selectAll)) {
        clickElement(target);
        const cleared = await U.waitFor(() => bulkEditorSelectionProgress().selected === 0, 2500, 150);
        if (cleared) return true;
      }
      await settleVirtualRows(350);
    }
    const current = bulkEditorSelectionProgress();
    if (current.selected) {
      throw new Error(`Safety stop: eBay opened Bulk Edit with ${current.selected} rows pre-selected, and I could not clear them before scanning.`);
    }
    return true;
  }

  async function selectAll99Listings(expectedTotal = 0) {
    const processed = await waitForBulkEditorReady(expectedTotal, { allowFewer: true, timeout: 300000 });
    if (!processed) throw new Error("eBay Bulk Edit did not finish processing all filtered listings.");
    if (expectedTotal && (processed.total < 1 || processed.total > Number(expectedTotal))) {
      throw new Error(`Safety stop: eBay opened ${processed.total.toLocaleString()} rows for an expected ${Number(expectedTotal).toLocaleString()}-listing range. No category changes were attempted.`);
    }
    const omittedCount = expectedTotal ? Math.max(0, Number(expectedTotal) - processed.total) : 0;

    const scanTarget = Math.min(processed.total, MOVE99_RENDER_BATCH_LIMIT);
    renderStatus(
      `Preparing a ${scanTarget.toLocaleString()}-row working batch inside eBay's ${processed.total.toLocaleString()}-listing workspace...`,
      "ready"
    );
    await clearBulkEditorSelections();
    const { scanState, scrollerKinds, loadTarget, partialScan, foundQualifyingCount } = await scanVirtualizedBulkRows(
      processed.total,
      null,
      { scanLimit: scanTarget, selectionLimit: MOVE99_DIRECT_SELECTION_LIMIT }
    );

    const uiSelected = bulkEditorSelectionProgress().selected;
    const qualifyingCount = scanState.qualifyingRows.size;
    const scannedRows = scanState.allRows.size;

    if (uiSelected !== qualifyingCount) {
      throw new Error(
        `Safety stop: Bulk Edit shows ${uiSelected.toLocaleString()} selected rows, but the ${move99WorkflowLabel()} scan found ${qualifyingCount.toLocaleString()} qualifying rows. No category changes were attempted.`
      );
    }

    if (scannedRows < loadTarget || (!partialScan && scannedRows !== processed.total)) {
      throw new Error(
        `Only ${scannedRows.toLocaleString()} of the ${loadTarget.toLocaleString()}-row working batch could be inspected after trying ${scrollerKinds.join(", ") || "the page"}. `
        + "eBay did not load the remaining listing blocks, so no category changes were attempted."
      );
    }

    return {
      processedTotal: processed.total,
      expectedTotal: Number(expectedTotal || processed.total),
      omittedCount,
      qualifyingCount,
      foundQualifyingCount,
      scannedRows,
      scanTarget: loadTarget,
      workspaceTotal: processed.total,
      partialScan,
      scrollerKind: scrollerKinds.join(", ") || "document"
    };
  }

  async function selectSavedIdsInBulkRange(range, state) {
    const targetIds = [...new Set((range?.targetIds || state?.currentBatchIds || []).map(String).filter(Boolean))];
    const rangeCount = Number(range?.rangeCount || 0);
    if (!targetIds.length || !rangeCount || targetIds.length > rangeCount || rangeCount > MOVE99_EDIT_RANGE_LIMIT) {
      throw new Error("The saved 2,000-listing range is incomplete. No category changes were attempted.");
    }
    const selectionPlan = buildMove99RangeFingerprintPlan(range);

    const processed = await waitForBulkEditorReady(rangeCount, { allowFewer: true, timeout: 300000 });
    if (!processed) throw new Error("eBay Bulk Edit did not finish processing the saved listing range.");
    if (processed.total < 1 || processed.total > rangeCount) {
      throw new Error(`Safety stop: eBay opened ${processed.total.toLocaleString()} rows for a ${rangeCount.toLocaleString()}-listing range.`);
    }

    await clearBulkEditorSelections();
    renderStatus(`Selecting ${targetIds.length.toLocaleString()} verified title/price matches inside eBay's ${rangeCount.toLocaleString()}-listing range...`, "ready");
    const scan = await scanVirtualizedBulkRows(processed.total, selectionPlan);
    const scanState = scan.scanState;
    const scannedRows = scanState.allRows.size;
    const selectedSet = scanState.selectedTargetIds;
    const seenSet = scanState.seenTargetIds;
    const invalidSet = scanState.invalidTargetIds;
    const selectionFailures = scanState.selectionFailureIds;
    const selectedIds = targetIds.filter((itemId) => selectedSet.has(itemId));
    const missingIds = targetIds.filter((itemId) => !selectedSet.has(itemId));
    const unaccountedIds = targetIds.filter((itemId) => !seenSet.has(itemId));
    const fullWorkspaceInspected = scannedRows >= processed.total;

    if (!fullWorkspaceInspected || scanState.bulkRecords.size !== processed.total) {
      throw new Error(
        `Safety stop: only ${scannedRows.toLocaleString()} of ${processed.total.toLocaleString()} Bulk Edit rows were fingerprinted. No category changes were attempted.`
      );
    }
    if (scanState.unexpectedRows.size) {
      throw new Error(
        `Safety stop: ${scanState.unexpectedRows.size.toLocaleString()} Bulk Edit row${scanState.unexpectedRows.size === 1 ? "" : "s"} did not match the verified listing range by title and price. No category changes were attempted.`
      );
    }

    if (!seenSet.size) {
      throw new Error("Safety stop: the Bulk Edit rows did not contain any verified target fingerprints. No category changes were attempted.");
    }
    if (unaccountedIds.length && !fullWorkspaceInspected) {
      throw new Error(
        `Safety stop: only ${scannedRows.toLocaleString()} of ${processed.total.toLocaleString()} Bulk Edit rows were inspected, leaving ${unaccountedIds.length.toLocaleString()} saved item numbers unverified.`
      );
    }

    const selection = bulkEditorSelectionProgress();
    if (selection.selected !== selectedIds.length) {
      throw new Error(
        `Safety stop: eBay shows ${selection.selected.toLocaleString()} selected rows, but exactly ${selectedIds.length.toLocaleString()} saved item numbers were selected. No category changes were attempted.`
      );
    }
    if (selectionFailures.size) {
      throw new Error(`Safety stop: ${selectionFailures.size.toLocaleString()} exact saved rows could not be selected. No category changes were attempted.`);
    }

    await recordMove99Trace(
      "Verified Bulk Edit range selected by title/price fingerprint.",
      `range=${range.rangeStart}-${range.rangeEnd};processed=${processed.total};seen=${scannedRows};targets=${targetIds.length};selected=${selectedIds.length};missing=${missingIds.length};invalid=${invalidSet.size}`
    );
    return {
      processedTotal: processed.total,
      scannedRows,
      selectedIds,
      missingIds,
      invalidIds: [...invalidSet],
      seenTargetIds: [...seenSet],
      scrollerKind: scan.scrollerKinds.join(", ") || "document"
    };
  }

  async function ensureBulkSelectionMatchesScan(expectedCount) {
    const selection = await U.waitFor(() => {
      const current = bulkEditorSelectionProgress();
      const native = nativeBulkSelectionSummary();
      if (current.selected !== expectedCount) return null;
      if (!native || native.selected !== expectedCount) return null;
      return { ...current, native };
    }, 12000, 250);
    if (!selection) {
      const current = bulkEditorSelectionProgress();
      const native = nativeBulkSelectionSummary();
      throw new Error(
        `Safety stop: the scan found ${expectedCount} listings, the rendered grid shows ${current.selected} selected, `
        + `and eBay's own counter shows ${native?.selected ?? "an unknown number"}. No category changes were attempted.`
      );
    }
    return selection;
  }

  function showMove99Confirmation(summary) {
    document.getElementById("gldn-move99-preview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-move99-preview";
    overlay.className = "gldn-modal-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal">
        <button type="button" class="gldn-close" aria-label="Close">×</button>
        <h2>Move .99 Listings</h2>
        <p>Only the primary <strong>Store category</strong> will change.</p>
        <div class="gldn-grid">
          <div><strong>Filtered listings loaded</strong><span>${summary.processedTotal.toLocaleString()}</span></div>
          <div><strong>.99 listings selected</strong><span>${summary.qualifyingCount.toLocaleString()}</span></div>
          <div><strong>Source categories</strong><span>${MOVE99_SOURCE_CATEGORIES.map(escapeHtml).join(" + ")}</span></div>
          <div><strong>Destination</strong><span>${escapeHtml(MOVE99_DESTINATION_CATEGORY)}</span></div>
        </div>
        <div class="gldn-existing"><strong>Rule:</strong> any Buy It Now price ending in .99 qualifies. Stock does not matter. Individual failures will not stop the remaining listings.</div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="continue">Move ${summary.qualifyingCount.toLocaleString()} Listings</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnMove99ModalPosition");
    const close = async () => {
      await storageSet({ pendingMove99Run: null });
      overlay.remove();
      renderStatus("Move .99 Listings cancelled.");
    };
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    overlay.querySelector("[data-action='continue']").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      overlay.querySelector(".gldn-modal-status").textContent = "Applying Store category and opening eBay review...";
      const pending = await storageGet(["pendingMove99Run"]);
      await storageSet({ pendingMove99Run: { ...(pending.pendingMove99Run || {}), active: true, phase: "apply", summary } });
      overlay.remove();
      runMove99Automation();
    });
  }

  const deepQueryScopeCache = new WeakMap();

  function deepQueryScopes(root = document) {
    const now = Date.now();
    const cached = deepQueryScopeCache.get(root);
    if (cached && now - cached.at < 250) return cached.scopes;

    const scopes = [];
    const seen = new Set();
    const queue = [root];
    while (queue.length) {
      const scope = queue.shift();
      if (!scope || seen.has(scope)) continue;
      seen.add(scope);
      scopes.push(scope);
      let all = [];
      try { all = scope.querySelectorAll("*"); } catch (_) { all = []; }
      for (const element of all) {
        if (element.shadowRoot && !seen.has(element.shadowRoot)) queue.push(element.shadowRoot);
      }
    }
    deepQueryScopeCache.set(root, { at: now, scopes });
    return scopes;
  }

  function queryAllDeep(selector, root = document) {
    const results = [];
    for (const scope of deepQueryScopes(root)) {
      try { results.push(...scope.querySelectorAll(selector)); } catch (_) {}
    }
    return [...new Set(results)];
  }

  function normalizedElementText(element) {
    return U.normalizeText(element?.innerText || element?.textContent || "");
  }

  function findVisibleDialogContaining(text) {
    const target = U.normalizeText(text);
    const candidates = queryAllDeep('[role="dialog"], dialog, [aria-modal="true"], .dialog, .lightbox-dialog');
    return candidates
      .filter(U.isVisible)
      .filter((element) => normalizedElementText(element).includes(target))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      })[0] || null;
  }

  function findExactTextDeep(text, root = document, selector = 'h1, h2, h3, [role="heading"], label, span, div, p, button, [role="button"], [role="radio"], li') {
    const target = U.normalizeText(text);
    return queryAllDeep(selector, root)
      .filter(U.isVisible)
      .filter((element) => normalizedElementText(element) === target)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      })[0] || null;
  }

  function findCategoryEditorDialog() {
    const semanticDialogs = queryAllDeep('[role="dialog"], dialog, [aria-modal="true"], .dialog, .lightbox-dialog')
      .filter(U.isVisible)
      .filter((dialog) => {
        const aria = U.normalizeText(dialog.getAttribute?.("aria-label") || "");
        if (aria === "category") return true;
        return queryAllDeep('h1, h2, h3, [role="heading"]', dialog).some((heading) => {
          return U.isVisible(heading) && normalizedElementText(heading) === "category";
        });
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    if (semanticDialogs[0]) return semanticDialogs[0];

    const heading = findExactTextDeep("Category", document, 'h1, h2, h3, [role="heading"], div, span');
    if (!heading) return null;
    let current = heading;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      if (!U.isVisible(current)) continue;
      const rect = current.getBoundingClientRect();
      const hasClose = queryAllDeep('button, [role="button"]', current).some((button) => {
        const label = U.normalizeText(button.getAttribute?.("aria-label") || normalizedElementText(button));
        return U.isVisible(button) && (label === "close" || label === "dismiss");
      });
      if (rect.width >= 300 && rect.height >= 250 && hasClose) return current;
    }
    return null;
  }

  function findStoreCategoryHeading(dialog) {
    const exact = queryAllDeep('h1, h2, h3, h4, [role="heading"], label, span, div, p', dialog)
      .filter(U.isVisible)
      .filter((element) => /^(store category|store categories)$/.test(normalizedElementText(element)))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    if (exact[0]) return exact[0];
    return queryAllDeep('h1, h2, h3, h4, [role="heading"], label, span, div, p', dialog)
      .filter(U.isVisible)
      .filter((element) => normalizedElementText(element).includes("store category"))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      })[0] || null;
  }

  function categoryDialogFailureMessage(dialog) {
    const text = normalizedElementText(dialog);
    if (/something went wrong|unable to load|could not load|try again|technical issue/.test(text)) {
      return "eBay could not load the Category editor. Close it, refresh the page, and retry the saved batch.";
    }
    return "";
  }

  function categoryEditorDiagnostic(dialog) {
    const visibleText = String(dialog?.innerText || dialog?.textContent || document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1800);
    const headings = queryAllDeep('h1, h2, h3, h4, [role="heading"]', dialog || document)
      .filter(U.isVisible)
      .map((element) => normalizedElementText(element))
      .filter(Boolean)
      .slice(0, 20);
    const buttons = queryAllDeep('button, [role="button"], [role="menuitem"], [role="option"]', dialog || document)
      .filter(U.isVisible)
      .map((element) => normalizedElementText(element))
      .filter(Boolean)
      .slice(0, 30);
    return JSON.stringify({
      url: location.href,
      headings,
      buttons,
      text: visibleText
    });
  }

  async function recordMove99Diagnostic(message, dialog = null) {
    const detail = categoryEditorDiagnostic(dialog);
    try {
      await runtimeMessage({
        type: "recordExtensionLog",
        entry: {
          source: "move99",
          level: "error",
          message,
          detail,
          page: location.href
        }
      });
    } catch (_) {
      U.recordExtensionLog?.({ source: "move99", level: "error", message, detail });
    }
  }

  async function recordMove99Trace(message, detail = "") {
    try {
      await runtimeMessage({
        type: "recordExtensionLog",
        entry: {
          source: "move99",
          level: "info",
          operation: "e08-live-trace",
          message,
          detail,
          page: location.href
        }
      });
    } catch (_) {
      // Diagnostics must never interrupt the marketplace workflow.
    }
  }

  async function waitForCategoryEditorReady(timeoutMs = 120000) {
    const openedAt = Date.now();
    let dialog = null;
    while (Date.now() - openedAt < timeoutMs) {
      await ensureTaskCanContinue();
      dialog = findCategoryEditorDialog();
      if (dialog) {
        const failure = categoryDialogFailureMessage(dialog);
        if (failure) throw new Error(failure);
        const storeHeading = findStoreCategoryHeading(dialog);
        if (storeHeading) return { dialog, storeHeading };
      }
      const seconds = Math.max(1, Math.floor((Date.now() - openedAt) / 1000));
      renderStatus(`Waiting for eBay's Category editor to finish loading… ${seconds}s`, "ready");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (dialog) {
      await recordMove99Diagnostic("Move .99 could not verify the Store category editor inside eBay Category.", dialog);
      throw new Error("eBay's Category editor was still loading after 2 minutes. The selected batch was not changed. Close the Category window and retry.");
    }
    await recordMove99Diagnostic("Move .99 clicked Bulk edit > Category, but no Category dialog appeared.");
    throw new Error("The Category editor did not open. The selected batch was not changed.");
  }

  function findTextBetweenY(text, minY, maxY, root = document) {
    const target = U.normalizeText(text);
    return queryAllDeep('label, span, div, p, button, [role="button"], [role="radio"]', root).filter((element) => {
      if (!U.isVisible(element)) return false;
      if (normalizedElementText(element) !== target) return false;
      const rect = element.getBoundingClientRect();
      return rect.top >= minY && rect.top <= maxY;
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    })[0] || null;
  }

  function findFieldsetByLegend(root, text, minY = -Infinity) {
    const target = U.normalizeText(text);
    return queryAllDeep("fieldset", root)
      .filter(U.isVisible)
      .filter((fieldset) => fieldset.getBoundingClientRect().bottom >= minY)
      .filter((fieldset) => queryAllDeep("legend", fieldset).some((legend) => {
        return normalizedElementText(legend) === target;
      }))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.top - br.top) || ((ar.width * ar.height) - (br.width * br.height));
      })[0] || null;
  }

  function findPrimaryStoreCategoryFieldset(dialog, storeHeading = null) {
    const storeTop = storeHeading?.getBoundingClientRect?.().top ?? -Infinity;
    return findFieldsetByLegend(dialog, "Primary category", storeTop - 2);
  }

  function findPrimaryStoreCategoryChangeControl(fieldset) {
    if (!fieldset) return null;
    return queryAllDeep('input[type="radio"][value="CHANGE_TO"]', fieldset)
      .find((control) => !control.disabled && control.getAttribute?.("aria-disabled") !== "true") || null;
  }

  function findPrimaryStoreCategoryChooserByContract(fieldset) {
    if (!fieldset) return null;
    return queryAllDeep('button[name="storePrimaryCategory"], [role="button"][name="storePrimaryCategory"]', fieldset)
      .find(U.isVisible) || null;
  }

  function storeCategoryAlreadySelectedInFieldset(fieldset) {
    if (!fieldset) return false;
    const destination = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    return queryAllDeep('button, [role="button"], div, span', fieldset)
      .filter(U.isVisible)
      .some((element) => {
        const text = normalizedElementText(element);
        return text.includes("selected category") && text.includes(destination);
      });
  }

  function actionableElementForText(element) {
    if (!element) return null;
    if (element.matches?.('button, a, label, input, [role="button"], [role="radio"], [role="option"], [role="menuitem"], [role="checkbox"]')) return element;
    return element.closest?.('button, a, label, [role="button"], [role="radio"], [role="option"], [role="menuitem"], [role="checkbox"]') || element;
  }

  function clickDeepText(element) {
    const action = actionableElementForText(element);
    if (!action) return false;
    const input = action.matches?.('label') ? action.querySelector?.('input[type="radio"], input[type="checkbox"]') : null;
    return clickElement(input || action);
  }

  function findPickerContainingDestination() {
    const destinationTarget = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    const roots = queryAllDeep('[role="dialog"], dialog, [aria-modal="true"], [role="listbox"], [role="menu"], .dialog, .lightbox-dialog, .store-category-view, [class*="store-category"], [class*="category-view"], [class*="drawer"], [class*="flyout"]')
      .filter(U.isVisible)
      .filter((root) => {
        const text = normalizedElementText(root);
        return text.includes(destinationTarget)
          && (text.includes("all categories") || text.includes("store category"));
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return roots[0] || null;
  }

  function findSelectedStoreCategoryChooser(root, minY, maxY) {
    const candidates = queryAllDeep('button, a, label, [role="button"], [aria-haspopup="true"], [tabindex], div, span', root)
      .filter(U.isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = normalizedElementText(element);
        const aria = U.normalizeText([
          element.getAttribute?.("aria-label"),
          element.getAttribute?.("title")
        ].filter(Boolean).join(" "));
        let score = 0;
        if (text === "selected category" || aria === "selected category") score = 180;
        else if (text.startsWith("selected category ") || aria.includes("selected category")) score = 160;
        else if (text.includes("selected category")) score = 140;
        if (element.matches?.('button, a, label, [role="button"], [aria-haspopup="true"], [tabindex]')) score += 35;
        if (element.querySelector?.('svg, [data-icon], [class*="chevron"], [class*="arrow"]')) score += 20;
        if (text.includes(U.normalizeText(MOVE99_DESTINATION_CATEGORY))) score += 10;
        return { element, rect, score, text };
      })
      .filter((item) => item.score > 0
        && item.rect.top >= minY
        && item.rect.top <= maxY
        && item.rect.width >= 80
        && item.rect.height >= 16)
      .sort((a, b) => (b.score - a.score) || ((a.rect.width * a.rect.height) - (b.rect.width * b.rect.height)));
    const candidate = candidates[0]?.element || null;
    if (!candidate) return null;
    const action = candidate.matches?.('button, a, label, [role="button"], [aria-haspopup="true"], [tabindex]')
      ? candidate
      : candidate.closest?.('button, a, label, [role="button"], [aria-haspopup="true"], [tabindex]')
        || candidate.querySelector?.('button, a, label, [role="button"], [aria-haspopup="true"], [tabindex]');
    return action || candidate;
  }

  function storeCategoryAlreadySelected(root, minY, maxY) {
    const destination = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    return queryAllDeep('button, [role="button"], div, span', root)
      .filter(U.isVisible)
      .some((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < minY || rect.top > maxY) return false;
        const text = normalizedElementText(element);
        return text.includes("selected category") && text.includes(destination);
      });
  }

  async function openSelectedStoreCategoryChooser(root, minY, maxY) {
    const chooser = findSelectedStoreCategoryChooser(root, minY, maxY);
    if (!chooser) return false;
    const attempts = [
      chooser,
      chooser.querySelector?.('button, a, [role="button"], [aria-haspopup="true"], [tabindex]'),
      chooser.querySelector?.('svg, [data-icon], [class*="chevron"], [class*="arrow"]')
    ].filter(Boolean);
    const rect = chooser.getBoundingClientRect();
    const rightEdgeTarget = document.elementFromPoint(rect.right - 18, rect.top + (rect.height / 2));
    if (rightEdgeTarget && !attempts.includes(rightEdgeTarget)) attempts.push(rightEdgeTarget);
    for (const target of uniqueElements(attempts)) {
      dispatchFullClick(target);
      const opened = await U.waitFor(() => findPickerContainingDestination(), 3000, 120);
      if (opened) return true;
    }
    return false;
  }

  function parseCategoryDraftUpdate(rawText) {
    const text = String(rawText || "");
    const match = text.match(/Category updated in\s+([\d,]+)\s+of\s+([\d,]+)\s+drafts/i);
    const completedMatch = text.match(/Category updated in\s+([\d,]+)\s+listings?/i);
    if (!match && !completedMatch) return null;
    const updated = Number((match?.[1] || completedMatch?.[1] || "0").replace(/,/g, ""));
    const attempted = Number((match?.[2] || completedMatch?.[1] || "0").replace(/,/g, ""));
    const update = {
      updated,
      attempted,
      source: match ? "ebay-category-status" : "ebay-category-complete-status"
    };
    if (!update.attempted || update.updated < 0 || update.updated > update.attempted) return null;
    return update;
  }

  function categoryDraftUpdates() {
    const updates = [];
    const seen = new Set();
    const candidates = document.querySelectorAll("[role='status'], [role='alert'], [aria-live]");
    for (const candidate of candidates) {
      const update = parseCategoryDraftUpdate(candidate.textContent || "");
      if (!update) continue;
      const key = `${update.updated}:${update.attempted}`;
      if (seen.has(key)) continue;
      seen.add(key);
      updates.push(update);
    }
    return updates;
  }

  function categoryEditorEligibleCount(dialog) {
    const match = String(dialog?.textContent || "").match(/([\d,]+)\s+eligible listings?/i);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
  }

  async function waitForCategoryApplyResult(expectedCount, timeoutMs = 90000) {
    const started = Date.now();
    let nextGridCheckAt = 0;
    while (Date.now() - started < timeoutMs) {
      await ensureTaskCanContinue();

      // eBay reports category updates incrementally (for example, 200 of
      // 1,468). Wait for the final count instead of treating the first chunk
      // as a failed apply. Scope reads to live-status regions so unrelated
      // numbers elsewhere in the 2,000-row editor cannot form a false match.
      for (const statusUpdate of categoryDraftUpdates()) {
        const completed = statusUpdate.updated === statusUpdate.attempted;
        const expectedMatches = !expectedCount || statusUpdate.attempted === expectedCount;
        if (completed && expectedMatches) return statusUpdate;
      }

      const now = Date.now();
      if (now >= nextGridCheckAt) {
        const selectedGridUpdate = selectedStoreCategoryGridUpdate(expectedCount);
        if (selectedGridUpdate?.ok) return selectedGridUpdate;
        const gridUpdate = storeCategoryGridUpdate(expectedCount);
        if (gridUpdate?.ok) return gridUpdate;
        nextGridCheckAt = now + 2500;
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
    return null;
  }

  async function choosePrimaryStoreCategory(expectedCount = 0, workspaceTotal = 0) {
    const nativeBeforeMenu = nativeBulkSelectionSummary();
    if (expectedCount && (!nativeBeforeMenu || nativeBeforeMenu.selected !== expectedCount)) {
      throw new Error(
        `Safety stop: eBay's own counter shows ${nativeBeforeMenu?.selected ?? "an unknown number of"} selected listings, `
        + `but exactly ${expectedCount} verified listings were expected. No category changes were attempted.`
      );
    }
    const bulkEdit = await U.waitFor(() => findSmallestExactText("Bulk edit", "button, [role='button']"), 10000, 180);
    if (!bulkEdit) throw new Error("I selected the .99 listings but could not find Bulk edit.");
    clickElement(bulkEdit);
    await recordMove99Trace("Bulk edit menu opened.", `expected=${expectedCount}`);

    const categoryMenuItem = await U.waitFor(() => findSmallestExactText("Category", "button, a, li, [role='menuitem'], [role='option'], div"), 8000, 150);
    if (!categoryMenuItem) throw new Error("The Bulk edit menu opened, but Category was not found.");
    clickElement(categoryMenuItem);
    await recordMove99Trace("Category command selected.", `expected=${expectedCount}`);

    const ready = await waitForCategoryEditorReady(120000);
    const categoryDialog = ready.dialog;
    const storeHeading = ready.storeHeading;
    const eligibleCount = categoryEditorEligibleCount(categoryDialog);
    if (expectedCount && eligibleCount !== expectedCount) {
      await recordMove99Diagnostic(
        `Move .99 expected ${expectedCount} selected listings, but eBay's Category editor opened for ${eligibleCount || "an unknown number of"}.`,
        categoryDialog
      );
      throw new Error(
        `Safety stop: eBay's Category editor opened for ${eligibleCount || "an unknown number of"} listings, `
        + `but exactly ${expectedCount} verified listings were selected. No category changes were applied.`
      );
    }
    await recordMove99Trace("Category editor ready.", `expected=${expectedCount}`);
    renderStatus("Category editor loaded. Selecting the primary Store category…", "ready");

    const storeTop = storeHeading.getBoundingClientRect().top;
    const primaryFieldset = findPrimaryStoreCategoryFieldset(categoryDialog, storeHeading);
    const primary = findTextBetweenY("Primary category", storeTop, window.innerHeight, primaryFieldset || categoryDialog)
      || findExactTextDeep("Primary category", categoryDialog);
    if (!primary) {
      await recordMove99Diagnostic("Move .99 found Store category text, but no Primary category section.", categoryDialog);
      throw new Error("The Store category editor loaded, but its Primary category section was not found.");
    }
    const primaryTop = primary.getBoundingClientRect().top;
    const secondary = findTextBetweenY("Secondary category", primaryTop + 1, window.innerHeight, categoryDialog);
    const maxY = secondary ? secondary.getBoundingClientRect().top - 1 : Math.min(window.innerHeight, primaryTop + 260);
    const changeControl = findPrimaryStoreCategoryChangeControl(primaryFieldset);
    const changeTo = changeControl
      || findTextBetweenY("Change to", primaryTop, maxY, categoryDialog);
    if (!changeTo) {
      await recordMove99Diagnostic("Move .99 found Primary category, but no Change to option.", categoryDialog);
      throw new Error("The Primary Store category Change to option was not found.");
    }
    if (changeControl) {
      clickElement(changeControl.labels?.[0] || changeControl);
    } else {
      clickDeepText(changeTo);
    }
    await recordMove99Trace("Primary Store category Change to selected.");

    let picker = await U.waitFor(() => findPickerContainingDestination(), 2500, 150);
    let alreadySelected = false;
    const livePrimaryFieldset = await U.waitFor(
      () => findPrimaryStoreCategoryFieldset(categoryDialog, findStoreCategoryHeading(categoryDialog) || storeHeading),
      3000,
      120
    ) || primaryFieldset;
    if (!picker && storeCategoryAlreadySelectedInFieldset(livePrimaryFieldset)) {
      alreadySelected = true;
    }
    if (!picker && !alreadySelected) {
      const contractChooser = await U.waitFor(
        () => findPrimaryStoreCategoryChooserByContract(livePrimaryFieldset),
        8000,
        150
      );
      if (contractChooser) {
        clickElement(contractChooser);
      } else {
        const livePrimary = findTextBetweenY("Primary category", storeTop, window.innerHeight, categoryDialog)
          || findExactTextDeep("Primary category", categoryDialog);
        const livePrimaryTop = livePrimary?.getBoundingClientRect?.().top ?? primaryTop;
        const liveSecondary = findTextBetweenY("Secondary category", livePrimaryTop + 1, window.innerHeight, categoryDialog);
        const liveMaxY = liveSecondary
          ? liveSecondary.getBoundingClientRect().top - 1
          : Math.min(window.innerHeight, livePrimaryTop + 260);
        await openSelectedStoreCategoryChooser(categoryDialog, livePrimaryTop, liveMaxY);
      }
      picker = await U.waitFor(() => findPickerContainingDestination(), 30000, 250);
    }
    if (!picker && !alreadySelected) {
      await recordMove99Diagnostic("Move .99 could not open the Store category picker.", categoryDialog);
      throw new Error("The Store category picker did not open.");
    }
    if (picker) {
      const destination = queryAllDeep('label, span, div, li, [role="option"], [role="radio"], button', picker)
        .filter(U.isVisible)
        .filter((element) => normalizedElementText(element) === U.normalizeText(MOVE99_DESTINATION_CATEGORY))
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (ar.width * ar.height) - (br.width * br.height);
      })[0] || null;
      if (!destination) {
        await recordMove99Diagnostic(`Move .99 Store category picker did not contain ${MOVE99_DESTINATION_CATEGORY}.`, picker);
        throw new Error(`The destination category “${MOVE99_DESTINATION_CATEGORY}” was not found.`);
      }
      clickDeepText(destination);
      await recordMove99Trace("Destination Store category selected.", MOVE99_DESTINATION_CATEGORY);

      const selected = await U.waitFor(() => {
        const currentPicker = findPickerContainingDestination();
        const done = currentPicker && findEnabledExactButton("Done", currentPicker);
        if (done) return { done };
        const dialog = findCategoryEditorDialog();
        const apply = dialog && findEnabledExactButton("Apply", dialog);
        return apply ? { applyReady: true } : null;
      }, 15000, 180);
      if (!selected) throw new Error("The destination was selected, but eBay did not enable Done or Apply.");
      if (selected.done) clickElement(selected.done);
    }

    const apply = await U.waitFor(() => {
      const dialog = findCategoryEditorDialog();
      return dialog && queryAllDeep('button, [role="button"]', dialog).find((element) => {
        return U.isVisible(element) && normalizedElementText(element) === "apply" && !element.disabled && element.getAttribute?.("aria-disabled") !== "true";
      });
    }, 15000, 180);
    if (!apply) throw new Error("The category was selected, but Apply did not become available.");
    clickElement(apply);
    await recordMove99Trace("Category Apply clicked.", `expected=${expectedCount}`);

    const update = await waitForCategoryApplyResult(expectedCount, 90000);
    if (!update) throw new Error("eBay did not confirm that the Store category was applied to the selected drafts.");
    if (expectedCount && update.attempted && update.attempted !== expectedCount) {
      throw new Error(`eBay reported ${update.attempted} selected drafts, but ${expectedCount} were expected.`);
    }
    if (expectedCount && Number(update.updated || 0) !== expectedCount) {
      throw new Error(`eBay confirmed the Store category in ${Number(update.updated || 0)} of ${expectedCount} drafts. Submit was not touched.`);
    }
    const nativeAfterApply = nativeBulkSelectionSummary();
    if (expectedCount && nativeAfterApply && nativeAfterApply.selected !== expectedCount) {
      throw new Error(
        `Safety stop: eBay selected ${nativeAfterApply.selected} listings after the category edit, `
        + `but only ${expectedCount} verified listings were allowed. Submit was not touched.`
      );
    }
    const submitCount = parseBulkEditorSubmitTotal();
    const acceptedSubmitCounts = new Set(
      [Number(expectedCount || 0), Number(workspaceTotal || 0)].filter((count) => count > 0)
    );
    if (expectedCount && submitCount && !acceptedSubmitCounts.has(submitCount)) {
      throw new Error(
        `Safety stop: eBay's Submit count is ${submitCount}, but the verified batch is ${expectedCount} `
        + `inside a ${Number(workspaceTotal || expectedCount)}-listing workspace. `
        + "Submit was not touched."
      );
    }
    await recordMove99Trace("Category update confirmed.", JSON.stringify(update));
    const submitReady = await U.waitFor(findMove99SubmitButton, 90000, 300);
    if (!submitReady) throw new Error("The Store category grid updated, but eBay's Submit button was not found.");
    submitReady.scrollIntoView?.({ block: "center", inline: "center" });
    await recordMove99Trace("Final Submit located and left untouched.", `expected=${expectedCount}`);
    return update;
  }

  function elementArea(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function isEnabledAction(element) {
    return Boolean(element)
      && U.isVisible(element)
      && !element.disabled
      && element.getAttribute?.("aria-disabled") !== "true";
  }

  function findEnabledExactButton(text, root = document) {
    const target = U.normalizeText(text);
    return queryAllDeep('button, [role="button"], a', root)
      .filter(isEnabledAction)
      .filter((element) => normalizedElementText(element) === target)
      .sort((a, b) => elementArea(a) - elementArea(b))[0] || null;
  }

  function findBulkGridHeader(label) {
    const target = U.normalizeText(label);
    return uniqueElements(queryAllDeep('th, [role="columnheader"], button, div, span')
      .filter(U.isVisible)
      .filter((element) => normalizedElementText(element) === target)
      .map((element) => element.closest?.('th, [role="columnheader"]') || element))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        if (Math.abs(ar.top - br.top) > 3) return ar.top - br.top;
        return elementArea(a) - elementArea(b);
      })[0] || null;
  }

  function findCustomizeColumnsDialog() {
    return queryAllDeep('[role="dialog"], dialog, [aria-modal="true"], .dialog, .lightbox-dialog')
      .filter(U.isVisible)
      .filter((dialog) => {
        const text = normalizedElementText(dialog);
        return text.includes("customize columns") && text.includes("apply");
      })
      .sort((a, b) => elementArea(a) - elementArea(b))[0] || null;
  }

  async function ensureStoreCategoryColumnVisible() {
    const existing = findBulkGridHeader("Store category 1");
    if (existing) {
      existing.scrollIntoView?.({ block: "nearest", inline: "center" });
      return existing;
    }

    const customize = await U.waitFor(() => findSmallestExactText("Customize columns", "button, [role='button']"), 10000, 180);
    if (!customize) throw new Error("Store category is not visible, and Customize columns was not found.");
    clickElement(customize);

    const dialog = await U.waitFor(findCustomizeColumnsDialog, 10000, 180);
    if (!dialog) throw new Error("Customize columns did not open.");

    const storeCheckbox = findCheckboxNearExactText("Store category 1", dialog);
    if (!storeCheckbox?.control) throw new Error("Customize columns opened, but Store category 1 was not available.");
    if (!controlChecked(storeCheckbox.control)) {
      clickElement(storeCheckbox.clickTarget || storeCheckbox.control);
      const checked = await U.waitFor(() => controlChecked(storeCheckbox.control), 5000, 120);
      if (!checked) throw new Error("Store category 1 could not be selected in Customize columns.");
    }

    const apply = await U.waitFor(() => findEnabledExactButton("Apply", dialog), 8000, 150);
    if (!apply) throw new Error("Store category 1 was selected, but Apply was not available.");
    clickElement(apply);

    const header = await U.waitFor(() => findBulkGridHeader("Store category 1"), 20000, 250);
    if (!header) throw new Error("Store category 1 did not appear in the Bulk Edit grid.");
    header.scrollIntoView?.({ block: "nearest", inline: "center" });
    return header;
  }

  function sourceOrDestinationCategoryText(element) {
    const text = normalizedElementText(element);
    const allowed = [...MOVE99_SOURCE_CATEGORIES, MOVE99_DESTINATION_CATEGORY].map((value) => U.normalizeText(value));
    return allowed.includes(text) ? text : "";
  }

  function storeCategoryGridUpdate(expectedCount = 0) {
    const header = findBulkGridHeader("Store category 1");
    if (!header) return null;
    header.scrollIntoView?.({ block: "nearest", inline: "center" });
    const headerRect = header.getBoundingClientRect();
    const destination = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    const sourceCategories = MOVE99_SOURCE_CATEGORIES.map((value) => U.normalizeText(value));
    const rowMap = new Map();
    queryAllDeep('td[role="gridcell"], [role="gridcell"]')
      .filter(U.isVisible)
      .forEach((element) => {
        const categoryText = sourceOrDestinationCategoryText(element);
        if (!categoryText) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        if (centerX < headerRect.left - 12 || centerX > headerRect.right + 12 || rect.top <= headerRect.bottom - 2) return;
        const rowKey = element.closest?.('tr, [role="row"]') || String(Math.round(rect.top));
        const current = rowMap.get(rowKey);
        if (!current || elementArea(element) < current.area) {
          rowMap.set(rowKey, { text: categoryText, area: elementArea(element) });
        }
      });
    const values = [...rowMap.values()].map((row) => row.text);
    const destinationCount = values.filter((text) => text === destination).length;
    const sourceCount = values.filter((text) => sourceCategories.includes(text)).length;
    const attempted = Number(expectedCount || destinationCount || values.length || 0);
    const completeVisibleBatch = expectedCount
      ? values.length === expectedCount && destinationCount === expectedCount
      : Boolean(destinationCount) && destinationCount === values.length;
    return {
      ok: completeVisibleBatch && sourceCount === 0,
      updated: destinationCount,
      attempted,
      gridVerified: true
    };
  }

  function findVisibleStoreCategoryCell() {
    const header = findBulkGridHeader("Store category 1");
    if (!header) return null;
    header.scrollIntoView?.({ block: "nearest", inline: "center" });
    const headerRect = header.getBoundingClientRect();
    const candidates = queryAllDeep('td, [role="gridcell"], span, button, [role="button"], div')
      .filter(U.isVisible)
      .map((element) => {
        const categoryText = sourceOrDestinationCategoryText(element);
        if (!categoryText) return null;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const aligned = centerX >= headerRect.left - 12 && centerX <= headerRect.right + 12;
        const belowHeader = rect.top > headerRect.bottom - 2;
        if (!aligned || !belowHeader) return null;
        const clickable = element.matches?.('button, [role="button"], a')
          ? element
          : queryAllDeep('button, [role="button"], a, label, span', element)
            .filter(U.isVisible)
            .filter((candidate) => sourceOrDestinationCategoryText(candidate) === categoryText)
            .sort((a, b) => elementArea(a) - elementArea(b))[0] || element;
        return { element, clickable, rect, categoryText };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (Math.abs(a.rect.top - b.rect.top) > 3) return a.rect.top - b.rect.top;
        return elementArea(a.element) - elementArea(b.element);
      });
    return candidates[0] || null;
  }

  function findStoreCategoryListingDialog() {
    return queryAllDeep('[role="dialog"], dialog, [aria-modal="true"], .dialog, .lightbox-dialog')
      .filter(U.isVisible)
      .filter((dialog) => {
        const text = normalizedElementText(dialog);
        return text.includes("category")
          && text.includes("item category")
          && text.includes("store category")
          && text.includes("save and next")
          && /\b\d+\s+of\s+[\d,]+\s+listings?\b/i.test(dialog.innerText || dialog.textContent || "");
      })
      .sort((a, b) => elementArea(a) - elementArea(b))[0] || null;
  }

  function storeDialogPosition(dialog) {
    const raw = String(dialog?.innerText || dialog?.textContent || "");
    const match = raw.match(/\b(\d+)\s+of\s+([\d,]+)\s+listings?\b/i);
    if (!match) return null;
    return {
      current: Number(match[1].replace(/,/g, "")),
      total: Number(match[2].replace(/,/g, ""))
    };
  }

  function findStoreCategorySectionHeading(dialog) {
    const exact = findExactTextDeep("Store category", dialog, 'h1, h2, h3, [role="heading"], div, span, p');
    if (exact) return exact;
    return queryAllDeep('h1, h2, h3, [role="heading"], div, span, p', dialog)
      .filter(U.isVisible)
      .filter((element) => normalizedElementText(element).includes("store category"))
      .sort((a, b) => elementArea(a) - elementArea(b))[0] || null;
  }

  function findStoreFirstCategoryButton(dialog) {
    const heading = findStoreCategorySectionHeading(dialog);
    if (!heading) return null;
    const headingBottom = heading.getBoundingClientRect().bottom;
    return queryAllDeep('button, [role="button"]', dialog)
      .filter(U.isVisible)
      .filter((button) => {
        const text = normalizedElementText(button);
        const rect = button.getBoundingClientRect();
        return rect.top >= headingBottom - 2 && text.startsWith("first category");
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
  }

  function findStoreCategoryPicker() {
    const destinationTarget = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    const direct = queryAllDeep('.store-category-view')
      .filter(U.isVisible)
      .filter((picker) => {
        const text = normalizedElementText(picker);
        return text.includes("store category") && text.includes(destinationTarget) && text.includes("all categories");
      })
      .sort((a, b) => elementArea(a) - elementArea(b))[0];
    if (direct) return direct;
    return findPickerContainingDestination();
  }

  function findDestinationPickerOption(picker) {
    const destinationTarget = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    return queryAllDeep('label, [role="radio"], [role="option"], button, div, span, li', picker)
      .filter(U.isVisible)
      .filter((element) => normalizedElementText(element) === destinationTarget)
      .sort((a, b) => elementArea(a) - elementArea(b))[0] || null;
  }

  async function setOpenListingStoreCategory() {
    const dialog = await U.waitFor(findStoreCategoryListingDialog, 30000, 250);
    if (!dialog) throw new Error("The Store category listing editor did not open.");
    const firstCategory = findStoreFirstCategoryButton(dialog);
    if (!firstCategory) throw new Error("The Store category section opened, but its First category field was not found.");
    const currentText = normalizedElementText(firstCategory).replace(/^first category\s+/, "");
    if (currentText === U.normalizeText(MOVE99_DESTINATION_CATEGORY)) return false;

    clickElement(firstCategory);
    const picker = await U.waitFor(findStoreCategoryPicker, 15000, 180);
    if (!picker) throw new Error("The Store category picker did not open.");
    const destination = findDestinationPickerOption(picker);
    if (!destination) throw new Error(`The destination category "${MOVE99_DESTINATION_CATEGORY}" was not found.`);
    clickDeepText(destination);

    const selected = await U.waitFor(() => {
      const currentPicker = findStoreCategoryPicker();
      if (!currentPicker) return null;
      const selectedSection = queryAllDeep('.selectedOptions, .selected-options, div, span', currentPicker)
        .filter(U.isVisible)
        .filter((element) => normalizedElementText(element).includes("selected"))
        .sort((a, b) => elementArea(a) - elementArea(b))[0] || currentPicker;
      return normalizedElementText(selectedSection).includes(U.normalizeText(MOVE99_DESTINATION_CATEGORY));
    }, 7000, 150);
    if (!selected) throw new Error(`The Store category picker did not select "${MOVE99_DESTINATION_CATEGORY}".`);

    const doneOrUpdated = await U.waitFor(() => {
      const updatedDialog = findStoreCategoryListingDialog();
      const updatedFirstCategory = updatedDialog && findStoreFirstCategoryButton(updatedDialog);
      if (updatedFirstCategory && normalizedElementText(updatedFirstCategory).includes(U.normalizeText(MOVE99_DESTINATION_CATEGORY))) {
        return { updated: true };
      }
      const pickerDone = findStoreCategoryPicker() && findEnabledExactButton("Done", findStoreCategoryPicker());
      return pickerDone ? { done: pickerDone } : null;
    }, 8000, 150);
    if (!doneOrUpdated) throw new Error("The Store category picker selected the destination, but the Store category field did not update.");
    if (doneOrUpdated.done) clickElement(doneOrUpdated.done);

    const updated = await U.waitFor(() => {
      const updatedDialog = findStoreCategoryListingDialog();
      const updatedFirstCategory = updatedDialog && findStoreFirstCategoryButton(updatedDialog);
      return updatedFirstCategory
        && normalizedElementText(updatedFirstCategory).includes(U.normalizeText(MOVE99_DESTINATION_CATEGORY));
    }, 15000, 180);
    if (!updated) throw new Error("The Store category field did not update to the destination.");
    return true;
  }

  function findStoreCategorySaveButton(dialog, atLastListing) {
    const buttons = queryAllDeep('button, [role="button"]', dialog).filter(isEnabledAction);
    const target = buttons.find((button) => normalizedElementText(button) === "save and next");
    if (target) return target;
    if (!atLastListing) return null;
    return buttons.find((button) => {
      const text = normalizedElementText(button);
      return text === "save" || text === "save and close";
    }) || null;
  }

  function findMove99SubmitButton() {
    const bulkSubmit = [...document.querySelectorAll('button, [role="button"]')].find((element) => {
      if (!isEnabledAction(element)) return false;
      const text = (element.innerText || element.textContent || "").trim();
      return /^Submit(?:\s*\([\d,]+\))?$/i.test(text);
    }) || null;
    if (bulkSubmit || !isMove99SingleListingEditorPage()) return bulkSubmit;
    return [...document.querySelectorAll('button, [role="button"]')].find((element) => {
      if (!isEnabledAction(element)) return false;
      return U.normalizeText(element.innerText || element.textContent || element.getAttribute?.("aria-label") || "") === "revise it";
    }) || null;
  }

  function selectedStoreCategoryGridUpdate(expectedCount = 0) {
    const expected = Number(expectedCount || 0);
    if (!expected) return null;
    const nativeSelection = nativeBulkSelectionSummary();
    if (!nativeSelection || nativeSelection.selected !== expected) return null;

    const selectedRows = renderedBulkRows().filter(({ checkbox }) => controlChecked(checkbox));
    if (selectedRows.length !== expected) return null;
    const destination = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    const updated = selectedRows.filter(({ row }) => {
      return queryAllDeep('td, [role="gridcell"], button, [role="button"], span, div', row)
        .some((element) => normalizedElementText(element) === destination);
    }).length;
    if (updated !== expected) return null;
    return {
      ok: true,
      updated,
      attempted: expected,
      gridVerified: true,
      source: "selected-grid-draft-cross-check"
    };
  }

  function findSingleListingStoreCategoryDialog() {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].find((dialog) => {
      if (!U.isVisible(dialog)) return false;
      return [...dialog.querySelectorAll("h1, h2, h3")].some((heading) => U.normalizeText(heading.textContent || "") === "store category");
    }) || null;
  }

  function findSingleListingStoreCategoryButton() {
    return [...document.querySelectorAll('button[name="primaryStoreCategoryId"]')]
      .find((button) => isEnabledAction(button)) || null;
  }

  async function choosePrimaryStoreCategorySingleListing(expectedCount, state) {
    if (Number(expectedCount) !== 1 || (state.currentBatchIds || []).length !== 1) {
      throw new Error("The single-listing editor opened without exactly one audited listing.");
    }
    const expectedId = String(state.currentBatchIds[0] || "");
    const actualId = singleListingEditorItemId();
    if (!expectedId || !actualId || actualId !== expectedId) {
      throw new Error(`The single-listing editor opened item ${actualId || "(unknown)"}, but the audited batch expected ${expectedId || "(unknown)"}.`);
    }

    const categoryButton = await U.waitFor(findSingleListingStoreCategoryButton, 30000, 200);
    if (!categoryButton) throw new Error("The single-listing Store category control was not found.");
    const currentCategory = U.normalizeText(categoryButton.innerText || categoryButton.textContent || "");
    const destinationCategory = U.normalizeText(MOVE99_DESTINATION_CATEGORY);
    const sourceCategories = new Set(MOVE99_SOURCE_CATEGORIES.map(U.normalizeText));
    if (currentCategory === destinationCategory) return { attempted: 1, changed: 0, singleListing: true };
    if (!sourceCategories.has(currentCategory)) {
      throw new Error(`The audited listing currently shows Store category "${currentCategory || "(blank)"}", not an approved source category.`);
    }

    let dialog = findSingleListingStoreCategoryDialog();
    if (!dialog) {
      clickElement(categoryButton);
      dialog = await U.waitFor(findSingleListingStoreCategoryDialog, 15000, 180);
    }
    if (!dialog) throw new Error("The single-listing Store category picker did not open.");

    const destinationLabel = [...dialog.querySelectorAll("label")].find((label) => {
      return U.isVisible(label) && U.normalizeText(label.textContent || "") === destinationCategory;
    }) || null;
    if (!destinationLabel) throw new Error(`The destination category "${MOVE99_DESTINATION_CATEGORY}" was not found in the single-listing picker.`);
    clickElement(destinationLabel);

    const destinationSelected = await U.waitFor(() => {
      const currentDialog = findSingleListingStoreCategoryDialog();
      const label = currentDialog && [...currentDialog.querySelectorAll("label")].find((item) => U.normalizeText(item.textContent || "") === destinationCategory);
      const input = label?.htmlFor ? document.getElementById(label.htmlFor) : label?.closest("div")?.querySelector('input[type="radio"]');
      return input?.checked ? true : null;
    }, 8000, 150);
    if (!destinationSelected) throw new Error(`The single-listing picker did not select "${MOVE99_DESTINATION_CATEGORY}".`);

    const done = [...dialog.querySelectorAll('button, [role="button"]')].find((button) => {
      return isEnabledAction(button) && U.normalizeText(button.innerText || button.textContent || "") === "done";
    }) || null;
    if (!done) throw new Error("The single-listing Store category Done button was not found.");
    clickElement(done);

    const updated = await U.waitFor(() => {
      const button = findSingleListingStoreCategoryButton();
      return button && U.normalizeText(button.innerText || button.textContent || "") === destinationCategory ? true : null;
    }, 15000, 180);
    if (!updated) throw new Error(`The single listing did not update to Store category "${MOVE99_DESTINATION_CATEGORY}".`);
    return { attempted: 1, changed: 1, singleListing: true };
  }

  async function pauseMove99AtReviewScreen(categoryUpdate, state, batchCount) {
    const submitButton = await U.waitFor(findMove99SubmitButton, 15000, 180);
    if (!submitButton) throw new Error("The Store category was saved, but the eBay review Submit button was not found.");
    submitButton.scrollIntoView?.({ block: "center", inline: "center" });
    const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
    if (!tabInfo?.ok || !Number.isInteger(tabInfo.tabId)) {
      throw new Error("The final eBay review tab could not be identified. Submit was left untouched.");
    }
    const batchIds = [...new Set((state.currentBatchIds || []).map(String).filter(Boolean))];
    const currentBatchKey = state.currentBatchKey
      || `${state.runId || state.startedAt || "move99"}:${Number(state.applyIndex || 0)}:${Number(state.currentBatchOffset || state.pageBatchOffset || 0)}:${batchIds.join("-") || batchCount}`;
    try {
      sessionStorage.removeItem(MOVE99_APPROVAL_ACTION_SESSION_KEY);
    } catch (_) {
      // The storage checkpoint below remains authoritative if sessionStorage is unavailable.
    }
    const approvalState = {
      ...state,
      active: false,
      ownerTabId: tabInfo.tabId,
      phase: "awaiting-submit-approval",
      reviewReady: true,
      currentBatchCount: batchCount,
      currentBatchKey,
      categoryUpdate,
      approvalTabId: tabInfo.tabId,
      approvalUrl: location.href,
      approvalWorkspaceId: currentBulkWorkspaceId(),
      approvalActionObservedAt: "",
      reviewReadyAt: new Date().toISOString()
    };
    await storageSet({
      pendingMove99Run: approvalState
    });
    armMove99SubmitApprovalClick(submitButton, approvalState);
    const finalAction = isMove99SingleListingEditorPage() ? "Revise it" : "Submit";
    renderStatus(`eBay ${finalAction} is ready. Store category is ${MOVE99_DESTINATION_CATEGORY}. Waiting for approval before ${finalAction}.`, "completed");
  }

  function nextMove99BatchState(state) {
    if (state.applyStrategy === MOVE99_EXACT_APPLY_STRATEGY) {
      return {
        ...state,
        active: true,
        phase: "apply-exact-workspace",
        reviewReady: false,
        applyIndex: Number(state.applyIndex || 0) + 1,
        currentBatchIds: [],
        currentBatchCount: 0,
        currentBatchSourceCount: 0,
        currentBatchKey: "",
        submitResult: null,
        submitResultUnknown: false
      };
    }
    if (state.applyStrategy === MOVE99_DIRECT_APPLY_STRATEGY) {
      return {
        ...state,
        active: true,
        phase: "active-prepare",
        reviewReady: false,
        directRangeStart: 1,
        currentBatchIds: [],
        currentBatchCount: 0,
        currentBatchSourceCount: 0,
        currentBatchKey: "",
        currentEditRange: null,
        submitResult: null,
        submitResultUnknown: false
      };
    }
    if (state.applyStrategy === MOVE99_APPLY_STRATEGY) {
      const applyRanges = Array.isArray(state.applyRanges) ? state.applyRanges : [];
      const applyIndex = Number(state.applyIndex || 0);
      const currentRange = applyRanges[applyIndex];
      return {
        ...state,
        active: true,
        phase: "apply-range",
        reviewReady: false,
        applyIndex: applyIndex + 1,
        currentBatchIds: [],
        currentBatchCount: 0,
        currentBatchSourceCount: 0,
        currentBatchOffset: 0,
        currentPageTotalIds: 0,
        currentBatchKey: "",
        currentEditRange: null,
        submitResult: null,
        submitResultUnknown: false,
        completedApplyRanges: [
          ...new Set([
            ...(state.completedApplyRanges || []),
            currentRange ? `${currentRange.rangeStart}-${currentRange.rangeEnd}` : ""
          ].filter(Boolean))
        ]
      };
    }
    const applyPages = Array.isArray(state.applyPages) ? state.applyPages : [];
    const applyIndex = Number(state.applyIndex || 0);
    const currentOffset = Number(state.currentBatchOffset || state.pageBatchOffset || 0);
    const selectedCount = Number(state.currentBatchSourceCount || state.currentBatchIds?.length || state.currentBatchCount || 0);
    const pageTotal = Number(state.currentPageTotalIds || 0);
    const nextOffset = currentOffset + selectedCount;
    if (pageTotal && nextOffset < pageTotal) {
      return {
        ...state,
        active: true,
        phase: "apply-page",
        reviewReady: false,
        pageBatchOffset: nextOffset,
        currentBatchIds: [],
        currentBatchCount: 0,
        currentBatchSourceCount: 0,
        currentBatchOffset: 0,
        currentPageTotalIds: pageTotal,
        currentBatchKey: "",
        submitResult: null,
        submitResultUnknown: false
      };
    }
    return {
      ...state,
      active: true,
      phase: "apply-page",
      reviewReady: false,
      applyIndex: applyIndex + 1,
      pageBatchOffset: 0,
      currentBatchIds: [],
      currentBatchCount: 0,
      currentBatchSourceCount: 0,
      currentBatchOffset: 0,
      currentPageTotalIds: 0,
      currentBatchKey: "",
      submitResult: null,
      submitResultUnknown: false,
      completedApplyPages: [...new Set([...(state.completedApplyPages || []), applyPages[applyIndex]].filter(Boolean))]
    };
  }

  function parseMove99SubmitResult(raw, expectedCount = 0) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    const expected = Number(expectedCount || 0);
    const liveValues = [...text.matchAll(/\b([\d,]+)\s+listings?\s+(?:are|is)\s+now\s+live\b/gi)]
      .map((match) => Number(match[1].replace(/,/g, "")))
      .filter(Number.isFinite);
    const singleRevised = /\byour listing (?:was|has been) revised\b/i.test(text);
    const failedValues = [...text.matchAll(/\b([\d,]+)\s+listings?\s+(?:failed|could not be revised|were not revised|weren't revised)\b/gi)]
      .map((match) => Number(match[1].replace(/,/g, "")))
      .filter(Number.isFinite);
    if (!liveValues.length && !singleRevised && !failedValues.length) return null;

    const live = expected && liveValues.includes(expected)
      ? expected
      : Number(liveValues.at(-1) ?? (singleRevised ? 1 : 0));
    const failed = Number(failedValues.at(-1) || 0);
    const accounted = live + failed;
    return {
      confirmed: !expected || accounted === expected,
      expected,
      accounted,
      live,
      failed,
      capturedAt: new Date().toISOString()
    };
  }

  function move99ApprovalMarkerMatches(state, marker) {
    if (!state || !marker) return false;
    return String(marker.runId || "") === String(state.runId || state.startedAt || "")
      && String(marker.batchKey || "") === String(state.currentBatchKey || "");
  }

  function readMove99ApprovalActionMarker(state) {
    try {
      const marker = JSON.parse(sessionStorage.getItem(MOVE99_APPROVAL_ACTION_SESSION_KEY) || "null");
      return move99ApprovalMarkerMatches(state, marker) ? marker : null;
    } catch (_) {
      return null;
    }
  }

  async function recordMove99ApprovalAction(state) {
    const marker = {
      runId: String(state.runId || state.startedAt || ""),
      batchKey: String(state.currentBatchKey || ""),
      tabId: Number(state.approvalTabId),
      action: isMove99SingleListingEditorPage() ? "revise-it" : "submit",
      observedAt: new Date().toISOString()
    };
    try {
      sessionStorage.setItem(MOVE99_APPROVAL_ACTION_SESSION_KEY, JSON.stringify(marker));
    } catch (_) {
      // Chrome local storage below is sufficient when sessionStorage is unavailable.
    }
    const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
    if (!tabInfo?.ok || Number(tabInfo.tabId) !== Number(state.approvalTabId)) return false;
    const stored = await storageGet(["pendingMove99Run"]);
    const pending = stored.pendingMove99Run;
    if (!move99ApprovalMarkerMatches(pending, marker) || pending.phase !== "awaiting-submit-approval") return false;
    await storageSet({
      pendingMove99Run: {
        ...pending,
        approvalActionObservedAt: marker.observedAt,
        approvalAction: marker.action
      }
    });
    return true;
  }

  function armMove99SubmitApprovalClick(submitButton, state) {
    if (!submitButton || submitButton.dataset.gldnMove99ApprovalArmed === String(state.currentBatchKey || "")) return;
    submitButton.dataset.gldnMove99ApprovalArmed = String(state.currentBatchKey || "");
    submitButton.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      void recordMove99ApprovalAction(state).catch((error) => {
        if (!invalidContextError(error)) {
          U.recordExtensionLog({ source: "move99", operation: "approval-click", level: "error", message: error?.message || String(error) });
        }
      });
    }, { capture: true });
  }

  async function currentMove99ApprovalState(state) {
    if (state.approvalActionObservedAt) return state;
    const marker = readMove99ApprovalActionMarker(state);
    if (!marker) return state;
    const refreshed = { ...state, approvalActionObservedAt: marker.observedAt, approvalAction: marker.action };
    await storageSet({ pendingMove99Run: refreshed });
    return refreshed;
  }

  async function stopMove99AfterLostApproval(state, reason) {
    const stopped = {
      ...state,
      active: false,
      ownerTabId: state.approvalTabId ?? state.ownerTabId ?? null,
      phase: "approval-lost",
      reviewReady: false,
      approvalLostAt: new Date().toISOString(),
      approvalLostReason: reason,
      error: reason
    };
    await storageSet({ pendingMove99Run: stopped, lastMove99Scan: stopped });
    renderStatus(`Move .99 stopped safely. ${reason} No new tab or batch was started.`, "error");
    return false;
  }

  function canRecoverMove99ThroughVerification(state) {
    if (!state || state.scanStrategy !== MOVE99_SCAN_STRATEGY || state.scanIntegrity !== "verified") return false;
    if (Number(state.uniqueInspected || 0) !== Number(state.filteredCount || 0)) return false;
    return Object.keys(state.scanPages || {}).length > 0;
  }

  function recoverMove99ThroughVerification(state, reason = "") {
    const recoveryBatchIds = [...new Set((state.currentBatchIds || []).map(String).filter(Boolean))];
    const recoveryHistory = Array.isArray(state.recoveryHistory) ? [...state.recoveryHistory] : [];
    recoveryHistory.push({
      phase: state.phase || "unknown",
      batchKey: state.currentBatchKey || "",
      itemIds: recoveryBatchIds,
      reason: reason || "Submission outcome required verification.",
      recoveredAt: new Date().toISOString()
    });
    return {
      ...state,
      active: true,
      confirmed: true,
      phase: "verify-page",
      currentPage: 1,
      verificationPages: {},
      reviewReady: false,
      submitResultUnknown: true,
      recoveryReason: reason || "Submission outcome required verification.",
      recoveryHistory: recoveryHistory.slice(-50),
      currentBatchIds: [],
      currentBatchCount: 0,
      currentBatchSourceCount: 0,
      currentBatchOffset: 0,
      currentPageTotalIds: 0,
      currentBatchKey: ""
    };
  }

  function pauseMove99ForReconciliation(state, reason = "") {
    return {
      ...state,
      active: false,
      confirmed: false,
      ownerTabId: null,
      phase: "reconciliation-required",
      reviewReady: false,
      reconciliationRequiredAt: new Date().toISOString(),
      reconciliationReason: reason || "The last Move .99 batch needs a read-only verification pass.",
      error: reason || state.error || "The last Move .99 batch needs reconciliation."
    };
  }

  function recordMove99SubmittedBatch(state, result) {
    const batchKey = state.currentBatchKey || `${state.runId || state.startedAt || "move99"}:${Number(state.applyIndex || 0)}:${Number(state.currentBatchOffset || state.pageBatchOffset || 0)}`;
    const submittedBatchKeys = new Set((state.submittedBatchKeys || []).map(String));
    if (submittedBatchKeys.has(batchKey)) return state;

    const sourceIds = [...new Set((state.currentBatchIds || []).map(String).filter(Boolean))];
    const omitted = new Set((state.bulkEditorOmittedIds || []).map(String));
    const admittedIds = sourceIds.filter((itemId) => !omitted.has(itemId));
    const exactAllLive = result.confirmed
      && result.failed === 0
      && result.live === Number(state.currentBatchCount || admittedIds.length || 0);
    const processedIds = new Set((state.processedIds || []).map(String));
    if (exactAllLive) admittedIds.forEach((itemId) => processedIds.add(itemId));
    const failedIds = new Set((state.failedIds || []).map(String));
    sourceIds.filter((itemId) => omitted.has(itemId)).forEach((itemId) => failedIds.add(itemId));
    if (!exactAllLive) admittedIds.forEach((itemId) => failedIds.add(itemId));

    submittedBatchKeys.add(batchKey);
    const batchHistory = Array.isArray(state.batchHistory) ? [...state.batchHistory] : [];
    batchHistory.push({
      batchKey,
      itemIds: sourceIds,
      admittedIds,
      expected: Number(state.currentBatchCount || 0),
      live: Number(result.live || 0),
      failed: Number(result.failed || 0),
      confirmed: Boolean(result.confirmed),
      capturedAt: result.capturedAt || new Date().toISOString()
    });
    const totals = state.totals || {};
    return {
      ...state,
      processedIds: [...processedIds],
      failedIds: [...failedIds],
      submittedBatchKeys: [...submittedBatchKeys],
      batchHistory: batchHistory.slice(-100),
      submitResult: result,
      totals: {
        batches: Number(totals.batches || 0) + 1,
        selected: Number(totals.selected || 0) + Number(state.currentBatchSourceCount || sourceIds.length || state.currentBatchCount || 0),
        categoryApplied: Number(totals.categoryApplied || 0) + Number(state.currentBatchCount || 0),
        live: Number(totals.live || 0) + Number(result.live || 0),
        failed: Number(totals.failed || 0) + Number(result.failed || 0)
      }
    };
  }

  async function resumeMove99AfterManualSubmit(state) {
    if (await stopForEbayInterruption("Move .99 submission review")) return false;
    if (state.phase !== "awaiting-submit-approval") return false;
    const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
    if (!tabInfo?.ok || Number(tabInfo.tabId) !== Number(state.approvalTabId ?? state.ownerTabId)) return false;
    const visibleSubmit = findMove99SubmitButton();
    if (visibleSubmit) {
      armMove99SubmitApprovalClick(visibleSubmit, state);
      const finalAction = isMove99SingleListingEditorPage() ? "Revise it" : "Submit";
      renderStatus(`eBay ${finalAction} is ready. Store category is ${MOVE99_DESTINATION_CATEGORY}. Waiting for approval before ${finalAction}.`, "completed");
      return false;
    }
    if (move99SubmitMonitorRunning) return false;
    move99SubmitMonitorRunning = true;
    try {
      state = await currentMove99ApprovalState(state);
      const expectedCount = Number(state.currentBatchCount || 0);
      const outcome = await U.waitFor(() => {
        const result = parseMove99SubmitResult(document.body?.innerText || "", expectedCount);
        if (result) return { result };
        const submitButton = findMove99SubmitButton();
        if (submitButton) return { submitButton };
        return null;
      }, 30000, 300);

      if (outcome?.submitButton) {
        armMove99SubmitApprovalClick(outcome.submitButton, state);
        renderStatus("eBay Submit is still ready. Waiting for your approval.", "completed");
        return false;
      }

      state = await currentMove99ApprovalState(state);
      if (!state.approvalActionObservedAt) {
        return stopMove99AfterLostApproval(
          state,
          "The final review page changed before an approved Submit click was observed."
        );
      }

      if (!outcome?.result?.confirmed) {
        const reason = outcome?.result
          ? `eBay accounted for ${outcome.result.accounted} of ${expectedCount} submitted listings.`
          : "eBay did not show an explicit success or failure count after Submit.";
        return stopMove99AfterLostApproval(state, `${reason} The saved batch requires manual reconciliation.`);
      }

      const recorded = recordMove99SubmittedBatch(state, outcome.result);
      const next = nextMove99BatchState(recorded);
      await storageSet({ pendingMove99Run: next });
      renderStatus(`eBay confirmed ${outcome.result.live.toLocaleString()} live and ${outcome.result.failed.toLocaleString()} failed. Continuing the saved workflow...`, outcome.result.failed ? "error" : "ready");
      if (!isMove99ActiveListingsPage()) {
        await navigateToMove99ScanPage(1, next.filteredUrl || MOVE99_ACTIVE_URL);
        return true;
      }
      setTimeout(runMove99Automation, 700);
      return true;
    } finally {
      move99SubmitMonitorRunning = false;
    }
  }

  async function choosePrimaryStoreCategoryOneByOne(expectedCount = 0) {
    await ensureStoreCategoryColumnVisible();
    const cell = await U.waitFor(findVisibleStoreCategoryCell, 15000, 180);
    if (!cell) throw new Error("Store category 1 is visible, but no editable Store category cell was found.");
    clickElement(cell.clickable);

    const firstDialog = await U.waitFor(findStoreCategoryListingDialog, 45000, 250);
    if (!firstDialog) throw new Error("The Store category listing editor did not open.");
    const firstPosition = storeDialogPosition(firstDialog);
    const attempted = Number(firstPosition?.total || expectedCount || 0);
    if (!attempted) throw new Error("The Store category editor opened, but the selected listing count was not shown.");
    if (expectedCount && attempted !== expectedCount) {
      throw new Error(`The Store category editor opened for ${attempted} listings, but ${expectedCount} were selected.`);
    }

    let changedCount = 0;
    let visited = 0;
    while (visited < attempted) {
      await ensureTaskCanContinue();
      const dialog = await U.waitFor(findStoreCategoryListingDialog, 45000, 250);
      if (!dialog) throw new Error("The Store category editor closed before every listing was reviewed.");
      const position = storeDialogPosition(dialog);
      const current = Number(position?.current || visited + 1);
      if (position?.total && position.total !== attempted) {
        throw new Error(`The Store category editor count changed from ${attempted} to ${position.total}.`);
      }
      renderStatus(`Changing Store category ${current} of ${attempted} to ${MOVE99_DESTINATION_CATEGORY}...`, "ready");
      const changed = await setOpenListingStoreCategory();
      if (changed) changedCount += 1;

      const atLastListing = current >= attempted;
      const save = findStoreCategorySaveButton(findStoreCategoryListingDialog(), atLastListing);
      if (!save) throw new Error("The Store category field changed, but Save and next was not available.");
      clickElement(save);
      visited = Math.max(visited + 1, current);

      if (atLastListing) {
        await U.waitFor(() => !findStoreCategoryListingDialog(), 60000, 300);
        break;
      }

      const advanced = await U.waitFor(() => {
        const nextDialog = findStoreCategoryListingDialog();
        const nextPosition = nextDialog && storeDialogPosition(nextDialog);
        return nextPosition && nextPosition.current > current ? nextPosition : null;
      }, 60000, 300);
      if (!advanced) throw new Error("eBay did not advance to the next selected listing after saving.");
    }

    const submitReady = await U.waitFor(findMove99SubmitButton, 90000, 300);
    if (!submitReady) throw new Error("Store category drafts were saved, but the final eBay review Submit button was not found.");
    submitReady.scrollIntoView?.({ block: "center", inline: "center" });
    return { updated: attempted, attempted, changed: changedCount };
  }


  function activeListingItemId(row) {
    const text = String(row?.innerText || row?.textContent || "");
    const explicit = text.match(/Buy It Now\s*[·•-]?\s*(\d{11,14})/i);
    if (explicit) return explicit[1];
    const ids = [...text.matchAll(/\b(\d{11,14})\b/g)].map((match) => match[1]);
    return ids.at(-1) || "";
  }

  function activeListingPrice(row) {
    if (!row) return null;
    const raw = String(row.innerText || row.textContent || "");
    const beforeFormat = raw.match(/\$\s*([\d,]+\.\d{2})[\s\S]{0,120}?Buy It Now/i);
    if (beforeFormat) return beforeFormat[1];

    const priceInputs = [...row.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')]
      .filter((input) => /^\s*\$?\s*\d[\d,]*\.\d{2}\s*$/.test(String(input.value || "")));
    const labeled = priceInputs.find((input) => {
      const label = U.normalizeText([
        input.getAttribute("aria-label"),
        input.getAttribute("name"),
        input.closest("td, [role='gridcell']")?.innerText
      ].filter(Boolean).join(" "));
      return label.includes("price") || label.includes("buy it now");
    });
    const input = labeled || priceInputs[0];
    return input ? String(input.value || "").replace(/[$,\s]/g, "") : null;
  }

  function activeListingTitle(row) {
    if (!row) return "";
    const links = [...row.querySelectorAll("a")]
      .filter(U.isVisible)
      .map((anchor) => String(anchor.innerText || anchor.textContent || "").trim())
      .filter((text) => text.length >= 8)
      .filter((text) => !/^(edit|restock|research prices|add or review discounts)$/i.test(text));
    return links[0] || "";
  }

  function activeListingRows() {
    const rows = [...document.querySelectorAll("tr, [role='row']")];
    const output = [];
    for (const row of rows) {
      // eBay can retain rows from the previous page in the DOM during pagination.
      // Ignore anything that is no longer rendered so stale rows are not counted twice.
      if (!U.isVisible(row)) continue;
      const text = String(row.innerText || row.textContent || "");
      if (!/Buy It Now/i.test(text)) continue;
      const itemId = activeListingItemId(row);
      if (!itemId) continue;
      const checkbox = findRowCheckbox(row);
      if (!checkbox) continue;
      const price = activeListingPrice(row);
      if (!price) continue;
      output.push({ row, checkbox, itemId, price, title: activeListingTitle(row) });
    }
    return output;
  }

  function activeResultsInfo() {
    const body = String(document.body?.innerText || "");
    const matches = [...body.matchAll(/Results?:\s*([\d,]+)\s*[-\u2012\u2013\u2014]\s*([\d,]+)\s+of\s+([\d,]+)/gi)];
    if (!matches.length) return null;

    const url = new URL(location.href);
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const desiredStart = offset + 1;
    const parsed = matches.map((match) => {
      const start = Number(match[1].replace(/,/g, ""));
      const end = Number(match[2].replace(/,/g, ""));
      const total = Number(match[3].replace(/,/g, ""));
      // eBay sometimes leaves a stale "801-1000 of 955" range in the DOM on the last
      // page. Clamp the end to the real total so page 5 correctly expects 155 rows.
      const effectiveEnd = Math.min(end, total);
      return {
        start,
        end,
        effectiveEnd,
        total,
        expectedOnPage: Math.max(0, effectiveEnd - start + 1)
      };
    }).filter((entry) => Number.isFinite(entry.start)
      && Number.isFinite(entry.end)
      && Number.isFinite(entry.total)
      && entry.start >= 1
      && entry.start <= entry.total
      && entry.expectedOnPage > 0);

    // Prefer the range matching the URL offset. If eBay omits offset during its SPA
    // pagination, prefer a range for the currently displayed page and then the last
    // valid range. Invalid overflow ranges are already clamped above.
    const pageInfo = activePageInfo();
    const selected = parsed.find((entry) => entry.start === desiredStart)
      || parsed.find((entry) => desiredStart >= entry.start && desiredStart <= entry.effectiveEnd)
      || (pageInfo.current === pageInfo.total ? parsed.find((entry) => entry.effectiveEnd === entry.total) : null)
      || parsed.at(-1);
    if (!selected) return null;
    return selected;
  }

  function move99LogicalTotalPages(resultTotal, filteredTotal, savedTotalPages, pageInfoTotal) {
    const logicalResultTotal = Number(resultTotal || filteredTotal || 0);
    if (logicalResultTotal > 0) return Math.max(1, Math.ceil(logicalResultTotal / 200));
    return Math.max(1, Number(savedTotalPages || pageInfoTotal || 1));
  }

  function activePageInfo() {
    const body = String(document.body?.innerText || "");
    const direct = body.match(/\bPage\s*(\d+)\s*\/\s*(\d+)\b/i);
    if (direct) return { current: Number(direct[1]), total: Number(direct[2]) };

    const pageInput = [...document.querySelectorAll('input')].find((input) => {
      if (!U.isVisible(input)) return false;
      if (!/^\d+$/.test(String(input.value || "").trim())) return false;
      let node = input.parentElement;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        if (/\bPage\b/i.test(node.innerText || "") && /\/\s*\d+/.test(node.innerText || "")) return true;
      }
      return false;
    });
    if (pageInput) {
      let node = pageInput.parentElement;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        const match = String(node.innerText || "").match(/\/\s*(\d+)/);
        if (match) return { current: Number(pageInput.value || 1), total: Number(match[1]) };
      }
    }
    const results = body.match(/Results?:\s*([\d,]+)\s*[-\u2012\u2013\u2014]\s*([\d,]+)\s+of\s+([\d,]+)/i);
    if (results) {
      const end = Number(results[2].replace(/,/g, ""));
      const total = Number(results[3].replace(/,/g, ""));
      if (Number.isFinite(end) && Number.isFinite(total) && end > 0 && total > 0) {
        return { current: Math.max(1, Math.ceil(end / 200)), total: Math.max(1, Math.ceil(total / 200)) };
      }
    }
    const count = visibleFilteredListingCount();
    if (Number.isFinite(count) && count > 0) return { current: 1, total: Math.max(1, Math.ceil(count / 200)) };
    return { current: 1, total: 1 };
  }

  function activePageFingerprint() {
    return activeListingRows().slice(0, 5).map((entry) => entry.itemId).join("|");
  }

  async function goToActivePage(targetPage) {
    const info = activePageInfo();
    if (targetPage === 1 && info.total < 1) return true;
    if (info.current === targetPage) return true;
    if (targetPage < 1 || targetPage > info.total) {
      throw new Error(`Active Listings page ${targetPage} is no longer available. eBay currently shows ${info.total} pages.`);
    }
    const pageInput = [...document.querySelectorAll('input')].find((input) => {
      if (!U.isVisible(input) || !/^\d+$/.test(String(input.value || "").trim())) return false;
      let node = input.parentElement;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        if (/\bPage\b/i.test(node.innerText || "") && /\/\s*\d+/.test(node.innerText || "")) return true;
      }
      return false;
    });
    if (!pageInput) throw new Error(`I could not find eBay's page-number box to open page ${targetPage}.`);
    const before = activePageFingerprint();
    U.setNativeValue(pageInput, String(targetPage));
    pageInput.dispatchEvent(new Event("input", { bubbles: true }));
    pageInput.dispatchEvent(new Event("change", { bubbles: true }));

    const goButton = [...document.querySelectorAll('button, [role="button"]')].find((element) => {
      return U.isVisible(element)
        && U.normalizeText(element.innerText || element.textContent || "") === "go"
        && !element.disabled
        && element.getAttribute("aria-disabled") !== "true";
    });
    if (!goButton) throw new Error(`I entered page ${targetPage}, but could not find the Go button.`);
    dispatchFullClick(goButton);

    const changed = await U.waitFor(() => {
      const current = activePageInfo().current;
      const fingerprint = activePageFingerprint();
      return current === targetPage && fingerprint && (fingerprint !== before || current !== info.current) ? true : null;
    }, 30000, 300);
    if (!changed) throw new Error(`eBay did not finish opening Active Listings page ${targetPage}.`);
    return true;
  }

  function move99ScanPageUrl(targetPage, baseUrl = location.href) {
    const page = Math.max(1, Number(targetPage || 1));
    const url = new URL(String(baseUrl || MOVE99_ACTIVE_URL), "https://www.ebay.com");
    url.pathname = "/sh/lst/active";
    url.searchParams.set("offset", String((page - 1) * 200));
    url.searchParams.set("limit", "200");
    url.searchParams.set("sort", "scheduledStartDate");
    url.searchParams.delete("source");
    url.searchParams.delete("action");
    return url.toString();
  }

  async function navigateToMove99ScanPage(targetPage, baseUrl = location.href) {
    if (await stopForEbayInterruption("Move .99 page navigation")) return false;
    renderStatus(`Waiting before opening Active Listings page ${Math.max(1, Number(targetPage || 1))}...`, "ready");
    const jitter = Math.floor(Math.random() * (MOVE99_NAVIGATION_JITTER_MS + 1));
    await new Promise((resolve) => setTimeout(resolve, MOVE99_NAVIGATION_COOLDOWN_MS + jitter));
    if (await stopForEbayInterruption("Move .99 page navigation")) return false;
    location.assign(move99ScanPageUrl(targetPage, baseUrl));
    return true;
  }

  function activeSelectedCount() {
    const text = String(document.body?.innerText || "");
    const match = text.match(/\b([\d,]+)\s+(?:listing(?:s)?\s+)?selected\b/i);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
  }

  function freshActiveEntry(itemId) {
    return activeListingRows().find((entry) => String(entry.itemId) === String(itemId)) || null;
  }

  function entrySelectionState(entry) {
    if (!entry) return false;
    if (controlChecked(entry.checkbox)) return true;
    const row = entry.row;
    if (!row) return false;
    if (row.getAttribute("aria-selected") === "true" || row.dataset?.selected === "true") return true;
    if (/(?:^|\s)(?:selected|is-selected|checkbox-checked)(?:\s|$)/i.test(String(row.className || ""))) return true;
    const cell = entry.checkbox?.closest?.("td, [role='gridcell'], [role='cell']");
    return cell?.getAttribute?.("aria-selected") === "true";
  }

  function activeCheckedRowCount() {
    return activeListingRows().filter(entrySelectionState).length;
  }

  function uniqueElements(elements) {
    const seen = new Set();
    return elements.filter((element) => {
      if (!element || seen.has(element)) return false;
      seen.add(element);
      return true;
    });
  }

  function checkboxClickTargets(control, row) {
    if (!control) return [];
    const targets = [control];
    if (control.id) {
      try { targets.push(document.querySelector(`label[for="${CSS.escape(control.id)}"]`)); } catch (_) {}
    }
    targets.push(control.closest?.("label"));
    targets.push(control.closest?.("button, [role='checkbox'], [role='button']"));
    const firstCell = control.closest?.("td, [role='gridcell'], [role='cell']") || row?.querySelector?.("td, [role='gridcell'], [role='cell']");
    if (firstCell) {
      targets.push(...[...firstCell.querySelectorAll("label, button, [role='checkbox']")].filter(U.isVisible).slice(0, 5));
    }
    return uniqueElements(targets);
  }

  function dispatchSingleActivation(element) {
    if (!element) return false;
    element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
    element.focus?.({ preventScroll: true });
    try { element.click(); } catch (_) { return false; }
    return true;
  }

  async function setActiveRowSelected(itemId, desired) {
    let entry = freshActiveEntry(itemId);
    if (!entry) return false;
    entry.row.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
    await new Promise((resolve) => setTimeout(resolve, 70));
    entry = freshActiveEntry(itemId) || entry;
    if (entrySelectionState(entry) === desired) return true;

    for (const target of checkboxClickTargets(entry.checkbox, entry.row)) {
      const beforeUi = activeSelectedCount();
      const beforeCheckedRows = activeCheckedRowCount();
      dispatchSingleActivation(target);
      const changed = await U.waitFor(() => {
        const current = freshActiveEntry(itemId);
        if (current && entrySelectionState(current) === desired) return true;
        const afterUi = activeSelectedCount();
        const afterCheckedRows = activeCheckedRowCount();
        if (desired && (afterUi > beforeUi || afterCheckedRows > beforeCheckedRows)) return true;
        if (!desired && (afterUi < beforeUi || afterCheckedRows < beforeCheckedRows)) return true;
        return null;
      }, 1200, 90);
      if (changed) return true;
    }
    return false;
  }

  async function clearActivePageSelections() {
    if (activeSelectedCount() === 0 && activeCheckedRowCount() === 0) return;
    window.scrollTo({ top: 0, behavior: "auto" });
    await settleVirtualRows(350);
    let noGrowth = 0;
    let previous = -1;
    for (let cycle = 0; cycle < 220 && noGrowth < 8; cycle += 1) {
      for (const entry of activeListingRows()) {
        if (entrySelectionState(entry)) await setActiveRowSelected(entry.itemId, false);
      }
      const currentSelected = activeSelectedCount();
      if (currentSelected === 0 && activeCheckedRowCount() === 0) break;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const current = window.scrollY || document.documentElement.scrollTop || 0;
      if (current >= max - 8) {
        noGrowth = currentSelected === previous ? noGrowth + 1 : 0;
      } else {
        window.scrollBy({ top: Math.max(500, Math.floor(window.innerHeight * 0.82)), behavior: "auto" });
      }
      previous = currentSelected;
      await settleVirtualRows(250);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    await settleVirtualRows(300);
    if (activeSelectedCount() !== 0) throw new Error("I could not clear the existing listing selections before starting this batch.");
  }

  async function scan99OnActivePage(label = "Scanning", excludedItemIds = []) {
    const page = activePageInfo().current;
    const results = activeResultsInfo();
    const excluded = new Set((excludedItemIds || []).map(String));
    const remainingTotal = results?.total ? Math.max(0, Number(results.total) - excluded.size) : null;
    const rangeExpected = results?.expectedOnPage || null;
    // Previous pages can remain fully rendered in eBay's SPA DOM. Only count item IDs
    // that were not already assigned to an earlier page. On page 5 of 955 this turns
    // 800 stale rows + 155 real rows into exactly 155 current-page rows.
    const expected = rangeExpected && remainingTotal !== null
      ? Math.min(rangeExpected, remainingTotal)
      : (rangeExpected || remainingTotal || null);
    const inspected = new Map();
    let noGrowthAtBottom = 0;
    let stalledCycles = 0;
    let previousSize = -1;
    let previousScroll = -1;
    window.scrollTo({ top: 0, behavior: "auto" });
    await settleVirtualRows(650);

    for (let cycle = 0; cycle < 180; cycle += 1) {
      for (const entry of activeListingRows()) {
        const itemId = String(entry.itemId || "");
        if (!itemId || excluded.has(itemId)) continue;
        inspected.set(itemId, {
          itemId,
          price: Number(String(entry.price).replace(/,/g, "")),
          title: entry.title || "",
          page,
          sourceCategory: MOVE99_SOURCE_CATEGORIES.join(" / "),
          destinationCategory: MOVE99_DESTINATION_CATEGORY,
          backburner: MOVE99_BACKBURNER_ITEM_IDS.has(itemId),
          qualifies: move99QualifiesByMode(entry, itemId)
        });
      }

      const qualifyingCount = [...inspected.values()].filter((record) => record.qualifies).length;
      renderStatus(`${label} page ${page}: ${inspected.size}${expected ? ` / ${expected}` : ""} current-page rows; ${qualifyingCount} ${move99FoundLabel()}`, "ready");

      // Once every expected current-page item has been captured, stop immediately.
      // Waiting for eBay's retained rows to disappear caused the former endless loop.
      if (expected && inspected.size >= expected) break;

      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const current = window.scrollY || document.documentElement.scrollTop || 0;
      const atBottom = current >= max - 8;
      const grew = inspected.size !== previousSize;
      const moved = Math.abs(current - previousScroll) > 4;

      if (!grew && !moved) stalledCycles += 1;
      else stalledCycles = 0;
      if (!grew && atBottom) noGrowthAtBottom += 1;
      else noGrowthAtBottom = 0;

      previousSize = inspected.size;
      previousScroll = current;

      if ((!expected && atBottom && noGrowthAtBottom >= 2) || stalledCycles >= 6) break;
      if (!atBottom) window.scrollBy({ top: Math.max(500, Math.floor(window.innerHeight * 0.82)), behavior: "auto" });
      await settleVirtualRows(atBottom ? 450 : 260);
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    await settleVirtualRows(250);
    const shortfall = expected ? Math.max(0, expected - inspected.size) : 0;
    const records = [...inspected.values()].slice(0, expected || undefined);
    return {
      page,
      inspected: records.length,
      expected: expected || records.length,
      shortfall,
      itemIds: records.map((record) => String(record.itemId)),
      qualifying: records.filter((record) => record.qualifies),
      records
    };
  }

  async function selectSavedIdsOnActivePage(targetIds, options = {}) {
    const { clearFirst = true, allowAdditionalSelected = false } = options;
    const target = new Set((targetIds || []).map(String));
    if (clearFirst) await clearActivePageSelections();
    const seen = new Set();
    const selected = new Set();
    const failed = new Set();
    let noGrowth = 0;
    let previousSize = 0;
    window.scrollTo({ top: 0, behavior: "auto" });
    await settleVirtualRows(500);

    for (let cycle = 0; cycle < 260 && noGrowth < 12; cycle += 1) {
      for (const entry of activeListingRows()) {
        if (!target.has(String(entry.itemId))) continue;
        seen.add(String(entry.itemId));
        if (!selected.has(String(entry.itemId)) && !failed.has(String(entry.itemId))) {
          renderStatus(`Page ${activePageInfo().current}: selecting ${selected.size + 1} of ${target.size} saved .99 listings…`, "ready");
          const ok = await setActiveRowSelected(entry.itemId, true);
          if (ok) selected.add(String(entry.itemId));
          else failed.add(String(entry.itemId));
        }
      }
      if (selected.size + failed.size >= target.size) break;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const current = window.scrollY || document.documentElement.scrollTop || 0;
      const atBottom = current >= max - 8;
      if (seen.size === previousSize && atBottom) noGrowth += 1;
      else noGrowth = 0;
      previousSize = seen.size;
      if (!atBottom) window.scrollBy({ top: Math.max(500, Math.floor(window.innerHeight * 0.82)), behavior: "auto" });
      await settleVirtualRows(atBottom ? 450 : 280);
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    await settleVirtualRows(350);
    const missing = [...target].filter((id) => !seen.has(id));
    const selectedIds = [...selected];
    const uiSelected = activeSelectedCount();
    if (selectedIds.length && !allowAdditionalSelected && uiSelected !== selectedIds.length) {
      throw new Error(`eBay shows ${uiSelected} selected, but ${selectedIds.length} saved .99 listings were verified. Stopping before Bulk Edit.`);
    }
    if (selectedIds.length && allowAdditionalSelected && uiSelected < selectedIds.length) {
      throw new Error(`eBay shows only ${uiSelected} selected after ${selectedIds.length} saved .99 listings were verified. Stopping before Bulk Edit.`);
    }
    return { selectedIds, missingIds: [...new Set([...missing, ...failed])] };
  }

  async function selectSavedIdsAcrossActivePages(sourcePages) {
    const pageNumbers = Object.keys(sourcePages || {})
      .map(Number)
      .filter((page) => Number.isFinite(page) && (sourcePages[String(page)]?.qualifying || []).length > 0)
      .sort((a, b) => b - a);
    const selected = [];
    const failed = [];
    const seenSelected = new Set();

    for (const page of pageNumbers) {
      if (activePageInfo().current !== page) await goToActivePage(page);
      await clearActivePageSelections();
    }

    for (const page of pageNumbers) {
      if (activePageInfo().current !== page) await goToActivePage(page);
      const targetIds = (sourcePages[String(page)]?.qualifying || []).map((record) => String(record.itemId));
      renderStatus(`Selecting saved .99 listings on page ${page} for one Bulk Edit batch...`, "ready");
      const selection = await selectSavedIdsOnActivePage(targetIds, { clearFirst: false, allowAdditionalSelected: true });
      for (const id of selection.selectedIds) {
        if (!seenSelected.has(id)) {
          seenSelected.add(id);
          selected.push(id);
        }
      }
      failed.push(...selection.missingIds);
    }

    const uiSelected = activeSelectedCount();
    if (selected.length && uiSelected !== selected.length) {
      throw new Error(`eBay shows ${uiSelected} selected across pages, but ${selected.length} saved .99 listings were verified. Stopping before Bulk Edit.`);
    }
    return { selectedIds: selected, missingIds: [...new Set(failed.map(String))] };
  }

  function editMenuText(element) {
    return U.normalizeText([
      element?.innerText,
      element?.textContent,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title")
    ].filter(Boolean).join(" "));
  }

  function visibleEditMenuDiagnostics(editButton) {
    const options = [];
    const seen = new Set();
    for (const element of document.querySelectorAll('button, a, li, [role="menuitem"], [role="option"], [role="menu"] [tabindex]')) {
      if (!U.isVisible(element) || element === editButton || element.contains(editButton)) continue;
      if (element.closest?.("#gldn-panel, .gldn-modal, .gldn-modal-backdrop")) continue;
      if (element.closest?.("tbody tr, [role='row']")) continue;
      const text = editMenuText(element);
      if (!text || !/edit|listing|selected|bulk/i.test(text)) continue;
      const key = text.slice(0, 180);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(key);
      if (options.length >= 10) break;
    }
    return options;
  }

  function findEditSelectedListingsMenuItem(expectedCount, editButton) {
    const expected = String(expectedCount);
    const candidates = [];
    const seenTargets = new Set();
    const selector = 'button, a, li, [role="menuitem"], [role="option"], div, span';
    for (const label of document.querySelectorAll(selector)) {
      if (!U.isVisible(label)) continue;

      // Do not use a generic [tabindex] ancestor as the click target. In eBay's
      // current menu that can be a focus wrapper which receives the click but does
      // not activate the menu action. Prefer the actual semantic control, then the
      // smallest exact-text node as a bubbling fallback.
      const target = label.closest?.('button, a, li, [role="menuitem"], [role="option"]') || label;
      if (!target || seenTargets.has(target) || target === editButton || target.contains?.(editButton)) continue;
      if (!U.isVisible(target) || target.disabled || target.getAttribute?.("aria-disabled") === "true") continue;
      if (target.closest?.("#gldn-panel, .gldn-modal, .gldn-modal-backdrop")) continue;
      if (target.closest?.("tbody tr, [role='row']")) continue;
      const compact = editMenuText(target).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
      const labelText = editMenuText(label).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
      const href = String(target.getAttribute?.("href") || "");
      let score = 0;
      if (/^edit selected$/i.test(labelText)) score = 160;
      else if (/^edit selected$/i.test(compact)) score = 150;
      else if (/\bedit selected(?: listings?| items?)?\b/i.test(labelText)) score = 145;
      else if (/\bedit selected(?: listings?| items?)?\b/i.test(compact)) score = 140;
      else if (new RegExp(String.raw`\bedit\b.{0,60}\b${expected}\b.{0,60}\b(?:selected|listings?|items?)\b`, "i").test(compact)) score = 128;
      else if (new RegExp(String.raw`\b${expected}\b.{0,60}\b(?:selected|listings?|items?)\b.{0,60}\bedit\b`, "i").test(compact)) score = 124;
      else if (/\bbulk edit\b/i.test(compact) && (compact.includes(expected) || /selected/i.test(compact))) score = 115;
      else if (/bulksell|bulkedit/i.test(href) && (compact.includes(expected) || /selected/i.test(compact))) score = 108;
      const allMatch = compact.match(/edit all\s+([\d,]+)\s+(?:listings?|items?)/i);
      if (allMatch && Number(allMatch[1].replace(/,/g, "")) !== expectedCount) score = 0;
      if (!score) continue;
      seenTargets.add(target);
      const rect = label.getBoundingClientRect();
      candidates.push({ label, target, text: labelText || compact, score, area: rect.width * rect.height, href });
    }
    candidates.sort((a, b) => (b.score - a.score) || (a.area - b.area));
    return candidates[0] || null;
  }

  function editActionActivationCandidates(item) {
    const candidates = [];
    const add = (element) => {
      if (!element || candidates.includes(element) || !U.isVisible(element)) return;
      if (element.disabled || element.getAttribute?.("aria-disabled") === "true") return;
      candidates.push(element);
    };
    add(item?.label);
    add(item?.target);

    const rectSource = item?.label || item?.target;
    if (rectSource) {
      const rect = rectSource.getBoundingClientRect();
      const x = Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
      const y = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      add(hit);
      add(hit?.closest?.('button, a, li, [role="menuitem"], [role="option"]'));
    }

    add(item?.label?.closest?.('button, a, li, [role="menuitem"], [role="option"]'));
    add(item?.target?.querySelector?.('button, a, [role="menuitem"], [role="option"]'));
    return candidates;
  }

  function forceNativeClick(element) {
    if (!element) return false;
    try {
      element.scrollIntoView?.({ block: "center", inline: "center", behavior: "auto" });
      element.focus?.({ preventScroll: true });
      if (element instanceof HTMLAnchorElement) HTMLAnchorElement.prototype.click.call(element);
      else if (element instanceof HTMLButtonElement) HTMLButtonElement.prototype.click.call(element);
      else HTMLElement.prototype.click.call(element);
      return true;
    } catch (_) {
      return dispatchFullClick(element);
    }
  }

  async function waitForBulkEditStart(beforeHref, timeoutMs = 5000) {
    return U.waitFor(() => {
      if (isMove99BulkEditorPage()) return { bulk: true };
      if (findSavedBulkEditContinueButton?.()) return { draftDialog: true };
      const text = String(document.body?.innerText || "").toLowerCase();
      if (text.includes("want to complete your previous bulk edits")) return { draftDialog: true };
      return null;
    }, timeoutMs, 150);
  }

  function findActiveListingsBulkEditButton() {
    const candidates = [...document.querySelectorAll('button, [role="button"]')]
      .filter((element) => {
        if (!U.isVisible(element) || element.closest?.("tbody tr, [role='row']")) return false;
        if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
        return true;
      })
      .map((element) => {
        const text = U.normalizeText([
          element.innerText,
          element.textContent,
          element.getAttribute?.("aria-label"),
          element.getAttribute?.("title")
        ].filter(Boolean).join(" "));
        const className = String(element.className || "");
        let score = 0;
        if (text === "bulk edit") score = 100;
        else if (/\bbulk edit\b/i.test(text)) score = 90;
        else if (/^(edit)(?:\s+\1)*$/i.test(text) || (/\bfake-menu-button__button\b/.test(className) && /\bedit\b/i.test(text))) score = 40;
        return { element, score, text };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  async function activateEditSelectedAction(item, count, editButton) {
    let lastHref = location.href;
    const candidates = editActionActivationCandidates(item);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      renderStatus(`Opening Bulk Edit for ${count} selected .99 listings…`, "ready");
      forceNativeClick(candidate);
      const started = await waitForBulkEditStart(lastHref, 4500);
      if (started) return true;

      // If a failed activation merely closed the menu, reopen it before trying the
      // next concrete target. This is still one activation per target—never a double
      // click on the same menu item.
      let visibleItem = findEditSelectedListingsMenuItem(count, editButton);
      if (!visibleItem) {
        dispatchFullClick(editButton);
        visibleItem = await U.waitFor(() => findEditSelectedListingsMenuItem(count, editButton), 3500, 120);
      }
      if (visibleItem) {
        item = visibleItem;
        for (const extra of editActionActivationCandidates(visibleItem)) {
          if (!candidates.includes(extra)) candidates.push(extra);
        }
      }
      lastHref = location.href;
    }

    // Keyboard activation is a final fallback for eBay menu implementations that
    // attach their action to focus/Enter rather than the visible text wrapper.
    const focused = item?.target || item?.label;
    if (focused) {
      focused.focus?.({ preventScroll: true });
      focused.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, composed: true }));
      focused.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, composed: true }));
      const started = await waitForBulkEditStart(lastHref, 5000);
      if (started) return true;
    }

    // Only follow a real eBay-provided Bulk Edit URL. Never recreate or guess the
    // unsupported raw endpoint that previously returned "Cannot GET".
    const href = String(item?.href || item?.target?.href || "");
    if (href && /^https?:/i.test(href) && /bulksell|bulkedit|workspace/i.test(href)) {
      location.assign(href);
      const started = await waitForBulkEditStart(lastHref, 8000);
      if (started) return true;
    }
    return false;
  }

  async function openSelectedListingsInBulkEditor(batchIds, state) {
    const count = batchIds.length;
    if (!count) throw new Error("No saved .99 listings were selected on this page.");
    const editButton = await U.waitFor(findActiveListingsBulkEditButton, 10000, 180);
    if (!editButton) throw new Error("I selected the saved .99 listings but could not find the Bulk edit dropdown.");

    await storageSet({
      pendingMove99Run: {
        ...state,
        active: true,
        confirmed: true,
        phase: "bulk-editor",
        currentBatchIds: batchIds,
        currentBatchCount: count,
        currentBatchPage: activePageInfo().current
      }
    });

    dispatchFullClick(editButton);
    const action = await U.waitFor(() => {
      if (isMove99BulkEditorPage()) return { direct: true };
      const item = findEditSelectedListingsMenuItem(count, editButton);
      return item ? { item } : null;
    }, 12000, 150);
    if (!action) {
      const options = visibleEditMenuDiagnostics(editButton);
      const detail = options.length ? ` Visible Edit options: ${options.join(" | ")}` : " No visible Edit menu options were detected.";
      throw new Error(`The Edit menu opened, but I could not find the selected-listing action for ${count} listings.${detail}`);
    }

    if (!action.direct) {
      const activated = await activateEditSelectedAction(action.item, count, editButton);
      if (!activated) {
        throw new Error(`eBay displayed Edit selected for ${count} listings, but did not activate it after trying the exact text, semantic menu control, hit-tested control, and keyboard activation.`);
      }
    }

    await continuePastSavedBulkEditDialog();
    const progressed = await U.waitFor(() => isMove99BulkEditorPage() ? true : null, 45000, 250);
    if (!progressed) throw new Error("eBay did not finish opening Bulk Edit for the selected .99 listings.");
  }

  function dedupeMove99Pages(pages) {
    const output = {};
    const seenInspected = new Set();
    const pageNumbers = Object.keys(pages || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);

    for (const pageNumber of pageNumbers) {
      const source = pages[String(pageNumber)] || {};
      const recordsById = new Map();
      for (const record of Array.isArray(source.records) ? source.records : []) {
        const itemId = String(record?.itemId || "");
        if (itemId && !recordsById.has(itemId)) recordsById.set(itemId, record);
      }
      const uniqueItemIds = [];
      const records = [];
      for (const rawId of Array.isArray(source.itemIds) ? source.itemIds : []) {
        const id = String(rawId || "");
        if (!id || seenInspected.has(id)) continue;
        seenInspected.add(id);
        uniqueItemIds.push(id);
        const record = recordsById.get(id);
        if (record) records.push(record);
      }

      const qualifying = records.filter((record) => record?.qualifies);

      output[String(pageNumber)] = {
        ...source,
        inspected: uniqueItemIds.length,
        itemIds: uniqueItemIds,
        qualifying,
        records
      };
    }
    return output;
  }

  function uniqueMove99InspectedCount(pages) {
    const ids = new Set();
    for (const page of Object.values(pages || {})) {
      for (const rawId of Array.isArray(page?.itemIds) ? page.itemIds : []) {
        const id = String(rawId || "");
        if (id) ids.add(id);
      }
    }
    return ids.size;
  }

  function flattenMove99Pages(pages) {
    const records = [];
    const seen = new Set();
    const pageNumbers = Object.keys(pages || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    for (const pageNumber of pageNumbers) {
      for (const record of Array.isArray(pages[String(pageNumber)]?.qualifying) ? pages[String(pageNumber)].qualifying : []) {
        const id = String(record?.itemId || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        records.push(record);
      }
    }
    return records;
  }

  function buildMove99ExactBatches(pages, batchLimit = MOVE99_BULK_BATCH_LIMIT) {
    const limit = Number(batchLimit || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 2000) {
      throw new Error("The exact eBay workspace batch limit must be between 1 and 2,000 listings.");
    }

    const records = flattenMove99Pages(pages);
    const itemIds = [];
    const seen = new Set();
    for (const record of records) {
      const itemId = String(record?.itemId || "");
      if (!/^\d{9,15}$/.test(itemId) || seen.has(itemId)) {
        throw new Error("The verified Move .99 scan contains a missing, invalid, or duplicate item number.");
      }
      seen.add(itemId);
      itemIds.push(itemId);
    }

    const batches = [];
    for (let offset = 0; offset < itemIds.length; offset += limit) {
      batches.push(itemIds.slice(offset, offset + limit));
    }
    return batches;
  }

  function recoverMove99VariationLimitState(state) {
    const variationLimitVisible = /exceeded the 500 listing limit with variations/i.test(String(document.body?.innerText || ""));
    if (!state
      || state.applyStrategy !== MOVE99_EXACT_APPLY_STRATEGY
      || state.phase !== "awaiting-submit-approval"
      || Number(state.currentBatchCount || 0) <= MOVE99_BULK_BATCH_LIMIT) {
      return null;
    }

    const sourcePages = state.applySourcePages || state.scanPages || {};
    const exactBatches = buildMove99ExactBatches(sourcePages);
    if (!exactBatches.length) return null;

    return {
      ...state,
      active: true,
      confirmed: true,
      phase: "apply-exact-workspace",
      reviewReady: false,
      applyIndex: 0,
      exactBatches,
      currentBatchIds: [],
      currentBatchCount: 0,
      currentBatchSourceCount: 0,
      currentBatchKey: "",
      categoryUpdate: null,
      submitResult: null,
      submitResultUnknown: false,
      recoveryReason: variationLimitVisible
        ? "eBay enforced its 500-listing publish limit for workspaces containing variations."
        : "The saved exact-ID workspace exceeds eBay's 500-listing publish limit for variation-safe batches.",
      recoveredAt: new Date().toISOString()
    };
  }

  function assertMove99ExactBatchIntegrity(state, requestedBatch, applyIndex) {
    const filteredCount = Number(state.filteredCount || 0);
    const uniqueInspected = Number(state.uniqueInspected || 0);
    if (state.scanStrategy !== MOVE99_SCAN_STRATEGY
      || state.scanIntegrity !== "verified"
      || !filteredCount
      || uniqueInspected !== filteredCount) {
      throw new Error("The saved Move .99 scan is not an exact, verified full-inventory scan. No category changes were attempted.");
    }

    const sourcePages = state.applySourcePages || state.scanPages || {};
    const expectedBatches = buildMove99ExactBatches(sourcePages);
    const expected = expectedBatches[Number(applyIndex || 0)] || [];
    const batch = (requestedBatch || []).map(String);
    if (!batch.length || batch.length > MOVE99_BULK_BATCH_LIMIT || new Set(batch).size !== batch.length) {
      throw new Error("The requested exact-ID workspace batch is invalid. No category changes were attempted.");
    }
    if (batch.join("|") !== expected.join("|")) {
      throw new Error("The requested exact-ID workspace no longer matches the verified scan. No category changes were attempted.");
    }

    const records = new Map(flattenMove99Pages(sourcePages).map((record) => [String(record?.itemId || ""), record]));
    for (const itemId of batch) {
      const record = records.get(itemId);
      if (!record || record.backburner || MOVE99_BACKBURNER_ITEM_IDS.has(itemId) || !move99QualifiesByMode(record, itemId)) {
        throw new Error(`Saved item ${itemId} no longer meets the Move .99 rules. No category changes were attempted.`);
      }
    }
    return batch;
  }

  async function openExactMove99Workspace(itemIds, state) {
    const batch = itemIds.map(String);
    const batchState = {
      ...state,
      active: true,
      confirmed: true,
      phase: "bulk-editor",
      selectionSource: "exact-id-workspace",
      currentBatchIds: batch,
      currentBatchCount: batch.length,
      currentBatchSourceCount: batch.length,
      currentBatchKey: `${state.runId || state.startedAt || "move99"}:exact:${Number(state.applyIndex || 0)}:${batch.join("-")}`
    };
    await storageSet({ pendingMove99Run: batchState });

    const response = await runtimeMessage({
      type: "createMove99BulkWorkspace",
      itemIds: batch,
      returnUrl: state.filteredUrl || location.href
    });
    if (!response?.ok) {
      throw new Error(`eBay could not create the exact-item Bulk Edit workspace: ${response?.error || "unknown response"}`);
    }
    if (Number(response.requestedCount || 0) !== batch.length) {
      throw new Error("eBay created a workspace for a different number of item IDs. No category changes were attempted.");
    }
    const workspaceUrl = new URL(String(response.url || ""), location.origin);
    if (workspaceUrl.origin !== location.origin
      || workspaceUrl.pathname !== "/bulksell"
      || !workspaceUrl.searchParams.get("workspaceId")) {
      throw new Error("eBay returned an invalid Bulk Edit workspace URL. No category changes were attempted.");
    }
    location.assign(workspaceUrl.toString());
  }

  function buildMove99EditRanges(pages, filteredCount, rangeLimit = MOVE99_EDIT_RANGE_LIMIT) {
    const total = Number(filteredCount || 0);
    const limit = Number(rangeLimit || 0);
    if (!Number.isInteger(total) || total < 1 || !Number.isInteger(limit) || limit < 1) {
      throw new Error("The verified listing total cannot be divided into eBay edit ranges.");
    }

    const orderedRecords = [];
    const seenIds = new Set();
    const qualifyingById = new Map();
    const pageNumbers = Object.keys(pages || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    for (const pageNumber of pageNumbers) {
      const page = pages[String(pageNumber)] || {};
      const pageRecords = new Map();
      for (const record of Array.isArray(page.records) ? page.records : []) {
        const itemId = String(record?.itemId || "");
        if (!itemId || pageRecords.has(itemId)) {
          throw new Error("The verified Move .99 scan contains a missing or duplicate listing record.");
        }
        pageRecords.set(itemId, record);
      }
      for (const rawId of Array.isArray(page.itemIds) ? page.itemIds : []) {
        const itemId = String(rawId || "");
        if (!itemId || seenIds.has(itemId)) continue;
        const record = pageRecords.get(itemId);
        if (!record) {
          throw new Error(`The verified Move .99 scan is missing the title/price record for item ${itemId}.`);
        }
        if (!move99BatchFingerprint(record)) {
          throw new Error(`The verified Move .99 scan could not fingerprint item ${itemId} by title and price.`);
        }
        seenIds.add(itemId);
        orderedRecords.push(record);
      }
      for (const record of Array.isArray(page.qualifying) ? page.qualifying : []) {
        const itemId = String(record?.itemId || "");
        if (!itemId || qualifyingById.has(itemId)) {
          throw new Error("The verified Move .99 scan contains a missing or duplicate qualifying item number.");
        }
        qualifyingById.set(itemId, record);
      }
    }

    if (orderedRecords.length !== total) {
      throw new Error(`The eBay edit ranges require ${total.toLocaleString()} exact listing records, but the saved scan contains ${orderedRecords.length.toLocaleString()}.`);
    }

    const ranges = new Map();
    for (let index = 0; index < orderedRecords.length; index += 1) {
      const record = orderedRecords[index];
      const itemId = String(record.itemId);
      const rangeStart = Math.floor(index / limit) * limit + 1;
      const rangeEnd = Math.min(total, rangeStart + limit - 1);
      const key = `${rangeStart}-${rangeEnd}`;
      if (!ranges.has(key)) {
        ranges.set(key, {
          rangeStart,
          rangeEnd,
          rangeCount: rangeEnd - rangeStart + 1,
          targetIds: [],
          targetRecords: [],
          rangeRecords: []
        });
      }
      const range = ranges.get(key);
      range.rangeRecords.push(record);
      const qualifyingRecord = qualifyingById.get(itemId);
      if (qualifyingRecord) {
        if (!record.qualifies) {
          throw new Error(`Saved item ${itemId} has conflicting qualification data.`);
        }
        range.targetIds.push(itemId);
        range.targetRecords.push(record);
        qualifyingById.delete(itemId);
      } else if (record.qualifies) {
        throw new Error(`Saved item ${itemId} is marked qualifying but is missing from the verified qualifying set.`);
      }
    }

    if (qualifyingById.size) {
      throw new Error(`${qualifyingById.size.toLocaleString()} qualifying item numbers are not present in the verified listing order.`);
    }
    const result = [...ranges.values()]
      .filter((range) => range.targetIds.length > 0)
      .sort((a, b) => a.rangeStart - b.rangeStart);
    if (result.some((range) => range.rangeRecords.length !== range.rangeCount)) {
      throw new Error("The saved title/price records did not fill their exact eBay edit ranges.");
    }
    const assigned = result.reduce((sum, range) => sum + range.targetIds.length, 0);
    if (assigned !== flattenMove99Pages(pages).length) {
      throw new Error("The saved qualifying item numbers did not reconcile with the eBay edit ranges.");
    }
    return result;
  }

  function assertMove99RangeIntegrity(state, range) {
    const filteredCount = Number(state.filteredCount || 0);
    const uniqueInspected = Number(state.uniqueInspected || 0);
    if (state.scanStrategy !== MOVE99_SCAN_STRATEGY
      || state.scanIntegrity !== "verified"
      || !filteredCount
      || uniqueInspected !== filteredCount) {
      throw new Error("The saved Move .99 scan is not an exact, verified full-inventory scan. No category changes were attempted.");
    }
    const sourcePages = state.applySourcePages || state.scanPages || {};
    const applyFilteredCount = Number(state.applyFilteredCount || uniqueMove99InspectedCount(sourcePages));
    const expectedRange = buildMove99EditRanges(sourcePages, applyFilteredCount)
      .find((candidate) => candidate.rangeStart === Number(range?.rangeStart) && candidate.rangeEnd === Number(range?.rangeEnd));
    if (!expectedRange) throw new Error("The requested eBay edit range is not part of the verified scan.");

    const targetIds = (range?.targetIds || []).map(String);
    if (!targetIds.length || targetIds.length > expectedRange.rangeCount || new Set(targetIds).size !== targetIds.length) {
      throw new Error("The requested eBay edit range contains an invalid exact-ID batch.");
    }
    if (targetIds.join("|") !== expectedRange.targetIds.join("|")) {
      throw new Error("The requested eBay edit range no longer matches the verified item-number order.");
    }
    for (const record of expectedRange.targetRecords) {
      const itemId = String(record?.itemId || "");
      if (!itemId || record.backburner || MOVE99_BACKBURNER_ITEM_IDS.has(itemId) || !move99QualifiesByMode(record, itemId)) {
        throw new Error(`Saved item ${itemId || "(missing ID)"} no longer meets the Move .99 rules. No category changes were attempted.`);
      }
    }
    return expectedRange;
  }

  function assertMove99BatchIntegrity(state, pageRecord, targetIds, targetPage) {
    const filteredCount = Number(state.filteredCount || 0);
    const uniqueInspected = Number(state.uniqueInspected || 0);
    if (state.scanStrategy !== MOVE99_SCAN_STRATEGY
      || state.scanIntegrity !== "verified"
      || !filteredCount
      || uniqueInspected !== filteredCount) {
      throw new Error("The saved Move .99 scan is not an exact, verified full-inventory scan. No category changes were attempted.");
    }
    if (!Array.isArray(targetIds) || !targetIds.length || targetIds.length > MOVE99_BULK_BATCH_LIMIT) {
      throw new Error(`The saved Move .99 batch must contain between 1 and ${MOVE99_BULK_BATCH_LIMIT} listings.`);
    }
    if (new Set(targetIds.map(String)).size !== targetIds.length) {
      throw new Error("The saved Move .99 batch contains duplicate item numbers. No category changes were attempted.");
    }

    const inspectedIds = new Set((pageRecord?.itemIds || []).map(String));
    const records = new Map((pageRecord?.qualifying || []).map((record) => [String(record?.itemId || ""), record]));
    for (const rawId of targetIds) {
      const itemId = String(rawId || "");
      const record = records.get(itemId);
      if (!itemId || !inspectedIds.has(itemId) || !record) {
        throw new Error(`Saved item ${itemId || "(missing ID)"} is not part of the verified page ${targetPage} scan.`);
      }
      if (Number(record.page) !== Number(targetPage)) {
        throw new Error(`Saved item ${itemId} belongs to page ${record.page}, not page ${targetPage}.`);
      }
      if (record.backburner || MOVE99_BACKBURNER_ITEM_IDS.has(itemId) || !move99QualifiesByMode(record, itemId)) {
        throw new Error(`Saved item ${itemId} no longer meets the Move .99 rules. No category changes were attempted.`);
      }
    }
  }

  function move99AuditCsv(state) {
    const original = flattenMove99Pages(state.scanPages);
    const remaining = new Set(flattenMove99Pages(state.verificationPages).map((record) => String(record.itemId)));
    const failed = new Set((state.failedIds || []).map(String));
    const processed = new Set((state.processedIds || []).map(String));
    const rows = original.map((record) => {
      let result = "Scanned";
      const itemId = String(record.itemId);
      if (state.phase === "completed") result = remaining.has(itemId) ? "Remaining / Retry" : "Moved / No longer in source categories";
      else if (processed.has(itemId)) result = "Submitted and confirmed";
      else if (failed.has(itemId)) result = "Needs verification / retry";
      return [record.itemId, record.title, record.price, record.page, record.sourceCategory, record.destinationCategory, result];
    });
    const header = ["Item number", "Title", "Price", "Original source filter", "Page", "Destination category", "Result"];
    const normalized = rows.map((row) => [row[0], row[1], Number(row[2]).toFixed(2), row[4], row[3], row[5], row[6]]);
    return [header, ...normalized].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  function downloadMove99Audit(state) {
    const blob = new Blob([move99AuditCsv(state)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `GLDN_Ops_Move99_Audit_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function forceMove99SummaryIntoViewport(overlay) {
    const modal = overlay?.querySelector?.(".gldn-modal");
    if (!overlay || !modal) return false;
    if (!overlay.isConnected) document.documentElement.appendChild(overlay);

    overlay.removeAttribute("hidden");
    overlay.style.setProperty("position", "fixed", "important");
    overlay.style.setProperty("inset", "0", "important");
    overlay.style.setProperty("display", "flex", "important");
    overlay.style.setProperty("align-items", "center", "important");
    overlay.style.setProperty("justify-content", "center", "important");
    overlay.style.setProperty("visibility", "visible", "important");
    overlay.style.setProperty("opacity", "1", "important");
    overlay.style.setProperty("pointer-events", "auto", "important");
    overlay.style.setProperty("z-index", "2147483647", "important");
    modal.removeAttribute("hidden");
    modal.style.setProperty("display", "block", "important");
    modal.style.setProperty("visibility", "visible", "important");
    modal.style.setProperty("opacity", "1", "important");
    modal.style.setProperty("z-index", "2147483647", "important");

    const viewportWidth = Math.max(Number(window.innerWidth) || 0, Number(document.documentElement?.clientWidth) || 0, 320);
    const viewportHeight = Math.max(Number(window.innerHeight) || 0, Number(document.documentElement?.clientHeight) || 0, 220);
    const rect = modal.getBoundingClientRect();
    const intersectsViewport = rect.width > 80
      && rect.height > 80
      && rect.right > 8
      && rect.bottom > 8
      && rect.left < viewportWidth - 8
      && rect.top < viewportHeight - 8;
    if (!intersectsViewport) {
      const width = Math.min(760, Math.max(320, viewportWidth - 24));
      const left = Math.max(8, Math.round((viewportWidth - width) / 2));
      modal.style.setProperty("position", "fixed");
      modal.style.setProperty("left", `${left}px`);
      modal.style.setProperty("top", "8px");
      modal.style.setProperty("right", "auto");
      modal.style.setProperty("bottom", "auto");
      modal.style.setProperty("margin", "0");
      modal.style.setProperty("width", `${width}px`);
      modal.style.setProperty("max-height", `${Math.max(220, viewportHeight - 16)}px`);
    }
    modal.scrollTop = 0;
    const visibleRect = modal.getBoundingClientRect();
    return overlay.isConnected
      && modal.getClientRects().length > 0
      && visibleRect.width > 80
      && visibleRect.height > 80
      && visibleRect.right > 8
      && visibleRect.bottom > 8
      && visibleRect.left < viewportWidth - 8
      && visibleRect.top < viewportHeight - 8;
  }

  async function revealMove99ScanSummary(overlay) {
    const modal = overlay?.querySelector?.(".gldn-modal");
    if (!overlay || !modal) return false;
    U.enhanceModal?.(modal);
    forceMove99SummaryIntoViewport(overlay);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    forceMove99SummaryIntoViewport(overlay);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return forceMove99SummaryIntoViewport(overlay);
  }

  function showMove99ScanSummary(state, completed = false) {
    const existing = document.getElementById("gldn-move99-preview");
    if (existing) return existing;
    const records = flattenMove99Pages(completed ? state.verificationPages : state.scanPages);
    const scanned = Object.values(completed ? state.verificationPages || {} : state.scanPages || {}).reduce((sum, page) => sum + Number(page?.inspected || 0), 0);
    const remaining = completed ? records.length : null;
    const overlay = document.createElement("div");
    overlay.id = "gldn-move99-preview";
    overlay.className = "gldn-modal-backdrop";
    const title = completed ? `${move99WorkflowLabel()} — Completed` : `${move99WorkflowLabel()} — Scan Complete`;
    const actionLabel = completed ? (remaining ? `Retry Failed Only (${remaining.toLocaleString()})` : "Done") : `Apply ${records.length.toLocaleString()} Changes`;
    overlay.innerHTML = `
      <div class="gldn-modal gldn-move99-summary">
        <button type="button" class="gldn-close" aria-label="Close">×</button>
        <h2>${title}</h2>
        <p>${completed ? "The final verification pass is complete." : "All filtered Active Listings pages were scanned before any category changes."}</p>
        <div class="gldn-grid">
          <div><strong>Listings scanned</strong><span>${scanned.toLocaleString()}</span></div>
          <div><strong>${completed ? "Still qualifying" : move99FoundLabel()}</strong><span>${records.length.toLocaleString()}</span></div>
          <div><strong>Source categories</strong><span>${MOVE99_SOURCE_CATEGORIES.map(escapeHtml).join(" + ")}</span></div>
          <div><strong>Destination</strong><span>${escapeHtml(MOVE99_DESTINATION_CATEGORY)}</span></div>
          ${completed ? `<div><strong>Batches submitted</strong><span>${Number(state.totals?.batches || 0).toLocaleString()}</span></div><div><strong>eBay-reported failures</strong><span>${Number(state.totals?.failed || 0).toLocaleString()}</span></div>` : ""}
        </div>
        <div class="gldn-existing"><strong>Safety:</strong> only the primary Store category changes. The Bulk Edit workspace is created from the exact verified item numbers in this scan, in batches of at most ${MOVE99_BULK_BATCH_LIMIT}.</div>
        <div class="gldn-actions gldn-actions-three">
          <button type="button" class="gldn-secondary" data-action="audit">Download Audit</button>
          <button type="button" class="gldn-secondary" data-action="close">${completed ? "Close" : "Scan Only / Close"}</button>
          <button type="button" class="gldn-primary" data-action="apply">${actionLabel}</button>
        </div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnMove99ModalPosition");
    const close = async () => {
      overlay.remove();
      if (!completed) {
        await storageSet({ pendingMove99Run: { ...state, active: false, phase: "scan-summary", lastScanSaved: true } });
        renderStatus(`Scan saved — ${records.length} ${move99FoundLabel()}.`, "completed");
      } else {
        await storageSet({ pendingMove99Run: null });
        renderStatus(`Move .99 verification saved — ${remaining || 0} listings remain.`, remaining ? "error" : "completed");
      }
    };
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='close']").addEventListener("click", close);
    overlay.querySelector("[data-action='audit']").addEventListener("click", () => downloadMove99Audit(state));
    overlay.querySelector("[data-action='apply']").addEventListener("click", async () => {
      if (completed && !remaining) {
        overlay.remove();
        await storageSet({ pendingMove99Run: null });
        return;
      }
      const sourcePages = completed ? state.verificationPages : state.scanPages;
      if (state.scanStrategy !== MOVE99_SCAN_STRATEGY
        || state.scanIntegrity !== "verified"
        || Number(state.uniqueInspected || 0) !== Number(state.filteredCount || 0)) {
        overlay.remove();
        renderStatus("The saved scan is incomplete. Run Move .99 again before applying changes.", "error");
        return;
      }
      const applyFilteredCount = uniqueMove99InspectedCount(sourcePages);
      let exactBatches;
      try {
        exactBatches = buildMove99ExactBatches(sourcePages);
      } catch (error) {
        overlay.remove();
        renderStatus(`The saved scan could not be divided into exact eBay workspaces: ${error.message}`, "error");
        return;
      }
      const applyCount = flattenMove99Pages(sourcePages).length;
      if (!applyCount || !exactBatches.length) {
        overlay.remove();
        renderStatus("The saved scan has no qualifying listings to apply.", "completed");
        return;
      }
      const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
      if (!tabInfo?.ok || !Number.isInteger(tabInfo.tabId)) {
        renderStatus("The current eBay tab could not take ownership of the saved scan. Reload this tab and try Apply again.", "error");
        return;
      }
      overlay.remove();
      await storageSet({
        pendingMove99Run: {
          ...state,
          active: true,
          confirmed: true,
          ownerTabId: tabInfo.tabId,
          phase: "apply-exact-workspace",
          applyStrategy: MOVE99_EXACT_APPLY_STRATEGY,
          applySourcePages: sourcePages,
          applyFilteredCount,
          exactBatches,
          applyIndex: 0,
          currentBatchIds: [],
          currentBatchCount: 0,
          retryRound: completed ? Number(state.retryRound || 0) + 1 : Number(state.retryRound || 0),
          totals: state.totals || { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 }
        }
      });
      runMove99Automation();
    });
    return overlay;
  }

  function move99SavedSummaryDescriptor(state) {
    if (!state || !["scan-summary", "completed"].includes(state.phase)) return null;
    if (state.scanStrategy !== MOVE99_SCAN_STRATEGY || state.scanIntegrity !== "verified") return null;
    if (Number(state.uniqueInspected || 0) !== Number(state.filteredCount || 0)) return null;
    const completed = state.phase === "completed";
    const records = flattenMove99Pages(completed ? state.verificationPages : state.scanPages);
    if (!records.length) return null;
    const reverse = state.scanMode === "non99";
    return {
      completed,
      count: records.length,
      scanMode: reverse ? "non99" : "price99",
      buttonLabel: completed
        ? `Review ${records.length.toLocaleString()} Remaining ${reverse ? "Non-.99" : ".99"}`
        : `Review ${records.length.toLocaleString()} ${reverse ? "Non-.99" : ".99"} Matches`
    };
  }

  async function refreshMove99ReviewButton() {
    if (!move99ReviewButtonElement || !move99ApplyButtonElement) return;
    const stored = await storageGet(["pendingMove99Run"]);
    const descriptor = move99SavedSummaryDescriptor(stored.pendingMove99Run);
    move99ReviewButtonElement.hidden = !descriptor;
    move99ApplyButtonElement.hidden = !descriptor;
    if (!descriptor) {
      move99ReviewButtonElement.textContent = "Review Saved Category Scan";
      move99ReviewButtonElement.removeAttribute("title");
      move99ApplyButtonElement.textContent = "Apply Saved Category Scan";
      move99ApplyButtonElement.removeAttribute("title");
      return;
    }
    move99ReviewButtonElement.textContent = descriptor.buttonLabel;
    move99ReviewButtonElement.title = "Open the saved verified scan without scanning the listings again.";
    move99ApplyButtonElement.textContent = `Apply ${descriptor.count.toLocaleString()} Saved Changes`;
    move99ApplyButtonElement.title = "Prepare the exact saved matches in eBay Bulk Edit. Final Submit still requires separate approval.";
  }

  async function openSavedMove99Summary() {
    const stored = await storageGet(["pendingMove99Run", "ebayAccountLabel"]);
    const state = stored.pendingMove99Run;
    const descriptor = move99SavedSummaryDescriptor(state);
    if (!descriptor) {
      await refreshMove99ReviewButton();
      renderStatus("There is no verified category scan waiting for review.", "error");
      return null;
    }
    await applyMove99AccountConfig(state.ebayAccountLabel || stored.ebayAccountLabel || "");
    MOVE99_SCAN_MODE = descriptor.scanMode;
    if (state.sourceCategories?.length) MOVE99_SOURCE_CATEGORIES = asStringArray(state.sourceCategories);
    if (state.destinationCategory) MOVE99_DESTINATION_CATEGORY = String(state.destinationCategory).trim();
    if (state.sourceStoreCategoryIds) MOVE99_SOURCE_STORE_CATEGORY_IDS = asStringArray(state.sourceStoreCategoryIds);
    MOVE99_ACTIVE_URL = buildMove99ActiveUrl(MOVE99_SOURCE_STORE_CATEGORY_IDS);
    if (!isMove99ActiveListingsPage()) {
      renderStatus(`Opening the saved ${descriptor.count.toLocaleString()}-listing scan for review...`, "ready");
      location.assign(move99ScanPageUrl(1, state.filteredUrl || MOVE99_ACTIVE_URL));
      return null;
    }
    document.getElementById("gldn-move99-preview")?.remove();
    const overlay = showMove99ScanSummary({ ...state, active: false, ownerTabId: null }, descriptor.completed);
    const visible = await revealMove99ScanSummary(overlay);
    renderStatus(
      visible
        ? `Reviewing the saved ${descriptor.count.toLocaleString()} ${descriptor.scanMode === "non99" ? "non-.99" : ".99"} matches.`
        : `The saved ${descriptor.count.toLocaleString()} matches are intact. Use Apply Saved Changes to continue.`,
      visible ? "completed" : "error"
    );
    return overlay;
  }

  async function applySavedMove99Summary() {
    const overlay = await openSavedMove99Summary();
    const applyButton = overlay?.querySelector?.("[data-action='apply']");
    if (!applyButton) {
      renderStatus("The saved scan could not be opened on this page. Open Active Listings and try Apply Saved Changes again.", "error");
      return;
    }
    applyButton.click();
  }

  function canRecoverMove99FirstBatchFromVerifiedScan(state) {
    if (!state || !["apply-exact-workspace", "apply-range", "bulk-editor-range", "bulk-editor"].includes(state.phase)) return false;
    if (state.scanStrategy !== MOVE99_SCAN_STRATEGY || state.scanIntegrity !== "verified") return false;
    if (Number(state.uniqueInspected || 0) !== Number(state.filteredCount || 0)) return false;
    if (!Object.keys(state.scanPages || {}).length) return false;
    if (Number(state.totals?.batches || 0) !== 0) return false;
    if (Number(state.totals?.live || 0) !== 0) return false;
    return true;
  }

  function recoverMove99VerifiedScanSummary(state, error = "") {
    return {
      ...state,
      active: false,
      confirmed: false,
      ownerTabId: null,
      phase: "scan-summary",
      lastScanSaved: true,
      currentBatchIds: [],
      currentBatchCount: 0,
      currentBatchPage: null,
      currentBatchOffset: 0,
      error: error || state.error || ""
    };
  }

  function bulkEditorSelectionProgress() {
    const root = bulkEditorTableWrapper() || document;
    const controls = root.querySelectorAll(
      "tbody input[type='checkbox'], tbody [role='checkbox'], [role='rowgroup'] input[type='checkbox'], [role='rowgroup'] [role='checkbox']"
    );
    const selectedControls = new Set();
    for (const control of controls) {
      if (control.disabled || control.getAttribute("aria-disabled") === "true") continue;
      if (controlChecked(control)) selectedControls.add(control);
    }
    const native = nativeBulkSelectionSummary();
    return {
      // eBay virtualizes this grid, so only a handful of selected row controls
      // may be mounted even when the native header checkbox selected the full batch.
      selected: native?.selected ?? selectedControls.size,
      total: native?.total ?? Math.max(parseBulkEditorSubmitTotal(), bulkEditorRawRowCount(root)),
      source: native?.source || "rendered-row-controls"
    };
  }

  async function waitForBulkEditorReady(expectedTotal = 0, { allowFewer = false, timeout = 300000 } = {}) {
    const expected = Number(expectedTotal || 0);
    let nativeCandidate = 0;
    let nativeStableSince = 0;
    let processedStableSince = 0;
    return U.waitFor(() => {
      const now = Date.now();
      const progress = parseProcessedProgress();
      const rowCount = bulkEditorRawRowCount();
      if (!rowCount) return null;

      const selection = bulkEditorSelectionProgress();
      // Some current eBay Bulk Edit builds omit the older "listings processed"
      // message. The exact native Submit count is an independent admission
      // signal once listing rows are mounted.
      const submitTotal = parseBulkEditorSubmitTotal();
      if (selection.total > 0 && submitTotal > 0 && selection.total !== submitTotal) {
        nativeCandidate = 0;
        nativeStableSince = 0;
        return null;
      }
      const nativeTotal = Number(selection.total || submitTotal || 0);
      const nativeMatchesExpected = nativeTotal > 0
        && (!expected || nativeTotal === expected || (allowFewer && nativeTotal <= expected));
      if (nativeMatchesExpected) {
        if (nativeCandidate !== nativeTotal) {
          nativeCandidate = nativeTotal;
          nativeStableSince = now;
          return null;
        }
        const shortfall = expected ? Math.max(0, expected - nativeTotal) : 0;
        const requiredStableMs = shortfall ? 12000 : 2500;
        if (now - nativeStableSince >= requiredStableMs) {
          if (shortfall) {
            const omitted = bulkEditorOmittedNoticeCount();
            if (omitted !== shortfall) {
              throw new Error(
                `Safety stop: eBay's Edit range expected ${expected.toLocaleString()} listings, `
                + `but the workspace settled at ${nativeTotal.toLocaleString()} while eBay reported ${omitted.toLocaleString()} omission${omitted === 1 ? "" : "s"}. `
                + "No checkboxes or category fields were changed."
              );
            }
          }
          return {
            processed: nativeTotal,
            total: nativeTotal,
            source: selection.total > 0 ? "selection-summary" : "submit-summary"
          };
        }
      } else {
        nativeCandidate = 0;
        nativeStableSince = 0;
      }

      if (progress && progress.total > 0 && progress.processed >= progress.total) {
        if (!processedStableSince) processedStableSince = now;
        if (now - processedStableSince >= 5000) return progress;
      } else {
        processedStableSince = 0;
      }
      return null;
    }, timeout, 500);
  }

  function visibleCheckboxTarget(control) {
    if (!control) return null;
    if (U.isVisible(control)) return control;
    if (control.id) {
      try {
        const linked = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
        if (linked && U.isVisible(linked)) return linked;
      } catch (_) {}
    }
    const wrapper = control.closest?.("label, button, [role='checkbox'], [role='button']");
    if (wrapper && U.isVisible(wrapper)) return wrapper;
    const parentLabel = control.parentElement?.querySelector?.("label");
    if (parentLabel && U.isVisible(parentLabel)) return parentLabel;
    return control;
  }

  function bulkEditorSelectAllControl() {
    const enabled = (control) => control
      && !control.disabled
      && control.getAttribute?.("aria-disabled") !== "true";
    const selector = 'input[type="checkbox"], [role="checkbox"], button[aria-checked]';

    const exactAriaLabel = [...document.querySelectorAll(selector)].find((control) => (
      enabled(control)
      && U.normalizeText(control.getAttribute?.("aria-label") || "") === "select all items for bulk edit"
    ));
    if (exactAriaLabel) {
      return { control: exactAriaLabel, target: visibleCheckboxTarget(exactAriaLabel), source: "exact eBay aria-label" };
    }

    // Current eBay Bulk Edit places the real select-all checkbox in the header row
    // containing Status, Photos, and Title. Warning checkboxes above the table must
    // never be mistaken for the select-all control.
    const headerRows = [...document.querySelectorAll("thead tr, tr, [role='row']")]
      .filter(U.isVisible)
      .map((row) => {
        const text = U.normalizeText(row.innerText || row.textContent || "");
        let score = 0;
        if (text.includes("status")) score += 30;
        if (text.includes("photos")) score += 30;
        if (text.includes("title")) score += 30;
        if (text.includes("available quant")) score += 15;
        if (text.includes("buy it now")) score -= 100;
        if (text.includes("listing cannot be revised")) score -= 200;
        return { row, score };
      })
      .filter((entry) => entry.score >= 75)
      .sort((a, b) => b.score - a.score);

    for (const { row } of headerRows) {
      const control = [...row.querySelectorAll(selector)].find(enabled);
      if (control) return { control, target: visibleCheckboxTarget(control), source: "table header" };
    }

    const theadControl = [...document.querySelectorAll(`thead ${selector}, [role='columnheader'] ${selector}`)].find(enabled);
    if (theadControl) return { control: theadControl, target: visibleCheckboxTarget(theadControl), source: "table header" };

    const labeled = [...document.querySelectorAll(selector)].find((control) => {
      if (!enabled(control)) return false;
      const label = U.normalizeText([
        control.getAttribute?.("aria-label"),
        control.getAttribute?.("title"),
        control.closest?.("label")?.innerText
      ].filter(Boolean).join(" "));
      return label.includes("select all") || label.includes("all listings") || label.includes("all items");
    });
    if (labeled) return { control: labeled, target: visibleCheckboxTarget(labeled), source: "select-all label" };

    // Last-resort geometry fallback: use the checkbox directly above and nearest to
    // the first listing-row checkbox. This excludes the warning checkboxes higher up.
    const firstDataRow = renderedBulkRows({ visibleOnly: true })[0];
    const firstTarget = visibleCheckboxTarget(firstDataRow?.checkbox);
    const firstRect = firstTarget?.getBoundingClientRect?.();
    if (firstRect) {
      const candidates = [...document.querySelectorAll(selector)]
        .filter(enabled)
        .map((control) => ({ control, target: visibleCheckboxTarget(control) }))
        .filter((entry) => entry.target && U.isVisible(entry.target))
        .map((entry) => ({ ...entry, rect: entry.target.getBoundingClientRect() }))
        .filter((entry) => entry.rect.bottom <= firstRect.top + 8)
        .filter((entry) => Math.abs((entry.rect.left + entry.rect.width / 2) - (firstRect.left + firstRect.width / 2)) <= 70)
        .sort((a, b) => b.rect.bottom - a.rect.bottom);
      if (candidates[0]) return { control: candidates[0].control, target: candidates[0].target, source: "nearest header checkbox" };
    }
    return null;
  }

  function bulkSelectAllClickTargets(found) {
    const output = [];
    const add = (element) => {
      if (!element || output.includes(element)) return;
      if (element.disabled || element.getAttribute?.("aria-disabled") === "true") return;
      output.push(element);
    };
    add(found?.target);
    add(found?.control);
    const control = found?.control;
    if (control?.id) {
      try { add(document.querySelector(`label[for="${CSS.escape(control.id)}"]`)); } catch (_) {}
    }
    add(control?.closest?.("label"));
    add(control?.closest?.("button, [role='checkbox'], [role='button']"));
    const target = found?.target;
    if (target && U.isVisible(target)) {
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      add(hit);
      add(hit?.closest?.("label, button, [role='checkbox'], [role='button']"));
    }
    return output;
  }

  async function selectAllBulkEditorListings(expectedCount) {
    window.scrollTo({ top: 0, behavior: "auto" });
    await new Promise((resolve) => setTimeout(resolve, 350));

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const current = bulkEditorSelectionProgress();
      if (current.selected === expectedCount) return true;

      const found = bulkEditorSelectAllControl();
      if (!found) return false;
      renderStatus(`Selecting all ${expectedCount.toLocaleString()} listings in Bulk Edit…`, "ready");

      for (const target of bulkSelectAllClickTargets(found)) {
        const before = bulkEditorSelectionProgress().selected;
        target.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
        await new Promise((resolve) => setTimeout(resolve, 80));
        try { target.click(); } catch (_) { dispatchFullClick(target); }

        const selected = await U.waitFor(() => {
          const progress = bulkEditorSelectionProgress();
          if (progress.selected === expectedCount) return progress.selected;
          if (progress.selected > before) return progress.selected;
          return null;
        }, 4000, 150);
        if (Number(selected) === expectedCount) return true;
        if (Number(selected) > 0 && Number(selected) < expectedCount) {
          // A real header click should select the entire loaded batch. Do not click a
          // second target and risk toggling the valid selection back off.
          break;
        }
      }

      const after = bulkEditorSelectionProgress();
      if (after.selected === expectedCount) return true;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return bulkEditorSelectionProgress().selected === expectedCount;
  }

  async function ensureBulkWorkspaceMatchesBatch(expectedCount, state) {
    const processed = await waitForBulkEditorReady(expectedCount, { allowFewer: true, timeout: 300000 });
    if (!processed) throw new Error("eBay Bulk Edit did not finish loading the selected batch.");
    if (processed.total > expectedCount || processed.total < 1) {
      throw new Error(`Safety stop: eBay opened ${processed.total} Bulk Edit rows, but this batch selected ${expectedCount}. No category changes were attempted.`);
    }

    const admittedCount = processed.total;
    await recordMove99Trace("Bulk Edit batch loaded.", `requested=${expectedCount};admitted=${admittedCount}`);
    let reconciliation = { admittedCount, omittedCount: 0, omittedIds: [] };
    if (admittedCount < expectedCount) {
      renderStatus(`eBay admitted ${admittedCount} of ${expectedCount} listings. Verifying every admitted row before continuing...`, "ready");
      const scan = await scanVirtualizedBulkRows(admittedCount);
      await recordMove99Trace(
        "Bulk Edit omission scan finished.",
        `seen=${scan.scanState.allRows.size};records=${scan.scanState.bulkRecords.size};qualifying=${scan.scanState.qualifyingRows.size};timedOut=${scan.timedOut}`
      );
      if (scan.scanState.allRows.size !== admittedCount || scan.scanState.bulkRecords.size !== admittedCount) {
        throw new Error(`Safety stop: eBay admitted ${admittedCount} rows, but only ${scan.scanState.bulkRecords.size} unique Bulk Edit rows could be verified. No category changes were attempted.`);
      }
      if (scan.scanState.qualifyingRows.size !== admittedCount) {
        throw new Error(`Safety stop: only ${scan.scanState.qualifyingRows.size} of ${admittedCount} admitted Bulk Edit rows still have the required .99 price. No category changes were attempted.`);
      }
      reconciliation = reconcileBulkWorkspaceBatch(state, [...scan.scanState.bulkRecords.values()], expectedCount);
      if (reconciliation.admittedCount !== admittedCount || reconciliation.omittedCount !== expectedCount - admittedCount) {
        throw new Error("Safety stop: the admitted and omitted Bulk Edit row counts do not reconcile with the saved batch. No category changes were attempted.");
      }
    }

    let selection = bulkEditorSelectionProgress();
    if (selection.total && selection.total !== admittedCount) {
      throw new Error(`Safety stop: Bulk Edit reports ${selection.total} available rows, but eBay admitted ${admittedCount}. No category changes were attempted.`);
    }
    if (selection.selected !== admittedCount) {
      const selectedAll = await selectAllBulkEditorListings(admittedCount);
      selection = bulkEditorSelectionProgress();
      if (!selectedAll || selection.selected !== admittedCount) {
        throw new Error(`Safety stop: only ${selection.selected} of ${admittedCount} admitted listings were selected in Bulk Edit after trying the real table-header select-all checkbox. No category changes were attempted.`);
      }
    }
    await recordMove99Trace("Bulk Edit batch reconciled and selected.", `selected=${selection.selected};admitted=${admittedCount};omitted=${reconciliation.omittedCount}`);
    return { ...processed, ...reconciliation };
  }

  function move99TaskCompletionRecord(record) {
    const failedCount = Number(record?.failedCount ?? record?.failed ?? 0);
    const remainingCount = Number(record?.remainingCount ?? 0);
    if (record?.status !== "Completed"
      || record?.scanMode !== "price99"
      || record?.proofType !== "final-zero-scan"
      || record?.verifiedZeroRemaining !== true
      || remainingCount !== 0
      || failedCount !== 0) return null;
    return {
      featureKey: "move99",
      computerLabel: record.computerLabel,
      ebayAccountLabel: record.ebayAccountLabel,
      status: record.status,
      scanMode: record.scanMode,
      proofType: record.proofType,
      verifiedZeroRemaining: true,
      remainingCount,
      failedCount,
      scannedCount: Number(record.verificationScannedCount ?? record.scannedRows ?? record.filteredCount ?? 0),
      completedAt: record.completedAt,
      pageUrl: record.pageUrl
    };
  }

  async function saveMove99Result(partial, clearPending = true) {
    const identity = await storageGet(["computerLabel", "ebayAccountLabel", "move99History"]);
    const record = {
      computerLabel: identity.computerLabel || "0",
      ebayAccountLabel: identity.ebayAccountLabel || "",
      sourceCategories: MOVE99_SOURCE_CATEGORIES,
      destinationCategory: MOVE99_DESTINATION_CATEGORY,
      scanMode: MOVE99_SCAN_MODE,
      completedAt: new Date().toISOString(),
      pageUrl: location.href,
      ...partial
    };
    const history = Array.isArray(identity.move99History) ? identity.move99History : [];
    history.push(record);
    const values = { lastMove99Result: record, move99History: history.slice(-100) };
    if (clearPending) values.pendingMove99Run = null;
    await storageSet(values);
    const completion = move99TaskCompletionRecord(record);
    if (completion) {
      try {
        const sync = await runtimeMessage({ type: "syncTaskCompletion", record: completion });
        await storageSet({ lastMove99TaskCompletionSync: { ...sync, at: new Date().toISOString(), record: completion } });
      } catch (error) {
        await storageSet({ lastMove99TaskCompletionSync: { ok: false, at: new Date().toISOString(), error: error.message, record: completion } });
      }
    }
    return record;
  }

  async function runMove99Automation() {
    if (move99Running) return;
    move99Running = true;
    try {
      const stored = await storageGet(["pendingMove99Run", "computerLabel", "ebayAccountLabel"]);
      let state = stored.pendingMove99Run;
      if (!state) return;
      if (state.phase === "awaiting-submit-approval") {
        await resumeMove99AfterManualSubmit(state);
        return;
      }
      if (state.phase === "approval-lost") return;
      if (await stopForEbayInterruption("Move .99")) return;
      await applyMove99AccountConfig(state.ebayAccountLabel || stored.ebayAccountLabel || "");
      MOVE99_SCAN_MODE = state?.scanMode === "non99" ? "non99" : "price99";
      if (state?.sourceCategories?.length) MOVE99_SOURCE_CATEGORIES = asStringArray(state.sourceCategories);
      if (state?.destinationCategory) MOVE99_DESTINATION_CATEGORY = String(state.destinationCategory).trim();
      if (state?.sourceStoreCategoryIds) MOVE99_SOURCE_STORE_CATEGORY_IDS = asStringArray(state.sourceStoreCategoryIds);
      MOVE99_ACTIVE_URL = buildMove99ActiveUrl(MOVE99_SOURCE_STORE_CATEGORY_IDS);

      const passiveSummary = state.phase === "scan-summary" || state.phase === "completed";
      if (passiveSummary) {
        const passiveState = { ...state, active: false, ownerTabId: null };
        if (state.active || state.ownerTabId != null) {
          await storageSet({ pendingMove99Run: passiveState, lastMove99Scan: passiveState });
        }
        if (isMove99ActiveListingsPage()) {
          showMove99ScanSummary(passiveState, state.phase === "completed");
        }
        return;
      }

      if (!state.active) return;
      await ensureTaskCanContinue();
      const claim = await runtimeMessage({ type: "claimMove99Tab", runId: state.runId || state.startedAt || "" });
      if (!claim?.ok) {
        renderStatus(`Move .99 could not bind to this tab: ${claim?.error || "unknown tab error"}`, "error");
        return;
      }
      if (!claim.owned) {
        renderStatus(`Move .99 is assigned to eBay tab ${claim.ownerTabId}. Close that tab or use Reset before starting here.`, "error");
        return;
      }
      state = { ...state, ownerTabId: claim.ownerTabId, runId: claim.runId || state.runId || state.startedAt || "" };
      const legacyMove99State = state?.scanStrategy !== MOVE99_SCAN_STRATEGY && (
        state?.phase === "bulk-editor-scan"
        || state?.phase === "apply-all-pages"
        || state?.selectionSource === "bulk-editor-scan"
      );
      if (legacyMove99State) {
        const restarted = {
          ...state,
          active: true,
          confirmed: true,
          phase: "active-prepare",
          scanStrategy: MOVE99_SCAN_STRATEGY,
          useEditAllBulkScan: false,
          currentPage: 1,
          scanPages: {},
          verificationPages: {},
          currentBatchIds: [],
          currentBatchCount: 0,
          selectionSource: ""
        };
        await storageSet({ pendingMove99Run: restarted });
        renderStatus("Restarting the saved Move .99 task with the exact Active Listings scanner...", "ready");
        if (!isMove99ActiveListingsPage()) await navigateToMove99ScanPage(1, MOVE99_ACTIVE_URL);
        else setTimeout(() => { move99Running = false; runMove99Automation(); }, 300);
        return;
      }
      if (state.phase === "active-prepare") {
        const configuredSourceUrlRequired = MOVE99_SOURCE_STORE_CATEGORY_IDS.length > 0;
        if (!isMove99ActiveListingsPage() || (configuredSourceUrlRequired && !isMove99SourceFilterUrl())) {
          renderStatus("Opening Active Listings for a full exact-item scan…", "ready");
          await navigateToMove99ScanPage(1, MOVE99_ACTIVE_URL);
          return;
        }
        renderStatus(`Filtering ${MOVE99_SOURCE_CATEGORIES.join(" and ")} before the full exact-ID scan...`, "ready");
        const filteredCount = await ensureCategoryFilterSelected();
        if (filteredCount === 0) {
          await saveMove99Result({
            status: "Completed",
            filteredCount: 0,
            qualifyingCount: 0,
            remainingCount: 0,
            failedCount: 0,
            proofType: "final-zero-scan",
            verifiedZeroRemaining: true
          });
          renderStatus("No listings found in the source categories.", "completed");
          return;
        }
        let filteredUrl = location.href;
        const discoveredSourceIds = numericMove99SourceCategoryIdsFromUrl(filteredUrl);
        if (!MOVE99_SOURCE_STORE_CATEGORY_IDS.length && discoveredSourceIds.length) {
          if (MOVE99_SCAN_MODE !== "non99") {
            await rememberDiscoveredMove99SourceCategoryIds(
              state.ebayAccountLabel || stored.ebayAccountLabel || "",
              discoveredSourceIds,
              state
            );
          }
          MOVE99_SOURCE_STORE_CATEGORY_IDS = discoveredSourceIds;
          MOVE99_ACTIVE_URL = buildMove99ActiveUrl(discoveredSourceIds);
          filteredUrl = buildMove99ActiveUrl(discoveredSourceIds);
        }
        const totalPages = Math.max(1, Math.ceil(filteredCount / 200));
        const scanState = {
          ...state,
          active: true,
          confirmed: true,
          phase: "scan-page",
          scanStrategy: MOVE99_SCAN_STRATEGY,
          filteredCount,
          filteredUrl,
          sourceStoreCategoryIds: MOVE99_SOURCE_STORE_CATEGORY_IDS,
          currentPage: 1,
          totalPages,
          scanPages: {},
          scanPageReloads: {},
          scanPassRestarts: 0,
          filterBaselineRestarts: 0,
          directRangeStart: 1,
          currentEditRange: null,
          currentBatchIds: [],
          currentBatchCount: 0,
          currentBatchSourceCount: 0,
          failedIds: state.failedIds || [],
          processedIds: state.processedIds || [],
          totals: state.totals || { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 }
        };
        await storageSet({ pendingMove99Run: scanState });
        renderStatus(`Scanning all ${filteredCount.toLocaleString()} filtered listings by exact eBay item number before creating a publish workspace...`, "ready");
        await navigateToMove99ScanPage(1, filteredUrl);
        return;
      }

      if (state.phase === "scan-page" || state.phase === "verify-page") {
        if (!isMove99ActiveListingsPage()) {
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const targetPage = Number(state.currentPage || 1);
        if (activePageInfo().current !== targetPage) {
          await navigateToMove99ScanPage(targetPage, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const verifying = state.phase === "verify-page";
        const pagesField = verifying ? "verificationPages" : "scanPages";
        const existingPages = state[pagesField] || {};
        const previouslyAssignedIds = [];
        for (const [pageKey, pageRecord] of Object.entries(existingPages)) {
          if (String(pageKey) === String(targetPage)) continue;
          for (const itemId of Array.isArray(pageRecord?.itemIds) ? pageRecord.itemIds : []) {
            previouslyAssignedIds.push(String(itemId));
          }
        }
        const scan = await scan99OnActivePage(verifying ? "Verifying" : "Scanning", previouslyAssignedIds);
        if (Number(scan.shortfall || 0) > 0) {
          const reloadsField = verifying ? "verificationPageReloads" : "scanPageReloads";
          const restartsField = verifying ? "verificationPassRestarts" : "scanPassRestarts";
          const pageReloads = { ...(state[reloadsField] || {}) };
          const reloadCount = Number(pageReloads[String(targetPage)] || 0);
          if (reloadCount < 1) {
            pageReloads[String(targetPage)] = reloadCount + 1;
            await storageSet({ pendingMove99Run: { ...state, [reloadsField]: pageReloads } });
            renderStatus(`Page ${targetPage} loaded ${scan.inspected} of ${scan.expected} new rows. Reloading that page cleanly before continuing…`, "ready");
            await navigateToMove99ScanPage(targetPage, state.filteredUrl || MOVE99_ACTIVE_URL);
            return;
          }

          const passRestarts = Number(state[restartsField] || 0);
          if (passRestarts < 1) {
            const restarted = {
              ...state,
              [pagesField]: {},
              [reloadsField]: {},
              [restartsField]: passRestarts + 1,
              currentPage: 1
            };
            await storageSet({ pendingMove99Run: restarted });
            renderStatus(`eBay's page boundaries moved during the ${verifying ? "verification" : "scan"}. Restarting a clean full pass (${passRestarts + 2} of 3)…`, "ready");
            await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
            return;
          }
          throw new Error(`Page ${targetPage} should contain ${scan.expected} new listings after excluding earlier pages, but only ${scan.inspected} could be inspected after clean retries. No changes were attempted.`);
        }
        const key = String(scan.page);
        const pages = { ...existingPages, [key]: scan };
        const pageInfo = activePageInfo();
        const liveResults = activeResultsInfo();
        if (!verifying && liveResults?.total && Number(liveResults.total) !== Number(state.filteredCount || 0)) {
          const baselineRestarts = Number(state.filterBaselineRestarts || 0);
          if (baselineRestarts < MOVE99_FILTER_BASELINE_RESTART_LIMIT) {
            const previousTotal = Number(state.filteredCount || 0);
            const nextTotal = Number(liveResults.total);
            const restarted = {
              ...state,
              filteredCount: nextTotal,
              totalPages: pageInfo.total,
              currentPage: 1,
              scanPages: {},
              scanPageReloads: {},
              scanPassRestarts: 0,
              filterBaselineRestarts: baselineRestarts + 1
            };
            await storageSet({ pendingMove99Run: restarted });
            renderStatus(
              `The filtered total changed from ${previousTotal.toLocaleString()} to ${nextTotal.toLocaleString()} on page ${targetPage}. Restarting a clean full scan (${baselineRestarts + 2} of ${MOVE99_FILTER_BASELINE_RESTART_LIMIT + 1})...`,
              "ready"
            );
            await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
            return;
          }
          throw new Error(`The filtered listing total changed from ${Number(state.filteredCount || 0).toLocaleString()} to ${Number(liveResults.total).toLocaleString()} during the scan. No changes were attempted.`);
        }
        if (!verifying && Number(state.totalPages || 0) && pageInfo.total !== Number(state.totalPages)) {
          throw new Error(`The filtered page count changed from ${Number(state.totalPages)} to ${pageInfo.total} during the scan. No changes were attempted.`);
        }
        const logicalTotalPages = move99LogicalTotalPages(
          liveResults?.total,
          state.filteredCount,
          state.totalPages,
          pageInfo.total
        );
        const nextPage = scan.page + 1;
        if (nextPage <= logicalTotalPages) {
          await storageSet({ pendingMove99Run: { ...state, [pagesField]: pages, currentPage: nextPage, totalPages: logicalTotalPages } });
          renderStatus(`${verifying ? "Verification" : "Scan"} page ${scan.page} complete. Opening page ${nextPage} of ${logicalTotalPages}…`, "ready");
          await navigateToMove99ScanPage(nextPage, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }

        const rawScanned = Object.values(pages).reduce((sum, page) => sum + Number(page?.inspected || 0), 0);
        const normalizedPages = dedupeMove99Pages(pages);
        const scanned = uniqueMove99InspectedCount(normalizedPages);
        const expectedTotal = Number(state.filteredCount || 0);
        if (!verifying) {
          if (expectedTotal && scanned !== expectedTotal) {
            throw new Error(`The full scan expected ${expectedTotal.toLocaleString()} unique listings but inspected ${scanned.toLocaleString()}. No category changes were attempted.`);
          }
          const duplicateRowsIgnored = Math.max(0, rawScanned - scanned);
          const qualifyingCount = flattenMove99Pages(normalizedPages).length;
          const summaryState = {
            ...state,
            active: false,
            ownerTabId: null,
            phase: "scan-summary",
            scanStrategy: MOVE99_SCAN_STRATEGY,
            scanIntegrity: "verified",
            uniqueInspected: scanned,
            qualifyingCount,
            scanPages: normalizedPages,
            currentPage: scan.page,
            duplicateRowsIgnored
          };
          await storageSet({ pendingMove99Run: summaryState, lastMove99Scan: summaryState });
          renderStatus(`Full scan complete - ${qualifyingCount} ${move99FoundLabel()} across ${scanned} verified unique listings${duplicateRowsIgnored ? `; ${duplicateRowsIgnored} duplicate rows ignored` : ""}.`, "completed");
          showMove99ScanSummary(summaryState, false);
          return;
        }

        const normalizedVerificationPages = dedupeMove99Pages(pages);
        const remainingRecords = flattenMove99Pages(normalizedVerificationPages);
        const remainingIds = new Set(remainingRecords.map((record) => String(record.itemId)));
        const originalRecords = flattenMove99Pages(state.scanPages);
        const failedIds = [...new Set([...(state.failedIds || []).map(String), ...remainingIds])];
        const completedState = {
          ...state,
          active: false,
          ownerTabId: null,
          phase: "completed",
          verificationPages: normalizedVerificationPages,
          failedIds,
          verifiedAt: new Date().toISOString()
        };
        await storageSet({ pendingMove99Run: completedState, lastMove99Scan: completedState });
        await saveMove99Result({
          status: remainingRecords.length ? "Completed with remaining listings" : "Completed",
          filteredCount: state.filteredCount,
          qualifyingCount: originalRecords.length,
          remainingCount: remainingRecords.length,
          batches: Number(state.totals?.batches || 0),
          live: Number(state.totals?.live || 0),
          failed: Number(state.totals?.failed || 0),
          failedCount: Number(state.totals?.failed || 0),
          verificationScannedCount: normalizedVerificationPages.reduce((sum, page) => sum + Number(page?.scannedCount || page?.records?.length || 0), 0),
          proofType: "final-zero-scan",
          verifiedZeroRemaining: remainingRecords.length === 0,
          audit: originalRecords.map((record) => ({ itemId: record.itemId, price: record.price, result: remainingIds.has(String(record.itemId)) ? "Remaining" : "Moved" }))
        }, false);
        renderStatus(`Verification complete — ${remainingRecords.length} qualifying listings remain.`, remainingRecords.length ? "error" : "completed");
        showMove99ScanSummary(completedState, true);
        return;
      }

      if (state.phase === "apply-exact-workspace") {
        if (!isMove99ActiveListingsPage()) {
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const exactBatches = Array.isArray(state.exactBatches) ? state.exactBatches : [];
        const applyIndex = Number(state.applyIndex || 0);
        if (applyIndex >= exactBatches.length) {
          const next = { ...state, phase: "verify-page", currentPage: 1, verificationPages: {} };
          await storageSet({ pendingMove99Run: next });
          renderStatus("All exact-item workspaces were submitted. Starting final verification scan...", "ready");
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const batch = assertMove99ExactBatchIntegrity(state, exactBatches[applyIndex], applyIndex);
        renderStatus(
          `Creating exact eBay Bulk Edit workspace ${applyIndex + 1} of ${exactBatches.length} for ${batch.length.toLocaleString()} verified listings...`,
          "ready"
        );
        await openExactMove99Workspace(batch, { ...state, applyIndex });
        return;
      }

      if (state.phase === "apply-range") {
        if (!isMove99ActiveListingsPage()) {
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const applyRanges = Array.isArray(state.applyRanges) ? state.applyRanges : [];
        const applyIndex = Number(state.applyIndex || 0);
        if (applyIndex >= applyRanges.length) {
          const next = { ...state, phase: "verify-page", currentPage: 1, verificationPages: {} };
          await storageSet({ pendingMove99Run: next });
          renderStatus("All exact eBay edit ranges were submitted. Starting final verification scan...", "ready");
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const requestedRange = applyRanges[applyIndex];
        const range = assertMove99RangeIntegrity(state, requestedRange);
        renderStatus(
          `Opening eBay Edit listings ${range.rangeStart.toLocaleString()} - ${range.rangeEnd.toLocaleString()} for ${range.targetIds.length.toLocaleString()} exact saved matches...`,
          "ready"
        );
        await openFilteredListingRangeInBulkEditor(range, {
          ...state,
          applyIndex,
          currentBatchIds: range.targetIds,
          currentBatchCount: range.targetIds.length,
          currentBatchSourceCount: range.targetIds.length
        });
        return;
      }

      if (state.phase === "bulk-editor-range") {
        if (!isMove99BulkEditorPage()) return;
        const requestedRange = state.currentEditRange || state.applyRanges?.[Number(state.applyIndex || 0)];
        const range = assertMove99RangeIntegrity(state, requestedRange);
        renderStatus(
          `Selecting exact saved matches inside listings ${range.rangeStart.toLocaleString()} - ${range.rangeEnd.toLocaleString()}...`,
          "ready"
        );
        const summary = await selectSavedIdsInBulkRange(range, state);
        const failedIds = [...new Set([...(state.failedIds || []).map(String), ...summary.missingIds.map(String)])];
        if (!summary.selectedIds.length) {
          const next = nextMove99BatchState({
            ...state,
            failedIds,
            currentBatchIds: range.targetIds,
            currentBatchCount: 0,
            currentBatchSourceCount: range.targetIds.length,
            bulkEditorOmittedIds: [...new Set([...(state.bulkEditorOmittedIds || []).map(String), ...summary.missingIds.map(String)])]
          });
          await storageSet({ pendingMove99Run: next });
          renderStatus("No verified saved matches were selectable in this range. Continuing to the next range before final verification...", "error");
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }

        const reconciledState = {
          ...state,
          active: true,
          confirmed: true,
          phase: "bulk-editor-range",
          selectionSource: "saved-id-range",
          failedIds,
          currentBatchIds: range.targetIds,
          currentBatchSourceCount: range.targetIds.length,
          currentBatchCount: summary.selectedIds.length,
          currentEditRange: {
            rangeStart: range.rangeStart,
            rangeEnd: range.rangeEnd,
            rangeCount: range.rangeCount,
            targetIds: range.targetIds
          },
          bulkEditorOmittedCount: Number(state.bulkEditorOmittedCount || 0) + summary.missingIds.length,
          bulkEditorOmittedIds: [...new Set([...(state.bulkEditorOmittedIds || []).map(String), ...summary.missingIds.map(String)])],
          bulkRangeSummary: summary
        };
        await storageSet({ pendingMove99Run: reconciledState });
        renderStatus(`Changing only the primary Store category for ${summary.selectedIds.length.toLocaleString()} exact saved listings...`, "ready");
        const categoryUpdate = await choosePrimaryStoreCategory(summary.selectedIds.length);
        await pauseMove99AtReviewScreen(categoryUpdate, reconciledState, summary.selectedIds.length);
        return;
      }

      if (state.phase === "apply-all-pages") {
        if (!isMove99ActiveListingsPage()) {
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const sourcePages = state.applySourcePages || state.scanPages || {};
        renderStatus("Selecting all saved .99 listings across source pages for one Bulk Edit batch...", "ready");
        const selection = await selectSavedIdsAcrossActivePages(sourcePages);
        const failedIds = [...new Set([...(state.failedIds || []).map(String), ...selection.missingIds])];
        if (!selection.selectedIds.length) {
          const next = { ...state, failedIds, phase: "verify-page", currentPage: 1, verificationPages: {} };
          await storageSet({ pendingMove99Run: next });
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const nextState = { ...state, failedIds, currentBatchIds: selection.selectedIds, currentBatchCount: selection.selectedIds.length, currentBatchPage: activePageInfo().current };
        await openSelectedListingsInBulkEditor(selection.selectedIds, nextState);
        return;
      }

      if (state.phase === "apply-page") {
        if (!isMove99ActiveListingsPage()) {
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const applyPages = Array.isArray(state.applyPages) ? state.applyPages : [];
        const applyIndex = Number(state.applyIndex || 0);
        if (applyIndex >= applyPages.length) {
          const next = { ...state, phase: "verify-page", currentPage: 1, verificationPages: {} };
          await storageSet({ pendingMove99Run: next });
          renderStatus("All saved batches submitted. Starting final verification scan…", "ready");
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const targetPage = Number(applyPages[applyIndex]);
        if (activePageInfo().current !== targetPage) await goToActivePage(targetPage);
        const pageRecord = state.applySourcePages?.[String(targetPage)];
        const allTargetIds = (pageRecord?.qualifying || []).map((record) => String(record.itemId));
        const pageBatchOffset = Number(state.pageBatchOffset || 0);
        const targetIds = allTargetIds.slice(pageBatchOffset, pageBatchOffset + MOVE99_BULK_BATCH_LIMIT);
        if (!targetIds.length) {
          await storageSet({ pendingMove99Run: { ...state, applyIndex: applyIndex + 1, pageBatchOffset: 0 } });
          setTimeout(() => { move99Running = false; runMove99Automation(); }, 300);
          return;
        }
        assertMove99BatchIntegrity(state, pageRecord, targetIds, targetPage);
        renderStatus(`Applying saved scan: page ${targetPage}, batch ${applyIndex + 1} of ${applyPages.length}…`, "ready");
        const selection = await selectSavedIdsOnActivePage(targetIds);
        const failedIds = [...new Set([...(state.failedIds || []).map(String), ...selection.missingIds])];
        if (!selection.selectedIds.length) {
          await storageSet({ pendingMove99Run: { ...state, failedIds, applyIndex: applyIndex + 1, pageBatchOffset: 0 } });
          setTimeout(() => { move99Running = false; runMove99Automation(); }, 300);
          return;
        }
        const nextState = {
          ...state,
          failedIds,
          currentBatchIds: selection.selectedIds,
          currentBatchCount: selection.selectedIds.length,
          currentBatchPage: targetPage,
          currentBatchOffset: pageBatchOffset,
          currentPageTotalIds: allTargetIds.length,
          pageBatchOffset
        };
        await openSelectedListingsInBulkEditor(selection.selectedIds, nextState);
        return;
      }

      if (state.phase === "bulk-editor-scan") {
        if (!isMove99BulkEditorPage()) return;
        const directRange = state.currentEditRange || {};
        renderStatus(`Scanning a memory-safe working batch inside eBay Edit listings ${Number(directRange.rangeStart || 1).toLocaleString()}-${Number(directRange.rangeEnd || state.filteredCount || 0).toLocaleString()} for ${move99FoundLabel()}...`, "ready");
        const summary = await selectAll99Listings(Number(directRange.rangeCount || 0));
        const unrevisableCount = Number(state.unrevisableCount || 0) + Number(summary.omittedCount || 0);
        if (!summary.qualifyingCount) {
          const rangeEnd = Number(directRange.rangeEnd || summary.processedTotal || 0);
          const filteredCount = Number(state.filteredCount || summary.processedTotal || 0);
          if (rangeEnd < filteredCount) {
            const nextRangeStart = rangeEnd + 1;
            await storageSet({
              pendingMove99Run: {
                ...state,
                active: true,
                phase: "active-prepare",
                directRangeStart: nextRangeStart,
                currentEditRange: null,
                unrevisableCount,
                bulkScanSummary: summary
              }
            });
            renderStatus(`No ${move99FoundLabel()} in this exact range. Returning to Active Listings for the next range...`, "ready");
          await navigateToMove99ScanPage(1, state.filteredUrl || MOVE99_ACTIVE_URL);
            return;
          }
          await saveMove99Result({
            status: "Completed",
            filteredCount,
            qualifyingCount: 0,
            remainingCount: 0,
            failedCount: 0,
            scannedRows: summary.scannedRows,
            unrevisableCount,
            proofType: "final-zero-scan",
            verifiedZeroRemaining: true
          });
          renderStatus(`Every Bulk Edit range was inspected - no ${move99FoundLabel()} remain.`, "completed");
          return;
        }
        await ensureBulkSelectionMatchesScan(summary.qualifyingCount);
        const nextState = {
          ...state,
          active: true,
          confirmed: true,
          phase: "bulk-editor",
          scanStrategy: MOVE99_SCAN_STRATEGY,
          applyStrategy: MOVE99_DIRECT_APPLY_STRATEGY,
          selectionSource: "bulk-editor-price-scan",
          currentBatchCount: summary.qualifyingCount,
          currentBatchIds: [],
          unrevisableCount,
          bulkScanSummary: summary
        };
        await storageSet({ pendingMove99Run: nextState });
        renderStatus(`Changing Store category for ${summary.qualifyingCount.toLocaleString()} scanned Bulk Edit rows...`, "ready");
        const categoryUpdate = await choosePrimaryStoreCategory(summary.qualifyingCount, summary.workspaceTotal);
        await pauseMove99AtReviewScreen(categoryUpdate, nextState, summary.qualifyingCount);
        return;
      }

      if (state.phase === "bulk-editor") {
        const singleListingEditor = isMove99SingleListingEditorPage();
        if (!isMove99BulkEditorPage() && !singleListingEditor) return;
        const batchCount = Number(state.currentBatchCount || state.currentBatchIds?.length || 0);
        if (!batchCount) throw new Error("The selected batch information was lost. Restart Move .99 Listings.");
        if (singleListingEditor) {
          renderStatus("Verifying the one-listing audited batch...", "ready");
          const categoryUpdate = await choosePrimaryStoreCategorySingleListing(batchCount, state);
          await pauseMove99AtReviewScreen(categoryUpdate, state, batchCount);
          return;
        }
        renderStatus(`Verifying the ${batchCount}-listing Bulk Edit batch…`, "ready");
        const directBulkScan = state.selectionSource === "bulk-editor-price-scan" || state.selectionSource === "bulk-editor-scan";
        if (directBulkScan) await ensureBulkSelectionMatchesScan(batchCount);
        const workspace = directBulkScan
          ? { admittedCount: batchCount, omittedCount: 0, omittedIds: [] }
          : await ensureBulkWorkspaceMatchesBatch(batchCount, state);
        const admittedCount = Number(workspace.admittedCount || batchCount);
        const reconciledState = {
          ...state,
          currentBatchSourceCount: batchCount,
          currentBatchCount: admittedCount,
          bulkEditorOmittedCount: Number(state.bulkEditorOmittedCount || 0) + Number(workspace.omittedCount || 0),
          bulkEditorOmittedIds: [...new Set([...(state.bulkEditorOmittedIds || []).map(String), ...(workspace.omittedIds || []).map(String)])]
        };
        if (workspace.omittedCount) {
          renderStatus(`eBay admitted ${admittedCount} of ${batchCount}; ${workspace.omittedCount} omitted listing will be retried during final verification.`, "ready");
        }
        renderStatus("Changing the primary Store category for this batch…", "ready");
        const workspaceTotal = directBulkScan
          ? Number(state.bulkScanSummary?.workspaceTotal || state.currentEditRange?.rangeCount || admittedCount)
          : admittedCount;
        const categoryUpdate = await choosePrimaryStoreCategory(admittedCount, workspaceTotal);
        await pauseMove99AtReviewScreen(categoryUpdate, reconciledState, admittedCount);
        return;
      }

    } catch (error) {
      if (await stopForEbayInterruption("Move .99")) return;
      if (taskWasStopped(error)) {
        renderStatus("Move .99 Listings stopped by user.", "error");
        return;
      }
      const current = await storageGet(["pendingMove99Run"]);
      await saveMove99Result({ status: "Failed", error: error.message }, false);
      const failedState = { ...(current.pendingMove99Run || {}), active: false, error: error.message };
      if (canRecoverMove99FirstBatchFromVerifiedScan(failedState)) {
        const recoveredState = recoverMove99VerifiedScanSummary(failedState, error.message);
        await storageSet({ pendingMove99Run: recoveredState, lastMove99Scan: recoveredState });
      } else if (canRecoverMove99ThroughVerification(failedState)) {
        const pausedState = pauseMove99ForReconciliation(failedState, error.message);
        await storageSet({ pendingMove99Run: pausedState, lastMove99Scan: pausedState });
        renderStatus("Move .99 stopped. Run Move .99 again to start a read-only reconciliation scan; no new tab or batch was opened.", "error");
        return;
      } else {
        await storageSet({ pendingMove99Run: failedState });
      }
      renderStatus(`Move .99 Listings failed: ${error.message}`, "error");
      alert(`Move .99 Listings stopped safely.\n\n${error.message}`);
    } finally {
      move99Running = false;
    }
  }

  async function startMove99Listings(scanMode = "price99") {
    let reservationToken = "";
    try {
    reservationToken = await U.claimWorkflowStart("move99", "Move .99");
    await storageSet({ gldnStopRequested: false });
    const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel", "pendingMove99Run"]);
    const identity = normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel);
    if (!identity.ebayAccountLabel) {
      alert("This computer is Poshmark-only or is not configured. Move .99 requires an eBay computer.");
      return;
    }
    const accountConfig = await applyMove99AccountConfig(identity.ebayAccountLabel);
    const interruptedState = storedIdentity.pendingMove99Run;
    if (scanMode === "price99"
      && interruptedState?.phase === "reconciliation-required"
      && canRecoverMove99ThroughVerification(interruptedState)) {
      const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
      if (!tabInfo?.ok || !Number.isInteger(tabInfo.tabId)) {
        throw new Error("The current eBay tab could not be identified for reconciliation.");
      }
      const recoveredState = {
        ...recoverMove99ThroughVerification(interruptedState, interruptedState.reconciliationReason),
        ownerTabId: tabInfo.tabId
      };
      await storageSet({ pendingMove99Run: recoveredState, lastMove99Scan: recoveredState });
      await U.releaseWorkflowStart(reservationToken);
      reservationToken = "";
      renderStatus("Starting the saved read-only reconciliation scan. No listing changes will be attempted.", "ready");
      runMove99Automation();
      return;
    }
    if (scanMode === "price99" && canRecoverMove99FirstBatchFromVerifiedScan(interruptedState)) {
      const recoveredState = recoverMove99VerifiedScanSummary(interruptedState);
      await storageSet({ pendingMove99Run: recoveredState, lastMove99Scan: recoveredState });
      await U.releaseWorkflowStart(reservationToken);
      reservationToken = "";
      renderStatus("Recovered the verified Move .99 scan. Review it and click Apply to continue.", "ready");
      const recoveryUrl = move99ScanPageUrl(
        1,
        recoveredState.filteredUrl || buildMove99ActiveUrl(recoveredState.sourceStoreCategoryIds || accountConfig.sourceStoreCategoryIds)
      );
      if (isMove99ActiveListingsPage()) runMove99Automation();
      else await navigateToMove99ScanPage(1, recoveryUrl);
      return;
    }
    const reverse = scanMode === "non99";
    const sourceCategories = reverse ? [accountConfig.destinationCategory] : accountConfig.sourceCategories;
    const destinationCategory = reverse ? accountConfig.sourceCategories[0] : accountConfig.destinationCategory;
    const sourceStoreCategoryIds = reverse ? [] : accountConfig.sourceStoreCategoryIds;
    const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
    if (!tabInfo?.ok || !Number.isInteger(tabInfo.tabId)) {
      throw new Error("The current eBay tab could not be identified. Reload this tab and start Move .99 again.");
    }
    const startedAt = new Date().toISOString();
    const runId = globalThis.crypto?.randomUUID?.() || `move99-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await storageSet({
      pendingMove99Run: {
        active: true,
        confirmed: true,
        runId,
        ownerTabId: tabInfo.tabId,
        phase: "active-prepare",
        scanMode: reverse ? "non99" : "price99",
        scanStrategy: MOVE99_SCAN_STRATEGY,
        ebayAccountLabel: accountConfig.account,
        currentPage: 1,
        scanPages: {},
        verificationPages: {},
        failedIds: [],
        processedIds: [],
        totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
        startedAt,
        sourceCategories,
        destinationCategory,
        sourceStoreCategoryIds,
        backburnerItemIds: accountConfig.backburnerItemIds
      }
    });
    await U.releaseWorkflowStart(reservationToken);
    reservationToken = "";
    renderStatus("Starting the full eBay Active Listings exact-ID scan...", "ready");
    runMove99Automation();
    } catch (error) {
      renderStatus(error.message || "Move .99 could not start.", "error");
    } finally {
      await U.releaseWorkflowStart(reservationToken);
    }
  }

  async function startListingLimitCheck() {
    let reservationToken = "";
    try {
      reservationToken = await U.claimWorkflowStart("listing-limits", "Listing limit check");
      await storageSet({
        gldnStopRequested: false,
        pendingReviewMonthlyLimits: { active: true, phase: "active-listings", startedAt: new Date().toISOString() }
      });
    } catch (error) {
      renderStatus(error.message || "Listing limit check could not start.", "error");
      return;
    } finally {
      await U.releaseWorkflowStart(reservationToken);
    }
    reviewMonthlyLimits();
  }

  async function resumePendingActions() {
    const result = await storageGet(["pendingMarkShippedRun", "pendingSellerLevelScan", "pendingReviewMonthlyLimits", "pendingMove99Run"]);
    if (result.pendingMarkShippedRun?.active) {
      if (result.pendingMarkShippedRun.phase === "awaiting-activation-approval") {
        setTimeout(() => showMarkShippedActivationApproval(result.pendingMarkShippedRun), 600);
      } else if (result.pendingMarkShippedRun.phase === "awaiting-approval") {
        setTimeout(monitorPendingMarkShippedApproval, 600);
      } else if (result.pendingMarkShippedRun.phase === "activating-approved-action") {
        setTimeout(() => reconcileApprovedMarkShippedActivation(result.pendingMarkShippedRun), 600);
      } else if (result.pendingMarkShippedRun.phase === "prepare" && isAwaitingShipmentPage()) {
        setTimeout(runMarkShippedAutomation, 600);
      } else if (result.pendingMarkShippedRun.phase === "manual-review-required") {
        renderStatus("Mark as Shipped needs manual review. Review eBay, then use Reset.", "error");
      }
    }
    if (result.pendingSellerLevelScan && isSellerLevelPage()) {
      setTimeout(scanHealthPage, 700);
    }
    if (result.pendingReviewMonthlyLimits && (isActiveListingsPage() || /\/sh\/ovw/i.test(location.href))) {
      setTimeout(reviewMonthlyLimits, 700);
    }
    let pendingMove99 = result.pendingMove99Run;
    if (pendingMove99 && String(pendingMove99.extensionVersion || "") !== EXTENSION_VERSION) {
      const migrated = FOUNDATION.migratePortableMove99Summary(pendingMove99, EXTENSION_VERSION);
      if (migrated) {
        await storageSet({ pendingMove99Run: migrated, lastMove99Scan: migrated });
        pendingMove99 = migrated;
        renderStatus(`Preserved the verified ${Number(migrated.qualifyingCount || 0).toLocaleString()}-listing category scan for review.`, "completed");
      } else {
        await storageRemove(["pendingMove99Run"]);
        pendingMove99 = null;
        renderStatus("Cleared an unfinished Move .99 task from the previous extension version.", "ready");
      }
    }
    if (!pendingMove99?.active && pendingMove99?.error && canRecoverMove99FirstBatchFromVerifiedScan(pendingMove99)) {
      pendingMove99 = recoverMove99VerifiedScanSummary(pendingMove99);
      await storageSet({ pendingMove99Run: pendingMove99, lastMove99Scan: pendingMove99 });
      renderStatus("Recovered the verified Move .99 scan after the interrupted first Bulk Edit batch.", "ready");
    }
    if (pendingMove99?.phase === "awaiting-submit-approval") {
      setTimeout(() => resumeMove99AfterManualSubmit(pendingMove99), 900);
    }
    if (pendingMove99?.phase === "reconciliation-required") {
      renderStatus("Move .99 needs reconciliation. Run Move .99 again to start the saved read-only verification scan.", "error");
    }
    const passiveMove99Summary = pendingMove99?.phase === "scan-summary" || pendingMove99?.phase === "completed";
    const shouldResumeMove99 = pendingMove99?.active
      ? (isMove99ActiveListingsPage() || isMove99BulkEditorPage() || isMove99SingleListingEditorPage())
      : (passiveMove99Summary && isMove99ActiveListingsPage());
    if (shouldResumeMove99) {
      if (pendingMove99?.active) {
        renderStatus(`Resuming Move .99 (${String(pendingMove99.phase || "starting").replace(/-/g, " ")})...`, "ready");
      }
      setTimeout(runMove99Automation, 900);
    }
  }

  function renderStatus(message, type = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function refreshPanelIdentity() {
    if (!panelIdentityElement) return;
    const storedIdentity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    const identity = normalizedIdentity(storedIdentity.computerLabel, storedIdentity.ebayAccountLabel);
    const computer = identity.computerLabel;
    const account = identity.poshmarkOnly ? "Poshmark only" : identity.ebayAccountLabel || "eBay account not set";
    panelIdentityElement.innerHTML = `<span>Computer: <strong>${escapeHtml(computer)}</strong></span><span>eBay account: <strong>${escapeHtml(account)}</strong></span>`;
  }

  function createPanel() {
    if (document.getElementById("gldn-ebay-order-panel")) return;
    panel = document.createElement("div");
    panel.id = "gldn-ebay-order-panel";
    panel.className = "gldn-order-panel";
    panel.innerHTML = `
      <div class="gldn-panel-heading">
        <img class="gldn-logo-image" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="GLDN Ops">
        <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v${chrome.runtime.getManifest().version}</span></div>
        <div class="gldn-drag-grip" aria-hidden="true">⋮⋮</div>
      </div>
      <div class="gldn-panel-identity"></div>
      <button type="button" data-action="mark-shipped" class="gldn-success">Mark as Shipped</button>
      <button type="button" data-action="health" class="gldn-secondary">Scan Seller Level</button>
      <button type="button" data-action="snapshot" class="gldn-secondary">Scan Sales Snapshot</button>
      <button type="button" data-action="limits" class="gldn-danger">Confirm Listings Under Limit</button>
      <button type="button" data-action="prepare" class="gldn-primary">Prepare Order Note</button>
      <button type="button" data-action="review-move99-scan" class="gldn-warning" hidden>Review Saved Category Scan</button>
      <button type="button" data-action="apply-move99-scan" class="gldn-primary" hidden>Apply Saved Category Scan</button>
      <div class="gldn-task-controls">
        <button type="button" data-action="open-dashboard" class="gldn-dashboard">Dashboard</button>
        <button type="button" data-action="dashboard-setup" class="gldn-secondary">Setup</button>
        <button type="button" data-action="feature-health" class="gldn-secondary">Health Check</button>
        <button type="button" data-action="stop-task" class="gldn-stop-task">Stop Task</button>
        <button type="button" data-action="reset-task" class="gldn-reset-task">Reset</button>
        <button type="button" data-action="reload-extension" class="gldn-dev-reload">Update &amp; Reload</button>
      </div>
      <div class="gldn-status">Ready.</div>
    `;
    document.documentElement.appendChild(panel);
    U.makePanelDraggable(panel, "gldnEbayPanelPosition");
    const panelSettingsMenu = panel.querySelector(".gldn-panel-settings-menu");
    if (panelSettingsMenu) {
      const storeCategoryButton = document.createElement("button");
      storeCategoryButton.type = "button";
      storeCategoryButton.className = "gldn-secondary";
      storeCategoryButton.dataset.action = "store-category-settings";
      storeCategoryButton.textContent = "Store Categories";
      storeCategoryButton.addEventListener("click", showMove99SettingsModal);
      panelSettingsMenu.appendChild(storeCategoryButton);

      const move99Button = document.createElement("button");
      move99Button.type = "button";
      move99Button.className = "gldn-secondary";
      move99Button.dataset.action = "move99-workflow";
      move99Button.textContent = "Run Move .99 Workflow";
      move99Button.addEventListener("click", () => {
        panelSettingsMenu.setAttribute("hidden", "");
        startMove99Listings();
      });
      panelSettingsMenu.appendChild(move99Button);

      const reverseMove99Button = document.createElement("button");
      reverseMove99Button.type = "button";
      reverseMove99Button.className = "gldn-secondary";
      reverseMove99Button.dataset.action = "move-non99-workflow";
      reverseMove99Button.textContent = "Move Non-.99 Out of Sale";
      reverseMove99Button.addEventListener("click", () => {
        panelSettingsMenu.setAttribute("hidden", "");
        startMove99Listings("non99");
      });
      panelSettingsMenu.appendChild(reverseMove99Button);

      snipingWinnerButtonElement = document.createElement("button");
      snipingWinnerButtonElement.type = "button";
      snipingWinnerButtonElement.className = "gldn-warning";
      snipingWinnerButtonElement.dataset.action = "capture-sniping-winner";
      snipingWinnerButtonElement.textContent = "Capture Sniping Winner";
      snipingWinnerButtonElement.hidden = true;
      snipingWinnerButtonElement.addEventListener("click", () => {
        panelSettingsMenu.setAttribute("hidden", "");
        captureSnipingWinner();
      });
      panelSettingsMenu.appendChild(snipingWinnerButtonElement);
    }
    statusElement = panel.querySelector(".gldn-status");
    panelIdentityElement = panel.querySelector(".gldn-panel-identity");
    panel.querySelector("[data-action='mark-shipped']").addEventListener("click", startMarkShipped);
    panel.querySelector("[data-action='prepare']").addEventListener("click", prepareNote);
    panel.querySelector("[data-action='health']").addEventListener("click", startSellerLevelScan);
    panel.querySelector("[data-action='snapshot']").addEventListener("click", startEbaySnapshotScan);
    limitsButtonElement = panel.querySelector("[data-action='limits']");
    limitsButtonElement.addEventListener("click", startListingLimitCheck);
    move99ReviewButtonElement = panel.querySelector("[data-action='review-move99-scan']");
    move99ApplyButtonElement = panel.querySelector("[data-action='apply-move99-scan']");
    move99ReviewButtonElement.addEventListener("click", () => {
      openSavedMove99Summary().catch((error) => renderStatus(`Saved review could not open: ${error.message}`, "error"));
    });
    move99ApplyButtonElement.addEventListener("click", () => {
      applySavedMove99Summary().catch((error) => renderStatus(`Saved changes could not start: ${error.message}`, "error"));
    });
    panel.querySelector("[data-action='open-dashboard']").addEventListener("click", openDashboard);
    panel.querySelector("[data-action='dashboard-setup']").addEventListener("click", setupDashboardFromPanel);
    panel.querySelector("[data-action='feature-health']").addEventListener("click", runFeatureHealthFromPanel);
    panel.querySelector("[data-action='stop-task']").addEventListener("click", stopCurrentTask);
    panel.querySelector("[data-action='reset-task']").addEventListener("click", resetAutomation);
    panel.querySelector("[data-action='reload-extension']").addEventListener("click", reloadExtensionFromPanel);
    refreshPanelIdentity();
    refreshLimitsButton();
    refreshSnipingWinnerButton();
    refreshMove99ReviewButton().catch((error) => {
      if (!invalidContextError(error)) U.recordExtensionLog({ source: "ebay", operation: "refresh-move99-review", level: "error", message: error.message });
    });
  }


  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.pendingMove99Run) {
      refreshMove99ReviewButton().catch((error) => {
        if (!invalidContextError(error)) U.recordExtensionLog({ source: "ebay", operation: "refresh-move99-review", level: "error", message: error.message });
      });
    }
    if (changes.gldnStopRequested?.newValue) {
      renderStatus("Stop requested — waiting for the next safe checkpoint…", "error");
    }
  });

  createPanel();
  installSavedBulkEditDialogWatcher();
  (async () => {
    if (await stopForEbayInterruption("eBay page initialization")) return;
    await resumePendingActions();
    await resumePendingEbaySnapshotScan();
    await resumePendingSnipingExtract();
    const diagnosticProbeHandled = await runDiagnosticLogProbeFromUrl();
    if (diagnosticProbeHandled) return;
    const dashboardProbeHandled = await runDashboardQueueProbeFromUrl();
    if (dashboardProbeHandled) return;
  })().catch((error) => {
    if (invalidContextError(error)) {
      shutdownInvalidatedContext(error);
      return;
    }
    U.recordExtensionLog({
      source: "ebay",
      operation: "initialization",
      level: "error",
      message: error?.message || String(error)
    });
  });

  // SPA-navigation heartbeat: eBay may update page 1 -> page 2 without reloading
  // the extension content script. Resume a confirmed Move .99 run automatically.
  let lastHeartbeatError = "";
  let lastHeartbeatErrorAt = 0;
  ebayHeartbeatTimer = setInterval(async () => {
    if (extensionContextInvalidated || move99Running) return;
    try {
      const result = await storageGet([
        "pendingMove99Run",
        "pendingEbaySnapshotScan",
        "pendingSnipingExtract"
      ]);
      const pending = result.pendingMove99Run;
      const hasPendingWork = Boolean(
        pending?.active
        || pending?.phase === "awaiting-submit-approval"
        || result.pendingEbaySnapshotScan?.active
        || result.pendingSnipingExtract?.active
      );
      if (!hasPendingWork) return;
      if (await stopForEbayInterruption("eBay workflow heartbeat")) return;
      if (pending?.phase === "awaiting-submit-approval") {
        await resumeMove99AfterManualSubmit(pending);
      }
      if (pending?.active && pending.confirmed && (isMove99ActiveListingsPage() || isMove99BulkEditorPage())) {
        await runMove99Automation();
      }
      if (result.pendingEbaySnapshotScan?.active) await resumePendingEbaySnapshotScan();
      if (result.pendingSnipingExtract?.active) await resumePendingSnipingExtract();
    } catch (error) {
      if (invalidContextError(error)) {
        shutdownInvalidatedContext(error);
        return;
      }
      const message = error?.message || String(error);
      const now = Date.now();
      if (message !== lastHeartbeatError || now - lastHeartbeatErrorAt > 60000) {
        lastHeartbeatError = message;
        lastHeartbeatErrorAt = now;
        U.recordExtensionLog({ source: "ebay", operation: "heartbeat", level: "error", message });
      }
    }
  }, EBAY_HEARTBEAT_MS);

  ebayPageObserver = new MutationObserver(detectSavedNote);
  ebayPageObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
