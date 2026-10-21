$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Add-Type -AssemblyName System.Windows.Forms

# 1. Dung tien trinh cloudflared cu neu co
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# 2. Kiem tra va khoi dong Node.js server.js tren cong 3888
$portActive = Get-NetTCPConnection -LocalPort 3888 -State Listen -ErrorAction SilentlyContinue
if (-not $portActive) {
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $rootDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 3. Khoi dong Cloudflare Tunnel
$logFile = Join-Path $rootDir "cloudflared.log"
if (Test-Path $logFile) {
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
}

Start-Process -FilePath (Join-Path $rootDir "cloudflared.exe") `
    -ArgumentList "tunnel --url http://localhost:3888 --logfile `"$logFile`"" `
    -WorkingDirectory $rootDir `
    -WindowStyle Hidden

# 4. Doi lay link trycloudflare.com
$tunnelUrl = ""
$timeoutSeconds = 25
$sw = [System.Diagnostics.Stopwatch]::StartNew()

while ($sw.Elapsed.TotalSeconds -lt $timeoutSeconds -and -not $tunnelUrl) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        try {
            $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
                $tunnelUrl = $matches[0]
            }
        } catch {}
    }
}

# 5. Cap nhat link
if ($tunnelUrl) {
    $infoText = "==================================================================`r`n" +
                "EASYCHAT - LINK KET NOI INTERNET HIEN TAI`r`n" +
                "Thoi gian: $(Get-Date -Format 'HH:mm:ss dd/MM/yyyy')`r`n" +
                "==================================================================`r`n`r`n" +
                "LINK INTERNET:`r`n$tunnelUrl`r`n`r`n" +
                "=================================================================="

    Set-Content -Path (Join-Path $rootDir "Link_Ket_Noi_Hien_Tai.txt") -Value $infoText -Encoding UTF8

    # Tu dong cap nhat vao config.json cua EasyChat de nguoi dung khong can bam F2 doi link nua!
    $configObj = @{
        ServerUrl = $tunnelUrl
        EnableNotification = $true
        ShowMessagePreview = $true
        EnableTaskbarFlash = $true
        EnableTaskbarBadge = $true
    }
    $configJson = $configObj | ConvertTo-Json -Compress

    # Cap nhat tai thu muc dist-app
    $distConfigFile = Join-Path $rootDir "dist-app\config.json"
    if (Test-Path (Join-Path $rootDir "dist-app")) {
        Set-Content -Path $distConfigFile -Value $configJson -Encoding UTF8
    }

    # Cap nhat tai AppData
    $appDataDir = Join-Path $env:APPDATA "EasyChat"
    if (-not (Test-Path $appDataDir)) { New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null }
    Set-Content -Path (Join-Path $appDataDir "config.json") -Value $configJson -Encoding UTF8

    try {
        [System.Windows.Forms.Clipboard]::SetText($tunnelUrl)
    } catch {}

    # 6. Tu dong dong bo len Cloud Discovery (GitHub) cho tat ca may dong nghiep ket noi tu dong
    try {
        $serverUrlFile = Join-Path $rootDir "server_url.txt"
        [System.IO.File]::WriteAllText($serverUrlFile, $tunnelUrl, (New-Object System.Text.UTF8Encoding $false))
        
        $gitStatus = git status --porcelain server_url.txt
        if ($gitStatus) {
            git add server_url.txt
            git commit -m "Auto-discovery: update server URL [skip ci]" -- server_url.txt
            git push origin main
        }
    } catch {
        # Bo qua loi neu tam thoi khong co mang ngoai
    }

    $msg = "May chu EasyChat va Cloudflare da CHAY NGAM thanh cong!`n`n" +
           "(Hoan toan khong chiem cho tren thanh Taskbar)`n`n" +
           "Link ket noi Internet:`n$tunnelUrl`n`n" +
           "DA DONG BO TU DONG CHO TAT CA DONG NGHIEP!`n" +
           "Moi nguoi chi can mo EasyChat.exe la tu dong vao ngay ma khong can thao tac gi."

    try {
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.Popup($msg, 5, "EasyChat - May chu Internet", 64) | Out-Null
    } catch {
        [System.Windows.Forms.MessageBox]::Show($msg, "EasyChat - May chu Internet", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
    }
} else {
    $errMsg = "May chu da chay nhung chua lay duoc link Cloudflare ngay.`nVui long kiem tra lai sau it giay."
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.Popup($errMsg, 5, "EasyChat - Thong bao", 48) | Out-Null
    } catch {
        [System.Windows.Forms.MessageBox]::Show($errMsg, "EasyChat - Thong bao", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
    }
}
