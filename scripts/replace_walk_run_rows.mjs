/**
 * Replace the walk/run rows with the latest generated animation strips.
 *
 * Also widens the sheet from 7 to 8 columns so the run cycle can hold 8 frames.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const SHEET = "public/sprites/template-clean-row-sheet.png";
const STRIP = "art/sprite-redraw/template-walk-run-redraw.png";
const OUT = SHEET;
const CW = 96;
const CH = 148;
const OLD_W = 672;
const NEW_W = 768;
const H = 3108;

function u32(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; }
function crc32(buf) { let c = 0xffffffff; for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type); return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]); }

function readPng(path) {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const colorType = png[25];
  const bpp = colorType === 6 ? 4 : 3;
  if (png[24] !== 8 || ![2, 6].includes(colorType)) throw new Error(`Unsupported PNG ${path}`);
  let o = 8; const idat = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o); o += 4;
    const type = png.toString("ascii", o, o + 4); o += 4;
    if (type === "IDAT") idat.push(png.subarray(o, o + len));
    o += len + 4;
    if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const data = new Uint8Array(width * height * 4);
  let pos = 0, prev = new Uint8Array(stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++], left = x >= bpp ? row[x - bpp] : 0, up = prev[x] ?? 0, ul = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (filter === 1) add = left; else if (filter === 2) add = up; else if (filter === 3) add = (left + up) >> 1; else if (filter === 4) add = paeth(left, up, ul);
      row[x] = (v + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp, di = (y * width + x) * 4;
      data[di] = row[si]; data[di + 1] = row[si + 1]; data[di + 2] = row[si + 2]; data[di + 3] = colorType === 6 ? row[si + 3] : 255;
    }
    prev = row;
  }
  return { width, height, data };
}

function writePng(path, img) {
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    const row = y * (img.width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < img.width * 4; x++) raw[row + 1 + x] = img.data[y * img.width * 4 + x];
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(img.width), u32(img.height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

const idx = (img, x, y) => (y * img.width + x) * 4;
const sheet = readPng(SHEET);
const strip = readPng(STRIP);
const out = { width: NEW_W, height: H, data: new Uint8Array(NEW_W * H * 4) };

for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const si = idx(sheet, x, y), di = idx(out, x, y);
    out.data[di] = sheet.data[si];
    out.data[di + 1] = sheet.data[si + 1];
    out.data[di + 2] = sheet.data[si + 2];
    out.data[di + 3] = sheet.data[si + 3];
  }
}

for (const rowY of [CH, CH * 2]) {
  for (let y = rowY; y < rowY + CH; y++) {
    for (let x = 0; x < NEW_W; x++) out.data[idx(out, x, y) + 3] = 0;
  }
}

const mask = new Uint8Array(strip.width * strip.height);
for (let y = 0; y < strip.height; y++) {
  for (let x = 0; x < strip.width; x++) {
    const i = idx(strip, x, y);
    const r = strip.data[i], g = strip.data[i + 1], b = strip.data[i + 2], a = strip.data[i + 3];
    const green = g > 80 && g > r + 22 && g > b + 22 && g > r * 1.12 && g > b * 1.12;
    mask[y * strip.width + x] = a > 20 && !green ? 1 : 0;
  }
}

const seen = new Uint8Array(mask.length);
const comps = [];
for (let y = 0; y < strip.height; y++) {
  for (let x = 0; x < strip.width; x++) {
    const start = y * strip.width + x;
    if (!mask[start] || seen[start]) continue;
    const q = [[x, y]];
    seen[start] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const [cx, cy] = q[qi];
      area++;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1], [cx + 1, cy + 1], [cx - 1, cy + 1], [cx + 1, cy - 1], [cx - 1, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= strip.width || ny >= strip.height) continue;
        const ni = ny * strip.width + nx;
        if (mask[ni] && !seen[ni]) { seen[ni] = 1; q.push([nx, ny]); }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (area >= 900 && w >= 35 && h >= 55) comps.push({ minX, minY, maxX, maxY, w, h, area });
  }
}

const rows = [];
for (const comp of comps.sort((a, b) => (a.minY + a.maxY) - (b.minY + b.maxY) || a.minX - b.minX)) {
  const cy = (comp.minY + comp.maxY) / 2;
  let row = rows.find((r) => Math.abs(r.cy - cy) < 120);
  if (!row) { row = { cy, comps: [] }; rows.push(row); }
  row.comps.push(comp);
  row.cy = row.comps.reduce((sum, c) => sum + (c.minY + c.maxY) / 2, 0) / row.comps.length;
}
rows.sort((a, b) => a.cy - b.cy);
for (const row of rows) row.comps.sort((a, b) => a.minX - b.minX);

const walk = rows[0].comps.slice(0, 5);
walk.push(walk[0]);
const run = rows[1].comps.slice(0, 8);
if (walk.length !== 6 || run.length !== 8) throw new Error(`Expected 6 walk/8 run frames, got ${walk.length}/${run.length}`);

function copyFrame(comp, tx, ty, grounded = true, targetHeight = 88) {
  const pad = 4;
  const scale = Math.min((CW - pad * 2) / comp.w, (CH - pad * 2) / comp.h, targetHeight / comp.h, 1);
  const dw = Math.round(comp.w * scale), dh = Math.round(comp.h * scale);
  const dx = tx + Math.round((CW - dw) / 2);
  const dy = grounded ? ty + 140 - dh : ty + Math.round((CH - dh) / 2);
  for (let yy = 0; yy < dh; yy++) {
    for (let xx = 0; xx < dw; xx++) {
      const sx = comp.minX + Math.min(comp.w - 1, Math.floor(xx / scale));
      const sy = comp.minY + Math.min(comp.h - 1, Math.floor(yy / scale));
      if (!mask[sy * strip.width + sx]) continue;
      const si = idx(strip, sx, sy), di = idx(out, dx + xx, dy + yy);
      out.data[di] = strip.data[si]; out.data[di + 1] = strip.data[si + 1]; out.data[di + 2] = strip.data[si + 2]; out.data[di + 3] = 255;
    }
  }
}

walk.forEach((comp, i) => copyFrame(comp, i * CW, CH, true, 112));
run.forEach((comp, i) => copyFrame(comp, i * CW, CH * 2, true, 108));

for (let oy = 0; oy < out.height; oy += CH) {
  for (let ox = 0; ox < out.width; ox += CW) {
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        if (x >= 2 && y >= 2 && x < CW - 2 && y < CH - 2) continue;
        out.data[((oy + y) * out.width + ox + x) * 4 + 3] = 0;
      }
    }
  }
}

writePng(OUT, out);
console.log(`Replaced walk/run rows. Detected rows: ${rows.map((r) => r.comps.length).join(", ")}`);
