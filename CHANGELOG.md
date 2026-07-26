# GLDN Ops Changelog

All notable extension releases should be recorded here before they are deployed to other computers.

## v3.10.5 - 2026-07-26

- Fixed GLDN themes partially forcing eBay Messages and Poshmark into dark mode.
- Marketplace pages no longer receive GLDN's generic `data-theme`, root `color-scheme`, or short theme variables.
- GLDN panels, modals, popup, onboarding, and guide pages retain their selected theme and local color scheme.
- Older leaked root settings are removed after the updated content script runs on a refreshed page.
- The complete automated suite passes `237/237`, including three host-theme isolation regressions.
- Signed-in Profile 2 confirmed the pre-fix leak on Poshmark: GLDN had applied `data-theme="dark"`, `data-gldn-theme="dark"`, and inline/computed `color-scheme: dark` to the marketplace root. No marketplace action was performed.

## v3.10.4 - 2026-07-26

- Fixed Move .99 final verification looping on the last filtered page when eBay retained a larger account-wide page count.
- A filtered result such as `201-232 of 232` now completes at page 2 even if another eBay page counter remains stale.
- Fixed unpacked-extension updates leaving an old eBay panel at `Ready`; invalidated tabs now stop timers and refresh themselves once into the current extension context.
- Centralized popup and internal Move .99 launchers in one atomic background operation that binds the exact new tab before navigating to eBay.
- Added eBay interruption detection, slower randomized navigation pacing, and a fail-closed stop when eBay displays a bot or challenge page.
- Hard-locked every final Move .99 review to its exact Chrome tab and workspace. The workflow records only a trusted operator click and advances only after an explicit eBay success/failure result.
- Removed the automatic verification/restart path when Submit disappears. An ambiguous review exit now stops as `approval-lost` without navigation, another workspace, or another batch.
- Removed privileged reload and Move .99 pages from public web-accessible resources and reduced marketplace background polling.
- Public release packages no longer embed the dashboard setup code. The code is saved once in each Chrome profile and survives extension updates.
- The complete automated suite passes `234/234`.
- Signed-in Profile 2 / computer `0` / FAK12 scanned `232` unique listings across two filtered pages, found `5` exact `.99` matches, staged only those five, and stopped at `Submit (5)`.
- After a fresh extension reload and same-tab page refresh, the exact review workspace and `Submit (5)` remained unchanged through repeated approval checks; the Chrome tab count stayed `3 -> 3` with no new or replaced tab. Submit remained untouched. Formal Drive-video evidence is still pending.

## v3.10.3 - 2026-07-26

- Computer `2` / `FANCYFI` now defaults Move .99 to source Store categories `SNI, SNIPO v2` and destination `DAILY`.
- Existing Computer `2` installations using the old generic `Not .99, Other -> Abra Cadabra .99` defaults migrate automatically; genuine custom settings remain untouched.
- Fixed **Move Non-.99 Out of Sale** saving its reversed sale-category ID over the account's forward Move .99 configuration.
- Reverse category discovery now stays inside the current reverse run and cannot corrupt the saved forward source categories, destination, or IDs.
- The complete automated suite passes `231/231`; M0 / CLICKNCARRY still requires a fresh `BALK -> BEST SELLERS` live scan and review proof before reverse cleanup returns to `LIVE PASS`.

## v3.10.2 - 2026-07-25

- Removed the misleading **Start Bulk Listing Workflow** control. GLDN Ops does not run EcomSniper Bulk Poster.
- Added an **EcomSniper Handoff Monitor** that reports only verified seller-extraction state and the lifecycle of tabs GLDN opened.
- Open, closed, stop-requested, and unknown states are explicit; an open or closed EcomSniper tab never counts as proof of processing or completion.
- **Stop GLDN Assist** stops only GLDN's extraction queue. EcomSniper private controls remain operator-controlled.
- Updated guides, onboarding, release checks, and the feature matrix to remove the false Bulk Listing capability claim.
- Replaced the silent IExpress installer with a visible Windows Setup launcher that shows progress and keeps the final result onscreen.
- Setup now stops only the existing GLDN updater before replacing the stable folder, then restarts it after installation.
- Added a persistent installer transcript at `%LOCALAPPDATA%\GLDN Ops Installer\latest.log` and reinstall coverage for the updater-lock failure.
- The complete release gate passes `228/228`.

## v3.10.1 - 2026-07-24

- Fixed the real Windows PowerShell 5.1 installer path rejecting GitHub's UTF-8 BOM in `latest.json`.
- Stable metadata is now written without a BOM, and the updater defensively strips one before JSON parsing.
- Added a regression contract for BOM-tolerant stable metadata.
- Supersedes the v3.10.0 installer, which correctly stopped before updater registration when metadata parsing failed.
- The complete release gate passes `227/227`, the updater transaction fixture passes, and the one-time installer fixture passes.
- The public Windows installer and public-package update/rollback round trip now pass with private configuration preserved.

## v3.10.0 - 2026-07-24

- Added a one-time, no-admin Windows updater for unpacked GLDN Ops installations.
- **Update & Reload** now downloads only the published stable release, verifies its SHA-256 checksum and manifest version, snapshots the current runtime, preserves private dashboard configuration and Chrome profile settings, installs transactionally, and reloads the extension.
- Added **Reload Current Files** for stale panels without downloading anything.
- Added in-extension rollback selection with ten retained local snapshots and a safety snapshot before every rollback.
- All Chrome profiles sharing `%LOCALAPPDATA%\GLDN Ops\extension` detect the changed disk version and reload once, with loop protection for profiles still pointed at an old ZIP folder.
- The updater starts hidden with Windows, listens only on `127.0.0.1`, accepts only fixed update/status/rollback operations, and never performs marketplace clicks.
- Added clean update, preserved-config, rollback, checksum-failure, loopback-agent, UI-wiring, and cross-profile reload contracts.
- The complete automated suite passes `227/227`; the destructive updater fixture also passes independently.

## v3.9.4 - 2026-07-24

- Fixed Move .99 stalling on M0 after eBay visibly applied `Categories (1)` and rendered the listings table.
- Ignores unrelated Seller Hub progress indicators that can remain visible outside the listings results.
- Derives the exact scan page count from the filtered Results total instead of eBay's occasionally stale account-wide Page counter.
- Accepts hyphen, en-dash, and em-dash variants in eBay's Results range.
- Learns and saves numeric Store category IDs after a successful named-category filter so later runs can use a direct verified URL.
- Preserves the exact-ID inventory scan and the approval stop before every eBay Submit.

## v3.9.3 - 2026-07-23

- Fixed Move .99 starting from the extension popup and internal launcher, where a newly created run was missing its extension-version stamp.
- The eBay content script no longer deletes that new run as stale and silently returns the floating panel to `Ready`.
- Move .99 now saves a unique run ID and the complete versioned pending state before opening the eBay Active Listings tab.
- Added regression coverage for both non-page launchers and the required save-before-open ordering.

## v3.9.2 - 2026-07-23

- Made the private dashboard connection automatic for every Chrome profile that loads the private GLDN Ops package.
- Seeds and repairs dashboard settings on extension install, Chrome startup, service-worker startup, popup open, and before every dashboard operation.
- Removed the dashboard code field and manual save/clear buttons from the popup; Status now reports automatic readiness and offers one repair control.
- Removed the installer's unnecessary setup-code prompt when the private package already contains its local configuration.
- Public source and public release bundles still exclude the private dashboard code.

## v3.9.1 - 2026-07-23

- Replaced the historical Poshmark profit sync's blocking browser confirmation with an in-panel two-step approval gate.
- Keeps the exact-only `SYNC_EXACT_POSHMARK_PROFITS` background token and never syncs ambiguous, missing, or unmatched rows.
- Returns the updated backfill checkpoint after dashboard handling and refreshes the review so `Already synced` and the disabled sync button reflect the saved state immediately.
- Preserves idempotent profit-sheet upserts: an existing platform/computer/order row is updated in place instead of duplicated.
- The complete automated suite passes `217/217`.
- Signed-in Profile 2 live sync passed: Apps Script receipt row `72` confirmed one upsert, both profit tabs retained one exact row at row `32`, and the review refreshed to `Already synced 1`.

## v3.9.0 - 2026-07-23

- Added a resumable historical Poshmark profit backfill with current-sale, Pilot 10, incremental, last-90-day, and all-sales scopes.
- Indexes Poshmark sales across pages, opens each exact sale detail, and decodes its EcomSniper-linked SKU into an ASIN.
- Searches signed-in Amazon Orders, opens exact order details, and uses only exact ASIN item-row costs.
- Allocates each Amazon purchase unit to at most one Poshmark sale; ambiguous, missing-SKU, out-of-window, and not-found rows remain quarantined.
- Saves a local checkpoint after every page and order, uses only one worker tab, and can resume after that worker tab is closed.
- Stops at a readable historical-profit review. Dashboard sync requires a separate explicit confirmation and includes exact rows only.
- Added popup controls and generated guide/onboarding documentation for the new workflow.
- Added matching Start, Resume/Open Review, and Pause controls to the visible Poshmark panel so the workflow does not depend on opening an extension-internal popup page.
- Automated verification passes `217/217`, including 14 focused historical-backfill contracts.
- Signed-in Profile 2 matched Poshmark order `6a49c5d84fab7b10343cc819` to Amazon order `114-5900136-8324212` and ASIN `B07T88F8B2`: `$29.17` earnings, `$19.96` exact item cost, and `$9.21` profit. The read-only review showed zero ambiguous, missing, not-found, or synced rows; dashboard sync remains approval-gated.

## v3.8.4 - 2026-07-23

- Extended every review-window transparency slider from 25%-100% to 0%-100%.
- Removed the inner-surface opacity floors so the shell, information surfaces, controls, theme pattern, and page backdrop all reach a true zero-alpha state.
- Formatted Poshmark Total sales last 90 days and Total earned all time as USD with dollar signs, thousands separators, and cents.
- Added thousands separators to large Poshmark count metrics while preserving all stored and synced values as numbers.
- Existing marketplace approval stops and Save/Submit behavior are unchanged.
- The complete automated suite passes `203/203`; universal validation, clean install/update preservation, release packaging, and release checks pass.
- Signed-in Profile 2 live proof reached exact zero alpha for the modal shell, inner stats table, theme pattern, and page backdrop while the everyday panel remained at 65%. The setting persisted after reopen, USD and count formatting matched live Poshmark values, a clean repeat produced no new warnings or errors, and the review was restored to 65% and closed without Save.

## v3.8.3 - 2026-07-22

- Replaced the global review-window transparency control with an independent 25%-100% setting for every modal.
- Made the modal shell and opaque inner surfaces translucent together, including Poshmark stats tables, review fields, sales lists, inputs, and secondary controls, while leaving text fully readable.
- Added shared title-bar dragging to every review window, viewport clamping, a double-click position reset, and per-window position persistence.
- Preserved per-window size, position, and opacity through settings backup and local extension updates.
- Removed the older eBay-only drag implementation so eBay, Poshmark, Amazon, Walmart, and shared review windows use the same behavior.
- Existing marketplace approval stops and Save/Submit behavior are unchanged.
- The complete automated suite passes `202/202`; universal validation, clean install/update preservation, release packaging, and release checks pass.
- Signed-in Profile 2 live proof passed on Poshmark Stats and eBay Seller Level. Poshmark changed from 65% to 40% while its inner table changed from 0.18 to 0.114 alpha, the everyday panel stayed at 65%, drag moved the window from left 295 to 475, and reopening restored 40% plus the exact moved position. The Poshmark window was restored to 65% and centered; both review windows closed without Save and zero marketplace actions occurred.

## v3.8.2 - 2026-07-22

