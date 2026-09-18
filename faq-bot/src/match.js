// 質問文とFAQを照合する。AIは使わず、キーワードの一致だけで判定する。
// 外部への通信はしない。登録された回答以外は返さない。

const fs = require('node:fs');
const path = require('node:path');

const FAQ_PATH = process.env.FAQ_PATH || path.join(__dirname, 'faq.json');
const REQUIRED = ['id', 'question', 'keywords', 'answer', 'source', 'updatedAt'];

/**
 * FAQを読み込む。
 * 壊れていたら、どこが悪いかを日本語で示して止める。
 * 編集するのはプログラマとは限らないので、原因が分かる形で伝える。
 */
function loadFaq() {
  let text;
  try {
    text = fs.readFileSync(FAQ_PATH, 'utf8');
  } catch (err) {
    throw new Error(`FAQのファイルが読めません: ${FAQ_PATH}\n  ${err.code}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    // JSON.parse の position から、何行目かを割り出して伝える
    const m = /position (\d+)/.exec(err.message);
    const line = m ? text.slice(0, Number(m[1])).split('\n').length : null;
    throw new Error(
      `FAQのファイルの書き方が正しくありません: ${FAQ_PATH}\n` +
        (line ? `  ${line} 行目のあたりを確認してください。\n` : '') +
        '  よくある原因: 項目の区切りのカンマが多い／足りない、引用符の閉じ忘れ'
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(`FAQのファイルは [ ] で囲んだ一覧にしてください: ${FAQ_PATH}`);
  }

  const problems = [];
  const seen = new Set();
  data.forEach((item, i) => {
    const where = `${i + 1} 件目`;
    for (const key of REQUIRED) {
      if (item[key] === undefined || item[key] === '') problems.push(`${where}: ${key} がありません`);
    }
    if (item.keywords && !Array.isArray(item.keywords)) {
      problems.push(`${where}: keywords は [ ] で囲んだ一覧にしてください`);
    }
    if (item.updatedAt && !/^\d{4}-\d{2}$/.test(item.updatedAt)) {
      problems.push(`${where}: updatedAt は 2026-09 の形式で書いてください`);
    }
    if (item.id) {
      if (seen.has(item.id)) problems.push(`${where}: id "${item.id}" が重複しています`);
      seen.add(item.id);
    }
  });

  if (problems.length > 0) {
    throw new Error(`FAQのファイルに問題があります: ${FAQ_PATH}\n  ` + problems.join('\n  '));
  }

  return data;
}

const FAQ = loadFaq();

/**
 * 質問文に一致するFAQを探す。
 *
 * 一致した言葉の数が同じときは1件に決めない。
 * 並び順で勝手に決めると、質問の意図と無関係なものを自信を持って返してしまうため。
 *
 * @returns {{decided: object|null, candidates: object[]}}
 *          decided    … 1件に特定できたFAQ。できなければ null
 *          candidates … 同点で並んだ候補。決まったときは空
 */
function search(question) {
  const text = String(question || '').toLowerCase();
  if (text.trim() === '') return { decided: null, candidates: [] };

  const scored = FAQ
    .map((item) => ({ item, hits: item.keywords.filter((k) => text.includes(k.toLowerCase())) }))
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

  if (scored.length === 0) return { decided: null, candidates: [] };

  const top = scored[0].hits.length;
  const tied = scored.filter((x) => x.hits.length === top);

  // 最有力が1つだけなら、それを答えとする
  if (tied.length === 1) return { decided: scored[0].item, candidates: [], hits: scored[0].hits };

  // 同点が複数。どれか特定できないので、候補を返して利用者に選んでもらう
  return { decided: null, candidates: tied.map((x) => x.item) };
}

module.exports = { search, loadFaq, FAQ };
