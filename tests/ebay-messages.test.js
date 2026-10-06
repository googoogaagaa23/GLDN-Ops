const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../extension/ebay-messages-core.js');
const read = file => fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const row = (id = '1', extra = {}) => core.normalizeRow({id, buyer:'buyer-one', title:'Test item', preview:'Thank you', date:'4h', unread:true, member:true, ...extra});
const account = rows => ({account:'test-store', rows, ignored:{}});

test('URL validation rejects external sites, credentials and unsupported eBay actions', () => {
  assert.equal(core.messageUrl('https://evil.invalid/cnt/ViewMessage'), '');
  assert.equal(core.messageUrl('https://ebay.com.evil.invalid/cnt/ViewMessage'), '');
  assert.equal(core.messageUrl('https://www.ebay.com/itm/123'), '');
  assert.equal(core.messageUrl('javascript:alert(1)'), '');
  assert.equal(core.messageUrl(''), '');
  assert.equal(core.messageUrl('https://secret@www.ebay.com/cnt/ViewMessage'), '');
  assert.ok(core.messageUrl(core.INBOX_URL));
});
test('conversations require a stable native identifier', () => assert.equal(row('', {title:'Same item'}).id, ''));
test('deduplication preserves exact native threads, not just matching customer names', () => {
  assert.equal(core.mergeRows([row()], [row(), row('2')]).length, 2);
  assert.throws(() => core.mergeRows([row()], [row('1', {buyer:'other-buyer'})]), /Two customers/);
});
test('only unread, unopened, unignored member conversations are pending', () => {
  const value = account([row(), {...row('2'), openedAt:'2026-10-05'}, row('3', {unread:false})]);
  assert.equal(core.pending(value).length, 1);
  assert.equal(core.pending(core.ignore(value, '1')).length, 0);
  assert.equal(core.pending(core.restore(core.ignore(value, '1'), '1')).length, 1);
});
test('ignores do not cross accounts', () => {
  assert.equal(core.pending(core.ignore(account([row()]), '1')).length, 0);
  assert.equal(core.pending({...account([row()]), account:'other-store'}).length, 1);
});
test('relative clock changes do not resurrect ignored messages', () => {
  const old = core.ignore(account([row()]), '1');
  assert.equal(core.pending(core.reconcile(old, [row('1', {date:'8h'})], true)).length, 0);
});
test('changed message previews return ignored conversations to pending', () => {
  const old = core.ignore(account([row()]), '1');
  const fresh = core.reconcile(old, [row('1', {preview:'Where is my order?'})], true);
  assert.equal(core.pending(fresh).length, 1);
  assert.equal(Object.keys(fresh.ignored).length, 0);
});
test('partial scans preserve old rows but complete scans remove stale unread results', () => {
  assert.equal(core.reconcile(account([row()]), [row('2')], false).rows.length, 2);
  assert.equal(core.reconcile(account([row()]), [row('2')], true).rows.length, 1);
});
test('fresh complete scans trust native unread status over previous opened bookkeeping', () => {
  assert.equal(core.pending(core.reconcile(account([{...row(), openedAt:'yesterday'}]), [row()], true)).length, 1);
});
test('more than 100 messages are retained and eligible', () => {
  const rows = Array.from({length:350}, (_, i) => row(String(i)));
  assert.equal(core.pending(core.reconcile(account([]), rows, true)).length, 350);
});

function readerHarness({count=2, owner='test-store', loading=false} = {}) {
  const element = (text='', attrs={}) => ({innerText:text, textContent:text, dataset:{}, disabled:false,
    classList:{contains:name => (attrs.class || '').split(' ').includes(name)}, getAttribute:key=>attrs[key] ?? null,
    getClientRects:()=>[{}], closest:()=>null, contains:()=>false, querySelector:()=>null, querySelectorAll:()=>[],
    click(){this.clicked=true;}});
  const badge = element(String(count));
  const menu = element('Unread from members' + count, {'aria-checked':'true'});
  menu.querySelector = selector => selector === '.badge' ? badge : null;
  const scroller = {clientHeight:800, scrollHeight:1500, scrollTop:0, dispatchEvent(){this.scrolled=true;}};
  const cards = [row(), row('2', {buyer:'buyer-two'})].map(value => {
    const card = element('', {class:'message-button unread', 'data-conversation-id':value.id});
    card.querySelector = selector => selector.includes('.sender') ? element(value.buyer)
      : selector.includes('.message-subject') ? element(value.title)
      : selector.includes('.card__latest-message') ? element(value.preview)
      : selector.includes('.card__time') ? element(value.date) : null;
    return card;
  });
  scroller.querySelectorAll = () => cards;
  const link = {href:'https://www.ebay.com/usr/' + owner};
  const header = {querySelector:()=>owner ? link : null};
  const doc = {body:{innerText:'Messages'}, createElement:()=>element(),
    querySelector:selector => selector.includes('#gh,') ? header : selector.includes('.skeleton') ? loading ? {} : null : selector.includes('messages-inbox') ? scroller : null,
    querySelectorAll:selector => selector.startsWith('button,') ? [menu] : selector.startsWith('[data-conversation-id]') ? cards : []};
  const context = {GLDN_EBAY_MESSAGES:core, document:doc, location:{href:core.INBOX_URL}, URL, Event:class{}};
  vm.runInNewContext(read('ebay-messages-reader.js'), context);
  return {page:context.GLDN_EBAY_MESSAGES_PAGE, cards, scroller};
}
test('modern unread-member rows use exact native IDs, subject, preview and count', () => {
  const snapshot = readerHarness().page('snapshot');
  assert.equal(snapshot.rows.length, 2);
  assert.equal(snapshot.rows[0].preview, 'Thank you');
  assert.equal(snapshot.expected, 2);
  assert.equal(snapshot.next, false);
});
test('modern infinite lists continue until the unread badge count is reconciled', () => {
  const h = readerHarness({count:250});
  assert.equal(h.page('snapshot').next, true);
  assert.equal(h.page('next').infinite, true);
  assert.equal(h.scroller.scrollTop, 1500);
});
test('reader excludes eBay system notifications', () => {
  const h = readerHarness();
  h.cards[0].querySelector = selector => selector.includes('.sender') ? {innerText:'eBay'} : null;
  assert.equal(h.page('snapshot').rows.length, 1);
});
test('reader stops for loading placeholders, missing identity and wrong account', () => {
  assert.throws(()=>readerHarness({loading:true}).page('snapshot'), /loading/);
  assert.throws(()=>readerHarness({owner:''}).page('snapshot'), /identified/);
  assert.throws(()=>readerHarness().page('open', {account:'different-store',row:row()}), /account changed/);
});
test('opening rejects changed previews before clicking the native conversation', () => {
  const h = readerHarness();
  assert.throws(()=>h.page('open', {account:'test-store',row:row('1',{preview:'New text'})}), /message changed/);
  assert.ok(!h.cards[0].clicked);
  h.page('open', {account:'test-store',row:row()});
  assert.ok(h.cards[0].clicked);
});

