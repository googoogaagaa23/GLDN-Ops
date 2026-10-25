const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension'),output=path.join(root,'.test-tmp','orders-left-v3.12.63');
const C=require('../extension/orders-left-core.js');
const number=n=>'01-00001-'+String(n).padStart(5,'0');
const url='https://www.ebay.com/sh/ord/?filter=status:ALL_ORDERS&offset=4';
const records=[1,2,3,4,5,6,7,8,9].map(n=>({id:number(n),date:n===7?'':'2026-10-'+(n===4||n===9?'16':'15'),note:n===2?'present':[6,7,9].includes(n)?'unknown':'none',canceled:[3,8].includes(n),sample:[1,3].includes(n)?'ADD Tracking; Check':n===2?'Check supplier':n===5?'Check and check':n===7?'Add Tracking':'Checkout checkbox checked'}));
const large=Array.from({length:235},(_,n)=>({id:number(n+1),date:'2026-10-'+(n%2?'16':'15'),note:(n+1)%5?'none':'present',canceled:(n+1)%11===0,sample:(n%7===0?'Add Tracking ':'')+(n%5===0?'Check ':'')}));
const volume=Array.from({length:1501},(_,n)=>({...large[n%large.length],id:number(n+1)}));
function ordersHTML(value){
  const scenario=new URL(value).searchParams.get('scenario')||'normal',data=scenario==='volume'?volume:['large','icon','offset','lazyfooter'].includes(scenario)?large:records,initial=['normal','lazyfooter'].includes(scenario)?2:1;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial;margin:0;color:#222}main{max-width:1100px;padding:22px;margin:auto}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}a{color:#165d9d}nav{padding:16px}button{padding:8px}#native{overflow:auto}@media(max-width:600px){main{padding:12px}td,th{padding:8px}}</style></head><body><header id="gh"><span data-testid="account-username">fixture-seller</span></header><main><div class="heading"><h1>All orders</h1></div><div id="native"></div><script>
  const records=${JSON.stringify(data)},scenario=${JSON.stringify(scenario)};let page=${initial};window.submitted=0;
  function render(){
    if(scenario==='empty'){document.querySelector('#native').innerHTML='<p>No orders found</p>';return;}
    const per=scenario==='volume'?200:['large','icon','offset','lazyfooter'].includes(scenario)?100:4,start=(page-1)*per,end=Math.min(start+per,records.length),slice=records.slice(start,end);
    const rows=slice.map(row=>'<tr data-order="'+row.id+'"><td><a href="https://www.ebay.com/sh/ord/details?orderid='+row.id+'">'+row.id+'</a>'+(row.id.endsWith('00005')?'<br><a href="https://www.ebay.com/sh/ord/details?orderid='+row.id+'">Second item in same order</a>':'')+'<span class="sample">'+row.sample+'</span><span hidden>Check Add Tracking</span><span id="gldn-row-'+row.id+'">Check Add Tracking</span></td><td>'+(scenario==='normal'&&row.id.endsWith('00001')?'<time datetime="2026-10-16T01:00:00Z">Oct 15, 2026</time>':row.date)+'</td><td class="order-status">'+(row.canceled?(row.id.endsWith('00008')?'Cancelled':'Canceled'):'Shipped')+'</td><td class="order-note">'+(row.note==='unknown'?'<textarea aria-label="Unsaved draft">Check Add Tracking</textarea>':row.note==='present'?'0':'<button aria-label="Add note" onclick="window.submitted++">Add note</button>')+'</td></tr>').join('');
    let navigation='<button aria-label="Go to next page" '+(end===records.length?'aria-disabled="true"':'')+' onclick="nextPage()">Next</button>';
    if(scenario==='volume')navigation=Array.from({length:Math.ceil(records.length/per)},(_,i)=>'<button aria-label="Go to page '+(i+1)+'" onclick="page='+(i+1)+';render()">'+(i+1)+'</button>').join('');
    if(scenario==='icon')navigation='<button class="pagination__next" aria-label="More results" '+(end===records.length?'disabled':'')+' onclick="nextPage()">&#8594;</button>';
    if(scenario==='offset')navigation=end<records.length?'<a href="https://www.ebay.com/sh/ord/?filter=status:ALL_ORDERS&scenario=offset&offset='+end+'" onclick="event.preventDefault();nextPage()">&#8594;</a>':'';
    document.querySelector('#native').innerHTML=(scenario==='unknown'?'':'<p>Results: '+(start+1)+'-'+end+' of '+records.length+'</p>')+'<table><thead><tr><th>Order number</th><th>Order date</th><th>Status</th><th>Notes</th></tr></thead><tbody>'+rows+'</tbody></table>'+(scenario==='unknown'||scenario==='lazyfooter'&&!window.footerReady?'':'<nav aria-label="Pagination"><button aria-label="Go to page 1" onclick="page=1;render()">1</button><button aria-label="Previous page" '+(page===1?'disabled':'')+' onclick="page--;render()">Previous</button><span aria-current="page" aria-label="Page '+page+'">'+page+'</span>'+navigation+'</nav>');
    if(scenario==='volume')for(const cell of document.querySelectorAll('tbody td')){for(let depth=0;depth<8;depth++){const wrapper=document.createElement('span');while(cell.firstChild)wrapper.append(cell.firstChild);cell.append(wrapper);}}
  }function nextPage(){document.querySelector('#native').insertAdjacentHTML('afterbegin','<span role="progressbar">Loading</span>');setTimeout(()=>{page++;render()},350)}window.addEventListener('scroll',()=>{if(scenario==='lazyfooter'&&!window.footerReady){window.footerReady=true;render()}});render();</script>${scenario==='slow'?'<img alt="Held fixture resource" src="https://www.ebay.com/fixture-hold.png">':''}</main></body></html>`;
}
function detailHTML(value){
  const id=C.orderUrl(value).id,present=id===number(6);
  return `<header id="gh"><span data-testid="account-username">fixture-seller</span></header><main><h1>Order details</h1><h2>Shipped on Oct 16</h2><h2>Canceled Series Collectible DVD</h2><dl><dt>Order date</dt><dd>${id===number(7)?'Oct 14, 2026':'Oct 16, 2026'}</dd></dl>${present?'<section><span>My note</span><p>Manual order, any note counts</p><button>Edit</button><button>Delete</button></section>':'<button onclick="document.querySelector(\'#menu\').hidden=false">More actions</button><div id="menu" hidden><button role="menuitem" onclick="window.submitted++">Add order note</button><button onclick="window.submitted++">Cancel order</button></div>'}<script>window.submitted=0</script></main>`;
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const probe=await chromium.launch({headless:true});
  try{
    const page=await probe.newPage();
    await page.route('https://www.ebay.com/**',route=>route.fulfill({contentType:'text/html',body:`<h1>Orders</h1><p>Results: 1-1 of 2</p><table><tbody><tr><td><a href="https://www.ebay.com/sh/ord/details?orderid=${number(1)}">${number(1)}</a></td><td class="order-date">2026-10-15</td><td class="order-status">Shipped</td><td class="order-note">No notes</td></tr></tbody></table><button onclick="window.submitted++">2</button><script>window.submitted=0;window.pageClicks=0</script>`}));
    await page.goto(url);
    for(const file of ['orders-left-core.js','orders-left-reader.js'])await page.addScriptTag({path:path.join(extension,file)});
    const blocked=await page.evaluate(()=>{const snapshot=GLDN_ORDERS_LEFT_READER('read');let error='';try{GLDN_ORDERS_LEFT_READER('next')}catch(e){error=e.message}return {hasNext:snapshot.hasNext,error,submitted:window.submitted};});
    assert.equal(blocked.hasNext,false);assert.match(blocked.error,/unavailable/);assert.equal(blocked.submitted,0);
    await page.evaluate(()=>{const arrow=document.createElement('button');arrow.className='pagination__next';arrow.setAttribute('aria-label','More results');arrow.onclick=()=>window.pageClicks++;document.body.append(arrow);});
    assert.equal(await page.evaluate(()=>GLDN_ORDERS_LEFT_READER('read').hasNext),true);
    await page.evaluate(()=>GLDN_ORDERS_LEFT_READER('next'));
    assert.equal(await page.evaluate(()=>window.pageClicks),1);assert.equal(await page.evaluate(()=>window.submitted),0);
    console.log(JSON.stringify({nativeNavigationSafety:true,unrelatedNumericButtonUntouched:true,standaloneIconSupported:true}));
    await page.evaluate(()=>{
      window.connectionRecovered=false;window.scanStarts=0;
      const saved={scope:GLDN_ORDERS_LEFT.scope(location.href),busy:false,complete:true,pages:1,pageLimit:5,scanVersion:GLDN_ORDERS_LEFT.SCAN_VERSION,checkedAt:Date.now(),summary:GLDN_ORDERS_LEFT.summary([]),message:'Complete',hasReader:false};
      window.chrome={runtime:{getURL:()=>'',getManifest:()=>({version:'3.12.63'}),sendMessage:async({op})=>{
        if(op==='eligible')return window.connectionRecovered?{ok:true,result:{eligible:true,reader:false}}:{ok:false,error:'Fixture browser connection unavailable'};
        if(op==='start')window.scanStarts++;
        return {ok:true,result:saved};
      }}};
    });
    await page.addScriptTag({path:path.join(extension,'orders-left.js')});
    await page.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.shadowRoot?.querySelector('.status.error'));
    assert.equal(await page.locator('#gldn-orders-left output').textContent(),'Count unavailable');
    assert.match(await page.locator('#gldn-orders-left .status').textContent(),/Fixture browser connection unavailable/);
    await page.evaluate(()=>window.connectionRecovered=true);
    await page.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true');
    await page.locator('#gldn-orders-left').evaluate(el=>el.remove());
    await page.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true');
    assert.equal(await page.evaluate(()=>window.scanStarts),0,'Connection recovery and remount reconnect to existing results');
    console.log(JSON.stringify({startupErrorVisible:true,connectionRecovery:true,remountReconnects:true,noDuplicateScan:true}));
  }finally{await probe.close();}
  const fixtureScript=ordersHTML(url).match(/<script>([\s\S]*?)<\/script>/)[1];
  fs.writeFileSync(path.join(output,'fixture-page.js'),fixtureScript);new Function(fixtureScript);
  const fixture=fs.mkdtempSync(path.join(output,'runtime-'));fs.mkdirSync(path.join(fixture,'icons'));
  for(const name of ['orders-left-core.js','orders-left-background.js','orders-left-reader.js','orders-left.js','icons/icon48.png'])fs.copyFileSync(path.join(extension,name),path.join(fixture,name));
  // Test-only navigation handoff guarantees routes are attached before loading a
  // chrome.tabs-created target. DNS is also isolated from external services.
  fs.writeFileSync(path.join(fixture,'background.js'),`const create=chrome.tabs.create.bind(chrome.tabs),update=chrome.tabs.update.bind(chrome.tabs),execute=chrome.scripting.executeScript.bind(chrome.scripting);let sequence=0;globalThis.pending=[];globalThis.release={};globalThis.markers={};globalThis.created=[];globalThis.loadingReads=[];globalThis.delayedReads=0;
    chrome.tabs.create=async options=>{const marker='about:blank#fixture-'+(++sequence),tab=await create({...options,url:marker});globalThis.markers[tab.id]=marker;globalThis.created.push({...options,id:tab.id});return tab;};
    chrome.tabs.update=async(id,options)=>{if(!options.url)return update(id,options);const done=new Promise(resolve=>globalThis.release[id]=resolve);globalThis.pending.push({id,url:options.url,marker:globalThis.markers[id]});await done;return chrome.tabs.get(id);};
    chrome.scripting.executeScript=async options=>{const tab=await chrome.tabs.get(options.target.tabId);if(tab.status==='loading')globalThis.loadingReads.push({id:tab.id,url:tab.url,immediate:options.injectImmediately===true});if(tab.url.includes('scenario=delayed')&&globalThis.markers[tab.id]&&options.args?.[0]==='read'&&globalThis.delayedReads++===0)await new Promise(resolve=>setTimeout(resolve,11000));return execute(options);};
    importScripts('orders-left-core.js','orders-left-background.js');`);
  fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'GLDN orders left isolated fixture',version:'3.12.63',permissions:['storage','tabs','scripting'],host_permissions:['https://*.ebay.com/*'],background:{service_worker:'background.js'},content_scripts:[{matches:['https://*.ebay.com/*'],js:['orders-left-core.js','orders-left-reader.js','orders-left.js'],run_at:'document_idle'}],web_accessible_resources:[{resources:['icons/icon48.png'],matches:['https://*.ebay.com/*']}]}));
  const results=[];
  for(const viewport of [{width:1366,height:1000},{width:390,height:844}]){
    const profile=fs.mkdtempSync(path.join(output,'profile-'));
    const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport,args:['--disable-extensions-except='+fixture,'--load-extension='+fixture,'--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost']});
    let running=true,navigating,source;const held=new Set();
    try{
      const route=handler=>{const u=handler.request().url();if(u==='https://www.ebay.com/fixture-hold.png'){held.add(handler);return;}return C.ordersUrl(u)?handler.fulfill({contentType:'text/html',body:ordersHTML(u)}):C.orderUrl(u)?handler.fulfill({contentType:'text/html',body:detailHTML(u)}):handler.abort();};
      await context.route('https://**/*',route);
      let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
      const targets=new Map();
      navigating=(async()=>{while(running){const next=await worker.evaluate(()=>globalThis.pending.shift());if(!next){await new Promise(resolve=>setTimeout(resolve,20));continue;}
        let page=targets.get(next.id);for(let n=0;!page&&n<100;n++){page=context.pages().find(p=>p.url()===next.marker);if(!page)await new Promise(resolve=>setTimeout(resolve,20));}
        assert.ok(page,'Reader target attached');targets.set(next.id,page);await page.route('https://**/*',route);await page.goto(next.url,{waitUntil:'domcontentloaded'});await worker.evaluate(id=>{globalThis.release[id]();delete globalThis.release[id]},next.id);
      }})();navigating.catch(()=>{});
      source=await context.newPage();source.on('pageerror',e=>console.error('PAGE ERROR: '+e.message));await source.goto(url);
      const panel=source.locator('#gldn-orders-left');
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:60000});
      assert.equal(await panel.getAttribute('data-pending'),'5');
      const lines=await panel.locator('.date').allTextContents();assert.ok(lines.includes('Thursday, 10/15 2 orders left'));assert.ok(lines.includes('Wednesday, 10/14 1 order left'));
      assert.match(await panel.locator('.status').textContent(),/9 orders checked across 3 pages.*2 with notes.*2 canceled/);
      assert.equal(await panel.locator('[data-keyword="Add Tracking"]').getAttribute('data-count'),'2');
      assert.equal(await panel.locator('[data-keyword="Check"]').getAttribute('data-count'),'3');
      await panel.locator('[data-keyword="Check"] summary').click();
      assert.equal(await panel.locator('[data-keyword="Check"] a').count(),3);
      assert.ok((await panel.locator('[data-keyword="Check"] a').allTextContents()).some(value=>value.includes(number(2))),'Noted orders participate in the keyword scan');
      assert.equal(await source.evaluate(()=>page),2,'Visible native page remains untouched');assert.equal(await source.evaluate(()=>window.submitted),0);
      assert.equal(await source.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await panel.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
      const info=await worker.evaluate(()=>globalThis.created);assert.equal(info.length,2);assert.ok(info.every(tab=>tab.active===false&&Number.isInteger(tab.openerTabId)&&Number.isInteger(tab.windowId)));
      await source.screenshot({path:path.join(output,viewport.width===390?'mobile.png':'desktop.png'),fullPage:true});
      await source.locator('[data-order="'+number(5)+'"] .order-note').evaluate(el=>el.textContent='Saved after placing');
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.pending==='4',{},{timeout:15000});
      await source.goto(url.replace('offset=4','scenario=large'));
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:45000});
      assert.equal(Number(await panel.getAttribute('data-pending')),C.summary(large).pending);assert.match(await panel.locator('.status').textContent(),/235 orders checked across 3 pages/);
      await source.goto(url.replace('offset=4','scenario=volume'));
      let readerPage;
      for(let attempt=0;attempt<100&&!readerPage;attempt++){
        readerPage=context.pages().find(page=>page!==source&&page.url().includes('scenario=volume')&&!page.isClosed());
        if(!readerPage)await new Promise(resolve=>setTimeout(resolve,30));
      }
      assert.ok(readerPage);await readerPage.bringToFront();
      await readerPage.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.reader==='true',{},{timeout:15000});
      assert.equal(await readerPage.locator('#gldn-orders-left #refresh').isVisible(),false);
      assert.equal(await readerPage.locator('#gldn-orders-left #return').isVisible(),true);
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:60000});
      await readerPage.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:15000});
      assert.equal(await readerPage.locator('#gldn-orders-left').getAttribute('data-pending'),await panel.getAttribute('data-pending'));
      await readerPage.screenshot({path:path.join(output,'reader-mirror-'+viewport.width+'.png'),fullPage:false});
      const beforeReturn=await worker.evaluate(()=>globalThis.created.length);
      await readerPage.locator('#gldn-orders-left #return').click();
      const sourceActive=await worker.evaluate(async()=> (await chrome.tabs.query({active:true})).some(tab=>tab.url.includes('scenario=volume')&&!globalThis.markers[tab.id]));assert.equal(sourceActive,true);
      assert.equal(await worker.evaluate(()=>globalThis.created.length),beforeReturn,'Mirroring/returning never starts another scan');
      assert.equal(Number(await panel.getAttribute('data-pending')),C.summary(volume.slice(0,1000)).pending);assert.match(await panel.locator('.status').textContent(),/First 5 pages read.*1000 orders checked across 5 pages/);
      assert.match(await panel.locator('output').textContent(),/first 5 pages/);
      const expectedKeywords=C.summary(volume.slice(0,1000).map(row=>({...row,keywords:C.keywordMatches(row.sample)}))).keywords;
      for(const result of expectedKeywords)assert.equal(Number(await panel.locator('[data-keyword="'+result.keyword+'"]').getAttribute('data-count')),result.count);
      await source.screenshot({path:path.join(output,'five-pages-'+viewport.width+'.png'),fullPage:true});
      const sourceVolumeId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(tab=>tab.url.includes('scenario=volume')&&!globalThis.markers[tab.id])?.id);
      const benchmark=await worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const start=performance.now(),page=globalThis.GLDN_ORDERS_LEFT_READER('read');return {ms:performance.now()-start,orders:page.rows.length};}}))[0].result,sourceVolumeId);
      assert.equal(benchmark.orders,200);assert.ok(benchmark.ms<5000,'A 200-order DOM snapshot must stay well below the former timeout');
      for(const scenario of ['icon','offset','lazyfooter']){
        await source.goto(url.replace('offset=4','scenario='+scenario));
        await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:45000});
        assert.equal(Number(await panel.getAttribute('data-pending')),C.summary(large).pending);assert.match(await panel.locator('.status').textContent(),/235 orders checked across 3 pages/);
        if(scenario==='lazyfooter'){assert.equal(await source.evaluate(()=>page),2);assert.equal(await source.evaluate(()=>scrollY),0);}
      }
      await source.goto(url.replace('offset=4','scenario=delayed'));
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:45000});
      assert.equal(await panel.getAttribute('data-pending'),'5');assert.ok(await worker.evaluate(()=>globalThis.delayedReads>0));
      await source.goto(url.replace('offset=4','scenario=empty'));
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:30000});assert.equal(await panel.getAttribute('data-pending'),'0');
      const slowUrl=url.replace('offset=4','scenario=slow');
      await source.goto(slowUrl,{waitUntil:'domcontentloaded'});
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left'),{},{timeout:15000});
      const sourceId=await worker.evaluate(async value=>(await chrome.tabs.query({})).find(tab=>tab.url===value&&!globalThis.markers[tab.id])?.id,slowUrl);
      assert.ok(Number.isInteger(sourceId));
      let activeRun;
      for(let n=0;n<100;n++){activeRun=await worker.evaluate(async id=>(await chrome.storage.session.get('gldnOrdersLeft:'+id))['gldnOrdersLeft:'+id],sourceId);if(activeRun?.busy&&activeRun.index)break;await new Promise(resolve=>setTimeout(resolve,30));}
      assert.ok(activeRun?.busy&&activeRun.index,'An owned reader is running before switching tabs');
      await source.locator('#gldn-orders-left').evaluate(el=>el.remove());
      const unrelated=await context.newPage();await unrelated.goto('about:blank#unrelated-work');await unrelated.bringToFront();
      await worker.evaluate(id=>chrome.windows.create({tabId:id,focused:false}),sourceId);
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:45000});
      assert.equal(await panel.getAttribute('data-pending'),'5');assert.match(await panel.locator('.status').textContent(),/9 orders checked across 3 pages/);
      assert.equal(await source.evaluate(()=>document.readyState),'interactive','Held unrelated resource keeps the source loading');
      const loading=await worker.evaluate(()=>globalThis.loadingReads);assert.ok(loading.some(read=>read.url.includes('scenario=slow')&&read.id!==sourceId),'Reader DOM was read before full page load');assert.ok(loading.every(read=>read.immediate));
      const completedRun=await worker.evaluate(async id=>(await chrome.storage.session.get('gldnOrdersLeft:'+id))['gldnOrdersLeft:'+id]?.run,sourceId);
      assert.equal(completedRun,activeRun.run,'Remount reconnects to the existing run without restarting it');
      assert.equal(unrelated.url(),'about:blank#unrelated-work');
      const unrelatedActive=await worker.evaluate(async()=> (await chrome.tabs.query({active:true})).some(tab=>tab.url==='about:blank#unrelated-work'));assert.equal(unrelatedActive,true,'Other work stays selected');
      assert.equal(await source.evaluate(()=>window.submitted),0);
      await source.screenshot({path:path.join(output,'slow-loading-'+viewport.width+'.png'),fullPage:true});
      await unrelated.close();
      await source.goto(url.replace('offset=4','scenario=unknown'));
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.shadowRoot?.querySelector('.status.error'),{},{timeout:30000});assert.equal(await panel.getAttribute('data-complete'),'false');
      const createdAfterError=await worker.evaluate(()=>globalThis.created.length);await new Promise(resolve=>setTimeout(resolve,5500));
      assert.equal(await worker.evaluate(()=>globalThis.created.length),createdAfterError,'A partial read does not flood retries automatically');
      assert.equal(await panel.getAttribute('data-complete'),'false');assert.equal(await panel.locator('#refresh').isEnabled(),true);
      results.push({viewport,pages:3,uniqueOrders:9,pending:5,canceled:2,noted:2,addTracking:2,check:3,notedOrdersIncludedInKeywords:true,hiddenDraftInjectedKeywordsExcluded:true,largeOrderCount:235,largePending:C.summary(large).pending,volumeOrders:1000,volumePages:5,volumePending:C.summary(volume.slice(0,1000)).pending,readerMirrorVisible:true,readerMirrorMatches:true,readerReturnToSource:true,noDuplicateReaderScan:true,startupErrorVisible:true,connectionRecovery:true,numberedPagination:true,iconPagination:true,nativeOffsetPagination:true,lazyFooterRecovered:true,snapshot200OrdersMs:benchmark.ms,elevenSecondResponseRecovered:true,noPartialRetryFlood:true,detailFallback:true,savedNoteUpdates:true,sourcePagePreserved:true,explicitEmpty:true,unknownNavigationPartial:true,slowLoadingDomRead:true,otherTabRemainsSelected:true,sourceWindowMove:true,remountResumesExistingRun:true,submissionCount:0});console.log(JSON.stringify(results.at(-1)));
    }catch(e){if(source){console.error(await source.locator('body').innerText());console.error(await source.locator('#gldn-orders-left .status').textContent().catch(()=>''));await source.screenshot({path:path.join(output,'failure-'+viewport.width+'.png'),fullPage:true});}throw e;}
    finally{running=false;await navigating;for(const route of held)await route.abort().catch(()=>{});await context.close();}
  }
  fs.writeFileSync(path.join(output,'fixture-results.json'),JSON.stringify({scope:'Synthetic orders in isolated Chromium, real extension APIs; no customer accounts',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
