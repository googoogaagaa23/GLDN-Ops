'use strict';

importScripts('risk-profile.js', 'policy-core.js', 'hunter-core.js');

const CORE = globalThis.GLDN_PRODUCT_HUNTER_CORE;
const POLICY = globalThis.GLDN_LISTING_PREFLIGHT;
const VERSION = chrome.runtime.getManifest().version;
const KEYS = Object.freeze({
  JOB: 'gldnHunterJob',
  SETTINGS: 'gldnHunterSettings',
  HISTORY: 'gldnHunterHistory',
  LOGS: 'gldnHunterLogs',
  EBAY_SCAN: 'gldnHunterEbayScan',
  EBAY_INDEX: 'gldnHunterEbayIndex'
});
const PRODUCT_PREFIX = 'gldnHunterProduct:';
const EBAY_SCAN_PAGE_PREFIX = 'gldnHunterEbayScanPage:';
const TICK_ALARM = 'gldn-product-hunter-tick';
const EBAY_SCAN_ALARM = 'gldn-product-hunter-ebay-scan-tick';
const EBAY_PAGE_SIZE = 200;
const EBAY_NAVIGATION_DELAY_MS = 900;
const MAX_NAVIGATION_FAILURES = 3;
let rulePackPromise = null;
let loadedPageTimer = null;
let processingLoadedPage = false;
let ebayLoadedPageTimer = null;
let processingEbayLoadedPage = false;
let ebayIndexCache = undefined;

function productKey(jobId, asin) {
  return `${PRODUCT_PREFIX}${jobId}:${asin}`;
}

function ebayScanPageKey(scanId, page) {
  return `${EBAY_SCAN_PAGE_PREFIX}${scanId}:${page}`;
}

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(values) {
  await chrome.storage.local.set(values);
}

async function storageRemove(keys) {
  await chrome.storage.local.remove(keys);
}

async function getJob() {
  const stored = await storageGet(KEYS.JOB);
  return stored[KEYS.JOB] || null;
}

async function saveJob(job) {
  const next = { ...job, updatedAt: new Date().toISOString() };
  await storageSet({ [KEYS.JOB]: next });
  return next;
}

async function getHistory() {
  const stored = await storageGet(KEYS.HISTORY);
  return stored[KEYS.HISTORY] && typeof stored[KEYS.HISTORY] === 'object' ? stored[KEYS.HISTORY] : {};
}

async function getEbayScan() {
  const stored = await storageGet(KEYS.EBAY_SCAN);
  return stored[KEYS.EBAY_SCAN] || null;
}

async function saveEbayScan(scan) {
  const next = { ...scan, updatedAt: new Date().toISOString() };
  await storageSet({ [KEYS.EBAY_SCAN]: next });
  return next;
}

async function getEbayIndex() {
  if (ebayIndexCache !== undefined) return ebayIndexCache;
  const stored = await storageGet(KEYS.EBAY_INDEX);
  ebayIndexCache = stored[KEYS.EBAY_INDEX] || null;
  return ebayIndexCache;
}

async function saveEbayIndex(index) {
  ebayIndexCache = index || null;
  if (index) await storageSet({ [KEYS.EBAY_INDEX]: index });
  else await storageRemove(KEYS.EBAY_INDEX);
}

function applicableEbayIndex(index, settings) {
  if (!index?.verified) return null;
  const selected = CORE.normalizeText(settings?.computerLabel);
  const indexed = CORE.normalizeText(index.computerLabel);
  if (selected && indexed && selected !== indexed) return null;
  return index;
}

async function getProduct(jobId, asin) {
  const key = productKey(jobId, asin);
  const stored = await storageGet(key);
  return stored[key] || null;
}

async function saveProduct(job, product) {
  const oldProduct = await getProduct(job.id, product.asin);
  const counts = { ...CORE.emptyCounts(), ...(job.counts || {}) };
  if (oldProduct?.status && Object.hasOwn(counts, oldProduct.status)) counts[oldProduct.status] = Math.max(0, counts[oldProduct.status] - 1);
  if (product?.status && Object.hasOwn(counts, product.status)) counts[product.status] += 1;
  await storageSet({ [productKey(job.id, product.asin)]: product });
  job.counts = counts;
  return product;
}

async function getProducts(job) {
  if (!job?.id || !Array.isArray(job.productAsins)) return [];
  const keys = job.productAsins.map((asin) => productKey(job.id, asin));
  const output = [];
  const batchSize = 500;
  for (let index = 0; index < keys.length; index += batchSize) {
    const stored = await storageGet(keys.slice(index, index + batchSize));
    for (const key of keys.slice(index, index + batchSize)) {
      if (stored[key]) output.push(stored[key]);
    }
  }
  return output;
}

async function purgeJobProducts(jobId) {
  if (!jobId) return;
  const all = await storageGet(null);
  const prefix = `${PRODUCT_PREFIX}${jobId}:`;
  const keys = Object.keys(all).filter((key) => key.startsWith(prefix));
  for (let index = 0; index < keys.length; index += 500) {
    await storageRemove(keys.slice(index, index + 500));
  }
}

async function purgeEbayScanPages(scanId) {
  if (!scanId) return;
  const all = await storageGet(null);
  const prefix = `${EBAY_SCAN_PAGE_PREFIX}${scanId}:`;
  const keys = Object.keys(all).filter((key) => key.startsWith(prefix));
  for (let index = 0; index < keys.length; index += 500) {
    await storageRemove(keys.slice(index, index + 500));
  }
}

