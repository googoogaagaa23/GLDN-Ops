(function attachEbayProfitBackground(root, factory) {
  root.GLDN_EBAY_PROFIT_BACKGROUND = factory(root.GLDN_EBAY_PROFIT_CORE, root.GLDN_FOUNDATION);
})(globalThis, (CORE, FOUNDATION) => {
  const STORAGE_KEY = "ebayMonthlyProfit";
  const ORDERS_URL = "https://www.ebay.com/sh/ord/";

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError?.message;
      if (error) reject(new Error(error));
      else resolve();
    });
  });
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

  function tabGet(tabId) {
    return new Promise((resolve) => chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : tab)));
  }

  function tabCreate(options) {
    return new Promise((resolve, reject) => chrome.tabs.create(options, (tab) => {
      const error = chrome.runtime.lastError?.message;
      if (error) reject(new Error(error));
      else resolve(tab);
    }));
  }

  function tabUpdate(tabId, options) {
    return new Promise((resolve, reject) => chrome.tabs.update(tabId, options, (tab) => {
      const error = chrome.runtime.lastError?.message;
      if (error) reject(new Error(error));
      else resolve(tab);
    }));
  }

  function tabRemove(tabId) {
    return new Promise((resolve) => {
      if (!Number.isInteger(Number(tabId))) return resolve(false);
      chrome.tabs.remove(Number(tabId), () => resolve(!chrome.runtime.lastError));
    });
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve) => {
      if (!Number.isInteger(Number(tabId))) return resolve({ ok: false });
      chrome.tabs.sendMessage(Number(tabId), message, (response) => {
        resolve(chrome.runtime.lastError ? { ok: false } : (response || { ok: true }));
      });
    });
  }

  async function readRun() {
    const stored = await storageGet([STORAGE_KEY]);
    return stored[STORAGE_KEY] || null;
  }

  async function writeRun(run) {
    const next = { ...run, updatedAt: new Date().toISOString() };
    await storageSet({ [STORAGE_KEY]: next });
    return next;
  }

  function publicResult(run) {
    return { ok: true, state: run, summary: CORE.summary(run) };
  }

  function runtimeVersion() {
    return String(chrome.runtime.getManifest().version || "");
  }

  function isWorker(run, sender) {
    return Boolean(run && Number(run.workerTabId) === Number(sender?.tab?.id));
  }

  async function ownerTab(sender = {}) {
    if (Number.isInteger(sender?.tab?.id)) return sender.tab;
    return new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0] || null)));
  }

  async function createWorker(run, sender = {}) {
    const owner = await ownerTab(sender);
    const windowId = Number.isInteger(run.ownerWindowId)
      ? run.ownerWindowId
      : (Number.isInteger(owner?.windowId) ? owner.windowId : undefined);
    const worker = await tabCreate({
      url: "about:blank",
      active: false,
      ...(Number.isInteger(windowId) ? { windowId } : {})
    });
    return writeRun({
      ...run,
      ownerTabId: run.ownerTabId ?? owner?.id ?? null,
      ownerWindowId: run.ownerWindowId ?? owner?.windowId ?? null,
      workerTabId: worker.id
    });
  }

  async function navigateWorker(run, url) {
    const worker = await tabGet(Number(run.workerTabId));
    if (!worker) throw new Error("The eBay profit worker tab was closed. Use Resume to continue from the saved checkpoint.");
    await tabUpdate(worker.id, { url, active: false, autoDiscardable: false });
    return run;
  }

  async function finishReview(run) {
    const workerTabId = Number(run.workerTabId);
    const review = await writeRun({
      ...run,
      active: false,
      stopRequested: false,
      phase: "review",
      workerTabId: null,
      reviewReadyAt: run.reviewReadyAt || new Date().toISOString()
    });
    if (Number.isInteger(workerTabId) && workerTabId > 0) void tabRemove(workerTabId);
    void sendToTab(review.ownerTabId, { type: "ebayMonthlyProfitProgress", state: review, summary: CORE.summary(review) });
    return publicResult(review);
  }

  async function pauseAtCheckpoint(run, reason = "Paused at a safe checkpoint.") {
    const workerTabId = Number(run.workerTabId);
    const paused = await writeRun({
      ...run,
      active: false,
      stopRequested: false,
      phase: "paused",
      resumePhase: run.phase === "paused" ? (run.resumePhase || "index-orders") : run.phase,
      workerTabId: null,
      pausedReason: reason
    });
    if (Number.isInteger(workerTabId) && workerTabId > 0) void tabRemove(workerTabId);
    return publicResult(paused);
  }

  async function start(options = {}, sender = {}) {
    await pauseIncompatibleVersion("start-check");
    const existing = await readRun();
    if (existing?.active) return { ok: false, error: `An eBay monthly profit run is already active (${existing.phase}).` };
    const stored = await storageGet(["computerLabel", "ebayAccountLabel"]);
    const identity = FOUNDATION.identityForComputer(stored.computerLabel);
    if (!identity.computerLabel || identity.poshmarkOnly || !identity.ebayAccountLabel) {
      return { ok: false, error: "Choose an eBay computer in Setup before starting monthly eBay profit." };
    }
    const owner = await ownerTab(sender);
    let run = CORE.createRun({
      ...options,
      computerLabel: identity.computerLabel,
      accountLabel: identity.ebayAccountLabel,
      extensionVersion: runtimeVersion(),
      ownerTabId: sender?.tab?.id ?? owner?.id ?? null,
      ownerWindowId: sender?.tab?.windowId ?? owner?.windowId ?? null
    });
    if (existing?.workerTabId) await tabRemove(existing.workerTabId);
    run = await createWorker(run, sender);
    await navigateWorker(run, ORDERS_URL);
    return publicResult(run);
  }

  async function stop() {
    const run = await readRun();
    if (!run) return { ok: true, state: null, summary: null };
    if (!run.active) return publicResult(run);
    return pauseAtCheckpoint(run, "Paused by the operator. Resume continues from this exact order checkpoint.");
  }

  async function reset() {
    const run = await readRun();
    if (run?.workerTabId) await tabRemove(run.workerTabId);
    await storageRemove([STORAGE_KEY]);
    return { ok: true, state: null, summary: null };
  }

  async function resume(sender = {}) {
    await pauseIncompatibleVersion("resume-check");
    let run = await readRun();
    if (!run) return { ok: false, error: "No eBay monthly profit checkpoint exists." };
    if (run.phase === "review" || run.phase === "completed") return publicResult(run);
    if (run.active && await tabGet(Number(run.workerTabId))) return publicResult(run);
    const phase = run.phase === "paused" ? String(run.resumePhase || "index-orders") : String(run.phase || "index-orders");
    run = await writeRun({ ...run, active: true, stopRequested: false, phase, pausedReason: "", extensionVersion: runtimeVersion() });
    run = await createWorker(run, sender);
    if (phase === "capture-details") {
      const order = (run.orders || [])[Number(run.detailIndex || 0)];
      if (!order?.pageUrl) return finishReview(run);
      await navigateWorker(run, order.pageUrl);
    } else {
      await navigateWorker(run, ORDERS_URL);
    }
    return publicResult(run);
  }

  async function handleOrdersPage(payload, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "index-orders") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    const records = Array.isArray(payload?.records) ? payload.records : [];
    if (payload?.scope?.allOrders !== true || payload?.scope?.ready !== true) {
      return pauseAtCheckpoint(run, payload?.scope?.reason || "Monthly eBay profit stopped because the worker could not verify a ready All orders page.");
    }
    if (!records.length && payload?.readyEvidence !== "explicit-empty") {
      return pauseAtCheckpoint(run, "Monthly eBay profit stopped because eBay displayed order links but none could be indexed. No zero-order report was created.");
    }
    run = await writeRun(CORE.mergeOrdersPage(run, records, { hasNext: payload.hasNext }));
    if (run.phase === "index-orders") {
      if (payload.nextUrl) {
        await navigateWorker(run, payload.nextUrl);
        return { ...publicResult(run), instruction: "worker-navigating" };
      }
      return { ...publicResult(run), instruction: "next-page" };
    }
    const first = (run.orders || [])[0];
    if (!first?.pageUrl) return finishReview(run);
    await navigateWorker(run, first.pageUrl);
    return { ...publicResult(run), instruction: "worker-navigating" };
  }

  async function handleWorkerError(payload, sender) {
    const run = await readRun();
    if (!isWorker(run, sender)) return { ok: false, ignored: true };
    const message = String(payload?.message || "The eBay monthly profit worker stopped before producing verified page evidence.").trim();
    return pauseAtCheckpoint(run, message);
  }

  async function handleOrderDetail(detail, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "capture-details") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    run = await writeRun(CORE.mergeDetail(run, detail || {}));
    if (run.phase === "review") return finishReview(run);
    const next = (run.orders || [])[Number(run.detailIndex || 0)];
    if (!next?.pageUrl) return finishReview(run);
    await navigateWorker(run, next.pageUrl);
    return { ...publicResult(run), instruction: "worker-navigating" };
  }

  async function getStatus() {
    const run = await readRun();
    return run ? publicResult(run) : { ok: true, state: null, summary: null };
  }

  async function confirmNoteAmounts(orderNumber, input = {}) {
    const run = await readRun();
    if (!run || run.phase !== "review") throw new Error("Monthly eBay profit has not reached note review.");
    const next = await writeRun(CORE.confirmNoteAmounts(run, orderNumber, input));
    void sendToTab(next.ownerTabId, { type: "ebayMonthlyProfitProgress", state: next, summary: CORE.summary(next) });
    return publicResult(next);
  }

  async function pendingForSync() {
    const run = await readRun();
    if (!run || run.phase !== "review") throw new Error("Monthly eBay profit has not reached review.");
    return {
      run,
      results: CORE.unsyncedReviewResults(run),
      records: CORE.unsyncedExactResults(run).map((result) => result.record),
      reviewRecords: CORE.reviewRecords(run)
    };
  }

  async function markSynced(orderNumbers, options = {}) {
    const run = await readRun();
    if (!run) throw new Error("The monthly eBay profit checkpoint is missing.");
    const syncedOrderNumbers = [...new Set([...(run.syncedOrderNumbers || []), ...(orderNumbers || []).map(String)])];
    const remaining = CORE.unsyncedReviewResults({ ...run, syncedOrderNumbers });
    const next = await writeRun({
      ...run,
      syncedOrderNumbers,
      ...(remaining.length ? {} : {
        active: false,
        phase: "completed",
        completedAt: new Date().toISOString(),
        syncDelivery: options.queued === true ? "queued" : "confirmed"
      })
    });
    return next;
  }

  async function pauseIncompatibleVersion(reason = "extension-update") {
    const run = await readRun();
    if (!run || String(run.extensionVersion || "") === runtimeVersion()) return { ok: true, changed: false, state: run };
    if (run.workerTabId) await tabRemove(run.workerTabId);
    if (run.phase === "review" || run.phase === "completed") {
      const migrated = await writeRun({ ...run, active: false, workerTabId: null, extensionVersion: runtimeVersion(), migrationReason: reason });
      return { ok: true, changed: true, state: migrated };
    }
    const paused = await writeRun({
      ...run,
      active: false,
      phase: "paused",
      resumePhase: run.phase === "paused" ? (run.resumePhase || "index-orders") : run.phase,
      workerTabId: null,
      extensionVersion: runtimeVersion(),
      pausedReason: `Paused safely because GLDN Ops changed from v${run.extensionVersion || "unknown"} to v${runtimeVersion()}.`,
      migrationReason: reason
    });
    return { ok: true, changed: true, state: paused };
  }

  return Object.freeze({
    STORAGE_KEY,
    start,
    stop,
    reset,
    resume,
    getStatus,
    confirmNoteAmounts,
    handleOrdersPage,
    handleOrderDetail,
    handleWorkerError,
    pendingForSync,
    markSynced,
    pauseIncompatibleVersion
  });
});
