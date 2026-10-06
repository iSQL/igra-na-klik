---
paths:
  - "packages/server/src/game/games/bedem/**"
  - "packages/host/src/games/bedem/**"
  - "packages/controller/src/games/bedem/**"
  - "packages/shared/src/games/bedem-rules.ts"
  - "packages/shared/src/types/bedem.ts"
  - "scripts/test-bedem.mts"
---

# Bedem

**Bedem** — tower defense whose **whole map is on every phone** (`supportsHostless: true`; the TV only shows it bigger). Enemies walk a fixed path on a portrait grid (8×12, or 9×14 for 4+ builders in `zajedno`, `bedemLayoutsFor`); players tap an empty cell to build one of four towers (Strelac / Katapult / Ledena kula / Munja, three levels each, selling refunds 70%). Two choices ride `host:start-game`, both re-clamped server-side: **`bedemMode`** — `zajedno` (one shared map and gate, everyone builds anywhere with their own gold, only the owner upgrades/sells) or `protiv` (a map each, same waves; during a wave you buy `bedem:send` units that walk onto an opponent's map after `BEDEM_SEND_DELAY_MS` and permanently raise your per-wave income) — and **`bedemLength`** — `kratko` 7 / `standard` 10 / `beskonacno` (until the gate falls; `BEDEM_ENDLESS_CAP` is only a stuck-game guard).

**Coordinates are cell units and an enemy is one number**: `dist` along the path polyline through cell centres (`bedemPathPoint`). That keeps the simulation trivial and the frame tiny, and both screens rebuild x/y with the same shared helper. Path waypoints start one row above the grid and end one row below it (entrance / gate).

**Simulation** is a step function over one map ([sim.ts](../../packages/server/src/game/games/bedem/sim.ts)): arrivals → movement and leaks → towers (target = furthest along the path in range). **Projectiles are not simulated** — a hit lands on the step it's fired and the screens draw the tracer from the frame's `shots`. Armour subtracts flat damage but never more than `1 - BEDEM_ARMOR_FLOOR` of a hit; Munja pierces it and chains; slows don't stack (strongest wins, clock refreshes). The module owns gold, score, phases and the snapshot of who's "Spreman".

**Wire**, same design as Splav: 50 ms fast tick, `game:frame` ~10/s (`BedemFrame`: per map enemies/shots/lives/leaks, plus everyone's gold — gold moves on every kill). Full `GameState` only on phase changes, a gate falling, and build/upgrade/sell/send/ready actions (unlike Splav those *do* return a state — a handful per minute, and every phone must see the new tower). Phones and TV subscribe to `game:frame` **directly**, never through the store; gold is "whichever arrived last" of frame vs state. The renderer [bedemBoard.ts](../../packages/controller/src/games/bedem/bedemBoard.ts) is an **identical copy** in host and controller (change both) — canvas 2D, renders `BEDEM_RENDER_DELAY_MS` behind live and interpolates `dist`, redraws only while something moves.

**Phases**: `uvod` → (`gradnja` → `talas`) × N → `kraj` → `ended`. `gradnja` ends on its clock or when the snapshot is all ready; building is also allowed during `talas`. A wave ends when every living map has no enemies and no queued spawns (sent units sit in the same queue, so a wave can't end under them). Flow: skip = "Pokreni talas" and "ne čekaj" exist **only in `gradnja`**; no `onResume` needed (nothing uses `Date.now()`). Past-grace disconnect: `protiv` → that gate falls; `zajedno` → their towers stay for the team.

**Scoring**: bounty per kill to the tower's owner, `BEDEM_WAVE_POINTS` per wave your gate survives, `BEDEM_WIN_POINTS` to all when `zajedno` holds, place points in `protiv` (dominate on purpose), and 5 points per life a sent unit takes. Wave composition is the pure `bedemWave(n, players)`; HP grows as `1.2^(n-1)` (gentle early, then outgrows any economy — that's what ends endless) times `bedemTeamHpScale` on the shared map.

**Balance** was tuned with `npx tsx scripts/test-bedem.mts --balance` (drives `BedemModule` directly with a fake room, hundreds of games in seconds; `--trace [--players n --length x --mode m]` prints one game wave by wave). Targets: a greedy bot holds `standard` with lives to spare but not untouched, a passive team falls by wave 2, endless ends around waves 14–20. Re-run before changing the numbers in `bedem-rules.ts`. Without flags the script also does socket passes for both modes (in-process server + bots; checks phases, towers firing, send warnings, diplomas, ~10 frames/s and rare full states).
