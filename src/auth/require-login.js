// 未認証の扱いを経路で分ける。
//   /api/* は 401 + JSON（リダイレクトするとクライアントが解釈できないため）
//   画面    は 302 でログイン画面へ
module.exports = function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  return res.redirect(302, '/auth/login');
};
