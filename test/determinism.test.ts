/**
 * Determinism + basic-combat tests. These run the sim headlessly (no DOM) and
 * are our future-netcode insurance: identical seed + identical inputs must
 * yield byte-identical state.
 */

import { describe, it, expect } from "vitest";
import {
  CHARACTERS,
  DEFAULT_JUMP_VELOCITY,
  DEFAULT_RUN_SPEED_X,
  DEFAULT_WALK_SPEED_X,
  DOUBLE_JUMP_DASH_GRAVITY,
  DOUBLE_JUMP_DASH_HEIGHT,
  DOUBLE_JUMP_DASH_SPEED_X,
  DOUBLE_JUMP_RECOVERY_TICKS,
  DOUBLE_JUMP_WINDOW_TICKS,
  GRAVITY,
  HEAVY_HIT_KNOCKDOWN_DAMAGE,
  MAX_HEALTH,
  REGULAR_JUMP_FORWARD_SPEED_X,
  centeredVersusSpawns,
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
      landingJumpTicks: f.landingJumpTicks,
      dashRecoveryTicks: f.dashRecoveryTicks,
      wasGrounded: f.wasGrounded,
      airAction: f.airAction,
      dashDistanceRemaining: f.dashDistanceRemaining,
      lastLeftTapTick: f.lastLeftTapTick,
      lastRightTapTick: f.lastRightTapTick,
      runDirection: f.runDirection,
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
  it("centered versus spawns keep two fighters visible and facing inward", () => {
    const spawns = centeredVersusSpawns([
      { id: 0, characterId: "brawler" },
      { id: 1, characterId: "brawler" },
    ]);

    expect(Math.abs(spawns[1].x - spawns[0].x)).toBeLessThan(960);
    expect(spawns[0].facing).toBe(1);
    expect(spawns[1].facing).toBe(-1);
  });

  it("starts fighters at the configured full health", () => {
    const s = makeState();
    expect(s.fighters[0].health).toBe(MAX_HEALTH);
    expect(s.fighters[1].health).toBe(MAX_HEALTH);
  });

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

  it("a single hit over the heavy threshold knocks the victim down", () => {
    const s = makeState();
    s.fighters[0].x = 400;
    s.fighters[1].x = 458;
    s.fighters[0].depth = s.fighters[1].depth = 100;

    const activeFrame = CHARACTERS.brawler.frames.find((frame) => frame.id === "p1_1");
    if (!activeFrame?.hitboxes?.[0]) throw new Error("test fixture missing punch hitbox");
    const oldDamage = activeFrame.hitboxes[0].damage;
    activeFrame.hitboxes[0].damage = HEAVY_HIT_KNOCKDOWN_DAMAGE + 1;

    try {
      for (let t = 0; t < 12; t++) {
        const inputs: InputMap = { 0: emptyIn(), 1: emptyIn() };
        if (t === 0) inputs[0].punch = true;
        step(s, inputs);
      }
    } finally {
      activeFrame.hitboxes[0].damage = oldDamage;
    }

    expect(s.fighters[1].state).toBe("knockdown");
    expect(s.fighters[1].health).toBe(MAX_HEALTH - HEAVY_HIT_KNOCKDOWN_DAMAGE - 1);
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

  it("jumping again just after landing starts a dash hop", () => {
    const s = makeState();
    const p0 = s.fighters[0];

    step(s, { 0: { ...emptyIn(), jump: true }, 1: emptyIn() });
    step(s, { 0: emptyIn(), 1: emptyIn() });
    while (p0.height > 0 || p0.vheight > 0) step(s, { 0: emptyIn(), 1: emptyIn() });

    expect(p0.landingJumpTicks).toBeGreaterThan(0);
    step(s, { 0: { ...emptyIn(), right: true, jump: true }, 1: emptyIn() });

    expect(p0.state).toBe("doubleJumpDash");
    expect(p0.facing).toBe(1);
    expect(p0.vx).toBeGreaterThan(0);
  });

  it("holding a direction walks; double-tapping that direction runs", () => {
    const walking = makeState();
    step(walking, { 0: { ...emptyIn(), right: true }, 1: emptyIn() });

    expect(walking.fighters[0].state).toBe("walk");
    expect(walking.fighters[0].runDirection).toBe(0);
    expect(walking.fighters[0].vx).toBe(DEFAULT_WALK_SPEED_X);

    const running = makeState();
    step(running, { 0: { ...emptyIn(), right: true }, 1: emptyIn() });
    step(running, { 0: emptyIn(), 1: emptyIn() });
    step(running, { 0: { ...emptyIn(), right: true }, 1: emptyIn() });

    expect(running.fighters[0].state).toBe("run");
    expect(running.fighters[0].runDirection).toBe(1);
    expect(running.fighters[0].vx).toBe(DEFAULT_RUN_SPEED_X);
  });

  it("regular forward jump keeps full height but half dash movement", () => {
    const s = makeState();
    const p0 = s.fighters[0];

    step(s, { 0: { ...emptyIn(), right: true, jump: true }, 1: emptyIn() });

    expect(p0.state).toBe("jump");
    expect(p0.airAction).toBe("regularJump");
    expect(p0.vx).toBe(REGULAR_JUMP_FORWARD_SPEED_X);
    expect(p0.vheight).toBe(DEFAULT_JUMP_VELOCITY - GRAVITY);
  });

  it("landing from the forward dash starts a short recovery lockout", () => {
    const s = makeState();
    const p0 = s.fighters[0];

    step(s, { 0: { ...emptyIn(), jump: true }, 1: emptyIn() });
    step(s, { 0: emptyIn(), 1: emptyIn() });
    while (p0.height > 0 || p0.vheight > 0) step(s, { 0: emptyIn(), 1: emptyIn() });
    expect(p0.landingJumpTicks).toBe(DOUBLE_JUMP_WINDOW_TICKS);

    step(s, { 0: { ...emptyIn(), right: true, jump: true }, 1: emptyIn() });
    expect(p0.state).toBe("doubleJumpDash");
    expect(p0.vheight).toBe(DOUBLE_JUMP_DASH_HEIGHT - DOUBLE_JUMP_DASH_GRAVITY);

    while (p0.height > 0 || p0.vheight > 0) step(s, { 0: emptyIn(), 1: emptyIn() });
    expect(p0.dashRecoveryTicks).toBe(DOUBLE_JUMP_RECOVERY_TICKS);

    step(s, { 0: { ...emptyIn(), right: true, jump: true }, 1: emptyIn() });
    expect(p0.state).toBe("idle");
    expect(p0.vx).toBe(0);
    expect(p0.vheight).toBe(0);
    expect(p0.dashRecoveryTicks).toBe(DOUBLE_JUMP_RECOVERY_TICKS - 1);
  });

  it("dash hop is 25 percent faster but travels 50 percent farther than a forward jump", () => {
    const regular = makeState();
    const pRegular = regular.fighters[0];
    const regularStartX = pRegular.x;
    step(regular, { 0: { ...emptyIn(), right: true, jump: true }, 1: emptyIn() });
    const regularSpeed = pRegular.vx;
    while (pRegular.height > 0 || pRegular.vheight > 0) {
      step(regular, { 0: { ...emptyIn(), right: true }, 1: emptyIn() });
    }
    const regularDistance = pRegular.x - regularStartX;

    const dash = makeState();
    const pDash = dash.fighters[0];
    step(dash, { 0: { ...emptyIn(), jump: true }, 1: emptyIn() });
    step(dash, { 0: emptyIn(), 1: emptyIn() });
    while (pDash.height > 0 || pDash.vheight > 0) step(dash, { 0: emptyIn(), 1: emptyIn() });

    const dashStartX = pDash.x;
    step(dash, { 0: { ...emptyIn(), right: true, jump: true }, 1: emptyIn() });
    const dashSpeed = pDash.vx;
    while (pDash.height > 0 || pDash.vheight > 0) step(dash, { 0: emptyIn(), 1: emptyIn() });
    const dashDistance = pDash.x - dashStartX;

    expect(dashSpeed).toBe(DOUBLE_JUMP_DASH_SPEED_X);
    expect(dashSpeed / regularSpeed).toBeCloseTo(1.25, 5);
    expect(dashDistance / regularDistance).toBeGreaterThan(1.4);
    expect(dashDistance / regularDistance).toBeLessThan(1.6);
  });

  it("attacking during the dash hop uses the stronger aerial attack", () => {
    const s = makeState();
    s.fighters[0].x = 400;
    s.fighters[1].x = 452;
    s.fighters[0].depth = s.fighters[1].depth = 100;

    const p0 = s.fighters[0];
    p0.state = "doubleJumpDash";
    p0.height = 18;
    p0.vheight = 0;
    p0.wasGrounded = false;
    p0.facing = 1;

    step(s, { 0: { ...emptyIn(), punch: true }, 1: emptyIn() });
    expect(p0.state).toBe("doubleJumpAttack");

    const before = s.fighters[1].health;
    for (let t = 0; t < 8; t++) step(s, { 0: emptyIn(), 1: emptyIn() });
    expect(before - s.fighters[1].health).toBe(50);
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
