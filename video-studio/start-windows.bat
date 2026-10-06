@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Chua cai Node.js. Tai tai https://nodejs.org (ban LTS) roi chay lai. & pause & exit /b)
if not exist node_modules (
  echo Dang cai thu vien lan dau, vui long doi vai phut...
  call npm install
)
start "" http://localhost:3210
node server/index.js
pause
