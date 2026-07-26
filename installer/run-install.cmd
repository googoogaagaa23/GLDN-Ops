@echo off
setlocal
title GLDN Ops Setup
echo GLDN Ops installer starting...
echo This window will stay open and show the final result.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-latest.ps1"
set "exitCode=%ERRORLEVEL%"
if not "%exitCode%"=="0" (
  echo.
  echo GLDN Ops setup failed.
  echo Setup log: %LOCALAPPDATA%\GLDN Ops Installer\latest.log
  pause
  exit /b %exitCode%
)
echo.
echo GLDN Ops setup completed successfully.
echo Open chrome://extensions in each intended signed-in Chrome profile once.
echo Then click Load unpacked and select the stable extension folder printed above.
echo Setup log: %LOCALAPPDATA%\GLDN Ops Installer\latest.log
echo.
pause