- Added one centralized 49-theme catalog: six GLDN core themes, all 23 current Limited Edition entries, and all 20 retired entries listed on dbrand's Limited Editions page on July 22, 2026.
- Built original CSS-only palettes and patterns for every added theme without bundling dbrand artwork, product images, or remote assets.
- Grouped the theme picker into Core, Limited Editions, and Retired Editions and added an immediate three-swatch preview.
- Applied the selected theme consistently to the floating panel, popup, onboarding, feature guide, and every shared review window.
- Preserved per-Chrome-profile theme storage and settings backup compatibility across local updates.
- Added catalog completeness, surface wiring, token completeness, and WCAG-style contrast regression tests.
- The complete automated suite passes `201/201`; universal validation, clean install/update preservation, and release packaging pass.
- Signed-in Profile 2 showed all 49 choices in exact `6 / 23 / 20` groups. Sketch 2D, Damascus, Touch Grass 2025, and Inferno rendered live; Inferno survived reload; the prior Dark theme was restored and also survived reload. No marketplace action was performed.

## v3.8.1 - 2026-07-22

- Replaced the unreadable pale-yellow Poshmark sales preview with a compact high-contrast table that remains legible in Light, Dark, Graphite, Signal, Midnight, and Crimson themes.
- Replaced 20 serial dashboard requests with one idempotent `marketplaceProfitBatch` operation, including a single queued batch on temporary dashboard failure.
- Added an exact visible-sale count, disabled duplicate Save clicks while a batch is running, and made retry state explicit.
- Added regression coverage proving that two identical 20-row saves leave exactly 20 unique rows in both Marketplace Profit History and `Profit - 7`.
- Deployed the optimized dashboard batch as production Apps Script `@36`.
- Signed-in Profile 2 reviewed 20 live sales, completed the batch in 10.8 seconds, and exact connector readback found all 20 order IDs once in `Profit - 7` with zero duplicates and 51 total data rows.
- The complete automated suite passes `197/197` tests. Proof video: https://drive.google.com/file/d/1ASrHy_C_8r_MScpD4yqgmUqcR8i6CBMR/view?usp=drivesdk

## v3.8.0 - 2026-07-22

- Added a skippable first-install tour generated from the same 21-feature catalog as the GitHub and in-extension guides.
- Added permanent Feature Tour and Feature Guide entry points in the popup and floating-panel settings.
- Added shared transparency sliders and saved resizing to every GLDN review modal, including Seller Level and listing-limit review.
- Added Midnight and Crimson themes alongside Light, Dark, Graphite, and Signal.
- Replaced the native-looking panel and modal scrollbars with a thin, seamless treatment.
- Added a lightweight GLDN launcher to ordinary HTTP and HTTPS pages while keeping marketplace actions restricted to their matching sites.
- Fixed listing-limit completion so a successfully reviewed check marks the Tasks checkbox; the note separately records whether the account was under limit.
- Deployed the label-based listing-limit checkbox repair as production Apps Script deployment `@34`.
- Signed-in Profile 2 live verification passed for computer `0` / FAK12: the onboarding page opened, the v3.8.0 panel loaded on Google Sheets, Seller Level and listing-limit reviews showed 75% transparency with resize enabled, all six themes were present, and `Tasks!H20` became a checked checkbox with a timestamped GOOD-status note.
- Fixed the local release builder so onboarding and universal-launcher files are included. The final release gate passed `194/194` tests, universal validation, clean install, rollback-safe update, and settings preservation.

## v3.7.99 - 2026-07-22

- Added an explicit F-09 controlled-timeout probe for the production dashboard queue.
- The probe refuses to touch an existing queue, preserves one fixed sync ID across duplicate enqueue and retry, and uses the dashboard's harmless `ping` action.
- Records exact queue counts with zero marketplace actions and zero dashboard mutations.
- Focused F-09 contracts pass `4/4`; after the F-10 safety additions, the final full serial suite passes `179/179` and the universal release check passes.
- Signed-in Profile 2 live proof passed on computer `0` / FAK12: `1` queued, `1` after duplicate, `1` retried with the same sync ID, and `0` remaining; independent health reported `queue 0` and `dashboard OK`.
- Google Drive proof: https://drive.google.com/file/d/1Hl_ro2zabXd7zJARXkijq7IT3W6AFW0y/view?usp=drivesdk
- Added an F-10 read-only Tasks schema audit and targeted fail-closed preflight for every Tasks write path.
- Production Apps Script deployment `@33` resolved all six computer headers and all 15 required task labels exactly once with zero sheet writes and zero marketplace actions.
- F-10 Google Drive proof: https://drive.google.com/file/d/1LL8bus-SnrpPITUglPoX6K2uFi8Bz4uB/view?usp=drivesdk
- Completed F-13 strict UTF-8 and current-layout verification: 26/26 files decoded cleanly, zero mojibake, live Profile 2 panel state/persistence passed, and four responsive popup renders passed without overflow or undersized buttons.
- F-13 Google Drive proof: https://drive.google.com/file/d/16JyqNIYNWHIOSsn5gtooU-9yo82smIh-/view?usp=drivesdk
- Strengthened F-14 so release notes, changelog, matrix manifest version, F-14 ledger presence, versioned MP4 evidence, Drive proof, and matrix proof citation are enforced by the release check.
- F-14 passed the complete gate with 181/181 tests, identical final ZIP hashes, one rollback backup, and preserved private configuration. Proof: https://drive.google.com/file/d/11Kvngr0N-dSnkloDPw2kUb52FFCrDOrx/view?usp=drivesdk
- The final release-package check passes with live-video verification enabled.

## v3.7.98 - 2026-07-22

- Added a trusted-click `execCommand('copy')` fallback for eBay pages where the content-script Clipboard API returns an empty readback.
- Records the clipboard method and structured export length while preserving the exact storage and zero-action gates.
- Allows browser-level exact clipboard verification without weakening the extension's success checks.
- Live Profile 2 proof passed for Computer `0` / `FAK12`: Windows parsed the exact 694-byte diagnostic export with one controlled error and zero marketplace actions.
- Google Drive proof: https://drive.google.com/file/d/1BFRdeVqtQpW4Ld3svHLm_pSXXkbFV-ER/view?usp=drivesdk

## v3.7.97 - 2026-07-22

- Replaced the browser-blocked automatic clipboard probe with a visible trusted-click verification control.
- The temporary F-11 button copies and reads back the exact structured diagnostic record, removes itself after success, and remains retryable after failure.
- Keeps the exact storage, identity, phase, version, and zero-marketplace-action gates from v3.7.95-v3.7.96.

## v3.7.96 - 2026-07-22

- Extended the harmless F-11 probe through the clipboard export boundary.
- The probe now copies its exact verified production log entry and requires byte-for-byte clipboard readback before passing.
- Preserves the zero-marketplace-action guarantee and reports clipboard failures separately from storage failures.

## v3.7.95 - 2026-07-22

- Added an explicit, eBay-only F-11 controlled-failure probe with a required confirmation token and zero marketplace actions.
- Routed content-script errors through the production background logger so phase and saved computer/account identity are retained.
- Added exact storage readback for timestamp, page, phase, identity, version, message, and detail before the probe can pass.
- Kept Full Diagnostic Report export tied to the same verified production error log.
- Added focused contracts for the probe boundary, identity enrichment, zero-action guarantee, and diagnostic export.

## v3.7.94 - 2026-07-22

- Replaced drifting GitHub and in-extension instructions with one canonical 20-feature guide catalog.
- Every feature now includes prerequisites, exact steps, an explicit approval stop, expected output, failure recovery, matrix references, and current evidence status.
- Clearly labels partial and unproven boundaries, including Sniping user review, Poshmark visible-sales import, diagnostics failure readback, cross-computer deployment, and Walmart.
- Preserves explicit stops before eBay Continue, eBay Save, every listing Submit, EcomSniper listing actions, and Walmart Place order.
- Added a generated, responsive extension guide with evidence labels, a feature index, and expandable step-by-step sections.
- Added contracts that prevent the Markdown guide and extension guide from drifting and reject stale Web Store or Windows-helper instructions.
- Passed the 20-feature desktop/mobile visual audit with no horizontal overflow, duplicate IDs, or clipped status labels.

## v3.7.93 - 2026-07-21

- Reorganized the advanced popup into persistent Workflows, Status, and Settings tabs.
- Kept Move .99, reverse cleanup, Bulk Listing, Sniping, Poshmark, diagnostics, dashboard setup, backups, limits, and Amazon profile controls accessible without crowding the everyday panel.
- Moved Reload Extension and Open Guide to permanent top-level actions and removed stale Web Store/manual-updater language.
- Added keyboard tab navigation and per-Chrome-profile tab persistence.
- Added Graphite and Signal popup treatments and corrected automatic EcomSniper status-card contrast.
- Passed all 164 automated contracts plus four-width/tab visual audits with no horizontal overflow, duplicate IDs, or undersized buttons.
- Chrome automation blocks direct navigation to `chrome-extension://` pages, so the privileged popup click-through remains an explicitly documented manual live check rather than an overstated pass.

## v3.7.92 - 2026-07-21

- Added a server-side task-completion allowlist; arbitrary task labels cannot be checked by the extension.
- Move .99 now checks its Tasks row only after an exact final scan reports `Completed`, zero remaining listings, and zero failed listings.
- Partial batches, review-ready states, reverse cleanup, bulk listing, sniping, and second-round checks cannot trigger automatic completion.
- Added an authenticated temporary-sheet boundary probe that rejected eight unsafe states, checked only computer `0`, kept Poshmark-only grey, deleted itself, and performed zero marketplace actions.
- Confirmed the second-round row remains intentionally manual.

## v3.7.91 - 2026-07-21

- Added strict stale-task boundaries: the three daily search checks warn only after more than three days, and completed checkboxes stay clear.
- Added the sniping reminder using the newest computer timestamp, with a red `NEED TO SNIPE` warning only after more than five days.
- Preserved the existing Tasks-sheet `Last Sniped` timestamp and computer label when the workbook uses its legacy K/L/M storage layout.
- Added the automatic Subscribe & Save reminder beginning one calendar day before month end.
- Added authenticated temporary-sheet and production-refresh checks that perform zero marketplace actions and leave no probe tabs behind.

## v3.7.90 - 2026-07-21

- Corrected Tasks metric thresholds: late shipment is orange above 1.5% and red at 3% or higher; tracking is orange only below 85%; transaction defects and unresolved cases are red only above zero.
- Added authenticated live T-03 boundary and production-refresh actions that perform zero marketplace actions.
- The live boundary probe uses a hidden temporary sheet and always deletes it; metadata readback confirmed no probe tabs remained.
- Refreshed the real Tasks metric rows without changing their values, notes, checkboxes, or unrelated task rows.

## v3.7.89 - 2026-07-21

- Added a guarded C-04 live timeout-recovery probe that executes the production EcomSniper timeout path without clicking EcomSniper or changing marketplace data.
- The probe verifies both pending checkpoints are cleared, requires an exact storage readback, and records zero marketplace actions.
- Marked the recorded C-03 proof as pending user review.

## v3.7.88 - 2026-07-20

- Restores Amazon's shared runtime-message binding so Start Sniping Workflow can reach the background worker.
- Persists the exact launch result, generated eBay tab ID, Chrome window ID, and any launch error for live diagnosis.
- Keeps the Sniping launch status visible instead of allowing checkout polling to overwrite it.

## v3.7.87 - 2026-07-20

- Creates the inactive C-03 eBay scan tab in the exact Chrome window that owns the starting Amazon tab.
- Prevents an older same-profile window from receiving the background scan.
- Preserves exact Amazon-tab ownership and seller-review recovery.

## v3.7.86 - 2026-07-20

