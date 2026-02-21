@echo off
REM Post-Integration Setup Script (Windows)
REM This script verifies and sets up the Flutter-Backend integration

echo.
echo ========================================================================
echo    Flutter-Backend GCash Integration Setup
echo    DOCUCENTER Kiosk - Document Processing System
echo ========================================================================
echo.

REM Check if we're in the right directory
if not exist "pubspec.yaml" (
    echo X Error: pubspec.yaml not found
    echo Please run this script from the Flutter project root directory
    pause
    exit /b 1
)

echo + Flutter project found
echo.

REM Check Node.js backend
echo Checking backend setup...
if exist "backend" (
    if exist "backend\package.json" (
        echo + Backend directory found
    ) else (
        echo - Backend directory exists but package.json not found
    )
) else (
    echo - Backend directory not found at .\backend
)
echo.

REM Check configuration files
echo Checking configuration files...

if exist "lib\config.dart" (
    echo + lib\config.dart found
) else (
    echo - lib\config.dart not found
)

if exist "lib\payment_service.dart" (
    echo + lib\payment_service.dart found
) else (
    echo - lib\payment_service.dart not found
)

if exist "FLUTTER_INTEGRATION_GUIDE.md" (
    echo + FLUTTER_INTEGRATION_GUIDE.md found
) else (
    echo - Integration guide not found
)

echo.
echo Getting Flutter dependencies...
call flutter pub get > nul 2>&1
if %errorlevel% equ 0 (
    echo + Dependencies installed
) else (
    echo - Could not get dependencies
)

echo.
echo ========================================================================
echo                         Setup Summary
echo ========================================================================
echo.

echo Components Ready:
echo    + Flutter app with payment integration
echo    + Payment service layer (payment_service.dart)
echo    + Configuration management (config.dart)
echo    + Backend API integration
echo.

echo Documentation:
echo    * FLUTTER_INTEGRATION_GUIDE.md - Complete setup guide
echo    * INTEGRATION_SETUP.md - Quick reference
echo.

echo Next Steps:
echo.
echo    1. Start the backend:
echo       ^> cd backend
echo       ^> npm install
echo       ^> npm run dev
echo.
echo    2. Run the Flutter app:
echo       ^> flutter run -d web
echo.
echo    3. Test the payment flow:
echo       * Go to Services ^> Printing
echo       * Upload documents
echo       * Click Print
echo       * Use 'Simulate Success' to test
echo.
echo    4. For production:
echo       * Get real GCash credentials
echo       * Update backend .env file
echo       * Change backend URL in lib\config.dart
echo       * Disable development tools
echo.

REM Ensure nuget.exe exists for Windows builds (downloads if missing)
if not exist "build\windows\x64\_deps\nuget-subbuild\nuget-populate-prefix\src\nuget.exe" (
    echo nuget.exe not found in build deps, attempting to download...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0tools\fetch-nuget.ps1'"
    if %errorlevel% neq 0 (
        echo Failed to download nuget.exe. Please run tools\fetch-nuget.ps1 manually with PowerShell as Administrator.
    ) else (
        echo nuget.exe downloaded.
    )
)

echo + Setup complete! Ready to integrate Flutter with backend.
echo.

pause
