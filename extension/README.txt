GLDN Ops v3.12.23

v3.12.23 updater-ready order audit release:
- Publishes the cross-profile Order Placement Audit through Update & Reload.
- Keeps the permanent Amazon profile label and completed profile scan visible after extension reloads.
- Preserves the shared July eBay demand and profile-by-profile Amazon progress without marketplace writes.
- Keeps incomplete profile coverage clearly marked partial until every expected Amazon profile is scanned.

v3.12.22 cross-profile order-placement audit:
- Builds exact monthly eBay unit demand from a completed Monthly eBay Profit run.
- Scans exact-ASIN Amazon order details separately in every signed-in Amazon Chrome profile.
- Combines those profile results through the shared dashboard without counting one Amazon order twice.
- Flags likely same-recipient duplicates, possible different-recipient extras, canceled-order purchases, and missing purchases.
- Remains read-only and never cancels, refunds, purchases, marks shipped, or edits an order.
- Profile 2 control can seed, start, resume, and read the audit without manual extension-page operation.

v3.12.21 monthly-profit visible-review release:
- Keeps the final signed-in eBay worker page open when Monthly eBay Profit reaches review.
- Closes that worker only after the reviewed month is fully synced or explicitly reset.
- Prevents stale zero-result text in eBay's SPA from overriding visible order-detail links.
- Shows a clear zero-order review message instead of silently removing the worker page.

v3.12.20 monthly-profit launch repair:
- Stops Monthly eBay Profit from deleting its own worker tab when eBay page verification fails.
- Leaves the exact failed eBay tab open and shows the real failure reason.
- Reuses that preserved signed-in tab when Resume is clicked.
- Recognizes eBay's encoded All Orders URL on layouts that do not expose selected navigation metadata.
- Finds nested All Orders and Period controls used by alternate eBay Orders layouts.
- Keeps deliberate Pause, Reset, review, and completion cleanup unchanged.

v3.12.19 monthly-profit worker recovery release:
- Detects when Chrome or eBay closes the monthly-profit worker before completion.
- Immediately changes the run from Running to a resumable Paused checkpoint.
- Shows the closure reason on the Monthly eBay Profit page instead of leaving stale progress.
- Rechecks worker existence whenever status is read or a new run is requested.
- Keeps normal review/completion closure unchanged.

v3.12.18 dual-source eBay profit release:
- Makes Read 1 a true saved-note-only calculation: note earnings minus note Amazon cost.
- Keeps Read 2 independent: visible eBay order earnings minus an exact matched Amazon order-item cost.
- Shows both results side by side without allowing one source to overwrite the other.
- Automatically normalizes deterministic money formatting mistakes in saved notes.
- Requires an editable operator confirmation when a note amount is ambiguous, inconsistent, or likely missing a decimal.
- Never changes an eBay order or note when confirming internal profit amounts.

v3.12.17 Amazon-cost resolution save release:
- Makes Save Cost Resolution Results a single explicit action instead of a hidden two-click confirmation.
- Keeps the review window visible while two durable 50-row dashboard batches finish.
- Shows a persistent saved or safely queued receipt with exact and still-open counts.
- Clarifies that the Monthly eBay Profit run remains in the eBay Chrome profile while Amazon profiles save only reconciliation receipts.
- Leaves unresolved rows open for another signed-in Amazon profile and never guesses a missing cost.

v3.12.16 Prepare Order Note recovery release:
- Saves reviewed Amazon order evidence inside GLDN Ops before attempting the optional clipboard copy.
- Lets Prepare Order Note recover the exact saved handoff when clipboard access is unavailable.
- Opens a visible recovery window for missing, stale, wrong-order, or mismatched evidence instead of appearing to do nothing.
- Still stops before eBay Save and never syncs a new note before eBay visibly saves it.

v3.12.15 policy-audit control release:
- Adds a Profile 2-only command that cancels an abandoned policy review and runs the complete read-only Active Listings scan.
- Returns exact total, no-match, review, and Block counts without exposing any listing End action.

