(function attachProfitBackfillBackground(root, factory) {
  root.GLDN_PROFIT_BACKFILL_BACKGROUND = factory(root.GLDN_PROFIT_BACKFILL);
})(globalThis, (BACKFILL) => {
  const STORAGE_KEY = "poshmarkProfitBackfill";
  const SALES_URL = "https://poshmark.com/order/sales";
  const AMAZON_ORDERS_URL = "https://www.amazon.com/gp/your-account/order-history?orderFilter=months-6";
  const MAX_EMPTY_SALES_PAGE_ATTEMPTS = 8;
  const MAX_POSH_DETAIL_ATTEMPTS = 3;

  function amazonOrdersSearchUrl(asin) {
    const normalized = BACKFILL.normalizeAsin(asin);
    if (!normalized) return AMAZON_ORDERS_URL;
    const url = new URL("https://www.amazon.com/your-orders/search");
    url.searchParams.set("search", normalized);
    return url.href;
  }

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
    if (run.phase === "review" || run.phase === "completed") {
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
    await tabUpdate(worker.id, { url, active: false, autoDiscardable: false });
    return run;
  }

  function isWorker(run, sender) {
    return Boolean(run && Number(run.workerTabId) === Number(sender?.tab?.id));
  }

  function nextMissingDetailIndex(run, startIndex = 0) {
    const sales = Array.isArray(run?.sales) ? run.sales : [];
    const failures = run?.poshDetailFailures || {};
    for (let index = Math.max(0, Number(startIndex || 0)); index < sales.length; index += 1) {
      const sale = sales[index];
      const orderNumber = String(sale?.orderNumber || "");
      if (!sale?.detailCapturedAt && !failures[orderNumber]) return index;
    }
    return -1;
  }

  async function advanceMissingDetailRepair(run) {
    if (run.stopRequested) return pauseAtCheckpoint(run);
    const nextIndex = nextMissingDetailIndex(run, run.detailIndex);
    if (nextIndex >= 0) {
      const sale = (run.sales || [])[nextIndex];
      if (!sale?.pageUrl) {
        return pauseAtCheckpoint(run, `Poshmark order ${sale?.orderNumber || "unknown"} needs detail repair, but its saved URL is missing.`);
      }
      const repairUrl = new URL(sale.pageUrl);
      repairUrl.searchParams.set("gldn_detail_repair", String(Date.now()));
      const next = await writeRun({
        ...run,
        active: true,
        phase: "capture-posh-details",
        repairMissingDetails: true,
        detailIndex: nextIndex,
        currentOrderNumber: sale.orderNumber
      });
      await navigateWorker(next, repairUrl.href);
      return publicResult(next);
    }

    const priorAsins = [...new Set((run.asins || []).map(BACKFILL.normalizeAsin).filter(Boolean))];
    const priorSet = new Set(priorAsins);
    const recoveredAsins = [...new Set(
      (run.sales || []).flatMap((sale) => sale.asins || []).map(BACKFILL.normalizeAsin).filter(Boolean)
    )].filter((asin) => !priorSet.has(asin));
    if (!recoveredAsins.length) {
      return completeRun({
        ...run,
        repairMissingDetails: false,
        poshDetailRepairCompletedAt: new Date().toISOString()
      });
    }

    const asins = [...priorAsins, ...recoveredAsins];
    const next = await writeRun({
      ...run,
      active: true,
      phase: "amazon-search",
      repairMissingDetails: true,
      asins,
      asinIndex: priorAsins.length,
      currentAsin: recoveredAsins[0],
      amazonSearchMatches: [],
      amazonSearchCollected: [],
      amazonSearchFingerprints: [],
      amazonCandidateIndex: 0
    });
    await navigateWorker(next, amazonOrdersSearchUrl(next.currentAsin));
    return publicResult(next);
  }

  async function start(options = {}, sender = {}) {
    await pauseIncompatibleVersion("start-check");
    const existing = await readRun();
    if (existing?.active) return { ok: false, error: `A marketplace Amazon-cost lookup is already running (${BACKFILL.summary(existing).phase}).` };
    const identitySettings = await storageGet(["computerLabel", "poshmarkProfitKnownOrders", "amazonProfileLabel"]);
    const resolvingPoshmark = options.scope === "resolve-missing";
    const resolvingEbay = options.scope === "resolve-ebay";
    const resolvingMissing = resolvingPoshmark || resolvingEbay;
    const supplierProfile = String(options.supplierProfile || identitySettings.amazonProfileLabel || "").trim();
    if (resolvingMissing && !supplierProfile) {
      return { ok: false, error: "Set a permanent Amazon profile name in GLDN Ops Setup before resolving missing costs." };
    }
    const poshmarkIdentity = globalThis.GLDN_FOUNDATION.poshmarkIdentityForComputer(identitySettings.computerLabel);
    if (!resolvingMissing && !poshmarkIdentity.enabled) return { ok: false, error: poshmarkIdentity.error || "This computer is not configured for Poshmark." };
    const anchor = await activeTab(sender);
    const run = BACKFILL.createRun({
      ...options,
      supplierProfile,
      platform: resolvingEbay ? "eBay" : "Poshmark",
      knownOrderNumbers: Object.keys(identitySettings.poshmarkProfitKnownOrders || {}),
      extensionVersion: chrome.runtime.getManifest().version,
      ownerTabId: sender?.tab?.id ?? anchor?.id ?? null,
      ownerWindowId: sender?.tab?.windowId ?? anchor?.windowId ?? null
    });
    run.computerLabel = resolvingEbay ? "" : (resolvingPoshmark ? "7" : poshmarkIdentity.computerLabel);
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
    if (resolvingMissing) {
      const seedSales = Array.isArray(options.seedSales) ? options.seedSales.slice(0, run.maxOrders) : [];
      if (!seedSales.length) return { ok: false, error: `The shared Amazon-cost queue has no open ${resolvingEbay ? "eBay" : "Poshmark"} rows.` };
      run.sales = seedSales.map((sale) => ({
        ...sale,
        platform: resolvingEbay ? "eBay" : "Poshmark",
        computerLabel: resolvingEbay ? String(sale.computerLabel || "") : "7",
        skus: Array.isArray(sale.skus) ? sale.skus : [sale.sku].filter(Boolean),
        asins: Array.isArray(sale.asins)
          ? sale.asins.map(BACKFILL.normalizeAsin).filter(Boolean)
          : String(sale.supplierItemIds || sale.asin || "").split(/[,|]/).map(BACKFILL.normalizeAsin).filter(Boolean),
        detailCapturedAt: sale.detailCapturedAt || new Date().toISOString()
      }));
      run.phase = "amazon-search";
      run.asins = [...new Set(run.sales.flatMap((sale) => sale.asins || []).filter(Boolean))];
      if (!run.asins.length) return { ok: false, error: "The open queue has no exact Amazon ASINs to search." };
      run.currentAsin = run.asins[0];
      run.detailIndex = run.sales.length;
    }
    if (existing?.workerTabId) await tabRemove(Number(existing.workerTabId));
    const worker = await tabCreate({ url: "about:blank", active: false, ...(Number.isInteger(run.ownerWindowId) ? { windowId: run.ownerWindowId } : {}) });
    const started = await writeRun({ ...run, workerTabId: worker.id });
    await navigateWorker(started, resolvingMissing ? amazonOrdersSearchUrl(started.currentAsin) : (run.scope === "single" ? run.sales[0].pageUrl : SALES_URL));
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
    const anchor = await activeTab(sender);
    if (run.phase === "completed") return publicResult(run);
    if (run.phase === "review") {
      const missingIndex = nextMissingDetailIndex(run, 0);
      if (missingIndex < 0 || (run.syncedOrderNumbers || []).length) return publicResult(run);
      let worker = await tabGet(Number(run.workerTabId));
      const workerUnavailable = !worker || worker.discarded === true || worker.status === "unloaded";
      if (workerUnavailable) {
        if (worker?.id) await tabRemove(Number(worker.id));
        worker = await tabCreate({ url: "about:blank", active: false, ...(Number.isInteger(anchor?.windowId) ? { windowId: anchor.windowId } : {}) });
      }
      const sale = (run.sales || [])[missingIndex];
      if (!sale?.pageUrl) return publicResult(run);
      const repairUrl = new URL(sale.pageUrl);
      repairUrl.searchParams.set("gldn_detail_repair", String(Date.now()));
      const resumed = await writeRun({
        ...run,
        active: true,
        stopRequested: false,
        phase: "capture-posh-details",
        repairMissingDetails: true,
        detailIndex: missingIndex,
        currentOrderNumber: sale.orderNumber,
        extensionVersion: runtimeVersion(),
        workerTabId: worker.id,
        ownerTabId: sender?.tab?.id ?? run.ownerTabId ?? anchor?.id ?? null,
        ownerWindowId: sender?.tab?.windowId ?? run.ownerWindowId ?? anchor?.windowId ?? null
      });
      await navigateWorker(resumed, repairUrl.href);
      return publicResult(resumed);
    }
    let worker = await tabGet(Number(run.workerTabId));
    const workerUnavailable = !worker || worker.discarded === true || worker.status === "unloaded";
    if (workerUnavailable) {
      if (worker?.id) await tabRemove(Number(worker.id));
      worker = await tabCreate({ url: "about:blank", active: false, ...(Number.isInteger(anchor?.windowId) ? { windowId: anchor.windowId } : {}) });
    }
    let phase = run.phase === "paused" ? (run.resumePhase || "index-sales") : run.phase;
    const falseEmptyMonth = run.scope === "month"
      && !(run.sales || []).length
      && /No .+ sales were verified before Poshmark reported the end of the list/i.test(String(run.pausedReason || ""));
    const restartIndex = (phase === "index-sales" && workerUnavailable)
      || (falseEmptyMonth && phase === "capture-posh-details");
    if (restartIndex) phase = "index-sales";
    const resumed = await writeRun({
      ...run,
      active: true,
      stopRequested: false,
      phase,
      ...(restartIndex ? {
        currentPage: 1,
        pagesScanned: 0,
        pageFingerprints: [],
        emptySalesPageAttempts: 0,
        lastListUrl: "",
        resumePhase: "",
        pausedReason: "",
        indexRestartedAt: new Date().toISOString(),
        indexRestartReason: workerUnavailable ? "worker-recreated" : "false-empty-month"
      } : {}),
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
    const records = Array.isArray(payload.records) ? payload.records.filter((record) => record?.orderNumber) : [];
    if (!records.length) {
      const attempts = Number(run.emptySalesPageAttempts || 0) + 1;
      const reason = "Poshmark sales rows did not finish loading. No empty page was accepted as a completed month.";
      run = await writeRun({
        ...run,
        emptySalesPageAttempts: attempts,
        lastEmptySalesPageAt: new Date().toISOString(),
        lastListUrl: payload.pageUrl || sender?.tab?.url || run.lastListUrl || ""
      });
      if (attempts >= MAX_EMPTY_SALES_PAGE_ATTEMPTS) {
        return {
          ...(await pauseAtCheckpoint(run, `${reason} Resume when the Poshmark sales table is visible.`)),
          instruction: "paused-empty-page"
        };
      }
      return {
        ...publicResult(run),
        instruction: "retry-current-page",
        retryAfterMs: Math.min(6000, 1200 * attempts)
      };
    }
    run = BACKFILL.mergeSalesPage({ ...run, emptySalesPageAttempts: 0 }, records, { hasNext: payload.hasNext });
    run.lastListUrl = payload.pageUrl || sender?.tab?.url || "";
    if (run.scope === "month" && !(run.sales || []).length && run.phase !== "index-sales") {
      run = await writeRun(run);
      return {
        ...(await pauseAtCheckpoint(run, `No ${run.monthLabel || run.monthKey} sales were verified before Poshmark reported the end of the list. The empty month was not accepted automatically.`)),
        instruction: "paused-empty-month"
      };
    }
    await writeRun(run);
    if (run.phase === "index-sales") {
      return { ...publicResult(run), instruction: "next-page" };
    }
    await advancePoshDetails(run);
    return { ...publicResult(run), instruction: "worker-navigating" };
  }

  async function advancePoshDetails(run) {
    if (run.stopRequested) return pauseAtCheckpoint(run);
    if (run.repairMissingDetails) return advanceMissingDetailRepair(run);
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
    await navigateWorker(next, amazonOrdersSearchUrl(next.currentAsin));
    return publicResult(next);
  }

  async function handlePoshDetail(detail, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "capture-posh-details") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    if (String(detail?.orderNumber || "") !== String(run.currentOrderNumber || "")) {
      const orderNumber = String(run.currentOrderNumber || "");
      const attempts = { ...(run.poshDetailAttempts || {}) };
      attempts[orderNumber] = Number(attempts[orderNumber] || 0) + 1;
      if (attempts[orderNumber] < MAX_POSH_DETAIL_ATTEMPTS) {
        run = await writeRun({ ...run, poshDetailAttempts: attempts });
        const sale = (run.sales || [])[Number(run.detailIndex || 0)];
        if (!sale?.pageUrl) return pauseAtCheckpoint(run, `Poshmark order ${orderNumber} needs a detail-page retry, but its saved URL is missing.`);
        const retryUrl = new URL(sale.pageUrl);
        retryUrl.searchParams.set("gldn_detail_retry", String(attempts[orderNumber]));
        await navigateWorker(run, retryUrl.href);
        return { ...publicResult(run), instruction: "retry-posh-detail" };
      }
      delete attempts[orderNumber];
      const failedAt = new Date().toISOString();
      const errors = [...(run.errors || []), { phase: run.phase, message: `Expected Poshmark order ${orderNumber}; found ${detail?.orderNumber || "none"} after ${MAX_POSH_DETAIL_ATTEMPTS} attempts.`, at: failedAt }];
      const poshDetailFailures = {
        ...(run.poshDetailFailures || {}),
        [orderNumber]: { attempts: MAX_POSH_DETAIL_ATTEMPTS, found: detail?.orderNumber || "", at: failedAt }
      };
      run = await writeRun({ ...run, errors, poshDetailAttempts: attempts, poshDetailFailures, detailIndex: Number(run.detailIndex || 0) + 1 });
    } else {
      const attempts = { ...(run.poshDetailAttempts || {}) };
      const orderNumber = String(run.currentOrderNumber || "");
      const poshDetailFailures = { ...(run.poshDetailFailures || {}) };
      const repairedErrors = (run.errors || []).filter((error) => (
        error?.phase === "capture-posh-details"
        && String(error?.message || "").startsWith(`Expected Poshmark order ${orderNumber};`)
      ));
      const errors = (run.errors || []).filter((error) => !repairedErrors.includes(error));
      const resolvedErrors = [
        ...(run.resolvedErrors || []),
        ...repairedErrors.map((error) => ({ ...error, resolvedAt: new Date().toISOString() }))
      ];
      delete attempts[orderNumber];
      delete poshDetailFailures[orderNumber];
      run = await writeRun({
        ...BACKFILL.mergeSaleDetail(run, detail),
        errors,
        resolvedErrors,
        poshDetailAttempts: attempts,
        poshDetailFailures
      });
    }
    await advancePoshDetails(run);
    return { ...publicResult(run), instruction: "worker-navigating" };
  }

  async function handleAmazonSearch(payload, sender) {
    let run = await readRun();
    if (!isWorker(run, sender) || run.phase !== "amazon-search") return { ok: false, ignored: true };
    if (run.stopRequested) return pauseAtCheckpoint(run);
    const pageMatches = BACKFILL.mergeAmazonSearchMatches(
      (payload.matches || [])
        .filter((match) => match?.orderDetailsUrl && (!match.asin || BACKFILL.normalizeAsin(match.asin) === run.currentAsin))
    );
    const fingerprint = pageMatches.map(BACKFILL.amazonSearchMatchKey).sort().join("|");
    const repeatedPage = Boolean(fingerprint && (run.amazonSearchFingerprints || []).includes(fingerprint));
    const matches = BACKFILL.mergeAmazonSearchMatches(run.amazonSearchCollected || [], pageMatches);
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
    await navigateWorker(next, amazonOrdersSearchUrl(next.currentAsin));
    return publicResult(next);
  }

  async function advanceAmazon(run) {
    if (run.phase === "amazon-detail") {
      const match = (run.amazonSearchMatches || [])[Number(run.amazonCandidateIndex || 0)];
      if (match?.orderDetailsUrl) return navigateWorker(run, match.orderDetailsUrl);
    }
    return navigateWorker(run, amazonOrdersSearchUrl(run.currentAsin));
  }

  async function completeRun(run) {
    const stored = await storageGet(["amazonProfileLabel"]);
    const completed = await writeRun(BACKFILL.allocate({ ...run, repairMissingDetails: false }, {
      platform: run.platform || (run.scope === "resolve-ebay" ? "eBay" : "Poshmark"),
      computerLabel: run.computerLabel || (run.scope === "resolve-ebay" ? "" : "7"),
      supplierProfile: run.supplierProfile || stored.amazonProfileLabel || "",
      source: run.scope === "resolve-ebay" ? "ebay-amazon-order-reconciliation" : ""
    }));
    if (["resolve-missing", "resolve-ebay"].includes(completed.scope)) {
      await sendToTab(completed.workerTabId, { type: "showAmazonCostResolutionReview", state: completed });
    } else {
      await navigateWorker(completed, `${SALES_URL}?gldn_backfill_review=${encodeURIComponent(completed.runId)}`);
    }
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

  async function pendingReviewForSync() {
    const run = await readRun();
    if (!run || run.phase !== "review") throw new Error("The backfill has not reached review.");
    const handled = new Set(run.syncedOrderNumbers || []);
    const stored = await storageGet(["amazonProfileLabel"]);
    const pendingResults = (run.results || []).filter((result) => !handled.has(String(result.orderNumber || "")));
    const allReviewRecords = BACKFILL.reviewRecords(run, { supplierProfile: run.supplierProfile || stored.amazonProfileLabel || "" });
    const reviewByOrder = new Map(allReviewRecords.map((record) => [String(record.orderNumber || ""), record]));
    return {
      run,
      results: pendingResults,
      reviewRecords: pendingResults.map((result) => reviewByOrder.get(String(result.orderNumber || ""))).filter(Boolean),
      exactRecords: pendingResults.filter((result) => result.status === "exact" && result.record).map((result) => result.record)
    };
  }

  async function markSynced(orderNumbers, options = {}) {
    const run = await readRun();
    if (!run) throw new Error("The backfill checkpoint is missing.");
    const syncedOrderNumbers = [...new Set([...(run.syncedOrderNumbers || []), ...(orderNumbers || []).map(String)])];
    if (run.scope !== "resolve-ebay") {
      const stored = await storageGet(["poshmarkProfitKnownOrders"]);
      const known = { ...(stored.poshmarkProfitKnownOrders || {}) };
      syncedOrderNumbers.forEach((orderNumber) => { known[orderNumber] = new Date().toISOString(); });
      const entries = Object.entries(known).sort((left, right) => String(right[1]).localeCompare(String(left[1]))).slice(0, 10000);
      await storageSet({ poshmarkProfitKnownOrders: Object.fromEntries(entries) });
    }
    const syncedSet = new Set(syncedOrderNumbers);
    const expectedOrderNumbers = (run.scope === "month" || ["resolve-missing", "resolve-ebay"].includes(run.scope)
      ? (run.results || [])
      : (run.results || []).filter((result) => result?.status === "exact" && result?.record))
      .map((result) => String(result?.orderNumber || ""))
      .filter(Boolean);
    const completed = expectedOrderNumbers.length > 0 && expectedOrderNumbers.every((orderNumber) => syncedSet.has(orderNumber));
    const workerTabId = Number(run.workerTabId);
    const next = await writeRun({
      ...run,
      syncedOrderNumbers,
      ...(completed ? {
        active: false,
        stopRequested: false,
        phase: "completed",
        workerTabId: null,
        completedAt: new Date().toISOString(),
        syncDelivery: options.queued === true ? "queued" : "confirmed"
      } : {})
    });
    if (completed && options.keepWorkerOpen !== true && Number.isInteger(workerTabId) && workerTabId > 0) void tabRemove(workerTabId);
    return next;
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
    pendingReviewForSync,
    markSynced,
    pauseIncompatibleVersion
  });
});
