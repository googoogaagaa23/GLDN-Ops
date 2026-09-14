'use strict';
const VIOLATION_STATE = 'gldnViolationHistoryScan';
const VIOLATION_LOCAL = 'gldnViolationHistoryLocal';
const VIOLATION_SHARED = 'gldnViolationHistoryShared';
let violationScanPromise = null;
let violationRefreshPromise = null;
let violationStop = false;

async function refreshViolationHistory(force = false) {
  if (violationRefreshPromise) return violationRefreshPromise;
  violationRefreshPromise = (async () => {
    const stored = await storageGet([VIOLATION_SHARED, VIOLATION_LOCAL]);
    const cached = stored[VIOLATION_SHARED];
    const merge = (shared) => ({ ...shared, records: GLDN_VIOLATION_HISTORY.mergeRecords(shared.records, stored[VIOLATION_LOCAL]) });
    if (!force && cached?.syncedAt && Date.now() - Date.parse(cached.syncedAt) < 3600000) return merge(cached);
    try {
      let records = [], offset = 0, revision = null;
      for (let page = 0; page < 40; page++) {
        const response = await postToDashboard('policyIncidentRead', { offset });
        if (response.schemaVersion !== 1 || response.offset !== offset || !Array.isArray(response.records)) throw new Error('Shared policy history returned an unsupported response.');
        if (revision !== null && revision !== response.revision) throw new Error('Shared history changed during download. Sync again to load one consistent version.');
        revision = response.revision;
        records.push(...response.records);
        if (response.nextOffset === null) {
          if (records.length !== response.total || GLDN_VIOLATION_HISTORY.mergeRecords(records).length !== records.length) throw new Error('Shared history is incomplete or has invalid records.');
          const next = { records, revision, syncedAt: new Date().toISOString(), error: '' };
          await storageSet({ [VIOLATION_SHARED]: next });
          return merge(next);
        }
        if (response.nextOffset !== offset + response.records.length || !response.records.length) throw new Error('Shared history pagination is incomplete.');
        offset = response.nextOffset;
      }
      throw new Error('Shared history exceeds the supported capacity. No records were discarded.');
    } catch (error) {
      await storageSet({ [VIOLATION_SHARED]: { ...(cached || {}), error: error.message } });
      throw new Error('Shared removal history could not refresh: ' + error.message);
    }
  })().finally(() => { violationRefreshPromise = null; });
  return violationRefreshPromise;
}

async function syncViolationHistory() {
  const stored = await storageGet([VIOLATION_LOCAL]);
  const local = GLDN_VIOLATION_HISTORY.mergeRecords(stored[VIOLATION_LOCAL]);
  const remote = await refreshViolationHistory(true);
  const remoteMap = new Map(remote.records.map((r) => [r.id, r]));
  // Compare against the remote-only cache; local records must never count as an acknowledgement.
  const shared = (await storageGet([VIOLATION_SHARED]))[VIOLATION_SHARED];
  remoteMap.clear();
  for (const row of shared.records) remoteMap.set(row.id, row);
  const pending = local.filter((r) => {
    const remoteRow = remoteMap.get(r.id);
    return !remoteRow || remoteRow.lastSeenAt < r.lastSeenAt || GLDN_VIOLATION_HISTORY.fingerprint([remoteRow]) !== GLDN_VIOLATION_HISTORY.fingerprint([r]);
  });
  for (let i = 0; i < pending.length; i += 100) {
    const record = recordWithSyncId('policyIncidentBatch', { records: pending.slice(i, i + 100) });
    try {
      const saved = await postToDashboard('policyIncidentBatch', record);
      if (saved.count !== record.records.length || !Array.isArray(saved.ids) || record.records.some((r) => !saved.ids.includes(r.id))) throw new Error('The shared save did not acknowledge every incident.');
      await removeQueuedDashboardSync(record.syncId);
    } catch (error) {
      await enqueueDashboardSync('policyIncidentBatch', record, error.message);
      throw new Error('History remains saved on this profile; shared save is pending. ' + error.message);
    }
  }
  const verified = await refreshViolationHistory(true);
  const verifiedRemote = (await storageGet([VIOLATION_SHARED]))[VIOLATION_SHARED].records;
  if (local.some((r) => !verifiedRemote.some((v) => v.id === r.id && v.lastSeenAt >= r.lastSeenAt))) throw new Error('Shared save is not yet verified. Local history was preserved.');
  return { ok: true, ...verified, uploaded: pending.length };
}

