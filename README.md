# 社内ヘルプデスク（問い合わせ管理）

一覧・新規作成に、OAuth(OIDC) ログインと作成時の Webhook 通知を加えた版です。
編集・削除は実装していません。

## 更新（Windows）

```powershell
iwr -useb https://raw.githubusercontent.com/minamikinjo24-lang/help/claude/internal-helpdesk-design-k6udmr/update.ps1 | iex
```

`update.ps1` が停止・`.env` の退避と復元・取得・`npm install`・起動までを行います。

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

## ロールと権限

`general` / `agent` / `admin` の3つ。環境変数に載っていない人は `general` です。

```
ROLE_ADMINS=   # カンマ区切りのメールアドレス
ROLE_AGENTS=   # 同上。両方に載っていれば admin が優先
```

判定は画面とAPIで**同じ関数**を通します。画面で隠すだけにはしていません。

| # | 対象 | 未ログイン | general | agent | admin |
|---|---|---|---|---|---|
| 1 | `GET /api/tickets` | 401 | 200（自分の分のみ） | 200（全件） | 200（全件） |
| 2 | `POST /api/tickets` | 401 | 201 | 201 | 201 |
| 3 | `GET /api/tickets/:id` 自分の | 401 | 200 | 200 | 200 |
| 4 | `GET /api/tickets/:id` 他人の | 401 | 403 | 200 | 200 |
| 5 | `GET /api/tickets/:id` 存在しない | 401 | 403 | 404 | 404 |
| 6 | `DELETE /api/tickets/:id` 自分の | 401 | 403 | 403 | 204 |
| 7 | `DELETE /api/tickets/:id` 他人の | 401 | 403 | 403 | 204 |
| 8 | `DELETE /api/tickets/:id` 存在しない | 401 | 403 | 403 | 404 |
| 9 | `GET /` 画面 | 302 | 200（自分の分のみ） | 200（全件） | 200（全件） |
| 10 | `GET /tickets/new` 画面 | 302 | 200 | 200 | 200 |
| 11 | 一覧画面の削除ボタン | 302 | 表示されない | 表示されない | 表示される |
| 12 | `GET /tickets/:id` 詳細（自分の） | 302 | 200 | 200 | 200 |
| 12 | `GET /tickets/:id` 詳細（他人の・存在しない） | 302 | 403 | 200 / 404 | 200 / 404 |
| 13 | `PATCH /api/tickets/:id`（編集） | 401 | 403 | 200 | 200 |
| 14 | 詳細画面の「分類案を出す」ボタン | 302 | 表示されない | 表示される | 表示される |
| 15 | 詳細画面の編集フォーム | 302 | 表示されない | 表示される | 表示される |

この表は `test/check-roles.sh` にそのまま落としてあり、`npm run check` で検証されます。

**#5 と #8 で存在しないIDに 403 を返すのは意図的です。** ここで 404 を返すと、IDを順に
叩くだけで実在するIDを外から判別できてしまいます。権限が無いロールには存在の有無を
教えません。

**#1 と #9 の general は拒否ではなく絞り込みです。** 403 は返さず、自分のチケットだけの
一覧を 200 で返します。拒否ではないのでログにも残しません。

作成者が記録されていない既存データは、general には見えず agent / admin には見えます。

**#11 の削除ボタンは admin の一覧画面にだけ出ます。** 押すと確認ダイアログを挟んでから
`DELETE /api/tickets/:id` を呼びます。ボタンを隠しているだけではなく、general / agent が
直接APIを叩いても #6〜#8 のとおり 403 になります。

### 拒否時のログ

403 を返したときだけ1行出します。

```
[権限拒否] role=general sub=u-general method=DELETE path=/api/tickets/1 reason=role_not_allowed
```

理由は `role_not_allowed`（ロールに権限が無い）と `not_owner`（他人のチケット。存在しない
IDも区別せずこれ）の2種類。**トークン・本文・タイトル・メールアドレスは出しません**
（メールではなく `sub` を記録します）。

## 分類案（キーワード判定）

2か所で使えます。

**新規作成フォーム** … 入力すると**優先度案・カテゴリ案・理由**を表示します。
「採用する」を押すと入力欄に反映され、登録するまで保存はされません。

**詳細画面**（一覧のタイトルをクリック） … 「分類案を出す」を押すと案が出ます。
「上の欄に反映する」を押すと編集フォームの優先度とカテゴリに入ります。
保存されるのは「保存する」を押したときだけです。agent / admin にだけ出ます。

