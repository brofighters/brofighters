/**
 * Client entry point. Owns menu flow, input wiring, and the fixed-timestep loop.
 * The simulation still advances only through step(inputs) at a fixed 60 Hz.
 */

import {
  ARENA,
  CHARACTER_LIST,
  CHARACTERS,
  TICK_DT,
  centeredVersusSpawns,
  createGameState,
  resetRound,
  step,
  type GameState,
  type SpawnConfig,
} from "./sim/index";
import { InputManager, type PlayerSource } from "./input/inputManager";
import {
  DEFAULT_KEYBOARD_CONFIG,
  cloneLayout,
  keyLabel,
  type KeyAction,
  type KeyboardConfig,
} from "./input/keyboard";
import { Renderer, type RenderTransform, type PlayerView } from "./render/renderer";

const PLAYER_COLORS = ["#e85d5d", "#5da9e8"];
const KEY_CONFIG_STORAGE = "bro-fighters-key-config-v1";
const ASSET_VERSION = "pope-height-20260623";
const W = 960;
const H = 540;

type Screen = "mainMenu" | "keyConfig" | "characterSelect" | "arenaSelect" | "play";
type UiButton = { id: string; label: string; x: number; y: number; w: number; h: number };
type ConfigField = { player: "p1" | "p2"; action: KeyAction };

interface RosterEntry {
  source: PlayerSource;
  characterId: string;
  color: string;
}

interface ArenaOption {
  id: string;
  name: string;
  imagePath: string;
}

const ARENAS: ArenaOption[] = [
  {
    id: "raffles-institution",
    name: "Raffles Institution",
    imagePath: "/assets/arenas/raffles-institution.png",
  },
  {
    id: "raffles-junior-college",
    name: "Raffles Junior College",
    imagePath: "/assets/arenas/raffles-junior-college.png",
  },
];

const ACTION_ROWS: { action: KeyAction; label: string }[] = [
  { action: "up", label: "Up" },
  { action: "down", label: "Down" },
  { action: "left", label: "Left" },
  { action: "right", label: "Right" },
  { action: "punch", label: "Attack" },
  { action: "jump", label: "Jump" },
  { action: "block", label: "Defend" },
];

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputManager();
const ctx = canvas.getContext("2d")!;

let screen: Screen = "mainMenu";
let buttons: UiButton[] = [];
let roster: RosterEntry[] = [];
let spawns: SpawnConfig[] = [];
let state: GameState | null = null;
let debug = false;
let prevTransforms = new Map<number, RenderTransform>();
let keyConfig = loadKeyConfig();
let draftKeyConfig = cloneConfig(keyConfig);
let awaitingKey: ConfigField | null = null;
let selectedCharacterIndexes = [0, 0];
let selectedArenaIndex = 0;
let arenaImage: HTMLImageElement | null = null;
const characterPortraits = new Map<string, HTMLImageElement>();
const spriteSheets = new Map<string, HTMLImageElement>();

input.setKeyboardConfig(keyConfig);
loadImages();

window.addEventListener("keydown", handleKeyDown);
canvas.addEventListener("click", handleClick);

