# GLDN Product Research Desk

## Purpose

This desk is the mandatory first filter before EcomSniper listing work:

1. Choose a reviewed generic starting phrase.
2. Run that phrase in Product Hunter.
3. Send every exact Amazon result through Listing Preflight.
4. Copy Ready links only into Bulk Poster.
5. Perform a final human review of the exact product and generated eBay listing.

A starting phrase is not a product decision. A Ready result is not eBay approval.

## Version 2.0.0 (2026-08-30)

The versioned output is `extension/product-research-output.json`. It contains exactly 500 unique, generic, unbranded physical-product research phrases. The phrases focus on ordinary organization, storage, manual cleaning, and non-powered household accessories.

The desk does not accept a brand, model, product line, logo, character, franchise, artist, celebrity, team, compatibility term, replacement term, authenticity claim, warranty claim, or certification claim as a reviewed starting phrase. An unknown phrase stays in Needs review instead of opening Product Hunter through the guarded handoff.

## Official eBay coverage

The 2026-08-30 refresh reviewed the complete official [Prohibited and restricted items hub](https://www.ebay.com/help/policies/prohibited-restricted-items/prohibited-restricted-items?id=4207) and all 70 policy pages exposed by that hub. The shared pack also records the supplemental [Intellectual property/VeRO policy](https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349). Counterfeit, product safety, eligibility, search manipulation, and VeRO/IP rules are treated as cross-cutting controls.

Current published data:

| Source | Reviewed | Published | Authority |
|---|---:|---:|---|
| Official eBay | 70 hub policy pages plus supplemental IP review | 576 rules | May create Block or Review |
| Profile 2 EcomSniper Discord | 4 signal groups | 2 rules | Review only |
| Profile 2 EcomSniper Telegram | 1 signal group | 0 rules | The delivery-date finding remains Ignore |

The total shared pack is 578 rules: 380 official Blocks and 198 Reviews, including the 2 Discord warnings. The community findings remain visibly separate from official eBay policy. Discord and Telegram research is read-only; GLDN never posts, reacts, moderates, or exposes account tokens. Dropshipping-policy, fulfillment-source, and retail-arbitrage discussion is excluded from item-listing research.

## Conservative category exclusions

The first-filter phrases avoid these domains entirely because a keyword-only workflow cannot verify their conditions safely:

- Branded or counterfeit-heavy apparel, footwear, fashion, jewelry, watches, perfume/cosmetics, electronics, software/media, art, collectibles, custom printing, trading cards, autographs, and authenticity claims.
- Adult content; weapons, knives, firearms, tactical/military/police, lock bypass, covert surveillance, violence, and illegal-activity products.
- Medical/health devices, drugs, supplements, food, alcohol, tobacco/vape, pesticides, chemicals, hazardous materials, batteries, chargers, lasers, and regulated safety claims.
- Baby sleep/safety, helmets, car seats, cribs, micromobility, vehicle parts, emissions products, live animals, animal products, plants/seeds, and recalled products.
- Currency, gift/credit cards, coupons, chance/gambling products, securities, cryptocurrency, real estate, travel, services, digital/intangible goods, personal data, social engagement, and review manipulation.
- Anything requiring seller approval, licenses, permits, origin records, regulatory labels, special shipping, testing/certification, or a current recall lookup.

This is an operational risk reduction choice. It does not claim that every item in a conditionally allowed category is prohibited by eBay.

## Exact operator flow

1. Open **Workflows > Product Research Desk** in GLDN Ops.
2. Review the source coverage and avoid-category panels.
3. Select one or more of the 500 versioned phrases.
4. Click **Copy Words & Open Product Hunter**.
5. Paste one phrase per line into EcomSniper Product Hunter.
6. Copy or export every exact Amazon result.
7. Use **Preflight Bulk Poster Links** or paste the results into the desk's link checker.
8. Inspect every Block and Needs review result and its source links.
9. Copy **Ready links only** into Bulk Poster.
10. Before any listing action, review the exact title, brand, model, photos, packaging, source/provenance, category, item specifics, description, claims, recall status, seller eligibility, destination, and shipping method.

## Existing listings

**Existing Listings Policy Audit** is read-only. It scans every Active Listing and applies the same official rules, but the collected evidence is generally limited to item number, title, SKU/decoded ASIN, price, and category when visible.

- An exact, unambiguous official prohibition can produce Block.
- Official conditions, brands/IP cues, community evidence, or incomplete evidence produce Review.
- A title-only no-match also produces Review. It cannot prove authenticity, authorization, image rights, product safety, eligibility, provenance, or lawful shipping.
- The audit page exposes no selection, revision, relisting, or End control.

## Refresh and integrity rules

1. Use official eBay pages for authoritative policy decisions.
2. Use only signed-in Chrome Profile 2 for approved EcomSniper Discord and Telegram sources.
3. Preserve exact evidence URLs and record irrelevant or inconclusive findings as Ignore.
4. Community evidence may publish Review only. A hard Block requires current official eBay evidence and an unambiguous match.
5. Publish through `tools/listing-preflight/publish-reviewed-rules.ps1` or the reviewed rebuild tool.
6. Runtime validation checks the full rule count, metadata, evidence/source alignment, duplicate IDs/keys, community Block prohibition, and the generic clearance profile. A malformed or stale pack fails closed to Review.
7. Run focused and complete release checks before packaging.

## Limits

No static filter can guarantee compliance. GLDN does not determine whether a product is genuine, licensed, patented, recalled, legally shippable, or eligible for the current seller. It does not inspect all images or packaging, does not call an eBay API, and does not submit or modify listings from this desk.
