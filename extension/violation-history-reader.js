(function (root) {
  'use strict';
  function readPage() {
    const text = (n) => String(n?.innerText || n?.textContent || '').replace(/\s+/g, ' ').trim();
    const here = new URL(location.href);
    if (/signin|captcha|splashui/.test(here.pathname)) throw new Error('SIGN_IN_REQUIRED: Sign in or complete eBay verification in this profile.');
    if (!/(^|\.)ebay\.com$/.test(here.hostname) || here.pathname !== '/sh/lst/ended') throw new Error('Open eBay Inactive listings.');
    if (document.querySelector('img[alt="Updating results"], [aria-label="Updating results"]')) throw new Error('eBay is still updating results.');
    const accountLink = [...document.querySelectorAll('a[href*="/usr/"]')].find((a) => /view profile/i.test(text(a)));
    const account = accountLink ? new URL(accountLink.href).pathname.split('/usr/')[1]?.toLowerCase() : '';
    if (!account) throw new Error('The signed-in eBay seller identity is not visible.');
    const view = [...document.querySelectorAll('a[href]')].find((a) => text(a) === 'View Listings' && /status=LISTINGS_ON_HOLD/.test(a.href));
    if (here.searchParams.get('status') !== 'LISTINGS_ON_HOLD') return { account, filterUrl: view?.href || '', needsFilter: true };
    const heading = [...document.querySelectorAll('h2')].map(text).find((s) => /^Results:/i.test(s)) || '';
    const m = heading.match(/Results:\s*([\d,]+)\s*-\s*([\d,]+)\s*of\s*([\d,]+)/i);
    const zero = /^Results:\s*0(?:\s|$)/i.test(heading);
    if (!m && !zero) throw new Error('eBay has not shown a verified violation result count.');
    const num = (v) => Number(String(v).replace(/,/g, ''));
    const start = m ? num(m[1]) : 0, end = m ? num(m[2]) : 0, total = m ? num(m[3]) : 0;
    const rows = [];
    for (const group of document.querySelectorAll('table[role="grid"] tbody')) {
      const row = group.querySelector('tr[data-id][data-site]');
      if (!row) continue;
      const notice = group.querySelector('.grid-row-notice .inline-notice__main > span');
      const reason = notice ? [...notice.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() : '';
      const title = text(row.querySelector('.shui-dt-column__title a'));
      const itemId = row.getAttribute('data-id');
      if (!/^\d{9,15}$/.test(itemId) || !reason || !title) throw new Error('A violation row is missing its exact item number, title, or paired notice.');
      rows.push({ account, itemId, title, reason, sku: text(row.querySelector('.shui-dt-column__listingSKU span')),
        caseUrl: row.querySelector('a.default-action[href*="/ifh/viewcase"]')?.href || '' });
    }
    if (rows.length !== (total ? end - start + 1 : 0) || new Set(rows.map((r) => r.itemId)).size !== rows.length) throw new Error('The violation table is incomplete or has duplicate rows.');
    const next = [...document.querySelectorAll('a[href]')].find((a) => /next/i.test(a.getAttribute('aria-label') || text(a)) && a.getAttribute('aria-disabled') !== 'true' && new URL(a.href).pathname === '/sh/lst/ended');
    const nextButton = [...document.querySelectorAll('button')].find((b) => /^next(?: page)?$/i.test(b.getAttribute('aria-label') || text(b)) && !b.disabled);
    return { account, start, end, total, rows, nextUrl: next?.href || '', nextButton: !!nextButton, sourceUrl: location.href };
  }
  function nextPage() {
    // Pagination is the only click this reader is permitted to make.
    const buttons = [...document.querySelectorAll('button')].filter((b) => /^next(?: page)?$/i.test(b.getAttribute('aria-label') || b.innerText.trim()) && !b.disabled);
    if (buttons.length !== 1) throw new Error('One enabled Next page button was not found.');
    buttons[0].click();
  }
  function readCase(expectedUrl) {
    const expected = new URL(expectedUrl), actual = new URL(location.href);
    if (/signin|captcha|splashui/.test(actual.pathname)) throw new Error('SIGN_IN_REQUIRED: Sign in or complete eBay verification in this profile.');
    if (actual.pathname !== '/ifh/viewcase' || actual.searchParams.get('caseId') !== expected.searchParams.get('caseId')) throw new Error('The case page does not match this listing.');
    const main = document.querySelector('main, [role="main"]');
    const text = main?.innerText || '';
    if (!text.includes(expected.searchParams.get('caseId')) || !/What is the policy\?/i.test(text)) throw new Error('The case explanation is not ready or accessible.');
    const policyLink = [...main.querySelectorAll('a[href]')].find((a) => a.href.includes('/help/policies/'));
    const activity = text.match(/What activity didn.t follow the policy\s*([\s\S]*?)(?=Decision and action|Content Summary|$)/i)?.[1]?.trim() || '';
    const title = text.match(/Item Title\s*([\s\S]*?)(?=\nImage|Start appeal|End listing|$)/i)?.[1]?.trim() || '';
    return { policy: policyLink?.textContent.trim() || '', policyUrl: policyLink?.href || '', activity: activity.slice(0,2000), title: title.slice(0,500) };
  }
  root.GLDN_VIOLATION_READER = { readPage, nextPage, readCase };
})(globalThis);
