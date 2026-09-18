# 日報作成ツール かんたん起動スクリプト
#
# 使い方（PowerShell に貼り付けて Enter するだけ）:
#   iwr -useb https://raw.githubusercontent.com/minamikinjo24-lang/help/claude/internal-helpdesk-design-k6udmr/nippo.ps1 | iex
#
# やること: Node.js の確認 -> 起動中なら停止 -> 最新版を取得 -> 部品を入れる -> 起動

$Root    = 'C:\helpdesk'
$AppDir  = Join-Path $Root 'help-claude-internal-helpdesk-design-k6udmr\daily-report'
$ZipUrl  = 'https://github.com/minamikinjo24-lang/help/archive/refs/heads/claude/internal-helpdesk-design-k6udmr.zip'
$ZipPath = Join-Path $env:TEMP 'nippo.zip'
$Port    = 3200

function Step($n, $msg) { Write-Host ""; Write-Host "[$n/6] $msg" -ForegroundColor Cyan }
function Fail($msg) { throw $msg }

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Stop'

try {
  Step 1 "Node.js があるか確認します"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js が入っていません。https://nodejs.org/ja の左側（LTS）を入れたあと、PowerShell を開き直してもう一度やってください。"
  }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Fail "npm が見つかりません。Node.js を入れ直したあと、PowerShell を開き直してください。"
  }
  Write-Host ("    OK (Node.js " + (& node -v) + ")")

  Step 2 "すでに起動している日報ツールを止めます"
  $stopped = 0
  try {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; $stopped = $stopped + 1 }
  } catch { }
  if ($stopped -gt 0) { Write-Host "    止めました" } else { Write-Host "    動いていませんでした" }

  Step 3 "最新版をダウンロードします"
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
  if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Path $Root | Out-Null }
  try { Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing }
  catch { Fail ("ダウンロードに失敗しました: " + $_.Exception.Message) }
  Write-Host "    完了"

  Step 4 "展開します"
  try { Expand-Archive -Path $ZipPath -DestinationPath $Root -Force }
  catch { Fail ("展開に失敗しました: " + $_.Exception.Message) }
  Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $AppDir)) { Fail ("日報ツールのフォルダが見つかりません: " + $AppDir) }
  Write-Host "    完了"

  Step 5 "必要な部品を入れます（初回は1〜2分かかります）"
  Set-Location $AppDir
  & npm.cmd install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Fail "部品の取得に失敗しました。社内ネットワークだと通信がブロックされることがあります。"
  }
  Write-Host "    完了"

  Step 6 "起動します"
  Write-Host ("    ブラウザで http://localhost:" + $Port + " を開きます")
  Write-Host "    終了するには、この画面で Ctrl + C を押します"
  Write-Host ""
  try {
    Start-Job -ScriptBlock { Start-Sleep -Seconds 4; Start-Process 'http://localhost:3200' } -ErrorAction SilentlyContinue | Out-Null
  } catch { }
  $ErrorActionPreference = $prevEap
  & npm.cmd start
}
catch {
  Write-Host ""
  Write-Host "!! うまくいきませんでした" -ForegroundColor Red
  Write-Host ("   " + $_.Exception.Message) -ForegroundColor Red
  Write-Host ""
  Write-Host "   この赤い文字をそのままチャットに貼り付けてください。" -ForegroundColor Yellow
}
finally {
  $ErrorActionPreference = $prevEap
}
