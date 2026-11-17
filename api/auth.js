// 共通処理：Upstash接続・ログイン（Cookie）・2段階認証（TOTP）
const crypto = require('crypto');

// ---------- Upstash ----------
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

// ---------- 共通 ----------
function safeEq(a, b) {
  // 長さや内容で処理時間が変わらない比較
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- ログイン状態（署名付きCookie） ----------
const COOKIE = 'yutai_session';
const DAYS = 30; // ログインを保つ日数
const SECRET = process.env.SESSION_SECRET || '';

const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');

function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function isLoggedIn(req) {
  if (!SECRET) return false;
  const c = getCookie(req, COOKIE);
  if (!c) return false;
  const [exp, sig] = c.split('.');
  if (!exp || !sig || !safeEq(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

function setSessionCookie(res) {
  const exp = String(Date.now() + DAYS * 86400000);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

// ---------- 2段階認証（Google Authenticator などの6桁コード） ----------
function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, val = 0;
  const out = [];
  for (const ch of s) {
    const i = A.indexOf(ch);
    if (i < 0) throw new Error('TOTP_SECRET の形式が正しくありません');
    val = ((val << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpAt(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 30000);
  // スマホの時計のずれを考えて前後30秒も許可
  return [-1, 0, 1].some(d => safeEq(totpAt(key, now + d), code));
}

module.exports = { redis, safeEq, isLoggedIn, setSessionCookie, clearSessionCookie, verifyTotp };
