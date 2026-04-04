# Igra Na Klik

A party game platform where one device acts as the host display (TV/big screen) and players use their phones as controllers — like AirConsole, but self-hosted.

## How It Works

1. Open the **host** on a TV or laptop — it automatically creates a room with a 4-letter code + QR code
2. Players open the **controller** on their phones, scan the QR code or enter the room code, and pick a name
3. The host lobby shows all connected players in real-time
4. When ready, the host picks a mini-game and starts
5. The host can stop the game at any time to return to game selection

## Tech Stack

| Package | Tech | Purpose |
|---|---|---|
| `@igra/shared` | TypeScript | Shared types, constants, utilities |
| `@igra/server` | Node.js, Express, Socket.io | WebSocket server, room management |
| `@igra/host` | React, Vite, Zustand, Framer Motion, Howler.js | TV/big screen display |
| `@igra/controller` | React, Vite, Zustand | Phone controller UI (PWA) |

## Project Structure

```
igra-na-klik/
├── packages/
│   ├── shared/          # Types, socket event contracts, constants, game definitions
│   ├── server/          # WebSocket server + room system + game modules
│   ├── host/            # Host display (React + Vite, port 5173)
│   └── controller/      # Phone controller (React + Vite, port 5174)
├── PLAN.md              # Full implementation plan
├── package.json         # npm workspaces root
└── tsconfig.base.json   # Shared TypeScript config
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Install all dependencies
npm install

# Build the shared types package
npm run build:shared

# Start all three services (server + host + controller)
npm run dev
```

This starts:
- **Server** on `http://localhost:3001`
- **Host** on `http://localhost:5173`
- **Controller** on `http://localhost:5174`

### Try It Out

1. Open `http://localhost:5173` in a browser — a room is created automatically
2. Open `http://localhost:5174` on another tab or your phone
3. Enter the 4-letter room code and a name
4. The host screen updates to show the new player
5. Pick a game and start!

### LAN Testing (phones on same Wi-Fi)

To test with real phones, expose the services on your local network:

1. Find your PC's local IP (e.g. `192.168.1.42`):
   ```bash
   # Windows
   ipconfig
   # macOS/Linux
   ip addr show | grep "inet "
   ```

2. Create a `.env` file in the project root:
   ```env
   PORT=3001
   HOST_ORIGIN=http://192.168.1.42:5173
   CONTROLLER_ORIGIN=http://192.168.1.42:5174
   ```

3. Start with `npm run dev`

4. On your PC, open the host at `http://192.168.1.42:5173`

5. The QR code on the lobby screen will automatically use your machine's IP — phones can scan it directly

6. On phones, open the URL from the QR code or go to `http://192.168.1.42:5174` and enter the room code

> **Note:** The Vite dev servers are configured with `host: true` so they bind to `0.0.0.0` and are accessible on LAN. The `.env` tells the Socket.io server to accept connections from the LAN origins (CORS). Make sure your firewall allows ports 3001, 5173, and 5174.

## Current Status

**All phases complete** — quiz, draw & guess, and Fibbage-style bluffing (Serbian), with sounds, haptics, reconnection, and PWA support.

- [x] **Phase 1** — Monorepo scaffolding, room system, lobby UI, QR code join
- [x] **Phase 2** — Pluggable game module framework with test game
- [x] **Phase 3** — Quiz game (timed questions, speed-based scoring, animated leaderboard)
- [x] **Phase 4** — Polish (sounds, haptics, reconnection, PWA, UX improvements)
- [x] **Phase 5** — Draw & Guess (live canvas streaming, turn rotation, progressive hints)
- [x] **Phase 6** — Lažov (Fibbage-style bluffing, Serbian-only content)

### What's Implemented

**Room System**
- 4-letter room codes (excludes ambiguous chars O, I, L)
- Host creates room, players join by code or QR scan
- QR code uses the actual server hostname — works on LAN without config

**Quiz Game**
- 25-question bank, 10 random questions per game
- Phase flow: question preview → answering (15s) → results reveal → leaderboard
- Speed-based scoring: faster correct answers score more (up to 1000 pts)
- Animated leaderboard with rank change tracking (Framer Motion)
- Host shows answer distribution; controllers show colored answer buttons

