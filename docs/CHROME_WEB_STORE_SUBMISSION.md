# Chrome Web Store Submission (Archived)

Superseded by [the v3.12.32 submission preparation](STORE_SUBMISSION_V31232.md). The permissions, package name, and checks below describe an old build and must not be copied into the current submission. Local deployment remains the immediate path until the Store release is approved.

This is the release path for automatic updates across computers. Use Chrome Web Store distribution instead of unpacked ZIP installs, GitHub ZIP updates, CRX policy experiments, or external Windows click services.

## Build Package

From the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-webstore-zip.ps1
```

Upload the generated file:

```text
dist\GLDN-Ops-webstore-v3.6.21.zip
```

The package builder intentionally excludes:

- `extension/config.js`
- dashboard Apps Script source files
- external Windows helper scripts
- CRX/private key files
- Git/repo/install tooling

The package must not contain:

- `management` permission
- localhost or `127.0.0.1` host permissions
- manifest `update_url`
- manifest `key`
- built-in dashboard setup code/key

## Listing Type

Use one of these:

- **Unlisted**: best default for team-only installs by link.
- **Private**: only useful if all users are under a managed Google Workspace domain.
- **Public**: avoid unless the tool is intentionally meant for outside users.

## Suggested Store Listing

Name:

```text
GLDN Ops
```

Short description:

```text
Internal marketplace operations assistant for eBay, Amazon, Walmart, Poshmark, EcomSniper, and shared dashboard workflows.
```

Detailed description:

```text
GLDN Ops is an internal workflow assistant for marketplace operations. It helps trained team members review seller performance, confirm listing limits, prepare order notes, capture marketplace profit records, collect eBay sales snapshots, review Poshmark stats, assist reviewed Walmart checkout handoffs, and hand off product research steps to EcomSniper.

The extension does not replace eBay, Amazon, Poshmark, or EcomSniper. It assists repeatable workflows and stops before final marketplace actions that require operator review, including final eBay listing submission and eBay order note save.

Dashboard sync requires a private setup code provided by the GLDN Ops administrator.
```

Category:

```text
Productivity
```

Visibility:

```text
Unlisted
```

## Permission Justifications

`storage`:

Stores per-profile GLDN Ops settings, saved computer label, dashboard setup code, UI preferences, workflow state, diagnostics, and recent workflow results.

`clipboardRead`:

Reads the copied Amazon order payload when preparing eBay order notes and marketplace profit records.

`clipboardWrite`:

Copies Amazon order info, editable eBay notes, settings backups, diagnostics, and workflow audit text.

Host permissions:

- `https://*.ebay.com/*`: read and assist eBay order, Seller Hub, Active Listings, and Bulk Edit workflows.
- `https://*.amazon.com/*`: read Amazon checkout/order values used in notes and profit calculations.
- `https://*.walmart.com/*`: assist reviewed Walmart product, cart, and checkout handoffs by filling customer delivery fields from an encoded eBay order payload.
- `https://*.poshmark.com/*`: read Poshmark sales/orders/stats for internal tracking.
- `https://ecomsniper.io/*`: assist EcomSniper workflow pages without replacing EcomSniper.
- `https://script.google.com/*` and `https://script.googleusercontent.com/*`: sync reviewed workflow data to the internal dashboard web app.

## Data Disclosure

Use `docs/PRIVACY_POLICY.md` as the privacy policy source and publish it at a stable URL before submission.

The Store privacy form should disclose that the extension handles:

- Website content from supported marketplace pages.
- User activity required to perform workflow actions.
- Authentication/setup code stored locally for dashboard sync.
- Marketplace order/listing/performance data synced to the internal Apps Script dashboard.

Do not claim:

- Sale of user data.
- Advertising use.
- Credit/lending use.
- Broad browsing-history collection.

## Required Test Before Upload

1. Run `tools\build-webstore-zip.ps1`.
2. Load the generated zip contents unpacked in a clean Chrome profile.
3. Save the dashboard setup code.
4. Run **Feature Health Check**.
5. Run **Copy Full Diagnostic Report**.
6. Test one eBay dashboard sync.
7. Test one Poshmark stats sync.
8. Test EcomSniper automatic semantic-click continuation and safe stop/reset.
9. Confirm final marketplace submit/save actions still require operator approval.

## After Approval

1. Install GLDN Ops from the Chrome Web Store link on each Chrome profile.
2. Open the popup and save the correct computer.
3. Save the dashboard setup code once per Chrome profile.
4. Run **Feature Health Check**.
5. Run the cross-computer checklist in `docs/CROSS_COMPUTER_TEST_PLAN.md`.

Future updates are uploaded as a new zip with a higher manifest version. Chrome handles update delivery after the Store review approves the release.
