(()=>{
  'use strict';
  const C=globalThis.GLDN_ORDERS_LEFT,key=id=>'gldnOrdersLeft:'+id,marker=id=>'gldnOrdersLeftWorker:'+id;
  const tasks=new Map(),reads=new Map();
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function bounded(promise,message,ms=30000){
    let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));
  }
  async function execute(id,action,args){
    const invoke=()=>chrome.scripting.executeScript({target:{tabId:id},injectImmediately:true,func:(action,args)=>{
      if(typeof globalThis.GLDN_ORDERS_LEFT_READER!=='function')return {ok:false,missing:true};
      try{return {ok:true,data:globalThis.GLDN_ORDERS_LEFT_READER(action,args)};}catch(e){return {ok:false,error:e.message};}
    },args:[action,args]});
    let result=await invoke();
    if(result[0]?.result?.missing){
      await chrome.scripting.executeScript({target:{tabId:id},injectImmediately:true,files:['orders-left-core.js','orders-left-reader.js']});
      result=await invoke();
    }
    if(!result[0]?.result?.ok)throw Error(result[0]?.result?.error||'The order reader did not respond.');
    return result[0].result.data;
  }
  async function read(id,action='read',args={}){
    const signature=JSON.stringify([action,args]);let pending=reads.get(id);
    if(pending&&pending.signature!==signature)throw Error('The previous order read is still running. Wait for it to finish, then Recount.');
    if(!pending){
      pending={signature,promise:execute(id,action,args)};reads.set(id,pending);
      pending.promise.then(()=>{if(reads.get(id)===pending)reads.delete(id);},()=>{if(reads.get(id)===pending)reads.delete(id);});
    }
    return bounded(pending.promise,'The reader tab did not respond to the order read.');
  }
  async function source(sender){
    if(sender.id!==chrome.runtime.id||(sender.frameId||0)!==0||!Number.isInteger(sender.tab?.id)||!C.ordersUrl(sender.tab.url))throw Error('The count must start from this eBay Orders tab.');
    if((await chrome.storage.session.get(marker(sender.tab.id)))[marker(sender.tab.id)])throw Error('A background reader cannot start another count.');
    const tab=await chrome.tabs.get(sender.tab.id);
    if(C.scope(tab.url)!==C.scope(sender.tab.url))throw Error('The eBay order filters changed.');
    return tab;
  }
  const save=state=>chrome.storage.session.set({[key(state.owner)]:structuredClone(state)});
  function view(state){
    if(!state)return null;
    const summary=C.summary(Object.values(state.rows));
    return {scope:state.scope,busy:state.busy,complete:state.complete,pages:state.pages,checkedAt:state.checkedAt||0,updatedAt:state.updatedAt,
      message:state.message,error:state.error||'',attention:state.attention===true,summary,hasReader:!!(state.detail||state.index)};
  }
  async function owned(state,id){
    if(![state.index,state.detail].includes(id))throw Error('This tab does not belong to the order count.');
    const tab=await chrome.tabs.get(id);
    const proof=(await chrome.storage.session.get(marker(id)))[marker(id)];
    const kind=id===state.index?'index':'detail';
    if(!proof||proof.owner!==state.owner||proof.run!==state.run||proof.kind!==kind)throw Error('The saved order-reader identity no longer matches this count.');
    if(Boolean(tab.incognito)!==Boolean(state.incognito))throw Error('The order reader changed browser profiles.');
    return tab;
  }
  async function cleanup(state){
    for(const id of [state.index,state.detail].filter(Number.isInteger)){
      try{const tab=await owned(state,id);if(!tab.active)await chrome.tabs.remove(id);}catch{}
      await chrome.storage.session.remove(marker(id));
    }
    state.index=null;state.detail=null;
  }
  async function check(state){
    if(!state.busy||tasks.get(state.owner)!==state)throw Error('The order count was stopped.');
    const owner=await chrome.tabs.get(state.owner);
    if(C.scope(owner.url)!==state.scope)throw Error('The eBay Orders tab or its filters changed.');
    if(Boolean(owner.incognito)!==Boolean(state.incognito))throw Error('The eBay Orders tab changed browser profiles.');
    state.windowId=owner.windowId;
  }
  async function worker(state,kind,url){
    await check(state);
    const old=state[kind];
    if(old){await owned(state,old);await chrome.tabs.update(old,{url,active:false});return old;}
    const tab=await chrome.tabs.create({url:'about:blank',active:false,windowId:state.windowId,openerTabId:state.owner});
    state[kind]=tab.id;
    await chrome.storage.session.set({[marker(tab.id)]:{owner:state.owner,run:state.run,kind}});await save(state);
    await chrome.tabs.update(tab.id,{url,active:false});return tab.id;
  }
  async function settled(state,id,action,args={},predicate=()=>true){
    const until=Date.now()+90000;let previous='',reloaded=false,error=action==='detail'?'The order details have not exposed a saved-note status yet.':'The eBay order list has not exposed readable rows yet.';
    while(Date.now()<until){
      await check(state);
      try{
        const tab=id===state.owner&&action==='identity'?await chrome.tabs.get(id):await owned(state,id);
        if(id!==state.owner&&tab.discarded&&!reloaded){reloaded=true;await chrome.tabs.reload(id);previous='';}
        if(tab.frozen){state.attention=true;state.message='The browser paused the background reader. Open reader to let it continue.';error=state.message;state.updatedAt=Date.now();await save(state);await pause(1000);continue;}
        state.attention=false;
        const matches=url=>action==='detail'?C.orderUrl(url)?.id===args.id:C.scope(url)===state.scope;
        if(!matches(tab.url)){
          if(/signin\.|\/splashui\/|\/captcha\b/i.test(tab.url||''))throw Error('eBay needs sign-in or verification in the reader tab.');
          if(matches(tab.pendingUrl)||/^about:blank(?:#.*)?$/.test(tab.url||'')){await pause(450);continue;}
          throw Error('The order reader navigated away from the selected orders or order details.');
        }
        // A rendered native table is usable while unrelated page resources load.
        const page=await read(id,action,args);
        if(action==='read'&&page.scope&&page.scope!==state.scope)throw Error('The reader order filters changed.');
        if(state.account&&page.account&&state.account!==page.account)throw Error('The signed-in eBay account changed.');
        if(predicate(page)){
          const signature=JSON.stringify(page);
          if(signature===previous)return page;
          previous=signature;
        }else{previous='';error=action==='detail'?'The order note status is still unavailable.':'The native order page has not advanced to the expected results.';}
      }catch(e){previous='';error=e.message;if(/different order|filters changed|account changed|verification|sign-in|saved order-reader|browser profiles|navigated away|No tab with|Tab closed/i.test(error))throw e;
        if(/did not respond|still running/.test(error)){state.attention=true;state.message='Waiting for the eBay reader. Open reader if the browser has paused it.';state.updatedAt=Date.now();await save(state);}
      }
      await pause(450);
    }
    throw Error(error+' Use Open reader to inspect eBay, then Recount to retry.');
  }
  async function pump(state){
    try{
      await check(state);
      const identity=await settled(state,state.owner,'identity');
      if(identity.scope&&identity.scope!==state.scope)throw Error('The eBay order filters changed.');
      state.account=identity.account;await save(state);await check(state);
      const id=await worker(state,'index',state.url);
      let page=await settled(state,id,'read');
      for(let attempts=0;!page.first;attempts++){
        if(attempts>=100)throw Error('The first order page could not be reached.');
        const action=page.canFirst?'first':page.canPrevious?'previous':'';
        if(!action)throw Error('Go to page one in eBay, then recount to include earlier pages.');
        const old=JSON.stringify(page);await read(id,action);
        page=await settled(state,id,'read',{},next=>JSON.stringify(next)!==old);
      }
      while(true){
        await check(state);
        C.append(state,page);state.message='Reading order notes';state.updatedAt=Date.now();await save(state);
        for(const row of page.rows){
          if(row.canceled===true||row.note==='present'||row.note==='none'&&row.canceled===false&&row.date)continue;
          try{
            const parsed=C.orderUrl(row.url);if(!parsed||parsed.id!==row.id)throw Error('The order detail link could not be verified.');
            const progress=C.summary(Object.values(state.rows));
            state.message=`Checking notes: ${progress.checked-progress.unknown} of ${progress.checked}`;
            state.updatedAt=Date.now();await save(state);
            const detailId=await worker(state,'detail',parsed.url);
            const detail=await settled(state,detailId,'detail',{id:row.id,openMenu:true},value=>value.note!=='unknown'||value.canceled===true);
            state.rows[row.id]={...row,...detail};
          }catch(e){if(!state.busy||/account changed|filters changed|sign-in|verification/i.test(e.message))throw e;state.readErrors=(state.readErrors||0)+1;}
          state.updatedAt=Date.now();await save(state);
        }
        if(page.terminal){
          if(page.range&&page.range.end!==page.range.total)throw Error('eBay ended pagination before its reported order range was finished.');
          const summary=C.summary(Object.values(state.rows));state.complete=summary.unknown===0;
          state.error=summary.unknown?`${summary.unknown} orders still need their note, status or date checked.`:'';
          state.message=state.complete?'All pages read':'Partial read';break;
        }
        if(!page.hasNext)throw Error('The last order page could not be verified. This count is partial.');
        if(state.pages>=500||Object.keys(state.rows).length>=25000)throw Error('The read limit was reached; the count remains partial. Narrow the eBay period and recount.');
        const previous=JSON.stringify(page),through=state.through;
        await read(id,'next');
        page=await settled(state,id,'read',{},value=>JSON.stringify(value)!==previous&&(!value.range||value.range.start===through+1));
      }
    }catch(e){state.complete=false;state.error=e.message;state.message=state.busy?'Partial read':'Stopped';}
    finally{
      state.busy=false;state.attention=false;state.updatedAt=Date.now();state.checkedAt=Date.now();
      if(tasks.get(state.owner)===state){
        if(state.complete)await cleanup(state);
        await save(state);tasks.delete(state.owner);
      }
    }
  }
  async function start(tab){
    const old=tasks.get(tab.id)||(await chrome.storage.session.get(key(tab.id)))[key(tab.id)];
    if(old?.busy&&tasks.has(tab.id)&&old.scope===C.scope(tab.url))return view(old);
    if(old){old.busy=false;await cleanup(old);}
    const state={owner:tab.id,windowId:tab.windowId,incognito:Boolean(tab.incognito),scope:C.scope(tab.url),url:tab.url,account:'',run:crypto.randomUUID(),
      busy:true,complete:false,message:'Reading all order pages',rows:{},pages:0,total:null,through:0,signatures:[],updatedAt:Date.now()};
    tasks.set(tab.id,state);await save(state);pump(state).catch(()=>{});return view(state);
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.type!=='ordersLeft')return false;
    (async()=>{
      if(message.op==='eligible'){
        if(sender.id!==chrome.runtime.id||(sender.frameId||0)!==0||!C.ordersUrl(sender.tab?.url))return {eligible:false};
        return {eligible:!(await chrome.storage.session.get(marker(sender.tab.id)))[marker(sender.tab.id)]};
      }
      const tab=await source(sender);
      if(message.op==='start')return start(tab);
      const state=tasks.get(tab.id)||(await chrome.storage.session.get(key(tab.id)))[key(tab.id)];
      if(!state||state.scope!==C.scope(tab.url))return null;
      if(state.busy&&!tasks.has(tab.id)){state.busy=false;state.complete=false;state.message='Partial read';state.error='The background reader restarted. Recount to finish.';await save(state);}
      if(message.op==='status')return view(state);
      if(message.op==='stop'){state.busy=false;state.complete=false;state.message='Stopped';state.error='The count is partial.';await save(state);return view(state);}
      if(message.op==='show'){
        for(const id of [state.detail,state.index].filter(Number.isInteger)){try{await owned(state,id);await chrome.tabs.update(id,{active:true});break;}catch{}}
        return view(state);
      }
      if(message.op==='visible'&&!state.busy){
        const page=await read(tab.id);
        if(state.account&&page.account&&state.account!==page.account)throw Error('The signed-in eBay account changed.');
        if(page.range&&state.total!==null&&page.range.total!==state.total)return start(tab);
        for(const row of page.rows){
          const old=state.rows[row.id];if(!old)return start(tab);
          state.rows[row.id]={...old,...(row.note!=='unknown'?{note:row.note}:{}),...(row.canceled!==null?{canceled:row.canceled}:{}),...(row.date?{date:row.date}:{})};
        }
        state.updatedAt=Date.now();await save(state);return view(state);
      }
      throw Error('Unknown order-count action.');
    })().then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;
  });
  chrome.tabs.onRemoved.addListener(id=>{
    reads.delete(id);
    const state=tasks.get(id);if(state){state.busy=false;tasks.delete(id);cleanup(state).catch(()=>{});}
    chrome.storage.session.remove([key(id),marker(id)]).catch(()=>{});
  });
})();
