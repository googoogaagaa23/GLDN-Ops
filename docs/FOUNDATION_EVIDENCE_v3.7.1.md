# GLDN Ops v3.7.1 Foundation Evidence

Date: 2026-07-11  
Gate: Local-only foundation  
Required Chrome profile: `Profile 2` (`F9132 - TE - BULK`)

## Verdict

`TECHNICAL LIVE PASS - AWAITING USER GREEN LIGHT FOR THE NEXT FEATURE`

The source, packaged local release, updater, rollback fixtures, dashboard
contract, signed-in eBay panel, and signed-in Poshmark panel all identify
v3.7.1. No Chrome Web Store path or local click helper is required.

## Exact Live Readback

eBay on signed-in Profile 2:

```text
GLDN Ops v3.7.1
Computer: 0
eBay account: FAK12
Health OK: v3.7.1; computer 0; account FAK12; mode local-unpacked; schema 2/2; backups 1; queue 0; dashboard OK; EcomSniper route OK
```

The same page showed the signed-in greeting `Hi Farrukh!`.

Poshmark on signed-in Profile 2:

```text
GLDN Ops v3.7.1
Computer: 0 + 7
Poshmark syncs as 7
Platform: Poshmark
Health OK: v3.7.1; computer 0; account FAK12; mode local-unpacked; schema 2/2; backups 1; queue 0; dashboard OK; EcomSniper route OK
```

## Automated Release Evidence

`tools/check-release.ps1` passed for v3.7.1.

- All 11 extension runtime JavaScript files parsed.
- Universal manifest, configuration, wiring, mapping, dashboard-action, and package-safety checks passed.
- The dependency-free clean install/update fixture returned:

```json
{"version":"3.7.1","cleanInstall":true,"updateBackupCount":1,"configPreserved":true,"profileWithSpaceAccepted":true,"pass":true}
```

- All six dashboard action contracts passed.
- All six foundation/queue/idempotency tests passed with zero failures.
- Final packages:
  - `dist/GLDN-Ops-local-v3.7.1.zip`
  - `dist/GLDN-Ops-latest.zip`

## Screenshots And Structured Evidence

- `evidence/profile2-v371-foundation-2026-07-11/live-ebay-v371-health.png`
- `evidence/profile2-v371-foundation-2026-07-11/live-posh-v371-health.png`
- `evidence/profile2-v371-foundation-2026-07-11/live-health-readback.json`

The eBay page's live-video area intermittently delayed browser screenshots;
the screenshot still completed, and the structured readback contains the exact
panel values returned before capture. The lighter Poshmark feed screenshot
shows the full detailed health line directly.

## Dashboard And Tasks Evidence Carried Forward

- Live Apps Script deployment: `@15`.
- Duplicate-proof receipt ID:
  `gldn-receipt-live-c174a8940e774676ac9f3898f8aa0166`.
- The first receipt was accepted, the second was marked duplicate, and exact
  Sheet readback contained one row.
- `Tasks!K17` was cleared after exact readback proved all E:I tracking values
  were at or above 85%; the Poshmark-only computer cell remained gray.

## Safety

No listing, order, shipment, note, message, purchase, Store category, or other
marketplace data was submitted or changed during this foundation gate.

The next gate is Poshmark statistics collection and daily dashboard history.
It must not begin until the user gives the green light.
