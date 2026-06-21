# AGENTS.md — LF2-style PvP Brawler

This file is the project context for Codex. Read it at the start of every session.

## What we are building

A 2.5D multiplayer brawler in the spirit of **Little Fighters 2** (NOT Street Fighter — this is a loose, chaotic, free-movement brawler, not a frame-perfect 1v1 fighter). Up to 10 fighters in a free-for-all. Each fighter is one of our real friends (we supply the sprites). Browser-based so we can share a URL.

Combat model: discrete key-combo specials (e.g. block+back+jump), NOT motion inputs (no quarter-circles). Moves: walk, jump, punch, block, simple combos (punch-punch-punch), and 3-4 special moves per character triggered by short input sequences. (LF2 fidelity: 3 action buttons — Attack/Jump/Defend — so there is intentionally NO dedicated kick button. Kicks were removed; if reintroduced later they should come from Attack contextually, e.g. a jump+attack flying kick.)

## Scope right now: PvP only, local couch multiplayer

We are building **versus mode only, running locally on one machine for in-person play sessions**. Multiple players on one screen using game controllers (plus keyboard for testing). This proves the combat feels good before we add anything else.

**Do NOT build yet** (these come later, do not write code or stubs for them now beyond the architecture hooks described below):
- Online networking / internet multiplayer (OPTIONAL FUTURE — not planned, but the architecture below keeps the door open)
- Beat-em-up / stage / campaign mode
- Enemy AI / CPU opponents
- Weapons or item pickups
- Sound polish, menus beyond a basic character select

## NON-NEGOTIABLE architecture constraints

These are good design on their own, and as a bonus they keep optional authoritative-server online play possible later WITHOUT a rewrite. Honor them from the first commit.

1. **Deterministic simulation.** The entire game state advances through a single `step(inputs)` function at a fixed logic timestep (60 Hz). Given the same starting state and the same inputs, it must always produce the same result. No reliance on render framerate, wall-clock time, or unseeded randomness. If randomness is needed, use a seeded PRNG that is part of the simulation state.

2. **Input-driven.** Each logic tick, the simulation consumes a map of `{ playerId: InputState }` and nothing else. All state changes originate from inputs fed into `step()`. Nothing outside the input map may mutate game state.

3. **Simulation / rendering fully separated.** The simulation module has zero DOM or rendering dependencies and could run headless (e.g. later on a Node server). The renderer only READS simulation state and draws it; it never writes to it. The renderer may interpolate between ticks for smoothness.

4. **N entities, never P1/P2.** Model fighters as a list of N entities from the start. Never hardcode two-player assumptions anywhere.

5. **2.5D coordinates.** Every fighter has `(x, depth, height)`: x is left/right, depth is up/down on the field (movement toward/away), height is for jumps. Hit detection is proximity in x AND depth, plus height overlap. Render order is sorted by depth (greater depth drawn behind).

## Tech stack

- **Language:** TypeScript
- **Client:** HTML5 Canvas (2D), bundled with Vite
- **Simulation:** a standalone, dependency-free TS module (`/src/sim/`) that can run in browser or Node
- **Optional future, NOT planned:** Node + WebSocket (`ws`) authoritative server, deployable to Railway. If we ever add online play, clients send inputs, the server runs the same `step()` sim as the authority, and broadcasts state with client-side prediction + interpolation. The architecture above makes this possible without a rewrite. Do not build it now.

## Character data format

Characters are DATA, not code. The engine reads a character definition; adding a fighter should mean adding a sprite sheet + a data file, no engine changes. Sketch the schema as JSON, roughly:

```
{
  "id": "string",
  "name": "string",
  "spriteSheet": "path",
  "frames": [ { "id", "spriteRect", "durationTicks", "hitboxes": [...], "hurtboxes": [...] } ],
  "states": { "idle": {...}, "walk": {...}, "jump": {...}, "punch": {...}, "kick": {...}, "block": {...}, "hit": {...}, "knockdown": {...} },
  "specials": [ { "name", "inputSequence": ["block","back","jump"], "windowTicks", "entryFrame" } ]
}
```
Refine this as you build, but keep it data-driven and document the final shape in a `CHARACTERS.md`.

## MILESTONE 1 — build this now

Goal: two or more fighters can hit each other in the same room and it feels like a fight.

Deliver, in order:
1. Project scaffold: Vite + TypeScript, a fixed-timestep game loop with the sim/render split described above.
2. The `step(inputs)` simulation core: fighter entities with `(x, depth, height)`, gravity, ground collision, movement, jumping.
3. State machine per fighter: idle, walk, jump, punch, kick, block, hitstun, knockdown.
4. Sprite animation system driven by frame data (use coloured placeholder rectangles until real sprites exist).
5. Hitbox/hurtbox collision and hit resolution (damage, hitstun, basic knockback in x/depth).
6. Input layer supporting **game controllers via the browser Gamepad API** (each connected pad = one player) plus a keyboard fallback for solo testing. Map each player's inputs into the `step()` input map. Build for N players, not two.
7. ONE fully working reference character loaded from a data file, with punch, kick, block, a 3-hit combo, and one special move (block+back+jump).
8. A bare character-select stub and a round flow (health to zero = round over, reset).

When Milestone 1 runs and feels good, stop and report. Next milestones (more characters, then feel/balance polish) come after. Online networking stays optional and is not on the default path.

## Working style for Codex

- Keep the simulation pure and testable. Where practical, add a quick headless test that runs `step()` over a fixed input sequence and asserts deterministic output — this is our future netcode insurance.
- Small commits per milestone sub-step.
- Flag immediately if any requested feature would violate the architecture constraints above.
