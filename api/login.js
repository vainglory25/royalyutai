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
    return res.status(200).json({ loggedIn: A.isLoggedIn(req), totp: totpOn });
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
    const passOk = A.safeEq(b.password || '', process.env.APP_PASSWORD);
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
