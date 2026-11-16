// Login tokens: a small signed message { uid, role, exp }.
// If anyone changes even one letter, the signature no longer matches.
const crypto = require('node:crypto');

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret, ttlSeconds, now = Date.now()) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds }));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + mac;
}

// Returns the payload, or null if the token is wrong, changed or expired.
function verify(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null;
  return payload;
}

module.exports = { sign, verify };
