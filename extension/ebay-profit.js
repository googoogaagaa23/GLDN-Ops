(() => {
  const CORE = globalThis.GLDN_EBAY_PROFIT_CORE;
  const $ = (id) => document.getElementById(id);
  let state = null;
  let summary = null;
  let filter = "all";

  function priorMonthKey() {
    const now = new Date();
    const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, "0")}`;
  }

  function runtimeMessage(message, timeoutMs = 120000) {
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

  function money(value) {
    const number = Number(value || 0);
    return number.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function setNotice(message, tone = "neutral") {
    $("notice").textContent = message;
    $("notice").dataset.tone = tone;
  }

  function displayStatus(value) {
    return String(value || "unknown").replace(/-/g, " ");
  }

  function finiteMoney(value) {
    const number = Number(value);
    return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
  }

  function noteReviewFor(result, visibleEarnings) {
    if (result?.noteReview) return result.noteReview;
    if (!result?.note) return null;
    const parsed = CORE.parseSavedNote(result.note, { visibleEarnings });
    return parsed.ok ? null : parsed;
  }

  function noteConfirmationMarkup(result, visibleEarnings) {
    const review = noteReviewFor(result, visibleEarnings);
    if (!review || !result.note || state?.phase !== "review") return "";
    const suggestedEarnings = finiteMoney(review.suggestedMarketplaceEarnings);
    const suggestedCost = finiteMoney(review.suggestedSupplierTotal);
    const suggestedProfit = suggestedEarnings !== null && suggestedCost !== null
      ? suggestedEarnings - suggestedCost
      : null;
    return `
      <div class="note-confirm" data-order="${escapeHtml(result.orderNumber || "")}">
        <div class="note-confirm-fields">
          <label>Note earnings<input data-field="earnings" type="number" min="0" step="0.01" value="${suggestedEarnings === null ? "" : suggestedEarnings.toFixed(2)}"></label>
          <label>Note Amazon cost<input data-field="cost" type="number" min="0.01" step="0.01" value="${suggestedCost === null ? "" : suggestedCost.toFixed(2)}"></label>
        </div>
        <div class="note-confirm-footer">
          <span data-role="profit-preview">Note-only profit: ${suggestedProfit === null ? "review amounts" : money(suggestedProfit)}</span>
          <button type="button" class="confirm-note" data-action="confirm-note">Confirm note amounts</button>
        </div>
        <small class="note-confirm-status" data-role="confirm-status">Nothing is changed on eBay. This changes only the internal note-based profit read.</small>
      </div>`;
  }

  function rowMarkup(result) {
    const exact = result.status === "exact" && result.record;
    const record = result.record || {};
    const profit = Number(record.profit || 0);
    const visibleEarnings = finiteMoney(record.visibleMarketplaceEarnings ?? result.marketplaceEarnings ?? result.visibleEarnings);
    const noteEarnings = exact ? finiteMoney(record.noteMarketplaceEarnings ?? record.marketplaceEarnings) : null;
    const noteStatus = exact ? displayStatus(record.noteStatus || "verified") : displayStatus(result.status);
    const rawNote = escapeHtml(result.note || record.note || "No saved note found");
    const issue = exact
      ? `<div class="note-source"><strong>${escapeHtml(record.supplierProfile || "Profile not written")}</strong><small>${escapeHtml(record.eta || "ETA not written")}</small><small>Saved note: ${rawNote}</small></div>`
      : `<div class="note-source"><strong>${escapeHtml(result.reason || "Needs manual review")}</strong><small>Saved note: ${rawNote}</small></div>${noteConfirmationMarkup(result, visibleEarnings)}`;
    return `
      <tr data-kind="${exact ? "exact" : "unresolved"}">
        <td>${escapeHtml(result.orderDate || record.orderDate || "")}</td>
        <td><a class="order-link" href="${escapeHtml(result.pageUrl || record.pageUrl || "#")}" target="_blank" rel="noreferrer">${escapeHtml(result.orderNumber || "Unknown")}</a></td>
        <td>${escapeHtml(result.itemTitle || record.itemTitle || "")}</td>
        <td><span class="status ${exact ? "exact" : "unresolved"}">${escapeHtml(noteStatus)}</span></td>
        <td class="money">${visibleEarnings !== null ? money(visibleEarnings) : "-"}</td>
        <td class="money">${noteEarnings !== null ? money(noteEarnings) : "-"}</td>
        <td class="money">${exact ? money(record.supplierTotal) : "-"}</td>
        <td class="money ${exact ? (profit >= 0 ? "profit-positive" : "profit-negative") : ""}">${exact ? money(profit) : "-"}</td>
        <td>${issue}</td>
      </tr>`;
  }

  function renderRows() {
    const results = Array.isArray(state?.results) ? state.results : [];
    const visible = results.filter((result) => {
      const kind = result.status === "exact" && result.record ? "exact" : "unresolved";
      return filter === "all" || filter === kind;
    });
    $("resultsBody").innerHTML = visible.length
      ? visible.sort((left, right) => String(right.orderDate || "").localeCompare(String(left.orderDate || ""))).map(rowMarkup).join("")
      : `<tr><td colspan="9" class="empty">${results.length ? "No rows match this filter." : "No order rows collected yet."}</td></tr>`;
  }

  function render() {
    summary = CORE.summary(state);
    const totals = summary?.totals || {};
    $("identity").textContent = state
      ? `Computer ${state.computerLabel || "?"} / ${state.accountLabel || "Unknown eBay"}`
      : "No saved run";
    $("ordersIndexed").textContent = Number(summary?.ordersIndexed || 0).toLocaleString();
    $("detailsCaptured").textContent = Number(summary?.detailsCaptured || 0).toLocaleString();
    $("exactCount").textContent = Number(summary?.exact || 0).toLocaleString();
    $("unresolvedCount").textContent = Number(summary?.unresolved || 0).toLocaleString();
    $("visibleEbayTotal").textContent = money(totals.visibleEbayEarnings);
    $("earningsTotal").textContent = money(totals.earnings);
    $("amazonTotal").textContent = money(totals.amazonCost);
    $("profitTotal").textContent = money(totals.profit);
    $("reviewCaption").textContent = state
      ? `${state.monthLabel || state.monthKey}: ${displayStatus(state.phase)}. ${Number(summary?.pagesScanned || 0).toLocaleString()} order pages scanned.`
      : "Start a month to collect orders.";

    const active = state?.active === true;
    $("startRun").disabled = active || state?.phase === "review";
    $("resumeRun").disabled = !state || active || ["review", "completed"].includes(state.phase);
    $("pauseRun").disabled = !active;
    $("resetRun").disabled = !state;
    $("monthKey").disabled = active;

    if (!state) setNotice("No monthly run saved.");
    else if (state.phase === "review" && Number(summary.ordersIndexed || 0) === 0) setNotice(`No ${state.monthLabel || state.monthKey} orders were found. The final eBay worker page was left open so this result can be inspected before Reset.`, "warn");
    else if (state.phase === "review") setNotice(`Read 1 ready: ${summary.exact} note-only profit rows; ${summary.unresolved} notes need review. The final eBay worker page remains open until this run is synced or reset. After approval, Read 2 independently matches Amazon orders using visible eBay earnings.`, summary.unresolved ? "warn" : "good");
    else if (state.phase === "completed") setNotice(`Completed: ${summary.synced} reviewed orders handled.`, "good");
    else if (state.phase === "paused") setNotice(state.pausedReason || "Paused at a safe checkpoint.", "warn");
    else setNotice(`Running ${displayStatus(state.phase)}: ${summary.detailsCaptured} of ${summary.ordersIndexed} order details read.`, "neutral");

    const approvalReady = state?.phase === "review" && Number(summary?.unsyncedReviewed || 0) > 0;
    $("syncGate").hidden = !approvalReady;
    $("approvalToken").textContent = summary?.approvalToken || "";
    $("approvalInput").placeholder = summary?.approvalToken || "";
    $("syncRows").disabled = !approvalReady || $("approvalInput").value.trim() !== summary.approvalToken;
    renderRows();
  }

  async function refresh() {
    const response = await runtimeMessage({ type: "getEbayMonthlyProfit" });
    if (!response?.ok) {
      setNotice(response?.error || "Could not read monthly eBay profit status.", "error");
      return;
    }
    state = response.state || null;
    render();
  }

  $("startRun").addEventListener("click", async () => {
    const monthKey = $("monthKey").value;
    setNotice("Starting one inactive signed-in eBay worker tab...");
    const response = await runtimeMessage({ type: "startEbayMonthlyProfit", options: { monthKey } });
    if (!response?.ok) setNotice(response?.error || "Could not start monthly eBay profit.", "error");
    await refresh();
  });
  $("resumeRun").addEventListener("click", async () => {
    const response = await runtimeMessage({ type: "resumeEbayMonthlyProfit" });
    if (!response?.ok) setNotice(response?.error || "Could not resume monthly eBay profit.", "error");
    await refresh();
  });
  $("pauseRun").addEventListener("click", async () => {
    const response = await runtimeMessage({ type: "stopEbayMonthlyProfit" });
    if (!response?.ok) setNotice(response?.error || "Could not pause monthly eBay profit.", "error");
    await refresh();
  });
  $("resetRun").addEventListener("click", async () => {
    const response = await runtimeMessage({ type: "resetEbayMonthlyProfit" });
    if (!response?.ok) setNotice(response?.error || "Could not reset monthly eBay profit.", "error");
    state = null;
    await refresh();
  });
  $("approvalInput").addEventListener("input", render);
  $("syncRows").addEventListener("click", async () => {
    const confirm = $("approvalInput").value.trim();
    $("syncRows").disabled = true;
    setNotice("Sending the approved reviewed month to note-profit history and the independent Amazon-cost queue...");
    const response = await runtimeMessage({ type: "syncEbayMonthlyProfit", confirm }, 180000);
    if (!response?.ok && !response?.queued) setNotice(response?.error || "Dashboard sync failed.", "error");
    else setNotice(response.queued ? `${response.count} rows queued for dashboard delivery.` : `${response.count} rows synced.`, response.queued ? "warn" : "good");
    $("approvalInput").value = "";
    await refresh();
  });
  $("resultsBody").addEventListener("input", (event) => {
    const review = event.target.closest(".note-confirm");
    if (!review) return;
    const earnings = finiteMoney(review.querySelector("[data-field='earnings']")?.value);
    const cost = finiteMoney(review.querySelector("[data-field='cost']")?.value);
    const preview = review.querySelector("[data-role='profit-preview']");
    if (preview) preview.textContent = earnings === null || cost === null
      ? "Note-only profit: review amounts"
      : `Note-only profit: ${money(earnings - cost)}`;
  });
  $("resultsBody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='confirm-note']");
    if (!button) return;
    const review = button.closest(".note-confirm");
    const status = review?.querySelector("[data-role='confirm-status']");
    const orderNumber = review?.dataset.order || "";
    const marketplaceEarnings = review?.querySelector("[data-field='earnings']")?.value || "";
    const supplierTotal = review?.querySelector("[data-field='cost']")?.value || "";
    button.disabled = true;
    if (status) status.textContent = "Confirming the internal note-only read...";
    const response = await runtimeMessage({
      type: "confirmEbayMonthlyProfitNoteAmounts",
      orderNumber,
      values: { marketplaceEarnings, supplierTotal }
    });
    if (!response?.ok) {
      button.disabled = false;
      if (status) status.textContent = response?.error || "The note amounts were not confirmed.";
      return;
    }
    state = response.state || state;
    setNotice(`Confirmed the note-only earnings and Amazon cost for order ${orderNumber}.`, "good");
    render();
  });
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.filter || "all";
    document.querySelectorAll(".filter").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    renderRows();
  }));
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.ebayMonthlyProfit) refresh();
  });
  window.addEventListener("ebayMonthlyProfitProgress", refresh);
  $("monthKey").value = priorMonthKey();
  refresh();
  setInterval(refresh, 3000);
})();
