@echo off
setlocal
cd /d "%~dp0"
title XIV Gear Lab - Check game data

echo XIV Gear Lab - read-only game data check
echo.
echo This checks whether the configured providers expose a newer official
echo catalogue version. It cannot change, sign, commit or upload anything.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required to run this repository-owner tool.
  echo Install them or run the check from the development environment.
  echo.
  pause
  exit /b 2
)

call npm run data:check
set "result=%ERRORLEVEL%"
echo.
if not "%result%"=="0" (
  echo The check did not complete. Read the error above and try again later.
) else (
  echo Detailed local report: artifacts\data-availability-check.json
  echo If compatible data was detected, use Update-Game-Data.cmd to prepare it.
)
echo.
pause
exit /b %result%
