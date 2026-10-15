const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../extension/offer-review-core');
const root = path.resolve(__dirname,'..');
const source = name => fs.readFileSync(path.join(root,'extension',name),'utf8');
const base = {sale:'28',quantity:1,cost:'23.99',plan:'Premium',category:'general',buyerShipping:'0',buyerTax:'0',amazonTax:'0',amazonShipping:'0',other:'0',adRate:'4',surcharge:'0',international:'0'};

test('official general Store estimate includes one per-order fee and advertising',() => {
  const r = C.estimate(base);
  assert.equal(r.variable,356); assert.equal(r.orderFee,40); assert.equal(r.ads,112); assert.equal(r.profit,-107);
  assert.equal(C.estimate({...base,adRate:'0'}).profit,5);
});
test('no Store and Starter use the standard rate, not the Store discount',() => {
  for (const plan of ['None','Starter']) assert.equal(C.estimate({...base,plan}).variable,381);
  assert.throws(() => C.estimate({...base,plan:''}));
});
test('tax is excluded from revenue but included in eBay and ad fee bases',() => {
  const r = C.estimate({...base,buyerTax:'6.25',buyerShipping:'2',amazonTax:'1.50',amazonShipping:'3'});
  assert.equal(r.revenue,3000); assert.equal(r.buyerTax,188); assert.equal(r.base,3188);
  assert.equal(r.variable,405); assert.equal(r.ads,128); assert.equal(r.supplier,2849);
  assert.equal(r.profit,-422);
});
test('unknown costs remain disclosed instead of pretending to be a known landed cost',() => {
  const r = C.estimate({...base,amazonTax:'',amazonShipping:'',buyerTax:'',adRate:''});
  assert.ok(r.warnings.some(w => w.includes('Amazon tax excluded')));
  assert.ok(r.warnings.some(w => w.includes('Advertising rate assumed')));
});
test('per-order fee boundary uses the total paid, including buyer tax',() => {
  assert.equal(C.estimate({...base,sale:'10',buyerTax:'0'}).orderFee,30);
  assert.equal(C.estimate({...base,sale:'10',buyerTax:'1'}).orderFee,40);
});
test('quantity multiplies item cost and per-item tier thresholds but not per-order costs',() => {
  const r = C.estimate({...base,sale:'5000',quantity:2,cost:'10',plan:'None',adRate:'0'});
  assert.equal(r.variable,136000); assert.equal(r.orderFee,40); assert.equal(r.supplier,2000);
  const one = C.estimate({...base,sale:'3000',adRate:'0'});
  assert.equal(one.variable,32925);
});
test('Top Rated Plus discounts only base variable fees, never surcharges or fixed fee',() => {
  const r = C.estimate({...base,topRatedPlus:true,surcharge:'6'});
  assert.equal(r.discount,36); assert.equal(r.orderFee,40); assert.equal(r.surcharge,168);
  assert.equal(r.fee,528);
});
test('category-specific thresholds and custom per-order fee are explicit',() => {
  assert.equal(C.estimate({...base,category:'media'}).variable,428);
  assert.equal(C.estimate({...base,category:'jewelry',sale:'6000'}).variable,42000);
  assert.equal(C.estimate({...base,category:'watches',sale:'6000'}).variable,31500);
  assert.equal(C.estimate({...base,category:'custom',customRate:'8',customOrderFee:'0'}).orderFee,0);
  assert.throws(() => C.estimate({...base,category:'custom',customRate:''}));
  assert.throws(() => C.estimate({...base,category:''}));
});
test('bad currency, percentages, and quantities cannot generate profitable-looking results',() => {
  for (const sale of ['','-1','Infinity','1e4','28.001','1,23.99']) assert.throws(() => C.estimate({...base,sale}));
  for (const quantity of [0,1.5,1000]) assert.throws(() => C.estimate({...base,quantity}));
  for (const adRate of ['-1','101','NaN']) assert.throws(() => C.estimate({...base,adRate}));
});
test('exact product and offer URLs reject lookalike hosts and credentials',() => {
  assert.equal(C.asin('QjA4OVE1NVNTNw=='),'B089Q55SS7');
  assert.equal(C.asin('https://www.amazon.com/dp/B089Q55SS7'),'B089Q55SS7');
  assert.equal(C.asin('https://amazon.com.evil.test/dp/B089Q55SS7'),'');
  assert.equal(C.asin('https://user:pw@amazon.com/dp/B089Q55SS7'),'');
  const offer = 'https://www.ebay.com/bo/seller/reviewOffer/123456789012?threadId=123';
  assert.equal(C.offer(offer).key,'123456789012:123');
  assert.equal(C.offer(offer.replace('ebay.com','ebay.com.evil.test')),null);
  assert.equal(C.offer(offer.replace('?threadId=123','')),null);
});
const row = (id,rating = 'positive') => ({id,rating,comment:'Identical comment',seller:'Seller',when:'Past year'});
const initial = () => ({user:'buyer',total:null,pages:0,rows:[],complete:false});
test('all feedback pages reconcile IDs, totals and percentages, preserving identical comments',() => {
  let s = C.addFeedback(initial(),{user:'buyer',left:true,total:3,start:1,end:2,rows:[row('1'),row('2','negative')],next:true});
  assert.equal(s.complete,false);
  s = C.addFeedback(s,{user:'buyer',left:true,total:3,start:3,end:3,rows:[row('3','neutral')],next:false});
  assert.equal(s.complete,true);
  const r = C.feedbackSummary(s); assert.equal(r.total,3); assert.equal(r.negative,1); assert.ok(Math.abs(r.percentages.negative - 100/3) < .001);
});
test('wrong buyer, wrong tab, skipped pages, repeated IDs, and unknown ratings stop completion',() => {
  const page = {user:'buyer',left:true,total:2,start:1,end:2,rows:[row('1'),row('2')],next:false};
  for (const changes of [{user:'other'},{left:false},{start:2},{rows:[row('1'),row('1')]},{rows:[row(''),row('2')]},{rows:[row('1','unknown'),row('2')]},{rows:[row('1')]}]) {
    assert.throws(() => C.addFeedback(initial(),{...page,...changes}));
  }
  let s = C.addFeedback(initial(),{...page,end:1,rows:[row('1')],next:true});
  assert.throws(() => C.addFeedback(s,{...page,start:2,end:2,rows:[row('1')]}));
  assert.throws(() => C.addFeedback(s,{...page,total:3,start:2,end:2,rows:[row('2')]}));
});
test('zero feedback has no fabricated percentage and is complete only with native zero total',() => {
  const s = C.addFeedback(initial(),{user:'buyer',left:true,total:0,start:0,end:0,rows:[],next:false});
  assert.equal(s.complete,true); assert.equal(C.feedbackSummary(s).percentages.negative,null);
});
test('settled native ranges can differ from readable row counts without stopping pagination',() => {
  const first=Array.from({length:189},(_,i)=>row(String(i+1)));
  const last=Array.from({length:38},(_,i)=>row(String(i+190),i===12?'negative':'positive'));
  let s=C.addFeedback(initial(),{user:'buyer',left:true,total:235,start:1,end:200,rows:first,next:true,settled:true});
  assert.equal(s.through,200);assert.equal(s.pagesComplete,false);
  s=C.addFeedback(s,{user:'buyer',left:true,total:235,start:201,end:235,rows:last,next:false,settled:true});
  assert.equal(s.pagesComplete,true);assert.equal(s.complete,false);
  const summary=C.feedbackSummary(s);assert.equal(summary.total,227);assert.equal(summary.difference,8);
  assert.equal(summary.negative,1);assert.ok(Math.abs(summary.percentages.negative-100/227)<.001);
});
test('a short unsettled page and invalid ranges remain errors, not fabricated missing ratings',()=>{
  const page={user:'buyer',left:true,total:2,start:1,end:2,rows:[row('1')],next:false};
  assert.throws(()=>C.addFeedback(initial(),page),/could not be read/);
  assert.throws(()=>C.addFeedback(initial(),{...page,end:3,settled:true}),/range/);
  assert.throws(()=>C.addFeedback(initial(),{...page,rows:[],settled:true}),/No readable/);
});
test('launcher requires the exact native offer tab and rejects website/iframe/other-extension senders',async () => {
  let listener,opened=[];
  const offer = 'https://www.ebay.com/bo/seller/reviewOffer/123456789012?threadId=123';
  const chrome = {runtime:{id:'gldn',getURL:p=>'chrome-extension://gldn/'+p,onMessage:{addListener:f=>{listener=f;}}},
    tabs:{query:async args=>args.url ? [] : [{id:2,url:offer}],create:async data=>{opened.push(data);return {id:3};}}};
  vm.runInNewContext(source('offer-review-background.js'),{chrome,GLDN_OFFER:C,Number});
  const send = sender => new Promise(r=>listener({type:'offerReviewOpen',mode:'window'},sender,r));
  for (const sender of [{id:'other',tab:{id:2,url:offer}},{id:'gldn',frameId:1,tab:{id:2,url:offer}},{id:'gldn',url:'https://evil.test/'}]) assert.equal((await send(sender)).ok,false);
  assert.equal(opened.length,0);
  assert.equal((await send({id:'gldn',frameId:0,tab:{id:2,url:offer}})).ok,true);
  assert.equal(opened[0].url,'chrome-extension://gldn/offer-review.html?source=2');
});
test('offer readers only select feedback views and never submit offers or purchase controls',() => {
  const reader = source('offer-review-reader.js'), controller = source('offer-review.js');
  assert.equal((reader.match(/\.click\(\)/g)||[]).length,3);
  assert.doesNotMatch(reader,/submit\(|placeOrder|acceptOffer|sendOffer|fetch\(/);
  assert.doesNotMatch(controller,/\.click\(|submit\(|acceptOffer|sendOffer|fetch\(/);
  assert.match(controller,/if \(busy\) return/);
  assert.match(controller,/verifySource\(\)/);
  assert.match(controller,/state\.feedback\.pages >= 500/);
  assert.match(source('background.js'),/offer-review-background\.js/);
  assert.match(source('manifest.json'),/offer-review-launcher\.js/);
});
