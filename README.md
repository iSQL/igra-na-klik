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

### Single-room mode (home use)

If you only ever run one room at a time, you can enable single-room mode. Controllers will automatically fetch the active room code from the server — players only need to type their name, no code input needed.

1. Add to your root `.env`:
   ```env
   SINGLE_ROOM_MODE=true
   ```

2. Create `packages/controller/.env`:
   ```env
   VITE_SINGLE_ROOM=true
   ```

3. Start normally with `npm run dev`.

When the host opens a room, phones visiting the controller URL will see the code auto-filled and just need to enter their name. The room code field is hidden entirely.

## Deployment (Docker / Coolify)

The repo ships with a production [Dockerfile](Dockerfile) that packages all three services into a single container on one domain:

- Host (TV screen) served at `/`
- Controller (phones) served at `/play`
- Socket.io + API share the same origin, so no cross-origin CORS/WebSocket routing is needed

### Build & run locally

```bash
docker build -t igra-na-klik .
docker run --rm -p 3001:3001 igra-na-klik
```

Open `http://localhost:3001` on one device and `http://localhost:3001/play` on another.

### Same-room nights with Docker Compose

For occasional in-home parties where everyone's on the same Wi-Fi, running the server locally keeps all traffic on your LAN (no round-trip to a VPS). The repo includes a [docker-compose.yml](docker-compose.yml) that wraps the Dockerfile with sensible defaults so you don't have to remember flags.

```bash
docker compose up -d --build    # first time, or after pulling code changes
docker compose up -d            # any subsequent night — starts instantly
docker compose down             # when you're done
docker compose logs -f          # if something looks wrong
```

Then on the TV/laptop hosting the game, open `http://<your-lan-ip>:3001` (find it with `ipconfig` on Windows or `ip addr` on Linux/macOS — e.g. `http://192.168.1.42:3001`). Phones scan the QR code on the lobby screen and land directly on the controller. `SINGLE_ROOM_MODE` is enabled in the compose file by default, so players only type their name — no room code entry.

**First-run setup:**

