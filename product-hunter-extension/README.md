# GLDN Product Hunter

GLDN Product Hunter is a separate Chrome extension for finding Amazon products before EcomSniper lists them. It searches Amazon in a normal signed-in Chrome session, opens each candidate product page, applies the reviewed GLDN eBay listing-policy rules, and prepares a clean list of Ready Amazon links.

It does not replace EcomSniper. It does not use an eBay API, edit eBay, control EcomSniper's private extension pages, or submit listings.

## Filters

- Reviewed official eBay listing-policy rules: Block or Review.
- Clothing, shoes, and fashion exclusion.
- Sponsored Amazon result exclusion.
- Configurable Amazon price range.
- Configurable minimum rating and review count.
- Visible in-stock evidence.
- ASIN deduplication within the hunt.
- Complete read-only eBay Active Listings indexing before protected hunts.
- Exact eComSniper SKU/ASIN duplicates are excluded; exact title matches require review.
- Configurable 60-day reuse protection after Ready links are copied.
- CAPTCHA/robot-check pause instead of repeated requests.
- Candidate and page caps with a fixed delay between product pages.

## Install

1. Open `chrome://extensions` in the Chrome profile used for Amazon.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `product-hunter-extension` folder.
5. Pin **GLDN Product Hunter**.

The packaged ZIP must be extracted before using **Load unpacked**.

## Run

1. Open GLDN Product Hunter and select **Open Product Hunter**.
2. Choose the computer used by the signed-in eBay account.
3. Select **Scan Active Listings**. The extension reads every Active Listings page in one inactive eBay tab and verifies the final unique-item count before replacing the prior index.
4. If live scanning is unavailable, download eBay's **All active listings** CSV and use **Import Active Listings CSV**.
5. Enter one product keyword per line and choose the filters.
6. Leave **Exclude products already active on eBay** enabled, then select **Start Hunt**.
7. Leave the inactive Amazon worker tab open. If Amazon presents a CAPTCHA, solve it in that tab and select **Resume**.
8. Review the Ready, Review, Blocked, Excluded, and Incomplete rows. Exact active ASIN/SKU matches are Excluded; exact title matches are Review.
9. Select **Copy Ready Links**. Only Ready links are copied. Their ASINs then enter the reuse history.
10. Open EcomSniper Bulk Poster and paste the copied links into its normal workflow.
11. Download the audit CSV when a record of all decisions is needed.

## Status meanings

- **Ready:** Full Amazon evidence passed current filters and no reviewed policy rule matched. This is not an eBay guarantee.
- **Review:** Evidence is ambiguous or a reviewed restricted-item rule requires a person to inspect it.
- **Blocked:** A reviewed prohibited-item rule matched.
- **Excluded:** A non-policy filter removed the product, such as fashion, sponsored, price, rating, reviews, stock, or recent reuse.
- **Incomplete:** Amazon did not expose enough product data.
- **Queued:** Search-page evidence passed and the full product page is still waiting to be checked.

## Safety boundaries

- Amazon product pages and eBay Active Listings are the only website permissions.
- eBay access is read-only: the scanner reads rows and never clicks, edits, selects, or submits a listing.
- No `debugger`, broad all-sites, native-helper, or EcomSniper permission.
- The worker runs in one inactive Amazon tab and stops when the target is reached.
- Pause, Resume, Stop, Reset, run log, and alarm recovery are built in.
- Copying Ready links is the explicit handoff. No listing is created automatically.
