/**
 * Core simulation state types. This module is pure data — no DOM, no rendering,
 * no wall-clock. The whole world advances via step(state, inputs).
 */

import type { CharacterDef } from "./characters/types";
import type { BufferedCommand, InputState } from "./input";
import type { RngState } from "./prng";

/** Facing: +1 faces right (forward = +x), -1 faces left. */
export type Facing = 1 | -1;
export type AirAction = "none" | "regularJump" | "forwardDash";

export interface Fighter {
  id: number;
  characterId: string;

  /** 2.5D position. x = left/right, depth = field near(+)/far(-), height = jump. */
  x: number;
  depth: number;
  height: number;

  /** velocities per tick */
  vx: number;
  vdepth: number;
  vheight: number;

  facing: Facing;

  health: number;
  alive: boolean;

  /** current state name (key into CharacterDef.states) */
  state: string;
  /** index into the current state's frames array */
  frameIndex: number;
  /** ticks remaining on the current frame */
  frameTicks: number;
  /** ticks of hitstop freeze remaining (animation + physics paused) */
  hitstop: number;
  /** ticks of hitstun remaining (in "hit" state) */
  hitstun: number;
  /** ticks until a knocked-down fighter gets up */
  getUpTicks: number;
  /** ticks after landing where jump triggers a short dash hop */
  landingJumpTicks: number;
  /** ticks after landing from a forward dash where control is locked */
  dashRecoveryTicks: number;
  /** whether the fighter was grounded at the end of the previous tick */
  wasGrounded: boolean;
  /** used to decide whether landing opens dash or recovery rules */
  airAction: AirAction;
  /** remaining forward x distance for a capped dash-jump */
  dashDistanceRemaining: number;
  /** recent directional taps used for double-tap run detection */
  lastLeftTapTick: number;
  lastRightTapTick: number;
  /** -1/1 while a double-tap run is being held, 0 otherwise */
  runDirection: number;

  /** which combo chain key is active ("punch"/"kick") and how far along */
  comboKey: string | null;
  comboIndex: number;
  /** true once this attack's active frames have connected (one hit per swing) */
  hasHitThisAttack: boolean;

  /** recent discrete inputs for combo/special matching */
  commandBuffer: BufferedCommand[];
  /** previous tick's raw input, for rising-edge detection */
  prevInput: InputState;
}

export type RoundPhase = "fighting" | "roundOver";

export interface GameState {
  tick: number;
  rng: RngState;
  fighters: Fighter[];
  /** character definitions, keyed by id, available to step() */
  characters: Record<string, CharacterDef>;
  phase: RoundPhase;
  /** id of the winning fighter when phase === "roundOver", else null */
  winnerId: number | null;
  /** countdown to auto-reset after a round ends */
  resetTicks: number;
}
