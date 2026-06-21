# Bro Fighters

An LF2-style 2.5D local PvP brawler for in-person couch sessions. Browser-based,
gamepad-driven, built for N fighters in a free-for-all.

> Project context and rules live in [CLAUDE.md](CLAUDE.md). Character data format is
> documented in [CHARACTERS.md](CHARACTERS.md).

## Run it

```bash
npm install
npm run dev        # opens http://localhost:5173
```

- **Windows quick start:** double-click `Start Bro Fighters.bat`. See
  [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for desktop shortcut instructions.
- **Join screen:** each input source taps **jump** to join, **block** to leave, **punch**
  to start (needs 2+ players).
- **Keyboard P1:** `WASD` move · `J` punch · `L` block · `Space` jump
- **Keyboard P2:** `Arrows` move · `Numpad1` punch · `Numpad3` block · `Numpad0` jump
- **Gamepads:** auto-join. Left stick / d-pad move · `A` jump · `X` punch · `Y` block.
- **Special (Template Guy / Radio Yap):** `block + back + jump` → Rising Fist
  (knockdown).
- `F1` / `` ` `` toggles hit/hurtbox debug overlay. `Esc` returns to the join screen.

## Scripts

| command          | what it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run dev`    | Vite dev server                               |
| `npm run build`  | typecheck (`tsc --noEmit`) + production build  |
| `npm test`       | headless sim tests (determinism + combat)     |

## Architecture

The non-negotiable constraints from [CLAUDE.md](CLAUDE.md) are honoured from the start:

- **Deterministic simulation.** The whole world advances via a single
  `step(state, inputs)` at a fixed **60 Hz**. Same start + same inputs ⇒ identical
  result. No wall-clock, no render-framerate coupling, no unseeded randomness (a seeded
  PRNG lives inside the sim state).
- **Input-driven.** Each tick the sim consumes only a `{ playerId: InputState }` map.
- **Sim / render fully separated.** [`src/sim/`](src/sim) has **zero** DOM/render
  dependencies and runs headless (that's what the tests do). The renderer only reads
  sim state and interpolates between ticks.
- **N entities, never P1/P2.** Fighters are a list of N entities everywhere.
- **2.5D coordinates.** Every fighter has `(x, depth, height)`; hits test proximity in
  x **and** depth plus height overlap; draw order sorts by depth.

These also keep an optional authoritative-server netcode path open later without a
rewrite — but online play is **not** built and not on the default path.

### Layout

```
src/
  sim/              # headless, deterministic, dependency-free
    step.ts         #   the step(state, inputs) core
    world.ts        #   initial state / spawns / round reset
    types.ts        #   GameState, Fighter
    input.ts        #   InputState + command tokens
    prng.ts         #   seeded PRNG (mulberry32)
    constants.ts    #   physics & tuning
    characters/     #   data-driven fighters (JSON + registry)
  render/
    renderer.ts     # canvas renderer (reads sim, interpolates)
  input/
    keyboard.ts     # keyboard sources (two layouts)
    gamepad.ts      # Gamepad API source (1 pad = 1 player)
    inputManager.ts # enumerates players, builds the input map
  main.ts           # fixed-timestep loop, join stub, round flow
test/
  determinism.test.ts
```

## Milestone status

**Milestone 1 — complete.** Scaffold, deterministic `step()` core, per-fighter state
machine, frame-driven animation, hitbox/hurtbox collision + hit resolution, gamepad +
keyboard input for N players, data-driven reference characters (`Template Guy` and
`Radio Yap`) with punch / 3-hit combo / special, menus, and round flow (health to
zero = round over → auto-reset).
