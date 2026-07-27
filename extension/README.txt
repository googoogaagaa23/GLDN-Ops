GLDN Ops v3.11.6

v3.11.6 complete Update & Reload behavior:
- Update & Reload always activates the verified files, even when the disk and running versions already match.
- Only the requesting tab refreshes. Every unrelated work tab remains untouched.

v3.11.5 update isolation repair:
- Update & Reload, Reload Current Files, and rollback now refresh only the tab that requested the action.
- Other open eBay, Amazon, Poshmark, Walmart, EcomSniper, and ordinary webpage tabs are never refreshed in bulk.
- An old content script retires its controls and asks for a manual refresh instead of interrupting the page automatically.
- Automatic shared-folder runtime updates activate the new background worker without refreshing any webpage.

v3.11.4 profit-worker Reset repair:
- Historical Poshmark profit Reset now deletes its saved checkpoint before trying to close a stale worker tab.
- Worker-tab closure is best effort, nonblocking, and bounded to 750 ms.
- An abandoned worker tab can no longer keep Update & Reload blocked after Reset.

v3.11.3 bounded Reset repair:
- Reset now clears saved workflow state and responds immediately instead of waiting on every old marketplace tab.
- Best-effort panel cleanup is limited to active tabs and each tab notification is bounded to 750 ms.
- One stale eBay, Poshmark, Amazon, Walmart, EcomSniper, or ordinary webpage can no longer freeze the Reset control.

v3.11.2 approval and host-page isolation repair:
- Mark as Shipped now stops before activating eBay's Mark as shipped command and requires explicit approval for the exact selected count.
- If eBay then shows Continue, GLDN Ops stops a second time and requires a fresh approval before Continue; the extension never clicks Continue itself.
- Unknown or interrupted shipment outcomes fail closed and cannot silently restart the workflow.
- Adds confirmed Reset to the universal panel so abandoned local workflow state can be cleared without opening a marketplace page.
- Removes generic health-status CSS selectors that could leak into eBay, Poshmark, Amazon, Walmart, EcomSniper, or ordinary webpages.

v3.11.1 updater handshake repair:
- Authenticates Chrome's no-Origin extension service-worker requests with the exact runtime extension ID and Chrome request shape.
- Rejects ordinary website origins and still resolves only the exact unpacked GLDN Ops folder reported by Chrome.
- Adds Stop Task and confirmed Reset controls to the Poshmark panel so a stale local checkpoint cannot strand every other workflow.

v3.11.0 reliability and live-launch release:
- Locks one workflow or review at a time and defers Update & Reload until the extension is idle.
- Stamps resumable workflow state with the running version so an update cannot resume old code paths in a stale tab.
- Keeps Move .99 bound to one exact tab and workspace, with bounded recovery and an untouched final eBay Submit approval stop.
- Pauses Poshmark historical profit backfill safely across extension updates and resumes only after an explicit request.
- Retires unreliable GLDN-controlled EcomSniper extraction and Bulk Listing automation; GLDN opens and observes handoff tabs only.
- Removes local-helper checkpoints and misleading EcomSniper seller-count or completion claims.
- Reduces idle marketplace polling and escapes saved history values before rendering them in extension HTML.
- Preserves saved computer identity, dashboard connection, Store categories, themes, transparency, layout, history, and updater snapshots.
- Resolves the exact unpacked folder loaded by the requesting Chrome profile, so Update & Reload cannot update a disconnected copy.
- Existing computers normally use Update & Reload. Run the newest updater setup once only on a computer whose existing updater is proven unable to update Chrome's loaded folder; Chrome profile settings remain intact.

v3.10.5 marketplace theme isolation:
- Stops GLDN themes from setting generic `data-theme`, `color-scheme`, and short CSS variables on eBay, Poshmark, Amazon, Walmart, EcomSniper, or ordinary webpages.
- Keeps the selected theme and color scheme scoped to GLDN panels, modals, popup, onboarding, and guide pages.
- Cleans theme settings left on an open marketplace page by older GLDN content scripts after refresh.
- Adds host-page isolation regression coverage; the complete automated suite passes 237/237.

v3.10.4 Move .99 completion and update recovery:
- Finishes the final filtered verification page from the filtered Results total instead of a stale account-wide page count.
- Refreshes an invalidated eBay tab automatically after an unpacked-extension update instead of leaving dead Ready controls.
- Creates and binds the exact Move .99 tab atomically in the background.
- Locks final review to that exact tab, records only a trusted operator Submit click, and advances only after an explicit eBay result.
- Stops as approval-lost without navigation, another workspace, or another batch when the review outcome is ambiguous.
- Stops safely on eBay interruption or bot-challenge pages and uses slower randomized navigation pacing.
- Keeps dashboard setup in Chrome profile storage instead of public release files.

v3.10.3 Computer 2 Store category repair:
- Defaults FANCYFI Move .99 to SNI, SNIPO v2 -> DAILY.
- Migrates only the old generic Computer 2 defaults and preserves genuine custom settings.
- Keeps reverse sale-category IDs scoped to the reverse run so they cannot overwrite forward settings.
- Reverse mode remains approval-gated and requires a fresh M0 `BALK -> BEST SELLERS` live review before it is called live-ready.

v3.10.2 truthful EcomSniper handoffs:
- Removes the unsupported Start Bulk Listing Workflow control.
- Reports only verified seller-extraction state and GLDN-opened EcomSniper tab lifecycle.
- Never claims Bulk Poster progress or completion; Stop GLDN Assist affects only GLDN state.

v3.10.1 Windows installer compatibility:
- Accepts stable release metadata with or without a UTF-8 BOM on Windows PowerShell 5.1.
- Publishes new stable metadata without a BOM.
- Supersedes the v3.10.0 installer that stopped before updater registration on the first public-machine run.

v3.10.0 automatic verified updates:
- Installs one hidden, no-admin updater per Windows computer.
- Update & Reload downloads the published stable release, verifies SHA-256 and manifest version, snapshots the current files, preserves dashboard configuration and Chrome storage, and reloads.
- Reload Current Files restarts the installed version without downloading anything.
- Version Recovery restores a selected local snapshot and reloads while keeping Chrome profile settings and saved .99 categories.
- Chrome profiles sharing the stable extension folder detect a disk-version change and reload once with loop protection.
- The updater is loopback-only and cannot perform marketplace actions.

v3.9.4 cross-computer Move .99 filter repair:
- Treats the filtered Results total and populated listing table as authoritative instead of unrelated Seller Hub progress indicators.
- Derives scan pages from the filtered total instead of an account-wide page counter that eBay can leave stale.
- Recognizes eBay result ranges that use hyphens, en dashes, or em dashes.
- Learns and saves numeric Store category IDs after the first successful named-category filter.

v3.9.3 Move .99 launch repair:

- Stamps popup-started and internal Move .99 runs with the active extension version before opening eBay.
- Prevents a new Move .99 run from being deleted as stale and falling straight back to Ready.
- Adds a launch-order regression covering the exact cross-computer failure seen in v3.9.2.

v3.9.2 automatic dashboard connection:

- Seeds the private dashboard connection on install, Chrome startup, worker startup, and popup open.
- Removes the per-profile dashboard code field and adds one Repair Automatic Connection control.
- Repairs stored dashboard settings from the private package before every dashboard operation.
- Keeps the private setup code out of public source and public release bundles.

v3.9.1 historical profit sync reliability:

- Replaces the blocking browser confirmation with an in-panel two-step approval.
- Keeps the exact-only background approval token and excludes every ambiguous result.
- Refreshes the review after dashboard handling so Already synced and the disabled sync button are accurate.
- Live Profile 2 proof confirmed one idempotent row in both destination profit tabs with zero duplicates.

v3.9.0 historical Poshmark profit backfill:

