(async function () {
  'use strict';
  const core = globalThis.GLDN_LISTING_PREFLIGHT;
  const byId = (id) => document.getElementById(id);
  let rulePack = { schemaVersion: 2, rules: [] };
  let latestResults = [];
  let copyMode = 'amazon-links';
  let targetPage = 'bulkPoster';
  let targetLabel = 'Bulk Poster';
  let scanRunning = false;
  let pauseRequested = false;
  let workerTabId = 0;
  const PRODUCT_CACHE_KEY = 'gldnListingPolicyProductCacheV1';
  const LAST_INPUT_KEY = 'gldnListingPolicyLastInputV1';
  const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const currentTabIdPromise = new Promise((resolve) => {
    chrome.tabs.getCurrent((tab) => resolve(Number(tab?.id || 0)));
  });

  await loadRulePack();

  byId('runCheck').addEventListener('click', runCheck);
  byId('clearInput').addEventListener('click', () => {
    byId('itemInput').value = '';
    latestResults = [];
    byId('copyStatus').textContent = '';
    renderResults([]);
  });
  byId('copyReady').addEventListener('click', copyReadyLinks);
  byId('copyAndOpenProductHunter').addEventListener('click', copyAndOpenProductHunter);
  byId('downloadReady').addEventListener('click', downloadReadyLinks);
  byId('downloadResults').addEventListener('click', downloadResults);
  byId('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    byId('itemInput').value = await file.text();
    event.target.value = '';
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'gldnListingPreflightDiagnostic' || sender?.id !== chrome.runtime.id) return false;
    (async () => {
      const currentTabId = await currentTabIdPromise;
      if (!currentTabId || currentTabId !== Number(message.targetTabId || 0)) return;
      if (message.action === 'handoff') await copyAndOpenProductHunter();
      sendResponse({
        ok: true,
        token: String(message.token || ''),
        tabId: currentTabId,
        ui: visibleDiagnosticState()
      });
    })().catch((error) => {
      sendResponse({ ok: false, token: String(message.token || ''), error: error.message || String(error) });
    });
    return true;
  });

  const handoffLoaded = await loadPendingHandoff();
  if (!handoffLoaded) {
    const saved = await storageGetLocal([LAST_INPUT_KEY]);
    if (saved[LAST_INPUT_KEY]) {
      byId('itemInput').value = String(saved[LAST_INPUT_KEY]);
      byId('copyStatus').textContent = 'Restored your last pasted list. Click Check Items to continue or replace it with a new list.';
    }
  }

  async function loadRulePack() {
    try {
      const response = await fetch(chrome.runtime.getURL('listing-preflight-rules.json'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Rule file returned ${response.status}.`);
      rulePack = core.normalizeRulePack(await response.json());
      byId('ruleStatus').textContent = rulePack.valid
        ? `${rulePack.ruleCount.toLocaleString()} forbidden and restricted item rules loaded${rulePack.generatedAt ? ` | updated ${formatDate(rulePack.generatedAt)}` : ''}`
        : `Policy data failed closed: ${rulePack.validationErrors.join(' ') || 'No valid reviewed rules are published.'} Every item stays in Needs review.`;
    } catch (error) {
      byId('ruleStatus').textContent = `Reviewed rules could not be loaded: ${error.message}`;
    }
  }

  async function runCheck() {
    if (scanRunning) {
      pauseRequested = true;
      byId('copyStatus').textContent = 'Pausing safely after the current Amazon product...';
      return;
    }
    const input = byId('itemInput').value;
    let rows = core.parseInputRows(input);
    await storageSetLocal({ [LAST_INPUT_KEY]: input });
    const linksToRead = rows.filter((row) => row.amazonUrls?.length && row.sourceKind !== 'product-hunter-bundle').length;
    if (linksToRead) {
      scanRunning = true;
      pauseRequested = false;
      byId('runCheck').textContent = 'Pause Safely';
      byId('copyReady').disabled = true;
      byId('copyAndOpenProductHunter').disabled = true;
      byId('downloadReady').disabled = true;
      try {
        rows = await readAmazonProductRows(rows, linksToRead);
      } finally {
        scanRunning = false;
        byId('runCheck').textContent = 'Check Items';
      }
    }
    latestResults = core.evaluateRows(rows, rulePack);
    renderResults(latestResults);
    if (!pauseRequested && latestResults.length) {
      const summary = core.summarizeResults(latestResults);
      byId('copyStatus').textContent = `Finished ${latestResults.length.toLocaleString()} item${latestResults.length === 1 ? '' : 's'}: ${summary.clear.toLocaleString()} ready, ${summary.review.toLocaleString()} need review, ${summary.block.toLocaleString()} blocked.`;
    }
  }

  async function readAmazonProductRows(rows, total) {
    const stored = await storageGetLocal([PRODUCT_CACHE_KEY]);
    const cache = stored[PRODUCT_CACHE_KEY] && typeof stored[PRODUCT_CACHE_KEY] === 'object'
      ? stored[PRODUCT_CACHE_KEY]
      : {};
    let completed = 0;
    let robotStopped = false;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const url = row.amazonUrls?.[0];
      if (!url || row.sourceKind === 'product-hunter-bundle') continue;
      if (pauseRequested) break;
      completed += 1;
      byId('copyStatus').textContent = `Reading Amazon product ${completed.toLocaleString()} of ${total.toLocaleString()} in one inactive tab...`;
      const cacheKey = String(row.asins?.[0] || url).toUpperCase();
      const cached = cache[cacheKey];
      if (cached?.capturedAt && Date.now() - Date.parse(cached.capturedAt) <= CACHE_MAX_AGE_MS && cached.product?.title) {
        rows[index] = mergeScannedProduct(row, cached.product);
        continue;
      }
      const result = await inspectAmazonProduct(url);
      if (result?.ok && result.product) {
        rows[index] = mergeScannedProduct(row, result.product);
        cache[cacheKey] = { capturedAt: new Date().toISOString(), product: result.product };
        if (completed % 10 === 0) await storageSetLocal({ [PRODUCT_CACHE_KEY]: trimProductCache(cache) });
      } else {
        rows[index] = { ...row, sourceKind: 'amazon-product-scan-failed', hasProductEvidence: false, scanError: result?.error || 'Amazon product details were unavailable.' };
        if (result?.robot) {
          robotStopped = true;
          pauseRequested = true;
          byId('copyStatus').textContent = `Paused at ${completed.toLocaleString()} of ${total.toLocaleString()}. Amazon needs its visible robot check completed in the inactive worker tab, then click Check Items again.`;
          break;
        }
      }
      await wait(900);
    }
    await storageSetLocal({ [PRODUCT_CACHE_KEY]: trimProductCache(cache) });
    if (!robotStopped) await closeWorkerTab();
    if (pauseRequested && !robotStopped) {
      byId('copyStatus').textContent = `Paused safely after ${completed.toLocaleString()} of ${total.toLocaleString()} Amazon products. Click Check Items to resume; completed products are cached.`;
    }
    return rows;
  }

  function mergeScannedProduct(row, product) {
    return {
      ...row,
      title: core.normalizeText(product.title) || row.title,
      brand: core.normalizeText(product.brand) || row.brand,
      category: core.normalizeText(product.category) || row.category,
      bullets: core.normalizeText(product.bullets) || row.bullets,
      details: core.normalizeText(product.details) || row.details,
      imageText: core.normalizeText(product.imageText) || row.imageText,
      asins: product.asin ? [String(product.asin).toUpperCase()] : row.asins,
      sourceKind: 'amazon-product-scan',
      hasProductEvidence: Boolean(product.title),
      scanError: ''
    };
  }

  async function inspectAmazonProduct(url) {
    try {
      if (workerTabId) {
        try {
          await chrome.tabs.update(workerTabId, { url, active: false });
        } catch {
          workerTabId = 0;
        }
      }
      if (!workerTabId) {
        const tab = await chrome.tabs.create({ url, active: false });
        workerTabId = Number(tab?.id || 0);
      }
      if (!workerTabId) return { ok: false, error: 'The inactive Amazon worker tab could not be created.' };
      await waitForTabComplete(workerTabId, 45000);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const response = await chrome.tabs.sendMessage(workerTabId, { type: 'collectListingPolicyProduct' });
          if (response) return response;
        } catch {
          await wait(500);
        }
      }
      return { ok: false, error: 'GLDN could not read the loaded Amazon product page.' };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  async function waitForTabComplete(tabId, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.status === 'complete') {
        await wait(700);
        return;
      }
      await wait(250);
    }
    throw new Error('Amazon product loading timed out.');
  }

  async function closeWorkerTab() {
    if (!workerTabId) return;
    const tabId = workerTabId;
    workerTabId = 0;
    try { await chrome.tabs.remove(tabId); } catch {}
  }

  function trimProductCache(cache) {
    const entries = Object.entries(cache)
      .filter(([, value]) => value?.capturedAt && Date.now() - Date.parse(value.capturedAt) <= CACHE_MAX_AGE_MS)
      .sort((left, right) => Date.parse(right[1].capturedAt) - Date.parse(left[1].capturedAt))
      .slice(0, 10000);
    return Object.fromEntries(entries);
  }

  function storageGetLocal(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSetLocal(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function renderResults(results) {
    const summary = core.summarizeResults(results);
    byId('countTotal').textContent = summary.total.toLocaleString();
    byId('countClear').textContent = summary.clear.toLocaleString();
    byId('countReview').textContent = summary.review.toLocaleString();
    byId('countBlock').textContent = summary.block.toLocaleString();
    byId('copyReady').disabled = !summary.clear;
    byId('copyAndOpenProductHunter').disabled = !summary.clear;
    byId('downloadReady').disabled = !summary.clear;
    byId('downloadResults').disabled = !results.length;
    byId('resultNote').textContent = results.length
      ? `${summary.clear} ready to copy, ${summary.review} need review, ${summary.block} blocked.`
      : 'Nothing checked yet.';
    const body = byId('resultsBody');
    body.replaceChildren();
    if (!results.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'empty';
      cell.textContent = 'Paste items above, then run the check.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    for (const result of results) body.appendChild(renderRow(result));
  }

  function visibleDiagnosticState() {
    return {
      ruleStatus: String(byId('ruleStatus')?.textContent || '').trim(),
      total: Number(byId('countTotal')?.textContent || 0),
      clear: Number(byId('countClear')?.textContent || 0),
      review: Number(byId('countReview')?.textContent || 0),
      block: Number(byId('countBlock')?.textContent || 0),
      note: String(byId('resultNote')?.textContent || '').trim(),
      copyStatus: String(byId('copyStatus')?.textContent || '').trim(),
      handoffLabel: String(byId('copyAndOpenProductHunter')?.textContent || '').trim(),
      handoffEnabled: byId('copyAndOpenProductHunter')?.disabled === false,
      statuses: [...document.querySelectorAll('#resultsBody .status')].map((node) => String(node.textContent || '').trim())
    };
  }

  function renderRow(result) {
    const row = document.createElement('tr');
    const status = document.createElement('span');
    status.className = `status ${result.action}`;
    status.textContent = result.status === 'CLEAR' ? 'READY' : result.status;
    addCell(row, status);
    addCell(row, productCell(result));
    addCell(row, result.asins.join(', ') || 'Not detected');
    addCell(row, result.reason);
    return row;
  }

  function productCell(result) {
    const container = document.createElement('div');
    container.className = 'product-cell';
    const title = document.createElement('strong');
    title.textContent = result.title || (result.sourceKind === 'product-hunter-bundle' ? 'Product Hunter evidence bundle' : result.input);
    container.appendChild(title);
    const url = result.amazonUrls?.[0];
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Open exact Amazon product';
      container.appendChild(link);
    }
    return container;
  }

  function addCell(row, value) {
    const cell = document.createElement('td');
    if (value instanceof Node) cell.appendChild(value);
    else cell.textContent = String(value || '');
    row.appendChild(cell);
  }

  function downloadResults() {
    if (!latestResults.length) return;
    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest().version,
      rulePackGeneratedAt: rulePack.generatedAt || '',
      summary: core.summarizeResults(latestResults),
      results: latestResults
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gldn-listing-preflight-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function readyPayload() {
    return copyMode === 'amazon-links'
      ? core.copyAmazonLinkPayload(latestResults, 'clear')
      : core.copyPayload(latestResults, 'clear');
  }

  async function copyReadyLinks() {
    const payload = readyPayload();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      const count = core.resultsForAction(latestResults, 'clear').length;
      byId('copyStatus').textContent = `Copied ${count.toLocaleString()} ready link${count === 1 ? '' : 's'}. Review and Block items were excluded.`;
    } catch (error) {
      byId('copyStatus').textContent = `Copy failed: ${error.message}`;
    }
  }

  async function copyAndOpenProductHunter() {
    const payload = readyPayload();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      const count = core.resultsForAction(latestResults, 'clear').length;
      const response = await chrome.runtime.sendMessage({ type: 'openEcomSniperPage', page: targetPage });
      if (!response?.ok) throw new Error(response?.error || `${targetLabel} could not open.`);
      byId('copyStatus').textContent = `Copied ${count.toLocaleString()} ready item${count === 1 ? '' : 's'} and opened ${targetLabel}. Review and Block items were excluded.`;
    } catch (error) {
      byId('copyStatus').textContent = `${targetLabel} handoff failed: ${error.message}`;
    }
  }

  async function loadPendingHandoff() {
    const stored = await new Promise((resolve) => chrome.storage.local.get(['pendingListingPreflightInput'], resolve));
    const pending = stored?.pendingListingPreflightInput;
    if (!pending?.input) return false;
    if (pending.source === 'product-hunter-clipboard' || pending.source === 'bulk-poster-clipboard') {
      copyMode = 'amazon-links';
      targetPage = 'bulkPoster';
      targetLabel = 'Bulk Poster';
      byId('copyAndOpenProductHunter').textContent = 'Copy Ready & Open Bulk Poster';
    }
    byId('itemInput').value = String(pending.input);
    await new Promise((resolve) => chrome.storage.local.remove(['pendingListingPreflightInput'], resolve));
    runCheck();
    const sourceCount = Number(pending.candidateCount || pending.originalCount || latestResults.length);
    const rejectedCount = Number(pending.rejectedCount || 0);
    const sourceLabel = pending.source === 'bulk-poster-clipboard' ? 'Bulk Poster link' : 'Product Hunter candidate';
    byId('copyStatus').textContent = `Loaded ${sourceCount.toLocaleString()} ${sourceLabel}${sourceCount === 1 ? '' : 's'} from the optional clipboard handoff.${rejectedCount ? ` Ignored ${rejectedCount.toLocaleString()} non-Amazon row${rejectedCount === 1 ? '' : 's'}.` : ''} You can also paste directly at any time. Only Ready items can continue.`;
    return true;
  }

  function uniqueSources(matches) {
    const seen = new Set();
    const counts = new Map();
    const sources = [];
    for (const rule of matches || []) {
      const baseLabel = rule.sourceType === 'official-ebay'
        ? 'Official eBay policy'
        : rule.sourceType === 'gldn-operator'
          ? 'GLDN no-list rule'
          : rule.sourceType === 'profile2-discord'
            ? 'Discord report'
            : rule.sourceType === 'profile2-telegram'
              ? 'Telegram report'
              : 'Reviewed source';
      for (const url of rule.evidenceUrls || []) {
        if (seen.has(url)) continue;
        seen.add(url);
        const next = (counts.get(baseLabel) || 0) + 1;
        counts.set(baseLabel, next);
        sources.push({ url, label: `${baseLabel} ${next}` });
      }
    }
    return sources;
  }

  function downloadReadyLinks() {
    const payload = readyPayload();
    if (!payload) return;
    downloadText(`${payload}\n`, `gldn-ready-links-${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
  }

  function downloadText(contents, filename, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
  }
})();
