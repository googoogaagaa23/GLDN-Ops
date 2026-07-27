# Local Deployment

## Supported model

- One verified updater agent in `%LOCALAPPDATA%\GLDN Ops` on each Windows computer.
- One unpacked GLDN Ops installation per intended Chrome profile. The stable `extension` folder is preferred, and the updater can safely resolve an existing project/download copy from Chrome's own profile record.
- Per-profile settings in `chrome.storage.local`.
- Private dashboard setup in ignored `extension\config.js` and Chrome storage.
- Shared marketplace/dashboard data in Google Sheets through the deployed Apps Script endpoint.

## Why this works across profiles

Per-profile identity, themes, categories, and history remain in that profile's `chrome.storage.local`. For every browser request, the updater binds the requesting extension ID to the exact unpacked folder recorded in Chrome's `Secure Preferences`; it rejects unknown IDs, non-GLDN manifests, non-unpacked installs, and ambiguous paths. The profile that starts an update reloads immediately. Profiles sharing that same folder compare their running version with disk every five minutes and reload once when it changes.

## Update safety

The hidden no-admin updater starts with Windows and listens only on `127.0.0.1`. It accepts authenticated requests only from a Chrome extension origin, derives the target from Chrome rather than request data, reads a fixed stable metadata document, verifies SHA-256 plus manifest version, validates in staging, preserves private config, creates a rollback snapshot, installs, and validates again. A replacement failure restores the previous runtime. The browser cannot provide an arbitrary package URL or target path, and the updater has no marketplace-action endpoint.

## Settings safety

Settings schema 2 derives eBay/Poshmark identity from one shared computer map. Migration writes a timestamped backup before changing stored values. Popup **Copy Settings Backup** remains available for moving a profile to another machine.

## Runtime limits

Chrome extensions cannot inject into another extension's private pages. EcomSniper remains responsible for Extract Sellers, Scanner, Product Hunter, Bulk Poster, and listing UI. GLDN Ops only opens and monitors handoff tabs; it does not click EcomSniper controls or claim EcomSniper completion. No Windows local helper is required.
