# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Igra Na Klik** — a self-hosted AirConsole-style party game platform. One device is the "host" (TV/big screen), players join from their phones as "controllers" via a room code or QR. Real-time over Socket.io. 20 mini-games (plus a `test-game` dev module that is registered server-side but deliberately absent from `GAME_DEFINITIONS`), all content and in-game text in Serbian (Latin) by design.

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

Dev URLs: `localhost:3001/` (redirects to the join screen), host `:3001/host/` (or `:5173/host/`), controller `:3001/play/` (or `:5174/play/`), admin `:3001/admin`.

**No test runner and no linter are configured.** "Testing" means `npm run dev` plus exercising the flow in two browser tabs (host + controller). There is no single-test command; if you add a harness, document its invocation here. Headless per-game harnesses (in-process server + socket.io bots): `npx tsx scripts/test-bitka.mts`, `scripts/test-fibbage.mts`, `scripts/test-splav.mts`, `scripts/test-puzla.mts` — flags are described in each game's `.claude/rules/<game>.md` file. Platform harnesses: `npx tsx scripts/test-knock.mts` (Pokucaj — knocking on a running game) and `npx tsx scripts/test-flow.mts` (pause / skip / ne čekaj / hand-over / stop with or without results / proba → restart); no flags.

`npm run free-ports` ([scripts/free-ports.mjs](scripts/free-ports.mjs)) kills whatever is listening on 3001/5173/5174 (`-- 3000 3001` for specific ports). `predev` only *reports* busy ports and prints that command, and the server's `EADDRINUSE` handler does the same instead of dumping a stack trace — neither kills anything on its own. The `free-dev-ports` skill ([.claude/skills/free-dev-ports/](.claude/skills/free-dev-ports/)) is the PowerShell equivalent.

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
6. A `GAME_RULES` entry in [packages/shared/src/games/game-rules.ts](packages/shared/src/games/game-rules.ts) — the public `/uputstva` hub and the phone's in-app rules list only games that have one, so the game silently disappears from both otherwise. Give it a one-line `hint` (first-time tip); `steps`/`points`/`notes` are optional (the phone falls back to `body`).

Optional knobs a game opts into rather than reinvents: `GAME_ROUND_CONFIG` ([round-config.ts](packages/shared/src/games/round-config.ts)) for the round-count selector (UI options + server clamp in one place), and `GAME_TIMING_DEFS` for admin-tunable wait durations (see below).

### GameManager — privacy and lifecycle rules

[GameManager](packages/server/src/game/GameManager.ts) runs a 1s tick loop (per-module override below) and owns the two-channel state emission:

- `game:state-update` — room-wide broadcast with `playerData` **stripped**. Anything a controller may see goes in the shared/`hostData` half.
- `game:player-state` — per-player slice carrying only that player's private data.

**Secret information must never enter the broadcast half** — that's the recurring bug class across Gluvo doba, Špijun, Tajni agenti, Zavet and Kviz (unrevealed answers). Card faces, roles, correct indices and unrevealed words stay server-side until the reveal phase.

Two cross-game patterns worth knowing before touching any module:

- **Snapshot-based early-exit** — collection phases snapshot the expected player-id set at phase entry and check completion against it. Mid-grace disconnected players stay in the snapshot (so a sleeping phone doesn't shrink the denominator and steal a slot); past-grace removal via `onPlayerDisconnect` prunes it.
- **Per-game score reset** — `startGame` zeroes every `player.score` before `onStart`. Don't re-implement it inside a module.

**Fast tick + frame deltas** (used only by Splav so far): a module may declare `tickIntervalMs` and get its own simulation loop instead of the 1s one — the other games are untouched. A fast-tick module receives the **real elapsed time** as `deltaMs` (capped at 100ms so a stalled event loop can't teleport a simulation), while the 1s path keeps its exact `1000`. Such a module must **not** return a `GameState` from `onTick`/`onPlayerAction` on movement: it publishes positions through `getPendingFrame()`, which GameManager broadcasts as the tiny `game:frame` event (same delta trick as `getPendingOpsAppend`). Full state stays the authority for phases, rosters and scores. Note that even a once-a-second full state usually goes out as a lightweight `game:timer` — `stateSignature` zeroes `timeRemaining`, so a state whose only change is the clock never re-broadcasts.

**Flow controls** (Tok igre): pause, skip and "ne čekaj ga" are platform-level, driven by `host:flow-action` (canControl) and broadcast as their own `game:flow` event (`GameFlowState`) — never inside `GameState`, so signatures and modules stay untouched. Pause simply stops ticking the module and drops player/host actions (except `quiz:feedback`); resume runs a server-side 3-2-1, then calls the optional `onResume(pausedMs)` so modules shift their `Date.now()` stamps (Kviz shifts `questionStartTime`). Skip and stop-waiting work only in modules implementing `onHostSkip` / `onStopWaiting` / `getFlowInfo` (Kviz, Lažov, Ko bi pre? so far; the three tutorial games give `getFlowInfo` counts only) — the phone hides those buttons elsewhere. "Ne čekaj" persists until the player acts or reconnects: GameManager re-applies it to every new snapshot. `getFlowInfo().collection` carries ids only, and omits `doneIds` where who-already-acted leaks something (Gluvo doba's night and vote, Špijun's vote). What a pause does **not** freeze: the reconnect grace timer, and client-side clocks unless gated (`usePaused()` in the host's Vruć krompir tick and Puzla clock). `host:stop-game { showResults }` puts `stoppedEarly` / `skipResults` on `game:ended`; `host:restart-game { tutorial }` replays the room's last start payload.

At game end, `getAwardCandidates()` plus a generic score-based layer feed `allocateDiplomas` ([awards.ts](packages/shared/src/games/awards.ts)) so every player leaves with a consolation diploma.

### Rooms, reconnection, disconnects

- Room codes: `ROOM_CODE_LENGTH` (3) uppercase chars excluding `O/I/L`. Generation is **bounded** — at `MAX_ROOMS` (200) or after 100 collision retries the create call returns `null` and the handler answers "server full". Never loop unbounded there; an exhausted code space used to hang the event loop.
- Reconnect tokens (UUIDs) live in the controller's localStorage and travel via `socket.handshake.auth`. On disconnect the server starts a `RECONNECT_GRACE_MS` (5 min) timer; reconnecting inside it restores seat, score, and replays the current phase.
- Two distinct events: `room:player-left` is the **transient** grey-out on disconnect; `room:player-removed` is **permanent** (grace expired or kicked). Destructive `onPlayerDisconnect` work is deferred until grace expires so blips don't burn turns.
- A returning player who lost their token can **reclaim** a disconnected slot by joining with the same name (score and avatar preserved).
- **Server-initiated disconnect quirk**: on `sock.disconnect(true)` socket.io-client does *not* auto-reconnect, so the controller manually calls `socket.connect()` when the reason is `"io server disconnect"` ([controller App.tsx](packages/controller/src/App.tsx)).
- Rooms are **not** deleted when the last player leaves — the room belongs to the host.
- **Pokucaj (knock)** is the only way into a room whose game is running ([knocks.ts](packages/server/src/socket/knocks.ts)): a guest knocks from the join screen, and the **remote-host holder** answers from a banner / their player menu (no holder online → no knocking; `RoomSummary.knockable`). "Ne sad" blocks re-knocking that room for `KNOCK_RETRY_MS` (60 s). An admitted guest is seated **right away only in games with `lateJoin: true`** in the registry (Kviz so far — its answerers are re-snapshotted per question and stats/leaderboard default a missing player); everywhere else they are seated when the game ends. At game end (`GameManager.onGameEnded`) everyone still at the door walks in, answered or not, because a lobby room is open to anyone anyway. Before flagging another game `lateJoin`, check its module copes with a player who wasn't there at `onStart` (per-player maps filled in `onStart`, roles, hands, turn orders). The door list rides `room:knocks` to the holder only — never to the room.
- Abuse guards for public deploys: per-socket rate limits in [rate-limit.ts](packages/server/src/socket/rate-limit.ts), server-side name clamping, 512KB `maxHttpBufferSize`.

### Remote host & hostless rooms

Any one player can claim the host controls from their phone (`player:claim-remote-host`); the holder renders a phone mirror of the game-select screen and may start/stop games. Server-side permission checks accept either the host socket or the remote-host (`canControl` in [handlers/game.ts](packages/server/src/socket/handlers/game.ts)).

Rooms can also be created with no TV at all (`player:create-room` → `hostless: true`, creator auto-gets the claim). Only games with `supportsHostless: true` may start there (validated server-side). Hostless controller UIs key off `room.hostless` and render what the TV would have shown (full leaderboards, spectator canvas, the geo map, audio/video playback…). **TV-mode phone UX stays deliberately unchanged** — with a TV present, players should look at the TV.

### Controller kit (in-game phone UI)

Shared in-game patterns live in [controller/src/components/kit/](packages/controller/src/components/kit/): `GameFrame` (header with game, progress, timer and the player menu, plus a drain bar), `WaitingPanel`/`WhoIsIn`/`DoneFaces` (who's in, from broadcast id lists only), `PlayerVoteGrid`, `RoundVerdict`; the standings are [HostlessLeaderboard](packages/controller/src/components/HostlessLeaderboard.tsx) (podium + pinned "you" card). The holder's in-game controls live there too: the player menu is a bottom sheet ([PlayerMenu](packages/controller/src/components/PlayerMenu.tsx): Igra / Ja / dangerous actions), with [PlayersPanel](packages/controller/src/components/PlayersPanel.tsx) (knocks, live status, hand over / ne čekaj / kick), [EndGameSheet](packages/controller/src/components/EndGameSheet.tsx), [PauseOverlay](packages/controller/src/components/PauseOverlay.tsx) and `kit/WaitingStrip` mounted by GameScreen; they read `useFlowStore`. `GameFrame` animates every phase change (Web Animations on `top`/opacity — not transform, which would re-anchor games' fixed backdrops; opacity-only under reduced motion) and takes `roundCard` for the gold "Runda 3 od 5" interstitial. Most controllers are built on it now (everything but Puzla's full-screen table and Splav's mid-fight joystick, which calls `useHideFloatingMenu()` and carries its own menu). `GameFrame` shows m:ss from a minute up, `urgentAt` moves the rust threshold (Slepi telefoni: 10 s), and a full-phone backdrop (Penali's pitch, Vruć krompir's hot screen, Gluvo doba's night/dawn) is a `position: fixed` layer under a `zIndex: 1` wrapper — `zIndex: -1` would vanish behind `body`'s own background. While a `GameFrame` is mounted, [GameScreen](packages/controller/src/screens/GameScreen.tsx) hides the floating player-menu circle; a phase rendered outside the frame falls back to that circle, so wrap **every** phase (the three games do it once, at the controller root) to keep the menu in one place.

Phone feedback goes through [utils/cues.ts](packages/controller/src/utils/cues.ts): `cue('round' | 'tick' | 'sent' | 'correct' | 'wrong' | 'turn' | 'knock' | 'reconnected')` maps each event to a vibration pattern and an optional synthesized tone, gated by the per-device toggles (vibration on, sound off by default; `igra-cues` in localStorage). The older `haptics.*` helpers route through the same vibration toggle. `RoundVerdict` fires correct/wrong itself and `GameFrame` fires the last-5-seconds tick and, given a `roundKey`, the new-round cue — don't fire them again in a game. Rules open in-app ([RulesScreen](packages/controller/src/components/RulesScreen.tsx), `useRulesStore().show(gameId?)`), and [FirstTimeHint](packages/controller/src/components/FirstTimeHint.tsx) shows a game's `hint` once per device. A dropped connection never leaves the room: [ConnectionStatus](packages/controller/src/components/ConnectionStatus.tsx) shows a banner and dims the screen in place (socket.io buffers taps meanwhile), and after 15 s swaps to a retry screen.

### Drawing data flow

Controllers collect touch points in **normalized 0–1 coordinates**, batch every ~50ms, and emit; the host scales back up to its canvas size. Never send absolute pixels — devices differ in aspect ratio. Drawing ops are appended via the tiny `game:ops-append` event (`getPendingOpsAppend`) instead of re-broadcasting a growing state array (that was O(n²) traffic per turn).

## Content: packs, admin, timings

Most games' content is **file-backed JSON packs** in repo-root directories (`question-packs/`, `ko-sam-ja-packs/`, `tajni-agenti-packs/`, `gluvo-doba-packs/`, `spijun-packs/`, `asocijacije-packs/`, `fibbage-packs/`, `bitka-maps/`), each with an env override. Shared validators live in `packages/shared/src/games/*-import.ts` and are used by both the runtime and the admin API.

- **Manifests carry answers** (kviz *and* Lažov), so the public `GET /api/<x>-packs` endpoints return **summaries only** — only pack ids ride `host:start-game` and the server resolves the questions from disk; and the kviz asset mount serves only files one level inside a pack folder and never `*.json`.
- **Reads are lax, writes accept drafts**: a pack that fails the strict in-game check stays editable but invisible in-game (`visibleInGame` + `error` in the API response).
- **Admin SPA** at `/admin` ([admin-app.ts](packages/server/src/admin/admin-app.ts)), gated by `ADMIN_TOKEN` (`X-Admin-Token` header). One TS template literal containing the whole page — its inline CSS/JS **must avoid backticks and `${`** (the only `${…}` are real TS interpolations). Same constraint applies to the other inline-HTML pages: [/uputstva](packages/server/src/uputstva-page.ts), [/gluvo-doba](packages/server/src/gluvo-doba-page.ts), [/kviz-generator](packages/server/src/kviz-generator-page.ts). Shared server helpers: [admin-common.ts](packages/server/src/admin/admin-common.ts) (requireAdmin, slugify, atomic writes), API router [content-admin.ts](packages/server/src/admin/content-admin.ts).
- **Question feedback** (report-as-wrong + 1–5 rating) is collected live from the player popup and persisted to `quiz-feedback.json` keyed by **source**, not by runtime id (`pack:<packId>:<index>`, `bank:<index>`), so the admin editor can join it back to a pack's questions by position. One bookkeeper serves every game that draws quiz packs — [QuizFeedbackTracker](packages/server/src/game/quiz-feedback-tracker.ts), used by **Kviz, KvizAtar and Vrući krompir** — because the same question asked in a different game must land under the same key, or a pack stays wrong while the reports sit in a game nobody checks. The action (`quiz:feedback`) is accepted in **any phase and for any question of the current match**, including one that already left the screen: the phone keeps a short history ([quizFeedbackStore.ts](packages/controller/src/store/quizFeedbackStore.ts)) and the popup offers "prijavi prethodno" next to the current one. That exists because a question only looks wrong once the correct answer shows, by which time the screen has moved on — gating reports to the current question is what kept the worst questions unreported. The history is filled by a **module-level subscription** to the game store, never by the menu component, which only exists while the popup is open. Each surface needs the runtime question id in its state (`data.questionId` for kviz, `question.id` on the bitka and hot-potato views) — it carries no part of the answer, and without it a question simply cannot be reported.
- **Timing editor** ("Timinzi" view) tunes **wait/pause durations only** (results, leaderboard, intro, narration) — never active-input timers, which stay hardcoded as gameplay balance. Tunable fields are declared in [GAME_TIMING_DEFS](packages/shared/src/games/game-timings.ts); modules resolve their slice at `onStart` and read `this.timings.KEY ?? KEY_CONST`, so the module constant is always the runtime fallback. Overrides persist to `timing-config.json` (gitignored).
- **Data admin** ("Podaci" view, [data-admin.ts](packages/server/src/admin/data-admin.ts)): zip backup of all content + factory reset from `SEED_DIR` (deploy mode only — reset is refused in dev so it can't wipe the tracked repo).

## Games

All 20 game ids are in [registry.ts](packages/shared/src/games/registry.ts); server modules, host and controller components all live under matching `<id>/` folders (KvizAtar is the one exception — its id is `osvajanje` and its folders are `bitka/`). Non-obvious things worth knowing:

- **Kviz** (`quiz`) — the unified quiz that absorbed several former standalone games. Every question has a `type`: `obicno` / `audio` / `video` (YouTube) / `geo` (pin on map) / `broj` (slider) / `emoji` (fuzzy free text). The phase machine (`showing-question → answering → showing-results → leaderboard`) is type-independent; types only change what renders and which action is accepted. Scoring caps at 1000/question for every type ([scoring.ts](packages/server/src/game/games/quiz/scoring.ts)). Types + validator: [quiz.ts](packages/shared/src/types/quiz.ts), [quiz-import.ts](packages/shared/src/games/quiz-import.ts). Geo pins travel as normalized `{x,y}` and are reprojected via [serbia-projection.ts](packages/shared/src/games/serbia-projection.ts) (use `packLatLngToPin`/`packPinToLatLng` anywhere a pin meets a question — they pick mercator-bbox vs the calibrated Serbia projection). Pack selection is multi-select plus an optional question-type filter.
- **Zavet** (id stays `bolji-zivot`) — Cabo-style memory card game, **lower score wins** (`lowerScoreWins` in the registry; leaderboards sort ascending — don't reuse descending components). Private peeks are sub-phase-scoped and never replayed on reconnect (memory *is* the game). Full rules: [docs/bolji-zivot-dizajn.md](docs/bolji-zivot-dizajn.md).
- **Gluvo doba** — Mafia/Werewolf with Slavic-mythology roles. Roles are **data** ([gluvo-doba-roles.ts](packages/shared/src/games/gluvo-doba-roles.ts)) and night resolution is a **pure function with a strict order** ([night-resolution.ts](packages/server/src/game/games/gluvo-doba/night-resolution.ts)) — add roles by extending the tables and the pipeline, not with if-branches. Anti-tell rule: every living player gets a visually identical night grid.
- **Tajni agenti** — three modes (`classic` / `duet` / `coop`) with different team, key and turn-budget rules, picked at game-select and re-validated in `validateStart`.
- **Asocijacije** — always a single board (deliberately *not* in `GAME_ROUND_CONFIG`); klasik and kviz modes.
- **Penali** — the only `supportsHostless: false` game and the only 3D one. three.js lives exclusively in the host's lazy `penali` chunk ([PitchScene.ts](packages/host/src/games/penali/PitchScene.ts), vanilla three, no react-three-fiber, no assets — everything is primitives), so the main bundle is unaffected. Shooter and keeper commit **blind and simultaneously**: during `aiming` only commitment booleans may enter `hostData`, never the aim or the chosen zone. Balance constants in [penali-rules.ts](packages/shared/src/games/penali-rules.ts) were tuned by simulation (~73% goals / 24% saves; a shot down the middle is worth ~68 expected points against ~120 for one placed near a post) — re-simulate before changing them. A keeper who lets the clock run out scores 0 even if the ball comes to them, and the auto-shot for a timed-out shooter is jittered, so neither side can farm points by doing nothing.
- **Složilica** — word builder backed by a 252k-word Serbian dictionary at `packages/server/assets/recnik/sr-recnik.txt` (static asset, **not** `DATA_DIR` content; ships in the Docker image via the existing `assets/` copy). Loaded **lazily and cached** by [recnik.ts](packages/server/src/recnik.ts) — only the first word game in the process pays the ~16 MB. `validateStart` refuses the game if the file is missing rather than running a game where nothing validates. Regenerate with `npx tsx scripts/build-recnik.ts`; sources and licences are in LICENSE.md. Anti-leak: during `pisanje` only per-player word *counts* go in the broadcast — never the words, and never `bestPossible`.
- **KvizAtar** (id is still `osvajanje`, folders are `bitka/` — renaming the id would mean migrating saved timings and host settings) — Triviador-style map conquest for 2–4 players. The full design notes (phases, duels, FX, the 3D board, the phone map, the test flags) live in [.claude/rules/kvizatar.md](.claude/rules/kvizatar.md) and load when you work on its files. Anti-leak, always: during `*-pitanje` the question is **not** in the broadcast at all; the reveal fields (`correctIndex`/`correctCells`/`correctOrder`/`correctText`/`dominoChain`/`explanation`) are reveal-only; private picks ride `playerData`. Headless run: `npx tsx scripts/test-bitka.mts`.
- **Lažov** (id is `fibbage`) — write a fake answer, then find the real one. Manifests **carry the answers**, so `GET /api/fibbage-packs` serves summaries only and ids ride `host:start-game` as `fibbagePackIds`. Scoring rules and reveal design: [.claude/rules/lazov.md](.claude/rules/lazov.md). Headless run: `npx tsx scripts/test-fibbage.mts`.
- **Splav** — sumo on a shrinking raft, the first continuous-input game (fast tick + `game:frame`, see GameManager above). The host subscribes to `game:frame` **directly, never through the zustand store**. Physics, scoring and wire design: [.claude/rules/splav.md](.claude/rules/splav.md). Headless run: `npx tsx scripts/test-splav.mts`.
- **Puzla** — collaborative jigsaw from a host-uploaded picture (never written to disk; per-room in-memory store). `puzlaTable.ts`, `utils/puzlaImage.ts` and `components/PuzlaImagePicker.tsx` are **identical copies** in host and controller — change both. Upload, networking and snap design: [.claude/rules/puzla.md](.claude/rules/puzla.md). Headless run: `npx tsx scripts/test-puzla.mts`.
- **Tutorial mode / proba** (Gluvo doba, Zavet, Špijun — `tutorial` in the registry) — phase timers stop ticking and the host advances phases via a `*:next-phase` host action. A proba is short (Gluvo: one night + one day, Špijun and Zavet: one round), and `next-phase` in its last phase sets `data.tutorialDone` instead of ending the game, so phones show "Spremni ste!" until the holder restarts (`host:restart-game`). Steps, read-aloud lines and recaps live in [tutorial-flow.ts](packages/shared/src/games/tutorial-flow.ts); the phone's pieces in `kit/Tutorial.tsx`. Game select preselects the proba ("Preporuka") when most connected players lack the game in `Player.playedGames` (phone memory sent on join + every game finished in the room). Only the booleans are shared; hints are computed client-side from each player's own `playerData` so nothing leaks.

## i18n

A deliberately **partial** EN/SR layer — don't assume everything is translatable. Strings and `translate()` live in [strings.ts](packages/shared/src/i18n/strings.ts) (flat dotted keys, `en → sr → raw key` fallback); host and controller each have a `useLanguageStore` (persisted per device, key `igra-language`, default `sr`) and a `useT()` hook. **Not room-synced** — TV and phone can differ.

Translated: platform chrome, game-select cards, and three games (Crtaj i pogodi, Slepi telefoni, Pronađi par). **Serbian by design**: every other game's in-game screens, validator error strings, and the built-in content banks. When adding a string to a translated surface add both `sr` and `en`; when touching an untranslated game, leave its strings Serbian.

The only server-side language plumbing is the draw-guess word bank (`language` rides `host:start-game` as a content hint).

## Branding

Follows [brand.md](brand.md) (navy `#1D3557`, gold `#C29B47`, cream `#F5EBE0`) with **Baloo 2** display + **Manrope** body — a deliberate divergence from brand.md's serif pairing (serifs read too stiff for a party game; Fredoka was dropped for missing Serbian glyphs). All colors flow through CSS custom properties in `packages/{host,controller}/src/styles/global.css` — **identical token sets, keep them in sync**. Functional palettes that must stay in code: `AVATAR_COLORS` ([constants.ts](packages/shared/src/constants.ts)) and the quiz option colors (host + controller keys must match hexes exactly).

## Serving & deployment

The Express server is the single public entry point.

- `/` 302-redirects to `/play/` (query string kept, so `/?code=KZB` works): the join screen is the start page, and TV play, rules, language and zabari.net live in its ⋯ menu ([StartMenu.tsx](packages/controller/src/components/StartMenu.tsx)). The old static landing page is gone; nothing at `/` creates a room, so bots and link previews stay harmless. The controller bundle deliberately stays at `/play/` — moving it to `/` would change the PWA scope and strand installed apps on their old service worker. `/host/` host bundle, `/play/` controller bundle. `/host` and `/play` 301 to the slashed forms (needs `strict routing` so the redirect doesn't loop).
- **Dev fallback**: when `packages/<pkg>/dist/index.html` is missing, Express proxies `/host/**` and `/play/**` to Vite. The check tests `index.html`, **not** the `dist/` folder — Vite leaves empty `dist/` dirs behind, which would flip the server into prod-static mode that serves only 404s. The inverse trap — a leftover `dist/` from an earlier `npm run build` making `:3001` serve a *frozen* bundle while Vite runs unused, so source edits appear to do nothing — is disarmed by the `predev` hook ([scripts/dev-clean.mjs](scripts/dev-clean.mjs)), which deletes both `dist/`s before `npm run dev` / `npm run dev:server`. On top of that, the static branch logs the served bundle's build timestamp and (outside `DATA_DIR`/production) a "rebuild or delete dist" hint, so a stale bundle is visible in the startup log.
- The proxy uses `pathFilter` (function form) rather than `app.use('/host', …)`: mount-stripping would turn `/host/` into `/` at Vite, which redirects back to `/host/` → infinite loop. `ws: true` carries both socket.io upgrades and Vite HMR.
- **LAN testing**: set `HOST_ORIGIN`/`CONTROLLER_ORIGIN` to your LAN IP so CORS accepts them; see [README.md](README.md).
- **Deploy** (Docker/Coolify): all editable content is file-backed and path resolution is centralized in [data-paths.ts](packages/server/src/data-paths.ts). With `DATA_DIR` set (baked to `/data` in the [Dockerfile](Dockerfile)) content lives on a persistent volume; `seedDataDirs()` copies bundled defaults from `SEED_DIR` **only into missing/empty dirs**, so redeploys never clobber admin edits. Without `DATA_DIR`, everything resolves to the repo-root folders (dev mode).


## Gotchas

- After editing anything in `@igra/shared`, run `npm run build:shared` (or restart `npm run dev`) — consumers import `dist/`, not `src/`.
- Both Vite configs set `strictPort: true` because the dev proxy targets fixed ports. On "Port 5173 already in use", kill the stale process (the `free-dev-ports` skill does this) — without strictPort Vite silently shifts ports and `/play/` ends up proxying to the *host* dev server.
- If `/host/` or `/play/` 404s in dev — or serves code you know you changed — delete stale/empty `packages/{host,controller}/dist/` folders (see the dev-fallback rule above); `npm run dev` now does it for you.
- Inline-HTML pages are TS template literals: no backticks, no `${` in their embedded CSS/JS.
- The host's `history.replaceState` for `?code=` uses a **relative** URL so it keeps the `/host` path; an absolute one would land on `/` and redirect to the controller.
- Windows machine, but bash idioms and forward slashes are expected.
