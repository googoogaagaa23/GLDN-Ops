(() => {
  if (window.__GLDN_AMAZON_ORDER_ASSISTANT__) return;
  window.__GLDN_AMAZON_ORDER_ASSISTANT__ = true;

  const U = window.OrderNoteUtils;
  const AUDIT = window.GLDN_PROFIT_AUDIT;
  const SNIPING = window.GLDN_SNIPING_AUDIT;
  const FOUNDATION = window.GLDN_FOUNDATION;
  const EXTENSION_VERSION = chrome.runtime.getManifest().version;
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

  const storageGet = (keys) => new Promise((resolve, reject) => {
    try {
      requireAmazonContext();
      chrome.storage.local.get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result);
      });
    } catch (error) {
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
      requireAmazonContext();
      chrome.storage.local.set(payload, () => {
        const error = chrome.runtime.lastError?.message;
        if (error) reject(new Error(error));
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
  const storageRemove = (keys) => new Promise((resolve, reject) => {
    try {
      requireAmazonContext();
      chrome.storage.local.remove(keys, () => {
        const error = chrome.runtime.lastError?.message;
        if (error) reject(new Error(error));
        else resolve();
      });
    } catch (error) {
      reject(error);
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
          return {
            total: uniquePrices[0],
            cost: uniquePrices[0],
            asin: targetAsin,
            title: titleFromAmazonItemBlock(rawText, fallbackTitle),
            orderId: pageOrderId || pendingOrderId || "",
            orderUrl: location.href,
            source: "amazon-order-detail-asin-row",
            quantity: Math.max(1, Number.parseInt(quantityMatch?.[1] || "1", 10) || 1),
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

  async function resumePoshmarkProfitBackfillWorker() {
    if (backfillWorkerBusy) return false;
    backfillWorkerBusy = true;
    try {
    const [status, tab] = await Promise.all([
      runtimeMessage({ type: "getPoshmarkProfitBackfill" }),
      runtimeMessage({ type: "currentTabInfo" })
    ]);
    const run = status?.state;
    if (!run?.active || Number(run.workerTabId) !== Number(tab?.tabId)) return false;
    await new Promise((resolve) => setTimeout(resolve, 900));

    if (run.phase === "amazon-search") {
      const asin = String(run.currentAsin || "").trim().toUpperCase();
      const input = document.querySelector("#searchOrdersInput, input[aria-label='Search all orders'], input[name='search']");
      const currentQuery = String(input?.value || new URL(location.href).searchParams.get("search") || "").trim().toUpperCase();
      if (currentQuery !== asin && (isAmazonOrdersHistoryPage() || isAmazonOrdersSearchPage())) {
        const submitted = await submitHistoricalAmazonSearch(asin);
        if (!submitted) {
          await runtimeMessage({ type: "poshmarkBackfillAmazonSearch", payload: { matches: [], searchError: "Amazon order search control was not found." } });
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
      await runtimeMessage({
        type: "poshmarkBackfillAmazonDetail",
        payload: {
          purchase: purchase ? { ...purchase, purchaseDate: searchMatch.purchaseDate || "" } : null,
          pageUrl: location.href
        }
      });
      return true;
    }
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
      alert("Profile label cannot be blank.");
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
      const response = await chrome.runtime.sendMessage({ type: "updateExtension", returnUrl: location.href, reloadWhenCurrent: true });
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

      const clipboardText = U.PAYLOAD_PREFIX + JSON.stringify(payload);
      await navigator.clipboard.writeText(clipboardText);
      const updates = { lastCopiedAmazonPayload: payload, pendingAmazonCheckout: payload };
      if (marketplaceContext?.orderNumber) {
        const saved = await storageGet(["poshmarkAmazonPayloadByOrder"]);
        updates.poshmarkAmazonPayloadByOrder = {
          ...(saved.poshmarkAmazonPayloadByOrder || {}),
          [String(marketplaceContext.orderNumber)]: payload
        };
      }
      await storageSet(updates);
      if (marketplaceContext) {
        const pending = await storageGet(["pendingPoshmarkAmazonItemsByOrder"]);
        const byOrder = { ...(pending.pendingPoshmarkAmazonItemsByOrder || {}) };
        delete byOrder[String(marketplaceContext.orderNumber)];
        await storageSet({ pendingPoshmarkAmazonItemsByOrder: byOrder });
        await storageRemove(["pendingPoshmarkProfitContext", "pendingAmazonOrderDetailMatch", "pendingAmazonOrderSearchSubmission"]);
      }
      renderStatus(`Copied: ${U.formatMoney(payload.total)} - ${profileLabel} - ${payload.etas.join(", ")}`, "copied");
      status.textContent = marketplaceContext
        ? `Copied for Poshmark order ${marketplaceContext.orderNumber}. Return to that Poshmark order.`
        : "Copied. Return to the matching eBay order.";
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

  function bestAmazonProductTitle() {
    const selected = String(window.getSelection?.() || "").trim();
    if (selected.length > 8) return selected;
    const productTitle = document.querySelector("#productTitle");
    if (productTitle?.textContent?.trim()) return productTitle.textContent.trim();
    const selectors = [
      "[data-asin] a[href*='/dp/'] span",
      ".a-carousel-card a[href*='/dp/'] span",
      "a[href*='/dp/'] span"
    ];
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)]
        .map((element) => String(element.textContent || "").trim())
        .find((text) => text.length > 18 && !/^\$?\d+(\.\d+)?$/.test(text));
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
    if (productPageTitle && productPagePrice) {
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
        .find((text) => text.length > 18 && !/^\$?\d+(?:\.\d+)?$/.test(text));
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
      <button type="button" data-action="sniping-review" class="gldn-warning" hidden>Review Sniping Match</button>
      <button type="button" data-action="reload-extension" class="gldn-dev-reload">Update &amp; Reload</button>
      <div class="gldn-status">Scanning checkout…</div>
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
    snipingReviewButtonElement = panel.querySelector("[data-action='sniping-review']");
    snipingReviewButtonElement.addEventListener("click", reviewPendingSnipingWinner);
    panel.querySelector("[data-action='reload-extension']").addEventListener("click", reloadExtensionFromPanel);
    updateProfileButton();
  }

  createPanel();
  autoCacheCheckout();
  resumePendingPoshmarkAmazonLookup();
  resumePoshmarkProfitBackfillWorker().catch((error) => renderStatus(error.message || "Historical-profit worker stopped.", "error"));
  reviewPendingSnipingSellerCandidates();
  reviewPendingSnipingWinner();

  const amazonStorageListener = (changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.findProductsWorkflow?.newValue?.workflows?.sniping?.phase === "seller-review") {
      reviewPendingSnipingSellerCandidates();
    }
    if (changes.pendingSnipingWinner) reviewPendingSnipingWinner();
  };
  chrome.storage.onChanged.addListener(amazonStorageListener);
  U.registerExtensionCleanup?.(() => chrome.storage.onChanged.removeListener(amazonStorageListener));

  const amazonMessageListener = (message, sender, sendResponse) => {
    if (sender?.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "Message sender is not GLDN Ops." });
      return false;
    }
    if (message?.type === "runAmazonPageAction") {
      const actions = {
        "review-copy": copyAmazonInfo,
        "sniping-seller-review": reviewPendingSnipingSellerCandidates,
        "sniping-winner-review": reviewPendingSnipingWinner
      };
      const action = actions[String(message.action || "")];
      if (!action) {
        sendResponse({ ok: false, error: "Unknown Amazon workflow action." });
        return false;
      }
      sendResponse({ ok: true, accepted: true });
      setTimeout(() => {
        Promise.resolve(action()).catch((error) => {
          renderStatus(error?.message || String(error), "error");
        });
      }, 0);
      return false;
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
      startSnipingWorkflowFromAmazon();
    }
  });

  const shouldObserveAmazonWorkflow = isCheckoutPage()
    || isConfirmationPage()
    || isAmazonOrderDetailsPage()
    || isAmazonOrdersSearchPage()
    || isAmazonOrdersHistoryPage();
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
