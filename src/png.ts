// A sprite as a PNG, so Gary can look at what he's drawn (api/gary.ts, draw()).
// Pure and DOM-free, for the server; white stands in for transparent.

import { deflateSync } from "node:zlib";

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

export function spritePng(s: { rows: string[]; palette: Record<string, string> }, scale = 8): Buffer {
  const w = Math.max(...s.rows.map((r) => r.length)) * scale, h = s.rows.length * scale;
  const raw = Buffer.alloc((w * 4 + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const hex = s.palette[s.rows[Math.floor(y / scale)][Math.floor(x / scale)] ?? "."];
      if (!hex) continue;
      const c = parseInt(hex.slice(1), 16), o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = c >> 16; raw[o + 1] = (c >> 8) & 255; raw[o + 2] = c & 255;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
