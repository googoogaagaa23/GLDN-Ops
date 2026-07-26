(() => {
  if (window.__GLDN_WALMART_ORDER_ASSISTANT__) return;
  window.__GLDN_WALMART_ORDER_ASSISTANT__ = true;

  const U = window.OrderNoteUtils;
  const STORAGE_KEY = "pendingWalmartAutoOrder";
  const FINAL_PURCHASE_PATTERN = /\b(place\s+order|submit\s+order|complete\s+purchase|confirm\s+purchase|pay\s+now|buy\s+now)\b/i;

  let panel;
  let statusElement;
  let summaryElement;
  let pendingOrder = null;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function status(message, type = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  }

  function findUrlParam(name) {
    const sources = [location.search, location.hash ? location.hash.slice(1) : ""].filter(Boolean);
    for (const source of sources) {
      const params = new URLSearchParams(source.startsWith("?") ? source : `?${source}`);
      const value = params.get(name);
      if (value !== null) return value;
    }
    const match = location.href.match(new RegExp(`[?&]${name}=([^&#]+)`, "i"));
    return match ? match[1] : null;
  }

  function decodePossiblyEncoded(value) {
    let current = String(value || "");
    for (let i = 0; i < 3; i += 1) {
      try {
        const decoded = decodeURIComponent(current.replace(/\+/g, " "));
        if (decoded === current) break;
        current = decoded;
      } catch (_) {
        break;
      }
    }
    return current;
  }

  function parseOrderDetailsFromUrl() {
    const raw = findUrlParam("orderDetails");
    if (!raw) return null;
    const candidates = [raw, decodePossiblyEncoded(raw)];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_) {}
    }
    return null;
  }

  function autoOrderRequested() {
    const value = findUrlParam("autoOrder");
    return /^(true|1|yes)$/i.test(String(value || "")) || /[?&]autoOrder=true\b/i.test(location.href);
  }

  function stripSensitiveOrderParams() {
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has("orderDetails") && !url.searchParams.has("autoOrder")) return;
      url.searchParams.delete("orderDetails");
      url.searchParams.delete("autoOrder");
      history.replaceState(null, document.title, url.toString());
    } catch (_) {}
  }

  function splitName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts[parts.length - 1]
    };
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D+/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  }

  function normalizeOrder(raw, options = {}) {
    const customer = raw?.customer || {};
    const address = customer.address || {};
    const name = String(customer.name || raw?.customerName || "").trim();
    const { firstName, lastName } = splitName(name);
    return {
      supplier: "walmart",
      marketplace: "ebay",
      itemName: String(raw?.itemName || "").trim(),
      dateOfSale: String(raw?.dateOfSale || "").trim(),
      ebayOrderNumber: String(raw?.ebayOrderNumber || raw?.orderNumber || "").trim(),
      quantitySold: Math.max(1, Number.parseInt(raw?.quantitySold || "1", 10) || 1),
      ebaySku: String(raw?.ebaySku || "").trim(),
      ebayUsername: String(raw?.ebayUsername || "").trim(),
      email: String(raw?.email || "").trim(),
      name,
      firstName,
      lastName,
      phone: normalizePhone(customer.phone || raw?.phone || ""),
      addressLine1: String(address.line_1 || address.line1 || address.address1 || "").trim(),
      addressLine2: String(address.line_2 || address.line2 || address.address2 || "").trim(),
      city: String(address.city || "").trim(),
      state: String(address.state || "").trim(),
      postalCode: String(address.zip || address.postalCode || address.zipCode || "").trim(),
      country: String(address.country || "United States").trim(),
      shouldUseGiftOption: Boolean(raw?.shouldUseGiftOption),
      giftMessage: String(raw?.giftMessage || "").trim(),
      giftMessageSender: String(raw?.giftMessageSender || "").trim(),
      raw,
      autoOrder: Boolean(options.autoOrder),
      capturedAt: new Date().toISOString(),
      sourceUrl: location.href
    };
  }

  function orderHasMinimumAddress(order) {
    return Boolean(order?.name && order.addressLine1 && order.city && order.state && order.postalCode);
  }

  function addressBlock(order) {
    if (!order) return "";
    const cityStateZip = [order.city, order.state, order.postalCode].filter(Boolean).join(" ");
    return [
      order.name,
      order.addressLine1,
      order.addressLine2,
      cityStateZip,
      order.country,
      order.phone ? `Phone: ${order.phone}` : ""
    ].filter(Boolean).join("\n");
  }

  function renderSummary() {
    if (!summaryElement || !pendingOrder) return;
    summaryElement.innerHTML = `
      <div><strong>eBay order</strong><span>${escapeHtml(pendingOrder.ebayOrderNumber || "Not provided")}</span></div>
      <div><strong>Item</strong><span>${escapeHtml(pendingOrder.itemName || "Not provided")}</span></div>
      <div><strong>Quantity</strong><span>${escapeHtml(pendingOrder.quantitySold)}</span></div>
      <div><strong>Ship to</strong><span>${escapeHtml([pendingOrder.name, pendingOrder.city, pendingOrder.state, pendingOrder.postalCode].filter(Boolean).join(" - "))}</span></div>
    `;
  }

  function textOf(element) {
    return String([
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      element?.getAttribute?.("data-testid"),
      element?.getAttribute?.("data-automation-id"),
      element?.value,
      element?.innerText,
      element?.textContent
    ].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();
  }

  function visibleControls() {
    return [...document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button']")]
      .filter((element) => U.isVisible(element) && !element.disabled);
  }

  function dispatchFullClick(element) {
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.click();
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }

  function clickControl(patterns, label) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    const control = visibleControls().find((element) => {
      const text = textOf(element);
      if (FINAL_PURCHASE_PATTERN.test(text)) return false;
      return list.some((pattern) => pattern.test(text));
    });
    if (!control) return false;
    dispatchFullClick(control);
    status(label || `Clicked ${textOf(control)}`, "ready");
    return true;
  }

  async function addToCartOrCheckout() {
    if (!pendingOrder) {
      status("No Walmart order details are loaded.", "error");
      return;
    }

    const path = location.pathname.toLowerCase();
    if (/checkout/.test(path)) {
      status("Already on Walmart checkout. Use Fill Delivery Info.", "ready");
      return;
    }

    const addButton = [
      "[data-automation-id='add-to-cart']",
      "[data-testid='add-to-cart-button']",
      "button[aria-label*='Add to cart' i]"
    ].map((selector) => document.querySelector(selector)).find((element) => element && U.isVisible(element));

    if (addButton && !FINAL_PURCHASE_PATTERN.test(textOf(addButton))) {
      dispatchFullClick(addButton);
      status("Clicked Add to cart. Waiting for the cart prompt...", "ready");
      await delay(1400);
      if (clickControl([/\bview\s+cart\b/i, /\bgo\s+to\s+cart\b/i, /\bcart\b/i], "Opening Walmart cart.")) return;
      status("Added to cart. Open the cart if Walmart did not move there automatically.", "completed");
      return;
    }

    if (/cart/.test(path) || /cart/.test(document.title || "")) {
      if (clickControl([/\bcheckout\b/i, /\bcheck\s+out\b/i, /\bcontinue\s+to\s+checkout\b/i], "Opening Walmart checkout.")) return;
      status("Could not find Walmart Checkout. Review the cart manually.", "error");
      return;
    }

    if (clickControl([/\bcheckout\b/i, /\bview\s+cart\b/i, /\bgo\s+to\s+cart\b/i], "Opening Walmart cart or checkout.")) return;
    status("Could not find Add to cart or Checkout on this Walmart page.", "error");
  }

  function associatedLabelText(element) {
    const labels = [];
    if (element.id) {
      document.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`).forEach((label) => labels.push(label.innerText || label.textContent || ""));
    }
    const closestLabel = element.closest("label");
    if (closestLabel) labels.push(closestLabel.innerText || closestLabel.textContent || "");
    const container = element.closest("[data-testid], [data-automation-id], div, section");
    if (container) {
      const shortText = String(container.innerText || container.textContent || "").replace(/\s+/g, " ").trim();
      if (shortText.length <= 160) labels.push(shortText);
    }
    return labels.join(" ");
  }

  function fieldText(element) {
    return String([
      element.getAttribute("name"),
      element.id,
      element.getAttribute("autocomplete"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-automation-id"),
      associatedLabelText(element)
    ].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();
  }

  function isFillableField(element) {
    if (!element || !U.isVisible(element) || element.disabled || element.readOnly) return false;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    const type = String(element.getAttribute("type") || "").toLowerCase();
    if (["hidden", "checkbox", "radio", "button", "submit", "reset", "file", "password"].includes(type)) return false;
    const descriptor = fieldText(element);
    if (/\b(search|coupon|promo|gift\s+card|card\s+number|cvv|security\s+code|expiration)\b/i.test(descriptor)) return false;
    return true;
  }

  function allFillableFields() {
    return [...document.querySelectorAll("input, textarea, select")].filter(isFillableField);
  }

  function setSelectValue(select, value) {
    const target = String(value || "").trim();
    const option = [...select.options].find((item) => {
      const label = String(item.textContent || item.label || "").trim();
      const optionValue = String(item.value || "").trim();
      return optionValue.toLowerCase() === target.toLowerCase() || label.toLowerCase() === target.toLowerCase();
    });
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function fillField(label, patterns, value, options = {}) {
    if (!value) return { filled: false, label, optional: Boolean(options.optional) };
    const fields = allFillableFields();
    const rejectPatterns = options.reject || [];
    const field = fields.find((element) => {
      const descriptor = fieldText(element);
      if (rejectPatterns.some((pattern) => pattern.test(descriptor))) return false;
      return patterns.some((pattern) => pattern.test(descriptor));
    });
    if (!field) return { filled: false, label };
    if (field instanceof HTMLSelectElement) {
      return setSelectValue(field, value) ? { filled: true, label } : { filled: false, label };
    }
    field.focus();
    U.setNativeValue(field, value);
    field.blur();
    return { filled: true, label };
  }

  function fillGiftFields(order) {
    if (!order?.shouldUseGiftOption) return [];
    const results = [];
    const giftControl = visibleControls().find((element) => /\bgift\b/i.test(textOf(element)) && !FINAL_PURCHASE_PATTERN.test(textOf(element)));
    if (giftControl) {
      dispatchFullClick(giftControl);
      results.push({ filled: true, label: "gift option" });
    }
    if (order.giftMessage && order.giftMessage !== "-") {
      results.push(fillField("gift message", [/\bgift\s+message\b/i, /\bmessage\b/i], order.giftMessage, { optional: true }));
    }
    if (order.giftMessageSender && order.giftMessageSender !== "-") {
      results.push(fillField("gift sender", [/\bfrom\b/i, /\bsender\b/i], order.giftMessageSender, { optional: true }));
    }
    return results;
  }

  async function fillDeliveryInfo() {
    if (!orderHasMinimumAddress(pendingOrder)) {
      status("Order details are missing a full customer shipping address.", "error");
      return;
    }

    const results = [
      fillField("first name", [/\bfirst\s+name\b/i, /\bgiven\s+name\b/i, /\bgiven-name\b/i], pendingOrder.firstName),
      fillField("last name", [/\blast\s+name\b/i, /\bfamily\s+name\b/i, /\bfamily-name\b/i, /\bsurname\b/i], pendingOrder.lastName),
      fillField("address line 1", [/\baddress\s*(line)?\s*1\b/i, /\bstreet\s+address\b/i, /\baddress\b/i], pendingOrder.addressLine1, { reject: [/\baddress\s*(line)?\s*2\b/i, /\bapt\b/i, /\bapartment\b/i, /\bunit\b/i, /\bsuite\b/i] }),
      fillField("address line 2", [/\baddress\s*(line)?\s*2\b/i, /\bapt\b/i, /\bapartment\b/i, /\bunit\b/i, /\bsuite\b/i], pendingOrder.addressLine2, { optional: true }),
      fillField("city", [/\bcity\b/i], pendingOrder.city),
      fillField("state", [/\bstate\b/i, /\bprovince\b/i, /\bregion\b/i], pendingOrder.state),
      fillField("zip", [/\bzip\b/i, /\bpostal\b/i, /\bpostal-code\b/i], pendingOrder.postalCode),
      fillField("phone", [/\bphone\b/i, /\bmobile\b/i, /\btel\b/i], pendingOrder.phone),
      fillField("email", [/\bemail\b/i], pendingOrder.email, { optional: true }),
      ...fillGiftFields(pendingOrder)
    ];

    const required = results.filter((result) => !result.optional);
    const filledRequired = required.filter((result) => result.filled);
    const missing = required.filter((result) => !result.filled).map((result) => result.label);

    await storageSet({
      [STORAGE_KEY]: {
        ...pendingOrder,
        lastFilledAt: new Date().toISOString()
      }
    });

    if (missing.length) {
      status(`Filled ${filledRequired.length}/${required.length}. Missing: ${missing.join(", ")}.`, "error");
    } else {
      status(`Filled Walmart delivery fields for eBay order ${pendingOrder.ebayOrderNumber || ""}. Review before continuing.`, "completed");
    }
  }

  function continueAddressStep() {
    if (visibleControls().some((element) => FINAL_PURCHASE_PATTERN.test(textOf(element)))) {
      status("Final purchase control is visible. Review everything manually; GLDN Ops will not click it.", "error");
      return;
    }

    if (clickControl([
      /\buse\s+this\s+address\b/i,
      /\buse\s+address\b/i,
      /\bsave\s+address\b/i,
      /\bsave\s+and\s+continue\b/i,
      /\bdeliver\s+(here|to\s+this\s+address)\b/i,
      /\bship\s+to\s+this\s+address\b/i,
      /\bcontinue\b/i
    ], "Continued the Walmart address step. Stop before final Place order.")) return;

    status("Could not find a safe address Continue button.", "error");
  }

  async function copyAddress() {
    if (!pendingOrder) {
      status("No Walmart order details are loaded.", "error");
      return;
    }
    await navigator.clipboard.writeText(addressBlock(pendingOrder));
    status("Copied customer shipping block to clipboard.", "copied");
  }

  async function clearOrder() {
    await storageRemove([STORAGE_KEY]);
    pendingOrder = null;
    panel?.remove();
  }

  async function captureOrderFromUrl() {
    const parsed = parseOrderDetailsFromUrl();
    if (!parsed) return null;
    const order = normalizeOrder(parsed, { autoOrder: autoOrderRequested() });
    if (!orderHasMinimumAddress(order)) {
      stripSensitiveOrderParams();
      return { error: "The link had orderDetails, but the customer shipping address was incomplete." };
    }
    await storageSet({ [STORAGE_KEY]: order });
    stripSensitiveOrderParams();
    return { order };
  }

  function createPanel() {
    if (document.getElementById("gldn-walmart-order-panel")) return;
    panel = document.createElement("div");
    panel.id = "gldn-walmart-order-panel";
    panel.className = "gldn-order-panel";
    panel.innerHTML = `
      <div class="gldn-panel-heading">
        <img class="gldn-logo-image" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="GLDN Ops">
        <div class="gldn-panel-title">GLDN Walmart <span class="gldn-version">v${chrome.runtime.getManifest().version}</span></div>
        <div class="gldn-drag-grip" aria-hidden="true">::</div>
      </div>
      <div class="gldn-panel-identity gldn-walmart-summary"></div>
      <button type="button" data-action="cart" class="gldn-primary">Add / Checkout</button>
      <button type="button" data-action="fill" class="gldn-success">Fill Delivery Info</button>
      <button type="button" data-action="continue" class="gldn-warning">Continue Address Step</button>
      <button type="button" data-action="copy" class="gldn-secondary">Copy Address</button>
      <button type="button" data-action="clear" class="gldn-secondary">Clear Walmart Order</button>
      <div class="gldn-status">Walmart order details ready.</div>
    `;
    document.documentElement.appendChild(panel);
    U.makePanelDraggable(panel, "gldnWalmartPanelPosition");
    statusElement = panel.querySelector(".gldn-status");
    summaryElement = panel.querySelector(".gldn-walmart-summary");
    panel.querySelector("[data-action='cart']").addEventListener("click", addToCartOrCheckout);
    panel.querySelector("[data-action='fill']").addEventListener("click", fillDeliveryInfo);
    panel.querySelector("[data-action='continue']").addEventListener("click", continueAddressStep);
    panel.querySelector("[data-action='copy']").addEventListener("click", copyAddress);
    panel.querySelector("[data-action='clear']").addEventListener("click", clearOrder);
  }

  async function init() {
    const captured = await captureOrderFromUrl();
    if (captured?.error) {
      createPanel();
      status(captured.error, "error");
      return;
    }

    const stored = await storageGet([STORAGE_KEY]);
    pendingOrder = captured?.order || stored[STORAGE_KEY] || null;
    if (!pendingOrder) return;

    createPanel();
    renderSummary();
    status(pendingOrder.autoOrder
      ? "Order details loaded from Walmart link. Review the item, then use Add / Checkout and Fill Delivery Info."
      : "Saved Walmart order details loaded.", "ready");
  }

  init();
})();
