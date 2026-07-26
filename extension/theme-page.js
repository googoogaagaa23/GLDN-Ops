(() => {
  const apply = (value) => globalThis.GLDN_THEME_CATALOG?.apply(document.documentElement, value || 'dark');
  chrome.storage.local.get(['gldnUiTheme'], (result) => apply(result.gldnUiTheme));
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.gldnUiTheme) apply(changes.gldnUiTheme.newValue);
  });
})();
