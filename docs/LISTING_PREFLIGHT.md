# GLDN Listing Preflight

## What it does

Listing Preflight is a local, fail-closed text classifier used before EcomSniper Bulk Poster and by the read-only Existing Listings Policy Audit. It does not use an eBay API and it does not submit, revise, relist, or end listings.

The 2026-08-30 shared pack contains 578 source-linked rules:

- 576 official eBay rules: 380 Block and 196 Review.
- 2 signed-in Profile 2 Discord Review rules.
- 0 Telegram rules; the reviewed delivery-date finding remains Ignore.
- 70 official policy pages from the prohibited/restricted hub plus the supplemental intellectual-property policy in the coverage catalog, with at least one direct source-linked decision for every page.
- A versioned 500-phrase generic-only clearance profile.

## Two separate layers

1. **Policy rules** classify explicit official prohibitions and conditional/manual-review signals. Official eBay evidence may create Block or Review. Community evidence may create Review only.
2. **Operational clearance profile** limits Ready to reviewed generic, unbranded text. This is a risk control, not a claim that every excluded brand or category is prohibited.

The full pack is validated atomically. A wrong declared count, malformed rule, duplicate ID/key, unsupported source, missing or mismatched evidence URL, community Block, missing clearance profile, or stale clearance profile fails closed.

## Results

- **Ready**: structured live product details report an explicit Generic or Unbranded brand, the title matches a current reviewed generic family, and there is no matched policy rule, model, configured IP/restriction cue, or unreviewed title token. Ready is not eBay approval.
- **Needs review**: conditional or seller-gated policy; brand, model, character, franchise, celebrity, team, logo, license, fan-art, compatibility, replacement, authenticity, warranty, certification, or provenance cue; incomplete/opaque input; unknown term; community report; or stale/invalid evidence.
- **Block**: an exact, unambiguous official eBay prohibition signal matched. Block is an urgent stop for human review, not permission to perform an automatic marketplace action.

Brand rules are field-scoped when structured `Brand:` evidence is available. Compound rules support required, alternative, and excluded phrases so that narrow official prohibitions can avoid broad false positives.

## Product Hunter handoff

1. Start in **Product Research Desk** and use one of its exact 500 reviewed phrases.
2. Run Product Hunter and copy every exact Amazon result.
3. Click **Preflight Bulk Poster Links** or paste one result per line into Listing Preflight.
4. A bare title, search result, Amazon URL, or ASIN stays in Needs review. Ready requires structured live product details with an explicit Generic or Unbranded brand value.
5. Inspect every Needs review and Block row and the linked evidence.
6. Click **Copy Ready & Open Bulk Poster** only for rows that reached Ready.
7. Perform final human review inside the exact product and generated listing workflow.

Structured lines may provide additional local evidence:

```text
Title: stainless steel kitchen drawer organizer | Brand: Generic | Category: drawer organizers | ASIN: B012345678
```

A missing brand or a reported brand other than an approved Generic/Unbranded value remains Needs review. Adding a structured field does not prove the seller's claim.

## Existing Listings Policy Audit

The audit performs a complete, resumable, read-only scan of Active Listings and verifies exact row coverage before classification. It shares the same rule pack and fingerprint, including reasons, source types, evidence URLs, policy coverage, and clearance-profile semantics.

Existing-listing evidence is normally title/SKU/decoded-ASIN/price/category only. Therefore:

- Exact official prohibited-item cues remain Block.
- Matched conditional or IP/authenticity signals remain Review.
- Every otherwise unmatched title-only listing remains Review for insufficient evidence; it is not labeled Clear.
- The audit UI exposes scan, pause/resume, search/filter, item links, and CSV export only. Selection and End controls are hidden and guarded off.

No listing is changed by the audit.

## Important limits

Preflight cannot prove:

- Authenticity, authorization, licensing, parallel-import rights, or VeRO safety.
- Copyright, trademark, patent, design, utility-model, publicity, or warranty compliance from images/packaging.
- Recall status, seller eligibility, regulator approval, permits, registration numbers, ingredients, expiration, labels, or documentation.
- Correct category, destination law, origin, hazmat/carrier restrictions, or international shipping legality.
- That the final generated title, photos, description, item specifics, variations, or compatibility data are accurate and non-manipulative.

Those remain final-human-review obligations. Policies can change before the next refresh.

## Publishing reviewed decisions

The canonical official refresh evidence lives under `evidence/listing-preflight/`. Publishing preserves both the main extension and standalone Product Hunter rule pack:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\listing-preflight\publish-reviewed-rules.ps1 -DecisionFile .\evidence\listing-preflight\official-ebay-policy-hub-decisions-2026-08-30.json
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\listing-preflight\publish-reviewed-rules.ps1 -DecisionFile .\evidence\listing-preflight\community-reviewed-decisions-2026-08-24.json
```

Every rule requires a reason, reviewer, review date, source type, and exact evidence URL. Accepted sources are `official-ebay`, `profile2-discord`, and `profile2-telegram`. Community decisions can publish Review only.
