const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const history = require('../extension/violation-history-core.js');
const preflight = require('../extension/listing-preflight-core.js');
const audit = require('../extension/policy-listing-audit-core.js');
const pack = require('../extension/listing-preflight-rules.json');
const incident = (overrides = {}) => ({
  account:'sample-store', itemId:'300000000001', title:'RF75 APP Control Portable Shortwave Radio Receiver',
  sku:Buffer.from('B012345678').toString('base64'),
  reason:'This listing was removed for violating our Electronic equipment policy.',
  lastSeenAt:'2026-09-13T10:00:00.000Z', firstSeenAt:'2026-09-12T10:00:00.000Z',
  caseUrl:'https://www.ebay.com/ifh/viewcase?caseId=sample-case', ...overrides
});
const candidate = (title, asins = []) => ({ title, asins, action:'clear', status:'CLEAR', matches:[], hasProductEvidence:true });

test('history decodes exact SKU ASIN, merges repeated observations, retains source account', () => {
  const records = history.mergeRecords([incident()], [incident({ computerLabel:'M0' }), incident({ account:'second-store' })]);
  assert.equal(records.length,2);
  assert.equal(records[0].asin,'B012345678');
  assert.equal(records[0].firstSeenAt,'2026-09-12T10:00:00.000Z');
  assert.equal(history.normalizeRecord(incident({ itemId:'garbage' })), null);
  assert.equal(history.normalizeRecord(incident({ reason:'Sold successfully' })), null);
  assert.equal(history.normalizeRecord(incident({ caseUrl:'javascript:alert(1)' })).caseUrl,'');
});

test('same ASIN blocks across stores; close wording reviews; brands and generic category overlap do not', () => {
  const results = history.applyHistory([
    candidate('Totally renamed product',['B012345678']),
    candidate('RF75 APP Control Portable Shortwave Radio Receiver Replacement'),
    candidate('Portable wireless radio antenna'),
    candidate('APP Control kitchen drawer organizer')
  ],[incident()]);
  assert.deepEqual(results.map((r) => r.action), ['block','review','clear','clear']);
  assert.match(results[0].reason,/Same Amazon ASIN/);
  assert.equal(results[1].matches[0].evidenceKind,'related-product-inference');
  assert.equal(history.applyHistory([candidate(incident().title)],[incident()])[0].action,'review');
});

test('unknown reason stays unknown; no category or brand rule is fabricated', () => {
  const row = incident({ reason:"This listing has a policy violation. See email notice for more info.", policy:'', activity:'' });
  const match = history.applyHistory([candidate('Another product',['B012345678'])],[row])[0];
  assert.match(match.reason,/See email notice/);
  assert.doesNotMatch(match.reason,/counterfeit|illegal|pesticide/i);
});

test('shared incidents participate in preflight and existing audit with stable observation-only fingerprints', () => {
  const row = history.normalizeRecord(incident());
  const rules = { ...pack, incidentHistory:[row] };
  const result = preflight.evaluateRows([candidate('Kitchen measuring spoon',['B012345678'])],rules)[0];
  assert.equal(result.action,'block');
  assert.equal(audit.buildPolicyAudit([{itemId:'300000000002',title:'Kitchen measuring spoon',sku:row.sku}],rules).listings[0].action,'block');
  assert.equal(audit.rulePackFingerprint(rules),audit.rulePackFingerprint({...rules,incidentHistory:[{...row,lastSeenAt:'2026-09-14T10:00:00.000Z'}]}));
  assert.notEqual(audit.rulePackFingerprint(rules),audit.rulePackFingerprint(pack));
  assert.equal(preflight.copyAmazonLinkPayload([result]),'');
});

function backend() {
  let sheet = null, revision = 'empty', writes = 0;
  const properties = { getProperty:() => revision, setProperty:(_,v) => { revision=v; } };
  function makeSheet() {
    const data=[];
    return { data, setFrozenRows(){},getLastRow:()=>data.length,getRange(row,col,n=1,width=1){
      return { getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:width},(_,j)=>data[row-1+i]?.[col-1+j] || '')),
        setNumberFormat(){return this;},setValues(values){writes++;values.forEach((v,i)=>{data[row-1+i] ||= []; v.forEach((cell,j)=>{data[row-1+i][col-1+j]=cell;});});return this;} };
    }};
  }
  const api = { Date, Number, JSON, PropertiesService:{getScriptProperties:()=>properties},Utilities:{getUuid:()=>String(Math.random())},SpreadsheetApp:{flush(){}} };
  vm.createContext(api);
  vm.runInContext(fs.readFileSync(require.resolve('../dashboard/GLDN_Ops_Dashboard_Code.gs'),'utf8'),api);
  api.getSpreadsheet_=()=>({getSheetByName:()=>sheet,insertSheet:()=>sheet=makeSheet()});
  api.protectSheet_=()=>{};
  return { api, get sheet(){return sheet;},get writes(){return writes;} };
}
test('shared store read is read-only, upsert is deduplicated, and all rows are paged', () => {
  const h=backend();
  assert.equal(h.api.readPolicyIncidents_({}).total,0);
  assert.equal(h.sheet,null);
  const row=history.normalizeRecord(incident());
  assert.equal(h.api.savePolicyIncidents_({records:[row]}).total,1);
  assert.equal(h.api.savePolicyIncidents_({records:[{...row,activity:'Exact eBay explanation'}]}).total,1);
  const writes=h.writes;
  assert.equal(h.api.readPolicyIncidents_({}).records[0].activity,'Exact eBay explanation');
  assert.equal(h.writes,writes);
  h.sheet.data[0][0]='Changed header';
  assert.throws(()=>h.api.readPolicyIncidents_({}),/headers do not match/);
  assert.equal(h.writes,writes);
});
test('shared store validates scope and writes spreadsheet literals instead of formulas', () => {
  const h=backend();
  assert.throws(()=>h.api.savePolicyIncidents_({records:[incident({account:'someone@else'})]}),/Invalid/);
  assert.throws(()=>h.api.savePolicyIncidents_({records:[incident({caseUrl:'https://evil.test/'})]}),/Invalid/);
  h.api.savePolicyIncidents_({records:[history.normalizeRecord(incident({title:'=IMPORTXML("bad","bad")'}))]});
  assert.ok(h.sheet.data[1][4].startsWith("'="));
  assert.equal(h.api.readPolicyIncidents_({}).records[0].title,'=IMPORTXML("bad","bad")');
});

