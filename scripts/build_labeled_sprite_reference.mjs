/**
 * Build a human-reference version of the template row sheet.
 *
 * The game sheet remains unchanged. This SVG adds a label margin on the left and
 * embeds the same PNG sheet at full size so sprite pixels stay exact.
 */
import { readFileSync, writeFileSync } from "node:fs";

const layout = JSON.parse(
  readFileSync("art/sheets/template/template-clean-row-sheet.layout.json", "utf8"),
);

const labelWidth = 220;
const sheetPath = "template-clean-row-sheet.png";
const outPath = "public/sprites/template-clean-row-sheet-labeled.svg";

const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const labels = layout.rowOrder
  .map((row, index) => {
    const y = index * layout.frameHeight + layout.frameHeight / 2;
    return `<text x="${labelWidth - 14}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(row)}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width + labelWidth}" height="${layout.height}" viewBox="0 0 ${layout.width + labelWidth} ${layout.height}">
  <style>
    text {
      font-family: Inter, Segoe UI, Arial, sans-serif;
      font-size: 20px;
      font-weight: 700;
      fill: #e8eefc;
    }
  </style>
  ${labels}
  <image href="${sheetPath}" x="${labelWidth}" y="0" width="${layout.width}" height="${layout.height}" style="image-rendering: pixelated"/>
</svg>
`;

writeFileSync(outPath, svg);
console.log(`Wrote ${outPath}`);
