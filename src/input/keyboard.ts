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

export const LAYOUT_P1: KeyLayout = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  jump: "Space",
  punch: "KeyJ",
  kick: "KeyK",
  block: "KeyL",
};

export const LAYOUT_P2: KeyLayout = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  jump: "Numpad0",
  punch: "Numpad1",
  kick: "Numpad2",
  block: "Numpad3",
};

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
