@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or newer before starting this application.
  pause
  exit /b 1
)
if not exist "node_modules\pdfkit" (
  echo Run npm install in this folder once, then start the app again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:3000 in your browser.
echo Keep this window open while using DSA-LEAVE-PASS.
node server/index.mjs
pause
