const express = require('express');
const db = require('../../db');
const { notifyTicketCreated } = require('../../notify');

const STATUSES = ['未対応', '対応中', '完了'];
const PRIORITIES = ['低', '中', '高'];

const listStmt = db.prepare(
  'SELECT id, title, body, status, priority, created_at, updated_at FROM tickets ORDER BY id DESC'
);
const getStmt = db.prepare(
  'SELECT id, title, body, status, priority, created_at, updated_at FROM tickets WHERE id = ?'
);
const insertStmt = db.prepare(
  'INSERT INTO tickets (title, body, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
);

const router = express.Router();

// 一覧
router.get('/', (req, res) => {
  res.json(listStmt.all());
});

// 1件取得
router.get('/:id', (req, res) => {
  const row = getStmt.get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '見つかりません' });
  res.json(row);
});

// 作成
router.post('/', (req, res) => {
  const title = String(req.body.title ?? '').trim();
  const body = String(req.body.body ?? '').trim();

  if (title === '') {
    return res.status(400).json({ error: 'タイトルを入力してください。' });
  }

  const status = STATUSES.includes(req.body.status) ? req.body.status : '未対応';
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : '中';
  const now = new Date().toISOString();

  let id;
  try {
    const result = insertStmt.run(title, body, status, priority, now, now);
    id = Number(result.lastInsertRowid);
  } catch (err) {
    console.error('[作成失敗]', err.message);
    return res.status(500).json({ error: `保存できませんでした: ${err.message}` });
  }

  // 保存は完了している。通知は待たず、失敗しても応答に影響させない。
  notifyTicketCreated(id, title);

  res.status(201).location(`/api/tickets/${id}`).json(getStmt.get(id));
});

module.exports = router;
