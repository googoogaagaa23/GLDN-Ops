const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('extension/manifest.json'));
const catalog = JSON.parse(read('docs/GUIDE_CATALOG.json'));
const builder = require(path.join(root, 'tools', 'build-feature-guides.cjs'));

test('onboarding is generated from every canonical guide feature and remains skippable', () => {
  const html = builder.renderOnboardingHtml(catalog);
  const script = read('extension/onboarding.js');
  assert.match(html, /gldn-onboarding-data/);
  assert.match(html, /Skip for now/);
  assert.match(html, /Open full guide/);
  for (const feature of catalog.features) assert.match(html, new RegExp(feature.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(script, /status === 'active'/);
  assert.match(script, /renderCompletion\('skipped'\)/);
  assert.match(script, /renderCompletion\('completed'\)/);
});

test('safe universal panel runs on ordinary webpages and excludes marketplace duplicates', () => {
  const universal = manifest.content_scripts.find((entry) => entry.js.includes('universal.js'));
  assert.ok(universal);
  assert.deepEqual(universal.matches, ['http://*/*', 'https://*/*']);
  for (const pattern of [
    'https://*.ebay.com/*',
    'https://*.amazon.com/*',
    'https://*.walmart.com/*',
    'https://*.poshmark.com/*',
    'https://ecomsniper.io/*'
  ]) assert.ok(universal.exclude_matches.includes(pattern));
  const source = read('extension/universal.js');
  assert.match(source, /Marketplace actions appear only on supported sites/);
  assert.doesNotMatch(source, /mark-shipped|confirm-listings|move99|capture-order-profit/i);
});

test('panel and review windows expose persisted appearance controls', () => {
  const shared = read('extension/shared.js');
  const styles = read('extension/styles.css');
  const popup = read('extension/popup.html');
  assert.match(shared, /GLDN_THEME_CATALOG\?\.populateSelect/);
  assert.match(shared, /GLDN_THEME_CATALOG\?\.renderPreview/);
  assert.match(popup, /<select id="uiTheme"><\/select>/);
  assert.match(popup, /id="uiThemePreview"/);
  assert.match(popup, /theme-catalog\.js/);
  assert.match(popup, /themes\.css/);
  assert.match(shared, /data-gldn-modal-opacity/);
  assert.match(shared, /gldnModalOpacities/);
  assert.match(shared, /gldnModalPositions/);
  assert.match(shared, /gldn-modal-drag-handle/);
  assert.match(shared, /ResizeObserver/);
  assert.match(styles, /resize:\s*both/);
  assert.match(styles, /--gldn-modal-surface-alpha/);
  assert.match(styles, /gldn-order-panel::\-webkit-scrollbar/);
  assert.match(popup, /Start Feature Tour/);
});

test('first install opens the tour while updates leave the user alone', () => {
  const background = read('extension/background.js');
  assert.match(background, /details\?\.reason === 'install'/);
  assert.match(background, /gldnOnboardingState/);
  assert.match(background, /onboarding\.html/);
});
