(() => {
  const core = globalThis.GLDN_EBAY_PRICE_CORE;
  let queue = Promise.resolve();
  async function handle(message, sender) {
    const sourceUrl = sender.url || sender.tab?.url || '';
    if (sender.id !== chrome.runtime.id || (sender.frameId || 0) !== 0
      || !Number.isInteger(sender.tab?.id) || !core.ebayUrl(sourceUrl)) {
      throw new Error('Price preparation requires the originating eBay tab.');
    }
    const key = `gldnPriceIncrease:${sender.tab.id}`;
    const stored = await chrome.storage.session.get(key);
    let run = stored[key];
    if (!core.fresh(run)) run = null;
    if (message.action === 'get') return { run };
    if (message.action === 'cancel') {
      await chrome.storage.session.remove(key);
      return { run: null };
    }
    const local = await chrome.storage.local.get(['gldnStopRequested', ...globalThis.GLDN_FOUNDATION.workflowStateKeys]);
    if (local.gldnStopRequested) throw new Error('Stop is active. Reset it before preparing a price.');
    const busy = globalThis.GLDN_FOUNDATION.activeWorkflowEntries(local);
    if (busy.length) throw new Error('Finish or pause the running marketplace workflow before preparing a price.');
    if (message.action === 'begin') {
      if (run) return { run, resumed: true };
      if (!core.isEditor(sourceUrl) && !core.itemId(sourceUrl)
        && !/\/(?:mesh|sh)\/ord\/details(?:\/|$)/i.test(new URL(sourceUrl).pathname)) {
        throw new Error('Open one eBay Order Details page, listing, or native Revise page.');
      }
      if (core.itemId(sourceUrl) && core.itemId(sourceUrl) !== message.itemId) throw new Error('Listing identity changed.');
      run = core.createRun({ itemId: message.itemId, title: message.title, sourceUrl });
    } else if (message.action === 'bind-editor') {
      run = core.bindEditor(run, sourceUrl, message.editorUrl);
      if (message.title) run.title = String(message.title).trim().slice(0, 200);
    } else if (message.action === 'adopt-editor') {
      run = core.adoptEditor(run, sourceUrl, message.title);
    } else if (message.action === 'plan') {
      const result = core.plan(run, sourceUrl, message.value);
      await chrome.storage.session.set({ [key]: result.run });
      return result;
    } else if (message.action === 'applied') {
      if (!core.applyAllowed(run, sourceUrl, message.value) || core.cents(message.value) !== run.newCents) {
        throw new Error('The edited price did not match the prepared ten-cent increase.');
      }
      run = { ...run, phase: 'applied' };
    } else throw new Error('Unknown price preparation request.');
    await chrome.storage.session.set({ [key]: run });
    return { run };
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'ebayPriceIncrease') return false;
    const task = queue.then(() => handle(message, sender));
    queue = task.catch(() => {});
    task.then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (!change.url) return;
    queue = queue.then(async () => {
      const key = `gldnPriceIncrease:${tabId}`;
      const stored = await chrome.storage.session.get(key);
      const run = stored[key];
      if (core.fresh(run) && run.phase === 'opening') {
        await chrome.storage.session.set({ [key]: core.observeNavigation(run, change.url) });
      } else if (core.fresh(run) && run.phase === 'applied'
        && core.editorKey(change.url) !== core.editorKey(run.editorUrl)) {
        // Leaving the revision clears the helper, without asserting that eBay saved it.
        await chrome.storage.session.remove(key);
      }
    }).catch(() => {});
  });
  chrome.tabs.onRemoved.addListener(tabId => {
    queue = queue.then(() => chrome.storage.session.remove(`gldnPriceIncrease:${tabId}`)).catch(() => {});
    return queue;
  });
})();
