(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_LISTING_PREFLIGHT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTION_RANK = Object.freeze({ clear: 0, review: 1, block: 2 });

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSearchText(value) {
    return normalizeText(value).toLowerCase();
  }

  function extractAmazonAsins(value) {
    const text = String(value || '');
    const found = new Set();
    const patterns = [
      /amazon\.[a-z.]+\/(?:[^\s?#]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|\b)/gi,
      /\basin\s*[:#-]?\s*([A-Z0-9]{10})\b/gi,
      /^\s*([A-Z0-9]{10})\s*$/gim
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text))) found.add(match[1].toUpperCase());
    }
    return [...found];
  }

  function isAmazonUrl(value) {
    try {
      const hostname = new URL(String(value || '')).hostname.toLowerCase();
      return /^(?:[a-z0-9-]+\.)*amazon\.[a-z.]+$/.test(hostname);
    } catch {
      return false;
    }
  }

  function amazonUrlSearchText(value) {
    if (!isAmazonUrl(value)) return '';
    try {
      const url = new URL(value);
      const decodedPath = decodeURIComponent(url.pathname)
        .replace(/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:[/?#].*)?$/i, ' ')
        .replace(/[\/_+.-]+/g, ' ');
      return normalizeText(decodedPath);
    } catch {
      return '';
    }
  }

  function parseInputRows(value) {
    const rows = [];
    const seen = new Set();
    for (const rawLine of String(value || '').split(/\r?\n/)) {
      const input = normalizeText(rawLine);
      if (!input) continue;
      const urls = input.match(/https?:\/\/[^\s,"']+/gi) || [];
      const amazonUrls = urls.filter(isAmazonUrl);
      const asins = extractAmazonAsins(input);
      const title = normalizeText(input
        .replace(/https?:\/\/[^\s,"']+/gi, ' ')
        .replace(/\basin\s*[:#-]?\s*[A-Z0-9]{10}\b/gi, ' '));
      const urlSearchText = normalizeText(amazonUrls.map(amazonUrlSearchText).filter(Boolean).join(' '));
      const key = normalizeSearchText(input);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        index: rows.length + 1,
        input,
        title,
        urls,
        amazonUrls,
        asins,
        urlSearchText,
        hasProductEvidence: Boolean(title || urlSearchText)
      });
    }
    return rows;
  }

  function normalizeRule(rule) {
    const type = normalizeSearchText(rule?.type);
    const action = normalizeSearchText(rule?.action);
    const value = type === 'asin'
      ? normalizeText(rule?.value).toUpperCase()
      : normalizeText(rule?.value);
    if (!['asin', 'brand', 'keyword'].includes(type)) return null;
    if (!['review', 'block'].includes(action)) return null;
    if (!value) return null;
    if (type === 'asin' && !/^[A-Z0-9]{10}$/.test(value)) return null;
    return {
      id: normalizeText(rule?.id),
      type,
      value,
      action,
      reason: normalizeText(rule?.reason) || 'Reviewed listing-restriction signal.',
      reviewedBy: normalizeText(rule?.reviewedBy),
      reviewedAt: normalizeText(rule?.reviewedAt),
      source: normalizeText(rule?.source),
      sourceType: normalizeSearchText(rule?.sourceType) || 'reviewed-source',
      authority: normalizeText(rule?.authority),
      evidenceUrls: Array.isArray(rule?.evidenceUrls)
        ? rule.evidenceUrls.map(normalizeText).filter(Boolean)
        : []
    };
  }

  function normalizeRulePack(pack) {
    const rules = Array.isArray(pack?.rules) ? pack.rules.map(normalizeRule).filter(Boolean) : [];
    return {
      schemaVersion: Number(pack?.schemaVersion || 1),
      generatedAt: normalizeText(pack?.generatedAt),
      sourceGeneratedAt: normalizeText(pack?.sourceGeneratedAt),
      ruleCount: rules.length,
      rules
    };
  }

  function evaluateRows(rows, rulePack) {
    const pack = normalizeRulePack(rulePack);
    if (!pack.rules.length) {
      return (rows || []).map((row) => ({
        ...row,
        action: 'review',
        status: 'REVIEW',
        matches: [],
        reason: 'No reviewed rules are loaded. This item cannot be cleared for copying.'
      }));
    }
    return (rows || []).map((row) => evaluateRow(row, pack.rules));
  }

  function evaluateRow(row, rules) {
    const haystack = normalizeSearchText([row.input, row.title, row.urlSearchText, ...(row.urls || [])].join(' '));
    const asinSet = new Set((row.asins || []).map((asin) => String(asin).toUpperCase()));
    const matches = [];
    for (const rule of rules || []) {
      const matched = rule.type === 'asin'
        ? asinSet.has(rule.value)
        : includesReviewedPhrase(haystack, normalizeSearchText(rule.value));
      if (matched) matches.push(rule);
    }
    matches.sort((left, right) => ACTION_RANK[right.action] - ACTION_RANK[left.action]);
    const action = matches[0]?.action || (row.hasProductEvidence === false ? 'review' : 'clear');
    return {
      ...row,
      action,
      status: action.toUpperCase(),
      matches,
      reason: matches.length
        ? matches.map((rule) => `${rule.type.toUpperCase()}: ${rule.value} - ${rule.reason}`).join(' | ')
        : action === 'review'
          ? 'The Amazon URL or ASIN does not include a product name. Open or export product details before treating it as Ready.'
        : 'No current shared-rule match. This is not an eBay approval.'
    };
  }

  function summarizeResults(results) {
    const summary = { total: 0, clear: 0, review: 0, block: 0 };
    for (const result of results || []) {
      summary.total += 1;
      if (Object.hasOwn(summary, result.action)) summary[result.action] += 1;
    }
    return summary;
  }

  function resultsForAction(results, action) {
    const normalizedAction = normalizeSearchText(action);
    if (!Object.hasOwn(ACTION_RANK, normalizedAction)) return [];
    return (results || []).filter((result) => result?.action === normalizedAction);
  }

  function copyPayload(results, action = 'clear') {
    return resultsForAction(results, action)
      .map((result) => normalizeText(result?.input))
      .filter(Boolean)
      .join('\n');
  }

  function canonicalAmazonProductUrl(row) {
    const amazonUrl = (row?.amazonUrls || []).find(Boolean);
    const asin = String(row?.asins?.[0] || '').toUpperCase();
    if (amazonUrl) {
      try {
        const parsed = new URL(amazonUrl);
        if (asin) return `${parsed.protocol}//${parsed.hostname}/dp/${asin}`;
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
      } catch {
        return '';
      }
    }
    return /^[A-Z0-9]{10}$/.test(asin) ? `https://www.amazon.com/dp/${asin}` : '';
  }

  function copyAmazonLinkPayload(results, action = 'clear') {
    return resultsForAction(results, action)
      .map(canonicalAmazonProductUrl)
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join('\n');
  }

  function includesReviewedPhrase(haystack, phrase) {
    if (!phrase) return false;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(haystack);
  }

  return Object.freeze({
    normalizeText,
    normalizeSearchText,
    extractAmazonAsins,
    isAmazonUrl,
    amazonUrlSearchText,
    parseInputRows,
    normalizeRule,
    normalizeRulePack,
    evaluateRows,
    evaluateRow,
    summarizeResults,
    resultsForAction,
    copyPayload,
    canonicalAmazonProductUrl,
    copyAmazonLinkPayload
  });
});
