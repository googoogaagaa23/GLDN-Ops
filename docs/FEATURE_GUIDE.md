# GLDN Ops Feature Guide

Generated from `docs/GUIDE_CATALOG.json` for GLDN Ops v3.12.29. Do not edit the generated Markdown or extension HTML directly.

GLDN Ops assists marketplace workflows. It does not replace eBay, Amazon, Poshmark, Walmart, EcomSniper, or the shared Tasks sheet.

> **Safety rule:** Final marketplace actions require explicit action-time approval. GLDN Ops must stop before eBay Continue, eBay Save, final listing Submit, purchase, or any equivalent irreversible action unless the operator approves that exact action.

## Evidence Labels

- **LIVE PASS:** Current signed-in evidence and exact readback prove the documented result.
- **LIVE PASS WITH BOUNDARY:** The documented result passed live, but a named external or manual boundary remains.
- **PENDING USER REVIEW:** Recorded evidence exists, but the user has not accepted the gate.
- **PARTIAL:** Only the stated portion is proven. Do not assume the entire workflow works.
- **IMPLEMENTED, UNPROVEN:** Code exists, but no valid current live proof exists.
- **IMPLEMENTED, LIVE REVIEW PENDING:** The implementation and deterministic data checks pass, but the current signed-in marketplace review still needs to be reached.

## Feature Index

