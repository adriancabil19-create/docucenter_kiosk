@echo off
echo Stopping DocuCenter Kiosk...

taskkill /F /IM web_doc.exe /T >nul 2>&1
if errorlevel 1 (
  echo   Flutter: not running
) else (
  echo   Flutter: stopped
)

taskkill /F /IM node.exe /T >nul 2>&1
if errorlevel 1 (
  echo   Backend: not running
) else (
  echo   Backend: stopped
)

echo Done.
