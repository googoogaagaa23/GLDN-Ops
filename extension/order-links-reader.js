(()=>{
  'use strict';
  const C=globalThis.GLDN_ORDER_LINKS;
  const visible=el=>!!el&&!el.closest('[hidden],[aria-hidden="true"],[id^="gldn-"]')&&el.getClientRects().length>0;
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)].filter(visible);
  const text=el=>C.text(el?.innerText||el?.textContent);
  function ebay(){
    if(!C.ebayPage(location.href))throw Error('Open one eBay order or return first.');
    if(!all('h1,h2').length)throw Error('The eBay order is still loading.');
    const linked=[...new Set(all('a[href]').map(a=>C.orderFromUrl(a.href)).filter(Boolean))];
    const orderId=C.orderFromUrl(location.href)||(linked.length===1?linked[0]:'');
    const notes=[];
    for(const marker of all('span,div,dt,p,strong').filter(el=>text(el).toLowerCase()==='my note')){
      let parent=marker.parentElement;
      for(let n=0;parent&&n<5;n++,parent=parent.parentElement){
        if(parent.closest('[id^="gldn-"]')||all('textarea,input,[contenteditable="true"]',parent).length)continue;
        const edits=all('a,button,[role="button"]',parent).filter(el=>/^edit$/i.test(text(el)));
        if(edits.length>1)break;
        if(edits.length===1){notes.push(text(parent).replace(/^my note\s*/i,'').replace(/\s+(?:Edit|Delete)(?=\s|$)/g,'').trim());break;}
      }
    }
    const nativeText=all('main').map(text).join(' ')||text(document.body);
    const skus=[...nativeText.matchAll(/Custom label\s*\(SKU\)\s*:?\s*([A-Za-z0-9+/=_-]+)/gi)].map(match=>match[1]);
    return C.context({orderId,notes,skus,sourceUrl:location.href});
  }
  function tracker(){
    if(!C.trackerPage(location.href))throw Error('Open the real Trackerbot account, not its demo.');
    const input=document.querySelector('#searchPhrase'),button=document.querySelector('#searchSubmit');
    const rows=all('#contactTableBody tr[id^="notification-"]').map(row=>({
      orderId:text(row.querySelector('.td-orderId a'))||text(row.querySelector('.td-orderId')),
      amazonOrderId:text(row.querySelector('.td-orderNumber a'))||text(row.querySelector('.td-orderNumber')),
      supplier:text(row.querySelector('.td-type')),supplierEmail:text(row.querySelector('.td-supplierEmail')),
      recordId:row.id,title:text(row.querySelector('.td-item'))
    }));
    return {ready:visible(input)&&visible(button)&&text(button)==='Search',login:all('input[type="password"]').length>0,query:input?.value||'',busy:visible(document.querySelector('#indicator'))||all('#loading-overlay,.loading-overlay,[aria-busy="true"]').length>0,rows};
  }
  globalThis.GLDN_ORDER_LINKS_READER=(op,args={})=>{
    if(op==='ebay')return ebay();
    if(op==='tracker-read')return tracker();
    if(op==='tracker-search'){
      const id=C.ebayId(args.orderId);if(!id)throw Error('An exact eBay order number is required.');
      const state=tracker();if(!state.ready)throw Error(state.login?'Sign in to Trackerbot in the opened tab, then try again.':'Trackerbot search is still loading.');
      for(const selector of ['#startdatepicker','#enddatepicker']){const input=document.querySelector(selector);if(input){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));}}
      for(const selector of ['#sel1','#sel2','#accountSelect','#supplierAccountEmail']){
        const select=document.querySelector(selector);if(!select)continue;
        const option=[...select.options].find(option=>/^all(?:\s|$)/i.test(option.textContent));
        if(!option)throw Error('Trackerbot filters could not be reset safely. Search the exact order manually.');
        select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const input=document.querySelector('#searchPhrase');input.value=id;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#searchSubmit').click();return {started:true};
    }
    if(op==='tracker-highlight'){
      const ids=all('#contactTableBody tr[id^="notification-"]').filter(row=>C.ebayId(text(row.querySelector('.td-orderId a'))||text(row.querySelector('.td-orderId')))===C.ebayId(args.orderId));
      for(const row of ids)row.style.outline='2px solid #176d54';ids[0]?.scrollIntoView({block:'center'});return {matches:ids.length};
    }
    throw Error('Unknown order lookup operation.');
  };
})();
