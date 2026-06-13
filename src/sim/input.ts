/**
 * Input model. Each logic tick the simulation consumes a map of
 * { playerId: InputState } and NOTHING else. InputState is the raw per-tick
 * button state for one player; the sim derives rising edges and discrete
 * command tokens (used for combos and specials) from successive InputStates.
 */

export interface InputState {
  left: boolean;
  right: boolean;
  /** up the field = away from camera (depth decreases / drawn further back) */
  up: boolean;
  /** down the field = toward camera (depth increases) */
  down: boolean;
  jump: boolean;
  punch: boolean;
  kick: boolean;
  block: boolean;
}

export type InputMap = Record<number, InputState>;

export function emptyInput(): InputState {
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

/** Directional / action tokens used when matching combo & special sequences.
 *  Direction tokens are facing-relative (forward/back), resolved in step(). */
export type CommandToken =
  | "forward"
  | "back"
  | "up"
  | "down"
  | "jump"
  | "punch"
  | "kick"
  | "block";

export interface BufferedCommand {
  token: CommandToken;
  tick: number;
}
