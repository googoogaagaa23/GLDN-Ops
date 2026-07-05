const computerInput = document.getElementById('computer');
const ebayInput = document.getElementById('ebayAccount');
const amazonInput = document.getElementById('profile');
const storePlanInput = document.getElementById('storePlan');
const freeListingsInput = document.getElementById('freeListings');
const monthlyDollarPresetInput = document.getElementById('monthlyDollarPreset');
const monthlyDollarInput = document.getElementById('monthlyDollarLimit');
const customListingLimitWrap = document.getElementById('customListingLimitWrap');
const customDollarLimitWrap = document.getElementById('customDollarLimitWrap');
const limitsSection = document.getElementById('limitsSection');
const limitsStatus = document.getElementById('limitsStatus');
const confirmLimitsButton = document.getElementById('confirmLimits');
const status = document.getElementById('status');
const uiOpacityInput = document.getElementById('uiOpacity');
const uiOpacityValue = document.getElementById('uiOpacityValue');
const uiThemeInput = document.getElementById('uiTheme');
const move99SourceCategoriesInput = document.getElementById('move99SourceCategories');
const move99DestinationCategoryInput = document.getElementById('move99DestinationCategory');
const move99SourceCategoryIdsInput = document.getElementById('move99SourceCategoryIds');
const move99BackburnerIdsInput = document.getElementById('move99BackburnerIds');
const currentMove99Destination = document.getElementById('currentMove99Destination');
const diagnosticLogElement = document.getElementById('diagnosticLog');
const localHelperCard = document.getElementById('localHelperCard');
const localHelperBadge = document.getElementById('localHelperBadge');
const localHelperText = document.getElementById('localHelperText');
function cleanConfigValue(value) {
  const text = String(value || '').trim();
  return /^YOUR_/i.test(text) || /YOUR_SCRIPT_ID/i.test(text) ? '' : text;
}

const BUILTIN_DASHBOARD_URL = cleanConfigValue(globalThis.GLDN_CONFIG?.dashboardUrl);
const BUILTIN_DASHBOARD_KEY = cleanConfigValue(globalThis.GLDN_CONFIG?.dashboardKey);

const COMPUTER_OPTIONS = ['0', '2', 'M0', '6', 'M1'];
const EBAY_ACCOUNT_OPTIONS = ['FAK12', 'CLICKNCARRY', 'FINTIME', 'FANCYFI', 'HEARTSTONE'];
const STORE_PLAN_LIMITS = { Premium: 10000, Anchor: 25000 };

function normalizeComputer(value) {
  const cleaned = String(value || '').trim().toLowerCase().replace(/^comp\s*/, '');
  return COMPUTER_OPTIONS.find((option) => option.toLowerCase() === cleaned) || '0';
}

function normalizeEbayAccount(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  return EBAY_ACCOUNT_OPTIONS.find((option) => option.toLowerCase() === cleaned) || 'FAK12';
}

