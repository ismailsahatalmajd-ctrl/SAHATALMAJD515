@echo off
title ZKTeco API Auto Restart

cd /d D:\zkteco-api

:START
echo Starting Server...
node index.js

echo Server crashed! Restarting in 5 seconds...
timeout /t 5
goto START