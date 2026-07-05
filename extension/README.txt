GLDN Ops v3.4.10

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
- Applies the saved scan in descending page order using controlled page-sized Bulk Edit batches.
- Verifies the selected count before opening Bulk Edit.
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
