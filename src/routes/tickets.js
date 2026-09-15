const express = require('express');
const db = require('../db');

const PRIORITIES = ['低', '中', '高'];

const listStmt = db.prepare(
  'SELECT id, title, status, priority, updated_at FROM tickets ORDER BY id DESC'
);

const router = express.Router();

// 一覧
router.get('/', (req, res) => {
  res.render('list', { tickets: listStmt.all(), user: req.session.user });
});

// 新規作成フォーム。送信は画面内から POST /api/tickets を呼ぶ。
router.get('/tickets/new', (req, res) => {
  res.render('new', { priorities: PRIORITIES, user: req.session.user });
});

module.exports = router;
