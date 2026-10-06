# Unread Messages v3.12.49 Evidence

The current signed-in Profile 2 (`F9132 - TE - BULK`) eBay inbox was inspected. It displayed two unread member conversations separately from unread eBay notices. Native IDs, sender/subject/preview fields, Unread from members selection, lazy account identity and the active conversation/thread structure informed the implementation. No customer content or identifiers are committed here.

Browser control rejected navigation to a Chrome extension URL. No workaround was used. The operator was asked to open the feature and report its scan result. A full signed-in end-to-end pass is not asserted.

Synthetic UI checks used 125 fictional conversations in the actual HTML/controller with an isolated Chrome-API adapter. All 125 rows displayed; Ignore reduced pending to 124, Restore returned it to 125, and Open All then opened 124 synthetic conversations while excluding the one ignored row. Desktop and 390px mobile screenshots show no document-level horizontal overflow. The table scrolls horizontally on small screens.

The release check passed 664 JavaScript tests plus installer, updater, packaging, pairing and policy fixtures. Live dashboard checking was skipped because the existing server-access problem is unrelated to this local-only feature.

Screenshots are synthetic UI evidence, not real customer or account activity.
