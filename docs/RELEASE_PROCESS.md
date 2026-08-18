# GLDN Ops Local Release Process

Chrome Web Store submission is out of scope. A release is a validated local runtime plus evidence, rollback and GitHub release notes.

## Required release gate

1. Update `docs/MASTER_FEATURE_MATRIX.md` honestly. Syntax or fixtures never count as live proof.
2. Change `extension/manifest.json` once.
3. Add the same version to `CHANGELOG.md`, `extension/README.txt` and `releases/vX.Y.Z.md`.
4. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\check-release.ps1
```

For any release containing a signed-in live test, require its local MP4 and verified Drive link:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\check-release.ps1 -RequireLiveVideo
```

5. Build the dependency-free local package:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-local-package.ps1
```

Build the private extension package, verified updater metadata, and one-time installer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-private-extension.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-updater-metadata.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-installer.ps1
```

Publish the versioned extension ZIP, `latest.json`, full local bundle, installer,
bootstrap scripts, and release notes together. Never update `latest.json` before
all files it references are publicly reachable with the exact published hash.

Assemble and verify those files in one directory before publishing:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\stage-public-release.ps1 -Force
```

The staged `downloads\release-manifest-vX.Y.Z.json` records every exact hash.
`downloads\latest.json` is written only after its versioned ZIP and all recovery
artifacts are present and verified. Publishing is still forbidden until the
signed-in Profile 2 live gates and user green light below are complete.

6. Deploy changed Apps Script projects first and record their versions.
7. Use only the existing signed-in Chrome Profile 2 (`F9132 - TE - BULK`) for live proof.
8. For the stable deployment gate, use **Update & Reload** from the installed extension. **Reload Current Files** is only for a stale panel and is not update proof.
9. Capture visible version, identity, exact output and dashboard/Sheet readback.
10. Record the complete live test and upload an MP4 to Google Drive. Verify the returned Drive metadata and playable link.
11. Stop at any marketplace submit/finalize control unless the user explicitly approves it.
12. Update the matrix/evidence file with the local video path and verified Drive link.
13. Ask for the user's green light before starting the next feature gate.
14. Only then publish the reviewed files and release notes to GitHub.

## Rollback rule

Every verified update creates a pre-update snapshot. Restore through **Settings > Version recovery > Roll Back & Reload**. The updater creates another safety snapshot before rollback and never overwrites Chrome storage. The older local manager remains a developer recovery tool only.

## Evidence labels

- `FIXTURE PASS`: parser, state-machine or fake-page test.
- `LIVE PASS`: signed-in Profile 2 end-to-end behavior, exact readback, and a verified Google Drive video link.
- `PARTIAL`: anything between those states.

No release note may claim a gate is complete when its matrix row is not `LIVE PASS`. No live browser test is complete without its Drive-viewable proof video.
