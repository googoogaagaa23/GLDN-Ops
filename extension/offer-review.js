globalThis.GLDN_OFFER_START = async () => {
  'use strict';
  const host = globalThis.GLDN_OFFER_HOST;
  const dom = host?.root || document;
  const C = globalThis.GLDN_OFFER, $ = id => dom.getElementById(id);
  const tabs = host ? {get:id => host.call('tab-get',{tabId:id}),update:id => host.call('activate',{tabId:id})} : chrome.tabs;
  const fields = ['sale','quantity','cost','amazonTax','amazonShipping','buyerShipping','buyerTax','other','plan','category','adRate','surcharge','international','customRate','customOrderFee'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => (n < 0 ? '-$' : '$') + (Math.abs(n) / 100).toFixed(2);
  const sourceParam = new URLSearchParams(location.search).get('source');
  const sourceId = host ? host.sourceId : /^\d+$/.test(sourceParam || '') ? Number(sourceParam) : NaN;
  const deskId = host ? host.sourceId : (await chrome.tabs.getCurrent())?.id;
  const storageKey = 'gldnOfferReview:' + deskId;
  let state = {source:null,workers:{},feedback:null}, running = false, busy = false;
  let saving = Promise.resolve();
  const notice = (message,error = false) => { $('status').textContent = message; $('status').classList.toggle('error',error); };
  const delay = ms => new Promise(r => setTimeout(r,ms));
  const save = () => {
    const value = structuredClone({...state,readerVersion:chrome.runtime.getManifest().version,inputs:inputs(),savedAt:Date.now()});
    saving = saving.catch(() => {}).then(() => host ? host.call('state-set',{value}) : chrome.storage.session.set({[storageKey]:value}));
    return saving;
  };
  function inputs() { return {...Object.fromEntries(fields.map(id => [id,$(id).value])),topRatedPlus:$('topRatedPlus').checked}; }
  function calculation() {
    $('feeSource').href = ['', 'None','Starter'].includes($('plan').value) ? C.SOURCES.selling : C.SOURCES.store;
    dom.querySelectorAll('.custom').forEach(e => { e.hidden = $('category').value !== 'custom'; });
    try {
      const values = inputs(), result = C.estimate(values), offered = C.estimate({...values,sale:$('buyerOffer').value});
      $('offerProfit').textContent = money(offered.profit); $('counterProfit').textContent = money(result.profit);
      $('margin').textContent = result.margin.toFixed(1) + '%';
      const unknown = !!state.manualCost || result.assumedPlan || result.assumedCategory || result.warnings.some(w => /excluded|assumed/.test(w));
      $('estimateBasis').textContent = (unknown ? 'Preliminary estimate' : 'Estimate') + (state.manualCost ? ' | Manual Amazon price' : '') + ' | ' + (result.assumedPlan ? 'No Store / Starter (assumed)' : result.plan) + ' | ' + C.CATEGORIES[result.category] + (result.assumedCategory ? ' (assumed)' : '');
      $('estimateBasis').dataset.preliminary = String(unknown);
      $('offerProfit').className = offered.profit < 0 ? 'negative' : unknown ? 'neutral' : 'positive';
      $('counterProfit').className = result.profit < 0 ? 'negative' : unknown ? 'neutral' : 'positive';
      const rows = [['Sale revenue (tax excluded)',result.revenue],['Buyer tax included in fee base',result.buyerTax],['Amazon cost incl. entered tax / shipping',result.supplier],
        ['Variable final value fee',result.variable],['Top Rated Plus discount',-result.discount],['Per-order fee',result.orderFee],
        ['Performance surcharge',result.surcharge],['International fee',result.international],['Advertising estimate',result.ads],['Other costs',result.other]];
      $('breakdown').innerHTML = rows.map(([name,n]) => '<tr><td>' + esc(name) + '</td><td>' + money(n) + '</td></tr>').join('');
      $('assumptions').textContent = result.warnings.join(' | ');
    } catch(e) {
      $('offerProfit').textContent = '--'; $('counterProfit').textContent = '--'; $('margin').textContent = '--';
      $('estimateBasis').textContent = 'Awaiting valid price and costs'; $('estimateBasis').removeAttribute('data-preliminary');
      $('breakdown').replaceChildren(); $('assumptions').textContent = e.message;
    }
  }
  function feedbackRender() {
    if (!state.feedback) return;
    const s = C.feedbackSummary(state.feedback);
    for (const rating of ['positive','neutral','negative']) $(rating).textContent = s[rating] + ' / ' + (s.percentages[rating] === null ? '--' : s.percentages[rating].toFixed(1) + '%');
    $('feedbackStatus').textContent = s.pagesComplete && !s.complete
      ? 'All pages read: ' + s.total + ' readable ratings | eBay reports ' + state.feedback.total + ' | ' + state.feedback.pages + ' pages. Header total differs; percentages use the readable ratings.'
      : (s.complete ? 'Complete' : 'Partial') + ': ' + s.total + ' of ' + (state.feedback.total ?? '?') + ' feedback entries | ' + state.feedback.pages + ' pages' + (state.feedback.error ? ' | ' + state.feedback.error : '');
    $('comments').innerHTML = state.feedback.rows.filter(r => r.rating !== 'positive').map(r => '<div class="comment"><strong class="' + esc(r.rating) + '">' + esc(r.rating) + '</strong>' + esc(r.comment) + '<small>' + esc(r.seller + ' | ' + r.when) + '</small></div>').join('') || '<p class="boundary">' + (s.pagesComplete ? 'No negative or neutral entries among the readable ratings in this scan.' : 'No negative or neutral entries found so far.') + '</p>';
  }
  function controls() {
    for (const id of ['readBoth','readAmazon','readFeedback']) $(id).disabled = busy || !state.source;
    $('refresh').disabled = busy;
    $('pause').disabled = !busy || !running;
  }
  async function page(tabId,action,args = {}) {
    if (!running && action !== 'offer') throw new Error('Paused.');
    if (host) return host.call('read',{tabId,action,args});
    await chrome.scripting.executeScript({target:{tabId},files:['offer-review-core.js','offer-review-reader.js']});
    if (!running && action !== 'offer') throw new Error('Paused.');
    const results = await chrome.scripting.executeScript({target:{tabId},func:(action,args) => {
      try { return {ok:true,data:globalThis.GLDN_OFFER_READER(action,args)}; } catch(e) { return {ok:false,error:e.message}; }
    },args:[action,args]});
    if (!results[0]?.result?.ok) throw new Error(results[0]?.result?.error || 'The reader tab did not respond.');
    return results[0].result.data;
  }
  async function waitPage(tabId,action,args,predicate = () => true) {
    const deadline = Date.now() + 30000;
    let last = 'The reader page did not finish loading.';
    while (Date.now() < deadline) {
      if (!running) throw new Error('Paused. Results captured so far are retained.');
      try {
        const tab = await tabs.get(tabId);
        if (tab.status === 'complete') {
          const snapshot = await page(tabId,action,args);
          if (predicate(snapshot)) return snapshot;
          last = 'The reader did not advance to the expected page.';
        }
      } catch(e) {
        last = e.message;
        if (/different item|variation changed|different buyer|verification|Wrong active|current offer|originating.*changed|browser profile/i.test(last)) throw e;
      }
      await delay(450);
    }
    throw new Error(last);
  }
  async function createReader(kind,url,active = false,reset = false) {
    if (host) return host.call('worker',{kind,url,active,reset});
    const owner = await tabs.get(sourceId);
    return chrome.tabs.create({url,active,openerTabId:deskId,...(Number.isInteger(owner.windowId) ? {windowId:owner.windowId} : {})});
  }
  async function worker(kind,url,reset = false) {
    if (!running) throw new Error('Paused.');
    const id = state.workers[kind];
    if (id) {
      try {
        const tab = await tabs.get(id);
        if ((host || tab.openerTabId === deskId) && tab.url === url) {
          if (reset) {
            if (host) await createReader(kind,url,false,true);
            else await tabs.update(id,{url,active:false});
          }
          return id;
        }
      } catch { /* A closed reader is replaced, never an unrelated tab. */ }
    }
    const tab = await createReader(kind,url);
    state.workers[kind] = tab.id; await save(); return tab.id;
  }
  async function verifySource() {
    if (!Number.isInteger(sourceId) || sourceId < 0) throw new Error('Open GLDN Offer Review from one eBay Offer Received page.');
    const tab = await tabs.get(sourceId);
    const key = C.offer(tab.url)?.key;
    if (!key || (state.source && key !== state.source.key)) throw new Error('The originating eBay offer changed. Open a new review from that offer.');
    const current = await page(sourceId,'offer');
    if (state.source && (current.user !== state.source.user || current.price !== state.source.price || current.quantity !== state.source.quantity || current.title !== state.source.title)) throw new Error('Buyer, offer, title, or quantity changed. Refresh the offer.');
    return current;
  }
  async function capture() {
    state.manualCost = null;
    state.source = null;
    state.source = await verifySource();
    if (host) host.source = state.source;
    const s = state.source;
    for (const id of ['cost','amazonTax','amazonShipping','buyerShipping','buyerTax','category','adRate','surcharge','customRate']) $(id).value = '';
    $('other').value = '0'; $('international').value = '0'; $('topRatedPlus').checked = false;
    $('amazonStatus').textContent = 'Not read'; $('amazonLink').hidden = true; $('amazonTitle').textContent = ''; $('delivery').textContent = '';
    $('feedbackStatus').textContent = 'Not scanned'; $('comments').replaceChildren();
    for (const rating of ['positive','neutral','negative']) $(rating).textContent = '--';
    $('title').textContent = s.title; $('identity').textContent = 'Buyer: ' + s.user + ' | Item ' + s.itemId + ' | Listing $' + s.listing + ' | Offer $' + s.price;
    $('buyerOffer').value = s.price; $('sale').value = s.price; $('quantity').value = s.quantity; $('match').value = s.asin || s.sku;
    const settings = await chrome.storage.local.get('storePlan');
    $('plan').value = ['None','Starter','Basic','Premium','Anchor','Enterprise'].includes(settings.storePlan) ? settings.storePlan : '';
    if (s.promoted) $('adRate').value = '';
    calculation(); await save();
  }
  async function readAmazon() {
    const requestedAsin = C.asin($('match').value) || state.source.asin;
    const manual = state.manualCost?.key === state.source.key && state.manualCost.asin === requestedAsin && requestedAsin && (!state.source.asin || state.source.asin === requestedAsin) && C.cents(state.manualCost.value) !== null ? state.manualCost : null;
    state.manualCost = manual; state.amazon = null; $('cost').value = manual?.value || ''; $('amazonLink').hidden = true;
    $('amazonTitle').textContent = ''; $('delivery').textContent = ''; calculation();
    try {
      let asin = C.asin($('match').value) || state.source.asin;
      if (!asin) {
        $('amazonStatus').textContent = 'Reading the exact listing SKU...';
        const id = await worker('listing','https://www.ebay.com/sh/lst/active?keyword=' + state.source.itemId);
        const match = await waitPage(id,'listing-sku',{itemId:state.source.itemId});
        asin = match.asin; state.source.asin = asin; state.source.sku = match.sku; $('match').value = asin;
      }
      if (state.source.asin && state.source.asin !== asin) throw new Error('The entered Amazon item differs from this listing SKU.');
      $('amazonStatus').textContent = 'Reading ' + asin + '...';
      const id = await worker('amazon','https://www.amazon.com/dp/' + asin);
      const product = await waitPage(id,'amazon',{asin});
      state.manualCost = null; state.amazon = product; $('cost').value = product.price;
      $('amazonStatus').textContent = (state.source.asin ? 'Listing SKU match: ' : 'Operator-supplied ASIN (listing match unverified): ') + asin + ' | $' + product.price + ' item price | ' + new Date(product.capturedAt).toLocaleTimeString();
      $('amazonTitle').textContent = product.title; $('delivery').textContent = [product.availability,product.delivery].filter(Boolean).join(' | ');
      $('amazonLink').href = 'https://www.amazon.com/dp/' + asin; $('amazonLink').hidden = false;
      calculation(); await save();
    } catch(e) { $('amazonStatus').textContent = e.message + (manual ? ' | Using your manual price $' + manual.value : ''); calculation(); await save(); throw e; }
  }
  async function scanFeedback() {
    const user = state.source.user;
    state.feedback = {user,total:null,rows:[],pages:0,complete:false}; feedbackRender();
    try {
      const id = await worker('feedback',state.source.feedbackUrl,true);
      await waitPage(id,'feedback-left',{user});
      const settledPage = async predicate => {
        let previous = '';
        return waitPage(id,'feedback',{user},snapshot => {
          if (!predicate(snapshot)) { previous = ''; return false; }
          const signature = JSON.stringify([snapshot.total,snapshot.start,snapshot.end,snapshot.next,snapshot.rows]);
          const settled = signature === previous; previous = signature;
          snapshot.settled = settled; return settled;
        });
      };
      await settledPage(() => true);
      const size = await page(id,'feedback-size',{user});
      if (size.changed) await delay(700);
      let snapshot = await settledPage(p => (p.start === 1 || p.total === 0) && (!size.changed || p.end === Math.min(200,p.total)));
      while (running) {
        state.feedback = C.addFeedback(state.feedback,snapshot); feedbackRender(); await save();
        if (state.feedback.pagesComplete) break;
        if (!snapshot.next) throw new Error('eBay ended pagination before all entries were read.');
        if (state.feedback.pages >= 500) throw new Error('500 pages reached. The scan remains partial.');
        await page(id,'feedback-next',{user});
        const nextStart = state.feedback.through + 1;
        snapshot = await settledPage(p => p.start === nextStart);
      }
      if (!state.feedback.pagesComplete) throw new Error('Paused. Feedback scan is partial.');
    } catch(e) { state.feedback.error = e.message; feedbackRender(); await save(); throw e; }
  }
  async function run(which) {
    if (busy) return;
    const failures = [];
    busy = true; running = true; controls(); notice('Reading this offer. No marketplace submission will be made.');
    try {
      await verifySource();
      if (which !== 'feedback') { try { await readAmazon(); } catch(e) { failures.push(e.message); } }
      if (which !== 'amazon' && running) { try { await scanFeedback(); } catch(e) { failures.push(e.message); } }
      notice(failures.length ? failures.join(' | ') : 'Read complete. Review the fee category and cost assumptions.',failures.length > 0);
    } catch(e) { notice(e.message,true); }
    finally { running = false; busy = false; controls(); }
  }
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  $('checked').textContent = 'Rates checked ' + C.CHECKED;
  $('feeSource').href = C.SOURCES.store; $('adSource').href = C.SOURCES.ads;
  for (const [value,name] of Object.entries(C.CATEGORIES)) $('category').add(new Option(name,value));
  for (const id of fields) $(id).addEventListener('input',() => {
    if (id === 'cost') {
      const asin = C.asin($('match').value) || state.source?.asin;
      state.manualCost = asin && state.source && C.cents($('cost').value) !== null ? {key:state.source.key,asin,value:$('cost').value} : null;
    }
    calculation(); save().catch(() => {});
  });
  $('topRatedPlus').addEventListener('change',() => { calculation(); save().catch(() => {}); });
  $('plan').addEventListener('change',() => { $('feeSource').href = ['', 'None','Starter'].includes($('plan').value) ? C.SOURCES.selling : C.SOURCES.store; });
  $('readBoth').addEventListener('click',() => run('both'));
  $('readAmazon').addEventListener('click',() => run('amazon'));
  $('readFeedback').addEventListener('click',() => run('feedback'));
  $('pause').addEventListener('click',() => { running = false; controls(); notice('Pausing readers; captured results are retained.'); });
  $('refresh').addEventListener('click',async () => {
    try { state = {source:null,workers:{},feedback:null}; await capture(); notice('Offer refreshed.'); } catch(e) { notice(e.message,true); }
  });
  $('return').addEventListener('click',async () => {
    try { await verifySource(); await tabs.update(sourceId,{active:true}); } catch(e) { notice(e.message,true); }
  });
  $('showFeedback').addEventListener('click',async () => {
    try {
      const id = state.workers.feedback;
      const tab = id ? await tabs.get(id) : null;
      if (tab && C.feedbackUser(tab.url) === state.source.user) await tabs.update(id,{active:true});
      else await createReader('feedback',state.source.feedbackUrl,true);
    } catch(e) { notice(e.message,true); }
  });
  $('copy').addEventListener('click',async () => {
    try { await verifySource(); const n = C.cents($('sale').value,false); if (n === null) throw new Error('Enter a valid counteroffer.');
      await navigator.clipboard.writeText((n / 100).toFixed(2)); notice('Counteroffer amount copied. Nothing submitted.');
    } catch(e) { notice(e.message,true); }
  });
  window.addEventListener('beforeunload',() => { running = false; });
  host?.root.host.addEventListener('gldn-offer-dispose',() => { running = false; });
  controls();
  try {
    const saved = host ? await host.call('state-get') : (await chrome.storage.session.get(storageKey))[storageKey];
    await capture();
    if (saved?.source?.key === state.source.key && saved.source.user === state.source.user
      && saved.readerVersion === chrome.runtime.getManifest().version && saved.source.price === state.source.price && saved.source.quantity === state.source.quantity && saved.source.title === state.source.title && Date.now() - saved.savedAt < 15 * 60000) {
      state = {...saved};
      for (const [id,value] of Object.entries(saved.inputs || {})) if (fields.includes(id)) $(id).value = value;
      $('topRatedPlus').checked = saved.inputs?.topRatedPlus === true;
      $('match').value = saved.source.asin || saved.source.sku || '';
      if (state.amazon) {
        $('amazonStatus').textContent = 'Saved price $' + state.amazon.price + ' | Checked ' + new Date(state.amazon.capturedAt).toLocaleString();
        $('amazonTitle').textContent = state.amazon.title; $('delivery').textContent = [state.amazon.availability,state.amazon.delivery].filter(Boolean).join(' | ');
        $('amazonLink').href = 'https://www.amazon.com/dp/' + state.amazon.asin; $('amazonLink').hidden = false;
      }
      feedbackRender(); calculation(); notice('Saved review restored. Refresh readers for current prices.');
      if (!state.feedback?.pagesComplete) await run('feedback');
    } else await run('both');
    controls();
  } catch(e) { notice(e.message,true); }
};
if (!globalThis.GLDN_OFFER_HOST) globalThis.GLDN_OFFER_START();