async function logEvent(level, message, details = {}) {
  const stored = await storageGet(KEYS.LOGS);
  const logs = Array.isArray(stored[KEYS.LOGS]) ? stored[KEYS.LOGS] : [];
  logs.push({ at: new Date().toISOString(), level, message: CORE.normalizeText(message), details });
  await storageSet({ [KEYS.LOGS]: logs.slice(-300) });
}

async function loadRulePack() {
  if (!rulePackPromise) {
    rulePackPromise = fetch(chrome.runtime.getURL('policy-rules.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`Policy rules returned ${response.status}.`);
        return response.json();
      })
      .then((pack) => POLICY.normalizeRulePack(pack))
      .catch((error) => {
        rulePackPromise = null;
        throw error;
      });
  }
  return rulePackPromise;
}

function seedProfileFromRulePack(rulePack) {
  return {
    approvedSeeds: Array.isArray(rulePack?.clearancePolicy?.readyPhrases) ? rulePack.clearancePolicy.readyPhrases : [],
    profileVersion: CORE.normalizeText(rulePack?.clearancePolicy?.version)
  };
}

function requireHuntRulePack(rulePack) {
  const seedProfile = seedProfileFromRulePack(rulePack);
  if (!rulePack?.valid || !Array.isArray(rulePack.rules) || !rulePack.rules.length) {
    throw new Error(`Reviewed policy data is invalid. ${CORE.normalizeText(rulePack?.validationErrors?.[0]) || 'No hunt can start.'}`);
  }
  if (!seedProfile.profileVersion) {
    throw new Error('The reviewed policy profile is missing. No hunt can start.');
  }
  return seedProfile;
}

function searchUrl(keyword, page) {
  const url = new URL('https://www.amazon.com/s');
  url.searchParams.set('k', keyword);
  if (page > 1) {
    url.searchParams.set('page', String(page));
    url.searchParams.set('ref', `sr_pg_${page}`);
  }
  return url.toString();
}

async function safeTabGet(tabId) {
  if (!Number.isInteger(tabId)) return null;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function closeWorker(job) {
  const tabId = job?.workerTabId;
  if (!Number.isInteger(tabId)) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // The tab may already be closed.
  }
}

async function ensureWorkerTab(job) {
  const existing = await safeTabGet(job.workerTabId);
  if (existing && /https:\/\/[^/]*amazon\.com\//i.test(existing.url || '')) return existing;

  const createProperties = { url: 'https://www.amazon.com/', active: false };
  if (Number.isInteger(job.workerWindowId)) createProperties.windowId = job.workerWindowId;
  let tab;
  try {
    tab = await chrome.tabs.create(createProperties);
  } catch {
    delete createProperties.windowId;
    tab = await chrome.tabs.create(createProperties);
  }
  job.workerTabId = tab.id;
  job.workerWindowId = tab.windowId;
  await saveJob(job);
  await logEvent('info', 'Created inactive Amazon worker tab.', { tabId: tab.id, windowId: tab.windowId });
  return tab;
}

async function navigate(job, kind, url, context = {}) {
  const tab = await ensureWorkerTab(job);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  job.pendingNavigation = {
    token,
    kind,
    url,
    asin: CORE.normalizeText(context.asin),
    startedAt: new Date().toISOString(),
    handling: false
  };
  await saveJob(job);
  await chrome.tabs.update(tab.id, { url, active: false });
  await logEvent('info', `Opened Amazon ${kind} page.`, { url, asin: context.asin || '', tabId: tab.id });
}

function scheduleLoadedPage(tabId, delay = 900) {
  if (loadedPageTimer) clearTimeout(loadedPageTimer);
  loadedPageTimer = setTimeout(() => {
    loadedPageTimer = null;
    processLoadedPage(tabId).catch((error) => logEvent('error', error.message || String(error)));
  }, delay);
}

async function sendToWorker(tabId, message, attempts = 6) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 250));
    }
  }
  throw lastError || new Error('Amazon page did not answer.');
}

async function pauseJob(job, reason, error = false) {
  job.status = 'paused';
  job.pauseReason = CORE.normalizeText(reason);
  job.lastError = error ? CORE.normalizeText(reason) : job.lastError;
  job.pendingNavigation = null;
  job.navigationFailures = 0;
  await saveJob(job);
  await logEvent(error ? 'error' : 'warning', `Hunt paused: ${reason}`);
  return job;
}

async function retryPendingNavigation(job, reason) {
  if (!job?.pendingNavigation || !Number.isInteger(job.workerTabId)) {
    return pauseJob(job, reason || 'The pending Amazon page could not be recovered.', true);
  }
  job.navigationFailures = Number(job.navigationFailures || 0) + 1;
  if (job.navigationFailures >= MAX_NAVIGATION_FAILURES) {
    return pauseJob(job, `Amazon page failed ${job.navigationFailures} times: ${reason}`, true);
  }
  job.pendingNavigation.handling = false;
  job.pendingNavigation.startedAt = new Date().toISOString();
  await saveJob(job);
  await logEvent('warning', 'Retrying the same Amazon page.', {
    attempt: job.navigationFailures + 1,
    kind: job.pendingNavigation.kind,
    asin: job.pendingNavigation.asin,
    reason: CORE.normalizeText(reason)
  });
  try {
    await chrome.tabs.reload(job.workerTabId);
  } catch (error) {
    await pauseJob(job, `Amazon worker reload failed: ${error.message || error}`, true);
  }
  return job;
}

