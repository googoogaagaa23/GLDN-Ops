const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const ebay = fs.readFileSync(path.join(root, 'extension/ebay.js'), 'utf8');
const shared = fs.readFileSync(path.join(root, 'extension/shared.js'), 'utf8');
const foundation = fs.readFileSync(path.join(root, 'extension/foundation.js'), 'utf8');

function launchFixture({ existingReview = false } = {}) {
  const callbacks = new Map();
  const statuses = [];
  const reviews = new Set(existingReview ? ['real-approval'] : []);
  const stored = { computerLabel: '0', ebayAccountLabel: 'FAK12' };
  let scanStarts = 0;
  let gate;
  const node = () => ({
    dataset: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} },
    addEventListener() {}, querySelector: () => node(), prepend() {},
    closest: () => null
  });
  const modal = node();
  modal.querySelector = (selector) => selector === 'h2' ? null : node();
  const document = {
    getElementById: () => null,
    documentElement: { dataset: {}, appendChild() {} },
    createElement() {
      const element = node();
      // Only the gate's actual HTML controls whether it is registered as a review.
      Object.defineProperty(element, 'innerHTML', { set(html) {
        if (!html.includes('data-sale-event-status')) return;
        gate = element;
        if (/data-gldn-workflow-launcher="true"/.test(html)) modal.dataset.gldnWorkflowLauncher = 'true';
        element.querySelector = (selector) => selector === '.gldn-modal' ? modal : {
          addEventListener: (_, handler) => callbacks.set('close', handler)
        };
        element.querySelectorAll = () => ['on', 'off'].map((value) => ({
          dataset: { saleEventStatus: value },
          addEventListener: (_, handler) => callbacks.set(value, handler)
        }));
      } });
      // Hold removal cleanup until after the launch to reproduce the asynchronous
      // review-release race instead of assuming removal unlocks storage immediately.
      element.remove = () => { element.removed = true; };
      return element;
    }
  };
  const context = vm.createContext({
    document, window: { innerWidth: 1200, innerHeight: 900 }, console,
    modalStorageKey: () => 'sale-event',
    registerOpenReview: () => reviews.add('sale-event-prompt'),
    storageGet: async () => stored,
    storageSet: async (values) => Object.assign(stored, values),
    normalizedIdentity: () => ({ ebayAccountLabel: 'FAK12' }),
    applyMove99AccountConfig: async () => ({
      account: 'FAK12', sourceCategories: ['Not .99', 'Other'],
      destinationCategory: 'Abra Cadabra .99', sourceStoreCategoryIds: ['123'], backburnerItemIds: []
    }),
    runtimeMessage: async () => ({ ok: true, tabId: 42 }),
    renderStatus: (message, type) => statuses.push({ message, type }),
    runMove99Automation: async () => { scanStarts += 1; },
    MOVE99_SCAN_STRATEGY: 'active-page-exact-id-v1',
    move99StartPending: false,
    U: {
      makePanelDraggable() {},
      claimWorkflowStart: async () => {
        if (reviews.size) throw new Error('Starting Move .99 is blocked while approval/review open');
        return 'reservation';
      },
      releaseWorkflowStart: async () => {}
    }
  });
  vm.runInContext(foundation + '\nconst FOUNDATION = GLDN_FOUNDATION;', context);
  vm.runInContext(shared.slice(shared.indexOf('const enhanceModal ='), shared.indexOf('const initializeModalEnhancements =')) + '\nU.enhanceModal = enhanceModal;', context);
  vm.runInContext(ebay.slice(ebay.indexOf('function requestReverseMove99SaleEventStatus()'), ebay.indexOf('async function startListingLimitCheck()')), context);
  return {
    start: () => context.startMove99Listings('non99'),
    choose: (decision) => callbacks.get(decision)(),
    statuses, stored, reviews,
    get scanStarts() { return scanStarts; },
    get gate() { return gate; }
  };
}

test('Sale Event OFF starts the reverse scan without racing its own review lock', async () => {
  const fixture = launchFixture();
  const launched = fixture.start();
  fixture.choose('off');
  await launched;
  assert.equal(fixture.gate.removed, true);
  assert.equal(fixture.scanStarts, 1, JSON.stringify(fixture.statuses));
  assert.equal(fixture.reviews.size, 0);
  assert.equal(fixture.stored.pendingMove99Run.phase, 'active-prepare');
  assert.equal(fixture.stored.pendingMove99Run.saleEventStatus, 'off');
  assert.equal(fixture.stored.pendingMove99Run.ownerTabId, 42);
  assert.deepEqual(Array.from(fixture.stored.pendingMove99Run.sourceCategories), ['Abra Cadabra .99']);
  assert.equal(fixture.stored.pendingMove99Run.destinationCategory, 'Not .99');
  assert.equal(fixture.stored.pendingMove99Run.autoApply, undefined);
});

for (const decision of ['on', 'close']) {
  test(`Sale event ${decision} does not create a scan or stale review`, async () => {
    const fixture = launchFixture();
    const launched = fixture.start();
    fixture.choose(decision);
    await launched;
    assert.equal(fixture.scanStarts, 0);
    assert.equal(fixture.stored.pendingMove99Run, undefined);
    assert.equal(fixture.reviews.size, 0);
  });
}

test('Sale Event OFF never bypasses an unrelated real approval review', async () => {
  const fixture = launchFixture({ existingReview: true });
  const launched = fixture.start();
  fixture.choose('off');
  await launched;
  assert.equal(fixture.scanStarts, 0);
  assert.equal(fixture.stored.pendingMove99Run, undefined);
  assert.ok(fixture.reviews.has('real-approval'));
  assert.match(fixture.statuses.at(-1).message, /blocked/);
});

test('repeated clicks while the sale prompt is open do not replace or orphan the start', async () => {
  const fixture = launchFixture();
  const launched = fixture.start();
  const originalGate = fixture.gate;
  await fixture.start();
  assert.equal(fixture.gate, originalGate);
  fixture.choose('off');
  await launched;
  assert.equal(fixture.scanStarts, 1);
});

test('closing the sale prompt releases the in-flight start for a new attempt', async () => {
  const fixture = launchFixture();
  const canceled = fixture.start();
  fixture.choose('close');
  await canceled;
  const retry = fixture.start();
  fixture.choose('off');
  await retry;
  assert.equal(fixture.scanStarts, 1);
});
