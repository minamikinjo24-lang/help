const express = require('express');
const config = require('../config');
const { getOidc } = require('../auth/oidc');
const { roleFor } = require('../auth/roles');

const router = express.Router();

// ログイン画面。?start=1 で認可エンドポイントへ送り出す。
// 画面と開始を同じURLにまとめ、パスを増やさない。
router.get('/auth/login', async (req, res) => {
  if (req.query.start !== '1') {
    return res.render('login', { notice: noticeFor(req.query.error) });
  }

  try {
    const { client, configuration } = await getOidc();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    req.session.oidc = { codeVerifier, state, nonce };

    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: config.redirectUri,
      scope: 'openid email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    res.redirect(302, url.href);
  } catch (err) {
    // IdPに到達できない・設定が誤っている場合。トークンは存在しないので出るものはない。
    console.error(`[ログイン開始失敗] reason=${err.code || err.name}`);
    res.status(502).render('login', { notice: 'ログインを開始できませんでした。時間をおいて試してください。' });
  }
});

// 認可サーバーからの戻り先。
router.get('/auth/callback', async (req, res) => {
  const pending = req.session.oidc;
  req.session.oidc = null; // 一度きり。成否にかかわらず捨てる。

  // 利用者が同意を拒否した場合。error パラメータが付いて戻る。
  if (req.query.error) {
    // error は IdP が返す短い識別子（access_denied 等）。トークンや個人情報は含まない。
    console.warn(`[ログイン中断] reason=${req.query.error}`);
    return res.redirect(302, '/auth/login?error=denied');
  }

  if (!pending) {
    console.warn('[ログイン失敗] reason=no_pending_state');
    return res.redirect(302, '/auth/login?error=expired');
  }

  try {
    const { client, configuration } = await getOidc();

    const currentUrl = new URL(req.originalUrl, config.baseUrl);
    const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
    });

    const claims = tokens.claims();

    // 社内ドメイン限定。hd クレームが一致しなければセッションを作らない。
    if (config.allowedHd && claims.hd !== config.allowedHd) {
      console.warn(`[ログイン拒否] reason=domain_not_allowed sub=${claims.sub}`);
      return res.status(403).render('login', { notice: '社内アカウントでログインしてください。' });
    }

    // アクセストークンとリフレッシュトークンは保持しない。本人確認にしか使わないため。
    req.session.user = {
      sub: claims.sub,
      email: claims.email,
      role: roleFor(claims.email),
    };

    res.redirect(302, '/');
  } catch (err) {
    // 失敗理由の識別子のみ。トークン・コード・レスポンス本文は出さない。
    console.error(`[ログイン失敗] reason=${err.code || err.name}`);
    res.redirect(302, '/auth/login?error=failed');
  }
});

router.post('/auth/logout', (req, res) => {
  req.session = null;
  res.redirect(302, '/auth/login');
});

function noticeFor(code) {
  if (code === 'denied') return 'ログインがキャンセルされました。';
  if (code === 'expired') return 'ログインの有効期限が切れました。もう一度お試しください。';
  if (code === 'failed') return 'ログインに失敗しました。もう一度お試しください。';
  return null;
}

module.exports = router;
