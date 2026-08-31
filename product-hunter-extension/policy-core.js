(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_LISTING_PREFLIGHT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACTION_RANK = Object.freeze({ clear: 0, review: 1, block: 2 });
  const RULE_TYPES = Object.freeze(['asin', 'brand', 'keyword', 'compound']);
  const RULE_ACTIONS = Object.freeze(['review', 'block']);
  const COMMUNITY_SOURCE_TYPES = Object.freeze(['profile2-discord', 'profile2-telegram']);
  const OFFICIAL_EBAY_URL_RE = /^https:\/\/(?:www\.)?ebay\.com\/(?:help\/|sellercenter\/)|^https:\/\/ocsnext\.ebay\.com\/help\//i;
  const DISCORD_URL_RE = /^https:\/\/discord\.com\/channels\/\d{15,22}\/\d{15,22}\/\d{15,22}$/i;
  const TELEGRAM_URL_RE = /^https:\/\/t\.me\/(?:s\/)?[A-Za-z0-9_]{5,}\/\d+$/i;
  const SAFE_UNIT_TOKEN_RE = /^\d+(?:x\d+)*(?:mm|cm|m|in|inch|inches|ft|feet|oz|lb|lbs|g|kg|ml|l|qt|gal|pc|pcs|piece|pieces|pk|pack|count|ct|set)?$/i;
  const MODEL_TOKEN_RE = /^(?=.{4,}$)(?=.*[a-z])(?=.*\d)[a-z0-9]+(?:-[a-z0-9]+)*$/i;
  const BUILTIN_IP_REVIEW_RE = /(?:[®™©]|\b(?:authentic|authorized|brand|branded|celebrity|character|collectible|copyright|counterfeit|designer|fan\s*art|franchise|genuine|in\s+the\s+style\s+of|inspired\s+by|licensed|logo|model|official|original|patent(?:ed)?|replica|team|trademark|vero|warranty)\b|\b(?:compatible\s+with|fits?|replacement\s+(?:for|part))\s+[a-z0-9])/i;

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSearchText(value) {
    return normalizeText(value).toLowerCase();
  }

  function uniqueNormalizedStrings(values, { lower = false } = {}) {
    const seen = new Set();
    const output = [];
    for (const raw of Array.isArray(values) ? values : []) {
      const value = lower ? normalizeSearchText(raw) : normalizeText(raw);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      output.push(value);
    }
    return output;
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

  function labelledField(value, label) {
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(value || '').match(new RegExp(`(?:^|\\|)\\s*${escaped}\\s*:\\s*([^|]+)`, 'i'));
    return normalizeText(match?.[1]);
  }

  function stripLabelledFields(value) {
    return normalizeText(String(value || '')
      .replace(/(?:^|\|)\s*(?:title|brand|manufacturer|category|model|bullets?|details?)\s*:\s*[^|]+/gi, ' ')
      .replace(/\|+/g, ' '));
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
      const explicitTitle = labelledField(input, 'title');
      const brand = labelledField(input, 'brand') || labelledField(input, 'manufacturer');
      const category = labelledField(input, 'category');
      const model = labelledField(input, 'model');
      const bullets = labelledField(input, 'bullet') || labelledField(input, 'bullets');
      const details = labelledField(input, 'detail') || labelledField(input, 'details');
      const unlabelled = stripLabelledFields(input)
        .replace(/https?:\/\/[^\s,"']+/gi, ' ')
        .replace(/\basin\s*[:#-]?\s*[A-Z0-9]{10}\b/gi, ' ');
      const title = explicitTitle || normalizeText(unlabelled);
      const urlSearchText = normalizeText(amazonUrls.map(amazonUrlSearchText).filter(Boolean).join(' '));
      const key = normalizeSearchText(input);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        index: rows.length + 1,
        input,
        title,
        brand,
        category,
        model,
        bullets,
        details,
        clearanceText: title,
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
    if (!RULE_TYPES.includes(type)) return null;
    if (!RULE_ACTIONS.includes(action)) return null;
    if (!value) return null;
    if (type === 'asin' && !/^[A-Z0-9]{10}$/.test(value)) return null;
    const normalized = {
      id: normalizeText(rule?.id),
      type,
      value,
      allOf: uniqueNormalizedStrings(rule?.allOf, { lower: true }),
      anyOf: uniqueNormalizedStrings(rule?.anyOf, { lower: true }),
      noneOf: uniqueNormalizedStrings(rule?.noneOf, { lower: true }),
      action,
      reason: normalizeText(rule?.reason),
      policyTopic: normalizeText(rule?.policyTopic),
      evidenceKind: normalizeText(rule?.evidenceKind),
      reviewedBy: normalizeText(rule?.reviewedBy),
      reviewedAt: normalizeText(rule?.reviewedAt),
      source: normalizeText(rule?.source),
      sourceType: normalizeSearchText(rule?.sourceType) || 'reviewed-source',
      authority: normalizeText(rule?.authority),
      evidenceUrls: uniqueNormalizedStrings(rule?.evidenceUrls)
    };
    if (type === 'compound' && !normalized.allOf.length && !normalized.anyOf.length) return null;
    return normalized;
  }

  function normalizeClearancePolicy(value) {
    const readyPhrases = uniqueNormalizedStrings(value?.readyPhrases, { lower: true });
    const genericTokens = uniqueNormalizedStrings(value?.genericTokens, { lower: true });
    const reviewPhrases = uniqueNormalizedStrings(value?.reviewPhrases, { lower: true });
    const genericBrandValues = uniqueNormalizedStrings(value?.genericBrandValues, { lower: true });
    const evidenceUrls = uniqueNormalizedStrings(value?.evidenceUrls);
    return {
      id: normalizeText(value?.id),
      version: normalizeText(value?.version),
      mode: normalizeSearchText(value?.mode),
      reviewedAt: normalizeText(value?.reviewedAt),
      maxAgeDays: Math.max(0, Number(value?.maxAgeDays || 0)),
      readyPhrases,
      genericTokens,
      reviewPhrases,
      genericBrandValues,
      evidenceUrls,
      reason: normalizeText(value?.reason)
    };
  }

  function evidenceUrlMatches(sourceType, url) {
    if (sourceType === 'official-ebay') return OFFICIAL_EBAY_URL_RE.test(url);
    if (sourceType === 'profile2-discord') return DISCORD_URL_RE.test(url);
    if (sourceType === 'profile2-telegram') return TELEGRAM_URL_RE.test(url);
    return false;
  }

  function strictRulePackErrors(pack, rawRules, normalizedRules, clearancePolicy) {
    const errors = [];
    if (!rawRules.length) errors.push('The reviewed rule pack is empty.');
    if (normalizedRules.length !== rawRules.length) errors.push('One or more reviewed rules are malformed.');
    if (Number(pack?.ruleCount) !== rawRules.length) errors.push('The declared rule count does not match the rule array.');
    const ids = new Set();
    const keys = new Set();
    for (const rule of normalizedRules) {
      if (!rule.id || !rule.reason || !rule.reviewedBy || !/^\d{4}-\d{2}-\d{2}/.test(rule.reviewedAt)) {
        errors.push(`Rule '${rule.value}' is missing required review metadata.`);
      }
      if (!['official-ebay', ...COMMUNITY_SOURCE_TYPES].includes(rule.sourceType)) {
        errors.push(`Rule '${rule.value}' has an unsupported source type.`);
      }
      if (COMMUNITY_SOURCE_TYPES.includes(rule.sourceType) && rule.action === 'block') {
        errors.push(`Community rule '${rule.value}' cannot create a Block.`);
      }
      if (!rule.evidenceUrls.length || rule.evidenceUrls.some((url) => !evidenceUrlMatches(rule.sourceType, url))) {
        errors.push(`Rule '${rule.value}' has missing or mismatched source evidence.`);
      }
      const key = [
        rule.type,
        normalizeSearchText(rule.value),
        rule.allOf.join(','),
        rule.anyOf.join(','),
        rule.noneOf.join(','),
        rule.sourceType
      ].join(':');
      if (ids.has(rule.id)) errors.push(`Duplicate rule id '${rule.id}'.`);
      if (keys.has(key)) errors.push(`Duplicate reviewed rule '${key}'.`);
      ids.add(rule.id);
      keys.add(key);
    }
    if (clearancePolicy.mode !== 'review-unless-generic-allowlist') {
      errors.push('The rule pack does not contain the supported fail-closed clearance mode.');
    }
    if (!clearancePolicy.id || !clearancePolicy.version || !/^\d{4}-\d{2}-\d{2}/.test(clearancePolicy.reviewedAt)) {
      errors.push('The clearance profile is missing versioned review metadata.');
    }
    if (!clearancePolicy.readyPhrases.length || !clearancePolicy.genericTokens.length) {
      errors.push('The clearance profile has no reviewed generic allowlist.');
    }
    if (!clearancePolicy.evidenceUrls.length || clearancePolicy.evidenceUrls.some((url) => !OFFICIAL_EBAY_URL_RE.test(url))) {
      errors.push('The clearance profile needs exact official eBay evidence URLs.');
    }
    return [...new Set(errors)];
  }

  function normalizePolicyCoverage(values) {
    const entries = Array.isArray(values)
      ? values
      : [
          ...(Array.isArray(values?.pages) ? values.pages : []),
          ...(Array.isArray(values?.supplementalPages) ? values.supplementalPages : [])
        ];
    return entries.map((entry) => ({
      id: normalizeText(entry?.id),
      title: normalizeText(entry?.title),
      disposition: normalizeSearchText(entry?.disposition || entry?.handling),
      url: normalizeText(entry?.url)
    })).filter((entry) => entry.title && OFFICIAL_EBAY_URL_RE.test(entry.url));
  }

  function normalizeRulePack(pack) {
    const schemaVersion = Number(pack?.schemaVersion || 1);
    const rawRules = Array.isArray(pack?.rules) ? pack.rules : [];
    const normalizedRules = rawRules.map(normalizeRule).filter(Boolean);
    const clearancePolicy = normalizeClearancePolicy(pack?.clearancePolicy);
    const policyCoverage = normalizePolicyCoverage(pack?.policyCoverage);
    const validationErrors = schemaVersion >= 2
      ? strictRulePackErrors(pack, rawRules, normalizedRules, clearancePolicy)
      : [];
    const valid = schemaVersion >= 2 ? validationErrors.length === 0 : normalizedRules.length > 0;
    const rules = valid ? normalizedRules : [];
    return {
      schemaVersion,
      version: normalizeText(pack?.version),
      generatedAt: normalizeText(pack?.generatedAt),
      sourceGeneratedAt: normalizeText(pack?.sourceGeneratedAt),
      declaredRuleCount: Number(pack?.ruleCount || rawRules.length || 0),
      ruleCount: rules.length,
      valid,
      validationErrors,
      clearancePolicy,
      policyCoverage,
      rules
    };
  }

  function evaluateRows(rows, rulePack) {
    const pack = normalizeRulePack(rulePack);
    if (!pack.valid || !pack.rules.length) {
      const detail = pack.validationErrors[0] ? ` ${pack.validationErrors[0]}` : '';
      return (rows || []).map((row) => ({
        ...row,
        action: 'review',
        status: 'REVIEW',
        matches: [],
        reason: `Reviewed policy data is unavailable or invalid.${detail} This item cannot be cleared for copying.`
      }));
    }
    return (rows || []).map((row) => evaluateRow(row, pack.rules, pack.clearancePolicy));
  }

  function evaluateRow(row, rules, clearancePolicy = {}) {
    const fields = {
      input: normalizeText(row?.input),
      title: normalizeText(row?.title),
      urlSearchText: normalizeText(row?.urlSearchText),
      brand: normalizeText(row?.brand),
      category: normalizeText(row?.category),
      model: normalizeText(row?.model),
      bullets: normalizeText(row?.bullets),
      details: normalizeText(row?.details)
    };
    const haystack = normalizeSearchText(Object.values(fields).join(' '));
    const asinSet = new Set((row?.asins || []).map((asin) => String(asin).toUpperCase()));
    const matches = [];
    for (const rule of rules || []) {
      let matched = false;
      if (rule.type === 'asin') matched = asinSet.has(rule.value);
      else if (rule.type === 'brand') matched = includesReviewedPhrase(normalizeSearchText(fields.brand), normalizeSearchText(rule.value));
      else if (rule.type === 'compound') matched = true;
      else matched = includesReviewedPhrase(haystack, normalizeSearchText(rule.value));
      if (matched && rule.allOf?.length) matched = rule.allOf.every((phrase) => includesReviewedPhrase(haystack, phrase));
      if (matched && rule.anyOf?.length) matched = rule.anyOf.some((phrase) => includesReviewedPhrase(haystack, phrase));
      if (matched && rule.noneOf?.length) matched = rule.noneOf.every((phrase) => !includesReviewedPhrase(haystack, phrase));
      if (matched) matches.push(rule);
    }
    matches.sort((left, right) => ACTION_RANK[right.action] - ACTION_RANK[left.action]);
    if (matches.length) {
      const action = matches[0].action;
      return {
        ...row,
        action,
        status: action.toUpperCase(),
        matches,
        reason: matches.map((rule) => `${rule.type.toUpperCase()}: ${rule.value} - ${rule.reason}`).join(' | ')
      };
    }

    const clearance = clearanceDecision(row, clearancePolicy);
    return {
      ...row,
      action: clearance.action,
      status: clearance.action.toUpperCase(),
      matches: [],
      reason: clearance.reason,
      clearancePhrase: clearance.clearancePhrase || '',
      unknownTokens: clearance.unknownTokens || []
    };
  }

  function clearanceDecision(row, rawPolicy) {
    const policy = normalizeClearancePolicy(rawPolicy);
    if (policy.mode !== 'review-unless-generic-allowlist' || !policy.readyPhrases.length || !policy.genericTokens.length) {
      return { action: 'review', reason: 'No valid generic-only clearance profile is loaded. This item needs manual review.' };
    }
    if (policyProfileIsStale(policy)) {
      return { action: 'review', reason: 'The official-policy clearance profile is stale. Refresh policy research before treating this item as Ready.' };
    }
    if (row?.hasProductEvidence === false) {
      return { action: 'review', reason: 'The Amazon URL or ASIN does not include a product name. Open or export product details before treating it as Ready.' };
    }
    if (normalizeSearchText(row?.sourceKind) === 'active-listing-title-only') {
      return { action: 'review', reason: 'Existing-listing evidence is limited to title, SKU/ASIN, category when visible, and price. Authenticity, authorization, brand, images, item specifics, description, product safety, eligibility, and provenance still require human review.' };
    }
    const sourceKind = normalizeSearchText(row?.sourceKind);
    const brand = normalizeSearchText(row?.brand);
    if (!brand && sourceKind !== 'product-hunter-search') {
      return { action: 'review', reason: 'Explicit product-page brand evidence is missing. A title, search result, Amazon URL, or ASIN alone cannot become Ready; collect full product details and confirm the reported brand is Generic or Unbranded.' };
    }
    if (brand && !policy.genericBrandValues.includes(brand)) {
      return { action: 'review', reason: `Reported brand '${normalizeText(row.brand)}' requires authenticity, authorization, VeRO, and intellectual-property review.` };
    }
    if (normalizeText(row?.model)) {
      return { action: 'review', reason: 'A reported model or product-line value requires brand, compatibility, and intellectual-property review.' };
    }
    const productText = normalizeSearchText(row?.clearanceText || [
      row?.title,
      row?.urlSearchText,
      row?.category,
      row?.brand,
      row?.model
    ].join(' '));
    const reviewPhrase = policy.reviewPhrases.find((phrase) => includesReviewedPhrase(productText, phrase));
    if (reviewPhrase) {
      return { action: 'review', reason: `The phrase '${reviewPhrase}' requires restricted-item, authenticity, VeRO, or intellectual-property review.` };
    }
    if (BUILTIN_IP_REVIEW_RE.test(productText)) {
      return { action: 'review', reason: 'The product text contains a brand, model, licensing, compatibility, authenticity, or other intellectual-property cue.' };
    }
    const clearancePhrase = policy.readyPhrases.find((phrase) => includesReviewedPhrase(productText, phrase));
    if (!clearancePhrase) {
      return { action: 'review', reason: 'The product does not match a reviewed generic-only research family. Unknown items stay in Needs review.' };
    }
    const allowedTokens = new Set(policy.genericTokens);
    for (const phrase of policy.readyPhrases) tokenize(phrase).forEach((token) => allowedTokens.add(token));
    const unknownTokens = tokenize(productText).filter((token) => {
      if (allowedTokens.has(token) || SAFE_UNIT_TOKEN_RE.test(token)) return false;
      return token.length > 1;
    });
    const uniqueUnknown = [...new Set(unknownTokens)];
    if (uniqueUnknown.length) {
      const modelToken = uniqueUnknown.find((token) => MODEL_TOKEN_RE.test(token));
      return {
        action: 'review',
        reason: modelToken
          ? `Unreviewed model-like term '${modelToken}' requires brand and compatibility review.`
          : `Unreviewed title term${uniqueUnknown.length === 1 ? '' : 's'} (${uniqueUnknown.slice(0, 5).join(', ')}) may be a brand, model, character, claim, or restricted detail.`,
        unknownTokens: uniqueUnknown
      };
    }
    return {
      action: 'clear',
      reason: `Matches the reviewed generic-only family '${clearancePhrase}' with no detected extra brand, model, IP, or restricted-policy term. Ready is not eBay approval; inspect the exact product, images, packaging, provenance, recalls, and final listing.`,
      clearancePhrase
    };
  }

  function policyProfileIsStale(policy, now = new Date()) {
    if (!policy.maxAgeDays) return false;
    const reviewed = new Date(`${policy.reviewedAt}T00:00:00.000Z`);
    if (Number.isNaN(reviewed.valueOf())) return true;
    return now.valueOf() - reviewed.valueOf() > policy.maxAgeDays * 86400000;
  }

  function tokenize(value) {
    return normalizeSearchText(value).match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
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
    normalizeClearancePolicy,
    normalizeRulePack,
    evaluateRows,
    evaluateRow,
    clearanceDecision,
    policyProfileIsStale,
    tokenize,
    summarizeResults,
    resultsForAction,
    copyPayload,
    canonicalAmazonProductUrl,
    copyAmazonLinkPayload,
    includesReviewedPhrase
  });
});
