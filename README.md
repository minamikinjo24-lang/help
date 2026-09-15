# 社内ヘルプデスク（問い合わせ管理）

最小版。現時点では **一覧** と **新規作成** のみ実装しています。

## 起動

```bash
npm install
npm start
# http://localhost:3000
```

DB は `data/help.db`（SQLite）に自動作成されます。Node 22 同梱の `node:sqlite` を使うため、
起動時に experimental の警告が1行出ますが動作に影響はありません。

## 画面

| 画面 | パス |
|---|---|
| 一覧 | `GET /` |
| 新規作成フォーム | `GET /tickets/new` |
| 登録 | `POST /tickets` → `/` へリダイレクト |

## データ

`tickets` テーブル 1つ。

| カラム | 内容 |
|---|---|
| `id` | 連番 |
| `title` | タイトル（必須） |
| `body` | 内容（任意） |
| `status` | 未対応 / 対応中 / 完了（初期値 未対応） |
| `priority` | 低 / 中 / 高（初期値 中） |
| `created_at` / `updated_at` | ISO8601 文字列 |

## 未実装

詳細編集、削除、認証、外部連携、装飾。