async function deskHarness(pages = [[row(), row('2')]]) {
  const elements = new Map(), tabs = new Map(), calls = [];
  const store = {[core.STORAGE_KEY]:{accounts:{},selectedAccount:'',scan:null}};
  let index=0;
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const el = {id,value:'',textContent:'',innerHTML:'',disabled:false,checked:false,dataset:{},listeners:{},
      classList:{toggle(){}},querySelectorAll:()=>[],setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}};
    elements.set(id,el); return el;
  }
  const chrome = {runtime:{getManifest:()=>({version:'3.12.49'})},
    storage:{local:{get:async()=>clone(store),set:async value=>Object.assign(store,clone(value))},onChanged:{addListener(){}}},
    tabs:{getCurrent:async()=>({id:90}),get:async id=>{if(!tabs.has(id))throw Error('Closed');return tabs.get(id);},
      create:async args=>{const tab={id:tabs.size+1,status:'complete',...args};tabs.set(tab.id,tab);calls.push(['tab',args]);return tab;},update:async()=>{},remove:async id=>tabs.delete(id)},
    scripting:{executeScript:async args=>{
      if(args.files)return [];
      const [action,data]=args.args;calls.push([action,data]);
      if(action==='prepare')return [{result:{ready:true}}];
      if(action==='unread')return [{result:{selected:true}}];
      if(action==='next'){index++;return [{result:{advanced:true}}];}
      if(action==='open'||action==='verify-open')return [{result:{opened:true}}];
      return [{result:{account:'test-store',rows:pages[index],allRows:pages[index],unknown:0,signature:'page-'+index,
        expected:null,next:index<pages.length-1,unreadOnly:true}}];
    }}};
  const context={chrome,GLDN_EBAY_MESSAGES:core,document:{getElementById:element,querySelectorAll:()=>[]},Date,Set,URL,setTimeout:fn=>setImmediate(fn)};
  await vm.runInNewContext(read('ebay-messages.js'),context);
  async function click(id,event={}){await element(id).listeners.click?.(event);for(let i=0;i<80;i++)await new Promise(setImmediate);}
  return {click,elements,calls,store};
}
test('desk scans multiple pages and shows the full pending count', async () => {
  const h=await deskHarness([[row()],[row('2')]]);await h.click('scan');
  assert.equal(h.elements.get('pendingCount').textContent,2);
  assert.equal(h.store[core.STORAGE_KEY].scan.phase,'complete');
  assert.equal(h.calls.filter(c=>c[0]==='next').length,1);
});
test('desk Ignore/Restore updates counts without eBay mutations', async () => {
  const h=await deskHarness();await h.click('scan');
  const target={closest:()=>({dataset:{command:'ignore',id:'1'}})};
  await h.click('rows',{target});assert.equal(h.elements.get('pendingCount').textContent,1);
  assert.equal(h.elements.get('ignoredCount').textContent,1);
  assert.equal(h.calls.filter(c=>c[0]==='open').length,0);
});
test('Open All skips ignored rows, verifies the exact conversation, and never sends', async () => {
  const h=await deskHarness();await h.click('scan');
  await h.click('rows',{target:{closest:()=>({dataset:{command:'ignore',id:'1'}})}});
  await h.click('openAll');
  assert.equal(h.calls.filter(c=>c[0]==='open').length,1);
  assert.equal(h.calls.find(c=>c[0]==='open')[1].row.id,'2');
  assert.equal(h.calls.filter(c=>c[0]==='verify-open').length,1);
  assert.equal(h.elements.get('pendingCount').textContent,0);
  assert.equal(h.elements.get('openedCount').textContent,1);
  assert.ok(!h.calls.some(c=>/send|delete|archive|mark/i.test(c[0])));
});
