const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require(path.join(process.env.GLDN_NODE_MODULES, 'playwright'));
const root = path.resolve(__dirname,'..');
const history = require('../extension/violation-history-core.js');
const output = path.join(root,'dist','violation-history-proof');
fs.mkdirSync(output,{recursive:true});
const reason = 'This listing was removed for violating our Medical devices policy.';
const records = Array.from({length:205},(_,i)=>history.normalizeRecord({account:'fixture-store',itemId:String(300000000000+i),title:'Detailed test product model ABC'+i+' replacement cover <b>not markup</b>',sku:Buffer.from('B'+String(i).padStart(9,'0')).toString('base64'),reason,caseUrl:'https://www.ebay.com/ifh/viewcase?caseId=fixture-'+i,lastSeenAt:'2026-09-13T10:00:00.000Z'}));
const escape = (s) => String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fixture(url,total=205,size=200) {
  const u=new URL(url),offset=Number(u.searchParams.get('offset')||0),end=Math.min(total,offset+size);
  if(u.pathname==='/ifh/viewcase')return '<main><h2>Overview</h2><p>Reference ID</p><p>'+escape(u.searchParams.get('caseId'))+'</p><p>What is the policy?</p><a href="https://www.ebay.com/help/policies/prohibited-restricted-items/medical-devices-policy?id=4322">Medical devices policy</a><p>What activity didn\'t follow the policy</p><div>Prescription devices cannot be listed.</div><p>Decision and action</p><p>Listing removed</p><p>Content Summary</p><p>Item Title</p><p>Detailed case product</p><p>Image</p><button>Start appeal</button><button>End listing</button></main>';
  return '<a href="/usr/fixture-store">fixture-store View profile</a><h2>Manage inactive listings</h2><a href="/sh/lst/ended?status=LISTINGS_ON_HOLD">View Listings</a><h2>Results:'+(offset+1)+'-'+end+' of '+total+'</h2><table role="grid">'+records.slice(offset,end).map((r)=>'<tbody><tr class="grid-row-notice"><td><span class="inline-notice__main"><span>'+reason+'<span class="clipped">'+reason+'</span></span></span></td></tr><tr data-id="'+r.itemId+'" data-site="0"><td class="shui-dt-column__title"><a>'+escape(r.title)+'</a></td><td class="shui-dt-column__listingSKU"><span>'+r.sku+'</span></td><td><a class="default-action" href="'+r.caseUrl+'">Resolve</a></td></tr></tbody>').join('')+'</table>'+(end<total?'<a aria-label="Next page" href="/sh/lst/ended?status=LISTINGS_ON_HOLD&offset='+end+'">Next</a>':'');
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();
    let total=205,size=200;
    await page.route('https://www.ebay.com/**',route=>route.fulfill({contentType:'text/html',body:fixture(route.request().url(),total,size)}));
    await page.goto('https://www.ebay.com/sh/lst/ended?status=LISTINGS_ON_HOLD');
    const read=async(method,arg)=>{await page.addScriptTag({path:path.join(root,'extension/violation-history-reader.js')});return page.evaluate(({method,arg})=>globalThis.GLDN_VIOLATION_READER[method](arg),{method,arg});};
    const first=await read('readPage');
    assert.equal(first.rows.length,200); assert.equal(first.rows[0].reason,reason);
    await page.goto(first.nextUrl);
    const second=await read('readPage');
    assert.equal(second.rows.length,5);assert.equal(second.start,201);
    await page.locator('.grid-row-notice').first().evaluate(n=>n.remove());
    await assert.rejects(read('readPage'),/paired notice/);
    await page.goto(records[0].caseUrl);
    await page.locator('main').evaluate(n=>{const d=document.createElement('div');d.setAttribute('role','main');d.innerHTML=n.innerHTML;n.replaceWith(d);});
    const detail=await read('readCase',records[0].caseUrl);
    assert.equal(detail.activity,'Prescription devices cannot be listed.');
    assert.equal(detail.title,'Detailed case product');
    await assert.rejects(read('readCase',records[1].caseUrl),/does not match/);

    // A complete two-page scanner run uses only these intercepted fixtures.
    total=3;size=2;
    const stored={},shared=[],tabCalls=[];
    const api={console,Date,URL,Promise,Map,JSON,setTimeout:(fn)=>setTimeout(fn,1),crypto:require('node:crypto').webcrypto,GLDN_VIOLATION_HISTORY:history,
      storageGet:async(keys)=>Object.fromEntries(keys.map(k=>[k,structuredClone(stored[k])])),
      storageSet:async(v)=>Object.assign(stored,structuredClone(v)),
      currentPolicyListingIdentity:async()=>({computerLabel:'fixture'}),
      claimWorkflowStart:async()=>({ok:true,token:'fixture-reservation'}),releaseWorkflowStart:async()=>{},
      createChromeTab:async({url})=>{tabCalls.push('create');await page.goto(url);return{id:1};},
      updateChromeTab:async(_id,{url})=>{tabCalls.push(url);await page.goto(url);},
      waitForControlTabSettled:async()=>{},recordWithSyncId:(_a,r)=>({...r,syncId:'fixture-save'}),
      removeQueuedDashboardSync:async()=>{},enqueueDashboardSync:async()=>{throw new Error('Unexpected queue');},
      postToDashboard:async(action,r)=>{
        if(action==='policyIncidentBatch'){shared.push(...r.records);return{ok:true,count:r.records.length,ids:r.records.map(v=>v.id)};}
        return{ok:true,schemaVersion:1,offset:0,total:shared.length,records:shared,nextOffset:null,revision:'fixture'};
      },
      chrome:{tabs:{remove:async()=>{tabCalls.push('close');}},scripting:{executeScript:async({files,func,args})=>{
        if(files){for(const file of files)await page.addScriptTag({path:path.join(root,'extension',file)});return[];}
        const result=await page.evaluate(({code,args})=>new Function('return ('+code+')')()(...args),{code:func.toString(),args});
        return[{result}];
      }}}};
    vm.createContext(api);vm.runInContext(fs.readFileSync(path.join(root,'extension/violation-history-background.js'),'utf8'),api);
    await api.startViolationHistoryScan({},{});
    await vm.runInContext('violationScanPromise',api);
    assert.equal(stored.gldnViolationHistoryScan.phase,'complete');
    assert.equal(shared.length,3); assert.equal(stored.gldnViolationHistoryScan.detailsRead,3);
    assert.equal(tabCalls.at(-1),'close');
    assert.ok(tabCalls.every(url=>url==='create'||url==='close'||/\/sh\/lst\/ended|\/ifh\/viewcase/.test(url)));

    const ui=await browser.newPage();
    await ui.route('http://gldn.test/**',route=>{
      const name=new URL(route.request().url()).pathname.slice(1);
      const file=path.join(root,'extension',name);
      if(!fs.existsSync(file))return route.abort();
      route.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'text/html'});
    });
    await ui.addInitScript(({records})=>{globalThis.chrome={storage:{onChanged:{addListener(){}}},runtime:{sendMessage:async()=>({ok:true,records,state:{phase:'complete',message:'205 incidents shared'},shared:{syncedAt:'2026-09-13T10:00:00.000Z'}})}};},{records});
    await ui.setViewportSize({width:1440,height:1000});await ui.goto('http://gldn.test/violation-history.html');
    await ui.locator('#rows tr').last().waitFor();
    assert.equal(await ui.locator('#rows tr').count(),205);assert.equal(await ui.locator('#rows b').count(),0);
    await ui.screenshot({path:path.join(output,'desktop.png')});
    await ui.setViewportSize({width:390,height:844});await ui.screenshot({path:path.join(output,'mobile.png')});
    assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await ui.locator('#search').fill('ABC204');
    assert.equal(await ui.locator('#rows tr').count(),1);
    const proof={ok:true,readerRows:205,scannerPages:2,scannerCases:3,sharedReadback:3,uiRows:205,mobileWidth:390,marketplaceChanges:0,fixtureOnly:true};
    fs.writeFileSync(path.join(output,'proof.json'),JSON.stringify(proof,null,2));
    console.log(JSON.stringify(proof));
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
