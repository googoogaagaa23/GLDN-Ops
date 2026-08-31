(function (root, factory) {
  const api = factory(root.GLDN_PRODUCT_HUNTER_CORE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_PRODUCT_HUNTER_AMAZON = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  const normalizeText = core?.normalizeText || ((value) => String(value || '').replace(/\s+/g, ' ').trim());

  function firstText(container, selectors) {
    for (const selector of selectors) {
      const element = container.querySelector(selector);
      const text = normalizeText(element?.textContent || element?.getAttribute?.('aria-label'));
      if (text) return text;
    }
    return '';
  }

  function firstAttribute(container, selectors, attribute) {
    for (const selector of selectors) {
      const element = container.querySelector(selector);
      const value = normalizeText(element?.getAttribute?.(attribute));
      if (value) return value;
    }
    return '';
  }

  function absoluteUrl(value, baseUrl) {
    try {
      return new URL(String(value || ''), String(baseUrl || 'https://www.amazon.com/')).toString();
    } catch {
      return '';
    }
  }

  function robotCheck(documentRef) {
    if (!documentRef) return { blocked: true, reason: 'Amazon document is unavailable.' };
    const title = normalizeText(documentRef.title);
    const body = normalizeText(documentRef.body?.innerText).slice(0, 6000);
    const hasCaptcha = Boolean(documentRef.querySelector('form[action*="validateCaptcha"], #captchacharacters, img[src*="captcha"]'));
    const blocked = hasCaptcha || /robot check|enter the characters you see|sorry, we just need to make sure you(?:'|’)re not a robot/i.test(`${title} ${body}`);
    return {
      blocked,
      reason: blocked ? 'Amazon displayed a robot or CAPTCHA check. Complete it manually, then resume.' : ''
    };
  }

  function pageSignals(documentRef, locationHref = '') {
    const url = new URL(String(locationHref || 'https://www.amazon.com/'));
    const path = url.pathname.toLowerCase();
    return {
      url: url.toString(),
      hostname: url.hostname,
      searchPage: path === '/s' || url.searchParams.has('k'),
      productPage: /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(url.pathname),
      robot: robotCheck(documentRef)
    };
  }

  function extractSearchPage(documentRef, locationHref = '') {
    const signals = pageSignals(documentRef, locationHref);
    if (signals.robot.blocked) return { ok: false, robot: true, error: signals.robot.reason, products: [] };

    const url = new URL(signals.url);
    const keyword = normalizeText(url.searchParams.get('k') || '');
    const searchPage = Number.parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const selectors = [
      '[data-component-type="s-search-result"][data-asin]',
      '[data-cel-widget^="search_result_"][data-asin]'
    ];
    const cards = [...new Set(selectors.flatMap((selector) => [...documentRef.querySelectorAll(selector)]))];
    const seen = new Set();
    const products = [];

    for (const card of cards) {
      const asin = normalizeText(card.getAttribute('data-asin')).toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
      const title = firstText(card, [
        '[data-cy="title-recipe"] h2 span',
        'h2 a span',
        'h2 span',
        '.a-size-base-plus.a-color-base.a-text-normal'
      ]);
      if (!title) continue;
      const href = firstAttribute(card, [
        '[data-cy="title-recipe"] h2 a[href]',
        'h2 a[href]',
        'a.a-link-normal.s-no-outline[href]'
      ], 'href');
      const price = firstText(card, ['.a-price .a-offscreen', '[data-a-color="price"] .a-offscreen', '.a-price-whole']);
      const rating = firstText(card, ['i.a-icon-star-small span.a-icon-alt', 'i.a-icon-star span.a-icon-alt', '[aria-label*="out of 5 stars"]']);
      const reviewCount = firstText(card, ['a[href*="#customerReviews"] span.a-size-base', 'a[href*="customerReviews"] span.a-size-base', '[data-csa-c-slot-id="alf-reviews"]']);
      const imageUrl = firstAttribute(card, ['img.s-image', 'img[data-image-latency]'], 'src');
      const cardText = normalizeText(card.textContent);
      seen.add(asin);
      products.push({
        asin,
        url: absoluteUrl(href || `/dp/${asin}`, signals.url),
        title,
        brand: '',
        categories: [],
        bullets: [],
        details: '',
        availability: '',
        price,
        rating,
        reviewCount,
        imageUrl,
        keyword,
        searchPage,
        sponsored: /\bsponsored\b/i.test(cardText),
        capturedAt: new Date().toISOString()
      });
    }

    const nextLink = documentRef.querySelector('a.s-pagination-next:not(.s-pagination-disabled), a[aria-label="Go to next page"]');
    const noResults = /no results for|did not match any products/i.test(normalizeText(documentRef.body?.innerText).slice(0, 10000));
    return {
      ok: true,
      robot: false,
      keyword,
      searchPage,
      products,
      hasNextPage: Boolean(nextLink) && !noResults,
      noResults
    };
  }

  function cleanBrand(value) {
    return normalizeText(value)
      .replace(/^visit the\s+/i, '')
      .replace(/\s+store$/i, '')
      .replace(/^brand\s*:\s*/i, '');
  }

  function collectTexts(documentRef, selectors, limit = 100) {
    const values = [];
    for (const selector of selectors) {
      for (const element of documentRef.querySelectorAll(selector)) {
        const text = normalizeText(element.textContent);
        if (!text || values.includes(text)) continue;
        values.push(text);
        if (values.length >= limit) return values;
      }
    }
    return values;
  }

  function buyBoxField(documentRef, label) {
    const normalizedLabel = normalizeText(label).toLowerCase();
    const rows = documentRef.querySelectorAll('#tabular-buybox tr, #desktop_buybox tr, #buybox tr');
    for (const row of rows) {
      const cells = [...row.querySelectorAll('th, td, .a-column')].map((cell) => normalizeText(cell.textContent)).filter(Boolean);
      const labelIndex = cells.findIndex((cell) => cell.toLowerCase() === normalizedLabel || cell.toLowerCase().startsWith(`${normalizedLabel} `));
      if (labelIndex >= 0 && cells[labelIndex + 1]) return cells[labelIndex + 1];
      const text = normalizeText(row.textContent);
      const match = text.match(new RegExp(`^${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s+(.+)$`, 'i'));
      if (match) return normalizeText(match[1]);
    }
    return '';
  }

  function merchantField(merchantInfo, label, stopLabel) {
    const text = normalizeText(merchantInfo);
    if (!text) return '';
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedStop = stopLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escapedLabel}\\s+(.+?)(?=\\s+${escapedStop}\\s+|$)`, 'i'));
    return normalizeText(match?.[1]);
  }

  function extractProductPage(documentRef, locationHref = '') {
    const signals = pageSignals(documentRef, locationHref);
    if (signals.robot.blocked) return { ok: false, robot: true, error: signals.robot.reason };

    const urlAsin = core?.extractAsin?.(signals.url) || '';
    const asin = normalizeText(documentRef.querySelector('#ASIN')?.value || documentRef.querySelector('[data-asin]')?.getAttribute('data-asin') || urlAsin).toUpperCase();
    const title = firstText(documentRef, ['#productTitle', '#title', 'h1.a-size-large']);
    const brand = cleanBrand(firstText(documentRef, ['#bylineInfo', '#brand', 'tr.po-brand td.a-span9', '#productOverview_feature_div tr.a-spacing-small:first-child td:last-child']));
    const price = firstText(documentRef, [
      '#corePrice_feature_div .a-price .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#apex_desktop .a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.a-price[data-a-size="xl"] .a-offscreen'
    ]);
    const availability = firstText(documentRef, ['#availability', '#outOfStock', '#deliveryBlockMessage', '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE']);
    const rating = firstText(documentRef, ['#acrPopover', '#averageCustomerReviews [title]', '[data-hook="rating-out-of-text"]']);
    const reviewCount = firstText(documentRef, ['#acrCustomerReviewText', '[data-hook="total-review-count"]']);
    const merchantInfo = firstText(documentRef, ['#merchantInfo', '#tabular-buybox', '#desktop_buybox', '#buybox']);
    const soldBy = firstText(documentRef, ['#sellerProfileTriggerId', '#merchant-info a[href*="seller"]'])
      || buyBoxField(documentRef, 'Sold by')
      || merchantField(merchantInfo, 'Sold by', 'Ships from');
    const shipsFrom = buyBoxField(documentRef, 'Ships from')
      || merchantField(merchantInfo, 'Ships from', 'Sold by');
    const categories = collectTexts(documentRef, ['#wayfinding-breadcrumbs_feature_div li a', '#wayfinding-breadcrumbs_container li a'], 20);
    const bullets = collectTexts(documentRef, ['#feature-bullets li span.a-list-item', '#featurebullets_feature_div li span'], 50);
    const detailParts = collectTexts(documentRef, [
      '#productOverview_feature_div tr',
      '#productDetails_feature_div tr',
      '#detailBullets_feature_div li',
      '#variation_color_name',
      '#variation_size_name',
      '#variation_style_name',
      '#twister_feature_div'
    ], 120);
    const imageUrl = firstAttribute(documentRef, ['#landingImage', '#imgBlkFront', '#main-image'], 'src');

    return {
      ok: Boolean(asin && title),
      robot: false,
      product: {
        asin,
        url: core?.canonicalAmazonUrl?.(signals.url, asin) || signals.url,
        title,
        brand,
        categories,
        bullets,
        details: detailParts.join(' | '),
        availability,
        price,
        rating,
        reviewCount,
        soldBy,
        shipsFrom,
        merchantInfo,
        imageUrl,
        capturedAt: new Date().toISOString()
      },
      error: asin && title ? '' : 'Amazon product details did not include both an ASIN and title.'
    };
  }

  function installRuntimeBridge() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage || typeof document === 'undefined') return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'hunterExtractSearchPage') {
        sendResponse(extractSearchPage(document, location.href));
        return false;
      }
      if (message?.type === 'hunterExtractProductPage') {
        sendResponse(extractProductPage(document, location.href));
        return false;
      }
      if (message?.type === 'hunterPageSignals') {
        sendResponse(pageSignals(document, location.href));
        return false;
      }
      return false;
    });

    chrome.runtime.sendMessage({
      type: 'hunterAmazonPageReady',
      url: location.href,
      title: document.title
    }).catch(() => {});
  }

  installRuntimeBridge();

  return Object.freeze({
    absoluteUrl,
    robotCheck,
    pageSignals,
    extractSearchPage,
    extractProductPage
  });
});
