#!/bin/bash
# 権限表（general / agent / admin）の10行をそのまま確認する。
# 表の1行 = ここの1ブロック。外部サービスは不要（モックIdPを使う）。
set -u
cd "$(dirname "$0")/.."
R="${CHECK_OUT:-/tmp/helpdesk-roles}"; rm -rf "$R"; mkdir -p "$R"
LOG="$R/app.log"; DB="$R/roles.db"

free_port() { for p in $(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
              for i in $(seq 1 50); do lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1 || return 0; sleep 0.1; done; }
wait_up()   { for i in $(seq 1 80); do curl -s -o /dev/null "$1" && return 0; sleep 0.1; done; echo "  !! 起動失敗 $1"; return 1; }

# IdP が発行する利用者を切り替える。再起動すると署名鍵が変わってしまうため、
# 専用エンドポイントで切り替える。
as_user() { curl -s -o /dev/null "http://localhost:4000/__set-user?email=$1&sub=$2"; }

login()  { curl -s -c "$1" -b "$1" -L -o /dev/null "http://localhost:3000/auth/login?start=1"; }
# $1=jar $2=title -> 作成されたIDを返す
create() { curl -s -b "$1" -o "$R/c.json" -X POST http://localhost:3000/api/tickets \
             -H 'Content-Type: application/json' --data "$(printf '{"title":"%s"}' "$2")" >/dev/null
           node -e "try{console.log(require('$R/c.json').id)}catch(e){console.log('')}"; }
code()   { curl -s -b "${1:-/dev/null}" -o /dev/null -w '%{http_code}' -X "${2}" "http://localhost:3000${3}"; }
anon()   { curl -s -o /dev/null -w '%{http_code}' -X "${1}" "http://localhost:3000${2}"; }
count()  { curl -s -b "$1" http://localhost:3000/api/tickets | grep -o '"id"' | wc -l | tr -d ' '; }

ok=0; ng=0
expect() { # $1=期待 $2=実際 $3=説明
  if [ "$1" = "$2" ]; then printf '  OK   %-58s 期待 %-4s 実際 %s\n' "$3" "$1" "$2"; ok=$((ok+1))
  else                     printf '  NG   %-58s 期待 %-4s 実際 %s\n' "$3" "$1" "$2"; ng=$((ng+1)); fi
}
trap 'free_port 3000; free_port 4000' EXIT

echo "=== 準備 ==="
free_port 3000; free_port 4000; rm -f "$DB"
node test/mock-idp.js > "$R/idp.log" 2>&1 &
wait_up http://localhost:4000/jwks
as_user general@example.co.jp u-general
env OIDC_ISSUER=http://localhost:4000 OIDC_CLIENT_ID=c OIDC_CLIENT_SECRET=s \
    OIDC_ALLOW_INSECURE=1 OIDC_ALLOWED_HD=example.co.jp \
    BASE_URL=http://localhost:3000 SESSION_SECRET=k DB_PATH="$DB" PORT=3000 \
    ROLE_ADMINS=admin@example.co.jp ROLE_AGENTS=agent@example.co.jp \
    node src/server.js > "$LOG" 2>&1 &
wait_up http://localhost:3000/auth/login

login "$R/jar_g";  T_G=$(create "$R/jar_g" "一般ユーザーの問い合わせ")
as_user other@example.co.jp   u-other;   login "$R/jar_o";  T_O=$(create "$R/jar_o" "別の一般ユーザーの問い合わせ")
as_user agent@example.co.jp   u-agent;   login "$R/jar_a"
as_user admin@example.co.jp   u-admin;   login "$R/jar_ad"
echo "  general のチケット=$T_G / 他人のチケット=$T_O"

echo
echo "### 1. GET /api/tickets （一覧）"
expect 401 "$(anon GET /api/tickets)"        "未ログイン"
expect 1   "$(count "$R/jar_g")"             "general は自分の分だけ（件数）"
expect 2   "$(count "$R/jar_a")"             "agent は全件（件数）"
expect 2   "$(count "$R/jar_ad")"            "admin は全件（件数）"

echo
echo "### 2. POST /api/tickets （作成）"
expect 401 "$(anon POST /api/tickets)"                          "未ログイン"
T_G2=$(create "$R/jar_g" "generalの2件目");  expect 1 "$([ -n "$T_G2" ] && echo 1 || echo 0)" "general は作成できる"
T_A=$(create "$R/jar_a"  "agentの1件目");    expect 1 "$([ -n "$T_A"  ] && echo 1 || echo 0)" "agent は作成できる"
T_AD=$(create "$R/jar_ad" "adminの1件目");   expect 1 "$([ -n "$T_AD" ] && echo 1 || echo 0)" "admin は作成できる"

echo
echo "### 3-5. GET /api/tickets/:id （取得）"
expect 401 "$(anon GET "/api/tickets/$T_G")"            "未ログイン"
expect 200 "$(code "$R/jar_g"  GET "/api/tickets/$T_G")"  "3: general が自分のチケット"
expect 403 "$(code "$R/jar_g"  GET "/api/tickets/$T_O")"  "4: general が他人のチケット"
expect 403 "$(code "$R/jar_g"  GET "/api/tickets/9999")"  "5: general が存在しないID（404と区別しない）"
expect 200 "$(code "$R/jar_a"  GET "/api/tickets/$T_O")"  "4: agent が他人のチケット"
expect 404 "$(code "$R/jar_a"  GET "/api/tickets/9999")"  "5: agent が存在しないID"
expect 200 "$(code "$R/jar_ad" GET "/api/tickets/$T_O")"  "4: admin が他人のチケット"
expect 404 "$(code "$R/jar_ad" GET "/api/tickets/9999")"  "5: admin が存在しないID"

echo
echo "### 6-8. DELETE /api/tickets/:id （削除）"
expect 401 "$(anon DELETE "/api/tickets/$T_G")"              "未ログイン"
expect 403 "$(code "$R/jar_g"  DELETE "/api/tickets/$T_G")"  "6: general が自分のチケット"
expect 403 "$(code "$R/jar_a"  DELETE "/api/tickets/$T_A")"  "6: agent が自分のチケット"
expect 403 "$(code "$R/jar_g"  DELETE "/api/tickets/$T_O")"  "7: general が他人のチケット"
expect 403 "$(code "$R/jar_a"  DELETE "/api/tickets/$T_O")"  "7: agent が他人のチケット"
expect 403 "$(code "$R/jar_g"  DELETE "/api/tickets/9999")"  "8: general が存在しないID"
expect 403 "$(code "$R/jar_a"  DELETE "/api/tickets/9999")"  "8: agent が存在しないID"
expect 404 "$(code "$R/jar_ad" DELETE "/api/tickets/9999")"  "8: admin が存在しないID"
expect 204 "$(code "$R/jar_ad" DELETE "/api/tickets/$T_AD")" "6: admin が自分のチケット"
expect 204 "$(code "$R/jar_ad" DELETE "/api/tickets/$T_O")"  "7: admin が他人のチケット"

echo
echo "### 9-10. 画面"
expect 302 "$(anon GET /)"                        "9: 未ログインの一覧"
expect 302 "$(anon GET /tickets/new)"             "10: 未ログインの作成フォーム"
for r in g a ad; do
  expect 200 "$(code "$R/jar_$r" GET /)"          "9: 一覧が開く（jar_$r）"
  expect 200 "$(code "$R/jar_$r" GET /tickets/new)" "10: 作成フォームが開く（jar_$r）"
done
curl -s -b "$R/jar_g"  http://localhost:3000/ > "$R/screen_g.html"
curl -s -b "$R/jar_a"  http://localhost:3000/ > "$R/screen_a.html"
curl -s -b "$R/jar_ad" http://localhost:3000/ > "$R/screen_ad.html"
expect 0 "$(grep -c '別の一般ユーザーの問い合わせ' "$R/screen_g.html")" "9: general の画面に他人のチケットが出ない"
expect 1 "$(grep -c '一般ユーザーの問い合わせ' "$R/screen_g.html" | head -1)" "9: general の画面に自分のチケットが出る"

echo
echo "### 11. 一覧画面の削除ボタン（admin のみ表示）"
expect 0 "$(grep -c 'class="delete"' "$R/screen_g.html")"  "11: general には削除ボタンが出ない"
expect 0 "$(grep -c 'class="delete"' "$R/screen_a.html")"  "11: agent には削除ボタンが出ない"
admin_rows=$(grep -c '<tr>' "$R/screen_ad.html")
admin_btns=$(grep -c 'class="delete"' "$R/screen_ad.html")
expect 1 "$([ "$admin_btns" -gt 0 ] && echo 1 || echo 0)" "11: admin には削除ボタンが出る（${admin_btns}個）"
expect 0 "$(grep -c '操作' "$R/screen_g.html")"            "11: general には操作列そのものが無い"
# ボタンを隠すだけでなく API 側でも拒否されることを再確認する
expect 403 "$(code "$R/jar_g" DELETE "/api/tickets/$T_G2")" "11: ボタンが無くても general の DELETE は 403" 

echo
echo "### ログの中身"
# 上で 403 を期待したケースは 9 件（#11 の再確認を含む）。拒否ログも同数のはず。
denials=$(grep -c '\[権限拒否\]' "$LOG")
expect 9 "$denials" "403 の回数と拒否ログの行数が一致する"
for pat in 'mock_access_token' 'eyJ' 'id_token' '@example.co.jp' '問い合わせ'; do
  expect 0 "$(grep -c -- "$pat" "$LOG")" "ログに出ていない: $pat"
done
echo "  --- 拒否ログの例 ---"
grep '\[権限拒否\]' "$LOG" | head -3 | sed 's/^/    /'

echo
echo "================ 結果: OK ${ok}件 / NG ${ng}件 ================"
[ "$ng" -eq 0 ]
