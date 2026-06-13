/**
 * Determinism + basic-combat tests. These run the sim headlessly (no DOM) and
 * are our future-netcode insurance: identical seed + identical inputs must
 * yield byte-identical state.
 */

import { describe, it, expect } from "vitest";
import {
  CHARACTERS,
  createGameState,
  defaultSpawns,
  step,
  type GameState,
  type InputMap,
  type InputState,
} from "../src/sim/index";

function emptyIn(): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    punch: false,
    kick: false,
    block: false,
  };
}

function makeState(seed = 42): GameState {
  const spawns = defaultSpawns([
    { id: 0, characterId: "brawler" },
    { id: 1, characterId: "brawler" },
  ]);
  return createGameState(CHARACTERS, spawns, seed);
}

/** Deterministic pseudo-input script driven only by tick number (no RNG). */
function scriptedInputs(tick: number): InputMap {
  const p0 = emptyIn();
  const p1 = emptyIn();
  // P0 walks right and periodically punches / jumps.
  p0.right = tick % 8 < 5;
  p0.punch = tick % 17 === 0;
  p0.jump = tick % 53 === 0;
  // P1 walks left, kicks, blocks.
  p1.left = tick % 6 < 4;
  p1.kick = tick % 23 === 0;
  p1.block = tick % 31 < 4;
  return { 0: p0, 1: p1 };
}

function runFor(state: GameState, ticks: number): GameState {
  for (let t = 0; t < ticks; t++) step(state, scriptedInputs(state.tick));
  return state;
}

/** Serialize the parts that define simulation outcome. */
function fingerprint(s: GameState): string {
  return JSON.stringify({
    tick: s.tick,
    rng: s.rng,
    phase: s.phase,
    winnerId: s.winnerId,
    fighters: s.fighters.map((f) => ({
      id: f.id,
      x: f.x,
      depth: f.depth,
      height: f.height,
      vx: f.vx,
      vdepth: f.vdepth,
      vheight: f.vheight,
      facing: f.facing,
      health: f.health,
      alive: f.alive,
      state: f.state,
      frameIndex: f.frameIndex,
      frameTicks: f.frameTicks,
    })),
  });
}

describe("simulation determinism", () => {
  it("produces identical state from identical seed + inputs", () => {
    const a = runFor(makeState(7), 600);
    const b = runFor(makeState(7), 600);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("is frame-rate independent: stepping one-by-one equals a longer run", () => {
    const once = makeState(3);
    for (let i = 0; i < 250; i++) step(once, scriptedInputs(once.tick));

    const chunked = makeState(3);
    runFor(chunked, 100);
    runFor(chunked, 150);

    expect(fingerprint(once)).toBe(fingerprint(chunked));
  });
});

describe("basic combat", () => {
  it("a clean punch damages an in-range opponent", () => {
    const s = makeState();
    // Place fighters adjacent and facing each other.
    s.fighters[0].x = 400;
    s.fighters[1].x = 460;
    s.fighters[0].depth = s.fighters[1].depth = 100;

    const before = s.fighters[1].health;
    // P0 throws a punch; let it run through the active frames.
    for (let t = 0; t < 20; t++) {
      const inputs: InputMap = { 0: emptyIn(), 1: emptyIn() };
      if (t === 0) inputs[0].punch = true;
      step(s, inputs);
    }
    expect(s.fighters[1].health).toBeLessThan(before);
  });

  it("blocking reduces the damage taken from a frontal hit", () => {
    const unblocked = damageOver(false);
    const blocked = damageOver(true);
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(unblocked);
  });

  it("ends the round when only one fighter remains", () => {
    const s = makeState();
    s.fighters[1].health = 1;
    s.fighters[0].x = 400;
    s.fighters[1].x = 455;
    s.fighters[0].depth = s.fighters[1].depth = 100;
    for (let t = 0; t < 40; t++) {
      const inputs: InputMap = { 0: emptyIn(), 1: emptyIn() };
      if (t % 12 === 0) inputs[0].punch = true;
      step(s, inputs);
    }
    expect(s.phase).toBe("roundOver");
    expect(s.winnerId).toBe(0);
  });
});

function damageOver(block: boolean): number {
  const s = makeState();
  s.fighters[0].x = 400;
  s.fighters[1].x = 458;
  s.fighters[0].depth = s.fighters[1].depth = 100;
  const before = s.fighters[1].health;
  for (let t = 0; t < 16; t++) {
    const inputs: InputMap = { 0: emptyIn(), 1: emptyIn() };
    if (t === 0) inputs[0].punch = true;
    if (block) inputs[1].block = true;
    step(s, inputs);
  }
  return before - s.fighters[1].health;
}
