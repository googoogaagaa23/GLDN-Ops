@echo off
setlocal
cd /d "%~dp0"
echo Installing the GLDN Ops automatic updater...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-update-agent.ps1" -InstallRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo The updater was not installed. Your current extension files were not removed.
  pause
  exit /b 1
)
echo.
echo Automatic updates are ready for every Chrome profile using:
echo   %~dp0extension
echo.
pause
