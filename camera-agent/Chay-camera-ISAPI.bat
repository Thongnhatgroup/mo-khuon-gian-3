@echo off
chcp 65001 >nul
title Cau noi Camera ANPR - Mo Khuon Gian 3 - KHONG DONG CUA SO NAY
cd /d "%~dp0"
set "NODE="
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
if not defined NODE ( where node >nul 2>nul && set "NODE=node" )
if not defined NODE (
  echo Chua co Node.js tren may nay - hay chay file CAI-DAT.bat truoc.
  pause
  exit /b 1
)
:lap
"%NODE%" isapi-agent.js
if errorlevel 3 if not errorlevel 4 exit /b 0
echo.
echo Chuong trinh da dung - tu khoi dong lai sau 10 giay. Dong cua so nay neu muon dung han.
timeout /t 10 /nobreak >nul
goto lap
