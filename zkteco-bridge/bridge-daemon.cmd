@echo off
setlocal

REM Background loop: restarts bridge automatically if it exits.
cd /d "%~dp0"

REM Edit these if your device IP/port differs
set ZK_IP=192.168.10.121
set ZK_PORT=4370

:loop
node bridge.js >> bridge-autostart.log 2>&1
REM Wait a bit before retry to avoid tight crash loop
powershell -NoProfile -Command "Start-Sleep -Seconds 5" >nul 2>&1
goto loop
