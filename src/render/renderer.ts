/**
 * Canvas renderer. It READS simulation state and draws it; it never mutates the
 * sim. It may interpolate fighter transforms between ticks for smoothness.
 *
 * 2.5D projection: x -> screen x, depth -> a vertical floor band (near = lower
 * on screen, drawn in front), height -> lifts the fighter off its floor line.
 * Draw order is sorted by depth so greater-depth (far) fighters render behind.
 *
 * Until real sprite sheets exist, fighters are coloured placeholder rectangles.
 */

import { ARENA, MAX_HEALTH } from "../sim/constants";
import type { Box, CharacterDef } from "../sim/characters/types";
import type { Fighter, GameState } from "../sim/types";

export interface RenderTransform {
  x: number;
  depth: number;
  height: number;
  facing: number;
}

export interface PlayerView {
  id: number;
  label: string;
  color: string;
}

export interface RenderView {
  /** interpolated transforms keyed by fighter id (falls back to live state) */
  interp: Map<number, RenderTransform>;
  players: PlayerView[];
  debug: boolean;
}

const FLOOR_Y = 360;
const DEPTH_Y = 0.62; // screen px of vertical drop per unit of depth
const W = 960;
const H = 540;

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  render(state: GameState, view: RenderView): void {
    const ctx = this.ctx;
    this.drawBackground(ctx);

    // Sort by depth ascending: far (small depth) drawn first/behind.
    const order = [...state.fighters].sort((a, b) => a.depth - b.depth);
    for (const f of order) {
      const t = view.interp.get(f.id) ?? f;
      const char = state.characters[f.characterId];
      this.drawFighter(ctx, f, char, t, this.colorFor(view, f.id));
      if (view.debug) this.drawBoxes(ctx, f, char, t);
    }

    this.drawHud(ctx, state, view);
    if (state.phase === "roundOver") this.drawRoundOver(ctx, state, view);
  }

  // --- projection ---------------------------------------------------------

  private floorScreenY(depth: number): number {
    return FLOOR_Y + depth * DEPTH_Y;
  }

  private depthScale(depth: number): number {
    const t = (depth - ARENA.depthMin) / (ARENA.depthMax - ARENA.depthMin);
    return 0.85 + t * 0.3;
  }

  private project(t: RenderTransform): { sx: number; feetY: number; scale: number } {
    return {
      sx: t.x,
      feetY: this.floorScreenY(t.depth) - t.height,
      scale: this.depthScale(t.depth),
    };
  }

  // --- drawing ------------------------------------------------------------

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, W, H);
    // Sky / wall.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#2a2a3c");
    sky.addColorStop(1, "#1b1b27");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Floor band between far and near depth lines.
    const farY = this.floorScreenY(ARENA.depthMin);
    const nearY = this.floorScreenY(ARENA.depthMax);
    ctx.fillStyle = "#2d2d40";
    ctx.fillRect(0, farY, W, nearY - farY + 60);
    ctx.strokeStyle = "#3c3c54";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, farY);
    ctx.lineTo(W, farY);
    ctx.stroke();

    // Side walls of the play area.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(ARENA.xMin, 0);
    ctx.lineTo(ARENA.xMin, H);
    ctx.moveTo(ARENA.xMax, 0);
    ctx.lineTo(ARENA.xMax, H);
    ctx.stroke();
  }

  private drawFighter(
    ctx: CanvasRenderingContext2D,
    f: Fighter,
    char: CharacterDef,
    t: RenderTransform,
    color: string,
  ): void {
    const { sx, feetY, scale } = this.project(t);
    const bodyW = char.body.w * 2 * scale;
    const bodyH = char.body.h * 2 * scale;

    // Shadow on the floor (tracks x/depth, not height).
    const floorY = this.floorScreenY(t.depth);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(sx, floorY, bodyW * 0.55, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const top = feetY - bodyH;
    const left = sx - bodyW / 2;

    // Knocked-down fighters lie flatter and dimmer.
    const downed = f.state === "knockdown";
    ctx.save();
    if (!f.alive) ctx.globalAlpha = 0.55;

    // Body.
    ctx.fillStyle = color;
    if (downed) {
      ctx.fillRect(sx - bodyH / 2, feetY - bodyW, bodyH, bodyW);
    } else {
      this.roundRect(ctx, left, top, bodyW, bodyH, 6 * scale);
      ctx.fill();

      // State tint flash on attack/hit so the action reads clearly.
      const flash = STATE_FLASH[f.state];
      if (flash) {
        ctx.fillStyle = flash;
        this.roundRect(ctx, left, top, bodyW, bodyH, 6 * scale);
        ctx.fill();
      }

      // Facing marker (a "head" + eye on the facing side).
      ctx.fillStyle = "#1a1a22";
      const headR = bodyW * 0.34;
      ctx.beginPath();
      ctx.arc(sx, top + headR, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(sx + t.facing * headR * 0.45, top + headR, headR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBoxes(
    ctx: CanvasRenderingContext2D,
    f: Fighter,
    char: CharacterDef,
    t: RenderTransform,
  ): void {
    const def = char.states[f.state];
    const frameId = def?.frames[Math.min(f.frameIndex, def.frames.length - 1)];
    const frame = char.frames.find((fr) => fr.id === frameId);
    if (!frame) return;

    const hurt = frame.hurtboxes?.length
      ? frame.hurtboxes
      : [{ x: 0, z: 0, h: char.body.h, w: char.body.w, d: char.body.d, hh: char.body.h }];
    for (const b of hurt) this.strokeBox(ctx, t, b, "rgba(80,200,120,0.7)");
    for (const b of frame.hitboxes ?? []) this.strokeBox(ctx, t, b as Box, "rgba(230,70,70,0.9)");
  }

  private strokeBox(
    ctx: CanvasRenderingContext2D,
    t: RenderTransform,
    b: Box,
    color: string,
  ): void {
    const cx = t.x + t.facing * b.x;
    const feetY = this.floorScreenY(t.depth) - t.height;
    const cy = feetY - b.h;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - b.w, cy - b.hh, b.w * 2, b.hh * 2);
  }

  private drawHud(ctx: CanvasRenderingContext2D, state: GameState, view: RenderView): void {
    const n = state.fighters.length;
    const barW = Math.min(220, (W - 40 - (n - 1) * 16) / n);
    const gap = 16;
    const totalW = n * barW + (n - 1) * gap;
    let x = (W - totalW) / 2;
    const y = 18;

    for (const f of state.fighters) {
      const color = this.colorFor(view, f.id);
      const label = view.players.find((p) => p.id === f.id)?.label ?? `P${f.id}`;
      const pct = Math.max(0, f.health) / MAX_HEALTH;

      ctx.fillStyle = "#00000066";
      ctx.fillRect(x - 2, y - 2, barW + 4, 22);
      ctx.fillStyle = "#3a3a4a";
      ctx.fillRect(x, y, barW, 18);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW * pct, 18);
      ctx.strokeStyle = "#0008";
      ctx.strokeRect(x, y, barW, 18);

      ctx.fillStyle = "#e6e6f0";
      ctx.font = "12px ui-monospace, monospace";
      ctx.textBaseline = "top";
      ctx.fillText(`${label}  ${Math.max(0, Math.ceil(f.health))}`, x + 4, y + 24);

      x += barW + gap;
    }
  }

  private drawRoundOver(ctx: CanvasRenderingContext2D, state: GameState, view: RenderView): void {
    ctx.fillStyle = "#0009";
    ctx.fillRect(0, H / 2 - 60, W, 120);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let msg = "DRAW";
    if (state.winnerId != null) {
      const label = view.players.find((p) => p.id === state.winnerId)?.label ?? `P${state.winnerId}`;
      msg = `${label} WINS`;
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 42px ui-monospace, monospace";
    ctx.fillText(msg, W / 2, H / 2 - 8);

    ctx.fillStyle = "#aaa";
    ctx.font = "14px ui-monospace, monospace";
    const secs = Math.ceil(state.resetTicks / 60);
    ctx.fillText(`next round in ${secs}…`, W / 2, H / 2 + 30);
    ctx.textAlign = "left";
  }

  // --- helpers ------------------------------------------------------------

  private colorFor(view: RenderView, id: number): string {
    return view.players.find((p) => p.id === id)?.color ?? "#9aa";
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

const STATE_FLASH: Record<string, string> = {
  punch1: "rgba(255,255,255,0.18)",
  punch2: "rgba(255,255,255,0.22)",
  punch3: "rgba(255,230,120,0.30)",
  special: "rgba(120,200,255,0.40)",
  hit: "rgba(255,60,60,0.45)",
  block: "rgba(80,160,255,0.35)",
};
