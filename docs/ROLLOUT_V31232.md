# v3.12.32 Rollout

## Immediate Path

The user selected immediate GitHub/local distribution instead of waiting for Google review. Publish the versioned packages first, verify their public checksums, then update the normal updater metadata last. Do not claim a live marketplace pass merely because publication succeeds.

1. Run regression, pairing isolation, and isolated extension UI checks. Keep the currently installed folder untouched during development.
2. In the agreed profile, confirm no active workflow is being interrupted. Preserve settings and checkpoints before updating in place; do not change the unpacked folder or extension ID.
3. Run the latest one-time installer once per computer to upgrade the Windows helper. Extension-only updates do not replace the helper.
4. Open Health & Installations and verify identity, runtime/file versions, updater, and saved reviews. Run the intended read-only marketplace feature and verify its actual output. Final submissions and sheet syncs retain separate approval gates.
5. Verify the exact public updater metadata and downloaded hashes after publication. The signed-in workflow and second-profile checks remain outstanding until those profiles are available; preserve that distinction in release status.

## Pairing

Choose Pair This Profile in Health & Installations. On that computer, run the installed `tools/gldn-control.ps1 -PairingCode CODE -ProfileDirectory "Profile 2"`, using the actual verified profile directory. Then select Check Pairing Approval. Commands for another approved profile must specify its exact `-ProfileDirectory`.

Never pair automatically based on matching extension ID or account label. Migrated profiles must pair again; disabling control does not reset marketplace work. The operator must verify the code belongs to the intended browser profile before approving it.

## Store Path

Paused at the user's request. Store registration, upload, review, and Store-ID policy installation are not needed for the GitHub/local release. Keep the prepared Store package separate; do not accept a developer agreement or install Store policy for this release.

Build with `tools/build-webstore-zip.ps1`. Follow `STORE_SUBMISSION_V31232.md` for the current permission inventory, privacy disclosures, reviewer instructions, and registration gates. The Store build omits all-sites injection and requests local-helper permission only during pairing. Unlisted means anyone with the link can install; it is not private access control.

Google says most reviews finish within a few days, but some take a few weeks: https://developer.chrome.com/docs/webstore/review-process . Unlisted items have the same review requirements: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution . No same-day approval is promised.

After approval, run `tools/install-chrome-policy.ps1 -ExtensionId EXACT_STORE_ID` for a read-only plan. Install mode requires `-ConfirmPublishedStoreItem`; use `-Machine` only with approved machine-wide policy scope. Verify chrome://policy and chrome://extensions; a registry entry is not proof of installation.

Store and unpacked identities may differ. Do not remove the old copy before verifying restoration of that profile's settings and saved work. Never merge accounts or copy pairing credentials between profiles.
