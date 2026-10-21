@echo off
chcp 65001 >nul
title [EasyChat] - Kiem Tra Trang Thai May Chu
color 0b

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check_status.ps1"

echo.
echo Nhan phim bat ky de dong cua so nay...
pause >nul