- Restores the C-03 seller review from saved state on the exact Amazon owner tab.
- Reacts to the seller-review storage checkpoint as well as the direct background handoff message.
- Recovers after a page reload or a handoff message that arrived before Amazon's listener was ready.

## v3.7.85 - 2026-07-20

- Pins each C-03 scan to the exact Amazon tab that started it.
- Prevents a same-profile duplicate Amazon tab or older Chrome window from receiving the seller-review handoff.
- Keeps the inactive eBay scan and no-focus Amazon return introduced in v3.7.84.

## v3.7.84 - 2026-07-20

- Runs the generated C-03 eBay seller scan in an inactive tab so the operator can keep using the computer.
- Returns the seller-review result to the existing Amazon tab without activating it or focusing its Chrome window.
- Preserves the stable-result wait, exact identity gates, generated-tab cleanup, and read-only seller handoff.

## v3.7.83 - 2026-07-20

- Returns the C-03 seller review to the already-open signed-in Amazon anchor tab after the eBay scan.
- Closes the heavy generated eBay results tab only after Amazon confirms the read-only review is visible.
- Replaces duplicate stale scan handoffs with one Amazon overlay and avoids the automation-blocked `chrome-extension://` review page.

## v3.7.82 - 2026-07-20

- Moves sniping seller confirmation from eBay's heavy live results page into a lightweight read-only extension tab.
- Caps the generated sniping search at 60 results per page and waits for the rendered cards to stabilize before scanning.
- Closes only the generated search tab after candidate capture and records a recoverable failure instead of stranding Chrome.

## v3.7.81 - 2026-07-19

- Handles unlabeled eBay checkboxes safely while locating the exact Bulk Edit select-all control.
- Keeps the v3.7.80 native 500-row selection-counter correction intact.

## v3.7.80 - 2026-07-19

- Uses eBay's native `500 of 500 item(s) selected` counter for virtualized Bulk Edit workspaces.
- Targets eBay's exact `Select all items for bulk edit.` checkbox before any fallback locator.
- Prevents a successful select-all from being clicked again and accidentally cleared.

## v3.7.79 - 2026-07-19

- Replaces the live 2,000-row publish path with a complete Active Listings exact-item scan.
- Creates final eBay Bulk Edit workspaces from only the verified `.99` item numbers, capped at 500 workspace rows.
- Prevents `Submit (2,000)` from triggering eBay's `500 listing limit with variations` failure while preserving the stop-before-Submit approval gate.

## v3.7.78 - 2026-07-19

- Recognizes eBay's current exact completion toast: `Category updated in 100 listings`.
- Keeps the selected-row grid fallback for eBay layouts that retain all rows in the DOM.
- Preserves the 500-row render cap, 100-listing review cap, workspace-count separation, and untouched Submit gate.

## v3.7.77 - 2026-07-19

- Verifies Store category drafts directly across every selected Bulk Edit row when eBay's short-lived confirmation toast disappears.
- Treats `Submit (2,000)` as the native workspace size while separately requiring exactly 100 verified selected listings.
- Preserves the 500-row render cap, 100-listing review cap, and stop-before-Submit approval gate.

## v3.7.76 - 2026-07-19

- Keeps the stable 500-row rendered Move .99 window but limits direct price-scan review batches to 100 verified listings.
- Prevents the signed-in Profile 2 lock observed while eBay tried to reconcile 323 individual checkbox changes in one pass.
- Repeated approved passes continue from the smaller remaining source inventory, with the same exact price, native count, Store category, unchanged-field, and stop-before-Submit checks.

## v3.7.75 - 2026-07-19

- Lowers the Move .99 rendered working set from roughly 1,000 rows to 500 after the signed-in Profile 2 live run showed that 1,000 could still leave Chrome unresponsive before selection began.
- Matches the render ceiling to eBay's existing 500-listing publish safety limit, so each approved pass reduces the remaining source inventory without mounting rows that cannot be submitted in that pass.
- Adds earlier pacing pauses while eBay grows the virtualized table, while preserving exact `.99` price checks, selected-count reconciliation, Store-category validation, and the stop-before-Submit approval gate.

## v3.7.74 - 2026-07-19

- Caps the rendered Move .99 working set at roughly 1,000 rows even though eBay still opens its required 2,000-listing edit range.
- Caps each review batch at 500 verified `.99` listings to stay within eBay's variation-safe publish limit.
- Disables native Select all for partial workspaces, freezes the inspected row set, and keeps native selected-count reconciliation before Store category opens.

## v3.7.73 - 2026-07-19

- Replaces forced rendered-text/layout reads across all 2,000 Bulk Edit rows with lightweight in-memory row identities.
- Preserves exact saved title/price fingerprint matching while yielding to Chrome every ten rows.
- Adds explicit loaded, price-reading, and exact-selection phase checkpoints for the live Move .99 workflow.

## v3.7.72 - 2026-07-19

- Reuses the already verified 2,000-row control map after native Select all unless eBay actually remounts the table.
- Increases per-checkbox settling time and adds a longer cooldown after every five exclusions.
- Reduces panel updates during selection so eBay's fully rendered editor gets more uninterrupted recovery time.

## v3.7.71 - 2026-07-19

- Paces Move .99 checkbox changes one row at a time and waits for eBay's native selected counter after every mutation.
- Adds a longer stabilization pause after native Select all and a cooldown after each ten exclusions.
- Prevents a 20-click exclusion burst from overwhelming eBay's fully rendered 2,000-row editor.

## v3.7.70 - 2026-07-19

- Loads and verifies the complete eBay Edit listings 1-2,000 range before changing any selection.
- For ranges dominated by `.99` listings, uses eBay's native Select all once and excludes only verified non-.99 rows, avoiding thousands of individual selection rerenders that can freeze Chrome.
- Requires eBay's native selected counter, rendered selected count, and exact `.99` scan count to agree before opening Store category.
- Clears the interrupted v3.7.69 Move .99 checkpoint on reload while preserving per-account category settings.

## v3.7.69 - 2026-07-19

- Replaces Move .99's unstable 2,000-row rendered Bulk Edit scan with a verified full Active Listings scan that records exact item numbers.
- Uses eBay's own signed-in Bulk Edit workspace endpoints to open only those exact qualifying IDs.
- Publishes exact-ID workspaces in batches of at most 500 because eBay rejects larger submissions when any listing has variations; an oversized rejected workspace is recovered automatically without rescanning.
- Allows up to eight bounded clean-pass restarts when the filtered inventory total changes during a long read-only scan, preventing normal background listing activity from causing an early safe stop.
- Removes the temporary local request tracer and keeps the primary Store category plus untouched final Submit safety gates.

## v3.7.68 - 2026-07-19

- Move .99 now reacquires eBay's current Bulk Edit table and lazy-load sentinel before every block request and after every load.
- Fixes full-range scans stopping after eBay replaces the virtual table while preserving the calibrated block pacing and every reconciliation gate.

## v3.7.67 - 2026-07-19

- Move .99 now waits for the complete 50-row eBay Bulk Edit block to arrive and remain stable before requesting another block.
- Prevents overlapping lazy-load requests after the first new row appears, keeping slower Profile 2 renderers responsive during a full 2,000-row traversal.

## v3.7.66 - 2026-07-19

- Calibrated Move .99's eBay Bulk Edit lazy loader to dwell out of view for 500 ms, expose the bottom sentinel for 250 ms, and immediately retreat.
- The measured Profile 2 sequence materialized exactly one additional 50-row block while preserving responsive, row-by-row selection and all stop-before-Submit gates.

## v3.7.65 - 2026-07-19

- Replaced Move .99's sustained bottom-of-table observer exposure with a paced one-task pulse followed by an immediate retreat, preventing eBay from chain-loading a 2,000-row workspace faster than Chrome can process it.
- Added a layout-neutral first-block observer pulse for Bulk Edit tables that initially have no scroll range.

## v3.7.64 - 2026-07-19

- Move .99 now waits for eBay's stable native admitted count, preferring the selected/Submit total over an earlier processing total.
- When eBay declares one or more requested listings unrevisable, GLDN scans every admitted row and records the omission instead of claiming those rows were inspected.

## v3.7.63 - 2026-07-19

- Fixed Move .99 startup on current eBay Bulk Edit pages that mount listing rows and show an exact native `Submit (count)` control without rendering the older `listings processed` message.
- The native count is accepted only after rows mount and only when it reconciles with the requested range; all existing full-row, selected-count, Store-category, review, and final Submit safety gates remain in place.

## v3.7.62 - 2026-07-19

- Clears incompatible unfinished Move .99 state from the background worker before a local extension reload refreshes marketplace tabs.
- Stamps background-owned Move .99 state with the same version and update metadata as page-owned state.
- Prevents an already overloaded restored eBay renderer from blocking the update migration itself.

## v3.7.61 - 2026-07-19

- Stamps every saved Move .99 task with the running extension version and update time.
- Clears unfinished Move .99 state from an older build on page startup so an extension update cannot immediately re-freeze every restored eBay tab.
- Keeps the v3.7.60 one-block observer pulse, exact row reconciliation, and stop-before-Submit approval gate unchanged.

## v3.7.60 - 2026-07-19

### Fixed
- Removed the persistent Bulk Edit bottom padding that could leave eBay's replacement lazy-load observer continuously intersecting after the first successful pulse.
- Each observer is now exposed for 35 ms and restored in a per-cycle `finally` block before the next row block is inspected.

### Safety
- The loader requests one bounded block at a time and remains responsive between blocks.
- Exact every-row and selected-count reconciliation still gate Store category editing, and final Submit remains untouched.

### Verification
- v3.7.59 removed the background-tab animation-frame stall but the first observer trigger still made the existing Profile 2 workspace unresponsive; no category change was attempted.
- Full release checks and a fresh signed-in Profile 2 run are required before live-pass.

## v3.7.59 - 2026-07-19

### Fixed
- Bulk Edit settling now has a 250 ms timer fallback when Chrome throttles or suspends `requestAnimationFrame` in a background Profile 2 tab.
- The Move .99 scan can continue without requiring the eBay tab to stay visibly focused.

### Safety
- The fallback only advances a read-and-select scan checkpoint; exact row and selected-count reconciliation still gate Store category editing.
- Final Submit remains untouched until explicit approval.

### Verification
- The v3.7.58 Profile 2 workspace mounted 200 rows but remained at “Preparing to scan” because its second animation frame never completed in the background.
- Full release checks and a fresh signed-in Profile 2 run are required before live-pass.

## v3.7.58 - 2026-07-19

### Fixed
- The Bulk Edit loader now pulses eBay's real intersection observer for one layout cycle instead of leaving it transformed while more row blocks arrive.
- Virtualized rows are inspected on every progress poll, so a fixed 55-row DOM window can advance without waiting eight seconds per block.

### Reliability
- Observer styles are restored after every pulse, preventing eBay from queueing a 2,000-row burst that can freeze the workspace.
- Exact every-row and selected-count reconciliation remains mandatory before Store category editing.

### Verification
- The v3.7.57 signed-in Profile 2 run opened the correct 2,000-listing workspace, then became unresponsive while the observer remained staged; the extension was reloaded before any category change.
- Full release checks and a fresh signed-in Profile 2 run are required before live-pass.

## v3.7.57 - 2026-07-19

### Fixed
- The Bulk Edit loader now temporarily translates eBay's actual intersection-observer element upward into the table viewport, instead of relying on parent padding alone.
- Each observed element's original inline transform and `will-change` values are restored after scanning.

### Safety
- Every admitted row and the final selected count must still reconcile exactly before Store category editing.
- Only the primary Store category may change, and final Submit remains untouched until explicit approval.

