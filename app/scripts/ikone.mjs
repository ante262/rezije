// Generira PNG ikone (pozadina + tri stupca) bez vanjskih alata.
import fs from 'node:fs';
import zlib from 'node:zlib';
function png(n) {
  const px = Buffer.alloc(n * n * 4);
  const set = (x, y, [r, g, b]) => { const i = (y * n + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  const s = n / 64;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) set(x, y, [0x2a, 0x78, 0xd6]);
  for (const [x0, y0, w, h] of [[14, 34, 8, 16], [28, 24, 8, 26], [42, 14, 8, 36]])
    for (let y = Math.round(y0 * s); y < Math.round((y0 + h) * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round((x0 + w) * s); x++) set(x, y, [255, 255, 255]);
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) { raw[y * (n * 4 + 1)] = 0; px.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4); }
  const crcT = Array.from({ length: 256 }, (_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const n of [192, 512]) fs.writeFileSync(`public/pwa-${n}.png`, png(n));
fs.writeFileSync('public/apple-touch-icon.png', png(180));
