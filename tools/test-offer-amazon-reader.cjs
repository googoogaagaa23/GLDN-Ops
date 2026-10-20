const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.test-tmp','offer-amazon-v3.12.60');
const asin='B0BYNJW532',price=(value,classes='')=>`<span class="a-price ${classes}"><span class="a-offscreen">$${value}</span></span>`;
const cases=[
  {name:'primary price with unit and crossed-out list price',html:`<div id="corePriceDisplay_desktop_feature_div">${price('21.99','priceToPay')}${price('1.83','pricePerUnit')}${price('29.99','a-text-price')}</div>`,expected:'21.99'},
  {name:'new apex buy box without legacy core containers',html:`<div id="apex_desktop">${price('21.99','apexPriceToPay')}</div>`,expected:'21.99'},
  {name:'buy-box accessibility price label',html:'<div id="desktop_buybox"><span id="apex-pricetopay-accessibility-label">$21.99</span></div>',expected:'21.99'},
  {name:'primary whole and fraction without offscreen text',html:'<div id="apex_desktop"><span class="a-price priceToPay"><span class="a-price-symbol">$</span><span class="a-price-whole">21.</span><span class="a-price-fraction">99</span></span></div>',expected:'21.99'},
  {name:'foreign currency whole and fraction are not USD',html:'<div id="apex_desktop"><span class="a-price priceToPay"><span class="a-price-symbol">CA$</span><span class="a-price-whole">21.</span><span class="a-price-fraction">99</span></span></div>',error:/could not be read/},
  {name:'legacy buy-box price',html:'<span id="price_inside_buybox">$21.99</span>',expected:'21.99'},
  {name:'identical duplicated primary prices',html:`<div id="apex_desktop">${price('21.99','priceToPay')}${price('21.99','apexPriceToPay')}</div>`,expected:'21.99'},
  {name:'conflicting primary prices',html:`<div id="apex_desktop">${price('21.99','priceToPay')}${price('24.99','apexPriceToPay')}</div>`,error:/ambiguous/},
  {name:'hidden primary price cannot override the visible price',html:`<div id="apex_desktop"><div hidden>${price('5.99','priceToPay')}</div>${price('21.99','priceToPay')}</div>`,expected:'21.99'},
  {name:'subscription price excluded from primary price',html:`<div id="apex_desktop"><div id="snsAccordionRowMiddle">${price('17.99','priceToPay')}</div>${price('21.99','priceToPay')}</div>`,expected:'21.99'},
  {name:'selected subscription still stops the read',html:`<div id="snsAccordionRowMiddle"><input type="radio" checked></div><div id="apex_desktop">${price('21.99','priceToPay')}</div>`,error:/Subscribe & Save/},
  {name:'recommendations alone are not a purchase price',html:`<aside class="a-carousel">${price('21.99','priceToPay')}</aside>`,error:/could not be read/},
  {name:'unit and list prices alone are not a purchase price',html:`<div id="apex_desktop">${price('1.83','pricePerUnit')}${price('29.99','a-text-price')}</div>`,error:/could not be read/},
  {name:'used buy-box price is not a new purchase price',html:`<div id="desktop_buybox"><div id="usedBuyBox">${price('17.99','priceToPay')}</div></div>`,error:/could not be read/},
  {name:'changed variation stops the read',html:`<div id="apex_desktop">${price('21.99','priceToPay')}</div>`,selected:'B000000000',error:/variation changed/}
];
(async()=>{
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];
  try{
    const context=await browser.newContext();let current;
    await context.route('https://**/*',route=>route.fulfill({contentType:'text/html',body:`<h1 id="productTitle">Fixture clock</h1><input id="ASIN" value="${current.selected||asin}">${current.html}<button onclick="window.purchased++">Buy Now</button><script>window.purchased=0</script>`}));
    const page=await context.newPage();
    for(const fixture of cases){
      current=fixture;await page.goto('https://www.amazon.com/dp/'+asin);
      for(const name of ['offer-review-core.js','offer-review-reader.js'])await page.addScriptTag({path:path.join(root,'extension',name)});
      const result=await page.evaluate(asin=>{try{return {value:GLDN_OFFER_READER('amazon',{asin})};}catch(error){return {error:error.message};}},asin);
      if(fixture.error)assert.match(result.error||'',fixture.error,fixture.name);else assert.equal(result.value?.price,fixture.expected,fixture.name);
      assert.equal(await page.evaluate(()=>window.purchased),0);results.push({name:fixture.name,...result});
    }
    await context.close();
  }finally{await browser.close();}
  fs.writeFileSync(path.join(output,'fixture-results.json'),JSON.stringify({scope:'Synthetic real DOM; no customer data or purchases',results},null,2));
  console.log(JSON.stringify({cases:results.length,passed:true,submissionCount:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
