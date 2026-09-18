const express = require('express');
const db = require('../db');
const { canSeeAllTickets } = require('../auth/roles');

const PRIORITIES = ['低', '中', '高'];
const COLUMNS = 'id, title, status, priority, updated_at';

const listAllStmt = db.prepare(`SELECT ${COLUMNS} FROM tickets ORDER BY id DESC`);
const listMineStmt = db.prepare(
  `SELECT ${COLUMNS} FROM tickets WHERE created_by = ? ORDER BY id DESC`
);

const router = express.Router();

// 一覧。APIと同じ判定関数を使う。画面で隠すだけにしない。
router.get('/', (req, res) => {
  const user = req.session.user;
  const tickets = canSeeAllTickets(user.role) ? listAllStmt.all() : listMineStmt.all(user.sub);
  res.render('list', { tickets, user });
});

// 新規作成フォーム。送信は画面内から POST /api/tickets を呼ぶ。
router.get('/tickets/new', (req, res) => {
  res.render('new', { priorities: PRIORITIES, user: req.session.user });
});

module.exports = router;
