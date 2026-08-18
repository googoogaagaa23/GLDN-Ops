# GLDN Ops v3.7.0 Foundation Evidence

Date: 2026-07-11  
Gate: Local-only foundation  
Required Chrome profile: `Profile 2` (`F9132 - TE - BULK`)

## Current Verdict

`BLOCKED - WAITING FOR MANUAL PROFILE 2 RELOAD`

The v3.7.0 source, local release bundle, rollback path, shared identity model,
dashboard contract, idempotency receipt, queue fixtures, and Tasks threshold
repair all pass their stated checks. Profile 2 was confirmed to load the exact
project extension folder, but its visible marketplace panel still reported
v3.6.20 after the first reload attempt. The launcher bug that allowed a spaced
profile directory to be routed incorrectly is fixed and guarded by a release
check. v3.7.0 is not a live pass until the Profile 2 panel itself reports the
new version and its settings/identity readback passes.

The live panel was rechecked on three consecutive goal turns and still reported
v3.6.20. Chrome browser control rejected direct navigation to the extension's
internal reload page and explicitly prohibited using another automation surface
to work around that protected action. The safe remaining action is one manual
click on **Reload Ext** in the already-open Profile 2 Poshmark panel.

## Build And Profile Identity

- Local manifest: `3.7.0`
- Local extension folder:
  `C:\Users\afarr\OneDrive\Desktop\GLDN-Ops-Assistant-Codex-Project\extension`
- Chrome profile: `F9132 - TE - BULK` / `Profile 2`
- Extension ID: `ddfegcgadpkgegbjnbipbmbogcllcjci`
- Chrome reports the exact folder above as enabled in Profile 2.
- Signed-in pages reused for the live check:
  - eBay Seller Hub awaiting shipment
  - Poshmark My Posh Stats
- No temporary or signed-out Chrome profile was opened.

## Automated Release Evidence

`tools/check-release.ps1` passed after the final launcher repair.

- All 11 extension runtime JavaScript files parsed.
- Manifest policy and file-reference checks passed.
- Central computer/account mapping checks passed.
- Poshmark computer guard passed.
- Dashboard action compatibility passed for:
  `sellerLevel`, `accountLimits`, `markShipped`, `poshmarkStats`,
  `ebaySnapshot`, and `marketplaceProfit`.
- Profile-safe local reload check passed.
- Local release bundle safety passed.
- Six Node foundation tests passed with zero failures.
- Final bundles:
  - `dist/GLDN-Ops-local-v3.7.0.zip`
  - `dist/GLDN-Ops-latest.zip`

## Update And Rollback Evidence

The isolated local updater fixture passed twice before this evidence record.
It validated staged package structure, preserved `config.js`, created a rollback
snapshot, and finished on manifest v3.7.0.

The local extension manager snapshot/restore round trip returned:

```json
{"version":"3.7.0","runtimeRestored":true,"configPreserved":true,"snapshotCount":2,"pass":true}
```

The first live reload request exposed a launcher defect: `Profile 2` was passed
to Chrome without protected spacing. The manager now passes
`--profile-directory="Profile 2"`, and the universal release check rejects a
future regression.

The clean-install/update fixture then passed with this exact result:

```json
{"version":"3.7.0","cleanInstall":true,"updateBackupCount":1,"configPreserved":true,"profileWithSpaceAccepted":true,"pass":true}
```

This fixture starts from an empty temporary install folder, validates the local
release bundle without Git or system Node.js, creates private configuration,
installs v3.7.0, installs again, verifies one backup, and proves the original
private configuration survived. All local launchers now quote spaced profile
directories and refuse to guess Chrome's default profile when none is supplied.

## Dashboard Evidence

- Live Apps Script deployment version: `@15`
- All six dashboard contract actions passed.
- Idempotency sync ID:
  `gldn-receipt-live-c174a8940e774676ac9f3898f8aa0166`
- First receipt response: `duplicate: false`
- Second response with the same sync ID: `duplicate: true`
- Exact Google Sheets readback contained one row only in
  `Sync Receipts!A2:F2`, with action `receiptTest`, computer `0`, account
  `FAK12`, and marker `foundation-20260711-153203`.
- Dashboard setup code is no longer committed in release source. Apps Script
  properties hold the private value, with a one-time legacy migration path.

## Tasks Sheet Evidence

The updated Tasks automation was executed in the signed-in Google account and
completed successfully at approximately 3:41 PM on 2026-07-11.

- Before: `Tasks!K17 = CHECK M0 & 2 & 0 & M1`
- After: `Tasks!K17` blank
- Tracking values in E:I:
  `89.13%`, `86.16%`, `92.51%`, `85.45%`, `87.44%`
- All five cells remained white because every value is at or above 85%.
- The Poshmark-only computer `7` cell remained gray.

This proves the corrected tracking warning boundary for the live sheet. It does
not yet prove every Tasks row/order/staleness rule in the master matrix.

## Live Profile 2 Readback Still Required

The screenshots below prove why the gate is not yet marked live-pass:

- `evidence/profile2-v370-foundation-2026-07-11/before-reload-ebay-v3620.png`
- `evidence/profile2-v370-foundation-2026-07-11/before-reload-posh-v3620.png`
- `evidence/profile2-v370-foundation-2026-07-11/blocked-reload-still-v3620-third-check.png`

The final readback must prove all of the following after the Profile 2 reload:

1. eBay and Poshmark panels visibly report v3.7.0.
2. eBay identity is computer `0`, account `FAK12`.
3. Poshmark identity displays combined computer `0 + 7` and syncs as `7`.
4. Settings schema is `2` and at least one pre-migration backup exists.
5. Dashboard pending queue count is readable and no record was lost.
6. Diagnostics show local-unpacked deployment and no stale account mismatch.
7. Popup/panels have no overlap, clipping, mojibake, or stale Web Store copy.

## Marketplace Safety

No marketplace submission, listing edit, Store-category change, order note,
shipping confirmation, purchase, or other irreversible action was performed in
this foundation gate.
