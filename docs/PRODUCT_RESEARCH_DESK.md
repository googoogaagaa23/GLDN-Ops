# GLDN Product Research Desk

## Purpose

The Product Research Desk is the repeatable path from research to EcomSniper:

1. Choose lower-risk starting words.
2. Copy them into EcomSniper Product Hunter.
3. Export the resulting Amazon links.
4. Run those links through Listing Preflight.
5. Continue only Ready links to Bulk Poster.

The words are research starting points, not approved products. A Ready result means only that no current reviewed rule matched the available title or link evidence. It is not permission from eBay.

## Current Source Coverage

| Source | Signals reviewed | Rules published | How it is used |
|---|---:|---:|---|
| Official eBay policy | 175 | 175 | Authoritative reviewed baseline; may create Review or Block rules. |
| Profile 2 EcomSniper Discord | 4 signal groups | 2 | Community evidence; may create Review rules only. |
| Profile 2 EcomSniper Telegram | 1 signal group | 0 | The reviewed post was not an item-policy signal, so no rule was invented. |

Discord and Telegram research is read-only. GLDN never posts, reacts, exports a user token, or treats community discussion as official eBay policy. Dropshipping-policy and fulfillment-source discussions are excluded from this item-listing research.

## Product Hunter Starting Words

The current versioned output is in `extension/product-research-output.json` and is rendered inside **Workflows > Product Research Desk**. Operators can select all or only the useful words, then choose **Copy Words & Open Product Hunter**.

Current starting words:

- drawer organizer
- cable management clips
- furniture felt pads
- cabinet shelf liner
- picture hanging hooks
- desk organizer
- shower caddy
- under sink organizer
- reusable cleaning brush
- vacuum storage bags
- plant support clips
- window cleaning tool
- laundry storage organizer
- kitchen drawer divider
- furniture sliders
- silicone kitchen mat
- label holder
- cord organizer
- microfiber cleaning cloth
- pot lid organizer
- sponge holder
- under desk cable tray
- non slip drawer liner
- storage hooks

## Exact Operator Flow

1. Open **Product Research Desk** in GLDN Ops.
2. Review the three source-coverage panels and the categories to avoid.
3. Select the starting words to use.
4. Click **Copy Words & Open Product Hunter**.
5. Paste one word per line into EcomSniper Product Hunter.
6. Run Product Hunter and copy or export the Amazon product links it returns.
7. Return to Product Research Desk and paste one Amazon link per line under **Product Hunter links to preflight**. The popup shortcut **Preflight Bulk Poster Links** can load copied links automatically.
8. Click **Check Items**.
9. Inspect every Needs review and Blocked row and its source links.
10. Click **Copy Ready & Open Bulk Poster**. Review and Blocked rows are excluded.
11. Review the final set again inside EcomSniper before starting any listing work.

## Research Refresh

1. Use only the signed-in Chrome Profile 2 Discord and Telegram interfaces.
2. Open every relevant result in context and preserve its exact message or post URL.
3. Record unrelated or inconclusive findings as Ignore instead of manufacturing a rule.
4. Community decisions may publish Review only. Hard Block requires separate official eBay evidence.
5. Publish reviewed decisions with `tools/listing-preflight/publish-reviewed-rules.ps1`.
6. Update `extension/product-research-output.json` so the visible source counts and starting-word set match the reviewed evidence.
7. Run the release suite before publishing an updater package.

## Important Limits

- Product Hunter can return risky products even from an ordinary search word.
- A URL without usable product-name evidence stays Needs review.
- Keyword matching cannot reliably inspect images, ingredients, packaging, authenticity, seller eligibility, certification documents, or a new policy that is not yet in the rule pack.
- Community evidence is a warning signal, not official policy.
- GLDN does not call an eBay API and does not submit listings from this desk.
