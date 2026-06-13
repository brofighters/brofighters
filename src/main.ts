/**
 * Client entry point. Owns the fixed-timestep loop and the sim <-> render <->
 * input wiring. The simulation advances at a FIXED 60 Hz independent of render
 * framerate; the renderer interpolates between ticks for smoothness.
 *
 * Flow: a bare "join" screen (the character-select stub — one character for
 * now) -> a match -> round ends at health 0 -> auto-reset -> repeat.
 */

import {
  CHARACTER_LIST,
  CHARACTERS,
  TICK_DT,
  createGameState,
  defaultSpawns,
  resetRound,
  step,
  type GameState,
  type SpawnConfig,
} from "./sim/index";
import { InputManager, type PlayerSource } from "./input/inputManager";
import { Renderer, type RenderTransform, type PlayerView } from "./render/renderer";

const PLAYER_COLORS = [
  "#e85d5d",
  "#5da9e8",
  "#6fd06f",
  "#e8c45d",
  "#c47de8",
  "#5de8c4",
  "#e88a4d",
  "#9d9de8",
  "#e85da9",
  "#a0d04d",
];

interface RosterEntry {
  source: PlayerSource;
  characterId: string;
  color: string;
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputManager();

let mode: "select" | "play" = "select";
let roster: RosterEntry[] = [];
let spawns: SpawnConfig[] = [];
let state: GameState | null = null;
let debug = false;

// Interpolation snapshots (previous tick transforms).
let prevTransforms = new Map<number, RenderTransform>();

window.addEventListener("keydown", (e) => {
  if (e.code === "F1" || e.code === "Backquote") debug = !debug;
  if (e.code === "Escape" && mode === "play") backToSelect();
});

// --- join / character select stub -----------------------------------------

function joinedView(): PlayerView[] {
  return roster.map((r) => ({ id: r.source.id, label: r.source.label, color: r.color }));
}

function updateSelect(): void {
  const available = input.listPlayers();

  // A source taps jump (rising edge) to join; taps block to leave.
  for (const src of available) {
    const cur = src.sample();
    const prev = selectPrev.get(src.id);
    const joined = roster.find((r) => r.source.id === src.id);
    if (cur.jump && !prev?.jump && !joined) {
      roster.push({
        source: src,
        characterId: CHARACTER_LIST[0].id,
        color: PLAYER_COLORS[roster.length % PLAYER_COLORS.length],
      });
    }
    if (cur.block && !prev?.block && joined) {
      roster = roster.filter((r) => r.source.id !== src.id);
    }
    selectPrev.set(src.id, cur);
  }
  // Drop roster entries whose gamepad vanished.
  const ids = new Set(available.map((s) => s.id));
  roster = roster.filter((r) => ids.has(r.source.id));

  // Any joined player tapping punch starts the match (needs >= 2 fighters).
  if (roster.length >= 2) {
    for (const r of roster) {
      const cur = r.source.sample();
      const prev = startPrev.get(r.source.id);
      if (cur.punch && !prev?.punch) startMatch();
      startPrev.set(r.source.id, cur);
    }
  }

  drawSelect(available);
}

const selectPrev = new Map<number, ReturnType<PlayerSource["sample"]>>();
const startPrev = new Map<number, ReturnType<PlayerSource["sample"]>>();

function drawSelect(available: PlayerSource[]): void {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#16161f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e6e6f0";
  ctx.textAlign = "center";

  ctx.font = "bold 34px ui-monospace, monospace";
  ctx.fillText("BRO FIGHTERS", canvas.width / 2, 70);
  ctx.font = "14px ui-monospace, monospace";
  ctx.fillStyle = "#9a9ab0";
  ctx.fillText("JUMP to join · BLOCK to leave · PUNCH to start (2+ players)", canvas.width / 2, 104);

  let y = 170;
  ctx.font = "16px ui-monospace, monospace";
  for (const src of available) {
    const entry = roster.find((r) => r.source.id === src.id);
    ctx.fillStyle = entry ? entry.color : "#55556a";
    ctx.fillText(
      `${entry ? "● JOINED" : "○ idle  "}   ${src.label}` +
        (entry ? `   —   ${CHARACTERS[entry.characterId].name}` : ""),
      canvas.width / 2,
      y,
    );
    y += 30;
  }

  ctx.fillStyle = "#6a6a80";
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillText(`${roster.length} joined`, canvas.width / 2, y + 20);
  ctx.textAlign = "left";
}

function startMatch(): void {
  spawns = defaultSpawns(
    roster.map((r) => ({ id: r.source.id, characterId: r.characterId })),
  );
  state = createGameState(CHARACTERS, spawns, 0x1234);
  prevTransforms = snapshot(state);
  mode = "play";
}

function backToSelect(): void {
  mode = "select";
  state = null;
}

// --- fixed-timestep simulation loop ----------------------------------------

function snapshot(s: GameState): Map<number, RenderTransform> {
  const m = new Map<number, RenderTransform>();
  for (const f of s.fighters) {
    m.set(f.id, { x: f.x, depth: f.depth, height: f.height, facing: f.facing });
  }
  return m;
}

function lerpTransforms(
  prev: Map<number, RenderTransform>,
  s: GameState,
  alpha: number,
): Map<number, RenderTransform> {
  const m = new Map<number, RenderTransform>();
  for (const f of s.fighters) {
    const p = prev.get(f.id);
    if (!p) {
      m.set(f.id, { x: f.x, depth: f.depth, height: f.height, facing: f.facing });
      continue;
    }
    m.set(f.id, {
      x: p.x + (f.x - p.x) * alpha,
      depth: p.depth + (f.depth - p.depth) * alpha,
      height: p.height + (f.height - p.height) * alpha,
      facing: f.facing,
    });
  }
  return m;
}

let lastTime = performance.now();
let accumulator = 0;
const MAX_ACCUM = 0.25; // clamp to avoid spiral-of-death after a tab stall

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, MAX_ACCUM);
  lastTime = now;

  if (mode === "select") {
    updateSelect();
    requestAnimationFrame(frame);
    return;
  }

  const s = state!;
  accumulator += dt;
  while (accumulator >= TICK_DT) {
    prevTransforms = snapshot(s);
    const inputs = input.sample(roster.map((r) => r.source));
    step(s, inputs);
    accumulator -= TICK_DT;

    if (s.phase === "roundOver" && s.resetTicks <= 0) {
      resetRound(s, spawns);
      prevTransforms = snapshot(s);
    }
  }

  const alpha = accumulator / TICK_DT;
  renderer.render(s, {
    interp: lerpTransforms(prevTransforms, s, alpha),
    players: joinedView(),
    debug,
  });

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
