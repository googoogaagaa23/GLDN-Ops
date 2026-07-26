@echo off
setlocal
cd /d "%~dp0"
echo GLDN Ops install starting...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install.ps1"
if errorlevel 1 (
  echo.
  echo Install validation failed. No Chrome extension was changed.
  pause
  exit /b 1
)
echo.
echo Done. For a first-time Chrome profile, click Load unpacked and select:
echo   %~dp0extension
echo.
pause
