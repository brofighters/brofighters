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
export const RUN_DOUBLE_TAP_TICKS = 15; // 0.25 seconds at 60 Hz
export const DEFAULT_RUN_SPEED_X = 6.2;
export const REGULAR_JUMP_FORWARD_SPEED_X = 5.5;
export const REGULAR_JUMP_FORWARD_SPEED_DEPTH = 2.4;
export const DOUBLE_JUMP_WINDOW_TICKS = 6; // 0.1 seconds at 60 Hz
export const DOUBLE_JUMP_RECOVERY_TICKS = 6; // 0.1 seconds at 60 Hz
export const DOUBLE_JUMP_DASH_SPEED_X = 6.875; // 1.25x regular forward jump speed
export const DOUBLE_JUMP_DASH_SPEED_DEPTH = 3; // 1.25x regular diagonal jump depth speed
export const DOUBLE_JUMP_DASH_HEIGHT = 5;
export const DOUBLE_JUMP_DASH_GRAVITY = 0.36; // flatter arc so dash travels about 2x farther
export const DOUBLE_JUMP_DASH_DISTANCE_MULTIPLIER = 1.5;

/** Combat tuning. */
export const HITSTOP_TICKS = 3; // brief freeze on both fighters when a hit lands
export const KNOCKDOWN_GET_UP_TICKS = 40;
export const MAX_HEALTH = 500;

/** Command-buffer window: how long a discrete input token lives for combo/special matching. */
export const COMMAND_BUFFER_TICKS = 30;

/** Ticks after round end before an automatic reset. */
export const ROUND_RESET_TICKS = 180;
