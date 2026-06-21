/**
 * Remove the LF2 template "ground line" marks from a sprite sheet.
 *
 * The source template draws a thin black baseline bar a few pixels under each
 * pose's feet. It is an ISOLATED thin horizontal dark bar: empty (transparent)
 * rows directly above AND below it. Character outlines never look like that
 * (they always have gray fill on at least one side), so we can target the bars
 * precisely without damaging the art.
 *
 * Usage: node scripts/clean_baseline_lines.mjs <in.png> [out.png]
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const MIN_RUN = 36; // min contiguous dark px to be considered a "line"
const DARK_LUM = 80; // pixel counts as dark below this luminance
const ALPHA_MIN = 40; // pixel counts as opaque at/above this alpha
const ABOVE_EMPTY = 3; // transparent rows required directly above the bar
const MAX_BAND = 4; // a baseline bar is at most this many px tall

function readPng(path) {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6) throw new Error("Expected 8-bit RGBA PNG");
  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const len = png.readUInt32BE(offset); offset += 4;
    const type = png.toString("ascii", offset, offset + 4); offset += 4;
    if (type === "IDAT") idat.push(png.subarray(offset, offset + len));
    offset += len + 4;
    if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = new Uint8Array(width * height * 4);
  let pos = 0; let prev = new Uint8Array(stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]; const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++]; const left = x >= 4 ? row[x - 4] : 0; const up = prev[x] ?? 0; const ul = x >= 4 ? prev[x - 4] : 0;
      let add = 0;
      if (filter === 1) add = left; else if (filter === 2) add = up; else if (filter === 3) add = (left + up) >> 1; else if (filter === 4) add = paeth(left, up, ul);
      row[x] = (v + add) & 255;
    }
    out.set(row, y * stride); prev = row;
  }
  return { width, height, data: out };
}

function u32(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; }
function crc32(buf) { let c = 0xffffffff; for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type); return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]); }
function writePng(path, img) {
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    const row = y * (img.width * 4 + 1); raw[row] = 0;
    for (let x = 0; x < img.width * 4; x++) raw[row + 1 + x] = img.data[y * img.width * 4 + x];
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(img.width), u32(img.height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

const inPath = process.argv[2] ?? "public/sprites/template-clean-row-sheet.png";
const outPath = process.argv[3] ?? inPath;
const img = readPng(inPath);
const { width, height, data } = img;

const idx = (x, y) => (y * width + x) * 4;
const opaque = (x, y) => data[idx(x, y) + 3] >= ALPHA_MIN;
const dark = (x, y) => {
  const i = idx(x, y);
  if (data[i + 3] < ALPHA_MIN) return false;
  return (data[i] + data[i + 1] + data[i + 2]) / 3 < DARK_LUM;
};

// Find maximal contiguous dark runs in a row.
function darkRuns(y) {
  const runs = [];
  let x = 0;
  while (x < width) {
    if (dark(x, y)) {
      const start = x;
      while (x < width && dark(x, y)) x++;
      if (x - start >= MIN_RUN) runs.push([start, x - 1]);
    } else x++;
  }
  return runs;
}

function spanOpaqueCount(x0, x1, y) {
  if (y < 0 || y >= height) return 0;
  let n = 0;
  for (let x = x0; x <= x1; x++) if (opaque(x, y)) n++;
  return n;
}

let barsRemoved = 0;
let pixelsCleared = 0;
const cleared = new Set(); // avoid re-seeding rows already wiped

for (let y = 0; y < height; y++) {
  for (const [x0, x1] of darkRuns(y)) {
    if (cleared.has(`${y}:${x0}`)) continue;
    const span = x1 - x0 + 1;
    const tol = Math.max(2, Math.floor(span * 0.06));

    // The bar must be detached from the character above it. A few stray pixels
    // (a dangling foot/hand over a wide ground bar) are fine; a solid body above
    // is not — that would be a real outline, not a ground line.
    let aboveOp = 0;
    for (let k = 1; k <= ABOVE_EMPTY; k++) aboveOp += spanOpaqueCount(x0, x1, y - k);
    if (aboveOp > span * 0.45) continue;

    // Grow the band downward while rows stay wide+dark over the span.
    let bottom = y;
    while (bottom + 1 < height && bottom - y + 1 < MAX_BAND) {
      let darkN = 0;
      for (let x = x0; x <= x1; x++) if (dark(x, bottom + 1)) darkN++;
      if (darkN >= span * 0.5) bottom++;
      else break;
    }

    // Require transparent row directly below the band (fully isolated bar).
    if (spanOpaqueCount(x0, x1, bottom + 1) > tol) continue;

    // Erase the bar.
    for (let yy = y; yy <= bottom; yy++) {
      for (let x = x0; x <= x1; x++) {
        if (dark(x, yy)) { data[idx(x, yy) + 3] = 0; pixelsCleared++; }
      }
      cleared.add(`${yy}:${x0}`);
    }
    barsRemoved++;
  }
}

writePng(outPath, img);
console.log(`Cleaned ${inPath} -> ${outPath}`);
console.log(`Removed ${barsRemoved} baseline bars (${pixelsCleared} px set transparent).`);
