/**
 * Gamepad input source via the browser Gamepad API. Each connected pad is one
 * player. Uses the "standard" mapping when available; movement comes from the
 * left stick or the d-pad, actions from the face buttons.
 *
 *   A (0) = jump    B (1) = kick    X (2) = punch    Y (3) = block
 */

import { emptyInput, type InputState } from "../sim/input";

const DEADZONE = 0.4;

export function connectedGamepadIndices(): number[] {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const out: number[] = [];
  for (const p of pads) if (p) out.push(p.index);
  return out;
}

export function sampleGamepad(index: number): InputState {
  const s = emptyInput();
  const pad = (navigator.getGamepads ? navigator.getGamepads() : [])[index];
  if (!pad) return s;

  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;

  const btn = (i: number) => !!pad.buttons[i]?.pressed;

  // Movement: stick OR d-pad (12 up, 13 down, 14 left, 15 right).
  s.left = ax < -DEADZONE || btn(14);
  s.right = ax > DEADZONE || btn(15);
  s.up = ay < -DEADZONE || btn(12);
  s.down = ay > DEADZONE || btn(13);

  // Actions.
  s.jump = btn(0); // A
  s.kick = btn(1); // B
  s.punch = btn(2); // X
  s.block = btn(3) || btn(6) || btn(7); // Y or triggers as a comfort option

  return s;
}
