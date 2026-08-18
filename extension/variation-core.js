(function initializeVariationCore(root) {
  "use strict";

  if (root.GLDN_VARIATION_CORE) return;

  const REQUIRED_HEADERS = Object.freeze([
    "Item number",
    "Title",
    "Variation details"
  ]);

  function normalizeHeader(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim();
  }

  function parseCsv(text) {
    const source = String(text || "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (quoted) throw new Error("The CSV ends inside a quoted field.");
    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows.filter((values) => values.some((value) => String(value || "").trim()));
  }

  function csvRecords(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("The eBay report has no listing rows.");
    const headers = rows[0].map(normalizeHeader);
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) {
      throw new Error(`This is not an eBay Active Listings report. Missing: ${missing.join(", ")}.`);
    }
    const records = rows.slice(1).map((values) => Object.fromEntries(
      headers.map((header, index) => [header, String(values[index] || "").trim()])
    ));
    return { headers, records };
  }

  function numberValue(value) {
    const cleaned = String(value || "").replace(/[$,]/g, "").trim();
    if (!cleaned) return null;
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function unique(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function firstValue(rows, header) {
    return rows.map((row) => String(row?.[header] || "").trim()).find(Boolean) || "";
  }

  function compactVariationDetails(rows) {
    const details = unique(rows.map((row) => row["Variation details"]));
    return {
      count: details.length,
      values: details.slice(0, 8),
      summary: details.slice(0, 3).join(" | ")
    };
  }

  function priceSummary(rows) {
    const prices = rows.flatMap((row) => [
      numberValue(row["Current price"]),
      numberValue(row["Start price"]),
      numberValue(row["Auction Buy It Now price"])
    ]).filter((value) => Number.isFinite(value));
    if (!prices.length) return { min: null, max: null };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }

  function formatPriceRange(min, max) {
    const first = numberValue(min);
    const second = numberValue(max);
    if (!Number.isFinite(first) && !Number.isFinite(second)) return "Not reported";
    const low = Number.isFinite(first) ? first : second;
    const high = Number.isFinite(second) ? second : first;
    const minimum = Math.min(low, high);
    const maximum = Math.max(low, high);
    return `$${minimum.toFixed(2)} - $${maximum.toFixed(2)}`;
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function buildVariationAudit(text, metadata = {}) {
    const parsed = csvRecords(text);
    const grouped = new Map();
    for (const record of parsed.records) {
      const itemId = String(record["Item number"] || "").trim();
      if (!/^\d{9,15}$/.test(itemId)) continue;
      if (!grouped.has(itemId)) grouped.set(itemId, []);
      grouped.get(itemId).push(record);
    }

    const listings = [];
    let variationRowCount = 0;
    for (const [itemId, rows] of grouped.entries()) {
      const variationRows = rows.filter((row) => String(row["Variation details"] || "").trim());
      if (!variationRows.length) continue;
      variationRowCount += variationRows.length;
      const details = compactVariationDetails(variationRows);
      const prices = priceSummary(rows);
      listings.push({
        itemId,
        title: firstValue(rows, "Title"),
        sku: unique(rows.map((row) => row["Custom label (SKU)"])).join(", "),
        category: firstValue(rows, "eBay category 1 name"),
        format: firstValue(rows, "Format"),
        availableQuantity: firstValue(rows, "Available quantity"),
        soldQuantity: firstValue(rows, "Sold quantity"),
        startDate: firstValue(rows, "Start date"),
        endDate: firstValue(rows, "End date"),
        variationRowCount: variationRows.length,
        variationValueCount: details.count,
        variationValues: details.values,
        variationSummary: details.summary,
        minPrice: prices.min,
        maxPrice: prices.max
      });
    }

    listings.sort((left, right) => left.title.localeCompare(right.title) || left.itemId.localeCompare(right.itemId));
    const itemIds = listings.map((listing) => listing.itemId);
    const importedAt = new Date().toISOString();
    const reportName = String(metadata.name || "eBay Active Listings report.csv");
    const reportModifiedAt = Number(metadata.lastModified || 0) > 0
      ? new Date(Number(metadata.lastModified)).toISOString()
      : "";
    return {
      schemaVersion: 1,
      reportName,
      reportModifiedAt,
      importedAt,
      reportFingerprint: `variations-${fnv1a(`${reportName}|${parsed.records.length}|${itemIds.join("|")}`)}`,
      totalReportRows: parsed.records.length,
      uniqueListingCount: grouped.size,
      variationRowCount,
      variationListingCount: listings.length,
      listings
    };
  }

  function buildLiveVariationAudit(records, metadata = {}) {
    const uniqueRecords = new Map();
    for (const raw of Array.isArray(records) ? records : []) {
      const itemId = String(raw?.itemId || "").trim();
      if (!/^\d{9,15}$/.test(itemId) || raw?.multiVariationListing !== true) continue;
      if (uniqueRecords.has(itemId)) throw new Error(`Duplicate live variation parent: ${itemId}.`);
      const prices = [numberValue(raw?.minPrice), numberValue(raw?.maxPrice)]
        .filter((value) => Number.isFinite(value));
      const variationSummary = String(raw?.variationSummary || raw?.variationLabel || "Multiple variations").trim();
      uniqueRecords.set(itemId, {
        itemId,
        title: String(raw?.title || "").trim(),
        sku: String(raw?.sku || "").trim(),
        category: String(raw?.category || "").trim(),
        format: String(raw?.format || "Buy It Now").trim(),
        availableQuantity: String(raw?.availableQuantity ?? "").trim(),
        soldQuantity: String(raw?.soldQuantity ?? "").trim(),
        startDate: String(raw?.startDate || "").trim(),
        endDate: String(raw?.endDate || "").trim(),
        variationRowCount: Math.max(1, Number(raw?.variationRowCount || 1)),
        variationValueCount: Math.max(1, Number(raw?.variationValueCount || 1)),
        variationValues: variationSummary ? [variationSummary] : [],
        variationSummary,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null
      });
    }
    const listings = [...uniqueRecords.values()]
      .sort((left, right) => left.title.localeCompare(right.title) || left.itemId.localeCompare(right.itemId));
    const scannedAt = String(metadata.scannedAt || new Date().toISOString());
    const reportName = String(metadata.name || "Automated eBay Active Listings scan");
    const itemIds = listings.map((listing) => listing.itemId);
    const totalListings = Math.max(listings.length, Number(metadata.totalListings || 0));
    return {
      schemaVersion: 1,
      source: "automated-ebay-scan",
      sourceTabId: Number.isInteger(Number(metadata.sourceTabId)) ? Number(metadata.sourceTabId) : null,
      reportName,
      reportModifiedAt: scannedAt,
      importedAt: scannedAt,
      reportFingerprint: `variations-${fnv1a(`${reportName}|${totalListings}|${itemIds.join("|")}`)}`,
      totalReportRows: totalListings,
      uniqueListingCount: totalListings,
      variationRowCount: listings.length,
      variationListingCount: listings.length,
      listings
    };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function auditCsv(audit, selectedIds = []) {
    const allowed = new Set((selectedIds || []).map(String));
    const rows = (audit?.listings || []).filter((listing) => !allowed.size || allowed.has(listing.itemId));
    const headers = [
      "Item number",
      "Title",
      "Custom label (SKU)",
      "Category",
      "Variation rows",
      "Variation values",
      "Price minimum",
      "Price maximum",
      "Available quantity",
      "Sold quantity"
    ];
    const body = rows.map((listing) => [
      listing.itemId,
      listing.title,
      listing.sku,
      listing.category,
      listing.variationRowCount,
      listing.variationValues.join(" | "),
      listing.minPrice ?? "",
      listing.maxPrice ?? "",
      listing.availableQuantity,
      listing.soldQuantity
    ]);
    return [headers, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  root.GLDN_VARIATION_CORE = Object.freeze({
    REQUIRED_HEADERS,
    parseCsv,
    csvRecords,
    buildVariationAudit,
    buildLiveVariationAudit,
    formatPriceRange,
    auditCsv
  });
})(globalThis);
