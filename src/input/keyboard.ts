/**
 * Keyboard input source. Two fixed layouts let two people share one keyboard
 * for testing without gamepads. Real couch play uses the Gamepad API; this is
 * the solo/dev fallback. Produces an InputState — never touches the sim.
 */

import { emptyInput, type InputState } from "../sim/input";

export interface KeyLayout {
  left: string;
  right: string;
  up: string;
  down: string;
  jump: string;
  punch: string;
  kick: string;
  block: string;
}

export type KeyAction = Exclude<keyof KeyLayout, "kick">;

export const LAYOUT_P1: KeyLayout = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  jump: "KeyG",
  punch: "KeyF",
  kick: "KeyF",
  block: "KeyH",
};

export const LAYOUT_P2: KeyLayout = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  jump: "Numpad2",
  punch: "Numpad1",
  kick: "Numpad1",
  block: "Numpad3",
};

export interface KeyboardConfig {
  p1: KeyLayout;
  p2: KeyLayout;
}

export const DEFAULT_KEYBOARD_CONFIG: KeyboardConfig = {
  p1: { ...LAYOUT_P1 },
  p2: { ...LAYOUT_P2 },
};

export function cloneLayout(layout: KeyLayout): KeyLayout {
  return { ...layout };
}

export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Numpad ${code.slice(6)}`;
  return KEY_LABELS[code] ?? code;
}

export class Keyboard {
  private pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      this.pressed.add(e.code);
      // Prevent the page from scrolling on arrows / space during play.
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    });
    target.addEventListener("keyup", (e) => this.pressed.delete(e.code));
    // Dropping focus shouldn't leave keys stuck down.
    target.addEventListener("blur", () => this.pressed.clear());
  }

  sample(layout: KeyLayout): InputState {
    const s = emptyInput();
    s.left = this.pressed.has(layout.left);
    s.right = this.pressed.has(layout.right);
    s.up = this.pressed.has(layout.up);
    s.down = this.pressed.has(layout.down);
    s.jump = this.pressed.has(layout.jump);
    s.punch = this.pressed.has(layout.punch);
    s.kick = this.pressed.has(layout.kick);
    s.block = this.pressed.has(layout.block);
    return s;
  }
}

const PREVENT_DEFAULT = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

const KEY_LABELS: Record<string, string> = {
  Space: "Space",
  ArrowLeft: "Left Arrow",
  ArrowRight: "Right Arrow",
  ArrowUp: "Up Arrow",
  ArrowDown: "Down Arrow",
};
