# GLDN Ops Install

## Easiest Install

Download and run:

[GLDN-Ops-Setup.exe](https://github.com/googoogaagaa23/GLDN-Ops/raw/main/dist/GLDN-Ops-Setup.exe)

The installer:

- downloads or updates GLDN Ops at `Desktop\GLDN-Ops`
- enables shared dashboard sync
- starts the local helper
- installs Chrome policy for auto-install and auto-update
- opens `chrome://extensions`

Chrome policy installed:

```text
pakkpebfmneoedaaknfdlbkclheekefb;https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/dist/update.xml
```

After install, close and reopen Chrome completely. Then open:

```text
chrome://policy
```

Click **Reload policies**. GLDN Ops should auto-install in Chrome profiles for that Windows user.

## Manual Fallback

If a computer does not apply Chrome policy, load the same extension folder manually in each Chrome profile:

1. Open the target Chrome profile.
2. Go to `chrome://extensions`.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select:
   ```text
   Desktop\GLDN-Ops\extension
   ```

## One-Command Install

Open PowerShell and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; irm "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/install-latest.ps1" -OutFile "$env:TEMP\gldn-install.ps1"; powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\gldn-install.ps1" -StartHelper -InstallChromePolicy
```

## Updates

Run the installer again. If Git is available, it pulls latest with Git. If Git is not available, it downloads the latest ZIP and keeps the old folder as a timestamped backup.

Packed CRX installs update through Chrome policy using `dist/update.xml`.