function loadImages(): void {
  loadSelectedArenaImage();

  for (const character of CHARACTER_LIST) {
    if (character.portrait) {
      const portrait = new Image();
      portrait.src = assetUrl(character.portrait);
      characterPortraits.set(character.id, portrait);
    }

    if (character.spriteSheet) {
      const sheet = new Image();
      sheet.src = assetUrl(character.spriteSheet);
      spriteSheets.set(character.id, sheet);
    }
  }
}

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}?v=${ASSET_VERSION}`;
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.code === "F1" || e.code === "Backquote") {
    debug = !debug;
    e.preventDefault();
    return;
  }

  if (awaitingKey) {
    e.preventDefault();
    if (e.code !== "Escape") setDraftKey(awaitingKey, e.code);
    awaitingKey = null;
    return;
  }

  if (e.code === "Escape") {
    if (screen === "play") backToMainMenu();
    else if (screen !== "mainMenu") screen = "mainMenu";
  }

  if (screen === "mainMenu") {
    if (e.code === "Enter") goToCharacterSelect();
    if (e.code === "KeyC") goToKeyConfig();
  } else if (screen === "keyConfig") {
    if (e.code === "Enter") saveKeyConfig();
  } else if (screen === "characterSelect") {
    if (e.code === keyConfig.p1.left) selectCharacter(0, -1);
    if (e.code === keyConfig.p1.right) selectCharacter(0, 1);
    if (e.code === keyConfig.p2.left) selectCharacter(1, -1);
    if (e.code === keyConfig.p2.right) selectCharacter(1, 1);
    if (e.code === "Enter" || e.code === "KeyF" || e.code === keyConfig.p1.punch) {
      screen = "arenaSelect";
    }
  } else if (screen === "arenaSelect") {
    if (e.code === "ArrowLeft") selectArena(-1);
    if (e.code === "ArrowRight") selectArena(1);
    if (e.code === "Enter" || e.code === "KeyF" || e.code === keyConfig.p1.punch) startMatch();
  }
}

function handleClick(e: MouseEvent): void {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const hit = buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (!hit) return;

  if (hit.id === "start") goToCharacterSelect();
  else if (hit.id === "keys") goToKeyConfig();
  else if (hit.id === "back") screen = "mainMenu";
  else if (hit.id === "saveKeys") saveKeyConfig();
  else if (hit.id === "resetKeys") {
    draftKeyConfig = cloneConfig(DEFAULT_KEYBOARD_CONFIG);
    input.setKeyboardConfig(draftKeyConfig);
  } else if (hit.id.startsWith("bind:")) {
    const [, player, action] = hit.id.split(":");
    awaitingKey = { player: player as "p1" | "p2", action: action as KeyAction };
  } else if (hit.id === "charLeft:p0") selectCharacter(0, -1);
  else if (hit.id === "charRight:p0") selectCharacter(0, 1);
  else if (hit.id === "charLeft:p1") selectCharacter(1, -1);
  else if (hit.id === "charRight:p1") selectCharacter(1, 1);
  else if (hit.id === "chooseCharacter") screen = "arenaSelect";
  else if (hit.id === "arenaLeft") selectArena(-1);
  else if (hit.id === "arenaRight") selectArena(1);
  else if (hit.id === "fight") startMatch();
}

function goToKeyConfig(): void {
  draftKeyConfig = cloneConfig(keyConfig);
  awaitingKey = null;
  screen = "keyConfig";
}

function goToCharacterSelect(): void {
  ensureDefaultRoster();
  screen = "characterSelect";
}

function saveKeyConfig(): void {
  keyConfig = cloneConfig(draftKeyConfig);
  input.setKeyboardConfig(keyConfig);
  localStorage.setItem(KEY_CONFIG_STORAGE, JSON.stringify(keyConfig));
  screen = "mainMenu";
}

function setDraftKey(field: ConfigField, code: string): void {
  const layout = draftKeyConfig[field.player];
  layout[field.action] = code;
  if (field.action === "punch") layout.kick = code;
}

function selectCharacter(playerIndex: number, delta: number): void {
  selectedCharacterIndexes[playerIndex] = wrap(
    selectedCharacterIndexes[playerIndex] + delta,
    CHARACTER_LIST.length,
  );
  if (roster[playerIndex]) {
    roster[playerIndex].characterId = CHARACTER_LIST[selectedCharacterIndexes[playerIndex]].id;
  }
}

function selectArena(delta: number): void {
  selectedArenaIndex = wrap(selectedArenaIndex + delta, ARENAS.length);
  loadSelectedArenaImage();
}

function loadSelectedArenaImage(): void {
  arenaImage = new Image();
  arenaImage.src = assetUrl(ARENAS[selectedArenaIndex].imagePath);
}

function ensureDefaultRoster(): void {
  const players = input.listPlayers().filter((p) => p.kind === "keyboard").slice(0, 2);
  roster = players.map((source, i) => ({
    source,
    characterId: CHARACTER_LIST[selectedCharacterIndexes[i] ?? 0].id,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
  }));
}

function startMatch(): void {
  ensureDefaultRoster();
  spawns = centeredVersusSpawns(roster.map((r) => ({ id: r.source.id, characterId: r.characterId })));
  state = createGameState(CHARACTERS, spawns, 0x1234);
  prevTransforms = snapshot(state);
  accumulator = 0;
  screen = "play";
}

function backToMainMenu(): void {
  state = null;
  screen = "mainMenu";
}

function joinedView(): PlayerView[] {
  return roster.map((r, i) => ({ id: r.source.id, label: `P${i + 1}`, color: r.color }));
}

function loadKeyConfig(): KeyboardConfig {
  const fallback = cloneConfig(DEFAULT_KEYBOARD_CONFIG);
  try {
    const raw = localStorage.getItem(KEY_CONFIG_STORAGE);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<KeyboardConfig>;
    return {
      p1: { ...fallback.p1, ...parsed.p1 },
      p2: { ...fallback.p2, ...parsed.p2 },
    };
  } catch {
    return fallback;
  }
}

function cloneConfig(config: KeyboardConfig): KeyboardConfig {
  return {
    p1: cloneLayout(config.p1),
    p2: cloneLayout(config.p2),
  };
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

// --- Drawing menus ---------------------------------------------------------

function drawCurrentScreen(): void {
  if (screen === "mainMenu") drawMainMenu();
  else if (screen === "keyConfig") drawKeyConfig();
  else if (screen === "characterSelect") drawCharacterSelect();
  else if (screen === "arenaSelect") drawArenaSelect();
}

function beginMenu(title: string, subtitle = ""): void {
  buttons = [];
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#10141f");
  bg.addColorStop(1, "#18251f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f4f7ff";
  ctx.font = "bold 46px ui-monospace, monospace";
  ctx.fillText(title, W / 2, 82);
  if (subtitle) {
    ctx.fillStyle = "#9fa9b8";
    ctx.font = "14px ui-monospace, monospace";
    ctx.fillText(subtitle, W / 2, 124);
  }
}

function drawMainMenu(): void {
  beginMenu("BRO FIGHTERS", "Local couch brawler prototype");
  drawButton("start", "Start Game", W / 2 - 140, 205, 280, 54, true);
  drawButton("keys", "Configure Keys", W / 2 - 140, 275, 280, 54);
  drawSmallHint("Enter: start  |  C: configure keys", 455);
}

function drawKeyConfig(): void {
  beginMenu("CONFIGURE KEYS", "Click a button, then press the key you want.");
  drawPlayerKeys("Player 1", "p1", 125);
  drawPlayerKeys("Player 2", "p2", 515);
  drawButton("saveKeys", "Save Buttons", 292, 454, 160, 42, true);
  drawButton("resetKeys", "Reset Defaults", 472, 454, 170, 42);
  drawButton("back", "Back", 662, 454, 110, 42);

  if (awaitingKey) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px ui-monospace, monospace";
    ctx.fillText("Press a key", W / 2, H / 2 - 16);
    ctx.fillStyle = "#b9c4d6";
    ctx.font = "14px ui-monospace, monospace";
    ctx.fillText("Esc cancels", W / 2, H / 2 + 24);
  }
}

function drawPlayerKeys(title: string, player: "p1" | "p2", x: number): void {
  const layout = draftKeyConfig[player];
  ctx.textAlign = "left";
  ctx.fillStyle = "#f4f7ff";
  ctx.font = "bold 20px ui-monospace, monospace";
  ctx.fillText(title, x, 160);
  let y = 196;
  for (const row of ACTION_ROWS) {
    ctx.fillStyle = "#b9c4d6";
    ctx.font = "15px ui-monospace, monospace";
    ctx.fillText(row.label, x, y + 19);
    drawButton(`bind:${player}:${row.action}`, keyLabel(layout[row.action]), x + 130, y, 180, 34);
    y += 38;
  }
  ctx.textAlign = "center";
}

function drawCharacterSelect(): void {
  beginMenu("SELECT BRO", "Each player chooses a fighter.");
  drawCharacterPanel(0, "Player 1", 70, keyLabel(keyConfig.p1.left), keyLabel(keyConfig.p1.right));
  drawCharacterPanel(1, "Player 2", 520, keyLabel(keyConfig.p2.left), keyLabel(keyConfig.p2.right));
  drawButton("chooseCharacter", "Choose", W / 2 - 80, 414, 160, 42, true);
}

function drawCharacterPanel(
  playerIndex: number,
  label: string,
  x: number,
  leftKey: string,
  rightKey: string,
): void {
  const char = CHARACTER_LIST[selectedCharacterIndexes[playerIndex] ?? 0];
  const portrait = characterPortraits.get(char.id);
  const panelW = 370;

  ctx.fillStyle = "rgba(12,18,28,0.58)";
  ctx.strokeStyle = playerIndex === 0 ? "#e85d5d" : "#5da9e8";
  ctx.lineWidth = 2;
  roundRect(ctx, x, 145, panelW, 240, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f4f7ff";
  ctx.font = "bold 20px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x + panelW / 2, 174);

  if (portrait?.complete) {
    ctx.drawImage(portrait, x + 100, 188, 170, 170);
  }

  drawButton(`charLeft:p${playerIndex}`, "<", x + 24, 244, 46, 46);
  drawButton(`charRight:p${playerIndex}`, ">", x + panelW - 70, 244, 46, 46);

  ctx.fillStyle = "#f4f7ff";
  ctx.font = "bold 18px ui-monospace, monospace";
  ctx.fillText(char.name, x + panelW / 2, 362);
  ctx.fillStyle = "#9fa9b8";
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillText(`${leftKey} / ${rightKey}`, x + panelW / 2, 392);
}

function drawArenaSelect(): void {
  const arena = ARENAS[selectedArenaIndex];
  beginMenu("SELECT ARENA", "The fight camera pans across the wider field.");
  drawButton("arenaLeft", "<", 112, 248, 54, 54);
  drawButton("arenaRight", ">", W - 166, 248, 54, 54);

  if (arenaImage?.complete) {
    ctx.drawImage(arenaImage, 205, 155, 550, 260);
    ctx.strokeStyle = "#ffffff55";
    ctx.strokeRect(205, 155, 550, 260);
  }
  ctx.fillStyle = "#f4f7ff";
  ctx.font = "bold 22px ui-monospace, monospace";
  ctx.fillText(arena.name, W / 2, 445);
  drawButton("fight", "Fight", W / 2 - 80, 472, 160, 42, true);
}

function drawButton(
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  primary = false,
): void {
  buttons.push({ id, label, x, y, w, h });
  ctx.fillStyle = primary ? "#65d65f" : "#2a3345";
  ctx.strokeStyle = primary ? "#b9ff91" : "#61708d";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = primary ? "#071007" : "#f4f7ff";
  ctx.font = "bold 15px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
}

function drawSmallHint(text: string, y: number): void {
  ctx.fillStyle = "#8f99aa";
  ctx.font = "13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, y);
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// --- fixed-timestep simulation loop ---------------------------------------

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

function cameraFor(s: GameState): number {
  if (s.fighters.length === 0) return 0;
  const xs = s.fighters.map((f) => f.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const groupCenter = (minX + maxX) / 2;
  const target = groupCenter - W / 2;
  return Math.max(0, Math.min(ARENA.xMax - W, target));
}

let lastTime = performance.now();
let accumulator = 0;
const MAX_ACCUM = 0.25;

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, MAX_ACCUM);
  lastTime = now;

  if (screen !== "play") {
    drawCurrentScreen();
    requestAnimationFrame(frame);
    return;
  }

  const s = state!;
  accumulator += dt;
  while (accumulator >= TICK_DT) {
    prevTransforms = snapshot(s);
    step(s, input.sample(roster.map((r) => r.source)));
    accumulator -= TICK_DT;

    if (s.phase === "roundOver" && s.resetTicks <= 0) {
      resetRound(s, spawns);
      prevTransforms = snapshot(s);
    }
  }

  renderer.render(s, {
    interp: lerpTransforms(prevTransforms, s, accumulator / TICK_DT),
    players: joinedView(),
    debug,
    cameraX: cameraFor(s),
    arenaImage,
    spriteSheets,
  });

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