**外部への通信もAIも使いません。** `src/classify/rules.js` のキーワード表で判定するだけで、
費用もAPIキーもかかりません。判定できないときは「判断不能」と理由を出し、採用しても
カテゴリ欄は空のままにします。

ルールはそのファイルを編集すれば増やせます。判定は画面の中で動きますが、ファイルは
サーバー側で読み込んで埋め込むため、Node のテストと画面で同じルールが使われます。

```bash
npm run check:classify   # 判定結果の確認
npm run check:guard      # 分類機能の安全性の確認
```

`check:guard` は次の5点を確認します。

1. 分類モジュールが保存・送信にあたるものを公開していない（`require` / `fetch` / DB 参照も無い）
2. 権限のないロールは 403（general は自分のチケットでも分類を保存できない）
3. 判定が失敗しても画面は使えたままで、500 が起きてもプロセスは死なない
4. 詳細画面を何度開いても、保存するまで優先度は変わらない
5. 他人のチケットは general から閲覧も分類保存もできず、拒否後に値が変わらない

## 作成時の通知

作成に成功すると `NOTIFICATION_WEBHOOK_URL` へ `{"id":..,"title":".."}` を POST します。

- 通知の結果を待たず、**通知が失敗しても問い合わせは保存されます**
- URL未設定・接続不可・非2xx はいずれもログに `[通知失敗]` として残ります
- ログに出すのは `ticket_id` と理由コードだけです。**本文・タイトル・通知先URL・トークンは出しません**

## データ

`tickets` テーブル1つ。項目は `id` / `title` / `body` / `status` / `priority` /
`created_at` / `updated_at` / `created_by` / `category`。

`created_by` はロール判定で「他人のチケット」を区別するために追加した列で、OIDC の
`sub` を入れます。`category` は分類案を保存する列で、未分類は NULL です。
どちらも既存DBには起動時に自動で追加され、既存行は NULL のままです。

## 確認

```bash
npm run check
```

モックIdPとモックWebhookをローカルに立てて、次を通しで確認します（外部サービス不要）。

1. Webhook が落ちていても作成できる（空URL・接続不可・500 の3通り）
2. 未ログインの `POST /api/tickets` が 401
3. OAuth を拒否してもアプリが落ちず、ログイン画面へ戻る
4. ログにトークン・本文・タイトル・通知先URLが出ていない
5. 上のロール権限表の10行すべて（`npm run check:roles` で単独実行も可）
6. 分類ルールの判定結果（`npm run check:classify` で単独実行も可）

## 運用

`npm run repro` でログイン成否・403・外部通知の失敗・500 をローカルでわざと起こし、4種類すべてがログに残ることを確認できます。
出るのは `[ログイン成功]` `[ログイン拒否]` `[権限拒否]` `[通知失敗]` `[サーバーエラー]` の各1行で、識別は `sub` とチケットIDだけです。
同じスクリプトがトークン・Cookie・メールアドレス・本文・タイトルがログに出ていないことも検査するので、ログ方針を変えたら実行してください。

## クラウドへのデプロイ

手順は [docs/DEPLOY.md](docs/DEPLOY.md) を参照してください。環境変数の一覧、
ビルド方法、公開後の確認手順をまとめています。

`render.yaml`（Render 用）と `fly.toml`（Fly.io 用）を同梱しています。どちらにも
秘密値は含めていません。`Dockerfile` はビルド工程を持たず、本番依存の導入と起動だけを行います。

**SQLite をローカルファイルに保存しているため、保存領域の扱いに注意してください。**
Render の無料プランには永続ディスクが無く、再起動やスリープ復帰のたびに
登録した問い合わせが消えます。動作確認には使えますが、実運用には有料プランの
ディスクか PostgreSQL への移行が必要です。同じ理由でインスタンスは常に1台に固定します。

## 編集

詳細画面の編集フォームから、**タイトル・内容・ステータス・優先度・カテゴリ**を変更できます。
`PATCH /api/tickets/:id` を呼び、指定の無い項目は今の値を残します。タイトルは空にできません（400）。

編集できるのは agent / admin だけです。general には編集フォームを出さず、API でも 403 にします。

## 未実装

検索、添付ファイル、装飾、ロール変更画面、担当者の割り当て。
