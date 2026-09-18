# 社内ヘルプデスク（問い合わせ管理）

問い合わせの登録・一覧・詳細・編集・削除ができる最小構成のアプリです。
Google アカウントでログインし、ロールに応じて見える範囲と操作できる範囲が変わります。

操作手順は [docs/USAGE.md](docs/USAGE.md)、デプロイは [docs/DEPLOY.md](docs/DEPLOY.md) を参照してください。

---

## 1. 起動方法

### 必要なもの

- Node.js **22.5 以上**（`node:sqlite` を使うため）
- Google の OAuth クライアント（作り方は下の「環境変数」を参照）

### 手順

```bash
npm install
cp .env.example .env    # 値を各自で設定（.env はコミットしない）
npm start               # http://localhost:3000
```

`社内ヘルプデスク: http://localhost:3000` と表示されれば起動しています。
必須の環境変数が足りない場合は、**不足しているキー名だけ**を表示して起動を止めます。

Windows では `npm.cmd start` のように `.cmd` を付けてください（PowerShell の実行ポリシー対策）。

### 止め方

実行中の端末で `Ctrl + C`。

---

## 2. 環境変数

値はリポジトリに含めません。`.env` は `.gitignore` 済みです。
本番ではデプロイ先の環境変数機能で渡してください。

### 必須（未設定なら起動時に停止）

| キー | 内容 | 秘密 |
|---|---|:--:|
| `OIDC_ISSUER` | `https://accounts.google.com` | |
| `OIDC_CLIENT_ID` | Google の OAuth クライアント ID | |
| `OIDC_CLIENT_SECRET` | Google の OAuth クライアント シークレット | ● |
| `BASE_URL` | 公開URL。例 `http://localhost:3000` | |
| `SESSION_SECRET` | セッションCookieの署名鍵 | ● |

`BASE_URL` は Render では設定不要です（`RENDER_EXTERNAL_URL` を自動で使います）。

`SESSION_SECRET` の生成:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

### 任意

| キー | 未設定時 | 内容 |
|---|---|---|
| `ROLE_ADMINS` | 管理者なし | 管理者のメールアドレス（カンマ区切り） |
| `ROLE_AGENTS` | 担当者なし | 担当者のメールアドレス（カンマ区切り） |
| `OIDC_ALLOWED_HD` | 制限なし | ログインを許可する社内ドメイン |
| `NOTIFICATION_WEBHOOK_URL` | 通知しない | 作成時の通知先。未設定でも作成は成功する |
| `PORT` | `3000` | 待ち受けポート |
| `DB_PATH` | `./data/help.db` | SQLite の置き場 |
| `TRUST_PROXY_HOPS` | `1` | 信頼するプロキシのホップ数（`BASE_URL` が https のときのみ有効） |
| `OIDC_ALLOW_INSECURE` | 無効 | 検証用。**本番では設定しない** |

### Google 側の設定