### Verification
- v3.7.56 confirmed that parent padding alone did not advance the signed-in Profile 2 workspace beyond 55 of 2,000 rows; no category change was attempted.
- Full release checks and a fresh signed-in Profile 2 run are required before live-pass.

## v3.7.56 - 2026-07-19

### Fixed
- eBay's Bulk Edit intersection observer now receives temporary bottom viewport room so it can enter the table scroller and request rows after the initial 55-row block.
- The original table padding is restored after the scan.

### Safety
- The exact every-row and selected-count reconciliation from v3.7.55 is unchanged.
- No Store category change is attempted unless all admitted rows load.
- Final Submit remains untouched until explicit operator approval.

### Verification
- The signed-in Profile 2 v3.7.55 run reproduced the lazy-loader stall at exactly 55 of 2,000 rows and attempted no category change.
- Full release checks and a fresh signed-in Profile 2 run are required before live-pass.

## v3.7.55 - 2026-07-19

### Fixed
- Move .99 now follows eBay's native `Edit listings 1-2,000` Bulk Edit workflow instead of requiring a long Active Listings page scan whose total can drift while new inventory is posted.
- Every admitted Bulk Edit row must load and be inspected; the workflow selects only rows whose exact current price qualifies for the selected `.99` or reverse mode.
- Range retries preserve the exact requested range, and confirmed submissions restart from the first remaining source range so shifted listings are not skipped.

### Safety
- Any inspected-row or selected-count mismatch stops before Store category editing.
- Only the primary Store category is changed.
- Final eBay Submit remains untouched until explicit operator approval.

### Verification
- All 34 focused Move .99 contracts pass.
- Signed-in Profile 2 final-review proof is required before v3.7.55 is called a live pass.

## v3.7.54 - 2026-07-19

### Fixed
- A filtered listing-total change on page 2 or later now triggers a clean full Move .99 rescan instead of an immediate safe-stop.
- The restart adopts eBay's latest authoritative total and page count and clears partial page/reload state.

### Safety
- Inventory drift retries are bounded to two clean restarts; a third change still stops before any category edit.
- Exact scan completeness, fingerprint reconciliation, selected-count verification, primary Store category isolation, and the final Submit approval gate remain unchanged.

### Verification
- The first signed-in Profile 2 v3.7.53 run safely detected live FAK12 inventory drift from 3,175 to 3,177 on page 2 and attempted no changes.
- All 32 focused Move .99 contracts and all 127 JavaScript contracts pass.
- Universal release, dashboard, clean install/update, policy, and local package checks pass.
- Signed-in Profile 2 final-review proof remains required for v3.7.54.

## v3.7.53 - 2026-07-19

### Fixed
- The verified Active Listings scan now saves title and price for every listing in each exact eBay edit range.
- Bulk Edit no longer depends on eBay item IDs that are absent from the current ID-free row markup.
- The scanner deliberately moves eBay's `.bg-intersection-observer` out of view and back into view, waiting for each 50-row block before continuing.
- Bulk-row polling uses the table's raw row count instead of repeatedly scanning every checkbox in the page.

### Safety
- A Bulk Edit row is selectable only when its normalized full title and exact cent price match the verified range inventory.
- Duplicate title/price fingerprints must be entirely qualifying or entirely non-qualifying; mixed groups stop before Store category changes.
- Every admitted Bulk Edit row must load and reconcile, the selected count must match, only the primary Store category may change, and Submit remains untouched without approval.

### Verification
- The focused Move .99 suite passes 32 contracts, including full-range record partitioning, mixed-fingerprint rejection, compact checkpoint persistence, and intersection-sentinel loading.
- All 127 JavaScript contracts, dashboard contracts, universal release checks, install/update fixtures, policy checks, and local packaging pass.
- Signed-in Profile 2 proof remains required before live-pass.

## v3.7.52 - 2026-07-19

### Fixed
- Starting Move .99 after a tab freezes during the first exact edit range now recovers the verified full-inventory scan instead of replacing it with a new run.
- Recovery clears stale tab ownership, returns to the saved scan summary, and requires another explicit Apply before continuing.

### Safety
- Recovery is available only before any batch is submitted and only when scan strategy, scan integrity, unique item count, and saved pages all reconcile.
- Submitted/live totals must still be zero, so this path cannot replay a partially submitted batch.

### Verification
- The focused Move .99 suite passes 29 contracts, including dead-owner recovery without scan replacement.
- Full release checks and signed-in Profile 2 recovery remain required before live-pass.

## v3.7.51 - 2026-07-19

### Fixed
- Opening eBay's exact `Edit listings` range no longer polls every generic `div` and `span` on large Seller Hub pages.
- The range finder now inspects only actionable menu controls, rejects unrelated text before visibility checks, and avoids repeated layout measurements that froze the signed-in tab after Apply.
- Range-menu polling is cooperative while retaining exact start/end matching.

### Safety
- The verified exact item-ID scan and 2,000-listing range boundaries are unchanged.
- Only the primary Store category may change, and Submit remains untouched until explicit operator approval.

### Verification
- The focused Move .99 suite passes 28 contracts, including a guard that rejects global `div`/`span` menu scans.
- Full release checks and signed-in Profile 2 recovery remain required before this release is marked live-pass.

## v3.7.50 - 2026-07-18

### Fixed
- Move .99 no longer reopens and processes one 200-listing Active Listings page at a time after the full scan.
- The verified listing order is partitioned into eBay's exact edit ranges of up to 2,000 listings, including a final partial range such as `2,001-2,808`.
- Each Bulk Edit range is cleared first, then only the exact saved eBay item numbers from the verified scan are selected. Missing IDs, unreadable IDs, count mismatches, and unintended selections stop safely before any category change.
- eBay range labels using a hyphen, figure dash, en dash, or em dash are recognized.

### Configuration
- Computer `M0` / `CLICKNCARRY` now ships with source Store category `BEST SELLERS` and destination Store category `BALK`.

### Safety
- Only the primary Store category is changed.
- Every range still stops at the final eBay review screen with Submit untouched until explicit operator approval.
- Submitted ranges advance only after an exact eBay live/failed result; uncertain outcomes still fall back to read-only verification.

### Verification
- The focused Move .99 suite passes 28 contracts, including a `2,808`-listing / `2,688`-match range-partition simulation.
- All 123 JavaScript contracts pass.
- Live M0 proof is still required before this range path is marked live-pass.

## v3.7.49 - 2026-07-18

### Fixed
- Sniping no longer treats a price markup as proof that an eBay item exactly matches an Amazon product.
- Seller qualification now requires the exact Amazon ASIN URL, exact eBay item URL, at least 70% markup, a positive conservative profit estimate, and manual title/image/variant confirmation.
- Apparel, shoes, costumes, and fashion products are excluded from sniping candidates using the same shared product policy as Bulk Listing.
- Reset now clears an abandoned sniping winner so stale products cannot leak into a later run.
- eBay's current `s-card` search-result layout now yields the real product title, price, image, item ID, and seller instead of mislabeling candidates with location text.

### Workflow
- Added **Start Sniping Workflow** to the Amazon panel's three-dot settings so an exact signed-in product can start directly without putting Sniping among the everyday controls.
- Added a reviewed seller handoff into EcomSniper Competitor Scanner.
- Added a recent-demand winner capture that records verified 30-day and 90-day sold counts before opening Product Hunter.
- Added an exact Amazon comparison with competitor markup, an exact `$0.05` undercut, estimated fees, gross spread, and conservative estimated profit.
- The workflow stops at **Save Read-Only Review**. It does not create, edit, or submit an eBay listing.

### Verification
- Eleven focused sniping safety and wiring contracts pass.
- All 120 JavaScript contracts pass, including Move .99, Mark as Shipped, order notes, dashboard sync, Poshmark, and EcomSniper.
- Live Profile 2 proof is still required before C-03 can be marked live-pass.

## v3.7.48 - 2026-07-18

### Fixed
- Scanner titles are filtered a second time before Product Hunter, so apparel, shoes, costumes, cosplay, outfits, purses, crossbody bags, wallets, and related fashion accessories cannot slip through from competitor results.
- Amazon Best Sellers collection and Product Hunter preparation now use one shared exclusion policy.
- Exact duplicate scanner titles are removed before Product Hunter.

### Interface
- Added **Filter Titles & Open Product Hunter** to the popup.
- The action reads EcomSniper's copied title list, reports kept/excluded/duplicate counts, writes only accepted titles back to the clipboard, and opens Product Hunter for the required manual import.

### Verification
- The live C-02 sample contained 11 copied titles: 5 valid products were retained and 6 apparel/fashion titles were blocked before import.
- All 109 JavaScript contracts pass. No Product Hunter search, export, or listing submission occurred yet.

## v3.7.47 - 2026-07-18

### Fixed
- EcomSniper counts now fail closed unless `after total - before total` exactly equals the button's reported new-seller count.
- A button text mutation by itself is no longer treated as successful extraction evidence.
- Missing count text now parses as missing instead of silently becoming zero.
- Multi-step workflows retain the original starting total and final total, then report one complete-run increase separately from each intermediate step.

### Interface
- The popup now shows **Latest step** and **Complete run** as separate verified totals.
- Competitor Scanner inventory is no longer described as sellers added by one extraction step.

### Source clarification
- The prior `892 -> 946` result was the first verified extraction step (`+54`).
- The workflow continued through more products/pages until EcomSniper's global total reached `1,607`, so the complete run was `892 -> 1,607` (`+715`).
- A read-only Profile 2 check confirmed the eBay Extract Sellers button and Competitor Scanner both currently show `1,607`; they are the same global inventory at different workflow moments, not competing totals.

### Verification
- Twelve focused count/click/recovery contracts pass.
- GLDN Ops v3.7.47 was loaded in signed-in Profile 2, computer `0`, eBay `FAK12`.
- No marketplace action was submitted.

## v3.7.46 - 2026-07-18

### Fixed
- Replaced the Windows local click helper and manual EcomSniper pause with an in-page semantic `Extract Sellers` click on eBay search results.
- GLDN Ops now waits for EcomSniper's own button/count mutation before advancing and stops safely on missing, wrong, stale, or timed-out state.
- Stop and Reset now cancel the complete Amazon/eBay seller-extraction queue.
- The 60-day product history now records only products whose seller extraction was confirmed; interrupted legacy queues release unprocessed reservations.

### Safety
- No `debugger` or `management` permission was added.
- GLDN Ops still does not inject into EcomSniper's private extension pages and does not replace its scanner, Product Hunter, or listing UI.
- No marketplace listing, order, or payment action is submitted by this workflow.

### Live verification
- Signed-in Chrome Profile 2, computer `0`, eBay `FAK12`, GLDN Ops v3.7.46.
- The first extraction step changed from `892 total` to `+54 new / 946 total` without a local helper or manual Extract Sellers click.
- The remaining automatic steps continued until EcomSniper's global total reached `1,607`; the controlled handoff then showed the same `1,607` in Competitor Scanner.
- Evidence: `evidence/profile2-ecomsniper-c01-v3746-2026-07-18/`.
- Phone-format proof: https://drive.google.com/file/d/15n7YDK3UAE3UtdBCgqMO5uLK8PNbEGFI/view?usp=drivesdk

## v3.7.45 - 2026-07-16

### Fixed
- Configured eBay accounts now enter Move .99 through the exact numeric Store-category URL instead of inheriting stale Active Listings filters.
- Generic eBay filter tokens such as `storeCatIds=storeCategories` are rejected before a scan can become eligible for Apply.
- UI-selected source categories must resolve to the configured numeric category IDs when IDs are available.

### Safety
- The live failure that mislabeled 7,868 account-wide listings as candidates was stopped before Apply; no listing edits were staged or submitted.
- Final eBay Submit or Revise remains untouched until explicit approval.

