/**
 * Simulation constants. All units are in simulation space and per-logic-tick
 * (the sim runs at a FIXED 60 Hz — see TICK_HZ). Nothing here depends on the
 * render framerate or wall-clock time.
 */

export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ; // seconds per logic tick (for reference only)

/** Arena bounds in sim units. x = left/right, depth = field near/far. */
export const ARENA = {
  xMin: 40,
  xMax: 1680,
  depthMin: 0, // far (drawn behind)
  depthMax: 200, // near (drawn in front)
};

/** Ground is height 0; positive height is "up" (a jump). */
export const GROUND_HEIGHT = 0;

/** Gravity pulls height-velocity down each tick. */
export const GRAVITY = 0.9;

/** Default movement (overridable per character). */
export const DEFAULT_WALK_SPEED_X = 4.2;
export const DEFAULT_WALK_SPEED_DEPTH = 2.6;
export const DEFAULT_JUMP_VELOCITY = 14;

/** Combat tuning. */
export const HITSTOP_TICKS = 3; // brief freeze on both fighters when a hit lands
export const KNOCKDOWN_GET_UP_TICKS = 40;
export const MAX_HEALTH = 100;

/** Command-buffer window: how long a discrete input token lives for combo/special matching. */
export const COMMAND_BUFFER_TICKS = 30;

/** Ticks after round end before an automatic reset. */
export const ROUND_RESET_TICKS = 180;