- [First-Time Setup](#setup) - **PARTIAL**
- [Floating Panel](#panel) - **LIVE PASS**
- [Dashboard and Sync Queue](#dashboard) - **PARTIAL**
- [Local Update and Rollback](#deployment) - **PARTIAL**
- [Mark as Shipped](#mark-shipped) - **PARTIAL**
- [eBay Order Note and Profit](#ebay-note-profit) - **LIVE PASS**
- [eBay Profit Audit](#ebay-monthly-profit) - **PARTIAL LIVE**
- [Order Placement Audit](#order-placement-audit) - **PARTIAL LIVE**
- [Seller Level and Tasks Metrics](#seller-metrics) - **LIVE PASS**
- [Confirm Listings Under Limit](#listing-limits) - **LIVE PASS**
- [Cancel Amazon Subscribe & Save](#amazon-subscribe-save) - **LIVE PASS**
- [eBay Sales Snapshot](#ebay-snapshot) - **LIVE PASS**
- [Store Category Configuration](#store-categories) - **LIVE PASS**
- [Move .99 Listings Into Sale](#move99) - **LIVE PASS WITH BOUNDARY**
- [Move Non-.99 Listings Out of Sale](#reverse99) - **IMPLEMENTED, UNPROVEN**
- [Find and End Variation Listings](#ebay-variations) - **IMPLEMENTED, LIVE REVIEW PENDING**
- [Existing Listings Policy Audit](#existing-listings-policy-audit) - **IMPLEMENTED, LIVE REVIEW PENDING**
- [Move Category Recovery](#move99-recovery) - **LIVE PASS**
- [EcomSniper Handoffs and Status](#ecomsniper-handoffs) - **LIVE PASS**
- [Product Research Desk and Listing Preflight](#listing-preflight) - **LIVE PASS WITH BOUNDARY**
- [Product Hunter Active Listing Guard](#product-hunter-listing-guard) - **IMPLEMENTED, LIVE REVIEW PENDING**
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

1. On an eBay Order Details page, use the always-available panel for Prepare Order Note and daily actions.
2. On eBay Listings pages, start a workflow or press Ctrl+Shift+G before expecting the panel; it stays hidden otherwise.
3. Use Side to dock the panel to the right edge.
4. Use the minus control to minimize it.
5. Drag the resize handle while expanded.
6. Open the three-dot settings menu to change theme, transparency, or reset layout.
7. Use Stop Task for a safe checkpoint and Reset only for abandoned state.
8. Use Reload Ext after local files are updated.

### Approval Stop

Panel layout actions require no marketplace approval.

### Expected Output

A saved per-profile panel mode, size, position, theme, and transparency.

### Failure Recovery

- Use Reset panel layout if the panel is off-screen or awkwardly sized.
- Use Reload Ext when page controls are stale after an update.
- If eBay navigates without a full reload, GLDN Ops re-evaluates whether the panel belongs on the new page.

### Evidence

Profile 2 proved Graphite at 75%, persisted resize, normal reload persistence, and right-edge docking. v3.11.46 adds contract coverage for always-visible eBay order details and workflow-gated Listings pages.


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

**Evidence status:** PARTIAL

**Purpose:** Select every awaiting order, pause before activating eBay, stop again at eBay's final confirmation, and sync only an exact completion count.

### Prerequisites

- The signed-in eBay Awaiting shipment page is open.
- The complete Results total is visible.

### Exact Steps

1. Click Mark as Shipped.
2. Wait while GLDN Ops verifies every visible row, the master checkbox, and the awaiting total.
3. Review GLDN's exact selected count and approve only the activation of eBay's Mark as shipped action.
4. Review eBay's own confirmation count.
5. Approve eBay's final confirmation button only when the selected count equals the intended awaiting total.
6. After approval, wait for eBay success and zero remaining results.
7. Confirm the dashboard and matching Tasks checkbox update.

### Approval Stop

STOP before activating eBay and STOP again at eBay's final confirmation. Each action requires explicit approval for the exact count shown.

### Expected Output

Exact awaiting, selected, shipped, remaining, status, dashboard history, and Tasks completion.

### Failure Recovery

- If eBay omits a confirmation number, GLDN Ops may reuse only the exact pre-confirm count.
- Any count mismatch stops safely.
- The first approved eBay Mark as shipped activation uses one trusted, hit-tested Chrome press/release; it never retries or clicks a second target.
- The Profile 2 local control may activate an already-open GLDN review only with the exact live-count token. A separate APPROVE EBAY CONTINUE N token is required for one trusted press/release on eBay's exact reviewed final button.
- A stale, duplicate, wrong-tab, wrong-page, changed-count, changed-label, ambiguous target, or failed hit-test request stops without another click.
- Updating to a new extension version clears an unfinished Mark as Shipped run from the older extension context.
- Copy diagnostics before Reset if the confirmation remains stale.

### Evidence

Profile 2 previously completed 3 of 3 orders and read back zero remaining plus exact dashboard and Tasks rows. Computer 2 / FANCYFI on v3.11.33 verified 4 of 4 selections but exposed that the synthetic first activation did not open eBay's confirmation. v3.11.34 replaces that activation with one trusted exact-count, exact-tab, exact-page, hit-tested press/release and passes the complete 309-test JavaScript suite. A signed-in Computer 2 completion and dashboard/Tasks readback remain required.


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
3. Click Copy Amazon Info; GLDN Ops saves the reviewed handoff even when browser clipboard access is blocked.
4. Open the matching eBay order and click Prepare Order Note.
5. Confirm the decoded ASIN exactly matches the saved Amazon evidence.
6. Click Fill Add Note Box or Fill Edit Note Box.
7. Review the real eBay textarea and approve Save only when the note is correct.
8. After eBay visibly saves, confirm one dashboard profit row.

### Approval Stop

STOP at eBay Save. Saving the note requires explicit action-time approval.

### Expected Output

Saved eBay note plus one upserted profit row with supplier order, ASIN, cost, profit, and margin evidence.

### Failure Recovery

- Checkout, product-page, stale, wrong-order, or mismatched-ASIN evidence must fail closed.
- If no reviewed Amazon handoff is ready, use the visible recovery window to open Amazon Orders and review the exact order.
- Do not sync profit before eBay Save.
- An already matching saved note may refresh the same row without another Save.

### Evidence

Profile 2 matched an exact Amazon order and ASIN, filled the real eBay note, and later read back one deduplicated profit row. v3.12.16 adds saved-handoff fallback and visible failure recovery coverage.


<a id="ebay-monthly-profit"></a>
## eBay Profit Audit

**Matrix:** E-14

**Evidence status:** PARTIAL LIVE

**Purpose:** Read one eBay order month or all available history, calculate Saved-note profit from the note alone, and separately calculate Independent Amazon profit from visible eBay earnings plus exact Amazon order-item costs.

### Prerequisites

- Use the Chrome profile already signed into the intended eBay account for order collection.
- The saved computer identity must map to that eBay account.
- Set one permanent Amazon profile name in Setup in every Chrome profile used for cost reconciliation.
- Orders count as saved-note exact only when their existing eBay note follows earnings - Amazon cost - Amazon profile - ETA, or an ambiguous amount has been explicitly confirmed inside GLDN Ops.

### Exact Steps

1. Open Workflows in the eBay Chrome profile and click Open eBay Profit Audit.
2. Choose One month for a smaller audit or All available history for the full available eBay history range.
3. For One month, choose the calendar month and click Read Month. For all history, click Read All History.
4. Let the one inactive signed-in eBay worker index the selected range and open each exact order detail.
5. Read Saved-note profit separately: saved-note earnings minus saved-note Amazon cost.
6. Use the coverage count to see how many reviewed orders are included. Pending means no confirmed saved-note profit exists; a dollar result with incomplete coverage is a partial total.
7. Review Independent Amazon profit separately after sync: visible eBay earnings minus an exact matched Amazon order-item cost.
8. Allow GLDN Ops to normalize harmless money formatting mistakes. When it flags an ambiguous character, likely missing decimal, or earnings mismatch, edit the suggested values and click Confirm note amounts.
9. Keep missing notes, unconfirmed ambiguous amounts, missing earnings, and date mismatches outside confirmed saved-note totals.
10. Type the displayed APPROVE SYNC EBAY YYYY-MM N token for a month or APPROVE SYNC EBAY ALL N for all history only after reviewing the exact unsynced row count.
11. Confirm dashboard delivery or a retained retry queue, then read back the computer profit sheet.
12. In an Amazon Chrome profile, verify its permanent Amazon profile name in Setup and click Resolve eBay Amazon Costs for the corresponding unresolved rows.
13. Review the exact supplier profile, exact matches, misses, and live pending count. Click Save Cost Resolution Results once; GLDN Ops binds that explicit action to the unchanged live count.
14. Wait for the visible Results Saved or Results Queued Safely receipt before leaving the page.
15. Move to each other signed-in Amazon Chrome profile and repeat. Rows already attempted by that named profile are excluded; unresolved rows remain open without becoming zero.
16. Compare Saved-note profit and Independent Amazon profit in the shared reconciliation sheet. Missing SKU and substituted-item cases remain manual review.

### Approval Stop

STOP at both reviews. The eBay write requires APPROVE SYNC EBAY YYYY-MM N for a month or APPROVE SYNC EBAY ALL N for all history. Each independent Amazon-profile result requires APPROVE RESOLVE EBAY COSTS N. Neither approval changes an eBay order, listing, or Amazon order.

### Expected Output

A resumable selected-range checkpoint; visibly covered Saved-note earnings, cost, and profit; separate Independent Amazon earnings, cost, and profit; discrepancy status; attempted supplier profiles; and a durable unresolved queue.

### Failure Recovery

- A deliberate Pause closes only the worker tab and preserves the exact checkpoint.
- A page-verification failure leaves the exact failed eBay tab open and changes the run to Paused with the real reason.
- Resume reuses a preserved failed worker or recreates one inactive worker when the old tab no longer exists.
- The final eBay page remains open at review and closes only after the selected range is fully synced or explicitly reset.
- An extension update pauses an in-progress run instead of mixing versions.
- Never guess a missing Amazon cost or substitute a current product price.
- Deterministic note formatting cleanup may be automatic, but uncertain dollar values require editable operator confirmation before entering confirmed totals.
- Confirming note amounts changes only GLDN Ops internal evidence and never edits the saved eBay note.
- Do not rename an Amazon profile after it has recorded attempts; use the same permanent label on that Chrome profile.
- The eBay Profit Audit page can correctly say No saved run in an Amazon-only Chrome profile; the eBay checkpoint remains local to the eBay Chrome profile and Amazon reconciliation receipts are written to the shared sheet.
- Copy diagnostics if eBay or Amazon changes its order-row, period control, Custom date range, or order-detail layout.

### Evidence

The signed-in July 2026 eBay month and approved Amazon-profile reconciliations remain historical live evidence. v3.12.24 adds deterministic all-history range, year-rollover, per-order month preservation, clear coverage, Pending-state, and partial-profit contracts. A signed-in all-history live run remains pending.


<a id="order-placement-audit"></a>
## Order Placement Audit

**Matrix:** E-13

**Evidence status:** PARTIAL LIVE

**Purpose:** Compare unit-level eBay demand with exact ASIN purchases found across every signed-in Amazon Chrome profile, then flag duplicate, extra, canceled-order, and missing purchases without changing either marketplace.

### Prerequisites

- Finish the Monthly eBay Profit read for the same computer, eBay account, and month so exact order numbers, dates, ASINs, quantities, statuses, and ship-to evidence are available.
- Set one permanent Amazon profile name in Setup in every Chrome profile used to place orders.
- List every expected Amazon profile name on the audit page so cross-profile completion can be proven.
- The shared dashboard connection must work in every participating Chrome profile.

### Exact Steps

1. Open Order Placement Audit from the eBay Chrome profile.
2. Choose the computer and eBay order month, enter every Amazon profile expected on that computer, and click Build From Completed eBay Month.
3. Review the exact eBay unit count. Rebuilding this demand deliberately clears prior Amazon scans for that computer, account, and month.
4. Open GLDN Ops in the first signed-in Amazon Chrome profile, open Order Placement Audit, choose the same computer and month, and click Scan This Signed-In Amazon Profile.
5. Let the one inactive Amazon worker index order history and read only matching exact-ASIN order details.
6. Wait until that profile shows review/completed and appears as scanned in Profile coverage.
7. Repeat the same scan from every other signed-in Amazon Chrome profile used on that computer. The shared audit deduplicates an Amazon order that is visible in more than one Chrome profile.
8. Review Duplicate, same recipient first; then Possible extra purchase, Purchased after cancel, and Missing Amazon purchase.
9. Use the exact eBay and Amazon links to verify any flagged unit, and download the CSV for a retained audit copy.

### Approval Stop

None. This workflow is read-only. It never cancels, refunds, marks shipped, purchases, edits, or deletes an eBay or Amazon order. Any corrective marketplace action must be handled separately with its own exact approval.

### Expected Output

A shared computer/account/month audit with expected eBay units, Amazon purchase units, scanned-profile coverage, exact same-recipient duplicates, possible different-recipient extras, canceled-order purchases, unmatched demand, source links, and CSV export.

### Failure Recovery

- Pause stops at the next Amazon page checkpoint; Resume continues the saved profile scan.
- If the inactive worker closes or a page cannot be verified, the checkpoint remains resumable in that same signed-in Chrome profile.
- Reset This Profile Scan clears only that Chrome profile's local checkpoint; completed shared results from other profiles remain saved.
- Save Profile List updates the expected-profile checklist without erasing completed scans.
- Do not call a different-recipient purchase an exact duplicate unless total Amazon units exceed total eBay demand for the ASIN.
- A canceled eBay order with no Amazon purchase is clean; a matched purchase for a canceled or refunded order is flagged.
- Missing Amazon purchase remains open until all expected Amazon profiles have been scanned.

### Evidence

Deterministic unit-allocation tests cover exact matches, same-recipient duplicates, different-recipient extras, two legitimate customers sharing one ASIN, quantities, canceled orders, active-before-canceled allocation, missing purchases, and cross-profile deduplication. Signed-in Profile 2 seeded 101 July 2026 eBay units, preserved all 101 through an extension reload, and scanned 10 Amazon order-history pages for profile F9132 across 83 exact ASIN targets. That profile returned zero matching purchases; one exact target ASIN was also visibly searched in the signed-in Amazon account and returned no result. The remaining Amazon profiles have not been scanned, so the complete cross-profile audit is not LIVE PASS.


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

**Purpose:** Evaluate Store insertion allowance, seller quantity, and seller dollar limits independently, preserving near-limit warnings without confusing them with a reached hard cap.

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
- A 95% warning may remain visible while Under limit is still YES.
- Missing Store allowance or seller-dollar data cannot check the task.
- Reopen Seller Hub Overview if a card is incomplete.

### Evidence

Production dashboard @38 separates near-limit warnings from hard-cap completion. The focused v3.11.29 contract passes 7/7 and the complete release gate passes 269/269. Signed-in Profile 2 retained the 98.79% warning while Tasks H20 checked with Under limit: YES; Sync Receipts row 84 confirms taskChecked true.


<a id="amazon-subscribe-save"></a>
## Cancel Amazon Subscribe & Save

**Matrix:** A-01

**Evidence status:** LIVE PASS

**Purpose:** Scan only real active subscriptions for the current signed-in Amazon Chrome profile, including additional carousel cards and distinct duplicate products; exclude recommendations, require exact-count approval, cancel the reviewed set one at a time, and prove zero remain.

### Prerequisites

- The intended Amazon account is signed in in this Chrome profile.
- The correct Tasks computer identity is saved.
- Repeat the workflow separately in every Chrome profile that uses a different Amazon account.

### Exact Steps

1. Open the popup and click Open Amazon Subscribe & Save.
2. Let GLDN Ops open Manage Your Subscriptions and settle the complete page.
3. On Amazon's newer layout, confirm All addresses is the selected scope; on the older layout, confirm the active-subscription total.
4. Review the exact list under Your Subscriptions. Additional carousel cards and separate subscriptions for the same product remain separate. Recommended for you, Subscribe now, Add new subscriptions, and Buy it again are excluded.
5. Type the exact count-bound token shown only when every reviewed item should be cancelled.
6. After approval, GLDN Ops opens each reviewed subscription, clicks Cancel subscription, verifies Amazon's Cancel your subscription? dialog, leaves the optional reason unchanged, and uses Cancel my subscription once.
7. Wait for Cancellation Confirmed after each item.
8. Let GLDN Ops return to the manager and run a final zero-active scan.
9. Confirm the current-profile proof in Amazon Subscribe Save History.
10. Repeat in every other signed-in Amazon Chrome profile. A current-profile proof does not check the ALL Amazon Accounts task.

### Approval Stop

STOP before any cancellation. The exact token APPROVE CANCEL SUBSCRIPTIONS N authorizes only the unchanged reviewed set of N subscriptions; no Amazon cancellation control is clicked before that token is accepted.

### Expected Output

Exact scanned and cancelled counts, per-profile scope, zero-active proof, local result, and one shared current-profile audit row. The all-accounts Tasks checkbox remains separate.

### Failure Recovery

- If Amazon shows sign-in, CAPTCHA, a different count, an unloaded card, or an unknown final result, GLDN Ops stops without retrying the irreversible click.
- Never treat Recommended for you or Subscribe now cards as subscriptions.
- A zero result in one Amazon profile does not prove another Chrome profile/account is clear and cannot check the ALL Amazon Accounts task.
- Copy diagnostics before Reset when a final cancellation result is uncertain.

### Evidence

The updated V2 tutorial was reviewed end to end. It confirms the exact Your Subscriptions > subscription details > Cancel subscription > Cancel your subscription? > Cancel my subscription > Cancellation Confirmed sequence, optional reason behavior, carousel cards, duplicate-looking subscriptions, recommendation exclusion, and separate Chrome-profile repetition. Signed-in Profile 2 has live-proven the zero-active current-profile path; a nonzero destructive run still requires a fresh exact-count approval.


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
8. After the approved final eBay Submit, let the workflow stop while eBay propagates the category changes.
9. Start a later deliberate run for any saved remaining batches only after eBay has finished updating listings.

### Approval Stop

STOP before every eBay Submit. Each exact batch requires separate action-time approval.

### Expected Output

The exact submitted batch, propagation-pending status, saved remaining-batch count, and audit data. Tasks completion still requires a later exact zero-remaining and zero-failed proof.

### Failure Recovery

- Any incomplete scan, mixed price, selected-count mismatch, missing picker, or uncertain submit result stops safely without opening another tab or batch.
- A completed Submit is terminal for that run: GLDN Ops must not reopen Active Listings, rescan, or create another workspace while eBay propagates changes.
- If the review page disappears before a trusted Submit click, the run enters Approval Lost and requires manual reconciliation.
- Do not alter item specifics to force category failures through.
- Six known FAK12 failures remain backburnered and must not be resubmitted without new approval.

### Evidence

Profile 2 moved 2,564 successful exact .99 listings in earlier approved batches and isolated six persistent backburner failures. The v3.10.4 read-only retest scanned 232 listings over two pages, staged 5 exact matches, and held the same Submit (5) workspace through extension reload and repeated approval checks with no new tab; Submit remained untouched. Formal Drive video is pending.


<a id="reverse99"></a>
## Move Non-.99 Listings Out of Sale

**Matrix:** E-09

**Evidence status:** IMPLEMENTED, UNPROVEN

**Purpose:** Require the sale event to be off, then find valid non-.99 prices in the sale category and return them to the configured non-sale category.

### Prerequisites

- The sale and non-sale categories are configured for the signed-in account.
- The sale event is turned off before scanning displayed prices.
- Backburner exclusions are current.

### Exact Steps

1. Open Workflows and click Move Non-.99 Out of Sale.
2. Answer whether the sale event is active.
3. If Sale Event Is ON, stop and turn the sale event off; GLDN Ops must not start a scan.
4. Choose Sale Event Is OFF only after confirming it is off.
5. Review the complete sale-category scan summary.
6. Confirm every selected listing has a valid non-.99 price.
7. Confirm backburner items are excluded.
8. Verify only Primary Store category changes to the configured non-sale destination.
9. Approve the exact final Submit.
10. Let the workflow stop while eBay propagates the category changes.
11. Start a later deliberate run for any saved remainder only after eBay has finished updating listings.

### Approval Stop

STOP before every eBay Submit and approve only the exact reviewed count.

### Expected Output

The exact submitted batch, propagation-pending status, saved remaining-batch count, and audit data.

### Failure Recovery

- Sale Event Is ON, a closed prompt, or an unconfirmed answer blocks before workflow reservation, tab creation, or scanning.
- Missing or ambiguous prices are excluded.
- A completed Submit is terminal for that run and cannot automatically rescan or create another workspace.
- Any uncertain pre-submit state returns to read-only reconciliation.
- Do not use the reverse workflow on Poshmark.

### Evidence

v3.11.30 adds the fail-closed sale-event gate to the popup, internal starter, eBay panel, background launcher, and saved-state runner. Automated contracts prove only an explicit Sale Event Is OFF answer can start the reverse workflow. The live ON-path block is the required signed-in gate; the OFF-path scan must wait until the sale event is actually off.


<a id="ebay-variations"></a>
## Find and End Variation Listings

**Matrix:** E-11

**Evidence status:** IMPLEMENTED, LIVE REVIEW PENDING

**Purpose:** Scan every eBay Active Listings page automatically, use eBay's signed-in read-only End review to identify exact variation parents, and prepare durable approval-gated End batches.

### Prerequisites

- The intended eBay account is signed in in this Chrome profile.
- No other GLDN Ops workflow or variation review is active.
- Keep the Variation Listings extension page open while the account-wide scan runs.

### Exact Steps

1. Open Workflows and click Find / End Variation Listings.
2. Click Scan & Prepare Review; no report download or CSV import is required.
3. GLDN Ops opens one inactive signed-in eBay tab and verifies every 200-row Active Listings page by exact item number.
4. GLDN Ops checks exact IDs through eBay's read-only End review in batches of at most 200 and keeps only listings eBay identifies as true variation parents.
5. Review the searchable variation-parent table and download the audit CSV if a permanent copy is needed.
6. GLDN Ops automatically prepares the first exact batch of at most 200 parent listings and opens eBay's visible Bulk Edit review.
7. Inspect every visible eBay row and return to Variation Listings.
8. Type APPROVE END VARIATIONS N only after the exact batch count and rows are correct.
9. Wait for eBay's exact success and failure counts. Successful IDs become Ended, disappear from the remaining set, and the next review is prepared automatically.
10. Give a new exact approval for every remaining batch. After the final result, run Scan & Prepare Review again for a fresh zero-variation verification.

### Approval Stop

STOP before every eBay End action. The exact token APPROVE END VARIATIONS N must match the current verified batch and eBay's displayed count; preparing or viewing a review is never approval.

### Expected Output

An automated account-wide exact-ID scan, searchable variation-parent audit, exportable CSV, exact eBay review batches, durable completion ledger, exact approval receipts, and remaining count.

### Failure Recovery

- A missing page range, incomplete row count, duplicate item number, changing Active Listings total, browser check, or classification mismatch stops with no listing changes.
- Every active listing must be accounted for before any variation parent is accepted.
- No more than 200 parent listings can enter one End review.
- A missing or mismatched eBay count blocks approval.
- An unfinished exact review can be reopened from the Variation Listings page.
- GLDN Ops may prepare the next review after a proven successful result, but it never ends that batch without a new exact approval token.

### Evidence

The exact ending path is already live-proven in signed-in Profile 2 across 736 parents: eBay reported 200 already ended, then 200 of 200, 200 of 200, and 136 of 136 successful with zero failures. v3.11.48 replaces manual report generation and import with an automated complete-page scan, eBay-confirmed variation classification, and a Profile 2 launch path that stops at the same exact approval review. Current-version signed-in read-only review proof is required before release.


<a id="existing-listings-policy-audit"></a>
## Existing Listings Policy Audit

**Matrix:** E-12

**Evidence status:** IMPLEMENTED, LIVE REVIEW PENDING

**Purpose:** Read every active eBay listing, classify it with the current policy and generic/IP risk profile, and make no marketplace changes.

### Prerequisites

- The intended eBay account is signed in in this Chrome profile and its computer identity is saved.
- No other GLDN Ops scan or marketplace review is active.
- The shared reviewed Listing Preflight rule pack is present.

### Exact Steps

1. Open Workflows, choose Listings, and click Scan Existing Listings.
2. Click Start Fresh Complete Scan, or Resume Scan after a saved interruption.
3. GLDN Ops opens one quiet signed-in eBay tab and verifies every 200-row Active Listings page by exact item number.
4. Wait for Scanned to equal eBay's reported total; a partial or changing total cannot publish an audit.
5. Review Needs review and reviewed Block rows. An explicit official prohibition becomes Block for urgent human inspection; every otherwise unmatched title/SKU-only listing remains Needs review because authenticity, authorization, images, item specifics, safety, eligibility, and provenance are not proven.
6. Use search and filters, open an exact item for manual inspection, and download the full source-linked CSV audit if needed.
7. Do not treat Block as authorization to end an item and do not treat any no-match or generic-text result as eBay approval.

### Approval Stop

This audit is read-only. It exposes no listing selection, revision, relisting, or End control and grants no marketplace approval.

### Expected Output

A complete resumable exact-ID audit, source-linked classifications, and an exportable CSV without any eBay listing change.

### Failure Recovery

- A missing page range, incomplete row count, duplicate item number, changing total, browser check, or missing/invalid rule pack pauses or fails with no eBay listing change.
- Resume continues from the next unverified page; Start Fresh discards old local page checkpoints only after explicit operator action.
- A changed reviewed-rule pack changes the audit fingerprint and requires reclassification.
- If brand, image, category, item-specific, provenance, safety, eligibility, or authorization evidence is missing, keep the listing in Needs review.

### Evidence

v3.12.29 deterministic contracts prove full-count reconciliation, source-linked classification, fail-closed title-only Review, source/profile fingerprinting, CSV export, and audit-only UI guards. The page cannot prepare or submit an End request. The prior signed-in Profile 2 scan verified all 7,294 Active Listings; a fresh read-only scan remains the current live gate.


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

**Evidence status:** LIVE PASS

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

Profile 2 previously reconciled seller extraction from 892 to 1,607. Signed-in Profile 2 then live-proved the exact Competitor Scanner and Product Hunter routes, open-state readback, lifecycle-only scope, and Stop closing only the GLDN-opened Product Hunter tab. GLDN made no private-processing claim and performed zero marketplace actions.


<a id="listing-preflight"></a>
## Product Research Desk and Listing Preflight

**Matrix:** C-05

**Evidence status:** LIVE PASS WITH BOUNDARY

**Purpose:** Use a versioned set of lower-risk Product Hunter starting words, then check resulting Amazon links against reviewed official eBay policy plus source-linked Discord and Telegram research without using an eBay API.

### Prerequisites

- Open Product Research Desk from GLDN Ops.
- Use signed-in Chrome Profile 2 only when refreshing Discord or Telegram research; ordinary operators use the published output without opening community chats.
- Do not use a bot, user token, self-bot, or hidden account access.

### Exact Steps

1. Open Product Research Desk and review the complete official eBay policy coverage separately from Profile 2 Discord and Telegram community coverage.
2. Choose from the exact 500 versioned generic starting phrases. Unknown or branded seeds cannot start the guarded standalone GLDN Product Hunter.
3. Open the standalone GLDN Product Hunter, scan the complete eBay Active Listings inventory, then run the selected words. It reads each live Amazon product page and applies the shared policy pack before producing Ready links.
4. Use the manual GLDN Listing Preflight only for structured product-detail exports containing the product name and evidence. A bare Amazon URL or ASIN remains Needs review and is never approved from its address alone.
5. Review Ready, Needs review, Blocked, Excluded, and Incomplete results. Unknown brands, models, IP cues, conditional-policy items, and incomplete evidence stay Needs review.
6. Copy only Ready links into Bulk Poster. Review, Blocked, duplicate, already-listed, and incomplete rows remain excluded.
7. Perform final human review of the exact title, brand, model, images, packaging, provenance, recall status, eligibility, shipping, and generated eBay listing.
8. For community research refreshes, use only signed-in Chrome Profile 2, preserve exact source URLs, and record unrelated or inconclusive findings as Ignore.
9. Exclude dropshipping-policy, fulfillment-source, and retail-arbitrage discussions.
10. Publish community decisions as Review only; a hard Block requires current, exact official eBay evidence.

### Approval Stop

Rule publication requires human-reviewed decisions. Product Research Desk and Listing Preflight are read-only and never authorize or submit an eBay listing.

### Expected Output

Exactly 500 selectable generic Product Hunter phrases, visible official/Discord/Telegram coverage, a downloadable versioned research output, a source-linked shared rule pack, and separate Ready, Review, and Block results.

### Failure Recovery

- If a Discord or Telegram source cannot be verified visibly in Profile 2, do not publish the rule.
- If the rule pack is empty or unavailable, every input stays in Needs review and no ready list is produced.
- A Ready result does not mean eBay permits the item.
- Do not add dropshipping-policy or fulfillment-source discussion to this research set.
- A community report may require Review but can never create a hard Block without official eBay evidence.

### Evidence

The 2026-08-30 refresh covers every one of the 70 official policy pages linked by the prohibited-and-restricted hub plus supplemental intellectual-property/VeRO guidance. The shared pack contains 578 reviewed rules: 576 official eBay rules and 2 Discord-backed Review warnings. The reviewed Telegram delivery-date signal remains Ignore. Exactly 500 generic phrases are published. Deterministic tests prove atomic fail-closed validation, Ready-only copying, brand/IP review gates, official-only Block authority, guarded Product Hunter seeds, and the read-only existing-listing audit.


<a id="product-hunter-listing-guard"></a>
## Product Hunter Active Listing Guard

**Matrix:** C-06

**Evidence status:** IMPLEMENTED, LIVE REVIEW PENDING

**Purpose:** Build a verified read-only index of one eBay computer's complete Active Listings inventory and prevent Product Hunter from returning products that are already active.

### Prerequisites

- Load the separate GLDN Product Hunter extension in the Chrome profile signed into the intended eBay account and Amazon.
- Choose one of the five eBay computers: M0, 2, 6, 0, or M1.

### Exact Steps

1. Open GLDN Product Hunter and select Open Product Hunter.
2. Choose the eBay computer for this signed-in Chrome profile.
3. Click Scan Active Listings and leave the inactive eBay worker tab available until every 200-row page and the final count are verified.
4. If eBay live scanning is unavailable, download its current All active listings CSV and choose Import Active Listings CSV.
5. Confirm the indexed listing count, decoded ASIN count, account label, and Last verified time.
6. Leave Exclude products already active on eBay enabled and start the Amazon hunt.
7. Review Excluded rows for exact active SKU/ASIN matches and Review rows for exact normalized-title matches.
8. Copy only Ready links and continue through EcomSniper manually.

### Approval Stop

The guard never edits eBay and requires no marketplace approval. Any later EcomSniper listing action retains its own explicit approval boundary.

### Expected Output

A computer-bound verified Active Listings index, duplicate decisions in the audit CSV, and a Ready-link set with known active duplicates removed.

### Failure Recovery

- A partial scan never replaces the prior verified index.
- If eBay displays a browser check, complete it in the saved worker tab and click Resume Scan.
- If the Active Listings total changes during scanning, stop and rerun after eBay settles.
- Protected hunts cannot start without a verified index for the selected computer unless the operator explicitly disables the guard.

### Evidence

The complete scanner, CSV import, exact SKU/ASIN exclusion, title-review, computer binding, permission boundary, and fail-closed behavior are deterministic-test proven. A current signed-in Profile 2 full scan remains the live gate.


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

**Purpose:** Index paginated Poshmark sales by range or calendar month, read each exact SKU-linked order, allocate exact Amazon purchase units once, and stage a review before any spreadsheet write.

### Prerequisites

- Use the Chrome profile already signed into both Poshmark and Amazon.
- The saved computer must be Poshmark-enabled.
- Set the Amazon profile label if supplier-profile reporting is required.

### Exact Steps

1. Open Workflows in the popup, or click Historical Profit Backfill on a Poshmark page, and choose Current sale, Pilot, New since last sync, Last 90 days, One month, or All sales.
2. For the initial history, use One month and enter YYYY-MM, such as 2026-04 for April 2026. Month-by-month is recommended; All sales is available for a deliberate full-history migration but creates a much larger review and recovery surface.
3. Start or Resume opens one reusable Profit Run Progress tab. Keep it open to see the current phase, current order or ASIN, exact and unresolved counts, errors, pause reason, and destination tab without interrupting the signed-in worker.
4. Let the single background worker switch Poshmark to Show 100 and index only the selected range or month.
5. Let the worker open each Poshmark sale detail and decode every EcomSniper SKU into an exact ASIN.
6. Let it search all matching Amazon order result pages and open each exact order detail in the same worker tab.
7. Review every row, including earnings, exact Amazon item cost, supplier order, unresolved reason, and attempted Amazon profile.
8. Approve the exact month and live row count before creating or updating the month tab; unresolved costs remain blank and enter the shared queue.
9. After a confirmed, non-queued sync, GLDN Ops opens or focuses the actual Poshmark profit workbook. Use the progress page workbook buttons at any time to inspect existing saved rows; unsynced work never appears there.
10. On another signed-in Amazon Chrome profile, use Resolve Missing Amazon Costs to retry open queue rows, then approve the exact resolution count.
11. Repeat each missing historical month once, then use New since last sync for ongoing additions. The dashboard totals the saved monthly tabs without rescanning completed sales.

### Approval Stop

STOP at the review. A month write requires APPROVE SYNC POSHMARK YYYY-MM N, and a cross-profile resolution requires APPROVE RESOLVE POSHMARK COSTS N.

### Expected Output

A resumable checkpoint, one-use Amazon unit ledger, a formatted month tab, exact profit rows, and a shared unresolved-cost queue that can be completed from another signed-in Amazon profile without duplicate sales.

### Failure Recovery

- Pause at Safe Checkpoint before closing the worker tab.
- If the popup closes, reopen the durable Profit Run Progress page; it reads the saved checkpoint and never starts a duplicate run.
- If a worker tab closes, becomes blank, or stops reporting progress, GLDN Ops pauses at the exact checkpoint instead of restarting or writing rows.
- A failed signed-in worker tab is preserved for inspection and Resume; deliberate Pause closes only the worker and retains progress.
- Missing or ambiguous Amazon costs remain blank rather than becoming zero.
- Use Resolve Missing Amazon Costs from another signed-in Amazon profile; every attempted profile is retained.
- Never substitute EcomSniper markup, a product-page price, cart total, checkout total, or a different Amazon order.

### Evidence

The original exact single-order path is live-proven in Profile 2. v3.11.35 added month filtering, formatted monthly output, unresolved-cost queuing, and cross-profile resolution. v3.11.36 through v3.11.41 hardened empty-page rejection, reload recovery, complete page loading, pagination, Show 100 selection, and review-time detail repair. Dashboard deployment @42 is live. The approved April 2026 run saved 317 unique reviewed orders: 260 exact Amazon costs and 57 unresolved costs retained blank and queued without duplicate sales. v3.11.42 aligns approval with every reviewed row, uses deterministic durable batches, and closes completed worker checkpoints. The approved May 2026 sheet already contains 386 reviewed orders and must not be restarted or duplicated. v3.12.27 adds closed, blank, and silent-worker recovery with a preserved signed-in failure tab and exact Resume checkpoint. v3.12.28 adds a durable live progress page and opens the real workbook only after a confirmed non-queued sync.


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
6. Allow only seller metrics, listing limits, Mark as Shipped, and exact zero-remaining Move .99 proof to auto-check directly.
7. Keep one Amazon Subscribe & Save proof per cleared Chrome profile; a single profile cannot check the ALL Amazon Accounts row.
8. Require explicit all-profile proof and the exact token APPROVE ALL AMAZON PROFILES N before that monthly row can be checked.
9. Keep the second-round row manual.

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
