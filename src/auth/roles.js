// ロールの判定。環境変数に列挙したメールアドレスで決める。
// DBに表を増やさず、画面も増やさないための最小の方法。

const ADMIN = 'admin';
const AGENT = 'agent';
const GENERAL = 'general';

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** メールアドレスからロールを決める。どちらにも載っていなければ general。 */
function roleFor(email) {
  const target = String(email || '').toLowerCase();
  if (!target) return GENERAL;
  if (parseList(process.env.ROLE_ADMINS).includes(target)) return ADMIN;
  if (parseList(process.env.ROLE_AGENTS).includes(target)) return AGENT;
  return GENERAL;
}

/** 全件を見られるか。general は自分の分だけ。 */
function canSeeAllTickets(role) {
  return role === ADMIN || role === AGENT;
}

/** 削除できるか。admin だけ。 */
function canDeleteTickets(role) {
  return role === ADMIN;
}

module.exports = { ADMIN, AGENT, GENERAL, roleFor, canSeeAllTickets, canDeleteTickets };
