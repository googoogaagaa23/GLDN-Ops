const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..'), ext = path.join(root,'extension');
const output = path.join(root,'.test-tmp','offer-review-v3.12.54');
const offerUrl = 'https://www.ebay.com/bo/seller/reviewOffer/123456789012?threadId=123';
const offerHTML = '<h1>Offer Received</h1><p>buyer is waiting for your response.</p><a href="https://www.ebay.com/itm/123456789012">Exact product title</a><a href="https://feedback.ebay.com/fdbk/feedback_profile/buyer">buyer (137)</a><p>Buyer offer: $25.00</p><p>Buy It Now: $29.59</p><p>Quantity: 1</p><button onclick="window.submitted++">Accept offer</button><script>window.submitted=0</script>';
const listingHTML = '<table><thead><tr><th>Item</th><th>Custom label (SKU)</th></tr></thead><tbody><tr><td><a href="https://www.ebay.com/itm/123456789012">Exact product title</a></td><td>QjA4OVE1NVNTNw==</td></tr></tbody></table>';
const amazonHTML = '<h1 id="productTitle">Exact Amazon item</h1><input id="ASIN" value="B089Q55SS7"><div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">$23.99</span></span></div><div id="availability">In Stock</div><div id="deliveryBlockMessage">Tomorrow</div><aside><span class="a-price">$999.99</span></aside><button onclick="window.purchased++">Buy Now</button><script>window.purchased=0</script>';
const feedbackHTML = `<button aria-label="All received Feedback tab" selected="true">All received Feedback</button><button id="left" aria-label="Feedback left for others tab" selected="false" onclick="this.setAttribute('selected','true');render()">Left for others</button><p id="total"></p><table id="feedback-cards"><tbody></tbody></table><button aria-label="Click to show 200 feedback ratings per page" selected="false" onclick="this.setAttribute('selected','true');limit=200;page=1;render()">200</button><button id="next-page" aria-label="Next page" onclick="page++;render()">Next</button><script>
let limit=25,page=1;function render(){let start=(page-1)*limit+1,end=Math.min(205,page*limit);document.querySelector('#total').textContent='205 Feedback left (viewing '+start+'-'+end+')';document.querySelector('#feedback-cards tbody').innerHTML=Array.from({length:end-start+1},(_,j)=>{let i=start+j,rating=i===12||i===202?'negative':i===29?'neutral':'positive';return '<tr data-feedback-id="'+i+'"><td><span data-test-type="'+rating+'" aria-label="'+rating+' feedback rating"></span><div class="card__comment">Same comment '+rating+'</div></td><td class="card__from">Seller: fixture</td><td>Past year</td></tr>'}).join('');document.querySelector('#next-page').disabled=end===205;}render();</script>`;
async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({headless:true});
  try {
    const results=[];
    for (const viewport of [{width:1366,height:1000},{width:390,height:844}]) {
      const context = await browser.newContext({viewport});
      await context.route('https://**/*',route => {
        const u = route.request().url();
        const html = u.startsWith(offerUrl.split('?')[0] + '?threadId=') ? offerHTML : u.includes('/sh/lst/active?keyword=') ? listingHTML : u.includes('amazon.com/dp/') ? amazonHTML : u.includes('/feedback_profile/buyer') ? feedbackHTML : '';
        if (!html) return route.abort();
        return route.fulfill({contentType:'text/html',body:html});
      });
      const source = await context.newPage(); await source.goto(offerUrl);
      const tabs = new Map([[1,source]]), memory={}, created=[];
      let nextId=2;
      const ui = await context.newPage(); const errors=[]; ui.on('pageerror',e=>errors.push(e.message));
      await ui.exposeFunction('fixtureStorage',async(method,key,value)=>{
        if (method==='get') return typeof key==='string'?{[key]:memory[key]}:Object.fromEntries(key.map(k=>[k,memory[k]]));
        Object.assign(memory,value); return {};
      });
      await ui.exposeFunction('fixtureTabs',async(method,args)=>{
        if(method==='current')return{id:100};
        if(method==='get'){const p=tabs.get(args);if(!p)throw Error('Tab closed');return{id:args,url:p.url(),status:'complete',openerTabId:args===1?undefined:100};}
        if(method==='create'){const id=nextId++,p=await context.newPage();tabs.set(id,p);created.push(args.url);await p.goto(args.url);return{id};}
        if(method==='update'){if(args.url)await tabs.get(args.id).goto(args.url);return{id:args.id};}
      });
      await ui.exposeFunction('fixtureScript',async(data)=>{
        const p=tabs.get(data.target.tabId);if(!p)throw Error('Missing tab');
        if(data.files){for(const file of data.files)await p.addScriptTag({path:path.join(ext,file)});return[];}
        const result=await p.evaluate(({fn,args})=>(0,eval)('('+fn+')')(...args),{fn:data.functionText,args:data.args});
        return[{result}];
      });
      await ui.addInitScript(()=>{
        const storage={get:async(keys,callback)=>{const result=keys==='storePlan'?{storePlan:'Premium'}:await window.fixtureStorage('get',keys);callback?.(result);return result;},set:async(value)=>window.fixtureStorage('set',null,value)};
        window.chrome={runtime:{getManifest:()=>({version:'3.12.54'})},storage:{local:storage,session:storage,onChanged:{addListener:()=>{}}},
          tabs:{getCurrent:()=>window.fixtureTabs('current'),get:id=>window.fixtureTabs('get',id),create:args=>window.fixtureTabs('create',args),update:(id,args)=>window.fixtureTabs('update',{id,...args})},
          scripting:{executeScript:data=>window.fixtureScript({...data,functionText:data.func?.toString(),func:undefined})}};
      });
      await ui.goto(pathToFileURL(path.join(ext,'offer-review.html')).href+'?source=1');
      await ui.waitForFunction(()=>document.querySelector('#feedbackStatus')?.textContent.startsWith('Complete'),{timeout:20000});
      assert.match(await ui.locator('#feedbackStatus').textContent(),/205 of 205.*2 pages/);
      assert.match(await ui.locator('#positive').textContent(),/^202 /);
      assert.match(await ui.locator('#negative').textContent(),/^2 /);
      assert.equal(await ui.locator('#comments .comment').count(),3);
      assert.equal(await ui.locator('#cost').inputValue(),'23.99');
      await ui.locator('#readFeedback').click();
      await ui.waitForFunction(()=>document.querySelector('#feedbackStatus')?.textContent.startsWith('Complete'),{timeout:20000});
      await ui.waitForFunction(()=>!document.querySelector('#readFeedback').disabled);
      assert.match(await ui.locator('#feedbackStatus').textContent(),/205 of 205.*2 pages/);
      assert.equal(created.length,3);
      assert.ok(created.some(u=>u.endsWith('/dp/B089Q55SS7')));
      await ui.locator('#sale').fill('28'); await ui.locator('#category').selectOption('general');
      for (const [id,value] of Object.entries({adRate:'4',amazonTax:'0',amazonShipping:'0',buyerShipping:'0',buyerTax:'0'}))await ui.locator('#'+id).fill(value);
      await ui.locator('#surcharge').selectOption('0');
      assert.equal(await ui.locator('#counterProfit').textContent(),'-$1.07');
      assert.equal(await source.evaluate(()=>window.submitted),0);
      const amazon=[...tabs.values()].find(p=>p.url().includes('amazon.com'));assert.equal(await amazon.evaluate(()=>window.purchased),0);
      assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await ui.screenshot({path:path.join(output,viewport.width===390?'mobile.png':'desktop.png'),fullPage:true});
      await source.setContent(offerHTML.replace('https://feedback.ebay.com/fdbk/feedback_profile/buyer','https://www.ebay.com/usr/buyer'));
      const native = await source.evaluate(()=>GLDN_OFFER_READER('offer'));
      assert.equal(native.feedbackUrl,'https://feedback.ebay.com/fdbk/feedback_profile/buyer');
      await amazon.evaluate(()=>{document.querySelector('#ASIN').value='B000000000';});
      await ui.getByRole('button',{name:'Read Amazon',exact:true}).click();
      await ui.waitForFunction(()=>document.querySelector('#status').textContent.includes('variation changed'));
      assert.equal(await ui.locator('#cost').inputValue(),'');
      assert.equal(memory['gldnOfferReview:100'].inputs.cost,'');
      assert.equal(memory['gldnOfferReview:100'].amazon,null);
      assert.equal(created.length,3,'Owned Amazon tab is reused, not an unrelated user tab');
      await source.goto(offerUrl.replace('threadId=123','threadId=124'));
      await ui.getByRole('button',{name:'Return to eBay offer',exact:true}).click();
      assert.match(await ui.locator('#status').textContent(),/originating eBay offer changed/);
      assert.deepEqual(errors,[]);
      await ui.goto(pathToFileURL(path.join(ext,'offer-review.html')).href);
      await ui.waitForFunction(()=>document.querySelector('#status').textContent.includes('Open GLDN Offer Review'));
      assert.equal(created.length,3,'A review without an originating tab cannot start readers');
      results.push({viewport,feedback:205,pages:2,positive:202,neutral:1,negative:2,repeatScan:true,counterProfit:'-$1.07',submissionCount:0,sourceChangeBlocked:true,failedRefreshClearsPrice:true,missingSourceBlocked:true});
      await context.close();
    }
    fs.writeFileSync(path.join(output,'fixture-results.json'),JSON.stringify({scope:'Synthetic fixtures only; no marketplace writes or real account data',results},null,2)+'\n');
    console.log(JSON.stringify(results));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
