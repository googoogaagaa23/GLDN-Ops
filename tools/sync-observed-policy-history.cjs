// Imports only an explicitly supplied, privately captured eBay history file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../extension/violation-history-core.js');
const [inputPath, configPath, mode] = process.argv.slice(2);
if (!inputPath || !configPath) throw new Error('Provide the observed history JSON and private config paths. Add --apply to save.');
const input = JSON.parse(fs.readFileSync(inputPath,'utf8'));
const at = new Date().toISOString();
const records = input.rows.map(([itemId,title,sku,reasonIndex,caseId],index) => core.normalizeRecord({
  itemId,title,sku,account:input.account,reason:input.reasons[reasonIndex],
  caseUrl:'https://www.ebay.com/ifh/viewcase?caseId='+caseId,
  computerLabel:'Observed connected Chrome profile',firstSeenAt:at,lastSeenAt:at,
  caseReadError:'Case explanation not yet read. Run Scan This eBay Account to collect it.',
  ...(input.caseDetails?.[index] ? {...input.caseDetails[index],caseReadAt:at,caseReadError:''} : {})
}));
if (records.some((r)=>!r) || core.mergeRecords(records).length !== input.rows.length) throw new Error('Observed history contains invalid or duplicate records.');
if (mode !== '--apply') {
  console.log(JSON.stringify({preview:true,records:records.length,asins:new Set(records.map(r=>r.asin).filter(Boolean)).size,caseDetails:records.filter(r=>r.caseReadAt).length}));
} else (async()=>{
  const config=fs.readFileSync(configPath,'utf8');
  const url=config.match(/dashboardUrl\s*:\s*["']([^"']+)["']/)?.[1];
  const key=config.match(/dashboardKey\s*:\s*["']([^"']+)["']/)?.[1];
  if(!url||!key||!/^https:\/\/script\.google\.com\/macros\/s\//.test(url))throw new Error('A valid existing private dashboard configuration is required.');
  const request=async(action,record)=>{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,key,record,syncId:record.syncId}),signal:AbortSignal.timeout(90000)});
    const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Dashboard rejected request');return data;
  };
  for(let offset=0;offset<records.length;offset+=100){
    const record={records:records.slice(offset,offset+100),syncId:'gldn-policyIncidentBatch-'+crypto.randomUUID()};
    let response;
    try{response=await request('policyIncidentBatch',record);}
    catch(error){
      const receipt=await request('syncReceiptRead',{syncId:record.syncId,action:'policyIncidentBatch'});
      if(!receipt.found||!receipt.result?.ok)throw error;
      response=receipt.result;
    }
    if(response.count!==record.records.length||record.records.some(r=>!response.ids?.includes(r.id)))throw new Error('Incomplete save acknowledgement');
  }
  const shared=[];
  let offset=0,revision=null;
  do{
    const page=await request('policyIncidentRead',{offset});
    if(revision!==null&&revision!==page.revision)throw new Error('Shared history changed during verification');
    revision=page.revision;shared.push(...page.records);offset=page.nextOffset;
  }while(offset!==null);
  for(const record of records){
    const saved=shared.find(r=>r.id===record.id);
    if(!saved||saved.asin!==record.asin||saved.reason!==record.reason||saved.title!==record.title)throw new Error('Saved incident does not match observed evidence');
  }
  const proof={ok:true,saved:records.length,sharedTotal:shared.length,uniqueAsins:new Set(records.map(r=>r.asin).filter(Boolean)).size,caseDetailsRead:records.filter(r=>r.caseReadAt).length,verifiedAt:new Date().toISOString(),marketplaceChanges:0};
  fs.writeFileSync(path.join(path.dirname(inputPath),'violation-history-live-proof.json'),JSON.stringify(proof,null,2));
  console.log(JSON.stringify(proof));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
