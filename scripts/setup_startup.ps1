$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'EasyChat_Server_Silent.lnk'
$targetPath = Join-Path $rootDir 'Bat_May_Chu_Ngam.vbs'

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $rootDir
$shortcut.Description = 'Tu dong chay ngam May chu EasyChat khi bat may'
$shortcut.Save()

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "       CAI DAT MAY CHU EASYCHAT TU DONG CHAY NGAM CUNG WINDOWS" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [THANH CONG] DA CAI DAT XONG!" -ForegroundColor Green
Write-Host "  Tu gio moi khi ban bat may tinh len, may chu EasyChat va Cloudflare" -ForegroundColor White
Write-Host "  se TU DONG CHAY NGAM 100% trong nen (khong chiem cho tren Taskbar)." -ForegroundColor White
Write-Host ""
Write-Host "  Phim tat da duoc them vao thu muc Windows Startup:" -ForegroundColor Gray
Write-Host "  $shortcutPath" -ForegroundColor DarkGray
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Cyan