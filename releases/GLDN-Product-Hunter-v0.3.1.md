# GLDN Product Hunter v0.3.1

Released: 2026-08-31

## Operator keywords

- Accepts any nonempty Product Hunter search words; there is no 500-word allowlist.
- Reads each exact Amazon product before classifying it.
- Brand, manufacturer, model, character, or unfamiliar wording does not create Review by itself.

## Policy check

- Uses the same 580-rule pack as GLDN Ops.
- Blocks every pesticide and every spray can under GLDN's explicit no-list rules.
- Blocks reviewed prohibited-item matches and routes conditional restrictions to Review.
- Marks readable no-match products as Preflight candidates, never as eBay-approved products.

## Other filters

- Preserves the read-only eBay duplicate index, fashion and sponsored exclusions, price/rating/review/stock filters, reuse history, one inactive Amazon worker, resumable progress, and CAPTCHA handling.

## Verification

- Product Hunter core, background, manifest, permissions, policy-pack, package, and handoff contracts pass.
- Brand-only products are not stopped; pesticide and spray-can products are hard-blocked by the shared rule pack.

## Boundary

- Product Hunter does not use an eBay API, modify eBay, control Bulk Poster, or submit listings.
