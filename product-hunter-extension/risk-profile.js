(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GLDN_PRODUCT_HUNTER_RISK_PROFILE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Search words are operator input. The current policy-rules file evaluates
  // each exact Amazon product after it is collected.
  const APPROVED_SEEDS = Object.freeze([]);

  return Object.freeze({
    schemaVersion: 1,
    profileVersion: '2026-08-31.1',
    reviewedAt: '2026-08-31T00:00:00.000Z',
    source: 'GLDN Product Hunter forbidden-item keyword policy check',
    disclaimer: 'Product Hunter accepts arbitrary search words, then checks each exact product against the current prohibited and restricted item rules. A brand name alone does not stop a product, and a result is never eBay approval.',
    approvedSeeds: APPROVED_SEEDS
  });
});
