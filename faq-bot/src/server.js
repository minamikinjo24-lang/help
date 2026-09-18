const path = require('node:path');
const express = require('express');
const { search, FAQ } = require('./match');

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
  const input = req.body || {};

  // 文字列以外は受け付けない。String() で強制変換すると、
  // 数値や配列が質問として通ってしまい、原因の分からない結果になるため。
  if (typeof input.question !== 'string') {
    console.warn('[リクエスト不正] reason=question_not_string');
    return res.status(400).json({ error: '質問を入力してください。' });
  }

  const question = input.question.trim();
  if (question === '') {
    console.warn('[リクエスト不正] reason=question_empty');
    return res.status(400).json({ error: '質問を入力してください。' });
  }

  const result = search(question);

  // 記録するのは「どのFAQに一致したか」だけ。
  // 質問文そのものは出さない（氏名や連絡先が含まれうるため）。
  // matched=none が増えていれば FAQ に足すべき項目が、
  // matched=ambiguous が増えていればキーワードの整理が必要だと分かる。
  const marker = result.decided
    ? result.decided.id
    : result.candidates.length > 0
      ? `ambiguous(${result.candidates.map((c) => c.id).join('+')})`
      : 'none';
  console.log(`[応答] matched=${marker}`);

  // 候補が複数。どれか決めつけず、選んでもらう。
  if (!result.decided && result.candidates.length > 0) {
    return res.json({
      found: false,
      ambiguous: true,
      answer: 'どちらについてのご質問でしょうか。選んでください。',
      candidates: result.candidates.map((c) => c.question),
    });
  }

  // 該当なし。答えを作らず、担当者へ案内する。
  if (!result.decided) {
    return res.json({
      found: false,
      ambiguous: false,
      answer: '申し訳ありません。その質問にはお答えできる情報がありません。担当者へお問い合わせください。',
    });
  }

  res.json({
    found: true,
    answer: result.decided.answer,
    source: result.decided.source,
    updatedAt: result.decided.updatedAt,
    matched: result.hits,
  });
});

// 拾われなかった例外はここで処理する。
// 既定のままだとスタックトレースが丸ごと出て、内部のファイル構成が残るうえ、
// ログが読めなくなる。1行にまとめ、状態コードは元の値を尊重する。
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  console.error(
    `[リクエスト不正] reason=${err.type || err.name} status=${status} path=${req.path}`
  );
  res.status(status).json({ error: '質問を受け取れませんでした。' });
});

const port = process.env.PORT || 3100;
app.listen(port, () => {
  console.log(`よくある質問ボット: http://localhost:${port}`);
});
