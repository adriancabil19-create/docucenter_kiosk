@echo off
setlocal enabledelayedexpansion
color 0A

REM Check for Administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [ERROR] This script must be run as Administrator!
    echo Please right-click this script and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

color 0A
cls
echo.
echo ================================================================================
echo  WebDoc WiFi Hotspot Setup Script - Driver Diagnostics and Configuration
echo ================================================================================
echo.

echo [1/5] Checking WiFi Driver Status...
echo.
netsh wlan show drivers
echo.

echo [2/5] Checking Network Adapters...
echo.
echo Available Network Adapters:
wmic nic where physicaladapter=true get name,description,netconnectionstatus,speed /format:list
echo.

echo [3/5] Checking Hosted Network Capability...
echo.
netsh wlan show hostnetwork
echo.

echo [4/5] Checking Virtual WiFi Driver Info...
echo.
wmic logicaldisk get name 2>nul >nul && (
    echo Checking if Virtual WiFi Miniport Adapter is available...
    ipconfig /all 2>nul | findstr /i "virtual" >nul
    if !ERRORLEVEL! EQU 0 (
        echo [OK] Virtual WiFi Miniport Adapter found
    ) else (
        echo [WARNING] Virtual WiFi Miniport Adapter not found
        echo This may indicate driver issues. See troubleshooting below.
    )
)
echo.

echo ================================================================================
echo  Configuring Hosted Network
echo ================================================================================
echo.

echo [5/5] Setting up hosted network with WebDoc settings...
echo.
netsh wlan set hostednetwork mode=allow ssid=WebDocHotspot key=WebDoc1234

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Hosted network configured!
    echo SSID: WebDocHotspot
    echo Password: WebDoc1234
    echo.
    echo Starting hosted network...
    timeout /t 2 /nobreak
    netsh wlan start hostednetwork

    if %ERRORLEVEL% EQU 0 (
        echo.
        echo [SUCCESS] Hosted network started!
        echo.
        echo ================================================================================
        echo  Connection Information
        echo ================================================================================
        echo.
        echo SSID: WebDocHotspot
        echo Password: WebDoc1234
        echo IP Address: 192.168.137.1
        echo Download URL: http://192.168.137.1:5000/download/{filename}
        echo.
        echo.
        echo Connected devices can access shared files via HTTP download link
        echo.
        echo ================================================================================
        echo Press any key to stop the hotspot when done with file sharing...
        pause >nul

        echo.
        echo Stopping hosted network...
        netsh wlan stop hostednetwork
        timeout /t 1 /nobreak
        echo [OK] Hosted network stopped.
    ) else (
        color 0C
        echo.
        echo [ERROR] Failed to start hosted network!
        echo.
        echo Possible causes:
        echo  - WiFi driver doesn't support hosted network
        echo  - Another hosted network is already running
        echo  - WiFi adapter is disabled
        echo  - Network interface issues
        echo.
        echo ================================================================================
        echo  Troubleshooting Steps
        echo ================================================================================
        echo.
        echo 1. UPDATE DRIVERS:
        echo    - Go to Device Manager ^(devmgmt.msc^)
        echo    - Find your WiFi adapter under "Network adapters"
        echo    - Right-click and select "Update driver"
        echo    - Check manufacturer website for latest drivers
        echo.
        echo 2. CHECK FOR CONFLICTS:
        echo    - Command: netsh wlan show hostednetwork
        echo    - If a network is already running, stop it first
        echo    - Or use Windows 11 Mobile Hotspot instead
        echo.
        echo 3. ENABLE HIDDEN DEVICES:
        echo    - View > Show hidden devices in Device Manager
        echo    - Look for "Microsoft Hosted Network Virtual Adapter"
        echo    - If disabled or with errors, enable it
        echo.
        echo 4. WINDOWS 11 ALTERNATIVE (RECOMMENDED):
        echo    - Settings > Network ^& Internet > Mobile hotspot
        echo    - Turn on Mobile hotspot
        echo    - Use this instead of hosted network
        echo.
        echo 5. CHECK HARDWARE COMPATIBILITY:
        echo    - Some WiFi chipsets don't support hosted network
        echo    - Check your adapter specs online
        echo    - Consider USB WiFi adapter that supports it
        echo.
    )
) else (
    color 0C
    echo.
    echo [ERROR] Failed to configure hosted network!
    echo.
    echo Error Level: %ERRORLEVEL%
    echo.
    echo Possible causes:
    echo  - Not running as Administrator
    echo  - WiFi driver doesn't support hosted network
    echo  - WiFi adapter hardware limitation
    echo  - Incompatible network driver version
    echo.
    echo ================================================================================
    echo  Solution Options
    echo ================================================================================
    echo.
    echo OPTION 1 - Update WiFi Driver:
    echo   1. Open Device Manager ^(press Win+X, select Device Manager^)
    echo   2. Expand "Network adapters"
    echo   3. Right-click your WiFi adapter
    echo   4. Select "Update driver" and follow prompts
    echo   5. Restart your computer
    echo   6. Re-run this script
    echo.
    echo OPTION 2 - Use Windows 11 Mobile Hotspot ^(RECOMMENDED^):
    echo   1. Settings ^> Network ^& Internet ^> Mobile hotspot
    echo   2. Toggle "Mobile hotspot" ON
    echo   3. Connect devices to your hotspot
    echo   4. Files will be accessible via HTTP^:5000/download/
    echo.
    echo OPTION 3 - Install Generic WiFi Driver:
    echo   1. If manufacturer driver fails, try Microsoft generic drivers
    echo   2. Or use a USB WiFi adapter that supports hosted network
    echo.
    echo OPTION 4 - Check System Requirements:
    echo   - Hosted network requires:
    echo     * Windows 7/8/10/11
    echo     * Compatible WiFi adapter
    echo     * Administrator privileges
    echo     * WiFi driver supporting virtual networks
    echo.
)

echo.
echo ================================================================================
echo Press any key to exit...
pause >nul