@echo off
chcp 65001 >nul
cd /d "%~dp0"
node isapi-agent.js --kiem-tra
pause