function csvToArray(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function arrayToCsv(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function configuredMove99Account(account) {
  const configured = globalThis.GLDN_CONFIG?.move99Accounts;
  if (!configured || typeof configured !== 'object') return {};
  return configured[account] || configured[String(account || '').toLowerCase()] || {};
}

function defaultMove99ForAccount(account) {
  const configured = configuredMove99Account(account);
  return {
    sourceCategories: Array.isArray(configured.sourceCategories) ? configured.sourceCategories : ['Not .99', 'Other'],
    destinationCategory: String(configured.destinationCategory || 'Abra Cadabra .99'),
    sourceStoreCategoryIds: Array.isArray(configured.sourceStoreCategoryIds) ? configured.sourceStoreCategoryIds : [],
    backburnerItemIds: Array.isArray(configured.backburnerItemIds) ? configured.backburnerItemIds : []
  };
}

function buildMove99ActiveUrl(sourceStoreCategoryIds) {
  const ids = Array.isArray(sourceStoreCategoryIds) ? sourceStoreCategoryIds.filter(Boolean) : [];
  if (!ids.length) return 'https://www.ebay.com/sh/lst/active';

  const params = new URLSearchParams({
    action: 'search',
    status: 'ACTIVE',
    category_type: 'storeCategories',
    category_ids: ids.join(',')
  });

  return `https://www.ebay.com/sh/lst/active?${params.toString()}`;
}

function currentMove99SettingsForAccount(account, allSettings = {}) {
  const defaults = defaultMove99ForAccount(account);
  const stored = allSettings?.[account] || {};
  return { ...defaults, ...stored };
}

function renderMove99Settings(allSettings, account) {
  const settings = currentMove99SettingsForAccount(account, allSettings);
  move99SourceCategoriesInput.value = arrayToCsv(settings.sourceCategories);
  move99DestinationCategoryInput.value = settings.destinationCategory || '';
  move99SourceCategoryIdsInput.value = arrayToCsv(settings.sourceStoreCategoryIds);
  move99BackburnerIdsInput.value = arrayToCsv(settings.backburnerItemIds);
  currentMove99Destination.textContent = settings.destinationCategory || 'Not set';
}

function planFromStored(plan, limit) {
  if (plan === 'Premium' || Number(limit) === 10000) return 'Premium';
  if (plan === 'Anchor' || Number(limit) === 25000) return 'Anchor';
  return 'Custom';
}

function applyPlanLimit() {
  const plan = storePlanInput.value;
  const fixed = STORE_PLAN_LIMITS[plan];
  const custom = plan === 'Custom';
  customListingLimitWrap.style.display = custom ? 'block' : 'none';
  if (!custom) freeListingsInput.value = fixed;
  freeListingsInput.readOnly = !custom;
}

function applyDollarPreset() {
  const custom = monthlyDollarPresetInput.value === 'custom';
  customDollarLimitWrap.style.display = custom ? 'block' : 'none';
  if (!custom) monthlyDollarInput.value = monthlyDollarPresetInput.value;
}


function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return '';
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function numberOrNull(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function formatWhole(value) {
  const number = numberOrNull(value);
  return number == null ? 'Not set' : Math.round(number).toLocaleString();
}

function formatCurrency(value) {
  const number = numberOrNull(value);
  return number == null ? 'Not set' : number.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusClass(value) {
  return ['good', 'warning', 'critical'].includes(value) ? value : 'unknown';
}

function setMessage(message, isError = false) {
  status.style.color = isError ? '#b91c1c' : '#166534';
  status.textContent = message;
}

function recordPopupLog(message, detail = '') {
  const payload = {
    at: new Date().toISOString(),
    source: 'popup',
    level: 'error',
    message: String(message || 'Popup error').slice(0, 800),
    detail: String(detail || '').slice(0, 1200),
    page: 'chrome-extension://popup',
    version: chrome.runtime.getManifest().version
  };
  chrome.storage.local.get(['gldnErrorLog'], (result) => {
    const current = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
    chrome.storage.local.set({ gldnErrorLog: [payload, ...current].slice(0, 80) }, () => renderDiagnostics([payload, ...current].slice(0, 80)));
  });
}

function formatDiagnosticEntry(entry) {
  const date = new Date(entry.at || '');
  const time = Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
  const header = `[${time}] ${entry.level || 'error'} ${entry.source || 'extension'} v${entry.version || '?'}`;
  const page = entry.page ? `\n${entry.page}` : '';
  const detail = entry.detail ? `\n${entry.detail}` : '';
  return `${header}\n${entry.message || 'Unknown issue'}${page}${detail}`;
}

function renderDiagnostics(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    diagnosticLogElement.classList.add('diagnostic-empty');
    diagnosticLogElement.textContent = 'No errors recorded.';
    return;
  }
  diagnosticLogElement.classList.remove('diagnostic-empty');
  diagnosticLogElement.textContent = list.slice(0, 12).map(formatDiagnosticEntry).join('\n\n---\n\n');
}

async function checkLocalHelper(showMessage = false) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'localHelperHealth' });
    const ok = Boolean(response?.ok);
    localHelperCard.classList.toggle('ready', ok);
    localHelperBadge.textContent = ok ? 'Running' : 'Not running';
    localHelperText.textContent = ok
      ? 'Ready. Bulk Listing Workflow can auto-click EcomSniper Extract Sellers through the local helper.'
      : 'Required for automatic EcomSniper Extract Sellers clicks. Start tools\\local-click-helper.ps1 from the GLDN Ops folder.';
    if (showMessage) setMessage(ok ? 'Local helper is running.' : 'Local helper is not running.', !ok);
  } catch (error) {
    localHelperCard.classList.remove('ready');
    localHelperBadge.textContent = 'Not running';
    localHelperText.textContent = 'Required for automatic EcomSniper Extract Sellers clicks. Start tools\\local-click-helper.ps1 from the GLDN Ops folder.';
    if (showMessage) setMessage(error.message || 'Could not check local helper.', true);
  }
}

