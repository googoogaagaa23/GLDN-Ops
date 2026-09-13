const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const code = source.slice(source.indexOf('async function inspectEbayVariationScanPage'), source.indexOf('async function waitForEbayVariationScanPage'));

async function inspect(text, offset, allowEnd, pathname = '/sh/lst/active') {
  const context = vm.createContext({ chrome: { scripting: { executeScript: async ({ func, args }) => [{
    result: vm.runInNewContext(`(${func.toString()})(...args)`, {
      args, document: { body: { innerText: text }, querySelectorAll: () => [] },
      location: { pathname, href: `https://www.ebay.com${pathname}` }
    })
  }] } } });
  vm.runInContext(code, context);
  return context.inspectEbayVariationScanPage(1, offset, allowEnd);
}

test('end-of-list tolerance is opt-in and requires explicit active-listings evidence', async () => {
  const empty = "Results: 0 We didn't find any results.";
  assert.equal((await inspect(empty, 0, true)).ok, true);
  assert.equal((await inspect('Results: 1-199 of 199', 200, true)).endOfList, true);
  for (const [text, offset, allowEnd, page] of [
    [empty, 0, false, '/sh/lst/active'],
    [empty, 0, true, '/sh/ord'],
    [empty, 0, true, '/sh/lst/active-other'],
    ['Results: 0', 0, true, '/sh/lst/active'],
    ["Results: 0 No results. Verify you are human captcha", 0, true, '/sh/lst/active'],
    ['Results: 1-199 of 199', 0, true, '/sh/lst/active'],
    ['Results: 1-199 of 199 Results: 1-400 of 400', 200, true, '/sh/lst/active']
  ]) assert.equal((await inspect(text, offset, allowEnd, page)).ok, false, text);
});