async function completeJob(job, reason) {
  job.status = 'complete';
  job.completionReason = CORE.normalizeText(reason);
  job.pendingNavigation = null;
  job.navigationFailures = 0;
  const tabId = job.workerTabId;
  job.workerTabId = null;
  await saveJob(job);
  if (Number.isInteger(tabId)) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // The worker may already be closed.
    }
  }
  await chrome.alarms.clear(TICK_ALARM);
  await logEvent('info', `Hunt complete: ${reason}`, { counts: job.counts });
  return job;
}

async function beginDetailPhase(job) {
  job.phase = 'detail';
  job.detailIndex = 0;
  job.pendingNavigation = null;
  await saveJob(job);
  await logEvent('info', 'Search collection complete. Starting full product checks.', { candidates: job.productAsins.length });
  await advanceDetail(job);
}

async function advanceSearch(job) {
  if (job.keywordIndex >= job.keywords.length) return beginDetailPhase(job);
  if (job.productAsins.length >= job.settings.maxCandidates) return beginDetailPhase(job);
  const poolTarget = Math.min(job.settings.maxCandidates, Math.max(job.settings.desiredReady * 3, job.settings.desiredReady + 50));
  if ((job.counts?.queued || 0) >= poolTarget) return beginDetailPhase(job);
  const keyword = job.keywords[job.keywordIndex];
  await navigate(job, 'search', searchUrl(keyword, job.searchPage));
}

async function advanceDetail(job) {
  if ((job.counts?.ready || 0) >= job.settings.desiredReady) {
    return completeJob(job, `Preflight-candidate target reached with ${job.counts.ready} products.`);
  }

  while (job.detailIndex < job.productAsins.length) {
    const asin = job.productAsins[job.detailIndex];
    const product = await getProduct(job.id, asin);
    job.detailIndex += 1;
    if (product?.status !== CORE.STATUS.QUEUED) continue;
    await saveJob(job);
    await navigate(job, 'detail', CORE.canonicalAmazonUrl(product.url, asin), { asin });
    return;
  }
  return completeJob(job, `All ${job.productAsins.length} unique candidates were checked.`);
}

async function advanceJob(job) {
  if (!job || job.status !== 'running') return;
  let seedProfile;
  try {
    seedProfile = requireHuntRulePack(await loadRulePack());
  } catch (error) {
    return pauseJob(job, `Product Hunter risk-profile gate: ${error.message || error}`, true);
  }
  const riskProfileIssue = CORE.jobRiskProfileIssue(job, seedProfile);
  if (riskProfileIssue) return pauseJob(job, `Product Hunter risk-profile gate: ${riskProfileIssue}`, true);
  if (job.pendingNavigation) return;
  if (job.phase === 'search') return advanceSearch(job);
  return advanceDetail(job);
}

async function handleSearchResult(job, result, rulePack, history) {
  if (result?.robot) return pauseJob(job, result.error || 'Amazon displayed a robot check. Complete it manually, then resume.');
  if (!result?.ok) return pauseJob(job, result?.error || 'Amazon search results could not be read.', true);

  const existing = new Set(job.productAsins);
  let added = 0;
  for (const rawProduct of result.products || []) {
    const product = CORE.normalizeProduct(rawProduct);
    if (!product.asin || existing.has(product.asin)) continue;
    existing.add(product.asin);
    job.productAsins.push(product.asin);
    const ebayIndex = applicableEbayIndex(await getEbayIndex(), job.settings);
    const classified = CORE.classifyProduct(product, rulePack, job.settings, history[product.asin], {
      phase: 'search',
      policyApi: POLICY,
      ebayIndex
    });
    await saveProduct(job, classified);
    added += 1;
    if (job.productAsins.length >= job.settings.maxCandidates) break;
  }

  job.pendingNavigation = null;
  job.navigationFailures = 0;
  const maxPageReached = job.searchPage >= job.settings.maxPagesPerKeyword;
  if (!result.hasNextPage || result.noResults || maxPageReached || job.productAsins.length >= job.settings.maxCandidates) {
    job.keywordIndex += 1;
    job.searchPage = 1;
  } else {
    job.searchPage += 1;
  }
  await saveJob(job);
  await logEvent('info', 'Collected Amazon search page.', {
    keyword: result.keyword,
    page: result.searchPage,
    visible: result.products?.length || 0,
    added,
    totalUnique: job.productAsins.length
  });
  setTimeout(() => advanceJob(job).catch((error) => pauseJob(job, error.message || String(error), true)), job.settings.navigationDelayMs);
}

async function handleDetailResult(job, result, rulePack, history) {
  const requestedAsin = job.pendingNavigation?.asin;
  if (result?.robot) return pauseJob(job, result.error || 'Amazon displayed a robot check. Complete it manually, then resume.');
  const searchProduct = await getProduct(job.id, requestedAsin);
  if (!result?.ok || !result.product) {
    const incomplete = {
      ...(searchProduct || { asin: requestedAsin, url: CORE.canonicalAmazonUrl(requestedAsin, requestedAsin) }),
      status: CORE.STATUS.INCOMPLETE,
      reason: CORE.normalizeText(result?.error || 'Amazon product details could not be read.')
    };
    await saveProduct(job, incomplete);
  } else {
    const detail = CORE.normalizeProduct({
      ...searchProduct,
      ...result.product,
      keyword: searchProduct?.keyword,
      searchPage: searchProduct?.searchPage,
      sponsored: searchProduct?.sponsored,
      rating: result.product.rating || searchProduct?.rating,
      reviewCount: result.product.reviewCount || searchProduct?.reviewCount
    });
    const ebayIndex = applicableEbayIndex(await getEbayIndex(), job.settings);
    const classified = CORE.classifyProduct(detail, rulePack, job.settings, history[detail.asin], {
      phase: 'detail',
      policyApi: POLICY,
      ebayIndex
    });
    await saveProduct(job, classified);
  }

  job.pendingNavigation = null;
  job.navigationFailures = 0;
  await saveJob(job);
  await logEvent('info', 'Checked full Amazon product evidence.', { asin: requestedAsin, counts: job.counts });
  setTimeout(() => advanceJob(job).catch((error) => pauseJob(job, error.message || String(error), true)), job.settings.navigationDelayMs);
}

