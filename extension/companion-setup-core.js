(function (root) {
  'use strict';
  const urls = Object.freeze({
    ecomsniper: 'https://ecomsniper.io/dashboard/software_downloads',
    trackerbot: 'https://app.trackerbot.me/',
    trackerbotStore: 'https://chromewebstore.google.com/detail/trackerbot/gfdldleopmcdjppengcjkpfafjhcabpj'
  });
  function versionFromText(text) {
    const values = [...String(text || '').matchAll(/Current Version\s*:\s*v?(\d+(?:\.\d+){1,3})(?![\d.])/gi)].map(m => m[1]);
    if (new Set(values).size !== 1) throw new Error('The current eComSniper version could not be verified. Check the Downloads page.');
    return values[0];
  }
  function downloadPath(version) {
    if (!/^\d+(?:\.\d+){1,3}$/.test(version)) throw new Error('Invalid eComSniper version.');
    return `GLDN-Companions/eComSniper-${version}/Ebay-Lister-${version}.zip`;
  }
  function isProviderDownload(item) {
    try {
      const url = new URL(item.url);
      return url.protocol === 'https:' && url.hostname === 'storage.googleapis.com'
        && url.pathname === '/ecomsniper-cb046.appspot.com/software/eBayLister.zip';
    } catch (_) { return false; }
  }
  function mayRouteDownload(item, pending, now = Date.now(), extensionId = '') {
    let providerReferrer = !item.referrer;
    try { if (item.referrer) providerReferrer = new URL(item.referrer).origin === 'https://ecomsniper.io'; } catch (_) { return false; }
    return Boolean(pending && pending.status === 'awaiting-download' && !Number.isInteger(pending.downloadId)
      && pending.expiresAt > now && Date.parse(item.startTime) >= pending.startedAt
      && isProviderDownload(item) && (!item.byExtensionId || item.byExtensionId === extensionId)
      && providerReferrer);
  }
  function allowedPage(url, service) {
    try {
      const value = new URL(url);
      return value.origin === new URL(urls[service]).origin;
    } catch (_) { return false; }
  }
  const api = Object.freeze({ urls, versionFromText, downloadPath, isProviderDownload, mayRouteDownload, allowedPage });
  root.GLDN_COMPANION_SETUP = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
