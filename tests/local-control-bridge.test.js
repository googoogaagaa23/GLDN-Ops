const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const background = fs.readFileSync('extension/background.js', 'utf8');
const shared = fs.readFileSync('extension/shared.js', 'utf8');
const ebay = fs.readFileSync('extension/ebay.js', 'utf8');
const poshmark = fs.readFileSync('extension/poshmark.js', 'utf8');
const amazon = fs.readFileSync('extension/amazon.js', 'utf8');
const agent = fs.readFileSync('tools/gldn-update-agent.ps1', 'utf8');
const installer = fs.readFileSync('tools/install-update-agent.ps1', 'utf8');
const controller = fs.readFileSync('tools/gldn-control.ps1', 'utf8');

function blockBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `Missing start marker: ${start}`);
  assert.ok(to > from, `Missing end marker: ${end}`);
  return source.slice(from, to);
}

test('local control is loopback-only, token protected, and locked to Profile 2', () => {
  assert.match(agent, /TcpListener\]\:\:new\(\[System\.Net\.IPAddress\]\:\:Loopback/);
  assert.match(agent, /X-GLDN-Control|x-gldn-control/i);
  assert.match(agent, /Assert-AgentProfile2Target/);
  assert.match(agent, /-cne "Profile 2"/);
  assert.match(installer, /controlToken/);
  assert.match(controller, /Chrome\\User Data\\Profile 2/);
  assert.match(controller, /exactly one unpacked GLDN Ops instance/);
});

test('operator commands and extension polling use separate authenticated routes', () => {
  assert.match(agent, /POST \/v1\/control\/commands/);
  assert.match(agent, /GET \/v1\/control\/next/);
  assert.match(agent, /POST \/v1\/control\/results/);
  assert.match(agent, /GET \/v1\/control\/results/);
  assert.match(background, /LOCAL_CONTROL_ALARM/);
  assert.match(background, /updaterRequest\('\/control\/next'/);
  assert.match(background, /updaterRequest\('\/control\/results'/);
});

test('control execution is a named allowlist without arbitrary script or marketplace finalization', () => {
  const agentPayload = blockBetween(agent, 'function ConvertTo-AgentControlPayload', 'function Clear-AgentControlHistory');
  const backgroundExecution = blockBetween(background, 'async function executeLocalControlCommand', 'async function pollLocalControl');
  assert.doesNotMatch(agentPayload, /submit|place-order|finalize|confirm-save|apply-changes/i);
  assert.doesNotMatch(backgroundExecution, /executeScript|eval\(|Function\(/);
  assert.match(agentPayload, /safe review-only allowlist/);
  assert.match(backgroundExecution, /case 'inspect-session'/);
  assert.match(backgroundExecution, /case 'page-action'/);
  assert.match(agentPayload, /"reset-state"/);
  assert.match(backgroundExecution, /case 'reset-state': return resetAutomationState/);
  assert.match(controller, /"ResetState"/);
  assert.match(agentPayload, /"reload-extension"/);
  assert.match(backgroundExecution, /case 'reload-extension': return reloadLocalControlExtension/);
  assert.match(controller, /"ReloadExtension"/);
  assert.match(background, /setTimeout\(\(\) => chrome\.runtime\.reload\(\), 1500\)/);
});

test('marketplace page actions route only to existing review-gated feature entry points', () => {
  assert.match(ebay, /type !== "runEbayPageAction"/);
  assert.match(poshmark, /type === "runPoshmarkPageAction"/);
  assert.match(amazon, /type === "runAmazonPageAction"/);
  assert.match(background, /prepare-order-note/);
  assert.match(background, /'show-panel'/);
  assert.match(ebay, /"show-panel": \(\) => null/);
  assert.match(background, /posh-stats/);
  assert.match(background, /review-copy/);
  assert.match(shared, /type === 'inspectGldnPageState'/);
  assert.match(shared, /visibleMarketplaceDialogs/);
  assert.match(shared, /hostAppearance/);
  assert.match(shared, /gldnThemeLeak/);
  assert.match(shared, /legacyThemeSettings/);
  assert.match(shared, /leakedAliases/);
  assert.match(shared, /genericTheme === gldnTheme/);
  assert.match(shared, /appearance: appearance\(panel\)/);
});

test('local controller refuses a different loaded folder and waits for an auditable result', () => {
  assert.match(controller, /Profile 2 is loading a different GLDN Ops folder/);
  assert.match(controller, /commandId=/);
  assert.match(controller, /if \(\$result\.commandOk -ne \$true\)/);
  assert.doesNotMatch(controller, /--profile-directory|Start-Process[^\n]+chrome/i);
});
