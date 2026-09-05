(() => {
  const PAYLOAD_PREFIX = "GLDN_ORDER_NOTE_V1:";

  const normalizeText = (value = "") => value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/\b(apartment)\b/g, "apt")
    .replace(/\s+/g, " ")
    .trim();

  const moneyToNumber = (value) => {
    if (typeof value === "number") return value;
    const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatMoney = (value) => {
    const number = moneyToNumber(value);
    return number === null ? "" : number.toFixed(2);
  };

  const isVisible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };

  const findVisibleByText = (text, selector = "button, a, [role='button'], li, span, div") => {
    const target = normalizeText(text);
    return [...document.querySelectorAll(selector)].find((element) => {
      if (!isVisible(element)) return false;
      const elementText = normalizeText(element.innerText || element.textContent || "");
      return elementText === target;
    }) || null;
  };

  const findVisibleContainingText = (text, selector = "button, a, [role='button'], li") => {
    const target = normalizeText(text);
    return [...document.querySelectorAll(selector)].find((element) => {
      if (!isVisible(element)) return false;
      const elementText = normalizeText(element.innerText || element.textContent || "");
      return elementText.includes(target);
    }) || null;
  };

  const getBodyLines = () => (document.body?.innerText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const findMoneyNearLabel = (labelPatterns) => {
    const lines = getBodyLines();
    const patterns = labelPatterns.map((pattern) => pattern instanceof RegExp ? pattern : new RegExp(pattern, "i"));
    const moneyRegex = /\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/;

    for (let i = 0; i < lines.length; i += 1) {
      if (!patterns.some((pattern) => pattern.test(lines[i]))) continue;

      const sameLine = lines[i].match(moneyRegex);
      if (sameLine) return moneyToNumber(sameLine[1]);

      for (let offset = 1; offset <= 5; offset += 1) {
        for (const index of [i + offset, i - offset]) {
          if (index < 0 || index >= lines.length) continue;
          const match = lines[index].match(moneyRegex);
          if (match) return moneyToNumber(match[1]);
        }
      }
    }
    return null;
  };

  const parseDateToMD = (raw) => {
    if (!raw) return "";
    const cleaned = String(raw)
      .replace(/\b(today|tomorrow|arriving|delivery|estimated|fastest|free)\b[:,]?/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const numeric = cleaned.match(/\b(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\s*[\/-]\s*\d{2,4})?\b/);
    if (numeric) return `${Number(numeric[1])}/${Number(numeric[2])}`;

    const months = {
      january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
      april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
      august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
      november: 11, nov: 11, december: 12, dec: 12
    };
    const named = cleaned.match(/\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec)\s+(\d{1,2})\b/i);
    if (named) return `${months[named[1].toLowerCase()]}/${Number(named[2])}`;
    return "";
  };

  const extractEtasFromText = (text) => {
    const candidates = [];
    const patterns = [
      /(?:Arriving|Delivery(?: date)?|Estimated delivery)\s+(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/gi,
      /(?:Arriving|Delivery(?: date)?|Estimated delivery)\s+(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)/gi,
      /(?:Fastest|Amazon Day)\s+(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9}\s+\d{1,2})/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const parsed = parseDateToMD(match[1]);
        if (parsed && !candidates.includes(parsed)) candidates.push(parsed);
      }
    }
    return candidates;
  };

  const tokenSimilarity = (left, right) => {
    const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length > 1));
    const rightTokens = new Set(normalizeText(right).split(" ").filter((token) => token.length > 1));
    if (!leftTokens.size || !rightTokens.size) return null;
    let intersection = 0;
    leftTokens.forEach((token) => {
      if (rightTokens.has(token)) intersection += 1;
    });
    return intersection / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  };

  const setNativeValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const waitFor = async (finder, timeoutMs = 6000, intervalMs = 150) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = finder();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
  };

  let extensionContextInvalidated = false;
  const extensionCleanupCallbacks = new Set();

  const extensionErrorMessage = (error) => String(error?.message || error || "");

  const isExtensionContextInvalidated = (error) => (
    extensionContextInvalidated
    || /extension context invalidated|context invalidated/i.test(extensionErrorMessage(error))
  );

  const markExtensionContextInvalidated = (error) => {
    if (!isExtensionContextInvalidated(error)) return false;
    if (!extensionContextInvalidated) {
      extensionContextInvalidated = true;
      for (const callback of [...extensionCleanupCallbacks]) {
        try { callback(); } catch (_) {}
      }
      extensionCleanupCallbacks.clear();
      window.dispatchEvent(new CustomEvent("gldn-extension-context-invalidated", {
        detail: { message: extensionErrorMessage(error) || "Extension context invalidated." }
      }));
    }
    return true;
  };

  const registerExtensionCleanup = (callback) => {
    if (typeof callback !== "function") return () => {};
    if (extensionContextInvalidated) {
      try { callback(); } catch (_) {}
      return () => {};
    }
    extensionCleanupCallbacks.add(callback);
    return () => extensionCleanupCallbacks.delete(callback);
  };

  const extensionContextAvailable = () => {
    if (extensionContextInvalidated) return false;
    try {
      return Boolean(globalThis.chrome?.runtime?.id);
    } catch (_) {
      return false;
    }
  };

  const recordExtensionLog = async (entry) => {
    if (!globalThis.chrome?.storage?.local || !extensionContextAvailable()) return;
    let version = "";
    try {
      version = chrome.runtime?.getManifest?.().version || "";
    } catch (_) {}
    const payload = {
      at: new Date().toISOString(),
      source: entry?.source || "page",
      level: entry?.level || "error",
      operation: String(entry?.operation || entry?.phase || "").slice(0, 120),
      message: String(entry?.message || "Unknown extension issue").slice(0, 800),
      detail: String(entry?.detail || "").slice(0, 1200),
      page: location.href,
      version
    };
    if (globalThis.chrome?.runtime?.sendMessage && extensionContextAvailable()) {
      const response = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: "recordExtensionLog", entry: payload }, (result) => {
            let error = null;
            try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
            if (error) {
              markExtensionContextInvalidated(error);
              resolve(null);
            } else resolve(result || null);
          });
        } catch (error) {
          markExtensionContextInvalidated(error);
          resolve(null);
        }
      });
      if (response?.ok) return response.entry || payload;
    }
    if (!extensionContextAvailable()) return;
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(["gldnErrorLog", "computerLabel", "ebayAccountLabel"], (result) => {
          let error = null;
          try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
          if (error) {
            markExtensionContextInvalidated(error);
            resolve(null);
            return;
          }
          const enriched = {
            ...payload,
            computerLabel: String(entry?.computerLabel || result.computerLabel || ""),
            ebayAccountLabel: String(entry?.ebayAccountLabel || result.ebayAccountLabel || "")
          };
          const current = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
          chrome.storage.local.set({ gldnErrorLog: [enriched, ...current].slice(0, 80) }, () => resolve(enriched));
        });
      } catch (error) {
        markExtensionContextInvalidated(error);
        resolve(null);
      }
    });
  };

  const runtimeMessage = (message, timeoutMs = 30000) => new Promise((resolve) => {
    if (!globalThis.chrome?.runtime?.sendMessage || !extensionContextAvailable()) {
      resolve({ ok: false, error: "Chrome extension runtime is not available on this page." });
      return;
    }
    const timeout = setTimeout(() => {
      resolve({ ok: false, error: "Extension request timed out." });
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        let error = null;
        try { error = chrome.runtime.lastError; } catch (caught) { error = caught; }
        if (error) {
          markExtensionContextInvalidated(error);
          resolve({ ok: false, error: extensionErrorMessage(error) });
          return;
        }
        resolve(response || { ok: false, error: "No response from extension background service." });
      });
    } catch (error) {
      clearTimeout(timeout);
      markExtensionContextInvalidated(error);
      resolve({ ok: false, error: extensionErrorMessage(error) });
    }
  });

  const pendingReviewReleases = new Set();
  const claimWorkflowStart = async (workflowId, label) => {
    await Promise.resolve();
    await Promise.all([...pendingReviewReleases]);
    const result = await runtimeMessage({ type: "claimWorkflowStart", workflowId, label });
    if (!result?.ok) throw new Error(result?.error || `Could not start ${label || "workflow"}.`);
    return result.token;
  };

  const releaseWorkflowStart = async (token) => {
    if (!token) return { ok: true, released: false };
    return runtimeMessage({ type: "releaseWorkflowStart", token });
  };

  const documentInstanceId = globalThis.crypto?.randomUUID?.() || `document-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const openReviewReset = runtimeMessage({ type: "clearOpenReviewsForTab" });

  const openReviewLifecycles = new WeakMap();
  const registerOpenReview = async (modal) => {
    if (!modal || modal.dataset.gldnOpenReviewToken) return;
    const token = globalThis.crypto?.randomUUID?.() || `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const label = normalizeText(modal.querySelector("h1, h2, h3, [role='heading']")?.textContent || "GLDN review").slice(0, 120);
    modal.dataset.gldnOpenReviewToken = token;
    const lifecycle = { canceled: false, sent: false, pending: null };
    openReviewLifecycles.set(modal, lifecycle);
    lifecycle.pending = (async () => {
      await openReviewReset;
      if (lifecycle.canceled || modal.isConnected === false) return;
      lifecycle.sent = true;
      const result = await runtimeMessage({
      type: "registerOpenReview",
      token,
      label,
      page: location.href,
      documentInstanceId
      });
      if (!result?.ok && !lifecycle.canceled) delete modal.dataset.gldnOpenReviewToken;
    })();
    await lifecycle.pending;
  };

  const releaseOpenReviewsInNode = (node) => {
    if (!(node instanceof Element)) return;
    const modals = [];
    if (node.matches?.(".gldn-modal[data-gldn-open-review-token]")) modals.push(node);
    modals.push(...node.querySelectorAll?.(".gldn-modal[data-gldn-open-review-token]") || []);
    for (const modal of modals) {
      const token = modal.dataset.gldnOpenReviewToken;
      const lifecycle = openReviewLifecycles.get(modal);
      if (lifecycle) {
        lifecycle.canceled = true;
        // Finish any in-flight registration before releasing its background lock.
        const released = lifecycle.pending.then(() => {
          if (lifecycle.sent && token) return runtimeMessage({ type: "releaseOpenReview", token });
        });
        pendingReviewReleases.add(released);
        void released.finally(() => pendingReviewReleases.delete(released));
      } else if (token) {
        runtimeMessage({ type: "releaseOpenReview", token });
      }
    }
  };

  const summarizeFeatureHealth = (result) => {
    const version = result?.version || chrome.runtime?.getManifest?.().version || "?";
    const identity = result?.identity || {};
    const computer = identity.computerLabel || "not set";
    const account = identity.ebayAccountLabel || "none";
    const dashboardText = result?.dashboard?.ok ? "dashboard OK" : `dashboard FAIL: ${result?.dashboard?.error || "unknown"}`;
    const ecomSniperRequired = result?.requirements?.ecomSniperRequired !== false;
    const ecomText = !ecomSniperRequired
      ? "EcomSniper not required"
      : result?.ecomSniper?.ok
        ? "EcomSniper route configured (installation checked when opened)"
        : `EcomSniper FAIL: ${result?.ecomSniper?.error || "unknown"}`;
    const updaterText = result?.updater?.ok
      ? `updater OK (files v${result.updater.diskVersion || result.updater.currentVersion || version})`
      : `updater FAIL: ${result?.updater?.error || "unknown"}`;
    const workflows = Array.isArray(result?.workflows?.workflows) ? result.workflows.workflows : [];
    const workflowText = workflows.length
      ? workflows.every((entry) => entry.approvalReady)
        ? `awaiting review: ${workflows.map((entry) => entry.label).join(", ")}`
        : `busy: ${workflows.map((entry) => entry.label).join(", ")}`
      : "workflow idle";
    const foundation = result?.foundation || {};
    const deployment = foundation.deploymentMode || "unknown";
    const schema = `${Number(foundation.settingsSchemaVersion || 0)}/${foundation.expectedSettingsSchemaVersion || "?"}`;
    const backups = Number(foundation.settingsBackupCount || 0);
    const queued = Number(foundation.dashboardQueuedRecords || 0);
    return `Health ${result?.ok ? "OK" : "CHECK"}: v${version}; computer ${computer}; account ${account}; mode ${deployment}; schema ${schema}; backups ${backups}; queue ${queued}; ${dashboardText}; ${updaterText}; ${workflowText}; ${ecomText}`;
  };

  const saveDashboardSetupCode = (setupCode) => new Promise((resolve) => {
    const key = String(setupCode || "").trim();
    const dashboardUrl = String(globalThis.GLDN_CONFIG?.dashboardUrl || "").trim();
    if (!key) {
      resolve({ ok: false, error: "Dashboard setup code was not entered." });
      return;
    }
    if (key.length < 24) {
      resolve({ ok: false, error: "Dashboard setup code must be at least 24 characters." });
      return;
    }
    if (!dashboardUrl) {
      resolve({ ok: false, error: "Dashboard URL is missing from GLDN Ops config." });
      return;
    }
    chrome.storage.local.set({
      sellerDashboardUrl: dashboardUrl,
      sellerDashboardKey: key
    }, () => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ ok: true });
      }
    });
  });

  const runFeatureHealthCheck = async () => {
    let result = await runtimeMessage({ type: "extensionHealthCheck" });
    if (!result?.ok && /setup code is missing/i.test(String(result?.dashboard?.error || result?.error || ""))) {
      const seeded = await runtimeMessage({ type: "seedDashboardSetupFromLocalConfig" });
      if (seeded?.ok) result = await runtimeMessage({ type: "extensionHealthCheck" });
    }
    return {
      ok: Boolean(result?.ok),
      message: summarizeFeatureHealth(result),
      result
    };
  };

  const promptAndSaveDashboardSetup = async () => {
    const setupCode = window.prompt("Enter GLDN Ops dashboard setup code");
    return saveDashboardSetupCode(setupCode);
  };

  const installExtensionErrorLogging = (source) => {
    window.addEventListener("error", (event) => {
      if (markExtensionContextInvalidated(event.error || event.message)) {
        event.preventDefault();
        return;
      }
      recordExtensionLog({
        source,
        level: "error",
        message: event.message,
        detail: `${event.filename || ""}:${event.lineno || ""}:${event.colno || ""}\n${event.error?.stack || ""}`
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      if (markExtensionContextInvalidated(event.reason)) {
        event.preventDefault();
        return;
      }
      recordExtensionLog({
        source,
        level: "error",
        message: event.reason?.message || String(event.reason || "Unhandled promise rejection"),
        detail: event.reason?.stack || ""
      });
    });
  };



  const makePanelDraggable = (panel, storageKey) => {
    if (!panel || panel.dataset.gldnDraggable === "true") return;
    const handle = panel.querySelector(".gldn-panel-heading");
    if (!handle) return;

    panel.dataset.gldnDraggable = "true";
    handle.classList.add("gldn-drag-handle");
    handle.title = "Drag to move. Double-click to reset.";
    const modeStorageKey = `${storageKey}Mode`;
    const sizeStorageKey = `${storageKey}Size`;
    let savedPosition = null;
    let savedSize = null;
    let settingsMenu = null;

    const clearInlineLayout = () => {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.width = "";
      panel.style.height = "";
    };

    const applySavedSize = () => {
      if (!savedSize || !Number.isFinite(savedSize.width) || !Number.isFinite(savedSize.height)) return;
      const viewportWidth = Math.max(Number(window.innerWidth) || 0, Number(document.documentElement?.clientWidth) || 0);
      const viewportHeight = Math.max(Number(window.innerHeight) || 0, Number(document.documentElement?.clientHeight) || 0);
      panel.style.width = `${Math.min(Math.max(210, savedSize.width), Math.max(210, viewportWidth - 16))}px`;
      panel.style.height = `${Math.min(Math.max(180, savedSize.height), Math.max(180, viewportHeight - 16))}px`;
    };

    const setPanelMode = (mode, persist = true) => {
      const normalized = ["full", "minimized", "side"].includes(mode) ? mode : "full";
      panel.dataset.gldnPanelMode = normalized;
      panel.classList.toggle("gldn-panel-minimized", normalized === "minimized");
      panel.classList.toggle("gldn-panel-side", normalized === "side");
      settingsMenu?.setAttribute("hidden", "");
      if (normalized === "full") {
        clearInlineLayout();
        applySavedSize();
        if (savedPosition) requestAnimationFrame(() => applyPosition(savedPosition.left, savedPosition.top));
      } else {
        clearInlineLayout();
      }
      if (persist) chrome.storage.local.set({ [modeStorageKey]: normalized });
    };

    const modeControls = document.createElement("div");
    modeControls.className = "gldn-panel-mode-controls";
    modeControls.innerHTML = `
      <button type="button" class="gldn-panel-mode-button" data-gldn-panel-mode="minimized" title="Minimize to right edge" aria-label="Minimize to right edge">&#8722;</button>
      <button type="button" class="gldn-panel-mode-button" data-gldn-panel-mode="side" title="Dock as side rail">Side</button>
      <button type="button" class="gldn-panel-mode-button gldn-panel-open-button" data-gldn-panel-mode="full" title="Open panel">Open</button>
    `;
    let grip = handle.querySelector(".gldn-drag-grip");
    if (!grip) {
      grip = document.createElement("div");
      grip.className = "gldn-drag-grip";
      handle.appendChild(grip);
    }
    handle.insertBefore(modeControls, grip || null);

    grip.innerHTML = `
      <button type="button" class="gldn-panel-settings-button" data-gldn-settings-toggle title="Panel settings" aria-label="Panel settings" aria-expanded="false">&#8942;</button>
    `;

    settingsMenu = document.createElement("div");
    settingsMenu.className = "gldn-panel-settings-menu";
    settingsMenu.setAttribute("hidden", "");
    settingsMenu.innerHTML = `
      <div class="gldn-panel-settings-title">Panel settings</div>
      <label class="gldn-panel-settings-field">
        <span>Theme</span>
        <select data-gldn-theme-select></select>
      </label>
      <div class="gldn-theme-preview" data-gldn-theme-preview aria-live="polite"></div>
      <label class="gldn-panel-settings-field">
        <span>Transparency <strong data-gldn-opacity-value>75%</strong></span>
        <input type="range" min="0" max="100" step="1" value="75" data-gldn-opacity-input>
      </label>
      <button type="button" class="gldn-secondary gldn-panel-tour" data-gldn-open-tour>Start feature tour</button>
      <button type="button" class="gldn-secondary gldn-panel-guide" data-gldn-open-guide>Open feature guide</button>
      <button type="button" class="gldn-secondary gldn-panel-reset-layout" data-gldn-reset-layout>Reset panel layout</button>
    `;
    handle.insertAdjacentElement("afterend", settingsMenu);

    const resizeHandle = document.createElement("button");
    resizeHandle.type = "button";
    resizeHandle.className = "gldn-panel-resize-handle";
    resizeHandle.title = "Resize panel";
    resizeHandle.setAttribute("aria-label", "Resize panel");
    panel.appendChild(resizeHandle);

    const settingsButton = grip.querySelector("[data-gldn-settings-toggle]");
    const themeSelect = settingsMenu.querySelector("[data-gldn-theme-select]");
    const themePreview = settingsMenu.querySelector("[data-gldn-theme-preview]");
    const opacityInput = settingsMenu.querySelector("[data-gldn-opacity-input]");
    const opacityValue = settingsMenu.querySelector("[data-gldn-opacity-value]");

    modeControls.addEventListener("pointerdown", (event) => event.stopPropagation());
    modeControls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-gldn-panel-mode]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      setPanelMode(button.dataset.gldnPanelMode);
    });

    grip.addEventListener("pointerdown", (event) => event.stopPropagation());
    settingsButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = settingsMenu.hasAttribute("hidden");
      settingsMenu.toggleAttribute("hidden", !willOpen);
      settingsButton.setAttribute("aria-expanded", String(willOpen));
    });

    settingsMenu.addEventListener("pointerdown", (event) => event.stopPropagation());
    globalThis.GLDN_THEME_CATALOG?.populateSelect(themeSelect);
    themeSelect.addEventListener("change", () => {
      const theme = normalizeUiTheme(themeSelect.value);
      applyUiTheme(theme);
      globalThis.GLDN_THEME_CATALOG?.renderPreview(themePreview, theme);
      chrome.storage.local.set({ gldnUiTheme: theme });
    });
    opacityInput.addEventListener("input", () => {
      const opacity = applyUiOpacity(opacityInput.value);
      opacityInput.value = String(opacity);
      opacityValue.textContent = `${opacity}%`;
      chrome.storage.local.set({ gldnUiOpacity: opacity });
    });
    settingsMenu.querySelector("[data-gldn-open-tour]").addEventListener("click", () => {
      runtimeMessage({ type: "openExtensionPage", page: "onboarding.html" });
    });
    settingsMenu.querySelector("[data-gldn-open-guide]").addEventListener("click", () => {
      runtimeMessage({ type: "openExtensionPage", page: "guide.html" });
    });
    settingsMenu.querySelector("[data-gldn-reset-layout]").addEventListener("click", () => {
      savedPosition = null;
      savedSize = null;
      chrome.storage.local.remove([storageKey, sizeStorageKey], () => setPanelMode("full"));
    });
    document.addEventListener("pointerdown", (event) => {
      if (settingsMenu.hasAttribute("hidden")) return;
      if (panel.contains(event.target)) return;
      settingsMenu.setAttribute("hidden", "");
      settingsButton.setAttribute("aria-expanded", "false");
    });

    panel.querySelector(".gldn-logo-image, .gldn-logo-badge")?.addEventListener("click", () => {
      if (panel.dataset.gldnPanelMode !== "full") setPanelMode("full");
    });

    const margin = 8;
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    const viewportSize = () => {
      const width = Math.max(
        Number(window.innerWidth) || 0,
        Number(document.documentElement?.clientWidth) || 0,
        Number(window.visualViewport?.width) || 0
      );
      const height = Math.max(
        Number(window.innerHeight) || 0,
        Number(document.documentElement?.clientHeight) || 0,
        Number(window.visualViewport?.height) || 0
      );
      return { width, height };
    };

    const clampPosition = (left, top) => {
      const rect = panel.getBoundingClientRect();
      const panelWidth = rect.width || panel.offsetWidth || 320;
      const panelHeight = rect.height || panel.offsetHeight || 360;
      const viewport = viewportSize();
      const viewportWidth = Math.max(viewport.width, panelWidth + (margin * 2));
      const viewportHeight = Math.max(viewport.height, panelHeight + (margin * 2));
      const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
      const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
      return {
        left: Math.min(Math.max(margin, left), maxLeft),
        top: Math.min(Math.max(margin, top), maxTop)
      };
    };

    const applyPosition = (left, top) => {
      const position = clampPosition(left, top);
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      return position;
    };

    const savePosition = (position) => {
      if (!position) return;
      savedPosition = {
        left: Math.round(position.left),
        top: Math.round(position.top)
      };
      chrome.storage.local.set({
        [storageKey]: savedPosition
      });
    };

    chrome.storage.local.get([
      storageKey,
      modeStorageKey,
      sizeStorageKey,
      "gldnUiOpacity",
      "gldnUiTheme"
    ], (result) => {
      const position = result?.[storageKey];
      const size = result?.[sizeStorageKey];
      savedPosition = position && Number.isFinite(position.left) && Number.isFinite(position.top)
        ? { left: position.left, top: position.top }
        : null;
      savedSize = size && Number.isFinite(size.width) && Number.isFinite(size.height)
        ? { width: size.width, height: size.height }
        : null;
      const theme = applyUiTheme(result?.gldnUiTheme);
      const opacity = applyUiOpacity(result?.gldnUiOpacity);
      themeSelect.value = theme;
      globalThis.GLDN_THEME_CATALOG?.renderPreview(themePreview, theme);
      opacityInput.value = String(opacity);
      opacityValue.textContent = `${opacity}%`;
      setPanelMode(result?.[modeStorageKey] || "full", false);
    });

    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      if (panel.dataset.gldnPanelMode !== "full") return;
      if (event.button !== 0 && event.pointerType !== "touch") return;
      const rect = panel.getBoundingClientRect();
      dragging = true;
      pointerId = event.pointerId;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add("is-dragging");
      document.body?.classList.add("gldn-panel-dragging");
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      applyPosition(event.clientX - offsetX, event.clientY - offsetY);
      event.preventDefault();
    });

    const stopDragging = (event) => {
      if (!dragging || (event && event.pointerId !== pointerId)) return;
      dragging = false;
      handle.classList.remove("is-dragging");
      document.body?.classList.remove("gldn-panel-dragging");
      try {
        if (pointerId !== null && handle.hasPointerCapture?.(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch (_) {}
      pointerId = null;
      const rect = panel.getBoundingClientRect();
      savePosition({ left: rect.left, top: rect.top });
    };

    handle.addEventListener("pointerup", stopDragging);
    handle.addEventListener("pointercancel", stopDragging);

    let resizing = false;
    let resizePointerId = null;
    let resizeStart = null;

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (panel.dataset.gldnPanelMode !== "full") return;
      if (event.button !== 0 && event.pointerType !== "touch") return;
      const rect = panel.getBoundingClientRect();
      const position = applyPosition(rect.left, rect.top);
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
      resizing = true;
      resizePointerId = event.pointerId;
      resizeStart = {
        clientX: event.clientX,
        clientY: event.clientY,
        width: rect.width,
        height: rect.height,
        left: position.left,
        top: position.top
      };
      resizeHandle.setPointerCapture?.(event.pointerId);
      document.body?.classList.add("gldn-panel-resizing");
      event.preventDefault();
      event.stopPropagation();
    });

    resizeHandle.addEventListener("pointermove", (event) => {
      if (!resizing || event.pointerId !== resizePointerId || !resizeStart) return;
      const viewport = viewportSize();
      const maxWidth = Math.max(210, viewport.width - resizeStart.left - margin);
      const maxHeight = Math.max(180, viewport.height - resizeStart.top - margin);
      const width = Math.min(maxWidth, Math.max(210, resizeStart.width + event.clientX - resizeStart.clientX));
      const height = Math.min(maxHeight, Math.max(180, resizeStart.height + event.clientY - resizeStart.clientY));
      panel.style.width = `${Math.round(width)}px`;
      panel.style.height = `${Math.round(height)}px`;
      event.preventDefault();
    });

    const stopResizing = (event) => {
      if (!resizing || (event && event.pointerId !== resizePointerId)) return;
      resizing = false;
      document.body?.classList.remove("gldn-panel-resizing");
      try {
        if (resizePointerId !== null && resizeHandle.hasPointerCapture?.(resizePointerId)) {
          resizeHandle.releasePointerCapture(resizePointerId);
        }
      } catch (_) {}
      resizePointerId = null;
      resizeStart = null;
      const rect = panel.getBoundingClientRect();
      savedSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
      chrome.storage.local.set({ [sizeStorageKey]: savedSize });
      savePosition({ left: rect.left, top: rect.top });
    };

    resizeHandle.addEventListener("pointerup", stopResizing);
    resizeHandle.addEventListener("pointercancel", stopResizing);

    handle.addEventListener("dblclick", () => {
      chrome.storage.local.remove([storageKey, sizeStorageKey], () => {
        savedPosition = null;
        savedSize = null;
        clearInlineLayout();
        setPanelMode("full");
      });
    });

    window.addEventListener("resize", () => {
      if (!panel.style.left || !panel.style.top) return;
      const rect = panel.getBoundingClientRect();
      const position = applyPosition(rect.left, rect.top);
      savePosition(position);
    });
  };


  const clampUiOpacity = (value) => {
    const config = globalThis.GLDN_CONFIG || {};
    const minimum = Number(config.minimumUiOpacity ?? 0);
    const maximum = Number(config.maximumUiOpacity ?? 100);
    const fallback = Number(config.defaultUiOpacity ?? 75);
    const numeric = Number(value);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : fallback));
  };

  const applyUiOpacity = (value) => {
    const percent = clampUiOpacity(value);
    const windowAlpha = percent / 100;
    // Keep the page visible while preserving enough contrast to read controls.
    const backdropAlpha = Math.max(0.015, Math.min(0.14, (100 - percent) / 250));
    document.documentElement.style.setProperty('--gldn-window-alpha', windowAlpha.toFixed(2));
    document.documentElement.style.setProperty('--gldn-backdrop-alpha', backdropAlpha.toFixed(3));
    document.documentElement.dataset.gldnUiOpacity = String(percent);
    return percent;
  };

  const UI_THEMES = globalThis.GLDN_THEME_CATALOG?.ids || Object.freeze(['dark', 'light', 'graphite', 'signal', 'midnight', 'crimson']);

  const normalizeUiTheme = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return UI_THEMES.includes(normalized) ? normalized : 'dark';
  };

  const applyUiTheme = (value) => {
    const theme = normalizeUiTheme(value || globalThis.GLDN_CONFIG?.defaultUiTheme || 'dark');
    if (globalThis.GLDN_THEME_CATALOG?.apply) globalThis.GLDN_THEME_CATALOG.apply(document.documentElement, theme);
    else document.documentElement.dataset.gldnTheme = theme;
    return theme;
  };

  const modalStorageKey = (modal) => {
    const backdropId = modal.closest('.gldn-modal-backdrop')?.id;
    const headingText = modal.querySelector('h2')?.textContent?.trim();
    const specificClass = [...modal.classList].find((name) => !['gldn-modal', 'gldn-review-modal'].includes(name));
    return String(backdropId || modal.id || headingText || specificClass || 'default')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .slice(0, 80);
  };

  const enhanceModal = (modal) => {
    if (!modal || modal.dataset.gldnAppearanceReady === 'true') return;
    modal.dataset.gldnAppearanceReady = 'true';
    if (modal.dataset.gldnWorkflowLauncher !== 'true') registerOpenReview(modal);
    const key = modalStorageKey(modal);
    const backdrop = modal.closest('.gldn-modal-backdrop');
    const heading = modal.querySelector('h2');

    const controls = document.createElement('div');
    controls.className = 'gldn-modal-appearance';
    controls.innerHTML = `
      <label>
        <span>Transparency</span>
        <input type="range" min="0" max="100" step="1" data-gldn-modal-opacity>
        <strong data-gldn-modal-opacity-value>75%</strong>
      </label>
      <span class="gldn-modal-resize-hint">Drag title to move. Lower-right corner resizes.</span>
    `;
    if (heading) heading.insertAdjacentElement('afterend', controls);
    else modal.prepend(controls);

    const opacityInput = controls.querySelector('[data-gldn-modal-opacity]');
    const opacityValue = controls.querySelector('[data-gldn-modal-opacity-value]');
    const clampModalOpacity = (value) => {
      const numeric = Number(value);
      const fallback = Number(document.documentElement.dataset.gldnUiOpacity || 75);
      return Math.min(100, Math.max(0, Number.isFinite(numeric) ? numeric : fallback));
    };
    const applyModalOpacity = (value) => {
      const opacity = clampModalOpacity(value);
      const alpha = opacity / 100;
      const surfaceAlpha = Math.min(0.30, alpha * 0.28);
      const raisedAlpha = Math.min(0.38, alpha * 0.34);
      const backdropAlpha = Math.min(0.08, alpha * 0.08);
      modal.style.setProperty('--gldn-modal-alpha', alpha.toFixed(2));
      modal.style.setProperty('--gldn-modal-surface-alpha', surfaceAlpha.toFixed(3));
      modal.style.setProperty('--gldn-modal-raised-alpha', raisedAlpha.toFixed(3));
      modal.style.setProperty('--gldn-modal-pattern', opacity === 0 ? 'none' : 'var(--gldn-theme-pattern)');
      backdrop?.style.setProperty('--gldn-modal-backdrop-alpha', backdropAlpha.toFixed(3));
      modal.dataset.gldnModalOpacityPercent = String(opacity);
      opacityInput.value = String(opacity);
      opacityValue.textContent = `${opacity}%`;
      return opacity;
    };

    const updateStorageMap = (storageKey, value) => {
      if (!globalThis.chrome?.storage?.local) return;
      chrome.storage.local.get([storageKey], (result) => {
        const values = { ...(result?.[storageKey] || {}) };
        if (value === null) delete values[key];
        else values[key] = value;
        chrome.storage.local.set({ [storageKey]: values });
      });
    };

    let opacitySaveTimer = null;
    applyModalOpacity(document.documentElement.dataset.gldnUiOpacity);
    opacityInput.addEventListener('input', () => {
      const opacity = applyModalOpacity(opacityInput.value);
      clearTimeout(opacitySaveTimer);
      opacitySaveTimer = setTimeout(() => updateStorageMap('gldnModalOpacities', opacity), 100);
    });

    const margin = 8;
    const viewportSize = () => ({
      width: Math.max(Number(window.innerWidth) || 0, Number(document.documentElement?.clientWidth) || 0),
      height: Math.max(Number(window.innerHeight) || 0, Number(document.documentElement?.clientHeight) || 0)
    });
    const clampPosition = (left, top) => {
      const rect = modal.getBoundingClientRect();
      const viewport = viewportSize();
      const maxLeft = Math.max(margin, viewport.width - Math.min(rect.width, viewport.width - (margin * 2)) - margin);
      const maxTop = Math.max(margin, viewport.height - Math.min(rect.height, viewport.height - (margin * 2)) - margin);
      return {
        left: Math.min(Math.max(margin, Number(left) || margin), maxLeft),
        top: Math.min(Math.max(margin, Number(top) || margin), maxTop)
      };
    };
    const applyPosition = (left, top) => {
      const position = clampPosition(left, top);
      modal.style.position = 'fixed';
      modal.style.left = `${Math.round(position.left)}px`;
      modal.style.top = `${Math.round(position.top)}px`;
      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
      modal.style.margin = '0';
      return position;
    };
    const resetPosition = () => {
      modal.style.position = 'relative';
      modal.style.left = '';
      modal.style.top = '';
      modal.style.right = '';
      modal.style.bottom = '';
      modal.style.margin = '';
      updateStorageMap('gldnModalPositions', null);
    };

    if (heading) {
      heading.classList.add('gldn-modal-drag-handle');
      heading.title = 'Drag to move this window. Double-click to reset its position.';
      let dragging = false;
      let pointerId = null;
      let offsetX = 0;
      let offsetY = 0;

      heading.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button, input, select, textarea, a')) return;
        if (event.button !== 0 && event.pointerType !== 'touch') return;
        const rect = modal.getBoundingClientRect();
        applyPosition(rect.left, rect.top);
        dragging = true;
        pointerId = event.pointerId;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        heading.setPointerCapture?.(event.pointerId);
        heading.classList.add('is-dragging');
        document.body?.classList.add('gldn-modal-dragging');
        event.preventDefault();
      });
      heading.addEventListener('pointermove', (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        applyPosition(event.clientX - offsetX, event.clientY - offsetY);
        event.preventDefault();
      });
      const stopDragging = (event) => {
        if (!dragging || (event && event.pointerId !== pointerId)) return;
        dragging = false;
        heading.classList.remove('is-dragging');
        document.body?.classList.remove('gldn-modal-dragging');
        try {
          if (pointerId !== null && heading.hasPointerCapture?.(pointerId)) heading.releasePointerCapture(pointerId);
        } catch (_) {}
        pointerId = null;
        const rect = modal.getBoundingClientRect();
        updateStorageMap('gldnModalPositions', { left: Math.round(rect.left), top: Math.round(rect.top) });
      };
      heading.addEventListener('pointerup', stopDragging);
      heading.addEventListener('pointercancel', stopDragging);
      heading.addEventListener('dblclick', resetPosition);
    }

    if (!globalThis.chrome?.storage?.local) return;
    let restoring = true;
    let saveTimer = null;
    chrome.storage.local.get(['gldnModalSizes', 'gldnModalPositions', 'gldnModalOpacities', 'gldnUiOpacity'], (result) => {
      const savedSize = result.gldnModalSizes?.[key];
      const savedPosition = result.gldnModalPositions?.[key];
      const savedOpacity = result.gldnModalOpacities?.[key];
      applyModalOpacity(savedOpacity ?? result.gldnUiOpacity);
      if (savedSize && Number.isFinite(savedSize.width) && Number.isFinite(savedSize.height)) {
        modal.style.width = `${Math.min(savedSize.width, Math.max(320, window.innerWidth - 24))}px`;
        modal.style.height = `${Math.min(savedSize.height, Math.max(220, window.innerHeight - 24))}px`;
      }
      requestAnimationFrame(() => {
        if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
          applyPosition(savedPosition.left, savedPosition.top);
        }
        restoring = false;
      });
    });
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (restoring || !modal.isConnected) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const rect = modal.getBoundingClientRect();
          updateStorageMap('gldnModalSizes', { width: Math.round(rect.width), height: Math.round(rect.height) });
          if (modal.style.position === 'fixed') {
            const position = applyPosition(rect.left, rect.top);
            updateStorageMap('gldnModalPositions', { left: Math.round(position.left), top: Math.round(position.top) });
          }
        }, 180);
      });
      observer.observe(modal);
    }
  };

  const initializeModalEnhancements = () => {
    document.querySelectorAll('.gldn-modal').forEach(enhanceModal);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('.gldn-modal')) enhanceModal(node);
          node.querySelectorAll?.('.gldn-modal').forEach(enhanceModal);
        }
        for (const node of mutation.removedNodes) releaseOpenReviewsInNode(node);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });
    registerExtensionCleanup(() => observer.disconnect());
  };

  const initializeUiAppearance = () => {
    if (!globalThis.chrome?.storage?.local) {
      applyUiOpacity(globalThis.GLDN_CONFIG?.defaultUiOpacity || 75);
      applyUiTheme(globalThis.GLDN_CONFIG?.defaultUiTheme || 'dark');
      return;
    }
    chrome.storage.local.get(['gldnUiOpacity', 'gldnUiTheme'], (result) => {
      applyUiOpacity(result.gldnUiOpacity);
      applyUiTheme(result.gldnUiTheme);
    });
    const appearanceListener = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.gldnUiOpacity) applyUiOpacity(changes.gldnUiOpacity.newValue);
      if (changes.gldnUiTheme) applyUiTheme(changes.gldnUiTheme.newValue);
    };
    chrome.storage.onChanged.addListener(appearanceListener);
    registerExtensionCleanup(() => chrome.storage.onChanged.removeListener(appearanceListener));
  };

  const sharedRuntimeListener = (message, sender, sendResponse) => {
    if (sender?.id && sender.id !== chrome.runtime.id) {
      sendResponse?.({ ok: false, error: 'Message sender is not GLDN Ops.' });
      return false;
    }
    if (message?.type === 'inspectGldnPageState') {
      const visible = (element) => isVisible(element) && !element.hidden;
      const appearance = (element) => {
        if (!(element instanceof Element)) return null;
        const style = getComputedStyle(element);
        return {
          backgroundColor: String(style.backgroundColor || ''),
          color: String(style.color || ''),
          colorScheme: String(style.colorScheme || ''),
          opacity: String(style.opacity || '')
        };
      };
      const readControlValue = (backdrop, selector) => {
        const control = backdrop.querySelector(selector);
        return control && 'value' in control ? String(control.value || '').trim().slice(0, 240) : '';
      };
      const readReviewRows = (backdrop) => Object.fromEntries(
        [...backdrop.querySelectorAll('.gldn-existing .gldn-row')]
          .slice(0, 30)
          .map((row) => [
            String(row.querySelector('span')?.textContent || '').trim().slice(0, 120),
            String(row.querySelector('strong')?.textContent || '').trim().slice(0, 240)
          ])
          .filter(([label]) => label)
      );
      const readAllowlistedReviewData = (backdrop) => {
        const id = String(backdrop.id || '');
        if (id === 'gldn-health-preview') {
          return {
            computer: readControlValue(backdrop, '#gldn-health-computer'),
            ebayAccount: readControlValue(backdrop, '#gldn-health-ebay-account'),
            currentSellerLevel: readControlValue(backdrop, '#gldn-health-current-level'),
            evaluatedToday: readControlValue(backdrop, '#gldn-health-evaluated-today'),
            transactionDefectRate: readControlValue(backdrop, '#gldn-health-defect'),
            lateShipmentRate: readControlValue(backdrop, '#gldn-health-late'),
            trackingOnTime: readControlValue(backdrop, '#gldn-health-tracking'),
            casesClosed: readControlValue(backdrop, '#gldn-health-cases'),
            nextEvaluation: readControlValue(backdrop, '#gldn-health-next-evaluation')
          };
        }
        if (id === 'gldn-listings-preview') {
          return {
            computer: readControlValue(backdrop, '#gldn-listings-computer'),
            ebayAccount: readControlValue(backdrop, '#gldn-listings-account'),
            storePlan: readControlValue(backdrop, '#gldn-listings-plan'),
            activeListings: readControlValue(backdrop, '#gldn-listings-active'),
            availableQuantity: readControlValue(backdrop, '#gldn-listings-in-stock'),
            customInsertionAllowance: readControlValue(backdrop, '#gldn-listings-limit'),
            dollarUsed: readControlValue(backdrop, '#gldn-listings-dollar-used'),
            customDollarLimit: readControlValue(backdrop, '#gldn-listings-dollar-limit')
          };
        }
        if (id === 'gldn-ebay-snapshot-preview' || id === 'gldn-posh-stats-preview') {
          return readReviewRows(backdrop);
        }
        return null;
      };
      const panels = [...document.querySelectorAll('.gldn-order-panel')]
        .filter(visible)
        .map((panel) => ({
          id: String(panel.id || ''),
          title: String(panel.querySelector('.gldn-panel-title')?.textContent || '').trim().slice(0, 160),
          status: String(panel.querySelector('.gldn-status')?.textContent || '').trim().slice(0, 500),
          statusType: String(panel.querySelector('.gldn-status')?.dataset?.type || ''),
          appearance: appearance(panel),
          actions: [...panel.querySelectorAll('button')]
            .filter(visible)
            .map((button) => String(button.textContent || '').trim())
            .filter(Boolean)
            .slice(0, 30)
        }));
      const modals = [...document.querySelectorAll('.gldn-modal-backdrop')]
        .filter(visible)
        .map((backdrop) => ({
          id: String(backdrop.id || ''),
          title: String(backdrop.querySelector('h1, h2, h3')?.textContent || '').trim().slice(0, 160),
          status: String(backdrop.querySelector('.gldn-modal-status')?.textContent || '').trim().slice(0, 500),
          appearance: appearance(backdrop.querySelector('.gldn-modal') || backdrop),
          reviewData: readAllowlistedReviewData(backdrop),
          actions: [...backdrop.querySelectorAll('button')]
            .filter(visible)
            .map((button) => String(button.textContent || '').trim())
            .filter(Boolean)
            .slice(0, 30)
        }));
      const bodySignal = normalizeText(document.body?.innerText || '').slice(0, 250000);
      const rootStyle = document.documentElement.style;
      const gldnTheme = String(document.documentElement.dataset.gldnTheme || '');
      const gldnColorScheme = String(rootStyle.getPropertyValue('--gldn-color-scheme') || '').trim();
      const genericTheme = String(document.documentElement.dataset.theme || '');
      const inlineColorScheme = String(rootStyle.colorScheme || '').trim();
      const leakedAliases = ['--bg', '--panel', '--panel2', '--line', '--ink', '--muted', '--gold', '--blue']
        .filter((variable) => String(rootStyle.getPropertyValue(variable) || '').trim());
      const poshmarkSalesDiagnostics = location.hostname === 'poshmark.com' && /^\/order\/sales\/?$/i.test(location.pathname)
        ? (() => {
            const saleAnchors = [...document.querySelectorAll("a[href*='/order/sales/']")];
            const saleRows = saleAnchors.slice(0, 10).map((anchor) => {
              const row = anchor.closest('tr, li, article, [class*=\'order\'], [class*=\'Order\']') || anchor.parentElement;
              return {
                href: String(anchor.href || anchor.getAttribute('href') || '').slice(0, 300),
                orderDate: String(row?.querySelector('.my-sales-desktop-table__date-col')?.textContent || '').trim().slice(0, 80)
              };
            });
            const paginationControls = [...document.querySelectorAll('button, a, [role=\'button\']')]
              .filter(visible)
              .map((element) => ({
                tag: String(element.tagName || '').toLowerCase(),
                text: normalizeText(element.textContent || '').slice(0, 80),
                ariaLabel: String(element.getAttribute('aria-label') || '').trim().slice(0, 80),
                title: String(element.getAttribute('title') || '').trim().slice(0, 80),
                className: String(element.className || '').slice(0, 160),
                disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
                pageY: Math.round(element.getBoundingClientRect().top + scrollY)
              }))
              .filter((control) => /next|previous|prev|show\s*\d+|pagination|chevron|arrow/i.test([
                control.text,
                control.ariaLabel,
                control.title,
                control.className
              ].join(' ')))
              .slice(0, 30);
            const pageSizeCandidates = [...document.querySelectorAll('button, [role=\'button\'], div, span, label')]
              .filter(visible)
              .filter((element) => /^show\s+\d+$/i.test(normalizeText(element.textContent || '')))
              .slice(0, 12)
              .map((element) => ({
                tag: String(element.tagName || '').toLowerCase(),
                text: normalizeText(element.textContent || '').slice(0, 80),
                className: String(element.className || '').slice(0, 160),
                parentTag: String(element.parentElement?.tagName || '').toLowerCase(),
                parentClassName: String(element.parentElement?.className || '').slice(0, 160)
              }));
            const showingMatch = normalizeText(document.body?.innerText || '').match(/showing\s+(\d+)\s*-\s*(\d+)\s+of\s+([\d,]+\+?)/i);
            return {
              saleLinkCount: saleAnchors.length,
              sampleRows: saleRows,
              selects: [...document.querySelectorAll('select')].slice(0, 12).map((select) => ({
                value: String(select.value || ''),
                options: [...select.options].map((option) => String(option.textContent || option.value || '').trim()).slice(0, 20)
              })),
              paginationControls,
              pageSizeCandidates,
              showingRange: showingMatch ? showingMatch.slice(1, 4) : [],
              documentHeight: document.documentElement.scrollHeight,
              viewportHeight: innerHeight
            };
          })()
        : null;
      sendResponse?.({
        ok: true,
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        hostAppearance: {
          html: appearance(document.documentElement),
          body: appearance(document.body),
          gldnThemeLeak: Boolean(
            (gldnTheme && genericTheme === gldnTheme)
            || (gldnColorScheme && inlineColorScheme === gldnColorScheme)
            || leakedAliases.length
          ),
          legacyThemeSettings: {
            genericTheme,
            inlineColorScheme,
            leakedAliases
          }
        },
        panels,
        modals,
        poshmarkSalesDiagnostics,
        interruption: bodySignal.includes('pardon our interruption')
          || bodySignal.includes('made us think you were a bot')
          || bodySignal.includes('verify you are human'),
        visibleMarketplaceDialogs: [...document.querySelectorAll('[role="dialog"]')]
          .filter((dialog) => visible(dialog) && !dialog.closest('.gldn-modal-backdrop'))
          .map((dialog) => String(dialog.querySelector('h1, h2, h3')?.textContent || dialog.getAttribute('aria-label') || '').trim())
          .filter(Boolean)
          .slice(0, 12)
      });
      return false;
    }
    if (message?.type !== 'gldnAutomationReset') return false;
    document.querySelectorAll('.gldn-modal-backdrop').forEach((element) => element.remove());
    document.querySelectorAll('.gldn-status').forEach((element) => {
      element.textContent = 'Automation reset - ready.';
      element.dataset.type = 'ready';
    });
    sendResponse?.({ ok: true });
    return false;
  };

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(sharedRuntimeListener);
    registerExtensionCleanup(() => chrome.runtime.onMessage.removeListener(sharedRuntimeListener));
  }

  initializeUiAppearance();
  initializeModalEnhancements();
  const errorSource = location.hostname.includes("amazon.")
    ? "amazon-content"
    : location.hostname.includes("walmart.")
      ? "walmart-content"
      : location.hostname.includes("poshmark.")
        ? "poshmark-content"
        : location.hostname.includes("ecomsniper.")
          ? "ecomsniper-content"
          : location.hostname.includes("ebay.")
            ? "ebay-content"
            : "universal-content";
  installExtensionErrorLogging(errorSource);

  window.OrderNoteUtils = {
    PAYLOAD_PREFIX,
    normalizeText,
    moneyToNumber,
    formatMoney,
    isVisible,
    findVisibleByText,
    findVisibleContainingText,
    getBodyLines,
    findMoneyNearLabel,
    parseDateToMD,
    extractEtasFromText,
    tokenSimilarity,
    setNativeValue,
    waitFor,
    makePanelDraggable,
    recordExtensionLog,
    runtimeMessage,
    claimWorkflowStart,
    releaseWorkflowStart,
    runFeatureHealthCheck,
    summarizeFeatureHealth,
    saveDashboardSetupCode,
    promptAndSaveDashboardSetup,
    applyUiOpacity,
    applyUiTheme,
    clampUiOpacity,
    normalizeUiTheme,
    enhanceModal,
    isExtensionContextInvalidated,
    markExtensionContextInvalidated,
    extensionContextAvailable,
    registerExtensionCleanup
  };
})();
