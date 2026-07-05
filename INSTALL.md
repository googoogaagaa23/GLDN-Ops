# GLDN Ops Install

## Easiest install

Download and run:

[GLDN-Ops-Setup.exe](https://github.com/googoogaagaa23/GLDN-Ops/raw/main/dist/GLDN-Ops-Setup.exe)

The installer downloads the newest GLDN Ops folder to:

```text
Desktop\GLDN-Ops
```

Then it opens Chrome extensions. In Chrome:

1. Turn on Developer mode.
2. Click Load unpacked.
3. Select:
   ```text
   Desktop\GLDN-Ops\extension
   ```

## One-command install without Git

Open PowerShell and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; irm "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/install-latest.ps1" -OutFile "$env:TEMP\gldn-install.ps1"; powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\gldn-install.ps1" -StartHelper
```

The installer downloads the latest GLDN Ops folder to:

```text
Desktop\GLDN-Ops
```

Then it opens Chrome extensions. In Chrome:

1. Turn on Developer mode.
2. Click Load unpacked.
3. Select:
   ```text
   Desktop\GLDN-Ops\extension
   ```

## Optional labels in the same command

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; irm "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/install-latest.ps1" -OutFile "$env:TEMP\gldn-install.ps1"; powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\gldn-install.ps1" -StartHelper -Computer "0" -EbayAccount "FAK12"
```

## Updates without Git

Run the same one-command install again. The old folder is moved to a timestamped backup before the new one is installed.
