const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'extension/shared.js'), 'utf8');
function fixture() {
  let finishReset, finishRegistration, notifyRegistered;
  const registered = new Promise(resolve => { notifyRegistered = resolve; });
  const messages = [], reviews = new Set();
  class Element {
    constructor() { this.dataset = {}; this.isConnected = true; }
    querySelector() { return { textContent: 'Review' }; }
    querySelectorAll() { return []; }
    matches() { return Boolean(this.dataset.gldnOpenReviewToken); }
  }
  const context = vm.createContext({ Element, Date, Math, normalizeText: x => x, location:{href:'https://example.invalid/'}, documentInstanceId:'fixture', pendingReviewReleases:new Set(),
    openReviewReset: new Promise(resolve => { finishReset = resolve; }),
    runtimeMessage: async (message) => {
      messages.push(message.type);
      if (message.type === 'registerOpenReview') { reviews.add(message.token); await new Promise(resolve => { finishRegistration = resolve; notifyRegistered(); }); }
      if (message.type === 'releaseOpenReview') reviews.delete(message.token);
      return {ok:true};
    }
  });
  vm.runInContext(source.slice(source.indexOf('const openReviewLifecycles ='), source.indexOf('const summarizeFeatureHealth =')) + '\nglobalThis.api = {registerOpenReview, releaseOpenReviewsInNode};', context);
  return { context, Element, messages, reviews, registered, reset:()=>finishReset(), finish:()=>finishRegistration(), api:context.api };
}
test('closing a review during initialization cancels its late registration', async () => {
  const f=fixture(), modal=new f.Element(); const pending=f.api.registerOpenReview(modal);
  modal.isConnected=false; f.api.releaseOpenReviewsInNode(modal); f.reset(); await pending;
  await Promise.all([...f.context.pendingReviewReleases]); assert.equal(f.reviews.size,0); assert.deepEqual(f.messages,[]);
});
test('closing after registration dispatch waits for response then releases exactly that review', async () => {
  const f=fixture(), modal=new f.Element(); const pending=f.api.registerOpenReview(modal);
  f.reset(); await f.registered;
  assert.equal(f.reviews.size,1); f.api.releaseOpenReviewsInNode(modal); f.finish(); await pending;
  await Promise.all([...f.context.pendingReviewReleases]); assert.equal(f.reviews.size,0); assert.deepEqual(f.messages,['registerOpenReview','releaseOpenReview']);
});
test('an unrelated open approval remains registered', async () => {
  const f=fixture(), modal=new f.Element(); const pending=f.api.registerOpenReview(modal);
  f.reset(); await f.registered; f.finish(); await pending; assert.equal(f.reviews.size,1);
});
test('a detached modal is never registered', async () => {
  const f=fixture(), modal=new f.Element(); modal.isConnected=false;
  const pending=f.api.registerOpenReview(modal); f.reset(); await pending; assert.equal(f.reviews.size,0);
});
const coreContext=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'extension/ops-health-core.js'),'utf8'), coreContext);
const core=coreContext.GLDN_OPS_HEALTH;
for (const [phase, expected] of [['starting','Starting'],['active-scan','Reading'],['review','Awaiting approval'],['syncing','Saving'],['paused','Paused'],['failed','Failed'],['completed','Completed'],['awaiting-submit-approval','Awaiting approval']]) {
  test(`health state ${phase} is ${expected}`,()=>assert.equal(core.stateName({phase,active:true}),expected));
}
test('health does not invent confirmed savings or expose saved order evidence',()=>{
  const rows=core.summarize({ebayMonthlyProfit:{active:true, phase:'capture', updatedAt:'2026-09-05T10:00:00Z', orders:[{private:'secret'}]}},Date.parse('2026-09-05T10:10:00Z'));
  assert.equal(rows[0].synced,null); assert.equal(rows[0].stale,true); assert.equal(rows[0].orders,undefined);
});
test('queued completion is never presented as saved',()=>{
  assert.equal(core.stateName({phase:'completed',syncDelivery:'queued'}),'Queued');
  assert.equal(core.stateName({phase:'completed',syncDelivery:'confirmed'}),'Saved');
  assert.equal(core.summarize({ebayMonthlyProfit:{phase:'completed',syncDelivery:'queued',syncedOrderNumbers:['1']}})[0].synced,null);
  assert.equal(core.summarize({ebayMonthlyProfit:{phase:'completed',syncDelivery:'confirmed',syncedOrderNumbers:['1']}})[0].synced,1);
});
test('pairing credentials are not exported in standard settings backups',()=>{
  const popup=fs.readFileSync(path.join(root,'extension/popup.js'),'utf8');
  const start=popup.indexOf('const SETTINGS_BACKUP_KEYS');
  assert.ok(start>=0);
  assert.doesNotMatch(popup.slice(start,popup.indexOf('];',start)),/gldnControlPairing|gldnPendingControlPair|gldnInstallationId/);
});