async function processLoadedPage(tabId) {
  if (processingLoadedPage) return;
  const job = await getJob();
  if (!job || job.status !== 'running' || job.workerTabId !== tabId || !job.pendingNavigation) return;
  if (job.pendingNavigation.handling) return;
  processingLoadedPage = true;
  try {
    const tab = await safeTabGet(tabId);
    if (!tab || tab.status !== 'complete') return;
    job.pendingNavigation.handling = true;
    await saveJob(job);
    const rulePack = await loadRulePack();
    const history = await getHistory();
    if (job.pendingNavigation.kind === 'search') {
      const result = await sendToWorker(tabId, { type: 'hunterExtractSearchPage' });
      await handleSearchResult(job, result, rulePack, history);
    } else {
      const result = await sendToWorker(tabId, { type: 'hunterExtractProductPage' });
      await handleDetailResult(job, result, rulePack, history);
    }
  } catch (error) {
    const current = await getJob();
    if (current?.status === 'running') {
      await retryPendingNavigation(current, error.message || String(error));
    }
  } finally {
    processingLoadedPage = false;
  }
}

function ebayPageUrl(page) {
  const targetPage = Math.max(1, Number(page || 1));
  const url = new URL('https://www.ebay.com/sh/lst/active');
  url.searchParams.set('offset', String((targetPage - 1) * EBAY_PAGE_SIZE));
  url.searchParams.set('limit', String(EBAY_PAGE_SIZE));
  url.searchParams.set('sort', 'scheduledStartDate');
  return url.toString();
}

async function ensureEbayWorkerTab(scan) {
  const existing = await safeTabGet(scan.workerTabId);
  if (existing && /https:\/\/[^/]*ebay\.com\//i.test(existing.url || '')) return existing;
  const createProperties = { url: ebayPageUrl(scan.currentPage || 1), active: false };
  if (Number.isInteger(scan.workerWindowId)) createProperties.windowId = scan.workerWindowId;
  let tab;
  try {
    tab = await chrome.tabs.create(createProperties);
  } catch {
    delete createProperties.windowId;
    tab = await chrome.tabs.create(createProperties);
  }
  scan.workerTabId = tab.id;
  scan.workerWindowId = tab.windowId;
  await saveEbayScan(scan);
  await logEvent('info', 'Created inactive eBay Active Listings worker tab.', { tabId: tab.id, windowId: tab.windowId });
  return tab;
}

async function navigateEbayScan(scan, page, phase = 'listing-scan') {
  const tab = await ensureEbayWorkerTab(scan);
  const targetPage = Math.max(1, Number(page || 1));
  scan.currentPage = targetPage;
  scan.phase = phase;
  scan.pendingNavigation = {
    page: targetPage,
    phase,
    startedAt: new Date().toISOString()
  };
  await saveEbayScan(scan);
  await chrome.tabs.update(tab.id, { url: ebayPageUrl(targetPage), active: false });
}

function scheduleEbayLoadedPage(tabId, delay = EBAY_NAVIGATION_DELAY_MS) {
  if (ebayLoadedPageTimer) clearTimeout(ebayLoadedPageTimer);
  ebayLoadedPageTimer = setTimeout(() => {
    ebayLoadedPageTimer = null;
    processLoadedEbayPage(tabId).catch((error) => logEvent('error', error.message || String(error)));
  }, delay);
}

async function sendToEbayWorker(tabId, message, attempts = 7) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 450 + attempt * 250));
    }
  }
  throw lastError || new Error('eBay Active Listings did not answer.');
}

async function pauseEbayScan(scan, reason, error = false) {
  scan.status = 'paused';
  scan.pauseReason = CORE.normalizeText(reason);
  scan.lastError = error ? CORE.normalizeText(reason) : scan.lastError;
  scan.pendingNavigation = null;
  await saveEbayScan(scan);
  await chrome.alarms.clear(EBAY_SCAN_ALARM);
  await logEvent(error ? 'error' : 'warning', `eBay listing scan paused: ${reason}`);
  return scan;
}

async function retryEbayNavigation(scan, reason) {
  scan.navigationFailures = Number(scan.navigationFailures || 0) + 1;
  if (scan.navigationFailures >= MAX_NAVIGATION_FAILURES) {
    return pauseEbayScan(scan, `eBay page failed ${scan.navigationFailures} times: ${reason}`, true);
  }
  scan.pendingNavigation = {
    page: scan.currentPage,
    phase: scan.phase,
    startedAt: new Date().toISOString()
  };
  await saveEbayScan(scan);
  await logEvent('warning', 'Retrying the same eBay Active Listings page.', {
    page: scan.currentPage,
    attempt: scan.navigationFailures + 1,
    reason: CORE.normalizeText(reason)
  });
  try {
    await chrome.tabs.reload(scan.workerTabId);
  } catch (error) {
    await pauseEbayScan(scan, `eBay worker reload failed: ${error.message || error}`, true);
  }
  return scan;
}

