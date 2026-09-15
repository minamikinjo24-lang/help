// 問い合わせ作成後の Webhook 通知。
//
// 設計上の約束:
//   - 呼び出し元に例外を投げない。通知の成否は問い合わせの保存に影響させない。
//   - ログにはチケットIDと失敗理由しか出さない。
//     本文・タイトル・通知先URL・レスポンス本文は出さない（個人情報とシークレットのため）。

const TIMEOUT_MS = 5000;

async function post(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error('http_status');
    err.status = res.status;
    throw err;
  }
}

/**
 * 問い合わせ作成を通知する。await されることを想定していない（結果を待たない）。
 * @param {number|bigint} id
 * @param {string} title 送信するJSONには含めるが、ログには出さない
 */
function notifyTicketCreated(id, title) {
  const url = process.env.NOTIFICATION_WEBHOOK_URL;

  if (!url) {
    console.error(`[通知失敗] ticket_id=${id} reason=url_not_configured`);
    return;
  }

  post(url, { id: Number(id), title })
    .then(() => {
      console.log(`[通知送信] ticket_id=${id}`);
    })
    .catch((err) => {
      if (err.status) {
        console.error(`[通知失敗] ticket_id=${id} reason=http_status status=${err.status}`);
      } else {
        // 出すのは理由コードだけ（ECONNREFUSED / TimeoutError 等）。URLや本文は含まない。
        const detail = (err.cause && err.cause.code) || err.name;
        console.error(`[通知失敗] ticket_id=${id} reason=fetch_error detail=${detail}`);
      }
    });
}

module.exports = { notifyTicketCreated };
