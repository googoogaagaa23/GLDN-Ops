# GLDN Ops Release Process

Use this process when preparing GitHub releases for other computers.

## Version Rules

- Patch version: small bug fix, selector fix, wording change.
- Minor version: workflow behavior change, new helper behavior, new dashboard behavior.
- Major version: breaking install or data migration change.

## Required Files Per Release

Update these before sharing a build:

- `extension/manifest.json`
- visible version strings in `extension/amazon.js`, `extension/ebay.js`, `extension/ecomsniper.js`
- `extension/README.txt`
- `CHANGELOG.md`
- `releases/vX.Y.Z.md`

## GitHub Flow

1. Make code changes.
2. Run syntax checks.
3. Test in Chrome when the workflow touches browser behavior.
4. Update `CHANGELOG.md`.
5. Create `releases/vX.Y.Z.md`.
6. Commit with a message like:
   ```text
   Release vX.Y.Z
   ```
7. Tag the commit:
   ```powershell
   git tag vX.Y.Z
   ```
8. Push branch and tag:
   ```powershell
   git push
   git push origin vX.Y.Z
   ```
9. Create a GitHub Release using `releases/vX.Y.Z.md` as the release notes.

## Computer Update Model

Each computer should pull the approved GitHub release or tag, then reload the unpacked extension.

Each computer also needs its own local helper running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\local-click-helper.ps1
```

## Rollback Model

Rollback should use GitHub tags:

```powershell
git fetch --tags
git checkout vX.Y.Z
```

Then reload the unpacked extension.

For local snapshots, rollback can use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\extension-version.ps1 -Action Restore -Version vX.Y.Z -ReloadAfter
```

