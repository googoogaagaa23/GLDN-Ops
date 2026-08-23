(function attachOrderPlacementAuditBackground(root, factory) {
  root.GLDN_ORDER_PLACEMENT_AUDIT_BACKGROUND = factory(root.GLDN_ORDER_PLACEMENT_AUDIT);
})(globalThis, (CORE) => {
  const STORAGE_KEY = "orderPlacementAuditAmazonScan";
  const MAX_EXPECTED_UNITS = 5000;
  const MAX_AMAZON_CANDIDATES = 5000;
  const DASHBOARD_BATCH_SIZE = 100;
  const NAVIGATION_DELAY_MS = 1200;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError?.message;
      if (error) reject(new Error(error));
      else resolve();
    });
  });
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  const tabGet = (tabId) => new Promise((resolve) => chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : tab)));
  const tabCreate = (options) => new Promise((resolve, reject) => chrome.tabs.create(options, (tab) => {
    const error = chrome.runtime.lastError?.message;
    if (error) reject(new Error(error));
    else resolve(tab);
  }));
  const tabUpdate = (tabId, options) => new Promise((resolve, reject) => chrome.tabs.update(tabId, options, (tab) => {
    const error = chrome.runtime.lastError?.message;
    if (error) reject(new Error(error));
    else resolve(tab);
  }));
  const tabRemove = (tabId) => new Promise((resolve) => {
    if (!Number.isInteger(tabId)) return resolve(false);
    try {
      chrome.tabs.remove(tabId, () => resolve(!chrome.runtime.lastError));
    } catch {
      resolve(false);
    }
  });

  function runtimeVersion() {
    return String(chrome.runtime.getManifest().version || "");
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

  function summary(run) {
    if (!run) return null;
    return {
      runId: run.runId,
      runKey: run.runKey,
      monthKey: run.monthKey,
      computerLabel: run.computerLabel,
      accountLabel: run.accountLabel,
      supplierProfile: run.supplierProfile,
      phase: run.phase,
      active: run.active === true,
      pagesScanned: Number(run.pagesScanned || 0),
      targetAsins: (run.targetAsins || []).length,
      candidateOrders: (run.candidates || []).length,
      detailsCaptured: Number(run.candidateIndex || 0),
      purchaseUnits: (run.purchases || []).length,
      error: String(run.error || ""),
      pausedReason: String(run.pausedReason || "")
    };
  }

  function publicResult(run) {
    return { ok: true, state: run, summary: summary(run) };
  }

  function amazonOrdersUrl(monthKey) {
    const year = CORE.normalizeMonthKey(monthKey).slice(0, 4);
    const url = new URL("https://www.amazon.com/gp/your-account/order-history");
    url.searchParams.set("orderFilter", year ? `year-${year}` : "months-6");
    return url.href;
  }

  async function navigate(run, url, delayMs = NAVIGATION_DELAY_MS) {
    const worker = await tabGet(Number(run.workerTabId));
    if (!worker) return pause(run, "The signed-in Amazon worker tab closed. Resume will reopen it at this checkpoint.", { preserveWorker: false });
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs + Math.floor(Math.random() * 800)));
    await tabUpdate(worker.id, { url, active: false });
    return run;
  }

  async function pause(run, reason, options = {}) {
    const workerTabId = Number(run?.workerTabId);
    const preserveWorker = options.preserveWorker !== false && Boolean(await tabGet(workerTabId));
    return writeRun({
      ...run,
      active: false,
      phase: "paused",
      resumePhase: String(run?.phase || run?.resumePhase || "index-amazon"),
      pausedReason: String(reason || "Paused at a safe checkpoint."),
      workerTabId: preserveWorker ? workerTabId : null
    });
  }

  async function seedExpectedFromMonthlyRun(monthlyRun, options = {}, deps = {}) {
    if (!deps.postToDashboard) throw new Error("The shared dashboard client is unavailable.");
    if (!monthlyRun || String(monthlyRun.phase || "") !== "review") {
      throw new Error("Finish the selected Monthly eBay Profit read first. The audit uses its exact eBay order, SKU, quantity, and ship-to evidence.");
    }
    const monthKey = CORE.normalizeMonthKey(options.monthKey || monthlyRun.monthKey);
    if (!monthKey || monthKey !== CORE.normalizeMonthKey(monthlyRun.monthKey)) {
      throw new Error("The completed Monthly eBay Profit run does not match the selected audit month.");
    }
    const records = CORE.expectedUnitsFromMonthlyRun(monthlyRun);
    if (!records.length) throw new Error("The completed eBay read contains no exact SKU-linked order units for this audit.");
    if (records.length > MAX_EXPECTED_UNITS) throw new Error(`The audit cannot exceed ${MAX_EXPECTED_UNITS} eBay order units in one month.`);
    const key = CORE.runKey(monthlyRun);
    const expectedProfiles = CORE.unique(options.expectedProfiles || []);
    await deps.postToDashboard("orderPlacementAuditConfig", {
      runKey: key,
      computerLabel: monthlyRun.computerLabel,
      accountLabel: monthlyRun.accountLabel,
      monthKey,
      expectedProfiles,
      expectedUnits: records.length,
      resetPurchases: true
    });
    for (let index = 0; index < records.length; index += DASHBOARD_BATCH_SIZE) {
      const batch = records.slice(index, index + DASHBOARD_BATCH_SIZE);
      await deps.postToDashboard("orderPlacementAuditExpectedBatch", {
        runKey: key,
        computerLabel: monthlyRun.computerLabel,
        accountLabel: monthlyRun.accountLabel,
        monthKey,
        replace: index === 0,
        records: batch
      });
    }
    return {
      ok: true,
      runKey: key,
      count: records.length,
      message: `${records.length} eBay order units are ready for cross-profile Amazon auditing.`
    };
  }

  async function readShared(options = {}, deps = {}) {
    if (!deps.postToDashboard) throw new Error("The shared dashboard client is unavailable.");
    const response = await deps.postToDashboard("orderPlacementAuditRead", {
      runKey: String(options.runKey || ""),
      computerLabel: String(options.computerLabel || ""),
      accountLabel: String(options.accountLabel || ""),
      monthKey: String(options.monthKey || "")
    });
    const expected = Array.isArray(response.expected) ? response.expected : [];
    const purchases = Array.isArray(response.purchases) ? response.purchases : [];
    const result = CORE.audit(expected, purchases, { matchWindowDays: options.matchWindowDays });
    return {
      ...response,
      ok: true,
      audit: result,
      summary: CORE.summary(result)
    };
  }

  async function configure(options = {}, deps = {}) {
    if (!deps.postToDashboard) throw new Error("The shared dashboard client is unavailable.");
    const computerLabel = String(options.computerLabel || "").trim();
    const accountLabel = String(options.accountLabel || "").trim().toUpperCase();
    const monthKey = CORE.normalizeMonthKey(options.monthKey);
    const key = String(options.runKey || CORE.runKey({ computerLabel, accountLabel, monthKey }));
    if (!key) throw new Error("Choose the eBay computer, account, and month before saving Amazon profiles.");
    const expectedProfiles = CORE.unique(options.expectedProfiles || []);
    const result = await deps.postToDashboard("orderPlacementAuditConfig", {
      runKey: key,
      computerLabel,
      accountLabel,
      monthKey,
      expectedProfiles,
      resetPurchases: false
    });
    return {
      ok: true,
      ...result,
      message: expectedProfiles.length
        ? `Saved ${expectedProfiles.length} expected Amazon profile${expectedProfiles.length === 1 ? "" : "s"} without clearing completed scans.`
        : "Cleared the expected-profile checklist without clearing completed scans."
    };
  }

  async function startAmazonScan(options = {}, sender = {}, deps = {}) {
    if (!deps.postToDashboard) throw new Error("The shared dashboard client is unavailable.");
    const stored = await storageGet(["amazonProfileLabel", "computerLabel"]);
    const supplierProfile = String(options.supplierProfile || stored.amazonProfileLabel || "").trim();
    if (!supplierProfile) throw new Error("Name this signed-in Amazon profile once in GLDN Ops Setup before scanning it.");
    const computerLabel = String(options.computerLabel || stored.computerLabel || "").trim();
    const monthKey = CORE.normalizeMonthKey(options.monthKey);
    const accountLabel = String(options.accountLabel || "").trim().toUpperCase();
    const key = String(options.runKey || CORE.runKey({ computerLabel, accountLabel, monthKey }));
    if (!key) throw new Error("Choose the eBay computer, account, and month before scanning this Amazon profile.");
    const shared = await deps.postToDashboard("orderPlacementAuditRead", { runKey: key, computerLabel, accountLabel, monthKey });
    const expected = Array.isArray(shared.expected) ? shared.expected : [];
    if (!expected.length) throw new Error("No eBay demand is saved for this month. Build eBay demand from the completed Monthly eBay Profit read first.");
    const targetAsins = CORE.unique(expected.map((record) => CORE.normalizeAsin(record.asin)).filter(Boolean));
    if (!targetAsins.length) throw new Error("The eBay demand has no exact Amazon ASINs to scan.");

    const existing = await readRun();
    if (existing?.workerTabId) await tabRemove(Number(existing.workerTabId));
    const ownerWindowId = sender?.tab?.windowId;
    const worker = await tabCreate({
      url: amazonOrdersUrl(monthKey),
      active: false,
      ...(Number.isInteger(ownerWindowId) ? { windowId: ownerWindowId } : {})
    });
    const now = new Date().toISOString();
    const run = await writeRun({
      stateVersion: CORE.STATE_VERSION,
      extensionVersion: runtimeVersion(),
      runId: `order-audit-${Date.now()}`,
      runKey: key,
      computerLabel,
      accountLabel,
      monthKey,
      supplierProfile,
      expectedCount: expected.length,
      targetAsins,
      active: true,
      stopRequested: false,
      phase: "index-amazon",
      startedAt: now,
      workerTabId: worker.id,
      ownerTabId: sender?.tab?.id ?? null,
      ownerWindowId: ownerWindowId ?? null,
      pagesScanned: 0,
      pageFingerprints: [],
      candidates: [],
      candidateIndex: 0,
      purchases: [],
      errors: []
    });
    return publicResult(run);
  }

  function isWorker(run, sender) {
    return Boolean(run && Number(run.workerTabId) === Number(sender?.tab?.id));
  }

  function mergeCandidates(existing, incoming, targetAsins) {
    const targets = new Set((targetAsins || []).map(CORE.normalizeAsin).filter(Boolean));
    const byOrder = new Map((existing || []).map((candidate) => [String(candidate.orderId || candidate.orderDetailsUrl), candidate]));
    (incoming || []).forEach((candidate) => {
      const asins = CORE.unique(candidate.asins).map(CORE.normalizeAsin).filter((asin) => targets.has(asin));
      const orderId = String(candidate.orderId || "").trim();
      const orderDetailsUrl = String(candidate.orderDetailsUrl || "").trim();
      if ((!orderId && !orderDetailsUrl) || !asins.length) return;
      const key = orderId || orderDetailsUrl;
      const previous = byOrder.get(key) || {};
      byOrder.set(key, {
        ...previous,
        ...candidate,
        orderId: orderId || previous.orderId || "",
        orderDetailsUrl: orderDetailsUrl || previous.orderDetailsUrl || "",
        purchaseDate: candidate.purchaseDate || previous.purchaseDate || "",
        asins: CORE.unique([...(previous.asins || []), ...asins])
      });
    });
    return [...byOrder.values()].slice(0, MAX_AMAZON_CANDIDATES);
  }

  async function handleAmazonIndex(payload = {}, sender = {}, deps = {}) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "index-amazon") return { ok: false, ignored: true };
    if (run.stopRequested) return publicResult(await pause(run, "Stopped at the Amazon history-page checkpoint."));
    const fingerprint = CORE.unique((payload.records || []).map((record) => String(record.orderId || record.orderDetailsUrl))).sort().join("|");
    const repeated = Boolean(fingerprint && (run.pageFingerprints || []).includes(fingerprint));
    const candidates = mergeCandidates(run.candidates, payload.records, run.targetAsins);
    const complete = payload.hasNext !== true || payload.reachedOlder === true || repeated || candidates.length >= MAX_AMAZON_CANDIDATES;
    run = await writeRun({
      ...run,
      candidates,
      pagesScanned: Number(run.pagesScanned || 0) + 1,
      pageFingerprints: fingerprint && !repeated ? [...(run.pageFingerprints || []), fingerprint] : [...(run.pageFingerprints || [])],
      phase: complete ? "capture-amazon-details" : "index-amazon",
      candidateIndex: complete ? 0 : Number(run.candidateIndex || 0)
    });
    if (!complete) {
      if (!payload.nextUrl) return publicResult(await pause(run, "Amazon reported another history page but did not expose its URL."));
      await navigate(run, payload.nextUrl);
      return { ...publicResult(run), instruction: "next-amazon-page" };
    }
    if (!candidates.length) return publicResult(await completeAmazonScan(run, deps));
    await navigate(run, candidates[0].orderDetailsUrl);
    return { ...publicResult(run), instruction: "capture-amazon-detail" };
  }

  async function handleAmazonDetail(payload = {}, sender = {}, deps = {}) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "capture-amazon-details") return { ok: false, ignored: true };
    if (run.stopRequested) return publicResult(await pause(run, "Stopped at the Amazon order-detail checkpoint."));
    const candidate = (run.candidates || [])[Number(run.candidateIndex || 0)] || {};
    if (candidate.orderId && payload.orderId && String(candidate.orderId) !== String(payload.orderId)) {
      return publicResult(await pause(run, `Expected Amazon order ${candidate.orderId}, but the worker opened ${payload.orderId}.`));
    }
    const incoming = (payload.purchases || []).flatMap((purchase) => CORE.expandPurchase({
      ...purchase,
      runKey: run.runKey,
      computerLabel: run.computerLabel,
      monthKey: run.monthKey,
      supplierProfile: run.supplierProfile,
      purchaseDate: purchase.purchaseDate || candidate.purchaseDate,
      orderId: purchase.orderId || candidate.orderId,
      orderUrl: purchase.orderUrl || candidate.orderDetailsUrl,
      shippingBlock: purchase.shippingBlock || payload.shippingBlock
    }));
    const purchases = CORE.dedupePurchases([...(run.purchases || []), ...incoming]);
    const candidateIndex = Number(run.candidateIndex || 0) + 1;
    run = await writeRun({ ...run, purchases, candidateIndex });
    const next = (run.candidates || [])[candidateIndex];
    if (next) {
      await navigate(run, next.orderDetailsUrl);
      return { ...publicResult(run), instruction: "capture-amazon-detail" };
    }
    return publicResult(await completeAmazonScan(run, deps));
  }

  async function completeAmazonScan(run, deps = {}) {
    if (!deps.postToDashboard) {
      return pause(run, "Amazon scanning finished, but the shared dashboard client was unavailable before results could be saved.");
    }
    const purchases = CORE.dedupePurchases(run.purchases || []);
    const batches = Math.max(1, Math.ceil(purchases.length / DASHBOARD_BATCH_SIZE));
    for (let batchIndex = 0; batchIndex < batches; batchIndex += 1) {
      const records = purchases.slice(batchIndex * DASHBOARD_BATCH_SIZE, (batchIndex + 1) * DASHBOARD_BATCH_SIZE);
      await deps.postToDashboard("orderPlacementAuditAmazonBatch", {
        runKey: run.runKey,
        computerLabel: run.computerLabel,
        accountLabel: run.accountLabel,
        monthKey: run.monthKey,
        supplierProfile: run.supplierProfile,
        replaceProfile: batchIndex === 0,
        profileCompleted: batchIndex === batches - 1,
        records
      });
    }
    const workerTabId = Number(run.workerTabId);
    const completed = await writeRun({
      ...run,
      active: false,
      phase: "review",
      workerTabId: null,
      completedAt: new Date().toISOString(),
      savedPurchaseUnits: purchases.length
    });
    if (Number.isInteger(workerTabId)) void tabRemove(workerTabId);
    return completed;
  }

  async function workerError(error = {}, sender = {}) {
    const run = await readRun();
    if (!isWorker(run, sender)) return { ok: false, ignored: true };
    const entry = {
      phase: run.phase,
      message: String(error.message || error || "Amazon audit worker failed."),
      url: String(error.url || sender?.tab?.url || ""),
      at: new Date().toISOString()
    };
    const paused = await pause({ ...run, errors: [...(run.errors || []), entry].slice(-25), error: entry.message }, entry.message);
    return publicResult(paused);
  }

  async function stop() {
    const run = await readRun();
    if (!run) return { ok: true, message: "No Amazon audit scan is saved." };
    if (!run.active) return publicResult(run);
    return publicResult(await writeRun({ ...run, stopRequested: true }));
  }

  async function reset() {
    const run = await readRun();
    if (run?.workerTabId) await tabRemove(Number(run.workerTabId));
    await storageRemove([STORAGE_KEY]);
    return { ok: true };
  }

  async function resume(sender = {}, deps = {}) {
    let run = await readRun();
    if (!run) throw new Error("No Amazon order audit checkpoint is saved in this Chrome profile.");
    if (run.phase === "review") return publicResult(run);
    let worker = await tabGet(Number(run.workerTabId));
    if (!worker) {
      worker = await tabCreate({
        url: amazonOrdersUrl(run.monthKey),
        active: false,
        ...(Number.isInteger(sender?.tab?.windowId) ? { windowId: sender.tab.windowId } : {})
      });
    }
    const phase = String(run.resumePhase || run.phase || "index-amazon");
    run = await writeRun({
      ...run,
      active: true,
      stopRequested: false,
      phase,
      resumePhase: "",
      pausedReason: "",
      error: "",
      workerTabId: worker.id
    });
    if (phase === "capture-amazon-details") {
      const candidate = (run.candidates || [])[Number(run.candidateIndex || 0)];
      if (!candidate) return publicResult(await completeAmazonScan(run, deps));
      await navigate(run, candidate.orderDetailsUrl, 0);
    } else {
      await navigate(run, amazonOrdersUrl(run.monthKey), 0);
    }
    return publicResult(run);
  }

  async function handleWorkerTabClosed(tabId) {
    const run = await readRun();
    if (!run?.active || Number(run.workerTabId) !== Number(tabId)) return { ok: true, changed: false };
    const paused = await writeRun({
      ...run,
      active: false,
      phase: "paused",
      resumePhase: run.phase,
      workerTabId: null,
      pausedReason: "The signed-in Amazon worker tab was closed. Resume continues from the saved checkpoint."
    });
    return { ok: true, changed: true, state: paused };
  }

  async function getStatus() {
    const run = await readRun();
    return publicResult(run);
  }

  return Object.freeze({
    STORAGE_KEY,
    seedExpectedFromMonthlyRun,
    configure,
    readShared,
    startAmazonScan,
    handleAmazonIndex,
    handleAmazonDetail,
    workerError,
    stop,
    reset,
    resume,
    handleWorkerTabClosed,
    getStatus,
    summary
  });
});
