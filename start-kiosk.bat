@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FLUTTER_EXE=%ROOT%build\windows\x64\runner\Release\web_doc.exe"

:: Start Node.js backend without a visible window
powershell -NoProfile -WindowStyle Hidden -Command ^
  "Start-Process node -ArgumentList 'dist/index.js' -WorkingDirectory '%BACKEND_DIR%' -WindowStyle Hidden"

:: Wait until port 5000 is accepting connections (max ~60 s)
set /a TRIES=0
:wait_loop
set /a TRIES+=1
if %TRIES% GTR 30 (
  echo Backend did not start after 60 seconds. Aborting.
  exit /b 1
)
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command ^
  "try { $t = New-Object Net.Sockets.TcpClient('localhost',5000); $t.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto wait_loop

:: Flutter crash-restart loop — relaunches the exe every time it exits
:flutter_loop
"%FLUTTER_EXE%"
timeout /t 3 /nobreak >nul
goto flutter_loop
