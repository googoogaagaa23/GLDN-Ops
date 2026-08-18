(function () {
  'use strict';

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) return reject(new Error(error.message));
        if (!response?.ok) return reject(new Error(response?.error || 'Product Hunter did not answer.'));
        resolve(response);
      });
    });
  }

  async function render() {
    const state = await send({ type: 'hunterGetState' });
    const status = state.job?.status || 'idle';
    const counts = state.job?.counts || {};
    document.getElementById('version').textContent = `v${state.version}`;
    document.getElementById('run-status').textContent = status;
    document.getElementById('ready-count').textContent = counts.ready || 0;
    document.getElementById('review-count').textContent = counts.review || 0;
    document.getElementById('blocked-count').textContent = counts.blocked || 0;
    document.getElementById('message').textContent = state.job?.pauseReason || state.job?.completionReason || (status === 'running' ? 'Amazon checks are running in an inactive tab.' : 'Open the full hunter to start or review a run.');
    document.getElementById('pause').disabled = status !== 'running';
    document.getElementById('resume').disabled = status !== 'paused';
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('open-dashboard').addEventListener('click', () => send({ type: 'hunterOpenDashboard' }).then(() => window.close()));
    document.getElementById('pause').addEventListener('click', () => send({ type: 'hunterPause' }).then(render));
    document.getElementById('resume').addEventListener('click', () => send({ type: 'hunterResume' }).then(render));
    render().catch((error) => { document.getElementById('message').textContent = error.message || String(error); });
  });
})();
