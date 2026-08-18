param(
  [string]$DashboardScript = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $DashboardScript) {
  $DashboardScript = Join-Path $repoRoot "dashboard\GLDN_Ops_Dashboard_Code.gs"
}

if (-not (Test-Path $DashboardScript)) {
  throw "Dashboard script not found: $DashboardScript"
}

$node = "C:\Users\afarr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) { $node = "node" }

$runner = @'
const fs = require('fs');
const path = process.argv[1];
const vm = require('vm');

const source = fs.readFileSync(path, 'utf8');
if (!source.includes('function dashboardContractTest_')) {
  throw new Error('dashboardContractTest_ is missing.');
}

const sandbox = {
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  RegExp,
  parseFloat,
  parseInt,
  isFinite,
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      return {
        text,
        setMimeType() { return this; }
      };
    }
  },
  HtmlService: {
    createHtmlOutput(html) {
      return {
        html,
        setTitle() { return this; }
      };
    }
  },
  Utilities: {
    formatDate(date) {
      return date instanceof Date ? date.toISOString() : String(date || '');
    }
  },
  Session: {
    getScriptTimeZone() { return 'America/Chicago'; }
  }
};

vm.createContext(sandbox);
vm.runInContext(source + '\n;globalThis.__dashboardContractResult = dashboardContractTest_();', sandbox, {
  filename: path,
  timeout: 5000
});

const result = sandbox.__dashboardContractResult;
if (!result || !Array.isArray(result.checkedActions) || result.checkedActions.length < 6) {
  throw new Error('Dashboard contract returned an incomplete result.');
}

console.log(JSON.stringify({ ok: true, script: path, result }, null, 2));
'@

& $node -e $runner $DashboardScript
if ($LASTEXITCODE -ne 0) {
  throw "Dashboard contract test failed."
}