function worker(stored, handler, overrides = {}) {
  const calls=[], queue=[];
  const api = { Date, Promise, Map, JSON, setTimeout, clearTimeout, GLDN_VIOLATION_HISTORY:history,
    getDashboardConfig:async()=>({}),
    storageGet:async(keys)=>Object.fromEntries(keys.map((k)=>[k,stored[k]])),
    storageSet:async(values)=>Object.assign(stored,values),
    postToDashboard:async(action,record)=>{calls.push({action,record});return handler(action,record);},
    recordWithSyncId:(action,record)=>({...record,syncId:'test-receipt'}),
    removeQueuedDashboardSync:async()=>{},enqueueDashboardSync:async(...args)=>queue.push(args),
    releaseWorkflowStart:async()=>{}, ...overrides };
  vm.createContext(api);
  vm.runInContext(fs.readFileSync(require.resolve('../extension/violation-history-background.js'),'utf8'),api);
  return {api,calls,queue};
}
test('local-only records never count as a shared acknowledgement and failed saves remain queued',async()=>{
  const record=history.normalizeRecord(incident());
  const h=worker({gldnViolationHistoryLocal:[record]},async(action)=> {
    if(action==='policyIncidentBatch') throw new Error('offline');
    return {schemaVersion:1,ok:true,offset:0,total:0,records:[],nextOffset:null,revision:'empty'};
  });
  await assert.rejects(h.api.syncViolationHistory(),/shared save is pending/);
  assert.equal(h.queue.length,1);
  assert.equal(h.calls.filter((c)=>c.action==='policyIncidentBatch').length,1);
});
test('cross-profile refresh loads shared history and rejects inconsistent pagination',async()=>{
  const record=history.normalizeRecord(incident());
  const h=worker({},async()=>({schemaVersion:1,ok:true,offset:0,total:1,records:[record],nextOffset:null,revision:'1'}));
  assert.equal((await h.api.refreshViolationHistory(true)).records[0].asin,record.asin);
  const bad=worker({},async(_,r)=>({schemaVersion:1,ok:true,offset:r.offset,total:2,records:[record],nextOffset:r.offset?null:1,revision:r.offset?'2':'1'}));
  await assert.rejects(bad.api.refreshViolationHistory(true),/changed during download/);
});
test('reader has no marketplace write control and enforces page counts and paired notice',()=>{
  const source=fs.readFileSync(require.resolve('../extension/violation-history-reader.js'),'utf8');
  assert.match(source,/rows.length !==/);
  assert.match(source,/grid-row-notice/);
  assert.match(source,/snapshot|row.getAttribute/);
  assert.equal((source.match(/\.click\(/g)||[]).length,1);
  assert.match(source,/buttons\[0\]\.click/);
  assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|\.submit\(/);
});

test('policy checks need no dashboard setup, including on a profile with no saved history', async () => {
  const h = worker({}, async () => { throw new Error('must not call dashboard'); }, {
    getDashboardConfig: async () => { throw new Error('Dashboard setup code is missing'); }
  });
  const result = await h.api.loadPolicyCheckHistory(true);
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 0);
  assert.match(result.warning, /Dashboard connection is optional/);
  assert.equal(h.calls.length, 0);
  const rules = {...pack, incidentHistory:result.records, incidentHistoryWarning:result.warning};
  const checked = preflight.evaluateRows([
    candidate('Ant Killer Pesticide Granules'), candidate('Spray Paint Aerosol Can'),
    candidate('Stainless Steel Measuring Spoon Set')
  ], rules);
  assert.deepEqual(checked.map(row => row.action), ['block', 'block', 'clear']);
});

