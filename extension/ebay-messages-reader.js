(function () {
  'use strict';
  const CORE = globalThis.GLDN_EBAY_MESSAGES;
  const visible = (el) => !!el && !el.closest('[hidden], [aria-hidden="true"]') && !!el.getClientRects().length;
  const label = (el) => CORE.text(el?.innerText || el?.textContent || el?.getAttribute('aria-label'));
  const controls = () => [...document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], label')].filter(visible);
  function account() {
    const header = document.querySelector('#gh, header, .gh-header');
    const link = header?.querySelector('.gh-identity a[href*="/usr/"], #gh-ug a[href*="/usr/"], a[href*="myworld.ebay.com/"]');
    if (link) {
      const url = new URL(link.href, location.href);
      return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    }
    const identity = document.querySelector('#gh-eb-u, [data-testid="account-username"], [data-test="account-username"]');
    return CORE.text(identity?.getAttribute('data-username') || label(identity));
  }
  function checkPage() {
    if (!CORE.messageUrl(location.href)) throw new Error('Open the eBay Messages inbox in this Chrome profile.');
    const body = document.body?.innerText || '';
    if (/sign in to your account|verify yourself|pardon our interruption|security check/i.test(body)) throw new Error('eBay needs sign-in or verification. Finish it in the inbox, then Resume.');
    const owner = account();
    if (!owner || /^(sign in|register|my ebay|hi|account)$/i.test(owner)) throw new Error('The signed-in eBay account could not be identified. Open the account menu, then Resume.');
    return owner;
  }
  const rowSelector = '[data-conversation-id], [data-thread-id], [data-message-id], [data-testid="conversation-list-item"], [data-testid="message-list-item"], .msg-conversation-item, .msg-conversation-card, .msg-conversation-list-item, .conversation-list-item, [role="option"], tr';
  function rowElements() {
    const inbox = document.querySelector('[data-testid="messages-inbox"], .msg-conversation-list, table[aria-label="Message Inbox"]') || document;
    const candidates = [...inbox.querySelectorAll(rowSelector)].filter(visible).filter((el) => !el.closest('[id^="gldn"]'));
    return candidates.filter((el) => !candidates.some((child) => child !== el && el.contains(child)));
  }
  const unreadLabel = (el) => /^unread(?: from members)?(?:\s*\(?\d+\)?)?$/i.test(label(el));
  function unreadControl() { return controls().find((el) => unreadLabel(el) && !el.disabled); }
  function selectedUnread() {
    return controls().some((el) => unreadLabel(el) && (
      el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' ||
      el.getAttribute('aria-checked') === 'true' || el.classList.contains('selected') || el.classList.contains('active') ||
      el.querySelector('input:checked')));
  }
  function readRow(el, unreadOnly) {
    const memberLink = [...el.querySelectorAll('a[href*="/usr/"]')].find(visible);
    const senderEl = el.querySelector('[data-testid="sender"], [data-testid="conversation-sender"], .msg-sender, .msg-conversation-sender, .sender');
    const buyer = memberLink ? decodeURIComponent(new URL(memberLink.href).pathname.split('/').pop()) : label(senderEl);
    const system = /^(?:ebay|ebay customer service|ebay messages)$/i.test(buyer) || el.dataset.messageType === 'system';
    const title = label(el.querySelector('[data-testid="subject"], [data-testid="conversation-title"], .msg-subject, .msg-conversation-title, .subject, .message-subject'));
    const previewEl = el.querySelector('[data-testid="preview"], [data-testid="conversation-preview"], .msg-preview, .msg-conversation-preview, .preview, .card__latest-message');
    const preview = label(previewEl?.querySelector('[data-testid="ux-textual-display"]') || previewEl).replace(/^Unread,\s*/i, '');
    const dateEl = el.querySelector('time, [data-testid="date"], .msg-date, .msg-conversation-date, .date, .card__time');
    const date = dateEl?.getAttribute('datetime') || dateEl?.getAttribute('title') || label(dateEl);
    const unreadMarker = el.getAttribute('data-unread') === 'true' || el.classList.contains('unread') ||
      /\bunread\b/i.test(el.getAttribute('aria-label') || '') ||
      !!el.querySelector('[aria-label="Unread"], [title="Unread"], [alt="Unread"], .unread-indicator');
    const readMarker = el.getAttribute('data-unread') === 'false' || el.classList.contains('read') || !!el.querySelector('.card__content-read');
    const link = [...el.querySelectorAll('a[href]')].map((a) => CORE.messageUrl(a.href)).find((url) => CORE.urlId(url));
    const id = el.getAttribute('data-conversation-id') || el.getAttribute('data-thread-id') || el.getAttribute('data-message-id') || CORE.urlId(link);
    return CORE.normalizeRow({ id, buyer, title, preview, date, latestMessageId: el.getAttribute('data-latest-message-id'),
      unread: !readMarker && (unreadMarker || unreadOnly), url: link, pageUrl: location.href,
      member: !!buyer && !system && el.dataset.senderRole !== 'seller' });
  }
  function nextControl() {
    const matches = controls().filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' &&
      (/^(next|next page|load more|show more)$/i.test(label(el)) || /^(next|next page)$/i.test(el.getAttribute('aria-label') || '') || el.getAttribute('rel') === 'next'));
    return matches.filter((el) => !matches.some((child) => child !== el && el.contains(child)))[0] || null;
  }
  function snapshot(options = {}) {
    const owner = checkPage();
    const unreadOnly = selectedUnread();
    const elements = rowElements();
    const rows = elements.map((el) => readRow(el, unreadOnly));
    const unread = rows.filter((row) => row.member && row.unread && row.id);
    const unknown = rows.filter((row) => row.unread && (!row.id || !row.buyer)).length;
    const body = document.body?.innerText || '';
    const empty = /no (?:unread )?(?:messages|conversations)|you have no messages|your inbox is empty|no results found/i.test(body);
    if (document.querySelector('.skeleton, [role="progressbar"], .skeleton-avatar')) throw new Error('The eBay message list is still loading.');
    if (!elements.length && !empty) throw new Error('The message list is still loading or its layout is not recognized. Open the inbox and Resume.');
    const hasUnreadSignals = unreadOnly || rows.some((row) => row.unread) || elements.some((el) => el.hasAttribute('data-unread') || el.classList.contains('read') || el.querySelector('.card__content-read'));
    if (elements.length && !hasUnreadSignals && !options.forOpen) throw new Error('Unread status could not be verified. Select Unread in eBay, then Resume.');
    const signature = CORE.hash(JSON.stringify(rows.map((row) => [row.id, CORE.fingerprint(row), row.unread])));
    const badge = unreadControl()?.querySelector('.badge');
    const expected = unreadOnly && badge && /^\d[\d,]*$/.test(label(badge)) ? Number(label(badge).replace(/,/g, '')) : null;
    const scroller = document.querySelector('[data-testid="messages-inbox"].app-infinite-scroll');
    const more = !!nextControl() || (scroller && (expected !== null ? unread.length < expected : scroller.scrollHeight > scroller.clientHeight + scroller.scrollTop + 5));
    return { account: owner, rows: unread, allRows: rows.filter((row) => row.member && row.id), unknown, signature,
      expected, next:!!more, pageUrl: location.href, unreadOnly };
  }
  globalThis.GLDN_EBAY_MESSAGES_PAGE = function (action, args = {}) {
    if (action === 'prepare') {
      if (!CORE.messageUrl(location.href)) throw new Error('Open eBay Messages.');
      if (account()) return { ready:true };
      const menu = document.querySelector('.gh-identity button[aria-haspopup="true"]');
      if (menu && menu.getAttribute('aria-expanded') !== 'true') menu.click();
      return { ready:false };
    }
    if (action === 'snapshot') return snapshot(args);
    const owner = checkPage();
    if (args.account && CORE.accountKey(owner) !== CORE.accountKey(args.account)) throw new Error('The signed-in eBay account changed. Scan that account separately.');
    if (action === 'owner') return { account:owner };
    if (action === 'verify-open') {
      const pane = document.querySelector('.msg-content-view, [data-testid="conversation-detail"], .conversation-detail, [data-testid="messages-thread"]');
      const members = [...(pane || document.createElement('div')).querySelectorAll('a[href*="/usr/"]')].map((el) => decodeURIComponent(new URL(el.href).pathname.split('/').pop()));
      const active = document.querySelector('.message-button.card__item--active');
      const id = pane?.getAttribute('data-conversation-id') || pane?.getAttribute('data-thread-id') || active?.getAttribute('data-conversation-id') || CORE.urlId(location.href);
      const buyer = active && readRow(active, false).buyer;
      const loaded = pane?.matches('[data-testid="messages-thread"]') ? !!pane.querySelector('[data-testid="app-conversation"]') : !!pane;
      if (loaded && visible(pane) && id === args.row.id && (CORE.accountKey(buyer) === CORE.accountKey(args.row.buyer) || members.some((name) => CORE.accountKey(name) === CORE.accountKey(args.row.buyer)))) return { opened:true };
      throw new Error('The customer conversation has not opened yet.');
    }
    if (action === 'unread') {
      if (selectedUnread()) return { selected: true };
      const target = unreadControl();
      if (target) { target.click(); return { clicked: true }; }
      throw new Error('The native Unread from members folder could not be found. Open it in eBay, then Resume.');
    }
    if (action === 'next') {
      const target = nextControl();
      if (target) { target.click(); return { advanced:true }; }
      const scroller = document.querySelector('[data-testid="messages-inbox"].app-infinite-scroll');
      if (!scroller) return { advanced:false };
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll', {bubbles:true}));
      return { advanced:true, infinite:true };
    }
    if (action === 'open') {
      const matches = rowElements().filter((el) => readRow(el, selectedUnread()).id === args.row.id);
      if (matches.length !== 1) throw new Error('The exact customer conversation is no longer on this inbox page. Scan again.');
      const current = readRow(matches[0], selectedUnread());
      if (CORE.accountKey(current.buyer) !== CORE.accountKey(args.row.buyer) || CORE.fingerprint(current) !== CORE.fingerprint(args.row)) throw new Error('The customer message changed. Scan again before opening it.');
      const target = matches[0].querySelector('a[href*="ViewMessage"], button[data-testid="open-conversation"]') || matches[0];
      target.click(); return { opened: true, id: current.id };
    }
    throw new Error('Unknown eBay message action.');
  };
})();
