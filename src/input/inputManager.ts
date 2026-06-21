/**
 * Input manager: enumerates available players (keyboards + connected gamepads)
 * and, given a roster, samples each into the sim's { playerId: InputState } map.
 *
 * Built for N players from the start — there is no P1/P2 special-casing. The
 * sim only ever sees the resulting InputMap.
 */

import type { InputMap, InputState } from "../sim/input";
import { connectedGamepadIndices, sampleGamepad } from "./gamepad";
import {
  Keyboard,
  cloneLayout,
  DEFAULT_KEYBOARD_CONFIG,
  type KeyboardConfig,
  type KeyLayout,
} from "./keyboard";

export type PlayerKind = "keyboard" | "gamepad";

export interface PlayerSource {
  /** stable id used as the key in the sim input map */
  id: number;
  label: string;
  kind: PlayerKind;
  sample: () => InputState;
}

export class InputManager {
  private keyboard = new Keyboard();
  private layouts: KeyboardConfig = {
    p1: cloneLayout(DEFAULT_KEYBOARD_CONFIG.p1),
    p2: cloneLayout(DEFAULT_KEYBOARD_CONFIG.p2),
  };

  setKeyboardConfig(config: KeyboardConfig): void {
    this.layouts = {
      p1: cloneLayout(config.p1),
      p2: cloneLayout(config.p2),
    };
  }

  /** All currently usable input sources, ordered deterministically.
   * Two keyboard layouts are always offered for dev/couch testing; each
   * connected gamepad adds another player. */
  listPlayers(): PlayerSource[] {
    const players: PlayerSource[] = [
      this.kbPlayer(0, "Player 1 Keyboard", this.layouts.p1),
      this.kbPlayer(1, "Player 2 Keyboard", this.layouts.p2),
    ];
    for (const idx of connectedGamepadIndices()) {
      players.push({
        id: 100 + idx,
        label: `Gamepad ${idx + 1}`,
        kind: "gamepad",
        sample: () => sampleGamepad(idx),
      });
    }
    return players;
  }

  private kbPlayer(id: number, label: string, layout: KeyLayout): PlayerSource {
    return {
      id,
      label,
      kind: "keyboard",
      sample: () => this.keyboard.sample(layout),
    };
  }

  /** Sample the given roster into the sim input map for this tick. */
  sample(roster: PlayerSource[]): InputMap {
    const map: InputMap = {};
    for (const p of roster) map[p.id] = p.sample();
    return map;
  }
}
