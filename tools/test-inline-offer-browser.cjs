// Actual extension APIs with synthetic pages in isolated temporary Chromium profiles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),ext=path.join(root,'extension'),output=path.join(root,'.test-tmp','inline-offer-v3.12.61');
const offerUrl='https://www.ebay.com/bo/seller/reviewOffer/123456789012?threadId=123';
const offerHTML=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:14px Arial;color:#222;margin:0;background:#fff}main{max-width:1100px;margin:auto;padding:24px}.native-heading{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ddd}h1{font-size:24px}.native-info{padding:18px 0;border-bottom:1px solid #ddd}.native-offer{padding:20px 0}button{padding:10px 14px;margin:4px}a{color:#145da0}@media(max-width:600px){main{padding:12px}}
</style></head><body><main><div class="native-heading"><h1>Offer Received</h1><a href="https://www.ebay.com/help">Help</a></div>
<p>buyer is waiting for your response.</p><div class="native-info"><a href="https://www.ebay.com/itm/123456789012">35 Pcs Wooden Dollhouse Furniture Set</a><p>Buy It Now: $29.59</p><p>Quantity: 1</p></div>
<div id="other-extension">Amazon Product Data: No data fetched yet.</div><section class="native-offer"><h2>Respond to offer</h2><p>Buyer offer: $<span id="nativePrice">20.00</span></p><button id="accept" onclick="window.submitted++">Accept offer</button><button id="counter" onclick="window.submitted++">Make a counteroffer</button><button id="decline" onclick="window.submitted++">Decline offer</button><a href="https://feedback.ebay.com/fdbk/feedback_profile/buyer">buyer (262)</a></section></main><script>window.submitted=0</script></body></html>`;
const listingHTML='<table><thead><tr><th>Item</th><th>Custom label (SKU)</th></tr></thead><tbody><tr><td><a href="https://www.ebay.com/itm/123456789012">35 Pcs Wooden Dollhouse Furniture Set</a></td><td>QjA4OVE1NVNTNw==</td></tr></tbody></table>';
const amazonHTML='<h1 id="productTitle">Exact Amazon dollhouse furniture set</h1><input id="ASIN" value="B089Q55SS7"><div id="desktop_buybox"><div data-a-accordion-row-name="primeSavingsUpsellAccordionRow"><div class="accordion-header" data-csa-c-asin="B089Q55SS7"><h5>Prime Member Price</h5><div id="corePrice_feature_div"><span class="a-price priceToPay"><span class="a-offscreen">$23.99</span></span><span class="a-price pricePerUnit"><span class="a-offscreen">$1.20</span></span><span class="a-price a-text-price"><span class="a-offscreen">$29.99</span></span></div></div><button onclick="window.purchased++">Join Prime</button></div><div data-a-accordion-row-name="newAccordionRow"><div class="accordion-header"><h5>Regular Price</h5><div id="corePrice_feature_div"><span class="a-price priceToPay"><span class="a-offscreen">$29.99</span></span></div></div></div><div id="variation_size_name"><span class="a-price priceToPay"><span class="a-offscreen">$28.99</span></span></div></div><div id="availability">In Stock</div><div id="deliveryBlockMessage">Tomorrow</div><button onclick="window.purchased++">Buy Now</button><script>window.purchased=0</script>';
const feedbackHTML=`<button id="left" aria-label="Feedback left for others tab" selected="false" onclick="this.setAttribute('selected','true');render()">Left for others</button><p id="total"></p><div id="loading"></div><table id="feedback-cards"><tbody></tbody></table><button aria-label="Click to show 200 feedback ratings per page" selected="false" onclick="this.setAttribute('selected','true');limit=200;page=1;render()">200</button><button id="next-page" aria-label="Next page" onclick="page++;document.querySelector('#loading').innerHTML='<span role=img aria-label=Loading>Loading</span>';document.querySelector('#total').textContent='235 Feedback left (viewing 201-235)';setTimeout(()=>{render();document.querySelector('#loading').innerHTML=''},550)">Next</button><script>
let limit=25,page=1;function render(){const start=page===1?1:201,end=page===1?limit:235,count=page===1?(limit===200?189:16):38;
document.querySelector('#total').textContent='235 Feedback left (viewing '+start+'-'+end+')';document.querySelector('#feedback-cards tbody').innerHTML=Array.from({length:count},(_,i)=>{const id=page===1?i+1:190+i,rating=id===202?'negative':[29,119,200,201].includes(id)?'neutral':'positive';return '<tr data-feedback-id="'+id+'"><td><span data-test-type="'+rating+'" aria-label="'+rating+' feedback rating"></span><div class="card__comment">Sample '+rating+' comment</div></td><td class="card__from">Seller: fixture</td><td>Past year</td></tr>'+(i===4?'<tr class="reply"><td colspan="3">Seller reply, not another rating</td></tr>':'')}).join('');document.querySelector('#next-page').setAttribute('aria-disabled',String(page===2));}render();</script>`;

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const fixture=fs.mkdtempSync(path.join(output,'runtime-'));fs.mkdirSync(path.join(fixture,'icons'));
  for(const name of ['offer-review-core.js','offer-review-reader.js','offer-review-background.js','offer-review-inline.js','offer-review-inline.css','offer-review-launcher.js','offer-review.js','offer-review.html','offer-review.css','icons/icon48.png'])fs.copyFileSync(path.join(ext,name),path.join(fixture,name));
  // Attach request routes before navigating extension-created targets. Their initial
  // navigation otherwise races Playwright's new-target routing in Chromium.
  fs.writeFileSync(path.join(fixture,'background.js'),`
    const createTab=chrome.tabs.create.bind(chrome.tabs);
    globalThis.fixtureNavigations=[];globalThis.fixtureResolvers={};let sequence=0;
    chrome.tabs.create=async options=>{
      const marker='about:blank#fixture-worker-'+(++sequence);
      const tab=await createTab({...options,url:marker});
      const finished=new Promise(resolve=>globalThis.fixtureResolvers[tab.id]=resolve);
      globalThis.fixtureNavigations.push({id:tab.id,url:options.url,marker});
      await finished;return chrome.tabs.get(tab.id);
    };
    importScripts("offer-review-core.js","offer-review-background.js");`);
  fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify({manifest_version:3,name:'GLDN inline offer isolated test',version:'3.12.61',permissions:['storage','tabs','scripting'],host_permissions:['https://*.ebay.com/*','https://*.amazon.com/*'],background:{service_worker:'background.js'},content_scripts:[{matches:['https://*.ebay.com/*'],js:['offer-review-core.js','offer-review-inline.js','offer-review-launcher.js'],run_at:'document_idle'}],web_accessible_resources:[{resources:['icons/icon48.png'],matches:['https://*.ebay.com/*']}]}));
  const results=[];
  for(const viewport of [{width:1366,height:1000},{width:390,height:844}]){
    const profile=fs.mkdtempSync(path.join(output,'profile-'));
    const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport,args:['--disable-extensions-except='+fixture,'--load-extension='+fixture,'--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost']});
    let source,worker,navigating=true,navigationTask;
    try{
      const mockRoute=route=>{
        const url=route.request().url(),html=url.includes('/bo/seller/reviewOffer/')?offerHTML:url.includes('/sh/lst/active?keyword=')?listingHTML:url.includes('amazon.com/dp/')?amazonHTML:url.includes('/feedback_profile/buyer')?feedbackHTML:'';
        return html?route.fulfill({contentType:'text/html',body:html}):route.abort();
      };
      await context.route('https://**/*',mockRoute);
      [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
      navigationTask=(async()=>{
        while(navigating){
          const pending=await worker.evaluate(()=>globalThis.fixtureNavigations.shift());
          if(!pending){await new Promise(resolve=>setTimeout(resolve,20));continue;}
          let page;
          for(let attempt=0;attempt<100&&!page;attempt++){
            page=context.pages().find(page=>page.url()===pending.marker);
            if(!page)await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert.ok(page,'An isolated reader target must be attached before navigation');
          await page.route('https://**/*',mockRoute);await page.goto(pending.url);
          await worker.evaluate(id=>{globalThis.fixtureResolvers[id]();delete globalThis.fixtureResolvers[id]},pending.id);
        }
      })();
      // Keep a handler installed immediately; errors are rethrown during cleanup.
      navigationTask.catch(()=>{});
      const unrelated=await context.newPage();await unrelated.goto('https://www.amazon.com/dp/B089Q55SS7');
      source=await context.newPage();await source.goto(offerUrl);
      await source.waitForFunction(()=>document.querySelector('#gldn-offer-inline')?.shadowRoot?.getElementById('feedbackStatus').textContent.startsWith('All pages read'),{},{timeout:45000});
      const panel=source.locator('#gldn-offer-inline');
      assert.match(await panel.locator('#feedbackStatus').textContent(),/227 readable.*235.*2 pages/);
      assert.match(await panel.locator('#positive').textContent(),/^222 \/ 97.8%$/);assert.match(await panel.locator('#neutral').textContent(),/^4 \/ 1.8%$/);assert.match(await panel.locator('#negative').textContent(),/^1 \/ 0.4%$/);
      assert.equal(await panel.locator('#cost').inputValue(),'23.99');
      assert.match(await panel.locator('#amazonStatus').textContent(),/Prime member price.*reader shows Join Prime/);
      assert.match(await panel.locator('#estimateBasis').textContent(),/Prime member price.*Premium Store \(default\)/);
      assert.match(await panel.locator('#assumptions').textContent(),/Confirm the purchasing profile has Prime/);
      await source.waitForFunction(()=>!document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('readBoth').disabled);
      await panel.locator('#cost').fill('21.99');await panel.locator('#sale').fill('32');
      assert.equal(await panel.locator('#plan').inputValue(),'');assert.equal(await panel.locator('#category').inputValue(),'');
      assert.equal(await panel.locator('#offerProfit').textContent(),'-$4.93');assert.equal(await panel.locator('#counterProfit').textContent(),'$5.55');
      assert.equal(await panel.locator('#margin').textContent(),'17.3%');assert.match(await panel.locator('#estimateBasis').textContent(),/Preliminary.*Premium Store \(default\)/);
      await source.screenshot({path:path.join(output,'preliminary-'+viewport.width+'.png'),fullPage:true});
      const original=await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(value=>value.url===url);return {tab,scope:(await chrome.storage.session.get('gldnOfferInlineScope:'+tab.id))['gldnOfferInlineScope:'+tab.id]};},offerUrl);
      await worker.evaluate(async({source,ids})=>{for(const id of ids)await chrome.windows.create({tabId:id,focused:false});await chrome.windows.create({tabId:source,focused:false});},{source:original.tab.id,ids:[original.scope.workers.amazon.id,original.scope.workers.feedback.id]});
      await panel.locator('#readBoth').click();
      await source.waitForFunction(()=>!document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('readBoth').disabled,{},{timeout:45000});
      assert.equal(await panel.locator('#cost').inputValue(),'23.99');assert.doesNotMatch(await panel.locator('#status').textContent(),/ownership changed/);
      assert.match(await panel.locator('#status').textContent(),/Read complete/);
      const reused=await worker.evaluate(async id=>(await chrome.storage.session.get('gldnOfferInlineScope:'+id))['gldnOfferInlineScope:'+id].workers,original.tab.id);
      assert.deepEqual(Object.values(reused).map(value=>value.id).sort(),Object.values(original.scope.workers).map(value=>value.id).sort());
      await panel.locator('#readFeedback').click();
      await source.waitForFunction(()=>document.querySelector('#gldn-offer-inline')?.shadowRoot?.getElementById('feedbackStatus').textContent.startsWith('All pages read'),{},{timeout:45000});
      await source.waitForFunction(()=>!document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('readFeedback').disabled);
      assert.match(await panel.locator('#feedbackStatus').textContent(),/227 readable.*235.*2 pages/);
      await panel.locator('#sale').fill('28');await panel.locator('#plan').selectOption('Premium');await panel.locator('#category').selectOption('general');await panel.locator('#adRate').fill('4');
      await panel.getByText('Fee and cost settings',{exact:true}).click();
      for(const id of ['amazonTax','amazonShipping','buyerShipping','buyerTax'])await panel.locator('#'+id).fill('0');
      await panel.locator('#surcharge').selectOption('0');
      assert.equal(await panel.locator('#counterProfit').textContent(),'-$1.07');
      await panel.getByText('Fee and cost settings',{exact:true}).click();
      const tabs=await worker.evaluate(()=>chrome.tabs.query({})),native=tabs.find(tab=>tab.url===offerUrl);
      const readers=tabs.filter(tab=>Object.values(reused).some(reader=>reader.id===tab.id));
      assert.equal(readers.length,3);assert.ok(readers.some(tab=>tab.windowId!==native.windowId));assert.ok(native.active);
      assert.equal(context.pages().filter(page=>page.url().includes('offer-review.html')).length,0);
      assert.equal(await source.evaluate(()=>window.submitted),0);assert.equal(await unrelated.evaluate(()=>window.purchased),0);
      assert.equal(await source.locator('#other-extension').textContent(),'Amazon Product Data: No data fetched yet.');
      assert.equal(await source.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await panel.locator('header img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
      await source.screenshot({path:path.join(output,viewport.width===390?'mobile.png':'desktop.png'),fullPage:true});
      const saved=await worker.evaluate(async id=>(await chrome.storage.session.get('gldnOfferReview:inline:'+id))['gldnOfferReview:inline:'+id],native.id);
      assert.equal(saved.feedback.pagesComplete,true);assert.equal(saved.feedback.complete,false);assert.equal(saved.feedback.rows.length,227);
      const amazon=context.pages().find(page=>page!==unrelated&&page.url().includes('amazon.com/dp/'));
      await amazon.evaluate(()=>document.querySelector('#ASIN').value='B000000000');
      await panel.getByRole('button',{name:'Read Amazon',exact:true}).click();
      await source.waitForFunction(()=>document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('status').textContent.includes('variation changed'));
      assert.equal(await panel.locator('#cost').inputValue(),'');
      await source.waitForFunction(()=>!document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('readAmazon').disabled);
      await panel.locator('#cost').fill('21.99');await panel.getByRole('button',{name:'Read Amazon',exact:true}).click();
      await source.waitForFunction(()=>!document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('readAmazon').disabled);
      assert.equal(await panel.locator('#cost').inputValue(),'21.99');assert.match(await panel.locator('#amazonStatus').textContent(),/Using your manual price/);
      assert.match(await panel.locator('#estimateBasis').textContent(),/Manual Amazon price/);
      await panel.locator('#match').fill('B000000000');await panel.locator('#cost').fill('1.00');
      await panel.getByRole('button',{name:'Read Amazon',exact:true}).click();
      await source.waitForFunction(()=>!document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('readAmazon').disabled);
      assert.equal(await panel.locator('#cost').inputValue(),'');assert.match(await panel.locator('#amazonStatus').textContent(),/differs from this listing SKU/);
      await source.goto(offerUrl.replace('threadId=123','threadId=124'));
      await source.waitForFunction(()=>document.querySelector('#gldn-offer-inline')?.dataset.offerKey==='123456789012:124'&&document.querySelector('#gldn-offer-inline').shadowRoot.getElementById('feedbackStatus').textContent.startsWith('All pages read'),{},{timeout:45000});
      assert.equal(await source.locator('#gldn-offer-inline').count(),1);
      assert.equal(await source.evaluate(()=>window.submitted),0);
      results.push({viewport,inline:true,readableRatings:227,reportedTotal:235,pages:2,positive:222,neutral:4,negative:1,repeatScan:true,sourceOwnedReaders:true,sourceAndReadersMovedWindows:true,readerIdsReused:true,blankFeeProfit:'$5.55',buyerOfferLoss:'-$4.93',premiumDefault:true,primeOptionSelectedReadOnly:true,joinPrimeWarning:true,preliminaryAssumptionsVisible:true,noReviewTab:true,noMarketplaceSubmission:true,failedRefreshClearsPrice:true,explicitManualPriceSurvivesFailedRefresh:true,primaryPriceIgnoresUnitPrice:true,navigationRebinds:true});
      console.log(JSON.stringify(results[results.length-1]));
    }catch(error){if(source){console.error(await source.locator('body').innerText().catch(()=>''));if(worker)console.error(await worker.evaluate(async url=>{const tabs=await chrome.tabs.query({}),tab=tabs.find(t=>t.url===url);return {tabs:tabs.map(t=>({id:t.id,url:t.url,status:t.status,opener:t.openerTabId,window:t.windowId})),scope:tab?(await chrome.storage.session.get('gldnOfferInlineScope:'+tab.id))['gldnOfferInlineScope:'+tab.id]:null,ui:tab?await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({error:globalThis.GLDN_OFFER_INLINE_LAST_ERROR,core:!!globalThis.GLDN_OFFER,host:!!globalThis.GLDN_OFFER_HOST,reader:!!globalThis.GLDN_OFFER_READER,status:document.getElementById('gldn-offer-inline')?.shadowRoot?.getElementById('status')?.textContent,amazon:document.getElementById('gldn-offer-inline')?.shadowRoot?.getElementById('amazonStatus')?.textContent,feedback:document.getElementById('gldn-offer-inline')?.shadowRoot?.getElementById('feedbackStatus')?.textContent})}):[]};},source.url()).catch(()=>[]));await source.screenshot({path:path.join(output,'failure-'+viewport.width+'.png'),fullPage:true}).catch(()=>{});}throw error;}
    finally{navigating=false;await navigationTask;await context.close();}
  }
  fs.writeFileSync(path.join(output,'fixture-results.json'),JSON.stringify({scope:'Synthetic pages in isolated Chromium; real extension APIs, no customer accounts',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
