@echo off
title Day code len GitHub
cd /d "%~dp0"

echo [1/4] Ket noi kho GitHub...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/thuongnt070694-lgtm/chatnoibo.git

echo [2/4] Gom toan bo file...
git add .

echo [3/4] Tao ban ghi commit...
git commit -m "Fix triet de: Khong bao gio bi nhay ve nhom chung khi chat rieng 1-1, bo sung nut nhan tin rieng trong popover thanh vien"
git branch -M main

echo [4/4] Dang dong bo va day len GitHub...
git push -u origin main --force

echo.
echo ==============================================
echo   DA DUA TOAN BO CODE LEN GITHUB THANH CONG!
echo   Kiem tra tai: https://github.com/thuongnt070694-lgtm/chatnoibo
echo ==============================================
echo.
pause
