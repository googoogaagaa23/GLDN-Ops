(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let latest = { records: [] }, busy = false;
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const link = (url, label) => /^https:\/\/(?:www\.)?ebay\.com\//.test(url || '') ? '<a target="_blank" rel="noopener noreferrer" href="' + esc(url) + '">' + esc(label) + '</a>' : '';
  const date = (s) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString() : 'Not recorded';
  function render() {
    const state = latest.state || {};
    $('scan').disabled = busy || state.active;
    $('resume').disabled = busy || state.active || !['paused','error'].includes(state.phase);
    $('pause').disabled = !state.active;
    $('sync').disabled = busy || state.active;
    $('status').textContent = state.message || 'Ready to scan the signed-in eBay account.';
    $('status').classList.toggle('error', state.phase === 'error');
    const shared = latest.shared || {};
    $('sharedStatus').textContent = shared.error ? 'Shared refresh needs attention: ' + shared.error
      : shared.syncedAt ? 'Shared history verified: ' + date(shared.syncedAt) : 'No shared history has been verified yet.';
    const query = $('search').value.toLowerCase().trim();
    const rows = latest.records.filter((r) => [r.account,r.itemId,r.asin,r.title,r.reason,r.policy,r.activity].join(' ').toLowerCase().includes(query));
    $('counts').textContent = rows.length.toLocaleString() + ' of ' + latest.records.length.toLocaleString() + ' incidents | ' + new Set(latest.records.map((r) => r.account)).size + ' eBay accounts';
    $('rows').innerHTML = rows.map((r) => '<tr><td>' + esc(r.account) + '<br>' + esc(r.itemId) + '</td><td><strong>' + esc(r.title) + '</strong><br>' + esc(r.asin || 'ASIN not decoded') + '</td><td>' + esc(r.reason) + '</td><td><strong>' + esc(r.policy || 'Policy not specified in the available notice') + '</strong><br>' + esc(r.activity || r.caseReadError || 'No further case explanation available.') + '</td><td>' + link(r.caseUrl,'eBay case') + link(r.policyUrl,'Policy details') + esc(date(r.lastSeenAt)) + '</td></tr>').join('') || '<tr><td colspan="5">No matching history records.</td></tr>';
  }
  async function refresh(remote = false) {
    const response = await chrome.runtime.sendMessage({ type:'getEbayViolationHistory', refresh:remote });
    if (!response?.ok) throw new Error(response?.error || 'History could not load.');
    latest = response;
    render();
  }
  async function command(type, extra = {}) {
    busy = true; render();
    try {
      const response = await chrome.runtime.sendMessage({ type, ...extra });
      if (!response?.ok) throw new Error(response?.error || 'The request did not finish.');
      await refresh();
    } catch (error) { $('status').textContent = error.message; $('status').classList.add('error'); }
    finally { busy = false; $('scan').disabled = !!latest.state?.active; $('sync').disabled = !!latest.state?.active; }
  }
  $('scan').addEventListener('click', () => command('scanEbayViolationHistory'));
  $('resume').addEventListener('click', () => command('scanEbayViolationHistory',{resume:true}));
  $('pause').addEventListener('click', () => command('stopEbayViolationHistory'));
  $('sync').addEventListener('click', () => command('syncEbayViolationHistory'));
  $('search').addEventListener('input', render);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ['gldnViolationHistoryScan','gldnViolationHistoryShared','gldnViolationHistoryLocal'].some((key) => changes[key])) refresh().catch(() => {});
  });
  try { await refresh(); await refresh(true); } catch (error) { $('status').textContent = error.message; }
})();
