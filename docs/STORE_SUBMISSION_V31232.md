# Chrome Web Store Preparation: v3.12.32

Status: package prepared, not submitted, not Google-approved. Current connected publisher page is the Developer Agreement registration screen. The account owner must review registration terms and any displayed fee. No agreement or charge has been accepted by this release work.

## Package And Distribution

- Build: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/build-webstore-zip.ps1`
- Upload: `dist/GLDN-Ops-webstore-v3.12.32.zip`, not the local installer or extension-update ZIP.
- Name: GLDN Ops. Category: Productivity. Distribution: Unlisted.
- Short description: Internal marketplace workflow assistance, profit reconciliation, listing review, and order auditing.
- Single purpose: assist an authorized marketplace operator with reviewing and completing their marketplace operations.
- Store updates use Chrome's update mechanism. The local file updater is not used to replace Store-installed code.
- The package excludes private setup codes, browser-profile data, Windows executables, and development files. Policy packs are declarative packaged data, not downloaded executable code.

Unlisted is discoverable by anyone with its link, not private authorization. It receives the same review as listed extensions. Most reviews take a few days; some take a few weeks. Broad permissions and a new publisher may take longer. Sources: [review process](https://developer.chrome.com/docs/webstore/review-process), [distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

## Listing Description Draft

GLDN Ops is an internal operations assistant for trained marketplace staff. It supports order notes, independent profit reads, supplier-cost reconciliation, duplicate-order review, listing category workflows, variation and listing-policy reviews, and research handoffs. Saved work stays separate for each Chrome profile. Health & Installations shows workflow progress, queued saves, review owners, and available results.

Shared reporting uses a separately configured Google Apps Script dashboard. Final marketplace changes and shared-sheet writes remain subject to the workflow's explicit operator approval. Listing-policy screening is a risk filter, not proof that a product is permitted or authentic. GLDN Ops is not affiliated with eBay, Amazon, Poshmark, Walmart, or EcomSniper.

## Current Permission Inventory

These are the actual source-manifest permissions, not the obsolete v3.6 inventory:

| Permission | Implemented use |
| --- | --- |
| storage | Per-profile settings, checkpoints, review receipts, and saved results. |
| unlimitedStorage | Large listing audits and monthly order datasets exceeding the default local storage quota. |
| alarms | Resume/checkpoint scheduling and bounded background polling for explicitly paired local control. |
| tabs | Find and reuse workflow-owned tabs, check their expected page, navigate between review and result pages. |
| scripting | Execute packaged workflow readers/helpers in a verified supported tab. |
| debugger | Exact approved eBay input where ordinary programmatic clicks do not trigger the native control. Review the existing final-action guards; this permission is sensitive and must not be described as ordinary page reading. |
| clipboardRead | Explicit operator clipboard imports and marketplace handoffs. |
| clipboardWrite | Copy reviewed links, order notes, exports, and diagnostic text. |

Store host access covers eBay, Amazon, Walmart, Poshmark, and EcomSniper. Apps Script hosts support configured shared reporting. The Store builder removes broad HTTP/HTTPS grants and the universal all-sites content script. On unrelated websites, use the extension toolbar; the general floating panel is not injected there. No browser history permission is requested.

Local helper access is an optional `http://127.0.0.1/*` host permission, requested only by the Pair This Profile click. Declining leaves control disabled. The fixed helper endpoint is port 39417 and does not provide arbitrary shell execution. Local/unpacked builds retain their existing universal launcher behavior; the Store-specific scope is verified separately. Google requires the [narrowest necessary permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions).

## Privacy Form Preparation

Publish `docs/PRIVACY_POLICY.md` at a stable public HTTPS URL and supply an actual administrator contact. Review the Store form against these data uses:

- Marketplace page content, order identifiers, listings, earnings, costs, and workflow activity.
- Buyer/recipient names, addresses, or contact details when required by order auditing or reviewed delivery handoffs.
- The private dashboard setup credential and optional local-control credential, stored per Chrome profile; never included in a public package.
- Approved shared records sent to the configured Apps Script dashboard; exports are only shared where the operator chooses.
- No sale, advertising, credit-scoring, or unrelated browsing-history use.

Retention: local checkpoints remain until reset/deletion or extension removal. Shared Sheet data is separate and must be deleted by its authorized owner; uninstalling does not erase it. Local-control bindings can be revoked independently and are not exported with settings.

## Reviewer Instructions And Remaining Gates

1. Complete publisher registration, account verification, contact details, privacy URL, and permission disclosures. Do not place passwords or a production dashboard key in these docs or the package.
2. Open the popup, choose Health & Installations, and inspect the empty state without any marketplace login. Guides and navigation work without a dashboard key.
3. Provide a dedicated review account or a reviewer-accessible demo covering login-dependent workflows using the Store's private reviewer channel. Do not use real customer orders or authorize final actions on the production store for review.
4. Validate the staged Store build in a clean profile, including independent identity, settings restoration, native update status, and packaged imports. The isolated Chromium run proves startup/UI only, not Google installation or marketplace success.
5. Attach accurate non-customer screenshots and finish the signed-in local release checks listed in `ROLLOUT_V31232.md`. Screenshots under `evidence/reliability-v31232` use clearly labeled fixture data and are internal verification, not live customer results.
6. Upload, review the exact listing and disclosures, then submit. Record submission ID/time only after the dashboard confirms it.

After approval, use the exact assigned Store ID in the safe policy installer. Verify Chrome's actual installed state in each intended profile. Do not delete the unpacked copy until the new copy's settings and checkpoints have been restored and checked. Never copy local-control tokens between profiles.
