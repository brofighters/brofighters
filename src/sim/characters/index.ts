/**
 * Character registry. Each fighter is a data file (JSON) + a sprite sheet;
 * registering one here is the only "wiring" step — no engine changes. To add a
 * friend, drop a `<name>.json` next to this file and import it below.
 */

import type { CharacterDef } from "./types";
import brawler from "./brawler.json";
import radioYap from "./radio-yap.json";
import gastroSian from "./gastro-sian.json";
import bin from "./bin.json";
import lawyerVd from "./lawyer-vd.json";
import lossy from "./lossy.json";
import lewd from "./lewd.json";
import yao from "./yao.json";

// JSON imports widen tuples (e.g. spriteRect) to number[]; the data is authored
// to match CharacterDef, so cast through unknown.
export const CHARACTERS: Record<string, CharacterDef> = {
  [brawler.id]: brawler as unknown as CharacterDef,
  [radioYap.id]: radioYap as unknown as CharacterDef,
  [gastroSian.id]: gastroSian as unknown as CharacterDef,
  [bin.id]: bin as unknown as CharacterDef,
  [lawyerVd.id]: lawyerVd as unknown as CharacterDef,
  [lossy.id]: lossy as unknown as CharacterDef,
  [lewd.id]: lewd as unknown as CharacterDef,
  [yao.id]: yao as unknown as CharacterDef,
};

export const CHARACTER_LIST: CharacterDef[] = Object.values(CHARACTERS);

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`Unknown character id: ${id}`);
  return c;
}
