# 初期デプロイ手順

Render を主な対象とし、Fly.io の手順も併記しています。`Dockerfile` は汎用なので
Cloud Run / ECS などでも同じ考え方で動きます。

## 前提と制約

**SQLite をローカルファイルに保存しているため、保存領域の扱いで挙動が変わります。**

| デプロイ先 | データの保存 |
|---|---|
| Render 無料プラン | **保持されない。** 再起動・再デプロイ・スリープ復帰のたびに消える |
| Render 有料プラン（ディスク付き） | 保持される |
| Fly.io（ボリューム付き） | 保持される |

Render の無料プランには永続ディスクが無く、15分アクセスが無いとサービスが
停止します。復帰時にファイルシステムは初期状態に戻るため、**登録した問い合わせは
消えます**。動作確認やデモには使えますが、実運用には向きません。

実運用に進む場合は、有料プランでディスクを付けるか、PostgreSQL へ移行してください。

**同時に 1 インスタンスしか動かせません。** 1 つの SQLite ファイルを複数の
インスタンスで共有できないためです。オートスケールは無効にしてください。

## 1. 環境変数

コードが参照しているものは以下の 11 個です。**値はリポジトリに含めず**、
デプロイ先の環境変数（Fly なら `fly secrets set`）で渡します。

### 必須（未設定なら起動時にキー名を挙げて停止する）

| キー | 内容 | 秘密 |
|---|---|:--:|
| `OIDC_ISSUER` | `https://accounts.google.com` | |
| `OIDC_CLIENT_ID` | Google の OAuth クライアント ID | |
| `OIDC_CLIENT_SECRET` | Google の OAuth クライアント シークレット | ● |
| `BASE_URL` | 公開URL。例 `https://helpdesk.example.com` | |
| `SESSION_SECRET` | セッションCookieの署名鍵 | ● |

### 任意

| キー | 未設定時の既定 | 内容 |
|---|---|---|
| `OIDC_ALLOWED_HD` | 制限なし | ログインを許可する社内ドメイン |
| `NOTIFICATION_WEBHOOK_URL` | 通知しない | 作成時の通知先。未設定でも作成は成功する |
| `PORT` | `3000` | 待ち受けポート。PaaS が自動設定することが多い |
| `DB_PATH` | `./data/help.db` | SQLite の置き場。**本番では永続ボリューム上を指す** |
| `TRUST_PROXY_HOPS` | `1` | 信頼するプロキシのホップ数。多段の場合のみ変更 |
| `OIDC_ALLOW_INSECURE` | 無効 | 検証用。**本番では設定しない** |

秘密扱いは `OIDC_CLIENT_SECRET` と `SESSION_SECRET` の 2 つだけです。

`SESSION_SECRET` の生成:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 2. ビルド方法

**ビルド工程はありません。** バンドラもトランスパイラも使っていないため、
やることは依存のインストールと起動だけです。

```dockerfile
npm ci --omit=dev     # 本番依存のみ
node src/server.js    # 起動
```

`Dockerfile` がこれを行います。Node 22 系のイメージを使います
（`node:sqlite` が必要なため 22.5 以上が必須）。

`test/` と `.env` は `.dockerignore` でイメージから除外されます。

## 3. デプロイ手順（Render の場合）

`render.yaml` を同梱しています。秘密値は含めておらず、`sync: false` のキーは
Render の画面から入力します。`SESSION_SECRET` は Render が自動生成します。

