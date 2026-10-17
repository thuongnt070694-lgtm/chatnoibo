@echo off
chcp 65001 >nul
title [EasyChat] - Kiem Tra Trang Thai May Chu
color 0b

echo ===============================================================================
echo                TRẠNG THÁI MÁY CHỦ EASYCHAT & CLOUDFLARE
echo ===============================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    `$nodeActive = Get-NetTCPConnection -LocalPort 3888 -State Listen -ErrorAction SilentlyContinue
    `$cfActive = Get-Process cloudflared -ErrorAction SilentlyContinue

    Write-Host '1. Máy chủ Node.js (cổng 3888): ' -NoNewline
    if (`$nodeActive) { Write-Host 'ĐANG CHẠY TỐT [OK]' -ForegroundColor Green } else { Write-Host 'ĐÃ DỪNG [STOP]' -ForegroundColor Red }

    Write-Host '2. Đường truyền Cloudflare:   ' -NoNewline
    if (`$cfActive) { Write-Host 'ĐANG CHẠY TỐT [OK]' -ForegroundColor Green } else { Write-Host 'ĐÃ DỪNG [STOP]' -ForegroundColor Red }

    Write-Host ''
    if (Test-Path 'Link_Ket_Noi_Hien_Tai.txt') {
        Get-Content 'Link_Ket_Noi_Hien_Tai.txt'
    } else {
        Write-Host 'Chưa có file link kết nối. Hãy chạy file Bat_May_Chu_Ngam.vbs trước.' -ForegroundColor Yellow
    }
}"

echo.
echo ===============================================================================
echo Nhấn phím bất kỳ để đóng cửa sổ này...
pause >nul
