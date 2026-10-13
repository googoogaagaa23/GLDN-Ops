(() => {
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (message?.type !== 'offerReviewOpen') return false;
    (async () => {
      const popup = sender.url === chrome.runtime.getURL('popup.html');
      if (sender.id !== chrome.runtime.id || (sender.frameId || 0) !== 0 || (!popup && !globalThis.GLDN_OFFER.offer(sender.tab?.url))) {
        throw new Error('Open Offer Review from the intended eBay offer or GLDN popup.');
      }
      const tab = popup ? (await chrome.tabs.query({active:true,currentWindow:true}))[0] : sender.tab;
      if (!Number.isInteger(tab?.id) || !globalThis.GLDN_OFFER.offer(tab.url)) throw new Error('Open one eBay Offer Received page first.');
      const reviewUrl = chrome.runtime.getURL('offer-review.html') + '?source=' + tab.id;
      const existing = (await chrome.tabs.query({url:chrome.runtime.getURL('offer-review.html') + '*'})).find(t => t.url === reviewUrl);
      const opened = existing ? await chrome.tabs.update(existing.id,{active:true}) : await chrome.tabs.create({url:reviewUrl});
      return {ok:true,tabId:opened.id};
    })().then(respond).catch(e => respond({ok:false,error:e.message}));
    return true;
  });
})();
