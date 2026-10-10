@echo off
chcp 65001 >nul
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Cau-noi-camera-mo.bat" echo @echo off
>> "%STARTUP%\Cau-noi-camera-mo.bat" echo start "Cau noi camera" /min "%~dp0Chay-camera-ISAPI.bat"
echo Da cai dat: chuong trinh cau noi camera se tu chay moi khi bat may tinh.
pause
