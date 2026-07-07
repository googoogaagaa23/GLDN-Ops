const statusElement = document.getElementById('status');

const COMPUTER_ACCOUNT_MAP = Object.freeze({
  M0: { ebayAccountLabel: 'CLICKNCARRY' },
  '6': { ebayAccountLabel: 'FINTIME' },
  '0': { ebayAccountLabel: 'FAK12' },
  M1: { ebayAccountLabel: 'HEARTSTONE' },
  '2': { ebayAccountLabel: 'FANCYFI' },
  '7': { ebayAccountLabel: '', poshmarkOnly: true }
});
const EBAY_ACCOUNT_OPTIONS = Object.values(COMPUTER_ACCOUNT_MAP).map((entry) => entry.ebayAccountLabel).filter(Boolean);

function normalizeEbayAccount(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  return EBAY_ACCOUNT_OPTIONS.find((option) => option.toLowerCase() === cleaned) || 'FAK12';
}

function normalizeComputer(value) {
  const cleaned = String(value || '').trim().toLowerCase().replace(/^comp\s*/, '');
  return Object.keys(COMPUTER_ACCOUNT_MAP).find((option) => option.toLowerCase() === cleaned) || '0';
}

function accountForComputer(value) {
  const computer = normalizeComputer(value);
  return COMPUTER_ACCOUNT_MAP[computer] || COMPUTER_ACCOUNT_MAP['0'];
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
  const stored = await getStorage(['computerLabel', 'ebayAccountLabel', 'move99AccountSettings']);
  const mapped = accountForComputer(stored.computerLabel);
  if (!mapped.ebayAccountLabel) {
    throw new Error('Computer 7 is Poshmark-only. Move .99 is disabled for it.');
  }
  const account = normalizeEbayAccount(mapped.ebayAccountLabel || stored.ebayAccountLabel);
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
