(() => {
  if (globalThis.GLDN_EBAY_PRICE_INCREASE) return;
  const core = globalThis.GLDN_EBAY_PRICE_CORE;
  const U = globalThis.OrderNoteUtils;
  let running = false;
  let timer;
  let dismissedHref = '';
  const native = element => !element.closest('[id^="gldn-"], .gldn-modal-backdrop');
  const text = element => String(element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const request = async (action, data = {}) => {
    const result = await chrome.runtime.sendMessage({ type: 'ebayPriceIncrease', action, ...data });
    if (!result?.ok) throw new Error(result?.error || 'Price helper could not connect. Refresh this eBay tab.');
    return result;
  };
  function labeledFields(label) {
    const wanted = label.toLowerCase();
    return [...document.querySelectorAll('input, select, button[aria-haspopup="listbox"]')].filter(element => {
      if (!native(element) || !U.isVisible(element)) return false;
      const labels = [...(element.labels || [])].map(text);
      const ids = String(element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      labels.push(...ids.map(id => text(document.getElementById(id))), element.getAttribute('aria-label') || '');
      if (labels.some(value => value.trim().toLowerCase().replace(/\s*\(.*\)$/, '') === wanted)) return true;
      // eBay also renders the label beside an input without a for attribute.
      const container = element.parentElement?.parentElement;
      const near = [...(container?.querySelectorAll('label') || [])].filter(native).map(text);
      return container?.querySelectorAll('input, select').length === 1 && near.some(value => value.toLowerCase() === wanted);
    });
  }
  function priceField() {
    if (!core.isEditor(location.href)) throw new Error('Open the native eBay Revise page.');
    const fields = labeledFields('Item price').filter(element => element.tagName === 'INPUT' && !element.disabled && !element.readOnly);
    if (fields.length !== 1) throw new Error('One exact editable Item price field is required. No fields were changed.');
    const formats = labeledFields('Format');
    const format = formats.map(element => element.tagName === 'SELECT'
      ? text(element.selectedOptions?.[0]) : element.value || text(element)).filter(Boolean).join(' ');
    const variations = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(native)
      .filter(element => /^Variations(?:\s|$)/i.test(text(element)));
    if (!/^Buy (?:It )?Now$/i.test(format)) throw new Error('Only a verified Buy It Now listing can use the ten-cent shortcut.');
    if (variations.some(element => !/Variations are not available because the original listing did not include them\./i
      .test(text(element.parentElement?.parentElement?.parentElement)))) {
      throw new Error('Variation prices need separate review. No prices were changed.');
    }
    return fields[0];
  }
  function listingChoices() {
    const choices = new Map();
    for (const anchor of document.querySelectorAll('a[href]')) {
      if (!native(anchor)) continue;
      const id = core.itemId(anchor.href);
      if (!id) continue;
      const title = text(anchor);
      if (!title || /^\d+$/.test(title)) continue;
      const existing = choices.get(id);
      if (!existing || title.length > existing.title.length) choices.set(id, { itemId: id, title, url: anchor.href });
    }
    return [...choices.values()];
  }
  function nativeReviseLink() {
    const links = [...document.querySelectorAll('a[href]')].filter(native)
      .filter(anchor => U.isVisible(anchor) && core.isRevisionLink(anchor.href))
      .filter(anchor => /\brev(is(?:e|ing)|ision)\b/i.test(text(anchor) || anchor.getAttribute('aria-label') || ''));
    const destinations = new Map(links.map(anchor => [core.editorKey(anchor.href) || core.entryItemId(anchor.href), anchor]));
    return destinations.size === 1 ? [...destinations.values()][0] : null;
  }
  function surface() {
    let box = document.getElementById('gldn-price-increase');
    if (!box) {
      box = document.createElement('section');
      box.id = 'gldn-price-increase';
      box.className = 'gldn-price-helper';
      box.setAttribute('aria-label', 'GLDN price increase');
      box.innerHTML = '<strong>GLDN Price +$0.10</strong><div data-price-title></div><div data-price-amount></div><div class="gldn-price-actions"><button type="button" data-price-start>Prepare +$0.10</button><button type="button" data-price-cancel>Close helper</button></div><div data-price-status role="status" aria-live="polite"></div>';
      document.documentElement.appendChild(box);
      box.querySelector('[data-price-start]').addEventListener('click', () => start().catch(showError));
      box.querySelector('[data-price-cancel]').addEventListener('click', async () => {
        try { await request('cancel'); dismissedHref = location.href; box.remove(); } catch (error) { showError(error); }
      });
    }
    return box;
  }
  function showError(error) {
    surface().querySelector('[data-price-status]').textContent = error.message;
  }
  function render(run, status = '') {
    const box = surface();
    box.querySelector('[data-price-title]').textContent = [run?.title, run?.itemId].filter(Boolean).join(' | ');
    box.querySelector('[data-price-amount]').textContent = Number.isInteger(run?.oldCents)
      ? `$${core.money(run.oldCents)} > $${core.money(run.newCents)}` : '';
    const button = box.querySelector('[data-price-start]');
    button.textContent = run?.phase === 'item' ? 'Open native Revise' : run?.phase === 'planned' ? 'Apply prepared price' : 'Prepare +$0.10';
    button.hidden = run?.phase === 'applied';
    box.querySelector('[data-price-status]').textContent = status || (run?.phase === 'applied'
      ? 'Price prepared, not saved. Review the listing and click eBay Revise it. Closing this helper does not undo the edited price.'
      : '');
  }
  async function apply(run) {
    const field = priceField();
    await request('plan', { value: field.value });
    if (!core.applyAllowed(run, location.href, field.value)) throw new Error('The price changed since preparation. No further changes were made.');
    const target = core.money(run.newCents);
    if (core.cents(field.value) !== run.newCents) U.setNativeValue(field, target);
    await new Promise(resolve => setTimeout(resolve, 100));
    if (core.cents(field.value) !== run.newCents) throw new Error('eBay did not retain the prepared price. Review it manually.');
    const result = await request('applied', { value: field.value });
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field.focus({ preventScroll: true });
    render(result.run);
  }
  async function openEditor(run) {
    if (core.itemId(location.href) !== run.itemId) throw new Error('Open the exact selected listing again.');
    const anchor = nativeReviseLink();
    if (!anchor) { render(run, 'Native Revise link not available yet. Open it manually, or retry once the listing finishes loading.'); return; }
    const result = await request('bind-editor', { editorUrl: anchor.href, title: text(document.querySelector('h1')) });
    location.assign(result.run.editorUrl);
  }
  async function beginChoice(choice) {
    const result = await request('begin', choice);
    if (result.resumed) return continueRun(result.run, true);
    location.assign(choice.url);
  }
  async function continueRun(run, deliberate = false) {
    if (run.phase === 'item') {
      if (core.itemId(location.href) === run.itemId) return openEditor(run);
      if (deliberate) render(run, 'An earlier price helper is still open. Close it before starting a different listing.');
      return;
    }
    if (run.phase === 'opening' && core.isEditor(location.href)) {
      const title = labeledFields('Item title')[0]?.value;
      if (!title) return;
      run = (await request('adopt-editor', { title })).run;
    }
    if (core.editorKey(location.href) !== core.editorKey(run.editorUrl)) {
      if (deliberate) render(run, 'An earlier revision is still prepared. Check it before closing this helper to start a new increase.');
      return;
    }
    render(run);
    if (run.phase === 'applied') {
      const current = core.cents(priceField().value);
      if (current === run.oldCents) {
        if (deliberate) return apply(run);
        const box = surface();
        box.querySelector('[data-price-start]').hidden = false;
        box.querySelector('[data-price-start]').textContent = 'Restore prepared price';
        box.querySelector('[data-price-status]').textContent = 'The page reloaded without this edit. Restore the original prepared amount, or close the helper. No additional increase will be calculated.';
      } else if (current !== run.newCents) {
        render(run, 'The native price changed after preparation. Review it manually. No further changes were made.');
      }
      return;
    }
    if (run.phase === 'planned') { if (deliberate) await apply(run); return; }
    const field = priceField();
    const result = await request('plan', { value: field.value });
    render(result.run);
    if (result.claimed) await apply(result.run);
  }
  async function start() {
    if (running) return;
    dismissedHref = '';
    running = true;
    try {
      const saved = await request('get');
      if (saved.run) return await continueRun(saved.run, true);
      if (core.isEditor(location.href)) {
        priceField();
        const title = labeledFields('Item title')[0]?.value || 'Current listing revision';
        return await continueRun((await request('begin', { title })).run, true);
      }
      const id = core.itemId(location.href);
      if (id) {
        const title = text(document.querySelector('h1'));
        const result = await request('begin', { itemId: id, title });
        return await openEditor(result.run);
      }
      if (!/\/(?:mesh|sh)\/ord\/details(?:\/|$)/i.test(location.pathname)) throw new Error('Open the matching eBay Order Details page first.');
      const choices = listingChoices();
      if (!choices.length) throw new Error('No exact item link was found on this order. Open its listing and try again.');
      if (choices.length === 1) return await beginChoice(choices[0]);
      const box = surface();
      box.querySelector('[data-price-status]').textContent = 'Choose the exact listing from this order.';
      box.querySelector('[data-price-start]').hidden = true;
      box.querySelector('[data-price-choices]')?.remove();
      const list = document.createElement('div');
      list.dataset.priceChoices = '';
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = `${choice.title} | ${choice.itemId}`;
        button.addEventListener('click', () => beginChoice(choice).catch(showError));
        list.appendChild(button);
      }
      box.appendChild(list);
    } finally { running = false; }
  }
  async function resume() {
    if (running) return;
    running = true;
    try {
      const saved = await request('get');
      if (saved.run && (core.itemId(location.href) === saved.run.itemId || core.isEditor(location.href))) {
        await continueRun(saved.run);
      } else if (core.isEditor(location.href) && dismissedHref !== location.href) surface();
      else document.getElementById('gldn-price-increase')?.remove();
    } catch (error) {
      if (/context invalidated/i.test(error.message)) { clearInterval(timer); return; }
      if (document.getElementById('gldn-price-increase') || core.isEditor(location.href)) showError(error);
    } finally { running = false; }
  }
  globalThis.GLDN_EBAY_PRICE_INCREASE = Object.freeze({ start, resume });
  timer = setInterval(resume, 3000);
  resume();
})();
