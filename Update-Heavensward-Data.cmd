@echo off
setlocal
cd /d "%~dp0"
echo XIV Gear Lab - owner-run Heavensward data update
echo.
call npm run data:update:heavensward
set "result=%ERRORLEVEL%"
echo.
if not "%result%"=="0" echo The update did not complete. Read the message above before retrying.
pause
exit /b %result%
