const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('../tests/fixtures/price-shortcut-preview.cjs');
const output=path.resolve(__dirname,'../evidence/price-shortcut-v3.12.50');
async function main() {
  fs.mkdirSync(output,{recursive:true});
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true});
  const results=[];
  try {
    for(const viewport of [{width:1366,height:900},{width:390,height:844}]) {
      const context=await browser.newContext({viewport});const page=await context.newPage();
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/itm/123456789012');
      await page.getByRole('button',{name:'Price +$0.10',exact:true}).click();
      await page.waitForURL('**/lstng?draftId=9876543210&mode=ReviseItem');
      await page.waitForFunction(()=>document.querySelector('[data-price-start]')?.hidden===true);
      assert.equal(await page.getByLabel('Item price',{exact:true}).inputValue(),'27.29');
      for(const [label,value] of [['Quantity','1'],['Ad rate','5'],['Minimum offer','20.00']]) assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),value);
      await page.evaluate(()=>GLDN_EBAY_PRICE_INCREASE.start());
      await page.reload();
      await page.waitForFunction(()=>document.querySelector('[data-price-amount]')?.textContent.includes('27.29'));
      assert.equal(await page.getByLabel('Item price',{exact:true}).inputValue(),'27.19','Reload must not apply a second edit automatically');
      assert.equal(await page.locator('#save-count').textContent(),'0');
      await page.getByRole('button',{name:'Restore prepared price',exact:true}).click();
      assert.equal(await page.getByLabel('Item price',{exact:true}).inputValue(),'27.29');
      await page.getByRole('button',{name:'Close helper',exact:true}).click();
      await page.evaluate(()=>GLDN_EBAY_PRICE_INCREASE.resume());
      assert.equal(await page.locator('#gldn-price-increase').count(),0);
      await page.reload();
      await page.getByRole('button',{name:'Prepare +$0.10',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[data-price-start]')?.hidden===true);
      await page.screenshot({path:path.join(output,viewport.width===390?'mobile.png':'desktop.png')});
      const bounds=await page.locator('#gldn-price-increase').boundingBox();
      assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height);
      assert.equal(await page.locator('#save-count').textContent(),'0');
      assert.deepEqual(errors,[]);
      results.push({viewport,price:'27.29',nativeSaveCount:0,otherFieldsUnchanged:true,repeatAndReloadSafe:true});
      await context.close();
    }
    const page=await browser.newPage();
    await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    for(const mode of ['variation=1','auction=1']) {
      await page.goto(origin+'/lstng?draftId=9876543210&mode=ReviseItem&'+mode);
      await page.getByRole('button',{name:'Prepare +$0.10',exact:true}).click();
      assert.equal(await page.getByLabel('Item price',{exact:true}).inputValue(),'27.19');
      assert.equal(await page.locator('#save-count').textContent(),'0');
      assert.match(await page.locator('[data-price-status]').textContent(),/Variation|Buy It Now/);
    }
    await page.goto(origin+'/lstng?draftId=9876543210&mode=ReviseItem');
    await page.evaluate(()=>sessionStorage.setItem('fixtureLocal',JSON.stringify({gldnStopRequested:true})));
    await page.getByRole('button',{name:'Prepare +$0.10',exact:true}).click();
    assert.equal(await page.getByLabel('Item price',{exact:true}).inputValue(),'27.19');
    assert.match(await page.locator('[data-price-status]').textContent(),/Stop is active/);
    await page.goto(origin+'/popup');
    await page.setViewportSize({width:430,height:780});
    await page.getByPlaceholder('Find a tool').fill('price');
    assert.ok(await page.getByRole('button',{name:'Price +$0.10',exact:true}).isVisible());
    await page.getByPlaceholder('Find a tool').fill('listing policy');
    assert.ok(await page.getByRole('button',{name:'Scan Existing Listings',exact:true}).isVisible());
    await page.getByPlaceholder('Find a tool').fill('no-such-tool');
    assert.match(await page.locator('#workflowEmpty').innerText(),/No matching tools/);
    await page.getByRole('button',{name:'Daily',exact:true}).click();
    assert.equal(await page.getByPlaceholder('Find a tool').inputValue(),'');
    await page.screenshot({path:path.join(output,'popup.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    results.push({variationAndAuctionBlocked:true,stopRespected:true,popupSearchAcrossCategories:true,popupMobileFits:true});
    fs.writeFileSync(path.join(output,'synthetic-results.json'),JSON.stringify({scope:'Synthetic only; no live eBay edit or save',results},null,2)+'\n');
    console.log(JSON.stringify(results));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
