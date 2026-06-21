/**
 * The deterministic simulation core.
 *
 * step(state, inputs) advances the entire world by ONE fixed logic tick (60 Hz).
 * Given the same starting state and the same input map it always produces the
 * same result: no Math.random (use state.rng), no Date/performance, no DOM.
 *
 * It models N fighters (never P1/P2) in 2.5D (x, depth, height).
 */

import {
  ARENA,
  COMMAND_BUFFER_TICKS,
  DEFAULT_RUN_SPEED_X,
  DOUBLE_JUMP_DASH_DISTANCE_MULTIPLIER,
  DOUBLE_JUMP_DASH_GRAVITY,
  DOUBLE_JUMP_DASH_HEIGHT,
  DOUBLE_JUMP_DASH_SPEED_DEPTH,
  DOUBLE_JUMP_DASH_SPEED_X,
  DOUBLE_JUMP_RECOVERY_TICKS,
  DOUBLE_JUMP_WINDOW_TICKS,
  DEFAULT_JUMP_VELOCITY,
  DEFAULT_WALK_SPEED_DEPTH,
  DEFAULT_WALK_SPEED_X,
  GRAVITY,
  GROUND_HEIGHT,
  HEAVY_HIT_KNOCKDOWN_DAMAGE,
  HITSTOP_TICKS,
  KNOCKDOWN_GET_UP_TICKS,
  REGULAR_JUMP_FORWARD_SPEED_DEPTH,
  REGULAR_JUMP_FORWARD_SPEED_X,
  RUN_DOUBLE_TAP_TICKS,
  ROUND_RESET_TICKS,
} from "./constants";
import type { Box, CharacterDef, Frame, HitBox } from "./characters/types";
import {
  emptyInput,
  type BufferedCommand,
  type CommandToken,
  type InputMap,
  type InputState,
} from "./input";
import type { Facing, Fighter, GameState } from "./types";

export function step(state: GameState, inputs: InputMap): GameState {
  state.tick++;

  if (state.phase === "roundOver") {
    if (state.resetTicks > 0) state.resetTicks--;
    // Let bodies settle but accept no further combat input.
    for (const f of state.fighters) settlePhysics(state, f);
    return state;
  }

  // 1. Per-fighter logic (input -> state machine -> physics).
  for (const f of state.fighters) {
    const input = inputs[f.id] ?? emptyInput();
    updateFighter(state, f, input);
  }

  // 2. Collision / hit resolution (after everyone has moved this tick).
  resolveHits(state);

  // 3. Round flow.
  updateRoundFlow(state);

  return state;
}

// ---------------------------------------------------------------------------
// Per-fighter update
// ---------------------------------------------------------------------------

function updateFighter(state: GameState, f: Fighter, input: InputState): void {
  // Hitstop freezes a fighter completely (animation + physics) for a few ticks.
  if (f.hitstop > 0) {
    f.hitstop--;
    f.prevInput = input;
    return;
  }

  const char = state.characters[f.characterId];

  faceNearestOpponent(state, f);
  pushCommands(f, input, state.tick);
  pruneBuffer(f, state.tick);

  const grounded = f.height <= GROUND_HEIGHT + 1e-6 && f.vheight <= 0;
  if (grounded && f.landingJumpTicks > 0) f.landingJumpTicks--;

  // Reaction states first (hitstun / knockdown ignore input).
  if (f.state === "hit") {
    f.hitstun--;
    if (f.hitstun <= 0 && grounded) enterState(f, char, "idle");
  } else if (f.state === "knockdown") {
    if (f.alive) {
      f.getUpTicks--;
      if (f.getUpTicks <= 0 && grounded) enterState(f, char, "idle");
    }
  } else if (f.dashRecoveryTicks > 0) {
    f.dashRecoveryTicks--;
    f.vx = 0;
    f.vdepth = 0;
    f.runDirection = 0;
    enterState(f, char, "idle", true);
  } else {
    const def = char.states[f.state];
    if (f.state === "doubleJumpDash") {
      handleDoubleJumpDash(f, char, input);
    } else if (def.control === "free") {
      handleFreeControl(f, char, input, grounded, state.tick);
    } else {
      // Locked (attack) — allow combo cancels only.
      handleAttackCancels(f, char, input);
    }
  }

  advanceAnimation(f, char);
  applyPhysics(state, f, grounded);

  f.prevInput = input;
}