- Adds Current sale only, Pilot 10, New since last sync, Last 90 days, and All sales scopes.
- Exposes the same Start, Resume/Open Review, and Pause controls from the visible Poshmark panel.
- Uses one resumable worker tab to index Poshmark sale details and exact Amazon order-item costs.
- Allocates each purchased Amazon unit once and quarantines ambiguous or missing evidence.
- Stops at review with zero dashboard writes until Sync Exact Profits receives separate approval.
- Keeps checkpoints locally so a closed worker tab can be recreated with Resume.

v3.8.4 zero-transparency and currency update:

- Extends every review-window transparency control from 0% to 100%.
- Makes the modal shell, inner information surfaces, controls, pattern, and backdrop fully clear at 0%.
- Formats Poshmark sales and earnings as USD with dollar signs, commas, and cents.
- Formats large Poshmark count values with thousands separators without changing saved numeric data.

v3.8.3 review-window visibility update:

- Gives every review window its own transparency control from 25% to 100%.
- Makes the window shell, information tables, fields, lists, and secondary controls translucent while keeping text readable.
- Lets operators drag every review window by its title and resize from the lower-right corner.
- Saves each window's opacity, position, and size independently in the current Chrome profile.
- Double-clicking a review-window title resets its saved position.

v3.8.2 expanded theme library:

- Adds a centralized 49-theme catalog: 6 GLDN core themes, 23 current Limited Edition themes, and 20 retired Limited Edition themes.
- Uses original CSS-only palettes and patterns; no external images or copied artwork are bundled.
- Groups the selector into Core, Limited Editions, and Retired Editions with an instant three-swatch preview.
- Applies the saved theme to the floating panel, popup, onboarding, guide, and review windows.
- Keeps theme selection in Chrome profile storage so local extension updates preserve it.

v3.8.1 Poshmark visible-sales reliability update:

- Replaces the unreadable warning-colored sales list with a compact, high-contrast table across all themes.
- Saves every visible Poshmark sale in one idempotent dashboard batch instead of one slow request per row.
- Shows the exact batch count, disables duplicate clicks while saving, and queues the complete batch if the dashboard is temporarily unavailable.

v3.8.0 onboarding and interface update:
- First-use tour covers all 21 catalog features and can be skipped or restarted.
- Feature Tour and Feature Guide are available from the popup and panel settings.
- Review windows share transparency controls and saved resizing.
- Midnight and Crimson join Light, Dark, Graphite, and Signal.
- Ordinary webpages receive safe global controls without marketplace-changing actions.
- A successful GOOD listing-limit review checks the matching Tasks checkbox; non-GOOD results stay unchecked with a detailed note.

v3.7.99 dashboard queue live probe:
- Adds an explicit eBay-only F-09 probe that forces one harmless timeout through the production sync failure path.
- Verifies one queued sync ID, duplicate suppression, a real dashboard ping retry, and an empty final queue.
- Refuses to run when existing queued records are present and records zero marketplace actions and zero dashboard mutations.

v3.7.98 restricted-page clipboard fallback:
- Adds a trusted-click copy fallback for eBay pages where the Clipboard API returns an empty readback.
- Records whether export used direct navigator readback or the standard execCommand copy path.
- Keeps the structured JSON length and zero-action record available for external exact clipboard verification.

v3.7.97 trusted F-11 export verification:
- Replaces the blocked automatic clipboard probe with a visible Verify F-11 Diagnostic Export button.
- The trusted click copies and reads back the exact structured record before the probe can pass.
- The temporary verification control removes itself after success and remains retryable after a clipboard error.

v3.7.96 F-11 export readback:
- The controlled diagnostic probe now exports its exact verified production log record to the clipboard.
- The probe reads the clipboard back byte-for-byte and cannot pass unless the export matches.
- The visible result distinguishes log/export success from a clipboard failure and still records zero marketplace actions.

v3.7.95 F-11 diagnostic log proof:
- Adds an explicit eBay-only controlled-failure probe with a required confirmation token.
- Routes page logs through the background logger so timestamp, page, phase, computer, account, version, message, and detail survive in one record.
- Verifies the exact saved log record and records zero marketplace actions before reporting a pass.
- Keeps Full Diagnostic Report export wired to the same production error log.

v3.7.94 U-03 verified feature guides:
- One canonical guide catalog now generates both the GitHub guide and extension guide.
- All 20 feature groups include prerequisites, exact steps, approval stops, expected outputs, recovery, matrix references, and honest evidence labels.
- Partial, pending, and unproven features are no longer described as fully working.
- The responsive extension guide passed desktop and mobile overflow, ID, index, and status-label audits.

v3.7.93 U-02 advanced popup cleanup:
- Workflows, Status, and Settings now live in three persistent tabs.
- Reload Extension and Open Guide stay at the top of the popup.
- Move .99, reverse cleanup, EcomSniper workflows, Poshmark, diagnostics, dashboard setup, backup/restore, limits, and Amazon profile controls remain available.
- Graphite and Signal themes now have complete popup contrast rules.
- All 164 automated contracts and the exact HTML/CSS visual audit pass.
- Direct automated access to Chrome's privileged extension page is blocked by Chrome, so the final popup click-through must be confirmed manually in the installed profile.

v3.7.92 T-06 strict task completion:
- Existing seller-metric, listing-limit, and Mark as Shipped completion hooks remain exact and computer-specific.
- Move .99 checks its Tasks row only after a final zero-remaining and zero-failed verification scan.
- Review screens, partial batches, reverse cleanup, bulk listing, sniping, and second-round checks never auto-check a task.
- The production boundary probe uses and deletes a temporary sheet and performs zero marketplace actions.

v3.7.91 T-04 stale task warning proof:
- The three daily search checks warn only after more than 3 days and remain clear when checked.
- Sniping uses the newest saved computer timestamp and shows NEED TO SNIPE only after more than 5 days.
- Legacy Last Sniped timestamps and computer labels are preserved.
- Subscribe & Save shows CHECK beginning one calendar day before month end.
- The authenticated live probe deletes its temporary tab and performs zero marketplace actions.

v3.7.90 T-03 Tasks metric warning proof:
- Late shipment is orange above 1.5% and red at 3% or higher.
- Tracking is orange only below 85%; transaction defects and unresolved cases are red only above zero.
- The authenticated live probe uses and deletes a temporary sheet, while the production refresh changes only the four metric rows.

v3.7.89 C-04 failure recovery proof:
- Adds a guarded forced-timeout diagnostic that runs the production recovery function.
- Requires pending-checkpoint cleanup and an exact Chrome-storage readback before reporting a pass.
- Records zero marketplace actions and never clicks EcomSniper during the probe.

v3.7.88 Sniping launch diagnosis:
- Restores Amazon-to-background workflow messaging.
- Shows and saves the exact generated eBay tab or exact launch error.
- Keeps the workflow status visible while the scan starts.

v3.7.87 exact scan-window ownership:
- Creates the inactive eBay scan beside the Amazon tab that started it.
- Prevents another Profile 2 window from receiving the scan.

v3.7.86 seller-review recovery:
- Restores the read-only review from saved state on the exact Amazon owner tab.
- Survives listener timing races and page reloads.

v3.7.85 exact review-tab ownership:
- Pins each Sniping run to the Amazon tab that started it.
- Prevents older duplicate Amazon tabs from receiving the review after a restart.

v3.7.84 background C-03 operation:
- Opens the generated eBay seller scan as an inactive tab.
- Returns the review to the existing Amazon tab without stealing focus.
- Lets the operator continue using other applications and Chrome tabs during the scan.

v3.7.83 Amazon seller review reliability:
- Returns C-03 to the exact signed-in Amazon anchor tab after the eBay candidate scan.
- Closes the generated eBay search only after Amazon confirms the read-only review is visible.
- Reuses one Amazon overlay when a stale scan also finishes.

