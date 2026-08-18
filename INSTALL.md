# Install GLDN Ops Locally

GLDN Ops gives fresh Chrome profiles one stable unpacked folder per Windows computer. Existing operational profiles keep their current loaded folder so Chrome identity and saved settings remain intact. Chrome Web Store approval, Chrome policy, Git, Node.js and the old click helper are not required.

## First computer/profile setup

1. Download and run `GLDN-Ops-Setup.exe` once on the Windows computer.
2. The installer creates `%LOCALAPPDATA%\GLDN Ops` and starts the hidden automatic updater.
3. Open `chrome://extensions` in the intended signed-in Chrome profile.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select `%LOCALAPPDATA%\GLDN Ops\extension`.
7. Open GLDN Ops and choose the computer once.
8. Confirm **Automatic connection ready** in Status.
9. Run **Test Connection** and **Run Feature Health Check**.

Use the private GLDN Ops package for installation. It contains the local-only dashboard configuration and seeds every Chrome profile automatically; no dashboard code entry is required. The public source package intentionally excludes that private configuration.

The computer choice derives the marketplace identity automatically:

| Computer | eBay | Poshmark dashboard |
|---|---|---|
| M0 | CLICKNCARRY | M0 |
| 2 | FANCYFI | - |
| 6 | FINTIME | - |
| 0 | FAK12 | 7 |
| M1 | HEARTSTONE | - |
| 7 | Poshmark only | 7 |

## More Chrome profiles on the same computer

For each fresh profile that does not already run GLDN Ops, repeat only the Chrome steps above and select the same `%LOCALAPPDATA%\GLDN Ops\extension` folder. The dashboard connection seeds automatically. Each Chrome profile keeps its own computer, Amazon profile, category settings and history. The shared stable files update once for the whole Windows computer.

## Existing profile already using GLDN Ops

Run Setup once to install or repair the updater, but keep the extension's current
loaded folder in place. **Update & Reload** discovers that exact folder and
updates it in place, preserving the profile's existing Chrome extension identity
and saved settings.

Do not remove the working extension and load a different folder just to change
its location. If you intentionally want to move an existing profile to the
stable folder, first use **Copy Settings Backup**, load the stable folder, restore
the backup, and verify the computer identity, dashboard connection, Store
categories, and history before removing the old installation.

## Update

Open GLDN Ops and click **Update & Reload**. No ZIP download, Git command, PowerShell command, or folder replacement is needed after the one-time setup.

The updater:

1. reads the fixed GLDN Ops stable-release metadata;
2. downloads into a temporary folder;
3. verifies the published SHA-256 and manifest version before changing the install;
4. saves a rollback snapshot;
5. preserves `extension\config.js` and Chrome storage;
6. replaces and validates the runtime files transactionally;
7. reloads the current profile immediately and other profiles using that same folder within five minutes;
8. restores the prior runtime automatically if any replacement step fails.

**Reload Current Files** restarts the version already installed without downloading anything.

## Rollback

Open the popup's **Settings** tab, choose an available backup under **Version recovery**, and click **Roll Back & Reload**. The latest ten snapshots are retained locally. A safety snapshot is created before rollback.

## Diagnose

Double-click `Diagnose-GLDN-Ops.cmd`. It reports the local version, dashboard setup, exact Chrome profile directory, discovered extension ID/path and EcomSniper presence without assuming a fixed ID.
