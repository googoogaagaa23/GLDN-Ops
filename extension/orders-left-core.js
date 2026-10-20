(function(root,factory){const api=factory();root.GLDN_ORDERS_LEFT=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;})(globalThis,()=>{
  'use strict';
  const PAGE_LIMIT=5,SCAN_VERSION=2,KEYWORDS=Object.freeze(['Add Tracking','Check']);
  const text=value=>String(value??'').replace(/\s+/g,' ').trim();
  const keywordMatches=value=>KEYWORDS.filter((keyword,index)=>(index===0?/\badd\s+tracking\b/i:/\bcheck\b/i).test(text(value)));
  function ordersUrl(value){
    try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&/(^|\.)ebay\.com$/i.test(u.hostname)&&/^\/sh\/ord\/?$/.test(u.pathname)?u:null;}catch{return null;}
  }
  function scope(value){
    const u=ordersUrl(value);if(!u)return '';
    for(const key of [...u.searchParams.keys()])if(/^(offset|page|pgn|pageNumber|pagination|limit|pageSize|itemsPerPage)$/i.test(key))u.searchParams.delete(key);
    u.pathname='/sh/ord/';u.hash='';u.searchParams.sort();return u.href;
  }
  function orderUrl(value){
    try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!/(^|\.)ebay\.com$/i.test(u.hostname)||!/^\/(sh|mesh)\/ord\/details\/?$/i.test(u.pathname))return null;
      const id=u.searchParams.get('orderid')||u.searchParams.get('orderId');return /^\d{2}-\d{5}-\d{5}$/.test(id||'')?{id,url:u.href}:null;
    }catch{return null;}
  }
  function date(value,now=new Date()){
    const raw=text(value);if(!raw)return '';
    let y,m,d,explicit=false;
    const key=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
    const numeric=raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\s|$)/);
    const named=raw.match(/^(?:(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:\s|$)/i);
    if(/^today\b|^yesterday\b/i.test(raw)){
      const n=new Date(now.getFullYear(),now.getMonth(),now.getDate());if(/^yesterday/i.test(raw))n.setDate(n.getDate()-1);
      [y,m,d]=[n.getFullYear(),n.getMonth()+1,n.getDate()];explicit=true;
    }else if(key){[y,m,d]=key.slice(1).map(Number);explicit=true;}
    else if(numeric){m=+numeric[1];d=+numeric[2];y=+numeric[3]||now.getFullYear();explicit=!!numeric[3];}
    else if(named){m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(named[1].slice(0,3).toLowerCase())+1;d=+named[2];y=+named[3]||now.getFullYear();explicit=!!named[3];}
    else return '';
    let result=new Date(y,m-1,d);if(!explicit&&result>new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)){y--;result=new Date(y,m-1,d);}
    if(y<1995||y>2100||result.getFullYear()!==y||result.getMonth()!==m-1||result.getDate()!==d)return '';
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function dateLabel(key,now=new Date()){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return 'Date unavailable';
    const [y,m,d]=key.split('-').map(Number),weekday=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d,12)));
    return `${weekday}, ${m}/${d}${y===now.getFullYear()?'':'/'+y}`;
  }
  function summary(rows,now=new Date()){
    const groups=new Map(),unique=new Map(),keywordRows=new Map(KEYWORDS.map(keyword=>[keyword,[]]));let canceled=0,noted=0,unknown=0,pending=0,keywordUnknown=0;
    for(const row of rows||[])if(/^\d{2}-\d{5}-\d{5}$/.test(row.id||''))unique.set(row.id,row);
    for(const row of unique.values()){
      if(row.canceled===true){canceled++;continue;}
      if(row.canceled!==false||!Array.isArray(row.keywords))keywordUnknown++;
      else for(const keyword of KEYWORDS)if(row.keywords.includes(keyword))keywordRows.get(keyword).push({id:row.id,date:date(row.date,now),url:orderUrl(row.url)?.id===row.id?row.url:''});
      if(row.note==='present'){noted++;continue;}
      if(row.note!=='none'||row.canceled!==false||!date(row.date,now)){unknown++;continue;}
      pending++;groups.set(row.date,(groups.get(row.date)||0)+1);
    }
    return {checked:unique.size,pending,canceled,noted,unknown,keywordUnknown,keywords:KEYWORDS.map(keyword=>({keyword,count:keywordRows.get(keyword).length,orders:keywordRows.get(keyword).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))})),groups:[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,count,label:`${dateLabel(date,now)} ${count} ${count===1?'order':'orders'} left`}))};
  }
  function append(state,page){
    if(!page||!Array.isArray(page.rows))throw Error('The eBay order rows could not be read.');
    if(state.account&&page.account&&state.account!==page.account)throw Error('The signed-in eBay account changed.');
    if(page.unknownIds)throw Error('Some order numbers could not be identified.');
    if(page.range){
      const {start,end,total}=page.range;
      if(![start,end,total].every(Number.isInteger)||start<0||end<start||total<end)throw Error('The native order result range is invalid.');
      if(state.total!==null&&state.total!==total)throw Error('The order total changed during the read. Recount to refresh it.');
      if(total&&start!==(state.through||0)+1)throw Error('Order pages were skipped or repeated.');
      state.total=total;state.through=end;
    }
    const signature=JSON.stringify([page.range||null,page.rows.map(row=>row.id)]);
    if(state.signatures.includes(signature))throw Error('The same order page appeared twice.');
    state.signatures.push(signature);state.pages++;
    for(const row of page.rows){
      if(!/^\d{2}-\d{5}-\d{5}$/.test(row.id||''))throw Error('An order number is missing.');
      const previous=state.rows[row.id];state.rows[row.id]={...row,...(Array.isArray(row.keywords)?{keywords:[...new Set([...(previous?.keywords||[]),...row.keywords])]}:{})};
    }
    state.account ||= page.account;
    return state;
  }
  return Object.freeze({PAGE_LIMIT,SCAN_VERSION,KEYWORDS,text,keywordMatches,ordersUrl,scope,orderUrl,date,dateLabel,summary,append});
});