- Windows: allow port 3001 through Windows Defender Firewall for **Private** networks (you'll get a prompt on first run)
- macOS: System Settings → Network → Firewall → allow Docker
- Linux: `sudo ufw allow 3001/tcp` if you're running ufw

**Why Compose over `docker run`?** The compose file codifies the port mapping, the `SINGLE_ROOM_MODE` env var, and the restart policy so you get a one-command start each night. It also makes it trivial to add auxiliary services later (e.g. a reverse proxy for HTTPS) without changing how you launch things.

### Coolify (Hetzner VPS or similar)

1. In Coolify, create a new **Application** → **Public Repository** (or your GitHub integration) pointing at this repo
2. Choose **Dockerfile** as the build pack
3. Set the exposed port to `3001`
4. Add your domain; Coolify's Traefik terminates TLS and routes everything to the container
5. (Optional) Set `SINGLE_ROOM_MODE=true` in the Coolify env vars if you want controllers to auto-fill the room code

The Dockerfile sets `SAME_ORIGIN_DEPLOY=true` internally, which tells the server to accept same-origin Socket.io connections without needing `HOST_ORIGIN` / `CONTROLLER_ORIGIN` configured.

### Relevant env vars

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP + Socket.io port |
| `SAME_ORIGIN_DEPLOY` | `true` in Docker | Relaxes CORS; host and controller share one origin |
| `SINGLE_ROOM_MODE` | `false` | Exposes `/room-code` so the controller auto-fills the active room |
| `QUESTION_PACKS_DIR` | `./question-packs` | Override location of JSON question packs |
| `GEO_PACKS_DIR` | `./geo-packs` | Override location of geo-pack manifests + image folders |
| `KO_SAM_JA_PACKS_DIR` | `./ko-sam-ja-packs` | Override location of Ko sam ja JSON question packs |
| `HOST_DIST_DIR` / `CONTROLLER_DIST_DIR` | baked into image | Override static dist locations (rarely needed) |

## Current Status

**All phases complete** — Kviz, Crtaj i pogodi, Lažov, Slepi telefoni, Pogodi gde je, Foto kviz, and Ko sam ja (Serbian content throughout), with sounds, haptics, reconnection, and PWA support.

- [x] **Phase 1** — Monorepo scaffolding, room system, lobby UI, QR code join
- [x] **Phase 2** — Pluggable game module framework with test game
- [x] **Phase 3** — Quiz game (timed questions, speed-based scoring, animated leaderboard)
- [x] **Phase 4** — Polish (sounds, haptics, reconnection, PWA, UX improvements)
- [x] **Phase 5** — Draw & Guess (live canvas streaming, turn rotation, progressive hints)
- [x] **Phase 6** — Lažov (Fibbage-style bluffing, Serbian-only content)
- [x] **Phase 7** — Slepi telefoni (Telestrations / Gartic Phone-style drawing chain)
- [x] **Phase 8** — Pogodi gde je (GeoGuessr-style location guessing on a map of Serbia)
- [x] **Phase 9** — Foto kviz (multiple-choice variant of Pogodi gde je — 4 captioned answers, speed scoring)
- [x] **Phase 10** — Ko sam ja (personal-question party game — players guess each other's answers, four question shapes including peer-name picks)

### What's Implemented

**Room System**
- 4-letter room codes (excludes ambiguous chars O, I, L)
- Host creates room, players join by code or QR scan
- QR code uses the actual server hostname — works on LAN without config

**Kviz (Quiz) — Serbian**
- 30-question Serbian trivia bank (Latin script), 10 random per game
- Phase flow: question preview → answering (15s) → results reveal → leaderboard
- Speed-based scoring: faster correct answers score more (up to 1000 pts)
- Animated leaderboard with rank change tracking (Framer Motion)
- Host shows answer distribution; controllers show colored answer buttons
- **Custom question import**: host can upload a `.json` file of custom questions on the game-select screen — replaces the default bank for that game; persists in `localStorage` across refreshes; cleared by clicking "Ukloni"

**Sound & Haptics**
- Host plays programmatically generated tones (no external audio files) via Howler.js
- Tick sounds during countdowns, correct/wrong sounds on reveal, victory fanfare
- Controller vibrates on answer tap, correct/wrong feedback

**Reconnection**
- Token-based reconnection with **5-minute** grace period — long enough that a phone screen going dark mid-round doesn't drop the player
- Token stored in `localStorage` — survives page refresh
- Players restored with score intact if they reconnect in time; the current phase is **replayed** to the returning controller so it jumps straight back into the round
- Controller acquires a screen Wake Lock while in a room to fight phone auto-suspend (best-effort; iOS Safari may decline)
- Destructive game-side disconnect handling (skipping a drawer's turn, etc.) is deferred until the grace window expires, so brief blips don't burn turns
- `room:player-left` is a transient "grey out" signal; `room:player-removed` is the permanent removal that fires only after grace expires or the host kicks

**Mobile admin (remote host)**
- Any one player can claim the host's controls from their phone — useful when nobody's near the TV
- Holder gets a phone-friendly game-select screen on the controller: start/stop games, pick mode, import question packs, choose geo-packs
- One claim at a time; releasing (or disconnecting) hands control back to the TV
- The holder is still a normal player — not a separate spectator role

**Kick / reclaim**
- Host can remove a player with the × button on their chip in the lobby — kick invalidates the reconnect token so they can't slip back in via cached `localStorage`
- If a returning player has lost their token (cleared cache, incognito, was kicked-then-rejoining), a fresh join with the same name **reclaims** the disconnected slot — score and avatar are preserved, a new token is minted

**Photo upload (Foto kviz / Pogodi gde je custom modes)**
- Tapping the photo button opens the device's default picker (gallery on most phones, with "take photo" as a secondary option) rather than forcing the rear camera

**PWA (Controller)**
- Installable as a standalone app on Android
- Splash screen, theme color, touch-optimized layout
- No zoom on input focus, overscroll prevention, safe-area support

**Stop Game**
- Host can stop the current game at any time via "Stop Game" button
- Returns all clients to the game selection screen

**Crtaj i pogodi (Draw & Guess) — Serbian**
- 105-word Serbian bank (Latin script) across easy/medium/hard difficulties
- Turn rotation with shuffled player order, 3 rounds by default
- Drawer picks from 3 word choices (one per difficulty), 60s to draw
- Live canvas streaming: normalized stroke points batched every 50ms
- Progressive hints: letters reveal gradually as time elapses
- Scoring: guessers earn up to 500 pts based on speed, drawer earns 100 per correct guesser
- Full drawing toolbar on controller: 7 colors, 3 brush widths, clear button

**Slepi telefoni (Telestrations / Gartic Phone-style)** — *Serbian-only content*
- 3–8 players; each player writes one starting phrase, then the chain rotates through alternating draw→guess→draw→guess steps
- Host picks **1–4 rounds** on the game-select screen — each round is one full pass around the circle, so with N players and R rounds every chain ends up `1 + R × (N−1)` items long (one prompt plus R alternations per other player)
- Rotation math skips multiples of N so no player ever draws or guesses on their own chain, even across pass boundaries
- Only **one** prompt phase per game — subsequent rounds continue the same chain instead of restarting with fresh prompts
- Reveal, voting, winner replay, and final leaderboard all happen **once** at the very end; players never see other chains' content mid-game
- Reveal shows each chain whole — drawings paired with their guesses side-by-side on the same screen
- Scoring: a single vote round at the end — each chain's votes go to its originator; final leaderboard ranks by total votes received
- Reuses the Crtaj i pogodi drawing pad and canvas; strokes stay private until reveal

**Lažov (Fibbage-style bluffing)** — *Serbian-only content*
- 34-question Serbian trivia bank (Latin script), 5 questions per game
- Phase flow: show question (5s) → write lies (30s) → vote (20s) → reveal (8s) → leaderboard
- Players submit fake answers; all fakes + real answer shown as voting options
- Scoring: +500 for finding the truth, +100 per voter fooled by your fake
- Auto-finder detection: if a player types the real answer, they get truth credit and their submission is excluded from the voting pool
- Duplicate fakes (case-insensitive) are merged — both fakers split the fool bonus
- Players cannot vote for their own fake (visually grayed out)
- All in-game UI strings hardcoded in Serbian (Latin); other games and platform UI remain English pending a future i18n retrofit

**Pogodi gde je (GeoGuessr-style)** — *Serbian-only content*
- 1–8 players; can be played solo against a predefined pack
- **Two modes:**
  - **Predefinisano**: server-served location packs from `geo-packs/` (configurable via `GEO_PACKS_DIR`). Each pack is a `<id>.json` manifest plus a sibling `<id>/` folder with images. Up to 8 random rounds per game.
  - **Slike igrača (custom)**: pre-game submission phase where each player uploads N (1–4) photos from their phone and tags each with a pin on the map. Photos are then shuffled and dealt out — players never get their own to guess.
- **EXIF GPS auto-fill** in custom mode: when a player picks a photo, the controller reads GPS metadata in parallel with downscaling (`exifr`). If coordinates fall within Serbia, the pin is pre-placed on the map. The player gets explicit colored feedback: ✓ green ("Lokacija učitana iz fotografije"), ⚠ yellow if no GPS or out-of-Serbia, red if parsing fails. Works as a fallback to manual placement.
- **Static SVG map of Serbia** with okrug borders ([Serbia_adm_location_map.svg](https://commons.wikimedia.org/wiki/File:Serbia_adm_location_map.svg) from Wikimedia Commons, CC BY-SA 3.0 DE). Affine projection in `packages/shared/src/games/serbia-projection.ts` matches the Wikipedia `Module:Location_map/data/Serbia` bbox (top=46.3, bottom=41.7, left=18.7, right=23.2).
- **Pinch-zoom + pan** on the controller's map (1×–5×), so players can place pins precisely. Tap-to-place, drag-to-pan when zoomed, double-tap or ↻ button to reset.
- **Scoring**: `points = round(5000 × exp(−distanceKm / 220))` — 0 km → 5000, 50 km → ~3990, 200 km → ~2030, 600 km → ~339. Distance computed via haversine on the truth's lat/lng vs. the controller's pin reprojected from SVG coords.
- **Privacy**: server hides the truth's lat/lng from clients during placing (only the image URL leaks); pins from other guessers stay private until reveal.
- Custom-mode photos are downscaled client-side (~1280px JPEG q=0.7), kept in-memory on the server for the session only.
- Host display: photo full-screen during placing, big map with all pins + truth + connecting lines during reveal, podium animation only on the final leaderboard.

**Foto kviz (multiple-choice variant of Pogodi gde je)** — *Serbian-only content*
- 1–8 players; same geo-pack infrastructure as Pogodi gde je (shared `geo-packs/` directory + `/api/geo-packs` endpoint).
- **Mechanic**: photo + 4 captioned answer options; players tap the one that names where the photo is from. Tap-one-of-four instead of pin-on-map.
- **Same two modes:**
  - **Predefinisano**: random rounds drawn from the selected pack. Correct answer is the location's `caption` field; the other 3 options are auto-picked from other captions in the same pack — no schema changes to the manifest.
  - **Slike igrača (custom)**: each player uploads N (1–4) photos and types a short caption that becomes the correct answer. Distractors come from other players' captions. Players sit out rounds that show their own photo (auto-detected via `contributedBy`).
- **Speed scoring** (mirrors Quiz): `points = round(1000 × timeRemaining / timeLimit)` — only awarded for correct answers, default `timeLimit = 15s`.
- **Phase flow**: `intro (3s) → [showing-photo (3s) → answering (15s) → showing-results (5s)] × N → final-leaderboard (8s)`. No leaderboard between rounds — final scores only at the end (same convention as Pogodi gde je).
- **Validation**:
  - Predefined: pack must have ≥4 locations with captions (locations missing a caption fall back to "Lokacija {i}").
  - Custom: requires ≥2 players AND `connected × customPhotosPerPlayer ≥ 4` (e.g. 2 players × 2 photos works; 1 player × any count refuses).
- **Reuses** the same `GeoPackButton`, `useGeoConfigStore`, and `downscaleImage` helpers as Pogodi gde je — picking the same pack in either game is consistent.
- Host display: photo with 4 colored options below during answering, options re-rendered with green outline on correct + per-player avatar chips on showing-results, podium animation only on the final leaderboard.

**Ko sam ja (personal questions about players)** — *Serbian-only content*
- 3–8 players; hybrid of Kviz (multiple-choice + speed scoring) and Lažov (subject-supplied answers).
- **Premise**: each round is a personal question about a *subject* player ("Omiljena boja igrača Mare?", "Sa kim bi Mare otvorio kafić?"). Subject answers; everyone else guesses what subject picked.
- **Two categories**: `family` (default) and `nsfw` (more personal/awkward). Host toggles per game on the game-select card. Single category per game; pack questions tagged so the host's choice filters the pool.
- **Phase flow**: `collecting-upfront (≤120s) → [showing-question (4s) → (subject-picking 15s for peer/pickN) → guessing (15s) → showing-results (6s) → leaderboard (4s)] × N → ended`. Up to 8 rounds per game, round-robin subject assignment so every player is the subject at least once.
- **Four question shapes**:
  - **fixed** — author-supplied 2–4 options ("crvena/plava/zelena/žuta"). Subject answers privately during the upfront collection phase.
  - **peer** — `{peer1}`/`{peer2}` placeholders bound at round time to two random co-players. Without `options`, server auto-generates two peer-name buttons. With `options`, author writes 2–4 buttons that can mix literal text with `{peer1}`/`{peer2}` references ("optužio {peer1}", "smestio {peer2}"). Subject picks at round time.
  - **free** — subject types a free-text answer upfront (default 60 char limit, configurable 10–120). Server samples 3 distractors from other players' free-text answers across the game (falls back to a built-in bank if the pool is thin).
  - **pickN** — "Most Likely To" style: server expands one button per connected co-player (capped at `maxPeers`, default 4). Optional `optionTemplate` like `"sa {peer}"` wraps each button; optional `extraOptions` mixes in literal non-peer buttons ("radije bi sam"). Merged list shuffled at round start.
- **Scoring**: guessers earn the standard Quiz speed-based score (up to 1000 pts scaled by `timeRemaining / timeLimit`). The subject earns a flat **+200 per wrong guess** on their own question — rewards being unpredictable.
- **Custom pack import**: same JSON pipeline as Quiz, but pointed at `ko-sam-ja-packs/` (override via `KO_SAM_JA_PACKS_DIR`). Host can drop a `.json` file or pick from server-discovered packs in a dropdown — persisted in `localStorage`. See "Ko sam ja Packs" below for the full schema.
- **Disconnect tolerance**: subject disconnects mid-`subject-picking` skip the round to leaderboard; rounds whose subject never answered an upfront question are pruned on collection exit; everything else honours the standard 5-minute grace.
- Host display: question text with subject name highlighted, faded option cards during `subject-picking`, full color grid during `guessing`, per-guesser breakdown + subject-bonus panel on `showing-results`, reused Quiz leaderboard between rounds.

## Architecture

### Room System

- Host creates a room → gets a 4-letter code (excludes ambiguous chars like O, I, L)
- Players join by code → server assigns UUID + avatar color + reconnect token
- Reconnect tokens stored in `localStorage` — if a player disconnects and reconnects within the 5-minute grace window, they're restored (score + active phase replayed)
- Returning with a fresh token but the same name **reclaims** a disconnected slot; host can kick a player with the × on their chip in the lobby

### Geo Packs (Pogodi gde je)

Predefined location packs live in `geo-packs/` at the repo root (override via `GEO_PACKS_DIR`). Each pack has the shape:

```
geo-packs/
├── branicevski.json           # manifest
└── branicevski/
    ├── viminacium.jpg
    └── lepenski-vir.jpg
```

Manifest format:

```json
{
  "name": "Braničevski okrug",
  "description": "Lokacije iz Braničevskog okruga",
  "locations": [
    {
      "imageFile": "viminacium.jpg",
      "lat": 44.7414,
      "lng": 21.2287,
      "district": "branicevski",
      "caption": "Viminacium, antički grad"
    }
  ]
}
```

Validation (in `packages/shared/src/games/geo-import.ts`):
- 1–100 locations per pack
- `lat` ∈ [41.5, 46.5], `lng` ∈ [18.5, 23.5]
- `district` is optional, must match one of the 25 Serbian okruzi (or `beograd`)
- `caption` ≤ 200 characters
- `imageFile` is a path relative to the pack folder; no `..` allowed

Server endpoints:
- `GET /api/geo-packs` — list of pack summaries (id, name, count) without lat/lng so clients can't peek at the answers
- `GET /geo-images/<id>/<file>` — static image serving with 7d cache + ETag

See [geo-packs/README.md](geo-packs/README.md) for the full list of valid `district` values and instructions for adding a new pack.

### Custom Quiz Questions

The host can import a custom question pack (JSON file) on the game-select screen. The format is:

```json
[
  {
    "text": "Koji je glavni grad Srbije?",
    "options": ["Niš", "Beograd", "Novi Sad", "Kragujevac"],
    "correctIndex": 1,
    "timeLimit": 15
  }
]
```

Rules:
- `text` — non-empty question string
- `options` — 2–4 non-empty strings
- `correctIndex` — 0-based index into `options`
- `timeLimit` — optional, 5–60 seconds (defaults to 15)

The imported pack replaces the built-in bank for that session. It is saved in `localStorage` on the host device and persists across page refreshes until explicitly removed.

### Ko sam ja Packs

Ko sam ja serves question packs from `ko-sam-ja-packs/` (override via `KO_SAM_JA_PACKS_DIR`). Each pack is a single `.json` file containing an array of questions tagged with one of four shapes:

```json
[
  {
    "shape": "fixed",
    "category": "family",
    "text": "Omiljena boja igrača {subject}?",
    "options": ["crvena", "plava", "zelena", "žuta"]
  },
  {
    "shape": "peer",
    "category": "family",
    "text": "Sa kim bi {subject} radije išao na put, sa {peer1} ili {peer2}?"
  },
  {
    "shape": "peer",
    "category": "nsfw",
    "text": "{subject} bi pre…",
    "options": ["javno priznao laž", "ćutao zauvek", "optužio {peer1}", "smestio {peer2}"]
  },
  {
    "shape": "free",
    "category": "family",
    "text": "Posao iz snova igrača {subject}?",
    "maxLength": 50
  },
  {
    "shape": "pickN",
    "category": "family",
    "text": "Sa kim bi {subject} otvorio kafić?",
    "optionTemplate": "sa {peer}",
    "extraOptions": ["radije bi sam", "ne bi otvarao kafić"],
    "maxPeers": 4
  }
]
```

**Common fields** (all shapes):
- `shape` — one of `fixed`, `peer`, `free`, `pickN`
- `category` — `family` or `nsfw` (host picks one per game)
- `text` — must contain `{subject}` exactly once (interpolated to the subject's name at runtime)

**Shape-specific rules**:
- `fixed` — 2–4 unique `options`. No `{peer*}` allowed in text. Subject answers privately upfront.
- `peer` — without `options`: text must contain `{peer1}` and `{peer2}` exactly once each. With `options`: 2–4 unique entries that may contain `{peer1}`/`{peer2}`/`{subject}` placeholders. Subject picks at round time after two random co-players are bound.
- `free` — optional `maxLength` (10–120 chars, default 60). No `options`, no `{peer*}`. Subject types upfront; server samples 3 distractors from other players' free-text answers.
- `pickN` — optional `optionTemplate` (must contain `{peer}` exactly once, e.g. `"sa {peer}"`), optional `maxPeers` (2–8, default 4), optional `extraOptions` (1–4 unique literal buttons that may reference `{subject}` but not `{peer*}`). Server expands one button per peer up to the cap; extras are appended and the merged list is shuffled.

Validation lives in [packages/shared/src/games/ko-sam-ja-import.ts](packages/shared/src/games/ko-sam-ja-import.ts). The same validator runs both on the host (file picker) and the server (`/api/ko-sam-ja-packs` endpoint and `host:start-game` re-check), with Serbian error messages on failure.

Sample pack: [ko-sam-ja-packs/sample-mix.json](ko-sam-ja-packs/sample-mix.json) — ~70 mixed-shape questions across both categories.

### Game Module System

Each mini-game implements the `IGameModule` interface on the server:

```typescript
interface IGameModule {
  readonly gameId: string;
  onStart(room: Room, customContent?: unknown): GameState;
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
| `host:kick-player` | host → server | Remove a player and invalidate their reconnect token |
| `player:join-room` | controller → server | Join room by code (also reclaims a disconnected slot if name matches) |
| `player:joined` | server → controller | Join confirmed |
| `player:claim-remote-host` | controller → server | Claim mobile-admin control of game selection |
| `player:release-remote-host` | controller → server | Release mobile-admin control |
| `room:player-joined` | server → all | Broadcast: new player |
| `room:player-left` | server → all | Broadcast: player disconnected (transient — grey out) |
| `room:player-removed` | server → all | Broadcast: player permanently gone (kicked or grace expired) |
| `room:player-reconnected` | server → all | Broadcast: player restored |
| `room:kicked` | server → controller | This controller was kicked by the host |
| `room:remote-host-changed` | server → all | Mobile-admin claim changed (or released) |

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
