(function () {
  'use strict';

  const CORE = globalThis.GLDN_PRODUCT_HUNTER_CORE;
  const PAGE_SIZE = 100;
  const elements = {};
  let currentState = null;
  let products = [];
  let page = 1;
  let refreshTimer = null;

  const ids = [
    'version-line', 'policy-count', 'run-state', 'keywords', 'computer-label', 'desired-ready', 'max-pages',
    'max-candidates', 'min-price', 'max-price', 'min-rating', 'min-reviews', 'reuse-days', 'delay-ms', 'exclude-fashion',
    'exclude-listed', 'exclude-sponsored', 'require-stock',
    'ebay-guard-state', 'ebay-indexed-listings', 'ebay-indexed-asins', 'ebay-indexed-titles', 'ebay-index-account',
    'ebay-index-time', 'ebay-scan-progress', 'ebay-scan-count', 'ebay-scan-progress-bar', 'ebay-scan-button',
    'ebay-resume-button', 'ebay-stop-button', 'ebay-worker-button', 'ebay-import-button', 'ebay-clear-button', 'ebay-import-file',
    'start-button', 'pause-button', 'resume-button', 'stop-button', 'reset-button', 'worker-button', 'notice',
    'metric-discovered', 'metric-queued', 'metric-ready', 'metric-review', 'metric-blocked', 'metric-excluded',
    'metric-incomplete', 'results-summary', 'result-search', 'status-filter', 'copy-ready-button', 'audit-button',
    'bulk-poster-button', 'results-body', 'page-summary', 'page-number', 'previous-page', 'next-page', 'log-list'
  ];

  function byId(id) { return document.getElementById(id); }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) return reject(new Error(error.message));
        if (!response?.ok) return reject(new Error(response?.error || 'Product Hunter did not answer.'));
        resolve(response);
      });
    });
  }

  function setNotice(message, tone = '') {
    elements.notice.textContent = message;
    elements.notice.className = `notice${tone ? ` ${tone}` : ''}`;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label || 'Working...';
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
    button.disabled = busy;
  }

  function getSettings() {
    return {
      computerLabel: elements['computer-label'].value,
      desiredReady: elements['desired-ready'].value,
      maxPagesPerKeyword: elements['max-pages'].value,
      maxCandidates: elements['max-candidates'].value,
      minPrice: elements['min-price'].value,
      maxPrice: elements['max-price'].value,
      minRating: elements['min-rating'].value,
      minReviews: elements['min-reviews'].value,
      reuseDays: elements['reuse-days'].value,
      navigationDelayMs: elements['delay-ms'].value,
      excludeAlreadyListed: elements['exclude-listed'].checked,
      excludeFashion: elements['exclude-fashion'].checked,
      excludeSponsored: elements['exclude-sponsored'].checked,
      requireInStock: elements['require-stock'].checked
    };
  }

  function populateSettings(settings) {
    const normalized = CORE.normalizeSettings(settings || {});
    elements['computer-label'].value = normalized.computerLabel || '0';
    if (!elements['computer-label'].value) elements['computer-label'].value = '0';
    elements['desired-ready'].value = normalized.desiredReady;
    elements['max-pages'].value = normalized.maxPagesPerKeyword;
    elements['max-candidates'].value = normalized.maxCandidates;
    elements['min-price'].value = normalized.minPrice;
    elements['max-price'].value = normalized.maxPrice;
    elements['min-rating'].value = normalized.minRating;
    elements['min-reviews'].value = normalized.minReviews;
    elements['reuse-days'].value = normalized.reuseDays;
    elements['delay-ms'].value = normalized.navigationDelayMs;
    elements['exclude-listed'].checked = normalized.excludeAlreadyListed;
    elements['exclude-fashion'].checked = normalized.excludeFashion;
    elements['exclude-sponsored'].checked = normalized.excludeSponsored;
    elements['require-stock'].checked = normalized.requireInStock;
  }

  function formatPrice(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : 'Not captured';
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
  }

  function filteredProducts() {
    const status = elements['status-filter'].value;
    const query = CORE.normalizeSearchText(elements['result-search'].value);
    return products.filter((product) => {
      if (status !== 'all' && product.status !== status) return false;
      if (!query) return true;
      return CORE.normalizeSearchText([product.title, product.asin, product.keyword, product.brand, product.reason].join(' ')).includes(query);
    });
  }

  function appendText(parent, tagName, text, className = '') {
    const node = document.createElement(tagName);
    node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }

  function renderTable() {
    const filtered = filteredProducts();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pageCount);
    const start = (page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    elements['results-body'].replaceChildren();

    if (!visible.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'empty-state';
      cell.textContent = products.length ? 'No products match this filter.' : 'Start a hunt to collect products.';
      row.appendChild(cell);
      elements['results-body'].appendChild(row);
    }

    for (const product of visible) {
      const row = document.createElement('tr');
      const statusCell = document.createElement('td');
      appendText(statusCell, 'span', product.status || 'unknown', `status-pill status-${product.status || 'incomplete'}`);
      row.appendChild(statusCell);

      const productCell = document.createElement('td');
      appendText(productCell, 'span', product.title || 'Untitled Amazon product', 'product-title');
      const ratingText = product.rating !== null && product.rating !== undefined && Number.isFinite(Number(product.rating)) ? `${Number(product.rating).toFixed(1)} stars` : '';
      const reviewText = product.reviewCount !== null && product.reviewCount !== undefined && Number.isFinite(Number(product.reviewCount)) ? `${Number(product.reviewCount).toLocaleString()} reviews` : '';
      appendText(productCell, 'span', [product.brand, product.availability, ratingText, reviewText].filter(Boolean).join(' | ') || 'No brand or stock text captured', 'subline');
      row.appendChild(productCell);

      const asinCell = document.createElement('td');
      appendText(asinCell, 'span', product.asin || 'Missing');
      appendText(asinCell, 'span', `Page ${product.searchPage || '?'}`, 'subline');
      row.appendChild(asinCell);

      const amazonCell = document.createElement('td');
      appendText(amazonCell, 'span', formatPrice(product.price), 'product-title');
      if (product.url) {
        const link = document.createElement('a');
        link.href = CORE.canonicalAmazonUrl(product.url, product.asin);
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.className = 'amazon-link';
        link.textContent = 'Open product';
        amazonCell.appendChild(link);
      }
      row.appendChild(amazonCell);

      const keywordCell = document.createElement('td');
      appendText(keywordCell, 'span', product.keyword || 'Unknown');
      if (product.sponsored) appendText(keywordCell, 'span', 'Sponsored result', 'subline');
      row.appendChild(keywordCell);

      const reasonCell = document.createElement('td');
      appendText(reasonCell, 'span', product.reason || 'No decision reason recorded.', 'reason');
      if (product.policyMatches?.length) appendText(reasonCell, 'span', `${product.policyMatches.length} reviewed policy rule match(es)`, 'subline');
      row.appendChild(reasonCell);
      elements['results-body'].appendChild(row);
    }

    const first = filtered.length ? start + 1 : 0;
    const last = Math.min(start + PAGE_SIZE, filtered.length);
    elements['page-summary'].textContent = `${first}-${last} of ${filtered.length} shown`;
    elements['page-number'].textContent = `Page ${page} of ${pageCount}`;
    elements['previous-page'].disabled = page <= 1;
    elements['next-page'].disabled = page >= pageCount;
  }

  function renderLogs(logs) {
    elements['log-list'].replaceChildren();
    if (!logs?.length) {
      appendText(elements['log-list'], 'li', 'No run events yet.');
      return;
    }
    for (const log of [...logs].reverse()) {
      appendText(elements['log-list'], 'li', `${formatTime(log.at)} | ${String(log.level || 'info').toUpperCase()} | ${log.message}`);
    }
  }

  function ebayGuardReady(state) {
    const index = state?.ebayIndex;
    if (!index?.verified) return false;
    const selected = CORE.normalizeText(elements['computer-label'].value);
    return !selected || !index.computerLabel || selected === index.computerLabel;
  }

  function renderEbayGuard(state) {
    const index = state.ebayIndex;
    const scan = state.ebayScan;
    const scanStatus = scan?.status || '';
    const active = scanStatus === 'running';
    const paused = scanStatus === 'paused';
    const huntBusy = ['running', 'paused'].includes(state.job?.status);
    const ready = ebayGuardReady(state);

    elements['ebay-guard-state'].textContent = active ? 'Scanning' : paused ? 'Paused' : ready ? 'Verified' : 'Not loaded';
    elements['ebay-indexed-listings'].textContent = Number(index?.recordCount || 0).toLocaleString();
    elements['ebay-indexed-asins'].textContent = Number(index?.asinCount || 0).toLocaleString();
    elements['ebay-indexed-titles'].textContent = Number(index?.titleCount || 0).toLocaleString();
    elements['ebay-index-account'].textContent = index?.accountLabel || index?.computerLabel || 'Not scanned';
    elements['ebay-index-time'].textContent = index?.scannedAt ? formatTime(index.scannedAt) : 'Never';

    const scanned = Number(scan?.scannedListings || 0);
    const total = Number(scan?.totalListings || 0);
    elements['ebay-scan-progress-bar'].max = Math.max(1, total);
    elements['ebay-scan-progress-bar'].value = Math.min(Math.max(0, scanned), Math.max(1, total));
    elements['ebay-scan-count'].textContent = total ? `${scanned.toLocaleString()} / ${total.toLocaleString()}` : '';
    if (active) {
      elements['ebay-scan-progress'].textContent = scan.phase === 'verify-total'
        ? 'Final count verification'
        : `Reading page ${scan.currentPage || 1}${scan.totalPages ? ` of ${scan.totalPages}` : ''}`;
    } else if (paused) {
      elements['ebay-scan-progress'].textContent = scan.pauseReason || 'Scan paused at a saved checkpoint.';
    } else if (ready) {
      elements['ebay-scan-progress'].textContent = `${Number(index.recordCount || 0).toLocaleString()} active listings verified from ${index.source || 'eBay'}.`;
    } else {
      elements['ebay-scan-progress'].textContent = 'Scan Active Listings before the first protected hunt.';
    }

    elements['ebay-scan-button'].disabled = active || paused || huntBusy;
    elements['ebay-resume-button'].disabled = !paused || huntBusy;
    elements['ebay-stop-button'].disabled = !active && !paused;
    elements['ebay-worker-button'].disabled = !active && !paused;
    elements['ebay-import-button'].disabled = active || paused || huntBusy;
    elements['ebay-clear-button'].disabled = active || paused || !index;
  }

  function renderState(state) {
    currentState = state;
    const job = state.job;
    const status = job?.status || 'idle';
    const counts = { ...CORE.emptyCounts(), ...(job?.counts || {}) };
    elements['version-line'].textContent = `v${state.version} | Amazon discovery and listing-policy preflight`;
    elements['policy-count'].textContent = `${state.policy.ruleCount.toLocaleString()} reviewed rules loaded`;
    elements['run-state'].textContent = status;
    elements['metric-discovered'].textContent = Number(job?.productAsins?.length || 0).toLocaleString();
    for (const name of Object.keys(counts)) elements[`metric-${name}`].textContent = Number(counts[name]).toLocaleString();

    const active = status === 'running';
    const paused = status === 'paused';
    const guardRequired = elements['exclude-listed'].checked;
    elements['start-button'].disabled = active || paused || (guardRequired && !ebayGuardReady(state));
    elements['pause-button'].disabled = !active;
    elements['resume-button'].disabled = !paused;
    elements['stop-button'].disabled = !active && !paused;
    elements['reset-button'].disabled = !job;
    elements['worker-button'].disabled = !job?.workerTabId;
    elements['copy-ready-button'].disabled = counts.ready < 1;
    elements['audit-button'].disabled = products.length < 1;

    if (job) {
      const keywordPosition = Math.min(job.keywordIndex + 1, job.keywords.length);
      elements['results-summary'].textContent = `${job.productAsins.length.toLocaleString()} unique candidates | ${counts.ready.toLocaleString()} Ready | ${job.phase} phase | keyword ${keywordPosition} of ${job.keywords.length}`;
      if (job.status === 'paused') setNotice(job.pauseReason || 'Paused.', job.lastError ? 'error' : '');
      else if (job.status === 'complete') setNotice(job.completionReason || 'Hunt complete.', 'success');
      else if (job.status === 'stopped') setNotice('Stopped safely. Reset before starting a new hunt.');
      else if (job.status === 'running') setNotice(job.pendingNavigation ? `Checking Amazon ${job.pendingNavigation.kind}: ${job.pendingNavigation.asin || job.pendingNavigation.url}` : 'Preparing the next Amazon page...');
    } else {
      elements['results-summary'].textContent = `No hunt loaded. ${state.historyCount.toLocaleString()} ASINs are in duplicate history.`;
    }
    renderEbayGuard(state);
    renderLogs(state.logs);
    renderTable();
  }

  async function refresh(loadProducts = true) {
    const [state, productResponse] = await Promise.all([
      send({ type: 'hunterGetState' }),
      loadProducts ? send({ type: 'hunterGetProducts' }) : Promise.resolve(null)
    ]);
    if (productResponse) products = productResponse.products || [];
    renderState(state);
  }

  async function runAction(button, workingLabel, action, successMessage = '') {
    setBusy(button, true, workingLabel);
    try {
      await action();
      if (successMessage) setNotice(successMessage, 'success');
      await refresh(true);
    } catch (error) {
      setNotice(error.message || String(error), 'error');
    } finally {
      setBusy(button, false);
    }
  }

  async function copyReady() {
    const response = await send({ type: 'hunterReadyPayload' });
    if (!response.links.length) throw new Error('No Ready Amazon links are available to copy.');
    await navigator.clipboard.writeText(response.links.join('\n'));
    await send({ type: 'hunterCommitReadyHistory', asins: response.products.map((product) => product.asin) });
    setNotice(`${response.links.length.toLocaleString()} Ready Amazon links copied. Their ASINs are now protected from reuse for the configured period.`, 'success');
  }

  function downloadAudit() {
    const csv = CORE.buildAuditCsv(products);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GLDN-Product-Hunter-${currentState?.job?.id || 'audit'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`Audit CSV downloaded with ${products.length.toLocaleString()} product decisions.`, 'success');
  }

  function bindEvents() {
    elements['ebay-scan-button'].addEventListener('click', () => runAction(elements['ebay-scan-button'], 'Starting...', () => send({
      type: 'hunterEbayScanStart',
      computerLabel: elements['computer-label'].value
    }), 'Complete eBay Active Listings scan started in an inactive tab.'));
    elements['ebay-resume-button'].addEventListener('click', () => runAction(elements['ebay-resume-button'], 'Resuming...', () => send({ type: 'hunterEbayScanResume' }), 'eBay listing scan resumed.'));
    elements['ebay-stop-button'].addEventListener('click', () => runAction(elements['ebay-stop-button'], 'Stopping...', () => send({ type: 'hunterEbayScanStop' }), 'eBay listing scan stopped. The last verified index was preserved.'));
    elements['ebay-worker-button'].addEventListener('click', () => runAction(elements['ebay-worker-button'], 'Opening...', () => send({ type: 'hunterOpenEbayWorker' })));
    elements['ebay-import-button'].addEventListener('click', () => elements['ebay-import-file'].click());
    elements['ebay-import-file'].addEventListener('change', async () => {
      const file = elements['ebay-import-file'].files?.[0];
      if (!file) return;
      await runAction(elements['ebay-import-button'], 'Importing...', async () => {
        await send({
          type: 'hunterEbayCsvImport',
          csvText: await file.text(),
          fileName: file.name,
          computerLabel: elements['computer-label'].value
        });
      }, 'eBay Active Listings report imported and indexed.');
      elements['ebay-import-file'].value = '';
    });
    elements['ebay-clear-button'].addEventListener('click', () => runAction(elements['ebay-clear-button'], 'Clearing...', () => send({ type: 'hunterEbayIndexClear' }), 'eBay listing index cleared.'));
    elements['start-button'].addEventListener('click', () => runAction(elements['start-button'], 'Starting...', async () => {
      await send({ type: 'hunterStart', keywords: elements.keywords.value, settings: getSettings() });
    }, 'Hunt started in an inactive Amazon tab.'));
    elements['pause-button'].addEventListener('click', () => runAction(elements['pause-button'], 'Pausing...', () => send({ type: 'hunterPause' }), 'Hunt paused.'));
    elements['resume-button'].addEventListener('click', () => runAction(elements['resume-button'], 'Resuming...', () => send({ type: 'hunterResume' }), 'Hunt resumed.'));
    elements['stop-button'].addEventListener('click', () => runAction(elements['stop-button'], 'Stopping...', () => send({ type: 'hunterStop' }), 'Hunt stopped safely.'));
    elements['reset-button'].addEventListener('click', () => runAction(elements['reset-button'], 'Resetting...', async () => {
      await send({ type: 'hunterReset' });
      products = [];
      page = 1;
    }, 'Hunt results reset. Duplicate history was preserved.'));
    elements['worker-button'].addEventListener('click', () => runAction(elements['worker-button'], 'Opening...', () => send({ type: 'hunterOpenWorker' })));
    elements['bulk-poster-button'].addEventListener('click', () => runAction(elements['bulk-poster-button'], 'Opening...', () => send({ type: 'hunterOpenBulkPoster' })));
    elements['copy-ready-button'].addEventListener('click', () => runAction(elements['copy-ready-button'], 'Copying...', copyReady));
    elements['audit-button'].addEventListener('click', downloadAudit);
    elements['result-search'].addEventListener('input', () => { page = 1; renderTable(); });
    elements['status-filter'].addEventListener('change', () => { page = 1; renderTable(); });
    elements['previous-page'].addEventListener('click', () => { page = Math.max(1, page - 1); renderTable(); });
    elements['next-page'].addEventListener('click', () => { page += 1; renderTable(); });
    elements['computer-label'].addEventListener('change', () => currentState && renderState(currentState));
    elements['exclude-listed'].addEventListener('change', () => currentState && renderState(currentState));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.gldnHunterJob || changes.gldnHunterEbayScan || changes.gldnHunterEbayIndex
        || Object.keys(changes).some((key) => key.startsWith('gldnHunterProduct:'))) scheduleRefresh();
    });
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh(true).catch((error) => setNotice(error.message || String(error), 'error'));
    }, 250);
  }

  async function init() {
    for (const id of ids) elements[id] = byId(id);
    bindEvents();
    try {
      const state = await send({ type: 'hunterGetState' });
      populateSettings(state.settings);
      await refresh(true);
    } catch (error) {
      setNotice(error.message || String(error), 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