### Live verification
- Signed-in Profile 2 scanned all 2,563 listings under exact source IDs `44678633011,1` and found 2,335 exact `.99` candidates.
- The first 163 candidates reached final eBay review with the correct `Abra Cadabra .99` Store category and `$0.00` estimated fees; `Submit (163)` remained untouched.
- Cancelling the unsaved review triggered a read-only recovery scan that exported 2,335 unique `Remaining / Retry` rows and reported 0 submitted batches.
- Phone-format proof: https://drive.google.com/file/d/13LaIKdpKKl11oMgs5IKjhNtKvieJie7h/view?usp=drivesdk

## v3.7.44 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now require an explicit eBay live/failed count before advancing beyond an approved Submit.
- A missing or incomplete submission result starts a read-only full verification scan instead of assuming success or repeating a write.
- Submitted batches now have idempotent keys, persisted result history, exact processed IDs, recovery history, and accurate totals.
- Removed the dead post-batch code path that could never execute.

### Audit and retry
- Audit CSV rows distinguish confirmed submissions, unresolved rows, and final remaining items.
- Completed runs expose `Retry Failed Only` for the exact listings still qualifying after verification.
- The SPA heartbeat monitors the approval checkpoint so same-page eBay confirmations cannot strand the workflow.

### Safety
- Final eBay Submit or Revise remains untouched until explicit approval.
- Recovery performs no marketplace write; it rescans the configured source categories before offering a retry.

## v3.7.43 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now recognize eBay's filtered Results total from any current page, including ranges such as `401-600 of 5,591`.
- Starting a workflow away from page 1 no longer times out before the exact page-one scan begins.

### Safety
- The scanner still hard-loads and verifies every exact page before offering any category changes.
- Final eBay Submit or Revise remains untouched until explicit approval.

### Live verification
- Signed-in Profile 2 corrected `62` listings through three explicitly approved submissions (`4 + 43 + 15`).
- The final read-only rescan inspected all `5,533` source listings and found `0` remaining non-`.99` mismatches.
- Phone-format proof: https://drive.google.com/file/d/1fhOaekO1kK2fYySO-uZDNsGUnPhfQGTC/view?usp=drivesdk

## v3.7.42 - 2026-07-16

### Fixed
- Bulk Edit Store category verification now counts one grid cell per listing row instead of also counting nested text elements.
- A correctly staged four-listing batch no longer reports the false result `8 of 4 drafts`.

### Safety
- Every selected draft must still show the configured destination Store category before final review is accepted.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.41 - 2026-07-16

### Fixed
- A failed or closed first Bulk Edit batch now returns to the exact verified Move .99 scan summary.
- The saved scan, page records, and item-ID audit are retained without forcing another full inventory scan.

### Safety
- Automatic summary recovery is allowed only when zero batches and zero listings have been submitted live.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.40 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now target eBay's stable Primary Store category fieldset and `storePrimaryCategory` chooser.
- The fallback recomputes live modal coordinates after eBay scrolls the Category editor, preventing false "picker did not open" stops.

### Safety
- The Category change still has to be confirmed in every selected draft before the workflow reaches final review.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.39 - 2026-07-16

### Fixed
- Completed Move .99 scans are passive checkpoints, so eBay tabs no longer compete to resume a finished scan every heartbeat.
- Saved scan summaries migrate automatically from older active state and reopen without claiming a workflow tab.
- Apply transfers the saved checkpoint to the current healthy eBay tab, allowing recovery from a frozen or closed scan tab.

### Safety
- Apply still revalidates the exact saved inventory audit before changing any Store category.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.38 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now hard-load each exact 200-listing page instead of scanning eBay's retained SPA rows from earlier pages.
- An incomplete page receives one clean reload; a moving page boundary receives up to two bounded full-pass restarts.

### Safety
- The workflow still requires the exact filtered count as unique item IDs before category staging.
- Any incomplete scan after bounded recovery stops before changes.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.37 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now continue when the exact source Store category is already selected and eBay disables `See results` because no filter change is pending.
- The workflow closes the Categories panel and requires the visible result total and pagination to stabilize before scanning.

### Safety
- The no-change path is accepted only when no category checkbox was changed and the `See results` control is present.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.36 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now match eBay's `All filters (1)` button after shared text normalization removes the parentheses.
- Added an executable regression for plain, title-cased, and counted All filters labels.

### Safety
- Full-inventory verification remains required before category staging.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.35 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now recognize eBay's title-cased `All filters` button after a filtered page finishes loading.
- The workflow no longer stops with a false "could not find All filters" error while the button is visibly present.

### Safety
- Full-inventory verification remains required before category staging.
- Final eBay Submit or Revise remains untouched until explicit approval.

## v3.7.34 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup now handle a page containing exactly one audited candidate, where eBay opens the single-listing Revise editor instead of Bulk Edit.
- The single-listing path verifies the embedded item ID against the saved batch before touching Store category.

### Safety
- Only the primary Store category is staged.
- The final `Revise it` action is left visible and untouched for explicit approval.

## v3.7.33 - 2026-07-16

### Fixed
- Move .99 category scans now wait for eBay's filtered `Results` total to remain stable instead of accepting the stale account-wide Active Listings heading.
- The workflow requires the filtered table, pagination, loading state, and result count to agree before page 1 begins.
- If eBay changes the filtered total during the first page, the scan safely rebuilds its baseline and restarts page 1 up to two times.

### Safety
- A later count change still stops the workflow before any category action.
- Reverse cleanup still stops at scan summary before Apply, and final Submit remains approval-gated.

### Verification
- The focused Move .99 suite passes all 13 checks, including the stale-filter regression.
- Fresh signed-in Profile 2 scan proof is required before any category change.

## v3.7.32 - 2026-07-16

### Added
- **Move Non-.99 Out of Sale** is now available from the eBay panel's three-dot settings menu.
- The advanced launcher starts reverse mode on the current eBay tab with the same single-tab owner lock.

### Safety
- The reverse launcher remains outside the everyday button stack.
- It still requires a complete filtered scan and stops at scan summary before Apply.
- Final eBay Submit remains approval-gated.

### Verification
- The focused Move .99 suite now includes reverse-panel routing and passes all 12 checks.
- Fresh signed-in Profile 2 proof is still required before any category change.

## v3.7.31 - 2026-07-16

### Fixed
- Move .99 and reverse cleanup runs now belong to one exact eBay tab.
- Duplicate Active Listings tabs can no longer race through or overwrite the same pending scan.
- A new standalone run clears the prior pending state, opens its owner tab, and only then activates the workflow.

### Recovery
- Ownership may transfer only when Chrome confirms that the saved owner tab no longer exists.
- Legacy pending runs receive a serialized owner claim instead of allowing every eBay tab to resume them.

### Safety
- The reverse workflow still stops at scan summary with no Apply or eBay Submit action.
- Exact `.99`, malformed-price, and backburner exclusions remain unchanged.

### Verification
- The focused Move .99 contract suite now includes the single-owner-tab guard and passes all 11 checks.
- Full release verification and a fresh signed-in Profile 2 scan proof follow before any category change.

## v3.7.30 - 2026-07-16

### Fixed
- The standalone Move Non-.99 launcher no longer auto-applies after its inventory scan.
- Reverse cleanup rejects blank or malformed prices instead of classifying them as non-.99.
- Reverse-mode scan completion now reports the correct candidate type.

### Safety
- Both popup and diagnostic launchers stop at the scan summary before any category change.
- Exact `.99` prices and configured backburner item IDs are excluded from reverse cleanup.
- Category inversion is explicit: scan the saved sale destination and target the first saved non-sale source category.

### Verification
- Sixteen focused Move .99 and Store-category contracts pass, including executable reverse-price classification checks.
- Live signed-in Profile 2 scan proof is pending and no category change has been attempted in this release.

## v3.7.29 - 2026-07-16

### Fixed
- Move .99 virtual-row reconciliation now has a hard time budget instead of allowing a missing or recycled row to keep the eBay renderer busy indefinitely.
- Category-picker deep-query scope discovery is cached briefly, and post-Apply grid checks run at a bounded interval.
- eBay category-update text is read through `textContent` so polling does not repeatedly force a whole-page layout calculation.

### Diagnostics
- E-08 records the loaded/admitted batch, omission scan, category-menu, picker, Apply, update-confirmation, and final-Submit checkpoints.

### Safety
- Unexpected rows, non-`.99` prices, incomplete scans, and count mismatches still stop before category changes or Submit.
- Final Submit remains untouched until explicit approval.

### Live proof
- Signed-in Profile 2 inspected `2,234` filtered listings and found `2,064` exact `.99` matches.
- The final review contains 33 selected rows with zero saved title/price mismatches and Store category `Abra Cadabra .99` on every admitted row.
- eBay omitted item `318589264914`; it remains deferred and was not silently counted as completed.
- After explicit approval, the action-time audit again proved all 33 selected prices ended in `.99` and all 33 Store categories were `Abra Cadabra .99`.
- eBay reviewed 33 listings at `$0.00` estimated fees and confirmed `33 listings are now live` with no partial-failure warning.
- Pre-submit proof: `https://drive.google.com/file/d/14OUU6ikMvohQXGwMw_cp8KENzQsKfJXd/view?usp=drivesdk`
- Submission proof: `https://drive.google.com/file/d/1EqeJxppRwa5YZv7KirE44FLT-8aCcGbd/view?usp=drivesdk`

## v3.7.28 - 2026-07-16

### Fixed
- Move .99 no longer abandons an entire batch when eBay silently omits one or more selected listings from Bulk Edit.
- Every admitted Bulk Edit row is matched back to the saved `.99` title and price before category editing can continue.
- Omitted listings are deferred to the final verification pass, while page advancement still uses the original saved batch size.

### Safety
- An unexpected or non-`.99` Bulk Edit row still stops the workflow before any category change.
- Final Submit remains visible and untouched until explicit approval.

### Live finding
- Profile 2 selected 34 saved page-12 IDs; eBay admitted 33 and omitted item `318589264914` before any category change.

## v3.7.27 - 2026-07-16

### Added
- `Run Move .99 Workflow` in the eBay panel's three-dot settings menu.

### Safety
- The workflow remains absent from the daily button stack.
- The advanced menu command uses the v3.7.26 exact scanner and still stops before final Submit.

### Verification
- The advanced-menu wiring contract and all prior Move .99 contracts pass.
- Signed-in Profile 2 live proof is pending.

## v3.7.26 - 2026-07-16

### Fixed
- Move .99 now launches only the deterministic page-by-page item-ID scanner instead of the brittle Edit-all virtualized scan.
- The workflow stops before editing if unique inspected IDs do not exactly equal eBay's filtered total or if that total changes mid-scan.
- Every saved batch is revalidated for unique item ID, source page, `.99` price, backburner exclusion, and the 200-listing safety bound.
- Store-category chooser detection now targets the actual Selected category control and recognizes eBay's drawer/flyout variants.
- eBay must confirm that all expected drafts received the Store category before the workflow can reach Submit.

### Safety
- Only the primary Store category is changed.
- Final Submit remains visible and untouched until the user explicitly approves it.

### Verification
- Five focused Move .99 workflow contracts and the existing six Store-category contracts pass.
- Full signed-in Profile 2 proof is pending in E-08.

## v3.7.25 - 2026-07-15

### Added
- A settings-only `Store Categories` screen in the eBay panel's three-dot menu.
- Per-account source category names, destination category, source category IDs, and backburner item IDs.
- Account-bound clipboard backup and restore for Store category settings.

### Fixed
- Category settings now reject duplicate sources, source/destination overlap, malformed category IDs, and malformed eBay item IDs before storage.
- Validated frozen settings are converted to plain records before Chrome storage writes.
- Chrome storage failures now surface explicitly, and every save/restore is normalized and read back before success is reported.

