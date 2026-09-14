(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_VIOLATION_HISTORY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clean = (v, max = 1000) => String(v || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max);
  const words = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const stop = new Set('a an the and or for with to of in on by from new pack pcs piece pieces count set size inch inches black white blue red green small large original premium high quality product products item items'.split(' '));
  const tokens = (v) => [...new Set(words(v).split(' ').filter((t) => t.length > 2 && !stop.has(t) && !/^\d+$/.test(t)))];
  function safeUrl(value, kind) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || !/(^|\.)ebay\.com$/.test(u.hostname)) return '';
      if (kind === 'case' && u.pathname !== '/ifh/viewcase') return '';
      if (kind === 'policy' && !u.pathname.startsWith('/help/policies/')) return '';
      return u.href;
    } catch (_) { return ''; }
  }
  function asinFromSku(value) {
    const sku = clean(value, 100);
    if (/^[A-Z0-9]{10}$/i.test(sku)) return sku.toUpperCase();
    try {
      const decoded = typeof atob === 'function' ? atob(sku) : Buffer.from(sku, 'base64').toString('utf8');
      return /^[A-Z0-9]{10}$/i.test(decoded) ? decoded.toUpperCase() : '';
    } catch (_) { return ''; }
  }
  function normalizeRecord(value = {}) {
    const itemId = clean(value.itemId, 16);
    const account = clean(value.account, 100).toLowerCase();
    const reason = clean(value.reason, 1800);
    if (!/^\d{9,15}$/.test(itemId) || !/^[a-z0-9_.-]+$/.test(account) || !reason || !/policy|intellectual property|rights owner/i.test(reason)) return null;
    const sku = clean(value.sku, 160);
    const rawAsin = clean(value.asin, 160).toUpperCase();
    const asin = /^[A-Z0-9]{10}$/.test(rawAsin) ? rawAsin : asinFromSku(sku);
    return {
      id: account + ':' + itemId, account, itemId, sku, asin,
      title: clean(value.title, 500), reason,
      policy: clean(value.policy, 250), activity: clean(value.activity, 2000),
      caseUrl: safeUrl(value.caseUrl, 'case'),
      policyUrl: safeUrl(value.policyUrl, 'policy'),
      caseReadAt: clean(value.caseReadAt, 40), caseReadError: clean(value.caseReadError, 300),
      sourceUrl: 'https://www.ebay.com/sh/lst/ended?status=LISTINGS_ON_HOLD',
      computerLabel: clean(value.computerLabel, 80),
      firstSeenAt: clean(value.firstSeenAt || value.lastSeenAt, 40),
      lastSeenAt: clean(value.lastSeenAt || value.firstSeenAt, 40)
    };
  }
  function mergeRecords(...sets) {
    const map = new Map();
    for (const set of sets) for (const raw of Array.isArray(set) ? set : []) {
      const row = normalizeRecord(raw);
      if (!row) continue;
      const old = map.get(row.id);
      if (!old) { map.set(row.id, row); continue; }
      const newer = row.lastSeenAt >= old.lastSeenAt ? row : old;
      const older = newer === row ? old : row;
      map.set(row.id, { ...older, ...newer,
        firstSeenAt: [old.firstSeenAt, row.firstSeenAt].filter(Boolean).sort()[0] || '',
        policy: newer.policy || older.policy, activity: newer.activity || older.activity,
        policyUrl: newer.policyUrl || older.policyUrl, caseReadAt: newer.caseReadAt || older.caseReadAt
      });
    }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  function fingerprint(records) {
    const text = JSON.stringify(mergeRecords(records).map((r) => [r.id, r.asin, r.title, r.reason, r.policy, r.activity]));
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return 'history-' + (h >>> 0).toString(16);
  }
  function applyHistory(results, records) {
    const history = mergeRecords(records).map((r) => ({ r, title: words(r.title), tokens: tokens(r.title) }));
    return (results || []).map((result) => {
      const asins = new Set([...(result.asins || []), result.asin].filter(Boolean).map((a) => String(a).toUpperCase()));
      const title = words(result.title);
      const candidate = new Set(tokens(result.title));
      const matches = [];
      for (const h of history) {
        const exactAsin = h.r.asin && asins.has(h.r.asin);
        const exactTitle = title && title === h.title && h.tokens.length >= 5 && !/\.\.\.|…/.test(h.r.title);
        const overlap = h.tokens.filter((t) => candidate.has(t)).length;
        const related = overlap >= 4 && overlap / Math.max(1, h.tokens.length) >= 0.7 && overlap / Math.max(1, candidate.size + h.tokens.length - overlap) >= 0.6;
        if (!exactAsin && !exactTitle && !related) continue;
        const action = exactAsin ? 'block' : 'review';
        const basis = exactAsin ? 'Same Amazon ASIN' : exactTitle ? 'Same detailed product title' : 'Closely matching product wording';
        matches.push({
          id: 'removed:' + h.r.id, type: 'history', value: h.r.asin || h.r.title,
          action, reason: basis + ' as a previously flagged listing. eBay: ' + (h.r.activity || h.r.reason),
          policyTopic: h.r.policy || h.r.reason, source: 'signed-in-ebay-removal-history',
          sourceType: 'account-history', authority: 'eBay account notice; GLDN prevention rule',
          evidenceKind: exactAsin || exactTitle ? 'prior-product-incident' : 'related-product-inference',
          evidenceUrls: [h.r.caseUrl, h.r.policyUrl].filter(Boolean)
        });
      }
      if (!matches.length) return result;
      const rank = { clear: 0, review: 1, block: 2 };
      const all = [...(result.matches || []), ...matches].sort((a, b) => rank[b.action] - rank[a.action]);
      const action = rank[result.action] > rank[all[0].action] ? result.action : all[0].action;
      return { ...result, action, status: action.toUpperCase(), matches: all,
        reason: [result.matches?.length ? result.reason : '', ...matches.map((m) => m.reason)].filter(Boolean).join(' | ') };
    });
  }
  return Object.freeze({ clean, safeUrl, asinFromSku, normalizeRecord, mergeRecords, fingerprint, applyHistory });
});
