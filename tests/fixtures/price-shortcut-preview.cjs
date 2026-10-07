// Synthetic DOM preview: all navigation, storage and marketplace controls are local.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const itemId = '123456789012';
const title = 'Adjustable Doorway Pull Up Bar';
const bootstrap = `
const nativeCore=GLDN_EBAY_PRICE_CORE;
const canonical=value=>String(value||'').replace(location.origin,'https://www.ebay.com');
const mapped={...nativeCore};
for(const name of ['ebayUrl','itemId','isEditor','entryItemId','isRevisionLink','editorKey']) mapped[name]=value=>nativeCore[name](canonical(value));
mapped.bindEditor=(run,current,target)=>nativeCore.bindEditor(run,canonical(current),canonical(target));
mapped.applyAllowed=(run,url,value)=>nativeCore.applyAllowed(run,canonical(url),value);
window.GLDN_EBAY_PRICE_CORE=mapped;
const events={};
const store=()=>JSON.parse(sessionStorage.getItem('fixtureStore')||'{}');
window.chrome={
 runtime:{id:'fixture',onMessage:{addListener:fn=>events.message=fn},sendMessage:msg=>new Promise(resolve=>events.message(msg,{id:'fixture',url:canonical(location.href),tab:{id:1}},resolve))},
 storage:{local:{get:async()=>JSON.parse(sessionStorage.getItem('fixtureLocal')||'{}')},session:{get:async key=>({[key]:store()[key]}),set:async data=>sessionStorage.setItem('fixtureStore',JSON.stringify({...store(),...data})),remove:async key=>{const data=store();delete data[key];sessionStorage.setItem('fixtureStore',JSON.stringify(data));}}},
 tabs:{onUpdated:{addListener:fn=>events.updated=fn},onRemoved:{addListener:fn=>events.removed=fn}}
};
window.GLDN_FOUNDATION={workflowStateKeys:['pendingRun'],activeWorkflowEntries:data=>data.pendingRun?.active?['pendingRun']:[]};
window.OrderNoteUtils={isVisible:el=>Boolean(el.getClientRects().length),setNativeValue:(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}};
`;
const priceHtml = params => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Price shortcut - synthetic preview</title><link rel="stylesheet" href="/styles.css"><style>body{font:15px Arial;margin:0;color:#202124;background:#fff}header{background:#f0f2f4;padding:12px}main{max-width:700px;margin:32px auto;padding:0 18px}h1{font-size:24px}label{display:block;margin:12px 0}input,button{font:inherit;padding:10px;border:1px solid #999;border-radius:4px}input{width:160px}button{cursor:pointer}button:disabled{color:#222;opacity:1;background:#eee}.native-pricing{padding:16px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd}.summary__header-container{margin:16px 0}h2{font-size:18px}#native-revise{margin-top:20px;background:#0654ba;color:white;border:0}[hidden]{display:none!important}</style></head><body><header>Synthetic test listing. No live eBay changes.</header><main>
${params.get('screen')==='item' ? `<h1>${title}</h1><p>$27.19</p><a href="/sl/list?itemId=${itemId}&mode=ReviseItem">Revise listing</a><p><button onclick="GLDN_EBAY_PRICE_INCREASE.start()">Price +$0.10</button></p>` : `<h1>Revise your listing</h1><label>Item title <input aria-label="Item title" value="${title}" style="width:100%;box-sizing:border-box"></label><div class="summary__header-container"><div><div><h2>Variations</h2></div></div><div>${params.get('variation')==='1'?'Edit variation prices':'Variations are not available because the original listing did not include them. To use variations, create a new listing.'}</div></div><section class="native-pricing"><h2>Pricing</h2><span id="format-label">Format</span><button aria-haspopup="listbox" aria-labelledby="format-label format-value" disabled value="${params.get('auction')==='1'?'Auction':'Buy It Now'}"><span id="format-value">${params.get('auction')==='1'?'Auction':'Buy It Now'}</span></button><label>Item price <input aria-label="Item price" value="${params.get('price') || '27.19'}"></label><label>Quantity <input aria-label="Quantity" value="1"></label><label>Ad rate <input aria-label="Ad rate" value="5"></label><label>Minimum offer <input aria-label="Minimum offer" value="20.00"></label></section><button id="native-revise" onclick="document.getElementById('save-count').textContent=String(Number(document.getElementById('save-count').textContent)+1)">Revise it</button><p>Native revision count: <span id="save-count">0</span></p>`}
</main><script src="/ebay-price-core.js"></script><script src="/bootstrap.js"></script><script src="/ebay-price-background.js"></script><script>events.updated(1,{url:canonical(location.href)});</script><script src="/ebay-price-increase.js"></script></body></html>`;
function popupScript() {
  const source = read('extension/popup.js');
  const start = source.indexOf('function normalizePopupTab(');
  const end = source.indexOf('function accountForComputer(', start);
  return `const popupTabButtons=[...document.querySelectorAll('[data-popup-tab]')],popupSections=[...document.querySelectorAll('[data-popup-section]')],workflowFilterButtons=[...document.querySelectorAll('[data-workflow-filter]')],workflowSections=[...document.querySelectorAll('[data-workflow-group]')],workflowEmptyElement=document.getElementById('workflowEmpty'),workflowSearchInput=document.getElementById('workflowSearch');
const POPUP_TABS=['workflows','guides','status','settings'],WORKFLOW_GROUPS=['daily','listings','research','profit','supplier','poshmark'],POPUP_TAB_KEY='tab';let activeWorkflowGroup='daily';const chrome={storage:{local:{set:()=>{}}}};
${source.slice(start,end)}
workflowFilterButtons.forEach(button=>button.onclick=()=>{workflowSearchInput.value='';applyWorkflowFilter(button.dataset.workflowFilter);});
activatePopupTab('workflows',{persist:false});document.getElementById('currentVersion').textContent='v3.12.50';`;
}
function createServer() {
  return http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/sl/list') {
      res.setHeader('Content-Type','text/html');
      return res.end(`<script src="/ebay-price-core.js"></script><script src="/bootstrap.js"></script><script src="/ebay-price-background.js"></script><script>events.updated(1,{url:canonical(location.href)});chrome.runtime.sendMessage({type:'ebayPriceIncrease',action:'get'}).then(()=>location.replace('/lstng?draftId=9876543210&mode=ReviseItem'));</script>`);
    }
    if(url.pathname==='/popup') {
      res.setHeader('Content-Type','text/html');
      return res.end(read('extension/popup.html').replace(/<script[\s\S]*?<\/script>/g,'').replace('</body>','<script src="/popup-fixture.js"></script></body>'));
    }
    if(url.pathname==='/popup-fixture.js') {res.setHeader('Content-Type','text/javascript');return res.end(popupScript());}
    if(url.pathname==='/bootstrap.js') {res.setHeader('Content-Type','text/javascript');return res.end(bootstrap);}
    if(url.pathname==='/ebay-price-increase.js') {
      res.setHeader('Content-Type','text/javascript');
      return res.end(read('extension/ebay-price-increase.js').replace('location.assign(result.run.editorUrl);','location.assign(result.run.editorUrl.replace("https://www.ebay.com",location.origin));'));
    }
    const files=['styles.css','ebay-price-core.js','ebay-price-background.js','ebay-price-increase.js','icons/icon48.png'];
    if(files.includes(url.pathname.slice(1))) {
      res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.png')?'image/png':'text/javascript');
      return res.end(fs.readFileSync(path.join(root,'extension',url.pathname.slice(1))));
    }
    if(url.pathname==='/lstng'||url.pathname===`/itm/${itemId}`) {
      if(url.pathname.startsWith('/itm/'))url.searchParams.set('screen','item');
      res.setHeader('Content-Type','text/html');return res.end(priceHtml(url.searchParams));
    }
    res.writeHead(404);res.end();
  });
}
module.exports={createServer};
if(require.main===module) createServer().listen(4391,'127.0.0.1',()=>console.log('Synthetic price preview http://127.0.0.1:4391/lstng?draftId=9876543210&mode=ReviseItem'));