### Verification
- All 68 automated contracts pass.
- Signed-in Profile 2 / computer `0` / FAK12 rejected duplicate, overlapping, and malformed live inputs.
- Exact FAK12 settings saved, backed up, restored, and persisted through a full in-extension reload.
- No Move .99 workflow, listing editor, listing revision, marketplace Save, or Submit action occurred.
- Evidence is preserved in `evidence/profile2-store-category-config-v3725-2026-07-15/`.
- The 52-second 1080 x 1920 H.264 proof compilation was uploaded and verified at `https://drive.google.com/file/d/1kqQTE43akmI5p2-1fkJRjCT_COHDvQLW/view?usp=drivesdk`.

## v3.7.24 - 2026-07-15

### Fixed
- Seller Hub snapshot extraction now reads Sales, Feedback, Traffic, and Advertising from their exact Overview cards instead of nearby page-wide values.
- Last 31 Days sales change preserves eBay's Up/Down direction, including negative changes.
- Joined feedback values such as `261Positive` are parsed correctly.
- A bounded card wait and one automatic reload handle intermittent Seller Hub card omissions; a second omission stops with a partial-data warning.
- eBay snapshot dashboard rows now persist Advertising Clicks and ROAS without shifting existing columns.

### Verification
- Four focused Seller Hub snapshot contracts and all 62 automated contracts pass.
- Signed-in Profile 2 v3.7.24 matched the visible eBay cards exactly: `$10.87` today, `$1,029.39` in 7 days, `$7,134.87` in 31 days, `-9.6%`, `$21,401.74` in 90 days, feedback `261 / 3 / 0`, traffic `4,747,733 / 22,811`, and advertising `709 / $721.28 / 19.55`.
- Advertising cost remained blank because eBay did not display a cost value on the source card.
- Apps Script deployment `@25` saved the final extension run to dashboard row 2, history row 6, and sync receipt row 41 for computer `0` / FAK12.
- Exact evidence is preserved in `evidence/profile2-ebay-snapshot-v3724-2026-07-15/`.
- A 45-second, phone-friendly MP4 proof was uploaded to Google Drive and its file metadata was verified.

## v3.7.23 - 2026-07-15

### Fixed
- Minimized floating panels now restore their saved mode and position in one coordinated read, preventing stale drag coordinates from leaving the compact panel in the middle of a page.
- Minimized and Side modes are explicitly docked to the right viewport edge.

### Added
- A persisted bottom-right resize control for every marketplace floating panel.
- A working three-dot Panel settings menu with Dark, Light, Graphite, and Signal themes, the existing transparency slider, and a layout reset command.
- Panel position, mode, and size in settings backup/restore.

### Verification
- Focused panel and foundation contracts and all 58 automated contracts pass.
- Clean install/update, universal release, parser, manifest, configuration, and package checks pass.
- Signed-in Profile 2 verified Graphite at 75%, persisted movement and approximately `358 x 585` resizing, normal reload persistence, and minimized right-edge docking.
- The exact E-05 rerun refreshed the already-saved note's profit row without another eBay Save. Exact sheet readback found one matching row in each profit tab and one new sync receipt.
- A redacted 1080 x 1920 phone proof video was visually checked and uploaded privately to Google Drive.

## v3.7.22 - 2026-07-14

### Fixed
- eBay profit title selection now ignores hidden notification-center `/itm/` links that appear before the actual sold item in the DOM.
- The visible sold-item `/itm/` link wins even when eBay has loaded unrelated offer notifications into the page.

### Verification
- A captured regression case places a hidden `OFFER EXPIRED` item before the visible sold item.
- All 54 automated contracts and the universal release/package checks pass.
- Signed-in Profile 2 v3.7.22 refreshed the existing saved order without another eBay Save. Exact readback found one matching row in each profit tab with the visible EZY DOSE title and one successful sync receipt.

## v3.7.21 - 2026-07-14

### Fixed
- eBay profit records now prefer the visible product link whose URL identifies the real `/itm/` listing.
- Navigation labels such as `Skip to main content` can no longer become the saved item title.
- When the saved eBay note already exactly matches the verified Amazon data, GLDN can refresh the existing profit row without reopening or saving the eBay note again.

### Verification
- Regression fixtures prove that a real eBay item link wins over skip links and same-title page anchors.
- A matching-saved-note contract proves that row refresh remains separate from the first-save approval boundary.
- The live v3.7.20 Save produced one exact financial/evidence row; v3.7.21 must update that same row with the real product title without creating a duplicate.

## v3.7.20 - 2026-07-14

### Fixed
- eBay profit preparation now decodes the visible EcomSniper `Custom label (SKU)` and requires an exact match to the Amazon order ASIN set.
- Amazon copies for eBay now include the verified order ID, exact order-details URL, order-card source, and freshness evidence.
- Mismatched, extra, missing, stale, checkout-only, or changed-order supplier data stops before GLDN opens or fills an eBay note.
- eBay profit rows now carry SKU, ASIN, Amazon order number, match source, Amazon URL, and serialized supplier evidence.
- The dashboard's existing platform + computer + order upsert behavior is covered by a duplicate-collapse regression test.

### Verification
- Exact positive, mismatched ASIN, extra ASIN, missing SKU, changed URL, stale capture, and unverified-page cases pass.
- The order-note approval boundary still prevents profit sync before eBay Save.
- All 50 automated contracts pass.
- Signed-in Profile 2 mismatch, positive Save-boundary, and exact sheet readback proof remain required before E-05 is promoted to live pass.

## v3.7.19 - 2026-07-13

### Fixed
- Existing eBay notes are now read from the exact `My note` container instead of from duplicate page text.
- The preview shows the actual saved note value, not the repeated `My note` label.
- Edit targeting and existing-note extraction now share the same one-Edit scoped container.

### Verification
- The signed-in order `18-14818-27804` dry-run resolves one Edit control and the exact saved note `5.68 - 7.16 - f9132 - 6/30`.
- The exact Amazon order card produced `$7.17`, ASIN `B09Z61G77L`, and ETA `6/30`; the real eBay textarea received `5.68 - 7.17 - F9132 - 6/30`.
- Clipboard equality passed, eBay Save remained untouched, and the profit-history readback returned zero matching rows before Save.
- All 42 automated contracts and the universal release/package check pass.
- Live evidence is preserved in `evidence/profile2-ebay-order-note-v3719-2026-07-13/`.

## v3.7.18 - 2026-07-13

### Fixed
- Amazon order-detail capture is now scoped to the one order card matching the order ID in the page URL.
- Grand Total, delivery date, product title, ASIN and shipping match data come only from that verified card.
- Recommendation prices, recently viewed products and injected tool UI can no longer enter an eBay order-note payload.
- If the exact order card cannot be verified, the extension stops instead of falling back to stale checkout data.

### Verification
- The regression fixture reproduces the live `$7.17` order alongside unrelated `$19.96` and recommendation ASIN data.
- All 42 automated contracts pass, including the eBay Add/Edit note approval boundary.
- Signed-in Profile 2 must still prove the corrected Amazon review modal and the real eBay note textarea with eBay Save untouched.

## v3.7.17 - 2026-07-13

### Fixed
- Existing eBay order notes now use their scoped Edit control; new notes still use More actions > Add note.
- Filling a note no longer writes a profit row before eBay Save.
- Profit sync waits until the eBay note box closes and the saved note is visible on the order.
- An existing note that already matches is not duplicated in profit history.

### Verification
- Focused contracts cover Add note, Edit note, textarea targeting, no early sync, and the no-Save boundary.
- Signed-in Profile 2 must prove exact Amazon/eBay identity, matching clipboard and textarea values, and an untouched eBay Save button.

## v3.7.16 - 2026-07-13

### Fixed
- Prepare Order Note no longer mistakes GLDN Ops' editable preview textarea for eBay's Add note textarea.
- The fill step excludes all GLDN-owned textareas and prefers eBay controls labeled for Add note or note-to-self use.
- Ambiguous pages with multiple unrelated textareas now stop instead of filling the wrong field.

### Verification
- Focused order-note contracts cover preview exclusion, exact Add note selection, ambiguity stops, clipboard copy, and the no-Save boundary.
- The release check now runs every `tests/*.test.js` contract instead of an older partial list.
- Signed-in Profile 2 must prove the exact generated note appears in eBay's Add note box while eBay Save remains untouched.

## v3.7.15 - 2026-07-12

### Fixed
- Mark as Shipped now handles eBay confirmation dialogs that omit the numeric selected count.
- The fallback uses only the exact pre-confirm count that already passed checked-row, master-checkbox, complete Results-total, and enabled-Shipping validation.
- Missing or mismatched pre-confirm evidence remains a hard stop, and Continue is never clicked automatically.

### Verification
- Regression coverage accepts one exact pre-confirm selection when the dialog count is absent.
- A mismatched pre-confirm count is rejected.
- Signed-in Profile 2 must reach and remain at the one-order confirmation before this repair passes.

## v3.7.14 - 2026-07-12

### Fixed
- Mark as Shipped no longer depends exclusively on eBay rendering an `N orders selected` sentence.
- When that sentence is absent, selection is accepted only if every visible order-row checkbox is checked, the master checkbox is checked, checked rows equal the complete awaiting Results total, and Shipping is enabled.
- The workflow still stops at eBay Continue and waits for explicit action-time approval.

### Verification
- The regression reproduces the live one-order layout with no selected-summary text.
- Partial rows, an unchecked master control, and disabled Shipping all remain hard stops.
- Signed-in Profile 2 confirmation proof is required before E-01 can pass again.

## v3.7.13 - 2026-07-12

### Fixed
- The eBay floating-panel Dashboard button now uses the setup code saved in the active Chrome profile.
- Popup and floating-panel Dashboard controls use the same background-owned opener as dashboard sync.
- Opening the visible dashboard no longer depends on an empty public `dashboardKey` value.

### Verification
- All 31 automated contracts pass, including the saved-profile Dashboard opener regression.
- Universal release and JavaScript parser checks pass.
- Signed-in Profile 2 opened the rendered dashboard twice from the v3.7.13 eBay panel using the saved setup.
- The page showed current FAK12 seller, listings, and shipping sections with no dashboard console errors.

## v3.7.12 - 2026-07-12

### Fixed
- Mark as Shipped now waits for eBay's awaiting-order count to settle after the success message appears.
- A stale pre-action Results count can no longer misclassify an exact completed shipment as `Partial`.
- Completion remains count-gated: awaiting before, selected, marked, and remaining must agree before the result is synced.

### Verification
- The regression suite reproduces eBay showing `2 orders have been marked as shipped` while the stale Results count still reads `2`, and requires the workflow to keep waiting.
- The v3.7.11 live action marked exactly 2 of 2 orders and left 0 awaiting, exposing this timing race before v3.7.12.
- Signed-in Profile 2 no-orders stability, corrected dashboard history, receipt, and Tasks readback are required before E-01 is presented for approval.

## v3.7.11 - 2026-07-12

### Fixed
- Mark as Shipped no longer clicks eBay's consequential Continue button automatically.
- The workflow verifies that eBay selected every awaiting order before opening confirmation.
- The confirmation stays open in an explicit `awaiting-approval` phase until action-time approval is received.
- Completion requires exact selected, marked, and remaining counts; partial results are logged as `Partial` instead of `Completed`.
- Successful results sync before/selected/marked/remaining counts and check only the matching computer's `Mark All New Orders as Shipped` task.

### Verification
- Focused Mark as Shipped contracts pass 4/4, including the no-Continue-click guard.
- Signed-in Profile 2 live confirmation, action-time approval, result, dashboard/history/receipt, and Tasks readback are still required.

## v3.7.10 - 2026-07-12

