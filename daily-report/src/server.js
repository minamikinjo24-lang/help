const path = require('node:path');
const express = require('express');
const db = require('./db');
const { buildReport } = require('./format');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());

const latestStmt = db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 1');
const listStmt = db.prepare('SELECT * FROM reports ORDER BY report_date DESC, id DESC LIMIT 60');
const insertStmt = db.prepare(
  'INSERT INTO reports (report_date, items, created_at) VALUES (?, ?, ?)'
);

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

// 作成画面
app.get('/', (req, res) => {
  const previous = latestStmt.get();
  res.render('new', { today: today(), previous: previous ? previous.items : '' });
});

// 過去の日報
app.get('/reports', (req, res) => {
  res.render('list', { reports: listStmt.all() });
});

// 文章を作って保存する
app.post('/api/reports', (req, res) => {
  const input = req.body || {};

  if (typeof input.items !== 'string') {
    console.warn('[リクエスト不正] reason=items_not_string');
    return res.status(400).json({ error: '業務内容を入力してください。' });
  }

  const built = buildReport(input.items);
  if (built.count === 0) {
    console.warn('[リクエスト不正] reason=items_empty');
    return res.status(400).json({ error: '業務内容を1件以上入力してください。' });
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today();

  try {
    insertStmt.run(date, input.items, new Date().toISOString());
  } catch (err) {
    console.error(`[サーバーエラー] path=/api/reports name=${err.name} code=${err.code || '-'}`);
    return res.status(500).json({ error: '保存できませんでした。' });
  }

  // 記録するのは件数だけ。業務の中身は残さない。
  console.log(`[日報作成] date=${date} items=${built.count}`);

  res.status(201).json({ text: built.text, count: built.count });
});

app.get('/api/reports', (req, res) => res.json(listStmt.all()));

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[リクエスト不正] reason=${err.type || err.name} status=${status} path=${req.path}`);
  res.status(status).json({ error: '受け取れませんでした。' });
});

const port = process.env.PORT || 3200;
app.listen(port, () => {
  console.log(`日報作成: http://localhost:${port}`);
});
