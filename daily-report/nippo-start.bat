@echo off
rem 日報作成ツール 起動用（ダブルクリックしてください）
chcp 65001 > nul
cd /d "%~dp0"
title 日報作成ツール

where node > /dev/null 2>nul
if errorlevel 1 (
  echo.
  echo [!] Node.js が入っていません。
  echo     https://nodejs.org/ja の左側 ^(LTS^) を入れてから、もう一度ダブルクリックしてください。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo 初回の準備をします。1〜2分かかります。そのままお待ちください...
  echo.
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [!] 準備に失敗しました。上に出ている英語の文をチャットに貼り付けてください。
    echo.
    pause
    exit /b 1
  )
)

echo.
echo ===============================================
echo  日報作成ツールを起動します
echo  ブラウザが自動で開きます ^(http://localhost:3200^)
echo  終了するときは、この黒い画面で Ctrl + C
echo ===============================================
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3200'"

node src\server.js

echo.
echo 日報作成ツールを終了しました。
pause
