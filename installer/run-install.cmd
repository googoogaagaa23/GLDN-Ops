@echo off
setlocal
echo GLDN Ops installer starting...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-latest.ps1" -StartHelper
echo.
echo If Chrome opened to chrome://extensions, finish by selecting:
echo   Desktop\GLDN-Ops\extension
echo.
pause
