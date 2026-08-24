(() => {
  const catalog = globalThis.GLDN_WORKFLOW_GUIDE_CATALOG;
  if (!catalog?.features?.length) return;

  const featureMap = new Map(catalog.features.map((feature) => [feature.id, feature]));

  function guideUrl(featureId = '') {
    const base = globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL('guide.html') : 'guide.html';
    return featureId ? `${base}#${encodeURIComponent(featureId)}` : base;
  }

  function openGuide(featureId = '') {
    const url = guideUrl(featureId);
    if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url });
    else window.open(url, '_blank', 'noopener');
  }

  function appendList(parent, items, ordered = false) {
    const list = document.createElement(ordered ? 'ol' : 'ul');
    for (const item of items || []) {
      const row = document.createElement('li');
      row.textContent = item;
      list.append(row);
    }
    parent.append(list);
  }

  function appendGuideSection(parent, title, content, { ordered = false, tone = '' } = {}) {
    const section = document.createElement('section');
    section.className = `gldn-inline-guide-section${tone ? ` ${tone}` : ''}`;
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
    if (Array.isArray(content)) appendList(section, content, ordered);
    else {
      const paragraph = document.createElement('p');
      paragraph.textContent = content;
      section.append(paragraph);
    }
    parent.append(section);
  }

  function renderInlineGuide(container) {
    const feature = featureMap.get(container.dataset.gldnInlineGuide);
    if (!feature) {
      container.hidden = true;
      return;
    }

    const details = document.createElement('details');
    details.className = 'gldn-inline-guide';
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = `How to use ${feature.title}`;
    const hint = document.createElement('span');
    hint.className = 'gldn-inline-guide-hint';
    hint.textContent = 'Step-by-step guide';
    summary.append(title, hint);
    details.append(summary);

    const body = document.createElement('div');
    body.className = 'gldn-inline-guide-body';
    const summaryText = document.createElement('p');
    summaryText.className = 'gldn-inline-guide-summary';
    summaryText.textContent = feature.summary;
    body.append(summaryText);
    appendGuideSection(body, 'Before you start', feature.prerequisites);
    appendGuideSection(body, 'Exact steps', feature.steps, { ordered: true });
    appendGuideSection(body, 'Approval stop', feature.approvalStop, { tone: 'approval' });
    appendGuideSection(body, 'Expected result', feature.output, { tone: 'output' });
    appendGuideSection(body, 'If something goes wrong', feature.recovery);

    const fullGuide = document.createElement('button');
    fullGuide.type = 'button';
    fullGuide.className = 'gldn-open-full-guide';
    fullGuide.textContent = 'Open this workflow in the full guide';
    fullGuide.addEventListener('click', () => openGuide(feature.id));
    body.append(fullGuide);
    details.append(body);
    container.replaceChildren(details);
  }

  function decorateWorkflowActions(root = document) {
    root.querySelectorAll('button[data-guide-id]:not([data-guide-decorated])').forEach((action) => {
      const feature = featureMap.get(action.dataset.guideId);
      if (!feature || action.closest('.gldn-guide-action-row')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'gldn-guide-action-row';
      action.before(wrapper);
      wrapper.append(action);
      action.dataset.guideDecorated = 'true';

      const guideButton = document.createElement('button');
      guideButton.type = 'button';
      guideButton.className = 'gldn-guide-icon-button';
      guideButton.textContent = '?';
      guideButton.title = `Step-by-step guide: ${feature.title}`;
      guideButton.setAttribute('aria-label', `Open step-by-step guide for ${feature.title}`);
      guideButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openGuide(feature.id);
      });
      wrapper.append(guideButton);
    });
  }

  function renderDirectory(container) {
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'gldn-guide-search';
    search.placeholder = 'Search workflows';
    search.setAttribute('aria-label', 'Search step-by-step workflow guides');

    const resultCount = document.createElement('div');
    resultCount.className = 'gldn-guide-result-count';
    const list = document.createElement('div');
    list.className = 'gldn-guide-directory';

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const matches = catalog.features.filter((feature) => !query || [
        feature.title,
        feature.summary,
        feature.matrix,
        feature.id
      ].some((value) => String(value || '').toLowerCase().includes(query)));
      resultCount.textContent = `${matches.length} guide${matches.length === 1 ? '' : 's'}`;
      list.replaceChildren(...matches.map((feature) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gldn-guide-directory-item';
        const heading = document.createElement('strong');
        heading.textContent = feature.title;
        const summary = document.createElement('span');
        summary.textContent = feature.summary;
        button.append(heading, summary);
        button.addEventListener('click', () => openGuide(feature.id));
        return button;
      }));
    };

    search.addEventListener('input', render);
    container.replaceChildren(search, resultCount, list);
    render();
  }

  function revealHashTarget() {
    const featureId = decodeURIComponent(location.hash.slice(1));
    if (!featureMap.has(featureId)) return;
    document.querySelectorAll('.feature.guide-target').forEach((element) => element.classList.remove('guide-target'));
    const target = document.getElementById(featureId);
    if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    target.classList.add('guide-target');
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start' });
      const focusTarget = target.querySelector('summary') || target;
      focusTarget.tabIndex = -1;
      focusTarget.focus({ preventScroll: true });
    });
  }

  function initialize() {
    document.querySelectorAll('[data-gldn-inline-guide]').forEach(renderInlineGuide);
    document.querySelectorAll('[data-gldn-guide-directory]').forEach(renderDirectory);
    decorateWorkflowActions();
    revealHashTarget();
  }

  globalThis.GLDN_WORKFLOW_GUIDES = Object.freeze({
    catalog,
    decorateWorkflowActions,
    featureById: (id) => featureMap.get(id) || null,
    guideUrl,
    openGuide,
    renderDirectory,
    renderInlineGuide
  });

  window.addEventListener('hashchange', revealHashTarget);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
