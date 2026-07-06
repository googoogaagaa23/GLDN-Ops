const statusElement = document.getElementById('status');

const EBAY_ACCOUNT_OPTIONS = ['FAK12', 'CLICKNCARRY', 'FINTIME', 'FANCYFI', 'HEARTSTONE'];

function normalizeEbayAccount(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  return EBAY_ACCOUNT_OPTIONS.find((option) => option.toLowerCase() === cleaned) || 'FAK12';
}

function asArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function buildMove99ActiveUrl(sourceStoreCategoryIds) {
  const ids = asArray(sourceStoreCategoryIds);
  if (!ids.length) return 'https://www.ebay.com/sh/lst/active';
  const url = new URL('https://www.ebay.com/sh/lst/active');
  url.searchParams.set('storeCatIds', ids.join(','));
  url.searchParams.set('source', 'filterpanel');
  url.searchParams.set('action', 'search');
  return url.toString();
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function configuredAccount(account) {
  const configured = globalThis.GLDN_CONFIG?.move99Accounts;
  if (!configured || typeof configured !== 'object') return {};
  return configured[account] || configured[account.toLowerCase()] || {};
}

async function start() {
  const params = new URLSearchParams(location.search);
  const scanMode = params.get('mode') === 'non99' ? 'non99' : 'price99';
  const stored = await getStorage(['ebayAccountLabel', 'move99AccountSettings']);
  const account = normalizeEbayAccount(stored.ebayAccountLabel);
  const configured = configuredAccount(account);
  const saved = stored.move99AccountSettings?.[account] || {};
  const settings = {
    sourceCategories: ['Not .99', 'Other'],
    destinationCategory: 'Abra Cadabra .99',
    sourceStoreCategoryIds: account === 'FAK12' ? ['44678633011', '1'] : [],
    backburnerItemIds: account === 'FAK12' ? ['318521296686'] : [],
    ...configured,
    ...saved
  };
  settings.sourceCategories = asArray(settings.sourceCategories);
  settings.sourceStoreCategoryIds = asArray(settings.sourceStoreCategoryIds);
  settings.backburnerItemIds = asArray(settings.backburnerItemIds);
  settings.destinationCategory = String(settings.destinationCategory || '').trim();

  if (!settings.sourceCategories.length || !settings.destinationCategory) {
    throw new Error('Move .99 categories are not configured.');
  }

  const sourceCategories = scanMode === 'non99' ? [settings.destinationCategory] : settings.sourceCategories;
  const destinationCategory = scanMode === 'non99' ? settings.sourceCategories[0] : settings.destinationCategory;
  const sourceStoreCategoryIds = scanMode === 'non99' ? [] : settings.sourceStoreCategoryIds;
  const activeUrl = buildMove99ActiveUrl(sourceStoreCategoryIds);
  await setStorage({
    gldnStopRequested: false,
    pendingMove99Run: {
      active: true,
      confirmed: true,
      autoApply: true,
      useEditAllBulkScan: true,
      phase: 'active-prepare',
      scanMode,
      ebayAccountLabel: account,
      currentPage: 1,
      scanPages: {},
      verificationPages: {},
      failedIds: [],
      processedIds: [],
      totals: { batches: 0, selected: 0, categoryApplied: 0, live: 0, failed: 0 },
      startedAt: new Date().toISOString(),
      sourceCategories,
      destinationCategory,
      sourceStoreCategoryIds,
      backburnerItemIds: settings.backburnerItemIds
    }
  });

  statusElement.textContent = `Started ${scanMode === 'non99' ? 'Non-.99 cleanup' : 'Move .99'} for ${account}.\nOpening ${activeUrl}`;
  chrome.tabs.create({ url: activeUrl });
}

start().catch((error) => {
  statusElement.textContent = error.message || String(error);
});
