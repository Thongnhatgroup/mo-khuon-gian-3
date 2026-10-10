@echo off
chcp 65001 >nul
title Kiem tra ket noi camera
cd /d "%~dp0"
set "NODE="
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
if not defined NODE ( where node >nul 2>nul && set "NODE=node" )
if not defined NODE (
  echo Chua co Node.js tren may nay - hay chay file CAI-DAT.bat truoc.
  pause
  exit /b 1
)
"%NODE%" isapi-agent.js --kiem-tra
pause
