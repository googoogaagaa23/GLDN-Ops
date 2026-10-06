// Synthetic UI preview only; it never connects to an eBay account.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../extension');
const port = Number(process.argv[2] || 8769);
const bootstrap = `
const fixtureRows = Array.from({length:125},(_,i)=>({id:String(i+1),buyer:'sample-buyer-'+(i+1),title:'Sample order '+(i+1),preview:i%2?'Thank you!':'When will my order arrive?',date:'4h',member:true,unread:true,url:'',pageUrl:''}));
let fixtureStore={},fixtureTabs=new Map(),fixtureSelected='';
window.chrome={runtime:{getManifest:()=>({version:'3.12.49'})},storage:{local:{get:async()=>structuredClone(fixtureStore),set:async v=>Object.assign(fixtureStore,structuredClone(v))},onChanged:{addListener(){}}},tabs:{getCurrent:async()=>({id:99}),get:async id=>fixtureTabs.get(id),create:async args=>{let t={id:fixtureTabs.size+1,status:'complete',...args};fixtureTabs.set(t.id,t);return t;},remove:async id=>fixtureTabs.delete(id),update:async()=>{}},scripting:{executeScript:async args=>{if(args.files)return [];let [action,data]=args.args;if(action==='prepare')return [{result:{ready:true}}];if(action==='unread')return [{result:{selected:true}}];if(action==='open'){fixtureSelected=data.row.id;return [{result:{opened:true}}];}if(action==='verify-open')return [{result:{opened:fixtureSelected===data.row.id}}];return [{result:{account:'synthetic-preview',rows:fixtureRows,allRows:fixtureRows,unknown:0,signature:'preview',expected:125,next:false,unreadOnly:true}}];}}};`;
http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(bootstrap);}
  const name = pathname==='/' ? 'ebay-messages.html' : pathname.slice(1);
  if(!['ebay-messages.html','ebay-messages.js','ebay-messages.css','ebay-messages-core.js','icons/icon48.png'].includes(name)){res.writeHead(404);return res.end();}
  const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript';
  let bytes=fs.readFileSync(path.join(root,name));
  if(name.endsWith('.html'))bytes=bytes.toString().replace('<script src="ebay-messages-core.js">','<script src="/fixture.js"></script><script src="ebay-messages-core.js">');
  res.setHeader('Content-Type',type);res.end(bytes);
}).listen(port,'127.0.0.1',()=>console.log('Synthetic messages preview: http://127.0.0.1:'+port));
