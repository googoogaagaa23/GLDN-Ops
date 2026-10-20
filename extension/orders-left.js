(()=>{
  if(globalThis.GLDN_ORDERS_LEFT_UI)return;globalThis.GLDN_ORDERS_LEFT_UI=true;
  const C=globalThis.GLDN_ORDERS_LEFT;let host,root,scope='',busy=false,complete=false,haveState=false,lastSignal='',lastVisible=0,polling=false,checking=false,timer;
  const call=async(op)=>{const response=await chrome.runtime.sendMessage({type:'ordersLeft',op});if(!response?.ok)throw Error(response?.error||'The order count did not respond.');return response.result;};
  function mount(){
    const heading=[...document.querySelectorAll('h1')].find(el=>/orders/i.test(el.textContent)&&!el.closest('[id^="gldn-"]'));
    if(!heading)return false;
    host=document.createElement('section');host.id='gldn-orders-left';host.setAttribute('aria-label','Orders left to place');
    host.style.cssText='display:block;clear:both;max-width:100%;min-width:0;margin:14px 0';root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{font:13px Arial,sans-serif;color:#222;letter-spacing:0}*{box-sizing:border-box}.bar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 0;border-top:1px solid #d8dcdf;border-bottom:1px solid #d8dcdf}img{width:24px;height:24px}h2{font-size:16px;margin:0}output{font-size:18px;font-weight:700;color:#176d54;margin-left:6px}.actions{margin-left:auto;display:flex;gap:8px}button{font:inherit;background:white;color:#24485b;border:1px solid #aeb9c0;border-radius:4px;min-height:32px;padding:6px 10px;cursor:pointer}button:disabled{opacity:.45;cursor:default}button:hover:enabled{background:#f1f7f9}.dates{display:flex;flex-wrap:wrap;gap:6px 24px;margin:10px 0}.date{line-height:1.7;font-weight:600}p{font-size:12px;line-height:1.6;color:#596770;margin:6px 0}.error{color:#a42c39}[hidden]{display:none!important}@media(max-width:500px){.actions{width:100%;margin-left:34px}output{margin-left:34px;width:100%}.dates{display:block}.date{display:block}}
    </style><div class="bar"><img alt="GLDN Ops"><h2>Orders left to place</h2><output aria-live="polite">Counting...</output><div class="actions"><button id="refresh" title="Recount all pages">Recount</button><button id="stop">Stop</button><button id="show" hidden>Open reader</button></div></div><div class="dates"></div><p class="status" role="status"></p>`;
    root.querySelector('img').src=chrome.runtime.getURL('icons/icon48.png');
    heading.parentElement?.matches('main,body')?heading.after(host):heading.parentElement.insertAdjacentElement('afterend',host);
    root.getElementById('refresh').addEventListener('click',()=>request('start'));
    root.getElementById('stop').addEventListener('click',()=>request('stop'));
    root.getElementById('show').addEventListener('click',()=>request('show'));
    return true;
  }
  function render(state){
    if(!state||state.scope!==scope)return;
    busy=state.busy;complete=state.complete;haveState=true;const s=state.summary;
    root.querySelector('output').textContent=state.complete?`${s.pending} ${s.pending===1?'order':'orders'}`:s.checked?`At least ${s.pending} ${s.pending===1?'order':'orders'}`:state.error?'Count incomplete':'Counting...';
    root.querySelector('.dates').replaceChildren(...s.groups.map(group=>{const line=document.createElement('span');line.className='date';line.textContent=group.label;return line;}));
    const details=[state.message,`${s.checked} orders checked across ${state.pages} ${state.pages===1?'page':'pages'}`,`${s.noted} with notes`,`${s.canceled} canceled`,s.unknown?`${s.unknown} awaiting verification`:'','Current eBay filters',state.checkedAt?'Checked '+new Date(state.checkedAt).toLocaleTimeString():'',state.error].filter(Boolean);
    const status=root.querySelector('.status');status.textContent=details.join(' | ');status.classList.toggle('error',!!state.error);
    root.getElementById('stop').hidden=!busy;root.getElementById('refresh').disabled=busy;
    root.getElementById('show').hidden=!(state.error||state.attention)||!state.hasReader;
    host.dataset.complete=String(state.complete);host.dataset.pending=String(s.pending);
  }
  async function request(op){
    try{render(await call(op));}catch(e){invalidate(e.message);}
  }
  function invalidate(message){
    if(!root)return;
    root.querySelector('.status').textContent=message;root.querySelector('.status').classList.add('error');
    root.querySelector('output').textContent='Count unavailable';root.querySelector('.dates').replaceChildren();
    root.getElementById('refresh').disabled=false;root.getElementById('stop').hidden=true;
    host.dataset.complete='false';host.removeAttribute('data-pending');busy=false;complete=false;haveState=false;
  }
  async function tick(){
    if(checking)return;checking=true;
    try{
      const current=C.scope(location.href);
      if(!current){host?.remove();host=null;root=null;scope='';return;}
      if(!host?.isConnected||scope!==current){
        if(!(await call('eligible'))?.eligible){clearInterval(timer);return;}
        host?.remove();scope=current;lastSignal='';haveState=false;if(!mount())return;
        const saved=await call('status');
        if(saved?.busy){render(saved);}
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
    }finally{checking=false;}
  }
  tick().catch(()=>{});timer=setInterval(()=>tick().catch(()=>{}),1500);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
