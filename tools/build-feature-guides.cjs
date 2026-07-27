const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'docs', 'GUIDE_CATALOG.json');
const MARKDOWN_PATH = path.join(ROOT, 'docs', 'FEATURE_GUIDE.md');
const HTML_PATH = path.join(ROOT, 'extension', 'guide.html');
const ONBOARDING_PATH = path.join(ROOT, 'extension', 'onboarding.html');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugStatus(status) {
  if (status.startsWith('LIVE PASS')) return 'live';
  if (status === 'PENDING USER REVIEW') return 'pending';
  if (status === 'PARTIAL') return 'partial';
  return 'unproven';
}

function markdownList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function renderMarkdown(catalog) {
  const toc = catalog.features.map((feature) => `- [${feature.title}](#${feature.id}) - **${feature.status}**`).join('\n');
  const sections = catalog.features.map((feature) => `
<a id="${feature.id}"></a>
## ${feature.title}

**Matrix:** ${feature.matrix}

**Evidence status:** ${feature.status}

**Purpose:** ${feature.summary}

### Prerequisites

${feature.prerequisites.map((item) => `- ${item}`).join('\n')}

### Exact Steps

${markdownList(feature.steps)}

### Approval Stop

${feature.approvalStop}

### Expected Output

${feature.output}

### Failure Recovery

${feature.recovery.map((item) => `- ${item}`).join('\n')}

### Evidence

${feature.evidence}
`).join('\n');

  const definitions = Object.entries(catalog.statusDefinitions)
    .map(([status, meaning]) => `- **${status}:** ${meaning}`)
    .join('\n');

  return `# GLDN Ops Feature Guide

Generated from \`docs/GUIDE_CATALOG.json\` for GLDN Ops v${catalog.version}. Do not edit the generated Markdown or extension HTML directly.

GLDN Ops assists marketplace workflows. It does not replace eBay, Amazon, Poshmark, Walmart, EcomSniper, or the shared Tasks sheet.

> **Safety rule:** ${catalog.safetyRule}

## Evidence Labels

${definitions}

## Feature Index

${toc}
${sections}
`.trimEnd() + '\n';
}

