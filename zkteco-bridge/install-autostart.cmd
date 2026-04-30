@echo off
chcp 65001 >nul
REM ─────────────────────────────────────────────────────────────
REM  تثبيت Bridge كـ Windows Scheduled Task (يشتغل مع الويندوز)
REM  شغّله مرة واحدة فقط كـ Administrator
REM ─────────────────────────────────────────────────────────────

set BRIDGE_DIR=%~dp0
set ENSURE_SCRIPT=%BRIDGE_DIR%ensure-bridge.ps1
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set STARTUP_CMD=%STARTUP_DIR%\Start-ZKBridge.cmd
set TASK_LOGON=ZKTeco Firebase Bridge (Logon)
set TASK_STARTUP=ZKTeco Firebase Bridge (Startup)
set TASK_WAKE=ZKTeco Firebase Bridge (Wake)
set TASK_HEALTH_0200=ZKTeco Firebase Bridge (HealthCheck 0200)
set TASK_HEALTH_0600=ZKTeco Firebase Bridge (HealthCheck 0600)
set TASK_HEALTH_1000=ZKTeco Firebase Bridge (HealthCheck 1000)
set TASK_HEALTH_1800=ZKTeco Firebase Bridge (HealthCheck 1800)
set IS_ADMIN=0
set LOGON_OK=0
set FALLBACK_OK=0

net session >nul 2>&1
if %ERRORLEVEL%==0 set IS_ADMIN=1

echo.
echo ================================================
echo  تثبيت ZKTeco Bridge كمهمة تلقائية في Windows
echo ================================================
echo.

REM حذف المهام القديمة إن وُجدت
schtasks /delete /tn "%TASK_LOGON%" /f >nul 2>&1
schtasks /delete /tn "%TASK_STARTUP%" /f >nul 2>&1
schtasks /delete /tn "%TASK_WAKE%" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck)" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_0200%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_0600%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_1000%" /f >nul 2>&1
schtasks /delete /tn "%TASK_HEALTH_1800%" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 02:00)" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 06:00)" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 10:00)" /f >nul 2>&1
schtasks /delete /tn "ZKTeco Firebase Bridge (HealthCheck 18:00)" /f >nul 2>&1

REM عند تسجيل الدخول
schtasks /create ^
  /tn "%TASK_LOGON%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc ONLOGON ^
  /rl LIMITED ^
  /f

if %ERRORLEVEL%==0 set LOGON_OK=1

if not %ERRORLEVEL%==0 (
  REM بعض الأجهزة تمنع ONLOGON بالصيغة السابقة للمستخدم العادي
  schtasks /create ^
    /tn "%TASK_LOGON%" ^
    /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
    /sc ONLOGON ^
    /f

  if %ERRORLEVEL%==0 set LOGON_OK=1
)

if "%LOGON_OK%"=="0" (
  REM fallback للمستخدم العادي: تشغيل عبر Startup folder
  > "%STARTUP_CMD%" echo @echo off
  >> "%STARTUP_CMD%" echo powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%ENSURE_SCRIPT%"
  if exist "%STARTUP_CMD%" set FALLBACK_OK=1
)

REM فحص مجدول 4 مرات يومياً (يعيد التشغيل إذا توقف)
schtasks /create ^
  /tn "%TASK_HEALTH_0200%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc DAILY ^
  /st 02:00 ^
  /rl LIMITED ^
  /f

if not %ERRORLEVEL%==0 (
  schtasks /create ^
    /tn "%TASK_HEALTH_0200%" ^
    /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
    /sc DAILY ^
    /st 02:00 ^
    /f
)

schtasks /create ^
  /tn "%TASK_HEALTH_0600%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc DAILY ^
  /st 06:00 ^
  /rl LIMITED ^
  /f

if not %ERRORLEVEL%==0 (
  schtasks /create ^
    /tn "%TASK_HEALTH_0600%" ^
    /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
    /sc DAILY ^
    /st 06:00 ^
    /f
)

schtasks /create ^
  /tn "%TASK_HEALTH_1000%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc DAILY ^
  /st 10:00 ^
  /rl LIMITED ^
  /f

if not %ERRORLEVEL%==0 (
  schtasks /create ^
    /tn "%TASK_HEALTH_1000%" ^
    /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
    /sc DAILY ^
    /st 10:00 ^
    /f
)

schtasks /create ^
  /tn "%TASK_HEALTH_1800%" ^
  /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
  /sc DAILY ^
  /st 18:00 ^
  /rl LIMITED ^
  /f

if not %ERRORLEVEL%==0 (
  schtasks /create ^
    /tn "%TASK_HEALTH_1800%" ^
    /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
    /sc DAILY ^
    /st 18:00 ^
    /f
)

if "%IS_ADMIN%"=="1" (
  REM عند إقلاع الجهاز
  schtasks /create ^
    /tn "%TASK_STARTUP%" ^
    /tr "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%ENSURE_SCRIPT%\"" ^
    /sc ONSTART ^
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
)

if %ERRORLEVEL% == 0 (
  echo.
  echo ✅ تم التثبيت بنجاح!
  echo    Bridge سيعود تلقائياً بعد الاستيقاظ إذا كان متوقف.
  echo    ملاحظة: أثناء السكون نفسه لا يمكن تشغيل أي برنامج.
  if "%IS_ADMIN%"=="0" (
    echo.
    echo ⚠️ تم التثبيت بوضع مستخدم عادي.
    if "%LOGON_OK%"=="1" (
      echo    تم تفعيل: Logon Task + HealthCheck.
    ) else (
      if "%FALLBACK_OK%"=="1" (
        echo    تم تفعيل: Startup folder fallback + HealthCheck.
      ) else (
        echo    تم تفعيل: HealthCheck فقط (وتعذر إنشاء Logon fallback).
      )
    )
    echo    للاستيقاظ/Startup الكامل: شغّل الملف كـ Administrator.
  )
  echo.
  echo    لإزالة التثبيت لاحقاً: شغّل uninstall-autostart.cmd
) else (
  echo.
  echo ❌ فشل التثبيت. تأكد أنك شغّلت الملف كـ Administrator
  echo    (كليك يمين على الملف → Run as administrator)
)

echo.
pause
