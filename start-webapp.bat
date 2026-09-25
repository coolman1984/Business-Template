@echo off
rem Double-click to run the business web app on this computer (development).
rem Needs Node.js 22 or newer: https://nodejs.org
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
echo Installing / checking packages...
call npx --yes pnpm@10.33.0 install --frozen-lockfile
if errorlevel 1 (
  echo Package installation failed. See the messages above.
  pause
  exit /b 1
)
call npx --yes pnpm@10.33.0 local
pause