**Sound & Haptics**
- Host plays programmatically generated tones (no external audio files) via Howler.js
- Tick sounds during countdowns, correct/wrong sounds on reveal, victory fanfare
- Controller vibrates on answer tap, correct/wrong feedback

**Reconnection**
- Token-based reconnection with 30s grace period
- Token stored in `localStorage` — survives page refresh
- Players restored with score intact if they reconnect in time

**PWA (Controller)**
- Installable as a standalone app on Android
- Splash screen, theme color, touch-optimized layout
- No zoom on input focus, overscroll prevention, safe-area support

**Stop Game**
- Host can stop the current game at any time via "Stop Game" button
- Returns all clients to the game selection screen

**Draw & Guess**
- 105-word bank across easy/medium/hard difficulties
- Turn rotation with shuffled player order, 3 rounds by default
- Drawer picks from 3 word choices (one per difficulty), 60s to draw
- Live canvas streaming: normalized stroke points batched every 50ms
- Progressive hints: letters reveal gradually as time elapses
- Scoring: guessers earn up to 500 pts based on speed, drawer earns 100 per correct guesser
- Full drawing toolbar on controller: 7 colors, 3 brush widths, clear button

**Lažov (Fibbage-style bluffing)** — *Serbian-only content*
- 34-question Serbian trivia bank (Latin script), 5 questions per game
- Phase flow: show question (5s) → write lies (30s) → vote (20s) → reveal (8s) → leaderboard
- Players submit fake answers; all fakes + real answer shown as voting options
- Scoring: +500 for finding the truth, +100 per voter fooled by your fake
- Auto-finder detection: if a player types the real answer, they get truth credit and their submission is excluded from the voting pool
- Duplicate fakes (case-insensitive) are merged — both fakers split the fool bonus
- Players cannot vote for their own fake (visually grayed out)
- All in-game UI strings hardcoded in Serbian (Latin); other games and platform UI remain English pending a future i18n retrofit

## Architecture

### Room System

- Host creates a room → gets a 4-letter code (excludes ambiguous chars like O, I, L)
- Players join by code → server assigns UUID + avatar color + reconnect token
- Reconnect tokens stored in `localStorage` — if a player disconnects and reconnects within 30s, they're restored

### Game Module System

Each mini-game implements the `IGameModule` interface on the server:

```typescript
interface IGameModule {
  readonly gameId: string;
  onStart(room: Room): GameState;
  onPlayerAction(room: Room, state: GameState, playerId: string, action: string, data: Record<string, unknown>): GameState | null;
  onTick(room: Room, state: GameState, deltaMs: number): GameState | null;
  onPlayerDisconnect(room: Room, state: GameState, playerId: string): GameState | null;
  onEnd(room: Room, state: GameState): void;
}
```

Host and controller each have a `GameRouter` that lazy-loads the appropriate React component by `gameId`.

### Socket Events

**Room events:**

| Event | Direction | Description |
|---|---|---|
| `host:create-room` | host → server | Create a new room |
| `host:room-created` | server → host | Room created with code |
| `player:join-room` | controller → server | Join room by code |
| `player:joined` | server → controller | Join confirmed |
| `room:player-joined` | server → all | Broadcast: new player |
| `room:player-left` | server → all | Broadcast: player disconnected |
| `room:player-reconnected` | server → all | Broadcast: player restored |

**Game events:**

| Event | Direction | Description |
|---|---|---|
| `host:start-game` | host → server | Host starts selected game |
| `host:stop-game` | host → server | Host stops current game |
| `game:started` | server → all | Game has started |
| `game:state-update` | server → host | Full game state update |
| `game:player-state` | server → controller | Per-player game state (private data) |
| `game:player-action` | controller → server | Player sends a game action |
| `game:phase-changed` | server → all | Game phase transition |
| `game:ended` | server → all | Game finished with final scores |

### Adding a New Game

1. Add a `GameDefinition` entry in `packages/shared/src/games/registry.ts`
2. Create a server module implementing `IGameModule` in `packages/server/src/game/games/`
3. Register it in `packages/server/src/socket/setup.ts`
4. Create host and controller React components in their respective `src/games/` directories
5. Add lazy-import entries in `packages/host/src/games/registry.ts` and `packages/controller/src/games/registry.ts`

### Ports

| Service | Port |
|---|---|
| Server | 3001 |
| Host (Vite dev) | 5173 |
| Controller (Vite dev) | 5174 |
