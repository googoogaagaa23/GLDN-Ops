(() => {
  if (window.__GLDN_EBAY_ORDER_ASSISTANT__) return;
  window.__GLDN_EBAY_ORDER_ASSISTANT__ = true;

  const U = window.OrderNoteUtils;
  let panel;
  let statusElement;
  let expectedSavedNote = null;
  let panelIdentityElement;
  let limitsButtonElement;
  let markShippedRunning = false;

  const AWAITING_SHIPMENT_URL = "https://www.ebay.com/sh/ord/?filter=status:AWAITING_SHIPMENT";
  const SELLER_LEVEL_URL = "https://www.ebay.com/sh/performance";
  const SELLER_HUB_OVERVIEW_URL = "https://www.ebay.com/sh/ovw";
  const ACTIVE_LISTINGS_URL = "https://www.ebay.com/sh/lst/active";
  const PRUNE_THRESHOLD = 0.95;
  const COMPUTER_OPTIONS = ["0", "2", "M0", "6", "M1"];
  const EBAY_ACCOUNT_OPTIONS = ["FAK12", "CLICKNCARRY", "FINTIME", "FANCYFI", "HEARTSTONE"];
  const STORE_PLAN_LIMITS = { Premium: 10000, Anchor: 25000 };
  const DEFAULT_DOLLAR_LIMIT = 1000000;

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
  let move99Running = false;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

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
    const merged = { ...MOVE99_DEFAULT_CONFIG, ...builtin, ...configured, ...stored };
    const sourceStoreCategoryIds = asStringArray(merged.sourceStoreCategoryIds);
    return {
      account,
      sourceStoreCategoryIds,
      activeUrl: String(merged.activeUrl || buildMove99ActiveUrl(sourceStoreCategoryIds)).trim() || ACTIVE_LISTINGS_URL,
      sourceCategories: asStringArray(merged.sourceCategories).length ? asStringArray(merged.sourceCategories) : [...MOVE99_DEFAULT_CONFIG.sourceCategories],
      destinationCategory: String(merged.destinationCategory || MOVE99_DEFAULT_CONFIG.destinationCategory).trim(),
      backburnerItemIds: asStringArray(merged.backburnerItemIds)
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
        bulkListing: { steps: {}, counters: {} },
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
    workflow.workflows.bulkListing = { ...defaults.workflows.bulkListing, ...(workflow.workflows.bulkListing || {}) };
    workflow.workflows.sniping = { ...defaults.workflows.sniping, ...(workflow.workflows.sniping || {}) };
    workflow.workflows.substitution = { ...defaults.workflows.substitution, ...(workflow.workflows.substitution || {}) };
    if (!workflow.workflows.sniping.amazonPrice && stored.lastAmazonProductPrice) {
      workflow.workflows.sniping.amazonPrice = String(stored.lastAmazonProductPrice);
    }
    return workflow;
  }

  function findEcomSniperExtractSellersButton() {
    const direct = [...document.querySelectorAll("#seller-extract-btn, .seller-extract-btn")]
      .find((element) => U.isVisible(element));
    if (direct) return direct;
    const controls = [...document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']")];
    return controls.find((element) => {
      if (!U.isVisible(element)) return false;
      const text = String(element.innerText || element.textContent || element.value || "").replace(/\s+/g, " ").trim();
      return /\bextract\s+sellers\b/i.test(text);
    });
  }

  function parseEcomSniperExtractTotals(label) {
    const text = String(label || "");
    const total = Number((text.match(/([\d,]+)\s+total/i)?.[1] || "").replace(/,/g, ""));
    const fresh = Number((text.match(/([+-]?\d[\d,]*)\s+new/i)?.[1] || "").replace(/,/g, ""));
    return {
      total: Number.isFinite(total) ? total : null,
      fresh: Number.isFinite(fresh) ? fresh : null
    };
  }

  function currentEcomSniperExtractLabel() {
    const button = findEcomSniperExtractSellersButton();
    return String(button?.innerText || button?.textContent || "").replace(/\s+/g, " ").trim();
  }

  async function clickViaLocalHelper(element) {
    try {
      if (!element?.getBoundingClientRect) return { ok: false, error: "EcomSniper button has no screen position." };
      const rect = element.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      const browserLeft = window.screenX + Math.max(0, (window.outerWidth - window.innerWidth) / 2);
      const browserTop = window.screenY + Math.max(0, window.outerHeight - window.innerHeight);
      const screenX = Math.max(1, Math.round(browserLeft + clientX));
      const screenY = Math.max(1, Math.round(browserTop + clientY));
      const response = await Promise.race([
        runtimeMessage({
        type: "localClick",
        record: {
          x: screenX,
          y: screenY,
          label: "EcomSniper Extract Sellers"
        }
        }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "Local click helper request timed out." }), 4500))
      ]);
      return response?.ok ? { ok: true } : { ok: false, error: response?.error || "Local click helper did not respond." };
    } catch (_) {
      return { ok: false, error: "Local click helper request failed." };
    }
  }

  function installEcomSniperTrustedClickWatcher() {
    if (window.__GLDN_ECOMSNIPER_TRUSTED_CLICK_WATCHER__) return;
    window.__GLDN_ECOMSNIPER_TRUSTED_CLICK_WATCHER__ = true;
    const handleExtractInteraction = async (event) => {
      const button = findEcomSniperExtractSellersButton();
      const target = event.target?.closest?.(".seller-extract-btn, button, [role='button'], a");
      if (!button || !(target === button || button.contains(target) || target?.contains?.(button))) return;
      const result = await storageGet(["pendingManualEcomSniperClick"]);
      const pending = result.pendingManualEcomSniperClick;
      if (!pending?.active) return;
      if (pending.manualClickedAt) return;
      const label = currentEcomSniperExtractLabel();
      await storageSet({
        pendingManualEcomSniperClick: {
          ...pending,
          manualClickedAt: Date.now(),
          manualClickedLabel: label
        }
      });
      renderStatus("EcomSniper click detected. Waiting for it to finish, then continuing.", "ready");
    };
    ["pointerdown", "mousedown", "click"].forEach((eventName) => {
      document.addEventListener(eventName, handleExtractInteraction, true);
    });
  }

  function ecomSniperExtractChangedMeaningfully(before, after) {
    if (!after) return false;
    const previous = typeof before === "string"
      ? parseEcomSniperExtractTotals(before)
      : (before || {});
    const latest = typeof after === "string"
      ? parseEcomSniperExtractTotals(after)
      : (after || {});
    if (latest.total != null && previous.total != null && latest.total > previous.total) return true;
    if (latest.fresh != null && latest.fresh > 0) return true;
    return false;
  }

  function isEbaySearchResultsPage() {
    return /\/sch\/i\.html/i.test(location.pathname) || document.querySelector(".srp-results, ul.srp-results");
  }

  function cleanSearchTitle(value) {
    return String(value || "")
      .replace(/\s*\|\s*eBay.*$/i, "")
      .replace(/\s*-\s*eBay.*$/i, "")
      .replace(/\s*for sale.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function bestBulkExtractSearchQuery() {
    const selected = cleanSearchTitle(getSelection()?.toString());
    if (selected.length > 4) return selected;
    const urlQuery = cleanSearchTitle(new URL(location.href).searchParams.get("_nkw"));
    if (urlQuery.length > 4) return urlQuery;
    const searchInput = cleanSearchTitle(document.querySelector("input[name='_nkw'], input[aria-label*='Search'], input[type='search']")?.value);
    if (searchInput.length > 4) return searchInput;
    const stored = await storageGet(["lastProductResearchTitle", "findProductsWorkflow"]);
    const workflow = stored.findProductsWorkflow || {};
    const saved = cleanSearchTitle(stored.lastProductResearchTitle || workflow.lastAmazonTitle || workflow.notes);
    if (saved.length > 4) return saved;
    const title = cleanSearchTitle(document.title);
    return title.length > 4 && !/^ebay$/i.test(title) ? title : "";
  }

  async function recordEcomSniperExtractRun() {
    const workflow = await loadProductWorkflow();
    const bulkListing = workflow.workflows.bulkListing || { steps: {}, counters: {} };
    const counters = { ...(bulkListing.counters || {}) };
    counters.ecomSniperExtractRuns = Number(counters.ecomSniperExtractRuns || 0) + 1;
    workflow.workflows.bulkListing = {
      ...bulkListing,
      counters,
      steps: { ...(bulkListing.steps || {}), runCompetitorScanner: true },
      lastEcomSniperExtractAt: new Date().toISOString()
    };
    workflow.savedAt = new Date().toISOString();
    await storageSet({ findProductsWorkflow: workflow });
  }

  function findEbayResultsNextPage() {
    const candidates = [...document.querySelectorAll("a, button, [role='button']")];
    return candidates.find((element) => {
      if (!U.isVisible(element)) return false;
      const label = U.normalizeText([
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.innerText,
        element.textContent
      ].filter(Boolean).join(" "));
      const href = String(element.getAttribute("href") || "");
      return /\bnext\b/i.test(label) && !/disabled|pagination__next--disabled/i.test(element.className || "") && !element.disabled && (href || element.tagName !== "A");
    });
  }

  async function clickEcomSniperExtractButton(extractButton, options = {}) {
    await recordEcomSniperExtractRun();
    if (!options.keepPending) {
      await storageRemove(["pendingEcomSniperBulkExtract"]);
    }
    const label = String(extractButton.innerText || extractButton.textContent || "").replace(/\s+/g, " ").trim();
    renderStatus(label ? `Clicking EcomSniper: ${label}` : "Clicking EcomSniper Extract Sellers.", "ready");
    const totals = parseEcomSniperExtractTotals(label);
    await storageSet({
      pendingManualEcomSniperClick: {
        active: true,
        label,
        total: totals.total,
        fresh: totals.fresh,
        startedAt: Date.now()
      }
    });
    const existingBulk = await storageGet(["pendingEcomSniperBulkExtract"]);
    if (existingBulk.pendingEcomSniperBulkExtract?.active) {
      await storageSet({
        pendingEcomSniperBulkExtract: {
          ...existingBulk.pendingEcomSniperBulkExtract,
          phase: "clicking",
          lastActionAt: Date.now()
        }
      });
    }
    const localClickResult = await clickViaLocalHelper(extractButton);
    if (localClickResult.ok) {
      await storageSet({
        pendingManualEcomSniperClick: {
          active: true,
          label,
          total: totals.total,
          fresh: totals.fresh,
          startedAt: Date.now(),
          manualClickedAt: Date.now(),
          manualClickedLabel: label
        }
      });
      renderStatus("Local helper clicked EcomSniper. Waiting for it to finish, then continuing.", "ready");
      await new Promise((resolve) => setTimeout(resolve, 4500));
      const result = await storageGet(["pendingEcomSniperBulkExtract"]);
      const bulk = result.pendingEcomSniperBulkExtract;
      if (bulk?.active) {
        await storageRemove(["pendingManualEcomSniperClick"]);
        await storageSet({
          pendingEcomSniperBulkExtract: {
            ...bulk,
            phase: "after-extract",
            pagesDone: Number(bulk.pagesDone || 0) + 1,
            lastActionAt: Date.now()
          }
        });
        renderStatus(`EcomSniper extract step complete: ${currentEcomSniperExtractLabel() || label}. Continuing workflow.`, "completed");
      }
    } else {
      const failedBulk = await storageGet(["pendingEcomSniperBulkExtract"]);
      if (failedBulk.pendingEcomSniperBulkExtract?.active) {
        await storageSet({
          pendingEcomSniperBulkExtract: {
            ...failedBulk.pendingEcomSniperBulkExtract,
            phase: "extract",
            lastActionAt: Date.now()
          }
        });
      }
      renderStatus(`Local click helper failed: ${localClickResult.error || "unknown error"}. Retrying soon.`, "error");
    }
    setTimeout(async () => {
      const latest = findEcomSniperExtractSellersButton();
      const latestLabel = String(latest?.innerText || latest?.textContent || "").replace(/\s+/g, " ").trim();
      if (ecomSniperExtractChangedMeaningfully(label, latestLabel)) {
        const result = await storageGet(["pendingEcomSniperBulkExtract"]);
        const bulk = result.pendingEcomSniperBulkExtract;
        if (bulk?.active) {
          await storageSet({
            pendingEcomSniperBulkExtract: {
              ...bulk,
              phase: "after-extract",
              pagesDone: Number(bulk.pagesDone || 0) + 1,
              lastActionAt: Date.now()
            }
          });
        }
        renderStatus(`EcomSniper updated: ${latestLabel}`, "completed");
      }
    }, 2200);
  }

  async function resumeAfterManualEcomSniperClick() {
    const result = await storageGet(["pendingManualEcomSniperClick", "pendingEcomSniperBulkExtract"]);
    const pending = result.pendingManualEcomSniperClick;
    if (!pending?.active) return false;
    if (Date.now() - Number(pending.startedAt || 0) > 300000) {
      await storageRemove(["pendingManualEcomSniperClick"]);
      renderStatus("Manual EcomSniper click timed out. Start the workflow again.", "error");
      return false;
    }
    const label = currentEcomSniperExtractLabel();
    const totals = parseEcomSniperExtractTotals(label);
    const trustedClickReady = pending.manualClickedAt && Date.now() - Number(pending.manualClickedAt) > 4500;
    if (ecomSniperExtractChangedMeaningfully({ total: pending.total, fresh: pending.fresh }, totals) || trustedClickReady) {
      await storageRemove(["pendingManualEcomSniperClick"]);
      const bulk = result.pendingEcomSniperBulkExtract;
      if (bulk?.active) {
        await storageSet({
          pendingEcomSniperBulkExtract: {
            ...bulk,
            phase: "after-extract",
            pagesDone: Math.max(1, Number(bulk.pagesDone || 0)),
            lastActionAt: Date.now()
          }
        });
      }
      renderStatus(`EcomSniper step complete: ${label || "no label change"}. Continuing workflow.`, "completed");
      return true;
    }
    return false;
  }

  async function resumePendingEcomSniperBulkExtract() {
    const result = await storageGet(["pendingEcomSniperBulkExtract"]);
    const pending = result.pendingEcomSniperBulkExtract;
    if (!pending?.active) return false;
    if (Date.now() - Number(pending.startedAt || 0) > 120000) {
      await storageRemove(["pendingEcomSniperBulkExtract"]);
      renderStatus("EcomSniper extract timed out. Open the eBay results page and try again.", "error");
      return false;
    }
    if (!isEbaySearchResultsPage()) return false;
    if (pending.phase === "after-extract") {
      const elapsed = Date.now() - Number(pending.lastActionAt || 0);
      if (elapsed < 3500) return false;
      const nextPage = findEbayResultsNextPage();
      if (!nextPage || Number(pending.pagesDone || 0) >= Number(pending.maxPages || 20)) {
        if (pending.bulkQueue) {
          const queueResult = await storageGet(["bulkLinksAmazonQueue"]);
          const queue = queueResult.bulkLinksAmazonQueue;
          const nextIndex = Number(queue?.index || 0) + 1;
          const titles = Array.isArray(queue?.titles) ? queue.titles : [];
          if (queue?.active && titles[nextIndex]) {
            await storageSet({
              bulkLinksAmazonQueue: { ...queue, index: nextIndex, updatedAt: Date.now() },
              pendingEcomSniperBulkExtract: {
                ...pending,
                query: titles[nextIndex],
                phase: "extract",
                pagesDone: 0,
                startedAt: Date.now(),
                lastActionAt: Date.now()
              },
              lastProductResearchTitle: titles[nextIndex]
            });
            renderStatus(`Next Amazon product ${nextIndex + 1}/${titles.length}: opening eBay search.`, "ready");
            location.assign(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(titles[nextIndex])}`);
            return true;
          }
          await storageSet({ bulkLinksAmazonQueue: { ...(queue || {}), active: false, completedAt: Date.now() } });
        }
        await storageRemove(["pendingEcomSniperBulkExtract"]);
        renderStatus("Seller extraction complete. Opening EcomSniper Competitor Scanner.", "completed");
        window.open("chrome-extension://eohieelgcgopcnjjjanjgfjdaifolokm/Competitor_Research/index.html", "_blank", "noopener");
        return true;
      }
      await storageSet({
        pendingEcomSniperBulkExtract: {
          ...pending,
          phase: "next-page",
          lastActionAt: Date.now()
        }
      });
      renderStatus(`Opening next eBay page for more sellers (${Number(pending.pagesDone || 0).toLocaleString()} done).`, "ready");
      const href = String(nextPage.getAttribute("href") || nextPage.href || "");
      if (href) {
        location.assign(href);
      } else {
        dispatchFullClick(nextPage, "Next page");
      }
      return true;
    }
    if (pending.phase === "clicking") {
      if (Date.now() - Number(pending.lastActionAt || 0) > 15000) {
        await storageSet({
          pendingEcomSniperBulkExtract: {
            ...pending,
            phase: "extract",
            lastActionAt: Date.now()
          }
        });
        renderStatus("Local click helper stalled. Retrying EcomSniper click.", "error");
        return true;
      }
      renderStatus("Waiting for EcomSniper click helper to finish...", "ready");
      return false;
    }
    const button = findEcomSniperExtractSellersButton();
    if (button) {
      await clickEcomSniperExtractButton(button, { keepPending: Boolean(pending.autoPages) });
      return true;
    }
    renderStatus("Waiting for EcomSniper Extract Sellers button...", "ready");
    return false;
  }

  async function extractBulkSellersForProductWorkflow() {
    const extractButton = findEcomSniperExtractSellersButton();
    if (extractButton) {
      const query = await bestBulkExtractSearchQuery();
      const pending = {
        active: true,
        autoPages: true,
        query,
        phase: "extract",
        pagesDone: 0,
        maxPages: 20,
        startedAt: Date.now(),
        lastActionAt: Date.now()
      };
      await storageSet({ pendingEcomSniperBulkExtract: pending });
      await clickEcomSniperExtractButton(extractButton, { keepPending: true });
      return;
    }
    const query = await bestBulkExtractSearchQuery();
    if (!query) {
      renderStatus("Search an Amazon product on eBay first, then run EcomSniper Extract.", "error");
      return;
    }
    await storageSet({
      pendingEcomSniperBulkExtract: {
        active: true,
        autoPages: true,
        query,
        phase: "extract",
        pagesDone: 0,
        maxPages: 20,
        startedAt: Date.now()
      }
    });
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
    renderStatus("Opening eBay results, then I will click EcomSniper Extract.", "ready");
    if (location.href !== url) location.assign(url);
  }

  function extractEbayResultCards() {
    const cards = [...document.querySelectorAll("li.s-item, div.s-item, .srp-results .s-item")];
    const domCards = cards.map((card) => {
      const sellerLink = card.querySelector("a[href*='/usr/'], a[href*='/str/']");
      const href = String(sellerLink?.getAttribute("href") || "");
      const sellerFromHref = href.match(/\/(?:usr|str)\/([^/?#]+)/i)?.[1] || "";
      const seller = normalizeSellerName(decodeURIComponent(sellerFromHref || sellerLink?.textContent || ""));
      const priceText = card.querySelector(".s-item__price, [class*='price']")?.textContent || "";
      const price = numberFromMoneyText(priceText);
      const title = String(card.querySelector(".s-item__title, [role='heading']")?.textContent || "").trim();
      const itemUrl = card.querySelector("a.s-item__link, a[href*='/itm/']")?.href || "";
      return { seller, price, title, itemUrl };
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
      if (seller && Number.isFinite(price) && price > 0) {
        textCards.push({
          seller,
          price,
          title: titleLine || "",
          itemUrl: itemLine ? `Item ${itemLine.replace(/^Item:\s*/i, "")}` : ""
        });
      }
    }
    return textCards;
  }

  async function extractSnipingSellersForProductWorkflow() {
    const workflow = await loadProductWorkflow();
    const sniping = workflow.workflows.sniping || { steps: {}, counters: {}, sellers: [], amazonPrice: "", minMarkupPercent: 70 };
    const amazonPrice = numberFromMoneyText(sniping.amazonPrice || workflow.lastAmazonPrice);
    const minMarkupPercent = Math.max(0, Number(sniping.minMarkupPercent || 70));
    if (!amazonPrice) {
      renderStatus("Sniping needs an Amazon price first.", "error");
      alert("Sniping extraction needs the Amazon product price first.\n\nUse Search eBay Product from an Amazon product page, or enter the Amazon price in the popup.");
      return;
    }
    const minEbayPrice = amazonPrice * (1 + minMarkupPercent / 100);
    const cards = extractEbayResultCards();
    const candidates = cards.filter((record) => record.price >= minEbayPrice);
    if (!candidates.length) {
      renderStatus(`No sellers met ${minMarkupPercent}% markup over $${amazonPrice.toFixed(2)}.`, "error");
      alert(`No seller candidates met the sniping rule.\n\nAmazon price: $${amazonPrice.toFixed(2)}\nMinimum eBay price: $${minEbayPrice.toFixed(2)} (${minMarkupPercent}% markup)`);
      return;
    }
    const merged = [...new Set([...(sniping.sellers || []), ...candidates.map((record) => record.seller)].map(normalizeSellerName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    workflow.workflows.sniping = {
      ...sniping,
      amazonPrice: String(amazonPrice),
      minMarkupPercent,
      sellers: merged,
      candidates: candidates.slice(0, 100).map((record) => ({
        seller: record.seller,
        ebayPrice: record.price,
        amazonPrice,
        markupPercent: Math.round(((record.price - amazonPrice) / amazonPrice) * 100),
        title: record.title,
        itemUrl: record.itemUrl
      })),
      counters: { ...(sniping.counters || {}), sellersCollected: merged.length, winnersFound: candidates.length },
      steps: { ...(sniping.steps || {}), chooseCompetitors: true, matchAmazon: true }
    };
    workflow.savedAt = new Date().toISOString();
    await storageSet({ findProductsWorkflow: workflow });
    try {
      await navigator.clipboard.writeText(merged.join("\n"));
    } catch (_) {}
    renderStatus(`Saved ${merged.length.toLocaleString()} sniping sellers from ${candidates.length.toLocaleString()} markup matches.`, "ready");
    alert(`Saved ${merged.length.toLocaleString()} total sniping sellers.\n\nMatched ${candidates.length.toLocaleString()} listings at $${minEbayPrice.toFixed(2)}+.\nThe seller list was copied if clipboard access was available.`);
  }

  async function resumePendingSnipingExtract() {
    const result = await storageGet(["pendingSnipingExtract"]);
    const pending = result.pendingSnipingExtract;
    if (!pending?.active) return false;
    if (Date.now() - Number(pending.startedAt || 0) > 120000) {
      await storageRemove(["pendingSnipingExtract"]);
      renderStatus("Sniping workflow timed out. Start again from Amazon product page.", "error");
      return false;
    }
    if (!isEbaySearchResultsPage()) return false;
    await storageRemove(["pendingSnipingExtract"]);
    await extractSnipingSellersForProductWorkflow();
    return true;
  }

  function taskWasStopped(error) {
    return String(error?.message || error || "") === TASK_STOP_MESSAGE;
  }

  async function stopCurrentTask() {
    await storageSet({ gldnStopRequested: true });
    renderStatus("Stop requested — waiting for the next safe checkpoint…", "error");
  }

  async function resetAutomation() {
    await storageRemove(["pendingMarkShippedRun", "pendingSellerLevelScan", "pendingReviewMonthlyLimits", "pendingMove99Run", "pendingEcomSniperBulkExtract", "pendingSnipingExtract", "pendingManualEcomSniperClick"]);
    await storageSet({ gldnStopRequested: false });
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
    renderStatus("Reloading GLDN Ops...", "ready");
    const response = await runtimeMessage({ type: "reloadExtension" });
    if (!response?.ok) {
      renderStatus(`Reload failed: ${response?.error || "extension background unavailable"}`, "error");
    }
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

  function dashboardUrlWithKey() {
    const dashboardUrl = String(globalThis.GLDN_CONFIG?.dashboardUrl || "").trim();
    const dashboardKey = String(globalThis.GLDN_CONFIG?.dashboardKey || "").trim();
    if (!dashboardUrl || !dashboardKey) return "";
    try {
      const url = new URL(dashboardUrl);
      url.searchParams.set("key", dashboardKey);
      return url.toString();
    } catch (_) {
      return "";
    }
  }

  function openDashboard() {
    const url = dashboardUrlWithKey();
    if (!url) {
      renderStatus("Dashboard URL/key is missing or invalid.", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
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

  function extractEbayTitles() {
    const links = [...document.querySelectorAll("a")]
      .map((anchor) => (anchor.innerText || anchor.textContent || "").trim())
      .filter((text) => text.length >= 12 && text.length <= 500)
      .filter((text) => !/^(learn more|view more details|message buyer|add tracking|show contact info)$/i.test(text));
    return [...new Set(links)].slice(0, 20);
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

  function extractExistingNote() {
    const lines = U.getBodyLines();
    const index = lines.findIndex((line) => /^My note:?$/i.test(line) || /^My note:/i.test(line));
    if (index === -1) return "";
    const sameLine = lines[index].replace(/^My note:\s*/i, "").trim();
    return sameLine || lines[index + 1] || "";
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

  async function readAmazonClipboard() {
    const text = await navigator.clipboard.readText();
    if (!text.startsWith(U.PAYLOAD_PREFIX)) {
      throw new Error("Clipboard does not contain Amazon order information. Click Copy Amazon Info in the Amazon profile first.");
    }
    const payload = JSON.parse(text.slice(U.PAYLOAD_PREFIX.length));
    if (!payload || payload.source !== "amazon") throw new Error("Amazon clipboard data is invalid.");
    return payload;
  }

  function showPreview({ payload, earnings, match }) {
    document.getElementById("gldn-note-preview")?.remove();
    const existingNote = extractExistingNote();
    const etaText = buildEtaText(payload.etas);
    const defaultNote = `${U.formatMoney(earnings)} - ${U.formatMoney(payload.total)} - ${payload.profileLabel} - ${etaText}`;
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
          <div><strong>Match confidence</strong><span class="${needsManualConfirm ? "gldn-warning-text" : "gldn-good-text"}">${confidencePercent}%</span></div>
        </div>
        ${existingNote ? `<div class="gldn-existing"><strong>Existing note:</strong> ${escapeHtml(existingNote)}</div>` : ""}
        ${needsManualConfirm ? `<label class="gldn-confirm"><input type="checkbox"> I checked the buyer, address, and item match.</label>` : ""}
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="fill" ${needsManualConfirm ? "disabled" : ""}>Fill Add Note Box</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
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
      modalStatus.textContent = "Opening Add note…";
      try {
        const note = textarea.value.trim();
        if (!note) throw new Error("The note is blank.");
        await openAndFillAddNote(note);
        expectedSavedNote = note;
        const identity = await storageGet(["computerLabel", "ebayAccountLabel"]);
        await storageSet({
          lastPreparedNote: {
            note,
            payload,
            earnings,
            orderNumber: extractEbayOrderNumber(),
            computerLabel: identity.computerLabel || "0",
            ebayAccountLabel: identity.ebayAccountLabel || "",
            preparedAt: new Date().toISOString(),
            status: "filled_waiting_for_manual_save"
          }
        });
        modalStatus.textContent = "Filled. Review it in eBay, then click eBay's Save button yourself.";
        renderStatus("Note filled — waiting for your manual Save", "ready");
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
      const moreActions = U.findVisibleByText("More actions") || U.findVisibleContainingText("More actions");
      if (!moreActions) throw new Error("I could not find More actions. Open Add note manually, then press Fill again.");
      dispatchFullClick(moreActions);

      const addNote = await U.waitFor(() => U.findVisibleByText("Add note") || U.findVisibleContainingText("Add note"), 4000);
      if (!addNote) throw new Error("I opened More actions but could not find Add note. Open Add note manually, then press Fill again.");
      dispatchFullClick(addNote);

      textarea = await U.waitFor(findVisibleNoteTextarea, 5000);
    }
    if (!textarea) throw new Error("The Add note box did not open. Open it manually and try again.");
    textarea.focus();
    U.setNativeValue(textarea, note);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: note }));
  }

  function findVisibleNoteTextarea() {
    return [...document.querySelectorAll("textarea")].find(U.isVisible) || null;
  }

  async function prepareNote() {
    try {
      renderStatus("Reading Amazon clipboard…");
      const payload = await readAmazonClipboard();
      const earnings = extractEbayEarnings();
      if (earnings === null) throw new Error("I could not find Order earnings. Make sure the eBay Order Details page is open and the What you earned section is visible.");
      if (payload.total === null || payload.total === undefined) throw new Error("Amazon order total is missing.");
      const match = calculateMatch(payload);
      showPreview({ payload, earnings, match });
      renderStatus("Preview ready", "ready");
    } catch (error) {
      renderStatus(error.message, "error");
      alert(error.message);
    }
  }

  function detectSavedNote() {
    if (!expectedSavedNote) return;
    const text = document.body?.innerText || "";
    if (!text.includes(expectedSavedNote)) return;
    storageGet(["orderNoteHistory", "computerLabel", "ebayAccountLabel"]).then((result) => {
      const record = {
        note: expectedSavedNote,
        orderNumber: extractEbayOrderNumber(),
        computerLabel: result.computerLabel || "0",
        ebayAccountLabel: result.ebayAccountLabel || "",
        completedAt: new Date().toISOString(),
        status: "completed"
      };
      const history = Array.isArray(result.orderNoteHistory) ? result.orderNoteHistory : [];
      history.push(record);
      return storageSet({ orderNoteHistory: history.slice(-1000), lastPreparedNote: record });
    });
    renderStatus("Saved note detected — Completed", "completed");
    expectedSavedNote = null;
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

  function findMetricElement(labelPattern) {
    const candidates = [...document.querySelectorAll("body *")]
      .filter((element) => U.isVisible(element))
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
      if (!node || !(node instanceof Element) || !U.isVisible(node)) return;
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
      if (number < 84) return "warning";
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
    const cleaned = String(value || "").trim().toLowerCase().replace(/^comp\s*/, "");
    return COMPUTER_OPTIONS.find((option) => option.toLowerCase() === cleaned) || "0";
  }

  function normalizedEbayAccount(value) {
    const cleaned = String(value || "").trim().toLowerCase();
    return EBAY_ACCOUNT_OPTIONS.find((option) => option.toLowerCase() === cleaned) || "FAK12";
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
    const modal = overlay?.querySelector?.(".gldn-modal");
    const handle = modal?.querySelector?.("h2");
    if (!modal || !handle || modal.dataset.gldnReviewDraggable === "true") return;
    modal.dataset.gldnReviewDraggable = "true";
    handle.classList.add("gldn-review-drag-handle");
    handle.title = "Drag to move this review window.";
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;
    const move = (x, y) => {
      const rect = modal.getBoundingClientRect();
      const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - rect.width - 8));
      const top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - rect.height - 8));
      modal.style.position = "fixed";
      modal.style.left = `${left}px`;
      modal.style.top = `${top}px`;
      modal.style.margin = "0";
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType !== "touch") return;
      const rect = modal.getBoundingClientRect();
      dragging = true;
      pointerId = event.pointerId;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      move(event.clientX - offsetX, event.clientY - offsetY);
      event.preventDefault();
    });
    const stop = (event) => {
      if (!dragging || (event && event.pointerId !== pointerId)) return;
      dragging = false;
      try { handle.releasePointerCapture?.(pointerId); } catch (_) {}
      pointerId = null;
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("dblclick", () => {
      modal.style.position = "relative";
      modal.style.left = "";
      modal.style.top = "";
      modal.style.margin = "";
    });
  }

  function showHealthPreview(metrics) {
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
          ${selectField("Computer", "gldn-health-computer", normalizedComputer(metrics.computerLabel), COMPUTER_OPTIONS)}
          ${selectField("eBay account", "gldn-health-ebay-account", normalizedEbayAccount(metrics.ebayAccountLabel), EBAY_ACCOUNT_OPTIONS)}
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

    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    overlay.querySelector("[data-action='save-health']").addEventListener("click", async () => {
      const read = (id) => overlay.querySelector(id).value.trim();
      const parseOptionalNumber = (value) => value === "" ? null : Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
      const computerLabel = read("#gldn-health-computer");
      const ebayAccountLabel = read("#gldn-health-ebay-account");
      if (!computerLabel || !ebayAccountLabel) {
        overlay.querySelector(".gldn-modal-status").textContent = "Enter both the computer and eBay account before saving.";
        return;
      }
      const record = {
        ...metrics,
        computerLabel,
        ebayAccountLabel,
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
        computerLabel,
        ebayAccountLabel,
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
    const identity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    if (!identity.computerLabel || !identity.ebayAccountLabel) {
      alert("Set the Computer and eBay account in the extension popup first.");
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
    await storageSet({ gldnStopRequested: false });
    await storageSet({ pendingSellerLevelScan: true });
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
    syncMarkShippedRecord(record).catch(() => {});
    return record;
  }

  async function closeCompletedMarkShippedDialog() {
    const dialog = [...document.querySelectorAll('[role="dialog"], .dialog, .modal, section, div')].find((element) => {
      if (!U.isVisible(element)) return false;
      const text = U.normalizeText(element.innerText || element.textContent || "");
      return text.includes("mark as shipped") && text.includes("are you sure");
    });
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

    await U.waitFor(() => /orders? selected/i.test(document.body?.innerText || ""), 6000, 150);

    const shippingButton = await U.waitFor(() => {
      const button = findExactVisible("Shipping", 'button, [role="button"]');
      if (!button) return null;
      const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
      return disabled ? null : button;
    }, 8000, 200);
    if (!shippingButton) throw new Error("I selected the orders but could not find the enabled Shipping button.");
    shippingButton.click();

    const findMarkShippedDialog = () => {
      const candidates = [...document.querySelectorAll('[role="dialog"], .lightbox-dialog, .dialog, [aria-modal="true"], section, div')]
        .filter((element) => U.isVisible(element))
        .map((element) => ({
          element,
          text: U.normalizeText(element.innerText || element.textContent || ""),
          rect: element.getBoundingClientRect()
        }))
        .filter(({ text, rect }) => {
          if (!text.includes("mark as shipped") || !text.includes("continue")) return false;
          if (rect.width < 240 || rect.height < 120 || rect.width > 1000 || rect.height > 850) return false;
          return true;
        })
        .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));
      return candidates[0]?.element || null;
    };

    const activateMarkAsShipped = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const label = await U.waitFor(() => findExactVisible("Mark as shipped"), 5000, 120);
        if (!label) return null;
        const target = label.closest('button, a, li, [role="menuitem"], [role="button"], [tabindex]') || label;
        target.scrollIntoView?.({ block: "center", inline: "center" });
        await new Promise((resolve) => setTimeout(resolve, 120));

        const rect = label.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)),
          Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2))
        );
        const clickTargets = [target, hit, label].filter(Boolean).filter((item, index, array) => array.indexOf(item) === index);
        for (const clickTarget of clickTargets) dispatchFullClick(clickTarget, label);

        const outcome = await U.waitFor(() => {
          const dialog = findMarkShippedDialog();
          if (dialog) return { dialog };
          const count = parseAwaitingResultsCount();
          if (count !== null && count < ready.count) return { markedWithoutDialog: ready.count - count };
          const stillVisible = findExactVisible("Mark as shipped");
          if (!stillVisible) return { menuClosed: true };
          return null;
        }, 3500, 120);

        if (outcome?.dialog || outcome?.markedWithoutDialog) return outcome;
        if (outcome?.menuClosed) {
          const delayed = await U.waitFor(() => {
            const dialog = findMarkShippedDialog();
            if (dialog) return { dialog };
            const count = parseAwaitingResultsCount();
            if (count !== null && count < ready.count) return { markedWithoutDialog: ready.count - count };
            return null;
          }, 6500, 180);
          if (delayed) return delayed;
        }

        if (attempt < 2 && !findExactVisible("Mark as shipped")) {
          const shippingAgain = findExactVisible("Shipping", 'button, [role="button"]');
          if (shippingAgain) dispatchFullClick(shippingAgain);
          await U.waitFor(() => findExactVisible("Mark as shipped"), 3500, 150);
        }
      }
      return null;
    };

    const activation = await activateMarkAsShipped();
    if (!activation) {
      const stillVisible = Boolean(findExactVisible("Mark as shipped"));
      throw new Error(stillVisible
        ? "The Mark as shipped menu item was visible, but eBay did not accept the click."
        : "The Mark as shipped confirmation did not open and the order count did not change.");
    }

    if (activation.markedWithoutDialog) {
      await dismissAnyMarkShippedConfirmation();
      return { selected: ready.count, marked: activation.markedWithoutDialog, noOrders: false };
    }

    const dialog = activation.dialog;
    const dialogText = dialog.innerText || dialog.textContent || "";
    const selectedMatch = dialogText.match(/mark\s+([\d,]+)\s+orders?\s+as shipped/i);
    const selected = selectedMatch ? Number(selectedMatch[1].replace(/,/g, "")) : ready.count;
    const continueButton = [...dialog.querySelectorAll('button, [role="button"]')].find((element) => {
      return U.isVisible(element) && U.normalizeText(element.innerText || element.textContent || "") === "continue";
    });
    if (!continueButton) throw new Error("The confirmation opened, but the Continue button was not found.");
    dispatchFullClick(continueButton);

    const success = await U.waitFor(() => {
      const text = document.body?.innerText || "";
      const match = text.match(/([\d,]+)\s+orders?\s+have been marked as shipped/i);
      if (match) return { marked: Number(match[1].replace(/,/g, "")) };
      const count = parseAwaitingResultsCount();
      if (count === 0) return { marked: selected };
      if (count !== null && count < ready.count) return { marked: ready.count - count };
      return null;
    }, 25000, 250);
    if (!success) throw new Error("eBay did not confirm that the selected orders were marked as shipped.");
    await dismissAnyMarkShippedConfirmation();
    return { selected, marked: success.marked, noOrders: false };
  }

  async function runMarkShippedAutomation() {
    await ensureTaskCanContinue();
    if (markShippedRunning) return;
    markShippedRunning = true;
    try {
      const pending = await storageGet(["pendingMarkShippedRun"]);
      const state = pending.pendingMarkShippedRun || {
        active: true,
        startedAt: new Date().toISOString(),
        markedCount: 0,
        batchCount: 0
      };
      if (!isAwaitingShipmentPage()) {
        await storageSet({ pendingMarkShippedRun: state });
        location.assign(AWAITING_SHIPMENT_URL);
        return;
      }

      renderStatus("Opening Awaiting shipment and marking every order…", "ready");
      let markedCount = Number(state.markedCount || 0);
      let batchCount = Number(state.batchCount || 0);

      for (let guard = 0; guard < 12; guard += 1) {
        await ensureTaskCanContinue();
        const result = await runOneMarkShippedBatch();
        if (result.noOrders) break;
        markedCount += Number(result.marked || 0);
        batchCount += 1;
        await storageSet({
          pendingMarkShippedRun: { ...state, active: true, markedCount, batchCount, updatedAt: new Date().toISOString() }
        });
        renderStatus(`Marked ${markedCount} shipped. Checking for more…`, "ready");
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const remaining = parseAwaitingResultsCount();
        if (remaining === 0) break;
      }

      const record = await saveMarkShippedResult({
        startedAt: state.startedAt,
        status: markedCount > 0 ? "Completed" : "No awaiting orders",
        markedCount,
        batchCount,
        pageUrl: location.href
      });
      renderStatus(markedCount > 0 ? `Completed — ${markedCount} marked as shipped` : "No awaiting shipment orders", "completed");
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
    await storageSet({ gldnStopRequested: false });
    const identity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    if (!identity.computerLabel || !identity.ebayAccountLabel) {
      alert("Set the Computer and eBay account in the extension popup first.");
      return;
    }
    await storageSet({
      pendingMarkShippedRun: {
        active: true,
        startedAt: new Date().toISOString(),
        markedCount: 0,
        batchCount: 0
      }
    });
    runMarkShippedAutomation();
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
      inStockQuantity: qty ? integerValue(qty[1]) : null,
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

    let subscriptionListingLimit = null;
    let subscriptionUsedThisMonth = null;
    let subscriptionLeftThisMonth = null;

    // There can be nonnumeric Used/Left rows (for example, "Available"). Use the numeric row.
    const numericUsedLeftMatches = [...text.matchAll(/Used\s*\/\s*Left\s*:\s*([\d,]+)\s*\/\s*([\d,]+)/gi)];
    if (numericUsedLeftMatches.length) {
      // Prefer the largest total because that corresponds to the Store subscription allowance,
      // not a smaller promotional offer.
      const parsed = numericUsedLeftMatches
        .map((match) => ({
          used: integerValue(match[1]),
          left: integerValue(match[2])
        }))
        .filter((entry) => entry.used != null && entry.left != null)
        .sort((a, b) => (b.used + b.left) - (a.used + a.left));
      if (parsed.length) {
        subscriptionUsedThisMonth = parsed[0].used;
        subscriptionLeftThisMonth = parsed[0].left;
        subscriptionListingLimit = parsed[0].used + parsed[0].left;
      }
    }

    // Fallback for layouts that explicitly state the fixed-price allowance.
    if (subscriptionListingLimit == null) {
      const explicitAllowance = text.match(/Store\s+Subscription[\s\S]{0,500}?([\d,]+)\s+Fixed\s+Price\s+Listings/i);
      if (explicitAllowance) subscriptionListingLimit = integerValue(explicitAllowance[1]);
    }

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

  function usageEvaluation(used, limit) {
    if (!Number.isFinite(Number(used)) || !Number.isFinite(Number(limit)) || Number(limit) <= 0) {
      return { ratio: null, percent: null, state: "unknown", label: "NOT DETECTED" };
    }
    const ratio = Number(used) / Number(limit);
    if (ratio >= PRUNE_THRESHOLD) {
      return { ratio, percent: ratio * 100, state: "critical", label: "PRUNE LISTINGS" };
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
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "Not detected";
  }

  function formatCurrency(value) {
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
    const detected = scanListingsOverview();
    if (activeSummary?.activeListings != null) detected.activeListings = activeSummary.activeListings;
    detected.inStockQuantity = activeSummary?.inStockQuantity ?? null;
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
        <p class="gldn-help-text">This reads Active listings and the monthly dollar amount from Seller Hub Overview. Confirm the account's fixed limits once each month.</p>
        <div class="gldn-health-grid gldn-identity-grid">
          ${selectField("Computer", "gldn-listings-computer", normalizedComputer(stored.computerLabel), COMPUTER_OPTIONS)}
          ${selectField("eBay account", "gldn-listings-account", normalizedEbayAccount(stored.ebayAccountLabel), EBAY_ACCOUNT_OPTIONS)}
        </div>
        <div class="gldn-health-grid">
          ${selectField("Store subscription & listing limit", "gldn-listings-plan", storePlan, [
            { value: "Premium", label: "Premium — 10,000 listings" },
            { value: "Anchor", label: "Anchor — 25,000 listings" },
            { value: "Custom", label: "Custom listing limit" }
          ])}
          ${listingField("Active listings", "gldn-listings-active", formatInteger(detected.activeListings), "text", true)}
          ${listingField("In-stock quantity", "gldn-listings-in-stock", formatInteger(detected.inStockQuantity), "text", true)}
          <div id="gldn-custom-listing-wrap" class="gldn-health-field" style="display:${storePlan === "Custom" ? "block" : "none"}">
            <label class="gldn-label" for="gldn-listings-limit">Custom listing limit</label>
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
          Store subscription used/left this month: ${formatInteger(detected.subscriptionUsedThisMonth)} / ${formatInteger(detected.subscriptionLeftThisMonth)}<br>
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
    const customListingWrap = overlay.querySelector("#gldn-custom-listing-wrap");
    const listingLimitInput = overlay.querySelector("#gldn-listings-limit");
    const dollarPreset = overlay.querySelector("#gldn-dollar-preset");
    const customDollarWrap = overlay.querySelector("#gldn-custom-dollar-wrap");
    const dollarLimitInput = overlay.querySelector("#gldn-listings-dollar-limit");
    const usageBox = overlay.querySelector(".gldn-usage-box");
    const inventoryBox = overlay.querySelector(".gldn-inventory-box");

    const selectedListingLimit = () => STORE_PLAN_LIMITS[planSelect.value] ?? Number(listingLimitInput.value);
    const selectedDollarLimit = () => dollarPreset.value === "custom" ? Number(dollarLimitInput.value) : Number(dollarPreset.value);

    const refreshUsage = () => {
      const active = parseNumericText(overlay.querySelector("#gldn-listings-active").value);
      const inStock = parseNumericText(overlay.querySelector("#gldn-listings-in-stock").value);
      const dollars = parseNumericText(overlay.querySelector("#gldn-listings-dollar-used").value);
      usageBox.innerHTML = statusSummary("Active listings", usageEvaluation(active, selectedListingLimit()))
        + statusSummary("Monthly dollar amount", usageEvaluation(dollars, selectedDollarLimit()));
      if (Number.isFinite(active) && active > 0 && Number.isFinite(inStock)) {
        const outOfStock = Math.max(0, active - inStock);
        const rate = Math.max(0, Math.min(100, (inStock / active) * 100));
        inventoryBox.innerHTML = `<div class="gldn-inventory-summary"><strong>Inventory availability</strong><span>${inStock.toLocaleString()} / ${active.toLocaleString()} in stock (${rate.toFixed(1)}%)</span><span>${outOfStock.toLocaleString()} out of stock</span></div>`;
      } else {
        inventoryBox.innerHTML = `<div class="gldn-inventory-summary"><strong>Inventory availability</strong><span>Not detected</span></div>`;
      }
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
      const computerLabel = read("#gldn-listings-computer");
      const ebayAccountLabel = read("#gldn-listings-account");
      const selectedPlan = read("#gldn-listings-plan");
      const activeListings = number("#gldn-listings-active");
      const inStockQuantity = number("#gldn-listings-in-stock");
      const confirmedSubscriptionLimit = STORE_PLAN_LIMITS[selectedPlan] ?? number("#gldn-listings-limit");
      const currentDollarUsed = number("#gldn-listings-dollar-used");
      const confirmedDollarLimit = read("#gldn-dollar-preset") === "custom"
        ? number("#gldn-listings-dollar-limit")
        : Number(read("#gldn-dollar-preset"));

      if (!computerLabel || !ebayAccountLabel || !selectedPlan || confirmedSubscriptionLimit == null || confirmedDollarLimit == null) {
        overlay.querySelector(".gldn-modal-status").textContent = "Computer, eBay account, Store subscription, listing limit, and dollar limit are required.";
        return;
      }

      const activeEvaluation = usageEvaluation(activeListings, confirmedSubscriptionLimit);
      const dollarEvaluation = usageEvaluation(currentDollarUsed, confirmedDollarLimit);
      const detectedLimitChanged = limitChanged(stored.freeFixedPriceLimit, detected.subscriptionListingLimit)
        || limitChanged(stored.monthlySellerDollarLimit, detected.monthlySellerDollarLimit);
      const overallStatus = activeEvaluation.state === "critical" || dollarEvaluation.state === "critical"
        ? "PRUNE LISTINGS"
        : detectedLimitChanged ? "LIMIT CHANGED" : "GOOD";

      const record = {
        computerLabel,
        ebayAccountLabel,
        storePlan: selectedPlan,
        activeListings,
        inStockQuantity,
        outOfStockCount: activeListings != null && inStockQuantity != null ? Math.max(0, activeListings - inStockQuantity) : null,
        inStockPercent: activeListings ? (inStockQuantity / activeListings) * 100 : null,
        subscriptionListingLimit: confirmedSubscriptionLimit,
        subscriptionUsagePercent: activeEvaluation.percent,
        subscriptionStatus: activeEvaluation.label,
        subscriptionUsedThisMonth: detected.subscriptionUsedThisMonth,
        subscriptionLeftThisMonth: detected.subscriptionLeftThisMonth,
        currentQuantityUsed: detected.currentQuantityUsed,
        monthlySellerQuantityLimit: quantityLimit === "" ? null : Number(quantityLimit),
        currentDollarUsed,
        monthlySellerDollarLimit: confirmedDollarLimit,
        dollarUsagePercent: dollarEvaluation.percent,
        dollarStatus: dollarEvaluation.label,
        limitChanged: detectedLimitChanged,
        overallStatus,
        limitsConfirmedMonth: currentMonthKey(),
        confirmedAt: new Date().toISOString(),
        pageUrl: location.href
      };

      const previous = await storageGet(["listingStatusHistory"]);
      const history = Array.isArray(previous.listingStatusHistory) ? previous.listingStatusHistory : [];
      history.push(record);
      await storageSet({
        computerLabel,
        ebayAccountLabel,
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
        if (!sync?.ok) renderStatus(`Listings saved locally — dashboard sync failed: ${sync?.error || "Unknown error"}`, "error");
      });
    });
  }

  async function reviewMonthlyLimits() {
    const identity = await storageGet(["computerLabel", "ebayAccountLabel", "pendingReviewMonthlyLimits"]);
    if (!identity.computerLabel || !identity.ebayAccountLabel) {
      alert("Set the Computer and eBay account in the extension popup first.");
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
      renderStatus("Reading total and in-stock listings…", "ready");
      await clearActiveListingsFiltersIfNeeded();
      const summary = await U.waitFor(() => {
        const result = parseActiveListingsSummary();
        return result.activeListings != null && result.inStockQuantity != null ? result : null;
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

  function clickElement(element) {
    if (!element) return false;
    element.scrollIntoView?.({ block: "center", inline: "center" });
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

  function visibleFilteredListingCount() {
    const text = document.body?.innerText || "";
    const result = text.match(/Results?:\s*1\s*-\s*\d+\s+of\s+([\d,]+)/i)
      || text.match(/Result:\s*1\s*-\s*\d+\s+of\s+([\d,]+)/i)
      || text.match(/Edit all\s+([\d,]+)\s+listings/i)
      || text.match(/([\d,]+)\s+active listings/i);
    return result ? Number(result[1].replace(/,/g, "")) : null;
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

  async function ensureCategoryFilterSelected() {
    const directUrlReady = await U.waitFor(() => {
      if (!isMove99SourceFilterUrl()) return null;
      const count = visibleFilteredListingCount();
      return visibleActiveListingsTable() && count !== null ? count : null;
    }, 15000, 250);
    if (directUrlReady !== null) return directUrlReady;

    // Use eBay's full right-side All filters workflow. The compact Categories
    // dropdown is a different UI and does not contain the See results panel.
    const allFiltersButton = await U.waitFor(() => {
      return [...document.querySelectorAll("button, [role='button']")].find((element) => {
        if (!U.isVisible(element)) return false;
        return /^all filters(?:\s*\(\d+\))?$/.test(U.normalizeText(element.innerText || element.textContent || ""));
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

    for (const category of MOVE99_SOURCE_CATEGORIES) {
      const found = findCheckboxNearExactText(category, filterPanel);
      if (!found) throw new Error(`I could not find the Store category “${category}”.`);
      if (!controlChecked(found.control)) {
        clickElement(found.clickTarget || found.control);
        await U.waitFor(() => controlChecked(found.control), 2500, 120);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const seeResults = [...filterPanel.querySelectorAll("button, [role='button']")].find((element) => {
      return U.isVisible(element)
        && U.normalizeText(element.innerText || element.textContent || "") === "see results"
        && !element.disabled
        && element.getAttribute("aria-disabled") !== "true";
    });
    if (!seeResults) throw new Error("I selected the source categories but could not find an enabled See results button.");
    clickElement(seeResults);

    const ready = await U.waitFor(() => {
      const text = document.body?.innerText || "";
      const result = text.match(/Results?:\s*1\s*-\s*\d+\s+of\s+([\d,]+)/i)
        || text.match(/Result:\s*1\s*-\s*\d+\s+of\s+([\d,]+)/i)
        || text.match(/Edit all\s+([\d,]+)\s+listings/i)
        || text.match(/([\d,]+)\s+active listings/i);
      const filterChip = [...document.querySelectorAll("button, [role='button']")].some((element) => {
        if (!U.isVisible(element)) return false;
        const label = (element.innerText || element.textContent || "").trim();
        return /^(?:all filters|categories)\s*\((?:2|[3-9]|\d{2,})\)$/i.test(label);
      });
      const panelStillOpen = Boolean(findMove99FilterPanel());
      const tableVisible = [...document.querySelectorAll("table, [role='grid'], [role='table']")]
        .some((element) => U.isVisible(element));

      // eBay currently closes the right-side panel and changes the chip to
      // “All filters (2)”. Older layouts used “Categories (2)”. Either state
      // confirms that both source categories were applied.
      if (!panelStillOpen && tableVisible && result) {
        return result ? Number(result[1].replace(/,/g, "")) : -1;
      }
      if (filterChip && !panelStillOpen && tableVisible) return -1;
      return null;
    }, 60000, 250);
    if (ready === null) throw new Error("The source category filter did not finish applying.");
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

  function findEditAllListingsMenuItem() {
    const candidates = [...document.querySelectorAll('button, a, li, [role="menuitem"], [role="option"], div, span')]
      .filter((element) => U.isVisible(element))
      .filter((element) => /^Edit all [\d,]+ listings$/i.test((element.innerText || element.textContent || "").trim()))
      .map((label) => {
        const target = label.closest('button, a, li, [role="menuitem"], [role="option"], [tabindex]') || label;
        const rect = label.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const actionable = target.matches('button, a, [role="menuitem"], [role="option"]') ? 0 : 1;
        return { label, target, rect, targetRect, actionable };
      })
      .sort((a, b) => {
        if (a.actionable !== b.actionable) return a.actionable - b.actionable;
        return (a.targetRect.width * a.targetRect.height) - (b.targetRect.width * b.targetRect.height);
      });
    return candidates[0] || null;
  }

  function findSavedBulkEditDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog, section, div')]
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

  function findSavedBulkEditContinueButton() {
    // Prefer the exact Continue button and verify it belongs to the saved-draft
    // dialog by requiring nearby “Finish previous” and heading text. eBay can
    // render this modal several seconds after Edit all is clicked.
    const buttons = [...document.querySelectorAll('button, [role="button"], a')]
      .filter((element) => U.isVisible(element))
      .filter((element) => U.normalizeText(element.innerText || element.textContent || "") === "continue")
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
    const found = findSavedBulkEditContinueButton();
    if (!found) return false;
    savedBulkEditContinueInProgress = true;
    try {
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
      return true;
    } finally {
      savedBulkEditContinueInProgress = false;
    }
  }

  async function continuePastSavedBulkEditDialog(timeoutMs = 45000) {
    const found = await U.waitFor(findSavedBulkEditContinueButton, timeoutMs, 150);
    if (!found) return false;
    return clickSavedBulkEditContinueIfPresent();
  }

  function installSavedBulkEditDialogWatcher() {
    const observer = new MutationObserver(async () => {
      try {
        const state = await storageGet(["pendingMove99Run"]);
        if (!state.pendingMove99Run?.active) return;
        if (state.pendingMove99Run.phase !== "bulk-editor") return;
        if (findSavedBulkEditContinueButton()) {
          await clickSavedBulkEditContinueIfPresent();
        }
      } catch (_) {}
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Mutation notifications can be coalesced or missed by highly dynamic
    // pages, so keep a short-lived polling fallback while a run is pending.
    const interval = setInterval(async () => {
      try {
        const state = await storageGet(["pendingMove99Run"]);
        if (!state.pendingMove99Run?.active || state.pendingMove99Run.phase !== "bulk-editor") return;
        if (findSavedBulkEditContinueButton()) {
          await clickSavedBulkEditContinueIfPresent();
        }
      } catch (_) {}
    }, 500);
    window.addEventListener("beforeunload", () => clearInterval(interval), { once: true });
  }

  async function openAllFilteredListingsInBulkEditor(filteredCount) {
    const editButton = await U.waitFor(() => {
      return [...document.querySelectorAll('button, [role="button"]')].find((element) => {
        if (!U.isVisible(element)) return false;
        const text = U.normalizeText(element.innerText || element.textContent || "");
        return text === "edit" && !element.disabled && element.getAttribute("aria-disabled") !== "true";
      }) || null;
    }, 10000, 180);
    if (!editButton) throw new Error("I could not find the Edit dropdown after filtering.");
    clickElement(editButton);

    const item = await U.waitFor(findEditAllListingsMenuItem, 8000, 150);
    if (!item) throw new Error("The Edit menu opened, but the Edit all listings option was not found.");

    const editAllText = (item.label.innerText || item.label.textContent || "").trim();
    const parsedCount = Number((editAllText.match(/Edit all\s+([\d,]+)\s+listings/i)?.[1] || "0").replace(/,/g, ""));
    const actualFilteredCount = parsedCount || (filteredCount > 0 ? filteredCount : 0);

    await storageSet({
      pendingMove99Run: {
        active: true,
        phase: "bulk-editor",
        startedAt: new Date().toISOString(),
        filteredCount: actualFilteredCount,
        sourceCategories: MOVE99_SOURCE_CATEGORIES,
        destinationCategory: MOVE99_DESTINATION_CATEGORY
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

    const progressed = await U.waitFor(() => {
      if (isMove99BulkEditorPage()) return true;
      const body = U.normalizeText(document.body?.innerText || "");
      if (body.includes("listings processed") || body.includes("revise listings")) return true;
      return null;
    }, 45000, 250);
    if (progressed) return;

    // Retry once using the element physically beneath the center of the menu
    // row. This preserves eBay's JavaScript click flow and never loads the raw
    // internal href ourselves.
    const currentItem = findEditAllListingsMenuItem() || item;
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

    const retryProgressed = await U.waitFor(() => {
      if (isMove99BulkEditorPage()) return true;
      const body = U.normalizeText(document.body?.innerText || "");
      if (body.includes("listings processed") || body.includes("revise listings")) return true;
      return null;
    }, 45000, 250);
    if (!retryProgressed) {
      await storageSet({ pendingMove99Run: null });
      throw new Error("eBay did not create the Bulk Edit workspace after clicking Edit all listings twice.");
    }
  }

  function parseProcessedProgress() {
    const text = document.body?.innerText || "";
    const matches = [...text.matchAll(/([\d,]+)\s+of\s+([\d,]+)\s+listings processed/gi)];
    if (!matches.length) return null;
    const last = matches[matches.length - 1];
    return { processed: Number(last[1].replace(/,/g, "")), total: Number(last[2].replace(/,/g, "")) };
  }

  function priceEndsIn99(raw) {
    const cleaned = String(raw ?? "").trim().replace(/[$,\s]/g, "");
    const match = cleaned.match(/^-?\d+(?:\.(\d{1,2}))$/);
    if (!match) return false;
    return match[1].padEnd(2, "0") === "99";
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

  function rowSignature(row) {
    if (!row) return "";
    const text = String(row.innerText || row.textContent || "");
    // eBay item IDs are normally 12 digits. This is the most reliable key while
    // React recycles the same row elements during virtual scrolling.
    const itemId = text.match(/\b\d{11,14}\b/);
    if (itemId) return `item:${itemId[0]}`;

    // Use only identifiers that are likely to be unique per listing. Generic
    // test IDs are intentionally excluded because virtual rows often share them.
    const attributes = ["data-row-key", "data-item-id", "data-listing-id", "data-id", "id"];
    for (const name of attributes) {
      const value = String(row.getAttribute?.(name) || "").trim();
      if (value && value.length > 4 && !/^(row|item|listing)[-_]?\d?$/i.test(value)) return `${name}:${value}`;
    }

    const sku = row.querySelector('input[name*="sku" i], input[aria-label*="sku" i]')?.value;
    if (sku) return `sku:${String(sku).trim()}`;

    const title = row.querySelector('input[aria-label*="title" i], textarea[aria-label*="title" i]')?.value;
    if (title) return `title:${U.normalizeText(title).slice(0, 140)}`;

    return `row:${U.normalizeText(text).slice(0, 260)}`;
  }

  function findBuyItNowPriceInput(row) {
    if (!row) return null;
    const inputs = [...row.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')]
      .filter((input) => !input.disabled && input.getAttribute("aria-disabled") !== "true")
      .filter((input) => /^\s*\$?\s*-?\d[\d,]*(?:\.\d{1,2})?\s*$/.test(String(input.value || "")));
    if (!inputs.length) return null;

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
    return decimal || null;
  }

  function renderedBulkRows({ visibleOnly = false } = {}) {
    const controls = [...document.querySelectorAll('input[type="checkbox"], [role="checkbox"]')]
      .filter((control) => !control.disabled && control.getAttribute("aria-disabled") !== "true")
      .filter((control) => !visibleOnly || U.isVisible(control));
    const rows = [];
    const seen = new Set();
    for (const control of controls) {
      const row = control.closest("tr, [role='row']") || findRowForInput(control);
      if (!row || seen.has(row)) continue;
      const priceInput = findBuyItNowPriceInput(row);
      if (!priceInput) continue;
      seen.add(row);
      rows.push({ row, checkbox: findRowCheckbox(row) || control, priceInput });
    }
    return rows;
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

    const unique = [...new Set(candidates)]
      .filter((element) => element !== document.body && element !== document.documentElement)
      .sort((a, b) => {
        const aRange = Number(a.scrollHeight || 0) - Number(a.clientHeight || 0);
        const bRange = Number(b.scrollHeight || 0) - Number(b.clientHeight || 0);
        const aRows = a.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length;
        const bRows = b.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length;
        return ((bRows * 1000000) + bRange) - ((aRows * 1000000) + aRange);
      });

    const result = unique.slice(0, 6).map((element, index) => makeElementScroller(element, `element-${index + 1}`));
    result.push(makeDocumentScroller());
    return result;
  }

  function processRendered99Rows(scanState) {
    let newlySeen = 0;
    let newlyQualified = 0;
    let newlySelected = 0;
    const currentRows = renderedBulkRows();
    for (const { row, checkbox, priceInput } of currentRows) {
      const signature = rowSignature(row);
      if (!signature) continue;
      if (!scanState.allRows.has(signature)) {
        scanState.allRows.add(signature);
        newlySeen += 1;
      }
      if (!priceEndsIn99(priceInput.value)) continue;
      if (!scanState.qualifyingRows.has(signature)) {
        scanState.qualifyingRows.add(signature);
        newlyQualified += 1;
      }
      if (!controlChecked(checkbox)) {
        try { row.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" }); } catch (_) {}
        clickElement(checkbox);
        if (controlChecked(checkbox)) newlySelected += 1;
      }
    }
    return { newlySeen, newlyQualified, newlySelected, rendered: currentRows.length };
  }

  async function settleVirtualRows(delay = 650) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function waitForRowProgress(scanState, beforeSize, timeout = 7000) {
    const started = Date.now();
    let lastRendered = renderedBulkRows().length;
    while (Date.now() - started < timeout) {
      await settleVirtualRows(300);
      processRendered99Rows(scanState);
      const currentRendered = renderedBulkRows().length;
      if (scanState.allRows.size > beforeSize || currentRendered !== lastRendered) return true;
      lastRendered = currentRendered;
    }
    return false;
  }

  async function scanOneScroller(scroller, scanState, processedTotal) {
    scroller.setTop(0);
    await settleVirtualRows(900);
    processRendered99Rows(scanState);

    let stagnation = 0;
    let cycles = 0;
    let previousTop = -1;
    const maxCycles = Math.max(240, Math.min(2600, processedTotal * 5));

    while (cycles < maxCycles && scanState.allRows.size < processedTotal) {
      cycles += 1;
      const beforeSize = scanState.allRows.size;
      const rows = renderedBulkRows({ visibleOnly: true });
      const lastRow = rows[rows.length - 1]?.row || renderedBulkRows().at(-1)?.row || null;
      if (lastRow) {
        try { lastRow.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" }); } catch (_) {}
      }

      const topBefore = scroller.getTop();
      const maxBefore = scroller.getMax();
      const step = Math.max(280, Math.floor(scroller.getViewport() * 0.72));
      const target = Math.min(maxBefore, Math.max(topBefore + step, topBefore + 1));
      scroller.setTop(target);
      scroller.nudge(Math.max(120, Math.floor(step * 0.18)));

      const progressed = await waitForRowProgress(scanState, beforeSize, 3200);
      const topAfter = scroller.getTop();
      const maxAfter = scroller.getMax();

      renderStatus(
        `Scanning Bulk Edit: ${Math.min(scanState.allRows.size, processedTotal).toLocaleString()} / ${processedTotal.toLocaleString()} rows seen; ${scanState.qualifyingRows.size.toLocaleString()} .99 found…`,
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
          await waitForRowProgress(scanState, beforeSize, 9000);
        }
      }

      previousTop = topAfter;
      if (stagnation >= 10) break;
    }

    return cycles;
  }

  async function scanVirtualizedBulkRows(processedTotal) {
    const scanState = { allRows: new Set(), qualifyingRows: new Set() };
    const candidates = findBulkEditorScrollCandidates();
    let totalCycles = 0;
    const triedKinds = [];

    // First inspect every row already present in the DOM. Some eBay builds keep
    // hundreds of off-screen rows mounted even though only a few are visible.
    processRendered99Rows(scanState);

    for (const scroller of candidates) {
      if (scanState.allRows.size >= processedTotal) break;
      triedKinds.push(scroller.kind);
      renderStatus(
        `Scanning ${scroller.kind}: ${scanState.allRows.size.toLocaleString()} / ${processedTotal.toLocaleString()} rows seen…`,
        "ready"
      );
      totalCycles += await scanOneScroller(scroller, scanState, processedTotal);
    }

    // Final document pass with deliberately slow, page-sized movement. This is
    // a fallback for eBay builds whose lazy loader ignores direct scrollTop
    // changes until the browser viewport itself moves.
    if (scanState.allRows.size < processedTotal) {
      const doc = makeDocumentScroller();
      doc.setTop(0);
      await settleVirtualRows(900);
      let noGrowth = 0;
      while (scanState.allRows.size < processedTotal && noGrowth < 12) {
        const before = scanState.allRows.size;
        const visible = renderedBulkRows({ visibleOnly: true });
        const last = visible.at(-1)?.row;
        if (last) {
          try { last.scrollIntoView({ block: "end", behavior: "smooth" }); } catch (_) {}
        }
        doc.nudge(Math.max(300, Math.floor(doc.getViewport() * 0.82)));
        const grew = await waitForRowProgress(scanState, before, 7000);
        noGrowth = grew ? 0 : noGrowth + 1;
        renderStatus(
          `Slow scan: ${scanState.allRows.size.toLocaleString()} / ${processedTotal.toLocaleString()} rows seen; ${scanState.qualifyingRows.size.toLocaleString()} .99 found…`,
          "ready"
        );
      }
    }

    makeDocumentScroller().setTop(0);
    await settleVirtualRows(700);
    processRendered99Rows(scanState);

    return { scanState, scrollerKinds: triedKinds, iterations: totalCycles };
  }

  async function selectAll99Listings() {
    const processed = await U.waitFor(() => {
      const progress = parseProcessedProgress();
      return progress && progress.total > 0 && progress.processed >= progress.total ? progress : null;
    }, 180000, 500);
    if (!processed) throw new Error("eBay Bulk Edit did not finish processing all filtered listings.");

    renderStatus(`Preparing to scan all ${processed.total.toLocaleString()} Bulk Edit rows…`, "ready");
    const { scanState, scrollerKinds } = await scanVirtualizedBulkRows(processed.total);

    const selectedText = document.body?.innerText || "";
    const selectedMatch = selectedText.match(/([\d,]+)\s+of\s+[\d,]+\s+item\(s\) selected/i);
    const uiSelected = selectedMatch ? Number(selectedMatch[1].replace(/,/g, "")) : 0;
    const qualifyingCount = Math.max(scanState.qualifyingRows.size, uiSelected);
    const scannedRows = scanState.allRows.size;

    const minimumExpected = Math.min(processed.total, Math.max(50, Math.floor(processed.total * 0.92)));
    if (processed.total >= 50 && scannedRows < minimumExpected) {
      throw new Error(
        `Only ${scannedRows.toLocaleString()} of ${processed.total.toLocaleString()} Bulk Edit rows could be inspected after trying ${scrollerKinds.join(", ") || "the page"}. `
        + "eBay did not load the remaining listing blocks, so no category changes were attempted."
      );
    }

    return {
      processedTotal: processed.total,
      qualifyingCount,
      scannedRows,
      scrollerKind: scrollerKinds.join(", ") || "document"
    };
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

  function queryAllDeep(selector, root = document) {
    const results = [];
    const seen = new Set();
    const visit = (scope) => {
      if (!scope || seen.has(scope)) return;
      seen.add(scope);
      let matches = [];
      try { matches = [...scope.querySelectorAll(selector)]; } catch (_) { matches = []; }
      results.push(...matches);
      let all = [];
      try { all = [...scope.querySelectorAll("*")]; } catch (_) { all = []; }
      for (const element of all) {
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
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
      throw new Error("eBay's Category editor was still loading after 2 minutes. The selected batch was not changed. Close the Category window and retry.");
    }
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
    const roots = queryAllDeep('[role="dialog"], dialog, [aria-modal="true"], [role="listbox"], [role="menu"], .dialog, .lightbox-dialog')
      .filter(U.isVisible)
      .filter((root) => {
        const text = normalizedElementText(root);
        return text.includes("all categories") || text.includes(destinationTarget);
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return roots[0] || null;
  }

  async function choosePrimaryStoreCategory(expectedCount = 0) {
    const bulkEdit = await U.waitFor(() => findSmallestExactText("Bulk edit", "button, [role='button']"), 10000, 180);
    if (!bulkEdit) throw new Error("I selected the .99 listings but could not find Bulk edit.");
    clickElement(bulkEdit);

    const categoryMenuItem = await U.waitFor(() => findSmallestExactText("Category", "button, a, li, [role='menuitem'], [role='option'], div"), 8000, 150);
    if (!categoryMenuItem) throw new Error("The Bulk edit menu opened, but Category was not found.");
    clickElement(categoryMenuItem);

    const ready = await waitForCategoryEditorReady(120000);
    const categoryDialog = ready.dialog;
    const storeHeading = ready.storeHeading;
    renderStatus("Category editor loaded. Selecting the primary Store category…", "ready");

    const storeTop = storeHeading.getBoundingClientRect().top;
    const primary = findTextBetweenY("Primary category", storeTop, window.innerHeight, categoryDialog)
      || findExactTextDeep("Primary category", categoryDialog);
    if (!primary) throw new Error("The Store category editor loaded, but its Primary category section was not found.");
    const primaryTop = primary.getBoundingClientRect().top;
    const secondary = findTextBetweenY("Secondary category", primaryTop + 1, window.innerHeight, categoryDialog);
    const maxY = secondary ? secondary.getBoundingClientRect().top - 1 : Math.min(window.innerHeight, primaryTop + 260);
    const changeTo = findTextBetweenY("Change to", primaryTop, maxY, categoryDialog);
    if (!changeTo) throw new Error("The Primary Store category Change to option was not found.");
    clickDeepText(changeTo);

    const picker = await U.waitFor(() => findPickerContainingDestination(), 30000, 250);
    if (!picker) throw new Error("The Store category picker did not open.");
    const destination = queryAllDeep('label, span, div, li, [role="option"], [role="radio"], button', picker)
      .filter(U.isVisible)
      .filter((element) => normalizedElementText(element) === U.normalizeText(MOVE99_DESTINATION_CATEGORY))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
    })[0] || null;
    if (!destination) throw new Error(`The destination category “${MOVE99_DESTINATION_CATEGORY}” was not found.`);
    clickDeepText(destination);

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

    const apply = await U.waitFor(() => {
      const dialog = findCategoryEditorDialog();
      return dialog && queryAllDeep('button, [role="button"]', dialog).find((element) => {
        return U.isVisible(element) && normalizedElementText(element) === "apply" && !element.disabled && element.getAttribute?.("aria-disabled") !== "true";
      });
    }, 15000, 180);
    if (!apply) throw new Error("The category was selected, but Apply did not become available.");
    clickElement(apply);

    const update = await U.waitFor(() => {
      const text = document.body?.innerText || "";
      const match = text.match(/Category updated in\s+([\d,]+)\s+of\s+([\d,]+)\s+drafts/i);
      if (match) {
        return { updated: Number(match[1].replace(/,/g, "")), attempted: Number(match[2].replace(/,/g, "")) };
      }
      const gridUpdate = storeCategoryGridUpdate(expectedCount);
      return gridUpdate?.ok ? gridUpdate : null;
    }, 90000, 250);
    if (!update) throw new Error("eBay did not confirm that the Store category was applied to the selected drafts.");
    if (expectedCount && update.attempted && update.attempted !== expectedCount) {
      throw new Error(`eBay reported ${update.attempted} selected drafts, but ${expectedCount} were expected.`);
    }
    const submitReady = await U.waitFor(findMove99SubmitButton, 90000, 300);
    if (!submitReady) throw new Error("The Store category grid updated, but eBay's Submit button was not found.");
    submitReady.scrollIntoView?.({ block: "center", inline: "center" });
    return update;
  }

  function elementArea(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function uniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
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
    queryAllDeep('td, [role="gridcell"], span, button, [role="button"], div')
      .filter(U.isVisible)
      .forEach((element) => {
        const categoryText = sourceOrDestinationCategoryText(element);
        if (!categoryText) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        if (centerX < headerRect.left - 12 || centerX > headerRect.right + 12 || rect.top <= headerRect.bottom - 2) return;
        const rowKey = String(Math.round(rect.top));
        const current = rowMap.get(rowKey);
        if (!current || elementArea(element) < current.area) {
          rowMap.set(rowKey, { text: categoryText, area: elementArea(element) });
        }
      });
    const values = [...rowMap.values()].map((row) => row.text);
    const destinationCount = values.filter((text) => text === destination).length;
    const sourceCount = values.filter((text) => sourceCategories.includes(text)).length;
    const attempted = Number(expectedCount || destinationCount || values.length || 0);
    return {
      ok: Boolean(destinationCount) && sourceCount === 0 && (!expectedCount || destinationCount >= expectedCount),
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
    return [...document.querySelectorAll('button, [role="button"]')].find((element) => {
      if (!isEnabledAction(element)) return false;
      const text = (element.innerText || element.textContent || "").trim();
      return /^Submit(?:\s*\([\d,]+\))?$/i.test(text);
    }) || null;
  }

  async function pauseMove99AtReviewScreen(categoryUpdate, state, batchCount) {
    const submitButton = await U.waitFor(findMove99SubmitButton, 15000, 180);
    if (!submitButton) throw new Error("The Store category was saved, but the eBay review Submit button was not found.");
    submitButton.scrollIntoView?.({ block: "center", inline: "center" });
    await storageSet({
      pendingMove99Run: {
        ...state,
        active: false,
        phase: "awaiting-submit-approval",
        reviewReady: true,
        currentBatchCount: batchCount,
        categoryUpdate,
        reviewReadyAt: new Date().toISOString()
      }
    });
    renderStatus(`eBay Submit is ready. Store category is ${MOVE99_DESTINATION_CATEGORY}. Waiting for approval before Submit.`, "completed");
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
    const matches = [...body.matchAll(/Results?:\s*([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)/gi)];
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
    return { current: 1, total: 1 };
  }

  function activePageFingerprint() {
    return activeListingRows().slice(0, 5).map((entry) => entry.itemId).join("|");
  }

  async function goToActivePage(targetPage) {
    const info = activePageInfo();
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
          qualifies: priceEndsIn99(entry.price) && !MOVE99_BACKBURNER_ITEM_IDS.has(itemId)
        });
      }

      const qualifyingCount = [...inspected.values()].filter((record) => record.qualifies).length;
      renderStatus(`${label} page ${page}: ${inspected.size}${expected ? ` / ${expected}` : ""} current-page rows; ${qualifyingCount} .99 found`, "ready");

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
    if (expected && inspected.size < expected) {
      throw new Error(`Page ${page} should contain ${expected} new listings after excluding earlier pages, but only ${inspected.size} could be inspected. No changes were attempted.`);
    }
    const records = [...inspected.values()].slice(0, expected || undefined);
    return {
      page,
      inspected: records.length,
      itemIds: records.map((record) => String(record.itemId)),
      qualifying: records.filter((record) => record.qualifies)
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
    const seenQualifying = new Set();
    const pageNumbers = Object.keys(pages || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);

    for (const pageNumber of pageNumbers) {
      const source = pages[String(pageNumber)] || {};
      const uniqueItemIds = [];
      for (const rawId of Array.isArray(source.itemIds) ? source.itemIds : []) {
        const id = String(rawId || "");
        if (!id || seenInspected.has(id)) continue;
        seenInspected.add(id);
        uniqueItemIds.push(id);
      }

      const qualifying = [];
      for (const record of Array.isArray(source.qualifying) ? source.qualifying : []) {
        const id = String(record?.itemId || "");
        if (!id || seenQualifying.has(id)) continue;
        // Keep the first page on which an item appeared. Duplicate rows retained by eBay
        // on later pages must not create a second apply batch.
        seenQualifying.add(id);
        qualifying.push(record);
      }

      output[String(pageNumber)] = {
        ...source,
        inspected: uniqueItemIds.length,
        itemIds: uniqueItemIds,
        qualifying
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

  function move99AuditCsv(state) {
    const original = flattenMove99Pages(state.scanPages);
    const remaining = new Set(flattenMove99Pages(state.verificationPages).map((record) => String(record.itemId)));
    const failed = new Set((state.failedIds || []).map(String));
    const rows = original.map((record) => {
      let result = "Scanned";
      if (state.phase === "completed") result = remaining.has(String(record.itemId)) || failed.has(String(record.itemId)) ? "Remaining / Failed" : "Moved / No longer in source categories";
      else if ((state.processedIds || []).map(String).includes(String(record.itemId))) result = "Submitted";
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

  function showMove99ScanSummary(state, completed = false) {
    if (document.getElementById("gldn-move99-preview")) return;
    const records = flattenMove99Pages(completed ? state.verificationPages : state.scanPages);
    const scanned = Object.values(completed ? state.verificationPages || {} : state.scanPages || {}).reduce((sum, page) => sum + Number(page?.inspected || 0), 0);
    const remaining = completed ? records.length : null;
    const overlay = document.createElement("div");
    overlay.id = "gldn-move99-preview";
    overlay.className = "gldn-modal-backdrop";
    const title = completed ? "Move .99 Listings — Completed" : "Move .99 Listings — Scan Complete";
    const actionLabel = completed ? (remaining ? `Retry ${remaining.toLocaleString()} Remaining` : "Done") : `Apply ${records.length.toLocaleString()} Changes`;
    overlay.innerHTML = `
      <div class="gldn-modal gldn-move99-summary">
        <button type="button" class="gldn-close" aria-label="Close">×</button>
        <h2>${title}</h2>
        <p>${completed ? "The final verification pass is complete." : "All filtered Active Listings pages were scanned before any category changes."}</p>
        <div class="gldn-grid">
          <div><strong>Listings scanned</strong><span>${scanned.toLocaleString()}</span></div>
          <div><strong>${completed ? "Still qualifying" : ".99 listings found"}</strong><span>${records.length.toLocaleString()}</span></div>
          <div><strong>Source categories</strong><span>${MOVE99_SOURCE_CATEGORIES.map(escapeHtml).join(" + ")}</span></div>
          <div><strong>Destination</strong><span>${escapeHtml(MOVE99_DESTINATION_CATEGORY)}</span></div>
          ${completed ? `<div><strong>Batches submitted</strong><span>${Number(state.totals?.batches || 0).toLocaleString()}</span></div><div><strong>eBay-reported failures</strong><span>${Number(state.totals?.failed || 0).toLocaleString()}</span></div>` : ""}
        </div>
        <div class="gldn-existing"><strong>Safety:</strong> only the primary Store category changes. Processing occurs in page-sized batches after this one confirmation.</div>
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
        renderStatus(`Scan saved — ${records.length} .99 listings found.`, "completed");
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
      const applyPages = Object.keys(sourcePages || {})
        .map(Number)
        .filter((page) => (sourcePages[String(page)]?.qualifying || []).length > 0)
        .sort((a, b) => b - a);
      const applyCount = flattenMove99Pages(sourcePages).length;
      overlay.remove();
      await storageSet({
        pendingMove99Run: {
          ...state,
          active: true,
          confirmed: true,
          phase: applyCount > 0 && applyCount <= 200 ? "apply-all-pages" : "apply-page",
          applySourcePages: sourcePages,
          applyPages,
          applyIndex: 0,
          currentBatchIds: [],
          currentBatchCount: 0,
          retryRound: completed ? Number(state.retryRound || 0) + 1 : Number(state.retryRound || 0),
          totals: state.totals || { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 }
        }
      });
      runMove99Automation();
    });
  }

  function bulkEditorSelectionProgress() {
    const text = String(document.body?.innerText || "");
    const matches = [...text.matchAll(/([\d,]+)\s+of\s+([\d,]+)\s+item\(s\) selected/gi)];
    if (!matches.length) return { selected: 0, total: 0 };
    const last = matches[matches.length - 1];
    return {
      selected: Number(last[1].replace(/,/g, "")),
      total: Number(last[2].replace(/,/g, ""))
    };
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

  async function ensureBulkWorkspaceMatchesBatch(expectedCount) {
    const processed = await U.waitFor(() => {
      const progress = parseProcessedProgress();
      if (progress && progress.total > 0 && progress.processed >= progress.total) return progress;
      const selection = bulkEditorSelectionProgress();
      return selection.total > 0 ? { processed: selection.total, total: selection.total, source: "selection-summary" } : null;
    }, 180000, 500);
    if (!processed) throw new Error("eBay Bulk Edit did not finish loading the selected batch.");
    if (processed.total !== expectedCount) {
      throw new Error(`Safety stop: eBay opened ${processed.total} Bulk Edit rows, but this batch selected ${expectedCount}. No category changes were attempted.`);
    }

    let selection = bulkEditorSelectionProgress();
    if (selection.total && selection.total !== expectedCount) {
      throw new Error(`Safety stop: Bulk Edit reports ${selection.total} available rows, but this batch contains ${expectedCount}. No category changes were attempted.`);
    }
    if (selection.selected !== expectedCount) {
      const selectedAll = await selectAllBulkEditorListings(expectedCount);
      selection = bulkEditorSelectionProgress();
      if (!selectedAll || selection.selected !== expectedCount) {
        throw new Error(`Safety stop: only ${selection.selected} of ${expectedCount} listings were selected in Bulk Edit after trying the real table-header select-all checkbox. No category changes were attempted.`);
      }
    }
    return processed;
  }

  async function saveMove99Result(partial, clearPending = true) {
    const identity = await storageGet(["computerLabel", "ebayAccountLabel", "move99History"]);
    const record = {
      computerLabel: identity.computerLabel || "0",
      ebayAccountLabel: identity.ebayAccountLabel || "",
      sourceCategories: MOVE99_SOURCE_CATEGORIES,
      destinationCategory: MOVE99_DESTINATION_CATEGORY,
      completedAt: new Date().toISOString(),
      pageUrl: location.href,
      ...partial
    };
    const history = Array.isArray(identity.move99History) ? identity.move99History : [];
    history.push(record);
    const values = { lastMove99Result: record, move99History: history.slice(-100) };
    if (clearPending) values.pendingMove99Run = null;
    await storageSet(values);
    return record;
  }

  async function runMove99Automation() {
    await ensureTaskCanContinue();
    if (move99Running) return;
    move99Running = true;
    try {
      const stored = await storageGet(["pendingMove99Run", "computerLabel", "ebayAccountLabel"]);
      applyMove99AccountConfig(stored.pendingMove99Run?.ebayAccountLabel || stored.ebayAccountLabel || "");
      const state = stored.pendingMove99Run;
      if (!state?.active && state?.phase !== "scan-summary" && state?.phase !== "completed") return;

      if (state.phase === "active-prepare") {
        if (!isMove99ActiveListingsPage()) {
          renderStatus("Opening Active Listings for a full .99 scan…", "ready");
          location.assign(MOVE99_ACTIVE_URL);
          return;
        }
        renderStatus(`Filtering ${MOVE99_SOURCE_CATEGORIES.join(" and ")} before scanning all pages…`, "ready");
        const filteredCount = await ensureCategoryFilterSelected();
        if (filteredCount === 0) {
          await saveMove99Result({ status: "Completed", filteredCount: 0, qualifyingCount: 0 });
          renderStatus("No listings found in the source categories.", "completed");
          return;
        }
        const filteredUrl = location.href;
        const next = {
          ...state,
          active: true,
          confirmed: true,
          phase: "scan-page",
          filteredCount,
          filteredUrl,
          currentPage: 1,
          totalPages: activePageInfo().total,
          scanPages: {},
          verificationPages: {},
          failedIds: [],
          processedIds: [],
          totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 }
        };
        await storageSet({ pendingMove99Run: next });
        await goToActivePage(1);
        setTimeout(() => { move99Running = false; runMove99Automation(); }, 300);
        return;
      }

      if (state.phase === "scan-page" || state.phase === "verify-page") {
        if (!isMove99ActiveListingsPage()) {
          location.assign(state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const targetPage = Number(state.currentPage || 1);
        if (activePageInfo().current !== targetPage) await goToActivePage(targetPage);
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
        const key = String(scan.page);
        const pages = { ...existingPages, [key]: scan };
        const pageInfo = activePageInfo();
        const nextPage = scan.page + 1;
        if (nextPage <= pageInfo.total) {
          await storageSet({ pendingMove99Run: { ...state, [pagesField]: pages, currentPage: nextPage, totalPages: pageInfo.total } });
          renderStatus(`${verifying ? "Verification" : "Scan"} page ${scan.page} complete. Opening page ${nextPage} of ${pageInfo.total}…`, "ready");
          await goToActivePage(nextPage);
          setTimeout(() => { move99Running = false; runMove99Automation(); }, 500);
          return;
        }

        const rawScanned = Object.values(pages).reduce((sum, page) => sum + Number(page?.inspected || 0), 0);
        const normalizedPages = dedupeMove99Pages(pages);
        const scanned = uniqueMove99InspectedCount(normalizedPages);
        const expectedTotal = Number(state.filteredCount || 0);
        const scanCountMismatch = !verifying && expectedTotal && scanned !== expectedTotal
          ? { expectedTotal, scanned }
          : null;
        if (!verifying) {
          const duplicateRowsIgnored = Math.max(0, rawScanned - scanned);
          const summaryState = { ...state, active: true, phase: "scan-summary", scanPages: normalizedPages, currentPage: scan.page, duplicateRowsIgnored, scanCountMismatch };
          await storageSet({ pendingMove99Run: summaryState, lastMove99Scan: summaryState });
          renderStatus(`Full scan complete — ${flattenMove99Pages(normalizedPages).length} .99 listings found across ${scanned} unique listings${scanCountMismatch ? `; eBay reported ${expectedTotal.toLocaleString()}` : ""}${duplicateRowsIgnored ? `; ${duplicateRowsIgnored} duplicate rows ignored` : ""}.`, "completed");
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
          active: true,
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
          audit: originalRecords.map((record) => ({ itemId: record.itemId, price: record.price, result: remainingIds.has(String(record.itemId)) ? "Remaining" : "Moved" }))
        }, false);
        renderStatus(`Verification complete — ${remainingRecords.length} qualifying listings remain.`, remainingRecords.length ? "error" : "completed");
        showMove99ScanSummary(completedState, true);
        return;
      }

      if (state.phase === "scan-summary") {
        showMove99ScanSummary(state, false);
        return;
      }

      if (state.phase === "apply-all-pages") {
        if (!isMove99ActiveListingsPage()) {
          location.assign(state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const sourcePages = state.applySourcePages || state.scanPages || {};
        renderStatus("Selecting all saved .99 listings across source pages for one Bulk Edit batch...", "ready");
        const selection = await selectSavedIdsAcrossActivePages(sourcePages);
        const failedIds = [...new Set([...(state.failedIds || []).map(String), ...selection.missingIds])];
        if (!selection.selectedIds.length) {
          const next = { ...state, failedIds, phase: "verify-page", currentPage: 1, verificationPages: {} };
          await storageSet({ pendingMove99Run: next });
          await goToActivePage(1);
          setTimeout(() => { move99Running = false; runMove99Automation(); }, 300);
          return;
        }
        const nextState = { ...state, failedIds, currentBatchIds: selection.selectedIds, currentBatchCount: selection.selectedIds.length, currentBatchPage: activePageInfo().current };
        await openSelectedListingsInBulkEditor(selection.selectedIds, nextState);
        return;
      }

      if (state.phase === "apply-page") {
        if (!isMove99ActiveListingsPage()) {
          location.assign(state.filteredUrl || MOVE99_ACTIVE_URL);
          return;
        }
        const applyPages = Array.isArray(state.applyPages) ? state.applyPages : [];
        const applyIndex = Number(state.applyIndex || 0);
        if (applyIndex >= applyPages.length) {
          const next = { ...state, phase: "verify-page", currentPage: 1, verificationPages: {} };
          await storageSet({ pendingMove99Run: next });
          renderStatus("All saved batches submitted. Starting final verification scan…", "ready");
          await goToActivePage(1);
          setTimeout(() => { move99Running = false; runMove99Automation(); }, 500);
          return;
        }
        const targetPage = Number(applyPages[applyIndex]);
        if (activePageInfo().current !== targetPage) await goToActivePage(targetPage);
        const pageRecord = state.applySourcePages?.[String(targetPage)];
        const targetIds = (pageRecord?.qualifying || []).map((record) => String(record.itemId));
        renderStatus(`Applying saved scan: page ${targetPage}, batch ${applyIndex + 1} of ${applyPages.length}…`, "ready");
        const selection = await selectSavedIdsOnActivePage(targetIds);
        const failedIds = [...new Set([...(state.failedIds || []).map(String), ...selection.missingIds])];
        if (!selection.selectedIds.length) {
          await storageSet({ pendingMove99Run: { ...state, failedIds, applyIndex: applyIndex + 1 } });
          setTimeout(() => { move99Running = false; runMove99Automation(); }, 300);
          return;
        }
        const nextState = { ...state, failedIds, currentBatchIds: selection.selectedIds, currentBatchCount: selection.selectedIds.length, currentBatchPage: targetPage };
        await openSelectedListingsInBulkEditor(selection.selectedIds, nextState);
        return;
      }

      if (state.phase === "bulk-editor") {
        if (!isMove99BulkEditorPage()) return;
        const batchCount = Number(state.currentBatchCount || state.currentBatchIds?.length || 0);
        if (!batchCount) throw new Error("The selected batch information was lost. Restart Move .99 Listings.");
        renderStatus(`Verifying the ${batchCount}-listing Bulk Edit batch…`, "ready");
        await ensureBulkWorkspaceMatchesBatch(batchCount);
        renderStatus("Changing the primary Store category for this batch…", "ready");
        const categoryUpdate = await choosePrimaryStoreCategory(batchCount);
        await pauseMove99AtReviewScreen(categoryUpdate, state, batchCount);
        return;
        renderStatus(`Batch complete — ${result.live} live, ${batchFailed} failed. Continuing saved scan…`, batchFailed ? "error" : "ready");
      }

      if (state.phase === "completed") {
        showMove99ScanSummary(state, true);
      }
    } catch (error) {
      if (taskWasStopped(error)) {
        renderStatus("Move .99 Listings stopped by user.", "error");
        return;
      }
      const current = await storageGet(["pendingMove99Run"]);
      await saveMove99Result({ status: "Failed", error: error.message }, false);
      await storageSet({ pendingMove99Run: { ...(current.pendingMove99Run || {}), active: false, error: error.message } });
      renderStatus(`Move .99 Listings failed: ${error.message}`, "error");
      alert(`Move .99 Listings stopped safely.\n\n${error.message}`);
    } finally {
      move99Running = false;
    }
  }

  async function startMove99Listings() {
    await storageSet({ gldnStopRequested: false });
    const identity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    if (!identity.ebayAccountLabel) {
      alert("Set the eBay account in the extension popup before using Move .99 Listings.");
      return;
    }
    const accountConfig = await applyMove99AccountConfig(identity.ebayAccountLabel);
    await storageSet({
      pendingMove99Run: {
        active: true,
        confirmed: true,
        phase: "active-prepare",
        ebayAccountLabel: accountConfig.account,
        currentPage: 1,
        scanPages: {},
        verificationPages: {},
        failedIds: [],
        processedIds: [],
        totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
        startedAt: new Date().toISOString(),
        sourceCategories: accountConfig.sourceCategories,
        destinationCategory: accountConfig.destinationCategory,
        sourceStoreCategoryIds: accountConfig.sourceStoreCategoryIds
      }
    });
    renderStatus("Starting a full scan of every filtered listing before making changes…", "ready");
    runMove99Automation();
  }

  async function resumePendingActions() {
    const result = await storageGet(["pendingMarkShippedRun", "pendingSellerLevelScan", "pendingReviewMonthlyLimits", "pendingMove99Run"]);
    if (result.pendingMarkShippedRun?.active && isAwaitingShipmentPage()) {
      setTimeout(runMarkShippedAutomation, 600);
    }
    if (result.pendingSellerLevelScan && isSellerLevelPage()) {
      setTimeout(scanHealthPage, 700);
    }
    if (result.pendingReviewMonthlyLimits && (isActiveListingsPage() || /\/sh\/ovw/i.test(location.href))) {
      setTimeout(reviewMonthlyLimits, 700);
    }
    if (result.pendingMove99Run?.active && (isMove99ActiveListingsPage() || isMove99BulkEditorPage())) {
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
    const identity = await storageGet(["computerLabel", "ebayAccountLabel"]);
    const computer = normalizedComputer(identity.computerLabel || "0");
    const account = identity.ebayAccountLabel ? normalizedEbayAccount(identity.ebayAccountLabel) : "eBay account not set";
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
        <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v3.4.15</span></div>
        <div class="gldn-drag-grip" aria-hidden="true">⋮⋮</div>
      </div>
      <div class="gldn-panel-identity"></div>
      <button type="button" data-action="mark-shipped" class="gldn-success">Mark as Shipped</button>
      <button type="button" data-action="health" class="gldn-secondary">Scan Seller Level</button>
      <button type="button" data-action="limits" class="gldn-danger">Confirm Listings Under Limit</button>
      <button type="button" data-action="prepare" class="gldn-primary">Prepare Order Note</button>
      <div class="gldn-task-controls">
        <button type="button" data-action="open-dashboard" class="gldn-dashboard">Dashboard</button>
        <button type="button" data-action="stop-task" class="gldn-stop-task">Stop Task</button>
        <button type="button" data-action="reset-task" class="gldn-reset-task">Reset</button>
        <button type="button" data-action="reload-extension" class="gldn-dev-reload">Reload Ext</button>
      </div>
      <div class="gldn-status">Ready.</div>
    `;
    document.documentElement.appendChild(panel);
    U.makePanelDraggable(panel, "gldnEbayPanelPosition");
    statusElement = panel.querySelector(".gldn-status");
    panelIdentityElement = panel.querySelector(".gldn-panel-identity");
    panel.querySelector("[data-action='mark-shipped']").addEventListener("click", startMarkShipped);
    panel.querySelector("[data-action='prepare']").addEventListener("click", prepareNote);
    panel.querySelector("[data-action='health']").addEventListener("click", startSellerLevelScan);
    limitsButtonElement = panel.querySelector("[data-action='limits']");
    limitsButtonElement.addEventListener("click", async () => {
      await storageSet({ gldnStopRequested: false });
      await storageSet({ pendingReviewMonthlyLimits: { active: true, phase: "active-listings", startedAt: new Date().toISOString() } });
      reviewMonthlyLimits();
    });
    panel.querySelector("[data-action='open-dashboard']").addEventListener("click", openDashboard);
    panel.querySelector("[data-action='stop-task']").addEventListener("click", stopCurrentTask);
    panel.querySelector("[data-action='reset-task']").addEventListener("click", resetAutomation);
    panel.querySelector("[data-action='reload-extension']").addEventListener("click", reloadExtensionFromPanel);
    refreshPanelIdentity();
    refreshLimitsButton();
  }


  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.gldnStopRequested) return;
    if (changes.gldnStopRequested.newValue) {
      renderStatus("Stop requested — waiting for the next safe checkpoint…", "error");
    }
  });

  createPanel();
  installEcomSniperTrustedClickWatcher();
  installSavedBulkEditDialogWatcher();
  resumePendingActions();
  resumePendingEcomSniperBulkExtract();
  resumePendingSnipingExtract();
  resumeAfterManualEcomSniperClick();

  // SPA-navigation heartbeat: eBay may update page 1 -> page 2 without reloading
  // the extension content script. Resume a confirmed Move .99 run automatically.
  setInterval(async () => {
    if (move99Running) return;
    try {
      const result = await storageGet(["pendingMove99Run"]);
      const pending = result.pendingMove99Run;
      if (pending?.active && pending.confirmed && (isMove99ActiveListingsPage() || isMove99BulkEditorPage())) {
        runMove99Automation();
      }
      await resumeAfterManualEcomSniperClick();
      await resumePendingEcomSniperBulkExtract();
      await resumePendingSnipingExtract();
    } catch (_) {
      // Keep the page usable; the next heartbeat can retry.
    }
  }, 1800);

  const observer = new MutationObserver(detectSavedNote);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
