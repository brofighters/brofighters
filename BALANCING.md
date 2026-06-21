# BALANCING.md - Gameplay Tuning

This file is the quick reference for balancing Bro Fighters characters.

There are two kinds of balance values:

- Global game-feel values live in `src/sim/constants.ts`.
- Per-character values live in each character file, for example `src/sim/characters/brawler.json`.

Prefer changing per-character values when one fighter should feel different. Change global constants only when the whole game should feel different.

## Global Values

Edit `src/sim/constants.ts` for values shared by everyone:

| Value | What it controls |
| --- | --- |
| `GRAVITY` | How quickly all fighters fall. |
| `DEFAULT_WALK_SPEED_X` | Fallback left/right walk speed. |
| `DEFAULT_WALK_SPEED_DEPTH` | Fallback up/down field speed. |
| `DEFAULT_RUN_SPEED_X` | Fallback double-tap run speed. |
| `DEFAULT_JUMP_VELOCITY` | Fallback regular jump height. |
| `REGULAR_JUMP_FORWARD_SPEED_X` | Fallback forward movement during a normal jump. |
| `REGULAR_JUMP_FORWARD_SPEED_DEPTH` | Fallback depth movement during a normal jump. |
| `DOUBLE_JUMP_DASH_SPEED_X` | Fallback forward movement during dash-jump. |
| `DOUBLE_JUMP_DASH_SPEED_DEPTH` | Fallback depth movement during dash-jump. |
| `DOUBLE_JUMP_DASH_HEIGHT` | Fallback dash-jump height. |
| `DOUBLE_JUMP_DASH_GRAVITY` | Fallback dash-jump gravity. Lower values make the dash flatter and longer. |
| `DOUBLE_JUMP_DASH_DISTANCE_MULTIPLIER` | Fallback dash-jump x distance compared with a regular forward jump. |
| `DOUBLE_JUMP_WINDOW_TICKS` | Time after landing from a normal jump where jump becomes dash-jump. |
| `DOUBLE_JUMP_RECOVERY_TICKS` | Recovery lockout after landing from dash-jump. |
| `RUN_DOUBLE_TAP_TICKS` | How fast a second left/right tap must be to start running. |
| `MAX_HEALTH` | Fallback full HP. |
| `HITSTOP_TICKS` | Brief freeze when a hit connects. |
| `KNOCKDOWN_GET_UP_TICKS` | How long a knocked-down fighter stays down. |

The sim runs at 60 ticks per second, so `6` ticks is `0.1` seconds and `12` ticks is `0.2` seconds.

## Per-Character Values

Edit a character JSON file such as `src/sim/characters/brawler.json` for fighter-specific balance:

| Field | What it controls |
| --- | --- |
| `maxHealth` | Full HP. If omitted, uses `MAX_HEALTH`. |
| `body.w` | Body width / default hurtbox width. |
| `body.d` | Body depth / how easy the fighter is to hit in the field. |
| `body.h` | Body height / default hurtbox height. |
| `walkSpeedX` | Left/right walk speed. |
| `walkSpeedDepth` | Up/down field movement speed. |
| `runSpeedX` | Double-tap run speed. |
| `jumpVelocity` | Regular jump height. |
| `regularJumpForwardSpeedX` | Forward movement during a normal forward jump. |
| `regularJumpForwardSpeedDepth` | Depth movement during a normal diagonal jump. |
| `doubleJumpDashSpeedX` | Forward dash-jump distance/speed. |
| `doubleJumpDashSpeedDepth` | Depth movement during dash-jump. |
| `doubleJumpDashHeight` | Dash-jump vertical height. |
| `doubleJumpDashGravity` | Dash-jump gravity. Lower values increase airborne time and total distance. |
| `doubleJumpDashDistanceMultiplier` | Horizontal dash-jump distance compared with a regular forward jump. |

## Attack Values

Attack tuning lives on each active `hitbox` inside `frames`.

| Hitbox Field | What it controls |
| --- | --- |
| `x` | How far in front of the fighter the hitbox appears. Bigger means more reach. |
| `z` | Where the hitbox sits in depth. Usually `0`. |
| `h` | Height of the hitbox center. |
| `w` | Melee range / half-width in front-back space. |
| `d` | Depth range / how forgiving the move is up/down the field. |
| `hh` | Vertical range / how well it hits jumping or crouched targets. |
| `damage` | HP removed on hit. |
| `hitstun` | How long the victim cannot act. |
| `knockbackX` | Horizontal pushback. |
| `knockbackH` | Upward launch. |
| `knockdown` | Whether the hit knocks the victim down. |

Frame timing also affects balance:

| Frame Field | What it controls |
| --- | --- |
| `durationTicks` | Startup, active, and recovery timing depending on which frame it is. |
| `cancelInto` | Combo timing window for chaining attacks. |
| `impulse` | Movement added when that frame starts, useful for lunges or rising attacks. |

## Other Useful Balance Knobs

These are not all separate fields yet, but they are worth tracking as characters grow:

- Attack startup: frames before a hitbox appears.
- Active frames: how long a hitbox stays dangerous.
- Recovery: frames after the hitbox disappears before the fighter can act.
- Hurtbox shape: whether a move exposes or protects the fighter.
- Block safety: damage reduction and pushback while blocking.
- Combo routes: which moves can cancel into which follow-ups.
- Special input window: how forgiving a special move sequence is.
- Knockdown/get-up behavior: how long the player loses control.
- Arena movement: whether the character controls depth quickly or slowly.

## Current Baseline

Template Guy is the baseline fighter. When adding a new bro, copy Template Guy's values first, then adjust one or two knobs at a time:

- More HP but slower movement = tank.
- Faster walk/run but lower damage = agile.
- Longer hitboxes but slower startup/recovery = ranged melee.
- Higher damage but shorter range = risky brawler.
- Strong dash-jump but longer recovery = burst movement.
