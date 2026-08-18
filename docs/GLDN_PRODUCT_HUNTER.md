# GLDN Product Hunter Operator Guide

## Purpose

Use GLDN Product Hunter to turn broad Amazon keywords into a smaller, auditable group of links that are safer to hand to EcomSniper. EcomSniper remains responsible for Bulk Poster and listing work.

## Daily workflow

1. Start in the Chrome profile signed into the matching eBay account and the Amazon account you want to use.
2. Open the Product Hunter dashboard and choose the computer.
3. Select **Scan Active Listings**. Product Hunter reads all eBay Active Listings pages in one inactive tab and accepts the index only when the final unique item count equals eBay's total.
4. If live scanning is unavailable, download eBay's **All active listings** CSV and import it instead.
5. Paste one keyword per line and set the Ready target and filters.
6. Keep **Exclude products already active on eBay** enabled and start the hunt.
7. Inspect Review and Blocked rows while Ready products accumulate. Exact active SKU/ASIN matches are Excluded; exact normalized-title matches are Review.
8. Copy Ready links and paste them into EcomSniper Bulk Poster.
9. Download the audit CSV for the run.

## Filter order

1. Validate ASIN and title.
2. Exclude exact ASIN/SKU matches from the verified Active Listings index and hold exact-title matches for Review.
3. Exclude ASINs copied inside the reuse period.
4. Exclude fashion and sponsored results when enabled.
5. Enforce the price range.
6. Apply reviewed official eBay policy rules.
7. Read the full Amazon product page.
8. Enforce rating, review-count, and stock settings.
9. Mark the product Ready only after full evidence passes.

## Recovery

- **Paused by operator:** Select Resume.
- **CAPTCHA or robot check:** Open the worker, complete Amazon's check, then Resume.
- **Worker tab closed:** Resume creates a new inactive worker tab.
- **Chrome restarted:** The alarm-backed queue resumes from saved job state.
- **Wrong settings or keywords:** Stop, Reset, then start a new hunt. Duplicate history is preserved.
- **eBay browser check:** Open the saved eBay worker, complete the visible check, then Resume Scan.
- **Active listing total changes mid-scan:** Let eBay settle and start a new scan. The previous verified index remains intact.
- **Large account or live-page issue:** Import eBay's complete Active Listings CSV; string splitting is not used.

## Important limits

The eBay scan is read-only and never selects, edits, or submits a listing. The rule engine reduces known listing risk but cannot promise that eBay will permit an item. eBay changes policies and may evaluate context not visible on Amazon. Review rows require a person. Blocked and already-listed rows never enter the copied payload.
