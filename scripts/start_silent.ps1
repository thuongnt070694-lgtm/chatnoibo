$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Add-Type -AssemblyName System.Windows.Forms

# 1. Kiểm tra và khởi động máy chủ Node.js (cổng 3888) chạy ngầm hoàn toàn
$portActive = Get-NetTCPConnection -LocalPort 3888 -State Listen -ErrorAction SilentlyContinue
if (-not $portActive) {
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $rootDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 2. Khởi động Cloudflare Tunnel chạy ngầm hoàn toàn
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$logFile = Join-Path $rootDir "cloudflared.log"
if (Test-Path $logFile) {
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
}

Start-Process -FilePath (Join-Path $rootDir "cloudflared.exe") `
    -ArgumentList "tunnel --url http://localhost:3888 --logfile `"$logFile`"" `
    -WorkingDirectory $rootDir `
    -WindowStyle Hidden

# 3. Đợi và lấy link https://xxxx.trycloudflare.com từ file log
$tunnelUrl = ""
$timeoutSeconds = 20
$sw = [System.Diagnostics.Stopwatch]::StartNew()

while ($sw.Elapsed.TotalSeconds -lt $timeoutSeconds -and -not $tunnelUrl) {
    Start-Sleep -Milliseconds 600
    if (Test-Path $logFile) {
        try {
            $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
                $tunnelUrl = $matches[0]
            }
        } catch {}
    }
}

# 4. Lưu link vào file text và copy vào Clipboard
$linkFile = Join-Path $rootDir "Link_Ket_Noi_Hien_Tai.txt"
if ($tunnelUrl) {
    $infoText = @"
==================================================================
EASYCHAT - LINK KẾT NỐI INTERNET HIỆN TẠI
Thời gian khởi động: $(Get-Date -Format "HH:mm:ss dd/MM/yyyy")
==================================================================

🔗 LINK INTERNET:
$tunnelUrl

📌 HƯỚNG DẪN:
1. Gửi link này cho đồng nghiệp ở chi nhánh hoặc văn phòng khác.
2. Đồng nghiệp có thể mở EasyChat.exe (nhấn F2 và dán link này vào)
   hoặc mở trực tiếp trên trình duyệt Chrome/Edge/Điện thoại.
3. Cả Node.js và Cloudflare đang chạy ngầm 100%, KHÔNG chiếm chỗ thanh Taskbar!
==================================================================
"@
    Set-Content -Path $linkFile -Value $infoText -Encoding UTF8

    try {
        [System.Windows.Forms.Clipboard]::SetText($tunnelUrl)
    } catch {}

    $msg = "✅ Máy chủ EasyChat và Cloudflare đã CHẠY NGẦM thành công!`n`n" +
           "(Hoàn toàn không chiếm chỗ trên thanh Taskbar)`n`n" +
           "🔗 Link kết nối Internet của bạn:`n$tunnelUrl`n`n" +
           "📋 ĐÃ TỰ ĐỘNG COPY VÀO BỘ NHỚ TẠM (CLIPBOARD)!`n" +
           "Bạn chỉ cần nhấn Ctrl + V để gửi cho đồng nghiệp hoặc dán vào EasyChat.exe (F2)."

    [System.Windows.Forms.MessageBox]::Show($msg, "EasyChat - Máy chủ Internet", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
} else {
    $errMsg = "⚠️ Máy chủ đã được khởi động ngầm nhưng chưa lấy được link ngay.`nVui lòng mở file 'Xem_Trang_Thai_Va_Link.bat' sau vài giây để lấy link."
    [System.Windows.Forms.MessageBox]::Show($errMsg, "EasyChat - Thông báo", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
}