async function getViolationHistoryStatus(refresh = false) {
  if (refresh) await refreshViolationHistory(true);
  const stored = await storageGet([VIOLATION_STATE, VIOLATION_LOCAL, VIOLATION_SHARED]);
  let state = stored[VIOLATION_STATE] || null;
  if (state?.active && !violationScanPromise) {
    state = { ...state, active: false, phase: 'paused', message: 'The scan was interrupted. Resume keeps its saved progress.' };
    await storageSet({ [VIOLATION_STATE]: state });
    if (state.reservationToken) await releaseWorkflowStart(state.reservationToken);
  }
  return { ok: true, state, shared: stored[VIOLATION_SHARED] || null,
    records: GLDN_VIOLATION_HISTORY.mergeRecords(stored[VIOLATION_SHARED]?.records, stored[VIOLATION_LOCAL]) };
}

async function violationReader(tabId, method, arg) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['violation-history-reader.js'] });
  const result = await chrome.scripting.executeScript({ target: { tabId }, func: (name, value) => {
    try { return { ok: true, data: globalThis.GLDN_VIOLATION_READER[name](value) }; }
    catch (error) { return { ok: false, error: error.message }; }
  }, args: [method, arg || ''] });
  const response = result?.[0]?.result;
  if (!response?.ok) throw new Error(response?.error || 'The eBay page did not respond.');
  return response.data;
}

