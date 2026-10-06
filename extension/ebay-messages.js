(async function () {
  'use strict';
  const CORE = globalThis.GLDN_EBAY_MESSAGES;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let state = { accounts: {}, selectedAccount: '', scan: null }, view = 'pending', busy = false, running = false, stopOpening = false;
  let selected = new Set(), visibleRows = [], deskId = (await chrome.tabs.getCurrent())?.id, mutation = Promise.resolve();
  const current = () => state.accounts[state.selectedAccount] || { account:'', rows:[], ignored:{} };
  const read = async () => (await chrome.storage.local.get(CORE.STORAGE_KEY))[CORE.STORAGE_KEY] || { accounts:{}, selectedAccount:'', scan:null };
  function change(update) {
    const action = mutation.catch(() => {}).then(async () => {
      state = await read();
      update(state);
      await chrome.storage.local.set({ [CORE.STORAGE_KEY]: state });
      render();
    });
    mutation = action;
    return action;
  }
  function notice(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
  function render() {
    const account = current();
    const scan = state.scan || {};
    $('account').innerHTML = Object.entries(state.accounts).map(([key, value]) => '<option value="' + esc(key) + '">' + esc(value.account) + '</option>').join('') || '<option value="">No account scanned</option>';
    $('account').value = state.selectedAccount;
    $('account').disabled = busy || running;
    $('scan').disabled = busy || running || scan.active;
    $('pause').disabled = !running && !busy;
    $('resume').disabled = busy || running || !scan || !['paused','error'].includes(scan.phase);
    $('pendingCount').textContent = CORE.pending(account).length;
    $('ignoredCount').textContent = Object.keys(account.ignored || {}).length;
    $('openedCount').textContent = (account.rows || []).filter((row) => row.openedAt).length;
    $('checked').textContent = account.scannedAt ? 'Checked ' + new Date(account.scannedAt).toLocaleString() + (account.complete ? ' | Complete inbox scan' : ' | Partial scan') : '';
    if (scan.message) notice(scan.message, scan.phase === 'error');
    const query = $('search').value.trim().toLowerCase();
    const rows = view === 'ignored' ? Object.values(account.ignored || {}).map((entry) => entry.row)
      : view === 'opened' ? (account.rows || []).filter((row) => row.openedAt) : CORE.pending(account);
    visibleRows = rows.filter((row) => [row.buyer, row.title, row.preview].join(' ').toLowerCase().includes(query));
    $('rows').innerHTML = visibleRows.map((row) => '<tr><td><input type="checkbox" data-id="' + esc(row.id) + '" aria-label="Select ' + esc(row.buyer) + '" ' + (selected.has(row.id) ? 'checked' : '') + '></td><td>' + esc(row.buyer) + '</td><td><strong>' + esc(row.title || 'Customer message') + '</strong><p>' + esc(row.preview) + '</p></td><td>' + esc(row.date || 'Not shown') + '</td><td>' + (view === 'ignored' ? '<button data-command="restore" data-id="' + esc(row.id) + '">Restore</button>' : '<button data-command="open" data-id="' + esc(row.id) + '">Open</button><button data-command="ignore" data-id="' + esc(row.id) + '">Ignore</button>') + '</td></tr>').join('') || '<tr><td colspan="5" class="empty">' + (query ? 'No matching messages.' : view === 'ignored' ? 'No ignored messages.' : view === 'opened' ? 'No messages opened from this scan.' : account.scannedAt ? 'No pending unread customer messages in the saved scan.' : 'Scan your eBay inbox to load unread customer messages.') + '</td></tr>';
    $('selectAll').checked = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id));
    $('selectAll').indeterminate = ! $('selectAll').checked && visibleRows.some((row) => selected.has(row.id));
    $('openAll').disabled = busy || running || !CORE.pending(account).length;
    $('openAll').textContent = account.complete ? 'Open All Pending (' + CORE.pending(account).length + ')' : 'Open Found Messages (' + CORE.pending(account).length + ')';
    $('openSelected').disabled = busy || running || view !== 'pending' || !visibleRows.some((row) => selected.has(row.id));
    $('ignoreSelected').disabled = busy || running || view === 'ignored' || !visibleRows.some((row) => selected.has(row.id));
    for (const button of $('rows').querySelectorAll('button')) button.disabled = busy || running;
  }
  async function page(tabId, action, args = {}) {
    await chrome.scripting.executeScript({ target:{tabId}, files:['ebay-messages-core.js','ebay-messages-reader.js'] });
    const result = await chrome.scripting.executeScript({ target:{tabId}, func:(action, args) => globalThis.GLDN_EBAY_MESSAGES_PAGE(action, args), args:[action,args] });
    if (!result[0]?.result) throw new Error('The eBay messages page did not respond.');
    return result[0].result;
  }
  const delay = () => new Promise((resolve) => setTimeout(resolve, 500));
  async function waitForPage(tabId, previousSignature = '', forOpen = false) {
    const deadline = Date.now() + 25000;
    let lastError = 'The eBay inbox did not finish loading.';
    while (Date.now() < deadline) {
      if (!running && !busy) throw new Error('Paused.');
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          if (!CORE.messageUrl(tab.url)) throw new Error('eBay needs sign-in or verification. Finish it in the inbox, then Resume.');
          const prepared = await page(tabId, 'prepare');
          if (!prepared.ready) { await delay(); continue; }
          const snapshot = await page(tabId, 'snapshot', {forOpen});
          if (!previousSignature || snapshot.signature !== previousSignature) return snapshot;
          lastError = 'eBay did not advance to a new message page. The scan is partial; Resume after checking the inbox.';
        }
      } catch (error) { lastError = error.message; if (/sign-in|verification|account changed/i.test(lastError)) throw error; }
      await delay();
    }
    throw new Error(lastError);
  }
  async function scan(resume = false) {
    if (busy || running) return;
    const saved = await read();
    if (saved.scan?.active && saved.scan.ownerTabId !== deskId) throw new Error('An unread-message scan is already running in another GLDN tab.');
    let worker, scanId = 'messages-' + Date.now(), records = [], signatures = new Set(), owner = '', pages = 0, unknown = 0;
    if (resume && saved.scan?.workerTabId) {
      try { worker = await chrome.tabs.get(saved.scan.workerTabId); } catch { /* Restart a closed inbox from page one. */ }
      if (worker && CORE.messageUrl(worker.url)) {
        records = saved.scan.rows || []; owner = saved.scan.account || ''; pages = saved.scan.pages || 0;
        signatures = new Set(saved.scan.signatures || []); unknown = saved.scan.unknown || 0;
      } else worker = null;
    }
    running = true;
    try {
      if (!worker) worker = await chrome.tabs.create({url:CORE.INBOX_URL, active:false});
      await change((value) => { value.scan = { id:scanId, ownerTabId:deskId, workerTabId:worker.id, account:owner, rows:records, signatures:[...signatures], pages, unknown, active:true, phase:'scanning', message:'Reading unread customer messages...' }; });
      let snapshot = await waitForPage(worker.id);
      if (!resume || !owner) {
        const filter = await page(worker.id, 'unread');
        if (filter.clicked) {
          await delay(); snapshot = await waitForPage(worker.id);
        }
      }
      while (running) {
        const live = await read();
        if (live.scan?.id !== scanId || !live.scan.active) break;
        if (owner && CORE.accountKey(snapshot.account) !== CORE.accountKey(owner)) throw new Error('The signed-in eBay account changed during the scan.');
        owner = snapshot.account;
        if (signatures.has(snapshot.signature) && !resume) throw new Error('eBay repeated an inbox page. Resume after checking pagination.');
        if (!signatures.has(snapshot.signature)) unknown += snapshot.unknown;
        signatures.add(snapshot.signature);
        records = CORE.mergeRows(records, snapshot.rows);
        pages++;
        if (snapshot.expected !== null && records.length === snapshot.expected) snapshot.next = false;
        if (!snapshot.next && snapshot.expected !== null && records.length !== snapshot.expected) throw new Error('eBay unread count changed during scanning. Scan again to verify the complete count.');
        const complete = !snapshot.next && !unknown;
        await change((value) => {
          if (value.scan?.id !== scanId || !value.scan.active) return;
          const key = CORE.accountKey(owner);
          const account = value.accounts[key] || { account:owner, rows:[], ignored:{} };
          value.accounts[key] = CORE.reconcile(account, records, complete);
          value.selectedAccount = key;
          value.scan = { ...value.scan, account:owner, rows:records, signatures:[...signatures], pages, unknown,
            active:!!snapshot.next, phase:snapshot.next ? 'scanning' : unknown ? 'error' : 'complete',
            message:snapshot.next ? 'Read ' + pages + ' pages; ' + records.length + ' unread customer conversations found.' : unknown ? 'Partial scan: ' + unknown + ' unread rows could not be identified. Check the inbox before treating this count as complete.' : 'Complete: ' + records.length + ' unread customer conversations across ' + pages + ' pages.' };
        });
        if (!snapshot.next) break;
        if (pages >= 1000) throw new Error('The inbox exceeded 1,000 pages. The saved scan is partial.');
        await page(worker.id, 'next', { account:owner });
        const previous = snapshot.signature;
        snapshot = await waitForPage(worker.id, previous);
        resume = false;
      }
    } catch (error) {
      await change((value) => { if (value.scan?.id === scanId) value.scan = { ...value.scan, active:false, phase:running ? 'error' : 'paused', message:error.message }; });
    } finally {
      running = false; selected.clear(); render();
      if (state.scan?.id === scanId && state.scan.phase === 'complete' && worker) await chrome.tabs.remove(worker.id).catch(() => {});
    }
  }
  async function openRows(rows) {
    if (busy || running || !rows.length) return;
    busy = true; stopOpening = false; render();
    const key = state.selectedAccount, owner = current().account;
    let opened = 0;
    try {
      for (const row of rows) {
        if (stopOpening) break;
        const live = await read(), account = live.accounts[key];
        const fresh = account?.rows?.find((entry) => entry.id === row.id);
        if (!fresh || CORE.isIgnored(account, fresh) || fresh.openedAt || CORE.fingerprint(fresh) !== CORE.fingerprint(row)) continue;
        notice('Opening ' + (opened + 1) + ' of ' + rows.length + ' customer conversations...');
        const tab = await chrome.tabs.create({url:CORE.INBOX_URL, active:false});
        try {
          {
            let snapshot = await waitForPage(tab.id, '', true), visited = new Set();
            while (!snapshot.allRows.some((entry) => entry.id === row.id)) {
              if (CORE.accountKey(snapshot.account) !== CORE.accountKey(owner)) throw new Error('The signed-in eBay account changed.');
              if (!snapshot.next || visited.has(snapshot.signature) || visited.size >= 1000) throw new Error('The exact conversation is no longer in the inbox. Scan again.');
              visited.add(snapshot.signature);
              await page(tab.id, 'next', {account:owner});
              snapshot = await waitForPage(tab.id, snapshot.signature, true);
            }
            await page(tab.id, 'open', {account:owner,row});
          }
          const deadline = Date.now() + 15000;
          let verified = false;
          while (Date.now() < deadline) {
            try { verified = (await page(tab.id, 'verify-open', {account:owner,row})).opened; if (verified) break; }
            catch (error) { if (/account changed|sign-in|verification/i.test(error.message)) throw error; }
            await delay();
          }
          if (!verified) throw new Error('eBay did not confirm the exact customer conversation opened.');
          await change((value) => { const match = value.accounts[key]?.rows?.find((entry) => entry.id === row.id); if (match && CORE.fingerprint(match) === CORE.fingerprint(row)) match.openedAt = new Date().toISOString(); });
          opened++;
        } catch (error) {
          await chrome.tabs.update(tab.id, {active:true});
          throw new Error(row.buyer + ': ' + error.message + ' The inbox tab was left open.');
        }
      }
      await change((value) => { if (value.scan) value.scan.message = (stopOpening ? 'Paused after opening ' : 'Opened ') + opened + ' customer conversations. eBay may mark opened messages as read. Scan again to refresh the unread count.'; });
    } catch (error) { await change((value) => { if (value.scan) value.scan = { ...value.scan, message:error.message, phase:'error' }; }); }
    finally { busy = false; selected.clear(); render(); }
  }
  async function setIgnored(ids, restore = false) {
    await change((value) => {
      const key = value.selectedAccount;
      let account = value.accounts[key];
      for (const id of ids) account = restore ? CORE.restore(account, id) : CORE.ignore(account, id);
      value.accounts[key] = account;
    });
    selected.clear(); render();
  }
  $('scan').addEventListener('click', () => scan().catch((error) => notice(error.message,true)));
  $('resume').addEventListener('click', () => scan(true).catch((error) => notice(error.message,true)));
  $('pause').addEventListener('click', () => {
    if (busy) { stopOpening = true; notice('Pausing after the current conversation opens...'); return; }
    running = false;
    change((value) => { if (value.scan) value.scan = { ...value.scan, active:false, phase:'paused', message:'Paused. Completed inbox pages and ignored messages are saved.' }; }).catch((error) => notice(error.message,true));
  });
  $('inbox').addEventListener('click', () => chrome.tabs.create({url:CORE.INBOX_URL}));
  $('openAll').addEventListener('click', () => openRows(CORE.pending(current())));
  $('openSelected').addEventListener('click', () => openRows(visibleRows.filter((row) => selected.has(row.id))));
  $('ignoreSelected').addEventListener('click', () => setIgnored(visibleRows.filter((row) => selected.has(row.id)).map((row) => row.id)).catch((error) => notice(error.message,true)));
  $('account').addEventListener('change', () => { const key = $('account').value; selected.clear(); change((value) => { value.selectedAccount = key; }).catch((error) => notice(error.message,true)); });
  $('search').addEventListener('input', () => { selected.clear(); render(); });
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => { view = button.dataset.view; selected.clear(); for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-selected', String(tab === button)); render(); });
  $('selectAll').addEventListener('change', () => { selected = new Set($('selectAll').checked ? visibleRows.map((row) => row.id) : []); render(); });
  $('rows').addEventListener('change', (event) => { const id = event.target.dataset.id; if (!id) return; if (event.target.checked) selected.add(id); else selected.delete(id); render(); });
  $('rows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-command]'); if (!button || busy || running) return;
    const row = visibleRows.find((entry) => entry.id === button.dataset.id); if (!row) return;
    if (button.dataset.command === 'open') openRows([row]);
    else setIgnored([row.id], button.dataset.command === 'restore').catch((error) => notice(error.message,true));
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[CORE.STORAGE_KEY]) { state = changes[CORE.STORAGE_KEY].newValue || state; render(); } });
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  state = await read();
  if (state.scan?.active) {
    let ownerTab; try { ownerTab = await chrome.tabs.get(state.scan.ownerTabId); } catch {}
    if (!ownerTab || state.scan.ownerTabId === deskId) await change((value) => { value.scan = { ...value.scan, active:false, phase:'paused', message:'The previous scan stopped. Resume keeps completed inbox pages.' }; });
  }
  render();
  if (!state.scan) notice('Ready to scan the signed-in eBay account.');
})();
