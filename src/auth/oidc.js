// openid-client v6 は ESM 専用のため、CommonJS からは動的 import で読み込む。
// ディスカバリ自体が非同期なので、初回アクセス時にまとめて解決して使い回す。

const config = require('../config');

let cached = null;

async function getOidc() {
  if (cached) return cached;

  cached = (async () => {
    const client = await import('openid-client');

    const options = {};
    if (config.allowInsecureIssuer) {
      // 検証用のモックIdP（http）を使うときだけ。本番では OIDC_ALLOW_INSECURE を設定しない。
      options.execute = [client.allowInsecureRequests];
    }

    const configuration = await client.discovery(
      new URL(config.issuer),
      config.clientId,
      config.clientSecret,
      undefined,
      options
    );

    return { client, configuration };
  })().catch((err) => {
    cached = null; // 次のアクセスで再試行できるようにする
    throw err;
  });

  return cached;
}

module.exports = { getOidc };
