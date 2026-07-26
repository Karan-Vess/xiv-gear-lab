@echo off
setlocal
cd /d "%~dp0"
echo XIV Gear Lab - owner-run patch data update
echo.
set /p "patch=Patch version to check (example: 7.6): "
if "%patch%"=="" (
  echo No patch version was entered.
  pause
  exit /b 2
)
set /p "refresh=Force a supporting-source refresh even if official data is unchanged? [y/N]: "
if /I "%refresh%"=="Y" (
  call npm run data:update:patch -- --patch "%patch%" --force
) else (
  call npm run data:update:patch -- --patch "%patch%"
)
set "result=%ERRORLEVEL%"
echo.
if not "%result%"=="0" echo The update did not complete. Read the message above before retrying.
pause
exit /b %result%
