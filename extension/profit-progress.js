(() => {
  "use strict";

  const POSHMARK_PROFIT_WORKBOOK_ID = "1PV4Fpnjjd5tNwdwmqLDbi-RLBbIqMq94Gxj0YU4AOl4";
  const SHARED_PROFIT_WORKBOOK_ID = "1z3ouzNopLpiT3icJyhzLf3AkCO7I2thV1mQWnIEdIx8";
  const POSHMARK_PROFIT_WORKBOOK_URL = `https://docs.google.com/spreadsheets/d/${POSHMARK_PROFIT_WORKBOOK_ID}/edit`;
  const SHARED_PROFIT_WORKBOOK_URL = `https://docs.google.com/spreadsheets/d/${SHARED_PROFIT_WORKBOOK_ID}/edit`;
  const POLL_INTERVAL_MS = 1500;
  let latestRun = null;
  let refreshBusy = false;

  const byId = (id) => document.getElementById(id);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const count = (value) => number(value).toLocaleString("en-US");
  const money = (value) => number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });

  function runtimeMessage(message, timeoutMs = 15000) {
    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: "GLDN Ops did not answer before the progress timeout." });
      }, timeoutMs);
      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const error = chrome.runtime.lastError?.message;
        resolve(error ? { ok: false, error } : (response || { ok: false, error: "GLDN Ops returned no status." }));
      });
    });
  }

  function phaseInfo(phase) {
    const values = {
      "index-sales": ["Indexing Poshmark sales", "Reading each visible sales page."],
      "capture-posh-details": ["Reading Poshmark order details", "Capturing earnings and exact SKU-linked ASINs."],
      "amazon-search": ["Searching Amazon orders", "Looking for an unused exact purchase for the current ASIN."],
      "amazon-detail": ["Reading an Amazon order", "Verifying the exact order item and paid cost."],
      review: ["Ready for review", "No sheet rows change until the exact review is approved."],
      paused: ["Paused at a saved checkpoint", "Resume continues from the saved phase."],
      completed: ["Approved sync completed", "The reviewed rows have been handled by the dashboard sync."],
      stopped: ["Stopped", "The saved checkpoint is not running."]
    };
    return values[String(phase || "")] || ["Preparing profit run", "Waiting for the next saved checkpoint."];
  }

  function scopeLabel(run) {
    const scope = String(run?.scope || "");
    if (scope === "month") return run.monthLabel || run.monthKey || "One month";
    if (scope === "pilot") return "Pilot - 10 newest sales";
    if (scope === "incremental") return "New since last sync";
    if (scope === "last90") return "Last 90 days";
    if (scope === "all") return "All sales";
    if (scope === "single") return "Current sale only";
    if (scope === "resolve-missing") return `Resolve Poshmark costs${run.monthKey ? ` - ${run.monthKey}` : ""}`;
    if (scope === "resolve-ebay") return `Resolve eBay costs${run.monthKey ? ` - ${run.monthKey}` : ""}`;
    return scope || "-";
  }

  function monthSheetName(run) {
    const key = String(run?.monthKey || "");
    const match = key.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return "not selected";
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
    return `${label} - 7`;
  }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = String(value ?? "");
  }

  function setNotice(message, tone = "neutral") {
    const notice = byId("notice");
    notice.textContent = String(message || "");
    notice.dataset.tone = tone;
  }

  function setStage(id, state, detail) {
    const stage = byId(id);
    stage.dataset.state = state;
    setText(`${id}Detail`, detail);
  }

  function stageStates(run, summary) {
    const phase = String(run?.phase || "");
    const pausedPhase = phase === "paused" ? String(run?.resumePhase || "index-sales") : phase;
    const stageForPhase = {
      "index-sales": 0,
      "capture-posh-details": 1,
      "amazon-search": 2,
      "amazon-detail": 2,
      review: 3,
      completed: 4
    };
    const effectiveIndex = stageForPhase[pausedPhase] ?? -1;
    const stateFor = (stepIndex) => {
      if (!run) return "pending";
      if (phase === "paused" && effectiveIndex === stepIndex) return "current";
      if (effectiveIndex > stepIndex || phase === "completed") return "done";
      if (effectiveIndex === stepIndex) return "current";
      return "pending";
    };
    const asinTotal = Array.isArray(run?.asins) ? run.asins.length : 0;
    const asinPosition = Math.min(asinTotal, Math.max(0, number(run?.asinIndex) + (phase === "amazon-detail" ? 1 : 0)));
    const unresolved = number(summary?.missingSku) + number(summary?.amazonNotFound) + number(summary?.needsReview);
    setStage("stageIndex", stateFor(0), `${count(summary?.pagesScanned)} pages, ${count(summary?.salesIndexed)} sales`);
    setStage("stageDetails", stateFor(1), `${count(summary?.detailsCaptured)} of ${count(summary?.salesIndexed)} details`);
    setStage("stageAmazon", stateFor(2), `${count(asinPosition)} of ${count(asinTotal)} ASINs`);
    setStage("stageReview", stateFor(3), phase === "completed"
      ? `${count(summary?.synced)} rows handled`
      : phase === "review"
      ? `${count(summary?.exact)} exact, ${count(unresolved)} unresolved`
      : "Not ready");
  }

  function currentWork(run) {
    const phase = String(run?.phase || "");
    if (phase === "capture-posh-details" && run.currentOrderNumber) {
      return [`Poshmark order ${run.currentOrderNumber}`, "Reading the exact sale detail and its SKU-linked ASIN."];
    }
    if (["amazon-search", "amazon-detail"].includes(phase) && run.currentAsin) {
      return [`Amazon ASIN ${run.currentAsin}`, phase === "amazon-search"
        ? "Searching signed-in Amazon order history for an unused exact purchase."
        : "Checking the exact Amazon order item and paid cost."];
    }
    if (phase === "review") return ["Review is ready", "Open the saved worker page to inspect every row before approving the sync."];
    if (phase === "paused") return ["Checkpoint preserved", run.pausedReason || "Resume continues from the saved checkpoint."];
    if (phase === "completed") return ["Run completed", "Open the destination sheets to review the approved rows."];
    return phaseInfo(phase);
  }

  function renderEmpty(error = "") {
    latestRun = null;
    setText("runIdentity", "No saved run");
    setText("phaseLabel", "No checkpoint");
    setText("lastUpdated", "Waiting for a profit run.");
    setNotice(error || "Start Historical Profit Backfill from GLDN Ops to begin.", error ? "error" : "neutral");
    stageStates(null, null);
    for (const id of ["salesIndexed", "detailsCaptured", "amazonUnits", "exactCount", "reviewCount", "missingSkuCount", "notFoundCount", "syncedCount", "pendingCount", "errorCount"]) setText(id, "0");
    setText("exactProfit", "$0.00");
    setText("currentWorkTitle", "Waiting for a run");
    setText("currentWorkDetail", "The saved checkpoint will appear here automatically.");
    setText("runScope", "-");
    setText("supplierProfile", "Not set");
    setText("sheetNames", "Monthly tab: not selected");
    for (const id of ["resumeRun", "pauseRun", "openWorker", "openReview", "resetRun"]) byId(id).disabled = true;
  }

  function renderRun(run, summary) {
    latestRun = run;
    const [phaseLabel, phaseDetail] = phaseInfo(run.phase);
    const updatedAt = Date.parse(String(run.updatedAt || ""));
    const account = run.platform === "eBay" ? "eBay cost resolution" : "Poshmark / computer 7";
    setText("runIdentity", `${account} - ${scopeLabel(run)}`);
    setText("phaseLabel", phaseLabel);
    setText("lastUpdated", Number.isFinite(updatedAt) ? `Last progress ${new Date(updatedAt).toLocaleString()}` : "No progress timestamp saved.");
    const tone = run.phase === "completed" ? "good" : run.phase === "paused" ? "warn" : run.workerFailure ? "error" : "neutral";
    setNotice(run.phase === "paused" ? (run.pausedReason || phaseDetail) : phaseDetail, tone);
    stageStates(run, summary);
    setText("salesIndexed", count(summary.salesIndexed));
    setText("detailsCaptured", count(summary.detailsCaptured));
    setText("amazonUnits", count(summary.amazonUnitsCaptured));
    setText("exactCount", count(summary.exact));
    setText("reviewCount", count(summary.needsReview));
    setText("missingSkuCount", count(summary.missingSku));
    setText("notFoundCount", count(summary.amazonNotFound));
    setText("exactProfit", money(summary.exactProfit));
    const [workTitle, workDetail] = currentWork(run);
    setText("currentWorkTitle", workTitle);
    setText("currentWorkDetail", workDetail);
    setText("runScope", scopeLabel(run));
    setText("supplierProfile", run.supplierProfile || "Not set");
    setText("syncedCount", count(summary.synced));
    setText("pendingCount", count(summary.pending));
    setText("errorCount", count(summary.errors));
    const monthlyTab = monthSheetName(run);
    setText("destinationTitle", run.scope === "month" ? monthlyTab : "Shared profit sheets");
    setText("destinationDetail", run.phase === "completed"
      ? "The approved run was handled. Open the workbook to review the saved rows."
      : "The sheet remains unchanged until the exact review is approved.");
    setText("sheetNames", run.scope === "month"
      ? `Monthly tab: ${monthlyTab}. Exact rows also feed Profit - 7 and Marketplace Profit History; unresolved rows feed Poshmark Amazon Cost Queue.`
      : "Shared tabs: Profit - 7, Marketplace Profit History, and the unresolved Amazon cost queue.");
    byId("resumeRun").disabled = Boolean(run.active) || ["completed"].includes(run.phase);
    byId("pauseRun").disabled = !run.active;
    const workerTabId = Number(run.workerTabId);
    const hasWorkerTab = Number.isInteger(workerTabId) && workerTabId > 0;
    byId("openWorker").disabled = !hasWorkerTab;
    byId("openReview").disabled = run.phase !== "review" || !hasWorkerTab;
    byId("resetRun").disabled = false;
  }

  async function refresh() {
    if (refreshBusy) return;
    refreshBusy = true;
    try {
      const response = await runtimeMessage({ type: "getPoshmarkProfitBackfill" });
      if (!response?.ok) renderEmpty(response?.error || "Profit status is unavailable.");
      else if (!response.state) renderEmpty();
      else renderRun(response.state, response.summary || {});
    } finally {
      refreshBusy = false;
    }
  }

  async function openOrFocusWorkbook(url, spreadsheetId) {
    const tabs = await new Promise((resolve) => chrome.tabs.query({}, (items) => resolve(chrome.runtime.lastError ? [] : (items || []))));
    const existing = tabs.find((tab) => String(tab.url || "").includes(`/spreadsheets/d/${spreadsheetId}/`));
    if (existing?.id) {
      await new Promise((resolve) => chrome.tabs.update(existing.id, { active: true }, () => resolve()));
      return;
    }
    await new Promise((resolve) => chrome.tabs.create({ url, active: true }, () => resolve()));
  }

  async function focusWorker() {
    const tabId = Number(latestRun?.workerTabId);
    if (!Number.isInteger(tabId) || tabId <= 0) return setNotice("The saved worker tab is not open. Use Resume to recreate it.", "warn");
    chrome.tabs.update(tabId, { active: true }, () => {
      const error = chrome.runtime.lastError?.message;
      if (error) setNotice("The worker tab is no longer open. Use Resume to recreate it.", "warn");
    });
  }

  byId("resumeRun").addEventListener("click", async () => {
    setNotice("Resuming the saved checkpoint...", "neutral");
    const response = await runtimeMessage({ type: "resumePoshmarkProfitBackfill" }, 30000);
    if (!response?.ok) setNotice(response?.error || "The profit checkpoint did not resume.", "error");
    await refresh();
  });
  byId("pauseRun").addEventListener("click", async () => {
    setNotice("Pause requested. The worker will stop after the current safe page.", "warn");
    const response = await runtimeMessage({ type: "stopPoshmarkProfitBackfill" });
    if (!response?.ok) setNotice(response?.error || "The worker did not accept the pause request.", "error");
    await refresh();
  });
  byId("openWorker").addEventListener("click", focusWorker);
  byId("openReview").addEventListener("click", focusWorker);
  byId("resetRun").addEventListener("click", async () => {
    if (!window.confirm("Reset this saved profit checkpoint? This removes local progress but does not change Poshmark, Amazon, or any spreadsheet.")) return;
    const response = await runtimeMessage({ type: "resetPoshmarkProfitBackfill" });
    if (!response?.ok) setNotice(response?.error || "The checkpoint could not be reset.", "error");
    await refresh();
  });
  byId("openMonthlySheet").addEventListener("click", () => openOrFocusWorkbook(POSHMARK_PROFIT_WORKBOOK_URL, POSHMARK_PROFIT_WORKBOOK_ID));
  byId("openSharedSheet").addEventListener("click", () => openOrFocusWorkbook(SHARED_PROFIT_WORKBOOK_URL, SHARED_PROFIT_WORKBOOK_ID));

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.poshmarkProfitBackfill) void refresh();
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "poshmarkBackfillProgress") void refresh();
  });

  setText("extensionVersion", `GLDN Ops v${chrome.runtime.getManifest().version}`);
  void refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
})();
