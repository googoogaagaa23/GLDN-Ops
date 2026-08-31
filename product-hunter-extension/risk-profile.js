(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_PRODUCT_HUNTER_RISK_PROFILE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Seed authority lives only in policy-rules.json clearancePolicy. Keeping no
  // static fallback prevents a stale partial list from starting a hunt when
  // the reviewed 500-phrase profile is missing or invalid.
  const APPROVED_SEEDS = Object.freeze([]);

  const GENERIC_BRAND_LABELS = Object.freeze([
    'generic',
    'unbranded',
    'brandless',
    'does not apply',
    'not applicable',
    'n/a',
    'na',
    'none'
  ]);

  const IP_CUE_PHRASES = Object.freeze([
    'authentic',
    'character',
    'compatible with',
    'copyright',
    'designer inspired',
    'designed for',
    'dupe',
    'fan art',
    'fan made',
    'fanart',
    'franchise',
    'genuine',
    'inspired by',
    'licensed',
    'logo',
    'official',
    'officially licensed',
    'oem',
    'patent',
    'replica',
    'replacement for',
    'trademark',
    'unauthorized'
  ]);

  // A practical title/evidence backstop. This is not presented as a complete
  // VeRO roster; any non-generic brand is independently sent to Review.
  const PROTECTED_NAME_CUES = Object.freeze([
    '3m', 'adidas', 'airpods', 'alexa', 'amazon basics', 'apple', 'barbie',
    'batman', 'beats', 'black and decker', 'bose', 'burberry', 'cartier',
    'chanel', 'command', 'converse', 'crocs', 'dc comics', 'dewalt', 'disney',
    'dyson', 'fisher price', 'fortnite', 'gucci', 'harry potter', 'hermes',
    'hello kitty', 'hot wheels', 'iphone', 'ipad', 'kitchenaid', 'lego',
    'louis vuitton', 'marvel', 'mattel', 'mickey mouse', 'microsoft',
    'minecraft', 'nintendo', 'nike', 'ninja', 'paw patrol', 'pixar',
    'playstation', 'pokemon', 'prada', 'rolex', 'rubbermaid', 'samsung',
    'scotch', 'simplehuman', 'sony', 'star wars', 'superman', 'taylor swift',
    'the north face', 'tiktok', 'transformers', 'under armour', 'warner bros',
    'xbox', 'yeti'
  ]);

  return Object.freeze({
    schemaVersion: 1,
    profileVersion: '2026-08-30.1',
    reviewedAt: '2026-08-30T00:00:00.000Z',
    source: 'GLDN Product Hunter generic-brand and intellectual-property review cues',
    disclaimer: 'Seed authority comes from the versioned policy-rules clearance profile. A seed or Ready result is never eBay approval.',
    approvedSeeds: APPROVED_SEEDS,
    genericBrandLabels: GENERIC_BRAND_LABELS,
    ipCuePhrases: IP_CUE_PHRASES,
    protectedNameCues: PROTECTED_NAME_CUES
  });
});
