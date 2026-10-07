((root) => {
  const TTL = 15 * 60 * 1000;
  function ebayUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && /(^|\.)ebay\.com$/i.test(url.hostname) ? url : null;
    } catch (_) { return null; }
  }
  function itemId(value) {
    const url = ebayUrl(value);
    return url?.pathname.match(/^\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/i)?.[1] || '';
  }
  function isEditor(value) {
    const url = ebayUrl(value);
    return Boolean(url && /^\/lstng\/?$/i.test(url.pathname)
      && url.searchParams.get('mode')?.toLowerCase() === 'reviseitem'
      && /^\d+$/.test(url.searchParams.get('draftId') || url.searchParams.get('itemId') || ''));
  }
  function entryItemId(value) {
    const url = ebayUrl(value);
    if (!url || !/^\/(?:sl\/list|lstng)\/?$/i.test(url.pathname)
      || url.searchParams.get('mode')?.toLowerCase() !== 'reviseitem') return '';
    const id = url.searchParams.get('itemId') || '';
    return /^\d{9,15}$/.test(id) ? id : '';
  }
  const isRevisionLink = value => isEditor(value) || Boolean(entryItemId(value));
  function editorKey(value) {
    const url = ebayUrl(value);
    if (!isEditor(value)) return '';
    return `${url.hostname.replace(/^www\./, '')}|${url.pathname.replace(/\/$/, '')}|${url.searchParams.get('draftId') || ''}|${url.searchParams.get('itemId') || ''}`;
  }
  function cents(value) {
    const text = String(value ?? '').trim().replace(/^\$\s*/, '');
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, decimal = ''] = text.replace(/,/g, '').split('.');
    const amount = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
    return Number.isSafeInteger(amount) && amount > 0 && amount <= 100000000 ? amount : null;
  }
  const money = value => (value / 100).toFixed(2);
  const fresh = (run, now = Date.now()) => Boolean(run && Number.isFinite(run.startedAt)
    && now >= run.startedAt && now - run.startedAt < TTL);
  function createRun(data, now = Date.now()) {
    const editor = isEditor(data.sourceUrl);
    if (!ebayUrl(data.sourceUrl)) throw new Error('Open the signed-in eBay page first.');
    if (!editor && !/^\d{9,15}$/.test(data.itemId || '')) throw new Error('One exact listing is required.');
    return {
      itemId: data.itemId || '', title: String(data.title || '').slice(0, 200),
      sourceUrl: data.sourceUrl, startedAt: now,
      phase: editor ? 'editor' : 'item', editorUrl: editor ? data.sourceUrl : '',
      oldCents: null, newCents: null
    };
  }
  function bindEditor(run, currentUrl, targetUrl) {
    if (!fresh(run) || run.phase !== 'item' || itemId(currentUrl) !== run.itemId || !isRevisionLink(targetUrl)) {
      throw new Error('The native Revise link did not match this exact listing.');
    }
    const target = ebayUrl(targetUrl);
    const explicitId = target.searchParams.get('itemId');
    if (explicitId && explicitId !== run.itemId) throw new Error('Revise points to a different listing.');
    return { ...run, phase: entryItemId(targetUrl) ? 'opening' : 'editor', editorUrl: targetUrl };
  }
  function observeNavigation(run, url) {
    if (!fresh(run) || run.phase !== 'opening') return run;
    if (entryItemId(url) === run.itemId) return { ...run, entrySeen: true };
    if (run.entrySeen && isEditor(url) && !entryItemId(url)
      && (!run.redirectUrl || editorKey(run.redirectUrl) === editorKey(url))) return { ...run, redirectUrl: url };
    return { ...run, phase: 'interrupted' };
  }
  function adoptEditor(run, url, title) {
    if (!fresh(run) || run.phase !== 'opening' || !run.entrySeen || !editorKey(url)
      || editorKey(url) !== editorKey(run.redirectUrl)
      || String(title || '').trim() !== run.title.trim() || !run.title.trim()) {
      throw new Error('The redirected revision could not be verified. Close the helper and start from this Revise page after checking the item.');
    }
    return { ...run, phase: 'editor', editorUrl: url };
  }
  function plan(run, currentUrl, value) {
    if (!fresh(run) || !editorKey(currentUrl) || editorKey(currentUrl) !== editorKey(run.editorUrl)) {
      throw new Error('This is not the exact prepared Revise page. Start again from the intended listing.');
    }
    if (['planned', 'applied'].includes(run.phase)) return { run, claimed: false };
    if (run.phase !== 'editor') throw new Error('Open the native Revise page first.');
    const oldCents = cents(value);
    if (oldCents === null || oldCents + 10 > 100000000) throw new Error('The current item price is not a valid dollar amount.');
    return { run: { ...run, phase: 'planned', oldCents, newCents: oldCents + 10 }, claimed: true };
  }
  function applyAllowed(run, currentUrl, value) {
    if (!fresh(run) || !['planned', 'applied'].includes(run.phase)
      || editorKey(currentUrl) !== editorKey(run.editorUrl)) return false;
    return [run.oldCents, run.newCents].includes(cents(value));
  }
  const api = Object.freeze({ TTL, ebayUrl, itemId, isEditor, entryItemId, isRevisionLink, editorKey, cents, money, fresh, createRun, bindEditor, observeNavigation, adoptEditor, plan, applyAllowed });
  root.GLDN_EBAY_PRICE_CORE = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