async function waitViolationPage(tabId, method, arg, expectedStart) {
  let failure;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (violationStop) throw new Error('Paused safely. Resume continues from the saved checkpoint.');
    try {
      const data = await violationReader(tabId, method, arg);
      if (expectedStart && data.start !== expectedStart) throw new Error('Waiting for the next exact violation page.');
      return data;
    } catch (error) {
      if (/SIGN_IN_REQUIRED/.test(error.message)) throw error;
      failure = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw failure;
}

async function startViolationHistoryScan(request, sender) {
  if (violationScanPromise) return { ok: false, error: 'The removal-history scan is already running.' };
  await getViolationHistoryStatus();
  const reservation = await claimWorkflowStart('ebay-violation-history', 'Removed listing history', sender);
  if (!reservation?.ok) return reservation;
  violationStop = false;
  violationScanPromise = runViolationHistoryScan(request, reservation)
    .catch(async (error) => {
      const state = (await storageGet([VIOLATION_STATE]))[VIOLATION_STATE];
      if (!state) return;
      await storageSet({ [VIOLATION_STATE]: { ...state, active: false, phase: violationStop ? 'paused' : 'error', message: error.message } });
    }).finally(async () => {
      await releaseWorkflowStart(reservation.token);
      violationScanPromise = null;
      violationStop = false;
    });
  return { ok: true, started: true };
}

async function stopViolationHistoryScan() {
  violationStop = true;
  return { ok: true, message: 'Pausing after the current read. Saved history is retained.' };
}

async function runViolationHistoryScan(request, reservation) {
  const identity = await currentPolicyListingIdentity();
  const stored = await storageGet([VIOLATION_STATE, VIOLATION_LOCAL]);
  const old = stored[VIOLATION_STATE];
  const resume = request.resume === true && old?.account;
  let state = resume ? { ...old, active: true, message: '' } : {
    active: true, runId: crypto.randomUUID(), phase: 'indexing', stage: 'indexing',
    account: '', computerLabel: identity.computerLabel, records: [], detailsRead: 0,
    pageUrl: 'https://www.ebay.com/sh/lst/ended', pagesRead: 0, expectedStart: 0, total: null
  };
  state.reservationToken = reservation.token;
  await storageSet({ [VIOLATION_STATE]: state });
  let tab;
  const save = async (message) => {
    const current = (await storageGet([VIOLATION_STATE]))[VIOLATION_STATE];
    if (!current || current.runId !== state.runId) throw new Error('The scan was reset. Previously captured history remains saved.');
    if (violationStop) throw new Error('Paused safely. Resume keeps completed reads.');
    state.message = message;
    state.updatedAt = new Date().toISOString();
    await storageSet({ [VIOLATION_STATE]: state });
  };
  try {
    // Confirm the current seller before resuming any saved account's case URLs.
    tab = await createChromeTab({ url: 'https://www.ebay.com/sh/lst/ended', active: false });
    await waitForControlTabSettled(tab.id, 30000);
    let first = await waitViolationPage(tab.id, 'readPage');
    if (state.account && state.account !== first.account) throw new Error('The signed-in eBay seller changed. This checkpoint belongs to ' + state.account + '.');
    state.account = first.account;
    if (state.stage === 'indexing') {
      let url = resume ? state.pageUrl : first.filterUrl;
      if (!url) throw new Error('The policy-violations View Listings link was not visible. Open Inactive listings and verify the banner.');
      let expected = resume ? state.expectedStart : 0;
      for (let page = state.pagesRead; page < 250; page++) {
        state.pageUrl = url;
        state.expectedStart = expected;
        await save('Reading violation page ' + (page + 1) + ' for ' + state.account + '.');
        await updateChromeTab(tab.id, { url, active: false });
        await waitForControlTabSettled(tab.id, 30000);
        const snapshot = await waitViolationPage(tab.id, 'readPage', '', expected);
        if (snapshot.account !== state.account || snapshot.needsFilter) throw new Error('The violation filter or seller changed.');
        const at = new Date().toISOString();
        state.records = GLDN_VIOLATION_HISTORY.mergeRecords(state.records, snapshot.rows.map((r) => ({ ...r, computerLabel: identity.computerLabel, lastSeenAt: at, firstSeenAt: at })));
        state.total = snapshot.total;
        state.pagesRead = page + 1;
        await storageSet({ [VIOLATION_LOCAL]: GLDN_VIOLATION_HISTORY.mergeRecords(stored[VIOLATION_LOCAL], state.records) });
        if (snapshot.end >= snapshot.total) {
          state.stage = 'details';
          break;
        }
        expected = snapshot.end + 1;
        if (snapshot.nextUrl) url = snapshot.nextUrl;
        else if (snapshot.nextButton) {
          await violationReader(tab.id, 'nextPage');
          const next = await waitViolationPage(tab.id, 'readPage', '', expected);
          url = next.sourceUrl;
        } else throw new Error('eBay did not expose a Next page control. Saved rows are kept.');
        state.pageUrl = url;
        state.expectedStart = expected;
        await save(state.records.length + ' violation listings indexed.');
      }
      if (state.stage !== 'details') throw new Error('The bounded page limit was reached. The scan was preserved.');
    }
    state.phase = 'details';
    for (let i = state.detailsRead || 0; i < state.records.length; i++) {
      if (violationStop) throw new Error('Paused safely. Resume continues at the next case.');
      let row = state.records[i];
      await save('Reading eBay reason ' + (i + 1) + ' of ' + state.records.length + '.');
      if (row.caseUrl) {
        try {
          await updateChromeTab(tab.id, { url: row.caseUrl, active: false });
          await waitForControlTabSettled(tab.id, 30000);
          const detail = await waitViolationPage(tab.id, 'readCase', row.caseUrl);
          row = { ...row, ...detail, title: detail.title || row.title, caseReadAt: new Date().toISOString(), caseReadError: '' };
        } catch (error) {
          if (violationStop || /SIGN_IN_REQUIRED/.test(error.message)) throw error;
          row = { ...row, caseReadError: error.message };
        }
      }
      state.records[i] = row;
      state.detailsRead = i + 1;
      await storageSet({ [VIOLATION_LOCAL]: GLDN_VIOLATION_HISTORY.mergeRecords(stored[VIOLATION_LOCAL], state.records) });
      await save(state.detailsRead + ' of ' + state.records.length + ' case explanations checked.');
    }
    state.phase = 'syncing';
    await save('Sharing prevention history with the other GLDN computers.');
    const result = await syncViolationHistory();
    state.active = false;
    state.stage = 'complete';
    state.phase = 'complete';
    await save(state.records.length + ' listings checked for ' + state.account + '. ' + result.records.length + ' shared history records available.');
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}
