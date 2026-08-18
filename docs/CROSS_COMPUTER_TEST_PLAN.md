# GLDN Ops Cross-Computer Test Plan

Distribution is local/unpacked. The release must pass deterministic configuration, migration, dashboard queue, installer/update and rollback tests without machine-specific extension IDs or Chrome profile paths. Live marketplace proof is captured in the existing signed-in Profile 2; other machines use **Feature Health Check** and exact configuration diagnostics rather than repeating unsafe marketplace actions.

Use this before trusting a release on the team machines. A release is not considered ready because syntax checks pass; each workflow below needs a real browser check on the matching Chrome profile.

## Automated Gate Before Any Browser Testing

Run this from the repo root before touching Chrome:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\check-release.ps1
```

This must pass before live testing starts. It checks:

1. Manifest safety for local unpacked Chrome distribution.
2. Required extension files and icon references.
3. Popup button wiring.
4. Dashboard action compatibility.
5. JavaScript parse checks for all runtime scripts.
6. Web Store ZIP safety, including no private dashboard key and no local-only files.
7. No broken encoded characters in runtime UI/dashboard text.
8. Isolated browser Health Check with GLDN Ops loaded in a clean Chromium profile.
9. Computer-to-account mapping for M0, 2, 6, 0, M1, and 7.

If this fails, do not test live workflows until the failure is fixed.

## Computer Map

| Computer | Marketplace account | Required platforms |
| --- | --- | --- |
| M0 | CLICKNCARRY + Poshmark as needed | eBay, Amazon, EcomSniper, optional Poshmark |
| 2 | FANCYFI | eBay, Amazon, EcomSniper |
| 6 | FINTIME | eBay, Amazon, EcomSniper |
| 0 | FAK12 + FarPosh | eBay, Amazon, EcomSniper, Poshmark as computer 7 |
| M1 | HEARTSTONE | eBay, Amazon, EcomSniper |
| 7 | FarPosh | Poshmark, Amazon |

## Install And Update Check

Run this on each Windows user profile:

1. Open each Chrome profile that uses GLDN Ops.
2. Run the one-time GLDN Ops installer if this Windows account has never installed the stable folder.
3. In each intended Chrome profile, load `%LOCALAPPDATA%\GLDN Ops\extension` once as an unpacked extension. Later releases use `Update & Reload`; do not select a new folder for every update.
4. Open the GLDN Ops popup and save the correct computer.
5. Save the dashboard setup code once.
6. Click `Test Connection`.
7. Click `Copy Settings Backup` and keep the copied text until the update is confirmed.
8. Click `Run Feature Health Check`.
9. Click `Copy Full Diagnostic Report` and save it with the computer/profile name.
10. Double-click `Diagnose-GLDN-Ops.cmd` only when checking a local repo/test install.
11. Confirm dashboard is `OK`.
12. Confirm every target Chrome profile shows `GLDN=yes`.
13. Confirm eBay computers with EcomSniper show `EcomSniper=yes`.

Browser automation cannot directly open `chrome-extension://.../popup.html` in Codex. Popup-only checks require the operator to open the extension popup and click the relevant button. Record the result in the release note.

## eBay Release Checks

Run one small safe pass per eBay computer. The operator must approve moving to the next workflow after each item passes.

1. Open Seller Hub Performance and run `Scan Seller Level`.
2. Save after reviewing the values.
3. Confirm the Tasks sheet metric rows populate under the correct computer.
4. Open Seller Hub Overview and run `Scan Sales Snapshot`.
5. Confirm sales, feedback, traffic, and advertising values are captured when visible.
6. Run `Confirm Listings Under Limit`.
7. Confirm the review dialog uses the computer-derived account.
8. Prepare one eBay order note without pressing final eBay Save until manually reviewed.
9. Confirm a row appears in `Marketplace Profit History` and `Profit - <computer>`.

## EcomSniper Release Checks

Run on one eBay computer first, then repeat on each profile with EcomSniper only after the first profile passes.

1. Click `Open EcomSniper Competitor Scanner` and confirm the handoff monitor reports `Handoff open`.
2. Close that tab and confirm the monitor reports `Handoff closed` without claiming completion.
3. Click `Open EcomSniper Product Hunter` and repeat the open/closed monitor check.
4. On one controlled eBay search, confirm GLDN Ops clicks EcomSniper `Extract Sellers` only when that assist was explicitly started.
5. Confirm each extraction step satisfies `after total - before total = reported new` before GLDN Ops continues.
6. Confirm the popup separates the latest step from the complete run and never reports Bulk Poster progress.
7. Copy a small Scanner title sample, click `Filter Titles & Open Product Hunter`, and confirm the popup's kept/excluded/duplicate counts.
8. Confirm clothing, shoes, costumes, outfits, and fashion accessories are excluded before Product Hunter.
9. Confirm `Stop GLDN Assist` stops only GLDN's extraction queue and does not claim to stop EcomSniper private controls.
10. Start `Sniping Workflow` from one Amazon product with a visible price.
11. Confirm seller candidates are only saved when eBay price is at least the configured markup over Amazon.

## Poshmark Release Checks

Run on computer 7, M0, and the combined computer 0 + 7 profile:

1. Open `https://poshmark.com/users/self/closet_stats`.
2. Run `Scan Posh Stats`.
3. Confirm shipped orders, days to ship, seller cancellations, approved returns, removed listings, available listings, and average rating are captured.
4. Open the Poshmark sales list and run `Capture Visible Sales`.
5. Confirm visible rows save to `Marketplace Profit History` and the correct profit sheet: `Profit - 7` for computer 7 or combined 0 + 7, and `Profit - M0` for M0.
6. Copy matching Amazon order info.
7. Open one Poshmark sale order and run `Capture Order Profit`.
8. Confirm profit and margin calculate before saving.

## Release Decision

Mark the release ready only when:

1. `tools\check-release.ps1` passes.
2. `Diagnose-GLDN-Ops.cmd` passes on every target computer/profile where the local repo exists.
3. The popup Test Connection passes on every Chrome profile.
4. Feature Health Check passes or has a documented expected limitation.
5. Each eBay workflow reaches a review screen before any final marketplace action.
6. Poshmark stats and profit capture write to the correct per-computer sheet.
7. EcomSniper handoff proves the automatic Extract Sellers count update and safe stop/reset without a local helper.
8. Each tested profile has a saved diagnostic report for the release.
9. Known failures are listed in the release notes with the exact computer/profile affected.
10. The owner gives a green light before testing the next major workflow.
