/** Public surface of the headless simulation. The renderer/input layers import
 * only from here and never reach into render/DOM from inside the sim. */

export * from "./types";
export * from "./input";
export * from "./constants";
export { step } from "./step";
export {
  createGameState,
  createFighter,
  defaultSpawns,
  resetRound,
  type SpawnConfig,
} from "./world";
export { CHARACTERS, CHARACTER_LIST, getCharacter } from "./characters/index";
export type { CharacterDef } from "./characters/types";
