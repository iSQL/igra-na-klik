# Igra Na Klik — Party Game Platform Implementation Plan

## Context

Building an AirConsole-style party game platform where one device (TV/big screen) acts as the host display, and players join from their phones as controllers via a room code/QR. Real-time communication via Socket.io. The platform supports pluggable mini-games, starting with Quiz and Draw & Guess.

---

## Design Decisions & Tradeoffs

1. **Room codes**: 4-letter uppercase, excluding ambiguous chars (`O,I,L`). 22^4 = 234K possible codes. In-memory `Map<string, Room>` — rooms lost on server restart, acceptable for party games.

2. **Reconnection**: Token-based (UUID stored in `localStorage`). On disconnect, 30s grace period. If token matches within grace, player is restored. Limitation: clearing localStorage loses the token.

3. **Game module system**: Each game is a class implementing `IGameModule` on the server + lazy-loaded React components on host/controller. All games compiled into bundles (no runtime plugins). Simple and sufficient for v1.

4. **Draw & Guess canvas**: Incremental strokes (array of normalized 0-1 points + color/width), streamed every ~50ms. Far more bandwidth-efficient than sending full canvas images.

5. **Ports**: Server `3001`, Host dev `5173`, Controller dev `5174`.

---

## Core Data Structures

```typescript
// Room & Player
type RoomStatus = 'lobby' | 'in-game' | 'game-over';

interface Player {
  id: string; name: string; avatarColor: string;
  isConnected: boolean; score: number; reconnectToken: string;
}
type PublicPlayer = Omit<Player, 'reconnectToken'>;

interface Room {
  code: string; hostSocketId: string; players: Player[];
  status: RoomStatus; currentGameId: string | null;
  settings: RoomSettings; createdAt: number;
}
interface RoomSettings { maxPlayers: number; roundCount: number; }

// Game
interface GameState {
  gameId: string; phase: string; round: number; totalRounds: number;
  timeRemaining: number; data: Record<string, unknown>;
  playerData: Record<string, Record<string, unknown>>;
}

interface GameDefinition {
  id: string; name: string; minPlayers: number;
  maxPlayers: number; description: string;
}

// Server-side game module interface
interface IGameModule {
  readonly gameId: string;
  onStart(room: Room): GameState;
  onPlayerAction(room: Room, state: GameState, playerId: string, action: string, data: Record<string, unknown>): GameState | null;
  onTick(room: Room, state: GameState, deltaMs: number): GameState | null;
  onPlayerDisconnect(room: Room, state: GameState, playerId: string): GameState | null;
  onEnd(room: Room, state: GameState): void;
}
```

---

## Phase 1: Project Scaffolding & Room System [DONE]

**Goal**: Monorepo setup, server with room CRUD, host shows lobby with QR code, controllers join by code.

### Packages needed
- Root: `typescript`, `@types/node`, `concurrently` (dev)
- `shared`: none (pure TS)
- `server`: `socket.io`, `express`, `uuid`, `cors`, `dotenv`; dev: `tsx`, `@types/express`, `@types/uuid`
- `host`: `react`, `react-dom`, `socket.io-client`, `zustand`, `qrcode.react`, `framer-motion`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`
- `controller`: `react`, `react-dom`, `socket.io-client`, `zustand`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`

### Socket events

| Event | Direction | Payload |
|---|---|---|
| `host:create-room` | host→server | `{ settings?: Partial<RoomSettings> }` |
| `host:room-created` | server→host | `{ roomCode, room }` |
| `player:join-room` | controller→server | `{ roomCode, playerName, reconnectToken? }` |
| `player:joined` | server→controller | `{ player, room }` |
| `room:player-joined` | server→all | `{ player: PublicPlayer }` |
| `room:player-left` | server→all | `{ playerId }` |
| `room:player-reconnected` | server→all | `{ playerId }` |
| `room:state-update` | server→all | `{ room }` |
| `host:start-game` | host→server | `{ gameId }` |
| `error` | server→client | `{ code, message }` |

### Files to create