/** Idle / walk / jump / block: full player control. */
function handleFreeControl(
  f: Fighter,
  char: CharacterDef,
  input: InputState,
  grounded: boolean,
  tick: number,
): void {
  updateRunIntent(f, input, tick);

  // Specials are checked first: their sequences (e.g. block+back+jump) include
  // buttons that would otherwise trigger jump/attack.
  if (grounded && tryStartSpecial(f, char)) return;

  // Attacks. (Kick removed for now — punch + the 3-hit combo + the special.)
  if (edge(f.prevInput, input, "punch")) {
    startCombo(f, char, "punch", "punch1");
    return;
  }

  // Jump.
  if (grounded && edge(f.prevInput, input, "jump") && char.states.jump) {
    if (f.landingJumpTicks > 0 && char.states.doubleJumpDash) {
      startDoubleJumpDash(f, char, input);
    } else {
      startRegularJump(f, char, input);
    }
    return;
  }

  // Blocking (grounded only; locks out movement while held).
  if (grounded && input.block && char.states.block) {
    enterState(f, char, "block", true);
  } else if (f.state === "block" && !input.block) {
    enterState(f, char, "idle");
  }

  // Movement (world-space; facing is independent and auto-tracks the opponent).
  const blocking = f.state === "block";
  const running = grounded && f.runDirection !== 0 && inputForDirection(input, f.runDirection);
  const baseSpeedX = running
    ? char.runSpeedX ?? DEFAULT_RUN_SPEED_X
    : char.walkSpeedX ?? DEFAULT_WALK_SPEED_X;
  const speedX = baseSpeedX * (grounded ? 1 : 0.7);
  const speedZ = char.walkSpeedDepth ?? DEFAULT_WALK_SPEED_DEPTH;

  let mvx = 0;
  let mvz = 0;
  if (!blocking) {
    if (input.left) mvx -= 1;
    if (input.right) mvx += 1;
    if (input.left !== input.right) f.facing = input.left ? -1 : 1;
    if (grounded) {
      if (input.up) mvz -= 1; // up the field = further away (depth decreases)
      if (input.down) mvz += 1;
    }
  }

  f.vx = mvx * speedX;
  if (grounded) f.vdepth = mvz * speedZ;

  // Pick locomotion animation while grounded & not in a special transition.
  if (grounded && (f.state === "idle" || f.state === "walk" || f.state === "run")) {
    const moving = mvx !== 0 || mvz !== 0;
    const next = moving ? (running && mvx !== 0 && char.states.run ? "run" : "walk") : "idle";
    enterState(f, char, next, true);
  }
}

function updateRunIntent(f: Fighter, input: InputState, tick: number): void {
  if (edge(f.prevInput, input, "left")) {
    if (tick - f.lastLeftTapTick <= RUN_DOUBLE_TAP_TICKS) f.runDirection = -1;
    f.lastLeftTapTick = tick;
  }
  if (edge(f.prevInput, input, "right")) {
    if (tick - f.lastRightTapTick <= RUN_DOUBLE_TAP_TICKS) f.runDirection = 1;
    f.lastRightTapTick = tick;
  }

  if (f.runDirection !== 0 && !inputForDirection(input, f.runDirection)) {
    f.runDirection = 0;
  }
}

function inputForDirection(input: InputState, dir: number): boolean {
  return dir < 0 ? input.left && !input.right : input.right && !input.left;
}

function startRegularJump(f: Fighter, char: CharacterDef, input: InputState): void {
  const xDir = input.left === input.right ? 0 : input.left ? -1 : 1;
  let zDir = 0;
  if (input.up !== input.down) zDir = input.up ? -1 : 1;

  if (xDir !== 0) f.facing = xDir as Facing;
  f.vx = xDir * (char.regularJumpForwardSpeedX ?? REGULAR_JUMP_FORWARD_SPEED_X);
  f.vdepth = zDir * (char.regularJumpForwardSpeedDepth ?? REGULAR_JUMP_FORWARD_SPEED_DEPTH);
  f.vheight = char.jumpVelocity ?? DEFAULT_JUMP_VELOCITY;
  f.airAction = "regularJump";
  f.runDirection = 0;
  enterState(f, char, "jump");
}

