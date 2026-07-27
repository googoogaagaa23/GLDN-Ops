(function attachProfitBackfillBackground(root, factory) {
  root.GLDN_PROFIT_BACKFILL_BACKGROUND = factory(root.GLDN_PROFIT_BACKFILL);
})(globalThis, (BACKFILL) => {
  const STORAGE_KEY = "poshmarkProfitBackfill";
  const SALES_URL = "https://poshmark.com/order/sales";
  const AMAZON_ORDERS_URL = "https://www.amazon.com/gp/your-account/order-history?orderFilter=months-6";

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

  const TAB_REMOVE_TIMEOUT_MS = 750;

  function tabRemove(tabId) {
    return new Promise((resolve) => {
      if (!Number.isInteger(tabId)) return resolve(false);
      let settled = false;
      const finish = (removed) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(removed);
      };
      const timer = setTimeout(() => finish(false), TAB_REMOVE_TIMEOUT_MS);
      try {
        chrome.tabs.remove(tabId, () => finish(!chrome.runtime.lastError));
      } catch {
        finish(false);
      }
    });
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve) => {
      if (!Number.isInteger(tabId)) return resolve({ ok: false });
      chrome.tabs.sendMessage(tabId, message, (response) => resolve(chrome.runtime.lastError ? { ok: false } : (response || { ok: true })));
    });
  }

  async function readRun() {
    const stored = await storageGet([STORAGE_KEY]);
    return stored[STORAGE_KEY] || null;
  }

  function runtimeVersion() {
    return String(chrome.runtime.getManifest().version || "");
  }

  async function writeRun(run) {
    const next = { ...run, updatedAt: new Date().toISOString() };
    await storageSet({ [STORAGE_KEY]: next });
    return next;
  }

  function publicResult(run) {
    return { ok: true, state: run, summary: BACKFILL.summary(run) };
  }

  async function pauseIncompatibleVersion(reason = "extension-update") {
    const run = await readRun();
    if (!run || String(run.extensionVersion || "") === runtimeVersion()) {
      return { ok: true, changed: false, state: run };
    }
    if (run.workerTabId) await tabRemove(Number(run.workerTabId));
    if (run.phase === "review") {
      const review = await writeRun({
        ...run,
        active: false,
        stopRequested: false,
        workerTabId: null,
        extensionVersion: runtimeVersion(),
        migrationReason: reason
      });
      return { ok: true, changed: true, state: review };
    }
    const resumePhase = run.phase === "paused"
      ? String(run.resumePhase || "index-sales")
      : String(run.phase || "index-sales");
    const paused = await writeRun({
      ...run,
      active: false,
      stopRequested: false,
      phase: "paused",
      resumePhase,
      workerTabId: null,
      extensionVersion: runtimeVersion(),
      pausedReason: `Paused safely because GLDN Ops changed from v${run.extensionVersion || "unknown"} to v${runtimeVersion()}.`,
      migrationReason: reason
    });
    return { ok: true, changed: true, state: paused };
  }

  async function activeTab(sender) {
    if (sender?.tab?.id) return sender.tab;
    return new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0] || null)));
  }

  async function navigateWorker(run, url) {
    const worker = await tabGet(Number(run.workerTabId));
    if (!worker) throw new Error("The historical-profit worker tab was closed. Use Resume to recreate it from the saved checkpoint.");
    await tabUpdate(worker.id, { url, active: false });
    return run;
  }

  function isWorker(run, sender) {
    return Boolean(run && Number(run.workerTabId) === Number(sender?.tab?.id));
  }

  async function start(options = {}, sender = {}) {
    await pauseIncompatibleVersion("start-check");
    const existing = await readRun();
    if (existing?.active) return { ok: false, error: `A Poshmark profit backfill is already running (${BACKFILL.summary(existing).phase}).` };
    const identitySettings = await storageGet(["computerLabel", "poshmarkProfitKnownOrders"]);
    const poshmarkIdentity = globalThis.GLDN_FOUNDATION.poshmarkIdentityForComputer(identitySettings.computerLabel);
    if (!poshmarkIdentity.enabled) return { ok: false, error: poshmarkIdentity.error || "This computer is not configured for Poshmark." };
    const anchor = await activeTab(sender);
    const run = BACKFILL.createRun({
      ...options,
      knownOrderNumbers: Object.keys(identitySettings.poshmarkProfitKnownOrders || {}),
      extensionVersion: chrome.runtime.getManifest().version,
      ownerTabId: sender?.tab?.id ?? anchor?.id ?? null,
      ownerWindowId: sender?.tab?.windowId ?? anchor?.windowId ?? null
    });
    run.computerLabel = poshmarkIdentity.computerLabel;
    if (run.scope === "single") {
      const orderNumber = String(options.seedSale?.orderNumber || "").trim();
      if (!/^[a-f0-9]{24}$/i.test(orderNumber)) return { ok: false, error: "Current sale mode requires one valid Poshmark order page." };
      run.sales = [{
        orderNumber,
        pageUrl: `https://poshmark.com/order/sales/${orderNumber}`,
        itemTitle: String(options.seedSale?.itemTitle || "")
      }];
      run.phase = "capture-posh-details";
      run.currentOrderNumber = orderNumber;
      run.detailIndex = 0;
    }
    if (existing?.workerTabId) await tabRemove(Number(existing.workerTabId));
    const worker = await tabCreate({ url: "about:blank", active: false, ...(Number.isInteger(run.ownerWindowId) ? { windowId: run.ownerWindowId } : {}) });
    const started = await writeRun({ ...run, workerTabId: worker.id });
    await navigateWorker(started, run.scope === "single" ? run.sales[0].pageUrl : SALES_URL);
    return publicResult(started);
  }

  async function pauseAtCheckpoint(run, reason = "Stopped at a safe checkpoint.") {
    const paused = await writeRun({
      ...run,
      active: false,
      stopRequested: false,
      resumePhase: run.phase,
      phase: "paused",
      pausedReason: reason
    });
    await sendToTab(paused.ownerTabId, { type: "poshmarkBackfillProgress", summary: BACKFILL.summary(paused), state: paused });
    return publicResult(paused);
  }

  async function stop() {
    const run = await readRun();
    if (!run) return { ok: false, error: "No historical-profit backfill is saved." };
    const next = await writeRun({ ...run, stopRequested: true });
    return { ok: true, message: "Stop requested. The worker will pause after the current page.", summary: BACKFILL.summary(next) };
  }

  async function reset() {
    const run = await readRun();
    await storageRemove([STORAGE_KEY]);
    if (run?.workerTabId) void tabRemove(Number(run.workerTabId));
    return { ok: true, workerClose: run?.workerTabId ? "scheduled" : "not-needed" };
  }

  async function resume(sender = {}) {
    await pauseIncompatibleVersion("resume-check");
    const run = await readRun();
    if (!run) return { ok: false, error: "No historical-profit checkpoint exists." };
    if (run.phase === "review") return publicResult(run);
    const anchor = await activeTab(sender);
    let worker = await tabGet(Number(run.workerTabId));
    if (!worker) {
      worker = await tabCreate({ url: "about:blank", active: false, ...(Number.isInteger(anchor?.windowId) ? { windowId: anchor.windowId } : {}) });
    }
    const phase = run.phase === "paused" ? (run.resumePhase || "index-sales") : run.phase;
    const resumed = await writeRun({
      ...run,
      active: true,
      stopRequested: false,
      phase,
      extensionVersion: runtimeVersion(),
      workerTabId: worker.id,
      ownerTabId: sender?.tab?.id ?? run.ownerTabId ?? anchor?.id ?? null,
      ownerWindowId: sender?.tab?.windowId ?? run.ownerWindowId ?? anchor?.windowId ?? null
    });
    if (phase === "index-sales") await navigateWorker(resumed, SALES_URL);
    else if (phase === "capture-posh-details") await advancePoshDetails(resumed);
    else if (phase === "amazon-search" || phase === "amazon-detail") await advanceAmazon(resumed);
    return publicResult(resumed);
  }

  async function handleSalesPage(payload, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "index-sales") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    run = BACKFILL.mergeSalesPage(run, payload.records || [], { hasNext: payload.hasNext });
    run.lastListUrl = payload.pageUrl || sender?.tab?.url || "";
    await writeRun(run);
    if (run.phase === "index-sales") {
      return { ...publicResult(run), instruction: "next-page" };
    }
    await advancePoshDetails(run);
    return { ...publicResult(run), instruction: "worker-navigating" };
  }

  async function advancePoshDetails(run) {
    if (run.stopRequested) return pauseAtCheckpoint(run);
    const nextSale = (run.sales || [])[Number(run.detailIndex || 0)];
    if (nextSale?.pageUrl) {
      const next = await writeRun({ ...run, phase: "capture-posh-details", currentOrderNumber: nextSale.orderNumber });
      await navigateWorker(next, nextSale.pageUrl);
      return publicResult(next);
    }
    const asins = [...new Set((run.sales || []).flatMap((sale) => sale.asins || []).map(BACKFILL.normalizeAsin).filter(Boolean))];
    if (!asins.length) return completeRun(run);
    const next = await writeRun({
      ...run,
      phase: "amazon-search",
      asins,
      asinIndex: 0,
      currentAsin: asins[0],
      amazonSearchMatches: [],
      amazonSearchCollected: [],
      amazonSearchFingerprints: [],
      amazonCandidateIndex: 0
    });
    await navigateWorker(next, AMAZON_ORDERS_URL);
    return publicResult(next);
  }

  async function handlePoshDetail(detail, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "capture-posh-details") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    if (String(detail?.orderNumber || "") !== String(run.currentOrderNumber || "")) {
      const errors = [...(run.errors || []), { phase: run.phase, message: `Expected Poshmark order ${run.currentOrderNumber}; found ${detail?.orderNumber || "none"}.`, at: new Date().toISOString() }];
      run = await writeRun({ ...run, errors, detailIndex: Number(run.detailIndex || 0) + 1 });
    } else {
      run = await writeRun(BACKFILL.mergeSaleDetail(run, detail));
    }
    await advancePoshDetails(run);
    return { ...publicResult(run), instruction: "worker-navigating" };
  }

  async function handleAmazonSearch(payload, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "amazon-search") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    const pageMatches = (payload.matches || [])
      .filter((match) => match?.orderDetailsUrl && (!match.asin || BACKFILL.normalizeAsin(match.asin) === run.currentAsin))
      .filter((match, index, all) => all.findIndex((entry) => entry.orderDetailsUrl === match.orderDetailsUrl) === index);
    const fingerprint = pageMatches.map((match) => match.orderDetailsUrl).sort().join("|");
    const repeatedPage = Boolean(fingerprint && (run.amazonSearchFingerprints || []).includes(fingerprint));
    const matches = [...(run.amazonSearchCollected || []), ...pageMatches]
      .filter((match, index, all) => all.findIndex((entry) => entry.orderDetailsUrl === match.orderDetailsUrl) === index);
    if (payload.hasNext && !repeatedPage) {
      run = await writeRun({
        ...run,
        amazonSearchCollected: matches,
        amazonSearchFingerprints: fingerprint
          ? [...(run.amazonSearchFingerprints || []), fingerprint]
          : [...(run.amazonSearchFingerprints || [])]
      });
      return { ...publicResult(run), instruction: "next-amazon-page" };
    }
    if (!matches.length) {
      run = await writeRun({ ...run, amazonSearchMatches: [], amazonSearchCollected: [], amazonSearchFingerprints: [], amazonCandidateIndex: 0 });
      return advanceAmazonAsin(run);
    }
    run = await writeRun({ ...run, phase: "amazon-detail", amazonSearchMatches: matches, amazonSearchCollected: [], amazonSearchFingerprints: [], amazonCandidateIndex: 0 });
    await navigateWorker(run, matches[0].orderDetailsUrl);
    return { ...publicResult(run), instruction: "worker-navigating" };
  }

  async function handleAmazonDetail(payload, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "amazon-detail") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    const searchMatch = (run.amazonSearchMatches || [])[Number(run.amazonCandidateIndex || 0)] || {};
    if (payload.purchase) {
      run = BACKFILL.addPurchase(run, {
        ...payload.purchase,
        asin: run.currentAsin,
        purchaseDate: payload.purchase.purchaseDate || searchMatch.purchaseDate || ""
      });
    }
    const nextIndex = Number(run.amazonCandidateIndex || 0) + 1;
    run = await writeRun({ ...run, amazonCandidateIndex: nextIndex });
    const nextMatch = (run.amazonSearchMatches || [])[nextIndex];
    if (nextMatch?.orderDetailsUrl) {
      await navigateWorker(run, nextMatch.orderDetailsUrl);
      return { ...publicResult(run), instruction: "worker-navigating" };
    }
    return advanceAmazonAsin(run);
  }

  async function advanceAmazonAsin(run) {
    const nextIndex = Number(run.asinIndex || 0) + 1;
    const nextAsin = (run.asins || [])[nextIndex];
    if (!nextAsin) return completeRun(run);
    const next = await writeRun({
      ...run,
      phase: "amazon-search",
      asinIndex: nextIndex,
      currentAsin: nextAsin,
      amazonSearchMatches: [],
      amazonSearchCollected: [],
      amazonSearchFingerprints: [],
      amazonCandidateIndex: 0
    });
    await navigateWorker(next, AMAZON_ORDERS_URL);
    return publicResult(next);
  }

  async function advanceAmazon(run) {
    if (run.phase === "amazon-detail") {
      const match = (run.amazonSearchMatches || [])[Number(run.amazonCandidateIndex || 0)];
      if (match?.orderDetailsUrl) return navigateWorker(run, match.orderDetailsUrl);
    }
    return navigateWorker(run, AMAZON_ORDERS_URL);
  }

  async function completeRun(run) {
    const stored = await storageGet(["amazonProfileLabel"]);
    const completed = await writeRun(BACKFILL.allocate(run, {
      computerLabel: run.computerLabel || "7",
      supplierProfile: stored.amazonProfileLabel || ""
    }));
    await navigateWorker(completed, `${SALES_URL}?gldn_backfill_review=${encodeURIComponent(completed.runId)}`);
    await sendToTab(completed.ownerTabId, { type: "poshmarkBackfillProgress", summary: BACKFILL.summary(completed), state: completed });
    return publicResult(completed);
  }

  async function getStatus() {
    const run = await readRun();
    return run ? publicResult(run) : { ok: true, state: null, summary: null };
  }

  async function exactRecordsForSync() {
    const run = await readRun();
    if (!run || run.phase !== "review") throw new Error("The backfill has not reached review.");
    const synced = new Set(run.syncedOrderNumbers || []);
    return {
      run,
      records: (run.results || []).filter((result) => result.status === "exact" && result.record && !synced.has(result.orderNumber)).map((result) => result.record)
    };
  }

  async function markSynced(orderNumbers) {
    const run = await readRun();
    if (!run) throw new Error("The backfill checkpoint is missing.");
    const syncedOrderNumbers = [...new Set([...(run.syncedOrderNumbers || []), ...(orderNumbers || []).map(String)])];
    const stored = await storageGet(["poshmarkProfitKnownOrders"]);
    const known = { ...(stored.poshmarkProfitKnownOrders || {}) };
    syncedOrderNumbers.forEach((orderNumber) => { known[orderNumber] = new Date().toISOString(); });
    const entries = Object.entries(known).sort((left, right) => String(right[1]).localeCompare(String(left[1]))).slice(0, 10000);
    await storageSet({ poshmarkProfitKnownOrders: Object.fromEntries(entries) });
    return writeRun({ ...run, syncedOrderNumbers });
  }

  return Object.freeze({
    STORAGE_KEY,
    start,
    stop,
    reset,
    resume,
    getStatus,
    handleSalesPage,
    handlePoshDetail,
    handleAmazonSearch,
    handleAmazonDetail,
    exactRecordsForSync,
    markSynced,
    pauseIncompatibleVersion
  });
});
