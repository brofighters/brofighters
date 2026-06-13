/**
 * Deterministic seeded PRNG (mulberry32). The RNG state is a plain number that
 * lives INSIDE the simulation state, so given the same seed and the same input
 * sequence the simulation always produces identical results. Never use
 * Math.random() anywhere in the sim.
 */

export interface RngState {
  seed: number;
}

export function createRng(seed: number): RngState {
  // Keep the seed a 32-bit unsigned int.
  return { seed: seed >>> 0 };
}

/** Advance the RNG and return a float in [0, 1). Mutates `rng.seed`. */
export function nextFloat(rng: RngState): number {
  let t = (rng.seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max]. */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

/** Float in [min, max). */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}
