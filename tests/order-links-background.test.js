const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../extension/order-links-core.js');
function harness(options={}){
  const orderId='10-00000-00001',url='https://www.ebay.com/mesh/ord/details?orderid='+orderId;
  const context={orderId,profileLabel:'TIFF',asins:['B012345678'],sourceUrl:url};
  const calls=[],tabs=new Map([[2,{id:2,url,windowId:17}]]);let listener,next=3,searched=false;
  const record={orderId,amazonOrderId:'112-1234567-1234567',supplier:'Amazon',supplierEmail:'tiff@example.com',recordId:'notification-1-2'};
  const chrome={runtime:{id:'gldn',onMessage:{addListener:fn=>listener=fn}},tabs:{get:async id=>{if(!tabs.has(id))throw Error('Tab closed');return tabs.get(id);},create:async value=>{const tab={id:next++,status:'complete',...value};tabs.set(tab.id,tab);calls.push(['create',value]);return tab;},update:async(id,value)=>{Object.assign(tabs.get(id),value);calls.push(['update',id,value]);return tabs.get(id);},remove:async id=>tabs.delete(id),onRemoved:{addListener:()=>{}}},scripting:{executeScript:async value=>{
    if(value.files){calls.push(['inject',value.target.tabId]);if(options.stall)return new Promise(()=>{});return [];}
    const [op,args]=value.args;calls.push(['read',op,value.target.tabId]);
    let data;
    if(op==='ebay')data=context;
    else if(op==='tracker-read')data={ready:!options.login,login:!!options.login,query:searched?orderId:'',busy:false,rows:options.rows||[record]};
    else if(op==='tracker-search'){searched=true;data={started:true};}
    else data={matches:1};
    return [{result:{ok:true,data}}];
  }}};
  const updaterRequest=async(path,request={})=>{
    calls.push(['helper',path,request.body]);options.onHelper?.(path,tabs);
    if(options.missingHelper)throw Error('Updater endpoint not found.');
    if(path.endsWith('/config'))return {ok:true,mappings:options.mappings||[{label:'TIFF',profileDirectory:'Profile 7',supplierEmail:'tiff@example.com'}]};
    if(path.endsWith('/lookup'))return {ok:true,record:options.saved||null};
    if(path.endsWith('/open'))return {ok:true,requested:true,verifiedSignedIn:false};
    return {ok:true};
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/order-links-background.js'),'utf8'),{chrome,GLDN_ORDER_LINKS:C,updaterRequest,URL,Map,Promise,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms>=10000?500:0)});
  const sender={id:'gldn',frameId:0,tab:{...tabs.get(2)}};
  const send=(op,identity=sender,extra={})=>new Promise(resolve=>listener({type:'orderLinks',op,...extra},identity,resolve));
  const finish=async()=>{for(let n=0;n<200;n++){const response=await send('status');if(response.result&&!response.result.busy)return response.result;await new Promise(resolve=>setTimeout(resolve,1));}throw Error('Lookup did not finish');};
  return {calls,tabs,send,finish,sender,record,context};
}
test('Amazon lookup uses the exact Trackerbot order and the locally mapped profile',async()=>{
  const h=harness();await h.send('amazon');const result=await h.finish();assert.equal(result.error,'');
  const opened=h.calls.find(call=>call[0]==='helper'&&call[1].endsWith('/open'))[2];assert.equal(opened.amazonOrderId,h.record.amazonOrderId);assert.equal(opened.profileLabel,'TIFF');assert.equal(opened.profileDirectory,'Profile 7');
  assert.equal(result.result.verifiedSignedIn,false);assert.equal(h.calls.filter(call=>call[0]==='create').length,1);
});
test('saved exact links avoid another Trackerbot search',async()=>{
  const h=harness({saved:{orderId:'10-00000-00001',amazonOrderId:'112-1234567-1234567',profileLabel:'TIFF',supplierEmail:'tiff@example.com'}});
  await h.send('amazon');await h.finish();assert.equal(h.calls.filter(call=>call[0]==='create').length,0);
});
test('Trackerbot-only lookup works without the helper and never routes or uploads anything',async()=>{
  const h=harness({missingHelper:true});await h.send('tracker');const result=await h.finish();assert.equal(result.record.amazonOrderId,h.record.amazonOrderId);
  assert.match(result.error,/could not be saved/);assert.equal(h.calls.find(call=>call[0]==='create')[1].active,true);
  assert.equal(h.calls.filter(call=>call[0]==='helper'&&call[1].endsWith('/open')).length,0);
});
test('missing helper fails before creating readers or opening Amazon in the wrong profile',async()=>{
  const h=harness({missingHelper:true});await h.send('amazon');const result=await h.finish();assert.match(result.error,/Update the computer helper/);assert.equal(h.calls.filter(call=>call[0]==='create').length,0);
});
test('missing and conflicting local profile mappings cannot open an Amazon order',async()=>{
  for(const mappings of [[],[{label:'TIFF',supplierEmail:'wrong@example.com',profileDirectory:'Profile 7'}]]){
    const h=harness({mappings});await h.send('amazon');const result=await h.finish();assert.ok(result.error);assert.equal(h.calls.filter(call=>call[0]==='helper'&&call[1].endsWith('/open')).length,0);
  }
});
test('multiple supplier matches stop without even opening a purchase-history fallback',async()=>{
  const base={orderId:'10-00000-00001',supplier:'Amazon',supplierEmail:'tiff@example.com'};
  const h=harness({rows:[{...base,amazonOrderId:'112-1234567-1234567'},{...base,amazonOrderId:'112-0000000-0000000'}]});await h.send('amazon');const result=await h.finish();assert.match(result.error,/multiple/);
  assert.equal(h.calls.filter(call=>call[0]==='helper'&&call[1].endsWith('/open')).length,0);
});
test('Trackerbot sign-in failure permits only a clearly labeled exact-ASIN history search',async()=>{
  const h=harness({login:true});await h.send('amazon');const result=await h.finish();assert.match(result.message,/not a verified order match/);
  const opened=h.calls.find(call=>call[0]==='helper'&&call[1].endsWith('/open'))[2];assert.equal(opened.asin,'B012345678');assert.equal(opened.amazonOrderId,undefined);
});
test('websites, iframe calls, another extension and Incognito cannot inspect or trigger lookups',async()=>{
  const h=harness();for(const sender of [{...h.sender,id:'other'},{...h.sender,frameId:1},{...h.sender,tab:undefined}])assert.equal((await h.send('amazon',sender)).ok,false);
  h.tabs.get(2).incognito=true;assert.equal((await h.send('amazon')).ok,false);assert.equal(h.calls.length,0);
});
test('a changed eBay order stops routing after the read',async()=>{
  const h=harness({onHelper:(path,tabs)=>{if(path.endsWith('/lookup'))tabs.get(2).url+='&changed=1';}});await h.send('amazon');await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal((await h.send('status',{...h.sender,tab:h.tabs.get(2)})).result,null);
  assert.equal(h.calls.filter(call=>call[0]==='helper'&&call[1].endsWith('/open')).length,0);
});
test('an unresponsive browser read is reused instead of flooding duplicate injections',async()=>{
  const h=harness({stall:true});assert.equal((await h.send('context')).ok,false);assert.equal((await h.send('context')).ok,false);
  assert.equal(h.calls.filter(call=>call[0]==='inject').length,1);
});
test('the source is rechecked after saving the link and immediately before profile routing',async()=>{
  const h=harness({onHelper:(path,tabs)=>{if(path.endsWith('/remember'))tabs.get(2).url+='&changed=1';}});await h.send('amazon');await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(h.calls.filter(call=>call[0]==='helper'&&call[1].endsWith('/open')).length,0);
});
