(() => {
  if (globalThis.GLDN_OFFER_LAUNCHER) return;
  globalThis.GLDN_OFFER_LAUNCHER = true;
  let task = null;
  function remove() {
    const panel = document.getElementById('gldn-offer-inline');
    panel?.dispatchEvent(new Event('gldn-offer-dispose')); panel?.remove();
    document.getElementById('gldn-offer-inline-error')?.remove();
    globalThis.GLDN_OFFER_HOST = null;
  }
  async function mount(scroll = false) {
    if (task) return task;
    const offer = globalThis.GLDN_OFFER.offer(location.href);
    const heading = [...document.querySelectorAll('h1,h2')].find(el => /Offer Received/i.test(el.textContent));
    if (!offer || !heading) { remove(); return; }
    const existing = globalThis.GLDN_OFFER_HOST;
    if (existing?.root.host.isConnected && existing.key === offer.key) {
      try {
        const live = globalThis.GLDN_OFFER_READER?.('offer');
        if (live && ['user','price','quantity','title'].some(field => live[field] !== existing.source[field])) remove();
        else { if (scroll) existing.root.host.scrollIntoView({block:'start'}); return; }
      } catch { remove(); return; }
    }
    document.getElementById('gldn-offer-review-launcher')?.remove();
    task = (async () => {
      const response = await chrome.runtime.sendMessage({type:'offerReviewInline',op:'mount'});
      if (!response?.ok) throw new Error(response?.error || 'Offer insights could not load.');
      if (!heading.isConnected || globalThis.GLDN_OFFER.offer(location.href)?.key !== response.result.key) return;
      const host = globalThis.GLDN_OFFER_INLINE(response.result,heading);
      const started = await host.call('start');
      if (!started?.started) throw new Error('The offer reader could not start.');
      if (scroll) host.root.host.scrollIntoView({block:'start'});
    })();
    try { await task; }
    catch(e) {
      globalThis.GLDN_OFFER_INLINE_LAST_ERROR = e.message;
      const status = globalThis.GLDN_OFFER_HOST?.root.getElementById('status');
      if (status) { status.textContent = e.message; status.classList.add('error'); }
      else if (!document.getElementById('gldn-offer-inline-error')) {
        const error = document.createElement('div'), retry = document.createElement('button');
        error.id = 'gldn-offer-inline-error'; error.setAttribute('role','status'); error.style.cssText = 'margin:12px 0;padding:10px;border-left:3px solid #b32935';
        error.append(document.createTextNode('Offer insights: ' + e.message + ' ')); retry.type = 'button'; retry.textContent = 'Retry';
        retry.addEventListener('click',() => { error.remove(); mount(true).catch(() => {}); }); error.append(retry);
        heading.insertAdjacentElement('afterend',error);
      }
      if (scroll) throw e;
    } finally {
      task = null;
      if (globalThis.GLDN_OFFER.offer(location.href)?.key !== offer.key) queueMicrotask(() => mount());
    }
  }
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (message?.type !== 'offerReviewShowInline' || sender.id !== chrome.runtime.id) return false;
    mount(true).then(() => respond({ok:!!globalThis.GLDN_OFFER_HOST?.root.host.isConnected})).catch(e => respond({ok:false,error:e.message}));
    return true;
  });
  mount();
  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('popstate',() => mount());
})();
