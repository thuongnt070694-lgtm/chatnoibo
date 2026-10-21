@echo off
chcp 65001 >nul
title [EasyChat] - Cai Dat Tu Dong Khoi Dong
color 0a

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup_startup.ps1"

echo.
echo Nhan phim bat ky de dong cua so nay...
pause >nul
