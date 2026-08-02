# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Igra Na Klik** — a self-hosted AirConsole-style party game platform. One device is the "host" (TV/big screen), players join from their phones as "controllers" via a room code or QR. Real-time over Socket.io. 18 mini-games (plus a `test-game` dev module that is registered server-side but deliberately absent from `GAME_DEFINITIONS`), all content and in-game text in Serbian (Latin) by design.

## Commands

npm workspaces, all run from the repo root:

```bash
npm install                 # once
npm run build:shared        # REQUIRED before dev/build — others import @igra/shared's dist/
npm run dev                 # build:shared, then server + host + controller concurrently
npm run dev:server          # tsx watch
npm run dev:host            # Vite :5173
npm run dev:controller      # Vite :5174
npm run build               # production build of all 4 packages
```

Dev URLs: landing `localhost:3001/`, host `:3001/host/` (or `:5173/host/`), controller `:3001/play/` (or `:5174/play/`), admin `:3001/admin`.

**No test runner and no linter are configured.** "Testing" means `npm run dev` plus exercising the flow in two browser tabs (host + controller). There is no single-test command; if you add a harness, document its invocation here.

The `free-dev-ports` skill ([.claude/skills/free-dev-ports/](.claude/skills/free-dev-ports/)) kills leftover node processes holding 3001/5173/5174.

## Architecture

### Monorepo

- **`@igra/shared`** — pure TS compiled with `tsc -b`. Single source of truth for types, constants, socket event contracts, `GAME_DEFINITIONS`, content validators and built-in content banks. All three other packages consume its **compiled `dist/`**, so it must be rebuilt after any change there.
- **`@igra/server`** — Node + Express + Socket.io, ESM (`"type": "module"` — imports in compiled output need `.js` extensions). Rooms live in an in-memory `Map` and are lost on restart (acceptable).
- **`@igra/host`** — React + Vite + Zustand + Framer Motion + Howler. TV screen, `base: '/host/'`.
- **`@igra/controller`** — React + Vite + Zustand, PWA via `vite-plugin-pwa`, `base: '/play/'`.

### Socket contract

[packages/shared/src/types/events.ts](packages/shared/src/types/events.ts) defines `ClientToServerEvents` / `ServerToClientEvents` — the canonical client↔server contract. **Every new socket event goes through it.** Most gameplay does *not* need a new event: game actions ride the generic `game:player-action` (and host-owned flow control rides `host:game-action`).

### Adding a game — six wiring points

Miss any one and the game breaks end-to-end:

1. `GameDefinition` in [packages/shared/src/games/registry.ts](packages/shared/src/games/registry.ts) (`id`, `name`, min/max players, `supportsHostless`, …).
2. Server module in `packages/server/src/game/games/<id>/` implementing [IGameModule](packages/server/src/game/IGameModule.ts) (`onStart`, `onPlayerAction`, `onTick`, `onPlayerDisconnect`, `onEnd`, plus optional `validateStart`, `onHostAction`, `getAwardCandidates`). Extend `BaseGameModule` for no-op defaults.
3. Register the module in [packages/server/src/socket/setup.ts](packages/server/src/socket/setup.ts).
4. Host component + lazy entry in [packages/host/src/games/registry.ts](packages/host/src/games/registry.ts).
5. Controller component + lazy entry in [packages/controller/src/games/registry.ts](packages/controller/src/games/registry.ts).
6. A `GAME_RULES` entry in [packages/server/src/uputstva-page.ts](packages/server/src/uputstva-page.ts) — the public `/uputstva` hub lists only games that have one, so the game silently disappears from it otherwise.

Optional knobs a game opts into rather than reinvents: `GAME_ROUND_CONFIG` ([round-config.ts](packages/shared/src/games/round-config.ts)) for the round-count selector (UI options + server clamp in one place), and `GAME_TIMING_DEFS` for admin-tunable wait durations (see below).

### GameManager — privacy and lifecycle rules

