// Isolated synthetic browser checks. No marketplace requests or saved notes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function block(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, from);
  return source.slice(start, end);
}
const amazon = read('extension/amazon.js'), ebay = read('extension/ebay.js'), shared = read('extension/shared.js');
const script = `
let lastCopiedAmazonPayload, clipboardText = '', expectedSavedNote, expectedProfitRecord, previousSavedNote;
const AUDIT = {};
${block(shared, '  const moneyToNumber =', '  const isVisible =')}
${block(shared, '  const parseDateToMD =', '  const extractEtasFromText =')}
const U = {PAYLOAD_PREFIX:'GLDN_AMAZON_INFO:', moneyToNumber, formatMoney, parseDateToMD,
 isVisible: el => !!el.getClientRects().length, getBodyLines: () => ['Arriving by Oct 9, 2026'],
 normalizeText: value => String(value || '').trim().toLowerCase(), makePanelDraggable() {}, recordExtensionLog() {},
 setNativeValue: (el,value) => {el.value=value;}, waitFor: async fn => fn()};
const storageGet = async () => ({lastCopiedAmazonPayload});
const storageSet = async updates => {if(updates.lastCopiedAmazonPayload) lastCopiedAmazonPayload=updates.lastCopiedAmazonPayload;};
Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>clipboardText,writeText:async text=>{clipboardText=text;}}});
const renderStatus = () => {};
const isCheckoutPage = () => true;
const isConfirmationPage = () => false;
const amazonPageLabel = () => 'Checkout';
const extractExistingNote = () => '';
const extractEbayOrderIdentity = () => ({orderNumber:extractEbayOrderNumber(),asins:['B000000001']});
const extractEbayEarnings = () => 25.01;
${block(amazon, '  function directText(', '  function moneyValues(')}
${block(amazon, '  const INJECTED_PRICE_UI_RE =', '  function nodeMoneyValues(')}
${block(amazon, '  function amazonCheckoutItemRoots(', '  function scopedTextLines(')}
${block(amazon, '  function parseEtaLine(', '  function extractCheckoutData(')}
const extractCheckoutData = () => ({total:19.87,etas:extractAmazonEtas(),titles:extractAmazonTitles(),asins:extractAmazonAsins(),url:location.href});
${block(ebay, '  function escapeHtml(', '  async function refreshPanelIdentity(')}
${block(amazon, '  function watchAmazonPreviewEtas(', '  async function copyAmazonInfo(')}
${block(ebay, '  function buildEtaText(', '  function calculateMatch(')}
${block(ebay, '  async function readAmazonClipboard(', '  function showOrderNoteFailure(')}
${block(ebay, '  function buildAmazonNoteDraft(', '  async function prepareNote(')}
${block(ebay, '  function extractEbayOrderNumber(', '  function extractEbayTitleCandidates(')}
${block(ebay, '  function isEbayOrderDetailsPage(', '  function ebayPanelWorkflowStateVisible(')}
document.getElementById('review').onclick = () => {const data=extractCheckoutData();showAmazonPreview({profileLabel:'Fixture Profile',total:data.total,etas:data.etas,titles:{values:data.titles,amazonAsins:data.asins},shippingBlock:'',orderEvidence:data});};
ensureInlineOrderNote();
`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>
body{font:14px Arial;margin:0;background:#f3f4f6;color:#20252b}header{padding:15px;background:#20252b;color:white}main{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px}article{min-width:0;background:white;padding:20px}h1{font-size:23px}button{padding:10px}#recommendations{border-top:1px solid #ccc;margin-top:24px;padding-top:16px}#recommendations a{display:block;margin-bottom:10px}@media(max-width:700px){main{grid-template-columns:1fr;padding:12px}}
</style></head><body><header>SYNTHETIC TEST: no marketplace accounts, purchases or saved notes</header><main><article><h2>Amazon checkout</h2><p>Order total: $19.87</p><section id="spc-orders"><section class="shipment"><h3>Arriving by Oct 9, 2026</h3><div data-asin="B000000001"><a href="https://www.amazon.com/dp/B000000001">Fixture 2826 RC motor</a><p>Quantity: 1</p></div></section><div class="a-carousel-container" data-asin="B000000002"><a href="https://www.amazon.com/dp/B000000002">Inside-shipment recommendation</a></div><div hidden data-asin="B000000003">Hidden previous item</div><div id="gldn-injected" data-asin="B000000004">Extension product lookup</div></section><button id="review">Review &amp; Copy Amazon Info</button><section id="recommendations"><h3>Other recommendations</h3><div data-asin="B000000005"><a href="https://www.amazon.com/dp/B000000005">Unrelated recommended item</a></div></section></article><article><h1>Order details</h1><p>Order <span>11-11111-11111</span></p><p>eBay SKU: B000000001</p><p>eBay earnings: $25.01</p><p id="save-counter">Saved notes: 0</p></article></main><script src="/fixture.js"></script></body></html>`;
async function main() {
  const output = path.resolve(process.argv[2] || path.join(root, '.test-tmp/checkout-note-identity'));
  fs.mkdirSync(output, {recursive:true});
  const server = http.createServer((req,res) => {
    if(req.url === '/styles.css'){res.setHeader('Content-Type','text/css');res.end(read('extension/styles.css'));return;}
    if(req.url === '/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(script);return;}
    res.setHeader('Content-Type','text/html');res.end(html);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true});
  const results = [];
  try {
    for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
      const context = await browser.newContext({viewport:{width,height}});
      const page = await context.newPage(), errors = [];
      page.on('pageerror',error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/mesh/ord/details?orderid=11-11111-11111`);
      assert.deepEqual(await page.evaluate(()=>extractAmazonAsins()), ['B000000001']);
      assert.deepEqual(await page.evaluate(()=>extractAmazonTitles()), ['Fixture 2826 RC motor']);
      await page.locator('#review').click();
      assert.match(await page.locator('#gldn-amazon-preview').innerText(), /B000000001/);
      await page.screenshot({path:path.join(output,`${label}-review.png`),fullPage:true});
      await page.locator('#gldn-amazon-preview [data-action="copy"]').click();
      await page.waitForFunction(()=>!document.getElementById('gldn-amazon-preview'));
      await page.locator('[data-note-action="import"]').click();
      assert.equal(await page.locator('#gldn-inline-note-text').inputValue(), '25.01 - 19.87 - Fixture Profile - 10/9');
      assert.equal(await page.locator('[data-note-action="fill"]').isEnabled(), false);
      await page.locator('.gldn-inline-note-confirm input').check();
      assert.equal(await page.locator('[data-note-action="fill"]').isEnabled(), true);
      await page.screenshot({path:path.join(output,`${label}-draft.png`),fullPage:true});
      await page.evaluate(()=>{clipboardText=U.PAYLOAD_PREFIX+JSON.stringify({...lastCopiedAmazonPayload,asins:['B000000099'],capturedAt:new Date(Date.now()+1000).toISOString()});});
      await page.locator('[data-note-action="import"]').click();
      assert.match(await page.locator('#gldn-inline-order-note [role="status"]').innerText(), /eBay: B000000001.*B000000099/);
      assert.equal(await page.locator('[data-note-action="fill"]').isEnabled(), false);
      await page.locator('#review').click();
      await page.evaluate(()=>document.querySelector('#spc-orders .shipment [data-asin]').setAttribute('data-asin','B000000088'));
      await page.locator('#gldn-amazon-preview [data-action="copy"]').click();
      assert.match(await page.locator('.gldn-modal-status').innerText(), /checkout items changed/);
      await page.evaluate(()=>{document.getElementById('spc-orders').removeAttribute('id');document.querySelector('.shipment').removeAttribute('class');});
      assert.deepEqual(await page.evaluate(()=>extractAmazonAsins()), ['B000000088', 'B000000001']);
      await page.evaluate(()=>document.querySelector('h3').parentElement.remove());
      assert.deepEqual(await page.evaluate(()=>extractAmazonAsins()), []);
      assert.equal(await page.locator('#save-counter').innerText(), 'Saved notes: 0');
      assert.deepEqual(errors, []);
      results.push({viewport:label,onlyCurrentAsin:true,onlyCurrentTitle:true,matchingDraft:true,reviewRequired:true,realMismatchBlocked:true,changedCheckoutBlocked:true,savedNotes:0,errors});
      await context.close();
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
    console.log(JSON.stringify(results));
  } finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
