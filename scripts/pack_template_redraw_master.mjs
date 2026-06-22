/**
 * Pack the generated anime-SD redraw master into the game's canonical grid.
 *
 * Input: art/sprite-redraw/template-full-redraw-master.png
 * Output: public/sprites/template-clean-row-sheet.png
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const INPUT = "art/sprite-redraw/template-full-redraw-master.png";
const OUTPUT = "public/sprites/template-clean-row-sheet.png";
const layout = JSON.parse(readFileSync("art/sheets/template/template-clean-row-sheet.layout.json", "utf8"));

function u32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v);
  return b;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
}

function readPng(path) {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  if (png[24] !== 8 || ![2, 6].includes(colorType)) throw new Error("Expected 8-bit RGB/RGBA PNG");
  const bpp = colorType === 6 ? 4 : 3;
  let o = 8;
  const idat = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    o += 4;
    const type = png.toString("ascii", o, o + 4);
    o += 4;
    if (type === "IDAT") idat.push(png.subarray(o, o + len));
    o += len + 4;
    if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rgbaStride = width * 4;
  const decoded = new Uint8Array(width * height * bpp);
  let pos = 0;
  let prev = new Uint8Array(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++];
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev[x] ?? 0;
      const ul = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) add = paeth(left, up, ul);
      row[x] = (v + add) & 255;
    }
    decoded.set(row, y * stride);
    prev = row;
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * bpp;
      const di = (y * width + x) * 4;
      data[di] = decoded[si];
      data[di + 1] = decoded[si + 1];
      data[di + 2] = decoded[si + 2];
      data[di + 3] = colorType === 6 ? decoded[si + 3] : 255;
    }
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

function idx(img, x, y) {
  return (y * img.width + x) * 4;
}

const src = readPng(INPUT);
if (process.argv.includes("--sample")) {
  const points = [[0, 0], [20, 20], [src.width / 2 | 0, 20], [src.width - 20, src.height / 2 | 0], [src.width / 2 | 0, src.height / 2 | 0]];
  console.log(points.map(([x, y]) => {
    const i = idx(src, x, y);
    return `${x},${y}=${src.data[i]},${src.data[i + 1]},${src.data[i + 2]},${src.data[i + 3]}`;
  }).join(" "));
  process.exit(0);
}
const mask = new Uint8Array(src.width * src.height);

for (let y = 0; y < src.height; y++) {
  for (let x = 0; x < src.width; x++) {
    const i = idx(src, x, y);
    const r = src.data[i], g = src.data[i + 1], b = src.data[i + 2], a = src.data[i + 3];
    const green = g > 80 && g > r + 22 && g > b + 22 && g > r * 1.12 && g > b * 1.12;
    mask[y * src.width + x] = a > 20 && !green ? 1 : 0;
  }
}

// Connected components. Small detached dust/spark bits are ignored; this keeps
// the sheet character-only, with no baked VFX or stray pixels.
const seen = new Uint8Array(mask.length);
const comps = [];
for (let y = 0; y < src.height; y++) {
  for (let x = 0; x < src.width; x++) {
    const start = y * src.width + x;
    if (!mask[start] || seen[start]) continue;
    const q = [[x, y]];
    seen[start] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const [cx, cy] = q[qi];
      area++;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1], [cx + 1, cy + 1], [cx - 1, cy + 1], [cx + 1, cy - 1], [cx - 1, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= src.width || ny >= src.height) continue;
        const ni = ny * src.width + nx;
        if (mask[ni] && !seen[ni]) {
          seen[ni] = 1;
          q.push([nx, ny]);
        }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (area >= 900 && w >= 20 && h >= 30) comps.push({ minX, minY, maxX, maxY, w, h, area });
  }
}

// Cluster into generated rows by vertical center.
const rows = [];
for (const comp of comps.sort((a, b) => (a.minY + a.maxY) - (b.minY + b.maxY) || a.minX - b.minX)) {
  const cy = (comp.minY + comp.maxY) / 2;
  let row = rows.find((r) => Math.abs(r.cy - cy) < 70);
  if (!row) {
    row = { cy, comps: [] };
    rows.push(row);
  }
  row.comps.push(comp);
  row.cy = row.comps.reduce((sum, c) => sum + (c.minY + c.maxY) / 2, 0) / row.comps.length;
}
rows.sort((a, b) => a.cy - b.cy);
for (const row of rows) row.comps.sort((a, b) => a.minX - b.minX);
console.log(rows.map((r, i) => `${i + 1}:${r.comps.length}@${Math.round(r.cy)}`).join(" "));

const sourceFrames = rows.flatMap((row) => row.comps);
const targetFrames = [];
for (const rowName of layout.rowOrder) {
  const frames = Object.entries(layout.frames)
    .filter(([, f]) => f.row === rowName)
    .sort(([, a], [, b]) => a.rect[0] - b.rect[0]);
  targetFrames.push(...frames);
}

if (sourceFrames.length !== targetFrames.length) {
  console.log(`Frame count mismatch: source ${sourceFrames.length}, target ${targetFrames.length}; filling missing slots from nearby poses.`);
}

const out = { width: layout.width, height: layout.height, data: new Uint8Array(layout.width * layout.height * 4) };

function setOut(x, y, rgba) {
  if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
  const i = (y * out.width + x) * 4;
  out.data[i] = rgba[0];
  out.data[i + 1] = rgba[1];
  out.data[i + 2] = rgba[2];
  out.data[i + 3] = rgba[3];
}

for (let n = 0; n < targetFrames.length; n++) {
  const comp = sourceFrames[Math.min(n, sourceFrames.length - 1)];
  const [id, target] = targetFrames[n];
  const [tx, ty, tw, th] = target.rect;
  const pad = 4;
  const srcW = comp.w;
  const srcH = comp.h;
  const scale = Math.min((tw - pad * 2) / srcW, (th - pad * 2) / srcH, 1);
  const dw = Math.max(1, Math.round(srcW * scale));
  const dh = Math.max(1, Math.round(srcH * scale));
  const dx = tx + Math.round((tw - dw) / 2);
  const isGrounded = !/jump|dashJump|airHit/i.test(id) && !/knockdown|ko|Ground|Dead|getUp0/i.test(id);
  const baselineY = ty + (isGrounded ? 140 : Math.round((th + dh) / 2));
  const dy = isGrounded ? baselineY - dh : ty + Math.round((th - dh) / 2);

  for (let yy = 0; yy < dh; yy++) {
    for (let xx = 0; xx < dw; xx++) {
      const sx = comp.minX + Math.min(srcW - 1, Math.floor(xx / scale));
      const sy = comp.minY + Math.min(srcH - 1, Math.floor(yy / scale));
      if (!mask[sy * src.width + sx]) continue;
      const si = idx(src, sx, sy);
      setOut(dx + xx, dy + yy, [src.data[si], src.data[si + 1], src.data[si + 2], 255]);
    }
  }
}

// Hard transparent guard on every cell edge.
for (let oy = 0; oy < out.height; oy += layout.frameHeight) {
  for (let ox = 0; ox < out.width; ox += layout.frameWidth) {
    for (let y = 0; y < layout.frameHeight; y++) {
      for (let x = 0; x < layout.frameWidth; x++) {
        if (x >= 2 && y >= 2 && x < layout.frameWidth - 2 && y < layout.frameHeight - 2) continue;
        out.data[((oy + y) * out.width + ox + x) * 4 + 3] = 0;
      }
    }
  }
}

writePng(OUTPUT, out);
console.log(`Packed ${sourceFrames.length} sprites into ${OUTPUT}`);
console.log(`Detected ${comps.length} character-sized components across ${rows.length} rows`);
