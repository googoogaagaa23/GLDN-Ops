(()=>{
  'use strict';
  const C=globalThis.GLDN_ORDERS_LEFT;
  const visible=el=>!!el&&!el.closest('[hidden],[aria-hidden="true"],[id^="gldn-"]')&&el.getClientRects().length>0;
  const text=el=>C.text(el?.innerText||el?.textContent);
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)].filter(visible);
  const controls=root=>all('button,a,[role="button"],[role="menuitem"]',root);
  const signal=el=>C.text(el.getAttribute('aria-label')||el.getAttribute('title')||text(el));
  const disabled=el=>el.disabled||el.getAttribute('aria-disabled')==='true'||el.classList.contains('disabled');
  function account(){
    const link=document.querySelector('#gh .gh-identity a[href*="/usr/"],#gh-ug a[href*="/usr/"],header a[href*="myworld.ebay.com/"]');
    if(link){try{return decodeURIComponent(new URL(link.href).pathname.split('/').filter(Boolean).pop()).toLowerCase();}catch{}}
    const el=document.querySelector('#gh-eb-u,[data-testid="account-username"],[data-test="account-username"]');
    return C.text(el?.getAttribute('data-username')||text(el)).toLowerCase();
  }
  function guard(){
    const body=text(document.body);
    if(/pardon our interruption|verify yourself|sign in to your account|security check|checking your browser/i.test(body))throw Error('eBay needs sign-in or verification in the reader tab.');
    if(all('[role="progressbar"],[aria-busy="true"],.progress-spinner,[aria-label="Loading"]').length)throw Error('The eBay orders are still loading.');
  }
  function cells(row){
    const table=row.closest('table,[role="grid"]');
    const headers=table?[...table.querySelectorAll('thead th,[role="columnheader"]')].map(text):[];
    const values=[...row.querySelectorAll(':scope > td,:scope > [role="gridcell"]')];
    return pattern=>values[headers.findIndex(value=>pattern.test(value))]||null;
  }
  function note(row){
    const labels=controls(row).map(signal);
    if(labels.some(value=>/^(?:edit|view)(?: (?:a|the|your|private|order))* note(?: for (?:this )?order)?$|^(?:note added|has note)$/i.test(value)))return 'present';
    const candidate=cells(row)(/^(?:private |order |my )?notes?$/i)||all('[data-testid="order-note"],.order-note,.orderNote,.private-note',row)[0];
    const cell=visible(candidate)?candidate:null;
    if(cell){
      const content=text(cell).replace(/^(?:my |order |private )?notes?\s*:?\s*/i,'').replace(/\b(?:edit|delete|add(?: (?:a|an|private|order))* note)\b/gi,'').trim();
      if(content&&!/^(?:no notes?|--|-)$/i.test(content))return 'present';
      if(!all('textarea,input',cell).length)return 'none';
    }
    if(labels.some(value=>/^add(?: (?:a|an|private|order))* note(?: (?:to|for) (?:this )?order)?$/i.test(value)))return 'none';
    return 'unknown';
  }
  function canceled(row){
    const candidate=cells(row)(/^(?:order )?status$/i)||all('[data-testid="order-status"],.order-status,.orderStatus',row)[0];
    const cell=visible(candidate)?candidate:null;
    const statuses=cell?[text(cell)]:all('h1,h2,h3,h4,[role="heading"]',row).map(text);
    if(cell&&/\bcancel(?:l)?ed\b/i.test(text(cell)))return true;
    if(statuses.some(value=>/^(?:order )?cancel(?:l)?ed(?:\s*[-:.!]|\s+(?:on|by|at)\b|\s*$)|^this order (?:was|has been) cancel(?:l)?ed\b/i.test(value)))return true;
    if(statuses.some(value=>/^(?:awaiting|shipped|delivered|paid|payment|completed|ready to ship|on hold|refund|return)/i.test(value)))return false;
    return null;
  }
  function labeled(root,names){
    for(const el of all('dt,span,div,th,label',root)){
      if(!names.test(text(el))||el.children.length>1)continue;
      const next=el.nextElementSibling;if(next&&C.date(text(next)))return C.date(text(next));
      if(el.parentElement&&el.parentElement.children.length<=3){const value=text(el.parentElement).replace(text(el),'').trim();if(C.date(value))return C.date(value);}
    }
    return '';
  }
  function orderDate(row){
    const candidate=cells(row)(/^(?:date sold|sold|order date|date paid|paid on)$/i)||all('[data-testid="order-date"],.order-date,.date-sold',row)[0];
    const cell=visible(candidate)?candidate:null;
    const time=cell?.querySelector('time[datetime]');
    if(cell)return C.date(text(cell))||C.date(time?.getAttribute('datetime'));
    return labeled(row,/^(?:sold|date sold|order date)\s*:?$/i)||C.date(text(row).match(/\b(?:date sold|order date|sold)\s*:?\s*((?:[A-Za-z]{3,9}\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{4})?|today|yesterday))/i)?.[1]);
  }
  function container(anchor,id){
    let node=anchor.parentElement,best=null;
    for(let depth=0;node&&node!==document.body&&depth<12;depth++,node=node.parentElement){
      const ids=new Set([...node.querySelectorAll('a[href]')].map(a=>C.orderUrl(a.href)?.id).filter(Boolean));
      if(ids.size>1)break;
      if(ids.has(id)&&node.matches('tr,[role="row"],article,li,[data-testid*="order"],.order-card,.orderCard,.order-row'))return node;
      if(ids.has(id)&&(orderDate(node)||controls(node).some(el=>/^(?:add|edit|view)(?: (?:a|an|private|order))* note$/i.test(signal(el)))))best=node;
    }
    return best;
  }
  function navigation(){
    const nodes=controls(document);
    const next=nodes.find(el=>/^(?:(?:go|navigate) to (?:the )?)?next(?: page)?$/i.test(signal(el))||el.getAttribute('rel')==='next');
    const previous=nodes.find(el=>/^(?:(?:go|navigate) to (?:the )?)?previous(?: page)?$/i.test(signal(el))||el.getAttribute('rel')==='prev');
    const first=nodes.find(el=>/^(?:(?:go|navigate) to )?(?:page )?1$|^first(?: page)?$/i.test(signal(el))&&!!el.closest('nav,[class*="pagination"],[aria-label*="agination"]'));
    const page=all('[aria-current="page"],.pagination__item--current').map(text).find(value=>/^\d+$/.test(value));
    return {next,previous,first,page:page?Number(page):null};
  }
  function snapshot(){
    if(!C.ordersUrl(location.href))throw Error('Open the eBay Orders page.');guard();
    const rows=new Map();let unknownIds=0;
    for(const anchor of all('a[href]')){
      const parsed=C.orderUrl(anchor.href);if(!parsed)continue;
      const row=container(anchor,parsed.id);if(!row){unknownIds++;continue;}
      rows.set(parsed.id,{id:parsed.id,url:parsed.url,date:orderDate(row),note:note(row),canceled:canceled(row)});
    }
    const body=text(document.body),match=body.match(/\b(?:Results?|Orders?)\s*:?\s*([\d,]+)\s*[-\u2013]\s*([\d,]+)\s+(?:of|out of)\s+([\d,]+)/i);
    const range=match?{start:Number(match[1].replace(/,/g,'')),end:Number(match[2].replace(/,/g,'')),total:Number(match[3].replace(/,/g,''))}:null;
    const nav=navigation(),empty=!rows.size&&/\b(?:no (?:matching )?orders? (?:found|to show|available)|there are no (?:matching )?orders?)\b/i.test(body);
    if(!rows.size&&!empty)throw Error('The order list is still loading or its layout is not recognized.');
    return {account:account(),rows:[...rows.values()],unknownIds,range,empty,page:nav.page,
      hasNext:!!nav.next&&!disabled(nav.next),terminal:empty||!!nav.next&&disabled(nav.next)||!!range&&range.end===range.total&&!nav.next,
      first:empty||range?.start===1||nav.page===1||!!nav.previous&&disabled(nav.previous),canFirst:!!nav.first&&!disabled(nav.first),canPrevious:!!nav.previous&&!disabled(nav.previous)};
  }
  function detail(id,openMenu){
    const parsed=C.orderUrl(location.href);if(!parsed||parsed.id!==id)throw Error('The order detail reader changed to a different order.');guard();
    let saved='unknown';
    for(const marker of all('span,div,dt,dd,p,h2,h3'))if(/^my note\s*:?$/i.test(text(marker))){
      let parent=marker.parentElement;
      for(let depth=0;parent&&depth<4;depth++,parent=parent.parentElement){
        const edits=controls(parent).filter(el=>/^edit$/i.test(signal(el)));
        if(edits.length===1&&text(parent).replace(/^my note\s*:?/i,'').replace(/\b(?:edit|delete)\b/gi,'').trim()){saved='present';break;}
        if(edits.length>1)break;
      }
    }
    const actions=controls(document).map(signal);
    if(actions.some(value=>/^edit(?: order)? note$/i.test(value)))saved='present';
    else if(saved!=='present'&&actions.some(value=>/^add(?: order)? note$/i.test(value)))saved='none';
    if(saved==='unknown'&&openMenu){const more=controls(document).filter(el=>/^more actions$/i.test(signal(el)));if(more.length===1&&!disabled(more[0]))more[0].click();}
    const body=text(document.body);let cancel=canceled(document.body);
    if(/\b(?:this order (?:was|has been) cancel(?:l)?ed|you cancel(?:l)?ed this order|order cancellation (?:is )?complete)\b/i.test(body))cancel=true;
    if(cancel===null&&/\b(?:shipped on|you successfully shipped your order|awaiting shipment|buyer paid)\b/i.test(body))cancel=false;
    return {id,url:parsed.url,account:account(),date:orderDate(document.body),note:saved,canceled:cancel};
  }
  globalThis.GLDN_ORDERS_LEFT_READER=(action,args={})=>{
    if(action==='read')return snapshot();
    if(action==='detail')return detail(args.id,args.openMenu===true);
    if(!['first','previous','next'].includes(action))throw Error('Unknown order-count reader action.');
    snapshot();const control=navigation()[action];if(!control||disabled(control))throw Error('The requested native order page is unavailable.');
    if(control.tagName==='A'&&control.href&&C.scope(control.href)!==C.scope(location.href))throw Error('The pagination control changes the order filters.');
    control.click();return {changed:true};
  };
})();
