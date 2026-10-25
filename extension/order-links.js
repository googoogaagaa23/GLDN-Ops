(()=>{
  'use strict';
  if(globalThis.GLDN_ORDER_LINKS_UI)return;globalThis.GLDN_ORDER_LINKS_UI=true;
  const C=globalThis.GLDN_ORDER_LINKS;let host,root,url='',busy=false,context=null,checking=false;
  const call=async(op,extra={})=>{const response=await chrome.runtime.sendMessage({type:'orderLinks',op,...extra});if(!response?.ok)throw Error(response?.error||'Order lookup did not respond.');return response.result;};
  function status(message,error=false){root.querySelector('[role="status"]').textContent=message;root.querySelector('[role="status"]').classList.toggle('error',error);}
  function render(job){
    if(!job){busy=false;root.querySelector('#amazon').disabled=false;root.querySelector('#tracker').disabled=false;status('The lookup restarted. Choose Find Amazon order to try again.',true);return;}
    busy=job.busy;context=job.context||context;
    root.querySelector('.identity').textContent=context?`${context.orderId}${context.profileLabel?' | Amazon profile: '+context.profileLabel:''}`:'';
    root.querySelector('#amazon').disabled=busy;root.querySelector('#tracker').disabled=busy;
    root.querySelector('#show').hidden=!job.hasTracker;
    status([job.message,job.error].filter(Boolean).join(' | '),!!job.error);
  }
  async function action(op){try{status('Reading order...');render(await call(op));}catch(e){status(e.message,true);}}
  async function settings(){
    const form=root.querySelector('form');form.hidden=!form.hidden;if(form.hidden)return;
    try{
      const config=await call('config'),select=root.querySelector('#directory');select.replaceChildren();
      for(const profile of config.profiles){const option=document.createElement('option');option.value=profile.profileDirectory;option.textContent=`${profile.name} (${profile.profileDirectory})`;select.append(option);}
      const input=root.querySelector('#label');input.value=context?.profileLabel||'';
      const mapping=config.mappings.find(row=>C.label(row.label)===C.label(input.value));
      if(mapping){select.value=mapping.profileDirectory;root.querySelector('#email').value=mapping.supplierEmail||'';}
      root.querySelector('#saved').textContent=config.mappings.map(row=>`${row.label}: ${config.profiles.find(profile=>profile.profileDirectory===row.profileDirectory)?.name||row.profileDirectory}`).join(' | ');
      status(config.profiles.length?'':'No Chrome profiles found by this computer\'s helper.',!config.profiles.length);
    }catch(e){status(e.message,true);}
  }
  async function mount(){
    const heading=[...document.querySelectorAll('h1')].find(el=>!el.closest('[id^="gldn-"]'));if(!heading)return false;
    host=document.createElement('section');host.id='gldn-order-links';host.style.cssText='display:block;clear:both;max-width:100%;margin:14px 0;min-width:0';root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>:host{font:13px Arial,sans-serif;color:#202827;letter-spacing:0}*{box-sizing:border-box}[hidden]{display:none!important}.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid #d8dcdf;border-bottom:1px solid #d8dcdf}.brand{width:20px;height:20px}h2{font-size:15px;margin:0 8px 0 0}.version,.identity{color:#55615d;font-size:12px}button{font:inherit;border:1px solid #b6c3c0;background:#fff;color:#204e41;border-radius:4px;padding:7px 10px;min-height:32px;cursor:pointer}button.primary{background:#176d54;color:white;border-color:#176d54}button:disabled{opacity:.5;cursor:default}button:hover:enabled{filter:brightness(.95)}p{font-size:12px;line-height:1.6;margin:6px 0;overflow-wrap:anywhere}.error{color:#a42c39}form{padding:12px 0;border-bottom:1px solid #d8dcdf;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}label{display:grid;gap:5px;font-size:12px;font-weight:600}input,select{font:inherit;min-width:0;width:100%;height:34px;border:1px solid #b6c3c0;border-radius:4px;padding:5px;background:white;color:#202827}.form-actions{grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap}a{color:#155f86}#saved{grid-column:1/-1}.identity{margin-top:6px}@media(max-width:600px){form{grid-template-columns:minmax(0,1fr)}.bar button{flex-grow:1}.bar h2{flex:1}}</style><div class="bar"><img class="brand" alt="GLDN Ops"><h2>Order links</h2><small class="version"></small><button id="amazon" class="primary">Find Amazon order</button><button id="tracker">Open Trackerbot</button><button id="profiles">Profiles</button><button id="show" hidden>Show Trackerbot search</button></div><div class="identity"></div><form hidden><label>Amazon profile label<input id="label" maxlength="80" required></label><label>Chrome profile on this computer<select id="directory" required></select></label><label>Trackerbot supplier email (optional)<input id="email" type="email" maxlength="254" autocomplete="off"></label><div class="form-actions"><button type="submit">Save mapping</button><a href="https://github.com/googoogaagaa23/GLDN-Ops/raw/refs/heads/main/downloads/GLDN-Ops-Setup.exe" target="_blank" rel="noopener noreferrer">Latest computer helper setup</a></div><p id="saved"></p></form><p role="status" aria-live="polite"></p>`;
    root.querySelector('.brand').src=chrome.runtime.getURL('icons/icon48.png');root.querySelector('.version').textContent='v'+chrome.runtime.getManifest().version;
    heading.after(host);
    root.querySelector('#amazon').onclick=()=>action('amazon');root.querySelector('#tracker').onclick=()=>action('tracker');root.querySelector('#show').onclick=()=>action('show-tracker');root.querySelector('#profiles').onclick=()=>settings();
    root.querySelector('form').onsubmit=async event=>{event.preventDefault();try{await call('mapping',{label:root.querySelector('#label').value,profileDirectory:root.querySelector('#directory').value,supplierEmail:root.querySelector('#email').value});status('Profile mapping saved on this computer.');}catch(e){status(e.message,true);}};
    try{context=await call('context');root.querySelector('.identity').textContent=`${context.orderId}${context.profileLabel?' | Amazon profile: '+context.profileLabel:''}`;}catch(e){status(e.message,true);}
    return true;
  }
  async function tick(){
    if(checking)return;checking=true;
    try{
      if(!C.ebayPage(location.href)){host?.remove();host=null;return;}
      if(!host?.isConnected||url!==location.href){host?.remove();url=location.href;busy=false;context=null;if(!await mount())return;}
      if(busy)render(await call('status'));
    }catch(e){if(root)status(e.message,true);}finally{checking=false;}
  }
  void tick();const timer=setInterval(tick,1500);addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
