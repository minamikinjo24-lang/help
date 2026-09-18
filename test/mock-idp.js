// 検証用のモックOIDCプロバイダー。テスト専用。
const express = require('express');
const { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint } = require('jose');

const PORT = Number(process.env.IDP_PORT || 4000);
const ISSUER = `http://localhost:${PORT}`;
// DENY=1 のとき、利用者が同意を拒否した動きを再現する
const DENY = process.env.IDP_DENY === '1';

(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  jwk.kid = await calculateJwkThumbprint(jwk);

  const codes = new Map();

  // いまログインする利用者。/__set-user で切り替えられる（テスト専用）。
  // 再起動すると署名鍵が変わり、アプリ側のキャッシュと食い違うため、
  // 利用者の切り替えは再起動ではなくこのエンドポイントで行う。
  let current = {
    email: process.env.IDP_EMAIL || 'taro@example.co.jp',
    sub: process.env.IDP_SUB || 'mock-user-001',
    hd: process.env.IDP_HD || 'example.co.jp',
  };

  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get('/__set-user', (req, res) => {
    if (req.query.email) current.email = req.query.email;
    if (req.query.sub) current.sub = req.query.sub;
    if (req.query.hd !== undefined) current.hd = req.query.hd;
    res.json(current);
  });

  app.get('/.well-known/openid-configuration', (req, res) => {
    res.json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: ['openid', 'email'],
    });
  });

  app.get('/jwks', (req, res) => res.json({ keys: [jwk] }));

  app.get('/authorize', (req, res) => {
    const { redirect_uri: redirectUri, state, nonce } = req.query;
    const back = new URL(redirectUri);

    if (DENY) {
      // 利用者が「キャンセル」を押した場合の標準的な戻り方
      back.searchParams.set('error', 'access_denied');
      back.searchParams.set('error_description', 'The user denied the request');
      if (state) back.searchParams.set('state', state);
      return res.redirect(302, back.href);
    }

    const code = 'code_' + Math.random().toString(36).slice(2);
    codes.set(code, { nonce, aud: req.query.client_id });
    back.searchParams.set('code', code);
    if (state) back.searchParams.set('state', state);
    res.redirect(302, back.href);
  });

  app.post('/token', async (req, res) => {
    const entry = codes.get(req.body.code);
    if (!entry) return res.status(400).json({ error: 'invalid_grant' });
    codes.delete(req.body.code);

    const idToken = await new SignJWT({
      email: current.email,
      email_verified: true,
      hd: current.hd,
      nonce: entry.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer(ISSUER)
      .setSubject(current.sub)
      .setAudience(entry.aud)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);

    res.json({
      access_token: 'mock_access_token_do_not_log',
      token_type: 'Bearer',
      expires_in: 600,
      id_token: idToken,
    });
  });

  app.listen(PORT, () => console.log(`mock idp: ${ISSUER} (deny=${DENY})`));
})();