### Fixed
- Corrected the meaning of eBay's Premium Store `10,000` figure: it is a monthly zero-insertion-fee allowance, not a cap on current active listings.
- Store allowance usage now uses eBay's monthly used counter instead of active listings.
- Seller quantity and seller dollar limits are evaluated and synced separately.
- Missing allowance data can no longer become numeric zero or a false `GOOD` result.
- Dashboard/history rows include exact Store used/left and seller quantity used/limit fields.

### Verification
- Regression tests use the captured `7,670` active, `3,925 / 6,075` Store allowance, `9,880 / 88,000` seller quantity, and `$473,834.67 / $1,000,000` dollar values.
- Signed-in Profile 2 live proof passed with Store `3,992 / 10,000`, seller quantity `9,916 / 88,000`, dollar `$475,263.31 / $1,000,000`, and exact Sheets readback.

## v3.7.9 - 2026-07-12

### Fixed
- Store allowance parsing now selects the offer that matches the account's explicit subscription limit.
- Missing values no longer display as zero.
- eBay Qty is reported as available item quantity without inventing an out-of-stock listing rate.
- Listing-limit sync now updates the matching Tasks rows with timestamps and numeric formatting.
- Listing dashboard writes avoid full-column formatting on every sync, and queued retries no longer display as hard failures.

### Verification
- Requires two signed-in Profile 2 scans and exact dashboard, history, receipt, and Tasks readback.

## v3.7.8 - 2026-07-12

### Fixed
- Reload Extension now refreshes existing marketplace tabs from the newly restarted background worker.
- Reload no longer depends on a timer owned by an invalidated content script.

### Verified
- Release checks confirm the background reload request is durable and marketplace tabs are refreshed after restart.

## v3.7.7 - 2026-07-12

### Fixed
- Poshmark profit rows now prefer the signed-in closet URL when detecting the account.
- Poshmark logo, search, sell, and icon labels can no longer be mistaken for an account name.

### Verified
- Regression coverage reproduces the live `poshmark-logo` failure and resolves it to `igivegreatdeals`.
- Existing profit rows are updated by order number when the corrected account is re-saved.

## v3.7.6 - 2026-07-12

### Fixed
- Added the missing Reload Extension control to the Amazon workflow panel.
- Renamed the existing eBay, Poshmark, and popup controls consistently to Reload Extension.
- The in-extension control reloads the current unpacked GLDN Ops installation without opening or selecting another Chrome profile.

## v3.7.5 - 2026-07-11

### Fixed
- Poshmark profit handoff no longer gets stuck when Amazon order history does not index the decoded ASIN.
- Amazon order lookup now tries narrow title phrases before a shorter-title and ASIN fallback.
- Search attempts are tracked per Poshmark order so the same failed query is not resubmitted in a loop.

### Verified
- Supplier cost remains blocked until the Amazon order-details page contains the exact decoded ASIN and item-row cost.
- Regression tests cover query order, uniqueness, and ASIN fallback.

## v3.7.4 - 2026-07-11

### Fixed
- Poshmark profit payloads now require exact per-ASIN Amazon order-detail evidence instead of accepting a copied total alone.
- Amazon order lookup now submits Amazon's own order-search form when the decoded ASIN is not present in loaded cards.
- Multi-item Poshmark orders can accumulate exact item costs from more than one Amazon order before profit is calculated.
- Poshmark account, ASINs, Amazon order IDs, match sources, order URLs, and item evidence are saved with each profit row.
- Linked Poshmark Amazon costs are locked to the exact order-detail item rows and cannot be replaced by an overlay or edited total.
- Queued Poshmark profit writes now report background syncing instead of a false failure.

### Verified
- Automated tests reject stale, mismatched, incomplete, and manually changed Amazon totals.
- Automated tests accept exact single-item and multi-order bundle evidence and preserve the ASIN-to-order audit trail.
- Signed-in Profile 2 ten-order evidence remains required before this feature gate is marked live.

## v3.7.3 - 2026-07-11

### Fixed
- Legacy Poshmark history cleanup now removes contiguous duplicate rows in batches instead of issuing one sheet operation per row.
- A Poshmark stats record that safely enters the durable retry queue now reports background syncing instead of a dashboard failure.

### Verified
- The migration fixture reproduces the live 18-row history and removes 15 duplicates in three batches.
- Direct same-day Profile 2 saves remain covered by the daily-history regression suite.

## v3.7.2 - 2026-07-11

### Fixed
- Poshmark statistics now keep exactly one history row per computer per Chicago calendar day.
- Repeated same-day scans update the existing row and continue comparing against the prior day's final snapshot.
- Existing same-day duplicate history rows are reduced to the newest snapshot and daily deltas are rebuilt.

### Verified
- Automated tests cover same-day repeat saves, next-day deltas and legacy duplicate repair.
- Apps Script deployment 16 passes the live dashboard contract at the existing dashboard URL.

## v3.7.1 - 2026-07-11

### Added
- Live panel health now reports deployment mode, settings schema, migration-backup count, and queued dashboard records.

### Verified
- eBay and Poshmark health can now prove the local foundation state directly from the signed-in marketplace pages.

## v3.7.0 - 2026-07-11

### Added
- One shared computer/account configuration layer with settings schema 2 and migration backups.
- Durable dashboard retry queue with exponential backoff, unique sync IDs and duplicate-proof Apps Script receipts.
- Local extension manager that discovers unpacked installs, reloads the correct Chrome profiles, snapshots versions and restores without touching `config.js`.
- Dependency-free staged updater with preflight validation and automatic rollback.
- Dashboard queue status, retry control and richer identity/operation diagnostics in the popup.

### Changed
- Local unpacked deployment is the supported release path; Chrome Web Store, CRX policy and Windows click-helper paths are retired.
- Dashboard setup code is stored in Chrome storage and Apps Script properties instead of tracked source.
- Computer `0` derives eBay `FAK12` and Poshmark dashboard computer `7` from the same map.
- Tasks metric alerts now cover all four seller metrics and tracking warns only below 85%.

### Verified
- Shared foundation and migration tests pass.
- Failed dashboard writes queue and retry without data loss in the automated harness.
- Live dashboard duplicate receipt test wrote exactly one row and returned `duplicate: true` on the second request.
- Live Tasks row 17 readback cleared the stale warning for all tracking values at or above 85% while computer `7` remained gray.

## v3.6.21 - 2026-07-11

### Fixed
- Floating GLDN panels now stay reachable when Chrome reports a zero or invalid controlled viewport.

## v3.6.20 - 2026-07-11

### Fixed
- Amazon order history is no longer misread as an order confirmation when it contains "ORDER PLACED" text.
- No-match Poshmark ASIN scans now keep the correct no-match status instead of showing a stale copied Amazon total.

## v3.6.19 - 2026-07-10

### Fixed
- Poshmark profit matching now opens Amazon order history instead of Amazon's order search, because Amazon order search does not reliably find ASINs.
- Amazon order-history matching now finds exact ASINs in non-cancelled order cards and opens the matching order details page.

## v3.6.18 - 2026-07-10

### Fixed
- Poshmark title detection now correctly skips field labels followed by values, including "Size: Preemie".
- This fixes the v3.6.17 regex boundary issue.

## v3.6.17 - 2026-07-10

### Fixed
- Poshmark profit modals no longer treat lines like "Size: Preemie" as the item title.
- Item title selection now skips field labels with values before looking for the product title.

## v3.6.16 - 2026-07-10

### Fixed
- Amazon ASIN matching now ignores ordinary Amazon search/navigation links that only contain the ASIN as the search term.
- Valid Amazon product/order item links still match by `/dp/ASIN`, `/gp/product/ASIN`, or Amazon order item `asin=` parameters.
- This preserves the wrong-order guard from v3.6.15 without over-blocking valid Amazon order search results.

## v3.6.15 - 2026-07-10

### Fixed
- Amazon Orders search matching now rejects broad page-level matches that pair a Poshmark SKU ASIN with the wrong order details link.
- Linked Poshmark profit capture now blocks Review & Copy Amazon Info when the opened Amazon order does not contain the exact decoded SKU ASIN and item cost.
- Amazon panel status now clearly reports when the exact ASIN is missing from the opened Amazon order.

## v3.6.14 - 2026-07-10

### Changed
- Popup reload control is now named Apply Local Update.
- eBay and Poshmark reload controls show the active version before requesting reload.
- eBay and Poshmark pages refresh after reload requests so the visible panel can confirm the active version.
- Reload requests are recorded in diagnostics with version and source URL.

## v3.6.13 - 2026-07-10

### Fixed
- Amazon product price detection now ignores injected EcomSniper/GLDN UI and reads the real Amazon buy-box/product price.
- Poshmark profit Amazon order-detail matching now rejects EcomSniper overlay blocks such as "Sell it for" before reading item cost.
- Added a regression fixture where EcomSniper shows a markup price and the real Amazon item row has a different cost; the profit path must use the real Amazon cost.

## v3.6.12 - 2026-07-09

### Fixed
- Amazon copied info is now saved under the exact Poshmark order number as well as the latest payload.
- Poshmark profit capture reads the order-keyed Amazon payload before refusing the match.
- Chrome storage writes now surface real save errors instead of showing a copied status after a failed save.

## v3.6.11 - 2026-07-09

### Fixed
- Amazon order-detail pages are no longer misclassified as order confirmation pages.
- Linked Poshmark profit capture now uses the exact ASIN item-row cost in the Review modal instead of stored checkout/order totals.
- If no exact ASIN item-row cost is found for a linked Poshmark order, the Amazon Review modal opens with a blank total instead of guessing.

## v3.6.10 - 2026-07-09

### Fixed
- Poshmark profit matching now anchors Amazon order-detail cost extraction to the exact decoded SKU ASIN link.
- Multi-item Amazon orders now use the smallest matching item block around that ASIN, avoiding nearby unrelated item prices.
- If an exact ASIN row is not found, Poshmark profit matching stops instead of falling back to title-only guessing.

## v3.6.9 - 2026-07-09

### Fixed
- Poshmark profit matching now continues from Amazon Orders search into the matched Amazon order details page.
- Amazon copy now uses the matched item-row price for Poshmark profit instead of the whole Amazon order total.
- The Poshmark release test now covers the full SKU ASIN -> Amazon Orders -> order details -> item cost -> profit review path.

## v3.6.8 - 2026-07-09

### Fixed
- Poshmark profit matching now provides an ASIN-driven handoff: when Amazon info is missing or stale, the match screen opens Amazon Orders search for the decoded EcomSniper SKU ASIN.
- The Poshmark profit guide no longer tells operators to copy arbitrary Amazon info first; the Poshmark order now starts the match and drives the Amazon lookup.

## v3.6.7 - 2026-07-08

### Fixed
- Poshmark profit matching now decodes the marketplace SKU into the Amazon ASIN and requires the copied Amazon payload to contain that matching ASIN.
- Amazon copy now stores detected ASINs from the Amazon order/checkout page.
- The Poshmark match-needed screen shows decoded SKU ASINs so the operator can search/open the exact Amazon item.

## v3.6.6 - 2026-07-08

### Fixed
- Poshmark order-profit capture no longer accepts stale "latest Amazon info" from another order.
- Poshmark now creates a pending match context for the current order, and Amazon copy attaches its total/ETA to that exact Poshmark order.
- Profit review only opens when the Amazon payload is linked to the current Poshmark order number.

## v3.6.5 - 2026-07-08

### Fixed
- Marketplace profit saves now update the existing Platform + Computer + Order Number row instead of appending duplicates.
- Re-saving visible Poshmark sales now cleans duplicate order rows in both `Marketplace Profit History` and `Profit - <computer>`.
- Later full order-profit captures preserve and update the same order row rather than creating a second row.