window.addEventListener('error', (event) => {
  recordPopupLog(event.message, `${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}\n${event.error?.stack || ''}`);
});

window.addEventListener('unhandledrejection', (event) => {
  recordPopupLog(event.reason?.message || String(event.reason || 'Unhandled promise rejection'), event.reason?.stack || '');
});

function renderSyncStatus(sync, hasConfig) {
  const element = document.getElementById('dashboardSync');
  if (!hasConfig) {
    element.textContent = 'Not configured.';
    element.style.color = '#64748b';
    return;
  }
  if (!sync) {
    element.textContent = 'Configured. Run Test Connection or save a scan.';
    element.style.color = '#475569';
    return;
  }
  const date = new Date(sync.at);
  const time = Number.isNaN(date.getTime()) ? '' : ` — ${date.toLocaleString()}`;
  if (sync.ok) {
    element.textContent = `${sync.message || 'Last sync succeeded'}${time}`;
    element.style.color = '#166534';
  } else {
    element.textContent = `Last sync failed: ${sync.error || 'Unknown error'}${time}`;
    element.style.color = '#b91c1c';
  }
}

function renderLimits(settings = {}) {
  const storedLimit = settings.freeFixedPriceLimit ?? '';
  const plan = planFromStored(settings.storePlan || '', storedLimit);
  storePlanInput.value = plan;
  freeListingsInput.value = storedLimit === '' ? (STORE_PLAN_LIMITS[plan] || '') : storedLimit;
  applyPlanLimit();

  const storedDollarLimit = settings.monthlySellerDollarLimit ?? 1000000;
  monthlyDollarPresetInput.value = Number(storedDollarLimit) === 1000000 ? '1000000' : 'custom';
  monthlyDollarInput.value = storedDollarLimit;
  applyDollarPreset();

  const confirmed = settings.limitsConfirmedMonth === currentMonthKey();
  const latestStatus = settings.latestListingStatus?.overallStatus || '';
  const needsPrune = latestStatus === 'PRUNE LISTINGS' || latestStatus === 'LIMIT CHANGED';
  const due = !confirmed;
  limitsSection.classList.toggle('due', due || needsPrune);
  limitsSection.classList.toggle('confirmed', confirmed && !needsPrune);
  limitsStatus.className = `limits-status ${(due || needsPrune) ? 'due' : 'confirmed'}`;
  confirmLimitsButton.className = (due || needsPrune) ? 'danger' : 'success';
  confirmLimitsButton.textContent = needsPrune ? latestStatus : due ? 'Confirm Listings Under Limit' : 'Run Limit Check';

  if (needsPrune) {
    limitsStatus.textContent = `${latestStatus}. Run Confirm Listings Under Limit on eBay to review current usage.`;
  } else if (confirmed) {
    const date = new Date(settings.limitsConfirmedAt || Date.now());
    const time = Number.isNaN(date.getTime()) ? '' : ` on ${date.toLocaleString()}`;
    limitsStatus.textContent = `Confirmed for ${monthLabel(currentMonthKey())}${time}.`;
  } else {
    const previous = settings.limitsConfirmedMonth ? ` Last confirmed for ${monthLabel(settings.limitsConfirmedMonth)}.` : '';
    limitsStatus.textContent = `Listing limits need monthly confirmation.${previous}`;
  }
}