v3.12.14 policy-audit recovery release:
- Treats eBay messages such as "Listing item is missing" as unresolved failures, never as successful listing Ends.
- Adds Cancel Review & Rescan so an abandoned or stale native eBay review cannot lock the store audit.
- Starts a new complete read-only Active Listings scan after recovery without changing any listing.

v3.12.13 policy-audit operations release:
- Exposes the complete saved Existing Listings Policy Audit state through the read-only Profile 2 control channel.
- Allows the local controller to open the detailed policy-audit page without browser URL workarounds.
- Keeps review and End evidence separate; no listing can be changed through state readback.

v3.12.12 existing-listings policy audit release:
- Scans every eBay Active Listings page read-only and verifies every reported row and unique item number before publishing an audit.
- Saves verified 200-row checkpoints so an interrupted or paused scan can resume without pretending it is complete.
- Applies the same 175 source-linked reviewed policy rules used by Listing Preflight.
- Separates No rule match, Needs review, and reviewed Block results. Needs review rows can never be selected for ending.
- Opens a visible native eBay review for only the exact selected Block item numbers, in batches of at most 200.
- Requires the exact action-time phrase APPROVE END POLICY LISTINGS N before the irreversible eBay End request.
- Rechecks the current computer/account, audit age, rule-pack fingerprint, exact Block status, completed ledger, and eBay eligibility immediately before ending.
- Stops after every approved batch. It never starts or submits a later batch automatically.
- Adds CSV audit export, completion receipts, pause/resume, and local-audit recovery controls.

v3.12.6 workflow organization and Product Hunter companion release:
- Groups advanced controls into Daily, Listings, Research, Profit, Supplier, and Poshmark lanes while keeping Status and Settings separate.
- Remembers the last selected workflow lane in each Chrome profile.
- Hides Poshmark-only controls on eBay-only computers and disables eBay-only controls on the Poshmark-only computer.
- Makes Prepare Order Note fail clearly unless an eBay order-details page is open.
- Keeps the everyday floating panel focused on daily actions; monthly profit, dashboard setup, and health diagnostics remain in its three-dot settings menu.
- Ships the separate GLDN Product Hunter v0.2.0 package with a complete read-only eBay Active Listings guard.
- Product Hunter excludes exact active SKU/ASIN matches and sends exact normalized-title matches to manual review before a link can become Ready.
- Requires a verified complete Active Listings scan or imported current CSV for the selected eBay computer before duplicate protection can be claimed.

Preserved v3.12.5 reconciliation and listing-preflight behavior:
- Requires one permanent Amazon profile name before an eBay or Poshmark missing-cost run begins.
- Displays and records the exact supplier profile plus the live pending review count.
- Skips unresolved rows already attempted by that permanent profile and leaves misses open for another signed-in Amazon profile.
- Keeps exact count-bound approval before any reviewed cost results sync to the shared dashboard.
- Preserves saved-note profit separately from independent Amazon-order profit for discrepancy review.
- Publishes 175 source-linked, human-reviewed rules derived from official eBay listing policies.
- Adds a Ready-only Product Hunter-to-Bulk Poster handoff using canonical Amazon links.
- Keeps Needs review, Blocked, duplicate, opaque, and non-Amazon inputs out of the Bulk Poster clipboard.
- Fails closed when reviewed rules are empty or unavailable.
- Does not use an eBay API, submit a listing, start Bulk Poster, or claim that a Ready result is eBay approval.
- Delivers large approved profit batches with a bounded 90-second dashboard wait so a slow Apps Script response does not strand an already-accepted batch.
- Live Profile 2 proof separated Ready, Review, and Block samples, copied only one canonical Ready Amazon URL, and opened the exact EcomSniper Bulk Poster page without starting it.
- Live Profile 2 proof opened the exact EcomSniper Scanner and Product Hunter pages, reported only observable tab lifecycle, and stopped only the GLDN-opened tab.
- The approved 29-row F9132 cost review is durably synced; zero rows remain open for that Amazon profile and the dashboard retry queue is empty.
- Other signed-in Amazon profiles remain separate reconciliation gates.
