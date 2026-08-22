(function attachEbayProfitCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GLDN_EBAY_PROFIT_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STATE_VERSION = 1;
  const MONTH_KEY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set((values || []).map(text).filter(Boolean))];
  }

  function money(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const cleaned = text(value).replace(/[$,\s]/g, "");
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundedMoney(value) {
    const parsed = money(value);
    return parsed === null ? null : Number(parsed.toFixed(2));
  }

  function moneyCandidates(values) {
    return [...new Set((values || [])
      .map(roundedMoney)
      .filter((value) => value !== null && value >= 0))];
  }

  function analyzeNoteMoneyToken(value) {
    const raw = text(value);
    if (!raw) return { ok: false, raw, candidates: [], reason: "The amount is blank." };

    let candidate = raw
      .replace(/\bUSD\b/gi, "")
      .replace(/US\$/gi, "")
      .replace(/\$/g, "")
      .trim();
    const corrections = [];
    const digitWhitespace = /\d\s+\d/.test(candidate);
    candidate = candidate.replace(/\s+/g, "");

    if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(candidate)) {
      candidate = candidate.replace(/,/g, "");
    } else if (/^-?\d+,\d{1,2}$/.test(candidate)) {
      candidate = candidate.replace(",", ".");
      corrections.push("decimal comma normalized");
    }
    if (/^-?\.\d{1,2}$/.test(candidate)) {
      candidate = candidate.replace(/^(-?)\./, (_match, sign) => `${sign}0.`);
      corrections.push("leading zero restored");
    }
    if (/^-?\d+\.$/.test(candidate)) {
      candidate += "00";
      corrections.push("trailing decimal completed");
    }
    if (/^-?\d+\.\.\d{1,2}$/.test(candidate)) {
      candidate = candidate.replace("..", ".");
      corrections.push("duplicate decimal removed");
    }

    const parsed = money(candidate);
    if (parsed !== null && !digitWhitespace) {
      return {
        ok: true,
        raw,
        value: Number(parsed.toFixed(2)),
        candidates: [Number(parsed.toFixed(2))],
        normalized: corrections.length > 0,
        corrections
      };
    }

    const possible = [];
    const substituted = candidate.replace(/[oO]/g, "0").replace(/[lI]/g, "1");
    const substitutedValue = money(substituted);
    if (substitutedValue !== null) possible.push(substitutedValue);
    const digits = substituted.replace(/\D/g, "");
    if (digits.length >= 3) possible.push(Number(digits) / 100);
    if (parsed !== null) possible.push(parsed);
    return {
      ok: false,
      raw,
      candidates: moneyCandidates(possible),
      reason: digitWhitespace
        ? "Digits in the amount are separated by spaces."
        : "The amount contains an uncertain character or decimal placement."
    };
  }

  function splitSavedNote(value) {
    const note = text(value);
    const parts = note.split(/\s+(?:-|\u2013|\u2014|\|)\s+/).map(text).filter(Boolean);
    if (parts.length >= 2) {
      return {
        earnings: parts[0],
        supplierTotal: parts[1],
        supplierProfile: parts.length >= 4 ? parts.slice(2, -1).join(" - ") : "",
        eta: parts.length >= 4 ? parts[parts.length - 1] : "",
        structured: parts.length >= 4
      };
    }
    const compact = note.match(/^\s*(\$?[0-9OoIl.,]+)\s*(?:-|\u2013|\u2014|\|)\s*(\$?[0-9OoIl.,]+)(?:\s*(?:-|\u2013|\u2014|\|)\s*(.*))?$/);
    if (compact) {
      const tail = text(compact[3]);
      const tailParts = tail.split(/\s+(?:-|\u2013|\u2014|\|)\s+/).map(text).filter(Boolean);
      return {
        earnings: compact[1],
        supplierTotal: compact[2],
        supplierProfile: tailParts.length >= 2 ? tailParts.slice(0, -1).join(" - ") : "",
        eta: tailParts.length >= 2 ? tailParts[tailParts.length - 1] : "",
        structured: tailParts.length >= 2
      };
    }
    return null;
  }

  function normalizeMonthKey(value) {
    const normalized = text(value);
    return MONTH_KEY_PATTERN.test(normalized) ? normalized : "";
  }

  function monthLabel(value) {
    const monthKey = normalizeMonthKey(value);
    if (!monthKey) return "";
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });
  }

  function parseDate(value, targetMonthKey = "") {
    const raw = text(value);
    if (!raw) return null;
    const targetYear = Number(normalizeMonthKey(targetMonthKey).slice(0, 4)) || new Date().getFullYear();
    const cleaned = raw
      .replace(/\b(?:PDT|PST|CDT|CST|EDT|EST|UTC)\b/gi, "")
      .replace(/\bat\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hasYear = /\b(?:19|20)\d{2}\b/.test(cleaned);
    const candidate = hasYear ? cleaned : `${cleaned}, ${targetYear}`;
    const parsed = new Date(candidate);
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  function isoDate(value, targetMonthKey = "") {
    const parsed = parseDate(value, targetMonthKey);
    if (!parsed) return "";
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0")
    ].join("-");
  }

  function monthKeyForDate(value, targetMonthKey = "") {
    return isoDate(value, targetMonthKey).slice(0, 7);
  }

  function extractOrderDateText(value) {
    const source = text(value);
    if (!source) return "";
    const month = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
    const labeled = source.match(new RegExp(`(?:date sold|sold|date paid|paid|order date)\\s*:?\\s*(${month}\\s+\\d{1,2}(?:,?\\s+\\d{4})?)`, "i"));
    if (labeled) return labeled[1];
    const visibleRowDate = source.match(new RegExp(`\\b(${month}\\s+\\d{1,2}(?:,?\\s+\\d{4})?)\\b`, "i"));
    return visibleRowDate ? visibleRowDate[1] : "";
  }

  function classifyOrdersIndexPage(input = {}) {
    const heading = text(input.heading).toLowerCase();
    const selectedStatus = text(input.selectedStatus).toLowerCase();
    const bodyText = text(input.bodyText).toLowerCase();
    let urlSignal = text(input.url).toLowerCase();
    try {
      urlSignal = decodeURIComponent(urlSignal);
    } catch (_) {
      // Keep the raw URL when eBay leaves an incomplete escape sequence in it.
    }
    urlSignal = urlSignal.replace(/[+_:%-]+/g, " ");
    const detailLinkCount = Math.max(0, Number(input.detailLinkCount || 0));
    const awaitingShipment = heading.includes("awaiting shipment")
      || selectedStatus.includes("awaiting shipment")
      || /\bstatus\s+awaiting shipment\b/.test(urlSignal);
    const allOrdersFromUrl = /\bstatus\s+all orders\b/.test(urlSignal);
    const allOrders = !awaitingShipment && (
      allOrdersFromUrl
      || selectedStatus === "all orders"
      || heading === "all orders"
      || heading === "manage orders"
      || heading === "manage all orders"
    );
    const explicitEmptySignal = /\bresults?\s*:\s*0(?:\s*-\s*0)?\s+of\s+0\b/.test(bodyText)
      || /\b(?:no|zero)\s+(?:matching\s+)?orders?\s+(?:found|to show|available)\b/.test(bodyText)
      || /\bthere are no (?:matching )?orders?\b/.test(bodyText);
    // eBay can leave stale zero-result text elsewhere in its SPA while real
    // order links are rendered. Visible detail links are authoritative.
    const explicitEmpty = detailLinkCount === 0 && explicitEmptySignal;
    const interrupted = /\bpardon our interruption\b|\bsecurity challenge\b|\bverify (?:that )?(?:it'?s|you are) you\b|\bcaptcha\b|\bthink you are a bot\b/.test(bodyText);
    const ready = allOrders && !interrupted && (detailLinkCount > 0 || explicitEmpty);
    let reason = "";
    if (interrupted) reason = "eBay displayed an interruption or identity challenge.";
    else if (awaitingShipment) reason = "eBay reopened the persisted Awaiting Shipment view.";
    else if (!allOrders) reason = "The worker could not verify eBay's All orders view.";
    else if (!ready) reason = "The All orders page did not render order rows or an explicit empty result.";
    return {
      heading,
      selectedStatus,
      detailLinkCount,
      awaitingShipment,
      allOrdersFromUrl,
      allOrders,
      explicitEmpty,
      interrupted,
      ready,
      reason
    };
  }

  function parseSavedNote(value, options = {}) {
    const note = text(value);
    if (!note) return { ok: false, status: "missing-note", error: "No saved eBay note was found.", note };
    const fields = splitSavedNote(note);
    if (!fields) {
      return {
        ok: false,
        status: "needs-note-confirmation",
        error: "The note amounts could not be separated confidently.",
        note,
        issues: ["Review both note amounts."],
        suggestedMarketplaceEarnings: null,
        suggestedSupplierTotal: null,
        marketplaceEarningsCandidates: [],
        supplierTotalCandidates: []
      };
    }

    const visibleEarnings = roundedMoney(options.visibleEarnings);
    const earnings = analyzeNoteMoneyToken(fields.earnings);
    const supplier = analyzeNoteMoneyToken(fields.supplierTotal);
    const issues = [];
    const corrections = [...(earnings.corrections || []), ...(supplier.corrections || [])];
    let suggestedMarketplaceEarnings = earnings.ok ? earnings.value : earnings.candidates[0] ?? null;
    let suggestedSupplierTotal = supplier.ok ? supplier.value : supplier.candidates[0] ?? null;

    if (!earnings.ok) issues.push(`eBay earnings: ${earnings.reason}`);
    if (!supplier.ok) issues.push(`Amazon cost: ${supplier.reason}`);
    if (visibleEarnings !== null && suggestedMarketplaceEarnings !== null
      && Math.abs(suggestedMarketplaceEarnings - visibleEarnings) > 0.011) {
      const centsCandidate = Number((suggestedMarketplaceEarnings / 100).toFixed(2));
      if (Math.abs(centsCandidate - visibleEarnings) <= 0.011) suggestedMarketplaceEarnings = visibleEarnings;
      issues.push(`The note earnings do not match visible eBay earnings ${visibleEarnings.toFixed(2)}.`);
    }

    const supplierRawDigits = String(fields.supplierTotal || "").replace(/\D/g, "");
    const supplierHasDecimal = /[.,]/.test(String(fields.supplierTotal || ""));
    if (supplier.ok && !supplierHasDecimal && supplierRawDigits.length >= 3 && visibleEarnings !== null) {
      const centsCandidate = Number((supplier.value / 100).toFixed(2));
      const suspiciousMagnitude = supplier.value > Math.max(100, visibleEarnings * 3)
        && centsCandidate > 0
        && centsCandidate <= Math.max(250, visibleEarnings * 2);
      if (suspiciousMagnitude) {
        suggestedSupplierTotal = centsCandidate;
        issues.push(`The note Amazon cost ${supplier.value.toFixed(2)} may be missing a decimal point.`);
      }
    }

    if (suggestedMarketplaceEarnings !== null && suggestedMarketplaceEarnings < 0) {
      issues.push("The note eBay earnings amount cannot be negative.");
    }
    if (suggestedSupplierTotal !== null && suggestedSupplierTotal <= 0) {
      issues.push("The note Amazon cost must be greater than zero.");
    }

    const needsConfirmation = issues.length > 0
      || suggestedMarketplaceEarnings === null
      || suggestedSupplierTotal === null;
    const common = {
      note,
      rawMarketplaceEarnings: text(fields.earnings),
      rawSupplierTotal: text(fields.supplierTotal),
      supplierProfile: text(fields.supplierProfile),
      eta: text(fields.eta),
      structured: fields.structured,
      corrections,
      issues,
      suggestedMarketplaceEarnings,
      suggestedSupplierTotal,
      marketplaceEarningsCandidates: moneyCandidates([suggestedMarketplaceEarnings, ...(earnings.candidates || []), visibleEarnings]),
      supplierTotalCandidates: moneyCandidates([suggestedSupplierTotal, ...(supplier.candidates || [])])
    };
    if (needsConfirmation) {
      return {
        ...common,
        ok: false,
        status: "needs-note-confirmation",
        error: issues.join(" ") || "Review and confirm the two note amounts."
      };
    }
    return {
      ...common,
      ok: true,
      status: corrections.length ? "normalized-note" : (fields.structured ? "verified" : "verified-amounts"),
      marketplaceEarnings: Number(suggestedMarketplaceEarnings.toFixed(2)),
      supplierTotal: Number(suggestedSupplierTotal.toFixed(2))
    };
  }

  function orderKey(record) {
    return text(record?.orderNumber);
  }

  function createRun(options = {}) {
    const monthKey = normalizeMonthKey(options.monthKey);
    if (!monthKey) throw new Error("A valid YYYY-MM month is required for an eBay profit run.");
    const now = text(options.now) || new Date().toISOString();
    return {
      stateVersion: STATE_VERSION,
      runId: text(options.runId) || `ebay-profit-${monthKey}-${Date.now()}`,
      extensionVersion: text(options.extensionVersion),
      monthKey,
      monthLabel: monthLabel(monthKey),
      maxOrders: Math.max(1, Math.min(5000, Number(options.maxOrders || 5000))),
      computerLabel: text(options.computerLabel),
      accountLabel: text(options.accountLabel),
      active: true,
      stopRequested: false,
      phase: "index-orders",
      startedAt: now,
      updatedAt: now,
      ownerTabId: Number.isInteger(options.ownerTabId) ? options.ownerTabId : null,
      ownerWindowId: Number.isInteger(options.ownerWindowId) ? options.ownerWindowId : null,
      workerTabId: null,
      pagesScanned: 0,
      pageFingerprints: [],
      orders: [],
      detailIndex: 0,
      results: [],
      syncedOrderNumbers: [],
      errors: []
    };
  }

  function mergeOrdersPage(run, records, options = {}) {
    const byOrder = new Map((run.orders || []).map((record) => [orderKey(record), { ...record }]));
    let sawOlder = false;
    let sawTarget = false;
    let newestMonth = "";
    const pageOrders = [];
    (records || []).forEach((raw) => {
      const orderNumber = orderKey(raw);
      if (!orderNumber) return;
      const orderDate = isoDate(raw.orderDate, run.monthKey);
      const recordMonth = orderDate.slice(0, 7);
      if (!recordMonth) return;
      if (!newestMonth || recordMonth > newestMonth) newestMonth = recordMonth;
      if (recordMonth < run.monthKey) {
        sawOlder = true;
        return;
      }
      if (recordMonth !== run.monthKey) return;
      sawTarget = true;
      const record = {
        ...(byOrder.get(orderNumber) || {}),
        ...raw,
        orderNumber,
        orderDate,
        pageUrl: text(raw.pageUrl)
      };
      byOrder.set(orderNumber, record);
      pageOrders.push(record);
    });
    const fingerprint = unique((records || []).map((record) => `${orderKey(record)}:${text(record?.orderDate)}`)).sort().join("|");
    const repeatedPage = Boolean(fingerprint && (run.pageFingerprints || []).includes(fingerprint));
    const orders = [...byOrder.values()].slice(0, run.maxOrders);
    const reachedLimit = orders.length >= run.maxOrders;
    const noNextPage = options.hasNext === false;
    const targetCannotAppear = !sawTarget && newestMonth && newestMonth < run.monthKey;
    const indexComplete = reachedLimit || sawOlder || targetCannotAppear || noNextPage || repeatedPage;
    return {
      ...run,
      orders,
      pagesScanned: Number(run.pagesScanned || 0) + 1,
      pageFingerprints: fingerprint && !repeatedPage
        ? [...(run.pageFingerprints || []), fingerprint]
        : [...(run.pageFingerprints || [])],
      phase: indexComplete ? "capture-details" : "index-orders",
      detailIndex: indexComplete ? 0 : Number(run.detailIndex || 0),
      lastPageOrderCount: pageOrders.length,
      updatedAt: new Date().toISOString()
    };
  }

  function buildNoteProfitRecord(run, base, parsedNote, visibleEarnings, options = {}) {
    const noteEarnings = roundedMoney(parsedNote.marketplaceEarnings);
    const noteCost = roundedMoney(parsedNote.supplierTotal);
    const noteProfit = Number((noteEarnings - noteCost).toFixed(2));
    const skus = unique(base.skus);
    const asins = unique(base.asins).map((value) => value.toUpperCase()).filter((value) => /^[A-Z0-9]{10}$/.test(value));
    return {
      platform: "eBay",
      computerLabel: run.computerLabel,
      accountLabel: run.accountLabel,
      ebayAccountLabel: run.accountLabel,
      orderNumber: base.orderNumber,
      itemTitle: base.itemTitle,
      marketplaceEarnings: noteEarnings,
      noteMarketplaceEarnings: noteEarnings,
      visibleMarketplaceEarnings: Number(visibleEarnings.toFixed(2)),
      marketplaceSoldPrice: null,
      supplier: "Amazon",
      supplierTotal: noteCost,
      supplierProfile: text(parsedNote.supplierProfile),
      eta: text(parsedNote.eta),
      profit: noteProfit,
      margin: noteEarnings > 0 ? noteProfit / noteEarnings : null,
      sku: skus.join(", "),
      supplierItemIds: asins.join(", "),
      supplierOrderNumber: "",
      supplierMatchSource: options.confirmed ? "saved-ebay-note-confirmed" : "saved-ebay-note",
      supplierPageUrl: "",
      supplierItemEvidence: `${options.confirmed ? "Operator-confirmed" : "Parsed"} saved eBay note: ${parsedNote.note}`,
      orderDate: base.orderDate,
      orderStatus: text(base.orderStatus),
      earningsStatus: options.confirmed
        ? "Note amounts confirmed by operator; visible eBay earnings retained separately"
        : "Note earnings checked against visible eBay Order earnings",
      source: options.confirmed ? "ebay-monthly-profit-note-confirmed" : "ebay-monthly-profit-note",
      noteStatus: text(parsedNote.status) || (options.confirmed ? "confirmed-note" : "verified"),
      note: parsedNote.note,
      noteCorrections: unique(parsedNote.corrections),
      capturedAt: base.capturedAt,
      pageUrl: base.pageUrl
    };
  }

  function buildResult(run, sale, detail = {}) {
    const orderNumber = orderKey(detail) || orderKey(sale);
    const orderDate = isoDate(detail.orderDate || sale.orderDate, run.monthKey);
    const base = {
      orderNumber,
      orderDate,
      itemTitle: text(detail.itemTitle || sale.itemTitle),
      pageUrl: text(detail.pageUrl || sale.pageUrl),
      note: text(detail.note),
      marketplaceEarnings: money(detail.marketplaceEarnings),
      skus: unique(detail.skus),
      asins: unique(detail.asins).map((value) => value.toUpperCase()).filter((value) => /^[A-Z0-9]{10}$/.test(value)),
      orderStatus: text(detail.orderStatus),
      capturedAt: text(detail.capturedAt) || new Date().toISOString()
    };
    if (!orderNumber || (sale?.orderNumber && orderNumber !== sale.orderNumber)) {
      return { ...base, status: "order-mismatch", reason: "The order detail page did not match the indexed eBay order." };
    }
    if (!orderDate || orderDate.slice(0, 7) !== run.monthKey) {
      return { ...base, status: "date-mismatch", reason: "The order date is missing or outside the selected month." };
    }
    const visibleEarnings = money(detail.marketplaceEarnings);
    if (visibleEarnings === null || visibleEarnings < 0) {
      return { ...base, status: "missing-earnings", reason: "eBay Order earnings could not be read from the order detail page." };
    }
    const parsedNote = parseSavedNote(detail.note, { visibleEarnings });
    if (!parsedNote.ok) {
      return {
        ...base,
        status: parsedNote.status,
        reason: parsedNote.error,
        visibleEarnings: Number(visibleEarnings.toFixed(2)),
        noteReview: parsedNote
      };
    }
    const record = buildNoteProfitRecord(run, {
      ...base,
      orderStatus: text(detail.orderStatus)
    }, parsedNote, visibleEarnings);
    return { ...base, status: "exact", record };
  }

  function confirmNoteAmounts(run, orderNumber, input = {}) {
    const key = text(orderNumber);
    const index = (run?.results || []).findIndex((result) => orderKey(result) === key);
    if (index < 0) throw new Error("The selected eBay order is not in this monthly review.");
    const current = run.results[index];
    if (!text(current.note)) throw new Error("This order has no saved eBay note to confirm.");
    const visibleEarnings = roundedMoney(current.marketplaceEarnings ?? current.visibleEarnings);
    const noteEarnings = roundedMoney(input.marketplaceEarnings);
    const supplierTotal = roundedMoney(input.supplierTotal);
    if (visibleEarnings === null || visibleEarnings < 0) throw new Error("Visible eBay earnings are unavailable for this order.");
    if (noteEarnings === null || noteEarnings < 0) throw new Error("Enter a valid eBay earnings amount from the saved note.");
    if (supplierTotal === null || supplierTotal <= 0) throw new Error("Enter a valid Amazon cost from the saved note.");
    const parsedCurrent = parseSavedNote(current.note, { visibleEarnings });
    const parsedNote = {
      note: text(current.note),
      marketplaceEarnings: noteEarnings,
      supplierTotal,
      supplierProfile: text(input.supplierProfile || current.noteReview?.supplierProfile || parsedCurrent.supplierProfile),
      eta: text(input.eta || current.noteReview?.eta || parsedCurrent.eta),
      status: "confirmed-note",
      corrections: ["amounts confirmed by operator"]
    };
    const record = buildNoteProfitRecord(run, {
      ...current,
      orderStatus: text(current.orderStatus)
    }, parsedNote, visibleEarnings, { confirmed: true });
    const confirmedAt = new Date().toISOString();
    const confirmed = {
      ...current,
      status: "exact",
      reason: "",
      record,
      noteReview: {
        ...(current.noteReview || {}),
        confirmed: true,
        confirmedAt,
        confirmedMarketplaceEarnings: noteEarnings,
        confirmedSupplierTotal: supplierTotal
      }
    };
    const results = [...run.results];
    results[index] = confirmed;
    return { ...run, results, updatedAt: confirmedAt };
  }

  function mergeDetail(run, detail) {
    const sale = (run.orders || [])[Number(run.detailIndex || 0)] || {};
    const result = buildResult(run, sale, detail);
    const resultsByOrder = new Map((run.results || []).map((entry) => [orderKey(entry), entry]));
    if (result.orderNumber) resultsByOrder.set(result.orderNumber, result);
    const detailIndex = Math.min((run.orders || []).length, Number(run.detailIndex || 0) + 1);
    return {
      ...run,
      results: [...resultsByOrder.values()],
      detailIndex,
      phase: detailIndex >= (run.orders || []).length ? "review" : "capture-details",
      active: detailIndex < (run.orders || []).length,
      updatedAt: new Date().toISOString()
    };
  }

  function exactResults(run) {
    return (run?.results || []).filter((result) => result?.status === "exact" && result.record);
  }

  function unsyncedExactResults(run) {
    const synced = new Set((run?.syncedOrderNumbers || []).map(String));
    return exactResults(run).filter((result) => !synced.has(String(result.orderNumber || "")));
  }

  function unsyncedReviewResults(run) {
    const synced = new Set((run?.syncedOrderNumbers || []).map(String));
    return (run?.results || []).filter((result) => result?.orderNumber && !synced.has(String(result.orderNumber)));
  }

  function buildReconciliationRecord(run, result) {
    const exact = result?.status === "exact" && result.record ? result.record : null;
    const visibleEarnings = money(exact?.visibleMarketplaceEarnings ?? result?.marketplaceEarnings ?? result?.visibleEarnings);
    const noteEarnings = exact ? money(exact.noteMarketplaceEarnings ?? exact.marketplaceEarnings) : null;
    const noteCost = exact ? money(exact.supplierTotal) : null;
    const noteProfit = exact ? money(exact.profit) : null;
    const skus = unique(exact?.sku ? String(exact.sku).split(/[,|]/) : result?.skus);
    const asins = unique(exact?.supplierItemIds ? String(exact.supplierItemIds).split(/[,|]/) : result?.asins)
      .map((value) => value.toUpperCase())
      .filter((value) => /^[A-Z0-9]{10}$/.test(value));
    let reason = "Waiting for an independent exact Amazon order-item match.";
    if (!asins.length) reason = "The eBay SKU did not decode to an exact Amazon ASIN.";
    else if (!exact) reason = `${text(result?.reason) || "The saved-note profit is unresolved."} Independent Amazon matching is still available.`;
    return {
      platform: "eBay",
      computerLabel: text(run?.computerLabel),
      accountLabel: text(run?.accountLabel),
      ebayAccountLabel: text(run?.accountLabel),
      monthKey: normalizeMonthKey(run?.monthKey) || text(result?.orderDate).slice(0, 7),
      orderNumber: text(result?.orderNumber),
      itemTitle: text(exact?.itemTitle || result?.itemTitle),
      marketplaceEarnings: visibleEarnings,
      marketplaceSoldPrice: null,
      orderDate: text(exact?.orderDate || result?.orderDate),
      orderStatus: text(exact?.orderStatus),
      earningsStatus: visibleEarnings === null ? "Missing eBay Order earnings" : "Read from eBay Order earnings",
      sku: skus.join(", "),
      skus,
      supplierItemIds: asins.join(", "),
      asins,
      noteStatus: exact ? text(exact.noteStatus || "verified") : text(result?.status || "unresolved"),
      noteMarketplaceEarnings: noteEarnings,
      noteSupplierTotal: noteCost,
      noteSupplierProfile: text(exact?.supplierProfile),
      noteProfit,
      noteText: text(exact?.note || result?.note),
      supplierTotal: null,
      supplierProfile: "",
      supplierOrderNumber: "",
      supplierMatchSource: "",
      supplierPageUrl: "",
      supplierItemEvidence: "",
      profit: null,
      margin: null,
      status: asins.length ? "amazon-pending" : "missing-sku",
      reason,
      pageUrl: text(exact?.pageUrl || result?.pageUrl),
      attemptedSupplierProfiles: [],
      source: "ebay-monthly-profit-reconciliation",
      capturedAt: text(result?.capturedAt) || new Date().toISOString()
    };
  }

  function reviewRecords(run) {
    return unsyncedReviewResults(run).map((result) => buildReconciliationRecord(run, result));
  }

  function approvalToken(run) {
    return `APPROVE SYNC EBAY ${run?.monthKey || "YYYY-MM"} ${unsyncedReviewResults(run).length}`;
  }

  function summary(run) {
    if (!run) return null;
    const exact = exactResults(run);
    const totals = exact.reduce((aggregate, result) => {
      aggregate.earnings += Number(result.record.marketplaceEarnings || 0);
      aggregate.amazonCost += Number(result.record.supplierTotal || 0);
      aggregate.profit += Number(result.record.profit || 0);
      return aggregate;
    }, { earnings: 0, amazonCost: 0, profit: 0 });
    totals.visibleEbayEarnings = (run.results || []).reduce((sum, result) => {
      const visible = money(result?.record?.visibleMarketplaceEarnings ?? result?.marketplaceEarnings ?? result?.visibleEarnings);
      return sum + Number(visible || 0);
    }, 0);
    Object.keys(totals).forEach((key) => { totals[key] = Number(totals[key].toFixed(2)); });
    const statuses = {};
    (run.results || []).forEach((result) => { statuses[result.status] = Number(statuses[result.status] || 0) + 1; });
    return {
      runId: run.runId,
      phase: run.phase,
      monthKey: run.monthKey,
      monthLabel: run.monthLabel,
      pagesScanned: Number(run.pagesScanned || 0),
      ordersIndexed: (run.orders || []).length,
      detailsCaptured: (run.results || []).length,
      exact: exact.length,
      unresolved: (run.results || []).length - exact.length,
      unsyncedExact: unsyncedExactResults(run).length,
      unsyncedReviewed: unsyncedReviewResults(run).length,
      synced: (run.syncedOrderNumbers || []).length,
      statuses,
      totals,
      approvalToken: approvalToken(run),
      active: run.active === true,
      pausedReason: text(run.pausedReason)
    };
  }

  function compactControlRecord(run) {
    if (!run) return null;
    const compact = summary(run);
    return {
      active: run.active === true,
      phase: run.phase,
      runId: run.runId,
      monthKey: run.monthKey,
      workerTabId: run.workerTabId,
      ownerTabId: run.ownerTabId,
      updatedAt: run.updatedAt,
      summary: compact,
      errors: (run.errors || []).slice(-10)
    };
  }

  return Object.freeze({
    STATE_VERSION,
    normalizeMonthKey,
    monthLabel,
    classifyOrdersIndexPage,
    isoDate,
    monthKeyForDate,
    extractOrderDateText,
    parseSavedNote,
    createRun,
    mergeOrdersPage,
    buildResult,
    confirmNoteAmounts,
    mergeDetail,
    exactResults,
    unsyncedExactResults,
    unsyncedReviewResults,
    buildReconciliationRecord,
    reviewRecords,
    approvalToken,
    summary,
    compactControlRecord
  });
});
