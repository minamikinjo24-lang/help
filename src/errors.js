// 同じエラー応答とログを複数箇所で手書きしていたので、1か所にまとめた。
// 文言・HTTPコード・ログの形式は従来どおりで、挙動は変えていない。

/**
 * 500 として記録する。
 * 出すのはメソッド・パス・エラーの種別だけ。
 * body-parser のエラーは message に本文の断片を含みうるため、そこだけ落とす。
 */
function logServerError(req, err) {
  const safeMessage = err.type === 'entity.parse.failed' ? '(本文の解析に失敗)' : err.message;
  console.error(
    `[サーバーエラー] method=${req.method} path=${req.originalUrl} ` +
      `name=${err.name} code=${err.code || '-'} message=${safeMessage}`
  );
}

/** 対象のチケットが無い場合の応答（APIで3箇所が同じものを返していた） */
function notFound(res) {
  return res.status(404).json({ error: '見つかりません' });
}

/** タイトルが空の場合の応答（作成と更新で同じものを返していた） */
function titleRequired(res) {
  return res.status(400).json({ error: 'タイトルを入力してください。' });
}

module.exports = { logServerError, notFound, titleRequired };