v3.7.82 sniping review reliability:
- Moves seller identity confirmation into a lightweight read-only extension tab.
- Caps the eBay candidate search at 60 visible results and waits for stable rendering before scanning.
- Closes the generated results tab after candidate capture so EcomSniper handoff does not leave a heavy eBay page running.
- Keeps the exact title, image, variant, 70% markup, positive-profit, and no-listing safeguards.

v3.7.81 select-all label guard:
- Safely ignores unlabeled eBay checkboxes while finding the exact Bulk Edit header control.

v3.7.80 virtualized Bulk Edit selection:
- Trusts eBay's native selected-item counter when the grid mounts only a few rows.
- Uses the exact Select all items for bulk edit checkbox.
- Stops repeated clicks from clearing a valid full-batch selection.

v3.7.79 exact-item publish workspaces:
- Scans the complete filtered Active Listings inventory before any category change.
- Creates eBay Bulk Edit workspaces from only the verified .99 item numbers, capped at 500 rows.
- Avoids submitting an unchanged 2,000-row workspace and preserves the final approval stop.

v3.7.78 current eBay confirmation:
- Accepts eBay's exact `Category updated in 100 listings` completion message.
- Still requires 100 native selections, 100 Category-eligible listings, and the configured destination.
- Leaves Submit untouched for user approval.

v3.7.77 eBay draft verification:
- Cross-checks the destination Store category on every selected row if eBay's confirmation toast disappears.
- Separates eBay's 2,000-listing workspace count from the exact 100-listing selected batch count.
- Stops with Submit untouched after the selected drafts are verified.

v3.7.76 memory-safe Move .99 batches:
- Opens eBay's required 1-2,000 edit range but stops lazy-loading at roughly 500 rendered rows.
- Selects at most 100 verified .99 listings per direct review batch so eBay does not lock while updating hundreds of individual checkboxes.
- Never uses Select all when part of a 2,000-listing workspace is intentionally left unloaded.
- Repeating an approved batch starts from the smaller remaining source inventory.

v3.7.73 lightweight 2,000-row price scan:
- Uses in-memory row identities for the saved 1-2,000 range instead of forcing rendered-text/layout reads on every eBay row.
- Yields to Chrome every ten rows while collecting exact title/price fingerprints.
- Shows separate loaded, price-reading, and selection phases without touching listing fields early.

v3.7.72 low-pressure Move .99 exclusion pass:
- Reuses the verified 2,000-row checkbox map after Select all when eBay keeps the same controls mounted.
- Waits longer after each exclusion and pauses after every five changes.
- Updates the panel in checkpoints instead of after every checkbox change.

v3.7.71 paced Move .99 row updates:
- Changes one checkbox at a time and verifies eBay's selected counter before moving on.
- Pauses after Select all and after each ten exclusions so the 2,000-row editor stays responsive.

v3.7.70 responsive 2,000-row Move .99 selection:
- Fully loads and verifies the selected eBay Edit listings range before touching row checkboxes.
- Uses one native Select all action and excludes only verified non-.99 rows when that requires fewer mutations.
- Cross-checks the exact selected total against eBay's own counter before Store category can open.

v3.7.69 exact-item Move .99 workspaces:
- Scans every filtered Active Listings page and saves each exact item number before any edit.
- Creates eBay Bulk Edit workspaces directly from only the verified qualifying IDs, in publishable batches of at most 500.
- Recovers automatically when eBay rejects an oversized workspace because listings with variations are capped at 500 per submission.
- Avoids the unstable 2,000-row virtual-table scan while preserving Store-category isolation and the stop before Submit.

v3.7.68 replacement-table recovery:
- Reacquires eBay's current Bulk Edit table and observer before and after every 50-row request.
- Continues safely when eBay replaces the virtual table during a long range scan.

v3.7.67 complete-block pacing:
- Waits for all 50 rows from one eBay lazy-load request to arrive and remain stable before requesting the next block.
- Prevents overlapping block loads on slower Chrome renderers.

v3.7.66 calibrated Bulk Edit observer timing:
- Dwells at the top for 500 ms so eBay sees the lazy-load sentinel leave view.
- Exposes the bottom sentinel for 250 ms, then immediately retreats; the live Profile 2 calibration loaded exactly one 50-row block.

v3.7.65 paced Bulk Edit loading:
- Exposes eBay's lazy-load observer for one short task, then immediately retreats before another block can chain-load.
- Primes the first non-scrollable row block without adding table padding or leaving layout changes behind.

v3.7.64 stable eBay admission reconciliation:
- Prefers the stable native selected/Submit count over an earlier processing count.
- Scans every row eBay actually admits and records listings eBay declares unrevisable instead of inventing coverage.

v3.7.63 current eBay Bulk Edit readiness:
- Accepts the native exact Submit count after rows mount when eBay omits the older listings-processed message.
- Cross-checks that count against the requested range before scanning or changing anything.

v3.7.62 background-first Move .99 recovery:
- The background worker clears incompatible unfinished Move .99 state before marketplace tabs reload.
- Page and background writes both stamp Move .99 state with the running extension version and update time.

v3.7.61 update-safe Move .99 recovery:
- Every saved Move .99 state is stamped with the extension version and refresh time.
- An unfinished state from an older build is cleared instead of auto-resuming and freezing newly reloaded eBay tabs.

v3.7.60 single-block observer pulse:
- Removes persistent table padding and exposes eBay's real lazy-load observer for only 35 ms per cycle.
- Prevents replacement observers from staying visible and chain-loading an entire 2,000-row workspace at once.

v3.7.59 background-tab progress repair:
- Gives Bulk Edit animation-frame settling a bounded timer fallback so Chrome cannot pause the scan indefinitely when the tab is not foregrounded.
- Keeps the bounded observer pulses and exact 2,000-row safety checks from v3.7.58.

v3.7.58 bounded Bulk Edit loading:
- Pulses eBay's real lazy-load observer for one layout cycle per row block instead of leaving it transformed.
- Inspects fixed-window virtual rows on every poll so progress does not wait for the DOM row count to change.
- Keeps the exact 2,000-row inspection, selected-count reconciliation, and untouched Submit gate.

v3.7.57 Bulk Edit observer-position repair:
- Temporarily moves eBay's actual lazy-load observer into the table viewport at the bottom of each load cycle.
- Restores every observer's original inline layout after scanning.
- Keeps the exact 2,000-row inspection and untouched Submit gate.

v3.7.56 Bulk Edit lazy-loader repair:
- Adds temporary bottom viewport room so eBay's real intersection observer enters the Bulk Edit scroller and requests later row blocks.
- Restores the original table layout after scanning.
- Keeps v3.7.55's exact every-row and selected-count safety gates.

v3.7.55 direct eBay Bulk Edit range scan:
- Replaces the drifting multi-page Active Listings prerequisite with eBay's exact Edit listings 1-2,000 range workflow.
- Inspects every admitted Bulk Edit row, selects only exact .99 prices, and rejects any row-count or selected-count mismatch before changing a category.
- Changes only the primary Store category and leaves final Submit untouched until operator approval.
- After an approved, explicitly confirmed Submit, restarts from the first remaining source range so shifted listings cannot be skipped.

v3.7.54 live inventory-drift recovery:
- Restarts a clean full Move .99 scan when eBay's filtered listing total changes on any scan page.
- Refreshes the authoritative total and page count, clears partial page records, and retries at most twice.
- Preserves the exact full-scan and stop-before-Submit safety gates.

v3.7.53 complete Bulk Edit row matching:
- Saves title and price for every listing in the verified Active Listings scan, not only qualifying rows.
- Retriggers eBay's Bulk Edit intersection sentinel until every admitted row is loaded.
- Matches ID-free Bulk Edit rows against the verified title/price inventory and selects only qualifying fingerprints.
- Stops before any category change when duplicate fingerprints mix target and non-target listings or any row is unmatched.