function renderShipping(record) {
  const rows = document.getElementById('shippingRows');
  const time = document.getElementById('shippingTime');
  if (!record) {
    rows.innerHTML = '<div class="hint">No Mark as Shipped run recorded in this Chrome profile.</div>';
    time.textContent = '';
    return;
  }
  const values = [
    ['Computer', record.computerLabel || 'Not recorded'],
    ['eBay account', record.ebayAccountLabel || 'Not recorded'],
    ['Result', record.status || 'Unknown'],
    ['Marked shipped', String(record.markedCount ?? 0)],
    ['Batches', String(record.batchCount ?? 0)]
  ];
  if (record.error) values.push(['Error', record.error]);
  rows.innerHTML = values.map(([label, value]) => `<div class="row"><span>${label}</span><span class="value">${value}</span></div>`).join('');
  const date = new Date(record.completedAt || record.startedAt);
  time.textContent = Number.isNaN(date.getTime()) ? '' : `Completed ${date.toLocaleString()}`;
}

function renderListing(record) {
  const rows = document.getElementById('listingRows');
  const time = document.getElementById('listingTime');
  if (!rows || !time) return;
  if (!record) {
    rows.innerHTML = '<div class="hint">No listing confirmation saved in this Chrome profile.</div>';
    time.textContent = '';
    return;
  }
  const values = [
    ['Computer', record.computerLabel || 'Not recorded'],
    ['eBay account', record.ebayAccountLabel || 'Not recorded'],
    ['Active listings', formatWhole(record.activeListings)],
    ['In-stock quantity', formatWhole(record.inStockQuantity)],
    ['Out of stock', formatWhole(record.outOfStockCount)],
    ['In-stock rate', record.inStockPercent == null ? 'Not detected' : `${Number(record.inStockPercent).toFixed(1)}%`],
    ['Subscription limit', formatWhole(record.subscriptionListingLimit)],
    ['Listing status', record.subscriptionStatus || 'Unknown'],
    ['Dollar used', formatCurrency(record.currentDollarUsed)],
    ['Dollar limit', formatCurrency(record.monthlySellerDollarLimit)],
    ['Overall', record.overallStatus || 'Unknown']
  ];
  rows.innerHTML = values.map(([label, value]) => {
    const critical = /PRUNE|CHANGED/i.test(String(value));
    return `<div class="row"><span>${label}</span><span class="value ${critical ? 'critical' : ''}">${value}</span></div>`;
  }).join('');
  const date = new Date(record.confirmedAt || record.capturedAt);
  time.textContent = Number.isNaN(date.getTime()) ? '' : `Confirmed ${date.toLocaleString()}`;
}

function renderHealth(record) {
  const rows = document.getElementById('healthRows');
  const time = document.getElementById('healthTime');
  document.getElementById('healthComputer').textContent = record?.computerLabel || 'Not recorded';
  document.getElementById('healthEbay').textContent = record?.ebayAccountLabel || 'Not recorded';

  if (!record) {
    rows.innerHTML = '<div class="hint">No Seller Level check saved in this Chrome profile.</div>';
    time.textContent = '';
    return;
  }

  const values = [
    ['Current seller level', record.currentSellerLevel || 'Not captured', record.statuses?.currentSellerLevel],
    ['If evaluated today', record.evaluatedToday || 'Not captured', record.statuses?.evaluatedToday],
    ['Transaction defect rate', record.transactionDefectRate == null ? 'Not captured' : `${record.transactionDefectRate}%`, record.statuses?.transactionDefectRate],
    ['Late shipment rate', record.lateShipmentRate == null ? 'Not captured' : `${record.lateShipmentRate}%`, record.statuses?.lateShipmentRate],
    ['Tracking on time', record.trackingOnTime == null ? 'Not captured' : `${record.trackingOnTime}%`, record.statuses?.trackingOnTime],
    ['Cases closed', record.casesClosed == null ? 'Not captured' : `${record.casesClosed}%`, record.statuses?.casesClosed],
    ['Next evaluation', record.nextEvaluation || 'Not captured', 'unknown']
  ];

  rows.innerHTML = values.map(([label, value, state]) => `
    <div class="row"><span>${label}</span><span class="value ${statusClass(state)}">${value}</span></div>
  `).join('');

  const date = new Date(record.savedAt || record.capturedAt);
  time.textContent = Number.isNaN(date.getTime()) ? '' : `Saved ${date.toLocaleString()}`;
}

