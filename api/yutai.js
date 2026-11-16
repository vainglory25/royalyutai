// Vercel Serverless Function: /api/yutai?month=YYYY-MM
// Upstash の環境変数（どちらの名前でもOK）
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month は YYYY-MM' });
  const key = 'yutai:' + month; // 月ごとに1つのハッシュ。項目ごとに保存するので同時操作でも上書きされない

  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', key])) || [];
      const items = {};
      for (let i = 0; i < flat.length; i += 2) items[flat[i]] = JSON.parse(flat[i + 1]);
      return res.status(200).json(items);
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const i = Number(b.i);
      if (!(i >= 0 && i < 6)) return res.status(400).json({ error: 'i は 0〜5' });
      const url = String(b.url || '').trim().slice(0, 1000);
      if (url && !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'URL は http(s):// で始めてください' });
      const val = { used: !!b.used, date: b.date || '', memo: String(b.memo || '').slice(0, 100), url };
      await redis(['HSET', key, String(i), JSON.stringify(val)]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
