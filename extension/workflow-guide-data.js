globalThis.GLDN_WORKFLOW_GUIDE_CATALOG = Object.freeze({
  "version": "3.12.25",
  "updated": "2026-08-23",
  "safetyRule": "Final marketplace actions require explicit action-time approval. GLDN Ops must stop before eBay Continue, eBay Save, final listing Submit, purchase, or any equivalent irreversible action unless the operator approves that exact action.",
  "statusDefinitions": {
    "LIVE PASS": "Current signed-in evidence and exact readback prove the documented result.",
    "LIVE PASS WITH BOUNDARY": "The documented result passed live, but a named external or manual boundary remains.",
    "PENDING USER REVIEW": "Recorded evidence exists, but the user has not accepted the gate.",
    "PARTIAL": "Only the stated portion is proven. Do not assume the entire workflow works.",
    "IMPLEMENTED, UNPROVEN": "Code exists, but no valid current live proof exists.",
    "IMPLEMENTED, LIVE REVIEW PENDING": "The implementation and deterministic data checks pass, but the current signed-in marketplace review still needs to be reached."
  },
  "features": [
    {
      "id": "setup",
      "matrix": "F-02, F-05, F-06, F-08, F-12",
      "title": "First-Time Setup",
      "status": "PARTIAL",
      "summary": "Configure one Chrome profile without guessing its marketplace identity.",
      "prerequisites": [
        "The credential-free GLDN Ops package is loaded unpacked in the intended Chrome profile.",
        "The operator knows the Tasks-sheet computer label."
      ],
      "steps": [
        "Open the popup and choose only the computer label.",
        "Confirm the derived marketplace account before saving.",
        "Click Save Computer.",
        "Open Status. If the dashboard is not connected in this Chrome profile, click Connect Dashboard once.",
        "Click Test Connection, then Run Feature Health Check.",
        "Copy Settings Backup before an update or profile move."
      ],
      "approvalStop": "None. Setup must not start a marketplace workflow.",
      "output": "Saved computer/account mapping, dashboard connection, health report, and settings backup.",
      "recovery": [
        "If the account is wrong, stop and correct the computer label instead of editing the derived account.",
        "If the dashboard is not connected, use Connect Dashboard once in that Chrome profile; updates preserve it.",
        "If dashboard testing fails, copy the full diagnostic report before clearing anything.",
        "A clean-computer installation is still a final deployment gate."
      ],
      "evidence": "Identity mapping and health diagnostics are live-proven in Profile 2. Saved-profile dashboard setup and credential-free packaging are contract-tested; clean-computer proof remains pending."
    },
    {
      "id": "panel",
      "matrix": "U-01",
      "title": "Floating Panel",
      "status": "LIVE PASS",
      "summary": "Use the compact everyday controls without blocking marketplace pages.",
      "prerequisites": [
        "A supported eBay, Amazon, Poshmark, or Walmart page is open."
      ],
      "steps": [
        "On an eBay Order Details page, use the always-available panel for Prepare Order Note and daily actions.",
        "On eBay Listings pages, start a workflow or press Ctrl+Shift+G before expecting the panel; it stays hidden otherwise.",
        "Use Side to dock the panel to the right edge.",
        "Use the minus control to minimize it.",
        "Drag the resize handle while expanded.",
        "Open the three-dot settings menu to change theme, transparency, or reset layout.",
        "Use Stop Task for a safe checkpoint and Reset only for abandoned state.",
        "Use Reload Ext after local files are updated."
      ],
      "approvalStop": "Panel layout actions require no marketplace approval.",
      "output": "A saved per-profile panel mode, size, position, theme, and transparency.",
      "recovery": [
        "Use Reset panel layout if the panel is off-screen or awkwardly sized.",
        "Use Reload Ext when page controls are stale after an update.",
        "If eBay navigates without a full reload, GLDN Ops re-evaluates whether the panel belongs on the new page."
      ],
      "evidence": "Profile 2 proved Graphite at 75%, persisted resize, normal reload persistence, and right-edge docking. v3.11.46 adds contract coverage for always-visible eBay order details and workflow-gated Listings pages."
    },
    {
      "id": "dashboard",
      "matrix": "F-08, F-09",
      "title": "Dashboard and Sync Queue",
      "status": "PARTIAL",
      "summary": "Open shared results and retry records that could not sync immediately.",
      "prerequisites": [
        "The computer identity is saved and Status shows the dashboard is connected."
      ],
      "steps": [
        "Open Status in the popup.",
        "Click Test Connection.",
        "Click Open Dashboard to review saved results.",
        "If the popup reports queued records, click Retry Queued Dashboard Records.",
        "Confirm the sent and remaining counts."
      ],
      "approvalStop": "None. Dashboard reads and sync retries do not authorize marketplace actions.",
      "output": "A rendered dashboard plus idempotent sync receipts or a retained retry queue.",
      "recovery": [
        "Never clear queued data to hide a failure.",
        "Copy the diagnostic report if retries remain.",
        "Retry only after confirming whether the original sync ID already succeeded."
      ],
      "evidence": "Dashboard opening and the production queue timeout path are live-proven in Profile 2. One record queued, duplicate enqueue remained one, the same sync ID retried once through dashboard ping, and the final queue was zero. Drive proof: https://drive.google.com/file/d/1Hl_ro2zabXd7zJARXkijq7IT3W6AFW0y/view?usp=drivesdk"
    },
    {
      "id": "deployment",
      "matrix": "F-01, F-02, F-03, F-04, F-14",
      "title": "Local Update and Rollback",
      "status": "PARTIAL",
      "summary": "Update the unpacked local build while preserving settings and rollback data.",
      "prerequisites": [
        "The current extension folder is known.",
        "A settings backup has been copied.",
        "No marketplace confirmation dialog is active."
      ],
      "steps": [
        "Run Update-GLDN-Ops.cmd from the project folder.",
        "Wait for validation, snapshot creation, and matching-profile reload.",
        "Refresh active marketplace tabs.",
        "Confirm the panel and popup show the expected version.",
        "Run Feature Health Check.",
        "Use the local manager rollback only for a confirmed broken release."
      ],
      "approvalStop": "A real rollback in an active signed-in profile requires explicit approval because it changes runtime files.",
      "output": "Validated local files, preserved settings, a timestamped snapshot, and reloaded matching profiles.",
      "recovery": [
        "Do not use Chrome policy or a Web Store path for this local build.",
        "If validation fails, keep the current working files and copy diagnostics.",
        "Real Profile 2 rollback remains intentionally untested."
      ],
      "evidence": "Clean install/update fixtures pass. Another physical computer and a real Profile 2 rollback remain pending."
    },
    {
      "id": "mark-shipped",
      "matrix": "E-01",
      "title": "Mark as Shipped",
      "status": "PARTIAL",
      "summary": "Select every awaiting order, pause before activating eBay, stop again at eBay's final confirmation, and sync only an exact completion count.",
      "prerequisites": [
        "The signed-in eBay Awaiting shipment page is open.",
        "The complete Results total is visible."
      ],
      "steps": [
        "Click Mark as Shipped.",
        "Wait while GLDN Ops verifies every visible row, the master checkbox, and the awaiting total.",
        "Review GLDN's exact selected count and approve only the activation of eBay's Mark as shipped action.",
        "Review eBay's own confirmation count.",
        "Approve eBay's final confirmation button only when the selected count equals the intended awaiting total.",
        "After approval, wait for eBay success and zero remaining results.",
        "Confirm the dashboard and matching Tasks checkbox update."
      ],
      "approvalStop": "STOP before activating eBay and STOP again at eBay's final confirmation. Each action requires explicit approval for the exact count shown.",
      "output": "Exact awaiting, selected, shipped, remaining, status, dashboard history, and Tasks completion.",
      "recovery": [
        "If eBay omits a confirmation number, GLDN Ops may reuse only the exact pre-confirm count.",
        "Any count mismatch stops safely.",
        "The first approved eBay Mark as shipped activation uses one trusted, hit-tested Chrome press/release; it never retries or clicks a second target.",
        "The Profile 2 local control may activate an already-open GLDN review only with the exact live-count token. A separate APPROVE EBAY CONTINUE N token is required for one trusted press/release on eBay's exact reviewed final button.",
        "A stale, duplicate, wrong-tab, wrong-page, changed-count, changed-label, ambiguous target, or failed hit-test request stops without another click.",
        "Updating to a new extension version clears an unfinished Mark as Shipped run from the older extension context.",
        "Copy diagnostics before Reset if the confirmation remains stale."
      ],
      "evidence": "Profile 2 previously completed 3 of 3 orders and read back zero remaining plus exact dashboard and Tasks rows. Computer 2 / FANCYFI on v3.11.33 verified 4 of 4 selections but exposed that the synthetic first activation did not open eBay's confirmation. v3.11.34 replaces that activation with one trusted exact-count, exact-tab, exact-page, hit-tested press/release and passes the complete 309-test JavaScript suite. A signed-in Computer 2 completion and dashboard/Tasks readback remain required."
    },
    {
      "id": "ebay-note-profit",
      "matrix": "E-04, E-05",
      "title": "eBay Order Note and Profit",
      "status": "LIVE PASS",
      "summary": "Match the exact Amazon order item to the eBay SKU, fill the note, and sync one profit row.",
      "prerequisites": [
        "The exact Amazon order-details card is open, not checkout or a product page.",
        "The matching eBay order has a visible EcomSniper Custom label SKU."
      ],
      "steps": [
        "On Amazon order details, click Review & Copy Amazon Info.",
        "Verify order ID, ASIN, item-row cost or Grand Total, ETA, and evidence source.",
        "Click Copy Amazon Info; GLDN Ops saves the reviewed handoff even when browser clipboard access is blocked.",
        "Open the matching eBay order and click Prepare Order Note.",
        "Confirm the decoded ASIN exactly matches the saved Amazon evidence.",
        "Click Fill Add Note Box or Fill Edit Note Box.",
        "Review the real eBay textarea and approve Save only when the note is correct.",
        "After eBay visibly saves, confirm one dashboard profit row."
      ],
      "approvalStop": "STOP at eBay Save. Saving the note requires explicit action-time approval.",
      "output": "Saved eBay note plus one upserted profit row with supplier order, ASIN, cost, profit, and margin evidence.",
      "recovery": [
        "Checkout, product-page, stale, wrong-order, or mismatched-ASIN evidence must fail closed.",
        "If no reviewed Amazon handoff is ready, use the visible recovery window to open Amazon Orders and review the exact order.",
        "Do not sync profit before eBay Save.",
        "An already matching saved note may refresh the same row without another Save."
      ],
      "evidence": "Profile 2 matched an exact Amazon order and ASIN, filled the real eBay note, and later read back one deduplicated profit row. v3.12.16 adds saved-handoff fallback and visible failure recovery coverage."
    },
    {
      "id": "ebay-monthly-profit",
      "matrix": "E-14",
      "title": "eBay Profit Audit",
      "status": "PARTIAL LIVE",
      "summary": "Read one eBay order month or all available history, calculate Saved-note profit from the note alone, and separately calculate Independent Amazon profit from visible eBay earnings plus exact Amazon order-item costs.",
      "prerequisites": [
        "Use the Chrome profile already signed into the intended eBay account for order collection.",
        "The saved computer identity must map to that eBay account.",
        "Set one permanent Amazon profile name in Setup in every Chrome profile used for cost reconciliation.",
        "Orders count as saved-note exact only when their existing eBay note follows earnings - Amazon cost - Amazon profile - ETA, or an ambiguous amount has been explicitly confirmed inside GLDN Ops."
      ],
      "steps": [
        "Open Workflows in the eBay Chrome profile and click Open eBay Profit Audit.",
        "Choose One month for a smaller audit or All available history for the full available eBay history range.",
        "For One month, choose the calendar month and click Read Month. For all history, click Read All History.",
        "Let the one inactive signed-in eBay worker index the selected range and open each exact order detail.",
        "Read Saved-note profit separately: saved-note earnings minus saved-note Amazon cost.",
        "Use the coverage count to see how many reviewed orders are included. Pending means no confirmed saved-note profit exists; a dollar result with incomplete coverage is a partial total.",
        "Review Independent Amazon profit separately after sync: visible eBay earnings minus an exact matched Amazon order-item cost.",
        "Allow GLDN Ops to normalize harmless money formatting mistakes. When it flags an ambiguous character, likely missing decimal, or earnings mismatch, edit the suggested values and click Confirm note amounts.",
        "Keep missing notes, unconfirmed ambiguous amounts, missing earnings, and date mismatches outside confirmed saved-note totals.",
        "Type the displayed APPROVE SYNC EBAY YYYY-MM N token for a month or APPROVE SYNC EBAY ALL N for all history only after reviewing the exact unsynced row count.",
        "Confirm dashboard delivery or a retained retry queue, then read back the computer profit sheet.",
        "In an Amazon Chrome profile, verify its permanent Amazon profile name in Setup and click Resolve eBay Amazon Costs for the corresponding unresolved rows.",
        "Review the exact supplier profile, exact matches, misses, and live pending count. Click Save Cost Resolution Results once; GLDN Ops binds that explicit action to the unchanged live count.",
        "Wait for the visible Results Saved or Results Queued Safely receipt before leaving the page.",
        "Move to each other signed-in Amazon Chrome profile and repeat. Rows already attempted by that named profile are excluded; unresolved rows remain open without becoming zero.",
        "Compare Saved-note profit and Independent Amazon profit in the shared reconciliation sheet. Missing SKU and substituted-item cases remain manual review."
      ],
      "approvalStop": "STOP at both reviews. The eBay write requires APPROVE SYNC EBAY YYYY-MM N for a month or APPROVE SYNC EBAY ALL N for all history. Each independent Amazon-profile result requires APPROVE RESOLVE EBAY COSTS N. Neither approval changes an eBay order, listing, or Amazon order.",
      "output": "A resumable selected-range checkpoint; visibly covered Saved-note earnings, cost, and profit; separate Independent Amazon earnings, cost, and profit; discrepancy status; attempted supplier profiles; and a durable unresolved queue.",
      "recovery": [
        "A deliberate Pause closes only the worker tab and preserves the exact checkpoint.",
        "A page-verification failure leaves the exact failed eBay tab open and changes the run to Paused with the real reason.",
        "Resume reuses a preserved failed worker or recreates one inactive worker when the old tab no longer exists.",
        "The final eBay page remains open at review and closes only after the selected range is fully synced or explicitly reset.",
        "An extension update pauses an in-progress run instead of mixing versions.",
        "Never guess a missing Amazon cost or substitute a current product price.",
        "Deterministic note formatting cleanup may be automatic, but uncertain dollar values require editable operator confirmation before entering confirmed totals.",
        "Confirming note amounts changes only GLDN Ops internal evidence and never edits the saved eBay note.",
        "Do not rename an Amazon profile after it has recorded attempts; use the same permanent label on that Chrome profile.",
        "The eBay Profit Audit page can correctly say No saved run in an Amazon-only Chrome profile; the eBay checkpoint remains local to the eBay Chrome profile and Amazon reconciliation receipts are written to the shared sheet.",
        "Copy diagnostics if eBay or Amazon changes its order-row, period control, Custom date range, or order-detail layout."
      ],
      "evidence": "The signed-in July 2026 eBay month and approved Amazon-profile reconciliations remain historical live evidence. v3.12.24 adds deterministic all-history range, year-rollover, per-order month preservation, clear coverage, Pending-state, and partial-profit contracts. A signed-in all-history live run remains pending."
    },
    {
      "id": "order-placement-audit",
      "matrix": "E-13",
      "title": "Order Placement Audit",
      "status": "PARTIAL LIVE",
      "summary": "Compare unit-level eBay demand with exact ASIN purchases found across every signed-in Amazon Chrome profile, then flag duplicate, extra, canceled-order, and missing purchases without changing either marketplace.",
      "prerequisites": [
        "Finish the Monthly eBay Profit read for the same computer, eBay account, and month so exact order numbers, dates, ASINs, quantities, statuses, and ship-to evidence are available.",
        "Set one permanent Amazon profile name in Setup in every Chrome profile used to place orders.",
        "List every expected Amazon profile name on the audit page so cross-profile completion can be proven.",
        "The shared dashboard connection must work in every participating Chrome profile."
      ],
      "steps": [
        "Open Order Placement Audit from the eBay Chrome profile.",
        "Choose the computer and eBay order month, enter every Amazon profile expected on that computer, and click Build From Completed eBay Month.",
        "Review the exact eBay unit count. Rebuilding this demand deliberately clears prior Amazon scans for that computer, account, and month.",
        "Open GLDN Ops in the first signed-in Amazon Chrome profile, open Order Placement Audit, choose the same computer and month, and click Scan This Signed-In Amazon Profile.",
        "Let the one inactive Amazon worker index order history and read only matching exact-ASIN order details.",
        "Wait until that profile shows review/completed and appears as scanned in Profile coverage.",
        "Repeat the same scan from every other signed-in Amazon Chrome profile used on that computer. The shared audit deduplicates an Amazon order that is visible in more than one Chrome profile.",
        "Review Duplicate, same recipient first; then Possible extra purchase, Purchased after cancel, and Missing Amazon purchase.",
        "Use the exact eBay and Amazon links to verify any flagged unit, and download the CSV for a retained audit copy."
      ],
      "approvalStop": "None. This workflow is read-only. It never cancels, refunds, marks shipped, purchases, edits, or deletes an eBay or Amazon order. Any corrective marketplace action must be handled separately with its own exact approval.",
      "output": "A shared computer/account/month audit with expected eBay units, Amazon purchase units, scanned-profile coverage, exact same-recipient duplicates, possible different-recipient extras, canceled-order purchases, unmatched demand, source links, and CSV export.",
      "recovery": [
        "Pause stops at the next Amazon page checkpoint; Resume continues the saved profile scan.",
        "If the inactive worker closes or a page cannot be verified, the checkpoint remains resumable in that same signed-in Chrome profile.",
        "Reset This Profile Scan clears only that Chrome profile's local checkpoint; completed shared results from other profiles remain saved.",
        "Save Profile List updates the expected-profile checklist without erasing completed scans.",
        "Do not call a different-recipient purchase an exact duplicate unless total Amazon units exceed total eBay demand for the ASIN.",
        "A canceled eBay order with no Amazon purchase is clean; a matched purchase for a canceled or refunded order is flagged.",
        "Missing Amazon purchase remains open until all expected Amazon profiles have been scanned."
      ],
      "evidence": "Deterministic unit-allocation tests cover exact matches, same-recipient duplicates, different-recipient extras, two legitimate customers sharing one ASIN, quantities, canceled orders, active-before-canceled allocation, missing purchases, and cross-profile deduplication. Signed-in Profile 2 seeded 101 July 2026 eBay units, preserved all 101 through an extension reload, and scanned 10 Amazon order-history pages for profile F9132 across 83 exact ASIN targets. That profile returned zero matching purchases; one exact target ASIN was also visibly searched in the signed-in Amazon account and returned no result. The remaining Amazon profiles have not been scanned, so the complete cross-profile audit is not LIVE PASS."
    },
    {
      "id": "seller-metrics",
      "matrix": "E-02, T-01, T-02, T-03",
      "title": "Seller Level and Tasks Metrics",
      "status": "LIVE PASS",
      "summary": "Read four seller metrics, review them, and update the correct Tasks computer column and warnings.",
      "prerequisites": [
        "The signed-in eBay seller performance page is open.",
        "The correct computer identity is saved."
      ],
      "steps": [
        "Click Scan Seller Level.",
        "Review transaction defects, late shipment, tracking, unresolved cases, seller level, and evaluation date.",
        "Click Save Seller Level Check.",
        "Confirm all four metrics receive timestamp notes in the correct Tasks computer column.",
        "Confirm the parent performance checkbox updates only after all four metrics save.",
        "Review CHECK warnings and threshold colors."
      ],
      "approvalStop": "Saving reviewed metrics needs operator confirmation in the review window but performs no marketplace write.",
      "output": "Dashboard current/history rows, Tasks metric values and notes, parent checkbox, and CHECK warnings.",
      "recovery": [
        "Missing values remain Not detected and must not become zero.",
        "Poshmark-only columns stay grey and empty.",
        "Copy diagnostics if the review values do not match eBay."
      ],
      "evidence": "Exact Profile 2 values, dashboard rows, Tasks H14:H18, grey Poshmark-only cells, and threshold boundaries are live-proven."
    },
    {
      "id": "listing-limits",
      "matrix": "E-03",
      "title": "Confirm Listings Under Limit",
      "status": "LIVE PASS",
      "summary": "Evaluate Store insertion allowance, seller quantity, and seller dollar limits independently, preserving near-limit warnings without confusing them with a reached hard cap.",
      "prerequisites": [
        "Seller Hub Overview is fully loaded.",
        "The Store plan and monthly dollar limit are saved."
      ],
      "steps": [
        "Click Confirm Listings Under Limit.",
        "Review active listings and available quantity as inventory information only.",
        "Review Store allowance used/left.",
        "Review seller quantity used/limit.",
        "Review seller dollar used/limit.",
        "Click Confirm Listings This Month only when all detected values match eBay."
      ],
      "approvalStop": "The review confirmation is required; it does not change listings.",
      "output": "Monthly confirmation, dashboard history, and the matching Tasks completion row.",
      "recovery": [
        "Never treat active listings as the Store insertion allowance.",
        "A 95% warning may remain visible while Under limit is still YES.",
        "Missing Store allowance or seller-dollar data cannot check the task.",
        "Reopen Seller Hub Overview if a card is incomplete."
      ],
      "evidence": "Production dashboard @38 separates near-limit warnings from hard-cap completion. The focused v3.11.29 contract passes 7/7 and the complete release gate passes 269/269. Signed-in Profile 2 retained the 98.79% warning while Tasks H20 checked with Under limit: YES; Sync Receipts row 84 confirms taskChecked true."
    },
    {
      "id": "amazon-subscribe-save",
      "matrix": "A-01",
      "title": "Cancel Amazon Subscribe & Save",
      "status": "LIVE PASS",
      "summary": "Scan only real active subscriptions for the current signed-in Amazon Chrome profile, including additional carousel cards and distinct duplicate products; exclude recommendations, require exact-count approval, cancel the reviewed set one at a time, and prove zero remain.",
      "prerequisites": [
        "The intended Amazon account is signed in in this Chrome profile.",
        "The correct Tasks computer identity is saved.",
        "Repeat the workflow separately in every Chrome profile that uses a different Amazon account."
      ],
      "steps": [
        "Open the popup and click Open Amazon Subscribe & Save.",
        "Let GLDN Ops open Manage Your Subscriptions and settle the complete page.",
        "On Amazon's newer layout, confirm All addresses is the selected scope; on the older layout, confirm the active-subscription total.",
        "Review the exact list under Your Subscriptions. Additional carousel cards and separate subscriptions for the same product remain separate. Recommended for you, Subscribe now, Add new subscriptions, and Buy it again are excluded.",
        "Type the exact count-bound token shown only when every reviewed item should be cancelled.",
        "After approval, GLDN Ops opens each reviewed subscription, clicks Cancel subscription, verifies Amazon's Cancel your subscription? dialog, leaves the optional reason unchanged, and uses Cancel my subscription once.",
        "Wait for Cancellation Confirmed after each item.",
        "Let GLDN Ops return to the manager and run a final zero-active scan.",
        "Confirm the current-profile proof in Amazon Subscribe Save History.",
        "Repeat in every other signed-in Amazon Chrome profile. A current-profile proof does not check the ALL Amazon Accounts task."
      ],
      "approvalStop": "STOP before any cancellation. The exact token APPROVE CANCEL SUBSCRIPTIONS N authorizes only the unchanged reviewed set of N subscriptions; no Amazon cancellation control is clicked before that token is accepted.",
      "output": "Exact scanned and cancelled counts, per-profile scope, zero-active proof, local result, and one shared current-profile audit row. The all-accounts Tasks checkbox remains separate.",
      "recovery": [
        "If Amazon shows sign-in, CAPTCHA, a different count, an unloaded card, or an unknown final result, GLDN Ops stops without retrying the irreversible click.",
        "Never treat Recommended for you or Subscribe now cards as subscriptions.",
        "A zero result in one Amazon profile does not prove another Chrome profile/account is clear and cannot check the ALL Amazon Accounts task.",
        "Copy diagnostics before Reset when a final cancellation result is uncertain."
      ],
      "evidence": "The updated V2 tutorial was reviewed end to end. It confirms the exact Your Subscriptions > subscription details > Cancel subscription > Cancel your subscription? > Cancel my subscription > Cancellation Confirmed sequence, optional reason behavior, carousel cards, duplicate-looking subscriptions, recommendation exclusion, and separate Chrome-profile repetition. Signed-in Profile 2 has live-proven the zero-active current-profile path; a nonzero destructive run still requires a fresh exact-count approval."
    },
    {
      "id": "ebay-snapshot",
      "matrix": "E-06",
      "title": "eBay Sales Snapshot",
      "status": "LIVE PASS",
      "summary": "Capture sales, traffic, advertising, and feedback with card-scoped values.",
      "prerequisites": [
        "Seller Hub Overview cards are visible."
      ],
      "steps": [
        "Click Scan Sales Snapshot.",
        "Review sales today, 7, 31, and 90 days plus change direction.",
        "Review traffic impressions and page views.",
        "Review advertising values that eBay actually displays.",
        "Review positive, neutral, and negative feedback counts.",
        "Click Save eBay Snapshot only when the review matches the page."
      ],
      "approvalStop": "The review save needs confirmation but performs no marketplace write.",
      "output": "Dashboard snapshot and history rows for the saved computer/account.",
      "recovery": [
        "A missing card stays blank instead of borrowing a nearby number.",
        "Reload Seller Hub once if cards are incomplete.",
        "Do not invent ad cost when eBay does not display it."
      ],
      "evidence": "Profile 2 source, review, dashboard, history, and receipt values are live-proven."
    },
    {
      "id": "store-categories",
      "matrix": "E-07",
      "title": "Store Category Configuration",
      "status": "LIVE PASS",
      "summary": "Save exact source and destination Store categories per eBay account.",
      "prerequisites": [
        "The intended eBay account is signed in.",
        "Exact Store category names are known."
      ],
      "steps": [
        "Open Store Categories from the eBay panel settings or popup Settings.",
        "Confirm the displayed eBay account.",
        "Enter exact source category names and one exact destination name.",
        "Optionally enter numeric source IDs and backburner item IDs.",
        "Click Save and Verify.",
        "Copy a category/settings backup before moving computers or profiles."
      ],
      "approvalStop": "Saving configuration changes extension settings only and must not launch a listing workflow.",
      "output": "Validated, account-bound category names, IDs, and backburner IDs preserved across updates.",
      "recovery": [
        "Duplicate, overlapping, malformed, or empty settings fail closed.",
        "Restore only a backup for the same account.",
        "Recheck exact category names after eBay renames a Store category."
      ],
      "evidence": "Profile 2 FAK12 exact categories, IDs, backup, restore, and reload persistence are live-proven."
    },
    {
      "id": "move99",
      "matrix": "E-08",
      "title": "Move .99 Listings Into Sale",
      "status": "LIVE PASS WITH BOUNDARY",
      "summary": "Scan exact item IDs, select only exact .99 listings, change only primary Store category, and pause before Submit.",
      "prerequisites": [
        "Exact source/destination categories are saved for the signed-in eBay account.",
        "The operator has reviewed any backburner exclusions.",
        "No other Move .99 run is active."
      ],
      "steps": [
        "Open Workflows in the popup and click Open Move .99 Workflow.",
        "Wait for the complete filtered Active Listings exact-ID scan.",
        "Review total scanned, qualifying, omitted, and failed counts.",
        "Apply only the verified exact-ID batches, each capped at 500.",
        "Confirm eBay's native selected count matches the intended batch.",
        "Confirm only Primary Store category changed to the exact destination.",
        "Approve Submit only for the exact reviewed batch.",
        "After the approved final eBay Submit, let the workflow stop while eBay propagates the category changes.",
        "Start a later deliberate run for any saved remaining batches only after eBay has finished updating listings."
      ],
      "approvalStop": "STOP before every eBay Submit. Each exact batch requires separate action-time approval.",
      "output": "The exact submitted batch, propagation-pending status, saved remaining-batch count, and audit data. Tasks completion still requires a later exact zero-remaining and zero-failed proof.",
      "recovery": [
        "Any incomplete scan, mixed price, selected-count mismatch, missing picker, or uncertain submit result stops safely without opening another tab or batch.",
        "A completed Submit is terminal for that run: GLDN Ops must not reopen Active Listings, rescan, or create another workspace while eBay propagates changes.",
        "If the review page disappears before a trusted Submit click, the run enters Approval Lost and requires manual reconciliation.",
        "Do not alter item specifics to force category failures through.",
        "Six known FAK12 failures remain backburnered and must not be resubmitted without new approval."
      ],
      "evidence": "Profile 2 moved 2,564 successful exact .99 listings in earlier approved batches and isolated six persistent backburner failures. The v3.10.4 read-only retest scanned 232 listings over two pages, staged 5 exact matches, and held the same Submit (5) workspace through extension reload and repeated approval checks with no new tab; Submit remained untouched. Formal Drive video is pending."
    },
    {
      "id": "reverse99",
      "matrix": "E-09",
      "title": "Move Non-.99 Listings Out of Sale",
      "status": "IMPLEMENTED, UNPROVEN",
      "summary": "Require the sale event to be off, then find valid non-.99 prices in the sale category and return them to the configured non-sale category.",
      "prerequisites": [
        "The sale and non-sale categories are configured for the signed-in account.",
        "The sale event is turned off before scanning displayed prices.",
        "Backburner exclusions are current."
      ],
      "steps": [
        "Open Workflows and click Move Non-.99 Out of Sale.",
        "Answer whether the sale event is active.",
        "If Sale Event Is ON, stop and turn the sale event off; GLDN Ops must not start a scan.",
        "Choose Sale Event Is OFF only after confirming it is off.",
        "Review the complete sale-category scan summary.",
        "Confirm every selected listing has a valid non-.99 price.",
        "Confirm backburner items are excluded.",
        "Verify only Primary Store category changes to the configured non-sale destination.",
        "Approve the exact final Submit.",
        "Let the workflow stop while eBay propagates the category changes.",
        "Start a later deliberate run for any saved remainder only after eBay has finished updating listings."
      ],
      "approvalStop": "STOP before every eBay Submit and approve only the exact reviewed count.",
      "output": "The exact submitted batch, propagation-pending status, saved remaining-batch count, and audit data.",
      "recovery": [
        "Sale Event Is ON, a closed prompt, or an unconfirmed answer blocks before workflow reservation, tab creation, or scanning.",
        "Missing or ambiguous prices are excluded.",
        "A completed Submit is terminal for that run and cannot automatically rescan or create another workspace.",
        "Any uncertain pre-submit state returns to read-only reconciliation.",
        "Do not use the reverse workflow on Poshmark."
      ],
      "evidence": "v3.11.30 adds the fail-closed sale-event gate to the popup, internal starter, eBay panel, background launcher, and saved-state runner. Automated contracts prove only an explicit Sale Event Is OFF answer can start the reverse workflow. The live ON-path block is the required signed-in gate; the OFF-path scan must wait until the sale event is actually off."
    },
    {
      "id": "ebay-variations",
      "matrix": "E-11",
      "title": "Find and End Variation Listings",
      "status": "IMPLEMENTED, LIVE REVIEW PENDING",
      "summary": "Scan every eBay Active Listings page automatically, use eBay's signed-in read-only End review to identify exact variation parents, and prepare durable approval-gated End batches.",
      "prerequisites": [
        "The intended eBay account is signed in in this Chrome profile.",
        "No other GLDN Ops workflow or variation review is active.",
        "Keep the Variation Listings extension page open while the account-wide scan runs."
      ],
      "steps": [
        "Open Workflows and click Find / End Variation Listings.",
        "Click Scan & Prepare Review; no report download or CSV import is required.",
        "GLDN Ops opens one inactive signed-in eBay tab and verifies every 200-row Active Listings page by exact item number.",
        "GLDN Ops checks exact IDs through eBay's read-only End review in batches of at most 200 and keeps only listings eBay identifies as true variation parents.",
        "Review the searchable variation-parent table and download the audit CSV if a permanent copy is needed.",
        "GLDN Ops automatically prepares the first exact batch of at most 200 parent listings and opens eBay's visible Bulk Edit review.",
        "Inspect every visible eBay row and return to Variation Listings.",
        "Type APPROVE END VARIATIONS N only after the exact batch count and rows are correct.",
        "Wait for eBay's exact success and failure counts. Successful IDs become Ended, disappear from the remaining set, and the next review is prepared automatically.",
        "Give a new exact approval for every remaining batch. After the final result, run Scan & Prepare Review again for a fresh zero-variation verification."
      ],
      "approvalStop": "STOP before every eBay End action. The exact token APPROVE END VARIATIONS N must match the current verified batch and eBay's displayed count; preparing or viewing a review is never approval.",
      "output": "An automated account-wide exact-ID scan, searchable variation-parent audit, exportable CSV, exact eBay review batches, durable completion ledger, exact approval receipts, and remaining count.",
      "recovery": [
        "A missing page range, incomplete row count, duplicate item number, changing Active Listings total, browser check, or classification mismatch stops with no listing changes.",
        "Every active listing must be accounted for before any variation parent is accepted.",
        "No more than 200 parent listings can enter one End review.",
        "A missing or mismatched eBay count blocks approval.",
        "An unfinished exact review can be reopened from the Variation Listings page.",
        "GLDN Ops may prepare the next review after a proven successful result, but it never ends that batch without a new exact approval token."
      ],
      "evidence": "The exact ending path is already live-proven in signed-in Profile 2 across 736 parents: eBay reported 200 already ended, then 200 of 200, 200 of 200, and 136 of 136 successful with zero failures. v3.11.48 replaces manual report generation and import with an automated complete-page scan, eBay-confirmed variation classification, and a Profile 2 launch path that stops at the same exact approval review. Current-version signed-in read-only review proof is required before release."
    },
    {
      "id": "existing-listings-policy-audit",
      "matrix": "E-12",
      "title": "Existing Listings Policy Audit",
      "status": "IMPLEMENTED, LIVE REVIEW PENDING",
      "summary": "Read every active eBay listing, classify it with current reviewed policy rules, and allow only exact reviewed Block matches into an approval-gated native eBay End review.",
      "prerequisites": [
        "The intended eBay account is signed in in this Chrome profile and its computer identity is saved.",
        "No other GLDN Ops scan or marketplace review is active.",
        "The shared reviewed Listing Preflight rule pack is present."
      ],
      "steps": [
        "Open Workflows, choose Listings, and click Scan Existing Listings.",
        "Click Start Fresh Complete Scan, or Resume Scan after a saved interruption.",
        "GLDN Ops opens one quiet signed-in eBay tab and verifies every 200-row Active Listings page by exact item number.",
        "Wait for Scanned to equal eBay's reported total; a partial or changing total cannot publish an audit.",
        "Review No rule match, Needs review, and reviewed Block rows. No rule match is not eBay approval, and Needs review rows can never be selected for ending.",
        "Download the full source-linked CSV audit if needed.",
        "Select reviewed Block rows and click Review Selected on eBay. At most 200 exact item numbers enter one native eBay review.",
        "Inspect every visible eBay row, return to the audit page, and type APPROVE END POLICY LISTINGS N only when the exact count and rows are correct.",
        "Wait for eBay's exact success and failure counts. GLDN Ops records the receipt and stops.",
        "Start another batch only as a separate deliberate action after reviewing the remaining Block rows."
      ],
      "approvalStop": "STOP before every eBay End action. Preparing or opening a review is never approval. The exact phrase APPROVE END POLICY LISTINGS N must match the current reviewed batch.",
      "output": "A complete resumable exact-ID audit, source-linked classifications, exportable CSV, exact native eBay review, durable End receipt, and remaining reviewed Block rows.",
      "recovery": [
        "A missing page range, incomplete row count, duplicate item number, changing total, browser check, or missing rule pack pauses or fails with no eBay listing change.",
        "Resume continues from the next unverified page; Start Fresh discards old page checkpoints only after explicit operator action.",
        "An audit older than 48 hours, a changed reviewed-rule pack, or a different computer/account blocks End review.",
        "Only current reviewed Block rows are selectable. Review and No rule match rows cannot enter the ending path.",
        "After an approved submission the workflow stops and never auto-prepares another batch.",
        "If eBay reports that a listing item is missing, GLDN Ops records it as unresolved rather than ended. Use Cancel Review & Rescan to clear an abandoned review and immediately start a complete read-only scan."
      ],
      "evidence": "v3.12.14 focused contracts prove full-count reconciliation, source-linked classification, Block-only selection, stale-account and stale-rule rejection, exact approval phrasing, terminal post-submit behavior, missing-listing failure classification, and Cancel Review & Rescan recovery. The prior signed-in Profile 2 scan verified all 7,294 Active Listings; a fresh post-recovery read-only scan remains the current live gate."
    },
    {
      "id": "move99-recovery",
      "matrix": "E-10",
      "title": "Move Category Recovery",
      "status": "LIVE PASS",
      "summary": "Recover from reloads, picker delays, lost approval pages, and per-item failures without guessing.",
      "prerequisites": [
        "A saved Move .99 checkpoint exists.",
        "The same signed-in eBay account and configured categories are active."
      ],
      "steps": [
        "Reload the extension only when the current page is stable.",
        "Use Run Move .99 or Apply to reclaim the verified checkpoint.",
        "If the approval page or submission outcome is uncertain, keep the run stopped and manually reconcile the saved batch before starting another scan.",
        "Review processed, failed, remaining, and recovery history.",
        "Export audit data before Reset.",
        "Use Retry Failed Only only with a new explicit approval."
      ],
      "approvalStop": "Recovery never grants Submit approval. Retrying or submitting any remaining item requires a new action-time approval.",
      "output": "Idempotent checkpoint, reconciliation result, processed/failed lists, and audit export.",
      "recovery": [
        "Generic or non-numeric Store category tokens are rejected.",
        "Never shift the saved page after eBay omits a row.",
        "When outcome is unknown, do not auto-rescan, navigate, or open another workspace; reconcile first and then start a new operator-approved scan."
      ],
      "evidence": "Profile 2 recovered a cancelled review into a complete read-only scan and exported exact Remaining / Retry rows with zero batches submitted."
    },
    {
      "id": "ecomsniper-handoffs",
      "matrix": "C-01, C-02, C-04",
      "title": "EcomSniper Handoffs and Status",
      "status": "LIVE PASS",
      "summary": "Verify GLDN seller-extraction counts and handoff-tab state without claiming that GLDN runs or reads EcomSniper Bulk Poster.",
      "prerequisites": [
        "eBay and EcomSniper are signed in in the same Chrome profile.",
        "EcomSniper's visible Extract Sellers control is present on an eBay search-results page for seller extraction."
      ],
      "steps": [
        "Open Workflows and review EcomSniper Handoffs.",
        "Use Open EcomSniper Competitor Scanner or Filter Titles & Open Product Hunter only for the handoff you intend.",
        "Click Refresh Status to read current GLDN-observable state.",
        "Treat Extracting as seller extraction on eBay only; confirm the before total, after total, and reported new count reconcile.",
        "Treat Handoff open or Handoff closed as tab-lifecycle information only.",
        "Do not infer Bulk Poster progress, item counts, completion, or failure from the handoff monitor.",
        "Use Stop GLDN Assist to request a safe stop of GLDN's seller-extraction queue; stop EcomSniper work from EcomSniper itself."
      ],
      "approvalStop": "GLDN Ops cannot approve or click EcomSniper's private Scanner, Product Hunter, export, Bulk Poster, or listing controls. Any listing action requires explicit approval.",
      "output": "Verified seller-count progression plus honest open, closed, stopped, or unknown handoff state.",
      "recovery": [
        "Missing, stale, wrong-page, mismatched, or timed-out seller counts stop safely.",
        "An open or closed private EcomSniper tab never proves processing completion.",
        "Copy the full diagnostic report before Reset.",
        "No Windows local helper is required."
      ],
      "evidence": "Profile 2 previously reconciled seller extraction from 892 to 1,607. Signed-in Profile 2 then live-proved the exact Competitor Scanner and Product Hunter routes, open-state readback, lifecycle-only scope, and Stop closing only the GLDN-opened Product Hunter tab. GLDN made no private-processing claim and performed zero marketplace actions."
    },
    {
      "id": "listing-preflight",
      "matrix": "C-05",
      "title": "Profile 2 Research and Listing Preflight",
      "status": "LIVE PASS",
      "summary": "Collect source-linked listing-restriction evidence from approved EcomSniper Discord channels, require human review, and check Amazon links before bulk listing without using an eBay API.",
      "prerequisites": [
        "Use only the signed-in Discord interface in Chrome Profile 2.",
        "Research only approved EcomSniper channels and preserve exact source-message URLs.",
        "Do not use a bot, Discord token, self-bot, or hidden account access."
      ],
      "steps": [
        "Open the EcomSniper Discord server in signed-in Chrome Profile 2.",
        "Search approved channels for listing restrictions, prohibited items, restricted products, VeRO reports, listing takedowns, suspensions, and reported resolutions.",
        "Open each relevant result in context and record its exact message URL, date, channel, relevant text, attachments, and outcome.",
        "Exclude dropshipping-policy and fulfillment-source discussions.",
        "Mark every candidate Ignore, Review, or Block and provide reviewer and reason for Review or Block.",
        "Publish reviewed decisions with tools/listing-preflight/publish-reviewed-rules.ps1, then update or reload GLDN Ops.",
        "For title research, use Prepare Product Hunter Handoff. Fashion rows and duplicates are removed before preflight, and Product Hunter stays closed when Review or Block rows exist.",
        "After Product Hunter produces Amazon links, copy them and click Preflight Bulk Poster Links.",
        "Review Ready to copy, Needs review, and Blocked results. A bare ASIN or opaque URL without product-name evidence remains Needs review.",
        "Click Copy Ready and Open Bulk Poster. Only canonical Ready Amazon links reach the clipboard; Review, Blocked, duplicate, and non-Amazon rows remain excluded.",
        "Review the final link set again inside EcomSniper before starting its private listing workflow."
      ],
      "approvalStop": "Rule publication requires human-reviewed decisions. Listing Preflight is read-only and never authorizes or submits an eBay listing.",
      "output": "Source-linked Profile 2 research, a reviewer-approved shared rule pack, a ready-to-copy list, and separate review and blocked results.",
      "recovery": [
        "If Discord sources or attachments cannot be verified visibly in Profile 2, do not publish the rule.",
        "If the rule pack is empty or unavailable, every input stays in Needs review and no ready list is produced.",
        "A Ready result does not mean eBay permits the item.",
        "Do not add dropshipping-policy or fulfillment-source discussion to this research set."
      ],
      "evidence": "Signed-in Profile 2 source research is preserved with exact Discord message links and no Discord write. The shared pack contains 175 human-reviewed official rules. Signed-in Profile 2 visibly classified one controlled Ready, one Review, and one Block input, copied only the canonical Ready Amazon URL, and opened the exact Bulk Poster route without starting it or performing any marketplace action."
    },
    {
      "id": "product-hunter-listing-guard",
      "matrix": "C-06",
      "title": "Product Hunter Active Listing Guard",
      "status": "IMPLEMENTED, LIVE REVIEW PENDING",
      "summary": "Build a verified read-only index of one eBay computer's complete Active Listings inventory and prevent Product Hunter from returning products that are already active.",
      "prerequisites": [
        "Load the separate GLDN Product Hunter extension in the Chrome profile signed into the intended eBay account and Amazon.",
        "Choose one of the five eBay computers: M0, 2, 6, 0, or M1."
      ],
      "steps": [
        "Open GLDN Product Hunter and select Open Product Hunter.",
        "Choose the eBay computer for this signed-in Chrome profile.",
        "Click Scan Active Listings and leave the inactive eBay worker tab available until every 200-row page and the final count are verified.",
        "If eBay live scanning is unavailable, download its current All active listings CSV and choose Import Active Listings CSV.",
        "Confirm the indexed listing count, decoded ASIN count, account label, and Last verified time.",
        "Leave Exclude products already active on eBay enabled and start the Amazon hunt.",
        "Review Excluded rows for exact active SKU/ASIN matches and Review rows for exact normalized-title matches.",
        "Copy only Ready links and continue through EcomSniper manually."
      ],
      "approvalStop": "The guard never edits eBay and requires no marketplace approval. Any later EcomSniper listing action retains its own explicit approval boundary.",
      "output": "A computer-bound verified Active Listings index, duplicate decisions in the audit CSV, and a Ready-link set with known active duplicates removed.",
      "recovery": [
        "A partial scan never replaces the prior verified index.",
        "If eBay displays a browser check, complete it in the saved worker tab and click Resume Scan.",
        "If the Active Listings total changes during scanning, stop and rerun after eBay settles.",
        "Protected hunts cannot start without a verified index for the selected computer unless the operator explicitly disables the guard."
      ],
      "evidence": "The complete scanner, CSV import, exact SKU/ASIN exclusion, title-review, computer binding, permission boundary, and fail-closed behavior are deterministic-test proven. A current signed-in Profile 2 full scan remains the live gate."
    },
    {
      "id": "sniping",
      "matrix": "C-03",
      "title": "Sniping Workflow",
      "status": "PENDING USER REVIEW",
      "summary": "Choose close competitors, verify exact products, enforce economics, and stop at a read-only review.",
      "prerequisites": [
        "An exact Amazon product page shows a valid ASIN and price.",
        "The user is prepared to manually confirm product identity and EcomSniper private-page steps."
      ],
      "steps": [
        "Click Start Sniping Workflow from the exact Amazon product.",
        "Review the capped eBay candidate set returned to Amazon.",
        "Open source links and manually confirm title/brand, image, pack, size, color, and variant.",
        "Save one verified seller only when it looks like a matching dropshipper.",
        "Scan that seller in EcomSniper and select a proven recent-selling winner.",
        "Capture the winner on eBay and open the exact Product Hunter match.",
        "Review markup, exact $0.05 undercut, fee, spread, and conservative profit.",
        "Save Read-Only Review only after exact identity confirmation."
      ],
      "approvalStop": "The workflow must stop at read-only review. It cannot create, edit, or submit an eBay listing.",
      "output": "A saved read-only seller/winner/product/economics review with no listing action.",
      "recovery": [
        "Markup alone never proves an Amazon match.",
        "A mismatch or unprofitable result cannot advance.",
        "EcomSniper continuation remains unverified and must stay manual."
      ],
      "evidence": "A recorded Profile 2 candidate and 80.1% markup proof exists, but the user deferred review and EcomSniper continuation remains unverified."
    },
    {
      "id": "poshmark-stats",
      "matrix": "P-01, P-02",
      "title": "Poshmark Stats",
      "status": "LIVE PASS",
      "summary": "Review requested closet statistics and save one snapshot per Chicago day with deltas.",
      "prerequisites": [
        "The signed-in My Posh Stats page is open.",
        "Computer 7, M0, or the combined computer 0 profile is saved correctly."
      ],
      "steps": [
        "Open My Posh Stats.",
        "Click Scan Posh Stats.",
        "Review shipped orders, days to ship, cancellations, returns, removed listings, profile and available listings, ratings, and requested totals.",
        "Click Save Poshmark Stats.",
        "Confirm the dashboard latest row and daily history/deltas."
      ],
      "approvalStop": "Saving reviewed stats needs confirmation but performs no marketplace write.",
      "output": "One latest snapshot and one upserted daily history row for dashboard computer 7.",
      "recovery": [
        "Do not save if the signed-in closet identity is wrong.",
        "Same-day saves update one row instead of adding duplicates.",
        "Legacy same-day duplicates are repaired before deltas rebuild."
      ],
      "evidence": "All requested Profile 2 metrics and dashboard/history readbacks are live-proven."
    },
    {
      "id": "poshmark-profit",
      "matrix": "P-03, P-04, P-05, P-06, P-07",
      "title": "Poshmark Sales and Profit",
      "status": "PARTIAL",
      "summary": "Decode the sale SKU, find the exact Amazon order-item cost, and save deduplicated profit evidence.",
      "prerequisites": [
        "The signed-in Poshmark sale order shows earnings and an EcomSniper SKU.",
        "Signed-in Amazon Orders is available in the same Chrome profile."
      ],
      "steps": [
        "Open the Poshmark sale order and click Capture Order Profit.",
        "If needed, click Open Amazon Orders for ASIN.",
        "Verify the decoded SKU ASIN against an exact Amazon order-details item row.",
        "On Amazon, click Review & Copy Amazon Info.",
        "Return to Poshmark and click Capture Order Profit again.",
        "Review earnings, per-item Amazon cost, profit, margin, SKU, ASIN, and supplier order.",
        "Click Save Profit only when every identity matches.",
        "Use Capture Visible Sales separately for the quick sales list import."
      ],
      "approvalStop": "Saving reviewed profit needs confirmation but performs no marketplace write or purchase.",
      "output": "One upserted Marketplace Profit History row and computer 7 profit row with exact supplier evidence.",
      "recovery": [
        "Never use EcomSniper markup, product-page price, checkout total, or a different order.",
        "A missing, stale, redirected, extra, or mismatched ASIN blocks Save.",
        "Visible Sales import remains partial and must not be treated as full profit proof."
      ],
      "evidence": "Ten exact Profile 2 order-cost/profit matches are live-proven. The separate visible-sales import lacks current-version dashboard readback."
    },
    {
      "id": "poshmark-profit-backfill",
      "matrix": "P-08",
      "title": "Historical Poshmark Profit Backfill",
      "status": "LIVE PASS",
      "summary": "Index paginated Poshmark sales by range or calendar month, read each exact SKU-linked order, allocate exact Amazon purchase units once, and stage a review before any spreadsheet write.",
      "prerequisites": [
        "Use the Chrome profile already signed into both Poshmark and Amazon.",
        "The saved computer must be Poshmark-enabled.",
        "Set the Amazon profile label if supplier-profile reporting is required."
      ],
      "steps": [
        "Open Workflows in the popup, or click Historical Profit Backfill on a Poshmark page, and choose Current sale, Pilot, New since last sync, Last 90 days, One month, or All sales.",
        "For the initial history, use One month and enter YYYY-MM, such as 2026-04 for April 2026. Month-by-month is recommended; All sales is available for a deliberate full-history migration but creates a much larger review and recovery surface.",
        "Let the single background worker switch Poshmark to Show 100 and index only the selected range or month.",
        "Let the worker open each Poshmark sale detail and decode every EcomSniper SKU into an exact ASIN.",
        "Let it search all matching Amazon order result pages and open each exact order detail in the same worker tab.",
        "Review every row, including earnings, exact Amazon item cost, supplier order, unresolved reason, and attempted Amazon profile.",
        "Approve the exact month and live row count before creating or updating the month tab; unresolved costs remain blank and enter the shared queue.",
        "On another signed-in Amazon Chrome profile, use Resolve Missing Amazon Costs to retry open queue rows, then approve the exact resolution count.",
        "Repeat each missing historical month once, then use New since last sync for ongoing additions. The dashboard totals the saved monthly tabs without rescanning completed sales."
      ],
      "approvalStop": "STOP at the review. A month write requires APPROVE SYNC POSHMARK YYYY-MM N, and a cross-profile resolution requires APPROVE RESOLVE POSHMARK COSTS N.",
      "output": "A resumable checkpoint, one-use Amazon unit ledger, a formatted month tab, exact profit rows, and a shared unresolved-cost queue that can be completed from another signed-in Amazon profile without duplicate sales.",
      "recovery": [
        "Pause at Safe Checkpoint before closing the worker tab.",
        "Resume recreates one worker tab if the old worker was closed.",
        "Missing or ambiguous Amazon costs remain blank rather than becoming zero.",
        "Use Resolve Missing Amazon Costs from another signed-in Amazon profile; every attempted profile is retained.",
        "Never substitute EcomSniper markup, a product-page price, cart total, checkout total, or a different Amazon order."
      ],
      "evidence": "The original exact single-order path is live-proven in Profile 2. v3.11.35 added month filtering, formatted monthly output, unresolved-cost queuing, and cross-profile resolution. v3.11.36 through v3.11.41 hardened empty-page rejection, reload recovery, complete page loading, pagination, Show 100 selection, and review-time detail repair. Dashboard deployment @42 is live. The approved April 2026 run saved 317 unique reviewed orders: 260 exact Amazon costs and 57 unresolved costs retained blank and queued without duplicate sales. v3.11.42 aligns approval with every reviewed row, uses deterministic durable batches, and closes completed worker checkpoints. May, June, and July remain separate signed-in Profile 2 review and count-bound approval gates."
    },
    {
      "id": "tasks-automation",
      "matrix": "F-10, T-04, T-05, T-06",
      "title": "Tasks Reminders and Auto-Completion",
      "status": "LIVE PASS",
      "summary": "Keep task order safe, show stale warnings, and check only exact proven workflow completions.",
      "prerequisites": [
        "The shared Tasks sheet retains its task labels and computer headers."
      ],
      "steps": [
        "Run the read-only schema audit after changing task labels or computer headers.",
        "Require every header and target label to match exactly once before a Tasks write.",
        "Review daily stale warnings after more than three days.",
        "Review NEED TO SNIPE after more than five days since the latest computer timestamp.",
        "Review the Subscribe & Save reminder beginning one day before month end.",
        "Allow only seller metrics, listing limits, Mark as Shipped, and exact zero-remaining Move .99 proof to auto-check directly.",
        "Keep one Amazon Subscribe & Save proof per cleared Chrome profile; a single profile cannot check the ALL Amazon Accounts row.",
        "Require explicit all-profile proof and the exact token APPROVE ALL AMAZON PROFILES N before that monthly row can be checked.",
        "Keep the second-round row manual."
      ],
      "approvalStop": "No Tasks checkbox may stand in for marketplace approval. Review-ready or partial states cannot auto-check completion.",
      "output": "Label-based warnings and idempotent, computer-specific checkbox updates.",
      "recovery": [
        "A missing or duplicate task label/header must stop the write until the schema is corrected.",
        "Row moves are safe only because integrations locate unique task labels.",
        "Poshmark-only cells remain grey.",
        "Reverse cleanup, EcomSniper handoffs, sniping, and second-round tasks never auto-check."
      ],
      "evidence": "Production schema audit, threshold, stale reminder, layout, allowlist, temporary-sheet cleanup, and exact computer-column proofs are live-passed. F-10 proof: https://drive.google.com/file/d/1LL8bus-SnrpPITUglPoX6K2uFi8Bz4uB/view?usp=drivesdk"
    },
    {
      "id": "diagnostics",
      "matrix": "F-11, F-12, U-02",
      "title": "Diagnostics, Backup, and Interface Settings",
      "status": "PARTIAL",
      "summary": "Capture failures before resetting and preserve per-profile settings across updates.",
      "prerequisites": [
        "The popup can open."
      ],
      "steps": [
        "Use Settings to choose theme and transparency.",
        "Click Copy Settings Backup before updates or profile moves.",
        "Use Status to run Feature Health Check.",
        "After a failure, click Copy Full Diagnostic Report before Reset.",
        "Use Copy Error Log for a shorter page-error report.",
        "Clear Error Log only after the issue is captured.",
        "Restore settings from the copied backup and verify identity and categories."
      ],
      "approvalStop": "Diagnostics and settings must not trigger marketplace actions.",
      "output": "Health report, error log, diagnostic report, and restorable settings backup.",
      "recovery": [
        "Do not clear evidence before copying it.",
        "F-11 controlled error storage and export are live-proven in Profile 2.",
        "U-02 installed-popup tab persistence still needs manual confirmation."
      ],
      "evidence": "Health diagnostics and the exact controlled error-log storage/export path are live-proven in Profile 2. Popup behavior and visuals are contract-proven; U-02 installed-popup tab persistence remains pending."
    },
    {
      "id": "onboarding-interface",
      "matrix": "U-01, U-02, U-03",
      "title": "Feature Tour, Themes, and Universal Access",
      "status": "PARTIAL",
      "summary": "Teach every catalog feature, keep the panel readable, and expose safe global controls on ordinary webpages.",
      "prerequisites": [
        "GLDN Ops is loaded in the intended Chrome profile.",
        "The page is an ordinary http or https webpage; Chrome internal pages cannot run extension content scripts."
      ],
      "steps": [
        "On first installation, use Next and Previous to review every feature, or click Skip for now.",
        "Restart the tour from Start Feature Tour in the popup or the three-dot panel settings menu.",
        "Open the full feature guide for exact recovery steps and evidence labels.",
        "Choose a saved theme from Core, Limited Editions, or Retired Editions in Settings.",
        "Use the three-swatch preview to confirm the selected window, surface, and accent palette.",
        "Use each review window's 0%-100% transparency slider to reveal the webpage behind its shell, tables, fields, and controls.",
        "Drag a review window by its title; double-click the title to reset its saved position.",
        "Resize a review window from its lower-right corner and resize the floating panel from its handle.",
        "Minimize or dock the panel to the right edge when it obstructs a webpage.",
        "On unsupported sites, use only the safe global controls; marketplace actions appear only on their supported sites."
      ],
      "approvalStop": "Theme, layout, tour, guide, dashboard, diagnostics, and stop controls perform no marketplace write. Marketplace approval boundaries remain unchanged.",
      "output": "A skippable feature-by-feature tour, complete guide, 49 persisted themes, independently transparent, draggable and resizable review windows, seamless scrollbars, and a safe panel on ordinary webpages.",
      "recovery": [
        "Use Reset panel layout if a saved panel size or position is awkward.",
        "Reopen the tour from the popup after skipping it.",
        "Chrome pages such as chrome://extensions cannot display the webpage panel; use the toolbar popup there.",
        "If a supported marketplace shows only global controls, reload that tab once after reloading the extension."
      ],
      "evidence": "v3.8.2 proved all 49 theme options in signed-in Profile 2. v3.8.3 proved independent Poshmark and eBay review-window opacity, translucent inner surfaces, dragging, and saved position. v3.8.4 proved Poshmark Stats at true 0%: modal shell, inner table, theme pattern, and page backdrop all reached zero alpha while the everyday panel remained at 65%; 0% persisted after reopen; live money rows displayed $33,642.00 and $94,165.15; large counts used separators; and a clean repeat produced no new warnings or errors. The review was restored to 65% and closed without Save, with zero marketplace actions. Evidence: evidence/profile2-modal-opacity-currency-v384-2026-07-23/."
    },
    {
      "id": "walmart",
      "matrix": "U-04",
      "title": "Walmart Order Helper",
      "status": "IMPLEMENTED, UNPROVEN",
      "summary": "Carry encoded order details into Walmart cart/checkout while preserving a manual final purchase.",
      "prerequisites": [
        "A Walmart link contains the intended auto-order details from a reviewed eBay handoff."
      ],
      "steps": [
        "Open the encoded Walmart product link.",
        "Confirm GLDN Ops removes customer data from the address bar after storing it locally.",
        "Review the product and quantity.",
        "Use Add / Checkout only on safe cart controls.",
        "Use Fill Delivery Info at checkout.",
        "Review customer, item, shipping, total, and payment values manually."
      ],
      "approvalStop": "GLDN Ops must never click Place order or another final purchase control.",
      "output": "A prepared Walmart checkout with no purchase submitted.",
      "recovery": [
        "Stop if the item, quantity, address, price, shipping, or payment differs.",
        "This feature has syntax and package coverage only and must be treated as unproven until a dedicated gate."
      ],
      "evidence": "Implemented and packaged, but no current signed-in live proof exists."
    }
  ]
});
