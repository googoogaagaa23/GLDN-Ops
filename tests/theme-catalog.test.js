const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const catalogSource = fs.readFileSync(path.join(root, 'extension', 'theme-catalog.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(catalogSource, context);
const catalog = context.GLDN_THEME_CATALOG;

const currentLabels = [
  'Touch Grass (Again)', 'Sketch 2D', 'Killswitch', 'White Damascus', 'Tank Case',
  'Circuit Board', 'Damascus', 'Teardown', 'Area 51', 'Solitaire', 'Cosmic Orange',
  'Hydrodip', 'Darkplates 2.0', 'Leather', 'X-Ray', 'Robot City', 'Carnage', 'ICONS',
  'Palettes', 'Something', 'Manifesto', 'Verified', 'Switchdeck'
];

const retiredLabels = [
  'Touch Grass 2025', 'Glowbot', 'Aperture', 'Retro Darkplates', 'Case Hardened',
  'Arachnoplates', 'Keycaps', 'MKBHD Keycaps', 'The Verge', 'Clone of the Kingdom',
  'Inferno', 'DIY Kit', 'Masks', 'Linus Tech Tips', 'PewDiePie', '(not) Animal Crossing',
  'Doomsday Kit', 'Robot Camo', 'Boxing Day Cube', 'Robot'
];

function rgb(hex) {
  const value = String(hex).replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  return rgb(hex)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('catalog includes all current and retired limited-edition entries plus six GLDN themes', () => {
  assert.equal(catalog.themes.length, 49);
  assert.equal(new Set(catalog.ids).size, 49);
  assert.equal(catalog.activeEditionIds.length, 23);
  assert.equal(catalog.retiredEditionIds.length, 20);
  assert.deepEqual(
    Array.from(catalog.themes, (entry) => entry).filter((entry) => entry.group === 'Limited Editions').map((entry) => entry.label),
    currentLabels
  );
  assert.deepEqual(
    Array.from(catalog.themes, (entry) => entry).filter((entry) => entry.group === 'Retired Editions').map((entry) => entry.label),
    retiredLabels
  );
});

test('every theme provides complete tokens and readable text contrast', () => {
  for (const entry of catalog.themes) {
    for (const key of ['body', 'window', 'surface', 'raised', 'border', 'text', 'muted', 'accent', 'accentText', 'link', 'success', 'warning', 'danger', 'shadow', 'pattern']) {
      assert.ok(String(entry[key] || '').trim(), `${entry.id} is missing ${key}`);
    }
    for (const background of ['window', 'surface', 'raised']) {
      assert.ok(contrast(entry.text, entry[background]) >= 4.5, `${entry.id} text fails on ${background}`);
    }
    for (const background of ['window', 'surface']) {
      assert.ok(contrast(entry.muted, entry[background]) >= 4.5, `${entry.id} muted text fails on ${background}`);
    }
    assert.ok(contrast(entry.accentText, entry.accent) >= 4.5, `${entry.id} accent label fails contrast`);
    assert.ok(contrast(entry.link, entry.window) >= 4.5, `${entry.id} link fails contrast`);
  }
});

test('themes are CSS-only originals with no copied artwork payloads', () => {
  assert.equal(catalog.source, 'https://dbrand.com/shop/limited-edition');
  assert.doesNotMatch(catalogSource, /cdn\.db|data:image|\.png|\.jpe?g|\.webp/i);
});

test('theme application publishes RGB tokens for translucent modal surfaces', () => {
  const values = new Map();
  const element = {
    dataset: {},
    style: {
      setProperty(name, value) { values.set(name, value); }
    }
  };
  catalog.apply(element, 'dark');
  assert.equal(values.get('--gldn-color-scheme'), 'dark');
  assert.match(values.get('--gldn-theme-window-rgb'), /^\d+, \d+, \d+$/);
  assert.match(values.get('--gldn-theme-surface-rgb'), /^\d+, \d+, \d+$/);
  assert.match(values.get('--gldn-theme-raised-rgb'), /^\d+, \d+, \d+$/);
});

test('theme application does not leak generic dark mode settings into marketplace pages', () => {
  const values = new Map();
  const style = {
    colorScheme: '',
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) {
      values.delete(name);
      if (name === 'color-scheme') this.colorScheme = '';
    }
  };
  const element = { dataset: {}, style };
  const hostContext = vm.createContext({
    location: { protocol: 'https:' },
    document: { documentElement: element }
  });
  vm.runInContext(catalogSource, hostContext);

  hostContext.GLDN_THEME_CATALOG.apply(element, 'dark');

  assert.equal(element.dataset.gldnTheme, 'dark');
  assert.equal(element.dataset.gldnThemeReady, 'true');
  assert.equal(element.dataset.theme, undefined);
  assert.equal(style.colorScheme, '');
  assert.equal(values.get('--gldn-color-scheme'), 'dark');
  for (const variable of ['--bg', '--panel', '--panel2', '--line', '--ink', '--muted', '--gold', '--blue']) {
    assert.equal(values.has(variable), false, `${variable} leaked into the host page`);
  }
});

test('theme application keeps generic theme settings on GLDN extension pages', () => {
  const element = {
    dataset: {},
    style: {
      colorScheme: '',
      setProperty() {}
    }
  };
  const extensionContext = vm.createContext({
    location: { protocol: 'chrome-extension:' },
    document: { documentElement: element }
  });
  vm.runInContext(catalogSource, extensionContext);

  extensionContext.GLDN_THEME_CATALOG.apply(element, 'light');

  assert.equal(element.dataset.theme, 'light');
  assert.equal(element.style.colorScheme, 'light');
});

test('theme application removes generic settings left by an older GLDN content script', () => {
  const element = {
    dataset: { gldnTheme: 'dark', gldnThemeReady: 'true', theme: 'dark' },
    style: {
      colorScheme: 'dark',
      setProperty() {},
      removeProperty(name) {
        if (name === 'color-scheme') this.colorScheme = '';
      }
    }
  };
  const hostContext = vm.createContext({
    location: { protocol: 'https:' },
    document: { documentElement: element }
  });
  vm.runInContext(catalogSource, hostContext);

  hostContext.GLDN_THEME_CATALOG.apply(element, 'dark');

  assert.equal(element.dataset.theme, undefined);
  assert.equal(element.style.colorScheme, '');
});

test('every extension surface loads and uses the shared theme catalog', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  for (const entry of manifest.content_scripts) {
    assert.deepEqual(entry.js.slice(0, 4), ['config.example.js', 'theme-catalog.js', 'foundation.js', 'shared.js']);
  }
  const popup = fs.readFileSync(path.join(root, 'extension', 'popup.html'), 'utf8');
  const shared = fs.readFileSync(path.join(root, 'extension', 'shared.js'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'extension', 'guide.html'), 'utf8');
  const onboarding = fs.readFileSync(path.join(root, 'extension', 'onboarding.html'), 'utf8');
  assert.match(popup, /theme-catalog\.js/);
  assert.match(popup, /themes\.css/);
  assert.match(shared, /GLDN_THEME_CATALOG\?\.populateSelect/);
  assert.match(shared, /GLDN_THEME_CATALOG\?\.renderPreview/);
  assert.match(guide, /theme-page\.js/);
  assert.match(onboarding, /theme-catalog\.js/);
});
