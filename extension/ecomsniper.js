(() => {
  if (window.__JUICE_H8ER_ECOMSNIPER__) return;
  window.__JUICE_H8ER_ECOMSNIPER__ = true;

  const U = window.OrderNoteUtils;
  let panel;
  let statusElement;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));

  function status(message, type = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  }

  function visibleControls() {
    return [...document.querySelectorAll("button, a, input, select, textarea, [role='button']")]
      .filter((element) => U.isVisible(element));
  }

  function textOf(element) {
    return String([
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.value,
      element.innerText,
      element.textContent
    ].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();
  }

  function findControl(pattern) {
    return visibleControls().find((element) => pattern.test(textOf(element)));
  }

  function clickControl(pattern, label) {
    const control = findControl(pattern);
    if (!control) return false;
    control.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    control.click();
    control.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    status(label || `Clicked ${textOf(control)}`, "ready");
    return true;
  }

  function setNativeValue(element, value) {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(element, String(value));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function selectByText(select, matcher) {
    const option = [...select.options].find((item) => matcher.test(item.textContent || item.value || ""));
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setCheckboxNear(labelPattern, checked) {
    const labels = [...document.querySelectorAll("label")].filter((label) => labelPattern.test(textOf(label)));
    for (const label of labels) {
      const input = label.querySelector("input[type='checkbox']") || document.getElementById(label.getAttribute("for"));
      if (input && input.checked !== checked) {
        input.click();
        return true;
      }
    }
    const rows = [...document.querySelectorAll("div, p, li, tr")].filter((row) => U.isVisible(row) && labelPattern.test(textOf(row)));
    for (const row of rows) {
      const input = row.querySelector("input[type='checkbox']");
      if (input && input.checked !== checked) {
        input.click();
        return true;
      }
    }
    return false;
  }

  function fillInputNear(labelPattern, value) {
    const containers = [...document.querySelectorAll("label, div, p, tr, section")]
      .filter((element) => U.isVisible(element) && labelPattern.test(textOf(element)));
    for (const container of containers) {
      const input = container.querySelector("input:not([type='checkbox']):not([type='radio']), textarea");
      if (input) {
        setNativeValue(input, value);
        return true;
      }
    }
    return false;
  }

  async function runCompetitorScanner() {
    const selects = [...document.querySelectorAll("select")].filter(U.isVisible);
    selects.forEach((select) => {
      selectByText(select, /^on$/i);
      selectByText(select, /last\s*30\s*days/i);
      selectByText(select, /^1$/i);
    });
    status("Scanner settings set: sold history on, last 30 days, speed 1.", "ready");
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!clickControl(/^run$/i, "Running Competitor Scanner.")) {
      status("Could not find Run on this EcomSniper page.", "error");
    }
  }

  async function copyScannerTitles() {
    clickControl(/show\s+all\s+items/i, "Showing all scanned items.");
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!clickControl(/view\s+titles/i, "Opening titles list.")) {
      status("Could not find View Titles. Run/show scanner results first.", "error");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (!clickControl(/copy\s+to\s+clipb?oard/i, "Copied scanner titles to clipboard.")) {
      const textarea = [...document.querySelectorAll("textarea")].filter(U.isVisible).sort((a, b) => b.value.length - a.value.length)[0];
      if (textarea?.value) {
        await navigator.clipboard.writeText(textarea.value);
        status(`Copied ${textarea.value.split(/\n+/).filter(Boolean).length.toLocaleString()} titles to clipboard.`, "completed");
      } else {
        status("Could not find Copy to Clipboard or a titles textarea.", "error");
      }
      return;
    }
    await storageSet({ ecomSniperBulkTitlesCopiedAt: new Date().toISOString() });
  }

  async function prepProductHunter() {
    clickControl(/open\s+product\s+hunter|product\s+hunter/i, "Opening Product Hunter.");
    await new Promise((resolve) => setTimeout(resolve, 700));
    fillInputNear(/number\s+of\s+items/i, "2");
    fillInputNear(/min\s+price/i, "0");
    fillInputNear(/max\s+price/i, "150");
    fillInputNear(/thread\s+count/i, "2");
    fillInputNear(/min(?:imum)?\s+reviews/i, "10");
    fillInputNear(/max(?:imum)?\s+reviews/i, "9999");
    [
      /amazon\s+choice/i,
      /best\s+seller/i,
      /highest\s+reviewed/i,
      /don't\s+get\s+duplicate/i,
      /don't\s+get\s+zero/i,
      /remove\s+books/i,
      /get\s+items\s+with\s+max\s+delivery/i
    ].forEach((pattern) => setCheckboxNear(pattern, true));
    const clip = await navigator.clipboard.readText().catch(() => "");
    const textarea = [...document.querySelectorAll("textarea")].filter(U.isVisible).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    if (textarea && clip.trim()) setNativeValue(textarea, clip.trim());
    clickControl(/^import$/i, "Imported copied scanner titles.");
    status("Product Hunter settings/import prepared. Review, then Search Titles.", "completed");
  }

  function createPanel() {
    if (document.getElementById("gldn-ops-ecomsniper-panel")) return;
    panel = document.createElement("div");
    panel.id = "gldn-ops-ecomsniper-panel";
    panel.className = "gldn-order-panel";
    panel.innerHTML = `
      <div class="gldn-panel-heading">
        <img class="gldn-logo-image" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="GLDN Ops">
        <div class="gldn-panel-title">GLDN Ops <span class="gldn-version">v3.4.25</span></div>
        <div class="gldn-drag-grip" aria-hidden="true">::</div>
      </div>
      <button type="button" data-action="run-scanner" class="gldn-primary">Run Scanner Settings</button>
      <button type="button" data-action="copy-titles" class="gldn-secondary">Copy Scanner Titles</button>
      <button type="button" data-action="product-hunter" class="gldn-warning">Prep Product Hunter</button>
      <div class="gldn-status">EcomSniper tools ready.</div>
    `;
    document.documentElement.appendChild(panel);
    U.makePanelDraggable(panel, "gldnEcomSniperPanelPosition");
    statusElement = panel.querySelector(".gldn-status");
    panel.querySelector("[data-action='run-scanner']").addEventListener("click", runCompetitorScanner);
    panel.querySelector("[data-action='copy-titles']").addEventListener("click", copyScannerTitles);
    panel.querySelector("[data-action='product-hunter']").addEventListener("click", prepProductHunter);
  }

  createPanel();
})();
