@echo off
setlocal
cd /d "%~dp0"
echo Running GLDN Ops diagnostic...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\diagnose.ps1"
echo.
pause
