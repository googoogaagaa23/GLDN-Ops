# Policy audit final-page recovery

Status: included in release candidate v3.12.33; M0 live verification is pending.

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

70 focused tests passed (audit core, scan recovery, page state, policy rules,
foundation, updater, context invalidation and reload contracts).
A synthetic 18,359-row run with the actual 580-rule pack took 25.845 seconds,
reported 185 progress updates, and had a maximum progress gap of 182 ms.
Classifications and fingerprints match the synchronous path on the comparison fixture.
These are local checks, not a signed-in M0 live pass.

## Remaining Deployment Work

Package the scoped repair into the next reviewed release, publish its verified
artifacts, and update M0. Do not claim an unchanged 3.12.31/3.12.32 download
contains this repair. On M0 keep the saved audit; after the repair update, use
Resume Scan, not Start Fresh or Discard. Confirm completion and CSV output there.
