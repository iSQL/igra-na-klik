# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Igra Na Klik** — a self-hosted AirConsole-style party game platform. One device is the "host" (TV/big screen, `localhost:5173`), players join from phones as "controllers" (`localhost:5174`) via 4-letter room code or QR. Real-time via Socket.io. Ships with seven games: Kviz (quiz), Crtaj i pogodi (draw & guess), Lažov (Fibbage-style bluffing), Slepi telefoni (Telestrations / Gartic Phone-style drawing chain), Pogodi gde je (GeoGuessr-style location guessing on a map of Serbia), Foto kviz (multiple-choice photo quiz that reuses the same geo-packs), and Ko sam ja (personal-question party game where players guess each other's answers). Lažov, Slepi telefoni, Pogodi gde je, Foto kviz, and Ko sam ja are Serbian-only content.

## Commands

Runs from the repo root (npm workspaces):

```bash
npm install                 # install all workspace deps (do once)
npm run build:shared        # build @igra/shared — REQUIRED before dev/build (host & server import its compiled dist)
npm run dev                 # build:shared, then concurrently run server + host + controller
npm run dev:server          # just the server (tsx watch)
npm run dev:host            # just the host (Vite)
npm run dev:controller      # just the controller (Vite)
npm run build               # full production build of all 4 packages
npm run clean               # rimraf dist/ and node_modules/
```

No test runner, no linter configured. "Testing" means `npm run dev` and exercising the flow in two browser tabs (host + controller).

There is no single-test command because there are no tests. If you add a test harness, document the invocation here.

## Architecture

### Monorepo layout

Four npm workspaces under `packages/`:

- **`@igra/shared`** — pure TypeScript, compiled with `tsc -b` to `dist/`. Single source of truth for types, constants, socket event contracts, and the `GAME_DEFINITIONS` registry. Host, controller, and server all consume its built output, so it MUST be rebuilt (`npm run build:shared`) after type changes before the other packages will pick them up.
- **`@igra/server`** — Node + Express + Socket.io, `tsx watch` in dev. In-memory `Map<string, Room>` (rooms lost on restart — acceptable).
- **`@igra/host`** — React + Vite + Zustand + Framer Motion + Howler.js. Renders on the TV/laptop big screen.
- **`@igra/controller`** — React + Vite + Zustand, installable as a PWA via `vite-plugin-pwa`.

### Socket event contract

[packages/shared/src/types/events.ts](packages/shared/src/types/events.ts) defines `ClientToServerEvents` and `ServerToClientEvents`. This file is the canonical contract between client and server — **every new socket event must go through it** so both sides stay typed. Game-specific events (`quiz:*`, `draw:*`, `fibbage:*`) live alongside the platform events (`host:*`, `player:*`, `room:*`, `game:*`) in the same maps.

### Pluggable game framework

A game is wired up in five places — missing any of them breaks the game end-to-end:

1. **Registry entry** in [packages/shared/src/games/registry.ts](packages/shared/src/games/registry.ts) — `GameDefinition` with `id`, `name`, `minPlayers`, `maxPlayers`, `description`.
2. **Server module** in `packages/server/src/game/games/<game-id>/` implementing `IGameModule` (lifecycle hooks: `onStart`, `onPlayerAction`, `onTick`, `onPlayerDisconnect`, `onEnd`). Extend `BaseGameModule` for no-op defaults.
3. **Server registration** in [packages/server/src/socket/setup.ts](packages/server/src/socket/setup.ts) — adds the module instance to the `GameRegistry`.
4. **Host component** in `packages/host/src/games/<game-id>/` plus a lazy entry in [packages/host/src/games/registry.ts](packages/host/src/games/registry.ts).
5. **Controller component** in `packages/controller/src/games/<game-id>/` plus a lazy entry in [packages/controller/src/games/registry.ts](packages/controller/src/games/registry.ts).

`GameManager` on the server runs a 1-second tick loop, routes `game:player-action` through `onPlayerAction`, and emits `game:state-update` (full state to host) vs `game:player-state` (per-player, private data only — don't leak other players' private state). The host and controller each have a `GameRouter` that reads `gameId` from the gameStore and dynamic-imports the matching component.

### Room / reconnection

- Room codes: 4 uppercase chars excluding `O/I/L` (ambiguous). See [packages/shared/src/utils/room-code.ts](packages/shared/src/utils/room-code.ts).
- Reconnect tokens (UUIDs) are stored in the controller's `localStorage` and passed via `socket.handshake.auth`. On disconnect, the server starts a **5-minute** grace timer (`RECONNECT_GRACE_MS` in [packages/shared/src/constants.ts](packages/shared/src/constants.ts)) — long enough that a phone screen going dark mid-round doesn't lose the seat. Reconnecting within the window restores the player's seat, score, and active game state (the current phase is replayed so the controller jumps straight back into the round).
- Two distinct disconnect events: `room:player-left` is the **transient** "grey out" signal that fires immediately on disconnect, while `room:player-removed` is **permanent** — fires only after grace expires or the host kicks. Game modules' destructive `onPlayerDisconnect` work (skipping a drawer's turn etc.) is deferred until the grace window expires, so brief blips don't burn turns.
- Controller acquires a screen Wake Lock (`useWakeLock`) while in a room to keep the screen alive on most browsers; ignore failures — older browsers/iOS Safari may not grant it.
- **Kick / reclaim**: host has an × on each player chip → emits `host:kick-player`, server invalidates the reconnect token and emits `room:kicked` to that controller (which leaves the room). Conversely, if a returning player has lost their token (cleared cache, incognito, was kicked-then-rejoining), a fresh `player:join-room` with the same name will **reclaim** a disconnected slot — score and avatar are preserved and a new reconnect token is minted.
- Rooms are **not** auto-deleted when the last player leaves — the room belongs to the host. Only the host disconnecting (or explicit cleanup) removes the room.

