const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'help.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT '未対応' CHECK (status IN ('未対応', '対応中', '完了')),
    priority   TEXT NOT NULL DEFAULT '中'   CHECK (priority IN ('低', '中', '高')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT,
    category   TEXT
  )
`);

// CREATE TABLE IF NOT EXISTS は既存テーブルの中身を見ない。
// 古いスキーマの help.db が残っていると、起動は通るのに INSERT だけが落ちるため、
// ここで列構成を突き合わせて起動時に止める。
const EXPECTED_COLUMNS = [
  'id', 'title', 'body', 'status', 'priority', 'created_at', 'updated_at',
  'created_by', 'category',
];

// created_by を後から足したため、既存の help.db には列が無い。
// 無い場合だけ追加する（既存行は NULL = 作成者不明のまま）。
// 値の検査は API 側で行う。ALTER TABLE では CHECK を足せず、新規DBと既存DBで
// 制約が食い違ってしまうため、ここでは列を足すだけにする。
const columnsBefore = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
if (!columnsBefore.includes('created_by')) {
  db.exec('ALTER TABLE tickets ADD COLUMN created_by TEXT');
}
if (!columnsBefore.includes('category')) {
  db.exec('ALTER TABLE tickets ADD COLUMN category TEXT');
}

const actualColumns = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
const missing = EXPECTED_COLUMNS.filter((c) => !actualColumns.includes(c));
const unexpected = actualColumns.filter((c) => !EXPECTED_COLUMNS.includes(c));

if (missing.length > 0 || unexpected.length > 0) {
  throw new Error(
    [
      `DBのスキーマが想定と一致しません: ${dbPath}`,
      missing.length ? `  不足している列  : ${missing.join(', ')}` : null,
      unexpected.length ? `  想定外の列      : ${unexpected.join(', ')}` : null,
      '  古い help.db が残っている可能性があります。中のデータが不要なら',
      `  このファイルを削除して起動し直してください（起動時に作り直されます）。`,
    ].filter(Boolean).join('\n')
  );
}

module.exports = db;