async function collectedEbayScanRecords(scan) {
  const records = [];
  const totalPages = Math.max(0, Number(scan.totalPages || 0));
  const keys = [];
  for (let page = 1; page <= totalPages; page += 1) keys.push(ebayScanPageKey(scan.id, page));
  for (let index = 0; index < keys.length; index += 100) {
    const batchKeys = keys.slice(index, index + 100);
    const stored = await storageGet(batchKeys);
    for (const key of batchKeys) records.push(...(Array.isArray(stored[key]) ? stored[key] : []));
  }
  return records;
}

async function completeEbayScan(scan, finalSnapshot) {
  if (Number(finalSnapshot?.total || 0) !== Number(scan.totalListings || 0)) {
    return pauseEbayScan(scan, 'The Active Listings total changed during final verification. Run the scan again after eBay settles.', true);
  }
  const records = await collectedEbayScanRecords(scan);
  const index = CORE.buildEbayListingIndex(records, {
    verified: true,
    source: 'ebay-active-listings-live',
    computerLabel: scan.computerLabel,
    accountLabel: scan.accountLabel || finalSnapshot.accountLabel,
    totalListings: scan.totalListings,
    scannedAt: new Date().toISOString()
  });
  if (!index.verified) {
    return pauseEbayScan(
      scan,
      `The scan expected ${Number(scan.totalListings || 0).toLocaleString()} unique listings but verified ${index.recordCount.toLocaleString()}. The previous index was preserved.`,
      true
    );
  }
  await saveEbayIndex(index);
  const tabId = scan.workerTabId;
  scan.status = 'complete';
  scan.phase = 'complete';
  scan.workerTabId = null;
  scan.pendingNavigation = null;
  scan.scannedListings = index.recordCount;
  scan.asinCount = index.asinCount;
  scan.titleCount = index.titleCount;
  scan.completedAt = new Date().toISOString();
  scan.pauseReason = '';
  scan.lastError = '';
  await saveEbayScan(scan);
  await chrome.alarms.clear(EBAY_SCAN_ALARM);
  if (Number.isInteger(tabId)) {
    try { await chrome.tabs.remove(tabId); } catch { /* Worker may already be closed. */ }
  }
  await purgeEbayScanPages(scan.id);
  await logEvent('info', 'Verified complete eBay Active Listings index.', {
    listings: index.recordCount,
    asins: index.asinCount,
    titles: index.titleCount,
    accountLabel: index.accountLabel
  });
  return scan;
}

async function processLoadedEbayPage(tabId) {
  if (processingEbayLoadedPage) return;
  processingEbayLoadedPage = true;
  try {
    const scan = await getEbayScan();
    if (!scan || scan.status !== 'running' || scan.workerTabId !== tabId || !scan.pendingNavigation) return;
    const tab = await safeTabGet(tabId);
    if (!tab || tab.status !== 'complete') return;
    const expectedOffset = (Math.max(1, Number(scan.currentPage || 1)) - 1) * EBAY_PAGE_SIZE;
    const result = await sendToEbayWorker(tabId, { type: 'hunterExtractEbayActivePage', expectedOffset });
    if (result?.interruption) {
      await pauseEbayScan(scan, 'eBay displayed its browser check. Complete it in the saved worker tab, then click Resume Scan.', false);
      return;
    }
    if (!result?.ok) {
      await retryEbayNavigation(scan, result?.error || `eBay exposed ${Number(result?.recordCount || 0)} of ${Number(result?.expected || EBAY_PAGE_SIZE)} expected rows.`);
      return;
    }
    scan.navigationFailures = 0;
    scan.accountLabel = scan.accountLabel || CORE.normalizeText(result.accountLabel);

    if (scan.phase === 'verify-total') {
      await completeEbayScan(scan, result);
      return;
    }

    if (!scan.totalListings) {
      scan.totalListings = Number(result.total || 0);
      scan.totalPages = Math.ceil(scan.totalListings / EBAY_PAGE_SIZE);
    }
    if (Number(result.total || 0) !== Number(scan.totalListings || 0)) {
      await pauseEbayScan(scan, 'The Active Listings total changed during the scan. The previous verified index was preserved.', true);
      return;
    }
    await storageSet({ [ebayScanPageKey(scan.id, scan.currentPage)]: result.records || [] });
    scan.scannedListings = Math.min(scan.totalListings, (scan.currentPage - 1) * EBAY_PAGE_SIZE + Number(result.recordCount || 0));
    scan.pendingNavigation = null;
    await saveEbayScan(scan);
    if (scan.currentPage >= scan.totalPages) {
      setTimeout(() => navigateEbayScan(scan, 1, 'verify-total').catch((error) => pauseEbayScan(scan, error.message || String(error), true)), EBAY_NAVIGATION_DELAY_MS);
    } else {
      setTimeout(() => navigateEbayScan(scan, scan.currentPage + 1, 'listing-scan').catch((error) => pauseEbayScan(scan, error.message || String(error), true)), EBAY_NAVIGATION_DELAY_MS);
    }
  } catch (error) {
    const current = await getEbayScan();
    if (current?.status === 'running') await retryEbayNavigation(current, error.message || String(error));
  } finally {
    processingEbayLoadedPage = false;
  }
}

