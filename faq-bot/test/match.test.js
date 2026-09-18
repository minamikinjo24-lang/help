// 照合の確認。外部への通信もAPIキーも不要なので、そのまま実行できる。
const { findAnswer } = require('../src/match');
const { FAQ } = require('../src/faq');

let ok = 0;
let ng = 0;
const expect = (label, expected, actual) => {
  if (expected === actual) { console.log(`  OK   ${label}`); ok++; }
  else { console.log(`  NG   ${label} … 期待 ${expected} / 実際 ${actual}`); ng++; }
};

console.log('### 登録されている質問に答えられる');
for (const item of FAQ) {
  const r = findAnswer(item.question);
  expect(`「${item.question}」`, item.id, r ? r.item.id : '(該当なし)');
}

console.log('\n### 言い回しが違っても拾える');
const 言い換え = [
  ['保証はいつまで？', 'warranty'],
  ['いくらくらいかかりますか', 'quote'],
  ['いつ届きますか', 'delivery'],
  ['返金してほしい', 'return'],
  ['動かないのですが', 'support'],
];
for (const [q, id] of 言い換え) {
  const r = findAnswer(q);
  expect(`「${q}」`, id, r ? r.item.id : '(該当なし)');
}

console.log('\n### 知らないことは答えない');
for (const q of ['今日の天気は？', '社長の趣味は', '', '   ']) {
  const r = findAnswer(q);
  expect(`「${q || '(空)'}」は該当なし`, true, r === null);
}

console.log('\n### 登録されていない答えを作らない');
const r = findAnswer('保証期間は？');
expect('返す回答はFAQに登録されたものと同一', true, FAQ.some((f) => f.answer === r.item.answer));
expect('出典が必ず付く', true, typeof r.item.source === 'string' && r.item.source.length > 0);

console.log(`\n================ 結果: OK ${ok}件 / NG ${ng}件 ================`);
process.exit(ng === 0 ? 0 : 1);
