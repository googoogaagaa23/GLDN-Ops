(() => {
  if (window.__GLDN_AMAZON_ORDER_ASSISTANT__) return;
  window.__GLDN_AMAZON_ORDER_ASSISTANT__ = true;

  const U = window.OrderNoteUtils;
  const AUDIT = window.GLDN_PROFIT_AUDIT;
  const SNIPING = window.GLDN_SNIPING_AUDIT;
  const SUBSCRIBE_SAVE = window.GLDN_SUBSCRIBE_SAVE;
  const FOUNDATION = window.GLDN_FOUNDATION;
  const ORDER_AUDIT = window.GLDN_ORDER_PLACEMENT_AUDIT;
  const EXTENSION_VERSION = chrome.runtime.getManifest().version;
  const SUBSCRIBE_SAVE_STATE_KEY = "pendingAmazonSubscribeSaveRun";
  const SUBSCRIBE_SAVE_RESULT_KEY = "lastAmazonSubscribeSaveResult";
  const SUBSCRIBE_SAVE_MANAGER_URL = "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions";
  const SUBSCRIBE_SAVE_ACTION_DELAY_MS = 1600;
  const VERSIONED_WORKFLOW_KEYS = new Set([
    ...FOUNDATION.workflowStateKeys,
    "pendingPoshmarkProfitContext",
    "pendingAmazonOrderDetailMatch",
    "pendingAmazonOrderSearchSubmission"
  ]);
  const runtimeMessage = U.runtimeMessage;
  let panel;
  let statusElement;
  let cachedSnapshot = null;
  let snipingReviewButtonElement;
  let statusHoldUntil = 0;
  let backfillWorkerBusy = false;
  let extensionContextInvalidated = false;
  let amazonObserver = null;
  let amazonAutoCacheInterval = 0;
  let amazonMutationTimer = 0;
  let subscribeSaveWorkerBusy = false;
  let orderAuditWorkerBusy = false;

  function stopInvalidatedAmazonContext(error) {
    if (extensionContextInvalidated) return;
    extensionContextInvalidated = true;
    amazonObserver?.disconnect?.();
    amazonObserver = null;
    clearInterval(amazonAutoCacheInterval);
    amazonAutoCacheInterval = 0;
    clearTimeout(amazonMutationTimer);
    amazonMutationTimer = 0;
    if (statusElement) {
      statusElement.textContent = "GLDN Ops was updated. Refresh this Amazon tab when you are ready.";
      statusElement.dataset.type = "error";
    }
    panel?.setAttribute?.("data-gldn-context-invalidated", "true");
    panel?.querySelectorAll?.("button, input, select, textarea").forEach((control) => { control.disabled = true; });
    U.markExtensionContextInvalidated?.(error);
  }

  function requireAmazonContext() {
    if (extensionContextInvalidated || !U.extensionContextAvailable?.()) {
      const error = new Error("Extension context invalidated. Refresh this Amazon tab.");
      stopInvalidatedAmazonContext(error);
      throw error;
    }
  }

  window.addEventListener("gldn-extension-context-invalidated", (event) => {
    stopInvalidatedAmazonContext(event.detail?.message || "Extension context invalidated.");
  });

  function amazonStorageError(error) {
    const normalized = error instanceof Error ? error : new Error(error?.message || String(error));
    if (U.isExtensionContextInvalidated?.(normalized)) stopInvalidatedAmazonContext(normalized);
    return normalized;
  }

  const storageGet = (keys) => new Promise((resolve, reject) => {
    try {
      requireAmazonContext();
      chrome.storage.local.get(keys, (result) => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) reject(amazonStorageError(error));
        else resolve(result);
      });
    } catch (error) {
      reject(amazonStorageError(error));
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
      requireAmazonContext();
      chrome.storage.local.set(payload, () => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) reject(amazonStorageError(error));
        else resolve();
      });
    } catch (error) {
      reject(amazonStorageError(error));
    }
  });
  const storageRemove = (keys) => new Promise((resolve, reject) => {
    try {
      requireAmazonContext();
      chrome.storage.local.remove(keys, () => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) reject(amazonStorageError(error));
        else resolve();
      });
    } catch (error) {
      reject(amazonStorageError(error));
    }
  });
  const MARKETPLACE_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;

  function directText(element) {
    return [...(element?.childNodes || [])]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function moneyValues(text) {
    return [...String(text || "").matchAll(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)]
      .map((match) => U.moneyToNumber(match[1]))
      .filter((value) => value !== null);
  }

  const INJECTED_PRICE_UI_RE = /\b(ecomsniper|snipe title|snipe-list|opti-list|basic-list|sell it for|similar item number|gldn ops)\b/i;

  function isInjectedToolUiNode(element) {
    let node = element;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const id = String(node.id || "");
      const className = String(node.className || "");
      if (/^(gldn-|ecomsniper|es-)/i.test(id) || /\b(gldn-|ecomsniper|es-)/i.test(className)) return true;
      const ownText = directText(node);
      if (INJECTED_PRICE_UI_RE.test(ownText)) return true;
    }
    return false;
  }

  function nodeMoneyValues(element) {
    if (!element || isInjectedToolUiNode(element)) return [];
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    if (INJECTED_PRICE_UI_RE.test(text)) return [];
    return moneyValues(text).filter((value) => value > 0 && value < 10000);
  }

  function extractAmazonTotal() {
    // Prefer the smallest DOM element that is specifically the Order total label,
    // then read the value from the same visual row/container.
    const candidates = [...document.querySelectorAll("span, div, td, th, p")]
      .filter(U.isVisible)
      .filter((element) => {
        const own = directText(element);
        const full = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        return /^order total\s*:?$/i.test(own) || /^order total\s*:?\s*\$[0-9]/i.test(full);
      });

    for (const label of candidates) {
      let node = label;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
        if (!/order total/i.test(text)) continue;
        const values = moneyValues(text);
        if (values.length) {
          // In a true Order Total row, the last currency value is the total.
          const value = values[values.length - 1];
          if (value > 0) return value;
        }
      }
    }

    // Strict line fallback: only use a value on the exact Order total line or
    // the immediately following line. Do not inspect nearby tax/shipping rows.
    const lines = U.getBodyLines();
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^order total\s*:?/i.test(lines[i])) continue;
      const same = moneyValues(lines[i]);
      if (same.length && same[same.length - 1] > 0) return same[same.length - 1];
      const next = moneyValues(lines[i + 1] || "");
      if (next.length && next[0] > 0) return next[0];
    }

    return null;
  }

  function extractAmazonTitles() {
    const candidates = [...document.querySelectorAll("a[href*='/dp/'], a[href*='/gp/product/']")]
      .map((anchor) => (anchor.innerText || anchor.textContent || "").trim())
      .filter((text) => text.length >= 12 && text.length <= 500);
    return [...new Set(candidates)].slice(0, 10);
  }

  function extractAmazonAsins() {
    const values = new Set();
    [...document.querySelectorAll("[data-asin]")].forEach((element) => {
      const asin = String(element.getAttribute("data-asin") || "").trim().toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(asin)) values.add(asin);
    });
    [...document.querySelectorAll("a[href*='/dp/'], a[href*='/gp/product/']")].forEach((anchor) => {
      const href = anchor.href || anchor.getAttribute("href") || "";
      const match = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
      if (match) values.add(match[1].toUpperCase());
    });
    return [...values];
  }

  function scopedTextLines(element) {
    return String(element?.innerText || element?.textContent || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function asinFromAmazonProductHref(href) {
    const match = String(href || "").match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
    return match ? match[1].toUpperCase() : "";
  }

  function parseAmazonOrderDetailSnapshot(snapshot) {
    snapshot = snapshot || {};
    const pageOrderId = String(snapshot.pageOrderId || "").trim();
    const cardOrderId = String(snapshot.cardOrderId || "").trim();
    if (!pageOrderId || !cardOrderId || pageOrderId !== cardOrderId) return null;

    const summaryLines = Array.isArray(snapshot.summaryLines) ? snapshot.summaryLines : [];
    let total = null;
    for (let index = 0; index < summaryLines.length; index += 1) {
      if (!/^grand total\s*:?/i.test(summaryLines[index])) continue;
      const sameLine = moneyValues(summaryLines[index]);
      if (sameLine.length) {
        total = sameLine[sameLine.length - 1];
        break;
      }
      const nextLine = moneyValues(summaryLines[index + 1] || "");
      if (nextLine.length) {
        total = nextLine[0];
        break;
      }
    }

    const productLinks = Array.isArray(snapshot.productLinks) ? snapshot.productLinks : [];
    const asins = [];
    const titles = [];
    productLinks.forEach((productLink) => {
      const asin = asinFromAmazonProductHref(productLink?.href || "");
      const title = String(productLink?.text || "").replace(/\s+/g, " ").trim();
      if (asin && !asins.includes(asin)) asins.push(asin);
      if (asin && title.length >= 12 && !titles.includes(title)) titles.push(title);
    });

    const statusLines = Array.isArray(snapshot.statusLines) ? snapshot.statusLines : [];
    const etas = [];
    statusLines.forEach((line) => {
      const eta = parseEtaLine(line);
      if (eta && !etas.includes(eta)) etas.push(eta);
    });

    return {
      total,
      etas,
      titles,
      asins,
      shippingBlock: String(snapshot.shippingBlock || "").trim(),
      orderId: pageOrderId,
      exactOrderDetails: true
    };
  }

  function findAmazonOrderDetailsCard(pageOrderId = orderIdFromUrl(location.href)) {
    const targetOrderId = String(pageOrderId || "").trim();
    if (!targetOrderId) return null;

    const exactCards = [...document.querySelectorAll("#orderDetails .a-cardui, .a-cardui")]
      .filter((element) => !isInjectedToolUiNode(element))
      .filter((element) => (element.innerText || element.textContent || "").includes(targetOrderId))
      .filter((element) => element.querySelector("#od-subtotals") || /Grand Total\s*:/i.test(element.innerText || element.textContent || ""));
    if (exactCards.length === 1) return exactCards[0];
    if (exactCards.length > 1) {
      return exactCards.sort((left, right) => scopedTextLines(left).join(" ").length - scopedTextLines(right).join(" ").length)[0];
    }

    const orderMarkers = [...document.querySelectorAll("span, div")]
      .filter((element) => !isInjectedToolUiNode(element))
      .filter((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim() === targetOrderId);
    const fallbackCards = [];
    orderMarkers.forEach((marker) => {
      let node = marker.parentElement;
      for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
        if (isInjectedToolUiNode(node)) continue;
        const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
        if (text.length > 20000) break;
        if (!text.includes(targetOrderId) || !/Grand Total\s*:/i.test(text)) continue;
        if (!node.querySelector("a[href*='/dp/'], a[href*='/gp/product/']")) continue;
        fallbackCards.push(node);
      }
    });
    return fallbackCards.sort((left, right) => scopedTextLines(left).join(" ").length - scopedTextLines(right).join(" ").length)[0] || null;
  }

  function extractAmazonOrderDetailShippingBlock(scope) {
    const lines = scopedTextLines(scope);
    const paymentIndex = lines.findIndex((line) => /^payment method\b/i.test(line));
    const orderIndex = lines.findIndex((line) => /\bOrder\s*#?\s*\d{3}-\d{7}-\d{7}\b/i.test(line));
    if (paymentIndex <= 0 || orderIndex < 0 || paymentIndex <= orderIndex) return "";
    return lines
      .slice(orderIndex + 1, paymentIndex)
      .filter((line) => !/^view invoice$/i.test(line))
      .slice(0, 6)
      .join(" | ");
  }

  function extractAmazonOrderDetailData() {
    const pageOrderId = orderIdFromUrl(location.href);
    const scope = findAmazonOrderDetailsCard(pageOrderId);
    if (!scope) return null;

    const scopeText = (scope.innerText || scope.textContent || "").replace(/\s+/g, " ");
    const cardOrderId = (scopeText.match(/\b\d{3}-\d{7}-\d{7}\b/) || [""])[0];
    const summaryScope = scope.querySelector("#od-subtotals") || scope;
    const productLinks = [...scope.querySelectorAll("a[href*='/dp/'], a[href*='/gp/product/']")]
      .filter((anchor) => !isInjectedToolUiNode(anchor))
      .map((anchor) => ({
        href: anchor.href || anchor.getAttribute("href") || "",
        text: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim()
      }));
    const statusLines = [
      ...scope.querySelectorAll(".od-status-message, #shipment-top-row, [class*='delivery'], [class*='shipment']")
    ].flatMap((element) => scopedTextLines(element));
    if (!statusLines.length) statusLines.push(...scopedTextLines(scope));

    const parsed = parseAmazonOrderDetailSnapshot({
      pageOrderId,
      cardOrderId,
      summaryLines: scopedTextLines(summaryScope),
      productLinks,
      statusLines,
      shippingBlock: extractAmazonOrderDetailShippingBlock(scope)
    });
    if (!parsed) return null;
    return {
      ...parsed,
      capturedAt: new Date().toISOString(),
      url: location.href,
      source: "amazon-order-details-card"
    };
  }

  function extractShippingBlock() {
    const lines = U.getBodyLines();
    const start = lines.findIndex((line) => /^(shipping to|delivering to|ship to)\b/i.test(line));
    if (start === -1) return "";
    const collected = [];
    for (let i = start; i < Math.min(lines.length, start + 8); i += 1) {
      if (i > start && /^(payment|arriving|delivery|items?|order total|review|tomorrow|today)/i.test(lines[i])) break;
      collected.push(lines[i]);
    }
    return collected.join(" | ");
  }

  function parseEtaLine(line) {
    const cleaned = String(line || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";

    // Selected checkout shipment heading: Arriving Jul 2, 2026
    let match = cleaned.match(/^Arriving\s+(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i);
    if (match) return U.parseDateToMD(match[1]);

    // Confirmation page: Tomorrow, July 2 / Today, July 2
    match = cleaned.match(/^(?:Today|Tomorrow)\s*,?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i);
    if (match) return U.parseDateToMD(match[1]);

    // Other final confirmation wording.
    match = cleaned.match(/^(?:Delivery(?: date)?|Estimated delivery)\s*:?\s*(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i);
    if (match) return U.parseDateToMD(match[1]);

    // Order details: Delivered June 30 / Arrives by Tuesday, July 2.
    match = cleaned.match(/^(?:Delivered(?: on)?|Arrives? by|Expected by)\s+(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i);
    if (match) return U.parseDateToMD(match[1]);

    return "";
  }

  function extractAmazonEtas() {
    const lines = U.getBodyLines();
    const etas = [];

    // Only read selected/final shipment headings. Intentionally ignore
    // alternate choices such as "Amazon Day Monday, Jul 6".
    for (const line of lines) {
      const eta = parseEtaLine(line);
      if (eta && !etas.includes(eta)) etas.push(eta);
    }

    return etas;
  }

  function extractCheckoutData() {
    if (isAmazonOrderDetailsPage()) {
      return extractAmazonOrderDetailData() || {
        total: null,
        etas: [],
        titles: [],
        asins: [],
        shippingBlock: "",
        orderId: orderIdFromUrl(location.href),
        exactOrderDetails: false,
        capturedAt: new Date().toISOString(),
        url: location.href,
        source: "amazon-order-details-unverified"
      };
    }
    return {
      total: extractAmazonTotal(),
      etas: extractAmazonEtas(),
      titles: extractAmazonTitles(),
      asins: extractAmazonAsins(),
      shippingBlock: extractShippingBlock(),
      capturedAt: new Date().toISOString(),
      url: location.href
    };
  }

  function orderIdFromUrl(value) {
    return String(value || "").match(/[?&]orderI[Dd]=([^&#]+)/)?.[1] || "";
  }

  function normalizeTitleTokens(value) {
    const stop = new Set(["the", "and", "with", "for", "from", "this", "that", "your", "all", "one", "type"]);
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stop.has(token));
  }

  function titleOverlapScore(a, b) {
    const left = new Set(normalizeTitleTokens(a));
    const right = new Set(normalizeTitleTokens(b));
    if (!left.size || !right.size) return 0;
    let shared = 0;
    left.forEach((token) => {
      if (right.has(token)) shared += 1;
    });
    return shared / Math.min(left.size, right.size);
  }

  function isAmazonOrdersSearchPage() {
    return /\/your-orders\/search/i.test(location.pathname);
  }

  function isAmazonOrdersHistoryPage() {
    return /\/(?:gp\/your-account\/order-history|gp\/css\/order-history|your-orders\/orders)/i.test(location.pathname);
  }

  function isAmazonOrderDetailsPage() {
    return /\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(location.pathname);
  }

  function linkHasAsin(anchor, targetAsin) {
    const href = anchor?.href || anchor?.getAttribute?.("href") || "";
    if (!href) return false;
    const target = String(targetAsin || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(target)) return false;
    try {
      const url = new URL(href, location.href);
      const path = url.pathname.toUpperCase();
      if (path.includes(`/DP/${target}`) || path.includes(`/GP/PRODUCT/${target}`)) return true;
      const asin = (url.searchParams.get("asin") || "").toUpperCase();
      if (asin === target && /\/(?:your-orders\/pop|gp\/css\/order-details|dp|gp\/product)\b/i.test(url.pathname)) return true;
    } catch (_) {
      // Fall back to scoped product-link matching below.
    }
    return /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(href) && href.toUpperCase().includes(target);
  }

  function titleFromAmazonItemBlock(text, fallbackTitle = "") {
    const lines = String(text || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const titleLines = [];
    const stopLine = /^(sold by:|return or replace|eligible through|\$|buy it again|view your item|track package|get product support|add a protection plan|share gift receipt|ask product question|write a product review|cancel items|view your subscribe)/i;
    const shipmentLine = /^(arriving|delivered|picked up|shipped|order placed)\b/i;
    for (const line of lines) {
      if (stopLine.test(line)) {
        if (titleLines.length) break;
        continue;
      }
      if (shipmentLine.test(line)) continue;
      if (moneyValues(line).length) {
        if (titleLines.length) break;
        continue;
      }
      if (line.length >= 12) titleLines.push(line);
      if (titleLines.join(" ").length >= 260) break;
    }
    const title = titleLines.join(" ").replace(/\s+/g, " ").trim();
    return title || String(fallbackTitle || "").replace(/\s+/g, " ").trim();
  }

  function extractAmazonOrderDetailItemCostByAsin(asin, fallbackTitle = "", pageOrderId = "", pendingOrderId = "") {
    const targetAsin = String(asin || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(targetAsin)) return null;
    if (pendingOrderId && pageOrderId && pendingOrderId !== pageOrderId) return null;

    const links = [...document.querySelectorAll("a[href]")]
      .filter((anchor) => linkHasAsin(anchor, targetAsin) && !isInjectedToolUiNode(anchor));

    for (const link of links) {
      let node = link;
      for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
        if (isInjectedToolUiNode(node)) continue;
        const rawText = node.innerText || node.textContent || "";
        const text = rawText.replace(/\s+/g, " ").trim();
        if (!text || /Order Summary|Grand Total|Item\(s\) Subtotal|Total before tax|Shipping & Handling/i.test(text)) continue;
        if (INJECTED_PRICE_UI_RE.test(text)) continue;
        const values = nodeMoneyValues(node);
        if (!values.length) continue;

        const uniquePrices = [...new Set(values.map((value) => value.toFixed(2)))].map(Number);
        const asinLinkCount = [...node.querySelectorAll("a[href]")]
          .filter((anchor) => !isInjectedToolUiNode(anchor))
          .filter((anchor) => /[?&]asin=|\/(?:dp|gp\/product)\//i.test(anchor.href || anchor.getAttribute("href") || ""))
          .length;
        const hasAmazonOrderSignal = /\b(sold by:|return or replace|view your item|buy it again|track package|write a product review|eligible through|delivered|shipped)\b/i.test(text)
          || [...node.querySelectorAll("a[href]")]
            .filter((anchor) => !isInjectedToolUiNode(anchor))
            .some((anchor) => /\/(?:your-orders|gp\/css\/order-details|dp|gp\/product)\b/i.test(anchor.href || anchor.getAttribute("href") || ""));

        // The first small ancestor with the exact ASIN link and one repeated item
        // price is the actual item row. Larger ancestors include neighboring items.
        if (hasAmazonOrderSignal && uniquePrices.length <= 2 && asinLinkCount <= 3) {
          const quantityMatch = text.match(/\b(?:qty|quantity)\s*:?\s*(\d{1,3})\b/i);
          const orderCard = findAmazonOrderDetailsCard(pageOrderId || pendingOrderId);
          const shippingBlock = extractAmazonOrderDetailData()?.shippingBlock
            || extractAmazonOrderDetailShippingBlock(orderCard);
          const identity = ORDER_AUDIT?.shippingIdentity?.(shippingBlock) || {};
          return {
            total: uniquePrices[0],
            cost: uniquePrices[0],
            asin: targetAsin,
            title: titleFromAmazonItemBlock(rawText, fallbackTitle),
            orderId: pageOrderId || pendingOrderId || "",
            orderUrl: location.href,
            source: "amazon-order-detail-asin-row",
            quantity: Math.max(1, Number.parseInt(quantityMatch?.[1] || "1", 10) || 1),
            purchaseDate: amazonPurchaseDateFromOrderDetail(),
            shippingBlock,
            recipient: identity.recipient || "",
            recipientFingerprint: identity.recipientFingerprint || "",
            addressFingerprint: identity.addressFingerprint || "",
            score: 1,
            capturedAt: new Date().toISOString()
          };
        }
      }
    }
    return null;
  }

  function amazonOrderSearchResultCards() {
    const candidates = [...document.querySelectorAll(".order-card, .js-order-card, [class*='order-card']")]
      .filter((card) => !isInjectedToolUiNode(card))
      .filter((card) => {
        const text = String(card.innerText || card.textContent || "").replace(/\s+/g, " ").trim();
        return /\b(?:ORDER PLACED|Ordered on)\b/i.test(text)
          && [...card.querySelectorAll("a[href]")].some((anchor) => /view order details/i.test(anchor.innerText || anchor.textContent || "")
            || /\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(anchor.href || ""));
      });

    [...document.querySelectorAll("a[href]")]
      .filter((anchor) => !isInjectedToolUiNode(anchor))
      .filter((anchor) => /view order details/i.test(anchor.innerText || anchor.textContent || "")
        || /\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(anchor.href || ""))
      .forEach((detailsLink) => {
        let card = detailsLink.closest(".a-fixed-left-grid, .order-card, .js-order-card, [class*='order-card']");
        if (!card) {
          let node = detailsLink.parentElement;
          for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
            const text = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
            const links = [...node.querySelectorAll("a[href]")];
            if (text.length <= 4000
              && /\b(?:ORDER PLACED|Ordered on)\b/i.test(text)
              && links.length <= 24
              && links.some((anchor) => /\/(?:dp|gp\/product)\//i.test(anchor.href || ""))) {
              card = node;
              break;
            }
          }
        }
        if (card && !candidates.includes(card)) candidates.push(card);
      });
    return candidates;
  }

  function findAmazonOrderSearchMatch(asin) {
    const targetAsin = String(asin || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(targetAsin)) return null;

    const orderCards = amazonOrderSearchResultCards();
    for (const card of orderCards) {
      const cardText = (card.innerText || card.textContent || "").replace(/\s+/g, " ").trim();
      if (/cancelled|not been charged/i.test(cardText)) continue;

      const productLinks = [...card.querySelectorAll("a[href]")]
        .filter((anchor) => !isInjectedToolUiNode(anchor))
        .filter((anchor) => /[?&]asin=|\/(?:dp|gp\/product)\//i.test(anchor.href || anchor.getAttribute("href") || ""));
      if (!productLinks.some((anchor) => linkHasAsin(anchor, targetAsin))) continue;

      const detailsLink = [...card.querySelectorAll("a[href]")]
        .filter((anchor) => !isInjectedToolUiNode(anchor))
        .find((anchor) => /view order details/i.test(anchor.innerText || anchor.textContent || "")
          || /\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(anchor.href || ""));
      if (!detailsLink) continue;

      const titleLink = productLinks.find((anchor) => {
        const text = (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim();
        return linkHasAsin(anchor, targetAsin) && text.length > 12;
      }) || productLinks.find((anchor) => linkHasAsin(anchor, targetAsin));

      const detailsUrl = new URL(detailsLink.href || detailsLink.getAttribute("href") || "", location.href).toString();
      return {
        asin: targetAsin,
        amazonTitle: (titleLink?.innerText || titleLink?.textContent || "").replace(/\s+/g, " ").trim(),
        orderDetailsUrl: detailsUrl,
        orderId: orderIdFromUrl(detailsUrl),
        searchUrl: location.href,
        matchedAt: new Date().toISOString()
      };
    }

    const asinLinks = [...document.querySelectorAll("a[href]")]
      .filter((anchor) => {
        return linkHasAsin(anchor, targetAsin) && !isInjectedToolUiNode(anchor);
      });

    for (const link of asinLinks) {
      let node = link;
      for (let depth = 0; node && depth < 18; depth += 1, node = node.parentElement) {
        if (isInjectedToolUiNode(node)) continue;
        const nodeText = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
        if (!nodeText || nodeText.length > 6000) continue;
        if (/cancelled|not been charged/i.test(nodeText)) continue;
        const detailsLink = [...node.querySelectorAll("a[href]")]
          .filter((anchor) => !isInjectedToolUiNode(anchor))
          .filter((anchor) => /view order details/i.test(anchor.innerText || anchor.textContent || "") || /\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(anchor.href || ""));
        if (detailsLink.length !== 1) continue;
        const productLinks = [...node.querySelectorAll("a[href]")]
          .filter((anchor) => !isInjectedToolUiNode(anchor))
          .filter((anchor) => /[?&]asin=|\/(?:dp|gp\/product)\//i.test(anchor.href || anchor.getAttribute("href") || ""));
        if (productLinks.length > 8) continue;
        const hasTargetLink = productLinks.some((anchor) => linkHasAsin(anchor, targetAsin));
        if (!hasTargetLink) continue;
        const titleLink = [...node.querySelectorAll("a[href]")]
          .find((anchor) => {
            const href = anchor.href || anchor.getAttribute("href") || "";
            const text = (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim();
            return text.length > 12 && (href.toUpperCase().includes(targetAsin) || /\/(?:dp|gp\/product)\//i.test(href));
          });
        const detailsUrl = new URL(detailsLink[0].href || detailsLink[0].getAttribute("href") || "", location.href).toString();
        return {
          asin: targetAsin,
          amazonTitle: (titleLink?.innerText || titleLink?.textContent || "").replace(/\s+/g, " ").trim(),
          orderDetailsUrl: detailsUrl,
          orderId: orderIdFromUrl(detailsUrl),
          searchUrl: location.href,
          matchedAt: new Date().toISOString()
        };
      }
    }
    return null;
  }

  function amazonPurchaseDateFromText(value) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    const match = normalized.match(/\b(?:ORDER PLACED|Ordered on)\s*:?[\s-]*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4})/i);
    return match?.[1] || "";
  }

  function amazonPurchaseDateFromOrderDetail() {
    const candidates = [
      document.querySelector("[data-component='orderDetails']"),
      document.querySelector("#orderDetails"),
      document.querySelector(".order-date-invoice-item"),
      document.querySelector("main"),
      document.body
    ].filter((node, index, all) => node && all.indexOf(node) === index);
    for (const node of candidates) {
      const purchaseDate = amazonPurchaseDateFromText(node.innerText || node.textContent || "");
      if (purchaseDate) return purchaseDate;
    }
    return "";
  }

  function findAmazonOrderSearchMatches(asin) {
    const targetAsin = String(asin || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(targetAsin)) return [];
    const matches = [];
    const cards = amazonOrderSearchResultCards();
    cards.forEach((card) => {
      const cardText = String(card.innerText || card.textContent || "").replace(/\s+/g, " ").trim();
      if (/cancelled|not been charged/i.test(cardText)) return;
      const productLinks = [...card.querySelectorAll("a[href]")]
        .filter((anchor) => !isInjectedToolUiNode(anchor) && linkHasAsin(anchor, targetAsin));
      if (!productLinks.length) return;
      const detailsLink = [...card.querySelectorAll("a[href]")]
        .filter((anchor) => !isInjectedToolUiNode(anchor))
        .find((anchor) => /view order details/i.test(anchor.innerText || anchor.textContent || "")
          || /\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(anchor.href || ""));
      if (!detailsLink) return;
      const orderDetailsUrl = new URL(detailsLink.href || detailsLink.getAttribute("href") || "", location.href).toString();
      matches.push({
        asin: targetAsin,
        amazonTitle: String(productLinks[0].innerText || productLinks[0].textContent || "").replace(/\s+/g, " ").trim(),
        orderDetailsUrl,
        orderId: orderIdFromUrl(orderDetailsUrl),
        purchaseDate: amazonPurchaseDateFromText(cardText),
        searchUrl: location.href
      });
    });
    return matches.filter((match, index, all) => all.findIndex((item) => item.orderDetailsUrl === match.orderDetailsUrl) === index);
  }

  async function submitHistoricalAmazonSearch(asin) {
    const input = document.querySelector("#searchOrdersInput, input[aria-label='Search all orders'], input[name='search']");
    const form = input?.closest("form");
    if (!input || !form) return false;
    input.value = asin;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const submit = form.querySelector("input[type='submit'], button[type='submit']");
    if (typeof form.requestSubmit === "function") form.requestSubmit(submit || undefined);
    else if (submit) submit.click();
    else return false;
    return true;
  }

  function amazonNextOrdersControl() {
    return [...document.querySelectorAll(".a-pagination .a-last a, .a-pagination a, .a-pagination button, nav[aria-label*='pagination' i] a, nav[aria-label*='pagination' i] button")]
      .filter((element) => U.isVisible(element) && !isInjectedToolUiNode(element))
      .find((element) => !/slides|carousel/i.test(String(element.className || "") + " " + String(element.textContent || "")) && /next/i.test([
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.innerText,
        element.textContent
      ].filter(Boolean).join(" ")));
  }

  function amazonControlDisabled(control) {
    return !control || control.disabled || control.getAttribute("aria-disabled") === "true" || /disabled/i.test(control.className || "");
  }

  function amazonOrderSearchResultsReady() {
    const container = document.querySelector(".hzsearch-content-container, [class*='order-search'], main");
    const text = String(container?.innerText || container?.textContent || "").replace(/\s+/g, " ").trim();
    return amazonOrderSearchResultCards().length > 0
      || /\b\d+\s+orders?\s+matching\b|\bno orders?\b|\bno results\b/i.test(text);
  }

  function orderAuditDateBounds(monthKey, paddingDays = 14) {
    const normalized = ORDER_AUDIT?.normalizeMonthKey?.(monthKey) || "";
    const [year, month] = normalized.split("-").map(Number);
    if (!year || !month) return null;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return {
      lower: new Date(start.getTime() - (paddingDays * 86400000)),
      upper: new Date(end.getTime() + (paddingDays * 86400000))
    };
  }

  function extractOrderPlacementAuditHistory(state = {}) {
    const targets = new Set((state.targetAsins || []).map((value) => String(value || "").trim().toUpperCase()));
    const bounds = orderAuditDateBounds(state.monthKey);
    const records = [];
    let reachedOlder = false;

    amazonOrderSearchResultCards().forEach((card) => {
      const rawText = String(card.innerText || card.textContent || "");
      const cardText = rawText.replace(/\s+/g, " ").trim();
      if (/cancelled|not been charged/i.test(cardText)) return;
      const purchaseDate = amazonPurchaseDateFromText(cardText);
      const purchaseTime = purchaseDate ? Date.parse(purchaseDate) : NaN;
      if (bounds && Number.isFinite(purchaseTime) && purchaseTime < bounds.lower.getTime()) reachedOlder = true;
      if (bounds && Number.isFinite(purchaseTime) && purchaseTime > bounds.upper.getTime()) return;
      if (bounds && Number.isFinite(purchaseTime) && purchaseTime < bounds.lower.getTime()) return;

      const itemsByAsin = new Map();
      [...card.querySelectorAll("a[href]")]
        .filter((anchor) => !isInjectedToolUiNode(anchor))
        .forEach((anchor) => {
          const asin = asinFromAmazonProductHref(anchor.href || anchor.getAttribute("href") || "");
          if (!asin || !targets.has(asin)) return;
          const title = String(anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim();
          const previous = itemsByAsin.get(asin) || { asin, title: "" };
          if (title.length > previous.title.length) previous.title = title;
          itemsByAsin.set(asin, previous);
        });
      if (!itemsByAsin.size) return;

      const detailsLink = [...card.querySelectorAll("a[href]")]
        .filter((anchor) => !isInjectedToolUiNode(anchor))
        .find((anchor) => /view order details/i.test(anchor.innerText || anchor.textContent || "")
          || /\/(?:your-orders\/order-details|gp\/css\/order-details)/i.test(anchor.href || ""));
      if (!detailsLink) return;
      const orderDetailsUrl = new URL(detailsLink.href || detailsLink.getAttribute("href") || "", location.href).toString();
      records.push({
        orderId: orderIdFromUrl(orderDetailsUrl),
        orderDetailsUrl,
        purchaseDate,
        asins: [...itemsByAsin.keys()],
        items: [...itemsByAsin.values()],
        historyUrl: location.href
      });
    });

    const next = amazonNextOrdersControl();
    const hasNext = Boolean(next && !amazonControlDisabled(next));
    const nextHref = hasNext ? String(next.href || next.getAttribute?.("href") || "") : "";
    return {
      records,
      reachedOlder,
      hasNext,
      nextUrl: nextHref ? new URL(nextHref, location.href).toString() : "",
      pageUrl: location.href
    };
  }

  async function resumeOrderPlacementAuditWorker() {
    if (orderAuditWorkerBusy) return false;
    orderAuditWorkerBusy = true;
    try {
      const [status, tab] = await Promise.all([
        runtimeMessage({ type: "getOrderPlacementAuditAmazon" }),
        runtimeMessage({ type: "currentTabInfo" })
      ]);
      const run = status?.state;
      if (!run || !run.active || Number(run.workerTabId) !== Number(tab?.tabId)) return false;
      await new Promise((resolve) => setTimeout(resolve, 700));

      if (run.phase === "index-amazon" && (isAmazonOrdersHistoryPage() || isAmazonOrdersSearchPage())) {
        for (let attempt = 0; attempt < 12 && !amazonOrderSearchResultsReady(); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!amazonOrderSearchResultsReady()) return true;
        const response = await runtimeMessage({
          type: "orderPlacementAuditAmazonIndex",
          payload: extractOrderPlacementAuditHistory(run)
        }, 120000);
        if (!response?.ok && !response?.ignored) throw new Error(response?.error || "The Amazon history page could not be indexed.");
        return true;
      }

      if (run.phase === "capture-amazon-details" && isAmazonOrderDetailsPage()) {
        const candidate = (run.candidates || [])[Number(run.candidateIndex || 0)] || {};
        const expectedOrderId = String(candidate.orderId || "");
        let pageOrderId = orderIdFromUrl(location.href);
        for (let attempt = 0; attempt < 12 && (!pageOrderId || (expectedOrderId && expectedOrderId !== pageOrderId)); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          pageOrderId = orderIdFromUrl(location.href);
        }
        if (expectedOrderId && pageOrderId !== expectedOrderId) {
          throw new Error(`Expected Amazon order ${expectedOrderId}, but this tab opened ${pageOrderId || "an unverified order"}.`);
        }

        const purchases = [];
        const missingAsins = [];
        for (const asin of candidate.asins || []) {
          const fallbackTitle = (candidate.items || []).find((item) => item.asin === asin)?.title || "";
          let purchase = null;
          for (let attempt = 0; attempt < 12 && !purchase; attempt += 1) {
            purchase = extractAmazonOrderDetailItemCostByAsin(asin, fallbackTitle, pageOrderId, expectedOrderId);
            if (!purchase) await new Promise((resolve) => setTimeout(resolve, 500));
          }
          if (purchase) purchases.push(purchase);
          else missingAsins.push(asin);
        }
        if (missingAsins.length) {
          throw new Error(`Amazon order ${pageOrderId || expectedOrderId} did not expose an exact item row for ${missingAsins.join(", ")}.`);
        }
        const detail = extractAmazonOrderDetailData() || {};
        const response = await runtimeMessage({
          type: "orderPlacementAuditAmazonDetail",
          payload: {
            orderId: pageOrderId || expectedOrderId,
            shippingBlock: detail.shippingBlock || "",
            purchases
          }
        }, 120000);
        if (!response?.ok && !response?.ignored) throw new Error(response?.error || "The Amazon order detail could not be saved.");
        return true;
      }
      return false;
    } catch (error) {
      if (U.isExtensionContextInvalidated?.(error)) {
        stopInvalidatedAmazonContext(error);
        return false;
      }
      await runtimeMessage({
        type: "orderPlacementAuditWorkerError",
        error: { message: error?.message || String(error), url: location.href }
      }).catch(() => {});
      renderStatus(error?.message || "Order placement audit paused.", "error");
      return false;
    } finally {
      orderAuditWorkerBusy = false;
    }
  }

  function backfillCurrency(value) {
    const amount = Number(value);
    return value !== null && value !== undefined && value !== "" && Number.isFinite(amount)
      ? `$${amount.toFixed(2)}`
      : "not captured";
  }

  function backfillOptionalNumber(value) {
    const amount = Number(value);
    return value !== null && value !== undefined && value !== "" && Number.isFinite(amount) ? amount : null;
  }

  function ebayProfitSourceComparison(sale, result) {
    const record = result?.record || {};
    const visibleEarnings = backfillOptionalNumber(record.marketplaceEarnings ?? sale.marketplaceEarnings);
    const noteEarnings = backfillOptionalNumber(sale.noteMarketplaceEarnings ?? sale.marketplaceEarnings);
    const noteCost = backfillOptionalNumber(sale.noteSupplierTotal);
    const noteProfit = backfillOptionalNumber(sale.noteProfit)
      ?? (noteEarnings !== null && noteCost !== null ? Number((noteEarnings - noteCost).toFixed(2)) : null);
    const amazonCost = result?.status === "exact" ? backfillOptionalNumber(record.supplierTotal) : null;
    const amazonProfit = result?.status === "exact"
      ? (backfillOptionalNumber(record.profit)
        ?? (visibleEarnings !== null && amazonCost !== null ? Number((visibleEarnings - amazonCost).toFixed(2)) : null))
      : null;
    const earningsDifference = noteEarnings !== null && visibleEarnings !== null
      ? Number((visibleEarnings - noteEarnings).toFixed(2))
      : null;
    const costDifference = noteCost !== null && amazonCost !== null
      ? Number((amazonCost - noteCost).toFixed(2))
      : null;
    const profitDifference = noteProfit !== null && amazonProfit !== null
      ? Number((amazonProfit - noteProfit).toFixed(2))
      : null;
    let comparison = "open";
    let label = "AMAZON OPEN";
    if (noteEarnings === null || noteCost === null) {
      comparison = "note-review";
      label = "NOTE REVIEW";
    } else if (amazonCost !== null && amazonProfit !== null) {
      const matches = [earningsDifference, costDifference, profitDifference]
        .every((difference) => difference !== null && Math.abs(difference) <= 0.011);
      comparison = matches ? "match" : "discrepancy";
      label = matches ? "MATCH" : "DISCREPANCY";
    }
    return {
      visibleEarnings,
      noteEarnings,
      noteCost,
      noteProfit,
      amazonCost,
      amazonProfit,
      earningsDifference,
      costDifference,
      profitDifference,
      comparison,
      label
    };
  }

  function outsideWindowPurchaseSummary(run, sale) {
    const asins = [...new Set((sale?.asins || []).map((asin) => String(asin || "").trim().toUpperCase()).filter(Boolean))];
    if (!asins.length) return "";
    const candidates = (run?.purchases || [])
      .filter((purchase) => asins.includes(String(purchase?.asin || "").trim().toUpperCase()))
      .sort((left, right) => String(right?.purchaseDate || "").localeCompare(String(left?.purchaseDate || "")))
      .slice(0, 3)
      .map((purchase) => `${purchase.asin} bought ${purchase.purchaseDate || "date unknown"} for ${backfillCurrency(purchase.cost)}${purchase.orderId ? ` (Amazon ${purchase.orderId})` : ""}`);
    return candidates.length ? ` Captured exact-ASIN purchase${candidates.length === 1 ? "" : "s"} outside the allowed date window: ${candidates.join("; ")}.` : "";
  }

  function applyAmazonCostResolutionSuccess(overlay, response, marketplaceName, resolvingEbay, reviewedCount) {
    const count = Number(response?.count ?? reviewedCount ?? 0);
    const delivery = response?.queued ? "secured in the dashboard retry queue" : "saved to the shared dashboard";
    const profileNote = resolvingEbay
      ? " The Monthly eBay Profit run remains in the Chrome profile signed into eBay; this Amazon profile stores only its cost-resolution receipt."
      : "";
    const message = `${count} reviewed result${count === 1 ? "" : "s"} ${delivery}. ${response?.exact || 0} ${marketplaceName} Amazon costs resolved; ${response?.unresolved || 0} remain open for another profile.${profileNote}`;
    const button = overlay?.querySelector?.("[data-action='sync']");
    const status = overlay?.querySelector?.(".gldn-modal-status");
    if (button) {
      button.disabled = true;
      button.textContent = response?.queued ? "Results Queued Safely" : "Results Saved";
    }
    if (status) {
      status.dataset.state = response?.queued ? "queued" : "success";
      status.textContent = message;
    }
    renderStatus(message, "completed");
    return message;
  }

  function showAmazonCostResolutionReview(run) {
    document.getElementById("gldn-amazon-cost-resolution-review")?.remove();
    const summary = window.GLDN_PROFIT_BACKFILL.summary(run);
    const resolvingEbay = run.scope === "resolve-ebay" || run.platform === "eBay";
    const marketplaceName = resolvingEbay ? "eBay" : "Poshmark";
    const remaining = Number(summary.pending || 0);
    const salesByOrder = new Map((run.sales || []).map((sale) => [String(sale.orderNumber || ""), sale]));
    const comparisons = (run.results || []).map((result) => {
      const sale = salesByOrder.get(String(result.orderNumber || "")) || {};
      return ebayProfitSourceComparison(sale, result);
    });
    const rows = (run.results || []).slice(0, 100).map((result) => {
      const sale = salesByOrder.get(String(result.orderNumber || "")) || {};
      const record = result.record || {};
      const comparison = ebayProfitSourceComparison(sale, result);
      if (!resolvingEbay) {
        return `
          <div class="gldn-sales-row" data-status="${escapeHtml(result.status)}">
            <div class="gldn-sales-main">
              <span class="gldn-sales-order">${escapeHtml(result.orderNumber || "No order")}</span>
              <strong class="gldn-sales-title">${escapeHtml(sale.itemTitle || "Item title unavailable")}</strong>
              <small class="gldn-sales-detail">${escapeHtml(result.status === "exact"
                ? `${backfillCurrency(record.marketplaceEarnings)} earnings - ${backfillCurrency(record.supplierTotal)} Amazon - order ${record.supplierOrderNumber || "not captured"}`
                : `${result.reason || result.status}${outsideWindowPurchaseSummary(run, sale)}`)}</small>
            </div>
            <strong class="gldn-sales-earnings">${escapeHtml(result.status === "exact" ? backfillCurrency(record.profit) : "STILL OPEN")}</strong>
          </div>`;
      }
      const differenceText = comparison.profitDifference === null
        ? (result.status === "exact" ? "Read 1 is unavailable for comparison." : `${result.reason || result.status}${outsideWindowPurchaseSummary(run, sale)}`)
        : `Read 2 minus Read 1: earnings ${backfillCurrency(comparison.earningsDifference)}, cost ${backfillCurrency(comparison.costDifference)}, profit ${backfillCurrency(comparison.profitDifference)}.`;
      return `
        <div class="gldn-sales-row gldn-profit-comparison-row" data-status="${escapeHtml(result.status)}" data-comparison="${escapeHtml(comparison.comparison)}">
          <div class="gldn-sales-main">
            <span class="gldn-sales-order">${escapeHtml(result.orderNumber || "No order")}</span>
            <strong class="gldn-sales-title">${escapeHtml(sale.itemTitle || "Item title unavailable")}</strong>
            <div class="gldn-profit-source-grid">
              <div class="gldn-profit-source" data-source="note">
                <span>READ 1 - SAVED EBAY NOTE ONLY</span>
                <strong>${backfillCurrency(comparison.noteEarnings)} - ${backfillCurrency(comparison.noteCost)} = ${backfillCurrency(comparison.noteProfit)}</strong>
                <small>${escapeHtml(sale.noteStatus || "Note needs review")}${sale.noteSupplierProfile ? ` - ${escapeHtml(sale.noteSupplierProfile)}` : ""}</small>
              </div>
              <div class="gldn-profit-source" data-source="amazon">
                <span>READ 2 - EBAY + AMAZON ORDER</span>
                <strong>${backfillCurrency(comparison.visibleEarnings)} - ${backfillCurrency(comparison.amazonCost)} = ${backfillCurrency(comparison.amazonProfit)}</strong>
                <small>${escapeHtml(result.status === "exact" ? `Amazon order ${record.supplierOrderNumber || "not captured"} - ${record.supplierProfile || "current profile"}` : "Exact Amazon order cost is still open")}</small>
              </div>
            </div>
            <small class="gldn-sales-detail gldn-profit-difference">${escapeHtml(differenceText)}</small>
          </div>
          <strong class="gldn-sales-earnings gldn-comparison-badge">${escapeHtml(comparison.label)}</strong>
        </div>`;
    }).join("");
    const noteReady = comparisons.filter((comparison) => comparison.noteEarnings !== null && comparison.noteCost !== null).length;
    const matches = comparisons.filter((comparison) => comparison.comparison === "match").length;
    const discrepancies = comparisons.filter((comparison) => comparison.comparison === "discrepancy").length;
    const overlay = document.createElement("div");
    overlay.id = "gldn-amazon-cost-resolution-review";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-health-modal gldn-review-modal gldn-backfill-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Review Missing ${marketplaceName} Amazon Costs</h2>
        <p class="gldn-help-text">${resolvingEbay
          ? "Read 1 comes only from the saved eBay note. Read 2 uses visible eBay earnings plus this signed-in profile's exact Amazon order-item cost. Neither read overwrites the other."
          : `This signed-in Amazon profile was searched by exact ${marketplaceName} SKU-linked ASIN. Exact order-item costs can be applied; misses remain open for another profile.`}</p>
        <div class="gldn-grid gldn-backfill-summary">
          <div><strong>Queue rows checked</strong><span>${Number(summary.salesIndexed || 0).toLocaleString()}</span></div>
          ${resolvingEbay ? `<div><strong>Read 1 note-ready</strong><span>${noteReady.toLocaleString()}</span></div>` : ""}
          <div><strong>Exact costs found</strong><span>${Number(summary.exact || 0).toLocaleString()}</span></div>
          ${resolvingEbay ? `<div><strong>Matches</strong><span>${matches.toLocaleString()}</span></div><div><strong>Discrepancies</strong><span>${discrepancies.toLocaleString()}</span></div>` : ""}
          <div><strong>Still open</strong><span>${Number((summary.missingSku || 0) + (summary.amazonNotFound || 0) + (summary.needsReview || 0)).toLocaleString()}</span></div>
        </div>
        <div class="gldn-sales-list">${rows || "<div class='gldn-help-text'>No queue rows were checked.</div>"}</div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="close">Close</button>
          <button type="button" class="gldn-primary" data-action="sync" ${remaining <= 0 ? "disabled" : ""}>Save Cost Resolution Results</button>
        </div>
        <div class="gldn-modal-status">No shared-sheet changes have been made by this review.</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnAmazonCostResolutionPosition");
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='close']").addEventListener("click", close);
    overlay.querySelector("[data-action='sync']")?.addEventListener("click", async () => {
      const button = overlay.querySelector("[data-action='sync']");
      const status = overlay.querySelector(".gldn-modal-status");
      button.disabled = true;
      button.textContent = `Saving ${remaining} Result${remaining === 1 ? "" : "s"}...`;
      status.textContent = `Saving ${remaining} reviewed lookup results...`;
      const approvalToken = resolvingEbay
        ? `APPROVE RESOLVE EBAY COSTS ${remaining}`
        : `APPROVE RESOLVE POSHMARK COSTS ${remaining}`;
      const response = await runtimeMessage({ type: "syncPoshmarkProfitBackfill", confirm: approvalToken }, 360000);
      if (!response?.ok) {
        button.disabled = false;
        button.textContent = "Save Cost Resolution Results";
        status.textContent = response?.error || "The cost-resolution results were not saved.";
        return;
      }
      applyAmazonCostResolutionSuccess(overlay, response, marketplaceName, resolvingEbay, remaining);
    });
    return true;
  }

  async function approveAmazonCostResolutionReview(confirmationToken) {
    const status = await runtimeMessage({ type: "getPoshmarkProfitBackfill" });
    const run = status?.state;
    if (!run || run.phase !== "review" || (run.scope !== "resolve-ebay" && run.platform !== "eBay")) {
      throw new Error("No eBay Amazon-cost review is open.");
    }
    const summary = window.GLDN_PROFIT_BACKFILL.summary(run);
    const remaining = Number(summary.pending || 0);
    const expected = `APPROVE RESOLVE EBAY COSTS ${remaining}`;
    if (String(confirmationToken || "").trim() !== expected) {
      throw new Error(`eBay Amazon-cost approval requires the exact token ${expected}.`);
    }
    const response = await runtimeMessage({ type: "syncPoshmarkProfitBackfill", confirm: expected }, 360000);
    if (!response?.ok) throw new Error(response?.error || "The eBay Amazon-cost results were not saved.");
    applyAmazonCostResolutionSuccess(
      document.getElementById("gldn-amazon-cost-resolution-review"),
      response,
      "eBay",
      true,
      remaining
    );
    return response;
  }

  async function resumePoshmarkProfitBackfillWorker() {
    if (backfillWorkerBusy) return false;
    backfillWorkerBusy = true;
    let workerPhase = "unknown";
    try {
      const [status, tab] = await Promise.all([
        runtimeMessage({ type: "getPoshmarkProfitBackfill" }),
        runtimeMessage({ type: "currentTabInfo" })
      ]);
      const run = status?.state;
      if (!run || Number(run.workerTabId) !== Number(tab?.tabId)) return false;
      workerPhase = String(run.phase || "unknown");
      if (["resolve-missing", "resolve-ebay"].includes(run.scope) && run.phase === "review") {
        showAmazonCostResolutionReview(run);
        return true;
      }
      if (!run.active) return false;
      await new Promise((resolve) => setTimeout(resolve, 900));

      if (run.phase === "amazon-search") {
        const asin = String(run.currentAsin || "").trim().toUpperCase();
        const input = document.querySelector("#searchOrdersInput, input[aria-label='Search all orders'], input[name='search']");
        const currentQuery = String(input?.value || new URL(location.href).searchParams.get("search") || "").trim().toUpperCase();
        if (currentQuery !== asin && (isAmazonOrdersHistoryPage() || isAmazonOrdersSearchPage())) {
          const submitted = await submitHistoricalAmazonSearch(asin);
          if (!submitted) {
            const response = await runtimeMessage({ type: "poshmarkBackfillAmazonSearch", payload: { matches: [], searchError: "Amazon order search control was not found." } });
            if (!response?.ok && !response?.ignored) throw new Error(response?.error || "Could not checkpoint the Amazon order search failure.");
          }
          return true;
        }
        for (let attempt = 0; attempt < 10 && !amazonOrderSearchResultsReady(); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!amazonOrderSearchResultsReady()) return true;
        const matches = findAmazonOrderSearchMatches(asin);
        const next = amazonNextOrdersControl();
        const response = await runtimeMessage({
          type: "poshmarkBackfillAmazonSearch",
          payload: { asin, matches, hasNext: Boolean(next && !amazonControlDisabled(next)), pageUrl: location.href }
        });
        if (!response?.ok && !response?.ignored) throw new Error(response?.error || "Could not checkpoint this Amazon order-search page.");
        if (response?.instruction === "next-amazon-page" && next && !amazonControlDisabled(next)) next.click();
        return true;
      }

      if (run.phase === "amazon-detail" && isAmazonOrderDetailsPage()) {
        const searchMatch = (run.amazonSearchMatches || [])[Number(run.amazonCandidateIndex || 0)] || {};
        const pageOrderId = orderIdFromUrl(location.href);
        let purchase = null;
        for (let attempt = 0; attempt < 12 && !purchase; attempt += 1) {
          purchase = extractAmazonOrderDetailItemCostByAsin(
            run.currentAsin,
            searchMatch.amazonTitle || "",
            pageOrderId,
            searchMatch.orderId || ""
          );
          if (!purchase) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const response = await runtimeMessage({
          type: "poshmarkBackfillAmazonDetail",
          payload: {
            purchase: purchase ? {
              ...purchase,
              purchaseDate: amazonPurchaseDateFromOrderDetail() || searchMatch.purchaseDate || ""
            } : null,
            pageUrl: location.href
          }
        });
        if (!response?.ok && !response?.ignored) throw new Error(response?.error || "Could not checkpoint this Amazon order detail.");
        return true;
      }
      return false;
    } catch (error) {
      if (U.isExtensionContextInvalidated?.(error)) {
        stopInvalidatedAmazonContext(error);
        return false;
      }
      U.recordExtensionLog?.({
        source: "poshmark-profit",
        operation: "amazon-worker",
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
      renderStatus(`${error?.message || "Historical-profit Amazon worker stopped."} Resume will continue from the saved checkpoint.`, "error");
      return false;
    } finally {
      backfillWorkerBusy = false;
    }
  }

  function extractAmazonOrderDetailItemCost(marketplaceContext, pendingMatch = {}) {
    if (!marketplaceContext || !isAmazonOrderDetailsPage()) return null;
    const asin = (pendingMatch.asin || marketplaceContext.asins?.[0] || "").toUpperCase();
    const targetTitle = pendingMatch.amazonTitle || marketplaceContext.itemTitle || "";
    const pageOrderId = orderIdFromUrl(location.href);
    if (pendingMatch.orderId && pageOrderId && pendingMatch.orderId !== pageOrderId) return null;

    const asinCost = extractAmazonOrderDetailItemCostByAsin(asin, targetTitle, pageOrderId, pendingMatch.orderId || "");
    if (asinCost) return asinCost;

    // Poshmark SKUs decode to Amazon ASINs. If that exact ASIN cannot be found
    // on a multi-item Amazon order, stop instead of guessing from title text.
    if (/^[A-Z0-9]{10}$/.test(asin)) return null;

    const lines = U.getBodyLines();
    let titleIndex = -1;
    let matchedTitle = "";
    let bestScore = 0;
    lines.forEach((line, index) => {
      if (line.length < 12 || line.length > 500) return;
      const score = titleOverlapScore(line, targetTitle);
      if (score > bestScore) {
        bestScore = score;
        titleIndex = index;
        matchedTitle = line;
      }
    });

    if (titleIndex < 0 || bestScore < 0.5) return null;
    for (let index = titleIndex + 1; index < Math.min(lines.length, titleIndex + 10); index += 1) {
      if (/^(return|buy it again|write a product review|archive order|view invoice|problem with order)/i.test(lines[index])) break;
      const values = moneyValues(lines[index]).filter((value) => value > 0);
      if (values.length) {
        return {
          total: values[0],
          cost: values[0],
          asin,
          title: matchedTitle,
          orderId: pageOrderId || pendingMatch.orderId || "",
          orderUrl: location.href,
          source: "amazon-order-detail-item-row",
          score: bestScore,
          capturedAt: new Date().toISOString()
        };
      }
    }
    return null;
  }

  function isCheckoutPage() {
    return /\/checkout\/|\/gp\/buy\/spc\/|\/checkout\/p\//i.test(location.pathname + location.search);
  }

  function isConfirmationPage() {
    if (isAmazonOrderDetailsPage() || isAmazonOrdersSearchPage() || isAmazonOrdersHistoryPage()) return false;
    const text = (document.body?.innerText || "").toLowerCase();
    return /\/gp\/buy\/thankyou\//i.test(location.pathname) ||
      text.includes("order placed") ||
      text.includes("thanks for your order") ||
      text.includes("order confirmation");
  }

  function amazonPageLabel() {
    if (isAmazonOrderDetailsPage()) return "Order details";
    if (isAmazonOrdersSearchPage()) return "Orders search";
    if (isAmazonOrdersHistoryPage()) return "Orders history";
    if (isConfirmationPage()) return "Order confirmation";
    if (isCheckoutPage()) return "Checkout";
    return "Amazon";
  }

  async function autoCacheCheckout() {
    const checkoutPage = isCheckoutPage();
    const confirmationPage = isConfirmationPage();
    if (!checkoutPage && !confirmationPage) return false;
    const data = extractCheckoutData();
    const stored = await storageGet(["pendingAmazonCheckout"]);
    const previous = stored.pendingAmazonCheckout || {};

    if (checkoutPage) {
      const combined = {
        ...previous,
        ...data,
        total: data.total ?? previous.total ?? null,
        etas: data.etas.length ? data.etas : (previous.etas || []),
        titles: data.titles.length ? data.titles : (previous.titles || []),
        asins: data.asins.length ? data.asins : (previous.asins || []),
        shippingBlock: data.shippingBlock || previous.shippingBlock || ""
      };
      if (combined.total !== null) {
        cachedSnapshot = combined;
        await storageSet({ pendingAmazonCheckout: combined });
        renderPassiveStatus(
          `Detected: ${U.formatMoney(combined.total)}${combined.etas.length ? ` / ${combined.etas.join(", ")}` : " / ETA pending"}`,
          "ready"
        );
      }
    }

    if (confirmationPage) {
      const combined = {
        ...previous,
        ...data,
        // Amazon confirmation often does not display the total, so preserve
        // the exact total cached from final checkout.
        total: previous.total ?? data.total ?? null,
        // Prefer the final confirmation ETA over checkout alternatives.
        etas: data.etas.length ? data.etas : (previous.etas || []),
        titles: data.titles.length ? data.titles : (previous.titles || []),
        asins: data.asins.length ? data.asins : (previous.asins || []),
        shippingBlock: data.shippingBlock || previous.shippingBlock || "",
        confirmedAt: new Date().toISOString(),
        confirmationUrl: location.href
      };
      cachedSnapshot = combined;
      await storageSet({ pendingAmazonCheckout: combined });
      renderPassiveStatus(
        `Confirmed: ${combined.total !== null ? U.formatMoney(combined.total) : "total missing"}${combined.etas.length ? ` / ${combined.etas.join(", ")}` : " / ETA missing"}`,
        "confirmed"
      );
    }
    return true;
  }

  async function setProfileLabel() {
    const existing = (await storageGet(["amazonProfileLabel"])).amazonProfileLabel || "";
    const value = prompt("Enter this Amazon Chrome profile's permanent label:", existing);
    if (value === null) return;
    const cleaned = value.trim();
    if (!cleaned) {
      renderStatus("Profile label cannot be blank.", "error");
      return;
    }
    await storageSet({ amazonProfileLabel: cleaned });
    updateProfileButton();
  }

  async function updateProfileButton() {
    const result = await storageGet(["amazonProfileLabel"]);
    const button = panel?.querySelector("[data-action='profile']");
    if (button) button.textContent = result.amazonProfileLabel ? `Profile: ${result.amazonProfileLabel}` : "Set Amazon Profile";
  }

  async function reloadExtensionFromPanel() {
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
  }

  function activeMarketplaceContext(context) {
    if (!context?.orderNumber || context.platform !== "Poshmark") return null;
    const started = new Date(context.startedAt || 0).getTime();
    if (!Number.isFinite(started) || Date.now() - started > MARKETPLACE_CONTEXT_TTL_MS) return null;
    return {
      platform: "Poshmark",
      orderNumber: String(context.orderNumber),
      itemTitle: String(context.itemTitle || ""),
      sku: String(context.sku || ""),
      asins: Array.isArray(context.asins) ? context.asins : [],
      pageUrl: String(context.pageUrl || ""),
      startedAt: context.startedAt,
      linkedAt: new Date().toISOString()
    };
  }

  function exactItemsOnCurrentOrder(marketplaceContext, pendingMatch = {}) {
    if (!marketplaceContext || !isAmazonOrderDetailsPage()) return [];
    const pageOrderId = orderIdFromUrl(location.href);
    return (marketplaceContext.asins || [])
      .map((asin) => extractAmazonOrderDetailItemCostByAsin(
        asin,
        pendingMatch.asin === asin ? pendingMatch.amazonTitle : marketplaceContext.itemTitle,
        pageOrderId,
        pendingMatch.asin === asin ? (pendingMatch.orderId || "") : ""
      ))
      .filter(Boolean)
      .map((item) => AUDIT.normalizeItem(item));
  }

  async function mergePendingMarketplaceItems(marketplaceContext, currentItems = []) {
    const stored = await storageGet(["pendingPoshmarkAmazonItemsByOrder"]);
    const byOrder = stored.pendingPoshmarkAmazonItemsByOrder || {};
    const orderKey = String(marketplaceContext.orderNumber || "");
    const merged = AUDIT.mergeItems(byOrder[orderKey] || [], currentItems);
    await storageSet({
      pendingPoshmarkAmazonItemsByOrder: {
        ...byOrder,
        [orderKey]: merged
      }
    });
    return merged;
  }

  function missingMarketplaceAsins(marketplaceContext, items) {
    const exact = AUDIT.exactItemsForAsins(items, marketplaceContext.asins || []);
    return (marketplaceContext.asins || []).filter((asin, index) => !exact[index]);
  }

  async function submitAmazonOrderSearch(asin, marketplaceContext) {
    const input = document.querySelector("#searchOrdersInput, input[aria-label='Search all orders'], input[name='search']");
    const form = input?.closest("form");
    if (!input || !form) return false;

    const queries = AUDIT.amazonOrderSearchQueries({
      itemTitle: marketplaceContext.itemTitle,
      asins: [asin, ...(marketplaceContext.asins || [])]
    });
    const stored = await storageGet(["pendingAmazonOrderSearchSubmission"]);
    const previous = stored.pendingAmazonOrderSearchSubmission || {};
    const sameOrder = String(previous.orderNumber || "") === String(marketplaceContext.orderNumber || "");
    const attemptedQueries = sameOrder && Array.isArray(previous.attemptedQueries)
      ? previous.attemptedQueries.map((value) => String(value || "").toLowerCase())
      : [];
    const query = queries.find((value) => !attemptedQueries.includes(value.toLowerCase()));
    if (!query) return false;
    const key = `${marketplaceContext.orderNumber}:${query.toLowerCase()}`;

    input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await storageSet({
      pendingAmazonOrderSearchSubmission: {
        key,
        asin,
        query,
        attemptedQueries: [...attemptedQueries, query.toLowerCase()],
        orderNumber: marketplaceContext.orderNumber,
        submittedAt: Date.now(),
        sourceUrl: location.href
      }
    });

    const submit = form.querySelector("input[type='submit'], button[type='submit']");
    if (typeof form.requestSubmit === "function") form.requestSubmit(submit || undefined);
    else if (submit) submit.click();
    else return false;
    return query;
  }

  async function resumePendingPoshmarkAmazonLookup() {
    const result = await storageGet(["pendingPoshmarkProfitContext", "pendingAmazonOrderDetailMatch"]);
    const marketplaceContext = activeMarketplaceContext(result.pendingPoshmarkProfitContext);
    if (!marketplaceContext?.asins?.length) return;

    if (isAmazonOrdersSearchPage() || isAmazonOrdersHistoryPage()) {
      const match = findAmazonOrderSearchMatch(marketplaceContext.asins[0]);
      if (!match) {
        const submittedQuery = await submitAmazonOrderSearch(marketplaceContext.asins[0], marketplaceContext);
        renderStatus(
          submittedQuery
            ? `Searching Amazon orders for "${submittedQuery}"; the exact ASIN will still be verified on order details...`
            : `No exact Amazon order result found for ${marketplaceContext.asins[0]} after title and ASIN searches. Verify the Amazon account or open the matching order manually.`,
          submittedQuery ? "ready" : "error"
        );
        return;
      }
      await storageSet({ pendingAmazonOrderDetailMatch: match });
      renderStatus(`Found Amazon order for ${match.asin}. Opening order details...`, "ready");
      location.assign(match.orderDetailsUrl);
      return;
    }

    if (isAmazonOrderDetailsPage()) {
      const currentItems = exactItemsOnCurrentOrder(marketplaceContext, result.pendingAmazonOrderDetailMatch || {});
      const mergedItems = await mergePendingMarketplaceItems(marketplaceContext, currentItems);
      const missing = missingMarketplaceAsins(marketplaceContext, mergedItems);
      if (currentItems.length && !missing.length) {
        renderStatus(`Matched ${mergedItems.length} exact Amazon item(s), total ${U.formatMoney(AUDIT.sumItemCosts(mergedItems))}. Click Review & Copy Amazon Info.`, "ready");
      } else if (currentItems.length) {
        renderStatus(`Matched ${mergedItems.length}/${marketplaceContext.asins.length} item(s). Still need ${missing.join(", ")}.`, "ready");
      } else {
        renderStatus(`Exact ASIN ${marketplaceContext.asins[0]} was not found on this Amazon order. Do not copy this order.`, "error");
      }
    }
  }

  function showAmazonPreview({ profileLabel, total, etas, titles, shippingBlock, marketplaceContext, matchedItems = [], orderEvidence = {} }) {
    document.getElementById("gldn-amazon-preview")?.remove();
    const exactMarketplaceTotal = marketplaceContext ? AUDIT.sumItemCosts(matchedItems) : null;
    const displayTotal = marketplaceContext ? exactMarketplaceTotal : total;
    const orderIds = marketplaceContext
      ? [...new Set(matchedItems.map((item) => item.orderId).filter(Boolean))]
      : [String(orderEvidence.orderId || "").trim()].filter(Boolean);
    const matchSources = marketplaceContext
      ? [...new Set(matchedItems.map((item) => item.source).filter(Boolean))]
      : [String(orderEvidence.source || "").trim()].filter(Boolean);

    const overlay = document.createElement("div");
    overlay.id = "gldn-amazon-preview";
    overlay.className = "gldn-modal-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-amazon-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Review Amazon Information</h2>
        <p class="gldn-help-text">${marketplaceContext ? "Confirm this Amazon info for the linked Poshmark order." : "Confirm these values before they are sent to eBay."}</p>
        <div class="gldn-field-row">
          <label class="gldn-label" for="gldn-amazon-total">${marketplaceContext ? "Amazon Item Cost" : "Amazon Order Total"}</label>
          <input id="gldn-amazon-total" class="gldn-text-input" inputmode="decimal" value="${displayTotal === null ? "" : U.formatMoney(displayTotal)}" ${marketplaceContext ? "readonly" : ""}>
          ${marketplaceContext ? `<div class="gldn-field-help">Locked to the exact item costs read from Amazon order details.</div>` : ""}
        </div>
        <div class="gldn-field-row">
          <label class="gldn-label" for="gldn-amazon-etas">ETA</label>
          <input id="gldn-amazon-etas" class="gldn-text-input" value="${escapeHtml((etas || []).join(", "))}" placeholder="7/2 or 7/2, 7/4">
          <div class="gldn-field-help">For multiple item ETAs, separate dates with commas.</div>
        </div>
        <div class="gldn-grid">
          <div><strong>Amazon profile</strong><span>${escapeHtml(profileLabel)}</span></div>
          <div><strong>Page</strong><span>${amazonPageLabel()}</span></div>
          <div><strong>Amazon ASINs</strong><span>${escapeHtml((titles.amazonAsins || []).join(", ") || "Not detected")}</span></div>
          ${marketplaceContext ? `<div><strong>Linked Poshmark order</strong><span>${escapeHtml(marketplaceContext.orderNumber)}</span></div>` : ""}
          ${marketplaceContext ? `<div><strong>Poshmark SKU ASINs</strong><span>${escapeHtml((marketplaceContext.asins || []).join(", ") || "Not detected")}</span></div>` : ""}
          <div><strong>Amazon order IDs</strong><span>${escapeHtml(orderIds.join(", ") || "Not detected")}</span></div>
          <div><strong>Match source</strong><span>${escapeHtml(matchSources.join(", ") || "Not detected")}</span></div>
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="copy">Copy Amazon Info</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>
    `;

    document.documentElement.appendChild(overlay);
    U.makePanelDraggable(overlay.querySelector(".gldn-modal"), "gldnAmazonReviewModalPosition");
    const totalInput = overlay.querySelector("#gldn-amazon-total");
    const etaInput = overlay.querySelector("#gldn-amazon-etas");
    const status = overlay.querySelector(".gldn-modal-status");
    const copyButton = overlay.querySelector("[data-action='copy']");

    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);

    copyButton.addEventListener("click", async () => {
      const correctedTotal = marketplaceContext ? AUDIT.sumItemCosts(matchedItems) : U.moneyToNumber(totalInput.value);
      const correctedEtas = etaInput.value
        .split(/[,;]+/)
        .map((value) => U.parseDateToMD(value) || value.trim())
        .filter(Boolean);

      if (correctedTotal === null || correctedTotal <= 0) {
        status.textContent = "Enter the correct Amazon Order Total.";
        return;
      }
      if (!correctedEtas.length && !marketplaceContext) {
        status.textContent = "Enter at least one ETA.";
        return;
      }

      const payload = {
        version: marketplaceContext ? 3 : 4,
        source: "amazon",
        total: Number(correctedTotal),
        profileLabel,
        etas: [...new Set(correctedEtas)],
        titles: titles.values || titles,
        asins: titles.amazonAsins || [],
        shippingBlock,
        capturedAt: new Date().toISOString(),
        confirmed: isConfirmationPage(),
        url: String(orderEvidence.url || location.href),
        orderId: orderIds.length === 1 ? orderIds[0] : "",
        orderIds,
        exactOrderDetails: marketplaceContext
          ? matchedItems.length > 0 && matchedItems.every((item) => AUDIT.hasExactEvidence(item))
          : orderEvidence.exactOrderDetails === true,
        evidenceSource: matchSources.length === 1 ? matchSources[0] : ""
      };
      if (marketplaceContext) {
        payload.marketplaceContext = marketplaceContext;
        payload.items = matchedItems.map((item) => AUDIT.normalizeItem(item));
        payload.orderIds = orderIds;
        payload.matchSources = matchSources;
        payload.orderUrls = [...new Set(payload.items.map((item) => item.orderUrl).filter(Boolean))];
      }

      const updates = { lastCopiedAmazonPayload: payload, pendingAmazonCheckout: payload };
      if (marketplaceContext?.orderNumber) {
        const saved = await storageGet(["poshmarkAmazonPayloadByOrder"]);
        updates.poshmarkAmazonPayloadByOrder = {
          ...(saved.poshmarkAmazonPayloadByOrder || {}),
          [String(marketplaceContext.orderNumber)]: payload
        };
      }
      await storageSet(updates);
      const clipboardText = U.PAYLOAD_PREFIX + JSON.stringify(payload);
      let clipboardCopied = true;
      try {
        await navigator.clipboard.writeText(clipboardText);
      } catch (error) {
        clipboardCopied = false;
        U.recordExtensionLog?.({
          source: "amazon-order-note",
          operation: "clipboard-write",
          level: "warning",
          message: "Reviewed Amazon order data was saved inside GLDN Ops, but Chrome blocked the optional clipboard copy.",
          detail: error?.message || String(error)
        });
      }
      if (marketplaceContext) {
        const pending = await storageGet(["pendingPoshmarkAmazonItemsByOrder"]);
        const byOrder = { ...(pending.pendingPoshmarkAmazonItemsByOrder || {}) };
        delete byOrder[String(marketplaceContext.orderNumber)];
        await storageSet({ pendingPoshmarkAmazonItemsByOrder: byOrder });
        await storageRemove(["pendingPoshmarkProfitContext", "pendingAmazonOrderDetailMatch", "pendingAmazonOrderSearchSubmission"]);
      }
      renderStatus(`Copied: ${U.formatMoney(payload.total)} - ${profileLabel} - ${payload.etas.join(", ")}`, "copied");
      status.textContent = marketplaceContext
        ? `${clipboardCopied ? "Copied and saved" : "Saved"} for Poshmark order ${marketplaceContext.orderNumber}. Return to that Poshmark order.`
        : `${clipboardCopied ? "Copied and saved" : "Saved"}. Return to the matching eBay order.`;
      setTimeout(close, 900);
    });

    totalInput.focus();
    totalInput.select();
  }

  async function copyAmazonInfo() {
    const result = await storageGet([
      "amazonProfileLabel",
      "pendingAmazonCheckout",
      "pendingPoshmarkProfitContext",
      "pendingAmazonOrderDetailMatch",
      "pendingPoshmarkAmazonItemsByOrder"
    ]);
    const profileLabel = (result.amazonProfileLabel || "").trim();
    if (!profileLabel) {
      await setProfileLabel();
      return;
    }

    const live = extractCheckoutData();
    const stored = result.pendingAmazonCheckout || cachedSnapshot || {};
    const marketplaceContext = activeMarketplaceContext(result.pendingPoshmarkProfitContext);
    if (isAmazonOrderDetailsPage() && !live.exactOrderDetails) {
      renderStatus("I could not verify this exact Amazon order card. No cached checkout data was used.", "error");
      return;
    }
    if (isAmazonOrderDetailsPage() && (!live.orderId || live.total === null || !live.asins.length)) {
      renderStatus("This Amazon order is missing an exact order ID, Grand Total, or product ASIN. Nothing was copied.", "error");
      return;
    }
    let matchedItems = [];
    if (marketplaceContext) {
      const orderKey = String(marketplaceContext.orderNumber || "");
      const previouslyMatched = result.pendingPoshmarkAmazonItemsByOrder?.[orderKey] || [];
      const currentItems = exactItemsOnCurrentOrder(marketplaceContext, result.pendingAmazonOrderDetailMatch || {});
      matchedItems = AUDIT.mergeItems(previouslyMatched, currentItems);
      const missing = missingMarketplaceAsins(marketplaceContext, matchedItems);
      if (missing.length) {
        await mergePendingMarketplaceItems(marketplaceContext, currentItems);
        renderStatus(`Exact Amazon order evidence is still missing for ${missing.join(", ")}. Open the matching order before copying.`, "error");
        return;
      }
      matchedItems = AUDIT.exactItemsForAsins(matchedItems, marketplaceContext.asins);
    }
    const total = marketplaceContext
      ? AUDIT.sumItemCosts(matchedItems)
      : isAmazonOrderDetailsPage()
      ? live.total
      : isConfirmationPage()
      ? (stored.total ?? live.total ?? null)
      : (live.total ?? stored.total ?? null);
    const etas = isConfirmationPage()
      ? (live.etas.length ? live.etas : (stored.etas || []))
      : isAmazonOrderDetailsPage()
      ? live.etas
      : (live.etas.length ? live.etas : (stored.etas || []));
    const titles = matchedItems.length
      ? matchedItems.map((item) => item.title).filter(Boolean)
      : isAmazonOrderDetailsPage()
      ? live.titles
      : (live.titles.length ? live.titles : (stored.titles || []));
    const asins = matchedItems.length
      ? matchedItems.map((item) => item.asin)
      : isAmazonOrderDetailsPage()
      ? live.asins
      : (live.asins.length ? live.asins : (stored.asins || []));
    const shippingBlock = isAmazonOrderDetailsPage()
      ? live.shippingBlock
      : (live.shippingBlock || stored.shippingBlock || "");

    showAmazonPreview({
      profileLabel,
      total,
      etas,
      titles: { values: titles, amazonAsins: asins },
      shippingBlock,
      marketplaceContext,
      matchedItems,
      orderEvidence: live
    });
  }

  function renderStatus(message, type = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  }

  function renderPassiveStatus(message, type = "") {
    if (Date.now() < statusHoldUntil) return;
    renderStatus(message, type);
  }

  function holdWorkflowStatus(message, type = "", holdMs = 120000) {
    statusHoldUntil = Date.now() + holdMs;
    renderStatus(message, type);
  }

  const subscribeSaveDelay = (ms = SUBSCRIBE_SAVE_ACTION_DELAY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

  function subscribeSaveText(element) {
    return SUBSCRIBE_SAVE.cleanText(element?.innerText || element?.textContent || "");
  }

  function isAmazonSubscribeSaveManagerPage() {
    return /\/(?:gp\/subscribe-and-save\/manager\/viewsubscriptions|auto-deliveries\/subscriptionList)/i.test(location.pathname);
  }

  function isVisibleSubscribeSaveElement(element) {
    return Boolean(element instanceof Element && U.isVisible(element));
  }

  function subscribeSaveAsin(element) {
    const direct = String(element?.getAttribute?.("data-asin") || "").trim().toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(direct)) return direct;
    const withAsin = element?.querySelector?.("[data-asin]");
    const nested = String(withAsin?.getAttribute?.("data-asin") || "").trim().toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(nested)) return nested;
    const anchor = element?.querySelector?.("a[href*='/dp/'], a[href*='/gp/product/']");
    return String(anchor?.href || anchor?.getAttribute?.("href") || "")
      .match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1]?.toUpperCase() || "";
  }

  function subscribeSaveTitle(element) {
    const candidates = [
      element?.querySelector?.("a.product-title"),
      element?.querySelector?.("a[href*='/dp/']"),
      element?.querySelector?.("a[href*='/gp/product/']"),
      element?.querySelector?.("[data-testid*='title' i]"),
      element?.querySelector?.("h2, h3, h4")
    ];
    for (const candidate of candidates) {
      const text = subscribeSaveText(candidate);
      if (text.length >= 4 && !SUBSCRIBE_SAVE.isRecommendationText(text)) return text;
    }
    const ignored = /^(next delivery|deliver every|delivery|quantity|edit|manage|cancel|subscription|subscribe|skip|change|\$)/i;
    return String(element?.innerText || element?.textContent || "")
      .split(/\n+/)
      .map((line) => SUBSCRIBE_SAVE.cleanText(line))
      .find((line) => line.length >= 8 && !ignored.test(line) && !SUBSCRIBE_SAVE.isRecommendationText(line)) || "";
  }

  function subscribeSaveHref(element) {
    const detailsLink = [...(element?.querySelectorAll?.("a[href]") || [])].find((anchor) => {
      const href = String(anchor.href || anchor.getAttribute("href") || "");
      const text = subscribeSaveText(anchor);
      return /subscribe|auto-deliver|subscription/i.test(href) || /^(edit|manage|view details)$/i.test(text);
    });
    const productLink = element?.querySelector?.("a[href*='/dp/'], a[href*='/gp/product/']");
    return String(detailsLink?.href || detailsLink?.getAttribute?.("href") || productLink?.href || productLink?.getAttribute?.("href") || "");
  }

  function subscribeSaveAddress(element) {
    const text = subscribeSaveText(element);
    const line = text.split(/\n+/).map((value) => SUBSCRIBE_SAVE.cleanText(value)).find((value) => /deliver(?:y|ing)? to|ship(?:ping)? to/i.test(value));
    return line || "";
  }

  function subscribeSaveSchedule(element) {
    const text = String(element?.innerText || element?.textContent || "");
    const lines = text.split(/\n+/).map((value) => SUBSCRIBE_SAVE.cleanText(value)).filter(Boolean);
    const nextDelivery = lines.find((value) => /\bnext delivery\s*:/i.test(value)) || "";
    const frequency = lines.find((value) => /\b\d+\s+units?\s+every\b/i.test(value))
      || lines.find((value) => /\bdeliver(?:y|ed)?\s+every\b/i.test(value))
      || "";
    return [nextDelivery, frequency].filter(Boolean).join(" | ");
  }

  function subscribeSaveSubscriptionKey(element) {
    const direct = [
      element?.getAttribute?.("data-subscription-id"),
      element?.dataset?.subscriptionId,
      element?.getAttribute?.("data-subscriptionid")
    ].map((value) => String(value || "").trim()).find(Boolean);
    if (direct) return direct;
    const links = [...(element?.querySelectorAll?.("a[href]") || [])];
    for (const link of links) {
      const href = String(link.href || link.getAttribute("href") || "");
      if (!/subscribe|auto-deliver|subscription/i.test(href)) continue;
      const match = href.match(/[?&](?:subscriptionId|subscription-id|id)=([^&#]+)/i);
      if (match) return decodeURIComponent(match[1]);
    }
    return "";
  }

  function subscribeSaveTargetFromCard(element, layout, index) {
    const subscriptionKey = subscribeSaveSubscriptionKey(element);
    return SUBSCRIBE_SAVE.normalizeTarget({
      id: subscriptionKey,
      subscriptionKey,
      title: subscribeSaveTitle(element),
      asin: subscribeSaveAsin(element),
      href: subscribeSaveHref(element),
      address: subscribeSaveAddress(element),
      schedule: subscribeSaveSchedule(element),
      layout,
      status: "pending"
    }, index);
  }

  function nodeComesAfter(node, reference) {
    return Boolean(node && reference && (reference.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING));
  }

  function oldSubscribeSaveEntries() {
    const container = document.querySelector("#subscription-page-container");
    if (!container) return [];
    const reported = Number.parseInt(String(document.querySelector("#totalSubscriptionCount")?.textContent || ""), 10);
    if (reported === 0) return [];
    const raw = [...container.querySelectorAll(".subscription-card, [data-subscription-id]")];
    const cards = [...new Set(raw.map((candidate) => candidate.closest(".subscription-card") || candidate))];
    return cards
      .filter((card) => !card.matches(".store-front-ingress-container") && !card.querySelector(".store-front-ingress"))
      .filter((card) => {
        const text = subscribeSaveText(card);
        if (!text || SUBSCRIBE_SAVE.isRecommendationText(text)) return false;
        return Boolean(
          card.getAttribute("data-subscription-id")
          || card.querySelector("[data-subscription-id]")
          || [...card.querySelectorAll("button, a, input")].some((control) => /^(edit|manage|view details|subscription details|cancel subscription)$/i.test(SUBSCRIBE_SAVE.cleanText(control.innerText || control.value || control.getAttribute("aria-label"))))
        );
      })
      .map((element, index) => ({ element, target: subscribeSaveTargetFromCard(element, "legacy", index) }))
      .filter((entry) => entry.target.title);
  }

  function modernSubscribeSaveEntries() {
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, [role='heading']")].filter(isVisibleSubscribeSaveElement);
    const start = headings.find((element) => /^your subscriptions(?:\s*\(\d+\))?$/i.test(subscribeSaveText(element)));
    if (!start) return [];
    const boundary = headings.find((element) => nodeComesAfter(element, start) && /^(buy it again|recommended for you|shop subscriptions)/i.test(subscribeSaveText(element)));
    const raw = [...document.querySelectorAll("article, li, [data-subscription-id], [data-testid*='subscription' i], [class*='subscription-card' i], main div")]
      .filter((element) => element.isConnected)
      .filter((element) => nodeComesAfter(element, start) && (!boundary || nodeComesAfter(boundary, element)))
      .filter((element) => {
        const text = subscribeSaveText(element);
        return text.length < 6000
          && /\bnext delivery\s*:/i.test(text)
          && /\b\d+\s+units?\s+every\b/i.test(text)
          && !SUBSCRIBE_SAVE.isRecommendationText(text);
      });
    const cards = raw.filter((candidate) => !raw.some((other) => other !== candidate && candidate.contains(other)));
    return cards
      .map((element, index) => ({ element, target: subscribeSaveTargetFromCard(element, "modern", index) }))
      .filter((entry) => entry.target.title);
  }

  function subscriptionEntriesForPage() {
    const legacy = oldSubscribeSaveEntries();
    if (document.querySelector("#subscription-page-container")) return { layout: "legacy", entries: legacy };
    return { layout: "modern", entries: modernSubscribeSaveEntries() };
  }

  function subscribeSaveReportedCount(layout, entries) {
    if (layout === "legacy") {
      const total = Number.parseInt(String(document.querySelector("#totalSubscriptionCount")?.textContent || ""), 10);
      return Number.isInteger(total) && total >= 0 ? total : entries.length;
    }
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, [role='heading']")];
    const heading = headings.find((element) => /^your subscriptions\b/i.test(subscribeSaveText(element)));
    const headingText = subscribeSaveText(heading);
    const headingCount = Number.parseInt(headingText.match(/your subscriptions\D+(\d+)\b/i)?.[1] || "", 10);
    if (Number.isInteger(headingCount) && headingCount >= 0) return headingCount;
    const nearby = SUBSCRIBE_SAVE.cleanText(heading?.parentElement?.innerText || heading?.parentElement?.textContent || "");
    const itemTotal = Number.parseInt(nearby.match(/\b\d+\s+of\s+(\d+)\s+items?\b/i)?.[1] || "", 10);
    return Number.isInteger(itemTotal) && itemTotal >= 0 ? itemTotal : entries.length;
  }

  function subscribeSaveScope(layout) {
    const controls = [...document.querySelectorAll("button, [role='button'], [role='option'], select, option")].filter(isVisibleSubscribeSaveElement);
    const allAddresses = controls.find((element) => /^all addresses(?:\s*\((\d+)\))?$/i.test(subscribeSaveText(element)));
    const count = Number.parseInt(subscribeSaveText(allAddresses).match(/\((\d+)\)/)?.[1] || "", 10);
    if (allAddresses) {
      return {
        scopeMode: "all-addresses",
        scopeSummary: subscribeSaveText(allAddresses),
        expectedScopeCount: 1,
        verifiedScopeCount: 1,
        addressCount: Number.isInteger(count) && count > 0 ? count : null
      };
    }
    return {
      scopeMode: layout === "legacy" ? "legacy-subscriptions-view" : "current-amazon-account",
      scopeSummary: layout === "legacy" ? "Legacy subscriptions view" : "Current Amazon account",
      expectedScopeCount: 1,
      verifiedScopeCount: 1
    };
  }

  function amazonSubscribeSaveBlocker() {
    const title = SUBSCRIBE_SAVE.cleanText(document.title);
    const body = SUBSCRIBE_SAVE.cleanText(document.body?.innerText).slice(0, 5000);
    if (/captcha|robot check/i.test(title) || /enter the characters you see below|sorry, we just need to make sure you're not a robot/i.test(body)) {
      return "Amazon is showing a verification challenge.";
    }
    if (/\/ap\/signin/i.test(location.pathname) || document.querySelector("form[name='signIn'], #authportal-main-section")) {
      return "This Amazon Chrome profile is not signed in.";
    }
    return "";
  }

  async function scanAmazonSubscribeSavePage() {
    const blocker = amazonSubscribeSaveBlocker();
    if (blocker) throw new Error(blocker);
    if (!isAmazonSubscribeSaveManagerPage()) throw new Error("Open Amazon Manage Your Subscriptions before scanning.");

    const originalY = window.scrollY;
    let best = subscriptionEntriesForPage();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const reported = subscribeSaveReportedCount(best.layout, best.entries);
      const exact = SUBSCRIBE_SAVE.uniqueTargets(best.entries.map((entry) => entry.target));
      if (reported === 0 || exact.length >= reported) break;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      await subscribeSaveDelay(650);
      const next = subscriptionEntriesForPage();
      const nextExact = SUBSCRIBE_SAVE.uniqueTargets(next.entries.map((entry) => entry.target));
      if (nextExact.length >= exact.length) best = next;
    }
    window.scrollTo({ top: originalY, behavior: "auto" });

    const targets = SUBSCRIBE_SAVE.uniqueTargets(best.entries.map((entry) => entry.target));
    const reportedCount = subscribeSaveReportedCount(best.layout, best.entries);
    if (reportedCount > targets.length) {
      throw new Error(`Amazon reports ${reportedCount} active subscriptions, but only ${targets.length} exact cards from Your Subscriptions loaded. Recommendation carousels were not clicked. Reload the manager and try again; nothing was cancelled.`);
    }
    const scope = subscribeSaveScope(best.layout);
    return {
      layout: best.layout,
      targets,
      reportedCount,
      recommendationCount: [...document.querySelectorAll("button, input, [role='button']")]
        .filter((element) => /^subscribe now$/i.test(SUBSCRIBE_SAVE.cleanText(element.innerText || element.value || element.getAttribute("aria-label")))).length,
      ...scope
    };
  }

  function amazonSubscribeSaveAccountLabel() {
    const text = SUBSCRIBE_SAVE.cleanText(document.querySelector("#nav-link-accountList-nav-line-1")?.textContent || document.querySelector("#nav-link-accountList")?.textContent);
    return text.replace(/^hello,?\s*/i, "") || "Signed-in Amazon account";
  }

  async function amazonSubscribeSaveIdentity() {
    const stored = await storageGet(["computerLabel", "ebayAccountLabel", "amazonProfileLabel"]);
    const computerLabel = String(stored.computerLabel || "").trim();
    const computerIdentity = FOUNDATION.identityForComputer(computerLabel);
    return {
      computerLabel,
      ebayAccountLabel: computerIdentity.ebayAccountLabel || String(stored.ebayAccountLabel || "").trim().toUpperCase(),
      amazonProfileLabel: String(stored.amazonProfileLabel || "").trim(),
      amazonAccountLabel: amazonSubscribeSaveAccountLabel()
    };
  }

  function subscribeSaveRunId() {
    return globalThis.crypto?.randomUUID?.() || `subscribe-save-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function currentAmazonOwnerTabId() {
    const info = await runtimeMessage({ type: "currentTabInfo" });
    if (!info?.ok || !Number.isInteger(info.tabId)) throw new Error("This Amazon tab could not be identified. Reload it and try again.");
    return info.tabId;
  }

  function closeAmazonSubscribeSaveReview() {
    document.getElementById("gldn-amazon-subscribe-save-review")?.remove();
  }

  function showAmazonSubscribeSaveResult(record) {
    document.getElementById("gldn-amazon-subscribe-save-result")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "gldn-amazon-subscribe-save-result";
    overlay.className = "gldn-modal-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-amazon-subscribe-save-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Current Amazon Profile Complete</h2>
        <div class="gldn-grid">
          <div><strong>Amazon profile</strong><span>${escapeHtml(record.amazonProfileLabel || record.amazonAccountLabel || "Current profile")}</span></div>
          <div><strong>Cancelled</strong><span>${Number(record.cancelledCount || 0).toLocaleString()}</span></div>
          <div><strong>Active subscriptions remaining</strong><span>0</span></div>
          <div><strong>Scope verified</strong><span>${escapeHtml(record.scopeSummary || "Current Amazon account")}</span></div>
        </div>
        <p class="gldn-help-text">Verified zero active subscriptions in this Amazon profile. Recommended products were not touched. Repeat this workflow in every other signed-in Amazon Chrome profile; the ALL Amazon Accounts task stays unchecked until that is complete.</p>
        <div class="gldn-actions"><button type="button" class="gldn-primary" data-action="close">Done</button></div>
        <div class="gldn-modal-status">${escapeHtml(record.dashboardSyncMessage || "Saved locally.")}</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    const modal = overlay.querySelector(".gldn-modal");
    U.enhanceModal(modal);
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='close']").addEventListener("click", close);
  }

  async function completeAmazonSubscribeSaveRun(state, scan) {
    const completedAt = new Date().toISOString();
    const record = {
      featureKey: "amazon-subscribe-save",
      status: "Completed",
      proofType: "verified-zero-active-subscriptions-current-profile",
      currentProfileVerified: true,
      allProfilesVerified: false,
      verifiedZeroRemaining: true,
      remainingCount: 0,
      failedCount: 0,
      cancelledCount: Array.isArray(state.cancelledIds) ? state.cancelledIds.length : 0,
      scannedCount: Number(state.initialScannedCount ?? state.expectedCount ?? 0),
      expectedScopeCount: Number(scan.expectedScopeCount || state.expectedScopeCount || 1),
      verifiedScopeCount: Number(scan.verifiedScopeCount || state.verifiedScopeCount || 1),
      scopeMode: scan.scopeMode || state.scopeMode || "current-amazon-account",
      scopeSummary: scan.scopeSummary || state.scopeSummary || "Current Amazon account",
      computerLabel: state.computerLabel || "",
      ebayAccountLabel: state.ebayAccountLabel || "",
      amazonProfileLabel: state.amazonProfileLabel || "",
      amazonAccountLabel: state.amazonAccountLabel || "",
      runId: state.runId,
      pageUrl: location.href,
      startedAt: state.startedAt,
      completedAt
    };
    const proof = SUBSCRIBE_SAVE.completionProof(record);
    if (!proof.ok) throw new Error("The final Subscribe & Save zero-subscription proof was incomplete.");
    const finishedState = {
      ...state,
      active: false,
      phase: "completed",
      targets: [],
      remainingCount: 0,
      failedCount: 0,
      verifiedZeroRemaining: true,
      proofType: record.proofType,
      completedAt
    };
    await storageSet({ [SUBSCRIBE_SAVE_STATE_KEY]: finishedState, [SUBSCRIBE_SAVE_RESULT_KEY]: record });
    let syncMessage = "Saved locally. Shared profile-proof sync is pending.";
    try {
      const sync = await runtimeMessage({ type: "syncAmazonSubscribeSaveProfile", record });
      syncMessage = sync?.ok
        ? "Current Amazon profile proof was saved. The ALL Amazon Accounts task remains unchecked."
        : `Saved locally. Shared profile-proof sync queued: ${sync?.error || "dashboard unavailable"}`;
    } catch (error) {
      syncMessage = `Saved locally. Shared profile-proof sync queued: ${error.message}`;
    }
    const finalRecord = { ...record, dashboardSyncMessage: syncMessage };
    await storageSet({ [SUBSCRIBE_SAVE_RESULT_KEY]: finalRecord });
    holdWorkflowStatus(`Current Amazon profile complete: ${record.cancelledCount} cancelled, 0 active remaining. Repeat in every other Amazon Chrome profile.`, "completed");
    closeAmazonSubscribeSaveReview();
    showAmazonSubscribeSaveResult(finalRecord);
    return finalRecord;
  }

  async function stopAmazonSubscribeSaveRun(message, phase = "manual-reconciliation-required") {
    const stored = await storageGet([SUBSCRIBE_SAVE_STATE_KEY]);
    const state = stored[SUBSCRIBE_SAVE_STATE_KEY] || {};
    const failure = { message: String(message || "Subscribe & Save stopped safely."), at: new Date().toISOString() };
    await storageSet({
      [SUBSCRIBE_SAVE_STATE_KEY]: {
        ...state,
        active: false,
        phase,
        error: failure.message,
        failures: [...(Array.isArray(state.failures) ? state.failures : []), failure]
      }
    });
    closeAmazonSubscribeSaveReview();
    holdWorkflowStatus(`${failure.message} No unapproved cancellation was attempted.`, "error");
    return { ok: false, error: failure.message };
  }

  function showAmazonSubscribeSaveReview(state) {
    closeAmazonSubscribeSaveReview();
    const count = Number(state.expectedCount || 0);
    if (!count) return;
    const exactToken = SUBSCRIBE_SAVE.approvalToken(count);
    const overlay = document.createElement("div");
    overlay.id = "gldn-amazon-subscribe-save-review";
    overlay.className = "gldn-modal-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-amazon-subscribe-save-modal">
        <button type="button" class="gldn-close" aria-label="Close review">x</button>
        <h2>Approve Subscribe &amp; Save Cancellations</h2>
        <p class="gldn-help-text">Amazon reports <strong>${count}</strong> active subscription${count === 1 ? "" : "s"} for ${escapeHtml(state.scopeSummary || "this Amazon account")}. Recommended products are excluded.</p>
        <div class="gldn-sales-list gldn-subscribe-save-list">
          ${(state.targets || []).map((target, index) => `<div class="gldn-subscribe-save-row"><strong>${index + 1}. ${escapeHtml(target.title)}</strong><span>${escapeHtml(target.asin || target.address || "Exact subscription card")}</span></div>`).join("")}
        </div>
        <div class="gldn-field-row">
          <label class="gldn-label" for="gldn-subscribe-save-approval">Type ${escapeHtml(exactToken)}</label>
          <input id="gldn-subscribe-save-approval" class="gldn-text-input" autocomplete="off" spellcheck="false">
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel Safely</button>
          <button type="button" class="gldn-primary" data-action="approve" disabled>Approve Cancel ${count}</button>
        </div>
        <div class="gldn-modal-status">No Amazon cancellation control has been clicked.</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    const modal = overlay.querySelector(".gldn-modal");
    U.enhanceModal(modal);
    const input = overlay.querySelector("#gldn-subscribe-save-approval");
    const approve = overlay.querySelector("[data-action='approve']");
    const status = overlay.querySelector(".gldn-modal-status");
    input.addEventListener("input", () => {
      approve.disabled = !SUBSCRIBE_SAVE.validateApprovalToken(input.value, count);
    });
    overlay.querySelector(".gldn-close").addEventListener("click", () => overlay.remove());
    overlay.querySelector("[data-action='cancel']").addEventListener("click", async () => {
      await stopAmazonSubscribeSaveRun("Subscribe & Save cancellation was cancelled by the operator.", "cancelled");
      overlay.remove();
    });
    approve.addEventListener("click", async () => {
      approve.disabled = true;
      status.textContent = "Rechecking the exact subscriptions before approval is released...";
      const result = await approveAmazonSubscribeSave(input.value);
      if (!result?.ok) {
        status.textContent = result?.error || "Approval could not be verified.";
        status.dataset.type = "error";
        approve.disabled = false;
      }
    });
    input.focus();
  }

  async function startAmazonSubscribeSaveWorkflow() {
    if (subscribeSaveWorkerBusy) return { ok: false, error: "Subscribe & Save is already scanning." };
    subscribeSaveWorkerBusy = true;
    try {
      const ownerTabId = await currentAmazonOwnerTabId();
      const identity = await amazonSubscribeSaveIdentity();
      if (!isAmazonSubscribeSaveManagerPage()) {
        await storageSet({
          [SUBSCRIBE_SAVE_STATE_KEY]: {
            active: true,
            phase: "opening-manager",
            runId: subscribeSaveRunId(),
            ownerTabId,
            ...identity,
            targets: [],
            cancelledIds: [],
            failures: [],
            startedAt: new Date().toISOString()
          }
        });
        location.assign(SUBSCRIBE_SAVE_MANAGER_URL);
        return { ok: true, navigating: true };
      }

      holdWorkflowStatus("Scanning exact Amazon subscription cards...", "ready");
      const scan = await scanAmazonSubscribeSavePage();
      const stored = await storageGet([SUBSCRIBE_SAVE_STATE_KEY]);
      const previous = stored[SUBSCRIBE_SAVE_STATE_KEY] || {};
      const state = {
        active: scan.targets.length > 0,
        phase: scan.targets.length ? "awaiting-approval" : "verifying-zero",
        runId: previous.runId || subscribeSaveRunId(),
        ownerTabId,
        ...identity,
        pageUrl: location.href,
        layout: scan.layout,
        targets: scan.targets,
        expectedCount: scan.targets.length,
        initialScannedCount: scan.targets.length,
        cancelledIds: [],
        failures: [],
        recommendationCount: scan.recommendationCount,
        expectedScopeCount: scan.expectedScopeCount,
        verifiedScopeCount: scan.verifiedScopeCount,
        scopeMode: scan.scopeMode,
        scopeSummary: scan.scopeSummary,
        startedAt: previous.startedAt || new Date().toISOString(),
        scannedAt: new Date().toISOString()
      };
      await storageSet({ [SUBSCRIBE_SAVE_STATE_KEY]: state });
      if (!state.expectedCount) {
        await completeAmazonSubscribeSaveRun(state, scan);
        return { ok: true, completed: true, count: 0 };
      }
      holdWorkflowStatus(`Review ready: ${state.expectedCount} exact active subscription${state.expectedCount === 1 ? "" : "s"}.`, "ready");
      showAmazonSubscribeSaveReview(state);
      return { ok: true, reviewReady: true, count: state.expectedCount };
    } catch (error) {
      return stopAmazonSubscribeSaveRun(error.message || String(error), "scan-failed");
    } finally {
      subscribeSaveWorkerBusy = false;
    }
  }

  async function approveAmazonSubscribeSave(confirmationToken) {
    if (subscribeSaveWorkerBusy) return { ok: false, error: "Subscribe & Save is already working." };
    subscribeSaveWorkerBusy = true;
    try {
      const stored = await storageGet([SUBSCRIBE_SAVE_STATE_KEY]);
      const state = stored[SUBSCRIBE_SAVE_STATE_KEY] || {};
      const count = Number(state.expectedCount || 0);
      if (state.phase !== "awaiting-approval" || !state.active || !count) throw new Error("There is no exact Subscribe & Save review awaiting approval.");
      if (!SUBSCRIBE_SAVE.validateApprovalToken(confirmationToken, count)) throw new Error(`Approval must exactly match ${SUBSCRIBE_SAVE.approvalToken(count)}.`);
      if (Number(state.ownerTabId) !== await currentAmazonOwnerTabId()) throw new Error("This is not the owner tab for the Subscribe & Save review.");
      const scan = await scanAmazonSubscribeSavePage();
      const reviewedSignatures = SUBSCRIBE_SAVE.reviewSignatureList(state.targets || []);
      const currentSignatures = SUBSCRIBE_SAVE.reviewSignatureList(scan.targets);
      if (reviewedSignatures.length !== currentSignatures.length || reviewedSignatures.some((signature, index) => signature !== currentSignatures[index])) {
        throw new Error("Amazon's active subscriptions changed after review. Scan again for a new exact count.");
      }
      await storageSet({
        [SUBSCRIBE_SAVE_STATE_KEY]: {
          ...state,
          phase: "cancelling",
          approvalToken: confirmationToken,
          approvedAt: new Date().toISOString(),
          approvedCount: count,
          finalClickCount: 0
        }
      });
      closeAmazonSubscribeSaveReview();
      holdWorkflowStatus(`Approved ${count}. Cancelling one verified subscription at a time...`, "ready");
    } catch (error) {
      subscribeSaveWorkerBusy = false;
      return stopAmazonSubscribeSaveRun(error.message || String(error), "approval-invalidated");
    }
    subscribeSaveWorkerBusy = false;
    return resumeAmazonSubscribeSaveWorkflow();
  }

  function exactSubscribeSaveControl(label, root = document) {
    const expected = SUBSCRIBE_SAVE.cleanText(label).toLowerCase();
    return [...root.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button']")]
      .filter(isVisibleSubscribeSaveElement)
      .find((element) => SUBSCRIBE_SAVE.cleanText(element.innerText || element.value || element.getAttribute("aria-label")).toLowerCase() === expected) || null;
  }

  function subscribeSaveTargetMatches(candidate, target) {
    const wantedKey = SUBSCRIBE_SAVE.cleanText(target?.subscriptionKey).toLowerCase();
    const candidateKey = SUBSCRIBE_SAVE.cleanText(candidate?.subscriptionKey).toLowerCase();
    if (wantedKey || candidateKey) return Boolean(wantedKey && candidateKey && wantedKey === candidateKey);
    const wantedSignature = SUBSCRIBE_SAVE.reviewSignature(target);
    const candidateSignature = SUBSCRIBE_SAVE.reviewSignature(candidate);
    if (wantedSignature && wantedSignature === candidateSignature) return true;
    const wantedAsin = String(target?.asin || "").toUpperCase();
    const wantedTitle = SUBSCRIBE_SAVE.normalizeTitle(target?.title);
    return (wantedAsin && candidate?.asin === wantedAsin)
      || (wantedTitle && SUBSCRIBE_SAVE.normalizeTitle(candidate?.title) === wantedTitle);
  }

  function subscriptionEntryMatchingTarget(target, visibleOnly = true) {
    const entries = subscriptionEntriesForPage().entries;
    return entries.find((entry) => (!visibleOnly || isVisibleSubscribeSaveElement(entry.element)) && subscribeSaveTargetMatches(entry.target, target)) || null;
  }

  function subscribeSavePagingControl(target, direction = "next") {
    const entries = subscriptionEntriesForPage().entries;
    const matching = entries.find((entry) => subscribeSaveTargetMatches(entry.target, target));
    let root = matching?.element?.parentElement || entries[0]?.element?.parentElement || null;
    const pattern = direction === "previous"
      ? /^(?:previous|previous page|previous slide|previous subscriptions?|back)$/i
      : /^(?:next|next page|next slide|next subscriptions?|more subscriptions?)$/i;
    for (let depth = 0; root && root !== document.body && depth < 9; depth += 1, root = root.parentElement) {
      const control = [...root.querySelectorAll("button, a, input[type='button'], [role='button']")]
        .filter(isVisibleSubscribeSaveElement)
        .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true")
        .find((element) => {
          const label = SUBSCRIBE_SAVE.cleanText(element.innerText || element.value || element.getAttribute("aria-label") || element.getAttribute("title"));
          return pattern.test(label);
        });
      if (control) return control;
    }
    return null;
  }

  function visibleSubscribeSavePageSignature() {
    return SUBSCRIBE_SAVE.reviewSignatureList(
      subscriptionEntriesForPage().entries
        .filter((entry) => isVisibleSubscribeSaveElement(entry.element))
        .map((entry) => entry.target)
    ).join("||");
  }

  async function findVisibleSubscribeSaveEntry(target, expectedCount) {
    const first = subscriptionEntryMatchingTarget(target, true);
    if (first) return first;
    const seenPages = new Set();
    const maxAttempts = Math.min(100, Math.max(3, Number(expectedCount || 0) + 2));
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const signature = visibleSubscribeSavePageSignature();
      if (seenPages.has(signature)) break;
      seenPages.add(signature);
      const next = subscribeSavePagingControl(target, "next");
      if (!next) break;
      next.click();
      await U.waitFor(() => {
        const match = subscriptionEntryMatchingTarget(target, true);
        return match || visibleSubscribeSavePageSignature() !== signature;
      }, 5000, 200);
      const match = subscriptionEntryMatchingTarget(target, true);
      if (match) return match;
    }
    return null;
  }

  async function openSubscribeSaveTarget(state, target) {
    const entry = await findVisibleSubscribeSaveEntry(target, state.expectedCount);
    if (!entry) return { missing: true };
    const action = [...entry.element.querySelectorAll("button, a, input[type='button'], [role='button']")]
      .filter(isVisibleSubscribeSaveElement)
      .find((element) => /^(edit|manage|view details|subscription details)$/i.test(SUBSCRIBE_SAVE.cleanText(element.innerText || element.value || element.getAttribute("aria-label"))));
    await storageSet({
      [SUBSCRIBE_SAVE_STATE_KEY]: {
        ...state,
        phase: "opening-subscription-details",
        currentTargetId: target.id,
        currentTargetTitle: target.title,
        targetOpenedAt: new Date().toISOString()
      }
    });
    (action || entry.element).click();
    await subscribeSaveDelay();
    return { opened: true };
  }

  function subscribeSaveTargetIsVisible(target) {
    const wanted = SUBSCRIBE_SAVE.normalizeTitle(target?.title);
    if (!wanted) return false;
    const page = SUBSCRIBE_SAVE.normalizeTitle(document.body?.innerText);
    const meaningful = wanted.split(" ").slice(0, 8).join(" ");
    return meaningful.length >= 8 && page.includes(meaningful);
  }

  async function processAmazonSubscribeSaveDetails(state, target) {
    if (!SUBSCRIBE_SAVE.validateApprovalToken(state.approvalToken, state.approvedCount)) {
      throw new Error("The exact cancellation approval is no longer valid.");
    }
    const cancel = await U.waitFor(() => exactSubscribeSaveControl("Cancel subscription"), 15000, 250);
    if (!cancel || !subscribeSaveTargetIsVisible(target)) {
      throw new Error(`Could not verify the Cancel subscription control for ${target.title}.`);
    }
    cancel.click();
    const confirmation = await U.waitFor(() => {
      const dialogs = [...document.querySelectorAll("[role='dialog'], .a-modal-scroller, .a-popover-wrapper, [class*='modal' i]")].filter(isVisibleSubscribeSaveElement);
      return dialogs.find((dialog) => /cancel your subscription\?/i.test(subscribeSaveText(dialog)) && exactSubscribeSaveControl("Cancel my subscription", dialog));
    }, 12000, 250);
    if (!confirmation) throw new Error(`Amazon did not open the final cancellation review for ${target.title}.`);
    const finalButton = exactSubscribeSaveControl("Cancel my subscription", confirmation);
    if (!finalButton || !SUBSCRIBE_SAVE.validateApprovalToken(state.approvalToken, state.approvedCount)) {
      throw new Error("The final Amazon cancellation button or exact approval could not be verified.");
    }
    const refreshed = (await storageGet([SUBSCRIBE_SAVE_STATE_KEY]))[SUBSCRIBE_SAVE_STATE_KEY] || {};
    if (Number(refreshed.finalClickCount || 0) !== 0 || refreshed.currentTargetId !== target.id) {
      throw new Error("The final Amazon cancellation click was already dispatched or the target changed.");
    }
    await storageSet({
      [SUBSCRIBE_SAVE_STATE_KEY]: {
        ...refreshed,
        phase: "final-confirmation-pending",
        finalClickCount: 1,
        finalClickDispatchedAt: new Date().toISOString()
      }
    });
    finalButton.click();
    const confirmed = await U.waitFor(() => /cancellation confirmed|subscription (?:was )?cancelled|subscription (?:was )?canceled/i.test(SUBSCRIBE_SAVE.cleanText(document.body?.innerText)), 15000, 300);
    if (!confirmed) {
      throw new Error(`Amazon did not show cancellation confirmation for ${target.title}. Review it manually before retrying.`);
    }
    const latest = (await storageGet([SUBSCRIBE_SAVE_STATE_KEY]))[SUBSCRIBE_SAVE_STATE_KEY] || refreshed;
    const cancelledIds = [...new Set([...(latest.cancelledIds || []), target.id])];
    await storageSet({
      [SUBSCRIBE_SAVE_STATE_KEY]: {
        ...latest,
        phase: "cancelling",
        cancelledIds,
        currentTargetId: "",
        currentTargetTitle: "",
        finalClickCount: 0,
        lastCancelledAt: new Date().toISOString()
      }
    });
    holdWorkflowStatus(`Cancelled ${cancelledIds.length}/${Number(latest.expectedCount || cancelledIds.length)}. Verifying the manager...`, "ready");
    location.assign(SUBSCRIBE_SAVE_MANAGER_URL);
    return { ok: true, navigating: true };
  }

  async function resumeAmazonSubscribeSaveWorkflow() {
    if (subscribeSaveWorkerBusy) return { ok: false, error: "Subscribe & Save is already working." };
    subscribeSaveWorkerBusy = true;
    try {
      const stored = await storageGet([SUBSCRIBE_SAVE_STATE_KEY]);
      const state = stored[SUBSCRIBE_SAVE_STATE_KEY];
      if (!state) return { ok: true, active: false };
      const ownerTabId = await currentAmazonOwnerTabId();
      if (Number(state.ownerTabId) !== ownerTabId) return { ok: true, ownerTab: false };
      if (state.phase === "awaiting-approval") {
        showAmazonSubscribeSaveReview(state);
        return { ok: true, reviewReady: true, count: state.expectedCount };
      }
      if (!state.active) return { ok: true, active: false, phase: state.phase };
      if (["opening-manager", "scanning"].includes(state.phase)) {
        subscribeSaveWorkerBusy = false;
        return startAmazonSubscribeSaveWorkflow();
      }
      if (state.phase === "final-confirmation-pending") {
        const confirmed = /cancellation confirmed|subscription (?:was )?cancelled|subscription (?:was )?canceled/i.test(SUBSCRIBE_SAVE.cleanText(document.body?.innerText));
        if (!confirmed) throw new Error("A final Amazon cancellation click was dispatched, but confirmation is unknown. Review it manually before retrying.");
        const cancelledIds = [...new Set([...(state.cancelledIds || []), state.currentTargetId].filter(Boolean))];
        await storageSet({ [SUBSCRIBE_SAVE_STATE_KEY]: { ...state, phase: "cancelling", cancelledIds, currentTargetId: "", finalClickCount: 0 } });
        location.assign(SUBSCRIBE_SAVE_MANAGER_URL);
        return { ok: true, navigating: true };
      }
      if (!["cancelling", "opening-subscription-details"].includes(state.phase)) return { ok: true, phase: state.phase };
      if (!SUBSCRIBE_SAVE.validateApprovalToken(state.approvalToken, state.approvedCount)) throw new Error("The saved exact approval is invalid.");
      const target = (state.targets || []).find((candidate) => candidate.id === state.currentTargetId)
        || (state.targets || []).find((candidate) => !(state.cancelledIds || []).includes(candidate.id));
      if (!target) {
        if (!isAmazonSubscribeSaveManagerPage()) {
          location.assign(SUBSCRIBE_SAVE_MANAGER_URL);
          return { ok: true, navigating: true };
        }
        const finalScan = await scanAmazonSubscribeSavePage();
        if (finalScan.targets.length) throw new Error(`Amazon still shows ${finalScan.targets.length} active subscription(s). A new exact review is required.`);
        await completeAmazonSubscribeSaveRun(state, finalScan);
        return { ok: true, completed: true };
      }
      if (!isAmazonSubscribeSaveManagerPage() || state.phase === "opening-subscription-details") {
        return processAmazonSubscribeSaveDetails(state, target);
      }
      const opened = await openSubscribeSaveTarget(state, target);
      if (opened.missing) {
        throw new Error(`Amazon no longer shows the reviewed subscription card for ${target.title}. Nothing was counted as cancelled. Run a fresh scan and review the new exact count.`);
      }
      const current = (await storageGet([SUBSCRIBE_SAVE_STATE_KEY]))[SUBSCRIBE_SAVE_STATE_KEY];
      if (current?.phase === "opening-subscription-details" && isAmazonSubscribeSaveManagerPage()) {
        return processAmazonSubscribeSaveDetails(current, target);
      }
      return { ok: true, opened: true };
    } catch (error) {
      return stopAmazonSubscribeSaveRun(error.message || String(error));
    } finally {
      subscribeSaveWorkerBusy = false;
    }
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

  function allowedAmazonWorkflowTitle(title) {
    return FOUNDATION.allowedBulkProductTitle(title);
  }

  function bestAmazonProductTitle() {
    const selected = String(window.getSelection?.() || "").trim();
    if (selected.length > 8 && allowedAmazonWorkflowTitle(selected)) return selected;
    const productTitle = document.querySelector("#productTitle");
    const exactTitle = String(productTitle?.textContent || "").trim();
    if (exactTitle && allowedAmazonWorkflowTitle(exactTitle)) return exactTitle;
    const selectors = [
      "[data-asin] a[href*='/dp/'] span",
      ".a-carousel-card a[href*='/dp/'] span",
      "a[href*='/dp/'] span"
    ];
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)]
        .map((element) => String(element.textContent || "").trim())
        .find((text) => text.length > 18 && !/^\$?\d+(\.\d+)?$/.test(text) && allowedAmazonWorkflowTitle(text));
      if (found) return found;
    }
    return "";
  }

  function amazonAsinFromUrl(value = location.href) {
    return SNIPING.normalizeAsin(String(value || "").match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1]);
  }

  function amazonProductUrl(asin, fallback = location.href) {
    const normalized = SNIPING.normalizeAsin(asin);
    return normalized ? `https://www.amazon.com/dp/${normalized}` : String(fallback || "").split(/[?#]/)[0];
  }

  function amazonProductImage(root = document) {
    return String([
      root.querySelector?.("#landingImage"),
      root.querySelector?.("#imgTagWrapperId img"),
      root.querySelector?.("img[data-a-dynamic-image]"),
      root.querySelector?.("img.s-image")
    ].find((image) => image?.currentSrc || image?.src)?.currentSrc
      || [
        root.querySelector?.("#landingImage"),
        root.querySelector?.("#imgTagWrapperId img"),
        root.querySelector?.("img[data-a-dynamic-image]"),
        root.querySelector?.("img.s-image")
      ].find((image) => image?.src)?.src
      || "");
  }

  function bestAmazonProductForWorkflow() {
    const productTitle = document.querySelector("#productTitle");
    const productPageTitle = String(productTitle?.textContent || "").replace(/\s+/g, " ").trim();
    const productPagePrice = bestAmazonProductPrice();
    if (productPageTitle && productPagePrice && allowedAmazonWorkflowTitle(productPageTitle)) {
      const asin = amazonAsinFromUrl();
      return {
        title: productPageTitle,
        price: productPagePrice,
        asin,
        url: amazonProductUrl(asin),
        image: amazonProductImage()
      };
    }

    const selected = String(window.getSelection?.() || "").replace(/\s+/g, " ").trim();
    const cards = [
      ...document.querySelectorAll("[data-asin], .a-carousel-card, .zg-grid-general-faceout, .p13n-sc-uncoverable-faceout")
    ];
    for (const card of cards) {
      const title = [
        card.querySelector("a[href*='/dp/'] span"),
        card.querySelector(".p13n-sc-truncate"),
        card.querySelector("[class*='title']")
      ].map((element) => String(element?.textContent || "").replace(/\s+/g, " ").trim())
        .find((text) => text.length > 18 && !/^\$?\d+(?:\.\d+)?$/.test(text) && allowedAmazonWorkflowTitle(text));
      const price = [...card.querySelectorAll(".a-price .a-offscreen, [class*='price']")]
        .map(priceFromElement)
        .find((value) => Number.isFinite(value) && value > 0);
      if (title && price && (!selected || title.includes(selected) || selected.includes(title))) {
        const productLink = card.querySelector("a[href*='/dp/'], a[href*='/gp/product/']");
        const asin = SNIPING.normalizeAsin(card.getAttribute("data-asin")) || amazonAsinFromUrl(productLink?.href);
        return {
          title,
          price,
          asin,
          url: amazonProductUrl(asin, productLink?.href),
          image: amazonProductImage(card)
        };
      }
    }

    const fallbackTitle = bestAmazonProductTitle();
    return {
      title: fallbackTitle,
      price: productPagePrice || bestAmazonProductPrice(),
      asin: amazonAsinFromUrl(),
      url: amazonProductUrl(amazonAsinFromUrl()),
      image: amazonProductImage()
    };
  }

  function numberFromText(value) {
    const match = String(value || "").replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{2})?)/);
    return match ? Number(match[1]) : null;
  }

  function priceFromElement(element) {
    if (!element || isInjectedToolUiNode(element) || !U.isVisible(element)) return null;
    const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || INJECTED_PRICE_UI_RE.test(text)) return null;
    return numberFromText(text);
  }

  function firstScopedPrice(root, selectors) {
    if (!root || isInjectedToolUiNode(root)) return null;
    for (const selector of selectors) {
      const found = [...root.querySelectorAll(selector)]
        .map(priceFromElement)
        .find((price) => Number.isFinite(price) && price > 0);
      if (found) return found;
    }
    return null;
  }

  function bestAmazonProductPrice() {
    const buyBoxSelectors = [
      "#apex-pricetopay-accessibility-label",
      ".priceToPay .a-offscreen",
      ".apex-pricetopay-value .a-offscreen",
      ".apex-pricetopay-value",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      "#price_inside_buybox"
    ];
    const buyBoxRoots = [
      document.querySelector("#corePriceDisplay_desktop_feature_div"),
      document.querySelector("#corePrice_feature_div"),
      document.querySelector("#centerCol"),
      document.querySelector("#ppd")
    ].filter(Boolean);
    for (const root of buyBoxRoots) {
      const price = firstScopedPrice(root, buyBoxSelectors);
      if (price) return price;
    }

    const cardSelectors = [
      "[data-asin] .a-price .a-offscreen",
      ".a-carousel-card .a-price .a-offscreen",
      ".zg-grid-general-faceout .a-price .a-offscreen",
      ".p13n-sc-uncoverable-faceout .a-price .a-offscreen"
    ];
    for (const selector of cardSelectors) {
      const found = [...document.querySelectorAll(selector)]
        .map(priceFromElement)
        .find((price) => Number.isFinite(price) && price > 0);
      if (found) return found;
    }
    return null;
  }

  async function openEbaySearchFromAmazon() {
    const product = bestAmazonProductForWorkflow();
    const title = product.title;
    if (!title) {
      renderStatus("Could not detect an Amazon product title.", "error");
      return;
    }
    const amazonPrice = product.price;
    const result = await storageGet(["findProductsWorkflow"]);
    const previous = result.findProductsWorkflow || {};
    const workflows = {
      sniping: { steps: {}, counters: {}, sellers: [], amazonPrice: "", minMarkupPercent: 70 },
      substitution: { steps: {}, counters: {} },
      ...(previous.workflows || {})
    };
    workflows.sniping = {
      ...(workflows.sniping || {}),
      amazonPrice: amazonPrice == null ? (workflows.sniping?.amazonPrice || "") : String(amazonPrice)
    };
    await storageSet({
      lastProductResearchTitle: title,
      lastAmazonProductPrice: amazonPrice,
      findProductsWorkflow: {
        ...previous,
        workflows,
        lastAmazonTitle: title,
        lastAmazonPrice: amazonPrice == null ? previous.lastAmazonPrice : String(amazonPrice),
        savedAt: new Date().toISOString()
      }
    });
    renderStatus("Opening eBay search for detected product...", "ready");
    window.open(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(title)}`, "_blank", "noopener");
  }

  async function startSnipingWorkflowFromAmazon() {
    const product = bestAmazonProductForWorkflow();
    const title = product.title;
    const amazonPrice = product.price;
    if (!title || !amazonPrice || !product.asin || !SNIPING.amazonUrlMatchesAsin(product.url, product.asin)) {
      renderStatus("Open one exact Amazon product page with a visible price and ASIN first.", "error");
      return;
    }
    const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
    if (!tabInfo?.ok || !Number.isInteger(tabInfo.tabId)) {
      renderStatus("The current Amazon tab could not be identified. Reload this tab and try again.", "error");
      return;
    }
    let reservationToken = "";
    try {
    reservationToken = await U.claimWorkflowStart("sniping", "Sniping workflow");
    const result = await storageGet(["findProductsWorkflow"]);
    const previous = result.findProductsWorkflow || {};
    const workflows = {
      sniping: { steps: {}, counters: {}, sellers: [], amazonPrice: "", minMarkupPercent: 70 },
      substitution: { steps: {}, counters: {} },
      ...(previous.workflows || {})
    };
    workflows.sniping = {
      ...(workflows.sniping || {}),
      amazonPrice: String(amazonPrice),
      minMarkupPercent: Number(workflows.sniping?.minMarkupPercent || 70),
      anchorProduct: product,
      anchorTabId: tabInfo.tabId,
      phase: "anchor-captured",
      steps: {
        ...(workflows.sniping?.steps || {}),
        anchorCaptured: true,
        chooseCompetitors: false,
        matchAmazon: false,
        profitCheck: false,
        preListReview: false
      }
    };
    await storageSet({
      pendingSnipingExtract: {
        active: true,
        query: title,
        amazonPrice,
        anchorProduct: product,
        anchorTabId: tabInfo.tabId,
        minMarkupPercent: Number(workflows.sniping.minMarkupPercent || 70),
        startedAt: Date.now()
      },
      lastProductResearchTitle: title,
      lastAmazonProductPrice: amazonPrice,
      findProductsWorkflow: {
        ...previous,
        workflows,
        lastAmazonTitle: title,
        lastAmazonPrice: String(amazonPrice),
        savedAt: new Date().toISOString()
      }
    });
    } catch (error) {
      holdWorkflowStatus(error.message || "Sniping workflow could not start.", "error");
      return;
    } finally {
      await U.releaseWorkflowStart(reservationToken);
    }
    const opened = await runtimeMessage({ type: "openSnipingEbaySearch", title });
    const launchDiagnostic = {
      ok: opened?.ok === true,
      tabId: Number.isInteger(opened?.tabId) ? opened.tabId : null,
      windowId: Number.isInteger(opened?.windowId) ? opened.windowId : (tabInfo.windowId ?? null),
      url: String(opened?.url || ""),
      error: String(opened?.error || ""),
      anchorTabId: tabInfo.tabId,
      anchorWindowId: tabInfo.windowId ?? null,
      version: chrome.runtime.getManifest().version,
      at: new Date().toISOString()
    };
    await storageSet({ lastSnipingLaunchDiagnostic: launchDiagnostic });
    if (panel) panel.dataset.gldnSnipingLaunchResult = JSON.stringify(launchDiagnostic);
    if (!opened?.ok) {
      await storageSet({ pendingSnipingExtract: { active: false, phase: "failed", error: opened?.error || "eBay search could not open." } });
      holdWorkflowStatus(`Sniping workflow stopped safely: ${opened?.error || "eBay search could not open."}`, "error");
      return;
    }
    holdWorkflowStatus(`Sniping seller scan is running in background tab ${opened.tabId}.`, "ready");
  }

  function normalizeSnipingSellerName(value) {
    const cleaned = String(value || "")
      .trim()
      .replace(/^seller:\s*/i, "")
      .replace(/\s+\(\d[\d,]*\).*$/, "")
      .replace(/\s+\d{1,3}(?:\.\d+)?%\s+positive.*$/i, "")
      .replace(/[^a-z0-9_.-]/gi, "");
    return cleaned.length >= 3 && cleaned.length <= 64 ? cleaned : "";
  }

  function showSnipingSellerReviewOnAmazon(workflow) {
    document.getElementById("gldn-sniping-seller-review")?.remove();
    const sniping = workflow?.workflows?.sniping || {};
    const anchor = sniping.anchorProduct;
    const candidates = Array.isArray(sniping.candidates) ? sniping.candidates : [];
    const currentProduct = bestAmazonProductForWorkflow();
    if (
      sniping.phase !== "seller-review"
      || !anchor?.asin
      || !SNIPING.amazonUrlMatchesAsin(currentProduct.url, anchor.asin)
      || !candidates.length
    ) {
      return { ok: false, error: "The exact Amazon anchor or seller candidates are no longer available." };
    }

    const candidateRows = candidates.map((candidate) => `
      <label class="gldn-sniping-product gldn-sniping-candidate">
        <input type="radio" name="gldn-sniping-candidate" value="${escapeHtml(candidate.ebayItemNumber)}">
        ${candidate.ebayImage ? `<img src="${escapeHtml(candidate.ebayImage)}" alt="eBay seller candidate">` : ""}
        <span>
          <strong>${escapeHtml(candidate.seller)} - $${candidate.economics.ebayPrice.toFixed(2)} (${candidate.economics.markupPercent.toFixed(1)}% markup)</strong>
          <span>${escapeHtml(candidate.ebayTitle)}</span>
          <span>Conservative estimated profit: $${candidate.economics.estimatedNetProfit.toFixed(2)}</span>
          <a href="${escapeHtml(candidate.ebayUrl)}" target="_blank" rel="noopener">Open eBay item ${escapeHtml(candidate.ebayItemNumber)}</a>
        </span>
      </label>`).join("");
    const overlay = document.createElement("div");
    overlay.id = "gldn-sniping-seller-review";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-review-modal gldn-sniping-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Sniping Seller Review</h2>
        <p class="gldn-help-text">Choose only a verified dropshipper selling the exact Amazon item. This review cannot create, edit, or submit a listing.</p>
        <div class="gldn-sniping-product">
          ${anchor.image || anchor.imageUrl ? `<img src="${escapeHtml(anchor.image || anchor.imageUrl)}" alt="Amazon anchor product">` : ""}
          <span>
            <strong>Amazon anchor - $${Number(anchor.price).toFixed(2)}</strong>
            <span>${escapeHtml(anchor.title)}</span>
            <a href="${escapeHtml(anchor.url)}" target="_blank" rel="noopener">Amazon ASIN ${escapeHtml(anchor.asin)}</a>
          </span>
        </div>
        <div class="gldn-sniping-candidates">${candidateRows}</div>
        <label class="gldn-confirm"><input type="checkbox" data-check="title"> Same product title and brand</label>
        <label class="gldn-confirm"><input type="checkbox" data-check="image"> Same product in the images</label>
        <label class="gldn-confirm"><input type="checkbox" data-check="variant"> Same pack count, size, color, and variant</label>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save" disabled>Save Verified Seller</button>
        </div>
        <div class="gldn-modal-status">Nothing has been listed or submitted.</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    const status = overlay.querySelector(".gldn-modal-status");
    const save = overlay.querySelector("[data-action='save']");
    const update = () => {
      const selected = overlay.querySelector("input[name='gldn-sniping-candidate']:checked");
      const checksComplete = [...overlay.querySelectorAll("[data-check]")].every((input) => input.checked);
      save.disabled = !(selected && checksComplete);
    };
    overlay.addEventListener("change", update);
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    save.addEventListener("click", async () => {
      const itemNumber = overlay.querySelector("input[name='gldn-sniping-candidate']:checked")?.value || "";
      const candidate = candidates.find((record) => record.ebayItemNumber === itemNumber);
      const confirmation = SNIPING.confirmSellerCandidate(candidate, {
        confirmed: true,
        titleChecked: overlay.querySelector("[data-check='title']")?.checked === true,
        imageChecked: overlay.querySelector("[data-check='image']")?.checked === true,
        variantChecked: overlay.querySelector("[data-check='variant']")?.checked === true
      });
      if (!confirmation.ok) {
        status.textContent = confirmation.error;
        status.dataset.type = "error";
        return;
      }
      save.disabled = true;
      const verified = confirmation.candidate;
      const sellers = [...new Set([...(sniping.sellers || []), verified.seller]
        .map(normalizeSnipingSellerName)
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
      workflow.workflows = { ...(workflow.workflows || {}) };
      workflow.workflows.sniping = {
        ...sniping,
        phase: "seller-qualified",
        sellers,
        qualifiedSeller: verified,
        counters: { ...(sniping.counters || {}), sellersCollected: sellers.length, sellerCandidates: candidates.length },
        steps: {
          ...(sniping.steps || {}),
          anchorCaptured: true,
          chooseCompetitors: true,
          sellerQualification: true,
          matchAmazon: false,
          profitCheck: false,
          preListReview: false
        }
      };
      workflow.savedAt = new Date().toISOString();
      await storageSet({ findProductsWorkflow: workflow });
      try { await navigator.clipboard.writeText(verified.seller); } catch (_) {}
      status.textContent = `Verified ${verified.seller} at ${verified.economics.markupPercent.toFixed(1)}% markup. Opening EcomSniper Competitor Scanner.`;
      status.dataset.type = "completed";
      const opened = await runtimeMessage({ type: "openEcomSniperPage", page: "competitorScanner" });
      if (!opened?.ok) {
        status.textContent = `Seller saved, but EcomSniper could not open: ${opened?.error || "unknown error"}`;
        status.dataset.type = "error";
      }
    });
    return { ok: true, candidates: candidates.length };
  }

  async function reviewPendingSnipingSellerCandidates() {
    const result = await storageGet(["findProductsWorkflow"]);
    const sniping = result.findProductsWorkflow?.workflows?.sniping || {};
    const tabInfo = await runtimeMessage({ type: "currentTabInfo" });
    if (Number.isInteger(sniping.anchorTabId) && tabInfo?.tabId !== sniping.anchorTabId) {
      return { ok: false, error: "This is not the Amazon tab that started the sniping scan." };
    }
    return showSnipingSellerReviewOnAmazon(result.findProductsWorkflow || null);
  }

  function showSnipingPreListReview(winner, amazonProduct, minMarkupPercent) {
    document.getElementById("gldn-sniping-prelist-review")?.remove();
    const review = SNIPING.buildWinnerReview(winner, amazonProduct, { minMarkupPercent });
    const economics = review.economics;
    if (!economics?.ok) {
      renderStatus(economics?.error || "The eBay and Amazon prices could not be verified.", "error");
      return false;
    }
    const overlay = document.createElement("div");
    overlay.id = "gldn-sniping-prelist-review";
    overlay.className = "gldn-modal-backdrop gldn-review-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-review-modal gldn-sniping-modal">
        <button type="button" class="gldn-close" aria-label="Close">x</button>
        <h2>Sniping Pre-List Review</h2>
        <p class="gldn-help-text">Compare the exact winner and Amazon supplier item. Saving this review does not create, edit, or submit an eBay listing.</p>
        <div class="gldn-sniping-compare">
          <div class="gldn-sniping-product">
            ${review.ebayImage ? `<img src="${escapeHtml(review.ebayImage)}" alt="eBay winner">` : ""}
            <strong>eBay winner - $${economics.ebayPrice.toFixed(2)}</strong>
            <span>${escapeHtml(review.ebayTitle)}</span>
            <span>Sold: ${Number(review.recentSold30 || 0)} / 30 days, ${Number(review.recentSold90 || 0)} / 90 days</span>
            <a href="${escapeHtml(review.ebayUrl)}" target="_blank" rel="noopener">Open eBay item ${escapeHtml(review.ebayItemNumber)}</a>
          </div>
          <div class="gldn-sniping-product">
            ${review.amazonImage ? `<img src="${escapeHtml(review.amazonImage)}" alt="Amazon supplier product">` : ""}
            <strong>Amazon supplier - $${economics.amazonPrice.toFixed(2)}</strong>
            <span>${escapeHtml(review.amazonTitle)}</span>
            <a href="${escapeHtml(review.amazonUrl)}" target="_blank" rel="noopener">Open Amazon ASIN ${escapeHtml(review.amazonAsin)}</a>
          </div>
        </div>
        <div class="gldn-grid">
          <div><strong>Competitor markup</strong><span>${economics.markupPercent.toFixed(1)}%</span></div>
          <div><strong>Proposed listing price</strong><span>$${economics.proposedListingPrice.toFixed(2)} (exactly $0.05 lower)</span></div>
          <div><strong>Gross spread</strong><span>$${economics.grossSpread.toFixed(2)}</span></div>
          <div><strong>Estimated marketplace fee</strong><span>$${economics.estimatedMarketplaceFee.toFixed(2)}</span></div>
          <div><strong>Conservative estimated profit</strong><span>$${economics.estimatedNetProfit.toFixed(2)}</span></div>
          <div><strong>Estimate basis</strong><span>${escapeHtml(economics.estimateLabel)}</span></div>
        </div>
        <label class="gldn-confirm"><input type="checkbox" data-check="title"> Same product title and brand</label>
        <label class="gldn-confirm"><input type="checkbox" data-check="image"> Same product in the images</label>
        <label class="gldn-confirm"><input type="checkbox" data-check="variant"> Same pack count, size, color, and variant</label>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="save" disabled>Save Read-Only Review</button>
        </div>
        <div class="gldn-modal-status">Nothing has been listed or submitted.</div>
      </div>`;
    document.documentElement.appendChild(overlay);
    const status = overlay.querySelector(".gldn-modal-status");
    const save = overlay.querySelector("[data-action='save']");
    const update = () => {
      save.disabled = ![...overlay.querySelectorAll("[data-check]")].every((input) => input.checked);
    };
    overlay.addEventListener("change", update);
    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);
    save.addEventListener("click", async () => {
      const confirmation = SNIPING.confirmWinnerReview(review, {
        confirmed: true,
        titleChecked: overlay.querySelector("[data-check='title']")?.checked === true,
        imageChecked: overlay.querySelector("[data-check='image']")?.checked === true,
        variantChecked: overlay.querySelector("[data-check='variant']")?.checked === true
      });
      if (!confirmation.ok) {
        status.textContent = confirmation.error;
        status.dataset.type = "error";
        return;
      }
      const result = await storageGet(["findProductsWorkflow"]);
      const workflow = result.findProductsWorkflow || { workflows: {} };
      const sniping = workflow.workflows?.sniping || {};
      workflow.workflows = { ...(workflow.workflows || {}) };
      workflow.workflows.sniping = {
        ...sniping,
        phase: "pre-list-review",
        amazonMatch: amazonProduct,
        preListReview: confirmation.review,
        steps: {
          ...(sniping.steps || {}),
          scanRecentSold: true,
          filterWinners: true,
          matchAmazon: true,
          profitCheck: true,
          undercutPrepared: true,
          preListReview: true
        }
      };
      workflow.savedAt = new Date().toISOString();
      await storageSet({ findProductsWorkflow: workflow });
      await storageRemove(["pendingSnipingWinner"]);
      if (snipingReviewButtonElement) snipingReviewButtonElement.hidden = true;
      renderStatus(`Sniping review ready at $${confirmation.review.economics.proposedListingPrice.toFixed(2)}. Nothing submitted.`, "completed");
      status.textContent = "Read-only pre-list review saved. No listing was created or submitted.";
      status.dataset.type = "completed";
      save.disabled = true;
    });
    return true;
  }

  async function reviewPendingSnipingWinner() {
    const result = await storageGet(["pendingSnipingWinner", "findProductsWorkflow"]);
    const pending = result.pendingSnipingWinner;
    if (!pending?.active) {
      if (snipingReviewButtonElement) snipingReviewButtonElement.hidden = true;
      return false;
    }
    if (Date.now() - Number(pending.startedAt || 0) > 2 * 60 * 60 * 1000) {
      await storageRemove(["pendingSnipingWinner"]);
      if (snipingReviewButtonElement) snipingReviewButtonElement.hidden = true;
      renderStatus("The saved sniping winner expired. Capture it again from eBay.", "error");
      return false;
    }
    const amazonProduct = bestAmazonProductForWorkflow();
    const exactAmazonPage = Boolean(
      amazonProduct.title
      && amazonProduct.price
      && amazonProduct.asin
      && SNIPING.amazonUrlMatchesAsin(amazonProduct.url, amazonProduct.asin)
    );
    if (snipingReviewButtonElement) snipingReviewButtonElement.hidden = !exactAmazonPage;
    if (!exactAmazonPage) {
      renderStatus("Open the exact Product Hunter Amazon result to review the sniping match.", "ready");
      return false;
    }
    const minMarkupPercent = Number(result.findProductsWorkflow?.workflows?.sniping?.minMarkupPercent || 70);
    showSnipingPreListReview(pending.winner, amazonProduct, minMarkupPercent);
    return true;
  }

  function createPanel() {
    if (document.getElementById("gldn-amazon-order-panel")) return;
    panel = document.createElement("div");
    panel.id = "gldn-amazon-order-panel";
    panel.className = "gldn-order-panel";
    panel.innerHTML = `
      <div class="gldn-panel-heading">
        <img class="gldn-logo-image" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="GLDN Ops">
        <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v${chrome.runtime.getManifest().version}</span></div>
        <div class="gldn-drag-grip" aria-hidden="true">⋮⋮</div>
      </div>
      <button type="button" data-action="copy" class="gldn-primary">Review & Copy Amazon Info</button>
      <button type="button" data-action="profile" class="gldn-secondary">Set Amazon Profile</button>
      <button type="button" data-action="dashboard-setup" class="gldn-secondary">Dashboard Setup</button>
      <button type="button" data-action="feature-health" class="gldn-secondary">Health Check</button>
      <button type="button" data-action="subscribe-save" class="gldn-warning" ${isAmazonSubscribeSaveManagerPage() ? "" : "hidden"}>Scan Subscribe &amp; Save</button>
      <button type="button" data-action="sniping-review" class="gldn-warning" hidden>Review Sniping Match</button>
      <button type="button" data-action="reload-extension" class="gldn-dev-reload">Update &amp; Reload</button>
      <div class="gldn-status">${isAmazonSubscribeSaveManagerPage() ? "Ready to scan active subscriptions." : "Scanning checkout…"}</div>
    `;
    document.documentElement.appendChild(panel);
    U.makePanelDraggable(panel, "gldnAmazonPanelPosition");
    const panelSettingsMenu = panel.querySelector(".gldn-panel-settings-menu");
    if (panelSettingsMenu) {
      const startSnipingButton = document.createElement("button");
      startSnipingButton.type = "button";
      startSnipingButton.className = "gldn-warning";
      startSnipingButton.dataset.action = "start-sniping-workflow";
      startSnipingButton.textContent = "Start Sniping Workflow";
      startSnipingButton.addEventListener("click", () => {
        panelSettingsMenu.setAttribute("hidden", "");
        startSnipingWorkflowFromAmazon();
      });
      panelSettingsMenu.appendChild(startSnipingButton);
    }
    statusElement = panel.querySelector(".gldn-status");
    panel.querySelector("[data-action='copy']").addEventListener("click", copyAmazonInfo);
    panel.querySelector("[data-action='profile']").addEventListener("click", setProfileLabel);
    panel.querySelector("[data-action='dashboard-setup']").addEventListener("click", setupDashboardFromPanel);
    panel.querySelector("[data-action='feature-health']").addEventListener("click", runFeatureHealthFromPanel);
    panel.querySelector("[data-action='subscribe-save']").addEventListener("click", startAmazonSubscribeSaveWorkflow);
    snipingReviewButtonElement = panel.querySelector("[data-action='sniping-review']");
    snipingReviewButtonElement.addEventListener("click", reviewPendingSnipingWinner);
    panel.querySelector("[data-action='reload-extension']").addEventListener("click", reloadExtensionFromPanel);
    updateProfileButton();
  }

  createPanel();
  autoCacheCheckout();
  resumePendingPoshmarkAmazonLookup();
  resumePoshmarkProfitBackfillWorker().catch((error) => renderStatus(error.message || "Historical-profit worker stopped.", "error"));
  resumeOrderPlacementAuditWorker().catch((error) => renderStatus(error.message || "Order placement audit paused.", "error"));
  reviewPendingSnipingSellerCandidates();
  reviewPendingSnipingWinner();

  const amazonStorageListener = (changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.findProductsWorkflow?.newValue?.workflows?.sniping?.phase === "seller-review") {
      reviewPendingSnipingSellerCandidates();
    }
    if (changes.pendingSnipingWinner) reviewPendingSnipingWinner();
    if (changes.pendingAmazonSubscribeSaveRun?.newValue?.phase === "awaiting-approval") {
      resumeAmazonSubscribeSaveWorkflow();
    }
  };
  chrome.storage.onChanged.addListener(amazonStorageListener);
  U.registerExtensionCleanup?.(() => chrome.storage.onChanged.removeListener(amazonStorageListener));

  function collectListingPolicyProduct() {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const first = (selectors) => {
      for (const selector of selectors) {
        const value = clean(document.querySelector(selector)?.textContent);
        if (value) return value;
      }
      return "";
    };
    const collect = (selectors, limit = 80) => {
      const values = [];
      for (const selector of selectors) {
        for (const node of document.querySelectorAll(selector)) {
          const value = clean(node.textContent);
          if (!value || values.includes(value)) continue;
          values.push(value);
          if (values.length >= limit) return values;
        }
      }
      return values;
    };
    const pageText = clean(document.body?.innerText).slice(0, 6000);
    const robot = Boolean(document.querySelector('form[action*="validateCaptcha"], #captchacharacters, img[src*="captcha"]'))
      || /robot check|enter the characters you see|sorry, we just need to make sure you(?:'|’)re not a robot/i.test(`${document.title} ${pageText}`);
    if (robot) return { ok: false, robot: true, error: "Amazon displayed a robot or CAPTCHA check." };
    const asin = clean(document.querySelector('#ASIN')?.value || location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]).toUpperCase();
    const title = first(['#productTitle', '#title', 'h1.a-size-large']);
    const brand = first(['#bylineInfo', '#brand']);
    const category = collect(['#wayfinding-breadcrumbs_feature_div li a', '#wayfinding-breadcrumbs_container li a'], 20).join(' | ');
    const bullets = collect(['#feature-bullets li span.a-list-item', '#featurebullets_feature_div li span'], 60).join(' | ');
    const details = collect([
      '#productOverview_feature_div tr',
      '#productDetails_feature_div tr',
      '#detailBullets_feature_div li',
      '#variation_color_name',
      '#variation_size_name',
      '#variation_style_name'
    ], 120).join(' | ').slice(0, 24000);
    const imageText = [...document.querySelectorAll('#landingImage, #imgBlkFront, #main-image, #altImages img, #imageBlock img')]
      .map((image) => clean(image.getAttribute('alt')))
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 30)
      .join(' | ');
    if (!asin || !title) return { ok: false, robot: false, error: "Amazon did not expose a product title and ASIN on this page." };
    return {
      ok: true,
      robot: false,
      product: { asin, url: location.href, title, brand, category, bullets, details, imageText }
    };
  }

  const amazonMessageListener = (message, sender, sendResponse) => {
    if (sender?.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "Message sender is not GLDN Ops." });
      return false;
    }
    if (message?.type === "collectListingPolicyProduct") {
      sendResponse(collectListingPolicyProduct());
      return false;
    }
    if (message?.type === "runAmazonPageAction") {
      const actions = {
        "review-copy": copyAmazonInfo,
        "sniping-seller-review": reviewPendingSnipingSellerCandidates,
        "sniping-winner-review": reviewPendingSnipingWinner,
        "subscribe-save-scan": startAmazonSubscribeSaveWorkflow,
        "subscribe-save-show-review": resumeAmazonSubscribeSaveWorkflow,
        "approve-subscribe-save": () => approveAmazonSubscribeSave(message.confirmationToken),
        "approve-historical-profit-review": () => approveAmazonCostResolutionReview(message.confirmationToken)
      };
      const action = actions[String(message.action || "")];
      if (!action) {
        sendResponse({ ok: false, error: "Unknown Amazon workflow action." });
        return false;
      }
      if (message.action === "approve-historical-profit-review") {
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
    if (message?.type === "showAmazonCostResolutionReview" && message.state) {
      sendResponse({ ok: showAmazonCostResolutionReview(message.state) });
      return true;
    }
    if (message?.type !== "showSnipingSellerReview") return false;
    reviewPendingSnipingSellerCandidates()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  };
  chrome.runtime.onMessage.addListener(amazonMessageListener);
  U.registerExtensionCleanup?.(() => chrome.runtime.onMessage.removeListener(amazonMessageListener));

  storageGet(["pendingAmazonSnipingWorkflowStart"]).then(async (result) => {
    if (result.pendingAmazonSnipingWorkflowStart?.active) {
      await storageRemove(["pendingAmazonSnipingWorkflowStart"]);
      await startSnipingWorkflowFromAmazon();
    }
  }).catch((error) => {
    if (U.isExtensionContextInvalidated?.(error)) stopInvalidatedAmazonContext(error);
    else renderStatus(error?.message || "Amazon workflow startup stopped.", "error");
  });

  resumeAmazonSubscribeSaveWorkflow().catch((error) => {
    if (U.isExtensionContextInvalidated?.(error)) stopInvalidatedAmazonContext(error);
    else holdWorkflowStatus(error?.message || "Subscribe & Save recovery stopped safely.", "error");
  });

  const shouldObserveAmazonWorkflow = isCheckoutPage()
    || isConfirmationPage()
    || isAmazonOrderDetailsPage()
    || isAmazonOrdersSearchPage()
    || isAmazonOrdersHistoryPage()
    || isAmazonSubscribeSaveManagerPage();
  if (shouldObserveAmazonWorkflow) {
    amazonObserver = new MutationObserver(() => {
      clearTimeout(amazonMutationTimer);
      amazonMutationTimer = setTimeout(() => {
        autoCacheCheckout().catch((error) => {
          if (U.isExtensionContextInvalidated?.(error)) stopInvalidatedAmazonContext(error);
        });
        resumePoshmarkProfitBackfillWorker().catch((error) => {
          if (U.isExtensionContextInvalidated?.(error)) stopInvalidatedAmazonContext(error);
          else renderStatus(error.message || "Historical-profit worker stopped.", "error");
        });
        resumeOrderPlacementAuditWorker().catch((error) => {
          if (U.isExtensionContextInvalidated?.(error)) stopInvalidatedAmazonContext(error);
          else renderStatus(error.message || "Order placement audit paused.", "error");
        });
      }, 1200);
    });
    amazonObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  if (isCheckoutPage() || isConfirmationPage()) {
    amazonAutoCacheInterval = setInterval(() => {
      autoCacheCheckout().catch((error) => {
        if (U.isExtensionContextInvalidated?.(error)) stopInvalidatedAmazonContext(error);
      });
    }, 5000);
  }
  U.registerExtensionCleanup?.(() => {
    amazonObserver?.disconnect?.();
    clearInterval(amazonAutoCacheInterval);
    clearTimeout(amazonMutationTimer);
  });
})();
