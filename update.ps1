# 社内ヘルプデスク 更新スクリプト
#
# 使い方（PowerShell に貼り付けて Enter）:
#   iwr -useb https://raw.githubusercontent.com/minamikinjo24-lang/help/claude/internal-helpdesk-design-k6udmr/update.ps1 | iex
#
# やること: 起動中なら停止 → .env を退避 → 最新版を取得 → .env を戻す → 依存を入れる → 起動

$ErrorActionPreference = 'Stop'

$Root    = 'C:\helpdesk'
$AppDir  = Join-Path $Root 'help-claude-internal-helpdesk-design-k6udmr'
$ZipUrl  = 'https://github.com/minamikinjo24-lang/help/archive/refs/heads/claude/internal-helpdesk-design-k6udmr.zip'
$ZipPath = Join-Path $env:TEMP 'helpdesk-update.zip'
$EnvBak  = Join-Path $Root 'env-backup.txt'

function Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }

Step 1 "起動中のアプリを停止します"
$stopped = 0
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    $stopped++
  }
if ($stopped -gt 0) { Write-Host "    停止しました" } else { Write-Host "    動いていませんでした" }

Step 2 "設定ファイル (.env) を退避します"
$EnvPath = Join-Path $AppDir '.env'
if (Test-Path $EnvPath) {
  Copy-Item $EnvPath $EnvBak -Force
  Write-Host "    $EnvBak に保存しました"
} elseif (Test-Path $EnvBak) {
  Write-Host "    今の .env はありませんが、以前の退避ファイルを使います"
} else {
  Write-Host "    .env が見つかりません。更新後に作成が必要です" -ForegroundColor Yellow
}

Step 3 "最新版をダウンロードします"
if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Path $Root | Out-Null }
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath
Write-Host "    完了"

Step 4 "展開します"
Expand-Archive -Path $ZipPath -DestinationPath $Root -Force
Remove-Item $ZipPath -Force
Write-Host "    完了"

Step 5 "設定ファイルを戻します"
if (Test-Path $EnvBak) {
  Copy-Item $EnvBak (Join-Path $AppDir '.env') -Force
  Write-Host "    完了"
} else {
  Write-Host "    戻す設定ファイルがありません" -ForegroundColor Yellow
}

Step 6 "必要な部品を入れます（1〜3分かかります）"
Set-Location $AppDir
& npm.cmd install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install に失敗しました" -ForegroundColor Red; exit 1 }

Step 7 "起動します"
Write-Host "    ブラウザで http://localhost:3000 を開いてください"
Write-Host "    終了するには Ctrl + C を押します"
Write-Host ""
& npm.cmd start
