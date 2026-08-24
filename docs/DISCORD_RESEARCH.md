# GLDN Listing-Restriction Research

## Purpose

Research listing-item restrictions in the signed-in EcomSniper Discord and Telegram interfaces through Chrome Profile 2, preserve the source evidence, and publish only human-reviewed community signals into GLDN Ops Listing Preflight. Official eBay policies are reviewed and published separately as the authoritative baseline.

There is no Discord or Telegram bot, user token, server installation, or background collector. No eBay API is used. Research never sends messages, reactions, edits, or moderation actions.

## Scope

- Use only the signed-in Discord interface in Chrome Profile 2.
- Use only the signed-in Telegram interface in Chrome Profile 2 for approved EcomSniper-related groups or channels.
- Search approved EcomSniper channels for listing restrictions, prohibited items, restricted products, VeRO reports, listing takedowns, listing suspensions, and reported resolutions.
- Exclude dropshipping-policy, retail-arbitrage, and fulfillment-source discussions.
- Treat Discord reports as research leads, not as authoritative marketplace policy.
- Treat Telegram posts the same way. An unrelated post is recorded as Ignore and produces no rule.
- Preserve the exact Discord message URL, date, channel, relevant text, attachment links, and reported outcome.

## Research Workflow

1. Open the approved EcomSniper Discord server or Telegram channel in signed-in Chrome Profile 2.
2. Search approved channels using one restriction term at a time.
3. Open each relevant result in context and confirm the message belongs to the correct channel and discussion.
4. Record the exact source-message URL, date, product or brand, restriction type, reported outcome, and any attachment links.
5. Mark the candidate `Ignore`, `Review`, or `Block`.
6. For `Review` or `Block`, enter a plain-language reason and reviewer name.
7. Compare screenshots or attachments with their source message before using them as evidence.
8. Save the reviewed decisions as JSON using the schema below.
9. Publish those reviewed decisions into the extension rules file. Community sources may publish Review only.
10. Update `extension/product-research-output.json` so visible source counts and Product Hunter starting words match the reviewed evidence.
11. Reload GLDN Ops and run Listing Preflight against a sample that includes a known Block, a known Review, and an unmatched item.

## Reviewed Decision File

```json
{
  "schemaVersion": 1,
  "sourceGeneratedAt": "2026-08-08T00:00:00.000Z",
  "decisions": [
    {
      "type": "asin",
      "value": "B012345678",
      "decision": "block",
      "reason": "Multiple source-linked reports identify this exact item as restricted.",
      "reviewedBy": "Reviewer name",
      "reviewedAt": "2026-08-08T00:00:00.000Z",
      "sourceType": "profile2-discord",
      "evidenceUrls": [
        "https://discord.com/channels/123456789012345678/123456789012345678/123456789012345678"
      ]
    }
  ]
}
```

Publish it with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\listing-preflight\publish-reviewed-rules.ps1 -DecisionFile "C:\path\to\reviewed-decisions.json"
```

The publisher accepts only `asin`, `brand`, or `keyword` rules. Every community rule requires `sourceType: profile2-discord` or `profile2-telegram`, a Review decision, a reason, reviewer, review date, and exact source-message URL. Official policy decisions use `sourceType: official-ebay` and an exact official eBay help URL. Raw community messages and attachments do not enter the extension package.

## Listing Preflight

1. Open **Workflows > Listing Preflight**.
2. Paste or import one Amazon URL, ASIN, or product title per line.
3. Click **Check Items**.
4. Review the three buckets:
   - **Ready to copy**: no current reviewed rule matched.
   - **Needs review**: a Review rule matched, or no reviewed rule pack is loaded.
   - **Blocked**: a Block rule matched.
5. Click **Copy Ready Links** or **Download Ready Links**.
6. Paste only that output into EcomSniper Product Hunter or Bulk Lister.

The **Prepare Product Hunter Handoff** button now performs the same check before opening Product Hunter. If any item needs review or is blocked, Product Hunter stays closed and the complete candidate set opens in Listing Preflight. From there, **Copy Ready & Open Product Hunter** copies only Ready items and opens the handoff tab.

Needs Review and Blocked inputs are always excluded from the ready output. If the rule pack is empty or unavailable, GLDN Ops fails closed and produces no ready links.

## Safety Boundary

- Ready to copy is not an eBay approval.
- GLDN Ops does not submit listings from Listing Preflight.
- Uncertain items stay out of the ready output.
- Current rules must be reviewed and refreshed as marketplace enforcement changes.
- No Discord or Telegram user token, self-bot, browser cookie export, or hidden account access is permitted.
