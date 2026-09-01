# GLDN Research Workstation Setup

This is the local, per-computer setup path for GLDN Listing Policy Check,
Existing Listings Policy Audit, and standalone GLDN Product
Hunter. It installs files only for the current Windows user on the computer
where it is run. It does not deploy to other computers.

## What it installs

- The already-built `GLDN-Ops-local-vX.Y.Z.zip` into the stable
  `%LOCALAPPDATA%\GLDN Ops` folder. Chrome loads its `extension` subfolder.
- The already-built `GLDN-Product-Hunter-vX.Y.Z.zip` into the stable
  `%LOCALAPPDATA%\GLDN Product Hunter\extension` folder.
- The existing loopback-only GLDN Ops update agent, unless setup is run with
  `-SkipUpdaterStart`. Product Hunter remains updated by rerunning this verified
  workstation setup with a newer pair of packages.

The setup never accepts, requests, prints, or stores an eBay, Amazon, Google,
Chrome, Discord, or Telegram password/token. If an existing local GLDN Ops
`config.js` is present, it is copied byte-for-byte into the replacement without
reading or printing it. Chrome profile storage is not touched.

## Safety checks

Before changing either stable folder, the PowerShell setup:

1. expands both ZIP files into a temporary folder under `%LOCALAPPDATA%`;
2. verifies both extension names and versions;
3. verifies both package SHA-256 values against the staged release manifest or
   explicitly supplied hashes;
4. requires the full GLDN Ops local bundle and its updater files;
5. requires Listing Policy Check, Existing Listings Policy Audit, and Product
   Hunter runtime files;
6. requires the main and Product Hunter policy rules and policy cores to be
   byte-identical;
7. validates schema 2, all 70 hub policy pages, zero community Blocks, the
   keyword-blocklist mode, and the explicit pesticide and spray-can Blocks;
8. stages complete replacement folders before moving an existing install;
9. retains timestamped prior folders under
   `%LOCALAPPDATA%\GLDN Research Workstation Backups`; and
10. verifies exact installed versions and policy-file hashes after replacement.

If replacement fails after an existing folder has moved, setup removes only the
two exact managed target folders and restores the retained prior folders. It
never modifies a drive root, user-profile root, or arbitrary caller-supplied
directory.

## Package set

Keep these files together from one reviewed release:

- `GLDN-Ops-local-vX.Y.Z.zip`
- `GLDN-Product-Hunter-vX.Y.Z.zip`
- `GLDN-Product-Hunter-vX.Y.Z.sha256.txt`
- `release-manifest-vX.Y.Z.json`

The script automatically finds the matching staged manifest when run in this
repository. When copying the installer elsewhere, pass all paths explicitly.
Never mix packages from different release reviews.

## Build one portable workstation ZIP

After the exact current GLDN Ops and Product Hunter packages and Product Hunter
SHA-256 sidecar have been built, create one portable package with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-research-workstation-package.ps1
```

The builder fails if either exact current package is missing. It does not select
an older ZIP. It verifies the Product Hunter sidecar, extracts both packages,
creates a minimal version-only manifest for each extension, generates a schema-1
release manifest containing both package hashes, and assembles only:

- the two already-built extension ZIPs;
- Product Hunter's verified SHA-256 sidecar;
- the workstation installer and CMD launcher;
- this setup document; and
- the two minimal version manifests.

Before writing `dist\GLDN-Research-Workstation-vX.Y.Z.zip`, the builder runs the
staged installer in `Plan` mode against the staged files. Building this ZIP does
not publish it or install anything.

## Dry run

Run the validation and print the exact plan without replacing either install:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-research-workstation.ps1 -Mode Plan
```

For packages copied outside the repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-research-workstation.ps1 `
  -Mode Plan `
  -MainZipPath "C:\GLDN-Setup\GLDN-Ops-local-v3.12.30.zip" `
  -ProductHunterZipPath "C:\GLDN-Setup\GLDN-Product-Hunter-v0.3.1.zip" `
  -ReleaseManifestPath "C:\GLDN-Setup\release-manifest-v3.12.30.json"
```

`Plan` writes and removes only an isolated temporary extraction folder.

## Install on one computer

From this repository, double-click:

`tools\Install-GLDN-Research-Workstation.cmd`

Or run the explicit PowerShell command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-research-workstation.ps1 -Mode Install
```

The setup writes a credential-free receipt to:

`%LOCALAPPDATA%\GLDN Research Workstation Installer\last-install.json`

That receipt records only versions, hashes, stable paths, policy revision,
backup location, zero Chrome changes, and zero marketplace actions.

## One-time Chrome steps

The setup deliberately does not automate Chrome internal pages or install a
Chrome policy. For every intended signed-in Chrome profile on this computer:

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose
   `%LOCALAPPDATA%\GLDN Ops\extension`.
4. Select **Load unpacked** again and choose
   `%LOCALAPPDATA%\GLDN Product Hunter\extension`.
5. Open GLDN Ops and choose the correct computer identity.
6. Run **Test Connection**, then **Run Feature Health Check**.
7. Open GLDN Product Hunter and choose the same permitted eBay computer.
8. Run **Scan Active Listings**, or import eBay's complete **All active
   listings** CSV when the read-only scan is unavailable.
9. Confirm the displayed GLDN Ops version, Product Hunter version, policy
   revision, and active-listing index before starting research.

An existing operational Chrome profile loaded from another GLDN Ops folder
should not be switched casually. Copy its Settings Backup first, load the stable
folder only as a deliberate migration, restore the backup, and verify computer
identity, dashboard connection, Store categories, and history.

## Verify later

Verify that both stable installations still match the reviewed package pair:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-research-workstation.ps1 -Mode Verify
```

Verification is read-only apart from its temporary package extraction folder.

## Boundaries

- Run setup separately on each Windows computer and Windows user that needs the
  tools. A shared OneDrive file does not execute setup remotely.
- This installer has no remote-host, WinRM, SSH, AnyDesk, RDP, MDM, or fleet
  deployment capability.
- It does not publish a release or make another computer discover a local build.
- It does not install a Chrome force-install policy or use the retired CRX path.
- It does not post, react, moderate, purchase, create a listing, revise a
  listing, end a listing, or submit a marketplace action.
- Install and use it only for accounts the operator is authorized and permitted
  to access. It must not be used to evade an eBay restriction.
- Product Hunter search words and Listing Policy Check `Ready` results are
  research decisions, never eBay approval. A brand name alone does not stop a
  product. The exact returned product, images, packaging,
  authenticity, rights, provenance, safety, eligibility, and final listing
  still require human review.
