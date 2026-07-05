# GLDN Ops Changelog

All notable extension releases should be recorded here before they are deployed to other computers.

## v3.4.8 - 2026-07-05

### Added
- Added local helper health reminder in the extension popup.
- Added popup-only access for less common workflows:
  - Start Bulk Listing Workflow
  - Start Sniping Workflow
  - Open Move .99 Workflow
- Added 60-day per-computer bulk product history so the same Amazon product is not reused too soon on the same computer.
- Added local helper support for automatic EcomSniper Extract Sellers clicks without Chrome debugger permission.

### Changed
- Removed rarely used workflow buttons from the floating daily eBay/Amazon panels:
  - Scan / Move .99
  - Bulk Listing Workflow
  - Sniping Workflow
- Changed eBay bulk extraction next-page handling to navigate with the pagination URL when available instead of scrolling/clicking the page control.
- Bulk Listing Workflow now skips clothing/shoes-style Amazon products before opening eBay.

### Fixed
- Fixed false-positive EcomSniper progress when the label changed from `0 new` to `+0 new`.
- Fixed helper coordinate rejection by clamping screen coordinates before sending them to the local click helper.
- Added retry recovery for stalled local helper click attempts.

### Known Limits
- Bulk Listing Workflow is partially live-tested: Amazon handoff and the first EcomSniper helper click worked, but a full multi-page/product run still needs verification after v3.4.8.
- The local helper must be running on each computer for automatic EcomSniper clicks.

