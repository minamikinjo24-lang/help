const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const db = require('../db');
const { canSeeAllTickets, canDeleteTickets } = require('../auth/roles');
const { CATEGORIES } = require('../suggest/rules');

const STATUSES = ['未対応', '対応中', '完了'];

// 判定ルールは画面の中で動かす。外部への通信を挟まないため。
// ファイルをそのまま埋め込むので、Node 側とブラウザ側でルールがズレない。
const CLASSIFY_SCRIPT = fs.readFileSync(
  path.join(__dirname, '..', 'suggest', 'rules.js'),
  'utf8'
);

const PRIORITIES = ['低', '中', '高'];
const COLUMNS = 'id, title, status, priority, category, updated_at';

const listAllStmt = db.prepare(`SELECT ${COLUMNS} FROM tickets ORDER BY id DESC`);
const listMineStmt = db.prepare(
  `SELECT ${COLUMNS} FROM tickets WHERE created_by = ? ORDER BY id DESC`
);
const getStmt = db.prepare(
  'SELECT id, title, body, status, priority, category, created_at, updated_at, created_by' +
    ' FROM tickets WHERE id = ?'
);

const router = express.Router();

// 一覧。APIと同じ判定関数を使う。画面で隠すだけにしない。
router.get('/', (req, res) => {
  const user = req.session.user;
  const tickets = canSeeAllTickets(user.role) ? listAllStmt.all() : listMineStmt.all(user.sub);
  res.render('list', { tickets, user, canDelete: canDeleteTickets(user.role) });
});

// 新規作成フォーム。/tickets/:id より先に登録すること。
// 後にすると /tickets/new が :id="new" として扱われ、このページが開けなくなる。
router.get('/tickets/new', (req, res) => {
  res.render('new', {
    priorities: PRIORITIES,
    categories: CATEGORIES,
    classifyScript: CLASSIFY_SCRIPT,
    user: req.session.user,
  });
});

// 詳細。general は自分のものだけ見られる（API と同じ判定）。
// 他人のものと存在しないIDを区別せず 403 にするのも API と揃える。
router.get('/tickets/:id', (req, res) => {
  const user = req.session.user;
  const ticket = getStmt.get(Number(req.params.id));

  if (!canSeeAllTickets(user.role)) {
    if (!ticket || ticket.created_by !== user.sub) {
      console.warn(
        `[権限拒否] role=${user.role} sub=${user.sub} ` +
          `method=GET path=${req.originalUrl} reason=not_owner`
      );
      return res.status(403).render('error', { message: 'この問い合わせを見る権限がありません。', user });
    }
  } else if (!ticket) {
    return res.status(404).render('error', { message: '問い合わせが見つかりません。', user });
  }

  res.render('detail', {
    ticket,
    user,
    priorities: PRIORITIES,
    categories: CATEGORIES,
    statuses: STATUSES,
    // 編集と分類案は同じ条件。general は閲覧のみ。
    canEdit: canSeeAllTickets(user.role),
    canClassify: canSeeAllTickets(user.role),
    classifyScript: CLASSIFY_SCRIPT,
  });
});

module.exports = router;
