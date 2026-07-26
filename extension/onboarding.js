(() => {
  const dataElement = document.getElementById('gldn-onboarding-data');
  const catalog = JSON.parse(dataElement?.textContent || '{"features":[]}');
  const features = Array.isArray(catalog.features) ? catalog.features : [];
  const stateKey = 'gldnOnboardingState';
  const elements = {
    card: document.querySelector('.tour-card'),
    progress: document.getElementById('tourProgress'),
    progressLabel: document.getElementById('tourProgressLabel'),
    title: document.getElementById('tourTitle'),
    matrix: document.getElementById('tourMatrix'),
    status: document.getElementById('tourStatus'),
    summary: document.getElementById('tourSummary'),
    prerequisites: document.getElementById('tourPrerequisites'),
    output: document.getElementById('tourOutput'),
    steps: document.getElementById('tourSteps'),
    approval: document.getElementById('tourApproval'),
    recovery: document.getElementById('tourRecovery'),
    previous: document.getElementById('tourPrevious'),
    next: document.getElementById('tourNext'),
    skip: document.getElementById('tourSkip'),
    guide: document.getElementById('tourGuide')
  };
  let currentIndex = 0;

  const fillList = (element, values) => {
    element.replaceChildren(...(values || []).map((value) => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
  };

  const saveState = (status) => new Promise((resolve) => {
    chrome.storage.local.set({
      [stateKey]: {
        status,
        currentIndex,
        version: catalog.version || chrome.runtime.getManifest().version,
        updatedAt: new Date().toISOString()
      }
    }, resolve);
  });

  const renderFeature = () => {
    const feature = features[currentIndex];
    if (!feature) return;
    elements.progress.value = currentIndex + 1;
    elements.progress.max = features.length;
    elements.progressLabel.textContent = `${currentIndex + 1} of ${features.length}`;
    elements.title.textContent = feature.title;
    elements.matrix.textContent = `${feature.matrix} | ${feature.id}`;
    elements.status.textContent = feature.status;
    elements.summary.textContent = feature.summary;
    elements.output.textContent = feature.output;
    elements.approval.textContent = feature.approvalStop;
    fillList(elements.prerequisites, feature.prerequisites);
    fillList(elements.steps, feature.steps);
    fillList(elements.recovery, feature.recovery);
    elements.previous.disabled = currentIndex === 0;
    elements.next.textContent = currentIndex === features.length - 1 ? 'Finish tour' : 'Next feature';
    elements.card.scrollTop = 0;
    saveState('active');
  };

  const renderCompletion = async (status) => {
    await saveState(status);
    const skipped = status === 'skipped';
    elements.card.innerHTML = `
      <div class="title-row"><div><h2>${skipped ? 'Tour skipped' : 'Tour complete'}</h2></div></div>
      <p class="summary">${skipped
        ? 'You can restart the feature tour any time from the extension popup or the panel settings menu.'
        : 'You reviewed every GLDN Ops feature and its approval boundary.'}</p>
      <section class="output"><h3>Next step</h3><p>Open the full guide whenever you need exact steps, recovery instructions, or current evidence status.</p></section>`;
    elements.progress.value = features.length;
    elements.progressLabel.textContent = skipped ? 'Skipped' : 'Complete';
    elements.previous.hidden = true;
    elements.next.hidden = true;
    elements.skip.hidden = true;
  };

  elements.previous.addEventListener('click', () => {
    currentIndex = Math.max(0, currentIndex - 1);
    renderFeature();
  });
  elements.next.addEventListener('click', () => {
    if (currentIndex >= features.length - 1) {
      renderCompletion('completed');
      return;
    }
    currentIndex += 1;
    renderFeature();
  });
  elements.skip.addEventListener('click', () => renderCompletion('skipped'));
  elements.guide.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') });
  });

  chrome.storage.local.get([stateKey, 'gldnUiTheme'], (result) => {
    globalThis.GLDN_THEME_CATALOG?.apply(document.documentElement, result.gldnUiTheme || 'dark');
    const saved = result[stateKey];
    if (saved?.status === 'active' && Number.isInteger(saved.currentIndex)) {
      currentIndex = Math.min(Math.max(0, saved.currentIndex), Math.max(0, features.length - 1));
    }
    if (features.length) renderFeature();
    else renderCompletion('completed');
  });
})();
