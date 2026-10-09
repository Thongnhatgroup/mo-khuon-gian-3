@echo off
chcp 65001 >nul
set "DICH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Cau-noi-camera-mo.bat"
> "%DICH%" echo @echo off
>> "%DICH%" echo start "Cau noi camera" /min cmd /c ""%~dp0Chay-camera-ISAPI.bat""
echo Da cai dat: chuong trinh cau noi camera se tu chay moi khi bat may tinh.
echo (Muon bo: xoa file "%DICH%")
pause