**Root**
- `package.json` — workspaces config, dev/build scripts using concurrently
- `tsconfig.base.json` — shared TS config (ES2022, strict, bundler resolution)
- `.gitignore` — node_modules, dist, .env
- `.env.example` — PORT, HOST_ORIGIN, CONTROLLER_ORIGIN

**packages/shared**
- `package.json` — `@igra/shared`, build with tsc
- `tsconfig.json` — extends base, composite: true
- `src/index.ts` — barrel export
- `src/types/room.ts` — Player, PublicPlayer, Room, RoomSettings interfaces
- `src/types/game.ts` — GameDefinition, GameState types
- `src/types/events.ts` — typed Socket.io event maps (ClientToServerEvents, ServerToClientEvents)
- `src/constants.ts` — ROOM_CODE_CHARS, MAX_PLAYERS, RECONNECT_GRACE_MS, AVATAR_COLORS
- `src/utils/room-code.ts` — generateRoomCode() function

**packages/server**
- `package.json` — `@igra/server`, depends on `@igra/shared`, dev script `tsx watch`
- `tsconfig.json` — extends base, references shared
- `src/index.ts` — Express + HTTP + Socket.io setup, listen on PORT
- `src/socket/setup.ts` — configure Socket.io with typed events, connection handler
- `src/socket/handlers/room.ts` — handle create-room, join-room, disconnect
- `src/room/RoomManager.ts` — Map-based room storage, create/join/remove/getByCode
- `src/room/PlayerManager.ts` — player state, reconnect token mapping
- `src/utils/id.ts` — UUID wrapper

**packages/host**
- `package.json` — `@igra/host`, depends on `@igra/shared`
- `tsconfig.json` — extends base, references shared
- `vite.config.ts` — React plugin, port 5173, proxy /socket.io to 3001
- `index.html` — HTML shell, meta viewport for TV/desktop
- `src/main.tsx` — React root render
- `src/App.tsx` — renders LobbyScreen or GameScreen based on state
- `src/socket.ts` — singleton Socket.io client with typed events
- `src/store/roomStore.ts` — Zustand: room, players, status, actions
- `src/screens/LobbyScreen.tsx` — room code, QR code, player list, Start button
- `src/components/PlayerList.tsx` — player names with avatar color dots
- `src/components/QRCodeDisplay.tsx` — QR code pointing to controller URL with room code
- `src/styles/global.css` — CSS reset, dark theme, TV-sized fonts

**packages/controller**
- `package.json` — `@igra/controller`, depends on `@igra/shared`
- `tsconfig.json` — extends base, references shared
- `vite.config.ts` — React plugin, port 5174
- `index.html` — HTML shell, mobile viewport
- `src/main.tsx` — React root render
- `src/App.tsx` — JoinScreen or LobbyScreen based on connection state
- `src/socket.ts` — singleton Socket.io client
- `src/store/playerStore.ts` — Zustand: player, room, reconnectToken (persisted to localStorage)
- `src/screens/JoinScreen.tsx` — room code + name input, join button, pre-fill from URL params
- `src/screens/LobbyScreen.tsx` — "Waiting for host to start..." + player list
- `src/styles/global.css` — CSS reset, mobile-first dark theme, large touch targets

### Verification
1. `npm install` at root links workspaces
2. `npm run dev` starts all 3 services concurrently
3. Host at localhost:5173 creates a room, shows code + QR
4. Controller at localhost:5174 joins with code + name
5. Host updates to show the new player
6. Closing controller tab triggers player-left on host

---

## Phase 2: Pluggable Game Module System [DONE]

**Goal**: Build the game framework infrastructure. Register a trivial "test game" to verify the full pipeline.

### No new packages needed.

### Socket events (additions)

| Event | Direction | Payload |
|---|---|---|
| `game:started` | server→all | `{ gameId, gameState }` |
| `game:state-update` | server→host | `{ gameState }` |
| `game:player-state` | server→controller | `{ gameState (own playerData only) }` |
| `game:player-action` | controller→server | `{ action, data }` |
| `game:ended` | server→all | `{ finalScores }` |
| `game:phase-changed` | server→all | `{ phase, timeRemaining }` |

