# v3.12.37 Verification

- Release check passed on September 13, 2026: 552 JavaScript tests, package validation, install/update/rollback fixtures, configuration preservation, Chrome policy and approval-isolation checks.
- Isolated headless Chrome audit-page checks passed at 1440, 900 and 540-pixel viewport widths. Results remained visible, search and CSV download worked, the changed-store warning rendered without text overflow, and no marketplace action message was sent. The existing desktop minimum-width layout was retained.
- Screenshots and browser results are alongside this file. Fixture item numbers, account identity and totals are synthetic; they do not represent a live store scan.
- Live dashboard validation was skipped because this patch does not change dashboard behavior. The affected signed-in store scan was not run, and no live listing was ended or edited.
- Current shared policy pack has 622 rules. Targeted IP review used the official VeRO/IP and counterfeit pages, not community reports as official policy.
