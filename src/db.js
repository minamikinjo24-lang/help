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
    updated_at TEXT NOT NULL
  )
`);

module.exports = db;
