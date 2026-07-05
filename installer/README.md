# GLDN Ops Windows Installer

`GLDN-Ops-Setup.exe` is a double-click wrapper for `install-latest.ps1`.

It downloads the newest public GitHub copy or uses Git when available, installs
to `Desktop\GLDN-Ops`, creates local config, starts the helper, and opens
`chrome://extensions`.

Dashboard setup code:

```text
GLDN2026
```

Rebuild it from the repo root with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-installer.ps1
```

Chrome still requires the user to click **Load unpacked** and select:

```text
Desktop\GLDN-Ops\extension
```