### Files to create/modify

**packages/shared**
- `src/types/game.ts` (modify) — add GameModuleManifest, GameLifecyclePhase
- `src/types/events.ts` (modify) — add game events to socket maps
- `src/games/index.ts` — barrel export of game definitions
- `src/games/registry.ts` — GAME_DEFINITIONS record listing available games

**packages/server**
- `src/game/IGameModule.ts` — interface with lifecycle hooks (onStart, onPlayerAction, onTick, onEnd)
- `src/game/BaseGameModule.ts` — abstract class with default no-ops
- `src/game/GameRegistry.ts` — Map<string, IGameModule> with register/get
- `src/game/GameManager.ts` — orchestrates lifecycle: start, tick loop (1s), route actions, emit state
- `src/game/games/test-game/TestGameModule.ts` — trivial test: one phase, first button press wins
- `src/socket/handlers/game.ts` — handle start-game, player-action
- `src/socket/handlers/room.ts` (modify) — wire in game handlers

**packages/host**
- `src/store/gameStore.ts` — Zustand: gameId, gameState, phase
- `src/components/GameRouter.tsx` — reads gameId, lazy-loads game component from registry
- `src/games/registry.ts` — gameId → dynamic import map
- `src/games/test-game/TestGameHost.tsx` — simple test game view
- `src/screens/GameSelectScreen.tsx` — grid of available games, host picks one
- `src/screens/GameScreen.tsx` — wraps GameRouter + game-over overlay
- `src/App.tsx` (modify) — add game-select and in-game states

**packages/controller**
- `src/store/gameStore.ts` — Zustand: gameId, gameState, playerData
- `src/components/GameRouter.tsx` — controller-side lazy-load router
- `src/games/registry.ts` — controller game component registry
- `src/games/test-game/TestGameController.tsx` — big "Press Me!" button
- `src/screens/GameScreen.tsx` — wraps GameRouter
- `src/App.tsx` (modify) — add game screen state

### Verification
1. Host creates room, players join, host sees game selection screen
2. Host selects "Test Game", clicks Start
3. Server creates TestGameModule, emits game:started
4. Host + controllers render their respective test game components via GameRouter
5. First player to press button wins, game ends, returns to lobby

---

## Phase 3: Quiz Game

**Goal**: Full quiz with timed questions, speed-based scoring, animated leaderboard on host, colored answer buttons on controllers.

### Packages: `howler`, `@types/howler` on host (for Phase 5, but add dependency now)

### Scoring: `score = correct ? Math.round(1000 * (timeRemaining / timeLimit)) : 0`

### Quiz phase flow
```
per question:
  'showing-question' (3s) → host sees question text, controllers see "Get ready"
  'answering' (15s default) → controllers see buttons, host sees countdown + answer count
  'showing-results' (5s) → correct answer revealed, scores shown
  'leaderboard' (5s) → rankings with animated transitions
after all questions → 'game-over' → final leaderboard
```

### Quiz-specific socket events

| Event | Direction | Payload |
|---|---|---|
| `quiz:show-question` | server→host | `{ question, questionIndex, totalQuestions }` |
| `quiz:show-options` | server→controllers | `{ options, timeLimit }` |
| `quiz:answer` | controller→server | (via game:player-action) `{ optionIndex }` |
| `quiz:answer-ack` | server→controller | `{ hasAnswered, selectedIndex }` |
| `quiz:answer-count` | server→host | `{ answeredCount, totalPlayers }` |
| `quiz:show-results` | server→all | `{ results: QuizResultData }` |
| `quiz:show-leaderboard` | server→all | `{ leaderboard }` |

### Files to create/modify

**packages/shared**
- `src/types/quiz.ts` — QuizQuestion, QuizOption, QuizHostData, QuizResultData, QuizControllerData
- `src/games/quiz-questions.ts` — default question bank (20+ questions)
- `src/games/registry.ts` (modify) — add quiz definition

