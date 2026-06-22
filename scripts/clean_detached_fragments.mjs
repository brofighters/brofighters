/**
 * Remove detached junk from a grid sprite sheet.
 *
 * In this template every frame's character is one connected silhouette; the only
 * disconnected blobs are artifacts (leftover ground-line/shadow residue, stray
 * specks from background removal). So per 96x128 cell we keep the largest
 * connected component and erase any *small* detached component.
 *
 * A generous size guard (only erase components well under the main body) means a
 * legitimately near-disconnected limb is never removed.
 *
 * Usage: node scripts/clean_detached_fragments.mjs <png> [out.png]
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const CW = 96, CH = 148;
const ALPHA_MIN = 40;
const FRAG_MAX_RATIO = 0.4; // only erase components smaller than 40% of the body

function readPng(path){const png=readFileSync(path);const width=png.readUInt32BE(16),height=png.readUInt32BE(20);if(png[24]!==8||png[25]!==6)throw new Error("Expected 8-bit RGBA PNG");let o=8;const idat=[];while(o<png.length){const len=png.readUInt32BE(o);o+=4;const t=png.toString("ascii",o,o+4);o+=4;if(t==="IDAT")idat.push(png.subarray(o,o+len));o+=len+4;if(t==="IEND")break;}const raw=inflateSync(Buffer.concat(idat));const stride=width*4,out=new Uint8Array(width*height*4);let pos=0,prev=new Uint8Array(stride);const pa=(a,b,c)=>{const p=a+b-c,A=Math.abs(p-a),B=Math.abs(p-b),C=Math.abs(p-c);return A<=B&&A<=C?a:B<=C?b:c;};for(let y=0;y<height;y++){const f=raw[pos++];const row=new Uint8Array(stride);for(let x=0;x<stride;x++){const v=raw[pos++];const l=x>=4?row[x-4]:0,u=prev[x]??0,ul=x>=4?prev[x-4]:0;let add=0;if(f===1)add=l;else if(f===2)add=u;else if(f===3)add=(l+u)>>1;else if(f===4)add=pa(l,u,ul);row[x]=(v+add)&255;}out.set(row,y*stride);prev=row;}return{width,height,data:out};}
function u32(v){const b=Buffer.alloc(4);b.writeUInt32BE(v);return b;}
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;}
function chunk(t,d){const tb=Buffer.from(t);return Buffer.concat([u32(d.length),tb,d,u32(crc32(Buffer.concat([tb,d])))]);}
function writePng(path,img){const raw=Buffer.alloc((img.width*4+1)*img.height);for(let y=0;y<img.height;y++){const row=y*(img.width*4+1);raw[row]=0;for(let x=0;x<img.width*4;x++)raw[row+1+x]=img.data[y*img.width*4+x];}writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",Buffer.concat([u32(img.width),u32(img.height),Buffer.from([8,6,0,0,0])])),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]));}

const inPath = process.argv[2] ?? "public/sprites/template-clean-row-sheet.png";
const outPath = process.argv[3] ?? inPath;
const img = readPng(inPath);
const { width, height, data } = img;
const op = (x, y) => data[(y * width + x) * 4 + 3] >= ALPHA_MIN;
const cols = Math.floor(width / CW), rows = Math.floor(height / CH);

let framesCleaned = 0, fragsRemoved = 0, pxCleared = 0;

for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const ox = c * CW, oy = r * CH;
  const lab = new Int32Array(CW * CH);
  const sizes = [0];
  let nComp = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (!op(ox + x, oy + y) || lab[y * CW + x]) continue;
    nComp++; sizes[nComp] = 0;
    const st = [[x, y]]; lab[y * CW + x] = nComp;
    while (st.length) {
      const [cx, cy] = st.pop(); sizes[nComp]++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
        if (op(ox + nx, oy + ny) && !lab[ny * CW + nx]) { lab[ny * CW + nx] = nComp; st.push([nx, ny]); }
      }
    }
  }
  if (nComp <= 1) continue;
  let big = 1; for (let i = 1; i <= nComp; i++) if (sizes[i] > sizes[big]) big = i;
  const threshold = sizes[big] * FRAG_MAX_RATIO;
  let cleanedHere = false;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const l = lab[y * CW + x];
    if (l && l !== big && sizes[l] < threshold) {
      data[(oy + y) * width * 4 + (ox + x) * 4 + 3] = 0;
      pxCleared++; cleanedHere = true;
    }
  }
  if (cleanedHere) { framesCleaned++; fragsRemoved += nComp - 1; }
}

writePng(outPath, img);
console.log(`Cleaned ${inPath} -> ${outPath}`);
console.log(`Frames touched: ${framesCleaned}, detached blobs removed: ${fragsRemoved}, px cleared: ${pxCleared}`);
