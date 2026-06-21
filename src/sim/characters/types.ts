/**
 * Character definition schema. Characters are DATA, not code: the engine reads
 * these definitions, so adding a fighter means adding a sprite sheet + a data
 * file with no engine changes. See CHARACTERS.md for the documented shape.
 *
 * Only sim-relevant data lives here (frame timing, boxes, movement, moves).
 * The `spriteSheet` path and `spriteRect` are consumed by the renderer only;
 * the simulation never touches an image.
 */

/** An axis-aligned box in the fighter's local space, relative to its origin
 * (feet center). +x is "forward" for a right-facing fighter and is mirrored
 * automatically by facing. */
export interface Box {
  /** forward offset from origin (mirrored by facing) */
  x: number;
  /** depth half-extent center offset */
  z: number;
  /** height offset from feet (positive = up) */
  h: number;
  /** half-width in x */
  w: number;
  /** half-extent in depth */
  d: number;
  /** half-extent in height */
  hh: number;
}

export interface HitBox extends Box {
  damage: number;
  /** hitstun applied to the victim, in ticks */
  hitstun: number;
  /** knockback in forward x (attacker-relative) */
  knockbackX: number;
  /** knockback in height (launch) */
  knockbackH: number;
  /** if true, victim is knocked down */
  knockdown?: boolean;
}

export interface Frame {
  id: string;
  /** [sx, sy, sw, sh] into the sprite sheet. Renderer-only. */
  spriteRect: [number, number, number, number];
  /** placeholder fill colour while real sprites don't exist. Renderer-only. */
  placeholderColor?: string;
  durationTicks: number;
  hitboxes?: HitBox[];
  hurtboxes?: Box[];
  /** one-shot velocity impulse applied when this frame is entered */
  impulse?: { x?: number; h?: number; z?: number };
  /** frame ids / move names this frame may cancel into (e.g. next combo hit) */
  cancelInto?: string[];
}

export type ControlMode = "free" | "locked";

export interface StateDef {
  /** ordered frame ids forming this state's animation */
  frames: string[];
  /** loop the animation (idle/walk) vs play once (attacks) */
  loop?: boolean;
  /** free = player can move/act; locked = committed (attacks, hitstun) */
  control: ControlMode;
  /** state to transition to when a non-looping animation finishes */
  next?: string;
  /** if true this state's frames carry hitboxes (an attack) */
  attack?: boolean;
}

export interface Special {
  name: string;
  /** discrete input tokens, in order. Tokens: forward,back,up,down,jump,punch,kick,block */
  inputSequence: string[];
  /** how many ticks the whole sequence may span */
  windowTicks: number;
  /** state to enter when the sequence matches */
  state: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** character-select portrait path, renderer-only. */
  portrait?: string;
  /** sprite sheet path, renderer-only. May be null for placeholder rendering. */
  spriteSheet: string | null;
  /** body half-extents used for the default hurtbox and body collision */
  body: { w: number; d: number; h: number };
  /** optional; defaults to MAX_HEALTH */
  maxHealth?: number;
  walkSpeedX?: number;
  walkSpeedDepth?: number;
  runSpeedX?: number;
  jumpVelocity?: number;
  regularJumpForwardSpeedX?: number;
  regularJumpForwardSpeedDepth?: number;
  doubleJumpDashSpeedX?: number;
  doubleJumpDashSpeedDepth?: number;
  doubleJumpDashHeight?: number;
  doubleJumpDashGravity?: number;
  doubleJumpDashDistanceMultiplier?: number;
  frames: Frame[];
  states: Record<string, StateDef>;
  /** ground combo chain: pressing the key again during a cancel window advances */
  combos?: Record<string, string[]>;
  specials: Special[];
}