v3.7.52 verified-scan recovery:
- Run Move .99 detects a verified first-range checkpoint left behind by a frozen tab.
- Releases the dead owner and restores the saved scan summary instead of starting over.
- Requires the operator to review the totals and click Apply again before category work resumes.

v3.7.51 large Seller Hub freeze repair:
- Limits the eBay Edit-range menu scan to actionable controls instead of every div and span on the page.
- Reads menu text before performing visibility checks and avoids forced layout measurements while the Edit menu opens.
- Uses a cooperative polling interval while preserving exact 2,000-listing range matching.
- Keeps the saved item-ID scan and the stop-before-Submit approval gate intact.

v3.7.50 exact 2,000-listing Move .99 ranges:
- Saves M0 / CLICKNCARRY Store categories as BEST SELLERS -> BALK.
- Keeps the full exact item-ID scan, then partitions the verified order into eBay's 1-2,000, 2,001-4,000 and final partial Edit ranges.
- Clears each Bulk Edit range and selects only the exact saved item numbers in that range.
- Stops safely on unreadable IDs, incomplete range scans or selected-count mismatches.
- Changes only the primary Store category and still pauses before final Submit.

v3.7.49 guarded Sniping workflow:
- Adds Start Sniping Workflow to the Amazon panel's three-dot settings for direct exact-product starts.
- Requires an exact Amazon ASIN and exact eBay item before seller qualification.
- Requires at least 70% markup, positive conservative estimated profit, and manual title/image/variant checks.
- Excludes apparel, shoes, costumes and fashion products using the shared product policy.
- Captures one EcomSniper winner with verified 30-day and 90-day sold counts, then opens Product Hunter.
- Compares the exact Amazon supplier item and eBay winner, calculates the exact $0.05 undercut and estimated profit, and stops at a read-only pre-list review.
- Never creates, edits or submits a listing from the Sniping workflow.

v3.7.48 Product Hunter title safety:
- Adds Filter Titles & Open Product Hunter to the popup.
- Filters EcomSniper's copied scanner titles before Product Hunter using the same exclusion rules as Amazon Best Sellers.
- Blocks apparel, shoes, costumes, cosplay, outfits and fashion accessories; removes exact duplicate titles.
- Shows kept, excluded and duplicate counts and leaves only accepted titles on the clipboard.
- The live C-02 sample retained 5 valid titles and blocked 6 disallowed titles before import.

v3.7.47 verified EcomSniper counts:
- Separates the latest extraction step from the complete multi-step run.
- Requires after total minus before total to equal EcomSniper's reported new-seller count.
- Saves the original run total, final run total, total new sellers, and verified step count.
- Clarifies the previous proof: first step 892 to 946 (+54); complete run 892 to 1,607 (+715).

v3.7.46 helper-free EcomSniper automation:
- Automatically targets EcomSniper's visible Extract Sellers button on eBay search-result pages by semantic label.
- Continues only after EcomSniper changes its own new/total seller count; missing, stale, wrong-page, and timeout states stop safely.
- Removes the Windows local-click-helper requirement without adding Chrome debugger or extension-management permissions.
- Stop and Reset cancel the full Amazon/eBay extraction queue before another page can open.
- Writes the 60-day duplicate-product history only after a confirmed seller extraction and recovers unprocessed reservations from interrupted older queues.
- Signed-in Profile 2 changed 892 total to +54 new / 946 total on the first step, then completed the remaining steps at a final global total of 1,607.

v3.7.41 verified-scan recovery:
- Returns an interrupted first Bulk Edit batch to the exact saved scan summary.
- Preserves the complete inventory audit and avoids a needless full rescan after a tab closes or crashes.
- Recovery is allowed only before any batch has been submitted live.

v3.7.40 Store category picker repair:
- Targets eBay's Primary category fieldset and stable storePrimaryCategory chooser directly.
- Recomputes Category-dialog positions before the geometry fallback so modal scrolling cannot hide the chooser.
- Keeps Apply verification and final Submit approval gating unchanged.

v3.7.39 passive Move .99 checkpoints:
- Finished scans no longer keep every eBay tab polling and competing for ownership.
- Existing saved scans migrate automatically and can resume from a healthy signed-in tab.
- Apply explicitly transfers ownership before category staging begins.

v3.7.38 clean-page inventory scanning:
- Loads each Active Listings page cleanly so eBay cannot retain rows from the prior page in the scan DOM.
- Retries one incomplete page, then safely restarts the full pass up to two times if live inventory shifts.
- Still requires the exact filtered unique-listing total before Apply.

v3.7.37 already-applied filter support:
- Continues safely when the exact source Store category is already selected and eBay disables See results.
- Closes the filter panel and verifies stable filtered totals before scanning.

v3.7.36 Active Listings counter repair:
- Matches the normalized All filters counter text used by eBay, including All filters (1).
- Keeps the complete-inventory scan and final approval stop unchanged.

v3.7.35 Active Listings filter repair:
- Recognizes eBay's title-cased All filters button during Move .99 and reverse scans.
- Keeps the same complete-inventory scan and final approval stop.

v3.7.34 one-listing batch support:
- Handles audited pages containing exactly one category match in eBay's single-listing Revise editor.
- Verifies the embedded item ID matches the saved audit before changing Store category.
- Stops with Revise it visible and untouched for final approval.

v3.7.33 stable filtered-count scan:
- Waits for eBay's filtered Results total and pagination to remain stable before scanning.
- Ignores the stale account-wide Active Listings heading after a Store category filter.
- Safely restarts page 1 when eBay finishes changing the filtered total.

v3.7.32 reverse workflow access:
- Adds Move Non-.99 Out of Sale to the eBay panel's three-dot settings menu.
- Keeps both category workflows out of the everyday button stack.
- Uses the same complete-scan and approval-stop safety path as the popup launcher.

v3.7.31 single-tab Move .99 ownership:
- Assigns each Move .99 or reverse cleanup run to one exact eBay tab.
- Prevents duplicate Active Listings tabs from racing through or overwriting the same saved scan.
- Safely transfers ownership only if the original owner tab no longer exists.
- Starts standalone workflows with a fresh run ID and owner tab before any scan can resume.

v3.7.30 reverse category scan safety:
- Forces Move Non-.99 Out of Sale to stop at the complete scan summary before any category change.
- Rejects missing or malformed prices instead of treating them as non-.99 listings.
- Verifies reverse mode scans the saved sale category and targets the first saved non-sale source category.
- Keeps exact .99 prices and backburner items out of the reverse candidate set.

v3.7.29 Move .99 freeze recovery:
- Bounds virtualized Bulk Edit reconciliation so a missing row cannot keep an eBay tab busy indefinitely.
- Reuses short-lived deep-query scope discovery and spaces expensive grid verification checks apart.
- Reads eBay's category-update status without forcing repeated whole-page layout calculations.
- Records each E-08 category step and still leaves final Submit untouched.

v3.7.28 partial-batch recovery:
- Verifies every row eBay admits when Bulk Edit silently omits a selected listing.
- Processes only the admitted `.99` rows and defers omitted listings to final verification.
- Advances by the original saved batch size so an omission cannot shift or duplicate the next batch.

v3.7.27 advanced Move .99 access:
- Keeps Move .99 out of the everyday button stack.
- Adds Run Move .99 Workflow to the eBay panel's three-dot settings menu.
- Starts the same exact-scan and approval-stopped workflow used by the full extension page.

v3.7.26 deterministic Move .99 workflow:
- Uses one exact page-by-page scan keyed by eBay item number; the legacy Edit-all scan is no longer a launch path.
- Requires the unique inspected-item count to equal eBay's filtered listing total before any edit can begin.
- Revalidates every saved item ID, price ending, page assignment, duplicate, batch limit, and backburner exclusion.
- Targets only the primary Store category and requires eBay to confirm every selected draft changed.
- Stops with the final Submit button visible and untouched for approval.

