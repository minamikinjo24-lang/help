// 異常系とログの確認。Windows でもそのまま動くように Node だけで書く。
// 実行: npm run check:api
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.CHECK_PORT || 3299);
const BASE = `http://localhost:${PORT}`;
const workDir = path.join(os.tmpdir(), 'report-check');
const appDir = path.join(__dirname, '..');

let ok = 0;
let ng = 0;
let log = '';

function expect(want, got, name) {
  const mark = String(want) === String(got) ? 'OK  ' : 'NG  ';
  if (mark === 'OK  ') ok++;
  else ng++;
  console.log(`  ${mark} ${name.padEnd(44)} 期待 ${String(want).padEnd(5)} 実際 ${got}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body) {
  try {
    const res = await fetch(`${BASE}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return res.status;
  } catch {
    return 'つながらない';
  }
}

async function get(pathname) {
  const res = await fetch(BASE + pathname);
  return { status: res.status, text: await res.text() };
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

async function main() {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: appDir,
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(workDir, 'reports.db') },
  });
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  let up = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(BASE + '/');
      up = true;
      break;
    } catch {
      await sleep(100);
    }
  }
  if (!up) {
    console.error(`起動できませんでした。ポート ${PORT} が使われていないか確認してください。`);
    console.error(log);
    child.kill();
    process.exit(1);
  }

  try {
    console.log('##### 正常に作れる #####');
    expect(201, await post('{"date":"2026-09-18","items":"A社への見積もり作成\\n定例会議に出席"}'), '日報を作成できる');

    const made = await fetch(`${BASE}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"items":"見積もり作成"}',
    }).then((r) => r.json());
    expect(1, count(made.text, 'お疲れ様です'), 'いつもの挨拶が入る');
    expect(1, count(made.text, 'よろしくお願いいたします'), 'いつもの締めが入る');

    const list = await get('/reports');
    expect(200, list.status, '過去の日報が開ける');
    expect(true, count(list.text, '定例会議に出席') >= 1, '保存した内容が一覧に出る');

    console.log('\n##### 異常系 #####');
    const noBody = await fetch(`${BASE}/api/reports`, { method: 'POST' });
    expect(400, noBody.status, '本文なし');
    expect(400, await post('{壊れ'), '壊れたJSON');
    expect(400, await post('{}'), 'items が無い');
    expect(400, await post('{"items":123}'), 'items が数値');
    expect(400, await post('{"items":["a"]}'), 'items が配列');
    expect(400, await post('{"items":"   "}'), '空白だけ');
    expect(400, await post('{"items":"\\n\\n"}'), '空行だけ');
    expect(201, await post('{"date":"めちゃくちゃ","items":"作業"}'), '日付が不正でも今日として受け付ける');
    expect(413, await post(JSON.stringify({ items: 'あ'.repeat(70000) })), '巨大な入力');
    expect(404, (await get('/nonexistent')).status, '存在しないパス');

    console.log('\n##### 異常系のあともアプリは生きている #####');
    expect(200, (await get('/')).status, '作成画面が開ける');
    expect(201, await post('{"items":"復帰後の作業"}'), 'そのあとも作成できる');

    await sleep(200);
    console.log('\n##### ログ #####');
    expect(true, count(log, '[日報作成]') >= 1, '作成が記録される');
    expect(true, count(log, '[リクエスト不正]') >= 1, '不正なリクエストが記録される');

    console.log('\n##### ログに出てはいけないもの #####');
    expect(0, count(log, 'node_modules'), '内部のファイル構成');
    expect(0, count(log, '見積もり'), '業務の中身');
    expect(0, count(log, '定例会議'), '業務の中身（その2）');

    console.log('\n  --- ログ全文 ---');
    for (const line of log.split('\n')) {
      if (line.trim() === '' || /ExperimentalWarning|trace-warnings/.test(line)) continue;
      console.log('    ' + line);
    }
  } finally {
    child.kill();
  }

  console.log(`\n================ 結果: OK ${ok}件 / NG ${ng}件 ================`);
  process.exit(ng === 0 ? 0 : 1);
}

main();
