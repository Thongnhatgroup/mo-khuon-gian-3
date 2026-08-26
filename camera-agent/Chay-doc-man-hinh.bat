@echo off
REM Chay-doc-man-hinh.bat
REM ---------------------------------------------------------------------------
REM Bam DUP CHUOT vao file nay de chay chuong trinh "doc man hinh" (Cach 2) --
REM khong can biet go lenh, khong can mo Command Prompt thu cong. File nay tu
REM lam het: kiem tra Node.js, tu cai thu vien can thiet (lan dau), roi chay
REM chuong trinh. Lan sau chi can bam dup chuot lai file nay la chay ngay,
REM khong can cai lai tu dau.
REM ---------------------------------------------------------------------------
chcp 65001 >nul
cd /d "%~dp0"
title Doc man hinh HikCentral - Mo Khuon Gian 3

echo ============================================================
echo   CHUONG TRINH DOC MAN HINH HIKCENTRAL - MO KHUON GIAN 3
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua tim thay Node.js tren may tinh nay.
  echo.
  echo Dang mo trang tai Node.js trong trinh duyet - hay tai va cai dat
  echo ban "LTS" ^(bam Next - Next - Finish la xong^), sau do bam dup chuot
  echo lai file nay ^(Chay-doc-man-hinh.bat^) de chay tiep.
  echo.
  start https://nodejs.org
  echo Nhan phim bat ky de dong cua so nay...
  pause >nul
  exit /b 1
)

if not exist "node_modules" (
  echo Lan dau chay - dang tu cai dat cac thu vien can thiet...
  echo ^(Can co mang internet, co the mat vai phut, xin cho...^)
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [LOI] Cai dat that bai. Kiem tra lai ket noi mang internet cua may
    echo tinh nay roi bam dup chuot chay lai file nay.
    echo.
    pause >nul
    exit /b 1
  )
  echo.
  echo Cai dat xong.
  echo.
)

echo Dang mo chuong trinh doc man hinh...
echo ^(Nho GIU NGUYEN cua so phan mem HikCentral Control Client dang mo tren
echo man hinh, khung "Vehicle" dang hien danh sach xe - KHONG thu nho cua so
echo do. De dung chuong trinh nay, dong cua so den nay lai hoac nhan Ctrl+C.^)
echo.

node doc-man-hinh.js

echo.
echo Chuong trinh da dung. Nhan phim bat ky de dong cua so nay...
pause >nul
