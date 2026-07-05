# GLDN Ops Changelog

All notable extension releases should be recorded here before they are deployed to other computers.

## v3.4.11 - 2026-07-05

### Fixed
- Fixed Move .99 popup launches using a different source-category URL format than the eBay workflow expected.
- Made Move .99 filter-apply detection tolerate eBay accounts that do not show the same filter chip text.

### Added
- Added a visible **Instructions** card at the top of the popup.
- Added a standalone in-extension full feature guide page.

## v3.4.10 - 2026-07-05

### Fixed
- Fixed GitHub ZIP unpacked installs failing with `Could not load javascript 'config.js'`.
- The extension now loads the included safe default config file, while CRX builds inject the live dashboard values during packaging.
- GitHub ZIP installs now include the shared dashboard connection in the loaded config file.

## v3.4.9 - 2026-07-05

### Fixed
- Fixed the popup **Open Move .99 Workflow** button so it starts the saved Move .99 scan instead of only opening Active Listings.

### Added
- Added a full feature guide in `docs/FEATURE_GUIDE.md`.
- Added an in-extension feature guide section.
- Updated the extension icon set.

## v3.4.8 - 2026-07-05

### Added
- Added local helper health reminder in the extension popup.
- Added popup-only access for less common workflows:
  - Start Bulk Listing Workflow
  - Start Sniping Workflow
  - Open Move .99 Workflow
- Added 60-day per-computer bulk product history so the same Amazon product is not reused too soon on the same computer.
- Added local helper support for automatic EcomSniper Extract Sellers clicks without Chrome debugger permission.
- Added installer/update scripts for new computers:
  - `tools/install.ps1`
  - `tools/update.ps1`

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
- Fixed fresh installs treating placeholder dashboard values as a real Apps Script connection.

### Known Limits
- Bulk Listing Workflow is partially live-tested: Amazon handoff and the first EcomSniper helper click worked, but a full multi-page/product run still needs verification after v3.4.8.
- The local helper must be running on each computer for automatic EcomSniper clicks.