**packages/server**
- `src/game/games/quiz/QuizGameModule.ts` — implements IGameModule, manages question flow/timers/scoring
- `src/game/games/quiz/QuizState.ts` — internal state types
- `src/game/GameRegistry.ts` (modify) — register QuizGameModule

**packages/host**
- `src/games/registry.ts` (modify) — add quiz lazy import
- `src/games/quiz/QuizGameHost.tsx` — main quiz host component
- `src/games/quiz/components/QuestionDisplay.tsx` — question text + countdown circle (framer-motion)
- `src/games/quiz/components/OptionGrid.tsx` — 2x2 colored option cards
- `src/games/quiz/components/AnswerCounter.tsx` — "3/5 answered" indicator
- `src/games/quiz/components/ResultsReveal.tsx` — animated correct answer reveal + answer distribution
- `src/games/quiz/components/Leaderboard.tsx` — ranked list with AnimatePresence for rank changes

**packages/controller**
- `src/games/registry.ts` (modify) — add quiz lazy import
- `src/games/quiz/QuizGameController.tsx` — main controller component
- `src/games/quiz/components/AnswerButtons.tsx` — 4 large colored buttons filling screen
- `src/games/quiz/components/WaitingForResults.tsx` — "Answer locked in!" screen
- `src/games/quiz/components/RoundResult.tsx` — shows +score or "Wrong!"

