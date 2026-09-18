#!/bin/bash
# 異常系とログの確認。ヘルプデスクと同じ観点をボットにも当てる。
set -u
cd "$(dirname "$0")/.."
R="${API_OUT:-/tmp/faqbot-check}"; rm -rf "$R"; mkdir -p "$R"
LOG="$R/app.log"

free_port() { for p in $(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
              for i in $(seq 1 50); do lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1 || return 0; sleep 0.1; done; }
ok=0; ng=0
expect() {
  if [ "$1" = "$2" ]; then printf '  OK   %-50s 期待 %-6s 実際 %s\n' "$3" "$1" "$2"; ok=$((ok+1))
  else                     printf '  NG   %-50s 期待 %-6s 実際 %s\n' "$3" "$1" "$2"; ng=$((ng+1)); fi
}
ask() { curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3100/api/ask \
          -H 'Content-Type: application/json' --data "$1"; }
trap 'free_port 3100' EXIT

free_port 3100
PORT=3100 node src/server.js > "$LOG" 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 0.1; done

echo "##### 異常系 #####"
expect 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3100/api/ask)" "本文なし"
expect 400 "$(ask '{壊れ')"                  "壊れたJSON"
expect 400 "$(ask '{}')"                     "question が無い"
expect 400 "$(ask '{"question":null}')"      "question が null"
expect 400 "$(ask '{"question":123}')"       "question が数値（文字列でない）"
expect 400 "$(ask '{"question":["a"]}')"     "question が配列（文字列でない）"
expect 400 "$(ask '{"question":"   "}')"     "空白だけ"
python3 -c "print('{\"question\":\"' + 'あ'*70000 + '\"}')" > "$R/big.json" 2>/dev/null
expect 413 "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3100/api/ask -H 'Content-Type: application/json' --data-binary @"$R/big.json")" "巨大な質問"
expect 404 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/nonexistent)" "存在しないパス"

echo
echo "##### 異常系のあともアプリは生きている #####"
expect 200 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/)" "トップ画面が開ける"
expect 200 "$(ask '{"question":"保証期間は？"}')" "通常の質問に答えられる"

echo
echo "##### ログ #####"
# 質問できたことは記録する。何に一致したかが分かれば FAQ の改善に使える。
expect 1 "$(grep -c '\[応答\] matched=warranty' "$LOG")" "答えられたときに記録が残る"
ask '{"question":"今日の天気は？"}' > /dev/null
expect 1 "$(grep -c '\[応答\] matched=none' "$LOG")" "答えられなかったときも記録が残る"
# 上で不正なリクエストを8回送っている。記録もちょうど8件あるはず。
expect 8 "$(grep -c '\[リクエスト不正\]' "$LOG")" "不正なリクエストの数だけ記録が残る"

echo
echo "##### ログに出てはいけないもの #####"
expect 0 "$(grep -c 'node_modules' "$LOG")"   "内部のファイル構成（スタックトレース）"
expect 0 "$(grep -c '保証期間は' "$LOG")"      "利用者が入力した質問文"
expect 0 "$(grep -c '今日の天気' "$LOG")"      "答えられなかった質問文"

echo
echo "  --- ログ全文 ---"
grep -vE '^$' "$LOG" | sed 's/^/    /'
echo
echo "================ 結果: OK ${ok}件 / NG ${ng}件 ================"
[ "$ng" -eq 0 ]
