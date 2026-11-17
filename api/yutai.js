// /api/yutai?month=YYYY-MM  （ログインしていないと使えない）
const A = require('../lib/auth');
const MAX = 100; // 1か月に登録できる券の上限

module.exports = async (req, res) => {
  if (!A.isLoggedIn(req)) return res.status(401).json({ error: 'ログインしてください' });

  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month は YYYY-MM' });
  const key = 'yutai:' + month; // 月ごとに1つのハッシュ。項目ごとに保存するので同時操作でも上書きされない

  try {
    if (req.method === 'GET') {
      const flat = (await A.redis(['HGETALL', key])) || [];
      const items = {};
      for (let i = 0; i < flat.length; i += 2) items[flat[i]] = JSON.parse(flat[i + 1]);
      return res.status(200).json(items);
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const i = Number(b.i);
      if (!(Number.isInteger(i) && i >= 0 && i < MAX)) return res.status(400).json({ error: `i は 0〜${MAX - 1}` });
      const url = String(b.url || '').trim().slice(0, 1000);
      if (url && !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'URL は http(s):// で始めてください' });
      const val = { used: !!b.used, date: b.date || '', memo: String(b.memo || '').slice(0, 100), url };
      await A.redis(['HSET', key, String(i), JSON.stringify(val)]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const i = Number(req.query.i);
      if (!(Number.isInteger(i) && i >= 6 && i < MAX)) return res.status(400).json({ error: '削除できるのは追加した券だけです' });
      await A.redis(['HDEL', key, String(i)]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
