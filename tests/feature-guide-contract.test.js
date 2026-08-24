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
const popup = fs.readFileSync(path.join(ROOT, 'extension', 'popup.html'), 'utf8');
const guideData = fs.readFileSync(path.join(ROOT, 'extension', 'workflow-guide-data.js'), 'utf8');
const workflowGuideJs = fs.readFileSync(path.join(ROOT, 'extension', 'workflow-guide.js'), 'utf8');
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
  assert.equal(guideData, builder.renderGuideData(catalog));
  for (const feature of catalog.features) {
    assert.match(markdown, new RegExp(`id="${feature.id}"`));
    assert.match(html, new RegExp(`id="${feature.id}"`));
    assert.ok(markdown.includes(`**Evidence status:** ${feature.status}`));
    assert.ok(html.includes(feature.status));
  }
});

test('popup exposes a searchable guide directory and every contextual guide target exists', () => {
  const catalogIds = new Set(catalog.features.map((feature) => feature.id));
  const guideTargets = [...popup.matchAll(/data-guide-id="([^"]+)"/g)].map((match) => match[1]);
  assert.match(popup, /data-popup-tab="guides"/);
  assert.match(popup, /data-gldn-guide-directory/);
  assert.match(popup, /workflow-guide-data\.js/);
  assert.match(popup, /workflow-guide\.js/);
  assert.ok(guideTargets.length >= 20);
  for (const id of guideTargets) assert.ok(catalogIds.has(id), `Popup guide target ${id} is missing from the catalog.`);
  assert.match(workflowGuideJs, /Search workflows/);
  assert.match(workflowGuideJs, /Approval stop/);
  assert.match(workflowGuideJs, /Expected result/);
  assert.match(workflowGuideJs, /If something goes wrong/);
});

test('dedicated workflow pages include their exact collapsible guide', () => {
  const pages = {
    'ebay-profit.html': 'ebay-monthly-profit',
    'order-audit.html': 'order-placement-audit',
    'policy-listing-audit.html': 'existing-listings-policy-audit',
    'variation-audit.html': 'ebay-variations',
    'listing-preflight.html': 'listing-preflight',
    'sniping-review.html': 'sniping'
  };
  for (const [file, guideId] of Object.entries(pages)) {
    const page = fs.readFileSync(path.join(ROOT, 'extension', file), 'utf8');
    assert.match(page, new RegExp(`data-gldn-inline-guide="${guideId}"`));
    assert.match(page, /workflow-guide-data\.js/);
    assert.match(page, /workflow-guide\.js/);
    assert.match(page, /workflow-guide\.css/);
  }
  const move99Start = fs.readFileSync(path.join(ROOT, 'extension', 'start-move99.html'), 'utf8');
  const move99StartJs = fs.readFileSync(path.join(ROOT, 'extension', 'start-move99.js'), 'utf8');
  assert.match(move99Start, /id="move99WorkflowGuide"/);
  assert.match(move99StartJs, /scanMode === 'non99' \? 'reverse99' : 'move99'/);
});

test('guide deep links open and focus the requested workflow', () => {
  assert.match(html, /workflow-guide-data\.js/);
  assert.match(html, /workflow-guide\.js/);
  assert.match(workflowGuideJs, /target\.open = true/);
  assert.match(workflowGuideJs, /scrollIntoView/);
  assert.match(workflowGuideJs, /guide-target/);
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
