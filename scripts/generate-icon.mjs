// Reproducible 512px calendar icon using only Node built-ins.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const size = 512;
const pixels = Buffer.alloc((size * 4 + 1) * size);
const rounded = (x, y, left, top, width, height, radius) => {
  const dx = Math.max(left + radius - x, 0, x - (left + width - radius));
  const dy = Math.max(top + radius - y, 0, y - (top + height - radius));
  return x >= left && x <= left + width && y >= top && y <= top + height && dx * dx + dy * dy <= radius * radius;
};
const line = (x, y, ax, ay, bx, by, radius) => {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return (x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2 <= radius ** 2;
};
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0, 0];
    for (const oy of [0.25, 0.75])
      for (const ox of [0.25, 0.75]) {
        const sx = x + ox,
          sy = y + oy;
        let c = [0, 0, 0, 0];
        if (rounded(sx, sy, 0, 0, 512, 512, 112)) c = [20, 33, 56, 255];
        if (rounded(sx, sy, 100, 109, 312, 310, 34)) c = [235, 247, 247, 255];
        if (rounded(sx, sy, 100, 109, 312, 93, 28)) c = [20, 176, 143, 255];
        if (rounded(sx, sy, 171, 80, 22, 70, 11) || rounded(sx, sy, 319, 80, 22, 70, 11)) c = [20, 33, 56, 255];
        if (line(sx, sy, 167, 298, 230, 354, 14) || line(sx, sy, 230, 354, 344, 245, 14)) c = [15, 140, 112, 255];
        c.forEach((v, i) => {
          sum[i] += v;
        });
      }
    sum.forEach((v, i) => {
      pixels[y * (size * 4 + 1) + 1 + x * 4 + i] = Math.round(v / 4);
    });
  }
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
writeFileSync(
  new URL("../assets/icon.png", import.meta.url),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