/** During an attack, allow cancelling into the next combo hit within a window. */
function handleAttackCancels(f: Fighter, char: CharacterDef, input: InputState): void {
  const frame = currentFrame(f, char);
  if (!frame.cancelInto || frame.cancelInto.length === 0) return;
  if (!f.comboKey) return;

  const chain = char.combos?.[f.comboKey];
  if (!chain) return;
  const nextState = chain[f.comboIndex + 1];
  if (!nextState || !frame.cancelInto.includes(nextState)) return;

  // The same button that started the chain advances it.
  if (edge(f.prevInput, input, f.comboKey as keyof InputState)) {
    f.comboIndex++;
    f.hasHitThisAttack = false;
    enterState(f, char, nextState);
  }
}

function startCombo(f: Fighter, char: CharacterDef, key: string, firstState: string): void {
  if (!char.states[firstState]) return;
  f.comboKey = key;
  f.comboIndex = 0;
  f.hasHitThisAttack = false;
  enterState(f, char, firstState);
}

function startDoubleJumpDash(f: Fighter, char: CharacterDef, input: InputState): void {
  const xDir = input.left === input.right ? f.facing : input.left ? -1 : 1;
  let zDir = 0;
  if (input.up !== input.down) zDir = input.up ? -1 : 1;

  f.facing = xDir as Facing;
  f.vx = xDir * (char.doubleJumpDashSpeedX ?? DOUBLE_JUMP_DASH_SPEED_X);
  f.vdepth = zDir * (char.doubleJumpDashSpeedDepth ?? DOUBLE_JUMP_DASH_SPEED_DEPTH);
  f.vheight = char.doubleJumpDashHeight ?? DOUBLE_JUMP_DASH_HEIGHT;
  f.landingJumpTicks = 0;
  f.airAction = "forwardDash";
  f.dashDistanceRemaining =
    estimateRegularForwardJumpDistance(char) *
    (char.doubleJumpDashDistanceMultiplier ?? DOUBLE_JUMP_DASH_DISTANCE_MULTIPLIER);
  f.runDirection = 0;
  f.comboKey = null;
  f.comboIndex = 0;
  f.hasHitThisAttack = false;
  enterState(f, char, "doubleJumpDash");
}

function handleDoubleJumpDash(f: Fighter, char: CharacterDef, input: InputState): void {
  if (edge(f.prevInput, input, "punch") && char.states.doubleJumpAttack) {
    f.hasHitThisAttack = false;
    enterState(f, char, "doubleJumpAttack");
  }
}

// ---------------------------------------------------------------------------
// Specials & command buffer
// ---------------------------------------------------------------------------

function tryStartSpecial(f: Fighter, char: CharacterDef): boolean {
  for (const sp of char.specials) {
    if (matchSequence(f.commandBuffer, sp.inputSequence as CommandToken[], sp.windowTicks)) {
      f.commandBuffer = []; // consume so it can't re-fire
      f.comboKey = null;
      f.comboIndex = 0;
      f.hasHitThisAttack = false;
      enterState(f, char, sp.state);
      return true;
    }
  }
  return false;
}

/** Greedy in-order subsequence match constrained to a tick window. */
function matchSequence(
  buffer: BufferedCommand[],
  seq: CommandToken[],
  windowTicks: number,
): boolean {
  if (seq.length === 0) return false;
  let p = 0;
  let firstTick = -1;
  for (const cmd of buffer) {
    if (cmd.token === seq[p]) {
      if (p === 0) firstTick = cmd.tick;
      p++;
      if (p === seq.length) {
        return cmd.tick - firstTick <= windowTicks;
      }
    }
  }
  return false;
}

