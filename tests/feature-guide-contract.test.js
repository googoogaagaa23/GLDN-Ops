const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'GUIDE_CATALOG.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));
const markdown = fs.readFileSync(path.join(ROOT, 'docs', 'FEATURE_GUIDE.md'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'extension', 'guide.html'), 'utf8');
const onboarding = fs.readFileSync(path.join(ROOT, 'extension', 'onboarding.html'), 'utf8');
const onboardingJs = fs.readFileSync(path.join(ROOT, 'extension', 'onboarding.js'), 'utf8');
const builder = require(path.join(ROOT, 'tools', 'build-feature-guides.cjs'));

test('canonical guide version matches the extension manifest', () => {
  assert.equal(catalog.version, manifest.version);
});

test('every guide entry has complete safety and proof fields', () => {
  builder.validateCatalog(catalog);
  assert.ok(catalog.features.length >= 20);
  assert.equal(new Set(catalog.features.map((feature) => feature.id)).size, catalog.features.length);
  for (const feature of catalog.features) {
    assert.ok(feature.prerequisites.length);
    assert.ok(feature.steps.length);
    assert.ok(feature.recovery.length);
    assert.ok(feature.approvalStop.length >= 20);
    assert.ok(feature.output.length >= 20);
    assert.ok(feature.evidence.length >= 20);
  }
});

test('generated GitHub and extension guides exactly match the catalog', () => {
  assert.equal(markdown, builder.renderMarkdown(catalog));
  assert.equal(html, builder.renderHtml(catalog));
  assert.equal(onboarding, builder.renderOnboardingHtml(catalog));
  for (const feature of catalog.features) {
    assert.match(markdown, new RegExp(`id="${feature.id}"`));
    assert.match(html, new RegExp(`id="${feature.id}"`));
    assert.ok(markdown.includes(`**Evidence status:** ${feature.status}`));
    assert.ok(html.includes(feature.status));
  }
});

test('first-use onboarding teaches every canonical feature and remains skippable', () => {
  const embedded = JSON.parse(onboarding.match(/<script id="gldn-onboarding-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(embedded.version, catalog.version);
  assert.equal(embedded.features.length, catalog.features.length);
  assert.deepEqual(embedded.features.map((feature) => feature.id), catalog.features.map((feature) => feature.id));
  assert.match(onboarding, /id="tourSkip"/);
  assert.match(onboarding, /id="tourGuide"/);
  assert.match(onboardingJs, /const saveState = \(status\)/);
  assert.match(onboardingJs, /renderCompletion\('skipped'\)/);
  assert.match(onboardingJs, /renderCompletion\('completed'\)/);
});

test('irreversible workflows contain explicit approval stops', () => {
  const byId = Object.fromEntries(catalog.features.map((feature) => [feature.id, feature]));
  for (const id of ['mark-shipped', 'ebay-note-profit', 'move99', 'reverse99', 'move99-recovery', 'ecomsniper-handoffs', 'listing-preflight', 'walmart']) {
    assert.match(byId[id].approvalStop, /STOP|approval|never/i);
  }
  assert.match(byId['sniping'].approvalStop, /read-only/i);
  assert.match(byId['move99'].approvalStop, /every eBay Submit/i);
});

test('guides do not claim Web Store or local-helper deployment', () => {
  const combined = `${markdown}\n${html}`;
  assert.doesNotMatch(combined, /Chrome Web Store|Reload Local Files|start tools\\local-click-helper/i);
  assert.match(combined, /No Windows local helper is required/);
  assert.match(combined, /EcomSniper private-page progress remains unreadable|private EcomSniper tab never proves processing completion/i);
});
