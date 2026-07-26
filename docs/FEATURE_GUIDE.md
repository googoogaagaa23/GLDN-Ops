# GLDN Ops Feature Guide

Generated from `docs/GUIDE_CATALOG.json` for GLDN Ops v3.10.4. Do not edit the generated Markdown or extension HTML directly.

GLDN Ops assists marketplace workflows. It does not replace eBay, Amazon, Poshmark, Walmart, EcomSniper, or the shared Tasks sheet.

> **Safety rule:** Final marketplace actions require explicit action-time approval. GLDN Ops must stop before eBay Continue, eBay Save, final listing Submit, purchase, or any equivalent irreversible action unless the operator approves that exact action.

## Evidence Labels

- **LIVE PASS:** Current signed-in evidence and exact readback prove the documented result.
- **LIVE PASS WITH BOUNDARY:** The documented result passed live, but a named external or manual boundary remains.
- **PENDING USER REVIEW:** Recorded evidence exists, but the user has not accepted the gate.
- **PARTIAL:** Only the stated portion is proven. Do not assume the entire workflow works.
- **IMPLEMENTED, UNPROVEN:** Code exists, but no valid current live proof exists.

## Feature Index

- [First-Time Setup](#setup) - **PARTIAL**
- [Floating Panel](#panel) - **LIVE PASS**
- [Dashboard and Sync Queue](#dashboard) - **PARTIAL**
- [Local Update and Rollback](#deployment) - **PARTIAL**
- [Mark as Shipped](#mark-shipped) - **LIVE PASS**
- [eBay Order Note and Profit](#ebay-note-profit) - **LIVE PASS**
- [Seller Level and Tasks Metrics](#seller-metrics) - **LIVE PASS**
- [Confirm Listings Under Limit](#listing-limits) - **LIVE PASS**
- [eBay Sales Snapshot](#ebay-snapshot) - **LIVE PASS**
- [Store Category Configuration](#store-categories) - **LIVE PASS**
- [Move .99 Listings Into Sale](#move99) - **LIVE PASS WITH BOUNDARY**
- [Move Non-.99 Listings Out of Sale](#reverse99) - **IMPLEMENTED, UNPROVEN**
- [Move Category Recovery](#move99-recovery) - **LIVE PASS**
- [EcomSniper Handoffs and Status](#ecomsniper-handoffs) - **PARTIAL**
- [Sniping Workflow](#sniping) - **PENDING USER REVIEW**
- [Poshmark Stats](#poshmark-stats) - **LIVE PASS**
- [Poshmark Sales and Profit](#poshmark-profit) - **PARTIAL**
- [Historical Poshmark Profit Backfill](#poshmark-profit-backfill) - **LIVE PASS**
- [Tasks Reminders and Auto-Completion](#tasks-automation) - **LIVE PASS**
- [Diagnostics, Backup, and Interface Settings](#diagnostics) - **PARTIAL**
- [Feature Tour, Themes, and Universal Access](#onboarding-interface) - **PARTIAL**
- [Walmart Order Helper](#walmart) - **IMPLEMENTED, UNPROVEN**

<a id="setup"></a>
## First-Time Setup

**Matrix:** F-02, F-05, F-06, F-08, F-12

**Evidence status:** PARTIAL

**Purpose:** Configure one Chrome profile without guessing its marketplace identity.

### Prerequisites

- The credential-free GLDN Ops package is loaded unpacked in the intended Chrome profile.
- The operator knows the Tasks-sheet computer label.

### Exact Steps

1. Open the popup and choose only the computer label.
2. Confirm the derived marketplace account before saving.
3. Click Save Computer.
4. Open Status. If the dashboard is not connected in this Chrome profile, click Connect Dashboard once.
5. Click Test Connection, then Run Feature Health Check.
6. Copy Settings Backup before an update or profile move.

### Approval Stop

None. Setup must not start a marketplace workflow.

### Expected Output

Saved computer/account mapping, dashboard connection, health report, and settings backup.

### Failure Recovery

- If the account is wrong, stop and correct the computer label instead of editing the derived account.
- If the dashboard is not connected, use Connect Dashboard once in that Chrome profile; updates preserve it.
- If dashboard testing fails, copy the full diagnostic report before clearing anything.
- A clean-computer installation is still a final deployment gate.

### Evidence

Identity mapping and health diagnostics are live-proven in Profile 2. Saved-profile dashboard setup and credential-free packaging are contract-tested; clean-computer proof remains pending.


<a id="panel"></a>
## Floating Panel

**Matrix:** U-01

**Evidence status:** LIVE PASS

**Purpose:** Use the compact everyday controls without blocking marketplace pages.

### Prerequisites

- A supported eBay, Amazon, Poshmark, or Walmart page is open.

### Exact Steps

1. Use Side to dock the panel to the right edge.
2. Use the minus control to minimize it.
3. Drag the resize handle while expanded.
4. Open the three-dot settings menu to change theme, transparency, or reset layout.
5. Use Stop Task for a safe checkpoint and Reset only for abandoned state.
6. Use Reload Ext after local files are updated.

### Approval Stop

Panel layout actions require no marketplace approval.

### Expected Output

A saved per-profile panel mode, size, position, theme, and transparency.

### Failure Recovery

- Use Reset panel layout if the panel is off-screen or awkwardly sized.
- Use Reload Ext when page controls are stale after an update.

### Evidence

Profile 2 proved Graphite at 75%, persisted resize, normal reload persistence, and right-edge docking.


<a id="dashboard"></a>
## Dashboard and Sync Queue

**Matrix:** F-08, F-09

**Evidence status:** PARTIAL

**Purpose:** Open shared results and retry records that could not sync immediately.

### Prerequisites

- The computer identity is saved and Status shows the dashboard is connected.

### Exact Steps

1. Open Status in the popup.
2. Click Test Connection.
3. Click Open Dashboard to review saved results.
4. If the popup reports queued records, click Retry Queued Dashboard Records.
5. Confirm the sent and remaining counts.

### Approval Stop

None. Dashboard reads and sync retries do not authorize marketplace actions.

### Expected Output

A rendered dashboard plus idempotent sync receipts or a retained retry queue.

### Failure Recovery

- Never clear queued data to hide a failure.
- Copy the diagnostic report if retries remain.
- Retry only after confirming whether the original sync ID already succeeded.

### Evidence

Dashboard opening and the production queue timeout path are live-proven in Profile 2. One record queued, duplicate enqueue remained one, the same sync ID retried once through dashboard ping, and the final queue was zero. Drive proof: https://drive.google.com/file/d/1Hl_ro2zabXd7zJARXkijq7IT3W6AFW0y/view?usp=drivesdk


<a id="deployment"></a>
## Local Update and Rollback

**Matrix:** F-01, F-02, F-03, F-04, F-14

**Evidence status:** PARTIAL

**Purpose:** Update the unpacked local build while preserving settings and rollback data.

### Prerequisites

- The current extension folder is known.
- A settings backup has been copied.
- No marketplace confirmation dialog is active.

### Exact Steps

1. Run Update-GLDN-Ops.cmd from the project folder.
2. Wait for validation, snapshot creation, and matching-profile reload.
3. Refresh active marketplace tabs.
4. Confirm the panel and popup show the expected version.
5. Run Feature Health Check.
6. Use the local manager rollback only for a confirmed broken release.

### Approval Stop

A real rollback in an active signed-in profile requires explicit approval because it changes runtime files.

### Expected Output

Validated local files, preserved settings, a timestamped snapshot, and reloaded matching profiles.

### Failure Recovery

- Do not use Chrome policy or a Web Store path for this local build.
- If validation fails, keep the current working files and copy diagnostics.
- Real Profile 2 rollback remains intentionally untested.

### Evidence

Clean install/update fixtures pass. Another physical computer and a real Profile 2 rollback remain pending.


<a id="mark-shipped"></a>
## Mark as Shipped

**Matrix:** E-01

**Evidence status:** LIVE PASS

**Purpose:** Select every awaiting order, pause once, and sync the exact completion count.

### Prerequisites

- The signed-in eBay Awaiting shipment page is open.
- The complete Results total is visible.

### Exact Steps

1. Click Mark as Shipped.
2. Wait while GLDN Ops verifies every visible row, the master checkbox, and the awaiting total.
3. Review eBay's exact confirmation count.
4. Approve Continue only when the selected count equals the intended awaiting total.
5. After Continue, wait for eBay success and zero remaining results.
6. Confirm the dashboard and matching Tasks checkbox update.

### Approval Stop

STOP at eBay Continue. Continue requires explicit action-time approval for the exact count shown.

### Expected Output

Exact awaiting, selected, shipped, remaining, status, dashboard history, and Tasks completion.

### Failure Recovery

- If eBay omits a confirmation number, GLDN Ops may reuse only the exact pre-confirm count.
- Any count mismatch stops safely.
- Copy diagnostics before Reset if the confirmation remains stale.

### Evidence

Profile 2 live proof completed 3 of 3 orders and read back zero remaining plus exact dashboard and Tasks rows.


<a id="ebay-note-profit"></a>
## eBay Order Note and Profit

**Matrix:** E-04, E-05

**Evidence status:** LIVE PASS

**Purpose:** Match the exact Amazon order item to the eBay SKU, fill the note, and sync one profit row.

### Prerequisites

- The exact Amazon order-details card is open, not checkout or a product page.
- The matching eBay order has a visible EcomSniper Custom label SKU.

### Exact Steps

1. On Amazon order details, click Review & Copy Amazon Info.
2. Verify order ID, ASIN, item-row cost or Grand Total, ETA, and evidence source.
3. Copy the Amazon info.
4. Open the matching eBay order and click Prepare Order Note.
5. Confirm the decoded ASIN exactly matches the Amazon evidence.
6. Click Fill Add Note Box or Fill Edit Note Box.
7. Review the real eBay textarea and approve Save only when the note is correct.
8. After eBay visibly saves, confirm one dashboard profit row.

### Approval Stop

STOP at eBay Save. Saving the note requires explicit action-time approval.

### Expected Output

Saved eBay note plus one upserted profit row with supplier order, ASIN, cost, profit, and margin evidence.

### Failure Recovery

- Checkout, product-page, stale, wrong-order, or mismatched-ASIN evidence must fail closed.
- Do not sync profit before eBay Save.
- An already matching saved note may refresh the same row without another Save.

### Evidence

Profile 2 matched an exact Amazon order and ASIN, filled the real eBay note, and later read back one deduplicated profit row.


<a id="seller-metrics"></a>
## Seller Level and Tasks Metrics

**Matrix:** E-02, T-01, T-02, T-03

**Evidence status:** LIVE PASS

**Purpose:** Read four seller metrics, review them, and update the correct Tasks computer column and warnings.

### Prerequisites

- The signed-in eBay seller performance page is open.
- The correct computer identity is saved.

### Exact Steps

1. Click Scan Seller Level.
2. Review transaction defects, late shipment, tracking, unresolved cases, seller level, and evaluation date.
3. Click Save Seller Level Check.
4. Confirm all four metrics receive timestamp notes in the correct Tasks computer column.
5. Confirm the parent performance checkbox updates only after all four metrics save.
6. Review CHECK warnings and threshold colors.

### Approval Stop

Saving reviewed metrics needs operator confirmation in the review window but performs no marketplace write.

### Expected Output

Dashboard current/history rows, Tasks metric values and notes, parent checkbox, and CHECK warnings.

### Failure Recovery

- Missing values remain Not detected and must not become zero.
- Poshmark-only columns stay grey and empty.
- Copy diagnostics if the review values do not match eBay.

### Evidence

Exact Profile 2 values, dashboard rows, Tasks H14:H18, grey Poshmark-only cells, and threshold boundaries are live-proven.


<a id="listing-limits"></a>
## Confirm Listings Under Limit

**Matrix:** E-03

**Evidence status:** LIVE PASS

**Purpose:** Evaluate Store insertion allowance, seller quantity, and seller dollar limits independently.

### Prerequisites

- Seller Hub Overview is fully loaded.
- The Store plan and monthly dollar limit are saved.

### Exact Steps

1. Click Confirm Listings Under Limit.
2. Review active listings and available quantity as inventory information only.
3. Review Store allowance used/left.
4. Review seller quantity used/limit.
5. Review seller dollar used/limit.
6. Click Confirm Listings This Month only when all detected values match eBay.

### Approval Stop

The review confirmation is required; it does not change listings.

### Expected Output

Monthly confirmation, dashboard history, and the matching Tasks completion row.

### Failure Recovery

- Never treat active listings as the Store insertion allowance.
- Missing Store allowance data cannot produce GOOD.
- Reopen Seller Hub Overview if a card is incomplete.

### Evidence

Profile 2 exact Store, quantity, dollar, dashboard, history, receipt, and Tasks readbacks are live-proven.


<a id="ebay-snapshot"></a>
## eBay Sales Snapshot

**Matrix:** E-06

**Evidence status:** LIVE PASS

**Purpose:** Capture sales, traffic, advertising, and feedback with card-scoped values.

### Prerequisites

- Seller Hub Overview cards are visible.

### Exact Steps

1. Click Scan Sales Snapshot.
2. Review sales today, 7, 31, and 90 days plus change direction.
3. Review traffic impressions and page views.
4. Review advertising values that eBay actually displays.
5. Review positive, neutral, and negative feedback counts.
6. Click Save eBay Snapshot only when the review matches the page.

### Approval Stop

The review save needs confirmation but performs no marketplace write.

### Expected Output

Dashboard snapshot and history rows for the saved computer/account.

### Failure Recovery

- A missing card stays blank instead of borrowing a nearby number.
- Reload Seller Hub once if cards are incomplete.
- Do not invent ad cost when eBay does not display it.

### Evidence

Profile 2 source, review, dashboard, history, and receipt values are live-proven.


<a id="store-categories"></a>
## Store Category Configuration

**Matrix:** E-07

**Evidence status:** LIVE PASS

**Purpose:** Save exact source and destination Store categories per eBay account.

### Prerequisites

- The intended eBay account is signed in.
- Exact Store category names are known.

### Exact Steps

1. Open Store Categories from the eBay panel settings or popup Settings.
2. Confirm the displayed eBay account.
3. Enter exact source category names and one exact destination name.
4. Optionally enter numeric source IDs and backburner item IDs.
5. Click Save and Verify.
6. Copy a category/settings backup before moving computers or profiles.

### Approval Stop

Saving configuration changes extension settings only and must not launch a listing workflow.

### Expected Output

Validated, account-bound category names, IDs, and backburner IDs preserved across updates.

### Failure Recovery

- Duplicate, overlapping, malformed, or empty settings fail closed.
- Restore only a backup for the same account.
- Recheck exact category names after eBay renames a Store category.

### Evidence

Profile 2 FAK12 exact categories, IDs, backup, restore, and reload persistence are live-proven.


<a id="move99"></a>
## Move .99 Listings Into Sale

**Matrix:** E-08

**Evidence status:** LIVE PASS WITH BOUNDARY

**Purpose:** Scan exact item IDs, select only exact .99 listings, change only primary Store category, and pause before Submit.

### Prerequisites

- Exact source/destination categories are saved for the signed-in eBay account.
- The operator has reviewed any backburner exclusions.
- No other Move .99 run is active.

### Exact Steps

1. Open Workflows in the popup and click Open Move .99 Workflow.
2. Wait for the complete filtered Active Listings exact-ID scan.
3. Review total scanned, qualifying, omitted, and failed counts.
4. Apply only the verified exact-ID batches, each capped at 500.
5. Confirm eBay's native selected count matches the intended batch.
6. Confirm only Primary Store category changed to the exact destination.
7. Approve Submit only for the exact reviewed batch.
8. After a trusted Submit click and an explicit eBay success/failure result, let GLDN Ops continue from the saved checkpoint.

### Approval Stop

STOP before every eBay Submit. Each exact batch requires separate action-time approval.

### Expected Output

Per-batch selected/submitted result, final remaining/failed counts, audit data, and Tasks completion only after exact zero remaining and zero failed.

### Failure Recovery

- Any incomplete scan, mixed price, selected-count mismatch, missing picker, or uncertain submit result stops safely without opening another tab or batch.
- If the review page disappears before a trusted Submit click or explicit eBay result, the run enters Approval Lost and requires manual reconciliation.
- Do not alter item specifics to force category failures through.
- Six known FAK12 failures remain backburnered and must not be resubmitted without new approval.

### Evidence

Profile 2 moved 2,564 successful exact .99 listings in earlier approved batches and isolated six persistent backburner failures. The v3.10.4 read-only retest scanned 232 listings over two pages, staged 5 exact matches, and held the same Submit (5) workspace through extension reload and repeated approval checks with no new tab; Submit remained untouched. Formal Drive video is pending.


<a id="reverse99"></a>
## Move Non-.99 Listings Out of Sale

**Matrix:** E-09

**Evidence status:** IMPLEMENTED, UNPROVEN

**Purpose:** Find valid non-.99 prices in the sale category and return them to the configured non-sale category.

### Prerequisites

- The sale and non-sale categories are configured for the signed-in account.
- Backburner exclusions are current.

### Exact Steps

1. Open Workflows and click Move Non-.99 Out of Sale.
2. Review the complete sale-category scan summary.
3. Confirm every selected listing has a valid non-.99 price.
4. Confirm backburner items are excluded.
5. Verify only Primary Store category changes to the configured non-sale destination.
6. Approve each final Submit separately.
7. Run a final clean rescan.

### Approval Stop

STOP before every eBay Submit and approve only the exact reviewed count.

### Expected Output

Submitted batch results and a final zero-mismatch rescan.

### Failure Recovery

- Missing or ambiguous prices are excluded.
- Any uncertain submission returns to read-only reconciliation.
- Do not use the reverse workflow on Poshmark.

### Evidence

The older FAK12 proof corrected 62 listings, but a later M0 / CLICKNCARRY failure report exposed reverse category-ID persistence corrupting forward settings. v3.10.4 retains that account-generic repair and passes automated contracts; M0 still needs a fresh BALK to BEST SELLERS signed-in scan and final-review proof.


<a id="move99-recovery"></a>
## Move Category Recovery

**Matrix:** E-10

**Evidence status:** LIVE PASS

**Purpose:** Recover from reloads, picker delays, lost approval pages, and per-item failures without guessing.

### Prerequisites

- A saved Move .99 checkpoint exists.
- The same signed-in eBay account and configured categories are active.

### Exact Steps

1. Reload the extension only when the current page is stable.
2. Use Run Move .99 or Apply to reclaim the verified checkpoint.
3. If the approval page or submission outcome is uncertain, keep the run stopped and manually reconcile the saved batch before starting another scan.
4. Review processed, failed, remaining, and recovery history.
5. Export audit data before Reset.
6. Use Retry Failed Only only with a new explicit approval.

### Approval Stop

Recovery never grants Submit approval. Retrying or submitting any remaining item requires a new action-time approval.

### Expected Output

Idempotent checkpoint, reconciliation result, processed/failed lists, and audit export.

### Failure Recovery

- Generic or non-numeric Store category tokens are rejected.
- Never shift the saved page after eBay omits a row.
- When outcome is unknown, do not auto-rescan, navigate, or open another workspace; reconcile first and then start a new operator-approved scan.

### Evidence

Profile 2 recovered a cancelled review into a complete read-only scan and exported exact Remaining / Retry rows with zero batches submitted.


<a id="ecomsniper-handoffs"></a>
## EcomSniper Handoffs and Status

**Matrix:** C-01, C-02, C-04

**Evidence status:** PARTIAL

**Purpose:** Verify GLDN seller-extraction counts and handoff-tab state without claiming that GLDN runs or reads EcomSniper Bulk Poster.

### Prerequisites

- eBay and EcomSniper are signed in in the same Chrome profile.
- EcomSniper's visible Extract Sellers control is present on an eBay search-results page for seller extraction.

### Exact Steps

1. Open Workflows and review EcomSniper Handoffs.
2. Use Open EcomSniper Competitor Scanner or Filter Titles & Open Product Hunter only for the handoff you intend.
3. Click Refresh Status to read current GLDN-observable state.
4. Treat Extracting as seller extraction on eBay only; confirm the before total, after total, and reported new count reconcile.
5. Treat Handoff open or Handoff closed as tab-lifecycle information only.
6. Do not infer Bulk Poster progress, item counts, completion, or failure from the handoff monitor.
7. Use Stop GLDN Assist to request a safe stop of GLDN's seller-extraction queue; stop EcomSniper work from EcomSniper itself.

### Approval Stop

GLDN Ops cannot approve or click EcomSniper's private Scanner, Product Hunter, export, Bulk Poster, or listing controls. Any listing action requires explicit approval.

### Expected Output

Verified seller-count progression plus honest open, closed, stopped, or unknown handoff state.

### Failure Recovery

- Missing, stale, wrong-page, mismatched, or timed-out seller counts stop safely.
- An open or closed private EcomSniper tab never proves processing completion.
- Copy the full diagnostic report before Reset.
- No Windows local helper is required.

### Evidence

Profile 2 previously reconciled seller extraction from 892 to 1,607. The new v3.10.2 handoff monitor is contract-tested but still requires one signed-in Profile 2 UI proof; EcomSniper private-page progress remains unreadable by Chrome design.


<a id="sniping"></a>
## Sniping Workflow

**Matrix:** C-03

**Evidence status:** PENDING USER REVIEW

**Purpose:** Choose close competitors, verify exact products, enforce economics, and stop at a read-only review.

### Prerequisites

- An exact Amazon product page shows a valid ASIN and price.
- The user is prepared to manually confirm product identity and EcomSniper private-page steps.

### Exact Steps

1. Click Start Sniping Workflow from the exact Amazon product.
2. Review the capped eBay candidate set returned to Amazon.
3. Open source links and manually confirm title/brand, image, pack, size, color, and variant.
4. Save one verified seller only when it looks like a matching dropshipper.
5. Scan that seller in EcomSniper and select a proven recent-selling winner.
6. Capture the winner on eBay and open the exact Product Hunter match.
7. Review markup, exact $0.05 undercut, fee, spread, and conservative profit.
8. Save Read-Only Review only after exact identity confirmation.

### Approval Stop

The workflow must stop at read-only review. It cannot create, edit, or submit an eBay listing.

### Expected Output

A saved read-only seller/winner/product/economics review with no listing action.

### Failure Recovery

- Markup alone never proves an Amazon match.
- A mismatch or unprofitable result cannot advance.
- EcomSniper continuation remains unverified and must stay manual.

### Evidence

A recorded Profile 2 candidate and 80.1% markup proof exists, but the user deferred review and EcomSniper continuation remains unverified.


<a id="poshmark-stats"></a>
## Poshmark Stats

**Matrix:** P-01, P-02

**Evidence status:** LIVE PASS

**Purpose:** Review requested closet statistics and save one snapshot per Chicago day with deltas.

### Prerequisites

- The signed-in My Posh Stats page is open.
- Computer 7, M0, or the combined computer 0 profile is saved correctly.

### Exact Steps

1. Open My Posh Stats.
2. Click Scan Posh Stats.
3. Review shipped orders, days to ship, cancellations, returns, removed listings, profile and available listings, ratings, and requested totals.
4. Click Save Poshmark Stats.
5. Confirm the dashboard latest row and daily history/deltas.

### Approval Stop

Saving reviewed stats needs confirmation but performs no marketplace write.

### Expected Output

One latest snapshot and one upserted daily history row for dashboard computer 7.

### Failure Recovery

- Do not save if the signed-in closet identity is wrong.
- Same-day saves update one row instead of adding duplicates.
- Legacy same-day duplicates are repaired before deltas rebuild.

### Evidence

All requested Profile 2 metrics and dashboard/history readbacks are live-proven.


<a id="poshmark-profit"></a>
## Poshmark Sales and Profit

**Matrix:** P-03, P-04, P-05, P-06, P-07

**Evidence status:** PARTIAL

**Purpose:** Decode the sale SKU, find the exact Amazon order-item cost, and save deduplicated profit evidence.

### Prerequisites

- The signed-in Poshmark sale order shows earnings and an EcomSniper SKU.
- Signed-in Amazon Orders is available in the same Chrome profile.

### Exact Steps

1. Open the Poshmark sale order and click Capture Order Profit.
2. If needed, click Open Amazon Orders for ASIN.
3. Verify the decoded SKU ASIN against an exact Amazon order-details item row.
4. On Amazon, click Review & Copy Amazon Info.
5. Return to Poshmark and click Capture Order Profit again.
6. Review earnings, per-item Amazon cost, profit, margin, SKU, ASIN, and supplier order.
7. Click Save Profit only when every identity matches.
8. Use Capture Visible Sales separately for the quick sales list import.

### Approval Stop

Saving reviewed profit needs confirmation but performs no marketplace write or purchase.

### Expected Output

One upserted Marketplace Profit History row and computer 7 profit row with exact supplier evidence.

### Failure Recovery

- Never use EcomSniper markup, product-page price, checkout total, or a different order.
- A missing, stale, redirected, extra, or mismatched ASIN blocks Save.
- Visible Sales import remains partial and must not be treated as full profit proof.

### Evidence

Ten exact Profile 2 order-cost/profit matches are live-proven. The separate visible-sales import lacks current-version dashboard readback.


<a id="poshmark-profit-backfill"></a>
## Historical Poshmark Profit Backfill

**Matrix:** P-08

**Evidence status:** LIVE PASS

**Purpose:** Index paginated Poshmark sales, read each exact SKU-linked order, allocate exact Amazon purchase units once, and stage a review before dashboard sync.

### Prerequisites

- Use the Chrome profile already signed into both Poshmark and Amazon.
- The saved computer must be Poshmark-enabled.
- Set the Amazon profile label if supplier-profile reporting is required.

### Exact Steps

1. Open Workflows in the popup, or click Historical Profit Backfill on a Poshmark page, and choose Pilot, New since last sync, Last 90 days, or All sales. On one sale-detail page, Current sale only is also available for an exact audit or retry.
2. Click Start Historical Profit Backfill or Start New Run.
3. Let the single background worker switch Poshmark to Show 100 and index every available sales page in the selected range, or open the selected current sale directly.
4. Let the worker open each Poshmark sale detail and decode every EcomSniper SKU into an exact ASIN.
5. Let it search all matching Amazon order result pages and open each exact order detail in the same worker tab.
6. Review Exact, Needs Review, Missing SKU, and Amazon Not Found counts.
7. Inspect earnings, Amazon item cost, supplier order, and profit rows.
8. Click Sync Exact Profits only after approving the exact review count; ambiguous rows remain unsynced.
9. Use New since last sync for later incremental runs.

### Approval Stop

STOP at the review. Sync Exact Profits requires a separate confirmation and is the only step that writes historical rows to the shared dashboard.

### Expected Output

A resumable local checkpoint, one-use Amazon unit ledger, exact profit rows, quarantined ambiguous rows, and idempotent Profit - 7 and Marketplace Profit History upserts after approval.

### Failure Recovery

- Pause at Safe Checkpoint before closing the worker tab.
- Resume recreates one worker tab if the old worker was closed.
- A missing SKU, missing purchase date, multiple matching Amazon orders, or differing costs cannot become an exact row.
- Never substitute EcomSniper markup, a product-page price, cart total, checkout total, or a different Amazon order.

### Evidence

v3.9.1 has 14 focused allocation and workflow contracts within a 217-test passing suite. Signed-in Profile 2 matched Poshmark order 6a49c5d84fab7b10343cc819 at $29.17 earnings to Amazon order 114-5900136-8324212, ASIN B07T88F8B2, and exact $19.96 item cost, producing $9.21 profit. The in-panel approval synced it once to row 32 in Profit - 7 and Marketplace Profit History, Apps Script receipt row 72 confirmed one upsert, the local checkpoint refreshed to Already synced 1, and the sync button disabled. Phone-readable proof: https://drive.google.com/file/d/1qJllE5jCt5pUE3JSNruWQsMjes7YqFNi/view?usp=drivesdk


<a id="tasks-automation"></a>
## Tasks Reminders and Auto-Completion

**Matrix:** F-10, T-04, T-05, T-06

**Evidence status:** LIVE PASS

**Purpose:** Keep task order safe, show stale warnings, and check only exact proven workflow completions.

### Prerequisites

- The shared Tasks sheet retains its task labels and computer headers.

### Exact Steps

1. Run the read-only schema audit after changing task labels or computer headers.
2. Require every header and target label to match exactly once before a Tasks write.
3. Review daily stale warnings after more than three days.
4. Review NEED TO SNIPE after more than five days since the latest computer timestamp.
5. Review the Subscribe & Save reminder beginning one day before month end.
6. Allow only seller metrics, listing limits, Mark as Shipped, and exact zero-remaining Move .99 proof to auto-check their allowlisted rows.
7. Keep the second-round row manual.

### Approval Stop

No Tasks checkbox may stand in for marketplace approval. Review-ready or partial states cannot auto-check completion.

### Expected Output

Label-based warnings and idempotent, computer-specific checkbox updates.

### Failure Recovery

- A missing or duplicate task label/header must stop the write until the schema is corrected.
- Row moves are safe only because integrations locate unique task labels.
- Poshmark-only cells remain grey.
- Reverse cleanup, EcomSniper handoffs, sniping, and second-round tasks never auto-check.

### Evidence

Production schema audit, threshold, stale reminder, layout, allowlist, temporary-sheet cleanup, and exact computer-column proofs are live-passed. F-10 proof: https://drive.google.com/file/d/1LL8bus-SnrpPITUglPoX6K2uFi8Bz4uB/view?usp=drivesdk


<a id="diagnostics"></a>
## Diagnostics, Backup, and Interface Settings

**Matrix:** F-11, F-12, U-02

**Evidence status:** PARTIAL

**Purpose:** Capture failures before resetting and preserve per-profile settings across updates.

### Prerequisites

- The popup can open.

### Exact Steps

1. Use Settings to choose theme and transparency.
2. Click Copy Settings Backup before updates or profile moves.
3. Use Status to run Feature Health Check.
4. After a failure, click Copy Full Diagnostic Report before Reset.
5. Use Copy Error Log for a shorter page-error report.
6. Clear Error Log only after the issue is captured.
7. Restore settings from the copied backup and verify identity and categories.

### Approval Stop

Diagnostics and settings must not trigger marketplace actions.

### Expected Output

Health report, error log, diagnostic report, and restorable settings backup.

### Failure Recovery

- Do not clear evidence before copying it.
- F-11 controlled error storage and export are live-proven in Profile 2.
- U-02 installed-popup tab persistence still needs manual confirmation.

### Evidence

Health diagnostics and the exact controlled error-log storage/export path are live-proven in Profile 2. Popup behavior and visuals are contract-proven; U-02 installed-popup tab persistence remains pending.


<a id="onboarding-interface"></a>
## Feature Tour, Themes, and Universal Access

**Matrix:** U-01, U-02, U-03

**Evidence status:** PARTIAL

**Purpose:** Teach every catalog feature, keep the panel readable, and expose safe global controls on ordinary webpages.

### Prerequisites

- GLDN Ops is loaded in the intended Chrome profile.
- The page is an ordinary http or https webpage; Chrome internal pages cannot run extension content scripts.

### Exact Steps

1. On first installation, use Next and Previous to review every feature, or click Skip for now.
2. Restart the tour from Start Feature Tour in the popup or the three-dot panel settings menu.
3. Open the full feature guide for exact recovery steps and evidence labels.
4. Choose a saved theme from Core, Limited Editions, or Retired Editions in Settings.
5. Use the three-swatch preview to confirm the selected window, surface, and accent palette.
6. Use each review window's 0%-100% transparency slider to reveal the webpage behind its shell, tables, fields, and controls.
7. Drag a review window by its title; double-click the title to reset its saved position.
8. Resize a review window from its lower-right corner and resize the floating panel from its handle.
9. Minimize or dock the panel to the right edge when it obstructs a webpage.
10. On unsupported sites, use only the safe global controls; marketplace actions appear only on their supported sites.

### Approval Stop

Theme, layout, tour, guide, dashboard, diagnostics, and stop controls perform no marketplace write. Marketplace approval boundaries remain unchanged.

### Expected Output

A skippable feature-by-feature tour, complete guide, 49 persisted themes, independently transparent, draggable and resizable review windows, seamless scrollbars, and a safe panel on ordinary webpages.

### Failure Recovery

- Use Reset panel layout if a saved panel size or position is awkward.
- Reopen the tour from the popup after skipping it.
- Chrome pages such as chrome://extensions cannot display the webpage panel; use the toolbar popup there.
- If a supported marketplace shows only global controls, reload that tab once after reloading the extension.

### Evidence

v3.8.2 proved all 49 theme options in signed-in Profile 2. v3.8.3 proved independent Poshmark and eBay review-window opacity, translucent inner surfaces, dragging, and saved position. v3.8.4 proved Poshmark Stats at true 0%: modal shell, inner table, theme pattern, and page backdrop all reached zero alpha while the everyday panel remained at 65%; 0% persisted after reopen; live money rows displayed $33,642.00 and $94,165.15; large counts used separators; and a clean repeat produced no new warnings or errors. The review was restored to 65% and closed without Save, with zero marketplace actions. Evidence: evidence/profile2-modal-opacity-currency-v384-2026-07-23/.


<a id="walmart"></a>
## Walmart Order Helper

**Matrix:** U-04

**Evidence status:** IMPLEMENTED, UNPROVEN

**Purpose:** Carry encoded order details into Walmart cart/checkout while preserving a manual final purchase.

### Prerequisites

- A Walmart link contains the intended auto-order details from a reviewed eBay handoff.

### Exact Steps

1. Open the encoded Walmart product link.
2. Confirm GLDN Ops removes customer data from the address bar after storing it locally.
3. Review the product and quantity.
4. Use Add / Checkout only on safe cart controls.
5. Use Fill Delivery Info at checkout.
6. Review customer, item, shipping, total, and payment values manually.

### Approval Stop

GLDN Ops must never click Place order or another final purchase control.

### Expected Output

A prepared Walmart checkout with no purchase submitted.

### Failure Recovery

- Stop if the item, quantity, address, price, shipping, or payment differs.
- This feature has syntax and package coverage only and must be treated as unproven until a dedicated gate.

### Evidence

Implemented and packaged, but no current signed-in live proof exists.
