const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const catalogSource = fs.readFileSync(path.join(root, 'extension', 'theme-catalog.js'), 'utf8');

function createElement(initial = {}) {
  const values = new Map(Object.entries(initial.variables || {}));
  const style = {
    colorScheme: initial.colorScheme || '',
    setProperty(name, value) { values.set(name, value); },
    getPropertyValue(name) { return values.get(name) || ''; },
    removeProperty(name) {
      values.delete(name);
      if (name === 'color-scheme') this.colorScheme = '';
    }
  };
  return { element: { dataset: { ...(initial.dataset || {}) }, style }, style, values };
}

function loadCatalog(protocol, element) {
  const context = vm.createContext({ location: { protocol }, document: { documentElement: element } });
  vm.runInContext(catalogSource, context);
  return context.GLDN_THEME_CATALOG;
}

test('marketplace pages receive only namespaced GLDN theme settings', () => {
  const { element, style, values } = createElement();
  loadCatalog('https:', element).apply(element, 'dark');

  assert.equal(element.dataset.gldnTheme, 'dark');
  assert.equal(element.dataset.gldnThemeReady, 'true');
  assert.equal(element.dataset.theme, undefined);
  assert.equal(style.colorScheme, '');
  assert.equal(values.get('--gldn-color-scheme'), 'dark');
  for (const variable of ['--bg', '--panel', '--panel2', '--line', '--ink', '--muted', '--gold', '--blue']) {
    assert.equal(values.has(variable), false, `${variable} leaked into the host page`);
  }
});

test('GLDN extension pages retain generic aliases used by their own documents', () => {
  const { element, style, values } = createElement();
  loadCatalog('chrome-extension:', element).apply(element, 'light');

  assert.equal(element.dataset.theme, 'light');
  assert.equal(style.colorScheme, 'light');
  assert.equal(values.get('--bg'), '#f8fafc');
});

test('upgraded content scripts clean theme settings left by older GLDN versions', () => {
  const { element, style, values } = createElement({
    dataset: { gldnTheme: 'dark', gldnThemeReady: 'true', theme: 'dark' },
    colorScheme: 'dark',
    variables: {
      '--bg': '#0f172a',
      '--panel': '#1e293b',
      '--panel2': '#27364b'
    }
  });
  loadCatalog('https:', element).apply(element, 'dark');

  assert.equal(element.dataset.theme, undefined);
  assert.equal(style.colorScheme, '');
  assert.equal(values.has('--bg'), false);
  assert.equal(values.has('--panel'), false);
  assert.equal(values.has('--panel2'), false);
});
