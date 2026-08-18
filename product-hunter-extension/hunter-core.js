(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_PRODUCT_HUNTER_CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS = Object.freeze({
    QUEUED: 'queued',
    READY: 'ready',
    REVIEW: 'review',
    BLOCKED: 'blocked',
    EXCLUDED: 'excluded',
    INCOMPLETE: 'incomplete'
  });

  const DEFAULT_SETTINGS = Object.freeze({
    computerLabel: '',
    desiredReady: 100,
    maxPagesPerKeyword: 5,
    maxCandidates: 5000,
    minPrice: 0,
    maxPrice: 500,
    minRating: 0,
    minReviews: 0,
    reuseDays: 60,
    excludeAlreadyListed: true,
    excludeFashion: true,
    excludeSponsored: true,
    requireInStock: true,
    navigationDelayMs: 2200
  });

  const FASHION_RE = /\b(?:apparel|bikini|blouse|boot|boots|boxers?|bra|bras|briefs?|clogs?|clothing|coat|cosplay|costumes?|crossbody|dress|dresses|fashion|handbags?|hoodie|jackets?|jeans|leggings|lingerie|outfits?|pants|purse|purses|sandals?|shirts?|shoes?|shorts?|skirt|slippers?|sneakers?|socks?|sweater|swimsuit|t-?shirt|underwear|wallets?)\b/i;
  const UNAVAILABLE_RE = /\b(?:currently unavailable|temporarily out of stock|out of stock|not available|unavailable)\b/i;
  const AVAILABLE_RE = /\b(?:in stock|available to ship|only \d+ left)\b/i;

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSearchText(value) {
    return normalizeText(value).toLowerCase();
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback));
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const parsed = Number(value);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback));
  }

  function normalizeSettings(input = {}) {
    const minPrice = clampNumber(input.minPrice, 0, 100000, DEFAULT_SETTINGS.minPrice);
    const maxPrice = clampNumber(input.maxPrice, minPrice, 100000, DEFAULT_SETTINGS.maxPrice);
    return Object.freeze({
      computerLabel: normalizeText(input.computerLabel).slice(0, 40),
      desiredReady: clampInteger(input.desiredReady, 1, 2000, DEFAULT_SETTINGS.desiredReady),
      maxPagesPerKeyword: clampInteger(input.maxPagesPerKeyword, 1, 20, DEFAULT_SETTINGS.maxPagesPerKeyword),
      maxCandidates: clampInteger(input.maxCandidates, 100, 20000, DEFAULT_SETTINGS.maxCandidates),
      minPrice,
      maxPrice,
      minRating: clampNumber(input.minRating, 0, 5, DEFAULT_SETTINGS.minRating),
      minReviews: clampInteger(input.minReviews, 0, 10000000, DEFAULT_SETTINGS.minReviews),
      reuseDays: clampInteger(input.reuseDays, 0, 365, DEFAULT_SETTINGS.reuseDays),
      excludeAlreadyListed: input.excludeAlreadyListed !== false,
      excludeFashion: input.excludeFashion !== false,
      excludeSponsored: input.excludeSponsored !== false,
      requireInStock: input.requireInStock !== false,
      navigationDelayMs: clampInteger(input.navigationDelayMs, 1000, 15000, DEFAULT_SETTINGS.navigationDelayMs)
    });
  }

  function sanitizeKeywords(value) {
    const input = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
    const seen = new Set();
    const keywords = [];
    for (const entry of input) {
      const keyword = normalizeText(entry);
      const key = normalizeSearchText(keyword);
      if (!keyword || seen.has(key)) continue;
      seen.add(key);
      keywords.push(keyword.slice(0, 240));
    }
    return keywords;
  }

  function extractAsin(value) {
    const text = String(value || '');
    const patterns = [
      /\b(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|\b)/i,
      /\bASIN\s*[:#-]?\s*([A-Z0-9]{10})\b/i,
      /^\s*([A-Z0-9]{10})\s*$/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].toUpperCase();
    }
    return '';
  }

  function decodeSkuToAsin(value) {
    const text = normalizeText(value);
    if (/^[A-Z0-9]{10}$/i.test(text)) return text.toUpperCase();
    if (!/^[A-Za-z0-9+/_=-]{8,80}$/.test(text)) return '';
    try {
      const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      let decoded = '';
      if (typeof atob === 'function') decoded = atob(padded);
      else if (typeof Buffer !== 'undefined') decoded = Buffer.from(padded, 'base64').toString('utf8');
      decoded = normalizeText(decoded);
      return /^[A-Z0-9]{10}$/i.test(decoded) ? decoded.toUpperCase() : '';
    } catch {
      return '';
    }
  }

  function normalizeListingTitle(value) {
    return normalizeSearchText(value)
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeEbayListingRecord(input = {}) {
    const itemId = String(input.itemId || input.itemNumber || '').replace(/\D/g, '');
    const sku = normalizeText(input.sku || input.customLabel);
    const title = normalizeText(input.title);
    return {
      itemId: /^\d{9,15}$/.test(itemId) ? itemId : '',
      title,
      titleKey: normalizeListingTitle(title),
      sku,
      asin: extractAsin(input.asin) || decodeSkuToAsin(sku),
      price: parsePrice(input.price)
    };
  }

  function buildEbayListingIndex(recordsInput, metadata = {}, now = new Date().toISOString()) {
    const records = [];
    const seen = new Set();
    const asins = {};
    const titles = {};
    for (const input of recordsInput || []) {
      const record = normalizeEbayListingRecord(input);
      if (!record.itemId || seen.has(record.itemId)) continue;
      seen.add(record.itemId);
      records.push(record);
      const compact = {
        itemId: record.itemId,
        title: record.title,
        sku: record.sku,
        asin: record.asin,
        price: record.price
      };
      if (record.asin) (asins[record.asin] ||= []).push(compact);
      if (record.titleKey.length >= 12) (titles[record.titleKey] ||= []).push(compact);
    }
    const expected = Number(metadata.totalListings);
    const totalListings = Number.isFinite(expected) && expected >= 0 ? Math.round(expected) : records.length;
    const verified = metadata.verified !== false && totalListings === records.length;
    return {
      schemaVersion: 1,
      verified,
      source: normalizeText(metadata.source || 'ebay-active-listings'),
      computerLabel: normalizeText(metadata.computerLabel),
      accountLabel: normalizeText(metadata.accountLabel),
      scannedAt: normalizeText(metadata.scannedAt) || now,
      totalListings,
      recordCount: records.length,
      asinCount: Object.keys(asins).length,
      titleCount: Object.keys(titles).length,
      asins,
      titles
    };
  }

  function findAlreadyListedMatch(productInput, index) {
    if (!index?.verified) return null;
    const product = normalizeProduct(productInput);
    const asinMatches = product.asin ? index.asins?.[product.asin] : null;
    if (Array.isArray(asinMatches) && asinMatches.length) {
      return { type: 'asin', confidence: 'exact', records: asinMatches.slice(0, 20) };
    }
    const titleKey = normalizeListingTitle(product.title);
    const titleMatches = titleKey.length >= 12 ? index.titles?.[titleKey] : null;
    if (Array.isArray(titleMatches) && titleMatches.length) {
      return { type: 'title', confidence: 'review', records: titleMatches.slice(0, 20) };
    }
    return null;
  }

  function parseCsvRows(value) {
    const text = String(value || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') {
        row.push(cell);
        cell = '';
      } else if (char === '\n') {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        cell = '';
      } else cell += char;
    }
    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
    }
    return rows.filter((entry) => entry.some((cellValue) => normalizeText(cellValue)));
  }

  function parseEbayActiveListingsCsv(value) {
    const rows = parseCsvRows(value);
    if (rows.length < 2) throw new Error('The eBay report does not contain any listing rows.');
    const headers = rows[0].map((header) => normalizeSearchText(header).replace(/[^a-z0-9]+/g, ' ').trim());
    const indexFor = (...patterns) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    const itemIndex = indexFor(/^item (?:number|id)$/, /^itemid$/, /^listing id$/);
    const titleIndex = indexFor(/^title$/, /^listing title$/);
    const skuIndex = indexFor(/custom label/, /^sku$/);
    const priceIndex = indexFor(/^current price$/, /^buy it now price$/, /^price$/);
    if (itemIndex < 0 || titleIndex < 0) {
      throw new Error('Choose eBay\'s Active Listings CSV. Its Item number and Title columns were not found.');
    }
    const records = [];
    let skipped = 0;
    for (const row of rows.slice(1)) {
      const itemId = String(row[itemIndex] || '').replace(/\D/g, '');
      if (!/^\d{9,15}$/.test(itemId)) {
        skipped += 1;
        continue;
      }
      const sku = normalizeText(row[skuIndex] || '').replace(/^="(.*)"$/, '$1');
      records.push(normalizeEbayListingRecord({
        itemId,
        title: row[titleIndex],
        sku,
        price: row[priceIndex]
      }));
    }
    if (!records.length) throw new Error('No valid active eBay item numbers were found in the report.');
    return { records, skipped, headers: rows[0].map(normalizeText) };
  }

  function canonicalAmazonUrl(value, asinValue = '') {
    const asin = extractAsin(asinValue) || extractAsin(value);
    if (!asin) return '';
    let hostname = 'www.amazon.com';
    try {
      const parsed = new URL(String(value || ''));
      if (/(?:^|\.)amazon\.[a-z.]+$/i.test(parsed.hostname)) hostname = parsed.hostname;
    } catch {
      // Raw ASINs use the US Amazon hostname.
    }
    return `https://${hostname}/dp/${asin}`;
  }

  function parsePrice(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
    const text = normalizeText(value).replace(/,/g, '');
    const match = text.match(/(?:US\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
  }

  function parseRating(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.min(5, Math.max(0, Math.round(value * 10) / 10));
    const match = normalizeText(value).match(/(\d(?:\.\d)?)\s*(?:out of 5|stars?)?/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 5 ? Math.round(parsed * 10) / 10 : null;
  }

  function parseCount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
    const text = normalizeText(value).replace(/,/g, '');
    const match = text.match(/(\d+(?:\.\d+)?)\s*([km])?/i);
    if (!match) return null;
    const multiplier = match[2]?.toLowerCase() === 'm' ? 1000000 : match[2]?.toLowerCase() === 'k' ? 1000 : 1;
    const parsed = Number(match[1]) * multiplier;
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  }

  function normalizeProduct(input = {}) {
    const asin = extractAsin(input.asin) || extractAsin(input.url);
    const url = canonicalAmazonUrl(input.url, asin);
    const title = normalizeText(input.title);
    const brand = normalizeText(input.brand);
    const categories = Array.isArray(input.categories)
      ? input.categories.map(normalizeText).filter(Boolean)
      : [normalizeText(input.categories)].filter(Boolean);
    const bullets = Array.isArray(input.bullets)
      ? input.bullets.map(normalizeText).filter(Boolean)
      : [normalizeText(input.bullets)].filter(Boolean);
    const details = normalizeText(input.details).slice(0, 24000);
    const availability = normalizeText(input.availability);
    const price = parsePrice(input.price);
    const rating = parseRating(input.rating);
    const reviewCount = parseCount(input.reviewCount);
    const evidenceText = normalizeText([title, brand, categories.join(' '), bullets.join(' '), details].join(' '));
    return {
      asin,
      url,
      title,
      brand,
      categories,
      bullets,
      details,
      availability,
      price,
      rating,
      reviewCount,
      imageUrl: normalizeText(input.imageUrl),
      keyword: normalizeText(input.keyword),
      searchPage: clampInteger(input.searchPage, 0, 1000, 0),
      sponsored: Boolean(input.sponsored),
      evidenceText,
      capturedAt: normalizeText(input.capturedAt) || new Date().toISOString()
    };
  }

  function isFashionProduct(product) {
    const normalized = normalizeProduct(product);
    return FASHION_RE.test([normalized.title, normalized.categories.join(' ')].join(' '));
  }

  function availabilityState(value) {
    const text = normalizeText(value);
    if (!text) return 'unknown';
    if (UNAVAILABLE_RE.test(text)) return 'unavailable';
    if (AVAILABLE_RE.test(text)) return 'available';
    return 'unknown';
  }

  function recentHistoryMatch(historyEntry, nowValue, reuseDays) {
    if (!historyEntry || reuseDays <= 0) return false;
    const usedAt = Date.parse(historyEntry.usedAt || historyEntry.copiedAt || historyEntry.updatedAt || '');
    const now = Date.parse(nowValue || new Date().toISOString());
    if (!Number.isFinite(usedAt) || !Number.isFinite(now)) return false;
    return now - usedAt < reuseDays * 86400000;
  }

  function policyRow(product) {
    const normalized = normalizeProduct(product);
    return {
      index: 1,
      input: normalizeText([normalized.title, normalized.brand, normalized.categories.join(' '), normalized.bullets.join(' '), normalized.details, normalized.url].join(' ')),
      title: normalized.evidenceText,
      urls: normalized.url ? [normalized.url] : [],
      amazonUrls: normalized.url ? [normalized.url] : [],
      asins: normalized.asin ? [normalized.asin] : [],
      urlSearchText: '',
      hasProductEvidence: Boolean(normalized.asin && normalized.title)
    };
  }

  function outcome(status, reason, product, policyResult = null) {
    return {
      ...normalizeProduct(product),
      status,
      reason: normalizeText(reason),
      policyMatches: Array.isArray(policyResult?.matches) ? policyResult.matches : [],
      policyAction: normalizeText(policyResult?.action)
    };
  }

  function classifyProduct(productInput, rulePack, settingsInput, historyEntry, options = {}) {
    const product = normalizeProduct(productInput);
    const settings = normalizeSettings(settingsInput);
    const phase = options.phase === 'detail' ? 'detail' : 'search';
    const policyApi = options.policyApi || globalThis.GLDN_LISTING_PREFLIGHT;
    const now = options.now || new Date().toISOString();

    if (!product.asin) return outcome(STATUS.INCOMPLETE, 'Amazon did not provide a valid ASIN.', product);
    if (!product.title) return outcome(STATUS.INCOMPLETE, 'Amazon did not provide a product title.', product);
    if (recentHistoryMatch(historyEntry, now, settings.reuseDays)) {
      return outcome(STATUS.EXCLUDED, `This ASIN was already copied within the last ${settings.reuseDays} days.`, product);
    }
    if (settings.excludeAlreadyListed) {
      const listingMatch = findAlreadyListedMatch(product, options.ebayIndex);
      const first = listingMatch?.records?.[0];
      if (listingMatch?.type === 'asin') {
        return {
          ...outcome(STATUS.EXCLUDED, `Already active on eBay as item ${first?.itemId || 'unknown'} (exact SKU/ASIN match).`, product),
          ebayListingMatch: listingMatch
        };
      }
      if (listingMatch?.type === 'title') {
        return {
          ...outcome(STATUS.REVIEW, `Possible eBay duplicate: exact normalized title matches item ${first?.itemId || 'unknown'}. Review before listing.`, product),
          ebayListingMatch: listingMatch
        };
      }
    }
    if (settings.excludeFashion && isFashionProduct(product)) {
      return outcome(STATUS.EXCLUDED, 'Excluded by the clothing, shoes, or fashion filter.', product);
    }
    if (settings.excludeSponsored && product.sponsored) {
      return outcome(STATUS.EXCLUDED, 'Excluded because this is a sponsored Amazon result.', product);
    }
    if (product.price !== null && (product.price < settings.minPrice || product.price > settings.maxPrice)) {
      return outcome(STATUS.EXCLUDED, `Amazon price is outside the configured $${settings.minPrice.toFixed(2)} to $${settings.maxPrice.toFixed(2)} range.`, product);
    }

    if (!policyApi || typeof policyApi.evaluateRows !== 'function') {
      return outcome(STATUS.REVIEW, 'The reviewed eBay policy engine is unavailable.', product);
    }
    const [policyResult] = policyApi.evaluateRows([policyRow(product)], rulePack || { rules: [] });
    if (policyResult?.action === 'block') return outcome(STATUS.BLOCKED, policyResult.reason, product, policyResult);
    if (policyResult?.action === 'review') return outcome(STATUS.REVIEW, policyResult.reason, product, policyResult);

    if (phase === 'search') return outcome(STATUS.QUEUED, 'Search evidence passed. Full Amazon product details are queued.', product, policyResult);

    if (product.price === null) return outcome(STATUS.INCOMPLETE, 'Amazon did not expose a usable product price.', product, policyResult);
    if (settings.minRating > 0 && product.rating === null) return outcome(STATUS.REVIEW, 'Amazon rating could not be verified.', product, policyResult);
    if (product.rating !== null && product.rating < settings.minRating) {
      return outcome(STATUS.EXCLUDED, `Amazon rating ${product.rating.toFixed(1)} is below the configured ${settings.minRating.toFixed(1)} minimum.`, product, policyResult);
    }
    if (settings.minReviews > 0 && product.reviewCount === null) return outcome(STATUS.REVIEW, 'Amazon review count could not be verified.', product, policyResult);
    if (product.reviewCount !== null && product.reviewCount < settings.minReviews) {
      return outcome(STATUS.EXCLUDED, `Amazon review count ${product.reviewCount} is below the configured ${settings.minReviews} minimum.`, product, policyResult);
    }
    const stockState = availabilityState(product.availability);
    if (stockState === 'unavailable') return outcome(STATUS.EXCLUDED, 'Amazon reports this product as unavailable.', product, policyResult);
    if (settings.requireInStock && stockState === 'unknown') {
      return outcome(STATUS.REVIEW, 'Amazon availability could not be verified as in stock.', product, policyResult);
    }
    if (product.evidenceText.length < 20) {
      return outcome(STATUS.INCOMPLETE, 'Amazon did not expose enough product evidence for policy screening.', product, policyResult);
    }
    return outcome(STATUS.READY, 'No current reviewed rule matched the collected Amazon product evidence. This is not eBay approval.', product, policyResult);
  }

  function emptyCounts() {
    return { queued: 0, ready: 0, review: 0, blocked: 0, excluded: 0, incomplete: 0 };
  }

  function summarizeProducts(products) {
    const counts = emptyCounts();
    for (const product of products || []) {
      if (Object.hasOwn(counts, product?.status)) counts[product.status] += 1;
    }
    return counts;
  }

  function createJob(input = {}, now = new Date().toISOString()) {
    const keywords = sanitizeKeywords(input.keywords);
    if (!keywords.length) throw new Error('Enter at least one product keyword.');
    const settings = normalizeSettings(input.settings);
    const id = normalizeText(input.id) || `hunt-${Date.parse(now) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      schemaVersion: 1,
      id,
      createdAt: now,
      updatedAt: now,
      status: 'running',
      phase: 'search',
      settings,
      keywords,
      keywordIndex: 0,
      searchPage: 1,
      detailIndex: 0,
      productAsins: [],
      counts: emptyCounts(),
      workerTabId: null,
      workerWindowId: Number.isInteger(input.workerWindowId) ? input.workerWindowId : null,
      pendingNavigation: null,
      navigationFailures: 0,
      lastError: '',
      pauseReason: '',
      completionReason: ''
    };
  }

  function markHistory(historyInput, products, context = {}, now = new Date().toISOString()) {
    const history = { ...(historyInput || {}) };
    for (const product of products || []) {
      const normalized = normalizeProduct(product);
      if (!normalized.asin) continue;
      history[normalized.asin] = {
        usedAt: now,
        title: normalized.title,
        keyword: normalized.keyword,
        jobId: normalizeText(context.jobId),
        computerLabel: normalizeText(context.computerLabel)
      };
    }
    return history;
  }

  function pruneHistory(historyInput, now = new Date().toISOString(), keepDays = 400) {
    const history = {};
    const cutoff = Date.parse(now) - keepDays * 86400000;
    for (const [asin, entry] of Object.entries(historyInput || {})) {
      const usedAt = Date.parse(entry?.usedAt || '');
      if (Number.isFinite(usedAt) && usedAt >= cutoff) history[asin] = entry;
    }
    return history;
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function buildAuditCsv(products) {
    const headers = ['Status', 'ASIN', 'Title', 'Brand', 'Amazon Price', 'Rating', 'Review Count', 'Availability', 'Keyword', 'Search Page', 'Reason', 'eBay Listing Match', 'Policy Sources', 'Amazon URL'];
    const rows = (products || []).map((product) => {
      const sources = (product.policyMatches || [])
        .flatMap((match) => match.evidenceUrls || [])
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' | ');
      return [
        product.status,
        product.asin,
        product.title,
        product.brand,
        product.price === null || product.price === undefined ? '' : Number(product.price).toFixed(2),
        product.rating === null || product.rating === undefined ? '' : Number(product.rating).toFixed(1),
        product.reviewCount === null || product.reviewCount === undefined ? '' : Number(product.reviewCount),
        product.availability,
        product.keyword,
        product.searchPage,
        product.reason,
        product.ebayListingMatch?.records?.map((record) => record.itemId).filter(Boolean).join(' | ') || '',
        sources,
        canonicalAmazonUrl(product.url, product.asin)
      ].map(csvCell).join(',');
    });
    return [headers.join(','), ...rows].join('\r\n');
  }

  function readyLinks(products) {
    const seen = new Set();
    const links = [];
    for (const product of products || []) {
      if (product?.status !== STATUS.READY) continue;
      const url = canonicalAmazonUrl(product.url, product.asin);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      links.push(url);
    }
    return links;
  }

  return Object.freeze({
    STATUS,
    DEFAULT_SETTINGS,
    normalizeText,
    normalizeSearchText,
    normalizeSettings,
    sanitizeKeywords,
    extractAsin,
    decodeSkuToAsin,
    normalizeListingTitle,
    normalizeEbayListingRecord,
    buildEbayListingIndex,
    findAlreadyListedMatch,
    parseCsvRows,
    parseEbayActiveListingsCsv,
    canonicalAmazonUrl,
    parsePrice,
    parseRating,
    parseCount,
    normalizeProduct,
    isFashionProduct,
    availabilityState,
    recentHistoryMatch,
    policyRow,
    classifyProduct,
    emptyCounts,
    summarizeProducts,
    createJob,
    markHistory,
    pruneHistory,
    buildAuditCsv,
    readyLinks
  });
});
