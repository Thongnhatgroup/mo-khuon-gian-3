@echo off
chcp 65001 >nul
setlocal EnableExtensions
title CAI DAT - Cau noi Camera ANPR - Mo Khuon Gian 3
set "NGUON=%~dp0"
set "DICH=C:\CauNoiCamera"
set "NODEVER=v22.12.0"
set "ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "ARCH=x86"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo ================================================================
echo    CAI DAT CHUONG TRINH CAU NOI CAMERA ANPR - MO KHUON GIAN 3
echo    Camera 192.168.1.199  --^>  Phan mem quan ly mo (Netlify)
echo ================================================================
echo.

if not exist "%NGUON%isapi-agent.js" (
  echo LOI: Chua giai nen file ZIP.
  echo Hay bam chuot phai vao file ZIP - chon "Extract All..." [Giai nen tat ca],
  echo sau do mo thu muc vua giai nen va bam dup lai file CAI-DAT.bat
  pause
  exit /b 1
)

echo [1/6] Sao chep chuong trinh vao %DICH% ...
if not exist "%DICH%" mkdir "%DICH%"
if /I not "%NGUON%"=="%DICH%\" (
  xcopy "%NGUON%*" "%DICH%\" /E /I /Y /Q >nul
  if errorlevel 1 (
    echo LOI: Khong sao chep duoc vao %DICH%.
    echo Hay bam chuot phai vao CAI-DAT.bat - chon "Run as administrator".
    pause
    exit /b 1
  )
)
cd /d "%DICH%"
echo       Xong.
echo.

echo [2/6] Kiem tra Node.js ...
set "NODE="
if exist "%DICH%\node\node.exe" set "NODE=%DICH%\node\node.exe"
if not defined NODE ( where node >nul 2>nul && set "NODE=node" )
if not defined NODE (
  echo       May chua co Node.js - dang tu tai ban %NODEVER% [khoang 30 MB], vui long cho 1-3 phut...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $u='https://nodejs.org/dist/%NODEVER%/node-%NODEVER%-win-%ARCH%.zip'; $z=Join-Path $env:TEMP 'node-cau-noi.zip'; Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing; $t=Join-Path $env:TEMP 'node-cau-noi'; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; Expand-Archive -Path $z -DestinationPath $t -Force; New-Item -ItemType Directory -Force -Path '%DICH%\node' | Out-Null; Copy-Item (Join-Path $t 'node-%NODEVER%-win-%ARCH%\node.exe') '%DICH%\node\node.exe' -Force"
  if exist "%DICH%\node\node.exe" set "NODE=%DICH%\node\node.exe"
)
if not defined NODE (
  echo.
  echo LOI: Khong tu tai duoc Node.js [may chua co Internet hoac bi chan].
  echo Cach xu ly: mo trang https://nodejs.org - tai ban "LTS" - cai dat [Next, Next, Finish],
  echo roi bam dup lai file CAI-DAT.bat
  start "" https://nodejs.org
  pause
  exit /b 1
)
echo       Da co Node.js.
echo.

echo [3/6] Kiem tra mang noi bo toi camera 192.168.1.199 ...
ping -n 2 -w 1500 192.168.1.199 >nul
if errorlevel 1 (
  echo       CANH BAO: may nay khong "ping" duoc camera 192.168.1.199.
  echo       Kiem tra may tinh co cam day mang cung mang voi camera khong.
  echo       [Neu camera chan ping thi co the bo qua canh bao nay.]
) else (
  echo       Thong mang toi camera.
)
echo.

echo [4/6] Cau hinh va kiem tra ket noi ...
echo       Lan dau se hoi thong tin camera. Bam Enter de giu gia tri trong ngoac [ ].
echo       Chi can go MAT KHAU camera roi bam Enter.
echo.
"%NODE%" isapi-agent.js --kiem-tra
if errorlevel 1 (
  echo.
  echo Kiem tra CHUA DAT. Xem muc "Xu ly su co" trong file HUONG-DAN-CAI-DAT.pdf
  choice /C CK /M "Van tiep tuc cai dat de chuong trinh tu thu ket noi lai? [C = Co, K = Khong]"
  if errorlevel 2 exit /b 1
)
echo.

echo [5/6] Cai tu chay khi bat may + tao loi tat tren man hinh ...
> "%STARTUP%\Cau-noi-camera-mo.bat" echo @echo off
>> "%STARTUP%\Cau-noi-camera-mo.bat" echo start "Cau noi camera" /min "%DICH%\Chay-camera-ISAPI.bat"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); foreach ($x in @(@('Cau noi camera - CHAY','Chay-camera-ISAPI.bat'),@('Cau noi camera - KIEM TRA','Kiem-tra-ket-noi-camera.bat'))) { $l=$s.CreateShortcut((Join-Path $d ($x[0]+'.lnk'))); $l.TargetPath='%DICH%\'+$x[1]; $l.WorkingDirectory='%DICH%'; $l.Save() }" >nul 2>&1
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
echo       Xong - chuong trinh se tu chay moi khi bat may va dang nhap Windows.
echo.

echo [6/6] Khoi dong chuong trinh ...
start "Cau noi camera" "%DICH%\Chay-camera-ISAPI.bat"
echo.
echo ================================================================
echo   CAI DAT HOAN TAT.
echo   Cua so den vua mo ra la chuong trinh dang chay:
echo     - KHONG DONG cua so do (co the thu nho xuong thanh tac vu).
echo     - Moi xe qua cong se hien 1 dong tren cua so do.
echo   Mo phan mem tren dien thoai/may tinh - man Bao ve - khung trang
echo   thai camera phai hien mau XANH trong vong 1-2 phut.
echo ================================================================
pause
