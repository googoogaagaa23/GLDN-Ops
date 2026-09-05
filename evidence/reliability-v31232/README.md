# v3.12.32 Verification - September 5, 2026

Status: release candidate. Stable rollout and signed-in marketplace validation remain pending.

## Completed

- Full release check: 499 JavaScript tests passed, zero failures.
- PowerShell fixtures: explicit cross-profile pairing, shared extension ID isolation, token-hash persistence, wrong-token rejection, selective revocation.
- Policy fixtures: read-only default, publication confirmation required, vacant slot selection, unrelated entries preserved, repeat-call idempotence, conflicting update URL rejection.
- Actual candidate extension service worker and Health & Installations loaded in fresh isolated Chromium profiles for both local and staged Store channels.
- Stored fixture progress, review ownership, queued records, result navigation, and desktop/mobile dark rendering passed with no page exceptions or page-level horizontal overflow.
- Store package has no all-sites host permission or universal content script. Optional loopback permission was verified ungranted by default.
- All public ZIP hashes are recorded in dist/GLDN-Ops-v3.12.32-candidate.sha256.txt.

## Not Claimed

- No eBay orders, listings, Amazon orders, or shared Sheets were changed by this work.
- No current signed-in workflow completion or new live recording.
- No in-place installation or reload of the user's working extension.
- No Windows policy installation or automatic installation in another Chrome profile.
- No Chrome Web Store upload, registration agreement acceptance, submission, or approval.

The connected Chrome surface reported Person 1, not the agreed Profile 2. The Store registration tab reported Chrome Web Store - Developer Agreement. The browser automation provider does not script the extension gallery. The registration page was left for the account owner.

The UI browser contexts contained only labeled fixture data. Page HTTP(S) routing was blocked; service-worker network traffic was not intercepted. These are isolated UI checks, not marketplace evidence.

## Artifacts

- release-check.log: full validation output.
- ui-check.json and store-ui-check.json: actual isolated-browser results.
- health-desktop.png and health-mobile-dark.png: local-channel screenshots.
- store-health-desktop.png and store-health-mobile-dark.png: Store-channel screenshots.

Temporary browser profiles and test work directories are deliberately excluded from publication.
