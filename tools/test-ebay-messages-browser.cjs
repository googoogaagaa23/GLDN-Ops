// Isolated synthetic browser tests. No real eBay account or message is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const output = path.join(root, '.test-tmp', 'messages-v3.12.55');
fs.mkdirSync(output, {recursive:true});

function nativeFixture(mode, total) {
  return `<!doctype html><html><head><style>
    button.message-button{display:block;height:24px;width:100%;padding:0;border:0;text-align:left;white-space:nowrap}
    [data-testid="messages-inbox"]{${mode === 'lazy' || mode === 'virtual' ? 'height:240px;overflow-y:auto' : ''}}
    .sender,.subject,.preview{margin-right:12px} [role="progressbar"]{height:24px}
    </style></head><body>
    <header id="gh"><div class="gh-identity"><a href="https://www.ebay.com/usr/fixture-store">fixture-store</a></div></header>
    <button aria-checked="true">Unread from members ${mode === 'lazy' || mode === 'unknown' ? '' : '<span class="badge">' + total + '</span>'}</button>
    <main><div data-testid="messages-inbox"></div>${mode === 'paged' ? '<nav aria-label="pagination"><span id="range"></span><button id="next" aria-label="Go to next page"></button></nav>' : ''}</main>
    <div data-testid="messages-thread" hidden></div>
    <script>
      const mode=${JSON.stringify(mode)}, total=${total}, list=document.querySelector('[data-testid="messages-inbox"]');
      let page=0,loaded=Math.min(25,total),loading=false;
      function row(id){return '<button class="message-button unread" data-conversation-id="'+id+'"><span class="sender">sample-buyer-'+id+'</span><span class="subject">Sample order '+id+'</span><span class="preview">Question '+id+'</span><span class="date">4h</span></button>';}
      function render(){
        if(mode==='empty'){list.textContent='No unread messages';return;}
        const start=mode==='paged'?page*25:mode==='virtual'?Math.floor(list.scrollTop/24):0;
        const end=mode==='paged'?Math.min(total,start+25):mode==='virtual'?Math.min(total,start+12):mode==='unknown'?2:loaded;
        let html=mode==='virtual'?'<div style="height:'+start*24+'px"></div>':'';
        for(let i=start;i<end;i++)html+=row(i+1);
        if(mode==='virtual')html+='<div style="height:'+(total-end)*24+'px"></div>';
        if(loading)html+='<div role="progressbar">Loading</div>';
        list.innerHTML=html;
        if(mode==='paged'){
          document.getElementById('range').textContent='Page '+(page+1)+' of '+Math.ceil(total/25);
          document.getElementById('next').setAttribute('aria-disabled',String(end===total));
        }
      }
      if(mode==='paged')document.getElementById('next').onclick=()=>{if((page+1)*25<total){page++;render();}};
      list.addEventListener('scroll',()=>{
        if(mode==='virtual'){render();return;}
        if(mode==='lazy'&&!loading&&loaded<total&&list.scrollTop+list.clientHeight>=list.scrollHeight-30){
          loading=true;render();setTimeout(()=>{loaded=Math.min(total,loaded+25);loading=false;render();},450);
        }
      });
      list.addEventListener('click',event=>{
        const card=event.target.closest('[data-conversation-id]');if(!card)return;
        for(const active of list.querySelectorAll('.card__item--active'))active.classList.remove('card__item--active');
        card.classList.add('card__item--active');
        const pane=document.querySelector('[data-testid="messages-thread"]');pane.hidden=false;
        pane.setAttribute('data-conversation-id',card.dataset.conversationId);
        pane.innerHTML='<div data-testid="app-conversation"><a href="https://www.ebay.com/usr/sample-buyer-'+card.dataset.conversationId+'">Buyer</a></div>';
      });render();
    </script></body></html>`;
}

