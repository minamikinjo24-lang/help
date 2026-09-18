// 分類ルールの確認。外部への通信は無いので、そのまま実行できる。
const { classify, CATEGORIES } = require('../src/suggest/rules');

const CASES = [
  // 入力                                        期待カテゴリ    期待優先度
  [['印刷できない', '3階のプリンタが反応しません'], 'プリンタ',     '中'],
  [['印刷できない', '全社で印刷が止まっています'],   'プリンタ',     '高'],
  [['Wi-Fiが繋がらない', 'たまに切れます'],          'ネットワーク', '低'],
  [['パスワードを忘れた', ''],                       'アカウント',   '中'],
  [['Excelが開かない', '至急お願いします'],          'ソフトウェア', '高'],
  [['パソコンが起動しない', '電源が入りません'],      'PC',           '中'],
  [['よろしくお願いします', 'なんとかしてください'],  '判断不能',     '中'],
  [['', ''],                                         '判断不能',     '中'],
];

let ok = 0;
let ng = 0;

for (const [[title, body], expectedCategory, expectedPriority] of CASES) {
  const r = classify(title, body);
  const label = `「${title || '(空)'}」`;

  for (const [name, actual, expected] of [
    ['カテゴリ', r.category, expectedCategory],
    ['優先度', r.priority, expectedPriority],
  ]) {
    if (actual === expected) {
      ok++;
    } else {
      ng++;
      console.log(`  NG   ${label} の${name}: 期待 ${expected} / 実際 ${actual}`);
    }
  }

  if (!r.reason || r.reason.length === 0) {
    ng++;
    console.log(`  NG   ${label} に理由が付いていない`);
  } else {
    ok++;
  }

  console.log(`  OK   ${label} → ${r.category} / ${r.priority}`);
  console.log(`         ${r.reason}`);
}

// 判断不能のときは categoryDecided が false であること（採用時にカテゴリを入れないため）
const undecided = classify('よろしく', '');
if (undecided.categoryDecided !== false) { ng++; console.log('  NG   判断不能なのに categoryDecided が true'); }
else { ok++; console.log('  OK   判断不能のとき categoryDecided は false'); }

// 返すカテゴリは必ず一覧内か「判断不能」であること
for (const [[title, body]] of CASES) {
  const c = classify(title, body).category;
  if (c !== '判断不能' && !CATEGORIES.includes(c)) {
    ng++; console.log(`  NG   一覧に無いカテゴリを返した: ${c}`);
  }
}
if (ng === 0) console.log('  OK   返したカテゴリはすべて一覧内か判断不能');

console.log(`\n================ 結果: OK ${ok}件 / NG ${ng}件 ================`);
process.exit(ng === 0 ? 0 : 1);
