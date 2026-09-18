// 日報の文章を組み立てる。
// 定型部分（挨拶・締め）を毎回打ち直さずに済むようにするのが目的。
//
// 形式を変えたいときは TEMPLATE を書き換える。

const TEMPLATE = {
  greeting: ['お疲れ様です。', '本日の業務報告です。'],
  bullet: '・',
  closing: ['以上です。', 'よろしくお願いいたします。'],
};

/**
 * 入力された業務内容から、貼り付け用の文章を作る。
 *
 * @param {string} items 1行に1件。空行は無視する
 * @returns {{text: string, count: number}}
 */
function buildReport(items) {
  // 文字列以外は中身が無いものとして扱う。
  // String() で変換すると数値などがそのまま業務内容になり、
  // エラーにならないので誰も気づけない。
  const source = typeof items === 'string' ? items : '';

  const lines = source
    .split('\n')
    .map((s) => s.trim())
    // 利用者が「・」を付けて書いても二重にならないようにする
    .map((s) => s.replace(/^[・･\-*]\s*/, ''))
    .filter((s) => s !== '');

  const body = lines.map((s) => TEMPLATE.bullet + s);

  const text = [
    ...TEMPLATE.greeting,
    '',
    ...body,
    '',
    ...TEMPLATE.closing,
  ].join('\n');

  return { text, count: lines.length };
}

module.exports = { buildReport, TEMPLATE };
