#!/bin/bash
# ログに残すべき4種類を、ローカルで意図的に起こして確認する。
#   ① ログイン成否   ② 403（権限拒否）   ③ 外部通知の失敗   ④ 500
# 外部サービスは不要（モックIdPを使う）。
set -u
cd "$(dirname "$0")/.."
R="${REPRO_OUT:-/tmp/helpdesk-repro}"; rm -rf "$R"; mkdir -p "$R"
LOG="$R/app.log"; DB="$R/repro.db"

free_port() { for p in $(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
              for i in $(seq 1 50); do lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1 || return 0; sleep 0.1; done; }
wait_up()   { for i in $(seq 1 80); do curl -s -o /dev/null "$1" && return 0; sleep 0.1; done; return 1; }
as_user()   { curl -s -o /dev/null "http://localhost:4000/__set-user?email=$1&sub=$2"; }

ok=0; ng=0
shows() { # $1=説明 $2=grepパターン
  if grep -q -- "$2" "$LOG"; then printf '  OK   %s\n' "$1"; ok=$((ok+1))
  else                            printf '  NG   %s （ログに %s が無い）\n' "$1" "$2"; ng=$((ng+1)); fi
}
hides() { # $1=説明 $2=grepパターン
  n=$(grep -c -- "$2" "$LOG")
  if [ "$n" -eq 0 ]; then printf '  OK   ログに出ていない: %s\n' "$1"; ok=$((ok+1))
  else                    printf '  NG   ログに出ている: %s （%s件）\n' "$1" "$n"; ng=$((ng+1)); fi
}
trap 'free_port 3000; free_port 4000' EXIT

echo "=== 準備: モックIdP と アプリを起動 ==="
free_port 3000; free_port 4000; rm -f "$DB"
node test/mock-idp.js > "$R/idp.log" 2>&1 &
wait_up http://localhost:4000/jwks
# 通知先は誰も待ち受けていないポート。これで必ず通知失敗になる。
env OIDC_ISSUER=http://localhost:4000 OIDC_CLIENT_ID=c OIDC_CLIENT_SECRET=s \
    OIDC_ALLOW_INSECURE=1 OIDC_ALLOWED_HD=example.co.jp \
    BASE_URL=http://localhost:3000 SESSION_SECRET=k DB_PATH="$DB" PORT=3000 \
    ROLE_ADMINS=admin@example.co.jp \
    NOTIFICATION_WEBHOOK_URL=http://localhost:4999/hook \
    node src/server.js > "$LOG" 2>&1 &
wait_up http://localhost:3000/auth/login
echo "  起動完了"

echo
echo "=== ① ログイン成否 ==="
echo "--- 成功させる（社内ドメインのアカウント）---"
as_user general@example.co.jp u-general
curl -s -c "$R/jar_g" -b "$R/jar_g" -L -o /dev/null 'http://localhost:3000/auth/login?start=1'
echo "--- 失敗させる（許可していないドメインのアカウント）---"
as_user outsider@gmail.com u-outsider
curl -s -o /dev/null "http://localhost:4000/__set-user?hd=gmail.com"
curl -s -c "$R/jar_x" -b "$R/jar_x" -L -o /dev/null 'http://localhost:3000/auth/login?start=1'
curl -s -o /dev/null "http://localhost:4000/__set-user?hd=example.co.jp"

echo
echo "=== ③ 外部通知の失敗 ==="
echo "--- 通知先(4999)は誰も待ち受けていない状態で1件作成する ---"
curl -s -b "$R/jar_g" -o "$R/created.json" -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' -d '{"title":"通知失敗の再現","body":"氏名や連絡先を含む本文"}'
TID=$(node -e "try{console.log(require('$R/created.json').id)}catch(e){console.log('')}")
echo "  作成したID: $TID （作成自体は成功するのが正しい）"
sleep 1.5

echo
echo "=== ② 403（権限拒否）==="
echo "--- general が削除を試みる（admin 以外は拒否）---"
echo -n "  DELETE /api/tickets/$TID : HTTP "
curl -s -b "$R/jar_g" -o /dev/null -w '%{http_code}\n' -X DELETE "http://localhost:3000/api/tickets/$TID"

echo
echo "=== ④ 500 ==="
echo "--- DBファイルを消してから書き込ませる（書き込み不能にする）---"
rm -f "$DB"
echo -n "  POST /api/tickets : HTTP "
curl -s -b "$R/jar_g" -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' -d '{"title":"500の再現"}'

echo
echo "=== ログに残っているか ==="
shows "① ログイン成功が残る"        '\[ログイン成功\]'
shows "① ログイン失敗が残る"        '\[ログイン拒否\]'
shows "② 403 が残る"                '\[権限拒否\]'
shows "③ 外部通知の失敗が残る"      '\[通知失敗\]'
shows "④ 500 が残る"                '\[サーバーエラー\]'

echo
echo "=== 出てはいけないもの ==="
hides "アクセストークン"     'mock_access_token'
hides "JWT の断片"           'eyJ'
hides "メールアドレス"       '@example.co.jp'
hides "メールアドレス(外部)" '@gmail.com'
hides "チケットの本文"       '氏名や連絡先を含む本文'
hides "チケットのタイトル"   '通知失敗の再現'
hides "Cookie"               'helpdesk_session'

echo
echo "=== ログ全文 ==="
grep -vE 'ExperimentalWarning|trace-warnings|^$' "$LOG" | sed 's/^/  /'

echo
echo "================ 結果: OK ${ok}件 / NG ${ng}件 ================"
[ "$ng" -eq 0 ]
