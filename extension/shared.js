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

  const recordExtensionLog = async (entry) => {
    if (!globalThis.chrome?.storage?.local) return;
    const payload = {
      at: new Date().toISOString(),
      source: entry?.source || "page",
      level: entry?.level || "error",
      message: String(entry?.message || "Unknown extension issue").slice(0, 800),
      detail: String(entry?.detail || "").slice(0, 1200),
      page: location.href,
      version: chrome.runtime?.getManifest?.().version || ""
    };
    chrome.storage.local.get(["gldnErrorLog"], (result) => {
      const current = Array.isArray(result.gldnErrorLog) ? result.gldnErrorLog : [];
      chrome.storage.local.set({ gldnErrorLog: [payload, ...current].slice(0, 80) });
    });
  };

  const installExtensionErrorLogging = (source) => {
    window.addEventListener("error", (event) => {
      recordExtensionLog({
        source,
        level: "error",
        message: event.message,
        detail: `${event.filename || ""}:${event.lineno || ""}:${event.colno || ""}\n${event.error?.stack || ""}`
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
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

    const setPanelMode = (mode) => {
      const normalized = ["full", "minimized", "side"].includes(mode) ? mode : "full";
      panel.dataset.gldnPanelMode = normalized;
      panel.classList.toggle("gldn-panel-minimized", normalized === "minimized");
      panel.classList.toggle("gldn-panel-side", normalized === "side");
      if (normalized !== "full") {
        panel.style.left = "";
        panel.style.top = "";
        panel.style.right = "";
        panel.style.bottom = "";
      }
      chrome.storage.local.set({ [modeStorageKey]: normalized });
    };

    const modeControls = document.createElement("div");
    modeControls.className = "gldn-panel-mode-controls";
    modeControls.innerHTML = `
      <button type="button" class="gldn-panel-mode-button" data-gldn-panel-mode="minimized" title="Minimize panel">_</button>
      <button type="button" class="gldn-panel-mode-button" data-gldn-panel-mode="side" title="Dock as side rail">Side</button>
      <button type="button" class="gldn-panel-mode-button gldn-panel-open-button" data-gldn-panel-mode="full" title="Open panel">Open</button>
    `;
    const grip = handle.querySelector(".gldn-drag-grip");
    handle.insertBefore(modeControls, grip || null);

    modeControls.addEventListener("pointerdown", (event) => event.stopPropagation());
    modeControls.addEventListener("click", (event) => {
      const button = event.target.closest("[data-gldn-panel-mode]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      setPanelMode(button.dataset.gldnPanelMode);
    });

    panel.querySelector(".gldn-logo-image, .gldn-logo-badge")?.addEventListener("click", () => {
      if (panel.dataset.gldnPanelMode !== "full") setPanelMode("full");
    });

    const margin = 8;
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    const clampPosition = (left, top) => {
      const rect = panel.getBoundingClientRect();
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
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
      chrome.storage.local.set({
        [storageKey]: {
          left: Math.round(position.left),
          top: Math.round(position.top)
        }
      });
    };

    chrome.storage.local.get([storageKey], (result) => {
      const saved = result?.[storageKey];
      if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
      requestAnimationFrame(() => applyPosition(saved.left, saved.top));
    });
    chrome.storage.local.get([modeStorageKey], (result) => {
      setPanelMode(result?.[modeStorageKey] || "full");
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

    handle.addEventListener("dblclick", () => {
      chrome.storage.local.remove([storageKey], () => {
        setPanelMode("full");
        panel.style.left = "";
        panel.style.top = "";
        panel.style.right = "";
        panel.style.bottom = "";
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
    const minimum = Number(config.minimumUiOpacity || 65);
    const maximum = Number(config.maximumUiOpacity || 100);
    const fallback = Number(config.defaultUiOpacity || 75);
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

  const normalizeUiTheme = (value) => String(value || '').toLowerCase() === 'dark' ? 'dark' : 'light';

  const applyUiTheme = (value) => {
    const theme = normalizeUiTheme(value || globalThis.GLDN_CONFIG?.defaultUiTheme || 'dark');
    document.documentElement.dataset.gldnTheme = theme;
    return theme;
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
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.gldnUiOpacity) applyUiOpacity(changes.gldnUiOpacity.newValue);
      if (changes.gldnUiTheme) applyUiTheme(changes.gldnUiTheme.newValue);
    });
  };

  initializeUiAppearance();
  installExtensionErrorLogging(location.hostname.includes("amazon.") ? "amazon-content" : "ebay-content");

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
    applyUiOpacity,
    applyUiTheme,
    clampUiOpacity
  };
})();
