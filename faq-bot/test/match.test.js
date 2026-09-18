// 照合の確認。外部への通信もAPIキーも不要なので、そのまま実行できる。
//
// レビュー指摘への対応で、期待する動きを変えた箇所がある。
//   変更前: 一致数が同じときは配列の先頭に近いものを返していた（並び順で決まっていた）
//   変更後: 同点のときは1件に絞らず、候補を返して利用者に選ばせる
const { search, loadFaq } = require('../src/match');

const FAQ = loadFaq();

let ok = 0;
let ng = 0;
const expect = (label, expected, actual) => {
  if (expected === actual) { console.log(`  OK   ${label}`); ok++; }
  else { console.log(`  NG   ${label} … 期待 ${expected} / 実際 ${actual}`); ng++; }
};

console.log('### 登録されている質問は1件に特定できる');
for (const item of FAQ) {
  const r = search(item.question);
  expect(`「${item.question}」`, item.id, r.decided ? r.decided.id : `(候補${r.candidates.length}件)`);
}

console.log('\n### 言い回しが違っても拾える');
for (const [q, id] of [
  ['保証はいつまで？', 'warranty'],
  ['いくらくらいかかりますか', 'quote'],
  ['返金してほしい', 'return'],
]) {
  const r = search(q);
  expect(`「${q}」`, id, r.decided ? r.decided.id : `(候補${r.candidates.length}件)`);
}

console.log('\n### 重なっていたキーワードを整理した結果、正しく特定できるようになった質問');
// 変更前は「修理」が保証とサポートの両方に入っていたため、保証期間の話が返っていた
for (const [q, id] of [
  ['いつ修理が終わりますか', 'support'],
  ['修理の見積もりはいくら', 'quote'],
  ['保証はいつまでですか', 'warranty'],
]) {
  const r = search(q);
  expect(`「${q}」→ ${id}`, id, r.decided ? r.decided.id : `(候補${r.candidates.length}件)`);
}

console.log('\n### それでも同点になるものは1件に決めつけない');
for (const q of ['返品の納期', '故障した商品を返品したい', '見積もりの納期']) {
  const r = search(q);
  expect(`「${q}」は決めつけない`, true, r.decided === null && r.candidates.length >= 2);
  expect(`「${q}」は候補を返す`, true, r.candidates.every((c) => typeof c.question === 'string'));
}

console.log('\n### 知らないことは答えない');
for (const q of ['今日の天気は？', '社長の趣味は', '', '   ']) {
  const r = search(q);
  expect(`「${q || '(空)'}」は候補なし`, true, r.decided === null && r.candidates.length === 0);
}

console.log('\n### 登録されていない答えを作らない');
const r = search('保証期間は？');
expect('返す回答はFAQに登録されたものと同一', true, FAQ.some((f) => f.answer === r.decided.answer));
expect('出典が必ず付く', true, typeof r.decided.source === 'string' && r.decided.source.length > 0);
expect('更新日が必ず付く', true, /^\d{4}-\d{2}$/.test(r.decided.updatedAt || ''));

console.log('\n### FAQデータの検査');
expect('全件に更新日がある', true, FAQ.every((f) => /^\d{4}-\d{2}$/.test(f.updatedAt || '')));
expect('idが重複していない', FAQ.length, new Set(FAQ.map((f) => f.id)).size);
expect('全件に出典がある', true, FAQ.every((f) => f.source && f.source.length > 0));

console.log(`\n================ 結果: OK ${ok}件 / NG ${ng}件 ================`);
process.exit(ng === 0 ? 0 : 1);
