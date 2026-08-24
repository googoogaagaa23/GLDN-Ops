# GLDN Listing Preflight

## What It Does

Listing Preflight checks pasted Amazon URLs, ASINs, and product titles against a local pack of human-reviewed rules before EcomSniper listing work. It does not use an eBay API and it does not submit listings.

The current shared pack contains 177 reviewed rules: 175 official eBay rules and 2 Discord-backed manual-review signals. Telegram research is also tracked as a separate source type; the reviewed Telegram post produced zero item-policy rules because it was not relevant to listing eligibility. Community research never overrides official policy and can publish Review only, never Block.

The Product Research Desk appears above the link checker. It provides a versioned, selectable set of lower-risk Product Hunter starting words and shows the exact official, Discord, and Telegram coverage behind the current output. See `docs/PRODUCT_RESEARCH_DESK.md` for the complete operator flow.

## Results

- **Ready**: no current rule matched. This is not an eBay approval.
- **Needs review**: a category has legitimate exceptions or needs context, packaging, labeling, jurisdiction, authenticity, or claim review.
- **Blocked**: an explicit prohibited phrase matched. Blocked rows cannot continue through the Product Hunter handoff.
- **No rules available**: every row becomes Needs review and nothing is copied.

## Product Hunter Handoff

1. Copy the candidate titles or links.
2. Open GLDN Ops and click **Prepare Product Hunter Handoff**.
3. Apparel, shoes, costumes, fashion accessories, and exact duplicates are removed first.
4. The remaining rows run through Listing Preflight.
5. If every row is Ready, only those rows are copied and Product Hunter opens.
6. If any row is Review or Blocked, Product Hunter stays closed and Listing Preflight opens with the candidates loaded.
7. Inspect the matched rule and source links.
8. Click **Copy Ready & Open Product Hunter** to continue with only Ready rows.

## Bulk Poster Link Handoff

1. Copy the Amazon product links produced by Product Hunter.
2. In GLDN Ops, click **Preflight Bulk Poster Links**.
3. GLDN keeps Amazon links and ASINs, removes duplicate and non-Amazon rows, and runs the reviewed rules.
4. Review every Needs review and Blocked result. They are never copied into the Ready output.
5. Click **Copy Ready & Open Bulk Poster** to copy only canonical Ready Amazon links and open EcomSniper's Bulk Poster.
6. Review the links again inside EcomSniper before starting any listing work.

A bare ASIN or URL with no product-name evidence stays in Needs review unless a specific reviewed rule matches it. GLDN does not treat an opaque link as safe.

## Important Limits

Keyword preflight cannot prove that a product is permitted. It cannot reliably inspect:

- Product images or copied manufacturer text.
- Packaging condition, expiration dates, registration numbers, ingredients, or shipping eligibility.
- Whether a branded product is authentic.
- Duplicate eBay listings that use different Amazon links or titles.
- Misleading keyword combinations, health claims, compatibility claims, or variation structure without full listing context.
- New restrictions that are not yet in the reviewed rule pack.

Those cases still need manual review and continued official-policy plus read-only Profile 2 Discord and Telegram research.

## Rule Publishing

Reviewed decisions live under `evidence/listing-preflight/`. Publish them with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\listing-preflight\publish-reviewed-rules.ps1 -DecisionFile .\evidence\listing-preflight\official-ebay-reviewed-decisions-2026-08-08.json
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\listing-preflight\publish-reviewed-rules.ps1 -DecisionFile .\evidence\listing-preflight\official-ebay-expanded-decisions-2026-08-08.json
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\listing-preflight\publish-reviewed-rules.ps1 -DecisionFile .\evidence\listing-preflight\community-reviewed-decisions-2026-08-24.json
```

Every rule needs a reason, reviewer, review date, source type, and exact source URL. Accepted source types are `official-ebay`, `profile2-discord`, and `profile2-telegram`. Discord and Telegram decisions may publish Review rules only. A hard Block requires official eBay evidence.
