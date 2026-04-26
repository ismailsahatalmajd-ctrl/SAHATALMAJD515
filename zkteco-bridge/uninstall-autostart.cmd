@echo off
set TASK_LOGON=ZKTeco Firebase Bridge (Logon)
set TASK_STARTUP=ZKTeco Firebase Bridge (Startup)
set TASK_WAKE=ZKTeco Firebase Bridge (Wake)
set TASK_HEALTH=ZKTeco Firebase Bridge (HealthCheck)

echo.
echo إزالة ZKTeco Bridge من المهام التلقائية...

schtasks /delete /tn "%TASK_LOGON%" /f >nul 2>&1
schtasks /delete /tn "%TASK_STARTUP%" /f >nul 2>&1
schtasks /delete /tn "%TASK_WAKE%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH%" /f >nul 2>&1

echo ✅ تم تنفيذ إزالة المهام (إن كانت موجودة).

echo.
pause
