@echo off
chcp 65001 >nul
title [EasyChat] - Cài Đặt Tự Động Khởi Động
color 0a

echo ===============================================================================
echo        CÀI ĐẶT MÁY CHỦ EASYCHAT TỰ ĐỘNG CHẠY NGẦM CÙNG WINDOWS
echo ===============================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    `$startupFolder = [Environment]::GetFolderPath('Startup')
    `$shortcutPath = Join-Path `$startupFolder 'EasyChat_Server_Silent.lnk'
    `$targetPath = Join-Path (Get-Location) 'Bat_May_Chu_Ngam.vbs'
    `$wshShell = New-Object -ComObject WScript.Shell
    `$shortcut = `$wshShell.CreateShortcut(`$shortcutPath)
    `$shortcut.TargetPath = `$targetPath
    `$shortcut.WorkingDirectory = (Get-Location).Path
    `$shortcut.Description = 'Tu dong chay ngam May chu EasyChat khi bat may'
    `$shortcut.Save()
    Write-Host '-------------------------------------------------------------------------------'
    Write-Host '  [THÀNH CÔNG] ĐÃ CÀI ĐẶT XONG!' -ForegroundColor Green
    Write-Host '  Từ giờ mỗi khi bạn bật máy tính lên, máy chủ EasyChat và Cloudflare'
    Write-Host '  sẽ TỰ ĐỘNG CHẠY NGẦM 100% trong nền (không hiện bất kỳ cửa sổ nào).'
    Write-Host '-------------------------------------------------------------------------------'
}"

echo.
pause
