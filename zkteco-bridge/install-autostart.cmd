@echo off
REM ─────────────────────────────────────────────────────────────
REM  تثبيت Bridge كـ Windows Scheduled Task (يشتغل مع الويندوز)
REM  شغّله مرة واحدة فقط كـ Administrator
REM ─────────────────────────────────────────────────────────────

set BRIDGE_DIR=%~dp0
set ENSURE_SCRIPT=%BRIDGE_DIR%ensure-bridge.ps1
set TASK_LOGON=ZKTeco Firebase Bridge (Logon)
set TASK_STARTUP=ZKTeco Firebase Bridge (Startup)
set TASK_WAKE=ZKTeco Firebase Bridge (Wake)
set TASK_HEALTH=ZKTeco Firebase Bridge (HealthCheck)

echo.
echo ================================================
echo  تثبيت ZKTeco Bridge كمهمة تلقائية في Windows
echo ================================================
echo.

REM حذف المهام القديمة إن وُجدت
schtasks /delete /tn "%TASK_LOGON%" /f >nul 2>&1
schtasks /delete /tn "%TASK_STARTUP%" /f >nul 2>&1
schtasks /delete /tn "%TASK_WAKE%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH%" /f >nul 2>&1

REM عند تسجيل الدخول
schtasks /create ^
  /tn "%TASK_LOGON%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc ONLOGON ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

REM عند إقلاع الجهاز
schtasks /create ^
  /tn "%TASK_STARTUP%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc ONSTART ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

REM فحص دوري كل 5 دقائق (يعيد التشغيل إذا توقف)
schtasks /create ^
  /tn "%TASK_HEALTH%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc MINUTE ^
  /mo 5 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

REM بعد الاستيقاظ من السكون
schtasks /create ^
  /tn "%TASK_WAKE%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc ONEVENT ^
  /ec System ^
  /mo "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]" ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% == 0 (
  echo.
  echo ✅ تم التثبيت بنجاح!
  echo    Bridge سيعود تلقائياً بعد الاستيقاظ إذا كان متوقف.
  echo    ملاحظة: أثناء السكون نفسه لا يمكن تشغيل أي برنامج.
  echo.
  echo    لإزالة التثبيت لاحقاً: شغّل uninstall-autostart.cmd
) else (
  echo.
  echo ❌ فشل التثبيت. تأكد أنك شغّلت الملف كـ Administrator
  echo    (كليك يمين على الملف → Run as administrator)
)

echo.
pause
