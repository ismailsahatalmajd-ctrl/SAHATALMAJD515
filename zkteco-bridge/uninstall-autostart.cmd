@echo off
chcp 65001 >nul
set TASK_LOGON=ZKTeco Firebase Bridge (Logon)
set TASK_STARTUP=ZKTeco Firebase Bridge (Startup)
set TASK_WAKE=ZKTeco Firebase Bridge (Wake)
set TASK_HEALTH_OLD=ZKTeco Firebase Bridge (HealthCheck)
set TASK_HEALTH_0200=ZKTeco Firebase Bridge (HealthCheck 0200)
set TASK_HEALTH_0600=ZKTeco Firebase Bridge (HealthCheck 0600)
set TASK_HEALTH_1000=ZKTeco Firebase Bridge (HealthCheck 1000)
set TASK_HEALTH_1800=ZKTeco Firebase Bridge (HealthCheck 1800)
set STARTUP_CMD=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Start-ZKBridge.cmd

echo.
echo إزالة ZKTeco Bridge من المهام التلقائية...

schtasks /delete /tn "%TASK_LOGON%" /f >nul 2>&1
schtasks /delete /tn "%TASK_STARTUP%" /f >nul 2>&1
schtasks /delete /tn "%TASK_WAKE%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_OLD%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_0200%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_0600%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_1000%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_1800%" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 02:00)" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 06:00)" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 10:00)" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 18:00)" /f >nul 2>&1

if exist "%STARTUP_CMD%" del /f /q "%STARTUP_CMD%" >nul 2>&1

echo ✅ تم تنفيذ إزالة المهام (إن كانت موجودة).

echo.
pause
