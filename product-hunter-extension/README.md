# GLDN Product Hunter

Current package: v0.3.1

GLDN Product Hunter is a separate Chrome extension for finding Amazon products before EcomSniper listing work. It accepts the operator's own search words, reads exact Amazon product pages in one inactive tab, and checks the collected product text against GLDN's reviewed eBay prohibited and restricted item rules.

Brand names do not cause Review by themselves. A matched prohibited-item rule becomes Blocked, a conditional or ambiguous restricted-item rule becomes Review, and a readable no-match product becomes a Preflight candidate. Pesticides and spray cans are always Blocked by GLDN's explicit no-list rules.

Product Hunter does not use an eBay API, edit eBay, control EcomSniper's private extension pages, or submit listings. A Preflight candidate is not eBay approval.

## Filters

- Any nonempty operator search words, one per line.
- Reviewed prohibited and restricted item keyword rules.
- Clothing, shoes, fashion, and sponsored-result exclusions.
- Configurable price, rating, review-count, and stock filters.
- Complete read-only eBay Active Listings indexing for duplicate protection.
- Exact SKU/ASIN duplicates are Excluded; exact title duplicates require Review.
- Configurable reuse protection for previously copied ASINs.
- One inactive Amazon worker tab with pause, resume, stop, reset, saved progress, and CAPTCHA handling.

## Install

1. Extract the current GLDN Product Hunter package.
2. Open `chrome://extensions` in the intended Chrome profile.
3. Turn on **Developer mode** and select **Load unpacked**.
4. Choose the extracted `product-hunter-extension` folder and pin **GLDN Product Hunter**.
5. Repeat this per Chrome profile and computer that needs the tool.

## Run

1. Open Product Hunter and choose the computer used by the signed-in eBay account.
2. Select **Scan Active Listings**. The extension accepts the index only after the exact unique count matches eBay's reported total. Use eBay's **All active listings** CSV import if live scanning is unavailable.
3. Enter any useful search words, one per line, choose the filters, and start the hunt.
4. Leave the inactive Amazon worker available. If Amazon displays a CAPTCHA, solve it there and select **Resume**.
5. Review Preflight candidate, Review, Blocked, Excluded, and Incomplete rows.
6. Select **Copy Evidence for Listing Preflight**, paste into GLDN's **Listing Policy Check**, and run the check.
7. Copy only Ready links from Listing Policy Check into Bulk Poster. Review and Blocked products are excluded.
8. Inspect the exact generated listing before any listing action and download the audit CSV when a record is needed.

## Status meanings

- **Preflight candidate:** The exact product was readable and no reviewed prohibited or restricted keyword matched. This is not eBay approval.
- **Review:** A conditional rule, possible duplicate, missing configured evidence, or unreadable page needs a person.
- **Blocked:** A reviewed prohibited-item rule or GLDN no-list rule matched.
- **Excluded:** A non-policy filter removed the result.
- **Incomplete:** Amazon did not expose enough product data.
- **Queued:** The search result is waiting for its full product-page read.

## Boundaries

- The eBay inventory scan is read-only and never selects, revises, ends, or submits a listing.
- Product Hunter has no debugger, broad all-sites, native-helper, or EcomSniper permission.
- A no-match cannot prove authenticity, intellectual-property permission, recall status, shipping legality, eBay approval, or continued selling privileges.
- Never use another computer, profile, or account to bypass an eBay restriction. Use eBay's official support or appeal process unless and until selling permission is restored.
