# Igra Na Klik

A party game platform where one device acts as the host display (TV/big screen) and players use their phones as controllers — like AirConsole, but self-hosted.

## How It Works

1. Open the **host** on a TV or laptop — it automatically creates a room with a 4-letter code + QR code
2. Players open the **controller** on their phones, enter the code (or scan the QR), and pick a name
3. The host lobby shows all connected players in real-time
4. When ready, the host picks a mini-game and starts

## Tech Stack

| Package | Tech | Purpose |
|---|---|---|
| `@igra/shared` | TypeScript | Shared types, constants, utilities |
| `@igra/server` | Node.js, Express, Socket.io | WebSocket server, room management |
| `@igra/host` | React, Vite, Zustand, Framer Motion | TV/big screen display |
| `@igra/controller` | React, Vite, Zustand | Phone controller UI |

## Project Structure

```
igra-na-klik/
├── packages/
│   ├── shared/          # Types, socket event contracts, constants
│   ├── server/          # WebSocket server + room system
│   ├── host/            # Host display (React + Vite, port 5173)
│   └── controller/      # Phone controller (React + Vite, port 5174)
├── PLAN.md              # Full implementation plan (5 phases)
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

5. On phones, open `http://192.168.1.42:5174` and join with the room code

> **Note:** The Vite dev servers are configured with `host: true` so they bind to `0.0.0.0` and are accessible on LAN. The `.env` tells the Socket.io server to accept connections from the LAN origins (CORS). Make sure your firewall allows ports 3001, 5173, and 5174.

## Current Status

**Phase 2 complete** — pluggable game module system.

- [x] **Phase 1** — Monorepo scaffolding, room system, lobby UI, QR code join
- [x] **Phase 2** — Pluggable game module framework with test game

### Phase 2 Details

- `IGameModule` interface with lifecycle hooks (`onStart`, `onPlayerAction`, `onTick`, `onEnd`)
- `GameManager` orchestrates game lifecycle with 1-second tick loop
- `GameRegistry` for registering game modules by ID
- `GameRouter` on host and controller lazy-loads game-specific React components
- `GameSelectScreen` on host for choosing which game to play
- Test game included: first player to press the button wins

### Upcoming

See [PLAN.md](PLAN.md) for full details on remaining phases:

- **Phase 3** — Quiz game (timed questions, speed-based scoring, animated leaderboard)
- **Phase 4** — Draw & Guess (live canvas streaming, word guessing)
- **Phase 5** — Polish (sounds, haptics, reconnection, PWA)

## Architecture

### Room System

- Host creates a room → gets a 4-letter code (excludes ambiguous chars like O, I, L)
- Players join by code → server assigns UUID + avatar color + reconnect token
- Reconnect tokens stored in `localStorage` — if a player disconnects and reconnects within 30s, they're restored

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
