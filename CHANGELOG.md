# GLDN Ops Changelog

All notable extension releases should be recorded here before they are deployed to other computers.

## v3.4.24 - 2026-07-05

### Added
- Internal diagnostic starter now supports Non-.99 cleanup mode with `?mode=non99`.

## v3.4.23 - 2026-07-05

### Added
- Internal Move .99 starter can auto-continue from scan summary into the existing apply flow for live diagnostics.

## v3.4.22 - 2026-07-05

### Added
- Added an internal Move .99 starter page so Codex can start the live workflow after installing a local diagnostic build.

## v3.4.21 - 2026-07-05

### Added
- Move .99 now records a diagnostic snapshot when eBay's Category dialog does not expose the expected primary Store category controls.

## v3.4.20 - 2026-07-05

### Fixed
- Move .99 now derives Active Listings page count from the visible Results range when eBay does not show the normal page counter.
- Move .99 now tolerates and closes the filter drawer if eBay leaves it open after **See results**.

## v3.4.19 - 2026-07-05

### Fixed
- Move .99 now continues leftover listings when eBay caps the selected Bulk Edit workspace at 200 listings.
- Move .99 resumes the next saved batch after the user manually approves and submits the current eBay review screen.
- Store category selection now retries by clicking the selected-category row/chevron and accepts an already-selected destination category.

## v3.4.18 - 2026-07-05

### Changed
- Moved **Get Latest Update** to the top of the popup above the guide/instructions card.

## v3.4.17 - 2026-07-05

### Added
- Added **Move Non-.99 Out of Sale** cleanup workflow.
- The cleanup scans the configured sale category and moves listings whose price does not end in `.99` back to the configured non-sale source category.

## v3.4.16 - 2026-07-05

### Fixed
- Move .99 now uses page-sized Bulk Edit batches for every scanned page instead of trying to carry selections across pages in one eBay Bulk Edit workspace.
- Move .99 now clicks the selected Store category row when eBay opens the category modal with the picker collapsed.

## v3.4.15 - 2026-07-05

### Fixed
- Changed **Get Latest Update** to use the direct GitHub codeload ZIP URL to avoid stale archive downloads.

## v3.4.14 - 2026-07-05

### Fixed
- Move .99 no longer stops solely because eBay reports a filtered count that does not match the unique item IDs scanned after all available pages were scanned.

## v3.4.13 - 2026-07-05

### Added
- Added **Get Latest Update** in the popup to open the latest GitHub ZIP download for unpacked installs.

## v3.4.12 - 2026-07-05

### Fixed
- Changed the CRX update URL to direct `raw.githubusercontent.com` hosting to avoid Chrome update redirect issues.

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