## v3.6.4 - 2026-07-08

### Fixed
- Poshmark visible-sales capture now reads the real Poshmark sales table `Price` and `Earnings` columns instead of requiring each row to contain `Your Earnings` text.
- The Poshmark release test now uses a table-shaped sales fixture so missing visible-sale earnings fails the release gate.

## v3.6.3 - 2026-07-08

### Fixed
- Poshmark stats now save into visible `Poshmark Stats Dashboard` and `Poshmark Stats History` tabs in the Tasks workbook.
- The live Apps Script dashboard deployment now writes to the fixed Tasks spreadsheet ID instead of a stale script-property spreadsheet.
- Poshmark stats saves now preserve the full parsed stat set, including followers, sales, shares, sold listings, total earned, and total ratings.
- Amazon review and eBay order-note review popups can now be dragged like the other review modals.

## v3.6.2 - 2026-07-08

### Changed
- Computer `0` is now treated as a combined eBay/Poshmark profile: eBay workflows still sync as `0 / FAK12`, while Poshmark stats, visible-sales, and profit capture sync as computer `7 / FarPosh`.
- Poshmark page panels now show `0 + 7` for this combined profile instead of blocking Poshmark actions.

### Fixed
- Updated the Poshmark release gate so future builds verify the `0 -> 7` Poshmark dashboard mapping.

## v3.6.1 - 2026-07-08

### Fixed
- Poshmark stats, visible-sales, and order-profit capture now run only on computer `M0` or `7`.
- Poshmark workflows now block on eBay-only computers instead of syncing stats to the wrong dashboard slot.

### Added
- Added a release-check gate that fails if the Poshmark computer guard is removed.

## v3.6.0 - 2026-07-07

### Added
- Added Chrome Web Store packaging with `tools/build-webstore-zip.ps1`.
- Added `docs/CHROME_WEB_STORE_SUBMISSION.md` with submission steps, listing copy, permission justifications, and test gates.
- Added `docs/PRIVACY_POLICY.md` draft for Chrome Web Store submission.
- Added popup dashboard setup-code storage for Web Store installs.

### Changed
- Removed the popup's GitHub ZIP update path. Store installs should auto-update through Chrome after release approval.
- Dashboard sync now reads a saved per-profile setup code first, then falls back to built-in config only for local/internal builds.
- `config.example.js` no longer includes the private dashboard key by default.

### Notes
- Web Store packages must not include local helper scripts, CRX update metadata, private keys, or the dashboard setup code.
- A dashboard setup code must be saved once per Chrome profile after Store install.

## v3.5.1 - 2026-07-07

### Added
- Added **Copy Full Diagnostic Report** to the popup. The report includes manifest permissions, saved computer/account identity, dashboard health, EcomSniper route state, pending EcomSniper workflow state, latest marketplace records, and recent error logs.
- Added **Settings Backup** controls to copy/restore computer, Amazon profile, UI, listing-limit, and Move .99 category settings before updates or profile moves.
- Dashboard setup now creates and formats `Profit - <computer>` sheets for every computer label up front.
- Added the configured EcomSniper extension ID to the shipped config so EcomSniper page routing works without Chrome's blocked extension-management permission.

### Fixed
- Aligned EcomSniper manual-click and bulk-workflow timeouts so a slow manual **Extract Sellers** click does not expire the bulk workflow first.
- EcomSniper manual-click failures now write diagnostic state instead of only showing a generic timeout.
- Diagnostic report generation now tolerates malformed dashboard URLs instead of crashing.

## v3.5.0 - 2026-07-07

### Changed
- Made the default extension path Chrome Store-compatible by removing `management` permission and the localhost helper host permission.
- Changed EcomSniper automation to manual-click mode: GLDN Ops pauses for one EcomSniper **Extract Sellers** click, then continues after it detects the click.
- Normal install/update launchers no longer start or restart the Windows local click helper.
- Feature Health Check now reports EcomSniper page routing and manual click mode instead of helper status.
- EcomSniper pages now open from the configured known extension ID instead of scanning installed extensions.

### Notes
- The local click helper scripts remain local-only/internal and are not part of the Chrome extension rollout path.

## v3.4.27 - 2026-07-07

### Added
- Added double-click launchers for install, update, local helper startup, and diagnostics.
- Added `Diagnose-GLDN-Ops.cmd` / `tools/diagnose.ps1` to check Chrome, Git, dashboard sync, helper status, and Chrome profile extension coverage.
- Added a cross-computer release test plan.
- Added Poshmark Capture Visible Sales to log visible sale rows into profit history before full Amazon-cost matching.

### Changed
- Update now uses Git when available and falls back to the GitHub ZIP while preserving local `extension/config.js`.
- Feature health checks now derive the eBay account from the saved computer instead of trusting stale saved account text.
- eBay Seller Hub snapshot scanning now waits and scrolls before reading sales, feedback, traffic, and advertising cards.
- Install/update docs now use the simpler double-click flow instead of Chrome policy as the default path.

### Fixed
- Fixed Windows Chrome path detection in install/update/diagnostic scripts.
- Fixed PowerShell diagnostic boolean handling so the diagnostic runs cleanly.

## v3.4.26 - 2026-07-06

### Added
- Added Poshmark stats review and Poshmark sale profit capture.
- Added eBay Seller Hub snapshot review for sales, feedback, traffic, and advertising values.
- Added dashboard sync actions and sheets for eBay snapshots, Poshmark stats, and marketplace profit.
- Added Feature Health Check for dashboard connection, EcomSniper detection, helper status, and saved identity.
- Added per-computer marketplace profit tracking.

### Changed
- Poshmark tools are available outside computer 7 so M0 can still use Poshmark workflows.
- Local click helper is now optional for EcomSniper. When it is unavailable, the workflow waits for a manual Extract Sellers click.
- Tasks sheet metric colors and CHECK warnings now use the same threshold rules.

### Fixed
- Fixed EcomSniper workflow continuation crashing on an undefined pending state.
- Fixed manual EcomSniper Extract Sellers clicks not advancing page progress consistently.
- Fixed Poshmark stats crashing because the computer label reader was outside the script scope.
- Fixed eBay snapshot review crashing on an undefined sales change variable.
- Fixed stale metric validation reaching into the grey Poshmark-only Tasks column.
- Fixed the Tasks sheet `Check Performance...` row showing raw TRUE/FALSE text instead of real checkboxes.
- Fixed the live Tasks tracking row so values at or above 85% no longer stay orange or trigger a CHECK warning.

## v3.4.25 - 2026-07-06

### Fixed
- Seller Level scan now reads the eBay Seller Level box even when it is below the visible part of the page.
- Tracking uploaded on time is only warning below 85%.
- Computer selection now controls the eBay account automatically, and computer 7 is treated as FarPosh / Poshmark-only.

## v3.4.24 - 2026-07-05

### Added
- Internal diagnostic starter now supports Non-.99 cleanup mode with `?mode=non99`.

## v3.4.23 - 2026-07-05

### Added
- Internal Move .99 starter can auto-continue from scan summary into the existing apply flow for live diagnostics.

## v3.4.22 - 2026-07-05

### Added
- Added an internal Move .99 starter page so Codex can start the live workflow after installing a local diagnostic build.

## v3.4.21 - 2026-07-05

### Added
- Move .99 now records a diagnostic snapshot when eBay's Category dialog does not expose the expected primary Store category controls.

## v3.4.20 - 2026-07-05

### Fixed
- Move .99 now derives Active Listings page count from the visible Results range when eBay does not show the normal page counter.
- Move .99 now tolerates and closes the filter drawer if eBay leaves it open after **See results**.

## v3.4.19 - 2026-07-05

### Fixed
- Move .99 now continues leftover listings when eBay caps the selected Bulk Edit workspace at 200 listings.
- Move .99 resumes the next saved batch after the user manually approves and submits the current eBay review screen.
- Store category selection now retries by clicking the selected-category row/chevron and accepts an already-selected destination category.

## v3.4.18 - 2026-07-05

### Changed
- Moved **Get Latest Update** to the top of the popup above the guide/instructions card.

## v3.4.17 - 2026-07-05

### Added
- Added **Move Non-.99 Out of Sale** cleanup workflow.
- The cleanup scans the configured sale category and moves listings whose price does not end in `.99` back to the configured non-sale source category.

## v3.4.16 - 2026-07-05

### Fixed
- Move .99 now uses page-sized Bulk Edit batches for every scanned page instead of trying to carry selections across pages in one eBay Bulk Edit workspace.
- Move .99 now clicks the selected Store category row when eBay opens the category modal with the picker collapsed.

## v3.4.15 - 2026-07-05

### Fixed
- Changed **Get Latest Update** to use the direct GitHub codeload ZIP URL to avoid stale archive downloads.

## v3.4.14 - 2026-07-05

### Fixed
- Move .99 no longer stops solely because eBay reports a filtered count that does not match the unique item IDs scanned after all available pages were scanned.

## v3.4.13 - 2026-07-05

### Added
- Added **Get Latest Update** in the popup to open the latest GitHub ZIP download for unpacked installs.

## v3.4.12 - 2026-07-05

### Fixed
- Changed the CRX update URL to direct `raw.githubusercontent.com` hosting to avoid Chrome update redirect issues.

## v3.4.11 - 2026-07-05

### Fixed
- Fixed Move .99 popup launches using a different source-category URL format than the eBay workflow expected.
- Made Move .99 filter-apply detection tolerate eBay accounts that do not show the same filter chip text.

### Added
- Added a visible **Instructions** card at the top of the popup.
- Added a standalone in-extension full feature guide page.

## v3.4.10 - 2026-07-05

### Fixed
- Fixed GitHub ZIP unpacked installs failing with `Could not load javascript 'config.js'`.
- The extension now loads the included safe default config file, while CRX builds inject the live dashboard values during packaging.
- GitHub ZIP installs now include the shared dashboard connection in the loaded config file.

## v3.4.9 - 2026-07-05

### Fixed
- Fixed the popup **Open Move .99 Workflow** button so it starts the saved Move .99 scan instead of only opening Active Listings.

### Added
- Added a full feature guide in `docs/FEATURE_GUIDE.md`.
- Added an in-extension feature guide section.
- Updated the extension icon set.

## v3.4.8 - 2026-07-05

### Added
- Added local helper health reminder in the extension popup.
- Added popup-only access for less common workflows:
  - Start Bulk Listing Workflow
  - Start Sniping Workflow
  - Open Move .99 Workflow
- Added 60-day per-computer bulk product history so the same Amazon product is not reused too soon on the same computer.
- Added local helper support for automatic EcomSniper Extract Sellers clicks without Chrome debugger permission.
- Added installer/update scripts for new computers:
  - `tools/install.ps1`
  - `tools/update.ps1`

### Changed
- Removed rarely used workflow buttons from the floating daily eBay/Amazon panels:
  - Scan / Move .99
  - Bulk Listing Workflow
  - Sniping Workflow
- Changed eBay bulk extraction next-page handling to navigate with the pagination URL when available instead of scrolling/clicking the page control.
- Bulk Listing Workflow now skips clothing/shoes-style Amazon products before opening eBay.

### Fixed
- Fixed false-positive EcomSniper progress when the label changed from `0 new` to `+0 new`.
- Fixed helper coordinate rejection by clamping screen coordinates before sending them to the local click helper.
- Added retry recovery for stalled local helper click attempts.
- Fixed fresh installs treating placeholder dashboard values as a real Apps Script connection.

### Known Limits
- Bulk Listing Workflow is partially live-tested: Amazon handoff and the first EcomSniper helper click worked, but a full multi-page/product run still needs verification after v3.4.8.
- The local helper must be running on each computer for automatic EcomSniper clicks.
