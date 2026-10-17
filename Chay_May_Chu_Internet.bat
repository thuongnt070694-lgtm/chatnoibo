@echo off
chcp 65001 >nul
title [EasyChat] - KET NOI MAY CHU RA INTERNET (CLOUDFLARE TUNNEL)
color 0b

echo ===============================================================================
echo                EASYCHAT - KET NOI RA INTERNET QUA CLOUDFLARE
echo ===============================================================================
echo.
echo [1/2] Dang kiem tra may chu Node.js EasyChat (cong 3888)...

netstat -ano | findstr :3888 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [INFO] May chu Node.js chua bat. Dang tu dong khoi dong server.js tren cong 3888...
    start "EasyChat Server" cmd /k "node server.js"
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] May chu Node.js EasyChat dang hoat dong tot tren cong 3888!
)

echo.
echo [2/2] Dang tao duong ham HTTPS Internet an toan cho EasyChat...
echo.
echo -------------------------------------------------------------------------------
echo HUONG DAN SU DUNG:
echo 1. Doi khoang 3-5 giay, ben duoi se xuat hien dong link:
echo    https://xxxx-xxxx-xxxx.trycloudflare.com
echo.
echo 2. Gui link do cho dong nghiep o van phong khac:
echo    - Cach A: Mo EasyChat.exe -^> Bam F2 -^> Dan link do vao -^> Luu
echo    - Cach B: Hoac mo trinh duyet Chrome / Edge / Dien thoai vao thang link do!
echo.
echo 3. GIU NGUYEN CUA SO NAY trong suot qua trinh chat. Khi tat cua so, duong ham se dong.
echo -------------------------------------------------------------------------------
echo.

cloudflared.exe tunnel --url http://localhost:3888

pause
