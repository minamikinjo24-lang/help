// キーワードによる分類ルール。外部への通信は一切しない。
//
// このファイルは Node（テスト用）とブラウザ（画面用）の両方から読める形にしてある。
// 判定ロジックを2箇所に書くと必ずズレるため、1箇所に集約している。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Classify = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CATEGORIES = ['PC', 'ネットワーク', 'アカウント', 'プリンタ', 'ソフトウェア', 'その他'];

  // 上から順に見て、最初に当たったものを採用する。
  const CATEGORY_RULES = [
    { category: 'プリンタ', keywords: ['印刷', 'プリンタ', 'プリンター', 'トナー', 'インク', '用紙', 'コピー機', 'スキャン'] },
    { category: 'ネットワーク', keywords: ['ネットワーク', 'ネット', 'wi-fi', 'wifi', '無線', '有線', 'lan', 'vpn', '繋がらない', 'つながらない', '接続できない', '遅い'] },
    { category: 'アカウント', keywords: ['パスワード', 'ログイン', 'ログオン', 'アカウント', 'ロック', '権限', '認証', 'サインイン'] },
    { category: 'ソフトウェア', keywords: ['excel', 'エクセル', 'word', 'ワード', 'powerpoint', 'outlook', 'teams', 'zoom', 'インストール', 'ライセンス', 'アップデート', 'バージョン'] },
    { category: 'PC', keywords: ['pc', 'パソコン', '端末', '起動しない', '電源', 'フリーズ', '固まる', '再起動', 'ブルースクリーン', 'キーボード', 'マウス', 'モニタ', 'ディスプレイ'] },
  ];

  const PRIORITY_RULES = [
    { priority: '高', keywords: ['全社', '全員', '複数名', '部署全体', '業務が止', '止まっている', '停止', '至急', '緊急', '今日中', '納期', '顧客'] },
    { priority: '低', keywords: ['たまに', '時々', 'ときどき', '不便', '気になる', '急ぎません', '急がない', 'later', '余裕'] },
  ];

  function findHits(text, keywords) {
    return keywords.filter((k) => text.includes(k));
  }

  /**
   * タイトルと本文から分類案を出す。保存はしない。
   * @returns {{category: string, priority: string, reason: string, categoryDecided: boolean}}
   */
  function classify(title, body) {
    const text = String(title || '') + ' ' + String(body || '');
    const lower = text.toLowerCase();
    const reasons = [];

    let category = '判断不能';
    let categoryDecided = false;
    for (const rule of CATEGORY_RULES) {
      const hits = findHits(lower, rule.keywords);
      if (hits.length > 0) {
        category = rule.category;
        categoryDecided = true;
        reasons.push(`「${hits.slice(0, 3).join('」「')}」からカテゴリを${rule.category}と判断`);
        break;
      }
    }
    if (!categoryDecided) {
      reasons.push('カテゴリを判断できる言葉が見つからないため判断不能');
    }

    let priority = '中';
    let priorityDecided = false;
    for (const rule of PRIORITY_RULES) {
      const hits = findHits(lower, rule.keywords);
      if (hits.length > 0) {
        priority = rule.priority;
        priorityDecided = true;
        reasons.push(`「${hits.slice(0, 3).join('」「')}」から優先度を${rule.priority}と判断`);
        break;
      }
    }
    if (!priorityDecided) {
      reasons.push('緊急度を示す言葉が無いため優先度は既定の中');
    }

    return { category, priority, reason: reasons.join('。'), categoryDecided };
  }

  return { CATEGORIES, CATEGORY_RULES, PRIORITY_RULES, classify };
});
