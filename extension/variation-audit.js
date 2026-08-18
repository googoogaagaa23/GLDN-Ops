(function initializeVariationAuditPage() {
  "use strict";

  const CORE = globalThis.GLDN_VARIATION_CORE;
  const STORAGE_KEY = "variationAuditState";
  const LEDGER_KEY = "variationEndLedger";
  const PENDING_KEY = "pendingVariationEndReview";
  const RESULT_KEY = "lastVariationEndResult";
  const SCAN_KEY = "variationAuditScanState";
  const PAGE_SIZE = 100;
  const END_BATCH_LIMIT = 200;
  const elements = Object.fromEntries([
    "scanVariations", "reportIdentity", "reportRows", "uniqueListings",
    "variationListings", "completedListings", "remainingListings", "selectedListings", "listingSearch", "selectAll", "clearSelection",
    "downloadAudit", "prepareEndReview", "status", "listingRows", "pageSelection", "rangeLabel",
    "pageLabel", "previousPage", "nextPage", "currentReview", "currentReviewCount", "currentReviewReport",
    "focusReview", "approvalToken", "approvalInstruction", "approveEnd"
  ].map((id) => [id, document.getElementById(id)]));

  let audit = null;
  let filteredListings = [];
  let page = 1;
  let pendingReview = null;
  let latestResult = null;
  let legacyProgressUnknown = false;
  let scanning = false;
  let preparingReview = false;
  let autoAdvanceResultKey = "";
  const selectedIds = new Set();
  const completedIds = new Set();

  function storageGet(keys) {
    return new Promise((resolve, reject) => chrome.storage.local.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result || {});
    }));
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    }));
  }

  function runtimeMessage(message, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("GLDN Ops did not answer before the safety timeout."));
      }, timeoutMs);
      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response || {});
      });
    });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function setStatus(message, type = "") {
    elements.status.textContent = String(message || "");
    elements.status.className = `status${type ? ` ${type}` : ""}`;
  }

  function pendingMatchesAudit() {
    return Boolean(audit?.reportFingerprint)
      && pendingReview?.active === true
      && String(pendingReview.reportFingerprint || "") === String(audit.reportFingerprint);
  }

  function expectedApprovalToken() {
    return pendingMatchesAudit()
      ? `APPROVE END VARIATIONS ${Number(pendingReview.requestedCount || 0)}`
      : "";
  }

  function applyCompletedLedger(ledger) {
    completedIds.clear();
    const record = ledger && audit?.reportFingerprint ? ledger[audit.reportFingerprint] : null;
    const validIds = new Set((audit?.listings || []).map((listing) => String(listing.itemId)));
    (Array.isArray(record?.successfulItemIds) ? record.successfulItemIds : [])
      .map(String)
      .filter((itemId) => validIds.has(itemId))
      .forEach((itemId) => completedIds.add(itemId));
  }

  function selectAllRemaining() {
    selectedIds.clear();
    if (legacyProgressUnknown) return;
    (audit?.listings || []).forEach((listing) => {
      if (!completedIds.has(String(listing.itemId))) selectedIds.add(String(listing.itemId));
    });
  }

  function reconcileCompletedResult(result, announce = true) {
    if (!audit || !result || String(result.reportFingerprint || "") !== String(audit.reportFingerprint || "")) return false;
    (Array.isArray(result.successfulItemIds) ? result.successfulItemIds : []).map(String).forEach((itemId) => {
      completedIds.add(itemId);
      selectedIds.delete(itemId);
    });
    (Array.isArray(result.failedItemIds) ? result.failedItemIds : []).map(String).forEach((itemId) => {
      if (!completedIds.has(itemId)) selectedIds.add(itemId);
    });
    latestResult = result;
    pendingReview = null;
    elements.approvalToken.value = "";
    if (announce) {
      const successful = Number(result.successfulCount || 0);
      const failed = Number(result.failedCount || 0);
      const remaining = Math.max(0, Number(audit.variationListingCount || 0) - completedIds.size);
      setStatus(`eBay ended ${successful.toLocaleString()} exact variation listings${failed ? `; ${failed.toLocaleString()} failed and remain selected` : ""}. ${remaining.toLocaleString()} remain in this scan.`, failed ? "error" : "success");
    }
    render();
    const resultKey = `${String(result.runId || "")}|${String(result.completedAt || "")}`;
    if (!Number(result.failedCount || 0) && selectedIds.size && resultKey && autoAdvanceResultKey !== resultKey) {
      autoAdvanceResultKey = resultKey;
      setTimeout(() => prepareNextReview(true), 700);
    }
    return true;
  }

  function reportLabel() {
    if (!audit) return "Not scanned yet";
    const reportTime = audit.reportModifiedAt ? new Date(audit.reportModifiedAt).toLocaleString() : "date unavailable";
    return `${audit.reportName} | ${reportTime}`;
  }

  function listingMatches(listing, query) {
    if (!query) return true;
    return [listing.itemId, listing.title, listing.sku, listing.category, listing.variationSummary]
      .join(" ").toLowerCase().includes(query);
  }

  function refreshFilteredListings() {
    const query = elements.listingSearch.value.trim().toLowerCase();
    filteredListings = (audit?.listings || []).filter((listing) => listingMatches(listing, query));
    const totalPages = Math.max(1, Math.ceil(filteredListings.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);
  }

  function currentPageRows() {
    const start = (page - 1) * PAGE_SIZE;
    return filteredListings.slice(start, start + PAGE_SIZE);
  }

  function render() {
    refreshFilteredListings();
    const rows = currentPageRows();
    const totalPages = filteredListings.length ? Math.ceil(filteredListings.length / PAGE_SIZE) : 0;
    const start = filteredListings.length ? ((page - 1) * PAGE_SIZE) + 1 : 0;
    const end = filteredListings.length ? start + rows.length - 1 : 0;

    elements.reportIdentity.textContent = reportLabel();
    elements.reportRows.textContent = Number(audit?.totalReportRows || 0).toLocaleString();
    elements.uniqueListings.textContent = Number(audit?.uniqueListingCount || 0).toLocaleString();
    elements.variationListings.textContent = Number(audit?.variationListingCount || 0).toLocaleString();
    elements.completedListings.textContent = completedIds.size.toLocaleString();
    elements.remainingListings.textContent = Math.max(0, Number(audit?.variationListingCount || 0) - completedIds.size).toLocaleString();
    elements.selectedListings.textContent = selectedIds.size.toLocaleString();
    elements.scanVariations.disabled = scanning || pendingMatchesAudit();
    elements.scanVariations.textContent = scanning
      ? "Scanning Every Active Listing..."
      : pendingMatchesAudit()
        ? "Review Awaiting Approval"
        : "Scan & Prepare Review";
    elements.downloadAudit.disabled = !audit?.variationListingCount;
    const hasPendingReview = pendingMatchesAudit();
    const nextBatchCount = Math.min(END_BATCH_LIMIT, selectedIds.size);
    elements.prepareEndReview.disabled = !selectedIds.size || hasPendingReview || legacyProgressUnknown;
    elements.prepareEndReview.textContent = hasPendingReview
      ? `Review ${Number(pendingReview.requestedCount || 0).toLocaleString()} on eBay`
      : nextBatchCount
        ? `Prepare Next ${nextBatchCount.toLocaleString()}`
        : completedIds.size && completedIds.size === Number(audit?.variationListingCount || 0)
          ? "All Variations Completed"
          : "Prepare Next Batch";
    elements.previousPage.disabled = page <= 1 || !filteredListings.length;
    elements.nextPage.disabled = page >= totalPages || !filteredListings.length;
    elements.pageLabel.textContent = `Page ${totalPages ? page : 0} of ${totalPages}`;
    elements.rangeLabel.textContent = `${start.toLocaleString()}-${end.toLocaleString()} of ${filteredListings.length.toLocaleString()} shown`;
    const selectableRows = rows.filter((listing) => !completedIds.has(String(listing.itemId)));
    elements.pageSelection.disabled = !selectableRows.length || legacyProgressUnknown;
    elements.pageSelection.checked = Boolean(selectableRows.length) && selectableRows.every((listing) => selectedIds.has(listing.itemId));
    elements.pageSelection.indeterminate = selectableRows.some((listing) => selectedIds.has(listing.itemId)) && !elements.pageSelection.checked;
    elements.currentReview.hidden = !hasPendingReview;
    if (hasPendingReview) {
      const count = Number(pendingReview.requestedCount || 0);
      const token = expectedApprovalToken();
      elements.currentReviewCount.textContent = `${count.toLocaleString()} exact listings`;
      elements.currentReviewReport.textContent = String(pendingReview.reportName || audit?.reportName || "Automated Active Listings scan");
      elements.approvalToken.placeholder = token;
      elements.approvalInstruction.textContent = `After reviewing eBay, type exactly ${token}.`;
      elements.approveEnd.textContent = `End Exact ${count.toLocaleString()}`;
      elements.approveEnd.disabled = String(elements.approvalToken.value || "").trim() !== token;
    }

    if (!rows.length) {
      elements.listingRows.innerHTML = `<tr><td colspan="7" class="empty">${audit ? "No variation listings match this search." : "Run the automated scan to begin."}</td></tr>`;
      return;
    }
    elements.listingRows.innerHTML = rows.map((listing) => {
      const completed = completedIds.has(String(listing.itemId));
      return `
      <tr class="${completed ? "is-completed" : ""}">
        <td class="check-cell"><input type="checkbox" data-item-id="${escapeHtml(listing.itemId)}" ${selectedIds.has(listing.itemId) ? "checked" : ""} ${completed || legacyProgressUnknown ? "disabled" : ""} aria-label="Select ${escapeHtml(listing.itemId)}"></td>
        <td><strong>${escapeHtml(listing.itemId)}</strong><span class="meta">${escapeHtml(listing.category || "No category")}</span></td>
        <td><span class="title">${escapeHtml(listing.title || "Untitled listing")}</span><span class="meta">SKU: ${escapeHtml(listing.sku || "Not reported")}</span></td>
        <td><span class="variation">${escapeHtml(listing.variationSummary || "Variation details present")}</span><span class="meta">${Number(listing.variationRowCount || 0).toLocaleString()} report rows; ${Number(listing.variationValueCount || 0).toLocaleString()} distinct values</span></td>
        <td><span class="price-range">${escapeHtml(CORE.formatPriceRange(listing.minPrice, listing.maxPrice))}</span></td>
        <td><span>${escapeHtml(listing.availableQuantity || "-")}</span><span class="meta">Sold: ${escapeHtml(listing.soldQuantity || "0")}</span></td>
        <td><span class="row-status ${completed ? "completed" : ""}">${completed ? "Ended" : "Pending"}</span></td>
      </tr>
    `;
    }).join("");
  }

  async function loadAudit(parsed, persist = false) {
    if (!parsed?.schemaVersion || !Array.isArray(parsed.listings)) {
      throw new Error("The automated eBay scan did not return a valid variation audit.");
    }
    audit = parsed;
    legacyProgressUnknown = false;
    const stored = await storageGet([LEDGER_KEY, PENDING_KEY, RESULT_KEY]);
    applyCompletedLedger(stored[LEDGER_KEY]);
    pendingReview = stored[PENDING_KEY]?.active
      && String(stored[PENDING_KEY]?.reportFingerprint || "") === String(parsed.reportFingerprint)
      ? stored[PENDING_KEY]
      : null;
    latestResult = stored[RESULT_KEY] || null;
    selectAllRemaining();
    page = 1;
    elements.listingSearch.value = "";
    if (persist) await storageSet({ [STORAGE_KEY]: parsed });
    render();
  }

  function scanProgressMessage(state) {
    if (!state?.active && state?.phase === "complete") {
      return `Scanned ${Number(state.totalListings || 0).toLocaleString()} active listings and found ${Number(state.variationParents || 0).toLocaleString()} variation parents.`;
    }
    if (state?.phase === "listing-scan") {
      const pages = state.totalPages ? ` of ${Number(state.totalPages).toLocaleString()}` : "";
      return `Scanning Active Listings page ${Number(state.page || 1).toLocaleString()}${pages}: ${Number(state.scannedListings || 0).toLocaleString()} of ${Number(state.totalListings || 0).toLocaleString()} verified.`;
    }
    if (state?.phase === "classifying") {
      return `Identifying true variation parents: batch ${Number(state.classificationBatch || 1).toLocaleString()} of ${Number(state.classificationBatches || 1).toLocaleString()}, ${Number(state.classifiedListings || 0).toLocaleString()} of ${Number(state.totalListings || 0).toLocaleString()} checked.`;
    }
    if (state?.phase === "error") return String(state.error || "The automated scan stopped safely.");
    return "Opening a quiet signed-in eBay scan tab...";
  }

  async function startAutomatedScan() {
    if (scanning) return;
    if (pendingMatchesAudit()) {
      elements.focusReview.click();
      return;
    }
    scanning = true;
    render();
    setStatus("Opening a quiet signed-in eBay scan tab...");
    try {
      const response = await runtimeMessage({ type: "scanEbayVariationListings" }, 20 * 60 * 1000);
      if (!response?.ok) throw new Error(response?.error || "The automated variation scan stopped safely.");
      await loadAudit(response.audit, false);
      if (!response.variationParents) {
        setStatus(`Scanned all ${Number(response.scannedListings || 0).toLocaleString()} active listings. eBay identified no variation parents. Nothing was changed.`, "success");
        return;
      }
      setStatus(`Found ${Number(response.variationParents).toLocaleString()} exact variation parents across ${Number(response.scannedListings || 0).toLocaleString()} active listings. Preparing the first eBay review automatically...`, "success");
      await prepareNextReview(true);
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    } finally {
      scanning = false;
      render();
    }
  }

  function download(filename, content, type = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  elements.scanVariations.addEventListener("click", startAutomatedScan);

  elements.listingSearch.addEventListener("input", () => { page = 1; render(); });
  elements.selectAll.addEventListener("click", () => {
    if (legacyProgressUnknown) return;
    (audit?.listings || []).forEach((listing) => {
      if (!completedIds.has(String(listing.itemId))) selectedIds.add(String(listing.itemId));
    });
    render();
  });
  elements.clearSelection.addEventListener("click", () => { selectedIds.clear(); render(); });
  elements.pageSelection.addEventListener("change", () => {
    currentPageRows().forEach((listing) => {
      if (completedIds.has(String(listing.itemId)) || legacyProgressUnknown) return;
      if (elements.pageSelection.checked) selectedIds.add(listing.itemId);
      else selectedIds.delete(listing.itemId);
    });
    render();
  });
  elements.listingRows.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-item-id]");
    if (!input) return;
    if (completedIds.has(String(input.dataset.itemId)) || legacyProgressUnknown) return;
    if (input.checked) selectedIds.add(input.dataset.itemId);
    else selectedIds.delete(input.dataset.itemId);
    render();
  });
  elements.previousPage.addEventListener("click", () => { page = Math.max(1, page - 1); render(); });
  elements.nextPage.addEventListener("click", () => { page += 1; render(); });

  elements.focusReview.addEventListener("click", async () => {
    try {
      const response = await runtimeMessage({ type: "focusEbayVariationEndReview" });
      if (!response?.ok) throw new Error(response?.error || "The exact eBay review could not be reopened.");
      setStatus(`Showing eBay's exact ${Number(response.requestedCount || 0).toLocaleString()}-listing review. Return here only after inspecting the visible rows.`);
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    }
  });

  elements.approvalToken.addEventListener("input", () => {
    elements.approveEnd.disabled = String(elements.approvalToken.value || "").trim() !== expectedApprovalToken();
  });

  elements.approveEnd.addEventListener("click", async () => {
    const token = String(elements.approvalToken.value || "").trim();
    if (!pendingMatchesAudit() || token !== expectedApprovalToken()) {
      setStatus(`Type exactly: ${expectedApprovalToken() || "No approval is currently available."}`, "error");
      return;
    }
    elements.approveEnd.disabled = true;
    setStatus(`Ending exactly ${Number(pendingReview.requestedCount || 0).toLocaleString()} approved variation parents through eBay...`);
    try {
      const response = await runtimeMessage({
        type: "submitEbayVariationEndReview",
        confirmationToken: token
      }, 120000);
      const reconciled = reconcileCompletedResult(response, true);
      if (!reconciled && !response?.ok) throw new Error(response?.error || response?.message || "eBay did not complete the exact End request.");
    } catch (error) {
      setStatus(error?.message || String(error), "error");
      render();
    }
  });

  elements.downloadAudit.addEventListener("click", () => {
    if (!audit) return;
    const suffix = new Date().toISOString().slice(0, 10);
    download(`GLDN-variation-listings-${suffix}.csv`, CORE.auditCsv(audit, [...selectedIds]));
    setStatus(`Downloaded an audit containing ${selectedIds.size ? selectedIds.size.toLocaleString() : audit.variationListingCount.toLocaleString()} variation parents.`, "success");
  });

  async function prepareNextReview(automatic = false) {
    if (!audit || !selectedIds.size || pendingMatchesAudit() || legacyProgressUnknown || preparingReview) return;
    preparingReview = true;
    const batchIds = [...selectedIds].slice(0, END_BATCH_LIMIT);
    const remaining = Math.max(0, selectedIds.size - batchIds.length);
    setStatus(`${automatic ? "Automatically preparing" : "Preparing"} an exact ${batchIds.length.toLocaleString()}-listing eBay End review...`);
    elements.prepareEndReview.disabled = true;
    try {
      const response = await runtimeMessage({
        type: "prepareEbayVariationEndReview",
        itemIds: batchIds,
        reportFingerprint: audit.reportFingerprint,
        reportName: audit.reportName,
        selectedTotal: selectedIds.size,
        sourceTabId: audit.sourceTabId
      }, 120000);
      if (!response?.ok) throw new Error(response?.error || "eBay did not create the exact End review.");
      const stored = await storageGet([PENDING_KEY]);
      pendingReview = stored[PENDING_KEY] || null;
      const token = expectedApprovalToken();
      setStatus(`Opened eBay review for exactly ${response.requestedCount.toLocaleString()} variation parents. Inspect every visible row before entering ${token}. ${remaining.toLocaleString()} remain for later batches.`, "success");
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    } finally {
      preparingReview = false;
      render();
    }
  }

  elements.prepareEndReview.addEventListener("click", () => prepareNextReview(false));

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[SCAN_KEY]) {
      const scanState = changes[SCAN_KEY].newValue || null;
      scanning = scanState?.active === true;
      if (scanState) setStatus(scanProgressMessage(scanState), scanState.phase === "error" ? "error" : scanState.phase === "complete" ? "success" : "");
      render();
    }
    if (changes[STORAGE_KEY]?.newValue?.schemaVersion === 1) {
      loadAudit(changes[STORAGE_KEY].newValue, false).catch((error) => setStatus(error?.message || String(error), "error"));
    }
    if (!audit) return;
    if (changes[LEDGER_KEY]) {
      applyCompletedLedger(changes[LEDGER_KEY].newValue || {});
      completedIds.forEach((itemId) => selectedIds.delete(itemId));
    }
    if (changes[PENDING_KEY]) {
      const candidate = changes[PENDING_KEY].newValue || null;
      pendingReview = candidate?.active
        && String(candidate.reportFingerprint || "") === String(audit.reportFingerprint || "")
        ? candidate
        : null;
      if (!pendingReview) elements.approvalToken.value = "";
    }
    if (changes[RESULT_KEY]) {
      reconcileCompletedResult(changes[RESULT_KEY].newValue || null, true);
      return;
    }
    render();
  });

  storageGet([STORAGE_KEY, LEDGER_KEY, PENDING_KEY, RESULT_KEY, SCAN_KEY]).then((stored) => {
    scanning = stored[SCAN_KEY]?.active === true;
    const saved = stored[STORAGE_KEY];
    if (saved?.schemaVersion === 1 && Array.isArray(saved.listings)) {
      audit = saved;
      applyCompletedLedger(stored[LEDGER_KEY] || {});
      const candidate = stored[PENDING_KEY] || null;
      pendingReview = candidate?.active
        && String(candidate.reportFingerprint || "") === String(saved.reportFingerprint || "")
        ? candidate
        : null;
      latestResult = stored[RESULT_KEY] || null;
      const resultCompletedAt = Date.parse(String(latestResult?.completedAt || ""));
      const auditImportedAt = Date.parse(String(saved.importedAt || ""));
      legacyProgressUnknown = Number.isFinite(resultCompletedAt)
        && Number.isFinite(auditImportedAt)
        && resultCompletedAt >= auditImportedAt
        && !String(latestResult?.reportFingerprint || "").trim()
        && !completedIds.size;
      selectAllRemaining();
      if (legacyProgressUnknown) {
        setStatus("An older build did not link completion receipts to this audit. Run a fresh automated scan before preparing another batch.", "error");
      } else if (pendingMatchesAudit()) {
        setStatus(`An exact ${Number(pendingReview.requestedCount || 0).toLocaleString()}-listing eBay review is still open. Inspect it before entering ${expectedApprovalToken()}.`);
      } else {
        const remaining = Math.max(0, Number(saved.variationListingCount || 0) - completedIds.size);
        setStatus(`Restored ${saved.variationListingCount.toLocaleString()} variation parents from ${saved.reportName}. ${completedIds.size.toLocaleString()} are complete and ${remaining.toLocaleString()} remain. Run Scan & Prepare Review for a fresh account-wide result.`);
      }
    } else if (stored[SCAN_KEY]) {
      setStatus(scanProgressMessage(stored[SCAN_KEY]), stored[SCAN_KEY].phase === "error" ? "error" : stored[SCAN_KEY].phase === "complete" ? "success" : "");
    }
    render();
  }).catch((error) => setStatus(error?.message || String(error), "error"));
})();
