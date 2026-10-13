(() => {
  if (globalThis.GLDN_OFFER_LAUNCHER) return;
  globalThis.GLDN_OFFER_LAUNCHER = true;
  function mount() {
    if (!globalThis.GLDN_OFFER.offer(location.href) || document.getElementById('gldn-offer-review-launcher')) return;
    const heading = [...document.querySelectorAll('h1,h2')].find(e => /Offer Received/i.test(e.textContent));
    if (!heading) return;
    const button = document.createElement('button');
    button.id = 'gldn-offer-review-launcher'; button.type = 'button'; button.textContent = 'GLDN Offer Review';
    button.className = 'gldn-primary'; button.style.cssText = 'margin:8px 0;padding:10px 16px;max-width:100%;border-radius:4px';
    button.addEventListener('click',async () => {
      button.disabled = true;
      try {
        const r = await chrome.runtime.sendMessage({type:'offerReviewOpen'});
        if (!r?.ok) throw new Error(r?.error || 'Offer Review could not open.');
      } catch(e) { button.textContent = e.message; }
      finally { button.disabled = false; }
    });
    heading.insertAdjacentElement('afterend',button);
  }
  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
