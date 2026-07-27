# GLDN Ops Live Test Video Standard

Every signed-in marketplace test must have a Google Drive video before it can be marked `LIVE PASS`.

## Required content

1. Feature ID, extension version, date, computer, and marketplace account.
2. The signed-in source page and the exact input values used by GLDN Ops.
3. The extension review or approval-stop screen.
4. The visible success or safe-failure result.
5. Exact dashboard or Google Sheet readback when the workflow syncs data.
6. A clear statement of whether any marketplace Save, Submit, Continue, purchase, shipment, or listing change occurred.

## Order and profit tests

Every eBay or Poshmark order-profit video must visibly show all of these before the result is accepted:

1. The marketplace order page and its actual after-fee earnings value, labeled `eBay earnings` or `Poshmark earnings`.
2. The matching signed-in Amazon order-details page, exact ASIN/order number, and exact item cost, labeled `Amazon order cost`.
3. Both values together in the GLDN review screen or proof frame.
4. The explicit calculation: `marketplace earnings - Amazon order cost = profit`, including margin when available.

The sold price, EcomSniper markup price, Amazon search-result price, recommendation price, checkout estimate, and unrelated order total do not qualify as the Amazon order cost.

## Recording rules

- Use the existing signed-in Chrome Profile 2 only.
- Prefer one continuous screen recording for the complete run.
- A proof compilation made from live screenshots and exact readback is allowed only when continuous capture is unavailable, and it must be labeled as a compilation.
- Use MP4/H.264 with a phone-readable layout. Target 1080 x 1920 when practical.
- Do not hide ordinary marketplace information merely because it is visible to the signed-in operator. Redact only credentials, setup codes, payment secrets, or unrelated private data.
- Never record or perform an irreversible marketplace action without the user's action-time approval.

## Completion rule

The evidence folder and release note must include:

- Local MP4 path.
- Verified Google Drive `view` link.
- Drive metadata readback showing the expected filename and `video/mp4` MIME type.
- Duration and resolution.

Without those items, the test remains `LIVE PROVEN, AWAITING VIDEO` or `PARTIAL`; it is not `LIVE PASS`.

Run `tools\check-release.ps1 -RequireLiveVideo` for every release that contains a signed-in live test.
