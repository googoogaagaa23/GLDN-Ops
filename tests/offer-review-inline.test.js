const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const C = require('../extension/offer-review-core.js');
const read = file => fs.readFileSync(path.join(__dirname,'../extension',file),'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function bridge() {
  const url='https://www.ebay.com/bo/seller/reviewOffer/123456789012?threadId=123';
  const offer={key:C.offer(url).key,itemId:'123456789012',user:'buyer',price:'25.00',quantity:1,title:'Fixture item',feedbackUrl:'https://feedback.ebay.com/fdbk/feedback_profile/buyer'};
  const tabs=new Map([[2,{id:2,url,windowId:17}]]),store={},calls=[];
  let listener,nextId=3;
  const chrome={runtime:{id:'gldn',getURL:file=>'chrome-extension://gldn/'+file,onMessage:{addListener:fn=>listener=fn}},
    storage:{session:{get:async key=>clone({[key]:store[key] ?? null}),set:async value=>Object.assign(store,clone(value))}},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('Closed');return tabs.get(id);},query:async()=>[tabs.get(2)],
      create:async value=>{const tab={id:nextId++,status:'complete',...value};tabs.set(tab.id,tab);calls.push(['create',value]);return tab;},
      update:async(id,value)=>{calls.push(['activate',id,value]);Object.assign(tabs.get(id),value);return tabs.get(id);},sendMessage:async()=>({ok:true})},
    scripting:{executeScript:async value=>{calls.push(['script',value]);return value.files?[]:[{result:{ok:true,data:clone(offer)}}];}}};
  vm.runInNewContext(read('offer-review-background.js'),{chrome,GLDN_OFFER:C,crypto,fetch:async()=>({ok:true,text:async()=>'<main>Owned template</main>'})});
  const sender={id:'gldn',frameId:0,tab:tabs.get(2)};
  const send=(message,identity=sender)=>new Promise(resolve=>listener(message,identity,resolve));
  const mount=()=>send({type:'offerReviewInline',op:'mount'});
  const action=(token,op,args={})=>send({type:'offerReviewInline',token,op,...args});
  return {send,mount,action,sender,offer,tabs,store,calls};
}
test('inline mount binds the exact native offer without creating a review tab',async()=>{
  const h=bridge(),r=await h.mount();assert.equal(r.ok,true);assert.equal(r.result.sourceId,2);assert.equal(r.result.key,h.offer.key);
  assert.equal(h.calls.filter(call=>call[0]==='create').length,0);
});
test('website, iframe and other-extension inline senders cannot obtain a bridge',async()=>{
  const h=bridge();
  for(const sender of [{id:'other',tab:h.sender.tab},{id:'gldn',frameId:1,tab:h.sender.tab},{id:'gldn',url:'https://evil.test/'}]) {
    assert.equal((await h.send({type:'offerReviewInline',op:'mount'},sender)).ok,false);
  }
  assert.equal(h.calls.length,0);
});
test('inline readers are inactive and created in the source window with saved offer ownership',async()=>{
  const h=bridge(),{result}=await h.mount();
  const response=await h.action(result.token,'worker',{kind:'amazon',url:'https://www.amazon.com/dp/B089Q55SS7'});
  assert.equal(response.ok,true);
  const worker=response.result;assert.equal(worker.active,false);assert.equal(worker.openerTabId,2);assert.equal(worker.windowId,17);
  assert.equal((await h.action(result.token,'worker',{kind:'amazon',url:worker.url})).result.id,worker.id);
  assert.equal(h.calls.filter(call=>call[0]==='create').length,1);
});
test('inline URL and action allowlists cannot open unrelated products, accounts or submit controls',async()=>{
  const h=bridge(),{result}=await h.mount();
  for(const args of [{kind:'listing',url:'https://www.ebay.com/sh/lst/active?keyword=999'},
    {kind:'feedback',url:'https://feedback.ebay.com/fdbk/feedback_profile/other'},
    {kind:'amazon',url:'https://amazon.com.evil.test/dp/B089Q55SS7'},
    {kind:'amazon',url:'https://www.amazon.com/checkout/B089Q55SS7'}]) assert.equal((await h.action(result.token,'worker',args)).ok,false);
  const worker=(await h.action(result.token,'worker',{kind:'feedback',url:h.offer.feedbackUrl})).result;
  assert.equal((await h.action(result.token,'read',{tabId:worker.id,action:'acceptOffer',args:{user:'buyer'}})).ok,false);
  assert.equal((await h.action(result.token,'read',{tabId:worker.id,action:'feedback',args:{user:'other'}})).ok,false);
});

