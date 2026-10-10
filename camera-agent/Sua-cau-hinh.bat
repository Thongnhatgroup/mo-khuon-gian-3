@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist cau-hinh-camera.json copy cau-hinh-camera.example.json cau-hinh-camera.json >nul
echo Dang mo file cau hinh bang Notepad.
echo Sua xong: bam Ctrl+S de luu, dong Notepad.
echo Sau do DONG cua so chuong trinh dang chay va bam dup lai loi tat "Cau noi camera - CHAY"
echo (hoac khoi dong lai may) de ap dung cau hinh moi.
notepad cau-hinh-camera.json
pause