### Mobile admin / remote host

Any one player can claim the host's controls from their phone via `player:claim-remote-host`; the server stores `remoteHostPlayerId` on the room and broadcasts `room:remote-host-changed`. While held, that controller renders [packages/controller/src/screens/GameSelectScreen.tsx](packages/controller/src/screens/GameSelectScreen.tsx) — a phone-friendly mirror of the host's game-select screen — and can start/stop games, import question packs, choose geo-packs, etc. Releasing (`player:release-remote-host`) or disconnecting clears the claim. Useful when nobody is near the TV; it is **not** a separate role — the holder is still a normal player in whatever game they start.

### Drawing data flow (Crtaj i pogodi)

Controller collects touch points in **normalized 0–1 coordinates**, batches every ~50ms, emits `draw:stroke-data`, server re-broadcasts to host + guessers. Host canvas scales the normalized points back up to its actual size. Don't send absolute pixel coordinates — devices have different aspect ratios.

### Custom quiz questions

The host's game-select screen accepts a JSON file of `{text, options, correctIndex, timeLimit?}` entries. Imported packs **replace** the built-in bank for the session and persist in the host's `localStorage`. Sample packs live in [question-packs/](question-packs/). Validation rules (options length 2–4, `timeLimit` 5–60s) are in the import path — mirror them if you add other custom-content importers.

### Geo packs (Pogodi gde je)

Pogodi gde je serves location packs from a server-side directory (default `geo-packs/` at the repo root, override via `GEO_PACKS_DIR`). Each pack is `<id>.json` plus a sibling `<id>/` folder with images. Server endpoint `GET /api/geo-packs` lists summaries (without lat/lng — clients must not be able to peek). Static images are served at `/geo-images/<id>/<file>`. Validation rules (1–100 locations, lat ∈ [41.5, 46.5], lng ∈ [18.5, 23.5], optional district from `SerbianDistrict` enum, caption ≤ 200 chars) live in [packages/shared/src/games/geo-import.ts](packages/shared/src/games/geo-import.ts). The game also has a custom mode where players upload photos from the controller — those are downscaled (~1280px JPEG q=0.7) and held in the server module's in-memory state for the session only.

The map is a static SVG of Serbia at [packages/host/src/games/geo-pogodi/assets/serbia.svg](packages/host/src/games/geo-pogodi/assets/serbia.svg) (and a parallel copy in the controller package). The placeholder shipped is a rough outline; replace with a real SVG generated from a public-domain GeoJSON (see the assets/README.md). Pin coordinates flow as normalized SVG `{x, y}` ∈ [0, 1] and are reprojected to lat/lng on the server via [packages/shared/src/games/serbia-projection.ts](packages/shared/src/games/serbia-projection.ts) before haversine-distance scoring. If you swap the SVG, recalibrate the affine projection constants in that file.

### Foto kviz (multiple-choice variant)

Foto kviz reuses the entire `geo-packs/` infrastructure — same `GET /api/geo-packs`, same `/geo-images/...` static mount, same `useGeoConfigStore` and `GeoPackButton` on the host, same `downscaleImage` helper on the controller. Per-round questions are built in [packages/server/src/game/games/foto-kviz/FotoKvizModule.ts](packages/server/src/game/games/foto-kviz/FotoKvizModule.ts): the location's `caption` is the correct answer; 3 distractors are sampled from other locations' captions. Speed-scoring formula and phase pattern (`showing-photo → answering → showing-results`) mirror Quiz. Predefined packs need ≥4 captioned locations; custom mode requires ≥2 players AND ≥4 photos total.

### Ko sam ja (personal-question game)

Ko sam ja is a Kviz/Lažov hybrid where each round is about a *subject* player (round-robin assigned at game start) and others guess what the subject answered. Lives in [packages/server/src/game/games/ko-sam-ja/](packages/server/src/game/games/ko-sam-ja/). Phase machine: `collecting-upfront → [showing-question → (subject-picking for peer/pickN only) → guessing → showing-results → leaderboard] × N → ended`. Scoring: Quiz time-based formula for guessers + `+200 per wrong guess` flat bonus to the subject.

