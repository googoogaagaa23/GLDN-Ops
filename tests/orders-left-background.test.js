const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../extension/orders-left-core.js');
function harness(options={}){
  const url='https://www.ebay.com/sh/ord/?filter=status:ALL_ORDERS',store={},calls=[],tabs=new Map([[2,{id:2,url,status:'complete',windowId:17}]]);
  let listener,next=3;
  const snapshot={account:'seller',rows:[{id:'01-00001-00001',url:'https://www.ebay.com/sh/ord/details?orderid=01-00001-00001',date:'2026-10-15',note:'none',canceled:false}],range:{start:1,end:1,total:1},first:true,terminal:true,hasNext:false};
  const writes=[];
  const chrome={runtime:{id:'gldn',onMessage:{addListener:fn=>listener=fn}},storage:{session:{
    get:async key=>({[key]:structuredClone(store[key])}),set:async value=>{writes.push(structuredClone(value));Object.assign(store,structuredClone(value));},remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete store[key];}}},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('Tab closed');options.onGet?.(tabs.get(id),tabs,store);return tabs.get(id);},
      create:async options=>{const tab={id:next++,status:'complete',...options};tabs.set(tab.id,tab);calls.push(['create',structuredClone(options)]);return tab;},
      update:async(id,value)=>{Object.assign(tabs.get(id),value);options.onUpdate?.(tabs.get(id),tabs,store);calls.push(['update',id,structuredClone(value)]);return tabs.get(id);},
      reload:async id=>{tabs.get(id).discarded=false;calls.push(['reload',id]);},
      remove:async id=>{tabs.delete(id);calls.push(['remove',id]);},onRemoved:{addListener:()=>{}}},
    scripting:{executeScript:async request=>{calls.push(['script',request]);const override=options.onScript?.(request,tabs,store,snapshot);return override!==undefined?override:request.files?[]:[{result:{ok:true,data:structuredClone(snapshot)}}];}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/orders-left-background.js'),'utf8'),{chrome,GLDN_ORDERS_LEFT:C,crypto,structuredClone,Date,Map,Number,Promise,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms>=10000?200:0)});
  const sender={id:'gldn',frameId:0,tab:tabs.get(2)};
  const send=(op,identity=sender,extra={})=>new Promise(resolve=>listener({type:'ordersLeft',op,...extra},identity,resolve));
  const finish=async()=>{for(let n=0;n<100;n++){const result=await send('status');if(result.result&&!result.result.busy)return result.result;await new Promise(resolve=>setTimeout(resolve,3));}throw Error('Fixture did not finish');};
  return {store,calls,tabs,send,sender,snapshot,finish,writes};
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
test('usable order rows are read immediately even while Chrome still reports loading',async()=>{
  const h=harness({onUpdate:tab=>{tab.status='loading';}});await h.send('start');const result=await h.finish();
  assert.equal(result.complete,true);assert.equal(result.summary.pending,1);
  assert.ok(h.calls.filter(call=>call[0]==='script').every(([,request])=>request.injectImmediately===true));
});
test('tab selection and source/reader window moves do not replace the saved reader identity',async()=>{
  const h=harness({onUpdate:(tab,tabs)=>{delete tab.openerTabId;tab.windowId=29;tabs.get(2).windowId=31;}});
  await h.send('start');const result=await h.finish();assert.equal(result.complete,true);assert.equal(result.summary.pending,1);
});
test('a forged reader marker is rejected before any order data is read',async()=>{
  const h=harness({onGet:(tab,tabs,store)=>{if(tab.id!==2&&store['gldnOrdersLeftWorker:'+tab.id])store['gldnOrdersLeftWorker:'+tab.id].run='wrong-run';}});
  await h.send('start');const result=await h.finish();assert.equal(result.complete,false);assert.match(result.error,/saved order-reader identity/);
  assert.equal(h.calls.filter(call=>call[0]==='script'&&call[1].target.tabId!==2).length,0);
});
test('reader navigation to another order filter cannot masquerade as source data',async()=>{
  const h=harness({onUpdate:tab=>{tab.url+='&period=30_DAYS';}});await h.send('start');const result=await h.finish();
  assert.equal(result.complete,false);assert.match(result.error,/navigated away/);assert.equal(result.summary.checked,0);
});
test('a reader cannot cross normal/incognito profile boundaries',async()=>{
  const h=harness({onUpdate:tab=>{tab.incognito=true;}});await h.send('start');const result=await h.finish();
  assert.equal(result.complete,false);assert.match(result.error,/browser profiles/);
});
test('a discarded reader is reloaded without focusing it',async()=>{
  const h=harness({onUpdate:tab=>{tab.discarded=true;}});await h.send('start');const result=await h.finish();
  assert.equal(result.complete,true);assert.equal(h.calls.filter(call=>call[0]==='reload').length,1);
  assert.ok(h.calls.filter(call=>call[0]==='update').every(([,id,value])=>value.active!==true));
});
test('a frozen reader exposes Open reader attention and resumes without losing the run',async()=>{
  let probes=0;
  const h=harness({onGet:tab=>{if(tab.id!==2)tab.frozen=probes++===0;}});await h.send('start');const result=await h.finish();
  assert.equal(result.complete,true);assert.ok(h.writes.some(value=>value['gldnOrdersLeft:2']?.attention));
});
test('starting acknowledges the run before a delayed identity read and never scans source orders',async()=>{
  let release,identityCalls=0;
  const hold=new Promise(resolve=>{release=resolve;});
  const h=harness({onScript:(request,tabs,store,snapshot)=>{
    if(request.target.tabId===2&&request.args?.[0]==='identity'&&identityCalls++===0)return hold.then(()=>[{result:{ok:true,data:{account:snapshot.account}}}]);
  }});
  const first=await h.send('start');assert.equal(first.ok,true);assert.equal(first.result.busy,true);assert.equal(first.result.summary.checked,0);
  const again=await h.send('start');assert.equal(again.result.busy,true);assert.equal(identityCalls,1);
  assert.equal(h.calls.filter(call=>call[0]==='create').length,0);
  release();const result=await h.finish();assert.equal(result.complete,true);
  assert.ok(h.calls.filter(call=>call[0]==='script'&&call[1].target.tabId===2).every(([,request])=>request.args?.[0]==='identity'));
});
test('a timed-out helper response is awaited without piling up duplicate script reads',async()=>{
  let release,workerReads=0;
  const h=harness({onScript:(request,tabs,store,snapshot)=>{
    if(request.target.tabId!==2&&request.args?.[0]==='read'&&workerReads++===0)return new Promise(resolve=>{release=()=>resolve([{result:{ok:true,data:structuredClone(snapshot)}}]);});
  }});
  await h.send('start');
  for(let n=0;n<150&&!h.writes.some(value=>value['gldnOrdersLeft:2']?.attention);n++)await new Promise(resolve=>setTimeout(resolve,3));
  assert.ok(release);assert.ok(h.writes.some(value=>value['gldnOrdersLeft:2']?.attention));assert.equal(workerReads,1);
  assert.equal((await h.send('status')).result.busy,true);
  release();const result=await h.finish();assert.equal(result.complete,true);assert.equal(workerReads,2);
});
test('an absent packaged reader is repaired once instead of injecting it on every snapshot',async()=>{
  let missing=true;
  const h=harness({onScript:request=>{
    if(request.target.tabId!==2&&request.args?.[0]==='read'&&missing){missing=false;return [{result:{ok:false,missing:true}}];}
  }});
  await h.send('start');const result=await h.finish();assert.equal(result.complete,true);
  assert.equal(h.calls.filter(call=>call[0]==='script'&&call[1].files).length,1);
});
