# Local Deployment

## Supported model

- Fresh profiles load the stable `%LOCALAPPDATA%\GLDN Ops\extension` folder once.
- Existing operational profiles keep their current loaded `extension` folder so
  Chrome retains the same extension identity and profile-local storage.
- The updater discovers the exact folder used by the requesting Chrome profile
  and updates that folder in place. It never guesses or rewrites Chrome profile
  metadata.
- Per-profile settings in `chrome.storage.local`.
- Private dashboard setup in ignored `extension\config.js` and Chrome storage.
- Shared marketplace/dashboard data in Google Sheets through the deployed Apps Script endpoint.

## Why this works across profiles

Fresh profiles on one computer can share the stable extension folder. Per-profile
identity, themes, categories, and history remain in each profile's
`chrome.storage.local`; the updater changes only runtime files. The profile that
starts an update reloads immediately. Other profiles using that same folder
compare their running version with disk every five minutes and reload once when
it changes.

An existing profile already loaded from another folder stays on that folder and
updates in place. Do not remove and reload it from a different path merely to
standardize the folder: unpacked-extension identity can change with the path and
make the old profile-local settings appear missing. To consolidate deliberately,
first copy the Settings backup, load the stable folder, restore the backup, and
verify identity, dashboard connection, Store categories, and history before
removing the prior installation.

## Update safety

The hidden no-admin updater starts with Windows and listens only on `127.0.0.1`. It reads a fixed stable metadata document, verifies SHA-256 plus manifest version, validates in staging, preserves private config, creates a rollback snapshot, installs, and validates again. A replacement failure restores the previous runtime. The browser cannot provide an arbitrary package URL and the updater has no marketplace-action endpoint.

## Settings safety

Settings schema 2 derives eBay/Poshmark identity from one shared computer map. Migration writes a timestamped backup before changing stored values. Popup **Copy Settings Backup** remains available for moving a profile to another machine.

## Runtime limits

Chrome extensions cannot inject into another extension's private pages. EcomSniper remains responsible for its scanner, Product Hunter, and listing UI. On shared eBay search-result pages, GLDN Ops now targets EcomSniper's visible **Extract Sellers** button by label and waits for EcomSniper's own count update before continuing. No coordinate-based Windows helper or manual Extract Sellers click is required.