Four question shapes (discriminated by the `shape` field; validator at [packages/shared/src/games/ko-sam-ja-import.ts](packages/shared/src/games/ko-sam-ja-import.ts)):
- `fixed` — 2–4 author-supplied options, answered privately during the one-time upfront collection phase.
- `peer` — without `options`: text must contain `{peer1}`/`{peer2}` and server auto-generates two peer-name buttons. With `options`: 2–4 author-written buttons that may contain `{peer1}`/`{peer2}`/`{subject}` placeholders. Answered just-in-time during `subject-picking` after two random co-players are bound.
- `free` — subject types a free-text answer upfront; server samples 3 distractors from other players' free-text answers (falls back to `KO_SAM_JA_FREE_FALLBACK` bank when the pool is thin).
- `pickN` — server expands one button per connected co-player up to `maxPeers` (default 4). Optional `optionTemplate` like `"sa {peer}"` wraps each button; optional `extraOptions` (1–4 literal non-peer buttons that may reference `{subject}`) gets appended and the merged list is shuffled.

Custom packs live in `ko-sam-ja-packs/` at the repo root (override via `KO_SAM_JA_PACKS_DIR`). Server endpoint `GET /api/ko-sam-ja-packs` lists summaries; host UI in [packages/host/src/components/KoSamJaImportButton.tsx](packages/host/src/components/KoSamJaImportButton.tsx) mirrors the Quiz import flow (file picker + server-pack dropdown, persists in `localStorage` under `igra-ko-sam-ja-custom`). Host's game-select card carries an additional `family`/`nsfw` toggle (persisted via [packages/host/src/store/koSamJaConfigStore.ts](packages/host/src/store/koSamJaConfigStore.ts)) — both fields are sent via `host:start-game`'s `koSamJaCategory` / `customKoSamJaQuestions` payload extensions and re-validated server-side. Built-in default bank (family-only) lives in [packages/shared/src/games/ko-sam-ja-questions.ts](packages/shared/src/games/ko-sam-ja-questions.ts).

### Cross-game reliability patterns

Two recurring server-side patterns worth knowing about when touching any game module:

- **Snapshot-based early-exit** — in submission/answer collection phases (Quiz `answering`, Fibbage `writing-answers`/`voting`, Foto Kviz `answering`, Ko sam ja `collecting-upfront`/`guessing`), each module snapshots the set of expected player IDs at phase entry and uses that set for "did everyone answer?" checks. Disconnected mid-grace players stay in the snapshot — round runs until they reconnect-and-answer or the timer expires. Past-grace removal (via `onPlayerDisconnect`, which `setup.ts` fires only after the 5-minute grace timer) prunes the snapshot so the round can early-exit again. Without this, a phone screen sleep mid-round used to "shrink the denominator" and steal an answering slot from a player about to reconnect.
- **Per-game score reset** — [packages/server/src/game/GameManager.ts](packages/server/src/game/GameManager.ts) `startGame` zeroes every `player.score` before calling `module.onStart`. Each game is its own match; don't re-implement a score-reset inside the module.

### Serbian-only content

Lažov, Slepi telefoni, Pogodi gde je, Foto kviz, and Ko sam ja are Serbian-only (Latin script) by design — strings are hardcoded in their host/controller components. Other games and platform UI are in English. A full i18n retrofit (e.g. `react-i18next` with `locales/sr/*.json`) is planned but not done; don't invent a half-finished i18n layer when touching these games.

## LAN / single-room modes

For real-phone testing, create a root `.env` with `HOST_ORIGIN=http://<LAN-IP>:5173` and `CONTROLLER_ORIGIN=http://<LAN-IP>:5174` so CORS accepts LAN origins. Vite dev servers already bind `0.0.0.0`. Set `SINGLE_ROOM_MODE=true` (root `.env`) plus `VITE_SINGLE_ROOM=true` (`packages/controller/.env`) to let controllers auto-fetch the active room code so players only type a name. See [README.md](README.md) for full instructions.

## Environment variables

- `QUESTION_PACKS_DIR` — directory of `.json` quiz packs (default `question-packs/`).
- `GEO_PACKS_DIR` — directory of geo-pack manifests + image folders (default `geo-packs/`).
- `KO_SAM_JA_PACKS_DIR` — directory of `.json` Ko sam ja packs (default `ko-sam-ja-packs/`).
- `HOST_ORIGIN` / `CONTROLLER_ORIGIN` — CORS origins for LAN play.
- `SAME_ORIGIN_DEPLOY=true` — single-container deploy (host + controller served from server).
- `SINGLE_ROOM_MODE=true` (+ `VITE_SINGLE_ROOM=true` for controller) — auto-fill the active room code.

## Gotchas

- After editing any file in `@igra/shared`, run `npm run build:shared` (or restart `npm run dev`, which does it first) before the server/host/controller will see the changes — they import from `dist/`, not `src/`.
- Windows shell: bash is expected, not cmd/PowerShell. Use forward slashes and Unix idioms.
- `packages/server` is ESM (`"type": "module"`); imports inside compiled output need `.js` extensions. `tsx` handles this in dev; `tsc` needs correctly-written imports.
