# GLDN Product Hunter v0.3.0

Released: 2026-08-30

## Policy and seed gate

- Accepts starting phrases only from the exact versioned 500-phrase clearance profile shipped in `policy-rules.json`.
- Keeps no static fallback seed list, so a missing, malformed, stale, or partial profile stops before an Amazon worker tab opens.
- Rejects saved hunts when the clearance-profile version changes.

## Candidate review

- Applies explicit official eBay Block rules before every other result.
- Keeps missing or non-generic brands, models, characters, franchises, licensing, fan art, compatibility, replacement, and protected-name cues in Review.
- Requires full Amazon detail evidence before Ready and keeps the final human image, packaging, rights, provenance, safety, and listing review mandatory.
- Continues to exclude exact Active Listing SKU/ASIN duplicates and route exact-title duplicates to Review.

## Verification

- Product Hunter core, background, extension-contract, and package tests pass.
- Package validation requires schema 2, all 70 hub policy pages plus supplemental intellectual-property coverage, exactly 500 unique Ready phrases, at least 575 official rules, and zero community Blocks.
- No eBay listing or Amazon purchase action is implemented.
