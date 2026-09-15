// 検証用のWebhook受信サーバー。受信内容を received.json に追記する。
const fs = require('node:fs');
const express = require('express');

const PORT = Number(process.env.HOOK_PORT || 4100);
const OUT = process.env.HOOK_OUT || '/tmp/helpdesk-received.jsonl';
const STATUS = Number(process.env.HOOK_STATUS || 200);

const app = express();
app.use(express.json());
app.post('/hook', (req, res) => {
  fs.appendFileSync(OUT, JSON.stringify(req.body) + '\n');
  res.status(STATUS).send(STATUS === 200 ? 'ok' : 'ng');
});
app.listen(PORT, () => console.log(`mock webhook: http://localhost:${PORT}/hook -> ${STATUS}`));
