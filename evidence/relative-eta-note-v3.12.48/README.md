# Relative Amazon ETA and eBay native note menu

Date: 2026-10-04
Version: 3.12.48
Status: FIXTURE PASS; affected M0 signed-in validation pending.

Full release check: 646 tests passed, zero failures/skips. Installation,
update/rollback, checksum rejection, pairing and Chrome policy fixtures passed.
The unrelated live dashboard contract was skipped; no dashboard live pass is claimed.

## Findings

- The prior Amazon parser required a month/day after Arriving and returned no ETA
  for Arriving Tomorrow 7 AM - 11 AM.
- The prior eBay lookup only matched Add note. Add order note is not a substring
  match, and clicking More actions when already open could close the menu.
- No eComSniper address-transfer code or settings were changed.

## Executable checks

Focused tests cover explicit and relative shipment dates, alternate-choice
exclusion, local-date arithmetic, month/year and leap-day rollover, DST transition
dates, manual ETA preservation, four Add/Edit note labels, delayed/already-open
menus, nested controls, disabled/injected controls, ambiguity and changed orders.
The ETA/note suite was also run with TZ=America/Chicago.

## Browser evidence

The local synthetic fixture uses production parser, preview, note-builder,
native-menu finder, click dispatcher and fill functions. Its fake provider UI
never contacts a marketplace. Its shipment-wording selector is test-only and
excluded from the supplied page lines so hidden scenario choices are not data.

- Browser date: 10/4/2026. Arriving Tomorrow 7 AM - 11 AM filled ETA 10/5.
- Arriving Today by 10 PM filled ETA 10/4.
- Copy/import produced the expected editable draft.
- Fill eBay note opened a delayed Add order note menu with nested label elements,
  then filled the native textarea with the exact draft.
- Repeating with the menu already open worked without toggling it closed.
- Native Save count remained 0. No purchase or profit sync was attempted.
- Navigating to the next fixture order cleared the draft and confirmation.
- Browser error log was empty. The temporary tab and local server were closed.

Images: `tomorrow-auto-date.png`, `native-note-filled.png`.

## Boundaries

The user's current M0 checkout was not connected to browser automation. Synthetic
results are not signed-in M0 proof. The previous dashboard server-access issue is
unchanged; this release neither tests nor claims to fix it. All final eBay Save
and Amazon purchase actions remain manual.