[GameManager](packages/server/src/game/GameManager.ts) runs a 1s tick loop and owns the two-channel state emission:

- `game:state-update` — room-wide broadcast with `playerData` **stripped**. Anything a controller may see goes in the shared/`hostData` half.
- `game:player-state` — per-player slice carrying only that player's private data.

**Secret information must never enter the broadcast half** — that's the recurring bug class across Gluvo doba, Špijun, Tajni agenti, Zavet and Kviz (unrevealed answers). Card faces, roles, correct indices and unrevealed words stay server-side until the reveal phase.

Two cross-game patterns worth knowing before touching any module:

- **Snapshot-based early-exit** — collection phases snapshot the expected player-id set at phase entry and check completion against it. Mid-grace disconnected players stay in the snapshot (so a sleeping phone doesn't shrink the denominator and steal a slot); past-grace removal via `onPlayerDisconnect` prunes it.
- **Per-game score reset** — `startGame` zeroes every `player.score` before `onStart`. Don't re-implement it inside a module.

At game end, `getAwardCandidates()` plus a generic score-based layer feed `allocateDiplomas` ([awards.ts](packages/shared/src/games/awards.ts)) so every player leaves with a consolation diploma.

### Rooms, reconnection, disconnects

- Room codes: `ROOM_CODE_LENGTH` (3) uppercase chars excluding `O/I/L`. Generation is **bounded** — at `MAX_ROOMS` (200) or after 100 collision retries the create call returns `null` and the handler answers "server full". Never loop unbounded there; an exhausted code space used to hang the event loop.
- Reconnect tokens (UUIDs) live in the controller's localStorage and travel via `socket.handshake.auth`. On disconnect the server starts a `RECONNECT_GRACE_MS` (5 min) timer; reconnecting inside it restores seat, score, and replays the current phase.
- Two distinct events: `room:player-left` is the **transient** grey-out on disconnect; `room:player-removed` is **permanent** (grace expired or kicked). Destructive `onPlayerDisconnect` work is deferred until grace expires so blips don't burn turns.
- A returning player who lost their token can **reclaim** a disconnected slot by joining with the same name (score and avatar preserved).
- **Server-initiated disconnect quirk**: on `sock.disconnect(true)` socket.io-client does *not* auto-reconnect, so the controller manually calls `socket.connect()` when the reason is `"io server disconnect"` ([controller App.tsx](packages/controller/src/App.tsx)).
- Rooms are **not** deleted when the last player leaves — the room belongs to the host.
- Abuse guards for public deploys: per-socket rate limits in [rate-limit.ts](packages/server/src/socket/rate-limit.ts), server-side name clamping, 512KB `maxHttpBufferSize`.

### Remote host & hostless rooms

Any one player can claim the host controls from their phone (`player:claim-remote-host`); the holder renders a phone mirror of the game-select screen and may start/stop games. Server-side permission checks accept either the host socket or the remote-host (`canControl` in [handlers/game.ts](packages/server/src/socket/handlers/game.ts)).

Rooms can also be created with no TV at all (`player:create-room` → `hostless: true`, creator auto-gets the claim). Only games with `supportsHostless: true` may start there (validated server-side). Hostless controller UIs key off `room.hostless` and render what the TV would have shown (full leaderboards, spectator canvas, the geo map, audio/video playback…). **TV-mode phone UX stays deliberately unchanged** — with a TV present, players should look at the TV.

### Drawing data flow

Controllers collect touch points in **normalized 0–1 coordinates**, batch every ~50ms, and emit; the host scales back up to its canvas size. Never send absolute pixels — devices differ in aspect ratio. Drawing ops are appended via the tiny `game:ops-append` event (`getPendingOpsAppend`) instead of re-broadcasting a growing state array (that was O(n²) traffic per turn).

## Content: packs, admin, timings

Most games' content is **file-backed JSON packs** in repo-root directories (`question-packs/`, `ko-sam-ja-packs/`, `tajni-agenti-packs/`, `gluvo-doba-packs/`, `spijun-packs/`, `asocijacije-packs/`, `bitka-maps/`), each with an env override. Shared validators live in `packages/shared/src/games/*-import.ts` and are used by both the runtime and the admin API.

- **Manifests carry answers**, so the public `GET /api/<x>-packs` endpoints return **summaries only**, and the kviz asset mount serves only files one level inside a pack folder and never `*.json`.
- **Reads are lax, writes accept drafts**: a pack that fails the strict in-game check stays editable but invisible in-game (`visibleInGame` + `error` in the API response).
- **Admin SPA** at `/admin` ([admin-app.ts](packages/server/src/admin/admin-app.ts)), gated by `ADMIN_TOKEN` (`X-Admin-Token` header). One TS template literal containing the whole page — its inline CSS/JS **must avoid backticks and `${`** (the only `${…}` are real TS interpolations). Same constraint applies to the other inline-HTML pages: landing (in [index.ts](packages/server/src/index.ts)), [/uputstva](packages/server/src/uputstva-page.ts), [/gluvo-doba](packages/server/src/gluvo-doba-page.ts), [/kviz-generator](packages/server/src/kviz-generator-page.ts). Shared server helpers: [admin-common.ts](packages/server/src/admin/admin-common.ts) (requireAdmin, slugify, atomic writes), API router [content-admin.ts](packages/server/src/admin/content-admin.ts).
- **Timing editor** ("Timinzi" view) tunes **wait/pause durations only** (results, leaderboard, intro, narration) — never active-input timers, which stay hardcoded as gameplay balance. Tunable fields are declared in [GAME_TIMING_DEFS](packages/shared/src/games/game-timings.ts); modules resolve their slice at `onStart` and read `this.timings.KEY ?? KEY_CONST`, so the module constant is always the runtime fallback. Overrides persist to `timing-config.json` (gitignored).
- **Data admin** ("Podaci" view, [data-admin.ts](packages/server/src/admin/data-admin.ts)): zip backup of all content + factory reset from `SEED_DIR` (deploy mode only — reset is refused in dev so it can't wipe the tracked repo).

## Games

All 18 game ids are in [registry.ts](packages/shared/src/games/registry.ts); server modules, host and controller components all live under matching `<id>/` folders (Osvajanje is the one exception — its folders are `bitka/`). Non-obvious things worth knowing:

- **Kviz** (`quiz`) — the unified quiz that absorbed several former standalone games. Every question has a `type`: `obicno` / `audio` / `video` (YouTube) / `geo` (pin on map) / `broj` (slider) / `emoji` (fuzzy free text). The phase machine (`showing-question → answering → showing-results → leaderboard`) is type-independent; types only change what renders and which action is accepted. Scoring caps at 1000/question for every type ([scoring.ts](packages/server/src/game/games/quiz/scoring.ts)). Types + validator: [quiz.ts](packages/shared/src/types/quiz.ts), [quiz-import.ts](packages/shared/src/games/quiz-import.ts). Geo pins travel as normalized `{x,y}` and are reprojected via [serbia-projection.ts](packages/shared/src/games/serbia-projection.ts) (use `packLatLngToPin`/`packPinToLatLng` anywhere a pin meets a question — they pick mercator-bbox vs the calibrated Serbia projection). Pack selection is multi-select plus an optional question-type filter.
- **Zavet** (id stays `bolji-zivot`) — Cabo-style memory card game, **lower score wins** (`lowerScoreWins` in the registry; leaderboards sort ascending — don't reuse descending components). Private peeks are sub-phase-scoped and never replayed on reconnect (memory *is* the game). Full rules: [docs/bolji-zivot-dizajn.md](docs/bolji-zivot-dizajn.md).
- **Gluvo doba** — Mafia/Werewolf with Slavic-mythology roles. Roles are **data** ([gluvo-doba-roles.ts](packages/shared/src/games/gluvo-doba-roles.ts)) and night resolution is a **pure function with a strict order** ([night-resolution.ts](packages/server/src/game/games/gluvo-doba/night-resolution.ts)) — add roles by extending the tables and the pipeline, not with if-branches. Anti-tell rule: every living player gets a visually identical night grid.
- **Tajni agenti** — three modes (`classic` / `duet` / `coop`) with different team, key and turn-budget rules, picked at game-select and re-validated in `validateStart`.
- **Asocijacije** — always a single board (deliberately *not* in `GAME_ROUND_CONFIG`); klasik and kviz modes.
- **Penali** — the only `supportsHostless: false` game and the only 3D one. three.js lives exclusively in the host's lazy `penali` chunk ([PitchScene.ts](packages/host/src/games/penali/PitchScene.ts), vanilla three, no react-three-fiber, no assets — everything is primitives), so the main bundle is unaffected. Shooter and keeper commit **blind and simultaneously**: during `aiming` only commitment booleans may enter `hostData`, never the aim or the chosen zone. Balance constants in [penali-rules.ts](packages/shared/src/games/penali-rules.ts) were tuned by simulation (~73% goals / 24% saves; a shot down the middle is worth ~68 expected points against ~120 for one placed near a post) — re-simulate before changing them. A keeper who lets the clock run out scores 0 even if the ball comes to them, and the auto-shot for a timed-out shooter is jittered, so neither side can farm points by doing nothing.
- **Složilica** — word builder backed by a 252k-word Serbian dictionary at `packages/server/assets/recnik/sr-recnik.txt` (static asset, **not** `DATA_DIR` content; ships in the Docker image via the existing `assets/` copy). Loaded **lazily and cached** by [recnik.ts](packages/server/src/recnik.ts) — only the first word game in the process pays the ~16 MB. `validateStart` refuses the game if the file is missing rather than running a game where nothing validates. Regenerate with `npx tsx scripts/build-recnik.ts`; sources and licences are in LICENSE.md. Anti-leak: during `pisanje` only per-player word *counts* go in the broadcast — never the words, and never `bestPossible`.
- **Osvajanje** (folders are `bitka/`) — Triviador/Konquiztador: 2–3 players, one castle each, questions decide who expands and who takes whose land. **The war runs until one castle is left standing** — deliberately absent from `GAME_ROUND_CONFIG`, since a round count would only cut the game short (`BITKA_MAX_RATNIH_RUNDI` is a stuck-game guard, not a setting), so expect ~25 min. **Maps are content, not code**: drawn in `/admin` → Mape over an uploaded PNG and stored in `bitka-maps/<id>.json` (+ `<id>/` holding the image, served at `/bitka-files/<id>/<file>`). Maps are *illustrations*, so there is **no geography** — no lat/lng, no bbox, no `serbia-projection`; every coordinate is normalized `{x,y} ∈ [0,1]` over the image, the same space the kviz geo pins use. Questions come from the ordinary kviz packs via the shared `quizPackIds` field (obicno/uljez for duels, broj for the tiebreaker; `pogodi-broj` is the fallback and, failing that, speed decides). Attack resolution is a **pure function** ([duel.ts](packages/server/src/game/games/bitka/duel.ts)) — change outcomes there, not with if-branches in the module. Both land-grab picks and attack targets are restricted to territories adjacent to what you already hold, falling back to the whole map when nothing adjacent qualifies (`freePickTargets` / `attackTargets`) — so a boxed-in player never loses their turn. On the phone the map takes the **whole screen** (a fixed, full-bleed stage that breaks out of `#root`'s padding; titles and hints float over it), so the target list and the score table both live in the player popup instead ([BitkaBoardMenu.tsx](packages/controller/src/components/BitkaBoardMenu.tsx), rendered by `PlayerMenu`). Unlike the other games it renders in TV rooms too — a player who isn't on turn otherwise has no idea where anything is happening. **TV-only 3D board + FX**: on the TV the map is a three.js scene ([fx/](packages/host/src/games/bitka/fx/)) — each territory is its own extruded slab, raised when focused, with castles/walls as primitives and names as canvas-texture sprites; the camera pushes in on the duelled territory and pulls back out. **Any uploaded map works with zero extra content**, because `ExtrudeGeometry` derives UVs straight from the shape coordinates, so a polygon drawn in the stored `[0,1]` space picks up exactly its own slice of the PNG; a darkened full-image plane sits under the slabs so the parts of the illustration that aren't territories stay visible. `?board=2d` on the host URL falls back to the flat map with a transparent FX canvas over it, which is also the automatic fallback when WebGL is missing and the `Suspense` placeholder while the three chunk loads. Both surfaces animate attacks, defences, captures, wall hits, castle falls and the win. Events are derived by a **pure diff of two consecutive `BitkaHostData` snapshots** ([fx-events.ts](packages/host/src/games/bitka/fx/fx-events.ts)) — no new socket events, no server involvement, each event fires exactly once, and a repeated state (reconnect/replay) produces nothing. The scene ([BitkaFxScene.ts](packages/host/src/games/bitka/fx/BitkaFxScene.ts)) follows the Penali rules: vanilla three, no assets, primitives only, and it lives behind a `lazy()` boundary so three lands in its own chunk (`BitkaFx-*.js`) — the main bundle and even the `BitkaHost` chunk stay free of it. Its ortho camera is the normalized `[0,1]` map space, so FX coordinates are the same ones the polygons use. **Effects are decorative and must stay short** (longest ~1.8 s vs the 3 s minimum of `DUEL_REZULTAT_DURATION`): the server clock never waits for the TV, and `clear()` drops everything mid-flight. Phones never load any of this — the controller package has no three dependency, which is what keeps hostless simple; that layer is the intended seam for a later extruded-3D board. The map's strict check (≥9 territories, connected neighbour graph, image present) is what gates `visibleInGame`; a half-drawn map stays editable but never reaches game-select. Headless end-to-end + anti-leak run: `npx tsx scripts/test-bitka.mts`.
- **Tutorial mode** (Gluvo doba, Zavet, Špijun) — phase timers stop ticking and the host advances phases via a `*:next-phase` host action. Only the boolean `tutorialMode` is shared; hints are computed client-side from each player's own `playerData` so nothing leaks.

## i18n

A deliberately **partial** EN/SR layer — don't assume everything is translatable. Strings and `translate()` live in [strings.ts](packages/shared/src/i18n/strings.ts) (flat dotted keys, `en → sr → raw key` fallback); host and controller each have a `useLanguageStore` (persisted per device, key `igra-language`, default `sr`) and a `useT()` hook. **Not room-synced** — TV and phone can differ.

Translated: platform chrome, game-select cards, and three games (Crtaj i pogodi, Slepi telefoni, Pronađi par). **Serbian by design**: every other game's in-game screens, validator error strings, and the built-in content banks. When adding a string to a translated surface add both `sr` and `en`; when touching an untranslated game, leave its strings Serbian.

The only server-side language plumbing is the draw-guess word bank (`language` rides `host:start-game` as a content hint).

## Branding

Follows [brand.md](brand.md) (navy `#1D3557`, gold `#C29B47`, cream `#F5EBE0`) with **Baloo 2** display + **Manrope** body — a deliberate divergence from brand.md's serif pairing (serifs read too stiff for a party game; Fredoka was dropped for missing Serbian glyphs). All colors flow through CSS custom properties in `packages/{host,controller}/src/styles/global.css` — **identical token sets, keep them in sync**. Functional palettes that must stay in code: `AVATAR_COLORS` ([constants.ts](packages/shared/src/constants.ts)) and the quiz option colors (host + controller keys must match hexes exactly).

## Serving & deployment

The Express server is the single public entry point.

- `/` static landing (no bundle, no room creation — safe for bots and link previews), `/host/` host bundle, `/play/` controller bundle. `/host` and `/play` 301 to the slashed forms (needs `strict routing` so the redirect doesn't loop).
- **Dev fallback**: when `packages/<pkg>/dist/index.html` is missing, Express proxies `/host/**` and `/play/**` to Vite. The check tests `index.html`, **not** the `dist/` folder — Vite leaves empty `dist/` dirs behind, which would flip the server into prod-static mode that serves only 404s. The inverse trap — a leftover `dist/` from an earlier `npm run build` making `:3001` serve a *frozen* bundle while Vite runs unused, so source edits appear to do nothing — is disarmed by the `predev` hook ([scripts/dev-clean.mjs](scripts/dev-clean.mjs)), which deletes both `dist/`s before `npm run dev` / `npm run dev:server`. On top of that, the static branch logs the served bundle's build timestamp and (outside `DATA_DIR`/production) a "rebuild or delete dist" hint, so a stale bundle is visible in the startup log.
- The proxy uses `pathFilter` (function form) rather than `app.use('/host', …)`: mount-stripping would turn `/host/` into `/` at Vite, which redirects back to `/host/` → infinite loop. `ws: true` carries both socket.io upgrades and Vite HMR.
- **LAN testing**: set `HOST_ORIGIN`/`CONTROLLER_ORIGIN` to your LAN IP so CORS accepts them; see [README.md](README.md).
- **Deploy** (Docker/Coolify): all editable content is file-backed and path resolution is centralized in [data-paths.ts](packages/server/src/data-paths.ts). With `DATA_DIR` set (baked to `/data` in the [Dockerfile](Dockerfile)) content lives on a persistent volume; `seedDataDirs()` copies bundled defaults from `SEED_DIR` **only into missing/empty dirs**, so redeploys never clobber admin edits. Without `DATA_DIR`, everything resolves to the repo-root folders (dev mode).

### Environment variables

`PORT`, `HOST_ORIGIN` / `CONTROLLER_ORIGIN` (CORS), `SAME_ORIGIN_DEPLOY`, `SINGLE_ROOM_MODE` (+ `VITE_SINGLE_ROOM` for the controller) — auto-fill the active room code; `ADMIN_TOKEN` (unset = admin disabled), `DATA_DIR` / `SEED_DIR`, the per-content overrides `QUESTION_PACKS_DIR` / `KO_SAM_JA_PACKS_DIR` / `TAJNI_AGENTI_PACKS_DIR` / `GLUVO_DOBA_PACKS_DIR` / `SPIJUN_PACKS_DIR` / `ASOCIJACIJE_PACKS_DIR` / `BITKA_MAPS_DIR`, `TIMING_CONFIG_FILE`, `RECNIK_FILE` (Složilica word list; defaults to the bundled asset), `QUIZ_FEEDBACK_FILE`, `LOG_DIR` / `LOG_RETENTION_DAYS`, `HOST_DIST_DIR` / `CONTROLLER_DIST_DIR`.

## Gotchas

- After editing anything in `@igra/shared`, run `npm run build:shared` (or restart `npm run dev`) — consumers import `dist/`, not `src/`.
- Both Vite configs set `strictPort: true` because the dev proxy targets fixed ports. On "Port 5173 already in use", kill the stale process (the `free-dev-ports` skill does this) — without strictPort Vite silently shifts ports and `/play/` ends up proxying to the *host* dev server.
- If `/host/` or `/play/` 404s in dev — or serves code you know you changed — delete stale/empty `packages/{host,controller}/dist/` folders (see the dev-fallback rule above); `npm run dev` now does it for you.
- Inline-HTML pages are TS template literals: no backticks, no `${` in their embedded CSS/JS.
- The host's `history.replaceState` for `?code=` uses a **relative** URL so it keeps the `/host` path; an absolute one would land on `/` and trip the landing page.
- Windows machine, but bash idioms and forward slashes are expected.
