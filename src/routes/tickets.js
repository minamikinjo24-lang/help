const express = require('express');
const db = require('../db');

const PRIORITIES = ['低', '中', '高'];

const listStmt = db.prepare(
  'SELECT id, title, status, priority, updated_at FROM tickets ORDER BY id DESC'
);
const insertStmt = db.prepare(
  'INSERT INTO tickets (title, body, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
);

const router = express.Router();

// 一覧
router.get('/', (req, res) => {
  res.render('list', { tickets: listStmt.all() });
});

// 新規作成フォーム
router.get('/tickets/new', (req, res) => {
  res.render('new', {
    priorities: PRIORITIES,
    values: { title: '', body: '', priority: '中' },
    error: null,
  });
});

// 新規作成
router.post('/tickets', (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : '中';

  if (title === '') {
    return res.status(400).render('new', {
      priorities: PRIORITIES,
      values: { title: '', body, priority },
      error: 'タイトルを入力してください。',
    });
  }

  const now = new Date().toISOString();

  try {
    insertStmt.run(title, body, priority, now, now);
  } catch (err) {
    // 素の 500 だと画面にもログにも原因が残らないため、理由を出して再表示する。
    console.error('[作成失敗]', err.message);
    return res.status(500).render('new', {
      priorities: PRIORITIES,
      values: { title, body, priority },
      error: `保存できませんでした: ${err.message}`,
    });
  }

  res.redirect(303, '/');
});

module.exports = router;
