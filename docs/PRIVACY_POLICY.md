# GLDN Ops Privacy Policy

Effective date: 2026-09-05

GLDN Ops is an internal marketplace operations assistant used by authorized team members.

## What The Extension Does

GLDN Ops helps team members perform reviewed operational workflows on supported marketplace and supplier pages, including eBay, Amazon, Walmart, Poshmark, EcomSniper, and an internal Google Apps Script dashboard.

The extension assists workflows and stops before final marketplace actions that require operator approval.

## Data The Extension Handles

GLDN Ops may read page content from supported sites only when needed for its visible workflow features, including:

- eBay order, listing, Seller Hub, performance, feedback, traffic, advertising, and Bulk Edit page data.
- Amazon order, checkout, product, total, ETA, and profile label data.
- Walmart product, cart, checkout, and customer delivery form data used for reviewed order handoffs.
- Poshmark order, sales, earnings, closet stats, listing, and profile data.
- EcomSniper workflow page controls needed for handoff status.
- Local extension settings, diagnostics, and workflow state.
- Buyer and recipient names, delivery addresses, and contact details needed for reviewed order audits or delivery handoffs.

In the local/unpacked build, the general GLDN launcher can appear on other HTTP/HTTPS pages and its manifest grants broad page access. The Store package limits automatic page access to supported sites and uses its toolbar elsewhere; local helper access is optional and requested by the Pair This Profile action. Page-reading workflows use their own supported-page and account checks in both builds.

## How Data Is Used

Data is used only to provide internal workflow assistance, including:

- Preparing editable eBay order notes.
- Filling reviewed Walmart checkout delivery fields from encoded eBay order handoff links.
- Calculating marketplace profit from reviewed marketplace earnings and supplier cost.
- Syncing reviewed seller, listing, sales, Poshmark stats, and profit records to the internal dashboard.
- Preserving user settings and diagnostics for support.

## Data Sharing

GLDN Ops sends reviewed workflow records to the internal GLDN Ops dashboard hosted through Google Apps Script.

GLDN Ops does not sell user data, transfer user data to advertising platforms or data brokers, or use user data for credit-worthiness or lending decisions.

## Local Storage

The extension stores settings locally in the Chrome profile, including:

- Computer label.
- Dashboard setup code.
- Amazon profile label.
- UI preferences.
- Move .99 category settings.
- Recent workflow state and diagnostic logs.
- Optional local-control installation identity and per-profile credential. It is excluded from settings backups and Health & Installations results.

Users can clear local extension data by removing the extension from Chrome or by clearing the relevant extension storage.

Local records remain until cleared or removed. Shared Google Sheet records remain until their authorized owner deletes them; uninstalling GLDN Ops does not delete shared data. Optional local control can be disabled separately. The Windows helper stores only a hash of each profile's control credential and its explicit profile binding.

## Clipboard

The extension uses the clipboard only for visible workflow actions, such as copying Amazon order info, editable order notes, diagnostics, settings backups, and workflow audit text.

## Security

Dashboard sync uses HTTPS and requires a private setup code saved in the local Chrome profile. The Chrome Web Store package should not contain the private setup code.

## Reviewed eBay Final Actions

The extension includes Chrome debugger permission for approved native eBay input. The Mark as Shipped final-action path requires separate approval for the exact count and rechecks the owner tab, Awaiting shipment page, count, confirmation dialog, action label, and hit-tested button before sending input. Ambiguous final actions must be reviewed rather than blindly retried.

## Contact

For access, support, or data questions, contact the GLDN Ops administrator.
