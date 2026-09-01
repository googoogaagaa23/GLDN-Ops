# GLDN Product Hunter Operator Guide

## Purpose

Use GLDN Product Hunter to search Amazon with the words you choose, inspect exact product pages, remove known policy risks, and create a smaller set of candidates for GLDN Listing Policy Check. Product Hunter does not list products or control EcomSniper Bulk Poster.

## Daily workflow

1. Use the Chrome profile signed into the intended Amazon and eBay accounts.
2. Open Product Hunter and choose the matching computer.
3. Select **Scan Active Listings**. Product Hunter accepts the read-only index only when every unique listing reconciles with eBay's total. Import eBay's complete Active Listings CSV if live scanning is unavailable.
4. Enter any useful Product Hunter search words, one per line, and choose the filters.
5. Keep **Exclude products already active on eBay** enabled and start the hunt.
6. Leave the inactive Amazon worker tab available. Complete any Amazon CAPTCHA there, then select **Resume**.
7. Review Preflight candidate, Review, Blocked, Excluded, and Incomplete rows. Exact active ASIN/SKU matches are Excluded; exact title matches are Review.
8. Select **Copy Evidence for Listing Preflight**, paste it into GLDN Listing Policy Check, and run the check.
9. Copy only Ready links into EcomSniper Bulk Poster. Review and Blocked rows remain excluded.
10. Download the audit CSV when needed and inspect the final generated listing before any listing action.

## Decision order

1. Require a valid ASIN and product title.
2. Exclude exact active-listing and recent-reuse duplicates.
3. Apply optional fashion, sponsored, price, rating, review-count, and stock filters.
4. Apply current prohibited and restricted item rules to the exact product text.
5. Block pesticides and spray cans under GLDN's explicit no-list rules.
6. Mark a readable no-match product as a Preflight candidate. Brand names alone do not cause Review.

## Recovery

- **Paused:** Select Resume.
- **Amazon CAPTCHA:** Complete it in the saved worker tab, then Resume.
- **Worker closed:** Resume creates another inactive worker tab.
- **Chrome restarted:** The alarm-backed queue resumes from saved state.
- **Wrong settings or words:** Stop, Reset, and start a new hunt.
- **eBay browser check:** Complete it in the saved eBay worker and Resume Scan.
- **Active listing total changed:** Let eBay settle and start a fresh scan; the previous verified index remains intact.

## Limits

The eBay inventory scan is read-only. A keyword no-match does not prove authenticity, intellectual-property permission, recall status, shipping legality, eBay approval, or continued selling privileges. Product Hunter never selects, edits, ends, or submits an eBay listing.
