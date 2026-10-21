$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "               TRANG THAI MAY CHU EASYCHAT & CLOUDFLARE" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$nodeActive = Get-NetTCPConnection -LocalPort 3888 -State Listen -ErrorAction SilentlyContinue
$cfActive = Get-Process cloudflared -ErrorAction SilentlyContinue

Write-Host "1. May chu Node.js (cong 3888):  " -NoNewline
if ($nodeActive) {
    Write-Host "DANG CHAY TOT [OK]" -ForegroundColor Green
} else {
    Write-Host "DA DUNG [STOP]" -ForegroundColor Red
}

Write-Host "2. Duong truyen Cloudflare:    " -NoNewline
if ($cfActive) {
    Write-Host "DANG CHAY TOT [OK]" -ForegroundColor Green
} else {
    Write-Host "DA DUNG [STOP]" -ForegroundColor Red
}

Write-Host ""
$linkFile = Join-Path $rootDir "Link_Ket_Noi_Hien_Tai.txt"
if (Test-Path $linkFile) {
    Get-Content $linkFile
} else {
    Write-Host "Chua co file link ket noi. Hay chay file Bat_May_Chu_Ngam.vbs truoc." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan