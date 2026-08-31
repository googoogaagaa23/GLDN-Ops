(async function initializePolicyListingAuditPage() {
  "use strict";

  const CORE = globalThis.GLDN_POLICY_LISTING_AUDIT;
  const AUDIT_KEY = "ebayPolicyListingAudit";
  const SCAN_KEY = "ebayPolicyListingScanState";
  const PENDING_KEY = "pendingPolicyListingEndReview";
  const LEDGER_KEY = "policyListingEndLedger";
  const RESULT_KEY = "lastPolicyListingEndResult";
  const PAGE_SIZE = 100;
  const END_BATCH_LIMIT = 200;
  const AUDIT_ONLY = true;
  const byId = (id) => document.getElementById(id);
  const elements = {
    freshScan: byId("freshScan"),
    resumeScan: byId("resumeScan"),
    stopScan: byId("stopScan"),
    discardScan: byId("discardScan"),
    scanHeadline: byId("scanHeadline"),
    scanDetail: byId("scanDetail"),
    auditIdentity: byId("auditIdentity"),
    metricScanned: byId("metricScanned"),
    metricClear: byId("metricClear"),
    metricReview: byId("metricReview"),
    metricBlock: byId("metricBlock"),
    metricEnded: byId("metricEnded"),
    metricSelected: byId("metricSelected"),
    listingSearch: byId("listingSearch"),
    selectAllBlock: byId("selectAllBlock"),
    clearSelection: byId("clearSelection"),
    downloadAudit: byId("downloadAudit"),
    prepareReview: byId("prepareReview"),
    status: byId("status"),
    currentReview: byId("currentReview"),
    currentReviewCount: byId("currentReviewCount"),
    currentReviewReport: byId("currentReviewReport"),
    focusReview: byId("focusReview"),
    cancelReview: byId("cancelReview"),
    approvalToken: byId("approvalToken"),
    approvalInstruction: byId("approvalInstruction"),
    approveEnd: byId("approveEnd"),
    pageSelection: byId("pageSelection"),
    listingRows: byId("listingRows"),
    rangeLabel: byId("rangeLabel"),
    pageLabel: byId("pageLabel"),
    previousPage: byId("previousPage"),
    nextPage: byId("nextPage")
  };

  let audit = null;
  let scanState = null;
  let pendingReview = null;
  let endLedger = {};
  let latestResult = null;
  let filter = "all";
  let page = 1;
  let operationBusy = false;
  const selectedIds = new Set();

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result || {});
      });
    });
  }

  function runtimeMessage(message, timeoutMs = 45 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("GLDN Ops did not finish before the page timeout. Reopen this page to inspect the saved checkpoint."));
      }, timeoutMs);
      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response || {});
      });
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, tone = "") {
    elements.status.textContent = String(message || "");
    elements.status.className = `status${tone ? ` ${tone}` : ""}`;
  }

  function completedIds() {
    const entry = endLedger?.[String(audit?.reportFingerprint || "")] || {};
    return new Set((entry.successfulItemIds || []).map(String));
  }

  function pendingMatchesAudit() {
    return Boolean(pendingReview?.active)
      && String(pendingReview.reportFingerprint || "") === String(audit?.reportFingerprint || "");
  }

  function expectedApprovalToken() {
    if (!pendingMatchesAudit()) return "";
    return `APPROVE END POLICY LISTINGS ${Number(pendingReview.requestedCount || 0)}`;
  }

  function searchText(listing) {
    return [
      listing.itemId,
      listing.title,
      listing.sku,
      listing.asin,
      listing.category,
      listing.reason,
      ...(listing.matches || []).flatMap((match) => [match.id, match.type, match.value, match.reason, match.source])
    ].join(" ").toLowerCase();
  }

  function filteredRows() {
    const query = String(elements.listingSearch.value || "").trim().toLowerCase();
    const done = completedIds();
    return (audit?.listings || []).filter((listing) => {
      if (filter === "ended" && !done.has(String(listing.itemId))) return false;
      if (filter !== "all" && filter !== "ended" && listing.action !== filter) return false;
      return !query || searchText(listing).includes(query);
    });
  }

  function currentPageRows() {
    const rows = filteredRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);
    return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  function scanProgressMessage(state) {
    if (!state) return "No complete scan saved.";
    if (state.phase === "scanning") {
      const totalPages = Number(state.totalPages || 0);
      return `Scanning page ${Number(state.page || 1).toLocaleString()}${totalPages ? ` of ${totalPages.toLocaleString()}` : ""}: ${Number(state.scannedListings || 0).toLocaleString()} of ${Number(state.totalListings || 0).toLocaleString()} verified.`;
    }
    if (state.phase === "paused") return `Paused before page ${Number(state.nextPage || 1).toLocaleString()}. Resume continues from the saved verified checkpoint.`;
    if (state.phase === "error") return `${String(state.error || "The scan stopped safely.")} The verified checkpoint is resumable.`;
    if (state.phase === "complete") return `Complete: ${Number(state.totalListings || 0).toLocaleString()} unique Active Listings were verified and classified.`;
    return "Preparing a quiet signed-in eBay scan tab...";
  }

  function render() {
    const done = completedIds();
    const rows = currentPageRows();
    const allRows = filteredRows();
    const totalPages = allRows.length ? Math.ceil(allRows.length / PAGE_SIZE) : 0;
    const start = allRows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
    const end = allRows.length ? Math.min(page * PAGE_SIZE, allRows.length) : 0;
    const scanActive = scanState?.active === true && scanState?.phase === "scanning";
    const resumable = !scanActive && ["paused", "error"].includes(String(scanState?.phase || "")) && Boolean(scanState?.runId);
    const hasAnyPendingReview = pendingReview?.active === true;
    const hasPendingReview = pendingMatchesAudit();

    elements.metricScanned.textContent = Number(audit?.summary?.total || 0).toLocaleString();
    elements.metricClear.textContent = Number(audit?.summary?.clear || 0).toLocaleString();
    elements.metricReview.textContent = Number(audit?.summary?.review || 0).toLocaleString();
    elements.metricBlock.textContent = Number(audit?.summary?.block || 0).toLocaleString();
    elements.metricEnded.textContent = done.size.toLocaleString();
    elements.metricSelected.textContent = selectedIds.size.toLocaleString();
    elements.scanHeadline.textContent = scanProgressMessage(scanState);
    elements.scanDetail.textContent = audit
      ? `${Number(audit.ruleCount || 0).toLocaleString()} reviewed rules applied at ${new Date(audit.scannedAt).toLocaleString()}. “No rule match” is not eBay approval.`
      : "A complete scan is read-only. It verifies each 200-row eBay page before classification.";
    elements.auditIdentity.textContent = audit
      ? `${audit.computerLabel} / ${audit.ebayAccountLabel}`
      : "No audit";

    elements.freshScan.disabled = scanActive || operationBusy;
    elements.freshScan.textContent = hasAnyPendingReview ? "Cancel Review & Start Fresh Scan" : "Start Fresh Complete Scan";
    elements.resumeScan.disabled = !resumable || operationBusy || hasAnyPendingReview;
    elements.stopScan.disabled = !scanActive;
    elements.discardScan.disabled = scanActive || operationBusy || hasPendingReview || (!audit && !scanState);
    elements.selectAllBlock.disabled = !audit || scanActive || operationBusy;
    elements.clearSelection.disabled = !selectedIds.size;
    elements.downloadAudit.disabled = !audit;
    elements.prepareReview.disabled = !audit || !selectedIds.size || hasAnyPendingReview || scanActive || operationBusy;
    elements.previousPage.disabled = page <= 1;
    elements.nextPage.disabled = !totalPages || page >= totalPages;
    elements.rangeLabel.textContent = `${start.toLocaleString()}-${end.toLocaleString()} of ${allRows.length.toLocaleString()} shown`;
    elements.pageLabel.textContent = `Page ${totalPages ? page : 0} of ${totalPages}`;

    const selectableRows = rows.filter((listing) => listing.action === "block" && !done.has(String(listing.itemId)));
    elements.pageSelection.disabled = !selectableRows.length || operationBusy;
    elements.pageSelection.checked = Boolean(selectableRows.length) && selectableRows.every((listing) => selectedIds.has(String(listing.itemId)));
    elements.pageSelection.indeterminate = selectableRows.some((listing) => selectedIds.has(String(listing.itemId))) && !elements.pageSelection.checked;

    elements.currentReview.hidden = AUDIT_ONLY || !hasAnyPendingReview;
    if (hasAnyPendingReview) {
      const count = Number(pendingReview.requestedCount || 0);
      const token = expectedApprovalToken();
      elements.currentReviewCount.textContent = `${count.toLocaleString()} exact listings`;
      elements.currentReviewReport.textContent = String(pendingReview.reportName || audit?.reportName || "Existing Listings Policy Audit");
      elements.cancelReview.disabled = operationBusy;
      elements.approvalToken.placeholder = token;
      elements.approvalInstruction.textContent = hasPendingReview
        ? `After inspecting every eBay row, type exactly ${token}.`
        : "This review no longer matches the saved audit. Cancel it and run a fresh scan.";
      elements.approvalToken.disabled = !hasPendingReview || operationBusy;
      elements.approveEnd.textContent = `End Exact ${count.toLocaleString()}`;
      elements.approveEnd.disabled = !hasPendingReview || operationBusy || String(elements.approvalToken.value || "").trim() !== token;
    }

    if (!rows.length) {
      elements.listingRows.innerHTML = `<tr><td colspan="7" class="empty">${audit ? "No listings match this filter." : "Run a complete read-only scan to begin."}</td></tr>`;
      return;
    }

    elements.listingRows.innerHTML = rows.map((listing) => {
      const completed = done.has(String(listing.itemId));
      const endable = listing.action === "block" && !completed;
      const matches = (listing.matches || []).map((match) => `${match.type}: ${match.value}`).join(" | ");
      const evidenceCount = (listing.matches || []).flatMap((match) => match.evidenceUrls || []).filter(Boolean).length;
      return `
        <tr class="${completed ? "is-completed" : ""}">
          <td class="check-cell"><input type="checkbox" data-item-id="${escapeHtml(listing.itemId)}" ${selectedIds.has(String(listing.itemId)) ? "checked" : ""} ${endable ? "" : "disabled"} aria-label="Select ${escapeHtml(listing.itemId)}"></td>
          <td><a href="https://www.ebay.com/itm/${escapeHtml(listing.itemId)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(listing.itemId)}</strong></a><span class="meta">${escapeHtml(listing.category || "Category not shown")}</span></td>
          <td><span class="title">${escapeHtml(listing.title || "Untitled listing")}</span><span class="meta">SKU: ${escapeHtml(listing.sku || "Not reported")} | ASIN: ${escapeHtml(listing.asin || "Not decoded")}</span></td>
          <td><span class="classification ${escapeHtml(listing.action)}">${escapeHtml(listing.action === "clear" ? "GENERIC TEXT" : listing.status)}</span><span class="meta">${escapeHtml(listing.action === "block" ? "Urgent human inspection" : listing.action === "review" ? "Insufficient evidence or manual review" : "Still not eBay approval")}</span></td>
          <td><span class="price">${escapeHtml(CORE.formatMoney(listing.price))}</span></td>
          <td><span class="reason">${escapeHtml(listing.reason || "No reason reported")}</span><span class="evidence">${escapeHtml(matches || "No matched reviewed rule")}${evidenceCount ? ` | ${evidenceCount} source link${evidenceCount === 1 ? "" : "s"}` : ""}</span></td>
          <td><span class="row-status ${completed ? "completed" : ""}">${completed ? "Ended" : "Open"}</span></td>
        </tr>`;
    }).join("");
  }

  async function runScan(fresh) {
    if (operationBusy) return;
    operationBusy = true;
    render();
    setStatus(fresh ? "Starting a fresh complete read-only scan..." : "Resuming from the last verified page...");
    try {
      const response = await runtimeMessage({ type: "scanEbayPolicyListings", fresh });
      if (!response?.ok) {
        if (response?.paused) setStatus(response.error, "success");
        else throw new Error(response?.error || "The policy scan stopped safely.");
      } else {
        audit = response.audit;
        selectedIds.clear();
        setStatus(`Complete: ${Number(response.scannedListings || 0).toLocaleString()} listings classified read-only. ${Number(response.summary?.block || 0).toLocaleString()} official Block matches require urgent human inspection; no listing was changed.`, "success");
      }
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    } finally {
      operationBusy = false;
      const stored = await storageGet([AUDIT_KEY, SCAN_KEY]);
      audit = stored[AUDIT_KEY] || audit;
      scanState = stored[SCAN_KEY] || scanState;
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

  async function cancelReviewAndRescan() {
    if (operationBusy) return;
    operationBusy = true;
    render();
    setStatus("Canceling the saved eBay review and preparing a fresh read-only scan...");
    let canceled = false;
    try {
      const response = await runtimeMessage({ type: "cancelEbayPolicyListingEndReview" }, 30000);
      if (!response?.ok) throw new Error(response?.error || "The saved eBay review could not be canceled.");
      pendingReview = null;
      elements.approvalToken.value = "";
      canceled = true;
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    } finally {
      operationBusy = false;
      render();
    }
    if (canceled) await runScan(true);
  }

  elements.freshScan.addEventListener("click", () => {
    if (pendingReview?.active) cancelReviewAndRescan();
    else runScan(true);
  });
  elements.resumeScan.addEventListener("click", () => runScan(false));
  elements.stopScan.addEventListener("click", async () => {
    try {
      const response = await runtimeMessage({ type: "stopEbayPolicyListingScan" }, 30000);
      if (!response?.ok) throw new Error(response?.error || "The scan could not be paused.");
      setStatus(response.message || "The scan will pause after its current verified page.");
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    }
  });
  elements.discardScan.addEventListener("click", async () => {
    if (!confirm("Discard the saved local policy scan and audit? This does not change any eBay listing.")) return;
    try {
      const response = await runtimeMessage({ type: "clearEbayPolicyListingScan" }, 30000);
      if (!response?.ok) throw new Error(response?.error || "The local audit could not be discarded.");
      audit = null;
      scanState = null;
      selectedIds.clear();
      setStatus("The local policy audit was discarded. No eBay listing was changed.", "success");
      render();
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    }
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      filter = String(button.dataset.filter || "all");
      document.querySelectorAll("[data-filter]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
      page = 1;
      render();
    });
  });
  elements.listingSearch.addEventListener("input", () => { page = 1; render(); });
  elements.selectAllBlock.addEventListener("click", () => {
    const done = completedIds();
    (audit?.listings || []).forEach((listing) => {
      if (listing.action === "block" && !done.has(String(listing.itemId))) selectedIds.add(String(listing.itemId));
    });
    render();
  });
  elements.clearSelection.addEventListener("click", () => { selectedIds.clear(); render(); });
  elements.pageSelection.addEventListener("change", () => {
    const done = completedIds();
    currentPageRows().forEach((listing) => {
      if (listing.action !== "block" || done.has(String(listing.itemId))) return;
      if (elements.pageSelection.checked) selectedIds.add(String(listing.itemId));
      else selectedIds.delete(String(listing.itemId));
    });
    render();
  });
  elements.listingRows.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-item-id]");
    if (!input || input.disabled) return;
    if (input.checked) selectedIds.add(String(input.dataset.itemId));
    else selectedIds.delete(String(input.dataset.itemId));
    render();
  });
  elements.previousPage.addEventListener("click", () => { page = Math.max(1, page - 1); render(); });
  elements.nextPage.addEventListener("click", () => { page += 1; render(); });

  elements.downloadAudit.addEventListener("click", () => {
    if (!audit) return;
    const suffix = new Date().toISOString().slice(0, 10);
    download(`GLDN-existing-listings-policy-audit-${suffix}.csv`, CORE.auditCsv(audit));
    setStatus(`Downloaded all ${Number(audit.totalListings || 0).toLocaleString()} classified listings.`, "success");
  });

  elements.prepareReview.addEventListener("click", async () => {
    if (AUDIT_ONLY) {
      setStatus("This policy desk is read-only. No eBay End review can be prepared here.", "error");
      return;
    }
    if (!audit || !selectedIds.size || pendingMatchesAudit() || operationBusy) return;
    operationBusy = true;
    render();
    const batchIds = [...selectedIds].slice(0, END_BATCH_LIMIT);
    setStatus(`Preparing a visible native eBay review for exactly ${batchIds.length.toLocaleString()} selected Block listings...`);
    try {
      const response = await runtimeMessage({
        type: "prepareEbayPolicyListingEndReview",
        itemIds: batchIds,
        reportFingerprint: audit.reportFingerprint
      }, 120000);
      if (!response?.ok) throw new Error(response?.error || "eBay did not create the exact policy review.");
      const stored = await storageGet([PENDING_KEY]);
      pendingReview = stored[PENDING_KEY] || null;
      setStatus(`Opened eBay's exact ${Number(response.requestedCount || 0).toLocaleString()}-listing review. Inspect every visible row. Nothing has been ended.`, "success");
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    } finally {
      operationBusy = false;
      render();
    }
  });

  elements.focusReview.addEventListener("click", async () => {
    try {
      const response = await runtimeMessage({ type: "focusEbayPolicyListingEndReview" }, 30000);
      if (!response?.ok) throw new Error(response?.error || "The exact eBay review could not be reopened.");
      setStatus(`Showing the exact ${Number(response.requestedCount || 0).toLocaleString()}-listing eBay review. Return here after inspecting every row.`);
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    }
  });

  elements.cancelReview.addEventListener("click", cancelReviewAndRescan);

  elements.approvalToken.addEventListener("input", render);
  elements.approveEnd.addEventListener("click", async () => {
    if (AUDIT_ONLY) {
      setStatus("This policy desk is read-only. No listing can be ended here.", "error");
      return;
    }
    const token = String(elements.approvalToken.value || "").trim();
    if (!pendingMatchesAudit() || token !== expectedApprovalToken() || operationBusy) {
      setStatus(`Type exactly: ${expectedApprovalToken() || "No approval is currently available."}`, "error");
      return;
    }
    operationBusy = true;
    render();
    setStatus(`Ending exactly ${Number(pendingReview.requestedCount || 0).toLocaleString()} approved listings through eBay...`);
    try {
      const response = await runtimeMessage({
        type: "submitEbayPolicyListingEndReview",
        confirmationToken: token
      }, 120000);
      if (!response?.ok && response?.stopped !== true) {
        throw new Error(response?.error || response?.message || "eBay did not complete the exact End request.");
      }
      const stored = await storageGet([PENDING_KEY, LEDGER_KEY, RESULT_KEY]);
      pendingReview = stored[PENDING_KEY] || null;
      endLedger = stored[LEDGER_KEY] || endLedger;
      latestResult = stored[RESULT_KEY] || response;
      (response.successfulItemIds || []).forEach((itemId) => selectedIds.delete(String(itemId)));
      elements.approvalToken.value = "";
      setStatus(`Approved batch finished: ${Number(response.successfulCount || 0).toLocaleString()} ended, ${Number(response.failedCount || 0).toLocaleString()} failed. GLDN Ops stopped; it will not prepare another batch automatically.`, response.failedCount ? "error" : "success");
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    } finally {
      operationBusy = false;
      const stored = await storageGet([PENDING_KEY, LEDGER_KEY, RESULT_KEY]).catch(() => ({}));
      pendingReview = stored[PENDING_KEY] || null;
      endLedger = stored[LEDGER_KEY] || endLedger;
      latestResult = stored[RESULT_KEY] || latestResult;
      render();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[AUDIT_KEY]) {
      audit = changes[AUDIT_KEY].newValue || null;
      page = 1;
      selectedIds.clear();
    }
    if (changes[SCAN_KEY]) {
      scanState = changes[SCAN_KEY].newValue || null;
      if (scanState) setStatus(scanProgressMessage(scanState), scanState.phase === "error" ? "error" : scanState.phase === "complete" ? "success" : "");
    }
    if (changes[PENDING_KEY]) {
      pendingReview = changes[PENDING_KEY].newValue || null;
      if (!pendingReview) elements.approvalToken.value = "";
    }
    if (changes[LEDGER_KEY]) endLedger = changes[LEDGER_KEY].newValue || {};
    if (changes[RESULT_KEY]) latestResult = changes[RESULT_KEY].newValue || null;
    render();
  });

  try {
    const stored = await storageGet([AUDIT_KEY, SCAN_KEY, PENDING_KEY, LEDGER_KEY, RESULT_KEY]);
    audit = stored[AUDIT_KEY] || null;
    scanState = stored[SCAN_KEY] || null;
    pendingReview = stored[PENDING_KEY] || null;
    endLedger = stored[LEDGER_KEY] || {};
    latestResult = stored[RESULT_KEY] || null;
    if (pendingMatchesAudit()) {
      setStatus(`An exact ${Number(pendingReview.requestedCount || 0).toLocaleString()}-listing eBay review is open. Inspect it before entering ${expectedApprovalToken()}.`);
    } else if (scanState) {
      setStatus(scanProgressMessage(scanState), scanState.phase === "error" ? "error" : scanState.phase === "complete" ? "success" : "");
    }
    render();
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
})();
