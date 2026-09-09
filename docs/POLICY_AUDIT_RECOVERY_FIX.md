# Policy audit final-page recovery

Status: v3.12.33 release packages published and public checksums verified;
M0 installation and live verification are pending.

The reported M0 screenshot shows page 92/92 and 18,359/18,359 verified,
but no committed policy audit. The M0 tab was not available in the connected
browser sessions, so the exact live interruption was not inspected.

## Confirmed Code Defects

- Classification was one synchronous store-sized operation with no progress.
- A completed checkpoint resumed by opening page 93 instead of classifying the saved records.
- A terminated worker left an active scan with Resume disabled.
- Version migration deleted read-only policy scan recovery state.
- Grid styling overrode the hidden native End-review section.

## Repair

- Classify in batches of 100 with visible progress and pause checks.
- Reuse verified stored pages after the last page; validate all counts and unique item numbers.
- Recover orphaned scans as paused, without changing a live worker or unrelated workflow.
- Keep the raw pages on interruption or failed final storage commit.
- Preserve read-only checkpoints across updates, but never preserve old End approvals.
- Return a small completion message; the UI reads the committed audit from storage.
- Keep hidden controls hidden and resume saved work from the eBay launcher.

## Verification

The complete v3.12.33 release gate passed: 509 JavaScript checks, clean install,
config-preserving update, running-updater reinstall, updater rollback/checksum,
dashboard contracts, profile pairing and Chrome-policy fixtures.
No signed-in marketplace action was part of those checks.

70 focused tests passed (audit core, scan recovery, page state, policy rules,
foundation, updater, context invalidation and reload contracts).
A synthetic 18,359-row run with the actual 580-rule pack took 25.845 seconds,
reported 185 progress updates, and had a maximum progress gap of 182 ms.
Classifications and fingerprints match the synchronous path on the comparison fixture.
These are local checks, not a signed-in M0 live pass.

## Deployment

Commit fc232b5 published the scoped repair and packages. All ten files in
downloads/release-manifest-v3.12.33.json were fetched from their public GitHub
URLs and their SHA-256 checksums verified before activating latest.json.
The downloaded extension manifest identifies 3.12.33 and contains no config.js.
The stable updater metadata selects v3.12.33.

M0 still needs to install the update. Keep its saved audit; after confirming
v3.12.33, use Resume Scan, not Start Fresh or Discard. Confirm completion and
CSV output there. If the old frozen job blocks updating, follow the same-folder
installer recovery in releases/v3.12.33.md without resetting extension storage.
