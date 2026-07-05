# GLDN Ops Feature Guide

GLDN Ops is an internal workflow assistant. It does not replace eBay, Amazon, EcomSniper, or the shared Tasks sheet. It automates repeatable handoffs and stops before final actions that need review.

## First-Time Setup

1. Install GLDN Ops in the correct Chrome profile.
2. Open the extension popup.
3. Set the computer number.
4. Set the eBay account for that Chrome profile.
5. Click **Save Computer & eBay Account**.
6. Click **Check Local Helper**.
7. If the helper is not ready, run the local helper from the installed GLDN Ops folder.
8. Use **Open Dashboard** or **Test Connection** to confirm dashboard access.

## Computer & eBay Account

1. Open the GLDN Ops popup.
2. Choose the computer label used on the Tasks sheet.
3. Choose the eBay account assigned to this Chrome profile.
4. Click **Save Computer & eBay Account**.
5. Confirm the saved values shown under the button.
6. Repeat this once per Chrome profile where GLDN Ops is installed.

## Floating Panel

The floating panel appears on supported eBay and Amazon pages.

1. Use **Side** to move the panel into side mode.
2. Use the small minus button to minimize it.
3. Use **Reload Ext** after an update.
4. Use **Stop Task** when an automation should stop at the next safe checkpoint.
5. Use **Reset** to clear unfinished saved workflow state.

## Open Dashboard

1. Open any supported page with the floating panel.
2. Click **Dashboard**.
3. The shared dashboard opens in a new tab.
4. Use it to review recent syncs, seller level checks, listing confirmations, errors, and workflow results.

## Reload Extension Update

1. After a new version is installed or pulled, click **Reload Ext** on the floating panel or **Reload Extension Update** in the popup.
2. Chrome opens the extension reload page.
3. Refresh the eBay, Amazon, or EcomSniper tab you were working on.
4. Confirm the panel shows the new version.

## Stop Current Task

1. Click **Stop Task** on the floating panel or **Stop Current Task** in the popup.
2. GLDN Ops saves a stop request.
3. The running workflow stops at the next safe checkpoint.
4. Use **Reset** only if the workflow does not clear itself.

## Reset Automation

1. Open the popup or floating panel.
2. Click **Reset** or **Reset Automation**.
3. GLDN Ops clears unfinished workflow state.
4. Use this after a crash, stuck page, or abandoned workflow.

## Mark as Shipped

Use on eBay awaiting-shipment pages.

1. Open the eBay orders page that has orders needing shipment.
2. Click **Mark as Shipped**.
3. Review any eBay confirmation dialog if it appears.
4. Continue only when the selected orders are correct.
5. GLDN Ops stops when eBay requires manual confirmation or when the action completes.

## Prepare Order Note

Use after comparing an eBay order and the Amazon checkout/order information.

1. Open the Amazon checkout/order page.
2. Click **Prepare Order Note**.
3. Review the detected Amazon total and ETA.
4. Click **Copy Amazon Info**.
5. Open the matching eBay order page.
6. Click **Prepare Order Note**.
7. Review the editable note.
8. Click **Fill Add Note Box**.
9. GLDN Ops opens **More actions > Add note**, pastes the note, and waits for manual Save.

## Scan Seller Level

Use on eBay Seller Level or Seller Hub performance pages.

1. Open the eBay seller performance page.
2. Click **Scan Seller Level**.
3. Review detected metrics.
4. Click **Save Seller Level Check**.
5. GLDN Ops syncs the values to the shared dashboard and Tasks sheet.

## Tasks Sheet Metric Sync

1. Run **Scan Seller Level** from the correct eBay account.
2. Save the seller level check.
3. GLDN Ops sends the metrics to the shared dashboard.
4. The dashboard script updates the matching computer column on the Tasks sheet.
5. Alert cells show `CHECK computer` when a metric crosses the agreed threshold.

## Confirm Listings Under Limit

Use monthly from Seller Hub Overview.

1. Open Seller Hub Overview.
2. Click **Confirm Listings Under Limit**.
3. Review active listings, in-stock quantity, subscription limit, and monthly dollar limit.
4. Click **Confirm Listings This Month**.
5. GLDN Ops saves the confirmation locally and syncs it to the shared dashboard.

## Open Seller Hub Overview

1. Open the popup.
2. Click **Open Seller Hub Overview**.
3. Wait for eBay Seller Hub Overview to load.
4. Use **Confirm Listings Under Limit** after the overview values are visible.

## Move .99 Listings

This workflow is in the extension popup, not the daily floating panel.

