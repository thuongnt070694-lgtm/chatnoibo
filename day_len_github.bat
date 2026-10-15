@echo off
title Day code len GitHub
cd /d "%~dp0"

echo [1/4] Ket noi kho GitHub...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/thuongnt070694-lgtm/chatnoibo.git

echo [2/4] Gom toan bo file...
git add .

echo [3/4] Tao ban ghi commit...
git commit -m "He thong Chat va Goi thoai noi bo LAN"
git branch -M main

echo [4/4] Dang day len GitHub (git push)...
git push -u origin main

echo.
echo ==============================================
echo   DA HOAN TAT!
echo   Kiem tra tai: https://github.com/thuongnt070694-lgtm/chatnoibo
echo ==============================================
echo.
pause
