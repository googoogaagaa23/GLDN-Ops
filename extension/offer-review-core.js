((root) => {
  'use strict';
  const CHECKED = '2026-10-12';
  const SOURCES = Object.freeze({
    selling: 'https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822',
    store: 'https://www.ebay.com/help/selling/fees-credits-invoices/store-fees?id=4809',
    ads: 'https://www.ebay.com/help/selling/listings/listing-tips/promoted-listings?id=4164',
    discount: 'https://www.ebay.com/help/policies/selling-policies/seller-standards-policy?id=4347'
  });
  const CATEGORIES = Object.freeze({general:'Most categories', media:'Books / Movies / Music (not vinyl)',
    electronics:'Store electronics (not accessory exceptions)', jewelry:'Jewelry (not watches)',
    watches:'Watches / watch parts', guitars:'Guitars / basses', cards:'Selected trading cards / comic books',
    custom:'Other category / custom confirmed rate'});
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  function url(value, domain) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password
      && (u.hostname === domain || u.hostname.endsWith('.' + domain)) ? u : null; } catch { return null; }
  }
  function offer(value) {
    const u = url(value, 'ebay.com');
    const id = u?.pathname.match(/^\/bo\/seller\/reviewOffer\/(\d{9,15})\/?$/i)?.[1];
    const thread = u?.searchParams.get('threadId');
    return id && /^\d+$/.test(thread || '') ? {itemId:id, threadId:thread, key:id + ':' + thread} : null;
  }
  function asin(value) {
    const raw = text(value);
    if (/^[A-Z0-9]{10}$/i.test(raw)) return raw.toUpperCase();
    const u = url(raw, 'amazon.com');
    if (u) return u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase() || '';
    try { const decoded = atob(raw).trim(); return /^[A-Z0-9]{10}$/i.test(decoded) ? decoded.toUpperCase() : ''; } catch { return ''; }
  }
  function feedbackUser(value) {
    const u = url(value, 'ebay.com');
    const user = u?.pathname.match(/^\/fdbk\/feedback_profile\/([^/]+)\/?$/i)?.[1];
    try { return user ? decodeURIComponent(user).toLowerCase() : ''; } catch { return ''; }
  }
  function cents(value, allowZero = true) {
    const formatted = text(value).replace(/^\$\s*/, '');
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(formatted)) return null;
    const raw = formatted.replace(/,/g, '');
    const [whole, fraction = ''] = raw.split('.');
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(result) && result >= (allowZero ? 0 : 1) && result <= 100000000 ? result : null;
  }
  function percent(value) {
    if (!/^\d+(?:\.\d{1,4})?$/.test(text(value))) return null;
    const n = Number(value); return n <= 100 ? n : null;
  }
  function tiers(base, bands) {
    let previous = 0, result = 0;
    for (const [ceiling, rate] of bands) {
      result += Math.max(0, Math.min(base, ceiling) - previous) * rate / 100;
      previous = ceiling;
    }
    return Math.round(result);
  }
  function estimate(input) {
    const warnings = [];
    const quantity = Number(input.quantity);
    const sale = cents(input.sale, false), cost = cents(input.cost);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999 || sale === null || cost === null) {
      throw new Error('Enter a valid per-item price, Amazon cost, and quantity.');
    }
    if (!['None','Starter','Basic','Premium','Anchor','Enterprise'].includes(input.plan)) throw new Error('Confirm the Store plan.');
    if (!CATEGORIES[input.category]) throw new Error('Confirm the fee category.');
    const moneyInput = (key, label) => {
      if (text(input[key]) === '') { warnings.push(label + ' excluded (not entered)'); return 0; }
      const n = cents(input[key]); if (n === null) throw new Error(label + ' is invalid.'); return n;
    };
    const rateInput = (key, label) => {
      if (text(input[key]) === '') { warnings.push(label + ' assumed 0%'); return 0; }
      const n = percent(input[key]); if (n === null) throw new Error(label + ' is invalid.'); return n;
    };
    const revenue = sale * quantity + moneyInput('buyerShipping', 'Buyer-paid shipping');
    const buyerTax = Math.round(revenue * rateInput('buyerTax', 'Buyer sales tax') / 100);
    const base = revenue + buyerTax;
    const supplier = cost * quantity + moneyInput('amazonTax', 'Amazon tax') + moneyInput('amazonShipping', 'Amazon shipping');
    const other = moneyInput('other', 'Other costs');
    const store = !['None','Starter'].includes(input.plan), cap = (store ? 250000 : 750000) * quantity;
    let variable;
    switch (input.category) {
      case 'general': variable = tiers(base, [[cap,store ? 12.7 : 13.6],[Infinity,2.35]]); break;
      case 'media': variable = tiers(base, [[cap,15.3],[Infinity,2.35]]); break;
      case 'electronics': variable = tiers(base, [[cap,store ? 9.35 : 13.6],[Infinity,2.35]]); break;
      case 'guitars': variable = tiers(base, [[cap,6.7],[Infinity,2.35]]); break;
      case 'cards': variable = tiers(base, [[cap,store ? 12.35 : 13.25],[Infinity,2.35]]); break;
      case 'jewelry': variable = Math.round(base * (base <= 500000 * quantity ? (store ? 13 : 15) : (store ? 7 : 9)) / 100); break;
      case 'watches': variable = tiers(base, store ? [[100000 * quantity,12.5],[500000 * quantity,4],[Infinity,3]] : [[100000 * quantity,15],[750000 * quantity,6.5],[Infinity,3]]); break;
      case 'custom': {
        const rate = percent(input.customRate); if (rate === null) throw new Error('Enter the confirmed custom fee rate.');
        variable = Math.round(base * rate / 100); warnings.push('Custom flat rate; verify category thresholds'); break;
      }
    }
    const discount = input.topRatedPlus === true ? Math.round(variable * 0.1) : 0;
    const orderFee = input.category === 'custom' ? cents(input.customOrderFee) : (base <= 1000 ? 30 : 40);
    if (orderFee === null) throw new Error('Enter the custom per-order fee.');
    const surcharge = Math.round(base * rateInput('surcharge', 'Performance surcharge') / 100);
    const international = Math.round(base * rateInput('international', 'International fee') / 100);
    const ads = Math.round(base * rateInput('adRate', 'Advertising rate') / 100);
    const fee = variable - discount + orderFee + surcharge + international;
    const profit = revenue - supplier - fee - ads - other;
    warnings.push('Fee category and listing-specific discounts require confirmation');
    if (Date.now() - Date.parse(CHECKED + 'T00:00:00Z') > 45 * 86400000) warnings.push('Fee schedule is older than 45 days; check official rates');
    return {revenue, buyerTax, base, supplier, variable, discount, orderFee, surcharge, international, fee, ads, other,
      profit, margin:revenue ? profit / revenue * 100 : 0, warnings, checked:CHECKED};
  }
  function addFeedback(state, page) {
    if (!page.left || page.user !== state.user) throw new Error('Feedback view or buyer changed.');
    if (!Number.isInteger(page.total) || page.total < 0 || (state.total !== null && state.total !== page.total)) throw new Error('Feedback total changed; restart the scan.');
    if (page.start !== state.rows.length + 1 && page.total !== 0) throw new Error('Feedback pages are repeated, skipped, or out of order.');
    if (page.rows.length !== (page.total === 0 ? 0 : page.end - page.start + 1)) throw new Error('Some feedback rows could not be read.');
    if (page.rows.some(r => !['positive','neutral','negative'].includes(r.rating))) throw new Error('A feedback rating is unknown.');
    const ids = new Set(state.rows.map(r => r.id).filter(Boolean));
    const pageIds = page.rows.map(r => r.id).filter(Boolean);
    if (pageIds.length !== page.rows.length) throw new Error('A native feedback ID is missing.');
    if (new Set(pageIds).size !== pageIds.length) throw new Error('Duplicate feedback IDs within a page.');
    if (page.rows.some(r => r.id && ids.has(r.id))) throw new Error('Repeated feedback IDs; restart the scan.');
    const rows = [...state.rows, ...page.rows];
    const complete = rows.length === page.total && !page.next;
    return {...state, rows, total:page.total, pages:state.pages + 1, complete};
  }
  function feedbackSummary(state) {
    const counts = {positive:0,neutral:0,negative:0};
    for (const r of state.rows) counts[r.rating]++;
    const total = state.rows.length;
    return {...counts, total, percentages:Object.fromEntries(Object.entries(counts).map(([k,v]) => [k,total ? v / total * 100 : null])), complete:state.complete === true};
  }
  const api = Object.freeze({CHECKED,SOURCES,CATEGORIES,text,url,offer,asin,feedbackUser,cents,percent,estimate,addFeedback,feedbackSummary});
  root.GLDN_OFFER = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
