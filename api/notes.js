// /api/notes  共有事項（月に関係なく1つだけのメモ）
//   GET  … 取得
//   POST … 保存 { text }
const A = require('../lib/auth');
const KEY = 'yutai:notes';

module.exports = async (req, res) => {
  if (!A.isLoggedIn(req)) return res.status(401).json({ error: 'ログインしてください' });
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ text: (await A.redis(['GET', KEY])) || '' });
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      await A.redis(['SET', KEY, String(b.text || '').slice(0, 2000)]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