/** Translate this tick's rising edges into facing-relative command tokens. */
function pushCommands(f: Fighter, input: InputState, tick: number): void {
  const add = (token: CommandToken) => f.commandBuffer.push({ token, tick });

  if (edge(f.prevInput, input, "left")) add(f.facing === 1 ? "back" : "forward");
  if (edge(f.prevInput, input, "right")) add(f.facing === 1 ? "forward" : "back");
  if (edge(f.prevInput, input, "up")) add("up");
  if (edge(f.prevInput, input, "down")) add("down");
  if (edge(f.prevInput, input, "jump")) add("jump");
  if (edge(f.prevInput, input, "punch")) add("punch");
  if (edge(f.prevInput, input, "kick")) add("kick");
  if (edge(f.prevInput, input, "block")) add("block");
}

function pruneBuffer(f: Fighter, tick: number): void {
  const cutoff = tick - COMMAND_BUFFER_TICKS;
  let i = 0;
  while (i < f.commandBuffer.length && f.commandBuffer[i].tick < cutoff) i++;
  if (i > 0) f.commandBuffer.splice(0, i);
}

function edge(prev: InputState, cur: InputState, key: keyof InputState): boolean {
  return cur[key] && !prev[key];
}

// ---------------------------------------------------------------------------
// Animation & state transitions
// ---------------------------------------------------------------------------

function enterState(
  f: Fighter,
  char: CharacterDef,
  name: string,
  keepIfSame = false,
): void {
  if (keepIfSame && f.state === name) return;
  if (!char.states[name]) return;
  f.state = name;
  f.frameIndex = 0;
  const frame = char.frames.find((fr) => fr.id === char.states[name].frames[0]);
  f.frameTicks = frame ? frame.durationTicks : 1;
  if (frame?.impulse) applyImpulse(f, frame);
}

function advanceAnimation(f: Fighter, char: CharacterDef): void {
  const def = char.states[f.state];
  if (!def) return;
  f.frameTicks--;
  if (f.frameTicks > 0) return;

  if (f.frameIndex < def.frames.length - 1) {
    f.frameIndex++;
    const frame = currentFrame(f, char);
    f.frameTicks = frame.durationTicks;
    if (frame.impulse) applyImpulse(f, frame);
    return;
  }

  // Animation finished.
  if (def.loop) {
    f.frameIndex = 0;
    f.frameTicks = currentFrame(f, char).durationTicks;
  } else if (def.next && char.states[def.next]) {
    enterState(f, char, def.next);
  } else {
    // Default: attacks and one-shots fall back to idle.
    f.comboKey = null;
    f.comboIndex = 0;
    enterState(f, char, "idle");
  }
}

function currentFrame(f: Fighter, char: CharacterDef): Frame {
  const def = char.states[f.state];
  const id = def.frames[Math.min(f.frameIndex, def.frames.length - 1)];
  return char.frames.find((fr) => fr.id === id) ?? char.frames[0];
}

