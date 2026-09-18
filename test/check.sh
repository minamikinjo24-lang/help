#!/bin/bash
# 4項目の確認を通しで行う。npm run check から起動する。
# モックIdPとモックWebhookをローカルに立てるため、外部サービスは不要。
set -u
cd "$(dirname "$0")/.."
R="${CHECK_OUT:-/tmp/helpdesk-check}"; rm -rf "$R"; mkdir -p "$R"

BODY_TEXT='社員番号12345 山田太郎の端末から印刷できません'
free_port() { for p in $(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
              for i in $(seq 1 50); do lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1 || return 0; sleep 0.1; done; }
wait_up()   { for i in $(seq 1 80); do curl -s -o /dev/null "$1" && return 0; sleep 0.1; done; echo "  !! 起動失敗 $1"; return 1; }

start_app() { # $1=log $2=db $3=webhook
  free_port 3000; rm -f "$2"
  env OIDC_ISSUER=http://localhost:4000 OIDC_CLIENT_ID=test-client \
      OIDC_CLIENT_SECRET=test-secret-not-in-code OIDC_ALLOWED_HD=example.co.jp \
      OIDC_ALLOW_INSECURE=1 BASE_URL=http://localhost:3000 \
      SESSION_SECRET=test-session-secret-not-in-code \
      DB_PATH="$2" NOTIFICATION_WEBHOOK_URL="$3" PORT=3000 \
      node src/server.js > "$1" 2>&1 &
  APP_PID=$!; wait_up http://localhost:3000/auth/login
}
start_idp()  { free_port 4000; IDP_DENY="$1" node "test/mock-idp.js" > "$R/idp-$1.log" 2>&1 &
               wait_up http://localhost:4000/jwks; }
start_hook() { free_port 4100; HOOK_STATUS="$1" HOOK_OUT="$R/received.jsonl" node "test/mock-webhook.js" > "$R/hook.log" 2>&1 &
               wait_up http://localhost:4100/hook; }
login()  { curl -s -c "$1" -b "$1" -L -o /dev/null -w '%{url_effective}' "http://localhost:3000/auth/login?start=1"; }
create() { curl -s -b "$1" -c "$1" -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/tickets \
             -H 'Content-Type: application/json' \
             --data "$(printf '{"title":"印刷できない","body":"%s"}' "$BODY_TEXT")"; }
count()  { curl -s -b "$1" http://localhost:3000/api/tickets | grep -o '"id"' | wc -l; }
trap 'free_port 3000; free_port 4000; free_port 4100' EXIT

start_idp 0 >/dev/null; start_hook 200 >/dev/null
echo "準備完了: モックIdP(4000) / モックWebhook(4100)"

echo; echo "##### 確認2: 未ログインで POST /api/tickets #####"
start_app "$R/app-auth.log" /tmp/vt1.db "http://localhost:4100/hook" >/dev/null
echo -n "  POST /api/tickets  : HTTP "; curl -s -o "$R/anon.json" -w '%{http_code}' -X POST http://localhost:3000/api/tickets -H 'Content-Type: application/json' -d '{"title":"未ログイン"}'; echo "   本文 $(cat "$R/anon.json")"
echo -n "  GET  /api/tickets  : HTTP "; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/tickets
echo -n "  GET  /api/tickets/1: HTTP "; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/tickets/1
echo -n "  GET  /  (画面)     : HTTP "; curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3000/
echo -n "  保存された件数     : "; node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/tmp/vt1.db');console.log(d.prepare('SELECT COUNT(*) c FROM tickets').get().c)" 2>/dev/null

echo; echo "##### 確認1a: Webhook 正常（基準） #####"
rm -f "$R/received.jsonl"; start_app "$R/app-hook-ok.log" /tmp/vt2.db "http://localhost:4100/hook" >/dev/null
login "$R/j2" >/dev/null
echo -n "  作成 : HTTP "; create "$R/j2"; echo "   一覧の件数 $(count "$R/j2")"
sleep 1; echo "  Webhook受信 : $(cat "$R/received.jsonl" 2>/dev/null)"
echo "  ログ : $(grep -hoE '\[通知[^]]*\][^ ]* *ticket_id=[0-9]+.*' "$R/app-hook-ok.log")"

echo; echo "##### 確認1b: Webhook が落ちている #####"
start_app "$R/app-hook-down.log" /tmp/vt3.db "http://localhost:4999/hook" >/dev/null
login "$R/j3" >/dev/null
echo -n "  作成 : HTTP "; create "$R/j3"; echo "   一覧の件数 $(count "$R/j3")"
sleep 2; echo "  ログ : $(grep -hoE '\[通知[^]]*\].*' "$R/app-hook-down.log")"

echo; echo "##### 確認1c: 通知先URLが空 #####"
start_app "$R/app-hook-empty.log" /tmp/vt4.db "" >/dev/null
login "$R/j4" >/dev/null
echo -n "  作成 : HTTP "; create "$R/j4"; echo "   一覧の件数 $(count "$R/j4")"
sleep 1; echo "  ログ : $(grep -hoE '\[通知[^]]*\].*' "$R/app-hook-empty.log")"

echo; echo "##### 確認1d: Webhook が 500 を返す #####"
start_hook 500 >/dev/null
start_app "$R/app-hook-500.log" /tmp/vt5.db "http://localhost:4100/hook" >/dev/null
login "$R/j5" >/dev/null
echo -n "  作成 : HTTP "; create "$R/j5"; echo "   一覧の件数 $(count "$R/j5")"
sleep 1; echo "  ログ : $(grep -hoE '\[通知[^]]*\].*' "$R/app-hook-500.log")"

echo; echo "##### 確認3: OAuth を拒否 #####"
start_idp 1 >/dev/null
start_app "$R/app-deny.log" /tmp/vt6.db "" >/dev/null
echo "  拒否後の最終URL : $(login "$R/j6")"
echo "  画面の表示      : $(curl -s -b "$R/j6" 'http://localhost:3000/auth/login?error=denied' | grep -oE 'ログインがキャンセル[^<]*')"
echo "  ログ            : $(grep -hoE '\[ログイン[^]]*\].*' "$R/app-deny.log")"
echo -n "  アプリは応答するか : HTTP "; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/auth/login
echo -n "  プロセス生存       : "; kill -0 "$APP_PID" 2>/dev/null && echo "はい" || echo "いいえ（落ちた）"
echo -n "  セッションは作られていないか : /api/tickets HTTP "; curl -s -b "$R/j6" -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/tickets

echo; echo "##### 確認4: ログの中身 #####"
cat "$R"/app-*.log > "$R/all.log"
for pat in 'mock_access_token' '社員番号12345' '山田太郎' 'test-secret-not-in-code' 'test-session-secret' 'id_token' 'eyJ' 'localhost:4100' 'localhost:4999' 'printer'; do
  printf '  %-26s : %s件\n' "$pat" "$(grep -c -- "$pat" "$R/all.log")"
done
echo "  --- アプリログ全文 ---"
grep -vE 'ExperimentalWarning|trace-warnings|^$' "$R/all.log" | sed 's/^/    /'
