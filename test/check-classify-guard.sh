#!/bin/bash
# 分類機能の安全性を確認する。以下の5点。
#   1. 保存ツールが定義に含まれない
#   2. 権限のないロールは 403
#   3. 判定が失敗してもアプリ全体が死なない
#   4. 採用するまでチケットの優先度が変わらない
#   5. 他人のチケットを general が分類できない
set -u
cd "$(dirname "$0")/.."
R="${GUARD_OUT:-/tmp/helpdesk-guard}"; rm -rf "$R"; mkdir -p "$R"
LOG="$R/app.log"; DB="$R/guard.db"

free_port() { for p in $(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
              for i in $(seq 1 50); do lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1 || return 0; sleep 0.1; done; }
wait_up()   { for i in $(seq 1 80); do curl -s -o /dev/null "$1" && return 0; sleep 0.1; done; return 1; }
as_user()   { curl -s -o /dev/null "http://localhost:4000/__set-user?email=$1&sub=$2"; }
login()     { curl -s -c "$1" -b "$1" -L -o /dev/null "http://localhost:3000/auth/login?start=1"; }
code()      { curl -s -b "${1:-/dev/null}" -o /dev/null -w '%{http_code}' -X "$2" "http://localhost:3000$3"; }
priority_of() { curl -s -b "$1" "http://localhost:3000/api/tickets/$2" | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).priority)}catch(e){console.log('(取得不可)')}});"; }

ok=0; ng=0
expect() {
  if [ "$1" = "$2" ]; then printf '  OK   %-56s 期待 %-8s 実際 %s\n' "$3" "$1" "$2"; ok=$((ok+1))
  else                     printf '  NG   %-56s 期待 %-8s 実際 %s\n' "$3" "$1" "$2"; ng=$((ng+1)); fi
}
trap 'free_port 3000; free_port 4000' EXIT

echo "##### 1. 保存ツールが定義に含まれない #####"
# 分類モジュールが公開しているものに、保存・送信にあたるものが無いこと
exported=$(node -e "
  const m = require('./src/suggest/rules.js');
  console.log(Object.keys(m).join(','));
")
echo "  公開しているもの: $exported"
expect 0 "$(node -e "
  const m = require('./src/suggest/rules.js');
  const bad = Object.keys(m).filter(k => /save|create|update|delete|insert|patch|post|put|write|send|exec|run/i.test(k));
  console.log(bad.length);
")" "保存・送信にあたる名前を公開していない"
expect 0 "$(node -e "
  const m = require('./src/suggest/rules.js');
  console.log(typeof m.classify === 'function' ? 0 : 1);
")" "classify は関数として存在する"

# ファイルの中身に、保存や外部通信の手段が無いこと
for pat in 'require(' 'fetch(' 'XMLHttpRequest' 'db\.' 'sqlite' 'localStorage' 'navigator.sendBeacon'; do
  expect 0 "$(grep -c -- "$pat" src/suggest/rules.js)" "rules.js に $pat が無い"
done

# classify を呼んでもDBが変化しないこと（純粋な関数であること）
expect 0 "$(node -e "
  const fs = require('fs');
  const before = fs.existsSync('./data') ? fs.readdirSync('./data').length : -1;
  const { classify } = require('./src/suggest/rules.js');
  classify('印刷できない', '全社で止まっています');
  const after = fs.existsSync('./data') ? fs.readdirSync('./data').length : -1;
  console.log(before === after ? 0 : 1);
")" "classify を呼んでもファイルが増えない"

echo
echo "=== 準備: モックIdP とアプリを起動 ==="
free_port 3000; free_port 4000; rm -f "$DB"
node test/mock-idp.js > "$R/idp.log" 2>&1 &
wait_up http://localhost:4000/jwks
as_user general@example.co.jp u-general
env OIDC_ISSUER=http://localhost:4000 OIDC_CLIENT_ID=c OIDC_CLIENT_SECRET=s \
    OIDC_ALLOW_INSECURE=1 OIDC_ALLOWED_HD=example.co.jp \
    BASE_URL=http://localhost:3000 SESSION_SECRET=k DB_PATH="$DB" PORT=3000 \
    ROLE_ADMINS=admin@example.co.jp ROLE_AGENTS=agent@example.co.jp \
    node src/server.js > "$LOG" 2>&1 &
APP_PID=$!
wait_up http://localhost:3000/auth/login

login "$R/jar_g"
TID=$(curl -s -b "$R/jar_g" -X POST http://localhost:3000/api/tickets \
        -H 'Content-Type: application/json' \
        -d '{"title":"印刷できない","body":"全社で止まっています。至急お願いします。","priority":"中"}' \
      | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id));")
as_user other@example.co.jp u-other;  login "$R/jar_o"
OTHER=$(curl -s -b "$R/jar_o" -X POST http://localhost:3000/api/tickets \
        -H 'Content-Type: application/json' -d '{"title":"他人のプリンタ障害","body":"全社で停止"}' \
      | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id));")
as_user agent@example.co.jp u-agent;  login "$R/jar_a"
as_user admin@example.co.jp u-admin;  login "$R/jar_ad"
echo "  general のチケット=$TID / 他人のチケット=$OTHER"

