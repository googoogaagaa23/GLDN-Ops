const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../extension/orders-left-core.js'),now=new Date(2026,9,17,12);
const row=(n,extra={})=>({id:`01-00001-${String(n).padStart(5,'0')}`,url:`https://www.ebay.com/sh/ord/details?orderid=01-00001-${String(n).padStart(5,'0')}`,date:'2026-10-15',note:'none',canceled:false,keywords:[],...extra});
const state=()=>({rows:{},total:null,through:0,pages:0,signatures:[],account:'seller'});
const page=(rows,range)=>({rows,range,account:'seller'});
test('order dates use strict native calendar dates, local relative days and year rollover',()=>{
  for(const value of ['Oct 15, 2026','October 15, 2026','10/15/2026','2026-10-15T00:30:00Z'])assert.equal(C.date(value,now),'2026-10-15');
  assert.equal(C.date('Today',now),'2026-10-17');assert.equal(C.date('Yesterday',now),'2026-10-16');
  assert.equal(C.date('Dec 31',new Date(2027,0,2)),'2026-12-31');
  for(const value of ['Feb 30, 2026','13/10/2026','N/A','Delivery Oct 15, 2026',''])assert.equal(C.date(value,now),'');
  assert.equal(C.dateLabel('2026-10-15',now),'Thursday, 10/15');
  assert.equal(C.dateLabel('2025-10-15',now),'Wednesday, 10/15/2025');
});
test('count only unique note-free noncanceled orders and group oldest dates first',()=>{
  const result=C.summary([row(1),row(1),row(2,{note:'present'}),row(3,{canceled:true}),row(4,{date:'2026-10-14'}),row(5,{date:'2026-10-16'}),row(6,{note:'unknown'}),row(7,{canceled:null}),row(8,{date:''})],now);
  assert.equal(result.checked,8);assert.equal(result.pending,3);assert.equal(result.canceled,1);assert.equal(result.noted,1);assert.equal(result.unknown,3);
  assert.deepEqual(result.groups.map(x=>x.date),['2026-10-14','2026-10-15','2026-10-16']);
  assert.equal(result.groups[1].label,'Thursday, 10/15 1 order left');
});
test('any existing note excludes an order without inspecting or interpreting its contents',()=>{
  assert.equal(C.summary([row(1,{note:'present',date:'',canceled:null})],now).pending,0);
  assert.equal(C.summary([row(1,{note:'present',date:'',canceled:null})],now).unknown,0);
  assert.equal(C.summary([row(1,{canceled:true,note:'unknown',date:''})],now).unknown,0);
});
test('50 orders produce the requested full weekday and date label',()=>{
  const result=C.summary(Array.from({length:50},(_,n)=>row(n+1)),now);
  assert.equal(result.groups[0].label,'Thursday, 10/15 50 orders left');
});

test('keyword scans match whole words and the tracking phrase, not checkboxes or checkout',()=>{
  assert.deepEqual(C.keywordMatches('ADD\u00a0TRACKING - Please Check, check!'),['Add Tracking','Check']);
  assert.deepEqual(C.keywordMatches('Checkbox checked checkout checking tracking added'),[]);
  assert.deepEqual(C.keywordMatches('Need to check\nAdd\nTracking'),['Add Tracking','Check']);
});

test('keyword counts include noted orders once, exclude canceled orders and keep exact safe review links',()=>{
  const rows=[row(1,{keywords:['Add Tracking','Check']}),row(1,{keywords:['Add Tracking','Check']}),row(2,{note:'present',keywords:['Check']}),row(3,{canceled:true,keywords:['Add Tracking','Check']}),row(4,{keywords:['Check'],url:'https://evil.test/'}),row(5,{keywords:['Check'],canceled:null})];
  const result=C.summary(rows,now);
  assert.equal(result.pending,2);assert.equal(result.keywordUnknown,1);
  assert.deepEqual(result.keywords.map(value=>[value.keyword,value.count]),[['Add Tracking',1],['Check',3]]);
  assert.equal(result.keywords[1].orders[2].url,'');
  assert.equal(C.summary([row(6,{keywords:undefined})],now).keywordUnknown,1);
});

test('multi-item orders appearing on different pages merge keyword evidence without double counting',()=>{
  const run=state();C.append(run,page([row(1,{keywords:['Check']})],{start:1,end:1,total:2}));
  C.append(run,page([row(1,{keywords:['Add Tracking']})],{start:2,end:2,total:2}));
  const result=C.summary(Object.values(run.rows),now);assert.equal(result.pending,1);
  assert.deepEqual(result.keywords.map(value=>value.count),[1,1]);
});
test('orders scope preserves filters and rejects lookalike hosts or order-detail pages',()=>{
  const url='https://www.ebay.com/sh/ord/?filter=status:ALL_ORDERS&period=90_DAYS&offset=200';
  assert.equal(C.scope(url),C.scope(url.replace('offset=200','offset=0')));
  assert.equal(C.scope(url),C.scope(url.replace('/ord/?','/ord?')+'&limit=200'));
  assert.notEqual(C.scope(url),C.scope(url.replace('90_DAYS','30_DAYS')));
  for(const value of ['https://www.ebay.com.evil.test/sh/ord/','http://www.ebay.com/sh/ord/','https://bad@www.ebay.com/sh/ord/','https://www.ebay.com/sh/ord/details?orderid=01-00001-00001'])assert.equal(C.scope(value),'');
  assert.equal(C.orderUrl('https://www.ebay.com/mesh/ord/details?orderId=01-00001-00001').id,'01-00001-00001');
  assert.equal(C.orderUrl('https://evil.test/mesh/ord/details?orderId=01-00001-00001'),null);
});
test('native ranges advance across all pages while distinct multi-item orders count once',()=>{
  const run=state();C.append(run,page([row(1),row(2)],{start:1,end:2,total:4}));
  C.append(run,page([row(2),row(3)],{start:3,end:4,total:4}));
  assert.equal(run.pages,2);assert.equal(C.summary(Object.values(run.rows),now).pending,3);
});
test('repeated pages, changed account/totals and unidentified orders cannot complete',()=>{
  for(const invalid of [page([row(3)],{start:4,end:4,total:4}),page([row(3)],{start:3,end:3,total:5}),{...page([row(3)],{start:3,end:4,total:4}),account:'other'},{...page([row(3)],{start:3,end:4,total:4}),unknownIds:1}]){
    const run=state();C.append(run,page([row(1),row(2)],{start:1,end:2,total:4}));assert.throws(()=>C.append(run,invalid));
  }
  const run=state();C.append(run,page([row(1)],null));assert.throws(()=>C.append(run,page([row(1)],null)),/same order page/);
});
test('order-count reader and UI expose no marketplace write actions or external data transmission',()=>{
  const read=name=>fs.readFileSync(path.join(__dirname,'../extension',name),'utf8');
  assert.doesNotMatch(read('orders-left-reader.js'),/\.submit\(|fetch\(|XMLHttpRequest|\.value\s*=/);
  assert.doesNotMatch(read('orders-left-background.js'),/fetch\(|getDashboardConfig|dashboardRequest/);
  assert.match(read('orders-left.js'),/attachShadow/);
  const manifest=JSON.parse(read('manifest.json'));assert.ok(manifest.content_scripts.find(x=>x.js.includes('ebay.js')).js.includes('orders-left.js'));
  assert.match(read('background.js'),/orders-left-background\.js/);
});