async function startEbayScan(message, sender) {
  const job = await getJob();
  if (job && ['running', 'paused'].includes(job.status)) {
    throw new Error('Pause is not enough for this change. Stop or finish the current hunt, then scan eBay Active Listings before the next hunt.');
  }
  const existing = await getEbayScan();
  if (existing && ['running', 'paused'].includes(existing.status)) {
    throw new Error('An eBay Active Listings scan is already saved. Resume it or stop it before starting another.');
  }
  if (existing?.id) await purgeEbayScanPages(existing.id);
  const stored = await storageGet(KEYS.SETTINGS);
  const computerLabel = CORE.normalizeText(message.computerLabel || stored[KEYS.SETTINGS]?.computerLabel);
  if (!computerLabel || /posh/i.test(computerLabel) || computerLabel === '7') {
    throw new Error('Choose an eBay computer before scanning Active Listings.');
  }
  const scan = {
    schemaVersion: 1,
    id: `ebay-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'running',
    phase: 'listing-scan',
    computerLabel,
    accountLabel: '',
    currentPage: 1,
    totalPages: null,
    totalListings: null,
    scannedListings: 0,
    workerTabId: null,
    workerWindowId: Number.isInteger(sender?.tab?.windowId) ? sender.tab.windowId : null,
    pendingNavigation: null,
    navigationFailures: 0,
    pauseReason: '',
    lastError: '',
    startedAt: new Date().toISOString()
  };
  await saveEbayScan(scan);
  await chrome.alarms.create(EBAY_SCAN_ALARM, { periodInMinutes: 1 });
  await logEvent('info', 'Started complete read-only eBay Active Listings scan.', { computerLabel });
  await navigateEbayScan(scan, 1, 'listing-scan');
  return publicState();
}

async function resumeEbayScan() {
  const scan = await getEbayScan();
  if (!scan || scan.status !== 'paused') throw new Error('No paused eBay Active Listings scan is available.');
  scan.status = 'running';
  scan.pauseReason = '';
  scan.lastError = '';
  scan.pendingNavigation = null;
  await saveEbayScan(scan);
  await chrome.alarms.create(EBAY_SCAN_ALARM, { periodInMinutes: 1 });
  await navigateEbayScan(scan, scan.phase === 'verify-total' ? 1 : scan.currentPage, scan.phase);
  return publicState();
}

async function stopEbayScan() {
  const scan = await getEbayScan();
  if (!scan) return publicState();
  scan.status = 'stopped';
  scan.pendingNavigation = null;
  const tabId = scan.workerTabId;
  scan.workerTabId = null;
  await saveEbayScan(scan);
  await chrome.alarms.clear(EBAY_SCAN_ALARM);
  if (Number.isInteger(tabId)) {
    try { await chrome.tabs.remove(tabId); } catch { /* Worker may already be closed. */ }
  }
  await logEvent('warning', 'Stopped eBay Active Listings scan. The last verified index was preserved.');
  return publicState();
}

async function clearEbayIndex() {
  const scan = await getEbayScan();
  if (scan && ['running', 'paused'].includes(scan.status)) throw new Error('Stop the saved eBay scan before clearing its index.');
  if (scan?.id) await purgeEbayScanPages(scan.id);
  await saveEbayIndex(null);
  await storageRemove(KEYS.EBAY_SCAN);
  await logEvent('warning', 'Cleared the verified eBay Active Listings index.');
  return publicState();
}

async function importEbayCsv(message) {
  const job = await getJob();
  if (job && ['running', 'paused'].includes(job.status)) throw new Error('Finish or stop the current hunt before replacing its eBay listing guard.');
  const parsed = CORE.parseEbayActiveListingsCsv(message.csvText);
  const stored = await storageGet(KEYS.SETTINGS);
  const computerLabel = CORE.normalizeText(message.computerLabel || stored[KEYS.SETTINGS]?.computerLabel);
  if (!computerLabel || /posh/i.test(computerLabel) || computerLabel === '7') throw new Error('Choose an eBay computer before importing its report.');
  const index = CORE.buildEbayListingIndex(parsed.records, {
    verified: true,
    source: `ebay-active-listings-csv:${CORE.normalizeText(message.fileName || 'report.csv')}`,
    computerLabel,
    accountLabel: CORE.normalizeText(message.accountLabel),
    totalListings: parsed.records.length,
    scannedAt: new Date().toISOString()
  });
  if (!index.verified) throw new Error('The imported Active Listings report could not be verified.');
  const scan = await getEbayScan();
  if (scan?.id) await purgeEbayScanPages(scan.id);
  await saveEbayIndex(index);
  await storageSet({
    [KEYS.EBAY_SCAN]: {
      schemaVersion: 1,
      id: `ebay-import-${Date.now()}`,
      status: 'complete',
      phase: 'complete',
      computerLabel,
      accountLabel: index.accountLabel,
      totalListings: index.recordCount,
      scannedListings: index.recordCount,
      asinCount: index.asinCount,
      titleCount: index.titleCount,
      importedFile: CORE.normalizeText(message.fileName),
      skippedRows: parsed.skipped,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  });
  await logEvent('info', 'Imported verified eBay Active Listings CSV index.', { listings: index.recordCount, skipped: parsed.skipped });
  return publicState();
}

function ebayIndexSummary(index) {
  if (!index) return null;
  return {
    verified: Boolean(index.verified),
    source: index.source || '',
    computerLabel: index.computerLabel || '',
    accountLabel: index.accountLabel || '',
    scannedAt: index.scannedAt || '',
    totalListings: Number(index.totalListings || 0),
    recordCount: Number(index.recordCount || 0),
    asinCount: Number(index.asinCount || 0),
    titleCount: Number(index.titleCount || 0)
  };
}

function ebayScanSummary(scan) {
  if (!scan) return null;
  return {
    status: scan.status || '',
    phase: scan.phase || '',
    computerLabel: scan.computerLabel || '',
    accountLabel: scan.accountLabel || '',
    currentPage: Number(scan.currentPage || 0),
    totalPages: Number(scan.totalPages || 0),
    totalListings: Number(scan.totalListings || 0),
    scannedListings: Number(scan.scannedListings || 0),
    asinCount: Number(scan.asinCount || 0),
    titleCount: Number(scan.titleCount || 0),
    pauseReason: scan.pauseReason || '',
    lastError: scan.lastError || '',
    completedAt: scan.completedAt || '',
    updatedAt: scan.updatedAt || ''
  };
}

async function startJob(message, sender) {
  const existing = await getJob();
  if (existing && ['running', 'paused'].includes(existing.status)) {
    throw new Error('A hunt is already active. Resume it or use Stop and Reset before starting another.');
  }
  const seedProfile = requireHuntRulePack(await loadRulePack());
  const keywords = CORE.validateSeedKeywords(message.keywords, seedProfile);
  if (existing?.id) await purgeJobProducts(existing.id);
  const settings = CORE.normalizeSettings(message.settings || {});
  if (settings.excludeAlreadyListed) {
    const index = applicableEbayIndex(await getEbayIndex(), settings);
    if (!index) {
      throw new Error('Scan or import this computer\'s complete eBay Active Listings before starting the hunt, or explicitly turn off the already-listed guard.');
    }
  }
  const job = CORE.createJob({
    keywords,
    seedProfile,
    settings,
    workerWindowId: sender?.tab?.windowId
  });
  await storageSet({
    [KEYS.JOB]: job,
    [KEYS.SETTINGS]: settings,
    [KEYS.LOGS]: []
  });
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await logEvent('info', 'Started product hunt.', { keywords: job.keywords.length, settings });
  await advanceJob(job);
  return publicState();
}

async function resumeJob() {
  const job = await getJob();
  if (!job) throw new Error('No saved hunt is available to resume.');
  if (job.status === 'complete') throw new Error('This hunt is already complete. Start a new hunt when ready.');
  if (job.status === 'stopped') throw new Error('This hunt was stopped. Reset it before starting another.');
  const seedProfile = requireHuntRulePack(await loadRulePack());
  const riskProfileIssue = CORE.jobRiskProfileIssue(job, seedProfile);
  if (riskProfileIssue) throw new Error(`This saved hunt cannot resume: ${riskProfileIssue}`);
  job.status = 'running';
  job.pauseReason = '';
  job.lastError = '';
  job.pendingNavigation = null;
  await saveJob(job);
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await logEvent('info', 'Resumed saved hunt.');
  await advanceJob(job);
  return publicState();
}

async function stopJob() {
  const job = await getJob();
  if (!job) return publicState();
  job.status = 'stopped';
  job.pendingNavigation = null;
  const tabId = job.workerTabId;
  job.workerTabId = null;
  await saveJob(job);
  if (Number.isInteger(tabId)) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // The worker may already be closed.
    }
  }
  await chrome.alarms.clear(TICK_ALARM);
  await logEvent('warning', 'Stopped product hunt safely.');
  return publicState();
}

async function resetJob() {
  const job = await getJob();
  if (job) {
    await closeWorker(job);
    await purgeJobProducts(job.id);
  }
  await storageRemove(KEYS.JOB);
  await chrome.alarms.clear(TICK_ALARM);
  await logEvent('info', 'Reset product hunt.');
  return publicState();
}

async function publicState() {
  const stored = await storageGet([KEYS.JOB, KEYS.SETTINGS, KEYS.LOGS, KEYS.HISTORY, KEYS.EBAY_SCAN, KEYS.EBAY_INDEX]);
  const job = stored[KEYS.JOB] || null;
  let rulePack;
  try {
    rulePack = await loadRulePack();
  } catch {
    rulePack = { ruleCount: 0, generatedAt: '' };
  }
  return {
    ok: true,
    version: VERSION,
    job,
    settings: stored[KEYS.SETTINGS] || CORE.DEFAULT_SETTINGS,
    historyCount: Object.keys(stored[KEYS.HISTORY] || {}).length,
    ebayScan: ebayScanSummary(stored[KEYS.EBAY_SCAN]),
    ebayIndex: ebayIndexSummary(stored[KEYS.EBAY_INDEX]),
    logs: Array.isArray(stored[KEYS.LOGS]) ? stored[KEYS.LOGS].slice(-80) : [],
    policy: { ruleCount: Number(rulePack.ruleCount || rulePack.rules?.length || 0), generatedAt: rulePack.generatedAt || '' },
    riskProfile: {
      ...CORE.riskProfileSummary(),
      valid: Boolean(rulePack.valid),
      profileVersion: CORE.normalizeText(rulePack?.clearancePolicy?.version) || 'unavailable',
      approvedSeedCount: Number(rulePack?.clearancePolicy?.readyPhrases?.length || 0)
    }
  };
}

async function readyPayload() {
  const job = await getJob();
  if (!job) return { ok: true, bundles: [], asins: [] };
  const products = await getProducts(job);
  const ready = products.filter((product) => product.status === CORE.STATUS.READY);
  const rulePack = await loadRulePack();
  const policyVersion = CORE.normalizeText(rulePack?.clearancePolicy?.version);
  const bundles = ready.map((product) => POLICY.buildProductHunterEvidenceBundle(product, policyVersion));
  return { ok: true, bundles, asins: ready.map((product) => product.asin) };
}

async function commitReadyHistory(asins) {
  const job = await getJob();
  if (!job) throw new Error('No hunt is loaded.');
  const requested = new Set((asins || []).map((asin) => CORE.extractAsin(asin)).filter(Boolean));
  const products = (await getProducts(job)).filter((product) => product.status === CORE.STATUS.READY && requested.has(product.asin));
  const oldHistory = await getHistory();
  const history = CORE.pruneHistory(CORE.markHistory(oldHistory, products, {
    jobId: job.id,
    computerLabel: job.settings.computerLabel
  }));
  await storageSet({ [KEYS.HISTORY]: history });
  await logEvent('info', 'Committed copied Preflight candidates to duplicate history.', { count: products.length });
  return { ok: true, count: products.length, historyCount: Object.keys(history).length };
}

async function openDashboard(active = true) {
  const url = chrome.runtime.getURL('dashboard.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs[0]?.id) {
    const tab = await chrome.tabs.update(tabs[0].id, { active });
    if (active && Number.isInteger(tab.windowId)) await chrome.windows.update(tab.windowId, { focused: true });
    return tab;
  }
  return chrome.tabs.create({ url, active });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    switch (message?.type) {
      case 'hunterGetState': return publicState();
      case 'hunterGetProducts': {
        const job = await getJob();
        return { ok: true, products: job ? await getProducts(job) : [] };
      }
      case 'hunterStart': return startJob(message, sender);
      case 'hunterEbayScanStart': return startEbayScan(message, sender);
      case 'hunterEbayScanResume': return resumeEbayScan();
      case 'hunterEbayScanStop': return stopEbayScan();
      case 'hunterEbayIndexClear': return clearEbayIndex();
      case 'hunterEbayCsvImport': return importEbayCsv(message);
      case 'hunterPause': {
        const job = await getJob();
        if (job?.status === 'running') await pauseJob(job, 'Paused by the operator.');
        return publicState();
      }
      case 'hunterResume': return resumeJob();
      case 'hunterStop': return stopJob();
      case 'hunterReset': return resetJob();
      case 'hunterReadyPayload': return readyPayload();
      case 'hunterCommitReadyHistory': return commitReadyHistory(message.asins || []);
      case 'hunterOpenDashboard': return { ok: true, tab: await openDashboard(true) };
      case 'hunterOpenWorker': {
        const job = await getJob();
        const tab = await safeTabGet(job?.workerTabId);
        if (!tab) throw new Error('No Amazon worker tab is currently open.');
        const focused = await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(focused.windowId, { focused: true });
        return { ok: true };
      }
      case 'hunterOpenEbayWorker': {
        const scan = await getEbayScan();
        const tab = await safeTabGet(scan?.workerTabId);
        if (!tab) throw new Error('No eBay Active Listings worker tab is currently open.');
        const focused = await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(focused.windowId, { focused: true });
        return { ok: true };
      }
      default: return { ok: false, error: 'Unknown Product Hunter request.' };
    }
  };
  run().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  getJob().then((job) => {
    if (job?.status === 'running' && job.workerTabId === tabId) scheduleLoadedPage(tabId);
  }).catch(() => {});
  getEbayScan().then((scan) => {
    if (scan?.status === 'running' && scan.workerTabId === tabId) scheduleEbayLoadedPage(tabId);
  }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getJob().then(async (job) => {
    if (!job || job.workerTabId !== tabId) return;
    job.workerTabId = null;
    if (job.status === 'running') await pauseJob(job, 'The Amazon worker tab was closed. Resume to recreate it.');
    else await saveJob(job);
  }).catch(() => {});
  getEbayScan().then(async (scan) => {
    if (!scan || scan.workerTabId !== tabId) return;
    scan.workerTabId = null;
    if (scan.status === 'running') await pauseEbayScan(scan, 'The eBay Active Listings worker tab was closed. Resume to recreate it.');
    else await saveEbayScan(scan);
  }).catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    getJob().then(async (job) => {
      if (!job || job.status !== 'running') return;
      if (!job.pendingNavigation) return advanceJob(job);
      const started = Date.parse(job.pendingNavigation.startedAt || '');
      if (Number.isFinite(started) && Date.now() - started > 90000) {
        return retryPendingNavigation(job, 'Amazon did not finish loading within 90 seconds.');
      }
    }).catch((error) => logEvent('error', error.message || String(error)));
  }
  if (alarm.name === EBAY_SCAN_ALARM) {
    getEbayScan().then(async (scan) => {
      if (!scan || scan.status !== 'running') return;
      if (!scan.pendingNavigation) return navigateEbayScan(scan, scan.phase === 'verify-total' ? 1 : scan.currentPage, scan.phase);
      const started = Date.parse(scan.pendingNavigation.startedAt || '');
      if (Number.isFinite(started) && Date.now() - started > 90000) {
        return retryEbayNavigation(scan, 'eBay did not finish loading within 90 seconds.');
      }
    }).catch((error) => logEvent('error', error.message || String(error)));
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') openDashboard(true).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  getJob().then(async (job) => {
    if (job?.status !== 'running') return;
    job.pendingNavigation = null;
    await saveJob(job);
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
    await advanceJob(job);
  }).catch((error) => logEvent('error', error.message || String(error)));
  getEbayScan().then(async (scan) => {
    if (scan?.status !== 'running') return;
    scan.pendingNavigation = null;
    scan.workerTabId = null;
    await saveEbayScan(scan);
    await chrome.alarms.create(EBAY_SCAN_ALARM, { periodInMinutes: 1 });
    await navigateEbayScan(scan, scan.phase === 'verify-total' ? 1 : scan.currentPage, scan.phase);
  }).catch((error) => logEvent('error', error.message || String(error)));
});