v3.7.25 Store category configuration reliability:
- Adds Store Categories to the in-page three-dot Panel settings menu.
- Saves source names, destination name, category IDs, and backburner item IDs per eBay account.
- Rejects duplicate source names, source/destination overlap, malformed category IDs, and malformed eBay item IDs.
- Adds account-bound category backup and restore controls.
- Converts validated settings to plain Chrome storage records and verifies normalized readback after every save or restore.
- Keeps this screen settings-only: it cannot move, revise, submit, or save an eBay listing.

v3.7.24 Seller Hub snapshot reliability:
- Reads Sales, Traffic, Advertising, and Feedback from their exact Seller Hub cards instead of nearby page-wide numbers.
- Preserves Up/Down direction for the Last 31 Days change.
- Captures joined feedback counts, Listing impressions/page views, ad clicks, ad sales, and ROAS.
- Leaves unavailable values blank rather than inventing them.

v3.7.23 panel layout and appearance controls:
- Minimized panels always dock to the right edge instead of restoring a stale middle-screen position.
- Adds a bottom-right resize handle and preserves each marketplace panel size.
- Turns the three-dot control into Panel settings for theme, transparency, and layout reset.
- Adds Graphite and Signal themes alongside Dark and Light.
- Includes panel position, mode, and size in settings backups.

v3.7.22 eBay visible-item title repair:
- Ignores hidden notification-center item links when recording an eBay profit-row title.
- Prefers the visible sold-item /itm/ link from the order details page.
- Keeps the exact one-row refresh and no-second-eBay-Save behavior from v3.7.21.

v3.7.21 eBay profit title repair:
- Prefers the real eBay /itm/ product link when recording a profit-row title.
- Rejects navigation labels such as Skip to main content from marketplace titles.
- Refreshes the same profit row without another eBay Save when the already-saved note exactly matches.
- Keeps the exact ASIN, Amazon order, cost, profit, and one-row upsert behavior from v3.7.20.

v3.7.20 exact eBay profit identity guard:
- Decodes the visible eBay Custom label (SKU) into its Amazon ASIN.
- Requires an exact ASIN set, Amazon order ID, matching order-details URL, fresh capture, and verified order-card source.
- Carries SKU, ASIN, supplier order, source, URL, and evidence into the one-row-per-order profit record.
- Stops before opening or filling eBay's note when supplier identity does not match.

v3.7.19 existing eBay note scope repair:
- Reads the saved note value from its exact My note container.
- Uses the same one-Edit container for preview and Edit targeting.
- Ignores duplicate My note labels elsewhere on the page.

v3.7.18 Amazon order-detail isolation repair:
- Reads Grand Total, delivery date, product title, ASIN and recipient only from the exact order card matching the URL order ID.
- Ignores recommendations, recently viewed items and injected pricing tools.
- Stops instead of reusing cached checkout data when the exact order cannot be verified.

v3.7.17 eBay order-note safety repair:
- Uses the scoped Edit control when an eBay order already has a note.
- Uses More actions > Add note when the order has no note.
- Fills and copies the note but never clicks eBay Save.
- Defers profit sync until eBay confirms that the note was actually saved.

v3.7.16 eBay Add note targeting repair:
- Excludes GLDN's preview textarea from eBay note-box detection.
- Stops on ambiguous pages instead of filling an unrelated textarea.

v3.7.15 Mark as Shipped confirmation-count repair:
- Reuses the exact pre-confirm selected count when eBay's confirmation omits a number.
- Allows that fallback only after all checked-row, master, Results-total, and Shipping checks pass.
- Still stops before Continue and requires action-time approval.

v3.7.14 Mark as Shipped selected-count repair:
- Supports eBay layouts that no longer print an `N orders selected` summary.
- Requires every visible order checkbox, the master checkbox, the complete Results count, and enabled Shipping to agree.
- Preserves the stop before eBay Continue and exact post-action count checks.

v3.7.13 saved-profile Dashboard repair:
- Opens the shared dashboard through the background resolver used by dashboard sync.
- Uses the setup code saved in the current Chrome profile for both popup and eBay panel controls.
- Keeps the setup code out of page scripts and reports a visible error if setup is missing.

v3.7.12 Mark as Shipped completion-race repair:
- Waits for eBay's awaiting-order Results count to match the confirmed shipment before finalizing.
- Prevents a stale pre-action count from creating a false Partial result after eBay succeeds.
- Keeps exact before, selected, marked, and remaining count validation.

v3.7.11 Mark as Shipped approval and evidence repair:
- Select and verify every awaiting shipment order before opening eBay confirmation.
- Stop at eBay Continue and wait for explicit action-time approval.
- Never report Completed unless selected, marked and remaining counts agree exactly.
- Sync before/selected/marked/remaining counts and update only the matching Tasks computer.

v3.7.10 eBay limit-semantics repair:
- Treat Store used/left as the monthly zero-insertion-fee allowance counter.
- Keep active listings and available item quantity informational instead of dividing active listings by the Store allowance.
- Evaluate Store allowance usage, seller quantity usage, and seller dollar usage separately.
- Block a false GOOD result when any required counter is missing.
- Sync the exact Store allowance and seller quantity counters to the dashboard and history.

v3.7.9 listing-limit accuracy repair:
- Match Store used/left values to the explicit subscription allowance.
- Treat eBay Qty as available item quantity, not an in-stock listing rate.
- Sync under-limit status and configured limits to the Tasks Sheet.

v3.7.8 in-extension reload repair:
- The restarted background worker refreshes existing marketplace tabs after reloading GLDN Ops.
- Reload no longer depends on an invalidated content-script timer.

v3.7.7 Poshmark profit account repair:
- Profit rows prefer the signed-in /closet/ username instead of image alt labels.
- Logo, search, sell, and icon labels cannot be saved as Poshmark account names.

v3.7.6 reload control repair:
- Add a visible Reload Extension button to the Amazon panel.
- Use the same clear Reload Extension label in the eBay panel, Poshmark panel and popup.
- Reload only the current unpacked GLDN Ops install; no Chrome profile is opened or switched.

v3.7.5 Amazon order search repair:
- Search Amazon order history with narrow Poshmark title phrases before using the decoded ASIN as a fallback.
- Keep the final gate exact: only an Amazon order-details page containing the decoded ASIN and item-row cost can be copied.
- Track search attempts per Poshmark order so Amazon cannot loop on the same failed query.

v3.7.4 Poshmark profit evidence repair:
- Requires exact decoded-ASIN evidence from Amazon order details for every matched item.
- Saves Amazon order IDs, order URLs, match sources, and per-item costs with the computer 7 profit row.
- Supports exact multi-item costs across multiple Amazon orders and rejects stale or edited totals.
- Uses Amazon's own order-search form when the ASIN is not visible in loaded order cards.

v3.7.3 Poshmark stats sync reliability:
- Removes legacy same-day history duplicates in contiguous batches to reduce first-run dashboard time.
- Treats a queued Poshmark stats save as a safe background sync instead of showing a false failure.

v3.7.2 Poshmark daily stats history repair:
- Keeps one Poshmark Stats History row per computer per America/Chicago calendar day.
- Repeated scans update that day's row while preserving changes against the prior day's final snapshot.
- Cleans legacy same-day duplicates and rebuilds daily delta columns from the retained snapshots.
- Returns the history row, append/update mode, history date, prior date and removed-duplicate count for diagnostics.

v3.7.1 live foundation readback:
- Panel health now reports local deployment mode, settings schema, migration backup count and queued dashboard records.
- The background health contract exposes the migration-backup count used by the live panel proof.

