const express = require('express');
const db = require('../../db');
const { notifyTicketCreated } = require('../../notify');
const { canSeeAllTickets, canDeleteTickets } = require('../../auth/roles');
const { deny } = require('../../auth/deny');
const { CATEGORIES } = require('../../classify/rules');

const STATUSES = ['未対応', '対応中', '完了'];
const PRIORITIES = ['低', '中', '高'];
const COLUMNS =
  'id, title, body, status, priority, category, created_at, updated_at, created_by';

const listAllStmt = db.prepare(`SELECT ${COLUMNS} FROM tickets ORDER BY id DESC`);
const listMineStmt = db.prepare(
  `SELECT ${COLUMNS} FROM tickets WHERE created_by = ? ORDER BY id DESC`
);
const getStmt = db.prepare(`SELECT ${COLUMNS} FROM tickets WHERE id = ?`);
const insertStmt = db.prepare(
  'INSERT INTO tickets' +
    ' (title, body, status, priority, category, created_at, updated_at, created_by)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const deleteStmt = db.prepare('DELETE FROM tickets WHERE id = ?');

const router = express.Router();

// 一覧。general は自分の分だけに絞る（拒否ではないので 403 にはしない）。
router.get('/', (req, res) => {
  const user = req.session.user;
  const rows = canSeeAllTickets(user.role) ? listAllStmt.all() : listMineStmt.all(user.sub);
  res.json(rows);
});

// 作成。ロールによらず全員できる。
router.post('/', (req, res) => {
  const title = String(req.body.title ?? '').trim();
  const body = String(req.body.body ?? '').trim();

  if (title === '') {
    return res.status(400).json({ error: 'タイトルを入力してください。' });
  }

  const status = STATUSES.includes(req.body.status) ? req.body.status : '未対応';
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : '中';
  // 一覧に無い値は無視して未分類（null）にする。分類は任意項目のため。
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : null;
  const now = new Date().toISOString();

  let id;
  try {
    const result = insertStmt.run(
      title, body, status, priority, category, now, now, req.session.user.sub
    );
    id = Number(result.lastInsertRowid);
  } catch (err) {
    console.error(
      `[サーバーエラー] method=POST path=/api/tickets name=${err.name} ` +
        `code=${err.code || '-'} message=${err.message}`
    );
    return res.status(500).json({ error: `保存できませんでした: ${err.message}` });
  }

  notifyTicketCreated(id, title);
  res.status(201).location(`/api/tickets/${id}`).json(getStmt.get(id));
});

// 1件取得。
// general には、他人のチケットと存在しないIDを区別せず 403 を返す。
// 区別すると、IDを順に叩くだけで実在するIDが判別できてしまうため。
router.get('/:id', (req, res) => {
  const user = req.session.user;
  const row = getStmt.get(Number(req.params.id));

  if (!canSeeAllTickets(user.role)) {
    if (!row || row.created_by !== user.sub) return deny(req, res, 'not_owner');
    return res.json(row);
  }

  if (!row) return res.status(404).json({ error: '見つかりません' });
  res.json(row);
});

// 削除。admin のみ。
// admin 以外には、IDの実在に関わらず 403 を返す（上と同じ理由）。
router.delete('/:id', (req, res) => {
  if (!canDeleteTickets(req.session.user.role)) {
    return deny(req, res, 'role_not_allowed');
  }

  const result = deleteStmt.run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: '見つかりません' });
  res.status(204).end();
});

module.exports = router;
