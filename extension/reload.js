(async () => {
  const message = document.getElementById('message');
  try {
    const info = chrome.runtime.getManifest();
    message.innerHTML = `Reload requested for <strong>${info.name} ${info.version}</strong>. Refresh open eBay/Amazon tabs after this finishes.`;
    await chrome.runtime.sendMessage({ type: 'reloadExtension' });
  } catch (error) {
    message.textContent = error?.message || 'Reload request failed.';
  }
})();
