(() => {
  if (globalThis.GLDN_OFFER_INLINE) return;
  globalThis.GLDN_OFFER_INLINE = function (context,heading) {
    const previous = document.getElementById('gldn-offer-inline');
    previous?.dispatchEvent(new Event('gldn-offer-dispose')); previous?.remove();
    const panel = document.createElement('section');
    panel.id = 'gldn-offer-inline'; panel.dataset.offerKey = context.key;
    panel.style.cssText = 'display:block;clear:both;width:100%;max-width:100%;min-width:0;margin:16px 0';
    const root = panel.attachShadow({mode:'open'});
    const style = document.createElement('style'); style.textContent = context.css; root.append(style);
    const template = new DOMParser().parseFromString(context.html,'text/html');
    const main = document.importNode(template.querySelector('main'),true);
    const header = document.createElement('header');
    const logo = document.createElement('img'); logo.src = chrome.runtime.getURL('icons/icon48.png'); logo.alt = 'GLDN Ops';
    const name = document.createElement('h2'); name.textContent = 'Offer insights';
    const version = document.createElement('output'); version.id = 'version';
    const separate = document.createElement('button'); separate.type = 'button'; separate.textContent = 'Separate view';
    separate.addEventListener('click',async () => {
      try {
        const response = await chrome.runtime.sendMessage({type:'offerReviewOpen',mode:'window'});
        if (!response?.ok) throw new Error(response?.error || 'The separate review could not open.');
      } catch(e) { $('status').textContent = e.message; $('status').classList.add('error'); }
    });
    header.append(logo,name,version,separate); root.append(header,main);
    const $ = id => root.getElementById(id);
    $('return').hidden = true; $('title').hidden = true;
    $('refresh').textContent = 'Refresh offer'; $('readBoth').textContent = 'Refresh Amazon + feedback';
    $('copy').textContent = 'Copy amount';
    const basics = document.createElement('div'); basics.className = 'inline-basics';
    for (const id of ['cost','plan','category','adRate']) basics.append($(id).closest('label'));
    root.querySelector('.result').before(basics);
    const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Fee and cost settings';
    details.append(summary,root.querySelector('.fields'),root.querySelector('.breakdown'),root.querySelector('.sources'));
    root.querySelector('.result').after(details);
    const comments = document.createElement('details'), commentTitle = document.createElement('summary'); commentTitle.textContent = 'Negative and neutral comments';
    comments.append(commentTitle,$('comments'));
    const oldTitle = [...root.querySelectorAll('h3')].find(el => /Negative.*neutral/.test(el.textContent));
    oldTitle?.replaceWith(comments);
    let anchor = heading;
    const itemId = globalThis.GLDN_OFFER.offer(location.href)?.itemId;
    for (let depth = 0; depth < 3 && anchor.parentElement && anchor.parentElement !== document.body; depth++) {
      const parent = anchor.parentElement;
      if ([...parent.querySelectorAll('a[href*="/itm/"]')].some(link => link.href.includes(itemId))) break;
      anchor = parent;
    }
    anchor.insertAdjacentElement('afterend',panel);
    document.getElementById('gldn-offer-inline-error')?.remove();
    const call = async (op,args = {}) => {
      if (!panel.isConnected || globalThis.GLDN_OFFER.offer(location.href)?.key !== context.key) throw new Error('The originating eBay offer changed.');
      const response = await chrome.runtime.sendMessage({type:'offerReviewInline',op,token:context.token,...args});
      if (!response?.ok) throw new Error(response?.error || 'The offer reader did not respond.');
      return response.result;
    };
    const host = {root,sourceId:context.sourceId,key:context.key,source:context.source,call};
    globalThis.GLDN_OFFER_HOST = host;
    return host;
  };
})();