1. [Google Cloud Console](https://console.cloud.google.com/) →「APIとサービス」→「OAuth 同意画面」を構成
2. 「認証情報」→「OAuth クライアント ID」→ 種類は **ウェブ アプリケーション**
3. 承認済みのリダイレクト URI に `<BASE_URL>/auth/callback` を**完全一致**で登録

`OIDC_ALLOWED_HD` を設定すると、そのドメイン以外は 403 になります。
個人の `@gmail.com` には `hd` クレームが無いため、その場合は空にしてください。

---

## 3. ロールと権限

ロールは `general` / `agent` / `admin` の3つ。環境変数に載っていない人は `general` です。
両方に載っている場合は `admin` が優先されます。

判定は**画面とAPIで同じ関数**（`src/auth/roles.js`）を通します。画面で隠すだけの実装にはしていません。

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
| 9 | `GET /` 一覧画面 | 302 | 200（自分の分のみ） | 200（全件） | 200（全件） |
| 10 | `GET /tickets/new` 作成画面 | 302 | 200 | 200 | 200 |
| 11 | 一覧画面の削除ボタン | 302 | 表示されない | 表示されない | 表示される |
| 12 | `GET /tickets/:id` 詳細（自分の） | 302 | 200 | 200 | 200 |
| 12 | `GET /tickets/:id` 詳細（他人の・存在しない） | 302 | 403 | 200 / 404 | 200 / 404 |
| 13 | `PATCH /api/tickets/:id`（編集） | 401 | 403 | 200 | 200 |
| 14 | 詳細画面の「分類案を出す」ボタン | 302 | 表示されない | 表示される | 表示される |
| 15 | 詳細画面の編集フォーム | 302 | 表示されない | 表示される | 表示される |

**#5 と #8 で存在しないIDに 403 を返すのは意図的です。** 404 と撃ち分けると、
IDを順に指定するだけで実在するIDを外部から判別できてしまうためです。
権限が無いロールには存在の有無を教えません。

**#1 と #9 の general は拒否ではなく絞り込みです。** 403 は返さず、自分のチケットだけの
一覧を 200 で返します。拒否ではないのでログにも残しません。

作成者が記録されていない古いデータは、general には見えず agent / admin には見えます。

### 拒否時のログ

403 を返したときだけ1行出します。

```
[権限拒否] role=general sub=u-general method=DELETE path=/api/tickets/1 reason=role_not_allowed
```

理由は `role_not_allowed`（ロールに権限が無い）と `not_owner`（他人のチケット。存在しない
IDも区別せずこれ）の2種類です。**トークン・本文・タイトル・メールアドレスは出しません。**

### ロールを変えたとき

ロールはログイン時に決まります。環境変数を変えたら、対象の人が
**一度ログアウトしてログインし直す**必要があります。

---

## 4. 確認手順

すべてローカルで完結します。外部サービスもAPIキーも不要です（モックのIdPを使います）。

```bash
npm run check    # 下の4つをまとめて実行（137件）
npm run repro    # ログの再現と検査（12件）
```

個別に実行する場合:

| コマンド | 件数 | 内容 |
|---|---|---|
| `npm run check` の1本目 | 基本動作 | 未ログインの拒否、Webhook 通知の失敗3通り、OAuth拒否、ログの中身 |
| `npm run check:roles` | 71件 | 上のロール権限表の全行 |
| `npm run check:guard` | 29件 | 分類機能の安全性（下記） |
| `npm run check:classify` | 25件 | 分類ルールの判定結果 |
| `npm run repro` | 12件 | ログイン成否・403・通知失敗・500 をわざと起こし、ログに残ることと秘密が出ないことを確認 |

`check:guard` が見ているのは次の5点です。

1. 分類モジュールが保存・送信にあたるものを公開していない（`require` / `fetch` / DB参照も無い）
2. 権限のないロールは 403
3. 判定が失敗しても画面は使えたままで、500 が起きてもプロセスは死なない
4. 詳細画面を何度開いても、保存するまで優先度は変わらない
5. 他人のチケットは general から閲覧も分類保存もできず、拒否後に値が変わらない

### ログに残るもの

| 種類 | 形式 |
|---|---|
| ログイン成功 | `[ログイン成功] sub=... role=...` |
| ログイン失敗 | `[ログイン拒否] reason=...` / `[ログイン中断] reason=...` |
| 403 | `[権限拒否] role=... sub=... method=... path=... reason=...` |
| 通知失敗 | `[通知失敗] ticket_id=... reason=...` |
| 500 | `[サーバーエラー] method=... path=... name=... code=... message=...` |

識別子は `sub` のみで、メールアドレスは出しません。

---

## フォルダ構成

観点ごとに分けています。

```
src/
  server.js          起動と組み立て
  config.js          環境変数の読み取りと起動時チェック
  db.js              SQLite 接続とテーブル定義
  notify.js          作成時の Webhook 通知
  errors.js          共通のエラー応答とログ

  screens/           ■ 画面
    routes.js        一覧・新規作成・詳細
    views/           EJS テンプレート

  api/               ■ API
    tickets.js       /api/tickets の GET / POST / PATCH / DELETE

  auth/              ■ 権限
    routes.js        /auth/login・/auth/callback・/auth/logout
    require-login.js 未ログインの振り分け（API は 401、画面は 302）
    roles.js         ロール判定と権限の可否
    deny.js          403 の応答と拒否ログ
    oidc.js          OIDC のディスカバリ

  suggest/           ■ AI 提案
    rules.js         分類のキーワードルールと判定
```

`suggest/` は名前のとおり提案を出す部分ですが、**現在はAIを使っていません**。
キーワードの一致だけで判定し、外部への通信を一切しません。

---

## 分類案

新規作成フォームと詳細画面で、タイトルと内容から**優先度案・カテゴリ案・理由**を出します。
判定は画面の中で完結し、**採用しても保存はされません**。保存されるのは登録ボタン
（新規作成）または保存ボタン（詳細）を押したときだけです。

判定できないときは「判断不能」と理由を出し、採用してもカテゴリは空のままにします。
判定そのものが失敗した場合も案内を出すだけで、登録・編集・保存は続けられます。

ルールは `src/suggest/rules.js` にあります。言葉を足したいときはこのファイルを編集します。
Node のテストとブラウザで同じファイルを読むので、判定がズレません。

---

## データ

`tickets` テーブル1つ。

| カラム | 内容 |
|---|---|
| `id` | 連番 |
| `title` | タイトル（必須） |
| `body` | 内容 |
| `status` | 未対応 / 対応中 / 完了 |
| `priority` | 低 / 中 / 高 |
| `category` | 分類。未分類は NULL |
| `created_at` / `updated_at` | ISO8601 |
| `created_by` | 作成者（OIDC の `sub`） |

`created_by` と `category` は後から追加した列で、既存DBには起動時に自動で追加されます。
既存行は NULL のままです。

---

## 未実装

検索、添付ファイル、装飾、ロール変更画面、担当者の割り当て。