function applyImpulse(f: Fighter, frame: Frame): void {
  if (!frame.impulse) return;
  if (frame.impulse.x != null) f.vx += f.facing * frame.impulse.x;
  if (frame.impulse.h != null) f.vheight += frame.impulse.h;
  if (frame.impulse.z != null) f.vdepth += frame.impulse.z;
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

function applyPhysics(state: GameState, f: Fighter, grounded: boolean): void {
  // Gravity (airborne).
  if (!grounded || f.vheight > 0) {
    const char = state.characters[f.characterId];
    const gravity =
      f.airAction === "forwardDash"
        ? char.doubleJumpDashGravity ?? DOUBLE_JUMP_DASH_GRAVITY
        : GRAVITY;
    f.vheight -= gravity;
  }

  let moveX = f.vx;
  if (f.airAction === "forwardDash" && f.dashDistanceRemaining > 0) {
    const capped = Math.min(Math.abs(moveX), f.dashDistanceRemaining);
    moveX = Math.sign(moveX) * capped;
    f.dashDistanceRemaining -= capped;
    if (f.dashDistanceRemaining <= 1e-6) {
      f.dashDistanceRemaining = 0;
      f.vx = 0;
    }
  }

  f.x += moveX;
  f.depth += f.vdepth;
  f.height += f.vheight;

  // Ground collision.
  let landed = false;
  if (f.height <= GROUND_HEIGHT) {
    landed = !f.wasGrounded && f.vheight <= 0;
    f.height = GROUND_HEIGHT;
    if (f.vheight < 0) f.vheight = 0;
    // Landing from a jump returns to idle (unless mid-reaction / attack on ground).
    if (
      f.state === "jump" ||
      f.state === "doubleJumpDash" ||
      f.state === "doubleJumpAttack"
    ) {
      enterState(f, state.characters[f.characterId], "idle");
    }
    if (landed) {
      if (f.airAction === "regularJump") {
        f.landingJumpTicks = DOUBLE_JUMP_WINDOW_TICKS;
      } else if (f.airAction === "forwardDash") {
        f.dashRecoveryTicks = DOUBLE_JUMP_RECOVERY_TICKS;
        f.landingJumpTicks = 0;
        f.dashDistanceRemaining = 0;
        f.runDirection = 0;
      }
      f.airAction = "none";
    }
  }

  // Friction in depth so taps don't slide forever (x is set directly each tick).
  if (grounded) f.vdepth *= 0.6;
  if (Math.abs(f.vdepth) < 0.01) f.vdepth = 0;

  // Arena clamp.
  if (f.x < ARENA.xMin) f.x = ARENA.xMin;
  if (f.x > ARENA.xMax) f.x = ARENA.xMax;
  if (f.depth < ARENA.depthMin) f.depth = ARENA.depthMin;
  if (f.depth > ARENA.depthMax) f.depth = ARENA.depthMax;
  f.wasGrounded = f.height <= GROUND_HEIGHT + 1e-6 && f.vheight <= 0;
}

function estimateRegularForwardJumpDistance(char: CharacterDef): number {
  const initialSpeed = char.regularJumpForwardSpeedX ?? REGULAR_JUMP_FORWARD_SPEED_X;
  const airControlSpeed = (char.walkSpeedX ?? DEFAULT_WALK_SPEED_X) * 0.7;
  const jumpVelocity = char.jumpVelocity ?? DEFAULT_JUMP_VELOCITY;

  let height = 0;
  let vheight = jumpVelocity;
  let ticks = 0;
  do {
    vheight -= GRAVITY;
    height += vheight;
    ticks++;
  } while (height > GROUND_HEIGHT || vheight > 0);

  return initialSpeed + Math.max(0, ticks - 1) * airControlSpeed;
}

/** Minimal physics used while a round is over (no input). */
function settlePhysics(state: GameState, f: Fighter): void {
  const grounded = f.height <= GROUND_HEIGHT + 1e-6 && f.vheight <= 0;
  applyPhysics(state, f, grounded);
}

function faceNearestOpponent(state: GameState, f: Fighter): void {
  // Only auto-face while grounded and not committed to an attack/reaction.
  const def = state.characters[f.characterId].states[f.state];
  if (!def || def.control !== "free") return;
  if (f.state !== "idle" && f.state !== "walk" && f.state !== "block") return;

  let nearest: Fighter | null = null;
  let best = Infinity;
  for (const o of state.fighters) {
    if (o.id === f.id || !o.alive) continue;
    const dx = Math.abs(o.x - f.x);
    if (dx < best) {
      best = dx;
      nearest = o;
    }
  }
  if (nearest && Math.abs(nearest.x - f.x) > 2) {
    f.facing = (nearest.x >= f.x ? 1 : -1) as Facing;
  }
}

// ---------------------------------------------------------------------------
// Hit resolution
// ---------------------------------------------------------------------------

interface WorldBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h0: number;
  h1: number;
}

function toWorld(f: Fighter, b: Box): WorldBox {
  const cx = f.x + f.facing * b.x;
  const cz = f.depth + b.z;
  const ch = f.height + b.h;
  return {
    x0: cx - b.w,
    x1: cx + b.w,
    z0: cz - b.d,
    z1: cz + b.d,
    h0: ch - b.hh,
    h1: ch + b.hh,
  };
}

