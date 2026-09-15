// 環境変数の読み取りと起動時チェック。
// シークレットの値はここにも他のどこにも書かない。未設定のときはキー名だけを報告する。

const AUTH_KEYS = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'BASE_URL',
  'SESSION_SECRET',
];

// 公開URL。Render は RENDER_EXTERNAL_URL に実際のURLを入れてくれるので、
// BASE_URL が未設定ならそちらを使う。デプロイ前にURLが分からない問題を避けるため。
function resolveBaseUrl() {
  return process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '';
}

function assertAuthEnv() {
  const missing = AUTH_KEYS.filter((k) =>
    k === 'BASE_URL' ? !resolveBaseUrl() : !process.env[k]
  );
  if (missing.length > 0) {
    throw new Error(
      `認証に必要な環境変数が未設定です: ${missing.join(', ')}\n` +
        '  .env.example を参考に設定してください（値はリポジトリに含めないこと）。'
    );
  }
}

module.exports = {
  AUTH_KEYS,
  assertAuthEnv,

  get issuer() { return process.env.OIDC_ISSUER; },
  get clientId() { return process.env.OIDC_CLIENT_ID; },
  get clientSecret() { return process.env.OIDC_CLIENT_SECRET; },
  get baseUrl() { return resolveBaseUrl(); },
  get sessionSecret() { return process.env.SESSION_SECRET; },

  // ログインを許可する社内ドメイン（Google Workspace の hd クレーム）。未設定なら制限しない。
  get allowedHd() { return process.env.OIDC_ALLOWED_HD || null; },

  // 検証用のモックIdPを http で立てる場合のみ 1 にする。本番では設定しないこと。
  get allowInsecureIssuer() { return process.env.OIDC_ALLOW_INSECURE === '1'; },

  get redirectUri() { return new URL('/auth/callback', resolveBaseUrl()).toString(); },
};
