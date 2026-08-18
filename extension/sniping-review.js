(() => {
  const SNIPING = globalThis.GLDN_SNIPING_AUDIT;
  const anchorElement = document.getElementById("anchor");
  const candidatesElement = document.getElementById("candidates");
  const candidateCountElement = document.getElementById("candidateCount");
  const statusElement = document.getElementById("status");
  const saveButton = document.getElementById("saveSeller");
  const closeButton = document.getElementById("closeReview");
  const versionElement = document.getElementById("version");
  let workflow = null;
  let sniping = null;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));
  const runtimeMessage = (message, timeoutMs = 30000) => new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ ok: false, error: "Extension request timed out." }), timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "No response from the extension background service." });
      });
    } catch (error) {
      clearTimeout(timeout);
      resolve({ ok: false, error: error?.message || String(error) });
    }
  });

  function normalizeSellerName(value) {
    const cleaned = String(value || "")
      .trim()
      .replace(/^seller:\s*/i, "")
      .replace(/\s+\(\d[\d,]*\).*$/, "")
      .replace(/\s+\d{1,3}(?:\.\d+)?%\s+positive.*$/i, "")
      .replace(/[^a-z0-9_.-]/gi, "");
    return cleaned.length >= 3 && cleaned.length <= 64 ? cleaned : "";
  }

  function setStatus(message, type = "ready") {
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  }

  function externalLink(text, href) {
    const link = document.createElement("a");
    link.textContent = text;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }

  function productImage(src, alt) {
    if (!src) return null;
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.referrerPolicy = "no-referrer";
    return image;
  }

  function renderAnchor(anchor) {
    anchorElement.replaceChildren();
    const image = productImage(anchor.image || anchor.imageUrl, "Amazon anchor product");
    if (image) anchorElement.appendChild(image);
    const copy = document.createElement("div");
    copy.className = "product-copy";
    const price = document.createElement("strong");
    price.textContent = `Amazon anchor - $${Number(anchor.price).toFixed(2)}`;
    const title = document.createElement("span");
    title.textContent = anchor.title;
    copy.append(price, title, externalLink(`Open Amazon ASIN ${anchor.asin}`, anchor.url));
    anchorElement.appendChild(copy);
  }

  function renderCandidates(candidates) {
    candidatesElement.replaceChildren();
    candidateCountElement.textContent = `${candidates.length} FOUND`;
    candidates.forEach((candidate) => {
      const card = document.createElement("label");
      card.className = "candidate";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "sniping-candidate";
      radio.value = candidate.ebayItemNumber;
      const image = productImage(candidate.ebayImage, "eBay seller candidate");
      const meta = document.createElement("span");
      meta.className = "candidate-meta";
      const headline = document.createElement("strong");
      headline.textContent = `${candidate.seller} - $${candidate.economics.ebayPrice.toFixed(2)} (${candidate.economics.markupPercent.toFixed(1)}% markup)`;
      const title = document.createElement("span");
      title.textContent = candidate.ebayTitle;
      const economics = document.createElement("span");
      economics.className = "economics";
      economics.textContent = `Conservative estimated profit: $${candidate.economics.estimatedNetProfit.toFixed(2)}`;
      meta.append(headline, title, economics, externalLink(`Open eBay item ${candidate.ebayItemNumber}`, candidate.ebayUrl));
      card.appendChild(radio);
      if (image) card.appendChild(image);
      else card.appendChild(document.createElement("span"));
      card.appendChild(meta);
      candidatesElement.appendChild(card);
    });
  }

  function updateSaveState() {
    const selected = document.querySelector("input[name='sniping-candidate']:checked");
    const checksComplete = [...document.querySelectorAll("[data-check]")].every((input) => input.checked);
    saveButton.disabled = !(selected && checksComplete);
  }

  async function saveVerifiedSeller() {
    const itemNumber = document.querySelector("input[name='sniping-candidate']:checked")?.value || "";
    const candidate = sniping.candidates.find((record) => record.ebayItemNumber === itemNumber);
    const confirmation = SNIPING.confirmSellerCandidate(candidate, {
      confirmed: true,
      titleChecked: document.querySelector("[data-check='title']")?.checked === true,
      imageChecked: document.querySelector("[data-check='image']")?.checked === true,
      variantChecked: document.querySelector("[data-check='variant']")?.checked === true
    });
    if (!confirmation.ok) {
      setStatus(confirmation.error, "error");
      return;
    }

    saveButton.disabled = true;
    const verified = confirmation.candidate;
    const sellers = [...new Set([...(sniping.sellers || []), verified.seller]
      .map(normalizeSellerName)
      .filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    workflow.workflows = { ...(workflow.workflows || {}) };
    workflow.workflows.sniping = {
      ...sniping,
      phase: "seller-qualified",
      sellers,
      qualifiedSeller: verified,
      counters: { ...(sniping.counters || {}), sellersCollected: sellers.length, sellerCandidates: sniping.candidates.length },
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
    setStatus(`Verified ${verified.seller} at ${verified.economics.markupPercent.toFixed(1)}% markup. Opening EcomSniper Competitor Scanner.`, "completed");
    const opened = await runtimeMessage({ type: "openEcomSniperPage", page: "competitorScanner" });
    if (!opened?.ok) {
      setStatus(`Seller saved, but EcomSniper could not open: ${opened?.error || "unknown error"}`, "error");
    }
  }

  async function initialize() {
    versionElement.textContent = `v${chrome.runtime.getManifest().version}`;
    if (!SNIPING) {
      setStatus("The sniping audit module did not load.", "error");
      return;
    }
    const stored = await storageGet(["findProductsWorkflow"]);
    workflow = stored.findProductsWorkflow || null;
    sniping = workflow?.workflows?.sniping || null;
    const anchor = sniping?.anchorProduct;
    const candidates = Array.isArray(sniping?.candidates) ? sniping.candidates : [];
    if (!anchor?.asin || !anchor?.url || !candidates.length || sniping?.phase !== "seller-review") {
      setStatus("No current seller review is ready. Start Sniping Workflow again from an exact Amazon product.", "error");
      saveButton.disabled = true;
      return;
    }
    renderAnchor(anchor);
    renderCandidates(candidates);
  }

  document.addEventListener("change", updateSaveState);
  saveButton.addEventListener("click", saveVerifiedSeller);
  closeButton.addEventListener("click", () => window.close());
  initialize().catch((error) => {
    setStatus(`Seller review failed safely: ${error?.message || String(error)}`, "error");
    runtimeMessage({
      type: "recordExtensionLog",
      entry: { source: "sniping-review", operation: "initialize", message: error?.message || String(error) }
    });
  });
})();