1. Open the GLDN Ops extension popup.
2. Confirm the selected eBay account.
3. In **Move .99 categories**, enter the exact source Store categories.
4. Enter the exact destination Store category.
5. Optional: enter source category IDs if known.
6. Click **Save .99 Categories for This eBay**.
7. Click **Open Move .99 Workflow**.
8. GLDN Ops opens Active Listings and scans the configured source categories.
9. Review the scan summary.
10. Continue only if the selected listings and destination category are correct.
11. GLDN Ops pauses at the eBay review screen before final Submit.

Do not submit final eBay listing changes unless the operator approves them.

## Bulk Listing Workflow

This workflow assists EcomSniper. EcomSniper still performs the scanner and Product Hunter work.

1. Open the GLDN Ops extension popup.
2. Click **Start Bulk Listing Workflow**.
3. GLDN Ops opens Amazon Best Sellers.
4. Pick a broad product/category path that is not clothing, shoes, or another excluded area.
5. GLDN Ops searches eBay for the product context.
6. GLDN Ops triggers EcomSniper **Extract Sellers** when available.
7. Continue through EcomSniper Competitor Scanner and Product Hunter.
8. Export Amazon links/listings through EcomSniper.
9. Verify the listed count afterward.

The local helper must be running for automatic EcomSniper button clicks.

## Open Amazon Best Sellers

1. Open the GLDN Ops popup.
2. Click **Open Amazon Best Sellers**.
3. Use this as a manual starting point for broad product/category research.
4. Start Bulk Listing Workflow when you are ready for GLDN Ops to assist the handoff.

## Open EcomSniper Competitor Scanner

1. Open the GLDN Ops popup.
2. Click **Open EcomSniper Competitor Scanner**.
3. EcomSniper opens its Competitor Research page.
4. Use this when GLDN Ops or manual work has prepared sellers to scan.

## Open EcomSniper Product Hunter

1. Open the GLDN Ops popup.
2. Click **Open EcomSniper Product Hunter**.
3. EcomSniper opens Product Hunter.
4. Continue the product/link workflow inside EcomSniper.

## Local Click Helper

1. Open the GLDN Ops popup.
2. Click **Check Local Helper**.
3. If it says ready, automatic EcomSniper clicks can run.
4. If it says not ready, start the local helper from the GLDN Ops folder.
5. Retry **Check Local Helper** before running Bulk Listing Workflow or any workflow that needs automatic EcomSniper button clicks.

## Sniping Workflow

Sniping is separate from bulk listing. It is for closer competitor/product targeting.

1. Open an Amazon product with a visible price.
2. Open the GLDN Ops extension popup.
3. Click **Start Sniping Workflow**.
4. GLDN Ops uses the Amazon product context to search eBay.
5. Review sellers manually or with GLDN Ops assistance.
6. Keep only likely dropshippers with enough markup, usually at least 70%.
7. Use EcomSniper to scan the selected competitors.
8. Pick proven winning products.
9. Confirm Amazon profitability before listing.
10. List under the competitor price only when the profit still works.

## Dashboard

The dashboard stores shared workflow data for all computers.

1. Open the extension popup.
2. Click **Test Connection**.
3. Click **Open Dashboard**.
4. Use the dashboard to review recent seller checks, listing confirmations, mark-as-shipped runs, and errors.

## Interface Settings

1. Open the popup.
2. Choose **Light** or **Dark** theme.
3. Set panel transparency.
4. The setting applies to GLDN Ops page panels and review windows.
5. Use lower transparency when the panel blocks prices, delivery dates, or order details.

## Diagnostics

Use diagnostics when something fails or silently does nothing.

1. Open the extension popup.
2. Scroll to **Diagnostics**.
3. Click **Copy Error Log**.
4. Send the copied log with the page you were on and what button was clicked.
5. Click **Clear Error Log** after the issue is captured.

## Amazon Profile

1. Open the popup inside an Amazon Chrome profile.
2. Type the Amazon profile label used by the team.
3. Click **Save Amazon Profile**.
4. GLDN Ops uses that label in prepared eBay order notes.
5. Use **Clear Amazon Profile** only when the wrong profile name was saved.

## Copy Error Log

1. Open the popup after an issue happens.
2. Click **Copy Error Log**.
3. Paste the copied log into the support/debug thread.
4. Include the page URL and the button you clicked.

## Clear Error Log

1. Open the popup.
2. Click **Clear Error Log**.
3. The visible diagnostics panel resets to empty.
4. Use this after the current issue has been captured.

## Updating

For managed CRX installs:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click **Update**.
4. Refresh the eBay/Amazon/EcomSniper page.

For unpacked local installs:

1. Pull or download/extract the latest GLDN Ops folder.
2. Open `chrome://extensions`.
3. Find GLDN Ops.
4. If it is not installed, click **Load unpacked** and select `GLDN-Ops-main\extension`.
5. If it is already installed, click **Reload**.
6. Refresh the active work page.

Use rollback only if a newer version breaks a workflow that was working before.