v3.7.0 local foundation release:
- Uses one shared computer/account map across popup, background, eBay, Poshmark and Move .99.
- Migrates settings to schema 2 with rollback snapshots and never silently assigns a computer.
- Queues failed dashboard records with retry/backoff and server-side duplicate receipts.
- Removes private dashboard setup code from tracked source and migrates it into Apps Script properties.
- Replaces hardcoded profile/extension IDs with local Chrome-profile discovery.
- Adds dependency-free local install, update, snapshot, restore and multi-profile reload tooling.
- Fixes Tasks tracking warnings so orange/CHECK applies only below 85%.
- Adds identity, operation, settings schema and queue details to diagnostics.

v3.6.21 panel reliability fix:
- Floating panels now clamp against a fallback viewport when Chrome reports bad page dimensions.
- This keeps Amazon and Poshmark GLDN buttons reachable during cross-computer testing and automation.

v3.6.20 Amazon order-history status fix:
- Prevents Amazon order history from being misread as an order confirmation because it contains "ORDER PLACED" text.
- No-match ASIN scans now stay on order history and show the correct "No Amazon order card found" status instead of a stale copied total.

v3.6.19 Poshmark Amazon order-history lookup:
- Opens Amazon order history for Poshmark profit matching instead of Amazon's order search, because Amazon does not reliably search orders by ASIN.
- Matches exact ASINs inside non-cancelled Amazon order cards and opens the matching order details page.

v3.6.18 Poshmark item-title label fix:
- Poshmark title detection now correctly skips field labels followed by values, including "Size: Preemie".
- This fixes the v3.6.17 regex boundary issue.

v3.6.17 Poshmark item-title cleanup:
- Poshmark profit modals no longer treat lines like "Size: Preemie" as the item title.
- The modal title selection skips field labels with values before looking for the real product title.

v3.6.16 Amazon ASIN link matching fix:
- Amazon ASIN matching now ignores ordinary Amazon search/navigation links that only contain the ASIN as the search term.
- Real Amazon product/order item links still match by `/dp/ASIN`, `/gp/product/ASIN`, or Amazon order item `asin=` parameters.
- This keeps the wrong-order guard from v3.6.15 while allowing valid Amazon order search results to open.

v3.6.15 Amazon exact-order guard:
- Amazon Orders search matching now rejects broad page-level matches that pair an ASIN with the wrong order details link.
- Linked Poshmark profit capture will not open/copy Amazon info from an order-details page unless the exact decoded SKU ASIN and item cost are found.
- Amazon panel status now clearly says when the exact ASIN is missing from the opened Amazon order.

v3.6.14 local update reload:
- Popup reload control is now named Apply Local Update.
- eBay and Poshmark reload controls show the active version before requesting reload.
- eBay and Poshmark pages refresh after reload requests so the visible panel can confirm the active version.
- Reload requests are recorded in diagnostics with version and source URL.

v3.6.13 Amazon source-price guard:
- Amazon price detection ignores injected EcomSniper/GLDN UI and reads the real Amazon buy-box/product price.
- Poshmark profit matching rejects EcomSniper overlay blocks such as "Sell it for" before reading Amazon item cost.
- The release test now includes a fake EcomSniper markup price beside a lower real Amazon item cost.

v3.6.12 Poshmark Amazon order handoff fix:
- Amazon copied info is now saved under the exact Poshmark order number as well as the latest payload.
- Poshmark profit capture reads the order-keyed Amazon payload before refusing the match.
- Chrome storage writes now surface real save errors instead of showing a copied status after a failed save.

v3.6.11 Poshmark Amazon order-details override fix:
- Amazon order-details pages are no longer treated as checkout confirmation pages.
- For linked Poshmark profit capture, Review & Copy Amazon Info must use the exact ASIN item-row cost or stop with a blank total.
- Stored Amazon checkout/order totals no longer override exact Poshmark ASIN matching.

v3.6.10 Poshmark Amazon exact-ASIN item cost:
- Poshmark profit Amazon matching now requires the exact decoded SKU ASIN on Amazon order details.
- The Amazon item cost is read from the smallest item block around that exact ASIN link.
- If the exact ASIN cannot be found on a multi-item Amazon order, GLDN Ops stops instead of guessing from title text.

v3.6.9 Poshmark Amazon order-details item cost:
- Amazon Orders search now follows the decoded Poshmark SKU ASIN into the matching Amazon order details page.
- On Amazon order details, Review & Copy Amazon Info prefers the matching item row price instead of the full order total.
- This avoids using unrelated items from large Amazon orders when calculating Poshmark profit.

v3.6.8 Poshmark ASIN-driven Amazon lookup:
- Poshmark Capture Order Profit starts from the sale order and decodes the EcomSniper SKU into the Amazon ASIN.
- If no matching Amazon payload is available, click Open Amazon Orders for ASIN from the match-needed screen.
- Amazon Orders opens with that ASIN as the search term, so the operator can open the exact matching Amazon order before copying Amazon info.
- Stale Amazon info remains blocked unless the copied Amazon payload contains the decoded Poshmark SKU ASIN.

v3.6.7 SKU/ASIN-based Poshmark profit matching:
- Poshmark decodes the visible item SKU into the Amazon ASIN.
- Amazon copy stores detected Amazon ASINs from the Amazon order/checkout page.
- Poshmark profit review only opens when the copied Amazon payload contains the decoded Poshmark SKU ASIN.
- The match-needed screen shows the decoded ASIN so the matching Amazon item/order can be opened directly.

v3.6.6 Poshmark/Amazon profit matching guard:
- Poshmark order-profit capture no longer accepts stale latest Amazon info from another order.
- Click Capture Order Profit on the Poshmark order first. This creates a pending match for that exact Poshmark order number.
- Then open the matching Amazon order/checkout and click Review & Copy Amazon Info. The copied Amazon total is linked to that Poshmark order.
- Returning to Poshmark will only show profit if the Amazon payload matches the current order number.

v3.6.5 duplicate-safe profit sheet writes:
- Marketplace profit saves update the existing Platform + Computer + Order Number row instead of appending duplicates.
- Re-saving visible Poshmark sales cleans duplicate order rows in Marketplace Profit History and Profit - <computer>.
- Later full order-profit captures preserve and update the same order row instead of creating a second row.

v3.6.4 Poshmark visible-sales earnings fix:
- Poshmark visible-sales capture now reads Price and Earnings from the live sales table columns.
- The release test now covers table-shaped Poshmark sales rows.

v3.6.3 Poshmark stats destination fix:
- Poshmark stats now save into visible Poshmark Stats Dashboard and Poshmark Stats History tabs in the Tasks workbook.
- The dashboard Apps Script now writes to the fixed Tasks spreadsheet instead of depending on a stale script-property spreadsheet.
- Poshmark stats saves include the full parsed stat set, including followers, sales, shares, sold listings, total earned, and total ratings.
- Amazon review and eBay order-note review popups are movable like the other extension review modals.

v3.6.2 combined computer 0 + 7 Poshmark support:
- Computer 0 remains FAK12 for eBay workflows.
- On Poshmark pages, computer 0 is treated as 0 + 7 and Poshmark stats/profit sync to computer 7.
- Poshmark stats, visible-sales, and order-profit capture are allowed for M0, 7, and the combined 0 + 7 profile.

v3.6.0 Chrome Web Store rollout preparation:
- Adds a Chrome Web Store package builder: tools/build-webstore-zip.ps1.
- Adds Chrome Web Store submission notes, permission justifications, and privacy-policy draft under docs.
- Removes the popup GitHub ZIP update button. Chrome Web Store installs should update automatically after a reviewed release is approved.
- Adds one-time dashboard setup-code storage for Web Store installs.
- Removes the private dashboard key from config.example.js by default.
- Dashboard sync now uses the saved per-profile setup code first, then falls back to built-in config only for internal/local builds.

