#!/bin/bash
# 異常系とログの確認。ヘルプデスク・ボットと同じ観点を当てる。
set -u
cd "$(dirname "$0")/.."
R="${API_OUT:-/tmp/report-check}"; rm -rf "$R"; mkdir -p "$R"
LOG="$R/app.log"; DB="$R/reports.db"

free_port() { for p in $(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
              for i in $(seq 1 50); do lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1 || return 0; sleep 0.1; done; }
ok=0; ng=0
expect() {
  if [ "$1" = "$2" ]; then printf '  OK   %-48s 期待 %-6s 実際 %s\n' "$3" "$1" "$2"; ok=$((ok+1))
  else                     printf '  NG   %-48s 期待 %-6s 実際 %s\n' "$3" "$1" "$2"; ng=$((ng+1)); fi
}
post() { curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3200/api/reports \
           -H 'Content-Type: application/json' --data "$1"; }
trap 'free_port 3200' EXIT

free_port 3200; rm -f "$DB"
DB_PATH="$DB" PORT=3200 node src/server.js > "$LOG" 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3200/ && break; sleep 0.1; done

echo "##### 正常に作れる #####"
expect 201 "$(post '{"date":"2026-09-18","items":"A社への見積もり作成\n定例会議に出席"}')" "日報を作成できる"
expect 1 "$(curl -s -X POST http://localhost:3200/api/reports -H 'Content-Type: application/json' \
             --data '{"items":"見積もり作成"}' | grep -c 'お疲れ様です')" "いつもの挨拶が入る"
expect 1 "$(curl -s -X POST http://localhost:3200/api/reports -H 'Content-Type: application/json' \
             --data '{"items":"見積もり作成"}' | grep -c 'よろしくお願いいたします')" "いつもの締めが入る"
expect 200 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3200/reports)" "過去の日報が開ける"
expect 1 "$(curl -s http://localhost:3200/reports | grep -c '定例会議に出席')" "保存した内容が一覧に出る"

echo
echo "##### 異常系 #####"
expect 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3200/api/reports)" "本文なし"
expect 400 "$(post '{壊れ')"                      "壊れたJSON"
expect 400 "$(post '{}')"                         "items が無い"
expect 400 "$(post '{"items":123}')"              "items が数値"
expect 400 "$(post '{"items":["a"]}')"            "items が配列"
expect 400 "$(post '{"items":"   "}')"            "空白だけ"
expect 400 "$(post '{"items":"\n\n"}')"           "空行だけ"
expect 201 "$(post '{"date":"めちゃくちゃ","items":"作業"}')" "日付が不正でも今日として受け付ける"
python3 -c "print('{\"items\":\"' + 'あ'*70000 + '\"}')" > "$R/big.json" 2>/dev/null
expect 413 "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3200/api/reports -H 'Content-Type: application/json' --data-binary @"$R/big.json")" "巨大な入力"
expect 404 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3200/nonexistent)" "存在しないパス"

echo
echo "##### 異常系のあともアプリは生きている #####"
expect 200 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3200/)" "作成画面が開ける"
expect 201 "$(post '{"items":"復帰後の作業"}')" "そのあとも作成できる"

echo
echo "##### ログ #####"
expect 1 "$([ "$(grep -c '\[日報作成\]' "$LOG")" -ge 1 ] && echo 1 || echo 0)" "作成が記録される"
expect 1 "$([ "$(grep -c '\[リクエスト不正\]' "$LOG")" -ge 1 ] && echo 1 || echo 0)" "不正なリクエストが記録される"

echo
echo "##### ログに出てはいけないもの #####"
expect 0 "$(grep -c 'node_modules' "$LOG")"       "内部のファイル構成"
expect 0 "$(grep -c '見積もり' "$LOG")"            "業務の中身"
expect 0 "$(grep -c '定例会議' "$LOG")"            "業務の中身（その2）"

echo
echo "  --- ログ全文 ---"
grep -vE '^$|ExperimentalWarning|trace-warnings' "$LOG" | sed 's/^/    /'
echo
echo "================ 結果: OK ${ok}件 / NG ${ng}件 ================"
[ "$ng" -eq 0 ]
