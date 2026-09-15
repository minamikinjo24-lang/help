# 社内ヘルプデスク（問い合わせ管理）

一覧・新規作成に、OAuth(OIDC) ログインと作成時の Webhook 通知を加えた版です。
編集・削除は実装していません。

## 起動

```bash
npm install
cp .env.example .env    # 値は各自で設定（.env はコミットしない）
npm start               # http://localhost:3000
```

`.env` の値が足りない場合、起動時に**キー名だけ**を挙げて停止します。

## 環境変数

| キー | 用途 |
|---|---|
| `OIDC_ISSUER` | 例: `https://accounts.google.com` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | OAuth クライアント |
| `OIDC_ALLOWED_HD` | ログインを許可する社内ドメイン。未設定なら制限しない |
| `BASE_URL` | コールバックURLの組み立て用。例: `http://localhost:3000` |
| `SESSION_SECRET` | セッションCookieの署名鍵 |
| `NOTIFICATION_WEBHOOK_URL` | 作成時の通知先。**未設定でも起動・作成は成功する** |
| `OIDC_ALLOW_INSECURE` | 検証用モックIdP(http)を使うときだけ `1`。本番では設定しない |

値はリポジトリに含めません。`.env` は `.gitignore` 済みです。

## 画面と API

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| `GET` | `/` | 必要 | 一覧（画面） |
| `GET` | `/tickets/new` | 必要 | 新規作成フォーム（画面） |
| `GET` | `/api/tickets` | 必要 | 全件をJSONで返す |
| `POST` | `/api/tickets` | 必要 | 作成。`201` + `Location` |
| `GET` | `/api/tickets/:id` | 必要 | 1件取得。無ければ `404` |
| `GET` | `/auth/login` | — | ログイン画面。`?start=1` でOAuth開始 |
| `GET` | `/auth/callback` | — | 認可コードの受け取り |
| `POST` | `/auth/logout` | 必要 | ログアウト |

未認証時は `/api/*` が `401` + JSON、画面は `302` でログイン画面へ。

## Google でログインする設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選ぶ（なければ作る）
2. 「APIとサービス」→「OAuth 同意画面」を設定
   - 社内利用なら User Type は **内部（Internal）**。Workspace 組織内のみに限定され、審査も不要
   - 外部（External）にした場合は、テストユーザーに自分を追加しないとログインできない
3. 「認証情報」→「認証情報を作成」→ **OAuth クライアント ID**
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みのリダイレクト URI に次を**完全一致**で追加する
     - ローカル: `http://localhost:3000/auth/callback`
     - 本番: `https://<公開ホスト名>/auth/callback`
4. 発行された **クライアント ID** と **クライアント シークレット** を `.env` に設定

```
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=xxxxx.apps.googleusercontent.com
OIDC_CLIENT_SECRET=xxxxx
OIDC_ALLOWED_HD=自社のWorkspaceドメイン   # 個人のGmailで試すときは空にする
BASE_URL=http://localhost:3000
SESSION_SECRET=（ランダムな文字列）
```

`SESSION_SECRET` は次で作れます。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

起動して `http://localhost:3000/` を開くとログイン画面に転送されます。

### つまずきやすい点

- **リダイレクト URI は完全一致**。末尾のスラッシュやスキームが違うと `redirect_uri_mismatch` になる
- `OIDC_ALLOWED_HD` を設定すると、その Workspace ドメイン以外は 403 になる。
  個人の `@gmail.com` には `hd` クレームが無いため、空にしておかないとログインできない
- 本番で `BASE_URL` を `https://` にすると secure Cookie になる。
  TLS を終端するロードバランサの背後では `X-Forwarded-Proto` を信頼する必要があり、
  アプリは `BASE_URL` が https のとき自動で `trust proxy` を有効にする

## ログイン

認可コードフロー + PKCE。`state` と `nonce` を照合し、IDトークンの署名を検証します。
アクセストークンとリフレッシュトークンは**保持しません**（本人確認にしか使わないため）。
セッションは署名付きCookieのみで、DBには保存しません。

## 作成時の通知

作成に成功すると `NOTIFICATION_WEBHOOK_URL` へ `{"id":..,"title":".."}` を POST します。

- 通知の結果を待たず、**通知が失敗しても問い合わせは保存されます**
- URL未設定・接続不可・非2xx はいずれもログに `[通知失敗]` として残ります
- ログに出すのは `ticket_id` と理由コードだけです。**本文・タイトル・通知先URL・トークンは出しません**

## データ

`tickets` テーブル1つ。項目は `id` / `title` / `body` / `status` / `priority` /
`created_at` / `updated_at`。作成者は保持していません。

## 確認

```bash
npm run check
```

モックIdPとモックWebhookをローカルに立てて、次を通しで確認します（外部サービス不要）。

1. Webhook が落ちていても作成できる（空URL・接続不可・500 の3通り）
2. 未ログインの `POST /api/tickets` が 401
3. OAuth を拒否してもアプリが落ちず、ログイン画面へ戻る
4. ログにトークン・本文・タイトル・通知先URLが出ていない

## 未実装

編集、削除、検索、添付ファイル、権限、装飾。
