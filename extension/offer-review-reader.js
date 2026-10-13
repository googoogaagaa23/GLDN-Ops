(() => {
  'use strict';
  const C = globalThis.GLDN_OFFER;
  const visible = e => e && !e.closest('[hidden], [aria-hidden="true"]') && e.getClientRects().length > 0;
  const label = e => C.text(e?.innerText || e?.textContent || e?.getAttribute('aria-label'));
  const elements = selector => [...document.querySelectorAll(selector)].filter(visible).filter(e => !e.closest('[id^="gldn-"]'));
  const body = () => document.body?.innerText || '';
  function guard() {
    if (/pardon our interruption|verify yourself|security check|sign in to your account/i.test(body())) throw new Error('Sign-in or verification is required in the reader tab.');
  }
  function snapshotOffer() {
    const identity = C.offer(location.href);
    if (!identity) throw new Error('Open one native eBay Offer Received page.');
    guard();
    if (!/Offer Received|waiting for your response/i.test(body()) || /Counteroffer Submitted|Offer Accepted/i.test(body())) throw new Error('This offer is no longer awaiting a response.');
    const itemLink = elements('a[href]').find(a => C.url(a.href,'ebay.com')?.pathname.match(new RegExp('/itm/(?:[^/]+/)?' + identity.itemId + '(?:/|$)')));
    const member = href => {
      const u = C.url(href,'ebay.com');
      try { return C.feedbackUser(href) || decodeURIComponent(u?.pathname.match(/^\/usr\/([^/]+)\/?$/)?.[1] || '').toLowerCase(); } catch { return ''; }
    };
    const links = elements('a[href]').filter(a => member(a.href));
    const users = [...new Set(links.map(a => member(a.href)))];
    const waiting = body().match(/([^\s]+)\s+is waiting for your response/i)?.[1]?.toLowerCase();
    const user = waiting && users.includes(waiting) ? waiting : (users.length === 1 ? users[0] : '');
    if (!user) throw new Error('One exact buyer feedback link could not be identified.');
    const price = body().match(/Buyer offer:\s*\$?([\d,]+\.\d{2})/i)?.[1];
    const quantity = Number(body().match(/Quantity:\s*(\d+)/i)?.[1] || 1);
    const listing = body().match(/Buy It Now:\s*\$?([\d,]+\.\d{2})/i)?.[1];
    if (C.cents(price,false) === null || !itemLink) throw new Error('Offer price or exact listing link is missing.');
    const sku = body().match(/Custom label\s*\(SKU\)\s*:?\s*([A-Za-z0-9+/=_-]+)/i)?.[1] || '';
    return {...identity, user, price, quantity, listing, title:label(itemLink), sku, asin:C.asin(sku),
      feedbackUrl:'https://feedback.ebay.com/fdbk/feedback_profile/' + encodeURIComponent(user),
      promoted:/offer came from a Promoted Listings ad/i.test(body()), capturedAt:Date.now()};
  }
  function listingSku(args) {
    const u = C.url(location.href,'ebay.com');
    if (!u || u.pathname !== '/sh/lst/active' || u.searchParams.get('keyword') !== args.itemId) throw new Error('Wrong active-listing lookup page.');
    guard();
    const links = elements('a[href]').filter(a => C.url(a.href,'ebay.com')?.pathname.match(new RegExp('/itm/(?:[^/]+/)?' + args.itemId + '(?:/|$)')));
    const rows = [...new Set(links.map(a => a.closest('tr, [role="row"], .listing-row')).filter(Boolean))];
    if (rows.length !== 1) throw new Error('Exact listing row is unavailable. Enter its SKU or Amazon link.');
    const row = rows[0];
    const table = row.closest('table, [role="grid"]');
    const headers = [...(table?.querySelectorAll('thead th, [role="columnheader"]') || [])].map(label);
    const index = headers.findIndex(t => /Custom label|SKU/i.test(t));
    const cells = [...row.querySelectorAll('td, [role="gridcell"]')];
    const labeled = row.querySelector('[data-label*="SKU"], [data-testid*="sku"], [data-label*="Custom label"]');
    const sku = label(labeled) || (index >= 0 ? label(cells[index]) : '') || label(row).match(/Custom label\s*\(SKU\)\s*:?\s*([A-Za-z0-9+/=_-]+)/i)?.[1] || '';
    const asin = C.asin(sku);
    if (!asin) throw new Error('The listing SKU does not decode to one Amazon ASIN. Enter the exact SKU or Amazon link.');
    return {sku,asin};
  }
  function amazon(args) {
    const pageAsin = C.asin(location.href);
    if (!pageAsin || pageAsin !== args.asin) throw new Error('Amazon redirected to a different item.');
    guard();
    const selected = document.querySelector('#ASIN')?.value;
    if (selected && C.asin(selected) !== args.asin) throw new Error('The selected Amazon variation changed.');
    const title = label(document.querySelector('#productTitle'));
    const selectors = ['#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen', '#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice'];
    let prices = [];
    for (const selector of selectors) {
      prices = [...document.querySelectorAll(selector)].filter(e => visible(e.closest('.a-price') || e))
        .map(e => C.cents(label(e),false)).filter(n => n !== null);
      if (prices.length) break;
    }
    const unique = [...new Set(prices)];
    if (!title || unique.length !== 1) throw new Error('One current Amazon product price could not be read. Enter the one-time purchase price.');
    if (document.querySelector('#snsAccordionRowMiddle [aria-checked="true"], #snsAccordionRowMiddle input:checked')) throw new Error('Subscribe & Save is selected. Confirm a one-time purchase price manually.');
    return {asin:args.asin,title,price:(unique[0] / 100).toFixed(2),url:location.href,capturedAt:Date.now(),
      delivery:label(document.querySelector('#deliveryBlockMessage, #mir-layout-DELIVERY_BLOCK')), availability:label(document.querySelector('#availability'))};
  }
  function feedback(args, action) {
    if (C.feedbackUser(location.href) !== args.user) throw new Error('Feedback belongs to a different buyer.');
    guard();
    const left = elements('button, a, [role="tab"]').find(e => /^(?:Feedback )?left for others(?: tab)?$/i.test(e.getAttribute('aria-label') || label(e)));
    const selected = left && (left.getAttribute('selected') === 'true' || left.getAttribute('aria-selected') === 'true' || left.classList.contains('active'));
    if (action === 'feedback-left') {
      if (!left) throw new Error('Left for others is unavailable.');
      if (!selected) left.click();
      return {changed:!selected};
    }
    if (!selected) throw new Error('Left for others is not selected.');
    if (action === 'feedback-size') {
      const size = elements('button, a').find(e => e.getAttribute('aria-label') === 'Click to show 200 feedback ratings per page' || label(e) === '200');
      if (size && size.getAttribute('selected') !== 'true' && size.getAttribute('aria-current') !== 'true') { size.click(); return {changed:true}; }
      return {changed:false};
    }
    const table = document.querySelector('#feedback-cards');
    const total = body().match(/([\d,]+) Feedback left(?:\s*\(viewing\s*([\d,]+)\s*[-\u2013]\s*([\d,]+)\))?/i);
    if (!total || !table) throw new Error('The feedback table is still loading or unrecognized.');
    const rows = [...table.querySelectorAll('tbody tr')].filter(visible).filter(row => row.querySelector('td:nth-child(3)'));
    const entries = rows.map(row => {
      const icon = row.querySelector('[data-test-type], [aria-label$="feedback rating"]');
      const rating = icon?.getAttribute('data-test-type') || icon?.getAttribute('aria-label')?.split(' ')[0]?.toLowerCase() || '';
      return {id:row.getAttribute('data-feedback-id') || '',rating,comment:label(row.querySelector('.card__comment') || row.querySelector('td')),
        seller:label(row.querySelector('.card__from') || row.querySelector('td:nth-child(2)')),when:label(row.querySelector('td:nth-child(3)'))};
    });
    const next = document.querySelector('#next-page') || elements('button, a').find(e => e.getAttribute('aria-label') === 'Next page');
    const canNext = Boolean(next && !next.disabled && next.getAttribute('aria-disabled') !== 'true');
    if (action === 'feedback-next') {
      if (!canNext) throw new Error('No next feedback page is available.');
      next.click(); return {changed:true};
    }
    return {user:args.user,left:true,total:Number(total[1].replace(/,/g,'')), start:Number((total[2] || '0').replace(/,/g,'')),
      end:Number((total[3] || '0').replace(/,/g,'')),rows:entries,next:canNext};
  }
  rootReader();
  function rootReader() {
    globalThis.GLDN_OFFER_READER = (action,args = {}) => {
      if (action === 'offer') return snapshotOffer();
      if (action === 'listing-sku') return listingSku(args);
      if (action === 'amazon') return amazon(args);
      if (/^feedback(?:-left|-size|-next)?$/.test(action)) return feedback(args,action);
      throw new Error('Unknown read-only offer action.');
    };
  }
})();
