const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword, generatePassword } = require('../src/security/passwords');
const { sign, verify } = require('../src/security/tokens');
const { createLimiter } = require('../src/security/rateLimit');
const { detectImageType, decodeBase64Image, sha256 } = require('../src/security/images');
const { demoPng } = require('../src/db/png');

test('passwords: correct one verifies, wrong one does not, and the hash hides the password', () => {
  const h = hashPassword('a-long-enough-password');
  assert.ok(!h.includes('a-long-enough-password'));
  assert.ok(verifyPassword('a-long-enough-password', h));
  assert.ok(!verifyPassword('a-long-enough-passwore', h));
  assert.ok(!verifyPassword('', h));
  assert.ok(!verifyPassword(null, h));
  assert.ok(!verifyPassword('x', 'not-a-hash'));
});

test('passwords: two hashes of the same password differ (salt)', () => {
  assert.notStrictEqual(hashPassword('same-password-123'), hashPassword('same-password-123'));
});

test('passwords: too short is refused, generated ones are long enough', () => {
  assert.throws(() => hashPassword('short'));
  assert.ok(generatePassword().length >= 12);
  assert.notStrictEqual(generatePassword(), generatePassword());
});

test('tokens: a good token verifies', () => {
  const t = sign({ uid: 7, role: 'agent' }, 'secret', 60, 1000000);
  const p = verify(t, 'secret', 1000000 + 1000);
  assert.strictEqual(p.uid, 7);
  assert.strictEqual(p.role, 'agent');
});

test('tokens: changed, wrong-secret, expired and garbage tokens are refused', () => {
  const t = sign({ uid: 7, role: 'agent' }, 'secret', 60, 1000000);
  const [body, mac] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 1, role: 'admin', exp: 9999999999 })).toString('base64url') + '.' + mac;
  assert.strictEqual(verify(forged, 'secret'), null);
  assert.strictEqual(verify(t, 'other-secret', 1000000), null);
  assert.strictEqual(verify(t, 'secret', 1000000 + 61 * 1000), null);
  [null, undefined, '', 'abc', 'a.b.c', body + '.', '.' + mac].forEach((x) => assert.strictEqual(verify(x, 'secret'), null));
});

test('rate limiter: allows up to max, then blocks, then allows again after the window', () => {
  let now = 0;
  const l = createLimiter({ max: 3, windowMs: 1000, now: () => now });
  assert.ok(l.check('k').allowed && l.check('k').allowed && l.check('k').allowed);
  const blocked = l.check('k');
  assert.strictEqual(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.ok(l.check('other').allowed);
  now = 1500;
  assert.ok(l.check('k').allowed);
});

test('rate limiter: reset clears the count', () => {
  const l = createLimiter({ max: 1, windowMs: 60000 });
  l.check('k');
  assert.strictEqual(l.check('k').allowed, false);
  l.reset('k');
  assert.ok(l.check('k').allowed);
});

test('images: real types are detected by their first bytes', () => {
  assert.strictEqual(detectImageType(demoPng('x')).mime, 'image/png');
  assert.strictEqual(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])).mime, 'image/jpeg');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
  assert.strictEqual(detectImageType(webp).mime, 'image/webp');
});

test('images: SVG, GIF, text, scripts and tiny files are refused', () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.strictEqual(detectImageType(svg), null);
  assert.strictEqual(detectImageType(Buffer.from('GIF89a' + 'x'.repeat(20))), null);
  assert.strictEqual(detectImageType(Buffer.from('hello world, not an image')), null);
  assert.strictEqual(detectImageType(Buffer.alloc(3)), null);
  assert.strictEqual(detectImageType('string'), null);
});

test('images: base64 decoding accepts data URLs and refuses bad or oversized input', () => {
  const png = demoPng('x');
  assert.ok(decodeBase64Image('data:image/png;base64,' + png.toString('base64'), 1e6).equals(png));
  assert.ok(decodeBase64Image(png.toString('base64'), 1e6).equals(png));
  assert.throws(() => decodeBase64Image(png.toString('base64'), 100), /image_too_large/);
  assert.throws(() => decodeBase64Image('not base64 !!!', 1e6), /bad_image/);
  assert.throws(() => decodeBase64Image('', 1e6), /no_image/);
  assert.throws(() => decodeBase64Image(null, 1e6), /no_image/);
});

test('images: the hash is the same for the same photo and different for another', () => {
  assert.strictEqual(sha256(demoPng('a')), sha256(demoPng('a')));
  assert.notStrictEqual(sha256(demoPng('a')), sha256(demoPng('b')));
});
