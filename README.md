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

## Current Status

**Phase 1 complete** — project scaffolding and room system.

- [x] Monorepo with npm workspaces
- [x] Shared types and typed Socket.io event contracts
- [x] Server with room creation, player join/leave, reconnect token support
- [x] Host lobby with room code, QR code, player list
- [x] Controller with join screen (code + name input, URL pre-fill) and lobby

### Upcoming

See [PLAN.md](PLAN.md) for full details on remaining phases:

- **Phase 2** — Pluggable game module system (`IGameModule` interface, `GameManager`, lazy-loaded game components)
- **Phase 3** — Quiz game (timed questions, speed-based scoring, animated leaderboard)
- **Phase 4** — Draw & Guess (live canvas streaming, word guessing)
- **Phase 5** — Polish (sounds, haptics, reconnection, PWA)

## Architecture

### Room System

- Host creates a room → gets a 4-letter code (excludes ambiguous chars like O, I, L)
- Players join by code → server assigns UUID + avatar color + reconnect token
- Reconnect tokens stored in `localStorage` — if a player disconnects and reconnects within 30s, they're restored

### Socket Events

| Event | Direction | Description |
|---|---|---|
| `host:create-room` | host → server | Create a new room |
| `host:room-created` | server → host | Room created with code |
| `player:join-room` | controller → server | Join room by code |
| `player:joined` | server → controller | Join confirmed |
| `room:player-joined` | server → all | Broadcast: new player |
| `room:player-left` | server → all | Broadcast: player disconnected |
| `room:player-reconnected` | server → all | Broadcast: player restored |

### Ports

| Service | Port |
|---|---|
| Server | 3001 |
| Host (Vite dev) | 5173 |
| Controller (Vite dev) | 5174 |
