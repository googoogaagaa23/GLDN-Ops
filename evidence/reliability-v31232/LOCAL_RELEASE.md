# Local Release Publication - September 5, 2026

The user chose immediate local/GitHub distribution instead of Google review.

- Packages and installer published first in commit 84c7cdc.
- All 10 public release-manifest entries were downloaded from main and their actual bytes matched the declared SHA-256 values.
- The bootstrap's exact dist/GLDN-Ops-latest.zip URL was downloaded and verified against the v3.12.32 full local bundle.
- Existing Product Hunter v0.3.1 published bytes were preserved, not overwritten with a repack of the same version.
- The stable updater metadata was then published in commit 739b1ba.
- The exact public downloads/latest.json URL returned version 3.12.32 and channel stable without a cache-busting query.
- Its referenced extension ZIP was downloaded, its checksum matched, and its enclosed manifest reported 3.12.32.
- local-release-check.log records 499 passing JavaScript tests, cross-profile pairing/policy fixtures, and installer checks.

No signed-in marketplace action, shared-sheet change, local installed-folder replacement, or Windows policy installation was performed during publication. Those outcomes are not implied by a successful release. Google registration, submission, and review were not performed and are not required to use the local release.

Existing profiles use Update & Reload. Helper inventory and pairing need helper v1.1.0 from the current Setup, once per computer. A new Chrome profile still needs Load unpacked once. Keep the existing loaded folder and profile identity; do not clear saved work to update.
