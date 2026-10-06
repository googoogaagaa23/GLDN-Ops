(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_EBAY_MESSAGES = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';
  const STORAGE_KEY = 'gldnEbayUnreadMessages';
  const INBOX_URL = 'https://www.ebay.com/cnt/ViewMessage?group_type=CORE';
  const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const accountKey = (value) => text(value).toLowerCase();
  function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0).toString(16);
  }
  function messageUrl(value, base = INBOX_URL) {
    try {
      if (!text(value)) return '';
      const url = new URL(value, base);
      if (url.username || url.password || url.protocol !== 'https:' || !/(^|\.)ebay\.com$/i.test(url.hostname)) return '';
      if (!/^\/(?:cnt\/ViewMessage|mesgweb\/ViewMessages|mye\/myebay\/messages)(?:\/|$)/i.test(url.pathname)) return '';
      return url.href;
    } catch { return ''; }
  }
  function urlId(value) {
    try {
      const url = new URL(value);
      for (const key of ['conversationId', 'conversation_id', 'threadId', 'thread_id', 'messageId', 'message_id', 'msgId', 'msgid']) {
        const id = url.searchParams.get(key);
        if (id) return id;
      }
      return '';
    } catch { return ''; }
  }
  function normalizeRow(value) {
    const buyer = text(value.buyer);
    const title = text(value.title);
    const url = messageUrl(value.url);
    const id = text(value.id) || urlId(url);
    return { id, buyer, title, preview: text(value.preview), date: text(value.date),
      latestMessageId: text(value.latestMessageId), unread: value.unread === true,
      url, pageUrl: messageUrl(value.pageUrl), member: value.member === true };
  }
  const fingerprint = (row) => hash(JSON.stringify([accountKey(row.buyer), row.title, row.preview,
    /^(?:\d+\s*[smhdw]|today|yesterday)$/i.test(row.date || '') ? '' : row.date, row.latestMessageId]));
  function mergeRows(existing, incoming) {
    const rows = new Map(existing.map((row) => [row.id, row]));
    for (const value of incoming) {
      const row = normalizeRow(value);
      if (!row.id || !row.buyer || !row.member) continue;
      const old = rows.get(row.id);
      if (old && accountKey(old.buyer) !== accountKey(row.buyer)) throw new Error('Two customers share the same message identifier. Refresh the inbox.');
      rows.set(row.id, { ...row, openedAt: old && fingerprint(old) === fingerprint(row) ? old.openedAt || '' : '' });
    }
    return [...rows.values()];
  }
  function isIgnored(account, row) { return account.ignored?.[row.id]?.fingerprint === fingerprint(row); }
  function pending(account) { return (account.rows || []).filter((row) => row.member && row.unread && !row.openedAt && !isIgnored(account, row)); }
  function ignore(account, id, now = new Date().toISOString()) {
    const row = (account.rows || []).find((entry) => entry.id === id);
    if (!row) throw new Error('This message is no longer in the saved inbox. Scan again.');
    return { ...account, ignored: { ...account.ignored, [id]: { row, fingerprint: fingerprint(row), ignoredAt: now } } };
  }
  function restore(account, id) {
    const ignored = { ...account.ignored };
    delete ignored[id];
    return { ...account, ignored };
  }
  function reconcile(account, rows, complete, now = new Date().toISOString()) {
    const merged = mergeRows(complete ? [] : account.rows || [], rows);
    const ignored = { ...account.ignored };
    for (const row of merged) {
      const previous = (account.rows || []).find((value) => value.id === row.id);
      if (!complete && previous && fingerprint(previous) === fingerprint(row)) row.openedAt = previous.openedAt || '';
      if (ignored[row.id] && ignored[row.id].fingerprint !== fingerprint(row)) delete ignored[row.id];
    }
    return { ...account, rows: merged, ignored, complete, scannedAt: now };
  }
  return { STORAGE_KEY, INBOX_URL, text, accountKey, hash, messageUrl, urlId, normalizeRow, fingerprint, mergeRows, isIgnored, pending, ignore, restore, reconcile };
});
