/**
 * World setup helpers: build the initial GameState, spawn N fighters, reset a
 * round. Pure data — safe to run headless. Determinism comes from the seed.
 */

import { ARENA, GROUND_HEIGHT, MAX_HEALTH } from "./constants";
import type { CharacterDef } from "./characters/types";
import { emptyInput } from "./input";
import { createRng } from "./prng";
import type { Facing, Fighter, GameState } from "./types";

export interface SpawnConfig {
  id: number;
  characterId: string;
  x: number;
  depth: number;
  facing: Facing;
}

export function createFighter(cfg: SpawnConfig, character?: CharacterDef): Fighter {
  return {
    id: cfg.id,
    characterId: cfg.characterId,
    x: cfg.x,
    depth: cfg.depth,
    height: GROUND_HEIGHT,
    vx: 0,
    vdepth: 0,
    vheight: 0,
    facing: cfg.facing,
    health: character?.maxHealth ?? MAX_HEALTH,
    alive: true,
    state: "idle",
    frameIndex: 0,
    frameTicks: 1,
    hitstop: 0,
    hitstun: 0,
    getUpTicks: 0,
    landingJumpTicks: 0,
    dashRecoveryTicks: 0,
    wasGrounded: true,
    airAction: "none",
    dashDistanceRemaining: 0,
    lastLeftTapTick: -9999,
    lastRightTapTick: -9999,
    runDirection: 0,
    comboKey: null,
    comboIndex: 0,
    hasHitThisAttack: false,
    commandBuffer: [],
    prevInput: emptyInput(),
  };
}

/** Evenly distribute N fighters across the arena, alternating facing inward. */
export function defaultSpawns(specs: { id: number; characterId: string }[]): SpawnConfig[] {
  const n = specs.length;
  const usableMin = ARENA.xMin + 80;
  const usableMax = ARENA.xMax - 80;
  const mid = (ARENA.depthMin + ARENA.depthMax) / 2;
  return specs.map((s, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = usableMin + t * (usableMax - usableMin);
    const facing: Facing = x <= (usableMin + usableMax) / 2 ? 1 : -1;
    // Slight depth stagger so fighters don't perfectly overlap at spawn.
    const depth = mid + ((i % 2 === 0 ? -1 : 1) * Math.min(40, 10 * i));
    return { id: s.id, characterId: s.characterId, x, depth, facing };
  });
}

/** Spawn fighters close enough for local versus: visible together, facing inward. */
export function centeredVersusSpawns(
  specs: { id: number; characterId: string }[],
): SpawnConfig[] {
  const n = specs.length;
  const centerX = (ARENA.xMin + ARENA.xMax) / 2;
  const centerDepth = (ARENA.depthMin + ARENA.depthMax) / 2;
  const spacing = 150;
  const startX = centerX - ((n - 1) * spacing) / 2;

  return specs.map((s, i) => {
    const x = startX + i * spacing;
    const depth = centerDepth + (i % 2 === 0 ? -8 : 8);
    const facing: Facing = x <= centerX ? 1 : -1;
    return { id: s.id, characterId: s.characterId, x, depth, facing };
  });
}

export function createGameState(
  characters: Record<string, CharacterDef>,
  spawns: SpawnConfig[],
  seed = 1,
): GameState {
  return {
    tick: 0,
    rng: createRng(seed),
    fighters: spawns.map((spawn) => createFighter(spawn, characters[spawn.characterId])),
    characters,
    phase: "fighting",
    winnerId: null,
    resetTicks: 0,
  };
}

/** Reset the round in place: respawn everyone at full health, keep characters. */
export function resetRound(state: GameState, spawns: SpawnConfig[]): void {
  state.tick = 0;
  state.fighters = spawns.map((spawn) => createFighter(spawn, state.characters[spawn.characterId]));
  state.phase = "fighting";
  state.winnerId = null;
  state.resetTicks = 0;
}
