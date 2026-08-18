(() => {
  const HEARTBEAT_MS = 2000;

  const wakeLocalControl = () => {
    if (document.visibilityState !== 'visible') return;
    try {
      chrome.runtime.sendMessage({ type: 'gldnLocalControlHeartbeat' }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_) {}
  };

  wakeLocalControl();
  const timer = setInterval(wakeLocalControl, HEARTBEAT_MS);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  document.addEventListener('visibilitychange', wakeLocalControl);
})();
