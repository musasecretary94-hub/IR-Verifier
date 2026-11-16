// Checks uploaded photos. We never trust the file name or the type the browser says:
// we look at the first bytes of the file itself.
const crypto = require('node:crypto');

function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null; // SVG, GIF, PDF and everything else are refused
}

// Accepts "data:image/png;base64,AAAA..." or plain base64. Returns a Buffer.
function decodeBase64Image(input, maxBytes) {
  if (typeof input !== 'string' || input.length === 0) throw new Error('no_image');
  const comma = input.startsWith('data:') ? input.indexOf(',') : -1;
  const data = comma >= 0 ? input.slice(comma + 1) : input;
  if (data.length > Math.ceil((maxBytes * 4) / 3) + 8) throw new Error('image_too_large');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('bad_image');
  const buf = Buffer.from(data, 'base64');
  if (buf.length > maxBytes) throw new Error('image_too_large');
  return buf;
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

module.exports = { detectImageType, decodeBase64Image, sha256 };