v3.5.1 diagnostics, backup, and EcomSniper stabilization:
- Adds Copy Full Diagnostic Report in the popup. Use this before debugging another computer because it includes saved identity, dashboard health, EcomSniper route state, pending workflow state, latest records, permissions, and recent errors.
- Adds Settings Backup controls in the popup to copy and restore computer, Amazon profile, UI, listing-limit, and Move .99 category settings.
- Dashboard setup now creates Profit - M0, Profit - 2, Profit - 6, Profit - 0, Profit - M1, and Profit - 7 sheets up front.
- Adds the configured EcomSniper extension ID to the built-in config so EcomSniper pages open without Chrome management permission.
- Aligns EcomSniper manual-click and workflow timeouts so slow manual Extract Sellers clicks do not expire the bulk workflow first.
- Logs EcomSniper timeout state into diagnostics instead of only showing a generic timeout.

v3.5.0 Chrome extension rollout correction:
- Removes Chrome Store-blocking extension permissions from the default manifest: no extension management permission and no localhost helper host permission.
- Changes EcomSniper workflows to manual-click mode for Chrome extension rollout. GLDN Ops pauses for one EcomSniper Extract Sellers click and continues after detecting it.
- Stops normal install/update launchers from starting or restarting the Windows local click helper.
- Updates popup health checks and guides so EcomSniper manual-click mode is no longer treated as a failed setup item.
- Opens EcomSniper pages by configured extension ID instead of using Chrome management permission to inspect installed extensions.

v3.4.27 cross-computer stabilization:
- Adds double-click install, update, helper, and diagnostic launchers for non-technical setup.
- Adds a diagnostic script that checks Chrome, Git, dashboard sync, EcomSniper click mode, and which Chrome profiles have GLDN Ops/EcomSniper installed.
- Fixes installer/update Chrome path detection on Windows.
- Makes the updater use Git when available and fall back to a GitHub ZIP while preserving local `config.js`.
- Derives health-check eBay account from the saved computer instead of trusting stale saved account text.
- Makes eBay Seller Hub snapshot scan wait and scroll before reading sales, feedback, traffic, and ads.
- Adds Poshmark Capture Visible Sales to log visible sale rows into profit history before full Amazon-cost matching.
- Adds the cross-computer release test checklist.

v3.4.26 stabilization candidate:
- Fixes EcomSniper continuation crash caused by an undefined pending state.
- Makes helper-click and manual Extract Sellers clicks use the same continuation path.
- Adds Poshmark page support for stats review and marketplace profit capture.
- Adds eBay Seller Hub sales snapshot review for sales, feedback, traffic and ads.
- Adds per-computer marketplace profit sync support.
- Adds dashboard tabs for eBay snapshots, Poshmark stats, and marketplace profit history.
- Updates the live Tasks sheet script so seller metrics color and CHECK warnings use the same thresholds.
- Keeps Poshmark tools available for M0 and computer 7 while still hiding eBay-only tools for computer 7.
- Adds feature health checks for dashboard, EcomSniper detection, helper status and saved identity.
- Updates the logo to the current minimal GLDN Ops mark.

v3.4.25 seller metrics and computer mapping:
- Seller Level scan reads metrics even when eBay renders the Seller Level box below the visible page area.
- Tracking uploaded on time warns below 85%, matching the Tasks sheet rule.
- Computer selection now derives the eBay account automatically.
- Computer 7 is FarPosh / Poshmark-only, so eBay-only workflows are blocked for it.

v3.4.24 internal Non-.99 cleanup starter:
- Adds `start-move99.html?mode=non99` for live cleanup diagnostics.
- Scans the sale category and moves non-.99 listings back to the configured source category, stopping at the normal Submit safety pause.

v3.4.23 internal Move .99 auto-apply:
- The internal starter can continue from scan summary into the normal apply flow without a manual click.
- The normal final eBay Submit safety pause is unchanged.

v3.4.22 internal Move .99 starter:
- Adds a local extension page that starts the saved Move .99 workflow for live testing.
- Keeps the normal eBay final Submit safety pause.

v3.4.21 Move .99 category diagnostics:
- Records visible eBay Category dialog evidence when the primary Store category controls cannot be verified.
- Keeps the workflow stopped safely before any live Submit action.

v3.4.20 Move .99 pagination/filter drawer:
- Fixes Active Listings page detection when eBay only shows "Results: 1-200 of X" instead of a page counter.
- Allows Move .99 scan to continue when eBay leaves the filter drawer visible after See results.

v3.4.19 Move .99 continuation:
- Splits large selected Move .99 batches at eBay's 200-listing selected-edit limit and resumes the remaining listings after approved Submit.
- Improves Store category picker opening when eBay shows the selected category row but keeps the picker collapsed.
- Treats an already-selected destination Store category as valid instead of failing.

v3.4.18 update button placement:
- Moves Get Latest Update to the top of the popup above Instructions.

v3.4.17 reverse sale cleanup:
- Adds Move Non-.99 Out of Sale using the saved Move .99 categories in reverse.

v3.4.16 Move .99 page batches:
- Uses page-sized Bulk Edit batches for every scanned page.
- Adds a Store category picker fallback when eBay shows Selected category with the picker collapsed.

v3.4.15 update download link:
- Changes Get Latest Update to use codeload.github.com to avoid stale GitHub ZIP downloads.

v3.4.14 Move .99 scan count tolerance:
- Stops treating eBay's reported filtered count as a hard abort when all available pages were scanned.

v3.4.13 update button:
- Adds a Get Latest Update button in the popup for unpacked-extension installs.

v3.4.12 CRX update URL fix:
- Uses the direct raw.githubusercontent.com CRX URL in update.xml to avoid Chrome update redirect issues.

v3.4.11 Move .99 filter and guide visibility:
- Fixes Move .99 popup source-category URL startup.
- Makes the source filter applied check less dependent on exact eBay chip text.
- Adds a visible Instructions card and standalone feature guide page.

v3.4.10 ZIP install fix:
- Makes GitHub ZIP installs load without requiring a separate ignored config.js file.
- Includes the shared dashboard connection in the file Chrome actually loads for ZIP installs.

v3.4.9 Move .99 popup launch fix:
- Fixes Open Move .99 Workflow so it starts the saved Move .99 scan instead of only opening Active Listings.

v3.1.6 reload, rollback and diagnostics:
- Adds a popup Reload Extension Update button and a reload.html trigger page for local update helpers.
- Adds a Diagnostics section with live popup/background/page error logs, plus copy and clear controls.
- Adds tools/extension-version.ps1 for local snapshots, version listing, restore and reload triggering.
- Adds tools/watch-extension-updates.ps1 to auto-snapshot version changes and auto-trigger extension reloads after local edits settle.
- Keeps config.js out of version snapshots so private dashboard settings are preserved locally.

v3.1.5 panel minimize and side rail:
- Adds panel controls for full, minimized and side-rail modes.
- Saves the selected panel mode per Amazon/eBay panel across page reloads.
- Keeps the logo clickable to reopen a collapsed panel.

v3.1.4 EcomSniper-assisted bulk extraction:
- Changes Bulk Listing Finder so it clicks EcomSniper's own Extract Sellers button instead of scraping/copying seller names.
- Removes the separate bulk seller list clipboard flow from the popup.
- Keeps Sniping Extract separate for markup-filtered competitor capture.

v3.1.3 eBay result parser fix:
- Adds a fallback parser for eBay results pages that expose result details as visible text blocks instead of .s-item DOM cards.
- Sniping Extract now reads seller, visible price, title and item number from the text layout.

v3.1.2 bulk vs sniping extraction split:
- Splits seller controls into the bulk EcomSniper trigger and Sniping Extract.
- Superseded by v3.1.4: bulk extraction now delegates to EcomSniper's own Extract Sellers flow.
- Sniping extraction uses Amazon price plus a default 70% minimum eBay markup rule before saving competitors.
- Amazon Search eBay Product now also captures the detected Amazon price for sniping.

