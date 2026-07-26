@echo off
setlocal
cd /d "%~dp0"
echo GLDN Ops update starting...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update.ps1"
if errorlevel 1 (
  echo.
  echo Update failed. The previous extension runtime was restored automatically.
  pause
  exit /b 1
)
echo.
echo Done. Every Chrome profile using this exact GLDN Ops folder was reloaded automatically.
echo.
pause
