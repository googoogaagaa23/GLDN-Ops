(async function () {
  'use strict';
  const core = globalThis.GLDN_LISTING_PREFLIGHT;
  const byId = (id) => document.getElementById(id);
  let rulePack = { schemaVersion: 1, rules: [] };
  let latestResults = [];
  let copyMode = 'original-input';
  let targetPage = 'productHunter';
  let targetLabel = 'Product Hunter';
  const currentTabIdPromise = new Promise((resolve) => {
    chrome.tabs.getCurrent((tab) => resolve(Number(tab?.id || 0)));
  });

  try {
    const response = await fetch(chrome.runtime.getURL('listing-preflight-rules.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Rule file returned ${response.status}.`);
    rulePack = core.normalizeRulePack(await response.json());
    byId('ruleStatus').textContent = rulePack.ruleCount
      ? `${rulePack.ruleCount.toLocaleString()} reviewed rules loaded${rulePack.generatedAt ? ` | updated ${formatDate(rulePack.generatedAt)}` : ''}`
      : 'No reviewed rules are published yet. Every item will stay in Needs review.';
  } catch (error) {
    byId('ruleStatus').textContent = `Reviewed rules could not be loaded: ${error.message}`;
  }

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

  await loadPendingHandoff();

  function runCheck() {
    const rows = core.parseInputRows(byId('itemInput').value);
    latestResults = core.evaluateRows(rows, rulePack);
    renderResults(latestResults);
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
      cell.colSpan = 5;
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
    addCell(row, result.input);
    addCell(row, result.asins.join(', ') || 'Not detected');
    addCell(row, result.reason);
    const links = document.createElement('div');
    links.className = 'source-links';
    const sources = uniqueSources(result.matches);
    if (!sources.length) links.textContent = 'No matched source';
    sources.forEach((source) => {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = source.label;
      links.appendChild(link);
    });
    addCell(row, links);
    return row;
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
    if (!pending?.input) return;
    if (pending.source === 'bulk-poster-clipboard') {
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
    byId('copyStatus').textContent = `Loaded ${sourceCount.toLocaleString()} ${sourceLabel}${sourceCount === 1 ? '' : 's'} from the clipboard handoff.${rejectedCount ? ` Ignored ${rejectedCount.toLocaleString()} non-Amazon row${rejectedCount === 1 ? '' : 's'}.` : ''} Only Ready items can continue.`;
  }

  function uniqueSources(matches) {
    const seen = new Set();
    const counts = new Map();
    const sources = [];
    for (const rule of matches || []) {
      const baseLabel = rule.sourceType === 'official-ebay'
        ? 'Official eBay policy'
        : rule.sourceType === 'profile2-discord'
          ? 'Discord report'
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
