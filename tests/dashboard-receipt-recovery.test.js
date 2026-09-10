const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const wrapper = source.slice(source.indexOf('async function postToDashboard('),source.indexOf('async function testDashboardConnection('));
const record={syncId:'exact-request',computerLabel:'2',ebayAccountLabel:'FANCYFI'};
function recovery(stub) {
  const calls=[];
  const api={setTimeout:resolve=>resolve(),postDashboardRequest:async(...args)=>{calls.push(args);return stub(...args);}};
  vm.createContext(api);vm.runInContext(wrapper,api);return {api,calls};
}
function uncertain(){return Object.assign(new Error('Dashboard request timed out.'),{outcomeUnknown:true});}
test('lost write response is confirmed by exact receipt without a second write',async()=>{
  const {api,calls}=recovery(async(action)=>{
    if(action==='sellerLevel')throw uncertain();
    return {ok:true,found:true,syncId:record.syncId,action:'sellerLevel',result:{ok:true,message:'saved',row:2}};
  });
  const result=await api.postToDashboard('sellerLevel',record);
  assert.equal(result.ok,true);assert.equal(result.confirmedByReceipt,true);
  assert.deepEqual(calls.map(c=>c[0]),['sellerLevel','syncReceiptRead']);
  assert.equal(calls[1][1].accountLabel,'FANCYFI');
});
test('pending receipt reports uncertainty, never success or a repeat write',async()=>{
  const {api,calls}=recovery(async action=>{if(action==='sellerLevel')throw uncertain();return {ok:true,found:false};});
  await assert.rejects(api.postToDashboard('sellerLevel',record),e=>e.outcomeUnknown&&/may already be in the sheet/.test(e.message));
  assert.deepEqual(calls.map(c=>c[0]),['sellerLevel','syncReceiptRead','syncReceiptRead']);
});
test('wrong receipt and malformed result cannot confirm a save',async()=>{
  for(const bad of [{syncId:'different',action:'sellerLevel',result:{ok:true}},{syncId:record.syncId,action:'other',result:{ok:true}},{syncId:record.syncId,action:'sellerLevel',result:{}}]){
    const {api}=recovery(async action=>{if(action==='sellerLevel')throw uncertain();return {ok:true,found:true,...bad};});
    await assert.rejects(api.postToDashboard('sellerLevel',record),e=>e.outcomeUnknown);
  }
});
test('definitive server rejection is not presented as a successful save',async()=>{
  const {api,calls}=recovery(async()=>{throw new Error('Invalid dashboard key.');});
  await assert.rejects(api.postToDashboard('sellerLevel',record),/Invalid dashboard key/);assert.equal(calls.length,1);
});
test('body download is covered by the request timeout',async()=>{
  const helper=source.slice(source.indexOf('async function fetchWithTimeout('),source.indexOf('function dashboardRequestTimeoutMs('));
  const api={AbortController,setTimeout,clearTimeout,fetch:async(_url,{signal})=>({ok:true,status:200,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))))})};
  vm.createContext(api);vm.runInContext(helper,api);
  await assert.rejects(api.fetchWithTimeout('https://example.test',{},5),e=>e.outcomeUnknown&&/timed out/.test(e.message));
});
test('server receipt lookup is read-only and validates action and identity',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../dashboard/GLDN_Ops_Dashboard_Code.gs'),'utf8');
  let row=[record.syncId,'sellerLevel',new Date(),2,'FANCYFI',JSON.stringify({ok:true,row:2})];
  const sheet={getLastRow:()=>2,getRange:()=>({createTextFinder:()=>({matchEntireCell:()=>({findNext:()=>({getRow:()=>2})})}),getValues:()=>[row]})};
  const api={Date};vm.createContext(api);vm.runInContext(script,api);
  api.getSpreadsheet_=()=>({getSheetByName:()=>sheet});
  assert.equal(api.readSyncReceipt_({...record,action:'sellerLevel',accountLabel:'FANCYFI'}).found,true);
  assert.throws(()=>api.readSyncReceipt_({...record,action:'ebaySnapshot'}),/does not match/);
  assert.throws(()=>api.readSyncReceipt_({...record,action:'sellerLevel',computerLabel:'0'}),/does not match/);
  row[5]='invalid JSON';assert.equal(api.readSyncReceipt_({...record,action:'sellerLevel'}).found,false);
});
