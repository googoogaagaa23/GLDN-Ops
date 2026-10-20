const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension'),output=path.join(root,'.test-tmp','orders-left-v3.12.59');
const C=require('../extension/orders-left-core.js');
const number=n=>'01-00001-'+String(n).padStart(5,'0');
const url='https://www.ebay.com/sh/ord/?filter=status:ALL_ORDERS&offset=4';
const records=[1,2,3,4,5,6,7,8,9].map(n=>({id:number(n),date:n===7?'':'2026-10-'+(n===4||n===9?'16':'15'),note:n===2?'present':[6,7,9].includes(n)?'unknown':'none',canceled:[3,8].includes(n)}));
const large=Array.from({length:235},(_,n)=>({id:number(n+1),date:'2026-10-'+(n%2?'16':'15'),note:(n+1)%5?'none':'present',canceled:(n+1)%11===0}));
const volume=Array.from({length:1501},(_,n)=>({...large[n%large.length],id:number(n+1)}));
function ordersHTML(value){
  const scenario=new URL(value).searchParams.get('scenario')||'normal',data=scenario==='volume'?volume:scenario==='large'?large:records,initial=scenario==='normal'?2:1;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial;margin:0;color:#222}main{max-width:1100px;padding:22px;margin:auto}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}a{color:#165d9d}nav{padding:16px}button{padding:8px}#native{overflow:auto}@media(max-width:600px){main{padding:12px}td,th{padding:8px}}</style></head><body><header id="gh"><span data-testid="account-username">fixture-seller</span></header><main><div class="heading"><h1>All orders</h1></div><div id="native"></div><script>
  const records=${JSON.stringify(data)},scenario=${JSON.stringify(scenario)};let page=${initial};window.submitted=0;
  function render(){
    if(scenario==='empty'){document.querySelector('#native').innerHTML='<p>No orders found</p>';return;}
    const per=scenario==='volume'?200:scenario==='large'?100:4,start=(page-1)*per,end=Math.min(start+per,records.length),slice=records.slice(start,end);
    const rows=slice.map(row=>'<tr data-order="'+row.id+'"><td><a href="https://www.ebay.com/sh/ord/details?orderid='+row.id+'">'+row.id+'</a>'+(row.id.endsWith('00005')?'<br><a href="https://www.ebay.com/sh/ord/details?orderid='+row.id+'">Second item in same order</a>':'')+'</td><td>'+(scenario==='normal'&&row.id.endsWith('00001')?'<time datetime="2026-10-16T01:00:00Z">Oct 15, 2026</time>':row.date)+'</td><td class="order-status">'+(row.canceled?(row.id.endsWith('00008')?'Cancelled':'Canceled'):'Shipped')+'</td><td class="order-note">'+(row.note==='unknown'?'<textarea aria-label="Unsaved draft"></textarea>':row.note==='present'?'0':'<button aria-label="Add note" onclick="window.submitted++">Add note</button>')+'</td></tr>').join('');
    document.querySelector('#native').innerHTML=(scenario==='unknown'?'':'<p>Results: '+(start+1)+'-'+end+' of '+records.length+'</p>')+'<table><thead><tr><th>Order number</th><th>Order date</th><th>Status</th><th>Notes</th></tr></thead><tbody>'+rows+'</tbody></table>'+(scenario==='unknown'?'':'<nav aria-label="Pagination"><button aria-label="Go to page 1" onclick="page=1;render()">1</button><button aria-label="Previous page" '+(page===1?'disabled':'')+' onclick="page--;render()">Previous</button><span aria-current="page">'+page+'</span><button aria-label="Go to next page" '+(end===records.length?'aria-disabled="true"':'')+' onclick="nextPage()">Next</button></nav>');
    if(scenario==='volume')for(const cell of document.querySelectorAll('tbody td')){for(let depth=0;depth<8;depth++){const wrapper=document.createElement('span');while(cell.firstChild)wrapper.append(cell.firstChild);cell.append(wrapper);}}
  }function nextPage(){document.querySelector('#native').insertAdjacentHTML('afterbegin','<span role="progressbar">Loading</span>');setTimeout(()=>{page++;render()},350)}render();</script>${scenario==='slow'?'<img alt="Held fixture resource" src="https://www.ebay.com/fixture-hold.png">':''}</main></body></html>`;
}
function detailHTML(value){
  const id=C.orderUrl(value).id,present=id===number(6);
  return `<header id="gh"><span data-testid="account-username">fixture-seller</span></header><main><h1>Order details</h1><h2>Shipped on Oct 16</h2><h2>Canceled Series Collectible DVD</h2><dl><dt>Order date</dt><dd>${id===number(7)?'Oct 14, 2026':'Oct 16, 2026'}</dd></dl>${present?'<section><span>My note</span><p>Manual order, any note counts</p><button>Edit</button><button>Delete</button></section>':'<button onclick="document.querySelector(\'#menu\').hidden=false">More actions</button><div id="menu" hidden><button role="menuitem" onclick="window.submitted++">Add order note</button><button onclick="window.submitted++">Cancel order</button></div>'}<script>window.submitted=0</script></main>`;
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
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
  fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'GLDN orders left isolated fixture',version:'3.12.59',permissions:['storage','tabs','scripting'],host_permissions:['https://*.ebay.com/*'],background:{service_worker:'background.js'},content_scripts:[{matches:['https://*.ebay.com/*'],js:['orders-left-core.js','orders-left-reader.js','orders-left.js'],run_at:'document_idle'}],web_accessible_resources:[{resources:['icons/icon48.png'],matches:['https://*.ebay.com/*']}]}));
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
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.dataset.complete==='true',{},{timeout:60000});
      assert.equal(Number(await panel.getAttribute('data-pending')),C.summary(volume).pending);assert.match(await panel.locator('.status').textContent(),/1501 orders checked across 8 pages/);
      const sourceVolumeId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(tab=>tab.url.includes('scenario=volume')&&!globalThis.markers[tab.id])?.id);
      const benchmark=await worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const start=performance.now(),page=globalThis.GLDN_ORDERS_LEFT_READER('read');return {ms:performance.now()-start,orders:page.rows.length};}}))[0].result,sourceVolumeId);
      assert.equal(benchmark.orders,200);assert.ok(benchmark.ms<5000,'A 200-order DOM snapshot must stay well below the former timeout');
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
      await source.waitForFunction(()=>document.querySelector('#gldn-orders-left')?.shadowRoot?.querySelector('.status.error')?.textContent.includes('page one'),{},{timeout:30000});assert.equal(await panel.getAttribute('data-complete'),'false');
      const createdAfterError=await worker.evaluate(()=>globalThis.created.length);await new Promise(resolve=>setTimeout(resolve,5500));
      assert.equal(await worker.evaluate(()=>globalThis.created.length),createdAfterError,'A partial read does not flood retries automatically');
      assert.equal(await panel.getAttribute('data-complete'),'false');assert.equal(await panel.locator('#refresh').isEnabled(),true);
      results.push({viewport,pages:3,uniqueOrders:9,pending:5,canceled:2,noted:2,largeOrderCount:235,largePending:C.summary(large).pending,volumeOrders:1501,volumePages:8,volumePending:C.summary(volume).pending,snapshot200OrdersMs:benchmark.ms,elevenSecondResponseRecovered:true,noPartialRetryFlood:true,detailFallback:true,savedNoteUpdates:true,sourcePagePreserved:true,explicitEmpty:true,unknownNavigationPartial:true,slowLoadingDomRead:true,otherTabRemainsSelected:true,sourceWindowMove:true,remountResumesExistingRun:true,submissionCount:0});console.log(JSON.stringify(results.at(-1)));
    }catch(e){if(source){console.error(await source.locator('body').innerText());console.error(await source.locator('#gldn-orders-left .status').textContent().catch(()=>''));await source.screenshot({path:path.join(output,'failure-'+viewport.width+'.png'),fullPage:true});}throw e;}
    finally{running=false;await navigating;for(const route of held)await route.abort().catch(()=>{});await context.close();}
  }
  fs.writeFileSync(path.join(output,'fixture-results.json'),JSON.stringify({scope:'Synthetic orders in isolated Chromium, real extension APIs; no customer accounts',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