function refresh() {
  chrome.storage.local.get([
    'computerLabel',
    'ebayAccountLabel',
    'amazonProfileLabel',
    'latestAccountHealth',
    'latestListingStatus',
    'gldnUiOpacity',
    'gldnUiTheme',
    'lastDashboardSync',
    'storePlan',
    'freeFixedPriceLimit',
    'monthlySellerDollarLimit',
    'limitsConfirmedMonth',
    'limitsConfirmedAt',
    'lastMarkShippedResult',
    'move99AccountSettings',
    'gldnErrorLog'
  ], (result) => {
    const computer = normalizeComputer(result.computerLabel);
    const ebay = normalizeEbayAccount(result.ebayAccountLabel);
    const amazon = (result.amazonProfileLabel || '').trim();

    computerInput.value = computer;
    ebayInput.value = ebay;
    amazonInput.value = amazon;
    const opacity = Number(result.gldnUiOpacity || globalThis.GLDN_CONFIG?.defaultUiOpacity || 75);
    const theme = String(result.gldnUiTheme || globalThis.GLDN_CONFIG?.defaultUiTheme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
    uiOpacityInput.value = String(opacity);
    uiOpacityValue.textContent = `${opacity}%`;
    uiThemeInput.value = theme;
    document.documentElement.dataset.theme = theme;

    document.getElementById('currentComputer').textContent = computer || 'Not set';
    document.getElementById('currentEbay').textContent = ebay || 'Not set';
    document.getElementById('currentAmazon').textContent = amazon || 'Not set';
    renderMove99Settings(result.move99AccountSettings || {}, ebay);

    renderLimits(result);
    renderListing(result.latestListingStatus);
    renderHealth(result.latestAccountHealth);
    renderShipping(result.lastMarkShippedResult);
    renderDiagnostics(result.gldnErrorLog);
    renderSyncStatus(result.lastDashboardSync, Boolean(BUILTIN_DASHBOARD_URL && BUILTIN_DASHBOARD_KEY));
  });
}

storePlanInput.addEventListener('change', () => {
  applyPlanLimit();
  if (storePlanInput.value === 'Custom') freeListingsInput.focus();
});

monthlyDollarPresetInput.addEventListener('change', () => {
  applyDollarPreset();
  if (monthlyDollarPresetInput.value === 'custom') monthlyDollarInput.focus();
});

document.getElementById('saveIdentity').addEventListener('click', () => {
  const computerLabel = computerInput.value.trim();
  const ebayAccountLabel = ebayInput.value.trim();
  if (!computerLabel || !ebayAccountLabel) {
    setMessage('Enter both the computer and eBay account labels.', true);
    return;
  }
  chrome.storage.local.set({ computerLabel, ebayAccountLabel }, () => {
    document.getElementById('currentComputer').textContent = computerLabel;
    document.getElementById('currentEbay').textContent = ebayAccountLabel;
    setMessage('Computer and eBay account saved.');
  });
});

ebayInput.addEventListener('change', () => {
  chrome.storage.local.get(['move99AccountSettings'], (result) => {
    renderMove99Settings(result.move99AccountSettings || {}, normalizeEbayAccount(ebayInput.value));
  });
});

document.getElementById('saveMove99Categories').addEventListener('click', () => {
  const account = normalizeEbayAccount(ebayInput.value);
  const sourceCategories = csvToArray(move99SourceCategoriesInput.value);
  const destinationCategory = move99DestinationCategoryInput.value.trim();
  const sourceStoreCategoryIds = csvToArray(move99SourceCategoryIdsInput.value);
  const backburnerItemIds = csvToArray(move99BackburnerIdsInput.value);

  if (!account) {
    setMessage('Choose the eBay account first.', true);
    return;
  }
  if (!sourceCategories.length || !destinationCategory) {
    setMessage('Enter at least one source category and one destination category.', true);
    return;
  }

  chrome.storage.local.get(['move99AccountSettings'], (result) => {
    const move99AccountSettings = result.move99AccountSettings || {};
    move99AccountSettings[account] = { sourceCategories, destinationCategory, sourceStoreCategoryIds, backburnerItemIds };
    chrome.storage.local.set({ move99AccountSettings }, () => {
      currentMove99Destination.textContent = destinationCategory;
      setMessage(`Saved .99 categories for ${account}.`);
    });
  });
});

document.getElementById('openMove99Workflow').addEventListener('click', () => {
  const account = normalizeEbayAccount(ebayInput.value);
  chrome.storage.local.get(['move99AccountSettings'], (result) => {
    const settings = currentMove99SettingsForAccount(account, result.move99AccountSettings || {});
    if (!settings.sourceCategories?.length || !settings.destinationCategory) {
      setMessage('Save source and destination .99 categories first.', true);
      return;
    }

    const activeUrl = buildMove99ActiveUrl(settings.sourceStoreCategoryIds);
    chrome.storage.local.set({
      gldnStopRequested: false,
      pendingMove99Run: {
        active: true,
        confirmed: true,
        phase: 'active-prepare',
        ebayAccountLabel: account,
        currentPage: 1,
        scanPages: {},
        verificationPages: {},
        failedIds: [],
        processedIds: [],
        totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
        startedAt: new Date().toISOString(),
        sourceCategories: settings.sourceCategories,
        destinationCategory: settings.destinationCategory,
        sourceStoreCategoryIds: settings.sourceStoreCategoryIds,
        backburnerItemIds: settings.backburnerItemIds
      }
    }, () => {
      chrome.tabs.create({ url: activeUrl });
      setMessage('Move .99 workflow started. The opened eBay tab will scan first.');
    });
  });
});

document.getElementById('openAmazonBestSellers').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.amazon.com/gp/bestsellers' });
});

