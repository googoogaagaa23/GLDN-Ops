(()=>{
  'use strict';
  const C=globalThis.GLDN_ORDER_LINKS,jobs=new Map(),reads=new Map();
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function source(sender){
    if(sender.id!==chrome.runtime.id||(sender.frameId||0)!==0||!Number.isInteger(sender.tab?.id)||!C.ebayPage(sender.tab.url))throw Error('Use Find Amazon order on an eBay order or return page.');
    const tab=await chrome.tabs.get(sender.tab.id);if(tab.url!==sender.tab.url||tab.incognito)throw Error('The order page changed or is in Incognito. Nothing was opened.');return tab;
  }
  async function read(id,op,args={}){
    let timer;
    const signature=JSON.stringify([op,args]);let pending=reads.get(id);
    if(pending&&pending.signature!==signature)throw Error('The previous order lookup is still running. Wait for its reader, then try again.');
    if(!pending){
      pending={signature,promise:(async()=>{
        await chrome.scripting.executeScript({target:{tabId:id},injectImmediately:true,files:['order-links-core.js','order-links-reader.js']});
        return chrome.scripting.executeScript({target:{tabId:id},injectImmediately:true,func:(op,args)=>{try{return {ok:true,data:globalThis.GLDN_ORDER_LINKS_READER(op,args)};}catch(e){return {ok:false,error:e.message};}},args:[op,args]});
      })()};reads.set(id,pending);
      pending.promise.then(()=>{if(reads.get(id)===pending)reads.delete(id);},()=>{if(reads.get(id)===pending)reads.delete(id);});
    }
    const values=await Promise.race([pending.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The order lookup reader timed out. Open the search tab, then try again.')),30000);})]).finally(()=>clearTimeout(timer));
    if(!values[0]?.result?.ok)throw Error(values[0]?.result?.error||'The order lookup did not respond.');return values[0].result.data;
  }
  async function helper(op,body){
    try{return await updaterRequest('/order-links/'+op,{method:body?'POST':'GET',body,timeoutMs:10000});}
    catch(e){if(/endpoint not found|HTTP 404/i.test(e.message))throw Error('Update the computer helper with the latest GLDN Ops Setup once, then retry.');throw e;}
  }
  async function check(job){const tab=await chrome.tabs.get(job.owner);if(tab.url!==job.url||tab.incognito)throw Error('The original eBay order changed. Start the lookup again.');}
  async function context(tab){
    let result=await read(tab.id,'ebay');
    if(result.profileLabel&&result.asins.length)return result;
    let detail;
    try{
      detail=await chrome.tabs.create({url:'https://www.ebay.com/sh/ord/details?orderid='+result.orderId,active:false,windowId:tab.windowId,openerTabId:tab.id});
      for(let attempt=0;attempt<40;attempt++){
        try{
          const current=await chrome.tabs.get(detail.id);if(!C.ebayPage(current.url)){if(/signin|captcha|splashui/i.test(current.url))throw Error('eBay needs sign-in or verification in the order tab.');await pause(400);continue;}
          const found=await read(detail.id,'ebay');if(found.orderId!==result.orderId)throw Error('The eBay detail belongs to another order.');
          if(found.profileLabel||attempt>=12){result={...found,sourceUrl:tab.url};break;}
        }catch(e){if(/another order|verification|timed out|still running/.test(e.message))throw e;if(attempt===39)throw e;}
        await pause(400);
      }
    }finally{if(detail){const current=await chrome.tabs.get(detail.id).catch(()=>null);if(current&&!current.active)await chrome.tabs.remove(detail.id);}}
    if((await chrome.tabs.get(tab.id)).url!==tab.url)throw Error('The eBay order changed. Start again.');return result;
  }
  function view(job){if(!job)return null;return {busy:job.busy,message:job.message,error:job.error||'',context:job.context||null,record:job.record||null,hasTracker:!!job.trackerTabId,result:job.result||null};}
  async function tracker(job,active){
    await check(job);const owner=await chrome.tabs.get(job.owner);
    const tab=await chrome.tabs.create({url:'https://app.trackerbot.me/',active,windowId:owner.windowId,openerTabId:owner.id});job.trackerTabId=tab.id;
    let searched=false,last='',stable=0;const until=Date.now()+90000;
    for(let attempt=0;attempt<100&&Date.now()<until;attempt++){
      await check(job);
      const current=await chrome.tabs.get(tab.id);if(!C.trackerPage(current.url)){if(current.status==='loading'){await pause(500);continue;}throw Error('Trackerbot left its official account page. Nothing was changed.');}
      let data;try{data=await read(tab.id,'tracker-read');}catch(e){if(attempt>80||/timed out|still running/.test(e.message))throw e;await pause(500);continue;}
      if(data.login)throw Error('Sign in to Trackerbot in the opened tab, then click Find Amazon order again.');
      if(!data.ready||data.busy){await pause(500);continue;}
      if(!searched){await read(tab.id,'tracker-search',{orderId:job.context.orderId});searched=true;await pause(1000);continue;}
      if(data.query!==job.context.orderId)throw Error('The Trackerbot search changed. Nothing was opened.');
      const signature=JSON.stringify(data.rows);stable=signature===last?stable+1:0;last=signature;
      if(stable>=3){
        const record=C.trackerMatch(data.rows,job.context.orderId);
        await read(tab.id,'tracker-highlight',{orderId:job.context.orderId});
        return record;
      }
      await pause(500);
    }
    throw Error('Trackerbot did not finish loading the order search. Open Trackerbot and review it manually.');
  }
  async function run(job,tab,kind){
    try{
      job.context=await context(tab);await check(job);
      if(kind==='tracker'){
        job.message='Searching Trackerbot for '+job.context.orderId;
        job.record=await tracker(job,true);
        if(job.record)await helper('remember',{...job.record,profileLabel:job.context.profileLabel}).catch(e=>{job.error='Trackerbot match found, but it could not be saved locally: '+e.message;});
        job.message=job.record?'Exact eBay order found in Trackerbot.':'No exact supplier order found in Trackerbot. Review the opened search.';return;
      }
      const config=await helper('config');
      const saved=await helper('lookup',{orderId:job.context.orderId});job.record=saved.record;
      if(!job.record){job.message='Looking for the exact Amazon order in Trackerbot';try{job.record=await tracker(job,false);}catch(e){if(/multiple|different|conflict|search changed|left its official|not a supported/i.test(e.message))throw e;job.error=e.message;}}
      await check(job);
      const mapping=C.chooseMapping(config.mappings,job.context.profileLabel,job.record?.supplierEmail);
      if(!mapping)throw Error('Choose Profiles and map '+(job.context.profileLabel||job.record?.supplierEmail||'the Amazon account')+' to its Chrome profile on this computer.');
      if(job.record){
        if(job.record.profileLabel&&job.context.profileLabel&&C.label(job.record.profileLabel)!==C.label(job.context.profileLabel))throw Error('The saved order link and current note name different Amazon profiles. Review them manually.');
        await helper('remember',{...job.record,profileLabel:job.context.profileLabel||mapping.label});
        await check(job);
        job.result=await helper('open',{profileLabel:mapping.label,profileDirectory:mapping.profileDirectory,supplierEmail:job.record.supplierEmail,amazonOrderId:job.record.amazonOrderId});
        job.message='Requested Amazon order '+job.record.amazonOrderId+' in '+mapping.label+'. Verify the signed-in Amazon account.';
      }else{
        if(job.context.asins.length!==1)throw Error('No exact Amazon order was found. Open Trackerbot or review this order\'s product IDs manually.');
        job.result=await helper('open',{profileLabel:mapping.label,profileDirectory:mapping.profileDirectory,asin:job.context.asins[0]});
        job.message='Opened purchase-history search in '+mapping.label+'. This is not a verified order match.';
      }
    }catch(e){job.error=e.message;job.message='Lookup needs attention';}
    finally{job.busy=false;}
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.type!=='orderLinks')return false;
    (async()=>{
      const tab=await source(sender),old=jobs.get(tab.id);
      if(message.op==='context')return read(tab.id,'ebay');
      if(message.op==='config')return helper('config');
      if(message.op==='mapping')return helper('mapping',{label:message.label,profileDirectory:message.profileDirectory,supplierEmail:message.supplierEmail});
      if(message.op==='status')return old?.url===tab.url?view(old):null;
      if(message.op==='show-tracker'&&old?.url===tab.url&&old.trackerTabId){await chrome.tabs.update(old.trackerTabId,{active:true});return view(old);}
      if(!['amazon','tracker'].includes(message.op))throw Error('Unknown order-link command.');
      if(old?.busy&&old.url===tab.url)return view(old);
      const job={owner:tab.id,url:tab.url,busy:true,message:'Reading the eBay order',context:null,trackerTabId:null};jobs.set(tab.id,job);
      run(job,tab,message.op).catch(()=>{});return view(job);
    })().then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;
  });
  chrome.tabs.onRemoved.addListener(id=>{jobs.delete(id);reads.delete(id);});
})();
