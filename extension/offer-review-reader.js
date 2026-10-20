(() => {
  'use strict';
  const C = globalThis.GLDN_OFFER;
  const visible = e => e && !e.closest('[hidden], [aria-hidden="true"]') && e.getClientRects().length > 0;
  const label = e => C.text(e?.innerText || e?.textContent || e?.getAttribute('aria-label'));
  const elements = selector => [...document.querySelectorAll(selector)].filter(visible).filter(e => !e.closest('[id^="gldn-"]'));
  const body = () => {
    if (!document.getElementById('gldn-offer-inline')) return document.body?.innerText || '';
    const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT), text = [];
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (parent && visible(parent) && !parent.closest('[id^="gldn-"],script,style')) text.push(walker.currentNode.textContent);
    }
    return text.join(' ');
  };
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
    const price = body().match(/Buyer offer:\s*\$?\s*([\d,]+\.\d{2})/i)?.[1];
    const quantity = Number(body().match(/Quantity:\s*(\d+)/i)?.[1] || 1);
    const listing = body().match(/Buy It Now:\s*\$?\s*([\d,]+\.\d{2})/i)?.[1];
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
    if (document.querySelector('#snsAccordionRowMiddle [aria-checked="true"], #snsAccordionRowMiddle input:checked')) throw new Error('Subscribe & Save is selected. Confirm a one-time purchase price manually.');
    const excluded = '[id^="gldn-"],#snsAccordionRowMiddle,#usedBuyBox,#moreBuyingChoices_feature_div,.a-carousel,.pricePerUnit,.price-per-unit,.a-price-unit,.basisPrice,.a-text-price,.a-text-strike';
    const priceValue = element => {
      const box = element.closest('.a-price') || element;
      if (!visible(box) || !visible(element) || element.closest(excluded)) return null;
      const amount = C.cents(label(element),false);
      if (amount !== null) return amount;
      const symbol = label(box.querySelector('.a-price-symbol'));
      const whole = label(box.querySelector('.a-price-whole')).replace(/[.,]$/,'');
      const fraction = label(box.querySelector('.a-price-fraction'));
      return /^(?:\$|US\$)$/.test(symbol) && /^\d[\d,]*$/.test(whole) && /^\d{2}$/.test(fraction) ? C.cents(whole + '.' + fraction,false) : null;
    };
    const roots = ['#corePriceDisplay_desktop_feature_div','#corePrice_feature_div','#apex_desktop','#desktop_buybox','#buybox'].map(selector=>document.querySelector(selector)).filter(Boolean);
    const tiers = [
      '#apex-pricetopay-accessibility-label,.priceToPay .a-offscreen,.apexPriceToPay .a-offscreen,.apex-pricetopay-value .a-offscreen',
      '.priceToPay,.apexPriceToPay,.apex-pricetopay-value',
      '.a-price[data-a-size="xl"] .a-offscreen,.a-price[data-a-size="l"] .a-offscreen',
      '.a-price:not(.a-text-price):not(.a-price-unit):not([data-a-size="mini"]):not([data-a-size="small"]) .a-offscreen'
    ];
    let price = null;
    // Prefer semantic purchase-price markers over unit, list and alternative-offer prices.
    for (const selector of tiers) {
      const prices = [...new Set(roots.flatMap(root=>[...root.querySelectorAll(selector)]).map(priceValue).filter(value=>value !== null))];
      if (prices.length > 1) throw new Error('The primary Amazon purchase price is ambiguous. Enter the one-time purchase price.');
      if (prices.length === 1) { price = prices[0]; break; }
    }
    if (price === null) {
      const legacy = [...new Set([...document.querySelectorAll('#priceblock_ourprice,#priceblock_dealprice,#price_inside_buybox,#newBuyBoxPrice')].map(priceValue).filter(value=>value !== null))];
      if (legacy.length === 1) price = legacy[0];
    }
    if (!title || price === null) throw new Error('One current Amazon product price could not be read. Enter the one-time purchase price.');
    return {asin:args.asin,title,price:(price / 100).toFixed(2),url:location.href,capturedAt:Date.now(),
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
    if (elements('[aria-label="Loading"], [alt="Loading"], [role="progressbar"], [aria-busy="true"]').length) throw new Error('The feedback table is still loading.');
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
    if (!next && Number(total[1].replace(/,/g,'')) > 0) throw new Error('The native feedback pagination could not be recognized.');
    const canNext = Boolean(next && !next.disabled && next.getAttribute('aria-disabled') !== 'true');
    if (action === 'feedback-next') {
      if (!canNext) throw new Error('No next feedback page is available.');
      next.click(); return {changed:true};
    }
    const size = elements('button, a').find(e => /feedback ratings per page/.test(e.getAttribute('aria-label') || '') && (e.getAttribute('selected') === 'true' || e.getAttribute('aria-current') === 'true'));
    return {user:args.user,left:true,total:Number(total[1].replace(/,/g,'')), pageSize:size ? Number(label(size)) : null, start:Number((total[2] || '0').replace(/,/g,'')),
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