document.getElementById('startBulkListingWorkflow').addEventListener('click', () => {
  chrome.storage.local.set({ pendingAmazonBulkWorkflowStart: { active: true, startedAt: Date.now() } }, () => {
    chrome.tabs.create({ url: 'https://www.amazon.com/gp/bestsellers' });
    setMessage('Bulk Listing Workflow will start on Amazon Best Sellers.');
  });
});

document.getElementById('startSnipingWorkflow').addEventListener('click', () => {
  chrome.storage.local.set({ pendingAmazonSnipingWorkflowStart: { active: true, startedAt: Date.now() } }, () => {
    chrome.tabs.create({ url: 'https://www.amazon.com/gp/bestsellers' });
    setMessage('Sniping Workflow will start from the opened Amazon page if a product and price are visible.');
  });
});

document.getElementById('openEcomSniperCompetitorScanner').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome-extension://eohieelgcgopcnjjjanjgfjdaifolokm/Competitor_Research/index.html' });
});

document.getElementById('openEcomSniperProductHunter').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome-extension://eohieelgcgopcnjjjanjgfjdaifolokm/Product_Finder/product_finder.html' });
});

document.getElementById('checkLocalHelper').addEventListener('click', () => {
  checkLocalHelper(true);
});

async function saveLimits() {
  const storePlan = storePlanInput.value;
  const freeFixedPriceLimit = STORE_PLAN_LIMITS[storePlan] ?? numberOrNull(freeListingsInput.value);
  const monthlySellerDollarLimit = monthlyDollarPresetInput.value === 'custom'
    ? numberOrNull(monthlyDollarInput.value)
    : numberOrNull(monthlyDollarPresetInput.value);
  const computerLabel = computerInput.value.trim();
  const ebayAccountLabel = ebayInput.value.trim();

  if (!storePlan) {
    setMessage('Choose the Store subscription.', true);
    return;
  }
  if (freeFixedPriceLimit == null || monthlySellerDollarLimit == null) {
    setMessage('Enter the custom listing or dollar limit.', true);
    return;
  }
  if (!computerLabel || !ebayAccountLabel) {
    setMessage('Save the computer and eBay account first.', true);
    return;
  }

  chrome.storage.local.set({ storePlan, freeFixedPriceLimit, monthlySellerDollarLimit }, () => {
    setMessage('Listing settings saved. Use Confirm Listings Under Limit on eBay to scan and confirm the current month.');
    refresh();
  });
}

function openListingsCheck() {
  chrome.storage.local.set({ pendingReviewMonthlyLimits: true }, () => {
    chrome.tabs.create({ url: 'https://www.ebay.com/sh/ovw' });
  });
}

document.getElementById('saveLimits').addEventListener('click', saveLimits);
document.getElementById('confirmLimits').addEventListener('click', openListingsCheck);
document.getElementById('openLimitsPage').addEventListener('click', openListingsCheck);

