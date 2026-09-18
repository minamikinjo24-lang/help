const path = require('node:path');
const express = require('express');
const { findAnswer } = require('./match');
const { FAQ } = require('./faq');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());

// チャット画面
app.get('/', (req, res) => {
  res.render('chat', { examples: FAQ.map((f) => f.question) });
});

// 質問に答える。登録された回答しか返さない。
app.post('/api/ask', (req, res) => {
  const question = String((req.body || {}).question ?? '').trim();

  if (question === '') {
    return res.status(400).json({ error: '質問を入力してください。' });
  }

  const found = findAnswer(question);

  if (!found) {
    // 分からないときは作らない。担当者へ案内する。
    return res.json({
      found: false,
      answer: '申し訳ありません。その質問にはお答えできる情報がありません。担当者へお問い合わせください。',
    });
  }

  res.json({
    found: true,
    answer: found.item.answer,
    source: found.item.source,
    matched: found.hits,
  });
});

const port = process.env.PORT || 3100;
app.listen(port, () => {
  console.log(`よくある質問ボット: http://localhost:${port}`);
});
