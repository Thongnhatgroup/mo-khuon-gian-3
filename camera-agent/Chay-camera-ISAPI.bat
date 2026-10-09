@echo off
chcp 65001 >nul
title Cau noi Camera ANPR - Phan mem quan ly mo Khuon Gian 3
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi cai dat, sau do chay lai file nay.
  pause
  exit /b 1
)
:lap
node isapi-agent.js
echo.
echo Chuong trinh da dung - tu khoi dong lai sau 10 giay. Dong cua so nay neu muon dung han.
timeout /t 10 /nobreak >nul
goto lap
