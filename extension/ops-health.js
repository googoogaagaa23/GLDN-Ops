(() => {
  const $ = (id) => document.getElementById(id);
  let busy = false;
  const allowedPages = new Set(['ebay-profit.html', 'profit-progress.html', 'order-audit.html', 'policy-listing-audit.html', 'variation-audit.html']);
  function message(value) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok:false, error:'Health request timed out. Your workflows were not reset.' }), 25000);
      try { chrome.runtime.sendMessage(value, (response) => { clearTimeout(timer); resolve(chrome.runtime.lastError ? { ok:false, error:chrome.runtime.lastError.message } : response || { ok:false, error:'No response.' }); }); }
      catch (error) { clearTimeout(timer); resolve({ ok:false, error:error.message }); }
    });
  }
  function cell(row, value, className = '') { const td = document.createElement('td'); td.textContent = value; td.className = className; row.append(td); return td; }
  function list(id, values, fallback) { $(id).replaceChildren(); for (const value of values.length ? values : [fallback]) { const li = document.createElement('li'); li.textContent = value; $(id).append(li); } }
  function date(value) { return value ? new Date(value).toLocaleString() : 'Not recorded'; }
  function render(result) {
    $('version').textContent = result.version;
    $('identity').textContent = `${result.identity.computer || 'Not set'} / ${result.identity.ebay || 'Not set'}`;
    $('queued').textContent = String(result.queuedRecords);
    $('workflows').replaceChildren();
    for (const run of result.workflows) {
      const tr = document.createElement('tr'); cell(tr, run.label); cell(tr, run.state, `state ${['Failed','Paused'].includes(run.state) ? 'warn' : ''}`);
      cell(tr, [run.error || run.progress || run.phase, run.stale ? 'No progress recorded for over five minutes.' : '', run.synced !== null ? `${run.synced} rows confirmed saved` : ''].filter(Boolean).join(' '));
      cell(tr, date(run.updatedAt)); const target = cell(tr, run.page ? '' : 'Review in workflow tab');
      if (allowedPages.has(run.page)) { const link = document.createElement('a'); link.className = 'result-link'; link.textContent = 'Open Results'; link.href = chrome.runtime.getURL(run.page); target.append(link); }
      if (/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit$/.test(run.sheetUrl || '')) { const link = document.createElement('a'); link.className = 'result-link'; link.textContent = 'Open Sheet'; link.href = run.sheetUrl; link.target = '_blank'; link.rel = 'noopener'; target.append(link); }
      $('workflows').append(tr);
    }
    if (!result.workflows.length) { const tr = document.createElement('tr'); cell(tr, 'No saved workflow in this profile.').colSpan = 5; $('workflows').append(tr); }
    list('reviews', result.reviews.map((r) => `${r.label} | Tab ${r.ownerTabId ?? 'unknown'} | Opened ${date(r.openedAt)}`), 'No open approval reviews.');
    list('errors', result.errors.map((r) => `${date(r.at)} | ${r.operation || 'Workflow'}: ${r.message || ''}`), 'No errors recorded.');
    $('pairState').textContent = result.pairing.enabled ? `Enabled for ${result.pairing.profileDirectory}` : 'Disabled in this profile';
    $('disablePair').hidden = !result.pairing.enabled; $('beginPair').hidden = result.pairing.enabled;
    if (result.updater) { $('updater').textContent = result.updater.ok === false ? 'Unavailable' : `${result.updater.channel === 'webstore' ? 'Chrome' : 'Connected'} / ${result.updater.diskVersion || result.updater.currentVersion || 'Unknown'}`; $('updaterDetail').textContent = result.updater.ok === false ? result.updater.error : ''; $('latest').textContent = result.updater.latestVersion || result.updater.latest?.version || 'Unavailable'; }
    if (result.installations) {
      $('profiles').replaceChildren();
      for (const profile of result.installations.profiles || []) {
        const tr = document.createElement('tr'); cell(tr, profile.profileDirectory); cell(tr, profile.installations.map((i) => `v${i.diskVersion}`).join(', ') || 'Not found');
        cell(tr, !profile.readable ? 'Could not read profile' : profile.installations.length ? profile.installations.map((i) => i.disabled ? 'Disabled record' : 'Present; runtime unverified').join(', ') : 'No current unpacked GLDN record'); $('profiles').append(tr);
      }
      if (!result.installations.ok) { const tr = document.createElement('tr'); cell(tr, result.installations.error || 'Installation inventory unavailable.').colSpan = 3; $('profiles').append(tr); }
      $('inventoryTime').textContent = date(result.installations.observedAt);
    }
  }
  async function refresh(full = false) {
    if (busy) return; busy = true; $('refresh').disabled = true;
    try { const result = await message({ type:'getOpsHealth', refreshInstallations:full }); if (!result.ok) throw new Error(result.error); render(result); $('notice').textContent = `Updated ${date(result.observedAt)}`; }
    catch (error) { $('notice').textContent = error.message; }
    finally { busy = false; $('refresh').disabled = false; }
  }
  function bind(id, type, done) {
    $(id).addEventListener('click', async () => {
      $(id).disabled = true;
      try {
        if (type === 'beginControlPairing' && chrome.runtime.getManifest().optional_host_permissions?.includes('http://127.0.0.1/*')) {
          const granted = await chrome.permissions.request({ origins: ['http://127.0.0.1/*'] });
          if (!granted) throw new Error('Local helper access was not granted. Background control remains disabled.');
        }
        const result = await message({ type }); if (!result.ok) throw new Error(result.error); done(result); await refresh();
      }
      catch (error) { $('notice').textContent = error.message; }
      finally { $(id).disabled = false; }
    });
  }
  bind('beginPair', 'beginControlPairing', (r) => { $('pairRequest').hidden = false; $('finishPair').hidden = false; $('pairCode').textContent = r.code; $('pairCommand').textContent = `.\\tools\\gldn-control.ps1 -PairingCode ${r.code} -ProfileDirectory "PROFILE_DIRECTORY"`; });
  bind('finishPair', 'finishControlPairing', (r) => { if (r.approved) { $('pairRequest').hidden = true; $('finishPair').hidden = true; } else $('pairState').textContent = 'Awaiting local pairing approval'; });
  bind('disablePair', 'disableControlPairing', () => { $('pairRequest').hidden = true; $('finishPair').hidden = true; });
  $('refresh').addEventListener('click', () => refresh(true)); void refresh(true);
  setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5000);
})();
