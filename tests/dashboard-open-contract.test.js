const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
const ebay = fs.readFileSync(path.join(root, 'extension', 'ebay.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'extension', 'popup.js'), 'utf8');

assert.match(background, /async function openDashboardTab\(\)/);
assert.match(background, /const \{ url, key \} = await getDashboardConfig\(\)/);
assert.match(background, /dashboard\.searchParams\.set\('key', key\)/);
assert.match(background, /const opened = await openTab\(dashboard\.toString\(\)\)/);
assert.match(background, /message\.type === 'openDashboard'/);

assert.doesNotMatch(ebay, /function dashboardUrlWithKey/);
assert.match(ebay, /runtimeMessage\(\{ type: "openDashboard" \}\)/);
assert.match(popup, /chrome\.runtime\.sendMessage\(\{ type: 'openDashboard' \}\)/);

console.log('ok - dashboard open uses saved-profile background config');
