/**
 * Generate a correct visual preview of the row sheet from its layout JSON.
 * Each cell shows ONE sprite drawn over a checkerboard that sits BEHIND it
 * (the old generated preview layered the checker on top and used stale
 * dimensions, which made sprites look semi-transparent and clipped).
 *
 * Usage: node scripts/build_preview.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const layout = JSON.parse(
  readFileSync("art/sheets/template/template-clean-row-sheet.layout.json", "utf8"),
);
const SHEET = "./template-clean-row-sheet.png";
const FW = layout.frameWidth, FH = layout.frameHeight;
const SW = layout.width, SH = layout.height;

// group frame ids by row, in sheet order
const byRow = new Map();
for (const [id, f] of Object.entries(layout.frames)) {
  if (!byRow.has(f.row)) byRow.set(f.row, []);
  byRow.get(f.row).push({ id, ...f });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let sections = "";
for (const rowName of layout.rowOrder) {
  const frames = (byRow.get(rowName) ?? []).slice().sort((a, b) => a.rect[0] - b.rect[0]);
  const cells = frames.map((f) => {
    const [x, y] = f.rect;
    return `<figure><div class="cell"><div class="spr" style="background-position:-${x}px -${y}px"></div></div><figcaption>${esc(f.id)}<small>from ${esc(f.source)}</small></figcaption></figure>`;
  }).join("");
  sections += `<h2>${esc(rowName)}</h2><div class="row">${cells}</div>`;
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Template Character Clean Row Sheet</title>
<style>
  body { margin:24px; background:#151923; color:#e8eefc; font-family:system-ui,sans-serif; }
  h1 { margin:0 0 4px; } p { color:#aeb9cc; margin:0 0 8px; }
  h2 { margin:22px 0 8px; font-size:14px; color:#d8ecfb; }
  .row { display:flex; flex-wrap:wrap; gap:10px; }
  figure { margin:0; width:${FW}px; }
  /* checkerboard sits on the CELL (behind); the sprite renders on top of it */
  .cell {
    width:${FW}px; height:${FH}px;
    background-color:#1b2230;
    background-image:
      linear-gradient(45deg,#273041 25%,transparent 25%),
      linear-gradient(-45deg,#273041 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#273041 75%),
      linear-gradient(-45deg,transparent 75%,#273041 75%);
    background-size:16px 16px; background-position:0 0,0 8px,8px -8px,-8px 0;
  }
  .spr {
    width:${FW}px; height:${FH}px; image-rendering:pixelated;
    background-image:url("${SHEET}"); background-size:${SW}px ${SH}px; background-repeat:no-repeat;
  }
  figcaption { margin-top:4px; font-size:10px; color:#aeb9cc; }
  small { display:block; color:#6f7b91; }
</style></head>
<body>
<h1>Template Character Clean Row Sheet</h1>
<p>${FW}x${FH} cells (${FH - 128}px transparent headroom on top). Sheet ${SW}x${SH}.</p>
${sections}
</body></html>
`;
writeFileSync("public/sprites/template-clean-row-preview.html", html);
console.log("Wrote public/sprites/template-clean-row-preview.html");
