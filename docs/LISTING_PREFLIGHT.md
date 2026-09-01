# GLDN Listing Policy Check

## Purpose

Listing Policy Check is a local, paste-first classifier used before EcomSniper Bulk Poster and by the read-only Existing Listings Policy Audit. It does not use an eBay API and does not submit, revise, relist, or end listings.

The 2026-08-31 shared pack contains 580 reviewed rules:

- 576 official eBay rules.
- 2 GLDN operator Blocks: all pesticides and all spray cans.
- 2 signed-in Profile 2 Discord Review rules.
- 0 Telegram rules; the reviewed delivery-date finding remains Ignore.
- Direct coverage for the 70 policy pages exposed by eBay's prohibited and restricted items hub, plus supplemental intellectual-property guidance.

The old 500-word generic allowlist is not a decision gate. Brand, manufacturer, model, character, or unfamiliar words do not stop a product merely because they are unfamiliar.

## Results

- **Ready:** GLDN read enough product text and no published prohibited or restricted item rule matched. This is a keyword no-match, not eBay approval.
- **Needs review:** A conditional rule matched, product text could not be read, a CAPTCHA interrupted collection, or the rule pack is invalid or stale.
- **Blocked:** An exact reviewed prohibition or one of the two GLDN no-list rules matched. Blocked products are excluded from every copy action.

## Operator flow

1. Open **Workflows > Research > Open Listing Policy Check**. No clipboard content is required for the page to open.
2. Paste one Amazon link, product title, ASIN with title, or CSV row per line.
3. Select **Check Items**.
4. For raw Amazon links, GLDN reuses one inactive Amazon tab to read product titles and details. Completed products are cached so a paused run can resume.
5. If Amazon displays a robot or CAPTCHA page, complete it in the preserved worker tab and select **Check Items** again.
6. Review Needs review and Blocked rows.
7. Select **Copy Ready Links** or **Copy Ready & Open Bulk Poster**. Review and Blocked rows are never copied.
8. Inspect the exact generated eBay listing before any listing action.

## Explicit GLDN no-list rules

GLDN deliberately applies two rules that are stricter than eBay's conditional policies:

- Every pesticide product is Blocked, including registered pesticides and product wording such as insecticide, herbicide, fungicide, rodenticide, flea/tick pesticide products, pool pesticide chemicals, disinfectants, and sanitizers.
- Every spray can is Blocked, including aerosol, pressurized spray, spray paint, canned air, cooking spray cans, hairspray cans, and similar pressurized containers.

An empty reusable trigger or pump spray bottle does not match the spray-can rule unless pesticide wording also appears.

## Existing Listings Policy Audit

The Existing Listings Policy Audit reads every active listing by exact item number, applies the same keyword rules, and exposes search, filters, item links, and CSV export. It makes no marketplace changes and exposes no End control.

An unmatched readable title is Clear under the keyword check. A matched conditional rule is Review and a matched Block rule is Blocked. These classifications are still not eBay approval or authorization to end a listing.

## Integrity and limits

The schema-2 pack is validated atomically. A count mismatch, malformed or duplicated rule, unsupported source, invalid evidence URL, community Block, missing keyword profile, or stale keyword profile fails closed to Needs review.

The check cannot prove authenticity, authorization, intellectual-property rights, recall status, regulatory documentation, seller eligibility, category correctness, shipping legality, or that the generated listing content is accurate. Policies can change before the next refresh.

Community findings can create Review only. Official eBay evidence or one of the two exact GLDN operator rules is required for Block.
