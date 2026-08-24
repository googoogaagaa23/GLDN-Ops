'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'product-hunter-extension');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('standalone manifest grants only the permissions the hunter needs', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'GLDN Product Hunter');
  assert.deepEqual(manifest.host_permissions, ['https://*.amazon.com/*', 'https://*.ebay.com/*']);
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('tabs'));
  assert.ok(!manifest.permissions.includes('debugger'));
  assert.ok(!manifest.permissions.includes('scripting'));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
  assert.ok(!manifest.host_permissions.some((host) => host === 'https://*/*' || host === 'http://*/*'));
  const ebayScript = manifest.content_scripts.find((script) => script.matches.includes('https://*.ebay.com/*'));
  assert.deepEqual(ebayScript.js, ['hunter-core.js', 'ebay-content.js']);
});

test('every file declared by the manifest exists', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const declared = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((script) => script.js)
  ];
  for (const file of declared) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
});

test('dashboard renders untrusted Amazon text without HTML injection', () => {
  const dashboard = read('dashboard.js');
  assert.doesNotMatch(dashboard, /\.innerHTML\s*=/);
  assert.match(dashboard, /textContent\s*=/);
  assert.match(dashboard, /noopener|noreferrer/);
});

test('background queue contains stop, pause, resume, recovery, and CAPTCHA gates', () => {
  const background = read('background.js');
  const content = read('amazon-content.js');
  assert.match(background, /hunterPause/);
  assert.match(background, /hunterResume/);
  assert.match(background, /hunterStop/);
  assert.match(background, /TICK_ALARM/);
  assert.match(background, /active:\s*false/);
  assert.match(content, /robot or CAPTCHA check/);
  assert.doesNotMatch(background, /chrome\.debugger/);
});

test('eBay listing guard is read-only, resumable, and required before protected hunts', () => {
  const background = read('background.js');
  const ebayContent = read('ebay-content.js');
  const dashboard = read('dashboard.html');
  assert.match(background, /hunterEbayScanStart/);
  assert.match(background, /hunterEbayScanResume/);
  assert.match(background, /hunterEbayScanStop/);
  assert.match(background, /Active Listings index/i);
  assert.match(background, /index\.verified/);
  assert.match(dashboard, /Scan Active Listings/);
  assert.match(dashboard, /exclude-listed/);
  assert.doesNotMatch(dashboard, /7 - Posh/);
  assert.match(ebayContent, /hunterExtractEbayActivePage/);
  assert.doesNotMatch(ebayContent, /\.click\s*\(/);
  assert.doesNotMatch(ebayContent, /\.value\s*=/);
});

test('policy data ships as a nonempty reviewed rule set', () => {
  const rules = JSON.parse(read('policy-rules.json'));
  assert.equal(rules.ruleCount, rules.rules.length);
  assert.ok(rules.rules.length >= 177);
  assert.ok(rules.rules.every((rule) => ['block', 'review'].includes(rule.action)));
  assert.ok(rules.rules.every((rule) => ['official-ebay', 'profile2-discord', 'profile2-telegram'].includes(rule.sourceType)));
  assert.equal(rules.rules.filter((rule) => rule.sourceType === 'official-ebay').length, 175);
  assert.equal(rules.rules.filter((rule) => rule.sourceType === 'profile2-discord').length, 2);
  assert.ok(rules.rules.filter((rule) => rule.sourceType !== 'official-ebay').every((rule) => rule.action === 'review'));
});
