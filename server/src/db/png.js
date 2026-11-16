// Makes a small unique PNG image (a table-like picture) with no extra libraries.
// Only used to fill the demo with placeholder "photos".
const zlib = require('node:zlib');
const crypto = require('node:crypto');

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function demoPng(seedText, w = 360, h = 240) {
  const bits = crypto.createHash('sha256').update(seedText).digest();
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  const set = (x, y, v) => { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = v[0]; raw[o + 1] = v[1]; raw[o + 2] = v[2]; };
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0; // filter byte
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const line = y % 24 === 0 || x % 90 === 0 || y === h - 1 || x === w - 1;
    set(x, y, line ? [60, 60, 70] : [250, 250, 245]);
  }
  for (let i = 0; i < 64; i++) { // a unique pattern of squares from the seed
    if ((bits[i >> 1] >> ((i & 1) * 4)) & 1) {
      const bx = 8 + (i % 8) * 8; const by = 8 + Math.floor(i / 8) * 8;
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) set(bx + x, by + y, [20, 90, 160]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { demoPng };