function overlap(a: WorldBox, b: WorldBox): boolean {
  return (
    a.x0 <= b.x1 &&
    a.x1 >= b.x0 &&
    a.z0 <= b.z1 &&
    a.z1 >= b.z0 &&
    a.h0 <= b.h1 &&
    a.h1 >= b.h0
  );
}

function defaultHurtbox(char: CharacterDef): Box {
  return {
    x: 0,
    z: 0,
    h: char.body.h,
    w: char.body.w,
    d: char.body.d,
    hh: char.body.h,
  };
}

function resolveHits(state: GameState): void {
  for (const atk of state.fighters) {
    if (!atk.alive || atk.hitstop > 0 || atk.hasHitThisAttack) continue;
    const atkChar = state.characters[atk.characterId];
    const atkDef = atkChar.states[atk.state];
    if (!atkDef?.attack) continue;
    const frame = currentFrame(atk, atkChar);
    if (!frame.hitboxes || frame.hitboxes.length === 0) continue;

    for (const vic of state.fighters) {
      if (vic.id === atk.id || !vic.alive) continue;
      if (vic.state === "knockdown") continue; // can't combo a downed fighter

      const vicChar = state.characters[vic.characterId];
      const vicFrame = currentFrame(vic, vicChar);
      const hurtboxes = vicFrame.hurtboxes?.length
        ? vicFrame.hurtboxes
        : [defaultHurtbox(vicChar)];

      let landed: HitBox | null = null;
      outer: for (const hb of frame.hitboxes) {
        const whb = toWorld(atk, hb);
        for (const hurt of hurtboxes) {
          if (overlap(whb, toWorld(vic, hurt))) {
            landed = hb;
            break outer;
          }
        }
      }
      if (landed) {
        applyHit(state, atk, vic, landed);
        atk.hasHitThisAttack = true;
        break; // one victim per swing keeps things readable for milestone 1
      }
    }
  }
}

function applyHit(state: GameState, atk: Fighter, vic: Fighter, hb: HitBox): void {
  const vicChar = state.characters[vic.characterId];

  // Blocking: must face the attacker. Heavily reduced effect, no knockdown.
  const attackerSide = atk.x >= vic.x ? 1 : -1;
  const blocked = vic.state === "block" && attackerSide === vic.facing;

  const damage = blocked ? Math.max(1, Math.round(hb.damage * 0.2)) : hb.damage;
  vic.health -= damage;

  // Hitstop for game feel.
  atk.hitstop = HITSTOP_TICKS;
  vic.hitstop = HITSTOP_TICKS;

  if (vic.health <= 0) {
    vic.health = 0;
    vic.alive = false;
    knockDown(vic, vicChar, atk.facing, hb);
    return;
  }

  if (blocked) {
    vic.vx += atk.facing * (hb.knockbackX * 0.25);
    enterState(vic, vicChar, "block", true);
    return;
  }

  if (hb.knockdown || damage > HEAVY_HIT_KNOCKDOWN_DAMAGE) {
    knockDown(vic, vicChar, atk.facing, hb);
  } else {
    vic.vx += atk.facing * hb.knockbackX;
    vic.vheight += hb.knockbackH;
    enterState(vic, vicChar, "hit");
    vic.hitstun = hb.hitstun;
  }
}

function knockDown(vic: Fighter, vicChar: CharacterDef, atkFacing: Facing, hb: HitBox): void {
  vic.vx += atkFacing * Math.max(hb.knockbackX, 6);
  vic.vheight += Math.max(hb.knockbackH, 8);
  vic.getUpTicks = KNOCKDOWN_GET_UP_TICKS;
  enterState(vic, vicChar, "knockdown");
}

// ---------------------------------------------------------------------------
// Round flow
// ---------------------------------------------------------------------------

function updateRoundFlow(state: GameState): void {
  const alive = state.fighters.filter((f) => f.alive);
  if (alive.length <= 1 && state.fighters.length >= 2) {
    state.phase = "roundOver";
    state.winnerId = alive.length === 1 ? alive[0].id : null;
    state.resetTicks = ROUND_RESET_TICKS;
  }
}
