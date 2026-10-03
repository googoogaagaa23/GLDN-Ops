const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const block = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  if (from < 0 || to < from) throw new Error('Fixture source marker missing: ' + start);
  return source.slice(from, to);
};
const amazon = read('extension/amazon.js');
const ebay = read('extension/ebay.js');
const shared = read('extension/shared.js');
const script = `
let lastCopiedAmazonPayload, clipboardText = '', expectedSavedNote, expectedProfitRecord, previousSavedNote;
const AUDIT = {};
${block(shared, '  const moneyToNumber =', '  const isVisible =')}
${block(shared, '  const parseDateToMD =', '  const extractEtasFromText =')}
const U = {
  PAYLOAD_PREFIX:'GLDN_AMAZON_INFO:', moneyToNumber, formatMoney, parseDateToMD,
  getBodyLines: () => document.body.innerText.split(/\\n+/).map(line=>line.trim()).filter(Boolean),
  isVisible: element => !!element.getClientRects().length,
  normalizeText: value => String(value||'').toLowerCase().trim(),
  findVisibleByText: text => [...document.querySelectorAll('button')].find(el=>el.textContent===text && el.getClientRects().length),
  findVisibleContainingText: () => null,
  waitFor: async fn => fn(), setNativeValue: (el,value) => {el.value=value;},
  makePanelDraggable: () => {}, recordExtensionLog: () => {}
};
Object.defineProperty(navigator, 'clipboard', {value:{readText:async()=>clipboardText,writeText:async text=>{clipboardText=text;}}});
const storageGet = async () => ({lastCopiedAmazonPayload});
const storageSet = async updates => { if(updates.lastCopiedAmazonPayload) lastCopiedAmazonPayload=updates.lastCopiedAmazonPayload; };
const renderStatus = () => {};
const isConfirmationPage = () => false;
const amazonPageLabel = () => 'Checkout';
const extractCheckoutData = () => ({etas:extractAmazonEtas()});
const extractExistingNote = () => '';
const extractEbayOrderIdentity = () => ({orderNumber:extractEbayOrderNumber(),asins:['B000000001']});
const extractEbayEarnings = () => 29.79;
const findExistingNoteEditButton = () => null;
const dispatchFullClick = element => element.click();
${block(ebay, '  function escapeHtml(', '  async function refreshPanelIdentity(')}
${block(amazon, '  function parseEtaLine(', '  function extractCheckoutData(')}
${block(amazon, '  function watchAmazonPreviewEtas(', '  async function copyAmazonInfo(')}
${block(ebay, '  function buildEtaText(', '  function calculateMatch(')}
${block(ebay, '  async function readAmazonClipboard(', '  function showOrderNoteFailure(')}
${block(ebay, '  async function openAndFillAddNote(', '  function findExistingNoteEditButton(')}
${block(ebay, '  function findVisibleNoteTextarea(', '  async function prepareNote(')}
${block(ebay, '  function extractEbayOrderNumber(', '  function extractEbayTitleCandidates(')}
${block(ebay, '  function isEbayOrderDetailsPage(', '  function ebayPanelWorkflowStateVisible(')}
document.getElementById('amazon-review').onclick = () => showAmazonPreview({profileLabel:'Fixture Profile',total:24.11,etas:extractAmazonEtas(),titles:{values:['Fixture item'],amazonAsins:[]},shippingBlock:'Fixture buyer',marketplaceContext:null});
document.getElementById('more').onclick = () => {document.getElementById('add-note').hidden=false;};
document.getElementById('add-note').onclick = () => {document.getElementById('native-note').hidden=false;};
document.getElementById('native-save').onclick = () => {document.getElementById('save-count').textContent='1';};
document.getElementById('next-order').onclick = () => {
  history.pushState({},'',location.pathname+'?orderid=22-22222-22222');
  document.getElementById('native-order').textContent='22-22222-22222';
  document.getElementById('native-note').hidden=true;
  ensureInlineOrderNote();
};
ensureInlineOrderNote();
`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>ETA and Order Note - Test Fixture</title><style>
body{font:14px Arial;margin:0;background:#f3f4f6;color:#222}header{padding:14px;background:#20252b;color:#fff}main{display:grid;grid-template-columns:1fr 1fr;gap:26px;padding:24px}article{min-width:0;background:white;padding:20px}button{padding:10px;cursor:pointer}h1{font-size:23px}h2{font-size:20px}label{display:block}#native-note{padding:16px;border:1px solid #999}#native-note textarea{width:100%;min-height:80px;box-sizing:border-box}[hidden]{display:none!important}@media(max-width:700px){main{grid-template-columns:1fr;padding:12px}}
</style></head><body><header>TEST FIXTURE: synthetic orders, no marketplace requests or saved notes</header><main><article><h2>Amazon checkout</h2><p>Order total: $24.11</p><h3 id="shipment">Arriving by Oct 7, 2026</h3><p>Fixture item</p><button id="amazon-review">Review &amp; Copy Amazon Info</button></article><article><h1>Order details</h1><p>Order <span id="native-order">11-11111-11111</span></p><p>Order earnings: $29.79</p><button id="more">More actions</button><button id="add-note" hidden>Add note</button><section id="native-note" role="dialog" hidden><h2>Add note</h2><textarea aria-label="Your note" placeholder="Your note"></textarea><button id="native-save">Save</button></section><p>Native Save count: <span id="save-count">0</span></p><button id="next-order">Next fixture order</button></article></main><script src="/fixture.js"></script></body></html>`;
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(read('extension/styles.css'));return;}
  if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(script);return;}
  if(url.pathname!=='/mesh/ord/details'){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/html');res.end(html);
}).listen(Number(process.env.PORT||4388),'127.0.0.1',()=>console.log('UI fixture http://127.0.0.1:4388/mesh/ord/details?orderid=11-11111-11111'));
