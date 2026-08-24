(async function () {
  'use strict';
  const core = globalThis.GLDN_LISTING_PREFLIGHT;
  const byId = (id) => document.getElementById(id);
  let rulePack = { schemaVersion: 1, rules: [] };
  let researchOutput = { schemaVersion: 1, sourceCoverage: [], searchSeeds: [], workflow: [], avoidCategories: [] };
  let latestResults = [];
  let copyMode = 'amazon-links';
  let targetPage = 'bulkPoster';
  let targetLabel = 'Bulk Poster';
  const currentTabIdPromise = new Promise((resolve) => {
    chrome.tabs.getCurrent((tab) => resolve(Number(tab?.id || 0)));
  });

  await Promise.all([loadRulePack(), loadResearchOutput()]);

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
  byId('selectAllResearch').addEventListener('click', () => setResearchSelection(true));
  byId('clearResearch').addEventListener('click', () => setResearchSelection(false));
  byId('copyResearchWords').addEventListener('click', copyResearchWords);
  byId('copyAndOpenResearchWords').addEventListener('click', copyResearchWordsAndOpen);
  byId('downloadResearchOutput').addEventListener('click', downloadResearchOutput);
  byId('continueToPreflight').addEventListener('click', () => {
    byId('inputHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    byId('itemInput').focus();
  });
  byId('researchWords').addEventListener('change', updateResearchActionState);
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

  async function loadRulePack() {
    try {
      const response = await fetch(chrome.runtime.getURL('listing-preflight-rules.json'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Rule file returned ${response.status}.`);
      rulePack = core.normalizeRulePack(await response.json());
      const counts = countRulesBySource(rulePack.rules);
      byId('ruleStatus').textContent = rulePack.ruleCount
        ? `${rulePack.ruleCount.toLocaleString()} rules | ${counts.official.toLocaleString()} official | ${counts.discord.toLocaleString()} Discord | ${counts.telegram.toLocaleString()} Telegram${rulePack.generatedAt ? ` | ${formatDate(rulePack.generatedAt)}` : ''}`
        : 'No reviewed rules are published yet. Every item will stay in Needs review.';
    } catch (error) {
      byId('ruleStatus').textContent = `Reviewed rules could not be loaded: ${error.message}`;
    }
  }

  async function loadResearchOutput() {
    try {
      const response = await fetch(chrome.runtime.getURL('product-research-output.json'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Research output returned ${response.status}.`);
      const payload = await response.json();
      if (Number(payload?.schemaVersion) !== 1 || !Array.isArray(payload?.searchSeeds)) {
        throw new Error('Research output has an unsupported format.');
      }
      researchOutput = payload;
      renderResearchOutput();
      byId('researchStatus').textContent = `${researchOutput.searchSeeds.length.toLocaleString()} starting words | updated ${formatDate(researchOutput.generatedAt)}`;
      byId('downloadResearchOutput').disabled = false;
    } catch (error) {
      byId('researchStatus').textContent = `Research output could not be loaded: ${error.message}`;
      byId('researchWords').textContent = 'No research words are available.';
    }
  }

  function renderResearchOutput() {
    const coverage = byId('sourceCoverage');
    coverage.replaceChildren();
    for (const source of researchOutput.sourceCoverage || []) {
      const card = document.createElement('article');
      card.className = 'source-card';
      const title = document.createElement('h3');
      title.textContent = source.label;
      const state = document.createElement('span');
      state.className = `source-state ${source.status}`;
      state.textContent = source.status === 'reviewed-no-actionable-rule' ? 'Reviewed, no product rule' : 'Active';
      const note = document.createElement('p');
      note.textContent = source.note;
      const counts = document.createElement('div');
      counts.className = 'source-counts';
      counts.appendChild(metric(source.reviewedSignals, 'Signals reviewed'));
      counts.appendChild(metric(source.publishedRules, 'Rules published'));
      const links = document.createElement('div');
      links.className = 'source-links';
      for (const [index, url] of (source.links || []).entries()) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = `Open source ${index + 1}`;
        links.appendChild(link);
      }
      card.append(title, state, note, counts, links);
      coverage.appendChild(card);
    }

    const flow = byId('researchFlow');
    flow.replaceChildren();
    for (const item of researchOutput.workflow || []) {
      const step = document.createElement('div');
      step.className = 'flow-step';
      const number = document.createElement('span');
      number.className = 'number';
      number.textContent = item.step;
      const title = document.createElement('strong');
      title.textContent = item.title;
      const instruction = document.createElement('p');
      instruction.textContent = item.instruction;
      step.append(number, title, instruction);
      flow.appendChild(step);
    }

    const words = byId('researchWords');
    words.replaceChildren();
    for (const seed of researchOutput.searchSeeds || []) {
      const label = document.createElement('label');
      label.className = 'research-word';
      label.title = seed.reason || '';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'researchSeed';
      checkbox.value = seed.term;
      checkbox.checked = true;
      const text = document.createElement('span');
      text.textContent = seed.term;
      label.append(checkbox, text);
      words.appendChild(label);
    }

    const avoid = byId('avoidCategories');
    avoid.replaceChildren();
    for (const category of researchOutput.avoidCategories || []) {
      const item = document.createElement('li');
      item.textContent = category;
      avoid.appendChild(item);
    }
    updateResearchActionState();
  }

  function metric(value, label) {
    const wrap = document.createElement('div');
    const count = document.createElement('strong');
    count.textContent = Number(value || 0).toLocaleString();
    const text = document.createElement('span');
    text.textContent = label;
    wrap.append(count, text);
    return wrap;
  }

  function selectedResearchTerms() {
    return [...document.querySelectorAll('input[name="researchSeed"]:checked')]
      .map((input) => String(input.value || '').trim())
      .filter(Boolean);
  }

  function setResearchSelection(checked) {
    for (const input of document.querySelectorAll('input[name="researchSeed"]')) input.checked = checked;
    updateResearchActionState();
  }

  function updateResearchActionState() {
    const selected = selectedResearchTerms().length;
    byId('copyResearchWords').disabled = !selected;
    byId('copyAndOpenResearchWords').disabled = !selected;
    byId('researchCopyStatus').textContent = selected
      ? `${selected.toLocaleString()} word${selected === 1 ? '' : 's'} selected.`
      : 'Select at least one starting word.';
  }

  async function copyResearchWords() {
    const terms = selectedResearchTerms();
    if (!terms.length) return;
    try {
      await navigator.clipboard.writeText(terms.join('\n'));
      byId('researchCopyStatus').textContent = `Copied ${terms.length.toLocaleString()} Product Hunter word${terms.length === 1 ? '' : 's'}, one per line.`;
    } catch (error) {
      byId('researchCopyStatus').textContent = `Copy failed: ${error.message}`;
    }
  }

  async function copyResearchWordsAndOpen() {
    const terms = selectedResearchTerms();
    if (!terms.length) return;
    try {
      await navigator.clipboard.writeText(terms.join('\n'));
      const response = await chrome.runtime.sendMessage({ type: 'openEcomSniperPage', page: 'productHunter' });
      if (!response?.ok) throw new Error(response?.error || 'Product Hunter could not open.');
      byId('researchCopyStatus').textContent = `Copied ${terms.length.toLocaleString()} word${terms.length === 1 ? '' : 's'} and opened EcomSniper Product Hunter.`;
    } catch (error) {
      byId('researchCopyStatus').textContent = `Product Hunter handoff failed: ${error.message}`;
    }
  }

  function downloadResearchOutput() {
    downloadText(`${JSON.stringify(researchOutput, null, 2)}\n`, `gldn-product-research-output-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  }

  function countRulesBySource(rules) {
    return (rules || []).reduce((counts, rule) => {
      if (rule.sourceType === 'official-ebay') counts.official += 1;
      else if (rule.sourceType === 'profile2-discord') counts.discord += 1;
      else if (rule.sourceType === 'profile2-telegram') counts.telegram += 1;
      return counts;
    }, { official: 0, discord: 0, telegram: 0 });
  }

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
      researchStatus: String(byId('researchStatus')?.textContent || '').trim(),
      selectedResearchWords: selectedResearchTerms().length,
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
    if (pending.source === 'product-hunter-clipboard') {
      copyMode = 'original-input';
      targetPage = 'productHunter';
      targetLabel = 'Product Hunter';
      byId('copyAndOpenProductHunter').textContent = 'Copy Ready & Open Product Hunter';
    } else if (pending.source === 'bulk-poster-clipboard') {
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
