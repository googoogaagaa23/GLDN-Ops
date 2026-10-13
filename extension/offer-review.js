(async () => {
  'use strict';
  const C = globalThis.GLDN_OFFER, $ = id => document.getElementById(id);
  const fields = ['sale','quantity','cost','amazonTax','amazonShipping','buyerShipping','buyerTax','other','plan','category','adRate','surcharge','international','customRate','customOrderFee'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => (n < 0 ? '-$' : '$') + (Math.abs(n) / 100).toFixed(2);
  const sourceParam = new URLSearchParams(location.search).get('source');
  const sourceId = /^\d+$/.test(sourceParam || '') ? Number(sourceParam) : NaN;
  const deskId = (await chrome.tabs.getCurrent())?.id;
  const storageKey = 'gldnOfferReview:' + deskId;
  let state = {source:null,workers:{},feedback:null}, running = false, busy = false;
  const notice = (message,error = false) => { $('status').textContent = message; $('status').classList.toggle('error',error); };
  const delay = ms => new Promise(r => setTimeout(r,ms));
  const save = async () => chrome.storage.session.set({[storageKey]:{...state,inputs:inputs(),savedAt:Date.now()}});
  function inputs() { return {...Object.fromEntries(fields.map(id => [id,$(id).value])),topRatedPlus:$('topRatedPlus').checked}; }
  function calculation() {
    $('feeSource').href = ['None','Starter'].includes($('plan').value) ? C.SOURCES.selling : C.SOURCES.store;
    document.querySelectorAll('.custom').forEach(e => { e.hidden = $('category').value !== 'custom'; });
    try {
      const values = inputs(), result = C.estimate(values), offered = C.estimate({...values,sale:$('buyerOffer').value});
      $('offerProfit').textContent = money(offered.profit); $('counterProfit').textContent = money(result.profit);
      $('margin').textContent = result.margin.toFixed(1) + '%';
      const unknown = result.warnings.some(w => /excluded|assumed/.test(w));
      $('offerProfit').className = offered.profit < 0 ? 'negative' : unknown ? 'neutral' : 'positive';
      $('counterProfit').className = result.profit < 0 ? 'negative' : unknown ? 'neutral' : 'positive';
      const rows = [['Sale revenue (tax excluded)',result.revenue],['Buyer tax included in fee base',result.buyerTax],['Amazon cost incl. entered tax / shipping',result.supplier],
        ['Variable final value fee',result.variable],['Top Rated Plus discount',-result.discount],['Per-order fee',result.orderFee],
        ['Performance surcharge',result.surcharge],['International fee',result.international],['Advertising estimate',result.ads],['Other costs',result.other]];
      $('breakdown').innerHTML = rows.map(([name,n]) => '<tr><td>' + esc(name) + '</td><td>' + money(n) + '</td></tr>').join('');
      $('assumptions').textContent = result.warnings.join(' | ');
    } catch(e) {
      $('offerProfit').textContent = '--'; $('counterProfit').textContent = '--'; $('margin').textContent = '--';
      $('breakdown').replaceChildren(); $('assumptions').textContent = e.message;
    }
  }
  function feedbackRender() {
    if (!state.feedback) return;
    const s = C.feedbackSummary(state.feedback);
    for (const rating of ['positive','neutral','negative']) $(rating).textContent = s[rating] + ' / ' + (s.percentages[rating] === null ? '--' : s.percentages[rating].toFixed(1) + '%');
    $('feedbackStatus').textContent = (s.complete ? 'Complete' : 'Partial') + ': ' + s.total + ' of ' + (state.feedback.total ?? '?') + ' feedback entries | ' + state.feedback.pages + ' pages' + (state.feedback.error ? ' | ' + state.feedback.error : '');
    $('comments').innerHTML = state.feedback.rows.filter(r => r.rating !== 'positive').map(r => '<div class="comment"><strong class="' + esc(r.rating) + '">' + esc(r.rating) + '</strong>' + esc(r.comment) + '<small>' + esc(r.seller + ' | ' + r.when) + '</small></div>').join('') || '<p class="boundary">' + (s.complete ? 'No negative or neutral entries in this completed scan.' : 'No negative or neutral entries found so far.') + '</p>';
  }
  function controls() {
    for (const id of ['readBoth','readAmazon','readFeedback']) $(id).disabled = busy || !state.source;
    $('refresh').disabled = busy;
    $('pause').disabled = !busy || !running;
  }
  async function page(tabId,action,args = {}) {
    if (!running && action !== 'offer') throw new Error('Paused.');
    await chrome.scripting.executeScript({target:{tabId},files:['offer-review-core.js','offer-review-reader.js']});
    if (!running && action !== 'offer') throw new Error('Paused.');
    const results = await chrome.scripting.executeScript({target:{tabId},func:(action,args) => globalThis.GLDN_OFFER_READER(action,args),args:[action,args]});
    if (!results[0]?.result) throw new Error('The reader tab did not respond.');
    return results[0].result;
  }
  async function waitPage(tabId,action,args,predicate = () => true) {
    const deadline = Date.now() + 30000;
    let last = 'The reader page did not finish loading.';
    while (Date.now() < deadline) {
      if (!running) throw new Error('Paused. Results captured so far are retained.');
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          const snapshot = await page(tabId,action,args);
          if (predicate(snapshot)) return snapshot;
          last = 'The reader did not advance to the expected page.';
        }
      } catch(e) {
        last = e.message;
        if (/different item|variation changed|different buyer|verification|Wrong active/i.test(last)) throw e;
      }
      await delay(450);
    }
    throw new Error(last);
  }
  async function worker(kind,url) {
    if (!running) throw new Error('Paused.');
    const id = state.workers[kind];
    if (id) {
      try {
        const tab = await chrome.tabs.get(id);
        if (tab.openerTabId === deskId && tab.url === url) return id;
      } catch { /* A closed reader is replaced, never an unrelated tab. */ }
    }
    const tab = await chrome.tabs.create({url,active:false,openerTabId:deskId});
    state.workers[kind] = tab.id; await save(); return tab.id;
  }
  async function verifySource() {
    if (!Number.isInteger(sourceId) || sourceId < 0) throw new Error('Open GLDN Offer Review from one eBay Offer Received page.');
    const tab = await chrome.tabs.get(sourceId);
    const key = C.offer(tab.url)?.key;
    if (!key || (state.source && key !== state.source.key)) throw new Error('The originating eBay offer changed. Open a new review from that offer.');
    const current = await page(sourceId,'offer');
    if (state.source && (current.user !== state.source.user || current.price !== state.source.price || current.quantity !== state.source.quantity || current.title !== state.source.title)) throw new Error('Buyer, offer, title, or quantity changed. Refresh the offer.');
    return current;
  }
  async function capture() {
    state.source = null;
    state.source = await verifySource();
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
    state.amazon = null; $('cost').value = ''; $('amazonLink').hidden = true;
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
      state.amazon = product; $('cost').value = product.price;
      $('amazonStatus').textContent = (state.source.asin ? 'Listing SKU match: ' : 'Operator-supplied ASIN (listing match unverified): ') + asin + ' | $' + product.price + ' item price | ' + new Date(product.capturedAt).toLocaleTimeString();
      $('amazonTitle').textContent = product.title; $('delivery').textContent = [product.availability,product.delivery].filter(Boolean).join(' | ');
      $('amazonLink').href = 'https://www.amazon.com/dp/' + asin; $('amazonLink').hidden = false;
      calculation(); await save();
    } catch(e) { $('amazonStatus').textContent = e.message; await save(); throw e; }
  }
  async function scanFeedback() {
    const user = state.source.user;
    state.feedback = {user,total:null,rows:[],pages:0,complete:false}; feedbackRender();
    try {
      const id = await worker('feedback',state.source.feedbackUrl);
      await waitPage(id,'feedback-left',{user});
      await waitPage(id,'feedback',{user});
      const size = await page(id,'feedback-size',{user});
      if (size.changed) await delay(700);
      let snapshot = await waitPage(id,'feedback',{user},p => (p.start === 1 || p.total === 0) && (!size.changed || p.rows.length === Math.min(200,p.total)));
      while (running) {
        state.feedback = C.addFeedback(state.feedback,snapshot); feedbackRender(); await save();
        if (state.feedback.complete) break;
        if (!snapshot.next) throw new Error('eBay ended pagination before all entries were read.');
        if (state.feedback.pages >= 500) throw new Error('500 pages reached. The scan remains partial.');
        await page(id,'feedback-next',{user});
        const nextStart = state.feedback.rows.length + 1;
        snapshot = await waitPage(id,'feedback',{user},p => p.start === nextStart);
      }
      if (!state.feedback.complete) throw new Error('Paused. Feedback scan is partial.');
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
  for (const id of fields) $(id).addEventListener('input',() => { calculation(); save().catch(() => {}); });
  $('topRatedPlus').addEventListener('change',() => { calculation(); save().catch(() => {}); });
  $('plan').addEventListener('change',() => { $('feeSource').href = ['None','Starter'].includes($('plan').value) ? C.SOURCES.selling : C.SOURCES.store; });
  $('readBoth').addEventListener('click',() => run('both'));
  $('readAmazon').addEventListener('click',() => run('amazon'));
  $('readFeedback').addEventListener('click',() => run('feedback'));
  $('pause').addEventListener('click',() => { running = false; controls(); notice('Pausing readers; captured results are retained.'); });
  $('refresh').addEventListener('click',async () => {
    try { state = {source:null,workers:{},feedback:null}; await capture(); notice('Offer refreshed.'); } catch(e) { notice(e.message,true); }
  });
  $('return').addEventListener('click',async () => {
    try { await verifySource(); await chrome.tabs.update(sourceId,{active:true}); } catch(e) { notice(e.message,true); }
  });
  $('showFeedback').addEventListener('click',async () => {
    try {
      const id = state.workers.feedback;
      const tab = id ? await chrome.tabs.get(id) : null;
      if (tab && C.feedbackUser(tab.url) === state.source.user) await chrome.tabs.update(id,{active:true});
      else await chrome.tabs.create({url:state.source.feedbackUrl});
    } catch(e) { notice(e.message,true); }
  });
  $('copy').addEventListener('click',async () => {
    try { await verifySource(); const n = C.cents($('sale').value,false); if (n === null) throw new Error('Enter a valid counteroffer.');
      await navigator.clipboard.writeText((n / 100).toFixed(2)); notice('Counteroffer amount copied. Nothing submitted.');
    } catch(e) { notice(e.message,true); }
  });
  window.addEventListener('beforeunload',() => { running = false; });
  controls();
  try {
    const saved = (await chrome.storage.session.get(storageKey))[storageKey];
    await capture();
    if (saved?.source?.key === state.source.key && saved.source.user === state.source.user
      && saved.source.price === state.source.price && saved.source.quantity === state.source.quantity && saved.source.title === state.source.title && Date.now() - saved.savedAt < 15 * 60000) {
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
    } else await run('both');
    controls();
  } catch(e) { notice(e.message,true); }
})();
