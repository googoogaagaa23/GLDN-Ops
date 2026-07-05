# GLDN Ops Windows Installer

`GLDN-Ops-Setup.exe` is a double-click wrapper for `install-latest.ps1`.

It downloads the newest public GitHub copy or uses Git when available, installs
to `Desktop\GLDN-Ops`, creates local config, starts the helper, enables dashboard
sync, opens `chrome://extensions`, and installs Chrome policy for the packed CRX.

Chrome policy:

```text
pakkpebfmneoedaaknfdlbkclheekefb;https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/dist/update.xml
```

Rebuild it from the repo root with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-installer.ps1
```
