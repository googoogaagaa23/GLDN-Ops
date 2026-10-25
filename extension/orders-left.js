(()=>{
  if(globalThis.GLDN_ORDERS_LEFT_UI)return;globalThis.GLDN_ORDERS_LEFT_UI=true;
  const C=globalThis.GLDN_ORDERS_LEFT;let host,root,scope='',readerMode=false,busy=false,complete=false,haveState=false,lastSignal='',lastVisible=0,polling=false,checking=false,timer;
  const call=async(op)=>{const response=await chrome.runtime.sendMessage({type:'ordersLeft',op});if(!response?.ok)throw Error(response?.error||'The order count did not respond.');return response.result;};
  function mount(){
    const heading=[...document.querySelectorAll('h1')].find(el=>/orders/i.test(el.textContent)&&!el.closest('[id^="gldn-"]'));
    if(!heading)return false;
    host=document.createElement('section');host.id='gldn-orders-left';host.setAttribute('aria-label','Orders left to place');
    host.style.cssText='display:block;clear:both;max-width:100%;min-width:0;margin:14px 0';root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{font:13px Arial,sans-serif;color:#222;letter-spacing:0}*{box-sizing:border-box}.bar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 0;border-top:1px solid #d8dcdf;border-bottom:1px solid #d8dcdf}img{width:24px;height:24px}h2{font-size:16px;margin:0}output{font-size:18px;font-weight:700;color:#176d54;margin-left:6px}.actions{margin-left:auto;display:flex;gap:8px}button{font:inherit;background:white;color:#24485b;border:1px solid #aeb9c0;border-radius:4px;min-height:32px;padding:6px 10px;cursor:pointer}button:disabled{opacity:.45;cursor:default}button:hover:enabled{background:#f1f7f9}.dates{display:flex;flex-wrap:wrap;gap:6px 24px;margin:10px 0}.date{line-height:1.7;font-weight:600}p{font-size:12px;line-height:1.6;color:#596770;margin:6px 0}.error{color:#a42c39}[hidden]{display:none!important}@media(max-width:500px){.actions{width:100%;margin-left:34px}output{margin-left:34px;width:100%}.dates{display:block}.date{display:block}}
      .keywords{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 24px;border-top:1px solid #d8dcdf;padding-top:8px}.keywords summary{cursor:pointer;font-weight:600;line-height:1.8}.keywords ul{list-style:none;padding:0;margin:8px 0;max-height:240px;overflow:auto}.keywords li{padding:5px 0;border-top:1px solid #e7eaec;overflow-wrap:anywhere}.keywords a{color:#155f86;text-decoration:underline}.keywords a:hover{color:#103f59}@media(max-width:500px){.keywords{grid-template-columns:minmax(0,1fr)}}
    </style><div class="bar"><img alt="GLDN Ops"><h2>Orders left to place</h2><small class="version"></small><output aria-live="polite">Counting...</output><div class="actions"><button id="return" hidden>Return to Orders counter</button><button id="refresh" title="Recount first five pages and keywords">Recount</button><button id="stop">Stop</button><button id="show" hidden>Open reader</button></div></div><div class="dates"></div><div class="keywords"></div><p class="status" role="status"></p>`;
    root.querySelector('img').src=chrome.runtime.getURL('icons/icon48.png');
    root.querySelector('.version').textContent='v'+chrome.runtime.getManifest().version;
    heading.parentElement?.matches('main,body')?heading.after(host):heading.parentElement.insertAdjacentElement('afterend',host);
    root.getElementById('refresh').addEventListener('click',()=>request('start'));
    root.getElementById('stop').addEventListener('click',()=>request('stop'));
    root.getElementById('show').addEventListener('click',()=>request('show'));
    root.getElementById('return').addEventListener('click',()=>request('reader-return'));
    return true;
  }
  function role(reader){
    if(readerMode!==reader){haveState=false;busy=false;complete=false;}
    readerMode=reader;host.dataset.reader=String(reader);
    root.getElementById('return').hidden=!reader;
    root.getElementById('refresh').hidden=reader;
    if(reader){root.getElementById('stop').hidden=true;root.getElementById('show').hidden=true;}
  }
  function render(state){
    if(!state||state.scope!==scope)return;
    busy=state.busy;complete=state.complete;haveState=true;const s=state.summary;
    root.querySelector('output').textContent=state.complete?`${s.pending} ${s.pending===1?'order':'orders'}${state.limited?' (first 5 pages)':''}`:s.checked?`At least ${s.pending} ${s.pending===1?'order':'orders'}`:state.error?'Count incomplete':'Counting...';
    root.querySelector('.dates').replaceChildren(...s.groups.map(group=>{const line=document.createElement('span');line.className='date';line.textContent=group.label;return line;}));
    const expanded=new Set([...root.querySelectorAll('.keywords details[open]')].map(el=>el.dataset.keyword));
    root.querySelector('.keywords').replaceChildren(...(s.keywords||[]).map(result=>{
      const box=document.createElement('details'),title=document.createElement('summary'),list=document.createElement('ul');
      box.dataset.keyword=result.keyword;box.dataset.count=String(result.count);box.open=expanded.has(result.keyword);
      title.textContent=`${result.keyword}: ${!state.complete?'at least ':''}${result.count} ${result.count===1?'order':'orders'}`;
      for(const order of result.orders){
        const item=document.createElement('li'),link=document.createElement(order.url?'a':'span');
        link.textContent=C.dateLabel(order.date)+' - '+order.id;
        if(order.url){link.href=order.url;link.target='_blank';link.rel='noopener noreferrer';}
        item.append(link);list.append(item);
      }
      if(!result.orders.length){const item=document.createElement('li');item.textContent=state.complete?'No matches':'No matches read yet';list.append(item);}
      box.append(title,list);return box;
    }));
    const details=[readerMode?'Background reader; results from the original Orders tab':'',state.message,`${s.checked} orders checked across ${state.pages} ${state.pages===1?'page':'pages'}`,`${s.noted} with notes`,`${s.canceled} canceled`,s.unknown?`${s.unknown} awaiting verification`:'',s.keywordUnknown?`${s.keywordUnknown} keyword/status checks unresolved`:'','First 5 pages; current eBay filters',state.checkedAt?'Checked '+new Date(state.checkedAt).toLocaleTimeString():'',state.error].filter(Boolean);
    const status=root.querySelector('.status');status.textContent=details.join(' | ');status.classList.toggle('error',!!state.error);
    root.getElementById('stop').hidden=readerMode||!busy;root.getElementById('refresh').disabled=busy;
    root.getElementById('show').hidden=readerMode||!(state.error||state.attention)||!state.hasReader;
    host.dataset.complete=String(state.complete);host.dataset.pending=String(s.pending);
  }
  async function request(op){
    try{render(await call(op));}catch(e){invalidate(e.message);}
  }
  function invalidate(message){
    if(!root)return;
    root.querySelector('.status').textContent=message;root.querySelector('.status').classList.add('error');
    root.querySelector('output').textContent='Count unavailable';root.querySelector('.dates').replaceChildren();root.querySelector('.keywords').replaceChildren();
    root.getElementById('refresh').disabled=false;root.getElementById('stop').hidden=true;
    host.dataset.complete='false';host.removeAttribute('data-pending');busy=false;complete=false;haveState=false;
  }
  async function tick(){
    if(checking)return;checking=true;
    try{
      const current=C.scope(location.href);
      if(!current){host?.remove();host=null;root=null;scope='';return;}
      if(!host?.isConnected||scope!==current){
        host?.remove();scope=current;lastSignal='';haveState=false;if(!mount())return;
      }
      const context=await call('eligible');
      role(context?.reader===true);
      if(readerMode){render(context.state);return;}
      if(!context?.eligible)throw Error('The Orders counter is waiting for its browser connection.');
      if(!haveState){
        const saved=await call('status');
        if(saved&&saved.scanVersion!==C.SCAN_VERSION){await request('start');}
        else if(saved?.busy){render(saved);}
        else if(saved?.complete&&Date.now()-saved.checkedAt<120000){render(saved);await request('visible');}
        else await request('start');
      }
      if(!host?.isConnected||polling)return;polling=true;
      try{
        if(busy)await request('status');
        else if(complete&&haveState&&Date.now()-lastVisible>4000){
          lastVisible=Date.now();
          const page=globalThis.GLDN_ORDERS_LEFT_READER('read');
          const signature=JSON.stringify([page.account,page.range,page.rows]);
          if(lastSignal!==signature)await request('visible');
          lastSignal=signature;
        }
      }catch(e){invalidate(e.message);}
      finally{polling=false;}
    }catch(e){invalidate(e.message);}finally{checking=false;}
  }
  tick().catch(()=>{});timer=setInterval(()=>tick().catch(()=>{}),1500);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
