// 質問文とFAQを照合する。AIは使わず、キーワードの一致だけで判定する。
// 外部への通信はしない。登録された回答以外は返さない。

const { FAQ } = require('./faq');

/**
 * 質問文に最も近いFAQを1件返す。
 * 該当が無ければ null を返す（勝手に答えを作らない）。
 *
 * @param {string} question
 * @returns {{item: object, hits: string[]} | null}
 */
function findAnswer(question) {
  const text = String(question || '').toLowerCase();
  if (text.trim() === '') return null;

  let best = null;

  for (const item of FAQ) {
    const hits = item.keywords.filter((k) => text.includes(k.toLowerCase()));
    if (hits.length === 0) continue;
    // 一致した言葉が多いものを優先する
    if (!best || hits.length > best.hits.length) best = { item, hits };
  }

  return best;
}

module.exports = { findAnswer };
