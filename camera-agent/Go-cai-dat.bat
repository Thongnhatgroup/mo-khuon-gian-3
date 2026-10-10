@echo off
chcp 65001 >nul
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del /Q "%STARTUP%\Cau-noi-camera-mo.bat" 2>nul
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); Remove-Item (Join-Path $d 'Cau noi camera - CHAY.lnk'),(Join-Path $d 'Cau noi camera - KIEM TRA.lnk') -ErrorAction SilentlyContinue" >nul 2>&1
echo Da go: chuong trinh se KHONG tu chay khi bat may nua, da xoa loi tat tren man hinh.
echo Neu muon xoa han: dong cua so chuong trinh dang chay roi xoa thu muc C:\CauNoiCamera
pause
