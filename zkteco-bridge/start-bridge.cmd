@echo off
setlocal

REM One-click launcher for Work PC (Windows)
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

echo Starting ZKTeco Firebase Bridge...
echo.

REM Edit these if your device IP/port differs
set ZK_IP=192.168.10.121
set ZK_PORT=4370

node bridge.js

echo.
echo Bridge stopped.
pause
