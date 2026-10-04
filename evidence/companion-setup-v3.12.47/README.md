# Optional setup and bundled dashboard default

Date: 2026-10-04
Release: 3.12.47
Status: FIXTURE PASS; live provider completion and dashboard access unverified.

Full release check passed: 637 tests, zero failures/skips; Windows installation,
update/rollback, checksum rejection, pairing and policy fixtures also passed.
The live dashboard contract was explicitly skipped after the HTTP 403 probes
below. This is not a live dashboard pass.

## Scope

- The owner explicitly approved publishing the current dashboard read/write key
  in the public GitHub download after being told it permits changes to records.
- Existing saved profile connections and local private overrides are preserved.
- Provider passwords are not bundled. No marketplace action was performed.

## Browser checks

The preview serves the actual setup HTML/CSS/JS with simulated Chrome/provider
responses. Its banner explicitly identifies it as a test, not live completion.

- Initially both providers remain Not started.
- Explicit eComSniper start exposes a one-use sign-in form when required.
- Fixture sign-in clears the password field and displays the simulated download
  path only after the fixture reports completion.
- Trackerbot's store button reports that Add to Chrome still needs confirmation.
- Declining download permission leaves both providers Not started.
- Desktop width 1684px and compact content width 375px have no horizontal overflow.
- Desktop and compact layouts were visually inspected. The compact screenshot
  appeared in tool output; saving a second copy timed out. Desktop evidence is
  retained here. Temporary viewport changes were reset and the test tab closed.

## Live connection boundary

Two independent read-only ping requests to the currently configured Google Apps
Script endpoint returned HTTP 403 / Access denied. Bundled configuration is not
proof of server access; Test Connection and sync retain their failure reporting.
No live dashboard record write was attempted.

## Artifacts

- `desktop-preview.png`: synthetic completed-download/store-open states.
- `setup-options-preview.png`: initial optional setup controls.
- `tests/fixtures/companion-setup-preview.cjs`: local preview source.
