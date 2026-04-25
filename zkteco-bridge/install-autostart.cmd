@echo off
REM ─────────────────────────────────────────────────────────────
REM  تثبيت Bridge كـ Windows Scheduled Task (يشتغل مع الويندوز)
REM  شغّله مرة واحدة فقط كـ Administrator
REM ─────────────────────────────────────────────────────────────

set BRIDGE_DIR=%~dp0
set BRIDGE_SCRIPT=%BRIDGE_DIR%bridge.js
set TASK_NAME=ZKTeco Firebase Bridge

echo.
echo ================================================
echo  تثبيت ZKTeco Bridge كمهمة تلقائية في Windows
echo ================================================
echo.

REM حذف المهمة القديمة إن وُجدت
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

REM إنشاء المهمة: تشتغل عند بدء الجلسة بدون نافذة
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "node \"%BRIDGE_SCRIPT%\"" ^
  /sc ONLOGON ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% == 0 (
  echo.
  echo ✅ تم التثبيت بنجاح!
  echo    Bridge سيشتغل تلقائياً في كل مرة تفتح الويندوز.
  echo.
  echo    لإزالة التثبيت لاحقاً: شغّل uninstall-autostart.cmd
) else (
  echo.
  echo ❌ فشل التثبيت. تأكد أنك شغّلت الملف كـ Administrator
  echo    (كليك يمين على الملف → Run as administrator)
)

echo.
pause
