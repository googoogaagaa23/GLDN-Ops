(() => {
  "use strict";

  const CORE = globalThis.GLDN_ORDER_PLACEMENT_AUDIT;
  const FOUNDATION = globalThis.GLDN_FOUNDATION;
  const $ = (id) => document.getElementById(id);
  const SELECTION_KEY = "orderPlacementAuditSelection";
  let shared = null;
  let worker = null;
  let filter = "issues";
  let refreshTimer = null;
  let expectedProfilesDirty = false;

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function runtimeMessage(message, timeoutMs = 180000) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) resolve({ ok: false, error: "GLDN Ops did not answer before the timeout." });
      }, timeoutMs);
      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const error = chrome.runtime.lastError?.message;
        resolve(error ? { ok: false, error } : (response || { ok: false, error: "No response." }));
      });
    });
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function safeUrl(value, expectedHost) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:" || !(url.hostname === expectedHost || url.hostname.endsWith(`.${expectedHost}`))) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function list(value) {
    return CORE.unique(String(value || "").split(/[,|\n]+/));
  }

  function selectedIdentity() {
    const computerLabel = $("computerLabel").value;
    const mapped = FOUNDATION.computerAccounts[computerLabel] || {};
    const accountLabel = String(mapped.ebayAccountLabel || "").toUpperCase();
    const monthKey = CORE.normalizeMonthKey($("monthKey").value);
    return {
      computerLabel,
      accountLabel,
      monthKey,
      runKey: CORE.runKey({ computerLabel, accountLabel, monthKey })
    };
  }

  function setNotice(message, tone = "neutral") {
    $("notice").textContent = message;
    $("notice").dataset.tone = tone;
  }

  function profileKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function profileCoverage() {
    const expected = CORE.unique(shared?.metadata?.expectedProfiles || []);
    const scanned = CORE.unique(shared?.metadata?.scannedProfiles || shared?.summary?.profilesSeen || []);
    const scannedKeys = new Set(scanned.map(profileKey));
    const missing = expected.filter((profile) => !scannedKeys.has(profileKey(profile)));
    const completedExpected = expected.filter((profile) => scannedKeys.has(profileKey(profile)));
    return { expected, scanned, missing, completedExpected };
  }

  function statusLabel(status) {
    return String(status || "unknown").replace(/-/g, " ");
  }

  function entityLink(url, expectedHost, label) {
    const safe = safeUrl(url, expectedHost);
    return safe ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label);
  }

  function findingMarkup(finding) {
    const expected = finding.expected || {};
    const purchase = finding.purchase || {};
    const ebayLink = entityLink(expected.pageUrl, "ebay.com", expected.orderNumber || "No eBay order");
    const amazonLink = entityLink(purchase.orderUrl, "amazon.com", purchase.orderId || "No Amazon purchase");
    const expectedRecipient = expected.recipient || "Recipient unavailable";
    const purchaseRecipient = purchase.recipient || "Recipient unavailable";
    const days = Number.isFinite(Number(finding.match?.days)) ? `${Number(finding.match.days)} day offset` : "Date match unavailable";
    const cost = Number.isFinite(Number(purchase.cost)) ? Number(purchase.cost).toLocaleString(undefined, { style: "currency", currency: "USD" }) : "Cost unavailable";
    return `
      <tr data-status="${escapeHtml(finding.status)}" data-severity="${escapeHtml(finding.severity)}">
        <td><span class="status status-${escapeHtml(finding.severity)}">${escapeHtml(statusLabel(finding.status))}</span></td>
        <td><div class="entity"><strong>${escapeHtml(finding.asin || "No ASIN")}</strong><small>${escapeHtml(expected.itemTitle || purchase.title || "")}</small></div></td>
        <td><div class="entity"><strong>${ebayLink}</strong><small>${escapeHtml(expected.orderDate || "Date unavailable")} / unit ${escapeHtml(expected.unitIndex || "-")}</small><small>${escapeHtml(expected.orderStatus || "")}</small></div></td>
        <td><div class="entity"><strong>${amazonLink}</strong><small>${escapeHtml(purchase.purchaseDate || "Date unavailable")} / ${escapeHtml(purchase.supplierProfile || "Unknown profile")}</small><small>${escapeHtml(cost)}</small></div></td>
        <td><div class="entity"><strong>eBay: ${escapeHtml(expectedRecipient)}</strong><small>Amazon: ${escapeHtml(purchaseRecipient)}</small><small>${escapeHtml(days)}</small></div></td>
        <td>${escapeHtml(finding.reason || "")}</td>
      </tr>`;
  }

  function visibleFindings() {
    const findings = Array.isArray(shared?.audit?.findings) ? shared.audit.findings : [];
    if (filter === "all") return findings;
    if (filter === "covered") return findings.filter((finding) => ["covered", "canceled-no-amazon-purchase"].includes(finding.status));
    if (filter === "review") return findings.filter((finding) => ["covered-needs-review", "missing-amazon-purchase"].includes(finding.status));
    return findings.filter((finding) => [
      "duplicate-same-recipient",
      "possible-extra-different-recipient",
      "purchased-for-canceled-ebay"
    ].includes(finding.status));
  }

  function renderFindings() {
    const findings = visibleFindings();
    $("findingsBody").innerHTML = findings.length
      ? findings.map(findingMarkup).join("")
      : `<tr><td colspan="6" class="empty">${shared?.audit?.findings?.length ? "No findings match this filter." : "No audit findings loaded."}</td></tr>`;
  }

  function renderShared() {
    const summary = shared?.summary || {};
    const metadata = shared?.metadata || {};
    const coverage = profileCoverage();
    const selection = selectedIdentity();
    $("identity").textContent = selection.runKey
      ? `Computer ${selection.computerLabel} / ${selection.accountLabel} / ${CORE.monthLabel(selection.monthKey)}`
      : "Choose an audit target.";
    $("expectedUnits").textContent = Number(summary.expectedUnits || 0).toLocaleString();
    $("amazonUnits").textContent = Number(summary.amazonUnits || 0).toLocaleString();
    $("profilesScanned").textContent = coverage.expected.length
      ? `${coverage.completedExpected.length}/${coverage.expected.length}`
      : Number(coverage.scanned.length || 0).toLocaleString();
    $("covered").textContent = Number((summary.covered || 0) + (summary.coveredNeedsReview || 0)).toLocaleString();
    $("duplicates").textContent = Number(summary.duplicateSameRecipient || 0).toLocaleString();
    $("possibleExtras").textContent = Number(summary.possibleExtraDifferentRecipient || 0).toLocaleString();
    $("canceledPurchases").textContent = Number(summary.purchasedForCanceledEbay || 0).toLocaleString();
    $("missingPurchases").textContent = Number(summary.missingAmazonPurchase || 0).toLocaleString();
    if (!expectedProfilesDirty) $("expectedProfiles").value = coverage.expected.join(", ");
    $("profileCoverageText").textContent = coverage.expected.length
      ? (coverage.missing.length
        ? `${coverage.completedExpected.length} of ${coverage.expected.length} expected profiles scanned. Still needed: ${coverage.missing.join(", ")}.`
        : `All ${coverage.expected.length} expected Amazon profiles have been scanned.`)
      : `${coverage.scanned.length} profile${coverage.scanned.length === 1 ? "" : "s"} scanned. Add the expected profile names so completion can be verified.`;
    const expectedKeys = new Set(coverage.expected.map(profileKey));
    const scannedKeys = new Set(coverage.scanned.map(profileKey));
    const chips = CORE.unique([...coverage.expected, ...coverage.scanned]);
    $("profileChips").innerHTML = chips.map((profile) => {
      const done = scannedKeys.has(profileKey(profile));
      const expected = expectedKeys.has(profileKey(profile));
      return `<span class="profile-chip ${done ? "done" : "missing"}">${escapeHtml(profile)}: ${done ? "scanned" : (expected ? "needed" : "seen")}</span>`;
    }).join("");
    $("reviewCaption").textContent = metadata.runKey
      ? `${metadata.status || "Audit loaded"}. ${Number(shared?.audit?.findings?.length || 0).toLocaleString()} unit-level findings.`
      : "Build eBay demand to begin.";
    $("startAmazonScan").disabled = !metadata.runKey || !Number(summary.expectedUnits || 0) || worker?.active === true;
    $("downloadAudit").disabled = !shared?.audit?.findings?.length;
    renderFindings();
  }

  function renderWorker() {
    const local = worker?.summary || worker?.state || null;
    if (!local) {
      $("workerTitle").textContent = "No scan checkpoint";
      $("workerProgress").textContent = "Nothing is running in this Chrome profile.";
      $("resumeAmazonScan").disabled = true;
      $("pauseAmazonScan").disabled = true;
      $("resetAmazonScan").disabled = true;
      return;
    }
    const active = local.active === true;
    $("workerTitle").textContent = `${local.supplierProfile || "Unnamed Amazon profile"} / ${statusLabel(local.phase)}`;
    $("workerProgress").textContent = local.error || local.pausedReason
      || `${Number(local.pagesScanned || 0)} order-history pages read, ${Number(local.candidateOrders || 0)} matching orders found, ${Number(local.detailsCaptured || 0)} details checked, ${Number(local.purchaseUnits || local.savedPurchaseUnits || 0)} purchase units captured.`;
    $("resumeAmazonScan").disabled = active || local.phase === "review";
    $("pauseAmazonScan").disabled = !active;
    $("resetAmazonScan").disabled = false;
  }

  async function persistSelection() {
    const selection = selectedIdentity();
    if (!selection.runKey) return;
    await storageSet({ [SELECTION_KEY]: { computerLabel: selection.computerLabel, monthKey: selection.monthKey } });
  }

  async function refresh(options = {}) {
    const selection = selectedIdentity();
    renderShared();
    const [sharedResponse, workerResponse] = await Promise.all([
      selection.runKey ? runtimeMessage({ type: "readOrderPlacementAudit", options: selection }) : Promise.resolve(null),
      runtimeMessage({ type: "getOrderPlacementAuditAmazon" }, 30000)
    ]);
    if (sharedResponse?.ok) shared = sharedResponse;
    else if (sharedResponse && options.showErrors !== false) setNotice(sharedResponse.error || "Could not load the shared order audit.", "error");
    worker = workerResponse?.ok ? workerResponse : null;
    renderShared();
    renderWorker();
    if (worker?.summary?.active || worker?.state?.active) scheduleRefresh();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh({ showErrors: false }), 2500);
  }

  async function runAction(message, workingText, successText) {
    setNotice(workingText);
    const response = await runtimeMessage(message);
    if (!response?.ok) {
      setNotice(response?.error || "The action did not complete.", "error");
      await refresh({ showErrors: false });
      return false;
    }
    setNotice(response.message || successText, "good");
    await refresh({ showErrors: false });
    return true;
  }

  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function downloadCsv() {
    const rows = [[
      "Status", "Severity", "ASIN", "Item", "eBay order", "eBay date", "eBay recipient",
      "Amazon order", "Amazon date", "Amazon profile", "Amazon recipient", "Amazon cost", "Reason"
    ]];
    (shared?.audit?.findings || []).forEach((finding) => rows.push([
      finding.status, finding.severity, finding.asin, finding.expected?.itemTitle || finding.purchase?.title,
      finding.expected?.orderNumber, finding.expected?.orderDate, finding.expected?.recipient,
      finding.purchase?.orderId, finding.purchase?.purchaseDate, finding.purchase?.supplierProfile,
      finding.purchase?.recipient, finding.purchase?.cost, finding.reason
    ]));
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `gldn-order-placement-audit-${selectedIdentity().runKey.replace(/\|/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function initialize() {
    if (!CORE || !FOUNDATION) {
      setNotice("The order-audit foundation did not load. Reload the extension.", "error");
      return;
    }
    const stored = await storageGet(["computerLabel", "amazonProfileLabel", SELECTION_KEY]);
    const eBayComputers = FOUNDATION.computerOptions.filter((computer) => {
      const account = FOUNDATION.computerAccounts[computer] || {};
      return !account.poshmarkOnly && Boolean(account.ebayAccountLabel);
    });
    $("computerLabel").innerHTML = eBayComputers.map((computer) => {
      const account = FOUNDATION.computerAccounts[computer];
      return `<option value="${escapeHtml(computer)}">${escapeHtml(account.display || computer)}</option>`;
    }).join("");
    const savedComputer = String(stored[SELECTION_KEY]?.computerLabel || stored.computerLabel || "");
    if (eBayComputers.includes(savedComputer)) $("computerLabel").value = savedComputer;
    $("monthKey").value = CORE.normalizeMonthKey(stored[SELECTION_KEY]?.monthKey) || currentMonthKey();
    const amazonProfile = String(stored.amazonProfileLabel || "").trim();
    $("amazonProfileText").textContent = amazonProfile
      ? `Current signed-in Amazon profile: ${amazonProfile}. This scan is read-only and saves its purchase evidence to the shared audit.`
      : "Name this signed-in Amazon profile in Setup before scanning it. Repeat from every Amazon Chrome profile used on this computer.";
    await persistSelection();
    await refresh();
  }

  $("computerLabel").addEventListener("change", async () => {
    shared = null;
    expectedProfilesDirty = false;
    await persistSelection();
    await refresh();
  });
  $("monthKey").addEventListener("change", async () => {
    shared = null;
    expectedProfilesDirty = false;
    await persistSelection();
    await refresh();
  });
  $("expectedProfiles").addEventListener("input", () => { expectedProfilesDirty = true; });
  $("saveExpectedProfiles").addEventListener("click", async () => {
    const selection = selectedIdentity();
    if (!selection.runKey) return setNotice("Choose a valid eBay computer and month.", "error");
    const ok = await runAction(
      {
        type: "configureOrderPlacementAudit",
        options: { ...selection, expectedProfiles: list($("expectedProfiles").value) }
      },
      "Saving the expected Amazon-profile checklist...",
      "Amazon-profile checklist saved."
    );
    if (ok) expectedProfilesDirty = false;
  });
  $("refreshAudit").addEventListener("click", () => refresh());
  $("seedExpected").addEventListener("click", async () => {
    const selection = selectedIdentity();
    if (!selection.runKey) return setNotice("Choose a valid eBay computer and month.", "error");
    const expectedProfiles = list($("expectedProfiles").value);
    if (Number(shared?.summary?.amazonUnits || 0) > 0 && !confirm("Rebuilding eBay demand clears the Amazon profile scans already saved for this audit. Continue?")) return;
    const ok = await runAction(
      { type: "seedOrderPlacementAuditExpected", options: { ...selection, expectedProfiles } },
      "Building exact eBay demand from the completed Monthly eBay Profit read...",
      "eBay demand is ready."
    );
    if (ok) expectedProfilesDirty = false;
  });
  $("startAmazonScan").addEventListener("click", async () => {
    const selection = selectedIdentity();
    await runAction(
      { type: "startOrderPlacementAuditAmazon", options: selection },
      "Starting one inactive signed-in Amazon worker tab...",
      "Amazon profile scan started."
    );
  });
  $("resumeAmazonScan").addEventListener("click", () => runAction(
    { type: "resumeOrderPlacementAuditAmazon" },
    "Resuming this Amazon profile from its saved checkpoint...",
    "Amazon profile scan resumed."
  ));
  $("pauseAmazonScan").addEventListener("click", () => runAction(
    { type: "stopOrderPlacementAuditAmazon" },
    "Requesting a pause at the next safe checkpoint...",
    "The scan will pause at its next checkpoint."
  ));
  $("resetAmazonScan").addEventListener("click", async () => {
    if (!confirm("Reset only this Chrome profile's Amazon scan checkpoint? Shared completed profile results stay saved.")) return;
    await runAction({ type: "resetOrderPlacementAuditAmazon" }, "Resetting this profile checkpoint...", "This profile checkpoint was reset.");
  });
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    renderFindings();
  }));
  $("downloadAudit").addEventListener("click", downloadCsv);
  window.addEventListener("beforeunload", () => clearTimeout(refreshTimer));

  initialize().catch((error) => setNotice(error.message || "Could not initialize the order audit.", "error"));
})();
