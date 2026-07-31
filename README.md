# Igra Na Klik

A self-hosted party game platform: one device is the **host** display (TV, laptop, projector), everyone else plays from their **phone**. Like AirConsole, but you run it yourself — no app installs, no accounts, no per-seat licence.

15 mini-games ship in the box: quizzes, drawing games, bluffing games, social deduction, a card game. All in-game content is in Serbian (Latin); the platform chrome has an EN/SR switch.

## How it works

1. The TV opens `/host/` — a room is created automatically with a 3-letter code and a QR code.
2. Players open `/play/` on their phones (or scan the QR), enter the code and a name.
3. The lobby fills up on the TV in real time.
4. Someone picks a game and starts it. The TV shows the shared view; each phone shows that player's private controls.
5. Stop the game any time to return to game selection. Players can leave, rejoin, or be kicked mid-game.

Two things that make it work in a real living room:

- **No TV required.** A player can create a room straight from their phone ("Napravi sobu"), or claim the host's controls remotely from within a normal room. Every game is playable this way — the phone renders what the TV would have shown.
- **Phones fall asleep.** A disconnected player keeps their seat, score and game state for 5 minutes, and rejoins straight into the current round.

The root `/` is a plain landing page (join CTA plus a subtle "create room" link) so bots and link previews don't spawn orphan rooms.

## Games

| Game | Players | ≈ min | What it is |
|---|---|---|---|
| Kviz | 2–8 | 10 | Timed quiz — classic, image, audio, YouTube, map-pin, number-slider and emoji-riddle questions |
| Crtaj i pogodi | 2–8 | 10 | Draw & guess |
| Lažni umetnik | 3–8 | 8 | Everyone draws the same word one stroke at a time — except the impostor who doesn't know it |
| Lažov | 2–8 | 10 | Fibbage-style: write a fake answer, spot the real one |
| Ko bi pre? | 3–8 | 8 | Vote who'd be first to do something |
| Dve istine i laž | 3–8 | 8 | Two truths and a lie |
| Slepi telefoni | 3–8 | 12 | Telestrations / Gartic Phone drawing chain |
| Ko sam ja? | 3–8 | 10 | Guess how well you know each other |
| Pronađi par | 2–12 | 5 | Spot It — find the one shared symbol, fastest wins |
| Tajni agenti | 2–8 | 15 | Codenames, in three modes: classic, Duet, and co-op |
| Gluvo doba | 6–15 | 20 | Mafia/Werewolf with Slavic-mythology roles |
| Zavet | 2–6 | 15 | Cabo-style memory card game — **fewest points wins** |
| Špijun | 3–8 | 12 | Everyone knows the secret location except the spy |
| Asocijacije | 2–8 | 12 | TV "Slagalica" board: 4 columns × 4 fields + final solution |
| Vruć krompir | 2–12 | 6 | Hidden-timer bomb passes around; say a word from the category |

Public rules for every game: `/uputstva`. Gluvo doba has a dedicated rules page at `/gluvo-doba`.

## Tech stack

| Package | Stack | Role |
|---|---|---|
| `@igra/shared` | TypeScript | Types, socket contracts, constants, game registry, content validators |
| `@igra/server` | Node, Express, Socket.io | WebSocket server, rooms, game modules, landing/admin pages |
| `@igra/host` | React, Vite, Zustand, Framer Motion, Howler | TV display |
| `@igra/controller` | React, Vite, Zustand | Phone controller (installable PWA) |

npm workspaces monorepo; the server is the single public entry point in production and serves all three surfaces from one origin.

## Getting started

Requires Node 18+ and npm 9+.

```bash
npm install
npm run build:shared     # required — the other packages import shared's compiled dist/
npm run dev              # server + host + controller
```

That starts:

- **`http://localhost:3001`** — server, landing page, API, and a dev proxy to both Vite servers
- **`http://localhost:5173/host/`** — host (Vite direct)
- **`http://localhost:5174/play/`** — controller (Vite direct)

