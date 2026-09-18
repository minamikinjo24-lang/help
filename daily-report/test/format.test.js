// 文章の組み立ての確認。外部への通信は無いのでそのまま実行できる。
const { buildReport } = require('../src/format');

let ok = 0, ng = 0;
const expect = (label, expected, actual) => {
  if (expected === actual) { console.log(`  OK   ${label}`); ok++; }
  else { console.log(`  NG   ${label}\n       期待: ${JSON.stringify(expected)}\n       実際: ${JSON.stringify(actual)}`); ng++; }
};

console.log('### いつもの形式で出力される');
const r = buildReport('A社への見積もり作成\n定例会議に出席');
expect('全体', [
  'お疲れ様です。',
  '本日の業務報告です。',
  '',
  '・A社への見積もり作成',
  '・定例会議に出席',
  '',
  '以上です。',
  'よろしくお願いいたします。',
].join('\n'), r.text);
expect('件数', 2, r.count);

console.log('\n### 入力の揺れを吸収する');
expect('「・」を付けて書いても二重にならない', '・見積もり作成', buildReport('・見積もり作成').text.split('\n')[3]);
expect('「-」で書いても揃う', '・見積もり作成', buildReport('- 見積もり作成').text.split('\n')[3]);
expect('前後の空白は取り除く', '・見積もり作成', buildReport('   見積もり作成   ').text.split('\n')[3]);
expect('空行は無視する', 2, buildReport('A\n\n\nB\n\n').count);

console.log('\n### 何も書かなければ0件');
for (const input of ['', '   ', '\n\n', '・', '- ']) {
  expect(`「${input.replace(/\n/g, '\\n') || '(空)'}」は0件`, 0, buildReport(input).count);
}

console.log('\n### 文字列以外を渡しても落ちない');
for (const input of [null, undefined, 123]) {
  let count = 'エラー';
  try { count = buildReport(input).count; } catch (e) { /* エラーのまま */ }
  expect(`${JSON.stringify(input)} を渡しても落ちない`, 0, count);
}

console.log(`\n================ 結果: OK ${ok}件 / NG ${ng}件 ================`);
process.exit(ng === 0 ? 0 : 1);
