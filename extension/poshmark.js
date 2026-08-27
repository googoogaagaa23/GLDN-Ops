(() => {
  if (window.__GLDN_POSHMARK_ASSISTANT__) return;
  window.__GLDN_POSHMARK_ASSISTANT__ = true;

  const U = window.OrderNoteUtils;
  let panel;
  let statusElement;
  let backfillResumeBusy = false;
  let lastBackfillSalesFingerprint = "";
  let extensionContextInvalidated = false;
  let backfillObserver = null;
  let backfillMutationTimer = 0;
  let visibleSalesReviewState = null;
  let restoredBackfillReviewRunId = "";

  const BACKFILL_REVIEW_PAGE_SIZE = 25;

  const CLOSET_STATS_URL = "https://poshmark.com/users/self/closet_stats";
  const SALES_URL = "https://poshmark.com/order/sales";
  const FOUNDATION = globalThis.GLDN_FOUNDATION;
  const EXTENSION_VERSION = chrome.runtime.getManifest().version;
  const VERSIONED_WORKFLOW_KEYS = new Set([
    ...FOUNDATION.workflowStateKeys,
    "pendingPoshmarkProfitContext"
  ]);
  const AUDIT = globalThis.GLDN_PROFIT_AUDIT;

  const invalidContextError = (error) => U?.isExtensionContextInvalidated?.(error)
    || /extension context invalidated|context invalidated/i.test(String(error?.message || error || ""));

  function stopInvalidatedPoshmarkContext(error) {
    if (extensionContextInvalidated) return;
    extensionContextInvalidated = true;
    backfillObserver?.disconnect?.();
    backfillObserver = null;
    clearTimeout(backfillMutationTimer);
    backfillMutationTimer = 0;
    backfillResumeBusy = false;
    if (statusElement) {
      statusElement.textContent = "GLDN Ops was updated. Refresh this Poshmark tab when you are ready.";
      statusElement.dataset.type = "error";
    }
    panel?.setAttribute?.("data-gldn-context-invalidated", "true");
    panel?.querySelectorAll?.("button, input, select, textarea").forEach((control) => { control.disabled = true; });
    if (error) U?.markExtensionContextInvalidated?.(error);
  }

  function requirePoshmarkContext() {
    if (extensionContextInvalidated || !U?.extensionContextAvailable?.()) {
      const error = new Error("Extension context invalidated. Refresh this Poshmark tab.");
      stopInvalidatedPoshmarkContext(error);
      throw error;
    }
  }

  window.addEventListener("gldn-extension-context-invalidated", (event) => {
    stopInvalidatedPoshmarkContext(event.detail?.message || "Extension context invalidated.");
  });

  const storageGet = (keys) => new Promise((resolve, reject) => {
    try {
      requirePoshmarkContext();
      chrome.storage.local.get(keys, (result) => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          if (invalidContextError(error)) stopInvalidatedPoshmarkContext(error);
          reject(new Error(error.message || String(error)));
        } else resolve(result);
      });
    } catch (error) {
      if (invalidContextError(error)) stopInvalidatedPoshmarkContext(error);
      reject(error);
    }
  });
  const storageSet = (values) => new Promise((resolve, reject) => {
    const payload = { ...values };
    for (const key of VERSIONED_WORKFLOW_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      const value = payload[key];
      if (value === true) {
        payload[key] = { active: true, extensionVersion: EXTENSION_VERSION, stateUpdatedAt: new Date().toISOString() };
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        payload[key] = { ...value, extensionVersion: EXTENSION_VERSION, stateUpdatedAt: new Date().toISOString() };
      }
    }
    try {
      requirePoshmarkContext();
      chrome.storage.local.set(payload, () => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          if (invalidContextError(error)) stopInvalidatedPoshmarkContext(error);
          reject(new Error(error.message || String(error)));
        } else resolve();
      });
    } catch (error) {
      if (invalidContextError(error)) stopInvalidatedPoshmarkContext(error);
      reject(error);
    }
  });
  const storageRemove = (keys) => new Promise((resolve, reject) => {
    try {
      requirePoshmarkContext();
      chrome.storage.local.remove(keys, () => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          if (invalidContextError(error)) stopInvalidatedPoshmarkContext(error);
          reject(new Error(error.message || String(error)));
        } else resolve();
      });
    } catch (error) {
      if (invalidContextError(error)) stopInvalidatedPoshmarkContext(error);
      reject(error);
    }
  });
  const AMAZON_MATCH_TTL_MS = 2 * 60 * 60 * 1000;
  const runtimeMessage = U.runtimeMessage;

  async function savedComputerLabelValue(defaultValue = "") {
    const result = await storageGet(["computerLabel"]);
    return String(result.computerLabel || defaultValue).trim() || defaultValue;
  }

  async function savedPoshmarkComputerLabel() {
    const savedComputerLabel = (await savedComputerLabelValue()).toUpperCase();
    const identity = FOUNDATION.poshmarkIdentityForComputer(savedComputerLabel);
    if (identity.enabled) {
      return {
        ok: true,
        computerLabel: identity.computerLabel,
        savedComputerLabel: identity.savedComputerLabel,
        displayComputerLabel: identity.displayComputerLabel
      };
    }
    return {
      ok: false,
      computerLabel: identity.computerLabel || savedComputerLabel,
      savedComputerLabel,
      displayComputerLabel: savedComputerLabel || "Not set",
      error: savedComputerLabel
        ? `Computer ${savedComputerLabel} is not Poshmark-enabled. Poshmark tools are enabled for M0, 0 + 7, and 7.`
        : "Choose and save this computer in GLDN Ops before using Poshmark tools."
    };
  }

  function lines() {
    return (document.body?.innerText || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function detectPoshmarkAccountLabel() {
    return FOUNDATION.poshmarkAccountLabel({
      closetHrefs: [...document.querySelectorAll("a[href]")]
        .map((anchor) => String(anchor.getAttribute("href") || "")),
      avatarAlts: [...document.querySelectorAll("header img[alt], [role='banner'] img[alt], nav img[alt]")]
        .map((image) => String(image.getAttribute("alt") || ""))
    });
  }

  function moneyToNumber(value) {
    const number = Number.parseFloat(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function numberToValue(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const cleaned = text.replace(/,/g, "");
    const percent = /%/.test(cleaned);
    const money = /\$/.test(cleaned);
    const number = Number.parseFloat(cleaned.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(number)) return null;
    return { raw: text, value: number, percent, money };
  }

  function labelMatches(line, label) {
    const a = U.normalizeText(line);
    const b = U.normalizeText(label);
    return a === b || a.includes(b);
  }

  function findMetric(label, qualifier = "") {
    const list = lines();
    for (let i = 0; i < list.length; i += 1) {
      if (!labelMatches(list[i], label)) continue;
      if (qualifier) {
        const nearby = list.slice(i + 1, i + 5).join(" ");
        if (!labelMatches(nearby, qualifier)) continue;
      }
      for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
        const parsed = numberToValue(list[j]);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  function findHeaderMetric(label) {
    const list = lines();
    for (let i = 0; i < list.length; i += 1) {
      if (!labelMatches(list[i], label)) continue;
      const previous = i > 0 ? numberToValue(list[i - 1]) : null;
      if (previous) return previous;
    }
    return null;
  }

  function isPoshmarkItemTitleCandidate(line) {
    const text = String(line || "").trim();
    if (text.length < 12 || text.length > 260) return false;
    if (/^\$/.test(text)) return false;
    if (/^@/.test(text)) return false;
    if (/^(POSHMARK|Listings|Search Listings|POSH MARKETS|All|Feed|Women|Men|Kids|Home|Electronics|Pets|Beauty|Brands|Parties|Posh Shows|How It Works|Sell On Poshmark)$/i.test(text)) return false;
    if (/^(Back to orders|ORDER DATE|ORDER NUMBER|Pricing|Pricing & Earning Info|Show Details|Size:|SKU:|Your Earnings|ORDER STATUS|SHIPPING YOUR ORDER|Message Buyer|Problems|Order Inquiry|Estimated Delivery|Tracking)(?:$|\s)/i.test(text)) return false;
    return true;
  }

  function orderNumberFromUrl(value) {
    return String(value || "").match(/\/order\/sales\/([^/?#]+)/i)?.[1] || "";
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

  function uniqueValues(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function orderSkuValues(text) {
    return uniqueValues([...String(text || "").matchAll(/SKU:\s*([A-Za-z0-9+/=_-]+)/gi)].map((match) => match[1]));
  }

  function asinValuesFromSkus(skus) {
    return uniqueValues((skus || []).map(decodeSkuToAsin));
  }

  function closestSaleContainer(anchor) {
    return anchor.closest("tr, li, article, [class*='order'], [class*='Order'], [class*='card'], [class*='Card']") || anchor.parentElement || anchor;
  }

  function extractTitleFromSaleText(text, fallback = "") {
    const candidates = String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(isPoshmarkItemTitleCandidate);
    return candidates.find((line) => !/^(sold|shipped|delivered|tracking|earnings|order)$/i.test(line)) || fallback || "";
  }

  function parseSaleSummary(anchor) {
    const href = new URL(anchor.href || anchor.getAttribute("href") || "", location.href).toString();
    const container = closestSaleContainer(anchor);
    const text = String(container?.innerText || anchor.innerText || anchor.textContent || "").replace(/\r/g, "").trim();
    const tableRow = anchor.closest("tr");
    const dateCell = tableRow?.querySelector(".my-sales-desktop-table__date-col");
    const priceCell = tableRow?.querySelector(".my-sales-desktop-table__price-col");
    const earningsCell = tableRow?.querySelector(".my-sales-desktop-table__earnings-col");
    const statusCell = tableRow?.querySelector(".my-sales-desktop-table__status-col");
    const priceCellValue = moneyToNumber(priceCell?.innerText || priceCell?.textContent || "");
    const earningsCellValue = moneyToNumber(earningsCell?.innerText || earningsCell?.textContent || "");
    const earningsCellText = String(earningsCell?.innerText || earningsCell?.textContent || "").replace(/\r/g, "").trim();
    const earningsStatus = earningsCellText
      .replace(/\$\s*[0-9,]+(?:\.\d{1,2})?/g, "")
      .split(/\n+/)
      .map((value) => value.trim())
      .find(Boolean) || "";
    const earningsMatch = text.match(/Your Earnings:?\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i)
      || text.match(/\bEarnings:?\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const soldMatch = text.match(/\$([0-9,]+(?:\.\d{1,2})?)/);
    return {
      orderNumber: orderNumberFromUrl(href),
      itemTitle: extractTitleFromSaleText(text, String(anchor.textContent || "").trim()),
      orderDate: String(dateCell?.innerText || dateCell?.textContent || "").trim(),
      orderStatus: String(statusCell?.innerText || statusCell?.textContent || "").trim(),
      earningsStatus,
      marketplaceEarnings: earningsCellValue ?? (earningsMatch ? moneyToNumber(earningsMatch[1]) : null),
      marketplaceSoldPrice: priceCellValue ?? (soldMatch ? moneyToNumber(soldMatch[1]) : null),
      pageUrl: href,
      sourceText: text.slice(0, 500)
    };
  }

  function visibleSaleSummaries() {
    const seen = new Set();
    return [...document.querySelectorAll("a[href*='/order/sales/']")]
      .map(parseSaleSummary)
      .filter((record) => {
        if (!record.orderNumber || seen.has(record.orderNumber)) return false;
        seen.add(record.orderNumber);
        return true;
      });
  }

  function parsePoshmarkStats() {
    const record = {
      platform: "Poshmark",
      computerLabel: "7",
      poshmarkAccountLabel: "",
      capturedAt: new Date().toISOString(),
      pageTitle: document.title,
      pageUrl: location.href,
      posherSince: "",
      profileListings: findHeaderMetric("Listings")?.value ?? null,
      followers: findHeaderMetric("Followers")?.value ?? null,
      shippedOrdersAllTime: findMetric("Shipped Orders", "All Time")?.value ?? null,
      shippedOrdersLast90: findMetric("Shipped Orders", "Last 90 Days")?.value ?? null,
      daysToShipLast90: findMetric("Days To Ship", "Last 90 Days")?.value ?? null,
      totalSalesLast90: findMetric("Total Sales", "Last 90 Days")?.value ?? null,
      sellerCancellationsLast90: findMetric("Seller Cancellations", "Last 90 Days")?.value ?? null,
      approvedReturnCasesLast90: findMetric("Approved Return Cases", "Last 90 Days")?.value ?? null,
      availableListings: findMetric("Available Listings")?.value ?? null,
      averageDiscountOffOriginalPrice: findMetric("Average Discount Off Original Price")?.value ?? null,
      selfSharesLast30: findMetric("Self-Shares", "last 30 days")?.value ?? null,
      moderatorRemovedListingsLast30: findMetric("Moderator-Removed-Listings", "last 30 days")?.value ?? null,
      soldListingsAllTime: findMetric("Sold Listings")?.value ?? null,
      totalEarnedAllTime: null,
      daysToShipAverage: findMetric("Days To Ship", "On Average")?.value ?? null,
      averageRating: findMetric("Average Rating")?.value ?? null,
      totalRatings: null
    };

    const text = document.body?.innerText || "";
    const accountMatch = text.match(/@([a-z0-9_.-]+)/i);
    record.poshmarkAccountLabel = detectPoshmarkAccountLabel() || accountMatch?.[1] || "";
    const sinceMatch = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s+\d{4}\b/i);
    if (sinceMatch) record.posherSince = sinceMatch[0];
    const earnedMatch = text.match(/Total Earned:\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (earnedMatch) record.totalEarnedAllTime = moneyToNumber(earnedMatch[1]);
    const ratingsMatch = text.match(/Total Ratings:\s*([0-9,]+)/i);
    if (ratingsMatch) record.totalRatings = moneyToNumber(ratingsMatch[1]);

    record.detectedAny = [
      record.shippedOrdersAllTime,
      record.shippedOrdersLast90,
      record.daysToShipLast90,
      record.sellerCancellationsLast90,
      record.availableListings,
      record.averageRating
    ].some((value) => value !== null && value !== undefined);
    return record;
  }

  function renderStatus(message, type = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  }

  async function stopCurrentTask() {
    await storageSet({ gldnStopRequested: true });
    const result = await runtimeMessage({ type: "stopPoshmarkProfitBackfill" });
    renderStatus(result?.ok
      ? "Stop requested. The active worker will pause at its next safe checkpoint."
      : "Stop requested for the active marketplace workflow.", "error");
  }

  async function resetAutomation() {
    if (!window.confirm("Reset the saved GLDN Ops workflow checkpoint in this Chrome profile? Marketplace data will not be changed.")) return;
    const result = await runtimeMessage({ type: "resetAutomationState" });
    if (!result?.ok) {
      renderStatus(`Reset failed: ${result?.error || "extension background unavailable"}`, "error");
      return;
    }
    document.querySelectorAll(".gldn-modal-backdrop").forEach((element) => element.remove());
    renderStatus("Saved workflow checkpoint cleared. Poshmark tools are ready.", "ready");
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function valueDisplay(value, suffix = "") {
    return value === null || value === undefined || value === "" ? "Not captured" : `${value}${suffix}`;
  }

  function countDisplay(value) {
    if (value === null || value === undefined || value === "") return "Not captured";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString("en-US") : String(value);
  }

  function currencyDisplay(value) {
    if (value === null || value === undefined || value === "") return "Not captured";
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? numeric.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : String(value);
  }

  function showStatsPreview(record) {
    document.getElementById("gldn-posh-stats-preview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-posh-stats-preview";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    const rows = [
      ["Account", record.poshmarkAccountLabel || "Not captured"],
      ["Posher since", valueDisplay(record.posherSince)],
      ["Profile listings", countDisplay(record.profileListings)],
      ["Followers", countDisplay(record.followers)],
      ["Shipped orders all time", countDisplay(record.shippedOrdersAllTime)],
      ["Shipped orders last 90 days", countDisplay(record.shippedOrdersLast90)],
      ["Days to ship last 90 days", valueDisplay(record.daysToShipLast90)],
      ["Days to ship average", valueDisplay(record.daysToShipAverage)],
      ["Total sales last 90 days", currencyDisplay(record.totalSalesLast90)],
      ["Seller cancellations last 90 days", valueDisplay(record.sellerCancellationsLast90, "%")],
      ["Approved return cases last 90 days", valueDisplay(record.approvedReturnCasesLast90, "%")],
      ["Moderator removed listings last 30 days", countDisplay(record.moderatorRemovedListingsLast30)],
      ["Available listings", countDisplay(record.availableListings)],
      ["Average discount off original price", valueDisplay(record.averageDiscountOffOriginalPrice, "%")],
      ["Self shares last 30 days", countDisplay(record.selfSharesLast30)],
      ["Sold listings all time", countDisplay(record.soldListingsAllTime)],
      ["Total earned all time", currencyDisplay(record.totalEarnedAllTime)],
      ["Average rating", valueDisplay(record.averageRating)],
      ["Total ratings", countDisplay(record.totalRatings)]
    ];
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Review Poshmark Stats</h2>
        <p class="gldn-help-text">These values come from My Posh Stats. Save only after reviewing them.</p>
        <div class="gldn-existing">
          ${rows.map(([label, value]) => `<div class="gldn-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save">Save Poshmark Stats</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnPoshStatsModalPosition");

    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    overlay.querySelector("[data-action='save']").addEventListener("click", async () => {
      const status = overlay.querySelector(".gldn-modal-status");
      status.textContent = "Saving Poshmark stats...";
      await storageSet({ latestPoshmarkStats: record });
      const response = await runtimeMessage({ type: "syncPoshmarkStats", record });
      if (response?.ok) {
        status.textContent = "Poshmark stats synced.";
        renderStatus("Poshmark stats synced.", "completed");
        setTimeout(close, 900);
      } else if (response?.queued) {
        status.textContent = "Saved locally. Dashboard sync is continuing in the background.";
        renderStatus("Saved locally - dashboard sync continuing in background.", "ready");
        setTimeout(close, 1400);
      } else {
        const error = response?.error || "Dashboard sync failed.";
        status.textContent = error;
        renderStatus(`Saved locally - sync failed: ${error}`, "error");
      }
    });
  }

  async function scanPoshmarkStats() {
    const poshComputer = await savedPoshmarkComputerLabel();
    if (!poshComputer.ok) {
      renderStatus(poshComputer.error, "error");
      await storageRemove(["pendingPoshmarkStatsScan"]);
      return;
    }
    if (!/\/users\/self\/closet_stats/i.test(location.href)) {
      renderStatus("Opening Poshmark stats...", "ready");
      await storageSet({ pendingPoshmarkStatsScan: { active: true, startedAt: Date.now() } });
      location.assign(CLOSET_STATS_URL);
      return;
    }
    renderStatus("Reading Poshmark stats...", "ready");
    const record = parsePoshmarkStats();
    record.computerLabel = poshComputer.computerLabel;
    if (!record.detectedAny) {
      await storageRemove(["pendingPoshmarkStatsScan"]);
      renderStatus("Could not read Poshmark stats from this page. Refresh My Posh Stats and try again.", "error");
      return;
    }
    await storageRemove(["pendingPoshmarkStatsScan"]);
    showStatsPreview(record);
    renderStatus("Review Poshmark stats before saving.", "ready");
  }

  async function startPoshmarkStatsScan() {
    let reservationToken = "";
    try {
      reservationToken = await U.claimWorkflowStart("poshmark-stats", "Poshmark stats scan");
      await storageSet({ pendingPoshmarkStatsScan: { active: true, startedAt: Date.now() } });
    } catch (error) {
      renderStatus(error.message || "Poshmark stats scan could not start.", "error");
      return;
    } finally {
      await U.releaseWorkflowStart(reservationToken);
    }
    await scanPoshmarkStats();
  }

  async function resumePendingPoshmarkStatsScan() {
    const result = await storageGet(["pendingPoshmarkStatsScan"]);
    const pending = result.pendingPoshmarkStatsScan;
    if (!pending?.active) return false;
    if (Date.now() - Number(pending.startedAt || 0) > 120000) {
      await storageRemove(["pendingPoshmarkStatsScan"]);
      renderStatus("Poshmark stats scan timed out. Open My Posh Stats and try again.", "error");
      return false;
    }
    if (!/\/users\/self\/closet_stats/i.test(location.href)) return false;
    await storageRemove(["pendingPoshmarkStatsScan"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await scanPoshmarkStats();
    return true;
  }

  function parseOrderProfit() {
    const text = document.body?.innerText || "";
    const list = lines();
    const record = {
      platform: "Poshmark",
      computerLabel: "7",
      poshmarkAccountLabel: detectPoshmarkAccountLabel(),
      orderDate: "",
      orderNumber: "",
      itemTitle: "",
      soldPrice: null,
      poshmarkEarnings: null,
      sku: "",
      skus: [],
      asins: [],
      amazonCost: null,
      profit: null,
      margin: null,
      capturedAt: new Date().toISOString(),
      pageUrl: location.href
    };
    const orderDateIndex = list.findIndex((line) => labelMatches(line, "ORDER DATE"));
    if (orderDateIndex >= 0 && list[orderDateIndex + 1]) record.orderDate = list[orderDateIndex + 1];
    const orderNumberIndex = list.findIndex((line) => labelMatches(line, "ORDER NUMBER"));
    if (orderNumberIndex >= 0 && list[orderNumberIndex + 1]) record.orderNumber = list[orderNumberIndex + 1];
    const earningsMatch = text.match(/Your Earnings:\s*\$?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (earningsMatch) record.poshmarkEarnings = moneyToNumber(earningsMatch[1]);
    const skuMatch = text.match(/SKU:\s*([A-Za-z0-9+/=_-]+)/i);
    if (skuMatch) record.sku = skuMatch[1];
    record.skus = orderSkuValues(text);
    if (!record.sku && record.skus.length) record.sku = record.skus[0];
    record.asins = asinValuesFromSkus(record.skus);
    const priceMatch = text.match(/\$([0-9,]+(?:\.\d{1,2})?)\s+(?:Size:|SKU:)/i);
    if (priceMatch) record.soldPrice = moneyToNumber(priceMatch[1]);
    const skuIndex = list.findIndex((line) => /^SKU:/i.test(line));
    if (skuIndex >= 0) {
      for (let index = skuIndex - 1; index >= Math.max(0, skuIndex - 8); index -= 1) {
        if (isPoshmarkItemTitleCandidate(list[index])) {
          record.itemTitle = list[index];
          break;
        }
      }
    }
    if (!record.itemTitle && orderNumberIndex >= 0) {
      for (let index = orderNumberIndex + 1; index < Math.min(list.length, orderNumberIndex + 8); index += 1) {
        if (isPoshmarkItemTitleCandidate(list[index])) {
          record.itemTitle = list[index];
          break;
        }
      }
    }
    if (!record.itemTitle) record.itemTitle = list.find(isPoshmarkItemTitleCandidate) || "";
    return record;
  }

  function buildPendingAmazonMatchContext(order) {
    return {
      platform: "Poshmark",
      orderNumber: order.orderNumber,
      itemTitle: order.itemTitle,
      sku: order.sku,
      skus: order.skus || [],
      asins: order.asins || [],
      poshmarkEarnings: order.poshmarkEarnings,
      pageUrl: location.href,
      startedAt: new Date().toISOString()
    };
  }

  function amazonPayloadMatchesOrder(payload, order) {
    return Boolean(AUDIT?.validateAmazonPayloadForOrder(payload, order, {
      now: Date.now(),
      ttlMs: AMAZON_MATCH_TTL_MS
    }).ok);
  }

  async function readAmazonPayloadForProfit(order) {
    const text = await navigator.clipboard.readText().catch(() => "");
    const candidates = [];
    if (text.startsWith(U.PAYLOAD_PREFIX)) {
      try {
        const payload = JSON.parse(text.slice(U.PAYLOAD_PREFIX.length));
        if (payload?.source === "amazon") candidates.push(payload);
      } catch (_) {}
    }
    const stored = await storageGet(["lastCopiedAmazonPayload", "pendingAmazonCheckout", "poshmarkAmazonPayloadByOrder"]);
    const keyed = stored.poshmarkAmazonPayloadByOrder || {};
    const orderKey = String(order.orderNumber || "");
    if (orderKey && keyed[orderKey]) candidates.push(keyed[orderKey]);
    if (stored.lastCopiedAmazonPayload) candidates.push(stored.lastCopiedAmazonPayload);
    if (stored.pendingAmazonCheckout) candidates.push(stored.pendingAmazonCheckout);
    return candidates.find((payload) => amazonPayloadMatchesOrder(payload, order)) || null;
  }

  function showAmazonMatchNeeded(order, reason = "") {
    document.getElementById("gldn-posh-amazon-needed")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-posh-amazon-needed";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    const firstAsin = (order.asins || [])[0] || "";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Match Amazon Order First</h2>
        <p class="gldn-help-text">The old Amazon price was ignored. This order must be matched from the decoded EcomSniper SKU ASIN.</p>
        <div class="gldn-existing">
          <div class="gldn-row"><span>Poshmark order</span><strong>${escapeHtml(order.orderNumber || "Not captured")}</strong></div>
          <div class="gldn-row"><span>Item</span><strong>${escapeHtml(order.itemTitle || "Not captured")}</strong></div>
          <div class="gldn-row"><span>Poshmark earnings</span><strong>${escapeHtml(order.poshmarkEarnings == null ? "Not captured" : `$${order.poshmarkEarnings.toFixed(2)}`)}</strong></div>
          <div class="gldn-row"><span>Decoded SKU ASINs</span><strong>${escapeHtml((order.asins || []).join(", ") || "Not captured")}</strong></div>
          <div class="gldn-row"><span>Next step</span><strong>Open Amazon Orders for this ASIN, open the matching Amazon order, click Review & Copy Amazon Info, then return here.</strong></div>
          ${reason ? `<div class="gldn-row"><span>Reason</span><strong>${escapeHtml(reason)}</strong></div>` : ""}
        </div>
        <div class="gldn-actions">
          ${firstAsin ? `<button type="button" class="gldn-primary" data-action="open-amazon-orders">Open Amazon Orders for ${escapeHtml(firstAsin)}</button>` : ""}
          <button type="button" class="gldn-secondary" data-action="close">Close</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnPoshAmazonNeededModalPosition");
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='close']").addEventListener("click", close);
    overlay.querySelector("[data-action='open-amazon-orders']")?.addEventListener("click", async () => {
      const status = overlay.querySelector(".gldn-modal-status");
      status.textContent = `Opening Amazon Orders search for ${firstAsin}...`;
      const response = await runtimeMessage({ type: "openAmazonOrderSearch", asin: firstAsin });
      if (response?.ok) {
        renderStatus(`Opened Amazon Orders search for ${firstAsin}.`, "ready");
        status.textContent = "Amazon Orders search opened. Open the matching order and copy Amazon info.";
      } else {
        const error = response?.error || "Could not open Amazon Orders search.";
        renderStatus(error, "error");
        status.textContent = error;
      }
    });
    return null;
  }

  async function buildPoshmarkProfitRecord(order, amazonPayload) {
    const poshComputer = await savedPoshmarkComputerLabel();
    if (!poshComputer.ok) throw new Error(poshComputer.error);
    const audit = AUDIT.validateAmazonPayloadForOrder(amazonPayload, order, {
      now: Date.now(),
      ttlMs: AMAZON_MATCH_TTL_MS
    });
    if (!audit.ok) throw new Error(audit.error);
    const amazonTotal = audit.total;
    const earnings = order.poshmarkEarnings == null ? null : Number(order.poshmarkEarnings);
    const profit = Number.isFinite(earnings) && Number.isFinite(amazonTotal) ? earnings - amazonTotal : null;
    const supplierAudit = AUDIT.supplierAuditFields(audit.items);
    return {
      platform: "Poshmark",
      computerLabel: poshComputer.computerLabel,
      accountLabel: order.poshmarkAccountLabel || "",
      poshmarkAccountLabel: order.poshmarkAccountLabel || "",
      orderNumber: order.orderNumber,
      itemTitle: order.itemTitle,
      marketplaceEarnings: Number.isFinite(earnings) ? earnings : null,
      marketplaceSoldPrice: order.soldPrice,
      supplier: "Amazon",
      supplierTotal: Number.isFinite(amazonTotal) ? amazonTotal : null,
      supplierProfile: amazonPayload?.profileLabel || "",
      eta: Array.isArray(amazonPayload?.etas) ? amazonPayload.etas.join(", ") : "",
      profit,
      margin: profit !== null && earnings > 0 ? profit / earnings : null,
      sku: order.sku,
      ...supplierAudit,
      source: "poshmark-order-profit",
      capturedAt: new Date().toISOString(),
      pageUrl: location.href
    };
  }

  function showProfitPreview(order, amazonPayload, record) {
    document.getElementById("gldn-posh-profit-preview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-posh-profit-preview";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    const money = (value) => value == null || Number.isNaN(Number(value)) ? "Not captured" : Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
    const rows = [
      ["Order", record.orderNumber || "Not captured"],
      ["Item", record.itemTitle || "Not captured"],
      ["Poshmark earnings", money(record.marketplaceEarnings)],
      ["Amazon total", money(record.supplierTotal)],
      ["Amazon profile", record.supplierProfile || "Not captured"],
      ["Amazon order", record.supplierOrderNumber || "Not captured"],
      ["Exact Amazon ASINs", record.supplierItemIds || "Not captured"],
      ["Match source", record.supplierMatchSource || "Not captured"],
      ["ETA", record.eta || "Not captured"],
      ["Profit", money(record.profit)],
      ["Margin", record.margin == null ? "Not captured" : `${Math.round(record.margin * 1000) / 10}%`],
      ["SKU", record.sku || "Not captured"],
      ["Decoded SKU ASINs", (order.asins || []).join(", ") || "Not captured"]
    ];
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Review Poshmark Profit</h2>
        <p class="gldn-help-text">This uses the current Poshmark sale and Amazon info copied specifically for this Poshmark order.</p>
        <div class="gldn-existing">
          ${rows.map(([label, value]) => `<div class="gldn-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save">Save Profit</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnPoshProfitModalPosition");
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    overlay.querySelector("[data-action='save']").addEventListener("click", async () => {
      const status = overlay.querySelector(".gldn-modal-status");
      status.textContent = "Saving profit...";
      await storageSet({ latestMarketplaceProfit: record, latestPoshmarkOrderProfit: { order, amazonPayload, record } });
      const response = await runtimeMessage({ type: "syncMarketplaceProfit", record });
      if (response?.ok) {
        status.textContent = "Profit synced.";
        renderStatus("Poshmark profit synced.", "completed");
        setTimeout(close, 900);
      } else if (response?.queued) {
        status.textContent = "Profit saved. Dashboard sync is continuing in the background.";
        renderStatus("Poshmark profit saved - dashboard sync queued.", "ready");
        setTimeout(close, 1200);
      } else {
        status.textContent = response?.error || "Dashboard sync failed.";
        renderStatus(`Profit saved locally - sync failed: ${response?.error || "unknown error"}`, "error");
      }
    });
  }

  async function saveVisibleSalesReview(overlay, records) {
    if (!overlay?.isConnected) throw new Error("The visible-sales review is no longer open.");
    const status = overlay.querySelector(".gldn-modal-status");
    const saveButton = overlay.querySelector("[data-action='save']");
    const cancelButton = overlay.querySelector("[data-action='cancel']");
    if (!status || !saveButton || !cancelButton) throw new Error("The visible-sales review controls are incomplete.");
    if (visibleSalesReviewState?.saving) throw new Error("This visible-sales review is already saving.");
    visibleSalesReviewState.saving = true;
    saveButton.disabled = true;
    cancelButton.disabled = true;
    overlay.querySelector(".gldn-modal")?.setAttribute("aria-busy", "true");
    saveButton.textContent = `Saving ${records.length}...`;
    status.textContent = `Saving ${records.length} visible sale rows in one dashboard batch...`;
    const response = await runtimeMessage({ type: "syncMarketplaceProfits", records });
    const syncedCount = response?.ok ? Number(response?.data?.count || records.length) : 0;
    const queuedCount = response?.queued ? records.length : 0;
    const handledCount = syncedCount + queuedCount;
    const lastError = response?.error || "";
    const result = { records, savedAt: new Date().toISOString(), syncedCount, queuedCount, handledCount, lastError };
    await storageSet({ latestPoshmarkVisibleSales: result });
    if (handledCount === records.length) {
      status.textContent = queuedCount
        ? `Saved ${syncedCount}; ${queuedCount} queued for dashboard sync.`
        : `Saved ${syncedCount} visible sale rows.`;
      renderStatus(queuedCount
        ? `Saved ${handledCount} visible Poshmark rows; ${queuedCount} dashboard syncs queued.`
        : `Saved ${syncedCount} visible Poshmark sale rows.`, "completed");
      visibleSalesReviewState = null;
      setTimeout(() => overlay.remove(), 1000);
      return { ok: true, ...result };
    }
    status.textContent = `Saved or queued ${handledCount}/${records.length}. ${lastError}`;
    renderStatus(`Visible sales partial sync: ${handledCount}/${records.length}.`, "error");
    visibleSalesReviewState.saving = false;
    saveButton.disabled = false;
    cancelButton.disabled = false;
    saveButton.textContent = "Retry Save";
    overlay.querySelector(".gldn-modal")?.removeAttribute("aria-busy");
    return { ok: false, ...result, error: lastError || `Only ${handledCount}/${records.length} rows were handled.` };
  }

  async function approveVisibleSalesReview(confirmationToken) {
    const overlay = document.getElementById("gldn-posh-sales-preview");
    const records = visibleSalesReviewState?.records;
    if (!overlay || !Array.isArray(records) || !records.length) {
      throw new Error("No visible-sales review is open.");
    }
    const expectedToken = `APPROVE SAVE VISIBLE SALES ${records.length}`;
    if (String(confirmationToken || "").trim() !== expectedToken) {
      throw new Error(`Visible-sales save requires the exact token ${expectedToken}.`);
    }
    return saveVisibleSalesReview(overlay, records);
  }

  function showVisibleSalesPreview(records) {
    document.getElementById("gldn-posh-sales-preview")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-posh-sales-preview";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    const rows = records.slice(0, 30).map((record) => [
      record.orderNumber || "No order",
      record.itemTitle || "No title",
      record.marketplaceEarnings == null ? "Earnings missing" : `$${Number(record.marketplaceEarnings).toFixed(2)}`,
      [record.orderDate, record.orderStatus, record.earningsStatus].filter(Boolean).join(" | ")
    ]);
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Review Visible Poshmark Sales</h2>
        <p class="gldn-help-text">This logs visible sale orders as Poshmark profit rows. Amazon total stays blank until captured from the matching Amazon order.</p>
        <div class="gldn-sales-summary"><strong>${records.length}</strong> visible sale${records.length === 1 ? "" : "s"} ready to save</div>
        <div class="gldn-sales-list">
          ${rows.map(([order, title, earnings, detail]) => `
            <div class="gldn-sales-row">
              <div class="gldn-sales-main">
                <span class="gldn-sales-order">${escapeHtml(order)}</span>
                <strong class="gldn-sales-title">${escapeHtml(title)}</strong>
                ${detail ? `<small class="gldn-sales-detail">${escapeHtml(detail)}</small>` : ""}
              </div>
              <strong class="gldn-sales-earnings">${escapeHtml(earnings)}</strong>
            </div>`).join("")}
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save">Save Visible Sales</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>`;
    document.documentElement.appendChild(overlay);
    visibleSalesReviewState = { records, saving: false, openedAt: new Date().toISOString() };
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnPoshSalesModalPosition");
    const close = () => {
      if (document.getElementById("gldn-posh-sales-preview") === overlay) visibleSalesReviewState = null;
      overlay.remove();
    };
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    overlay.querySelector("[data-action='save']").addEventListener("click", () => {
      saveVisibleSalesReview(overlay, records).catch((error) => {
        visibleSalesReviewState.saving = false;
        renderStatus(error?.message || String(error), "error");
      });
    });
  }

  async function captureVisibleSales() {
    const poshComputer = await savedPoshmarkComputerLabel();
    if (!poshComputer.ok) {
      renderStatus(poshComputer.error, "error");
      return;
    }
    if (!/\/order\/sales/i.test(location.href)) {
      renderStatus("Opening Poshmark sales...", "ready");
      location.assign(SALES_URL);
      return;
    }
    const accountLabel = detectPoshmarkAccountLabel();
    const records = visibleSaleSummaries().map((record) => ({
      platform: "Poshmark",
      computerLabel: poshComputer.computerLabel,
      accountLabel,
      poshmarkAccountLabel: accountLabel,
      orderNumber: record.orderNumber,
      itemTitle: record.itemTitle,
      orderDate: record.orderDate,
      orderStatus: record.orderStatus,
      earningsStatus: record.earningsStatus,
      marketplaceEarnings: record.marketplaceEarnings,
      marketplaceSoldPrice: record.marketplaceSoldPrice,
      supplier: "Amazon",
      supplierTotal: null,
      supplierProfile: "",
      eta: "",
      profit: null,
      margin: null,
      sku: "",
      asins: record.asins || [],
      source: "poshmark-visible-sales",
      capturedAt: new Date().toISOString(),
      pageUrl: record.pageUrl
    }));
    if (!records.length) {
      renderStatus("No visible Poshmark sale orders were found on this page.", "error");
      return;
    }
    showVisibleSalesPreview(records);
    renderStatus(`Review ${records.length} visible sale rows before saving.`, "ready");
  }

  async function scanOrderProfit() {
    const poshComputer = await savedPoshmarkComputerLabel();
    if (!poshComputer.ok) {
      renderStatus(poshComputer.error, "error");
      return;
    }
    if (!/\/order\/sales\//i.test(location.href)) {
      renderStatus("Open a Poshmark sale order page first, then run Capture Order Profit.", "error");
      return;
    }
    const record = parseOrderProfit();
    const earnings = record.poshmarkEarnings == null ? "not captured" : `$${record.poshmarkEarnings.toFixed(2)}`;
    if (!record.asins?.length) {
      renderStatus("Could not decode Poshmark SKU to Amazon ASIN.", "error");
      showAmazonMatchNeeded(record, "The SKU on this Poshmark order did not decode into an Amazon ASIN.");
      return;
    }
    const amazonPayload = await readAmazonPayloadForProfit(record);
    if (!amazonPayload || amazonPayload.total == null) {
      await storageSet({ pendingPoshmarkProfitContext: buildPendingAmazonMatchContext(record) });
      renderStatus("Waiting for matching Amazon order info.", "error");
      showAmazonMatchNeeded(record, `Captured Poshmark earnings: ${earnings}. Matching Amazon info has not been copied for this exact order.`);
      return;
    }
    const profitRecord = await buildPoshmarkProfitRecord(record, amazonPayload);
    renderStatus(`Review Poshmark profit: ${profitRecord.profit == null ? "not captured" : `$${profitRecord.profit.toFixed(2)}`}.`, "ready");
    showProfitPreview(record, amazonPayload, profitRecord);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function historicalSalesPageSizeControl() {
    const candidates = [...document.querySelectorAll("[data-test='dropdown'], .dropdown, .dropdown__selector, button, [role='button']")]
      .filter((element) => U.isVisible(element))
      .filter((element) => /^show\s+\d+$/i.test(String(element.innerText || element.textContent || "").trim()));
    return candidates.find((element) => element.matches("[data-test='dropdown'], .dropdown")) || candidates[0] || null;
  }

  function historicalSalesPageSize() {
    const text = String(historicalSalesPageSizeControl()?.innerText || historicalSalesPageSizeControl()?.textContent || "");
    const match = text.match(/show\s+(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  async function ensureHistoricalSalesPageSize() {
    const nativeSelect = [...document.querySelectorAll("select")].find((select) =>
      [...select.options].some((option) => /^(?:show\s*)?100$/i.test(String(option.textContent || option.value || "").trim())));
    if (nativeSelect) {
      const option = [...nativeSelect.options].find((item) => /^(?:show\s*)?100$/i.test(String(item.textContent || item.value || "").trim()));
      if (option && nativeSelect.value !== option.value) {
        nativeSelect.value = option.value;
        nativeSelect.dispatchEvent(new Event("input", { bubbles: true }));
        nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await delay(1800);
        return true;
      }
      return false;
    }

    const showButton = historicalSalesPageSizeControl();
    if (!showButton || /show\s+100/i.test(showButton.innerText || showButton.textContent || "")) return false;
    showButton.scrollIntoView({ block: "center", inline: "nearest" });
    showButton.click();
    const optionDeadline = Date.now() + 3000;
    let hundred = null;
    do {
      const exactTextCandidates = [...showButton.querySelectorAll("[data-test='dropdown_menu_list'] .dropdown__link, .dropdown__menu .dropdown__link, [role='option'], [role='menuitem']")]
        .filter((element) => /^(?:show\s*)?100$/i.test(String(element.innerText || element.textContent || "").trim()));
      hundred = exactTextCandidates.find((element) =>
        U.isVisible(element) && element.matches("button, a, li, [role='option'], [role='menuitem'], .dropdown__link, .dropdown__item, .dropdown__option"))
        || exactTextCandidates.find((element) =>
          element.matches("button, a, li, [role='option'], [role='menuitem'], .dropdown__link, .dropdown__item, .dropdown__option"))
        || exactTextCandidates.find((element) => ![...element.children].some((child) =>
          /^(?:show\s*)?100$/i.test(String(child.innerText || child.textContent || "").trim())))
        || exactTextCandidates[0]
        || null;
      if (hundred) break;
      await delay(100);
    } while (Date.now() < optionDeadline);
    if (!hundred) return false;
    hundred.click();
    const selectionDeadline = Date.now() + 5000;
    while (historicalSalesPageSize() !== 100 && Date.now() < selectionDeadline) await delay(100);
    if (historicalSalesPageSize() !== 100) return false;
    return true;
  }

  function poshmarkNextSalesControl() {
    const tablePagination = [...document.querySelectorAll(".my-sales-desktop-table__pagination-btn")]
      .filter((element) => U.isVisible(element));
    if (tablePagination.length >= 2) return tablePagination[tablePagination.length - 1];
    const explicit = [...document.querySelectorAll("button, a, [role='button']")]
      .filter((element) => U.isVisible(element))
      .find((element) => /next/i.test([
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.innerText,
        element.textContent
      ].filter(Boolean).join(" ")));
    if (explicit) return explicit;
    const controls = [...document.querySelectorAll("button, a[role='button']")]
      .filter((element) => U.isVisible(element))
      .filter((element) => !element.closest("[id^='gldn-'], .gldn-order-panel"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width <= 80 && rect.height <= 80 && rect.top + scrollY > document.documentElement.scrollHeight * 0.65;
      });
    return controls.length >= 2 ? controls[controls.length - 1] : null;
  }

  function controlIsDisabled(control) {
    return !control || control.disabled || control.getAttribute("aria-disabled") === "true" || /disabled/i.test(control.className || "");
  }

  async function waitForHistoricalSalesRecords(timeoutMs = 30000, options = {}) {
    const deadline = Date.now() + Math.max(1000, Number(timeoutMs || 0));
    let lastFingerprint = "";
    let stablePolls = 0;
    do {
      const records = visibleSaleSummaries();
      const fingerprint = records.map((record) => record.orderNumber).sort().join("|");
      stablePolls = fingerprint && fingerprint === lastFingerprint ? stablePolls + 1 : 0;
      lastFingerprint = fingerprint;
      const next = poshmarkNextSalesControl();
      const requestedMinimum = Math.max(0, Number(options.minimumCount || 0));
      const expectedCount = requestedMinimum || historicalSalesPageSize() || 20;
      if (records.length >= expectedCount) return records;
      if (records.length && controlIsDisabled(next) && stablePolls >= 3) return records;
      await delay(500);
    } while (Date.now() < deadline);
    throw new Error(`Poshmark sales rows did not finish loading (found ${visibleSaleSummaries().length}, expected ${historicalSalesPageSize() || 20}). The saved checkpoint was not advanced.`);
  }

  async function reportHistoricalSalesPage() {
    await waitForHistoricalSalesRecords();
    const pageSizeChanged = await ensureHistoricalSalesPageSize();
    const records = await waitForHistoricalSalesRecords(pageSizeChanged ? 45000 : 30000, {
      minimumCount: pageSizeChanged ? 100 : 0
    });
    lastBackfillSalesFingerprint = records.map((record) => record.orderNumber).sort().join("|");
    const next = poshmarkNextSalesControl();
    const response = await runtimeMessage({
      type: "poshmarkBackfillSalesPage",
      payload: {
        records,
        hasNext: Boolean(next && !controlIsDisabled(next)),
        pageUrl: location.href
      }
    });
    if (!response?.ok) {
      if (!response?.ignored) throw new Error(response?.error || "Historical sales indexing stopped.");
      return;
    }
    renderStatus(`Historical profit: ${response.summary.salesIndexed} sales indexed across ${response.summary.pagesScanned} page(s).`, "ready");
    if (response.instruction === "retry-current-page") {
      renderStatus("Waiting for Poshmark sales rows before advancing the saved checkpoint...", "ready");
      await delay(Math.max(1000, Number(response.retryAfterMs || 1500)));
      return reportHistoricalSalesPage();
    }
    if (response.instruction === "paused-empty-page") {
      renderStatus(response.state?.pausedReason || "Historical profit paused because Poshmark sales rows did not load.", "error");
      return;
    }
    if (response.instruction === "paused-empty-month") {
      renderStatus(response.state?.pausedReason || "Historical profit paused because no target-month sales were verified.", "error");
      return;
    }
    if (response.instruction === "next-page") {
      if (!next || controlIsDisabled(next)) {
        renderStatus("Poshmark did not expose an enabled Next control. The checkpoint was preserved.", "error");
        return;
      }
      next.click();
    }
  }

  function backfillResultRows(run, requestedPage = 0) {
    const results = Array.isArray(run.results) ? run.results : [];
    const salesByOrder = new Map((run.sales || []).map((sale) => [sale.orderNumber, sale]));
    const totalPages = Math.max(1, Math.ceil(results.length / BACKFILL_REVIEW_PAGE_SIZE));
    const page = Math.max(0, Math.min(Number(requestedPage) || 0, totalPages - 1));
    const start = page * BACKFILL_REVIEW_PAGE_SIZE;
    const end = Math.min(results.length, start + BACKFILL_REVIEW_PAGE_SIZE);
    const html = results.slice(start, end).map((result) => {
      const sale = salesByOrder.get(result.orderNumber) || {};
      const record = result.record || {};
      return `
        <div class="gldn-sales-row" data-status="${escapeHtml(result.status)}">
          <div class="gldn-sales-main">
            <span class="gldn-sales-order">${escapeHtml(result.orderNumber)}</span>
            <strong class="gldn-sales-title">${escapeHtml(sale.itemTitle || "Item title unavailable")}</strong>
            <small class="gldn-sales-detail">${escapeHtml(result.status === "exact"
              ? `${currencyDisplay(record.marketplaceEarnings)} earnings - ${currencyDisplay(record.supplierTotal)} Amazon - order ${record.supplierOrderNumber || "not captured"} - ASIN ${record.supplierItemIds || "not captured"}`
              : result.reason || result.status)}</small>
          </div>
          <strong class="gldn-sales-earnings">${escapeHtml(result.status === "exact" ? currencyDisplay(record.profit) : "REVIEW")}</strong>
        </div>`;
    }).join("");
    return { html, page, totalPages, start, end, total: results.length };
  }

  function showHistoricalProfitBackfillReview(run) {
    document.getElementById("gldn-posh-backfill-launcher")?.remove();
    document.getElementById("gldn-posh-backfill-preview")?.remove();
    const summary = window.GLDN_PROFIT_BACKFILL.summary(run);
    const remaining = Number(summary.pending || 0);
    const monthly = run.scope === "month";
    const resolvingCosts = run.scope === "resolve-missing";
    const primaryLabel = monthly
      ? `Save ${summary.monthLabel || run.monthKey} Rows`
      : resolvingCosts
      ? "Save Cost Resolution Results"
      : "Sync Exact Profits";
    const reviewStatus = run.phase === "completed"
      ? run.syncDelivery === "queued"
        ? "Every reviewed row is secured in the dashboard retry queue."
        : "Every reviewed row was saved to the shared dashboard."
      : "No spreadsheet changes have been made by this review.";
    restoredBackfillReviewRunId = String(run.runId || `${run.scope || "historical"}:${run.monthKey || "all"}`);
    let resultPage = backfillResultRows(run, 0);
    const overlay = document.createElement("div");
    overlay.id = "gldn-posh-backfill-preview";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal gldn-backfill-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Review ${monthly ? `${escapeHtml(summary.monthLabel || run.monthKey)} Poshmark Profits` : "Historical Poshmark Profits"}</h2>
        <p class="gldn-help-text">Read-only collection is complete. Exact one-use Amazon allocations include cost and profit. Missing or ambiguous Amazon costs stay visibly queued for another signed-in Amazon profile; no zeroes are invented.</p>
        <div class="gldn-grid gldn-backfill-summary">
          <div><strong>Sales indexed</strong><span>${countDisplay(summary.salesIndexed)}</span></div>
          <div><strong>Details captured</strong><span>${countDisplay(summary.detailsCaptured)}</span></div>
          <div><strong>Exact profits</strong><span>${countDisplay(summary.exact)}</span></div>
          <div><strong>Needs review</strong><span>${countDisplay(summary.needsReview)}</span></div>
          <div><strong>Missing SKU</strong><span>${countDisplay(summary.missingSku)}</span></div>
          <div><strong>Amazon not found</strong><span>${countDisplay(summary.amazonNotFound)}</span></div>
          <div><strong>Exact profit total</strong><span>${currencyDisplay(summary.exactProfit)}</span></div>
          <div><strong>Already synced</strong><span>${countDisplay(summary.synced)}</span></div>
          ${monthly ? `<div><strong>Month</strong><span>${escapeHtml(summary.monthLabel || run.monthKey)}</span></div>` : ""}
        </div>
        <div class="gldn-sales-list">${resultPage.html || "<div class='gldn-help-text'>No result rows were produced.</div>"}</div>
        <div class="gldn-review-pagination" ${resultPage.total <= BACKFILL_REVIEW_PAGE_SIZE ? "hidden" : ""}>
          <button type="button" class="gldn-secondary" data-action="previous-results" disabled>Previous</button>
          <span data-role="result-page">Rows ${countDisplay(resultPage.start + 1)}-${countDisplay(resultPage.end)} of ${countDisplay(resultPage.total)} - page ${countDisplay(resultPage.page + 1)} of ${countDisplay(resultPage.totalPages)}</span>
          <button type="button" class="gldn-secondary" data-action="next-results" ${resultPage.totalPages <= 1 ? "disabled" : ""}>Next</button>
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="close">Close</button>
          <button type="button" class="gldn-primary" data-action="sync" ${remaining <= 0 ? "disabled" : ""}>${escapeHtml(primaryLabel)}</button>
        </div>
        <div class="gldn-modal-status">${escapeHtml(reviewStatus)}</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnPoshBackfillModalPosition");
    const renderResultPage = (requestedPage) => {
      resultPage = backfillResultRows(run, requestedPage);
      const list = overlay.querySelector(".gldn-sales-list");
      const label = overlay.querySelector("[data-role='result-page']");
      const previous = overlay.querySelector("[data-action='previous-results']");
      const next = overlay.querySelector("[data-action='next-results']");
      list.innerHTML = resultPage.html || "<div class='gldn-help-text'>No result rows were produced.</div>";
      label.textContent = `Rows ${countDisplay(resultPage.start + 1)}-${countDisplay(resultPage.end)} of ${countDisplay(resultPage.total)} - page ${countDisplay(resultPage.page + 1)} of ${countDisplay(resultPage.totalPages)}`;
      previous.disabled = resultPage.page <= 0;
      next.disabled = resultPage.page >= resultPage.totalPages - 1;
      list.scrollTop = 0;
    };
    overlay.querySelector("[data-action='previous-results']")?.addEventListener("click", () => renderResultPage(resultPage.page - 1));
    overlay.querySelector("[data-action='next-results']")?.addEventListener("click", () => renderResultPage(resultPage.page + 1));
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='close']").addEventListener("click", close);
    overlay.querySelector("[data-action='sync']")?.addEventListener("click", async () => {
      const syncButton = overlay.querySelector("[data-action='sync']");
      const status = overlay.querySelector(".gldn-modal-status");
      if (syncButton.dataset.confirmSync !== "true") {
        syncButton.dataset.confirmSync = "true";
        syncButton.textContent = `Confirm ${remaining} Row${remaining === 1 ? "" : "s"}`;
        status.textContent = monthly
          ? `Approval required: save these ${remaining} reviewed ${summary.monthLabel || run.monthKey} rows. Missing Amazon costs remain open in the shared queue.`
          : resolvingCosts
          ? `Approval required: apply these ${remaining} Amazon-cost lookup results to the shared queue and resolved profit rows.`
          : `Approval required: sync only these ${remaining} exact row${remaining === 1 ? "" : "s"} to Profit - 7 and Marketplace Profit History.`;
        return;
      }
      syncButton.disabled = true;
      status.textContent = `Saving ${remaining} reviewed row(s) in durable batches...`;
      const confirm = monthly
        ? `APPROVE SYNC POSHMARK ${run.monthKey} ${remaining}`
        : resolvingCosts
        ? `APPROVE RESOLVE POSHMARK COSTS ${remaining}`
        : "SYNC_EXACT_POSHMARK_PROFITS";
      const response = await runtimeMessage({ type: "syncPoshmarkProfitBackfill", confirm }, 360000);
      if (!response?.ok) {
        syncButton.disabled = false;
        syncButton.dataset.confirmSync = "";
        syncButton.textContent = primaryLabel;
        status.textContent = response?.error || `Only ${response?.count || 0}/${response?.requested || remaining} rows were handled.`;
        return;
      }
      const completionMessage = response.queued
        ? `${response.count} reviewed rows saved to the retry queue.`
        : monthly
        ? `${response.count} ${summary.monthLabel || run.monthKey} rows saved: ${response.exact || 0} exact and ${response.unresolved || 0} awaiting another Amazon profile.`
        : resolvingCosts
        ? `${response.exact || 0} Amazon costs resolved; ${response.unresolved || 0} rows remain open for another profile.`
        : `${response.count} exact rows synced to Profit - 7 and Marketplace Profit History.`;
      if (response.state) {
        showHistoricalProfitBackfillReview(response.state);
        const refreshedStatus = document.querySelector("#gldn-posh-backfill-preview .gldn-modal-status");
        if (refreshedStatus) refreshedStatus.textContent = completionMessage;
      } else {
        status.textContent = completionMessage;
      }
      renderStatus(completionMessage, "completed");
    });
  }

  async function approveHistoricalProfitBackfill(confirmationToken) {
    const status = await runtimeMessage({ type: "getPoshmarkProfitBackfill" });
    const run = status?.state;
    if (!run || run.phase !== "review") throw new Error("No historical-profit review is open.");
    const summary = window.GLDN_PROFIT_BACKFILL.summary(run);
    const remaining = Number(summary.pending || 0);
    const expected = run.scope === "month"
      ? `APPROVE SYNC POSHMARK ${run.monthKey} ${remaining}`
      : run.scope === "resolve-missing"
      ? `APPROVE RESOLVE POSHMARK COSTS ${remaining}`
      : "SYNC_EXACT_POSHMARK_PROFITS";
    if (String(confirmationToken || "").trim() !== expected) {
      throw new Error(`Historical-profit approval requires the exact token ${expected}.`);
    }
    const response = await runtimeMessage({ type: "syncPoshmarkProfitBackfill", confirm: expected }, 360000);
    if (response?.state) showHistoricalProfitBackfillReview(response.state);
    return response;
  }

  async function startHistoricalProfitBackfill(scope = "pilot", monthKey = "") {
    restoredBackfillReviewRunId = "";
    const poshComputer = await savedPoshmarkComputerLabel();
    if (!poshComputer.ok) {
      renderStatus(poshComputer.error, "error");
      return;
    }
    const currentOrderNumber = location.pathname.match(/^\/order\/sales\/([a-f0-9]{24})\/?$/i)?.[1] || "";
    const response = await runtimeMessage({
      type: "startPoshmarkProfitBackfill",
      options: {
        scope,
        ...(scope === "month" ? { monthKey } : {}),
        ...(scope === "single" ? { seedSale: { orderNumber: currentOrderNumber, pageUrl: location.href, itemTitle: parseOrderProfit().itemTitle || "" } } : {})
      }
    });
    renderStatus(response?.ok
      ? `Historical profit ${scope} worker started in one background tab.`
      : response?.error || "Could not start historical-profit backfill.", response?.ok ? "ready" : "error");
    return response;
  }

  async function resumeHistoricalProfitBackfill() {
    const response = await runtimeMessage({ type: "resumePoshmarkProfitBackfill" });
    if (["review", "completed"].includes(response?.state?.phase)) showHistoricalProfitBackfillReview(response.state);
    renderStatus(response?.ok ? `Historical profit checkpoint: ${response.summary.phase}.` : response?.error || "No checkpoint found.", response?.ok ? "ready" : "error");
    return response;
  }

  async function showHistoricalProfitBackfillLauncher() {
    document.getElementById("gldn-posh-backfill-launcher")?.remove();
    const response = await runtimeMessage({ type: "getPoshmarkProfitBackfill" });
    const run = response?.state;
    const summary = response?.summary || {};
    const overlay = document.createElement("div");
    overlay.id = "gldn-posh-backfill-launcher";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    const currentOrderNumber = location.pathname.match(/^\/order\/sales\/([a-f0-9]{24})\/?$/i)?.[1] || "";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal gldn-backfill-launcher-modal" data-gldn-workflow-launcher="true">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Historical Poshmark Profit</h2>
        <p class="gldn-help-text">Index Poshmark sales and exact Amazon order-item costs in one resumable worker tab. Nothing is written to the shared dashboard until the separate review approval.</p>
        <label class="gldn-field">
          <span>Run scope</span>
          <select data-action="scope">
            ${currentOrderNumber ? `<option value="single">Current sale only - ${escapeHtml(currentOrderNumber)}</option>` : ""}
            <option value="month">One month</option>
            <option value="pilot">Pilot - 10 newest sales</option>
            <option value="incremental">New since last sync</option>
            <option value="last90">Last 90 days</option>
            <option value="all">All sales</option>
          </select>
        </label>
        <label class="gldn-field">
          <span>Month</span>
          <input type="month" data-action="month" value="${escapeHtml(run?.monthKey || "2026-04")}">
        </label>
        <div class="gldn-grid gldn-backfill-summary">
          <div><strong>Checkpoint</strong><span>${escapeHtml(summary.phase || "None")}</span></div>
          <div><strong>Sales indexed</strong><span>${countDisplay(summary.salesIndexed || 0)}</span></div>
          <div><strong>Details captured</strong><span>${countDisplay(summary.detailsCaptured || 0)}</span></div>
          <div><strong>Exact profits</strong><span>${countDisplay(summary.exact || 0)}</span></div>
        </div>
        <div class="gldn-actions gldn-backfill-launcher-actions">
          <button type="button" class="gldn-primary" data-action="start">Start New Run</button>
          <button type="button" class="gldn-secondary" data-action="resume" ${run ? "" : "disabled"}>Resume / Open Review</button>
          <button type="button" class="gldn-secondary" data-action="progress">Open Live Progress</button>
          <button type="button" class="gldn-secondary" data-action="pause" ${run?.active ? "" : "disabled"}>Pause at Checkpoint</button>
        </div>
        <div class="gldn-modal-status">${run ? `Saved checkpoint: ${escapeHtml(summary.phase || run.phase || "ready")}.` : "No historical-profit checkpoint is currently saved."}</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnPoshBackfillLauncherPosition");
    const status = overlay.querySelector(".gldn-modal-status");
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='start']").addEventListener("click", async () => {
      const scope = overlay.querySelector("[data-action='scope']").value;
      const monthKey = overlay.querySelector("[data-action='month']").value;
      status.textContent = `Starting ${scope} run...`;
      const result = await startHistoricalProfitBackfill(scope, monthKey);
      status.textContent = result?.ok ? "Worker started. This launcher can be closed." : result?.error || "The worker did not start.";
    });
    overlay.querySelector("[data-action='resume']").addEventListener("click", async () => {
      status.textContent = "Resuming saved checkpoint...";
      const result = await resumeHistoricalProfitBackfill();
      status.textContent = result?.ok ? `Checkpoint resumed: ${result.summary?.phase || "working"}.` : result?.error || "The checkpoint did not resume.";
    });
    overlay.querySelector("[data-action='progress']").addEventListener("click", async () => {
      const result = await runtimeMessage({ type: "openExtensionPage", page: "profit-progress.html", reuse: true });
      status.textContent = result?.ok ? "Live profit progress opened." : result?.error || "Live profit progress did not open.";
    });
    overlay.querySelector("[data-action='pause']").addEventListener("click", async () => {
      const result = await runtimeMessage({ type: "stopPoshmarkProfitBackfill" });
      status.textContent = result?.ok ? "Paused at the latest saved checkpoint." : result?.error || "The worker did not pause.";
      if (result?.ok) renderStatus("Historical profit paused at a safe checkpoint.", "ready");
    });
  }

  async function resumePoshmarkProfitBackfillWorker() {
    if (backfillResumeBusy) return false;
    backfillResumeBusy = true;
    let workerPhase = "unknown";
    try {
      const [status, tab] = await Promise.all([
        runtimeMessage({ type: "getPoshmarkProfitBackfill" }),
        runtimeMessage({ type: "currentTabInfo" })
      ]);
      const run = status?.state;
      if (!run || Number(run.workerTabId) !== Number(tab?.tabId)) return false;
      workerPhase = String(run.phase || "unknown");
      if (run.phase === "review") {
        const runId = String(run.runId || `${run.scope || "historical"}:${run.monthKey || "all"}`);
        if (!document.getElementById("gldn-posh-backfill-preview") && restoredBackfillReviewRunId !== runId) {
          showHistoricalProfitBackfillReview(run);
        }
        return true;
      }
      if (!run.active) return false;
      await delay(900);
      if (run.phase === "index-sales" && /^\/order\/sales\/?$/i.test(location.pathname)) {
        await reportHistoricalSalesPage();
        return true;
      }
      if (run.phase === "capture-posh-details" && /\/order\/sales\//i.test(location.href)) {
        const detail = parseOrderProfit();
        detail.accountLabel = detail.poshmarkAccountLabel;
        detail.marketplaceEarnings = detail.poshmarkEarnings;
        detail.marketplaceSoldPrice = detail.soldPrice;
        const response = await runtimeMessage({ type: "poshmarkBackfillOrderDetail", detail });
        if (!response?.ok && !response?.ignored) throw new Error(response?.error || "Could not checkpoint this Poshmark order.");
        return true;
      }
      return false;
    } catch (error) {
      if (invalidContextError(error)) {
        stopInvalidatedPoshmarkContext(error);
        return false;
      }
      U.recordExtensionLog?.({
        source: "poshmark-profit",
        operation: "historical-worker",
        level: "error",
        message: error?.message || String(error)
      });
      await runtimeMessage({
        type: "poshmarkBackfillWorkerError",
        error: {
          message: error?.message || String(error),
          url: location.href,
          phase: workerPhase
        }
      }, 45000).catch(() => {});
      renderStatus(`${error?.message || "Historical-profit worker stopped."} Resume will continue from the saved checkpoint.`, "error");
      return false;
    } finally {
      backfillResumeBusy = false;
    }
  }

  const poshmarkMessageListener = (message, sender, sendResponse) => {
    if (sender?.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "Message sender is not GLDN Ops." });
      return false;
    }
    if (message?.type === "runPoshmarkPageAction") {
      const actions = {
        "posh-stats": startPoshmarkStatsScan,
        "posh-profit": scanOrderProfit,
        "visible-sales": captureVisibleSales,
        "save-visible-sales-review": () => approveVisibleSalesReview(message.confirmationToken),
        "historical-profit": showHistoricalProfitBackfillLauncher,
        "start-historical-profit-month": () => startHistoricalProfitBackfill("month", message.monthKey),
        "resume-historical-profit": resumeHistoricalProfitBackfill,
        "approve-historical-profit-review": () => approveHistoricalProfitBackfill(message.confirmationToken)
      };
      const action = actions[String(message.action || "")];
      if (!action) {
        sendResponse({ ok: false, error: "Unknown Poshmark workflow action." });
        return false;
      }
      if (message.action === "save-visible-sales-review"
          || message.action === "start-historical-profit-month"
          || message.action === "resume-historical-profit"
          || message.action === "approve-historical-profit-review") {
        Promise.resolve(action()).then((result) => sendResponse(result)).catch((error) => {
          sendResponse({ ok: false, error: error?.message || String(error) });
        });
        return true;
      }
      sendResponse({ ok: true, accepted: true });
      setTimeout(() => {
        Promise.resolve(action()).catch((error) => {
          renderStatus(error?.message || String(error), "error");
        });
      }, 0);
      return false;
    }
    if (message?.type === "showPoshmarkBackfillReview" && message.state) {
      showHistoricalProfitBackfillReview(message.state);
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "poshmarkBackfillProgress" && message.summary) {
      renderStatus(`Historical profit: ${message.summary.phase}, ${message.summary.salesIndexed} sales, ${message.summary.exact} exact.`, "ready");
      sendResponse({ ok: true });
      return true;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(poshmarkMessageListener);
  U.registerExtensionCleanup?.(() => chrome.runtime.onMessage.removeListener(poshmarkMessageListener));

  async function refreshIdentity() {
    const result = await savedPoshmarkComputerLabel();
    const computer = result.computerLabel;
    const identity = panel?.querySelector(".gldn-panel-identity");
    if (identity) {
      const displayComputer = result.displayComputerLabel || computer;
      const suffix = result.ok
        ? (result.savedComputerLabel !== result.computerLabel ? " <em>Poshmark syncs as 7</em>" : "")
        : " <em>not Poshmark-enabled</em>";
      identity.innerHTML = `<span>Computer: <strong>${escapeHtml(displayComputer)}</strong>${suffix}</span><span>Platform: <strong>Poshmark</strong></span>`;
    }
    panel?.querySelectorAll("[data-requires-poshmark='true']").forEach((button) => {
      button.disabled = !result.ok;
      button.title = result.ok ? "" : result.error;
    });
    if (!result.ok) renderStatus(result.error, "error");
  }

  function createPanel() {
    if (document.getElementById("gldn-poshmark-panel")) return;
    panel = document.createElement("div");
    panel.id = "gldn-poshmark-panel";
    panel.className = "gldn-order-panel";
    panel.innerHTML = `
      <div class="gldn-panel-heading">
        <img class="gldn-logo-image" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="GLDN Ops">
        <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v${chrome.runtime.getManifest().version}</span></div>
        <div class="gldn-drag-grip" aria-hidden="true">::</div>
      </div>
      <div class="gldn-panel-identity"></div>
      <button type="button" data-action="posh-stats" data-requires-poshmark="true" class="gldn-secondary">Scan Posh Stats</button>
      <button type="button" data-action="posh-profit" data-requires-poshmark="true" class="gldn-primary">Capture Order Profit</button>
      <button type="button" data-action="visible-sales" data-requires-poshmark="true" class="gldn-secondary">Capture Visible Sales</button>
      <button type="button" data-action="profit-backfill" data-requires-poshmark="true" class="gldn-secondary">Historical Profit Backfill</button>
      <div class="gldn-task-controls">
        <button type="button" data-action="open-stats" class="gldn-dashboard">Open Stats</button>
        <button type="button" data-action="dashboard-setup" class="gldn-secondary">Setup</button>
        <button type="button" data-action="feature-health" class="gldn-secondary">Health Check</button>
        <button type="button" data-action="reload-extension" class="gldn-dev-reload">Update &amp; Reload</button>
        <button type="button" data-action="stop-task" class="gldn-stop-task">Stop Task</button>
        <button type="button" data-action="reset-task" class="gldn-secondary">Reset</button>
      </div>
      <div class="gldn-status">Poshmark tools ready.</div>
    `;
    document.documentElement.appendChild(panel);
    U.makePanelDraggable(panel, "gldnPoshmarkPanelPosition");
    statusElement = panel.querySelector(".gldn-status");
    panel.querySelector("[data-action='posh-stats']").addEventListener("click", startPoshmarkStatsScan);
    panel.querySelector("[data-action='posh-profit']").addEventListener("click", scanOrderProfit);
    panel.querySelector("[data-action='visible-sales']").addEventListener("click", captureVisibleSales);
    panel.querySelector("[data-action='profit-backfill']").addEventListener("click", showHistoricalProfitBackfillLauncher);
    panel.querySelector("[data-action='open-stats']").addEventListener("click", () => location.assign(CLOSET_STATS_URL));
    panel.querySelector("[data-action='dashboard-setup']").addEventListener("click", setupDashboardFromPanel);
    panel.querySelector("[data-action='feature-health']").addEventListener("click", runFeatureHealthFromPanel);
    panel.querySelector("[data-action='stop-task']").addEventListener("click", stopCurrentTask);
    panel.querySelector("[data-action='reset-task']").addEventListener("click", resetAutomation);
    panel.querySelector("[data-action='reload-extension']").addEventListener("click", async () => {
      const version = chrome.runtime.getManifest().version;
      renderStatus(`Checking for a verified update after v${version}...`, "ready");
      try {
        const response = await runtimeMessage({ type: "updateExtension", returnUrl: location.href, reloadWhenCurrent: true });
        if (!response?.ok) throw new Error(response?.error || "Verified update failed.");
        if (!response.updated) renderStatus(response.message || "GLDN Ops is already current.", "completed");
      } catch (error) {
        renderStatus(error.message || "Verified update failed.", "error");
        return;
      }
    });
    refreshIdentity();
  }

  createPanel();
  resumePendingPoshmarkStatsScan().catch((error) => {
    if (invalidContextError(error)) stopInvalidatedPoshmarkContext(error);
    else renderStatus(error?.message || "Poshmark stats resume stopped.", "error");
  });
  resumePoshmarkProfitBackfillWorker().catch((error) => renderStatus(error.message || "Historical-profit worker stopped.", "error"));
  backfillObserver = new MutationObserver(() => {
    clearTimeout(backfillMutationTimer);
    backfillMutationTimer = setTimeout(() => {
      if (!/^\/order\/sales\/?$/i.test(location.pathname)) return;
      if (restoredBackfillReviewRunId) return;
      const fingerprint = visibleSaleSummaries().map((record) => record.orderNumber).sort().join("|");
      if (!fingerprint || fingerprint === lastBackfillSalesFingerprint) return;
      resumePoshmarkProfitBackfillWorker().catch((error) => renderStatus(error.message || "Historical-profit worker stopped.", "error"));
    }, 1200);
  });
  backfillObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("gldn-extension-context-invalidated", () => {
    backfillObserver?.disconnect?.();
    clearTimeout(backfillMutationTimer);
    if (statusElement) {
      statusElement.textContent = "GLDN Ops was updated. Refresh this Poshmark tab.";
      statusElement.dataset.type = "error";
    }
  }, { once: true });
  U.registerExtensionCleanup?.(() => {
    backfillObserver?.disconnect?.();
    clearTimeout(backfillMutationTimer);
  });
})();
