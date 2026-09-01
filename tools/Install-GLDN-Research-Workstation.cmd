@echo off
setlocal
cd /d "%~dp0.."
title GLDN Research Workstation Setup
echo GLDN Research Workstation Setup
echo ===============================
echo This installs verified local files for this Windows user on this computer only.
echo It will not open Chrome, install Chrome policy, sign in, or perform marketplace actions.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-research-workstation.ps1" -Mode Install
set "gldnExit=%ERRORLEVEL%"
echo.
if not "%gldnExit%"=="0" (
  echo Setup stopped. Existing installs were restored where a replacement had begun.
  echo Review the error above. No remote computer was changed.
) else (
  echo Setup completed and verified.
  echo Complete the printed Load unpacked steps in each intended Chrome profile.
)
echo.
pause
exit /b %gldnExit%
