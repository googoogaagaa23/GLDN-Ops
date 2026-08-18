(function () {
  'use strict';

  const CORE = globalThis.GLDN_PRODUCT_HUNTER_CORE;

  function clean(value) {
    return CORE?.normalizeText ? CORE.normalizeText(value) : String(value || '').replace(/\s+/g, ' ').trim();
  }

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function itemIdFromHref(href) {
    const match = String(href || '').match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})(?:[/?#]|$)/i);
    return match?.[1] || '';
  }

  function interruptionText(bodyText) {
    return /Pardon Our Interruption|made us think you were a bot|verify you are human|captcha/i.test(bodyText);
  }

  function pageRange(bodyText, expectedStart) {
    const ranges = [...String(bodyText || '').matchAll(/Results?:\s*([\d,]+)\s*[-\u2012\u2013\u2014]\s*([\d,]+)\s+of\s+([\d,]+)/gi)]
      .map((match) => ({
        start: Number(match[1].replace(/,/g, '')),
        end: Number(match[2].replace(/,/g, '')),
        total: Number(match[3].replace(/,/g, ''))
      }))
      .filter((entry) => entry.start >= 1 && entry.end >= entry.start && entry.total >= entry.start);
    return ranges.find((entry) => entry.start === expectedStart)
      || ranges.find((entry) => expectedStart >= entry.start && expectedStart <= Math.min(entry.end, entry.total))
      || null;
  }

  function headerMap() {
    const headers = [...document.querySelectorAll('thead th, [role="columnheader"]')].filter(visible);
    const map = {};
    headers.forEach((header, index) => {
      const text = clean(header.innerText || header.textContent).toLowerCase();
      if (/custom label|\bsku\b/.test(text)) map.sku = index;
      if (/current price|buy it now|price/.test(text) && map.price === undefined) map.price = index;
    });
    return map;
  }

  function cellAt(row, index) {
    if (!Number.isInteger(index)) return null;
    const cells = [...row.querySelectorAll(':scope > td, :scope > [role="gridcell"]')];
    return cells[index] || null;
  }

  function extractSku(row, rowText, columns) {
    const labelled = rowText.match(/Custom label\s*\(SKU\)\s*:?\s*([A-Za-z0-9+/=_-]+)/i);
    if (labelled?.[1]) return clean(labelled[1]);
    const skuCell = cellAt(row, columns.sku);
    const value = clean(skuCell?.innerText || skuCell?.textContent || '');
    if (/^[A-Za-z0-9+/=_-]{8,80}$/.test(value)) return value;
    return '';
  }

  function accountLabel() {
    const userLink = [...document.querySelectorAll("a[href*='/usr/'], a[href*='/str/']")]
      .filter(visible)
      .find((anchor) => {
        const text = clean(anchor.innerText || anchor.textContent);
        return text && text.length <= 80 && !/^(Store|Shop|Visit store)$/i.test(text);
      });
    if (userLink) return clean(userLink.innerText || userLink.textContent).replace(/\s*\(.*$/, '');

    const sellerHubHeading = [...document.querySelectorAll('h1, h2, [aria-label*="Seller Hub" i]')]
      .filter(visible)
      .map((element) => clean(element.innerText || element.textContent))
      .find((text) => /^Seller Hub\s+\S+/i.test(text) && text.length < 100);
    return clean(String(sellerHubHeading || '').match(/^Seller Hub\s+([^\s(]+)/i)?.[1] || '');
  }

  function inspectActiveListingsPage(expectedOffset) {
    const bodyText = String(document.body?.innerText || '');
    const expectedStart = Math.max(0, Number(expectedOffset || 0)) + 1;
    const range = pageRange(bodyText, expectedStart);
    const columns = headerMap();
    const records = [];
    const seen = new Set();

    for (const row of [...document.querySelectorAll('tbody tr, [role="row"]')]) {
      if (!visible(row)) continue;
      const rowText = String(row.innerText || row.textContent || '');
      const itemLink = [...row.querySelectorAll("a[href*='/itm/']")]
        .find((anchor) => /^\d{9,15}$/.test(itemIdFromHref(anchor.href)));
      let itemId = itemIdFromHref(itemLink?.href);
      if (!itemId) itemId = rowText.match(/Buy It Now\s*[\u00b7\u2022-]?\s*(\d{9,15})/i)?.[1] || '';
      if (!itemId) {
        const candidates = [...rowText.matchAll(/\b(\d{11,14})\b/g)].map((match) => match[1]);
        itemId = candidates.at(-1) || '';
      }
      if (!/^\d{9,15}$/.test(itemId) || seen.has(itemId)) continue;
      if (!row.querySelector("input[type='checkbox'], [role='checkbox']")) continue;
      seen.add(itemId);
      const title = clean(itemLink?.innerText || itemLink?.textContent || [...row.querySelectorAll('a')]
        .map((anchor) => clean(anchor.innerText || anchor.textContent))
        .find((value) => value.length >= 8 && !/^(Edit|Restock|View message|Research prices|Add or review discounts)$/i.test(value)) || '');
      const priceCell = cellAt(row, columns.price);
      const priceText = clean(priceCell?.innerText || priceCell?.textContent || rowText);
      const price = CORE?.parsePrice ? CORE.parsePrice(priceText) : null;
      const sku = extractSku(row, rowText, columns);
      records.push({ itemId, title, sku, asin: CORE?.decodeSkuToAsin?.(sku) || '', price });
    }

    const total = Number(range?.total || 0);
    const end = range ? Math.min(range.end, range.total) : 0;
    const expected = range ? Math.max(0, end - range.start + 1) : 0;
    return {
      ok: !interruptionText(bodyText) && Boolean(range) && expected > 0 && records.length === expected,
      interruption: interruptionText(bodyText),
      url: location.href,
      accountLabel: accountLabel(),
      start: Number(range?.start || 0),
      end,
      total,
      expected,
      recordCount: records.length,
      records
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'hunterExtractEbayActivePage') return false;
    if (sender?.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: 'Message sender is not GLDN Product Hunter.' });
      return false;
    }
    try {
      sendResponse(inspectActiveListingsPage(message.expectedOffset));
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
    return false;
  });
})();