v3.1.1 separated product workflows and first automation helpers:

v3.1.1 separated product workflows and first automation helpers:
- Splits product work into Bulk Listing Finder, Competitor Sniping and Product Substitution.
- Adds Search eBay Product on Amazon pages using selected text, product page title, or the first visible product card.
- Adds Extract Sellers on eBay pages to collect visible seller usernames into the Competitor Sniping seller list.
- Copies the sniping seller list for pasting into EcomSniper Competitor Scanner.

v3.1.0 Find Products to Post helper:
- Adds a guided workflow tracker for Competitor Scanner, Product Hunter and Bulk Lister.
- Saves checklist progress, seller count, scan position, copied titles, exported links, posted listing count and notes.
- Adds quick-open buttons for Amazon Best Sellers and eBay.
- Adds a Copy EcomSniper Presets button for the recommended scan/listing settings.

v3.0.1 popup category settings:
- Adds a Move .99 categories section to the extension popup.
- Saves source Store categories, destination Store category, optional source category IDs, and backburner item IDs per eBay account.
- Uses popup-saved .99 category settings first, with config.js as a fallback.

v3.0.0 branding and task-sheet update:
- Renames the extension to GLDN Ops.
- Replaces the extension icon with the juice-box cancel logo.
- Adds the Tasks row "2nd Round of Placing Orders" directly under "Snipe Items | 10 Items to Snipe Daily".
- Keeps the row-safe Tasks Apps Script changes so metric rows are found by task text instead of fragile row numbers.
- Keeps the progress/session block on the far-right Z/AA columns.

Move .99 workflow:
- Scans every filtered Active Listings page before making any category change.
- Saves item number, title, price and original page for every qualifying .99 listing.
- Shows one full-scan summary with Scan Only / Close, Download Audit and Apply Changes.
- Divides the verified listing order into eBay Edit ranges of up to 2,000 listings.
- Clears each range and selects only its exact saved item numbers before changing Store category.
- Verifies the exact selected count inside Bulk Edit.
- Opens eBay's final review screen and pauses before Submit.
- Downloads a CSV audit of found, submitted, moved and remaining listings.
- Changes only the primary Store category.
- Supports per-eBay-account .99 destination/source settings through config.js.
- FAK12 keeps its tested direct source-filter URL. Other accounts fall back to eBay's visible Store category filter unless sourceStoreCategoryIds are configured.

Dashboard update included:
- Current Seller Level and Listing Status sheets keep one latest row per computer.
- Older syncs remain in the existing History sheets.
- Existing duplicate computer rows are removed when setup runs or the next sync arrives.
- Current rows and web dashboard cards are ordered by most recent update.

Also retained:
- Dark mode and the global transparency slider.
- Built-in dashboard URL and sync key.
- Open Dashboard control in the eBay panel.
- Stop Task and Reset Automation safeguards.
- Mark as Shipped, Order Note, Seller Level and Confirm Listings Under Limit workflows.

Security note: the built-in dashboard key is stored in config.js and can be read by anyone who has access to this extension folder.


v2.9.19 panel, note, and task readiness:
- Reorders the eBay panel to Mark as Shipped, Scan Seller Level, Confirm Listings Under Limit, Scan / Move .99, Prepare Order Note, then utility controls.
- Adds an Open Dashboard button to the eBay panel.
- Makes dark mode and 75% transparency the default interface settings.
- Makes the Amazon review modal lighter so checkout totals and delivery details are less blocked.
- Copies the editable eBay note to the clipboard before opening More actions > Add note and filling the note box.
- Renames Confirm Listings to Confirm Listings Under Limit and formats listing counts and dollar amounts with commas/currency.
- Closes stale Mark as Shipped confirmation dialogs after eBay has already marked the selected orders shipped.


v2.9.18 multi-account rollout:
- Removes the FAK12-only .99 workflow lock.
- Loads Move .99 source categories, destination category, direct source category IDs, and backburner item IDs per eBay account from config.js.
- Uses the safe visible-filter workflow for accounts without known sourceStoreCategoryIds.
- Keeps the final eBay Submit pause unchanged; no listing is submitted until the owner approves.
- Adds config.example.js with the rollout configuration template.


v2.9.1 scan correction:
- Counts unique eBay item IDs across all pages instead of adding raw DOM row totals.
- Ignores duplicate/stale rows that eBay may retain during pagination.
- Deduplicates qualifying listings by item ID before building apply batches.
- Scans to the bottom of each page before declaring the page complete.


v2.9.2 page-isolation correction:
- Excludes item IDs already assigned to earlier Active Listings pages.
- Correctly treats the last page of 955 listings as 155 rows, even when eBay leaves stale 801-1000 text.
- Stops scanning immediately once the expected current-page count is reached.
- Adds a stall guard so the scanner cannot remain in a continuous loop.


v2.9.6 Store category repair:
- Stops using Bulk edit > Category because that opens eBay's marketplace Item category editor.
- Enables and uses the Store category 1 grid column, then edits only the Store category First category field.
- Leaves eBay on the final review/Submit screen and waits for owner approval before any live listing submission.


v2.9.7 Bulk Edit readiness repair:
- Accepts eBay's visible "item(s) selected" batch summary when the older "listings processed" counter is absent.
- Keeps the existing safety stop when the Bulk Edit row count does not match the selected scan batch.


v2.9.8 source-filter recovery:
- Starts the .99 workflow from the known FAK12 Not .99 + Other source-filter URL.
- Skips the brittle All filters panel workflow when eBay is already showing that source-filtered Active Listings page.


v2.9.9 dev reload control:
- Adds a small Reload Ext control to the eBay panel so future unpacked-extension updates can be reloaded from a normal eBay page.
- After this version is manually loaded once, Codex can trigger that control and refresh the eBay tab for later code changes.


v2.9.10 Store picker recovery:
- Treats eBay's auto-closing Store category picker as success when the First category field already updated to Abra Cadabra .99.
- Keeps the Done-button path for layouts that still require an explicit picker Done click.


v2.9.11 all-at-once Store category repair:
- Uses Bulk edit > Listing detail > Category once for the selected batch.
- Targets the Store category Primary category control inside that editor and selects Abra Cadabra .99.
- Keeps the older row-by-row Store category editor code only as an unused fallback, so normal runs do not step through listings one by one.


v2.9.12 grid-verified review continuation:
- Treats the all-selected Store category edit as successful when the Bulk Edit grid shows Store category 1 updated to Abra Cadabra .99 for the selected batch.
- Continues from the updated grid to Preview, then pauses on eBay's final Submit review screen.
- Keeps the older eBay toast confirmation path when that message appears.


v2.9.13 Submit pause correction:
- Stops after the Bulk Edit grid shows Submit is available instead of opening eBay's listing-preview carousel.
- Keeps the selected batch visible with Store category 1 set to Abra Cadabra .99 and waits before the live Submit action.


v2.9.14 backburner skip:
- Leaves known eBay validation failure item 318521296686 out of future .99 apply batches.
- Still counts the listing during source-category scanning so the full-scan safety checks stay accurate.


v2.9.15 selected Bulk edit routing:
- Prefers the real Bulk edit toolbar button over generic Edit controls when opening selected .99 listings.
- Stops treating navigation to a single-listing Revise page as a successful Bulk Edit launch.


v2.9.16 cross-page final batch routing:
- When 200 or fewer saved .99 listings remain, selects them across all source pages before opening one Bulk Edit batch.
- Keeps the final batch out of eBay's one-listing editor when the last source page has only a single qualifying row.


v2.9.17 eBay Edit menu detection:
- Accepts eBay's duplicated fake-menu Edit button text when selecting saved .99 listings.
- Keeps the Bulk Edit route guarded so single-listing Revise pages are not treated as success.