Open `http://localhost:3001/host/` in one tab and `http://localhost:3001/play/` in another, enter the code shown on the host, and start a game. Both ports work — going through `:3001` matches the production URL layout.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Builds shared, then runs all three services |
| `npm run dev:server` / `dev:host` / `dev:controller` | One service at a time |
| `npm run build:shared` | Rebuild `@igra/shared` — **needed after every change there** |
| `npm run build` | Production build of all four packages |
| `npm run clean` | Remove `dist/` and `node_modules/` |

There is no test suite and no linter — verification is running the dev servers and playing through the flow.

## Playing on your LAN (real phones)

1. Find your machine's local IP (`ipconfig` on Windows, `ip addr` elsewhere), e.g. `192.168.1.42`.

2. Create a `.env` in the repo root so Socket.io accepts LAN origins:

   ```env
   PORT=3001
   HOST_ORIGIN=http://192.168.1.42:5173
   CONTROLLER_ORIGIN=http://192.168.1.42:5174
   ```

3. `npm run dev`, then open `http://192.168.1.42:3001/host/` on the TV.

4. Phones scan the lobby QR code (it points at the controller automatically) or type the URL.

The Vite servers already bind `0.0.0.0`. Make sure your firewall allows ports 3001, 5173 and 5174 on the private network.

### Single-room mode

If you only ever run one room at a time, players can skip typing the code entirely. Add `SINGLE_ROOM_MODE=true` to the root `.env` and `VITE_SINGLE_ROOM=true` to `packages/controller/.env` — the controller then fetches the active room code from the server and only asks for a name.

## Deployment

The [Dockerfile](Dockerfile) builds everything into one container serving the landing page, host, controller, API and WebSocket from a single origin (`SAME_ORIGIN_DEPLOY=true`, no cross-origin CORS to configure).

```bash
docker build -t igra-na-klik .
docker run --rm -p 3001:3001 igra-na-klik
```

For game nights at home, [docker-compose.yml](docker-compose.yml) wraps that with a persistent volume, single-room mode and a restart policy:

```bash
docker compose up -d --build    # first run, or after pulling changes
docker compose up -d            # every night after that
docker compose logs -f
docker compose down
```

Then open `http://<your-lan-ip>:3001/host/` on the TV — everything stays on your LAN, no round trip to a server.

### Coolify / VPS

Deploy as a **Docker Compose** application pointed at this repo, expose port 3001, and set your domain in the UI (Traefik terminates TLS). Compose rather than plain Dockerfile because the log directory needs a host-path bind, which Coolify only allows for compose apps.

Two things to set up:

- A **persistent volume at `/data`** — all editable content lives there. `DATA_DIR=/data` and `SEED_DIR=/app/seed` are already baked into the image; on first boot the server copies bundled default content into any pack directory that's missing or empty, so redeploys never overwrite content you edited through the admin.
- **`ADMIN_TOKEN`** in the environment UI (not committed) to enable the content editors.

A `/health` endpoint backs the container healthcheck. Daily-rolling JSON logs go to `LOG_DIR` (`/storage/logs` in the image), kept for `LOG_RETENTION_DAYS`.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP + Socket.io port |
| `HOST_ORIGIN` / `CONTROLLER_ORIGIN` | localhost dev ports | CORS origins for split-origin dev/LAN play |
| `SAME_ORIGIN_DEPLOY` | `true` in Docker | One origin for everything; relaxes CORS |
| `SINGLE_ROOM_MODE` | `false` | Exposes `/room-code` so controllers auto-fill the code |
| `ADMIN_TOKEN` | unset (admin disabled) | Enables `/admin` and its `/api/admin/*` routes |
| `DATA_DIR` | unset (repo root) | Persistent volume for all editable content |
| `SEED_DIR` | `/app/seed` in Docker | Bundled default content; seeds `DATA_DIR`, powers factory reset |
| `QUESTION_PACKS_DIR` | `./question-packs` | Kviz manifests + per-pack asset folders |
| `KO_SAM_JA_PACKS_DIR` | `./ko-sam-ja-packs` | Ko sam ja packs |
| `TAJNI_AGENTI_PACKS_DIR` | `./tajni-agenti-packs` | Tajni agenti word packs |
| `GLUVO_DOBA_PACKS_DIR` | `./gluvo-doba-packs` | Gluvo doba role packs |
| `SPIJUN_PACKS_DIR` | `./spijun-packs` | Špijun location packs |
| `ASOCIJACIJE_PACKS_DIR` | `./asocijacije-packs` | Asocijacije puzzle packs |
| `TIMING_CONFIG_FILE` | `./timing-config.json` | Admin-tuned wait-phase durations |
| `QUIZ_FEEDBACK_FILE` | `./quiz-feedback.json` | In-game question feedback log |
| `LOG_DIR` / `LOG_RETENTION_DAYS` | `./storage/logs`, 7 | Rolling JSON logs |
| `HOST_DIST_DIR` / `CONTROLLER_DIST_DIR` | baked into image | Override static bundle locations |

