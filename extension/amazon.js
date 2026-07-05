(() => {
  if (window.__GLDN_AMAZON_ORDER_ASSISTANT__) return;
  window.__GLDN_AMAZON_ORDER_ASSISTANT__ = true;

  const U = window.OrderNoteUtils;
  let panel;
  let statusElement;
  let cachedSnapshot = null;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

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
    return {
      total: extractAmazonTotal(),
      etas: extractAmazonEtas(),
      titles: extractAmazonTitles(),
      shippingBlock: extractShippingBlock(),
      capturedAt: new Date().toISOString(),
      url: location.href
    };
  }

  function isCheckoutPage() {
    return /\/checkout\/|\/gp\/buy\/spc\/|\/checkout\/p\//i.test(location.pathname + location.search);
  }

  function isConfirmationPage() {
    const text = (document.body?.innerText || "").toLowerCase();
    return /\/gp\/buy\/thankyou\//i.test(location.pathname) ||
      text.includes("order placed") ||
      text.includes("thanks for your order") ||
      text.includes("order confirmation");
  }

  async function autoCacheCheckout() {
    const data = extractCheckoutData();
    const stored = await storageGet(["pendingAmazonCheckout"]);
    const previous = stored.pendingAmazonCheckout || {};

    if (isCheckoutPage()) {
      const combined = {
        ...previous,
        ...data,
        total: data.total ?? previous.total ?? null,
        etas: data.etas.length ? data.etas : (previous.etas || []),
        titles: data.titles.length ? data.titles : (previous.titles || []),
        shippingBlock: data.shippingBlock || previous.shippingBlock || ""
      };
      if (combined.total !== null) {
        cachedSnapshot = combined;
        await storageSet({ pendingAmazonCheckout: combined });
        renderStatus(
          `Detected: ${U.formatMoney(combined.total)}${combined.etas.length ? ` / ${combined.etas.join(", ")}` : " / ETA pending"}`,
          "ready"
        );
      }
    }

    if (isConfirmationPage()) {
      const combined = {
        ...previous,
        ...data,
        // Amazon confirmation often does not display the total, so preserve
        // the exact total cached from final checkout.
        total: previous.total ?? data.total ?? null,
        // Prefer the final confirmation ETA over checkout alternatives.
        etas: data.etas.length ? data.etas : (previous.etas || []),
        titles: data.titles.length ? data.titles : (previous.titles || []),
        shippingBlock: data.shippingBlock || previous.shippingBlock || "",
        confirmedAt: new Date().toISOString(),
        confirmationUrl: location.href
      };
      cachedSnapshot = combined;
      await storageSet({ pendingAmazonCheckout: combined });
      renderStatus(
        `Confirmed: ${combined.total !== null ? U.formatMoney(combined.total) : "total missing"}${combined.etas.length ? ` / ${combined.etas.join(", ")}` : " / ETA missing"}`,
        "confirmed"
      );
    }
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

  function showAmazonPreview({ profileLabel, total, etas, titles, shippingBlock }) {
    document.getElementById("gldn-amazon-preview")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "gldn-amazon-preview";
    overlay.className = "gldn-modal-backdrop";
    overlay.innerHTML = `
      <div class="gldn-modal gldn-amazon-modal">
        <button type="button" class="gldn-close" aria-label="Close">×</button>
        <h2>Review Amazon Information</h2>
        <p class="gldn-help-text">Confirm these values before they are sent to eBay.</p>
        <div class="gldn-field-row">
          <label class="gldn-label" for="gldn-amazon-total">Amazon Order Total</label>
          <input id="gldn-amazon-total" class="gldn-text-input" inputmode="decimal" value="${total === null ? "" : U.formatMoney(total)}">
        </div>
        <div class="gldn-field-row">
          <label class="gldn-label" for="gldn-amazon-etas">ETA</label>
          <input id="gldn-amazon-etas" class="gldn-text-input" value="${escapeHtml((etas || []).join(", "))}" placeholder="7/2 or 7/2, 7/4">
          <div class="gldn-field-help">For multiple item ETAs, separate dates with commas.</div>
        </div>
        <div class="gldn-grid">
          <div><strong>Amazon profile</strong><span>${escapeHtml(profileLabel)}</span></div>
          <div><strong>Page</strong><span>${isConfirmationPage() ? "Order confirmation" : "Checkout"}</span></div>
        </div>
        <div class="gldn-actions">
          <button type="button" class="gldn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="gldn-primary" data-action="copy">Copy Amazon Info</button>
        </div>
        <div class="gldn-modal-status"></div>
      </div>
    `;

    document.documentElement.appendChild(overlay);
    const totalInput = overlay.querySelector("#gldn-amazon-total");
    const etaInput = overlay.querySelector("#gldn-amazon-etas");
    const status = overlay.querySelector(".gldn-modal-status");
    const copyButton = overlay.querySelector("[data-action='copy']");

    const close = () => overlay.remove();
    overlay.querySelector(".gldn-close").addEventListener("click", close);
    overlay.querySelector("[data-action='cancel']").addEventListener("click", close);

    copyButton.addEventListener("click", async () => {
      const correctedTotal = U.moneyToNumber(totalInput.value);
      const correctedEtas = etaInput.value
        .split(/[,;]+/)
        .map((value) => U.parseDateToMD(value) || value.trim())
        .filter(Boolean);

      if (correctedTotal === null || correctedTotal <= 0) {
        status.textContent = "Enter the correct Amazon Order Total.";
        return;
      }
      if (!correctedEtas.length) {
        status.textContent = "Enter at least one ETA.";
        return;
      }

      const payload = {
        version: 2,
        source: "amazon",
        total: Number(correctedTotal),
        profileLabel,
        etas: [...new Set(correctedEtas)],
        titles,
        shippingBlock,
        capturedAt: new Date().toISOString(),
        confirmed: isConfirmationPage(),
        url: location.href
      };

      const clipboardText = U.PAYLOAD_PREFIX + JSON.stringify(payload);
      await navigator.clipboard.writeText(clipboardText);
      await storageSet({ lastCopiedAmazonPayload: payload, pendingAmazonCheckout: payload });
      renderStatus(`Copied: ${U.formatMoney(payload.total)} - ${profileLabel} - ${payload.etas.join(", ")}`, "copied");
      status.textContent = "Copied. Return to the matching eBay order.";
      setTimeout(close, 900);
    });

    totalInput.focus();
    totalInput.select();
  }

  async function copyAmazonInfo() {
    const result = await storageGet(["amazonProfileLabel", "pendingAmazonCheckout"]);
    const profileLabel = (result.amazonProfileLabel || "").trim();
    if (!profileLabel) {
      await setProfileLabel();
      return;
    }

    const live = extractCheckoutData();
    const stored = result.pendingAmazonCheckout || cachedSnapshot || {};
    const total = isConfirmationPage()
      ? (stored.total ?? live.total ?? null)
      : (live.total ?? stored.total ?? null);
    const etas = isConfirmationPage()
      ? (live.etas.length ? live.etas : (stored.etas || []))
      : (live.etas.length ? live.etas : (stored.etas || []));
    const titles = live.titles.length ? live.titles : (stored.titles || []);
    const shippingBlock = live.shippingBlock || stored.shippingBlock || "";

    showAmazonPreview({ profileLabel, total, etas, titles, shippingBlock });
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

  function bestAmazonProductForWorkflow() {
    const productTitle = document.querySelector("#productTitle");
    const productPageTitle = String(productTitle?.textContent || "").replace(/\s+/g, " ").trim();
    const productPagePrice = bestAmazonProductPrice();
    if (productPageTitle && productPagePrice) {
      return { title: productPageTitle, price: productPagePrice };
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
        .map((element) => numberFromText(element.textContent))
        .find((value) => Number.isFinite(value) && value > 0);
      if (title && price && (!selected || title.includes(selected) || selected.includes(title))) {
        return { title, price };
      }
    }

    const fallbackTitle = bestAmazonProductTitle();
    return {
      title: fallbackTitle,
      price: productPagePrice || bestAmazonProductPrice()
    };
  }

  function amazonBulkProductTitles(limit = 25) {
    const selected = String(window.getSelection?.() || "").trim();
    const titles = [];
    if (selected.length > 8) titles.push(selected);
    const selectors = [
      "#productTitle",
      "[data-asin] a[href*='/dp/'] span",
      ".a-carousel-card a[href*='/dp/'] span",
      ".zg-grid-general-faceout a[href*='/dp/'] span",
      ".p13n-sc-truncate",
      "a[href*='/dp/'] span"
    ];
    for (const selector of selectors) {
      [...document.querySelectorAll(selector)].forEach((element) => {
        const text = String(element.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        if (
          text.length >= 18 &&
          text.length <= 220 &&
          allowedBulkProductTitle(text) &&
          !/^\$?\d+(?:\.\d+)?$/.test(text) &&
          !/^(sponsored|prime|shop now|see more|options)$/i.test(text)
        ) {
          titles.push(text);
        }
      });
    }
    return [...new Set(titles)].slice(0, limit);
  }

  function normalizeBulkProductKey(title) {
    return String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  async function filterRecentBulkProducts(titles) {
    const result = await storageGet(["computerLabel", "bulkProductHistoryByComputer"]);
    const computer = String(result.computerLabel || "0").trim() || "0";
    const allHistory = result.bulkProductHistoryByComputer || {};
    const history = allHistory[computer] || {};
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const freshHistory = {};
    Object.entries(history).forEach(([key, timestamp]) => {
      if (Number(timestamp) >= cutoff) freshHistory[key] = Number(timestamp);
    });
    const filtered = titles.filter((title) => !freshHistory[normalizeBulkProductKey(title)]);
    return { computer, allHistory, freshHistory, filtered };
  }

  async function rememberBulkProducts(computer, allHistory, freshHistory, titles) {
    const now = Date.now();
    titles.forEach((title) => {
      freshHistory[normalizeBulkProductKey(title)] = now;
    });
    await storageSet({
      bulkProductHistoryByComputer: {
        ...(allHistory || {}),
        [computer]: freshHistory
      }
    });
  }

  function isAmazonBestSellersPage() {
    return /\/gp\/bestsellers\b/i.test(location.pathname);
  }

  const BULK_LINKS_EXCLUDED_TITLE = /\b(shoe|shoes|sneaker|sneakers|sandals?|slippers?|boots?|clogs?|crocs|socks?|shirt|shirts|t-?shirt|hoodie|sweater|jacket|coat|dress|dresses|skirt|jeans|pants|leggings|shorts?|underwear|boxers?|briefs?|bra|bras|lingerie|swimsuit|bikini|clothing|apparel|fashion|plus size)\b/i;

  function allowedBulkProductTitle(title) {
    return !BULK_LINKS_EXCLUDED_TITLE.test(String(title || ""));
  }

  function numberFromText(value) {
    const match = String(value || "").replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{2})?)/);
    return match ? Number(match[1]) : null;
  }

  function bestAmazonProductPrice() {
    const selectors = [
      "#corePrice_feature_div .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      ".a-price .a-offscreen",
      "[data-asin] .a-price .a-offscreen"
    ];
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)]
        .map((element) => numberFromText(element.textContent))
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
      bulkListing: { steps: {}, counters: {} },
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

  async function startBulkLinksFromAmazon() {
    if (!isAmazonBestSellersPage()) {
      renderStatus("Opening Amazon Best Sellers to start bulk links.", "ready");
      window.open("https://www.amazon.com/gp/bestsellers", "_blank", "noopener");
      return;
    }
    const detectedTitles = amazonBulkProductTitles(40);
    const { computer, allHistory, freshHistory, filtered } = await filterRecentBulkProducts(detectedTitles);
    const titles = filtered.slice(0, 30);
    if (!titles.length) {
      renderStatus(detectedTitles.length ? "All detected Amazon products were already used in the last 60 days for this computer." : "Could not find Amazon product titles on this page.", "error");
      return;
    }
    await rememberBulkProducts(computer, allHistory, freshHistory, titles);
    const queue = {
      active: true,
      source: "amazon-best-sellers",
      titles,
      index: 0,
      targetCompetitors: 500,
      maxPagesPerTitle: 3,
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
    await storageSet({
      bulkLinksAmazonQueue: queue,
      pendingEcomSniperBulkExtract: {
        active: true,
        autoPages: true,
        bulkQueue: true,
        query: titles[0],
        phase: "extract",
        pagesDone: 0,
        maxPages: queue.maxPagesPerTitle,
        startedAt: Date.now()
      },
      lastProductResearchTitle: titles[0]
    });
    renderStatus(`Starting bulk links from ${titles.length} new Amazon products for computer ${computer}.`, "ready");
    window.open(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(titles[0])}`, "_blank", "noopener");
  }

  async function startSnipingWorkflowFromAmazon() {
    const product = bestAmazonProductForWorkflow();
    const title = product.title;
    const amazonPrice = product.price;
    if (!title || !amazonPrice) {
      renderStatus("Open or select one Amazon product with a visible price first.", "error");
      return;
    }
    const result = await storageGet(["findProductsWorkflow"]);
    const previous = result.findProductsWorkflow || {};
    const workflows = {
      bulkListing: { steps: {}, counters: {} },
      sniping: { steps: {}, counters: {}, sellers: [], amazonPrice: "", minMarkupPercent: 70 },
      substitution: { steps: {}, counters: {} },
      ...(previous.workflows || {})
    };
    workflows.sniping = {
      ...(workflows.sniping || {}),
      amazonPrice: String(amazonPrice),
      minMarkupPercent: Number(workflows.sniping?.minMarkupPercent || 70)
    };
    await storageSet({
      pendingSnipingExtract: {
        active: true,
        query: title,
        amazonPrice,
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
    renderStatus("Starting sniping workflow on eBay.", "ready");
    window.open(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(title)}`, "_blank", "noopener");
  }

  function createPanel() {
    if (document.getElementById("gldn-amazon-order-panel")) return;
    panel = document.createElement("div");
    panel.id = "gldn-amazon-order-panel";
    panel.className = "gldn-order-panel";
    panel.innerHTML = `
      <div class="gldn-panel-heading">
        <img class="gldn-logo-image" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="GLDN Ops">
        <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v3.4.16</span></div>
        <div class="gldn-drag-grip" aria-hidden="true">⋮⋮</div>
      </div>
      <button type="button" data-action="copy" class="gldn-primary">Review & Copy Amazon Info</button>
      <button type="button" data-action="profile" class="gldn-secondary">Set Amazon Profile</button>
      <div class="gldn-status">Scanning checkout…</div>
    `;
    document.documentElement.appendChild(panel);
    U.makePanelDraggable(panel, "gldnAmazonPanelPosition");
    statusElement = panel.querySelector(".gldn-status");
    panel.querySelector("[data-action='copy']").addEventListener("click", copyAmazonInfo);
    panel.querySelector("[data-action='profile']").addEventListener("click", setProfileLabel);
    updateProfileButton();
  }

  createPanel();
  autoCacheCheckout();

  storageGet(["pendingAmazonBulkWorkflowStart", "pendingAmazonSnipingWorkflowStart"]).then(async (result) => {
    if (result.pendingAmazonBulkWorkflowStart?.active) {
      await storageRemove(["pendingAmazonBulkWorkflowStart"]);
      startBulkLinksFromAmazon();
    } else if (result.pendingAmazonSnipingWorkflowStart?.active) {
      await storageRemove(["pendingAmazonSnipingWorkflowStart"]);
      startSnipingWorkflowFromAmazon();
    }
  });

  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(autoCacheCheckout, 700);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(autoCacheCheckout, 3000);
})();
