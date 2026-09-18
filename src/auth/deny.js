// 403 を返し、拒否の事実をログに残す。
//
// ログに出すのはロール・ユーザー識別子・メソッド・パス・理由コードだけ。
// トークン、本文、タイトル、メールアドレス、Cookie の中身は出さない。

/**
 * @param {string} reason 'role_not_allowed'（ロールに権限が無い）か
 *                        'not_owner'（他人のチケット。存在しないIDもこれに含める）
 */
function deny(req, res, reason) {
  const user = (req.session && req.session.user) || {};
  console.warn(
    `[権限拒否] role=${user.role} sub=${user.sub} ` +
      `method=${req.method} path=${req.originalUrl} reason=${reason}`
  );
  return res.status(403).json({ error: '権限がありません' });
}

module.exports = { deny };