echo
echo "##### 2. 権限のないロールは 403 #####"
expect 403 "$(code "$R/jar_g" PATCH "/api/tickets/$TID")"    "general は自分のチケットも分類を保存できない"
expect 0   "$(curl -s -b "$R/jar_g" "http://localhost:3000/tickets/$TID" | grep -c 'id=\"run\"')" "general の詳細に分類ボタンが無い"
expect 200 "$(code "$R/jar_a" PATCH "/api/tickets/$TID")"    "agent は保存できる"
expect 401 "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "http://localhost:3000/api/tickets/$TID")" "未ログインは 401"

echo
echo "##### 3. 判定が失敗してもアプリ全体が死なない #####"
# 画面側: 判定の呼び出しが例外処理で囲まれていること（囲まれていないと押しても無反応になる）
# 判定の呼び出しそのものが try で囲まれているかを見る（try の総数ではなく）
expect 1 "$(grep -B2 'Classify.classify' src/screens/views/detail.ejs | grep -c 'try {')" "detail.ejs で判定の呼び出しを例外処理している"
expect 1 "$(grep -B2 'Classify.classify' src/screens/views/new.ejs | grep -c 'try {')" "new.ejs で判定の呼び出しを例外処理している"
expect 1 "$(grep -c 'classifyFailed\|分類案を出せませんでした' src/screens/views/detail.ejs)" "detail.ejs に判定失敗時の表示がある"
expect 1 "$(grep -c 'classifyFailed\|分類案を出せませんでした' src/screens/views/new.ejs)" "new.ejs に判定失敗時の表示がある"
# サーバー側: 500 が起きてもプロセスが生き続けること
rm -f "$DB"
expect 500 "$(curl -s -b "$R/jar_a" -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/tickets \
               -H 'Content-Type: application/json' -d '{"title":"500の再現"}')" "書き込み不能なら 500 を返す"
expect 200 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/auth/login)" "500 の後もアプリは応答する"
kill -0 "$APP_PID" 2>/dev/null && expect alive alive "500 の後もプロセスは生きている" \
                               || expect alive dead  "500 の後もプロセスは生きている"

echo
echo "##### 4. 採用するまで優先度が変わらない #####"
# DBを作り直して検証用のチケットを入れ直す
free_port 3000; rm -f "$DB"
env OIDC_ISSUER=http://localhost:4000 OIDC_CLIENT_ID=c OIDC_CLIENT_SECRET=s \
    OIDC_ALLOW_INSECURE=1 OIDC_ALLOWED_HD=example.co.jp \
    BASE_URL=http://localhost:3000 SESSION_SECRET=k DB_PATH="$DB" PORT=3000 \
    ROLE_ADMINS=admin@example.co.jp ROLE_AGENTS=agent@example.co.jp \
    node src/server.js >> "$LOG" 2>&1 &
APP_PID=$!
wait_up http://localhost:3000/auth/login
T2=$(curl -s -b "$R/jar_ad" -X POST http://localhost:3000/api/tickets \
       -H 'Content-Type: application/json' \
       -d '{"title":"印刷できない","body":"全社で止まっています。至急お願いします。","priority":"中"}' \
     | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id));")
expect "中" "$(priority_of "$R/jar_ad" "$T2")" "作成直後は中"
# 詳細画面を開く＝分類案を出せる状態にするだけ。保存は起きないこと。
curl -s -b "$R/jar_ad" -o /dev/null "http://localhost:3000/tickets/$T2"
expect "中" "$(priority_of "$R/jar_ad" "$T2")" "詳細画面を開いても中のまま"
curl -s -b "$R/jar_ad" -o /dev/null "http://localhost:3000/tickets/$T2"
expect "中" "$(priority_of "$R/jar_ad" "$T2")" "何度開いても中のまま"
# 採用（＝保存）を明示したときだけ変わる
curl -s -b "$R/jar_ad" -o /dev/null -X PATCH "http://localhost:3000/api/tickets/$T2" \
  -H 'Content-Type: application/json' -d '{"priority":"高"}'
expect "高" "$(priority_of "$R/jar_ad" "$T2")" "保存したときだけ変わる"

echo
echo "##### 5. 他人のチケットを general が分類できない #####"
O2=$(curl -s -b "$R/jar_a" -X POST http://localhost:3000/api/tickets \
       -H 'Content-Type: application/json' -d '{"title":"他人のチケット","body":"全社で停止"}' \
     | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id));")
expect 403 "$(code "$R/jar_g" GET   "/tickets/$O2")"      "他人の詳細画面を開けない"
expect 403 "$(code "$R/jar_g" GET   "/api/tickets/$O2")"  "他人のチケットをAPIで読めない"
expect 403 "$(code "$R/jar_g" PATCH "/api/tickets/$O2")"  "他人のチケットを分類保存できない"
before=$(priority_of "$R/jar_a" "$O2")
curl -s -b "$R/jar_g" -o /dev/null -X PATCH "http://localhost:3000/api/tickets/$O2" \
  -H 'Content-Type: application/json' -d '{"priority":"高","category":"PC"}'
expect "$before" "$(priority_of "$R/jar_a" "$O2")" "拒否されたあと値が変わっていない"

echo
echo "================ 結果: OK ${ok}件 / NG ${ng}件 ================"
[ "$ng" -eq 0 ]