test('offline checks retain local and cached shared incidents without claiming shared verification', async () => {
  const local = history.normalizeRecord(incident());
  const shared = history.normalizeRecord(incident({account:'other-store', itemId:'300000000002', sku:Buffer.from('B098765432').toString('base64')}));
  const stored = {gldnViolationHistoryLocal:[local], gldnViolationHistoryShared:{records:[shared],syncedAt:'2026-01-01T00:00:00Z'}};
  const h = worker(stored, async () => {throw new Error('network offline');});
  const result = await h.api.loadPolicyCheckHistory(true);
  assert.equal(result.records.length, 2);
  assert.match(result.warning, /2 saved incidents/);
  assert.equal(stored.gldnViolationHistoryShared.syncedAt, '2026-01-01T00:00:00Z');
  assert.deepEqual(history.applyHistory([candidate('Renamed item',['B012345678']), candidate('Other item',['B098765432'])],result.records).map(row=>row.action), ['block','block']);
  await assert.rejects(h.api.refreshViolationHistory(true), /network offline/);
  await assert.rejects(h.api.syncViolationHistory(), /network offline/);
});

test('slow shared reads cannot indefinitely block a listing check', async () => {
  let finish;
  const response = new Promise(resolve => {finish = resolve;});
  const h = worker({}, async () => response, {setTimeout:(callback)=>setTimeout(callback,1)});
  const result = await h.api.loadPolicyCheckHistory(true);
  assert.equal(result.ok,true);
  assert.match(result.warning,/unavailable/);
  finish({schemaVersion:1,ok:true,offset:0,total:0,records:[],nextOffset:null,revision:'empty'});
  await h.api.refreshViolationHistory(true);
});

test('a healthy refresh removes the fallback warning and applies new cross-profile incidents', async () => {
  const record = history.normalizeRecord(incident());
  const h = worker({},async()=>({schemaVersion:1,ok:true,offset:0,total:1,records:[record],nextOffset:null,revision:'1'}));
  const result = await h.api.loadPolicyCheckHistory(true);
  assert.equal(result.warning,'');
  assert.equal(result.records[0].asin,record.asin);
});

test('invalid shared responses preserve cached evidence in optional mode but still reject strict sync',async()=>{
  const record = history.normalizeRecord(incident());
  const stored = {gldnViolationHistoryShared:{records:[record],syncedAt:'2026-01-01T00:00:00Z'}};
  const h = worker(stored,async()=>({schemaVersion:999,ok:true,records:[]}));
  const result = await h.api.loadPolicyCheckHistory(true);
  assert.equal(result.records[0].asin,record.asin);
  assert.match(result.warning,/unavailable/);
  await assert.rejects(h.api.syncViolationHistory());
});

test('audit warning is saved separately from rule identity and never weakens invalid policy data',()=>{
  const rules = {...pack, incidentHistoryWarning:history.unavailableWarning(0)};
  const checked = audit.buildPolicyAudit([{itemId:'300000000003',title:'Ant Killer Granules'}],rules);
  assert.equal(checked.incidentHistoryWarning,rules.incidentHistoryWarning);
  assert.equal(audit.rulePackFingerprint(rules),audit.rulePackFingerprint(pack));
  const result = preflight.evaluateRows([candidate('Stainless Steel Measuring Spoon Set')],{rules:[],incidentHistory:[]});
  assert.notEqual(result[0].action,'clear');
});

test('optional history is limited to read-only policy checking, never explicit shared sync',()=>{
  const source = fs.readFileSync(require.resolve('../extension/background.js'),'utf8');
  assert.match(source,/message.type === 'syncEbayViolationHistory' \? syncViolationHistory\(\)\s*: message.optional === true \? loadPolicyCheckHistory/);
  const loader = source.slice(source.indexOf('async function loadListingPreflightRulePack('),source.indexOf('async function currentPolicyListingIdentity('));
  assert.match(loader,/loadPolicyCheckHistory/);
  assert.doesNotMatch(loader,/await refreshViolationHistory/);
});

test('the actual audit rule loader runs without a code and still rejects missing bundled rules',async()=>{
  const h = worker({},async()=>{throw new Error('must not call dashboard');}, {
    getDashboardConfig:async()=>{throw new Error('Dashboard setup code is missing');},
    LISTING_PREFLIGHT:preflight,POLICY_LISTING_AUDIT:audit,
    chrome:{runtime:{getURL:path=>'https://fixture.test/'+path}},
    fetch:async()=>({ok:true,json:async()=>pack})
  });
  const source=fs.readFileSync(require.resolve('../extension/background.js'),'utf8');
  vm.runInContext(source.slice(source.indexOf('async function loadListingPreflightRulePack('),source.indexOf('async function currentPolicyListingIdentity(')),h.api);
  const rules=await h.api.loadListingPreflightRulePack(true);
  assert.ok(rules.ruleCount >= 639);
  assert.match(rules.incidentHistoryWarning,/optional/);
  assert.equal(audit.buildPolicyAudit([{itemId:'300000000004',title:'Rodent Repellent Spray'}],rules).summary.block,1);
  assert.equal(h.calls.length,0);
  h.api.fetch=async()=>({ok:true,json:async()=>({rules:[]})});
  await assert.rejects(h.api.loadListingPreflightRulePack(true),/No reviewed policy rules/);
});