1. [render.com](https://render.com/) にサインアップ（無料プランはカード登録不要）
2. **New → Blueprint** を選び、この GitHub リポジトリを指定する
3. `render.yaml` が読み込まれ、入力を求められるので次を入れる

   | キー | 入れるもの |
   |---|---|
   | `OIDC_CLIENT_ID` | Google のクライアント ID |
   | `OIDC_CLIENT_SECRET` | Google のクライアント シークレット |
   | `OIDC_ALLOWED_HD` | 社内ドメイン限定にする場合のみ。個人アカウントなら空 |
   | `NOTIFICATION_WEBHOOK_URL` | 通知を使わないなら空 |

4. デプロイが完了すると `https://<名前>.onrender.com` が発行される
5. **Google Cloud Console の「クライアント」→ 承認済みのリダイレクト URI に
   `https://<名前>.onrender.com/auth/callback` を完全一致で追加する**
6. ブラウザで `https://<名前>.onrender.com` を開く

`BASE_URL` は設定不要です。Render が入れる `RENDER_EXTERNAL_URL` を使うため、
公開URLが決まる前に値を用意する必要がありません。

無料プランでは、しばらく使っていないとスリープします。復帰に30秒ほどかかり、
**その際に登録済みの問い合わせは消えます**（上の「前提と制約」を参照）。

## 4. デプロイ手順（Fly.io の場合）

```bash
# 1. アプリを作る（fly.toml の app 名を実際の名前に変更しておく）
fly apps create <アプリ名>

# 2. 永続ボリュームを作る。これを忘れるとデータが消える
fly volumes create helpdesk_data --size 1 --region nrt

# 3. 秘密情報を渡す。fly.toml には書かない
fly secrets set OIDC_CLIENT_SECRET='...' SESSION_SECRET='...'

# 4. 秘密でない設定は fly.toml の [env] に書く
#    BASE_URL は https://<アプリ名>.fly.dev に合わせて修正すること

# 5. デプロイ
fly deploy
```

**デプロイ前に Google 側の設定が必要です。** 公開URLが決まったら、
Google Cloud Console の「クライアント」→ 承認済みのリダイレクト URI に
`https://<公開ホスト名>/auth/callback` を**完全一致**で追加してください。
これが無いと `redirect_uri_mismatch` でログインできません。

## 5. 公開後の確認手順

`https://<公開ホスト名>` を `$HOST` とします。

### ① トップページが開く

ブラウザで `$HOST` を開きます。**ログイン画面が表示されれば成功です。**

コマンドで確かめる場合:

```bash
curl -I $HOST/
# HTTP/2 302
# location: /auth/login      ← 未ログインなのでログイン画面へ転送される

curl -s -o /dev/null -w '%{http_code}\n' $HOST/auth/login
# 200                        ← ログイン画面そのものは認証なしで開く
```

`302 → /auth/login` と `200` の 2 つが出れば、アプリは正常に起動しています。

### ② 認証が効いている

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $HOST/api/tickets \
  -H 'Content-Type: application/json' -d '{"title":"test"}'
# 401                        ← 未ログインでは作成できない
```

### ③ ログインできる

ブラウザで `$HOST` →「ログインする」→ Google アカウントを選択 → 一覧が表示される。

`redirect_uri_mismatch` が出る場合は、Google 側のリダイレクト URI と
`BASE_URL` の組み合わせが一致していません。

### ④ 登録できる

「新規作成」からタイトル「印刷できない」で登録し、一覧に出ることを確認します。

### ⑤ データが消えない

```bash
fly deploy        # もう一度デプロイする（Render 無料プランでは消えるのが正常）
```

再デプロイ後も④で登録した問い合わせが残っていれば、永続ボリュームが
正しくマウントされています。**消えていたらボリュームの設定を見直してください。**

### ⑥ ログに秘密が出ていない

```bash
fly logs
```

`ticket_id=` と理由コードだけが出ていること、トークン・本文・タイトル・
通知先URLが出ていないことを確認します。

## 6. 秘密情報の扱い

- リポジトリに秘密値は含めません。`.env` は `.gitignore` 済みで、履歴にもありません
- `fly.toml` の `[env]` には秘密でない値だけを書きます。秘密は `fly secrets set` で渡します
- `SESSION_SECRET` を変更すると、全員のログインセッションが無効になります（再ログインが必要）
- アクセストークンとリフレッシュトークンはアプリ側で保持していません
