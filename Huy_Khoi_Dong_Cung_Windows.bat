@echo off
chcp 65001 >nul
title [EasyChat] - Hủy Tự Động Khởi Động
color 0e

echo ===============================================================================
echo        HỦY TỰ ĐỘNG KHỞI ĐỘNG CÙNG WINDOWS
echo ===============================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    `$startupFolder = [Environment]::GetFolderPath('Startup')
    `$shortcutPath = Join-Path `$startupFolder 'EasyChat_Server_Silent.lnk'
    if (Test-Path `$shortcutPath) {
        Remove-Item `$shortcutPath -Force
        Write-Host '[OK] Đã hủy tự động khởi động cùng Windows thành công.' -ForegroundColor Green
    } else {
        Write-Host 'Chưa có cấu hình khởi động cùng Windows.' -ForegroundColor Yellow
    }
}"

echo.
pause
