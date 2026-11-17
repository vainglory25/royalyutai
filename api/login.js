// /api/login
//   GET    … ログイン中か・6桁コードが必要かを返す
//   POST   … ログイン { password, code }
//   DELETE … ログアウト
const A = require('../lib/auth');

const MAX_FAILS = 5;      // この回数まちがえたら
const LOCK_SEC = 15 * 60; // この秒数ログイン不可

module.exports = async (req, res) => {
  const totpOn = !!process.env.TOTP_SECRET;

  if (req.method === 'GET') {
    // check=設定チェック用（値そのものは返さず、入っているかどうかだけ）
    return res.status(200).json({
      loggedIn: A.isLoggedIn(req), totp: totpOn,
      check: {
        APP_PASSWORD: !!process.env.APP_PASSWORD,
        SESSION_SECRET: !!process.env.SESSION_SECRET,
        TOTP_SECRET: totpOn,
        UPSTASH: !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL),
      },
    });
  }
  if (req.method === 'DELETE') {
    A.clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return res.status(500).json({ error: '環境変数 APP_PASSWORD / SESSION_SECRET が未設定です' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const failKey = 'yutai:loginfail:' + ip;

  try {
    const fails = Number((await A.redis(['GET', failKey])) || 0);
    if (fails >= MAX_FAILS) {
      return res.status(429).json({ error: '失敗が続いたため、15分ほど待ってからお試しください' });
    }

    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    // 前後の空白は無視（環境変数にコピペしたときの空白・改行対策）
    const passOk = A.safeEq(String(b.password || '').trim(), process.env.APP_PASSWORD.trim());
    const codeOk = !totpOn || A.verifyTotp(process.env.TOTP_SECRET, b.code);

    if (!(passOk && codeOk)) {
      await A.redis(['INCR', failKey]);
      await A.redis(['EXPIRE', failKey, String(LOCK_SEC)]);
      return res.status(401).json({ error: totpOn ? 'パスワードまたは認証コードが違います' : 'パスワードが違います' });
    }

    await A.redis(['DEL', failKey]);
    A.setSessionCookie(res);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