test('repeat feedback scans restart only the owned exact buyer reader',async()=>{
  const h=bridge(),{result}=await h.mount();
  const args={kind:'feedback',url:h.offer.feedbackUrl};
  const first=(await h.action(result.token,'worker',args)).result;
  const second=await h.action(result.token,'worker',{...args,reset:true});
  assert.equal(second.ok,true);assert.equal(second.result.id,first.id);
  assert.deepEqual(clone(h.calls.find(call=>call[0]==='activate')[2]),{url:h.offer.feedbackUrl,active:false});
  assert.equal((await h.action(result.token,'worker',{kind:'amazon',url:'https://www.amazon.com/dp/B089Q55SS7',reset:true})).ok,false);
  assert.equal(h.calls.filter(call=>call[0]==='create').length,1);
});
test('wrong tokens, unrelated tabs and expired offer ownership are rejected',async()=>{
  const h=bridge(),{result}=await h.mount();
  assert.equal((await h.action('wrong','state-get')).ok,false);
  assert.equal((await h.action(result.token,'tab-get',{tabId:999})).ok,false);
  const worker=(await h.action(result.token,'worker',{kind:'amazon',url:'https://www.amazon.com/dp/B089Q55SS7'})).result;
  await h.mount();
  assert.equal((await h.action(result.token,'read',{tabId:worker.id,action:'amazon',args:{asin:'B089Q55SS7'}})).ok,false);
});
test('saved Amazon and feedback readers survive window moves and lost or changed opener metadata',async()=>{
  const h=bridge(),{result}=await h.mount();
  for(const [kind,url,action,args] of [
    ['amazon','https://www.amazon.com/dp/B089Q55SS7','amazon',{asin:'B089Q55SS7'}],
    ['feedback',h.offer.feedbackUrl,'feedback',{user:'buyer'}]
  ]){
    const worker=(await h.action(result.token,'worker',{kind,url})).result;
    h.tabs.get(worker.id).windowId=99;delete h.tabs.get(worker.id).openerTabId;
    assert.equal((await h.action(result.token,'tab-get',{tabId:worker.id})).ok,true);
    assert.equal((await h.action(result.token,'read',{tabId:worker.id,action,args})).ok,true);
    h.tabs.get(worker.id).openerTabId=987;
    assert.equal((await h.action(result.token,'read',{tabId:worker.id,action,args})).ok,true);
    assert.equal((await h.action(result.token,'worker',{kind,url})).result.id,worker.id);
  }
  assert.equal(h.calls.filter(call=>call[0]==='create').length,2);
});
test('new readers follow the current source window after it moves',async()=>{
  const h=bridge(),{result}=await h.mount();h.tabs.get(2).windowId=31;
  const worker=(await h.action(result.token,'worker',{kind:'amazon',url:'https://www.amazon.com/dp/B089Q55SS7'})).result;
  assert.equal(worker.windowId,31);assert.equal(worker.openerTabId,2);
});
test('moving tabs never permits cross-profile or unrelated Amazon and feedback reads',async()=>{
  const h=bridge(),{result}=await h.mount();
  const worker=(await h.action(result.token,'worker',{kind:'amazon',url:'https://www.amazon.com/dp/B089Q55SS7'})).result;
  h.tabs.get(worker.id).incognito=true;
  assert.equal((await h.action(result.token,'read',{tabId:worker.id,action:'amazon',args:{asin:'B089Q55SS7'}})).ok,false);
  h.tabs.get(worker.id).incognito=false;h.tabs.get(worker.id).url='https://www.amazon.com/dp/B000000000';
  assert.equal((await h.action(result.token,'read',{tabId:worker.id,action:'amazon',args:{asin:'B089Q55SS7'}})).ok,false);
  const feedback=(await h.action(result.token,'worker',{kind:'feedback',url:h.offer.feedbackUrl})).result;
  h.tabs.get(feedback.id).url='https://feedback.ebay.com/fdbk/feedback_profile/other';
  assert.equal((await h.action(result.token,'read',{tabId:feedback.id,action:'feedback',args:{user:'buyer'}})).ok,false);
  h.tabs.get(2).incognito=true;
  assert.equal((await h.action(result.token,'state-get')).ok,false);
});
test('the inline UI trusts its validated bridge rather than rechecking transient opener links',()=>{
  assert.match(read('offer-review.js'),/\(host \|\| tab\.openerTabId === deskId\)/);
  assert.doesNotMatch(read('offer-review-background.js'),/worker\.openerTabId|worker\.windowId/);
});
test('a changed native buyer or offer stops inline reads before creating a worker',async()=>{
  for(const field of ['user','price','title','quantity']) {
    const h=bridge(),{result}=await h.mount();h.offer[field]=field==='quantity'?2:'changed';
    assert.equal((await h.action(result.token,'worker',{kind:'feedback',url:h.offer.feedbackUrl})).ok,false);
    assert.equal(h.calls.filter(call=>call[0]==='create').length,0);
  }
});
test('refresh can capture changed current values but navigation invalidates the old bridge',async()=>{
  const h=bridge(),{result}=await h.mount();h.offer.price='35.00';
  assert.equal((await h.action(result.token,'read',{tabId:2,action:'offer'})).result.price,'35.00');
  h.tabs.get(2).url=h.tabs.get(2).url.replace('threadId=123','threadId=124');
  assert.equal((await h.action(result.token,'state-get')).ok,false);
});
test('inline saved state is per-source and cannot claim a different offer or buyer',async()=>{
  const h=bridge(),{result}=await h.mount();
  assert.equal((await h.action(result.token,'state-set',{value:{source:{...h.offer,user:'other'}}})).ok,false);
  const value={source:h.offer,inputs:{sale:'28'},workers:{},feedback:{user:'buyer',rows:[],complete:false}};
  assert.equal((await h.action(result.token,'state-set',{value})).ok,true);
  assert.equal((await h.action(result.token,'state-get')).result.inputs.sale,'28');
});
test('Daily Offer Review focuses the native inline section by default',async()=>{
  const h=bridge();const result=await h.send({type:'offerReviewOpen'});assert.equal(result.inline,true);
  assert.equal(h.calls.filter(call=>call[0]==='create').length,0);
  assert.match(read('offer-review-inline.js'),/attachShadow/);
  assert.doesNotMatch(read('offer-review-inline.js'),/iframe|acceptOffer|submit\(/);
  assert.match(read('manifest.json'),/offer-review-inline\.js/);
});
