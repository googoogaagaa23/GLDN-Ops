# GLDN Ops v3.7.3 Poshmark Stats Evidence

Test date: 2026-07-11  
Live browser: existing signed-in Chrome Profile 2 (`F9132 - TE - BULK`)  
Extension: GLDN Ops v3.7.3, unpacked from this repository  
Identity: computer `0 + 7`; Poshmark dashboard computer `7`; account `igivegreatdeals`  
Apps Script: production deployment `AKfycbzi...Uhw`, version 17

## Result

`P-01` stats extraction and `P-02` daily history are live-proven and awaiting the user's gate approval.

- The review modal matched the independently read Poshmark page values.
- The dashboard row and history row matched the reviewed modal values.
- Eighteen legacy history rows were reduced to one row for each of July 8, July 9 and July 10.
- July 11 was appended once, then updated twice without adding another row.
- All July 11 changes remained calculated against the final July 10 snapshot.
- The final Profile 2 health result reported queue `0` and dashboard `OK`.
- No Poshmark listing, order, message or marketplace setting was changed.

## Automated Proof

The full v3.7.3 release check passed:

- 11 JavaScript parse checks
- manifest, package, profile reload and configuration safety checks
- clean install/update fixture with private config preserved
- local and live dashboard contracts
- eight foundation, queue, idempotency and Poshmark history tests

The migration fixture reproduces 18 history rows, removes 15 duplicates in three contiguous sheet operations, retains the newest daily snapshots and rebuilds daily deltas.

## Live Values

Final Poshmark page, review modal, dashboard row 2 and history row 5 all showed:

| Metric | Final value | Change from July 10 |
|---|---:|---:|
| Profile listings | 125,160 | +891 |
| Followers | 86,188 | +318 |
| Shipped orders all time | 3,847 | +24 |
| Shipped orders last 90 days | 1,100 | -19 |
| Days to ship last 90 days | 2.3 | -0.1 |
| Days to ship average | 3.4 | 0 |
| Total sales last 90 days | $31,987.00 | -$899.00 |
| Seller cancellations last 90 days | 2.90% | +0.2 points |
| Approved return cases last 90 days | 0.70% | +0.1 points |
| Moderator-removed listings last 30 days | 66 | -6 |
| Available listings | 112,591 | -2,203 |
| Average discount off original price | 25.00% | -2 points |
| Self-shares last 30 days | 217,771 | -2,633 |
| Sold listings all time | 3,985 | +50 |
| Total earned all time | $91,322.40 | +$1,536.49 |
| Average rating | 4.8 | 0 |
| Total ratings | 2,097 | +22 |

## Exact Readback

Final history readback from `Poshmark Stats History!A1:AN10` contained one data row per day:

- July 8: row 2
- July 9: row 3
- July 10: row 4
- July 11: row 5, last checked `7/11/2026 6:36 PM`

Final receipt readback from `Sync Receipts!A1:F10`:

```json
{
  "ok": true,
  "message": "Poshmark stats updated for 7.",
  "row": 2,
  "historyRow": 5,
  "historyMode": "updated",
  "historyDate": "2026-07-11",
  "previousDate": "2026-07-10",
  "removedDuplicateHistoryRows": 0
}
```

The first migration receipt recorded `historyMode: appended` and `removedDuplicateHistoryRows: 15`. The next two receipts both recorded `historyMode: updated`, `historyRow: 5`, and `previousDate: 2026-07-10`.

## Retry Evidence

The initial legacy cleanup exceeded the old foreground request window. The record was preserved with the same sync ID, completed once on the server, produced one receipt and cleared from the retry queue. v3.7.3 then batched cleanup operations and changed queued Poshmark saves to report background syncing rather than a false failure. Subsequent saves synced directly.

Final health:

```text
Health OK: v3.7.3; computer 0; account FAK12; mode local-unpacked; schema 2/2; backups 1; queue 0; dashboard OK; EcomSniper route OK
```

## Screenshots

- `evidence/profile2-poshmark-stats-v373-2026-07-11/01-profile2-v372-stats-page.png`
- `evidence/profile2-poshmark-stats-v373-2026-07-11/02-reviewed-stats-preview.png`
- `evidence/profile2-poshmark-stats-v373-2026-07-11/03-repeat-save-synced.png`
- `evidence/profile2-poshmark-stats-v373-2026-07-11/04-final-health-queue-zero.png`
- `evidence/profile2-poshmark-stats-v373-2026-07-11/05-v373-final-save-synced.png`
- `evidence/profile2-poshmark-stats-v373-2026-07-11/06-v373-final-health-queue-zero.png`

## Package

- `dist/GLDN-Ops-local-v3.7.3.zip`
- `dist/GLDN-Ops-latest.zip`

The final package hash is reported after the last documentation-inclusive build.

Rollback target: v3.7.2.