document.getElementById('saveAmazon').addEventListener('click', () => {
  const amazonProfileLabel = amazonInput.value.trim();
  if (!amazonProfileLabel) {
    setMessage('Enter an Amazon profile name first.', true);
    return;
  }
  chrome.storage.local.set({ amazonProfileLabel }, () => {
    document.getElementById('currentAmazon').textContent = amazonProfileLabel;
    setMessage('Amazon profile saved.');
  });
});

document.getElementById('clearAmazon').addEventListener('click', () => {
  chrome.storage.local.remove(['amazonProfileLabel'], () => {
    amazonInput.value = '';
    document.getElementById('currentAmazon').textContent = 'Not set';
    setMessage('Saved Amazon profile cleared.');
  });
});


uiThemeInput.addEventListener('change', () => {
  const theme = uiThemeInput.value === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  chrome.storage.local.set({ gldnUiTheme: theme });
});

uiOpacityInput.addEventListener('input', () => {
  const value = Number(uiOpacityInput.value || 75);
  uiOpacityValue.textContent = `${value}%`;
  chrome.storage.local.set({ gldnUiOpacity: value });
});

document.getElementById('stopCurrentTask').addEventListener('click', () => {
  chrome.storage.local.set({ gldnStopRequested: true }, () => {
    setMessage('Stop requested. The current task will stop at the next safe checkpoint.');
  });
});

document.getElementById('resetAutomation').addEventListener('click', () => {
  const keys = ['pendingMarkShippedRun', 'pendingSellerLevelScan', 'pendingReviewMonthlyLimits', 'pendingMove99Run'];
  chrome.storage.local.remove(keys, () => {
    chrome.storage.local.set({ gldnStopRequested: false }, () => {
      setMessage('Automation state reset. Refresh the eBay page before starting another task.');
    });
  });
});

document.getElementById('reloadExtension').addEventListener('click', async () => {
  setMessage('Reloading extension update...');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'reloadExtension' });
    if (!response?.ok) throw new Error(response?.error || 'Reload request failed.');
    setMessage('Extension reload requested. Refresh open eBay/Amazon tabs after it reloads.');
  } catch (error) {
    recordPopupLog(error.message || 'Reload request failed.', error.stack || '');
    setMessage(error.message || 'Reload request failed.', true);
  }
});

document.getElementById('copyErrorLog').addEventListener('click', async () => {
  chrome.storage.local.get(['gldnErrorLog'], async (result) => {
    const entries = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
    if (!entries.length) {
      setMessage('No error log to copy.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(entries.map(formatDiagnosticEntry).join('\n\n---\n\n'));
      setMessage('Error log copied.');
    } catch (error) {
      recordPopupLog(error.message || 'Could not copy error log.', error.stack || '');
      setMessage('Could not copy error log.', true);
    }
  });
});

document.getElementById('clearErrorLog').addEventListener('click', () => {
  chrome.storage.local.remove(['gldnErrorLog'], () => {
    renderDiagnostics([]);
    setMessage('Error log cleared.');
  });
});

document.getElementById('testDashboard').addEventListener('click', async () => {
  setMessage('Testing built-in dashboard connection...');
  try {
    const response = await chrome.runtime.sendMessage({ type: 'testDashboard' });
    if (!response?.ok) throw new Error(response?.error || 'Connection failed.');
    setMessage('Dashboard connection works.');
    refresh();
  } catch (error) {
    setMessage(error.message || 'Connection failed.', true);
    refresh();
  }
});

document.getElementById('openDashboard').addEventListener('click', () => {
  if (!BUILTIN_DASHBOARD_URL || !BUILTIN_DASHBOARD_KEY) {
    setMessage('The built-in dashboard connection is missing.', true);
    return;
  }
  try {
    const dashboard = new URL(BUILTIN_DASHBOARD_URL);
    dashboard.searchParams.set('key', BUILTIN_DASHBOARD_KEY);
    chrome.tabs.create({ url: dashboard.toString() });
  } catch (_) {
    setMessage('The built-in dashboard URL is invalid.', true);
  }
});

document.getElementById('currentVersion').textContent = `v${chrome.runtime.getManifest().version}`;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.gldnErrorLog) renderDiagnostics(changes.gldnErrorLog.newValue);
});

refresh();
checkLocalHelper(false);