## Content: packs & the admin editor

Most games read their content from JSON packs on disk, so you can add your own questions, words, locations and puzzles without touching code. Set `ADMIN_TOKEN` and open **`/admin`** — a single page with a sidebar per game, a searchable table and a slide-in editor. Enter the token once (it's stored in the browser). Edits write the same files the games read, so they're live immediately.

The editor covers Kviz (all question types, with image/audio upload, YouTube preview and a click-to-place map picker), Ko sam ja, Tajni agenti, Gluvo doba, Špijun, Asocijacije, plus two utility views: **Timinzi** (tune the pause/results durations per game — active answering timers stay fixed as gameplay balance) and **Podaci** (download a zip backup of all content; factory-reset back to the bundled defaults).

Drafts always save: a pack that doesn't pass the in-game validation stays editable and is simply marked "nevidljiv u igri" until it does.

There's also **`/kviz-generator`** — a public, no-login page where anyone can build a kviz pack (questions plus bundled images and audio) entirely in the browser and export it as a zip. Hand that zip back to whoever runs the server and they import it from the admin's "Podaci" view. Geo questions are the exception: they need the server-side map projection, so they're authored in the admin editor.

### Pack formats

Hand-writing packs works too. Validation for each lives in `packages/shared/src/games/*-import.ts` and reports Serbian error messages.

**Kviz** — `question-packs/<id>.json` plus an optional sibling `<id>/` folder for images, audio and custom map images (served at `/kviz-files/<id>/<file>`):

```json
{
  "name": "Mešoviti pack",
  "maps": { "main": { "imageFile": "map.png", "bbox": { "minLat": 44.25, "maxLat": 44.52, "minLng": 21.11, "maxLng": 21.32 } } },
  "questions": [
    { "text": "Koji je glavni grad Srbije?", "options": ["Niš", "Beograd"], "correctIndex": 1 },
    { "type": "geo", "imageFile": "trg.jpg", "caption": "Centar", "lat": 44.43, "lng": 21.22, "mapId": "main" },
    { "type": "broj", "text": "Koliko km ima Dunav?", "answer": 2850, "min": 1000, "max": 4000, "unit": "km" },
    { "type": "audio", "text": "Koja je ovo pesma?", "audioFile": "pesma.mp3", "options": ["A", "B"], "correctIndex": 0 },
    { "type": "video", "text": "Koje boje je auto?", "videoId": "dQw4w9WgXcQ", "startSeconds": 10, "endSeconds": 25, "options": ["crven", "plav"], "correctIndex": 0 },
    { "type": "emoji", "emojis": "🦁👑", "answer": "Kralj lavova", "accept": ["The Lion King"] }
  ]
}
```

A bare array of classic questions also parses. Custom maps must be north-up Web Mercator exports whose bbox matches the image edges exactly (don't crop after exporting); a geo question's coordinates must fall inside the map it references, or inside Serbia if it references none.

**Ko sam ja** — an array of questions, each tagged `family` or `nsfw` and one of four shapes. `text` must contain `{subject}`:

```json
[
  { "shape": "fixed",  "category": "family", "text": "Omiljena boja igrača {subject}?", "options": ["crvena", "plava", "zelena"] },
  { "shape": "peer",   "category": "family", "text": "S kim bi {subject} radije na put, sa {peer1} ili {peer2}?" },
  { "shape": "free",   "category": "family", "text": "Posao iz snova igrača {subject}?", "maxLength": 50 },
  { "shape": "pickN",  "category": "family", "text": "S kim bi {subject} otvorio kafić?", "optionTemplate": "sa {peer}", "extraOptions": ["radije bi sam"], "maxPeers": 4 }
]
```

`fixed` questions are answered privately before the game; `peer` and `pickN` bind real co-players at round time; `free` lets the subject type an answer and the server builds distractors from the other players' answers.

**Tajni agenti** — 25–500 unique words, either a flat array or `{ "name": "...", "words": [...] }`. The board samples 25 per game.

**Gluvo doba** — a curated role set that replaces the built-in composition bands:

```json
{ "name": "4 - 1 - 1", "wolves": 1, "roles": ["vampir", "todorac", "drekavac", "bauk", "vidovnjak", "zmaj"] }
```

The deal stays balanced by player count — enabling everything can't hand the dark side a majority.

**Špijun** — locations with at least two roles each:

```json
{ "name": "Osnovni", "locations": [ { "location": "Aerodrom", "roles": ["Pilot", "Čistačica", "Putnik"] } ] }
```

**Asocijacije** — puzzles of 4 columns × 4 fields plus a final solution. Adding `question` + `wrongOptions` to every field makes the puzzle usable in the multiple-choice "kviz" mode as well as classic:

```json
{
  "name": "Primer paketa",
  "puzzles": [{
    "finalSolution": "FUDBAL",
    "columns": [{
      "solution": "LOPTA",
      "fields": [{ "word": "OKRUGLA", "question": "Kog je oblika lopta?", "wrongOptions": ["KOCKASTA", "TROUGLASTA", "RAVNA"] }]
    }]
  }]
}
```

Pack manifests contain the answers, so the public listing endpoints return summaries only — never the content itself.

## Project structure

```
packages/
  shared/       # types, socket contracts, constants, game registry, validators, content banks
  server/       # Socket.io server, rooms, game modules, landing + admin + rules pages, dev proxy
  host/         # TV display (Vite, port 5173, base /host/)
  controller/   # phone controller PWA (Vite, port 5174, base /play/)
question-packs/ ko-sam-ja-packs/ tajni-agenti-packs/
gluvo-doba-packs/ spijun-packs/ asocijacije-packs/    # editable content
docs/           # design references and planning notes
CLAUDE.md       # architecture guide (also useful for humans)
PLAN.md         # original implementation plan
brand.md        # visual identity
```

Adding a game means touching the shared registry, a server module, both client registries, and the rules page — see [CLAUDE.md](CLAUDE.md) for the wiring steps and the conventions that keep secret state off the broadcast channel.

## URLs

| Path | What |
|---|---|
| `/` | Landing page (join CTA, create-room link, SR/EN toggle) |
| `/play/` | Controller (phones) |
| `/host/` | Host display (TV) |
| `/uputstva` | Rules for every game |
| `/gluvo-doba` | Gluvo doba rules and role reference |
| `/admin` | Content editors (requires `ADMIN_TOKEN`) |
| `/kviz-generator` | Public, no-login kviz pack builder (exports a zip) |
| `/health` | Healthcheck |

## Troubleshooting

- **"Port 5173 is already in use"** — a previous dev server is still running. Kill it; the ports are fixed on purpose (the dev proxy targets them), so Vite won't silently move to another one.
- **`/host/` or `/play/` returns 404 in dev** — a stale `packages/host/dist` or `packages/controller/dist` is making the server serve static files instead of proxying to Vite. Delete those folders and restart.
- **Changes to `@igra/shared` don't show up** — run `npm run build:shared` (or restart `npm run dev`); the other packages import the compiled output.
- **Phones can't connect on LAN** — check `HOST_ORIGIN`/`CONTROLLER_ORIGIN` in `.env` match the IP you're actually browsing to, and that the firewall allows the ports on the private network.