(async () => {
  const server = http.createServer((req,res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (!/^(ebay-messages\.(html|css|js)|ebay-messages-core\.js|theme-catalog\.js|icons\/icon48\.png)$/.test(name)) {res.writeHead(404);return res.end();}
    const bytes = fs.readFileSync(path.join(root, 'extension', name));
    res.setHeader('Content-Type', name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript');
    res.end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  const results=[];
  try {
    for (const scenario of [
      {mode:'paged',total:75,width:1366,height:1000},
      {mode:'virtual',total:125,width:1366,height:1000},
      {mode:'lazy',total:125,width:390,height:844},
      {mode:'unknown',total:2,width:1366,height:1000},
      {mode:'empty',total:0,width:390,height:844}
    ]) {
      const context = await browser.newContext({viewport:{width:scenario.width,height:scenario.height}});
      const store={}, tabs=new Map(), actions=[];
      let nextId=1;
      await context.route('https://www.ebay.com/**', route => route.fulfill({contentType:'text/html',body:nativeFixture(scenario.mode,scenario.total)}));
      await context.exposeBinding('fixtureCall', async (_, method, data) => {
        if(method==='get')return structuredClone(store);
        if(method==='set'){Object.assign(store,structuredClone(data));return;}
        if(method==='tab-create'){
          const page=await context.newPage(),id=nextId++;tabs.set(id,page);await page.goto(data.url);
          return {id,url:data.url,status:'complete'};
        }
        if(method==='tab-get'){
          if(data===99)return {id:99,status:'complete'};
          if(!tabs.has(data))throw Error('Closed');return {id:data,url:tabs.get(data).url(),status:'complete'};
        }
        if(method==='tab-remove'){await tabs.get(data)?.close();tabs.delete(data);return;}
        if(method==='tab-update')return;
        if(method==='script'){
          const page=tabs.get(data.target.tabId);assert.ok(page);
          if(data.files){for(const file of data.files)await page.addScriptTag({content:fs.readFileSync(path.join(root,'extension',file),'utf8')});return [];}
          const [action,args]=data.args;actions.push({action,args});
          const result=await page.evaluate(([action,args])=>globalThis.GLDN_EBAY_MESSAGES_PAGE(action,args),[action,args]);
          return [{result}];
        }
        throw Error('Unexpected fixture method: '+method);
      });
      await context.addInitScript(() => {
        const listeners=[];
        window.chrome={runtime:{getManifest:()=>({version:'3.12.55'})},
          storage:{local:{get:()=>fixtureCall('get'),set:async data=>{
            await fixtureCall('set',data);for(const listener of listeners)listener(Object.fromEntries(Object.entries(data).map(([key,value])=>[key,{newValue:value}])),'local');
          }},onChanged:{addListener:fn=>listeners.push(fn)}},
          tabs:{getCurrent:async()=>({id:99}),get:id=>fixtureCall('tab-get',id),create:data=>fixtureCall('tab-create',data),remove:id=>fixtureCall('tab-remove',id),update:(id,data)=>fixtureCall('tab-update',{id,data})},
          scripting:{executeScript:data=>fixtureCall('script',{target:data.target,files:data.files,args:data.args})}};
      });
      const desk=await context.newPage();
      await desk.goto('http://127.0.0.1:'+server.address().port+'/ebay-messages.html');
      await desk.getByRole('button',{name:'Scan Unread Messages',exact:true}).click();
      await desk.waitForFunction(()=>/^Complete:|^Partial scan:/.test(document.getElementById('status').textContent)&&!document.getElementById('scan').disabled,{},{timeout:65000});
      const value=store.gldnEbayUnreadMessages, account=value.accounts['fixture-store'];
      const complete=scenario.mode!=='unknown';
      assert.equal(account.complete,complete);
      assert.equal(account.rows.length,scenario.total);
      assert.equal(value.scan.phase,complete?'complete':'error');
      assert.equal(new Set(account.rows.map(row=>row.id)).size,scenario.total);
      assert.equal(await desk.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      if(scenario.mode==='paged'){
        assert.equal(value.scan.pages,3);
        await desk.locator('input[data-id="1"]').check();await desk.getByRole('button',{name:'Ignore Selected',exact:true}).click();
        await desk.locator('input[data-id="75"]').check();await desk.getByRole('button',{name:'Open Selected',exact:true}).click();
        await desk.waitForFunction(()=>document.getElementById('openedCount').textContent==='1');
        assert.equal(actions.filter(action=>action.action==='open').length,1);
        assert.equal(actions.find(action=>action.action==='open').args.row.id,'75');
        assert.ok(store.gldnEbayUnreadMessages.accounts['fixture-store'].ignored['1']);
      }
      assert.ok(!actions.some(entry=>/send|delete|archive|mark/.test(entry.action)));
      await desk.screenshot({path:path.join(output,scenario.mode+'-'+scenario.width+'.png'),fullPage:true});
      results.push({mode:scenario.mode,viewport:scenario.width,messages:account.rows.length,batches:value.scan.pages,complete,openActions:actions.filter(action=>action.action==='open').length});
      await context.close();
    }
    fs.writeFileSync(path.join(output,'fixture-results.json'),JSON.stringify({scope:'Synthetic only; no real account or message access',results},null,2));
    console.log(JSON.stringify(results));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
