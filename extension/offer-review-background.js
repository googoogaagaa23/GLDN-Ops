(() => {
  const C = globalThis.GLDN_OFFER;
  const scopeKey = id => 'gldnOfferInlineScope:' + id;
  const stateKey = id => 'gldnOfferReview:inline:' + id;
  let bundle;
  const sameOffer = (a,b) => a.key === b.key && a.user === b.user && a.price === b.price && a.quantity === b.quantity && a.title === b.title;
  async function source(id) {
    await chrome.scripting.executeScript({target:{tabId:id},files:['offer-review-core.js','offer-review-reader.js']});
    const result = await chrome.scripting.executeScript({target:{tabId:id},func:() => {
      try { return {ok:true,data:globalThis.GLDN_OFFER_READER('offer')}; } catch(e) { return {ok:false,error:e.message}; }
    }});
    if (!result[0]?.result?.ok) throw new Error(result[0]?.result?.error || 'The native offer did not respond.');
    return result[0].result.data;
  }
  async function inline(message,sender) {
    const tab = sender.tab;
    if (sender.id !== chrome.runtime.id || (sender.frameId || 0) !== 0 || !Number.isInteger(tab?.id) || !C.offer(tab.url)) throw new Error('Offer insights require the originating native eBay offer.');
    const liveTab = await chrome.tabs.get(tab.id);
    const key = C.offer(liveTab.url)?.key;
    if (!key || key !== C.offer(tab.url).key) throw new Error('The originating eBay offer changed.');
    if (message.op === 'mount') {
      const offer = await source(tab.id);
      const scope = {key,token:crypto.randomUUID(),source:offer,workers:{},windowId:liveTab.windowId};
      await chrome.storage.session.set({[scopeKey(tab.id)]:scope});
      bundle ||= Promise.all(['offer-review.html','offer-review.css','offer-review-inline.css'].map(async file => {
        const response = await fetch(chrome.runtime.getURL(file));
        if (!response.ok) throw new Error('Offer interface files could not load.');
        return response.text();
      }));
      const [html,css,inlineCss] = await bundle;
      return {sourceId:tab.id,key,token:scope.token,source:offer,html,css:css + '\n' + inlineCss};
    }
    const scope = (await chrome.storage.session.get(scopeKey(tab.id)))[scopeKey(tab.id)];
    if (!scope || scope.token !== message.token || scope.key !== key) throw new Error('This inline review is no longer attached to the current offer.');
    if (message.op === 'tab-get' && message.tabId === tab.id) return liveTab;
    const offer = await source(tab.id);
    if (message.op === 'read' && message.tabId === tab.id && message.action === 'offer') {
      scope.source = offer; await chrome.storage.session.set({[scopeKey(tab.id)]:scope}); return offer;
    }
    if (!sameOffer(scope.source,offer)) throw new Error('Buyer, offer, title, or quantity changed. Refresh the offer.');
    const owned = async id => {
      if (!Object.values(scope.workers).some(worker => worker.id === id)) throw new Error('This reader tab does not belong to the current offer.');
      const worker = await chrome.tabs.get(id);
      if (worker.openerTabId !== tab.id || worker.windowId !== scope.windowId) throw new Error('The reader tab ownership changed.');
      return worker;
    };
    if (message.op === 'start') {
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['offer-review.js']});
      await chrome.scripting.executeScript({target:{tabId:tab.id},func:() => {
        if (!globalThis.GLDN_OFFER_HOST?.root?.host?.isConnected) throw new Error('The inline offer section is not available.');
        globalThis.GLDN_OFFER_START(); return true;
      }});
      return {started:true};
    }
    if (message.op === 'state-get') return (await chrome.storage.session.get(stateKey(tab.id)))[stateKey(tab.id)] || null;
    if (message.op === 'state-set') {
      const value = message.value;
      if (!value?.source || !sameOffer(value.source,scope.source) || (value.feedback && value.feedback.user !== scope.source.user)) throw new Error('Saved review does not match the current offer.');
      await chrome.storage.session.set({[stateKey(tab.id)]:value}); return {saved:true};
    }
    if (message.op === 'tab-get') return owned(message.tabId);
    if (message.op === 'activate') {
      if (message.tabId !== tab.id) await owned(message.tabId);
      return chrome.tabs.update(message.tabId,{active:true});
    }
    if (message.op === 'worker') {
      const url = message.url, kind = message.kind;
      const asin = C.asin(url);
      const listing = 'https://www.ebay.com/sh/lst/active?keyword=' + scope.source.itemId;
      if (!(kind === 'listing' && url === listing) && !(kind === 'amazon' && asin && url === 'https://www.amazon.com/dp/' + asin) && !(kind === 'feedback' && url === scope.source.feedbackUrl)) throw new Error('The reader URL does not match the selected offer.');
      if (message.reset && kind !== 'feedback') throw new Error('Only the current buyer feedback reader can restart.');
      const previous = scope.workers[kind];
      if (previous) {
        try {
          const worker = await owned(previous.id);
          if (worker.url === url) {
            if (message.reset) return chrome.tabs.update(worker.id,{url,active:message.active === true});
            if (message.active) await chrome.tabs.update(worker.id,{active:true}); return worker;
          }
        } catch { /* A closed or changed reader is never reused. */ }
      }
      const worker = await chrome.tabs.create({url,active:message.active === true,openerTabId:tab.id,windowId:scope.windowId});
      scope.workers[kind] = {id:worker.id,url}; await chrome.storage.session.set({[scopeKey(tab.id)]:scope}); return worker;
    }
    if (message.op === 'read') {
      const worker = await owned(message.tabId);
      const kind = Object.entries(scope.workers).find(([,value]) => value.id === worker.id)?.[0];
      const args = message.args || {}, action = message.action;
      const allowed = kind === 'listing' ? action === 'listing-sku' && args.itemId === scope.source.itemId && worker.url === scope.workers.listing.url
        : kind === 'amazon' ? action === 'amazon' && args.asin === C.asin(scope.workers.amazon.url) && C.asin(worker.url) === args.asin
        : kind === 'feedback' && ['feedback-left','feedback-size','feedback','feedback-next'].includes(action) && args.user === scope.source.user && C.feedbackUser(worker.url) === scope.source.user;
      if (!allowed) throw new Error('The reader action is outside this offer.');
      await chrome.scripting.executeScript({target:{tabId:worker.id},files:['offer-review-core.js','offer-review-reader.js']});
      const result = await chrome.scripting.executeScript({target:{tabId:worker.id},func:(action,args) => {
        try { return {ok:true,data:globalThis.GLDN_OFFER_READER(action,args)}; } catch(e) { return {ok:false,error:e.message}; }
      },args:[action,args]});
      if (!result[0]?.result?.ok) throw new Error(result[0]?.result?.error || 'The reader tab did not respond.');
      return result[0].result.data;
    }
    throw new Error('Unknown inline offer action.');
  }
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (message?.type === 'offerReviewInline') {
      inline(message,sender).then(result => respond({ok:true,result})).catch(e => respond({ok:false,error:e.message}));
      return true;
    }
    if (message?.type !== 'offerReviewOpen') return false;
    (async () => {
      const popup = sender.url === chrome.runtime.getURL('popup.html');
      if (sender.id !== chrome.runtime.id || (sender.frameId || 0) !== 0 || (!popup && !globalThis.GLDN_OFFER.offer(sender.tab?.url))) {
        throw new Error('Open Offer Review from the intended eBay offer or GLDN popup.');
      }
      const tab = popup ? (await chrome.tabs.query({active:true,currentWindow:true}))[0] : sender.tab;
      if (!Number.isInteger(tab?.id) || !globalThis.GLDN_OFFER.offer(tab.url)) throw new Error('Open one eBay Offer Received page first.');
      if (message.mode !== 'window') {
        await chrome.scripting.executeScript({target:{tabId:tab.id},files:['offer-review-core.js','offer-review-inline.js','offer-review-launcher.js']});
        const result = await chrome.tabs.sendMessage(tab.id,{type:'offerReviewShowInline'});
        if (!result?.ok) throw new Error(result?.error || 'Offer insights could not open on eBay.');
        await chrome.tabs.update(tab.id,{active:true});
        return {ok:true,inline:true,tabId:tab.id};
      }
      const reviewUrl = chrome.runtime.getURL('offer-review.html') + '?source=' + tab.id;
      const existing = (await chrome.tabs.query({url:chrome.runtime.getURL('offer-review.html') + '*'})).find(t => t.url === reviewUrl);
      const opened = existing ? await chrome.tabs.update(existing.id,{active:true}) : await chrome.tabs.create({url:reviewUrl});
      return {ok:true,tabId:opened.id};
    })().then(respond).catch(e => respond({ok:false,error:e.message}));
    return true;
  });
})();
