# CHARACTERS.md — Fighter data format

Characters are **data, not code**. The engine reads a character definition; adding a
fighter means adding a sprite sheet + a `<name>.json` data file and registering it in
[`src/sim/characters/index.ts`](src/sim/characters/index.ts). No engine changes.

The authoritative TypeScript types live in
[`src/sim/characters/types.ts`](src/sim/characters/types.ts). This document explains
the shape and the conventions. Only **sim-relevant** fields affect gameplay; sprite
fields (`spriteSheet`, `spriteRect`) are read by the renderer only — the simulation
never touches an image.

## Coordinate & box conventions

The world is 2.5D: `(x, depth, height)`.

- **x** — left/right.
- **depth** — field near/far. Higher depth = nearer the camera, drawn in front.
- **height** — vertical (jumps). Ground is `height = 0`.

All boxes are expressed in the fighter's **local space**, relative to its origin
(the point between its feet), as **half-extents** plus an offset:

| field | meaning |
| ----- | ------- |
| `x`   | forward offset from origin. **Mirrored by facing** (+x is always "in front"). |
| `z`   | depth offset from origin. |
| `h`   | height offset from the feet (positive = up). |
| `w`   | half-width along x. |
| `d`   | half-extent along depth. |
| `hh`  | half-extent along height. |

A hit lands when an attacker **hitbox** overlaps a victim **hurtbox** in x **and**
depth **and** height (3-axis AABB test).

## Top-level schema

```jsonc
{
  "id": "brawler",            // unique key
  "name": "Brawler",          // display name
  "spriteSheet": null,        // renderer-only; null => coloured placeholder
  "body": { "w": 22, "d": 16, "h": 58 },   // half-extents; default hurtbox + footprint
  "walkSpeedX": 4.2,          // optional; sim units per tick (x)
  "walkSpeedDepth": 2.6,      // optional; sim units per tick (depth)
  "jumpVelocity": 14,         // optional; initial upward height velocity

  "frames":   [ /* Frame[]  */ ],
  "states":   { /* name -> StateDef */ },
  "combos":   { /* key  -> [stateName, ...] */ },
  "specials": [ /* Special[] */ ]
}
```

### Frame

A single animation frame with its timing and active boxes.

```jsonc
{
  "id": "p1_1",
  "spriteRect": [0, 0, 0, 0],   // [sx,sy,sw,sh] into the sheet (renderer-only)
  "durationTicks": 4,            // how long this frame is shown (60 Hz ticks)
  "hitboxes":  [ /* HitBox[] — active ONLY while this frame shows */ ],
  "hurtboxes": [ /* Box[]    — overrides the default body hurtbox for this frame */ ],
  "impulse":   { "x": 4, "h": 9, "z": 0 },  // one-shot velocity kick on frame entry
  "cancelInto": ["punch2"]       // moves this frame may cancel into (combo window)
}
```

If a frame has no `hurtboxes`, the default body box is used. A frame's `hitboxes` are
active **only** during that frame, giving you startup / active / recovery timing by
splitting an attack across frames.

### HitBox

A `Box` (the 6 fields above) plus combat properties:

```jsonc
{
  "x": 42, "z": 0, "h": 72, "w": 20, "d": 18, "hh": 16,
  "damage": 6,
  "hitstun": 12,       // ticks the victim is stunned
  "knockbackX": 3,     // pushback along attacker's forward x
  "knockbackH": 0,     // launch (upward height velocity)
  "knockdown": false   // if true, victim is knocked down instead of stunned
}
```

### StateDef

A named state = an animation + behaviour. Required engine state keys:
`idle`, `walk`, `jump`, `block`, `hit`, `knockdown`. Attacks are additional states.

```jsonc
{
  "frames": ["p1_0", "p1_1", "p1_2"],   // ordered frame ids
  "loop": false,         // true = repeat (idle/walk/jump); false = play once
  "control": "locked",   // "free" = player can move/act; "locked" = committed
  "attack": true,        // frames in this state carry hitboxes
  "next": "idle"         // state entered when a non-looping animation ends
}
```

### combos

A combo chain maps an input key to an ordered list of attack states. Pressing the same
button again during a frame whose `cancelInto` lists the next state advances the chain.

```jsonc
"combos": { "punch": ["punch1", "punch2", "punch3"] }
```

### Special

Discrete **key-combo** specials (LF2-style — no motion inputs). Tokens are matched in
order from the player's command buffer within `windowTicks`. Direction tokens are
**facing-relative**: `forward` / `back` resolve against the fighter's current facing.

Valid tokens: `forward`, `back`, `up`, `down`, `jump`, `punch`, `kick`, `block`.

```jsonc
{
  "name": "Rising Fist",
  "inputSequence": ["block", "back", "jump"],
  "windowTicks": 30,
  "state": "special"
}
```

## Adding a fighter

1. Author `src/sim/characters/<id>.json` to this schema.
2. (Optional) add a sprite sheet and fill in `spriteSheet` + each frame's `spriteRect`.
   Until then, fighters render as coloured placeholder rectangles.
3. Import and register it in `src/sim/characters/index.ts`.

That's it — no changes to `step()` or the renderer.