function htmlList(items, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`;
}

function renderHtml(catalog) {
  const statusLegend = Object.entries(catalog.statusDefinitions)
    .map(([status, meaning]) => `<div class="legend-row"><span class="status ${slugStatus(status)}">${escapeHtml(status)}</span><span>${escapeHtml(meaning)}</span></div>`)
    .join('');
  const index = catalog.features
    .map((feature) => `<a href="#${escapeHtml(feature.id)}"><span>${escapeHtml(feature.title)}</span><span class="status ${slugStatus(feature.status)}">${escapeHtml(feature.status)}</span></a>`)
    .join('');
  const features = catalog.features.map((feature, indexNumber) => `
    <details class="feature" id="${escapeHtml(feature.id)}" ${indexNumber === 0 ? 'open' : ''}>
      <summary><span>${escapeHtml(feature.title)}</span><span class="status ${slugStatus(feature.status)}">${escapeHtml(feature.status)}</span></summary>
      <div class="feature-body">
        <p class="matrix">${escapeHtml(feature.matrix)}</p>
        <p class="purpose">${escapeHtml(feature.summary)}</p>
        <div class="guide-grid">
          <section><h3>Prerequisites</h3>${htmlList(feature.prerequisites)}</section>
          <section class="steps"><h3>Exact steps</h3>${htmlList(feature.steps, true)}</section>
          <section class="approval"><h3>Approval stop</h3><p>${escapeHtml(feature.approvalStop)}</p></section>
          <section><h3>Expected output</h3><p>${escapeHtml(feature.output)}</p></section>
          <section><h3>Failure recovery</h3>${htmlList(feature.recovery)}</section>
          <section class="evidence"><h3>Evidence</h3><p>${escapeHtml(feature.evidence)}</p></section>
        </div>
      </div>
    </details>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GLDN Ops Feature Guide</title>
  <link rel="stylesheet" href="themes.css">
  <style>
    * { box-sizing:border-box; }
    :root { color-scheme:dark; --bg:#101113; --panel:#1b1d21; --panel2:#24272d; --line:#3f434c; --ink:#f7f7f5; --muted:#b9bec8; --gold:#d7b354; --blue:#2f6feb; --green:#15803d; --amber:#b45309; --red:#b91c1c; }
    body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 Arial,Helvetica,sans-serif; }
    main { width:min(1080px,100%); margin:0 auto; padding:24px 18px 64px; }
    header { display:flex; align-items:center; gap:14px; padding:8px 0 18px; }
    header img { width:48px; height:48px; }
    h1 { margin:0; font-size:28px; letter-spacing:0; }
    h2 { margin:26px 0 10px; font-size:18px; letter-spacing:0; }
    h3 { margin:0 0 7px; font-size:13px; color:#f1d991; letter-spacing:0; text-transform:uppercase; }
    p { margin:6px 0; }
    .subtitle,.matrix { color:var(--muted); }
    .safety { border:1px solid var(--red); background:#321719; padding:13px 15px; border-radius:8px; }
    .legend { display:grid; gap:8px; }
    .legend-row { display:grid; grid-template-columns:minmax(190px,auto) 1fr; gap:12px; align-items:center; padding:9px 10px; border:1px solid var(--line); border-radius:7px; background:var(--panel); }
    .index { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .index a { display:flex; justify-content:space-between; gap:10px; align-items:center; min-height:48px; padding:9px 11px; color:var(--ink); text-decoration:none; border:1px solid var(--line); border-radius:7px; background:var(--panel); }
    .index a:hover { border-color:var(--gold); }
    .status { display:inline-flex; align-items:center; justify-content:center; min-height:25px; padding:4px 7px; border-radius:5px; color:#fff; font-size:11px; font-weight:700; text-align:center; }
    .status.live { background:var(--green); }
    .status.pending { background:var(--amber); }
    .status.partial { background:#475569; }
    .status.unproven { background:var(--red); }
    .feature { margin:10px 0; border:1px solid var(--line); border-radius:8px; background:var(--panel); overflow:hidden; scroll-margin-top:12px; }
    .feature summary { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:58px; padding:12px 14px; cursor:pointer; font-size:17px; font-weight:700; }
    .feature summary:hover { background:var(--panel2); }
    .feature-body { padding:0 14px 16px; border-top:1px solid var(--line); }
    .purpose { font-size:16px; font-weight:700; }
    .guide-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
    .guide-grid section { padding:12px; border:1px solid var(--line); border-radius:7px; background:var(--panel2); }
    .guide-grid .steps { grid-column:1 / -1; }
    .guide-grid .approval { border-color:#ef4444; background:#321719; }
    .guide-grid .evidence { border-color:#3b82f6; background:#15243c; }
    ol,ul { margin:4px 0 0; padding-left:21px; }
    li { margin:5px 0; color:#e1e4e8; }
    @media (max-width:700px) { .index,.guide-grid { grid-template-columns:1fr; } .guide-grid .steps { grid-column:auto; } .legend-row { grid-template-columns:1fr; } .feature summary { align-items:flex-start; flex-direction:column; } }
  </style>
</head>
<body class="gldn-guide-page">
<main>
  <header><img src="icons/icon48.png" alt=""><div><h1>GLDN Ops Feature Guide</h1><p class="subtitle">v${escapeHtml(catalog.version)} | Exact steps, safety stops, recovery, and proof status</p></div></header>
  <div class="safety"><strong>Safety rule:</strong> ${escapeHtml(catalog.safetyRule)}</div>
  <h2>Evidence labels</h2>
  <div class="legend">${statusLegend}</div>
  <h2>Feature index</h2>
  <nav class="index" aria-label="Feature guide index">${index}</nav>
  <h2>Step-by-step guides</h2>
${features}
</main>
<script src="theme-catalog.js"></script>
<script src="theme-page.js"></script>
</body>
</html>`;
}

function renderOnboardingHtml(catalog) {
  const data = JSON.stringify({
    version: catalog.version,
    features: catalog.features
  }).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welcome to GLDN Ops</title>
  <link rel="stylesheet" href="themes.css">
  <style>
    * { box-sizing:border-box; }
    :root { color-scheme:dark; --bg:#090b0f; --panel:#14171d; --panel2:#1e232c; --line:#343b47; --ink:#f8fafc; --muted:#a8b0bd; --gold:#d7b354; --blue:#2563eb; --red:#dc2626; }
    body { margin:0; min-height:100vh; background:var(--bg); color:var(--ink); font:15px/1.5 Arial,Helvetica,sans-serif; }
    .shell { min-height:100vh; display:grid; grid-template-rows:auto 1fr auto; }
    header { display:flex; align-items:center; gap:13px; padding:16px 22px; border-bottom:1px solid var(--line); background:#0d1015; }
    header img { width:44px; height:44px; }
    h1 { margin:0; font-size:22px; letter-spacing:0; }
    .subtitle,.muted { color:var(--muted); }
    .progress-wrap { margin-left:auto; min-width:min(280px,35vw); }
    .progress-line { display:flex; justify-content:space-between; gap:12px; font-size:12px; color:var(--muted); }
    progress { width:100%; height:8px; accent-color:var(--gold); }
    main { width:min(1100px,100%); margin:0 auto; padding:22px; }
    .tour-card { max-height:calc(100vh - 190px); overflow:auto; padding:20px; border:1px solid var(--line); border-radius:8px; background:var(--panel); scrollbar-width:thin; scrollbar-color:#596273 transparent; }
    .title-row { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
    h2 { margin:0; font-size:26px; letter-spacing:0; }
    h3 { margin:0 0 8px; color:#f1d991; font-size:12px; text-transform:uppercase; letter-spacing:0; }
    .matrix { margin:5px 0 0; color:var(--muted); font-size:12px; }
    .status { flex:0 0 auto; padding:5px 8px; border-radius:5px; background:#334155; font-size:11px; font-weight:800; }
    .summary { margin:15px 0; font-size:17px; font-weight:700; }
    .guide-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    section { padding:13px; border:1px solid var(--line); border-radius:7px; background:var(--panel2); }
    .steps { grid-column:1 / -1; }
    .approval { border-color:#ef4444; background:#301519; }
    .output { border-color:#3b82f6; background:#14223a; }
    ol,ul { margin:0; padding-left:21px; }
    li { margin:6px 0; }
    footer { display:flex; align-items:center; gap:9px; padding:13px 22px; border-top:1px solid var(--line); background:#0d1015; }
    button { min-height:40px; padding:8px 14px; border:0; border-radius:7px; color:#fff; background:#334155; font-weight:800; cursor:pointer; }
    button.primary { margin-left:auto; background:var(--blue); }
    button.ghost { color:#d1d5db; background:transparent; border:1px solid var(--line); }
    button:disabled { opacity:.42; cursor:not-allowed; }
    @media (max-width:720px) {
      header { align-items:flex-start; flex-wrap:wrap; padding:13px; }
      .progress-wrap { width:100%; min-width:0; }
      main { padding:12px; }
      .tour-card { max-height:none; padding:15px; }
      .guide-grid { grid-template-columns:1fr; }
      .steps { grid-column:auto; }
      footer { flex-wrap:wrap; padding:10px 12px; }
      button { flex:1 1 140px; }
      button.primary { margin-left:0; }
    }
  </style>
</head>
<body class="gldn-onboarding-page">
  <div class="shell">
    <header>
      <img src="icons/icon48.png" alt="">
      <div><h1>Welcome to GLDN Ops</h1><div class="subtitle">A skippable walkthrough of every available feature and safety stop.</div></div>
      <div class="progress-wrap">
        <div class="progress-line"><span>Feature tour</span><strong id="tourProgressLabel">1 of ${catalog.features.length}</strong></div>
        <progress id="tourProgress" value="1" max="${catalog.features.length}"></progress>
      </div>
    </header>
    <main>
      <article class="tour-card">
        <div class="title-row">
          <div><h2 id="tourTitle"></h2><p id="tourMatrix" class="matrix"></p></div>
          <span id="tourStatus" class="status"></span>
        </div>
        <p id="tourSummary" class="summary"></p>
        <div class="guide-grid">
          <section><h3>Before you start</h3><ul id="tourPrerequisites"></ul></section>
          <section class="output"><h3>Expected result</h3><p id="tourOutput"></p></section>
          <section class="steps"><h3>How it works</h3><ol id="tourSteps"></ol></section>
          <section class="approval"><h3>Approval stop</h3><p id="tourApproval"></p></section>
          <section><h3>If something goes wrong</h3><ul id="tourRecovery"></ul></section>
        </div>
      </article>
    </main>
    <footer>
      <button id="tourSkip" class="ghost" type="button">Skip for now</button>
      <button id="tourGuide" class="ghost" type="button">Open full guide</button>
      <button id="tourPrevious" type="button">Previous</button>
      <button id="tourNext" class="primary" type="button">Next feature</button>
    </footer>
  </div>
  <script id="gldn-onboarding-data" type="application/json">${data}</script>
  <script src="theme-catalog.js"></script>
  <script src="onboarding.js"></script>
</body>
</html>`;
}

function validateCatalog(catalog) {
  if (!catalog.version || !catalog.safetyRule || !Array.isArray(catalog.features)) throw new Error('Guide catalog is incomplete.');
  const ids = new Set();
  for (const feature of catalog.features) {
    for (const key of ['id', 'matrix', 'title', 'status', 'summary', 'approvalStop', 'output', 'evidence']) {
      if (!String(feature[key] || '').trim()) throw new Error(`${feature.id || feature.title || 'Feature'} is missing ${key}.`);
    }
    for (const key of ['prerequisites', 'steps', 'recovery']) {
      if (!Array.isArray(feature[key]) || !feature[key].length) throw new Error(`${feature.id} is missing ${key}.`);
    }
    if (ids.has(feature.id)) throw new Error(`Duplicate feature id: ${feature.id}`);
    ids.add(feature.id);
  }
  return catalog;
}

function build() {
  const catalog = validateCatalog(JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')));
  fs.writeFileSync(MARKDOWN_PATH, renderMarkdown(catalog), 'utf8');
  fs.writeFileSync(HTML_PATH, renderHtml(catalog), 'utf8');
  fs.writeFileSync(ONBOARDING_PATH, renderOnboardingHtml(catalog), 'utf8');
  return { version: catalog.version, features: catalog.features.length, markdown: MARKDOWN_PATH, html: HTML_PATH, onboarding: ONBOARDING_PATH };
}

if (require.main === module) console.log(JSON.stringify(build(), null, 2));

module.exports = { build, escapeHtml, renderHtml, renderMarkdown, renderOnboardingHtml, validateCatalog };
