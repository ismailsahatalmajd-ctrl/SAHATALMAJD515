@echo off
set TASK_NAME=ZKTeco Firebase Bridge

echo.
echo إزالة ZKTeco Bridge من المهام التلقائية...

schtasks /delete /tn "%TASK_NAME%" /f

if %ERRORLEVEL% == 0 (
  echo ✅ تم الإزالة بنجاح.
) else (
  echo ❌ لم يتم العثور على المهمة أو فشل الإزالة.
)

echo.
pause