### Verification
1. Start quiz with 2+ players
2. Host shows question with countdown, controllers show 4 colored buttons
3. Tapping locks answer (can't re-answer), host counter increments
4. Timer expiry → results phase with correct answer animation
5. Leaderboard animates rank changes
6. Fast answerer scores more than slow answerer
7. After all questions → final leaderboard → game ends

---

## Phase 4: Polish — Sounds, Haptics, Reconnection, PWA

**Goal**: Production-quality polish for the existing platform and Quiz game. Sounds on host, haptic feedback on controllers, robust reconnection, PWA for controller, mobile-optimized UI.

### Packages
- `packages/host`: `howler`, `@types/howler`
- `packages/controller`: `vite-plugin-pwa` (dev)

### 4A: Host Sounds (Howler.js)

Sound effects play on the host (TV) during key moments. Using Howler.js for reliable cross-browser audio.

**Files to create:**
- `src/audio/SoundManager.ts` — singleton wrapping Howler.js. Methods: `play('tick')`, `play('correct')`, `play('wrong')`, `play('reveal')`, `play('victory')`, `play('join')`, `play('countdown')`. Handles preloading, volume control, prevents overlap on rapid triggers.
- `src/audio/sounds/` — directory with free/CC0 `.mp3` files (or generate with Web Audio API as fallback: simple sine/square wave beeps for tick, ascending tone for correct, descending for wrong, fanfare chord for victory)
- `src/hooks/useSound.ts` — React hook: `const { play } = useSound()`. Wraps SoundManager for component use.

**Files to modify:**
- `src/games/quiz/QuizGameHost.tsx` — tick sound during answering countdown, reveal sound on showing-results, correct/wrong stinger, victory on final leaderboard
- `src/components/PlayerList.tsx` — play 'join' sound when a new player appears

**Sound trigger map:**

| Moment | Sound | When |
|---|---|---|
| Player joins lobby | `join` | `room:player-joined` event |
| Question countdown | `tick` | each second during `answering` phase when ≤5s |
| Results revealed | `reveal` | transition to `showing-results` |
| Final leaderboard | `victory` | transition to `ended` phase |

### 4B: Controller Haptics

Vibration feedback on phones using `navigator.vibrate()`.

**Files to create:**
- `src/utils/haptics.ts` — `vibrate(pattern)` wrapper. Patterns: `tap: [50]`, `success: [50, 50, 100]`, `error: [100, 50, 100, 50, 100]`. No-op if API unavailable.
- `src/hooks/useHaptics.ts` — React hook returning `{ tap, success, error }` functions

**Files to modify:**
- `src/games/quiz/components/AnswerButtons.tsx` — `tap` on button press, `success` on correct result, `error` on wrong result
- `src/games/quiz/QuizGameController.tsx` — trigger haptics on phase transitions to results

### 4C: Reconnection Hardening

Currently disconnect = mark as disconnected. Need: grace period + automatic restore.

**Server changes:**
- `src/room/PlayerManager.ts` (modify) — on disconnect: start 30s `setTimeout`. If player reconnects with valid token, cancel timer and restore. If timer fires, fully remove player and emit `room:player-left`.
- `src/socket/setup.ts` (modify) — on new connection, check for `reconnectToken` in handshake `auth` object. If found + valid, restore player's socket data and re-join room.
- `src/socket/middleware/auth.ts` (new) — Socket.io middleware extracting `reconnectToken` from `socket.handshake.auth`

**Controller changes:**
- `src/socket.ts` (modify) — pass `reconnectToken` from localStorage in socket `auth` option. Add reconnection with exponential backoff (`reconnectionDelay: 1000`, `reconnectionDelayMax: 5000`).
- `src/store/playerStore.ts` (modify) — ensure token persists across page reloads
- `src/App.tsx` (modify) — show "Reconnecting..." overlay when `isConnected` is false but player exists

**Reconnection state machine (server):**
```
CONNECTED →[socket disconnect]→ DISCONNECTED (start 30s timer)
DISCONNECTED →[reconnect with valid token within 30s]→ CONNECTED (cancel timer, restore seat)
DISCONNECTED →[30s elapsed]→ REMOVED (emit room:player-left, clean up)
DISCONNECTED →[reconnect with invalid/no token]→ treat as new player
```

### 4D: PWA Setup (Controller)

Make the controller installable as a standalone app on phones.

**Files to create:**
- `public/manifest.json` — `name: "Igra Na Klik"`, `short_name: "Igra"`, `start_url: "/"`, `display: "standalone"`, `theme_color: "#1a1a2e"`, `background_color: "#1a1a2e"`, icons
- `public/icons/icon-192.png` — PWA icon 192x192
- `public/icons/icon-512.png` — PWA icon 512x512

**Files to modify:**
- `vite.config.ts` — add `VitePWA({ registerType: 'autoUpdate', manifest: false (use public/manifest.json), workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] } })`
- `index.html` — add `<link rel="manifest" href="/manifest.json">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon">`

### 4E: Mobile UI Polish

**Files to modify:**
- `packages/controller/src/styles/global.css` — safe-area-inset padding (`env(safe-area-inset-*)`), prevent overscroll (`overscroll-behavior: none`), prevent zoom on input focus (`touch-action: manipulation`), min 48px touch targets, disable text selection on game elements (`user-select: none`)
- `packages/controller/index.html` — add `<meta name="apple-mobile-web-app-capable" content="yes">`

### Verification
1. **Sounds**: Host plays tick during quiz countdown (≤5s), reveal on results, victory on final leaderboard. Sounds don't overlap or cut out.
2. **Haptics**: On a real phone, feel vibration when tapping quiz answer buttons. Different pattern for correct vs wrong.
3. **Reconnection**: Player joins game → close tab → reopen within 30s → player restored with score. After 30s → fully removed, host shows player gone.
4. **PWA**: On Android Chrome, "Add to Home Screen" prompt appears. Installed app opens standalone without browser chrome.
5. **Mobile UI**: No zoom on double-tap or input focus. No overscroll bounce. Safe area insets on notched phones.

---

## Phase 5: Draw & Guess Game

**Goal**: Drawing game with live canvas streaming, turn rotation, and text-based guessing.

### No new packages needed (Canvas API is built-in).

### Scoring
- Guesser: `Math.round(500 * (timeRemaining / timeLimit))`
- Drawer: 100 points per correct guesser
- Nobody guesses: drawer gets 0

### Draw & Guess socket events

| Event | Direction | Payload |
|---|---|---|
| `draw:new-turn` | server→all | `{ drawerId, wordHint, timeLimit }` |
| `draw:word-choices` | server→drawer | `{ words: string[] }` |
| `draw:word-chosen` | server→all | `{ wordHint, wordLength }` |
| `draw:stroke-data` | drawer→server | `{ points: {x,y}[], color, width }` |
| `draw:stroke-broadcast` | server→host+guessers | same as above |
| `draw:clear-canvas` | drawer→server | `{}` |
| `draw:clear-broadcast` | server→host+guessers | `{}` |
| `draw:guess` | guesser→server | (via game:player-action) `{ text }` |
| `draw:guess-result` | server→guesser | `{ correct }` |
| `draw:correct-guess` | server→all | `{ playerId }` |
| `draw:hint-update` | server→all | `{ wordHint }` |
| `draw:turn-results` | server→all | `{ word, scores }` |

### Files to create/modify

**packages/shared**
- `src/types/draw-guess.ts` — Stroke, DrawGuessHostData, DrawGuessControllerData interfaces
- `src/games/draw-words.ts` — word bank (100+ words, easy/medium/hard)
- `src/games/registry.ts` (modify) — add draw-guess definition

**packages/server**
- `src/game/games/draw-guess/DrawGuessModule.ts` — turn rotation, word selection (3 choices), guess checking (case-insensitive), progressive hints (reveal letter every 20% of time)
- `src/game/games/draw-guess/DrawGuessState.ts` — internal state types
- `src/game/GameRegistry.ts` (modify) — register DrawGuessModule

**packages/host**
- `src/games/registry.ts` (modify) — add draw-guess lazy import
- `src/games/draw-guess/DrawGuessHost.tsx` — main host component
- `src/games/draw-guess/components/DrawingCanvas.tsx` — read-only canvas replaying strokes, scales normalized coords
- `src/games/draw-guess/components/GuessList.tsx` — scrolling guess list, correct guesses in green
- `src/games/draw-guess/components/WordHint.tsx` — `_ _ a _ _` display
- `src/games/draw-guess/components/TurnInfo.tsx` — who's drawing, round counter
- `src/games/draw-guess/components/TurnResults.tsx` — reveal word + scores

**packages/controller**
- `src/games/registry.ts` (modify) — add draw-guess lazy import
- `src/games/draw-guess/DrawGuessController.tsx` — switches between DrawingPad / GuessingInput
- `src/games/draw-guess/components/DrawingPad.tsx` — full-screen touch canvas, batches points every 50ms, color picker + width selector + clear/undo
- `src/games/draw-guess/components/ColorPicker.tsx` — 6 preset color circles
- `src/games/draw-guess/components/GuessingInput.tsx` — text input at bottom, disables on correct guess
- `src/games/draw-guess/components/WordPicker.tsx` — 3 word cards for drawer to choose from

### Drawing data flow
```
Phone touchmove → collect points (normalized 0-1)
  → emit draw:stroke-data every 50ms
  → server stores + broadcasts draw:stroke-broadcast
  → host DrawingCanvas draws with lineTo(), scaling back to canvas size
```

### Verification
1. Start Draw & Guess with 3+ players
2. First drawer sees 3 word choices on controller
3. After picking, drawer gets full-screen canvas with tools
4. Host mirrors drawing in real-time
5. Guessers see text input, correct guess shows success + awards points
6. Host shows "Player X guessed it!" without revealing word
7. Hints progressively reveal letters
8. Turn ends → word revealed → scores shown → next drawer

---

## File Count Summary

| Phase | New files | Modified files |
|---|---|---|
| Phase 1: Scaffolding + Rooms | ~28 | 0 |
| Phase 2: Game Framework | ~14 | 4 |
| Phase 3: Quiz | ~11 | 3 |
| Phase 4: Polish | ~8 | ~10 |
| Phase 5: Draw & Guess | ~14 | 2 |
| **Total** | **~75** | **~19** |

## Critical Files
- `packages/shared/src/types/events.ts` — single source of truth for all socket communication
- `packages/server/src/game/IGameModule.ts` — defines the pluggable game architecture
- `packages/server/src/room/RoomManager.ts` — core room lifecycle logic
- `packages/server/src/game/GameManager.ts` — game runtime orchestration
- `packages/host/src/components/GameRouter.tsx` — dynamic import router for game components (mirrored in controller)
