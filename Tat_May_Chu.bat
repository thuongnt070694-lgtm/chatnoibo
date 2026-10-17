@echo off
chcp 65001 >nul
title [EasyChat] - Tắt Máy Chủ
color 0c

echo ===============================================================================
echo                TẮT MÁY CHỦ EASYCHAT VÀ CLOUDFLARE
echo ===============================================================================
echo.
echo Đang tắt các tiến trình chạy ngầm...
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

echo.
echo [OK] Đã dừng thành công máy chủ EasyChat và Cloudflare Tunnel!
echo Toàn bộ tiến trình chạy ngầm đã được giải phóng.
echo.
timeout /t 3
