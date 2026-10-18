const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../extension/orders-left-core.js');
function harness(){
  const url='https://www.ebay.com/sh/ord/?filter=status:ALL_ORDERS',store={},calls=[],tabs=new Map([[2,{id:2,url,status:'complete',windowId:17}]]);
  let listener,next=3;
  const snapshot={account:'seller',rows:[{id:'01-00001-00001',url:'https://www.ebay.com/sh/ord/details?orderid=01-00001-00001',date:'2026-10-15',note:'none',canceled:false}],range:{start:1,end:1,total:1},first:true,terminal:true,hasNext:false};
  const chrome={runtime:{id:'gldn',onMessage:{addListener:fn=>listener=fn}},storage:{session:{
    get:async key=>({[key]:structuredClone(store[key])}),set:async value=>Object.assign(store,structuredClone(value)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete store[key];}}},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('Tab closed');return tabs.get(id);},
      create:async options=>{const tab={id:next++,status:'complete',...options};tabs.set(tab.id,tab);calls.push(['create',structuredClone(options)]);return tab;},
      update:async(id,options)=>{Object.assign(tabs.get(id),options);calls.push(['update',id,structuredClone(options)]);return tabs.get(id);},
      remove:async id=>{tabs.delete(id);calls.push(['remove',id]);},onRemoved:{addListener:()=>{}}},
    scripting:{executeScript:async request=>request.files?[]:[{result:{ok:true,data:structuredClone(snapshot)}}]}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/orders-left-background.js'),'utf8'),{chrome,GLDN_ORDERS_LEFT:C,crypto,structuredClone,Date,Map,Number,Promise,setTimeout:fn=>setTimeout(fn,0)});
  const sender={id:'gldn',frameId:0,tab:tabs.get(2)};
  const send=(op,identity=sender,extra={})=>new Promise(resolve=>listener({type:'ordersLeft',op,...extra},identity,resolve));
  const finish=async()=>{for(let n=0;n<100;n++){const result=await send('status');if(result.result&&!result.result.busy)return result.result;await new Promise(resolve=>setTimeout(resolve,3));}throw Error('Fixture did not finish');};
  return {store,calls,tabs,send,sender,snapshot,finish};
}
test('the counter uses one inactive reader owned by the source tab and window, then closes it',async()=>{
  const h=harness();assert.equal((await h.send('start')).ok,true);const result=await h.finish();
  assert.equal(result.complete,true);assert.equal(result.summary.pending,1);
  const created=h.calls.find(call=>call[0]==='create')[1];assert.deepEqual(created,{url:'about:blank',active:false,windowId:17,openerTabId:2});
  assert.equal(h.calls.filter(call=>call[0]==='remove').length,1);assert.equal(h.tabs.size,1);
});
test('website, iframe and another extension cannot start or inspect a count',async()=>{
  const h=harness();
  for(const sender of [{id:'other',frameId:0,tab:h.sender.tab},{id:'gldn',frameId:1,tab:h.sender.tab},{id:'gldn',url:'https://www.ebay.com/sh/ord/'}]){
    assert.equal((await h.send('start',sender)).ok,false);assert.equal((await h.send('status',sender)).ok,false);
  }
  assert.equal(h.calls.length,0);
});
test('reader tabs cannot recursively launch their own counts',async()=>{
  const h=harness();h.store['gldnOrdersLeftWorker:2']={owner:1};
  assert.equal((await h.send('eligible')).result.eligible,false);assert.equal((await h.send('start')).ok,false);assert.equal(h.calls.length,0);
});
test('caller-supplied URLs cannot redirect the order reader',async()=>{
  const h=harness();await h.send('start',h.sender,{url:'https://evil.test/'});await h.finish();
  assert.equal(h.calls.find(call=>call[0]==='update')[2].url,h.sender.tab.url);
});
test('visible saved notes and cancellations update the total without another full scan',async()=>{
  const h=harness();await h.send('start');await h.finish();
  h.snapshot.rows[0].note='present';let result=await h.send('visible');assert.equal(result.result.summary.pending,0);assert.equal(result.result.summary.noted,1);
  h.snapshot.rows[0].note='none';h.snapshot.rows[0].canceled=true;result=await h.send('visible');assert.equal(result.result.summary.pending,0);assert.equal(result.result.summary.canceled,1);
  assert.equal(h.calls.filter(call=>call[0]==='create').length,1);
});
test('changed accounts and filters cannot reuse a previous completed count',async()=>{
  const h=harness();await h.send('start');await h.finish();
  h.snapshot.account='other';assert.equal((await h.send('visible')).ok,false);
  const sender={...h.sender,tab:{...h.sender.tab,url:h.sender.tab.url+'&period=30_DAYS'}};
  assert.equal((await h.send('status',sender)).ok,false);
});
test('a background restart downgrades an unfinished stored read instead of reporting Complete',async()=>{
  const h=harness();h.store['gldnOrdersLeft:2']={owner:2,scope:C.scope(h.sender.tab.url),busy:true,complete:false,rows:{},pages:0};
  const result=await h.send('status');assert.equal(result.result.busy,false);assert.equal(result.result.complete,false);assert.match(result.result.error,/restarted/);
});
test('a disabled next control cannot complete before the native result range ends',async()=>{
  const h=harness();h.snapshot.range.total=2;await h.send('start');const result=await h.finish();
  assert.equal(result.complete,false);assert.match(result.error,/range was finished/);
});
