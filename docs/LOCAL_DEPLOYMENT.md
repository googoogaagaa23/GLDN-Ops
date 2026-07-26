# Local Deployment

## Supported model

- One stable `%LOCALAPPDATA%\GLDN Ops` folder on each Windows computer.
- One unpacked GLDN Ops installation per intended Chrome profile, all pointing to that computer's same `extension` folder.
- Per-profile settings in `chrome.storage.local`.
- Private dashboard setup in ignored `extension\config.js` and Chrome storage.
- Shared marketplace/dashboard data in Google Sheets through the deployed Apps Script endpoint.

## Why this works across profiles

Every intended Chrome profile loads the same stable extension folder once. Per-profile identity, themes, categories, and history remain in that profile's `chrome.storage.local`; the updater changes only the shared runtime files. The profile that starts an update reloads immediately. Other profiles compare their running version with the shared disk version every five minutes and reload once when it changes.

## Update safety

The hidden no-admin updater starts with Windows and listens only on `127.0.0.1`. It reads a fixed stable metadata document, verifies SHA-256 plus manifest version, validates in staging, preserves private config, creates a rollback snapshot, installs, and validates again. A replacement failure restores the previous runtime. The browser cannot provide an arbitrary package URL and the updater has no marketplace-action endpoint.

## Settings safety

Settings schema 2 derives eBay/Poshmark identity from one shared computer map. Migration writes a timestamped backup before changing stored values. Popup **Copy Settings Backup** remains available for moving a profile to another machine.

## Runtime limits

Chrome extensions cannot inject into another extension's private pages. EcomSniper remains responsible for its scanner, Product Hunter, and listing UI. On shared eBay search-result pages, GLDN Ops now targets EcomSniper's visible **Extract Sellers** button by label and waits for EcomSniper's own count update before continuing. No coordinate-based Windows helper or manual Extract Sellers click is required.
