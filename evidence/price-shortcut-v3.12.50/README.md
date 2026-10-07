# Price Shortcut v3.12.50

## Signed-In Read-Only Inspection

The user's AnyDesk demonstration opened an order, followed its exact listing to the native eBay revision editor, and displayed 27.29 after the prior 27.19 price. The user then reported making another increase.

Read-only inspection of the same listing subsequently showed 27.39. Its native Revise link used `/sl/list?itemId=...&mode=ReviseItem`, briefly reached `/lstng?itemId=...`, and finally redirected to `/lstng?draftId=...&mode=ReviseItem`.

The native Item price field uses `aria-label="Item price"`. Format is a disabled listbox button labeled Format and Buy It Now. A Variations heading is present even on ordinary listings, with an explicit notice that the original listing had no variations. These controls informed the implementation. No price field or final Revise control was activated during inspection.

## Automated Evidence

Run `node --test tests/ebay-price-increase.test.js` for deterministic contracts. Run `node tools/verify-price-shortcut.cjs` with Playwright available for the synthetic browser checks and screenshots.

`desktop.png`, `mobile.png`, `popup.png` and `synthetic-results.json` are local synthetic evidence, not marketplace success screenshots. The fixture restricts requests to its local server and replaces only URL/origin handling and browser services. Real helper DOM logic runs against eBay-shaped controls.

Full signed-in helper execution and final revision remain unverified. Native Revise it is always manual.
