import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  parseQuizImport,
  parseKoSamJaImport,
  parseTajniAgentiImport,
  parseTajniAgentiScenarioImport,
} from '@igra/shared';
import type { KoSamJaImportQuestion } from '@igra/shared';
import { setupSocket } from './socket/setup.js';
import { listGeoPacks } from './game/games/geo-pogodi/geo-pack-resolver.js';
import { getCustomPhoto } from './game/customPhotoStore.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST_ORIGIN = process.env.HOST_ORIGIN || 'http://localhost:5173';
const CONTROLLER_ORIGIN =
  process.env.CONTROLLER_ORIGIN || 'http://localhost:5174';
const SINGLE_ROOM_MODE = process.env.SINGLE_ROOM_MODE === 'true';

// Resolve the question-packs directory relative to this source file so it
// works regardless of where `npm run dev` is invoked from. Both `src/` and
// `dist/` sit at packages/server/<dir>/index.<ext>, so the repo root is three
// levels up. Override with QUESTION_PACKS_DIR if you keep packs elsewhere.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUESTION_PACKS_DIR = process.env.QUESTION_PACKS_DIR
  ? path.resolve(process.env.QUESTION_PACKS_DIR)
  : path.resolve(__dirname, '../../..', 'question-packs');
const GEO_PACKS_DIR = process.env.GEO_PACKS_DIR
  ? path.resolve(process.env.GEO_PACKS_DIR)
  : path.resolve(__dirname, '../../..', 'geo-packs');
const KO_SAM_JA_PACKS_DIR = process.env.KO_SAM_JA_PACKS_DIR
  ? path.resolve(process.env.KO_SAM_JA_PACKS_DIR)
  : path.resolve(__dirname, '../../..', 'ko-sam-ja-packs');
const TAJNI_AGENTI_PACKS_DIR = process.env.TAJNI_AGENTI_PACKS_DIR
  ? path.resolve(process.env.TAJNI_AGENTI_PACKS_DIR)
  : path.resolve(__dirname, '../../..', 'tajni-agenti-packs');
const TAJNI_AGENTI_SCENARIOS_DIR = process.env.TAJNI_AGENTI_SCENARIOS_DIR
  ? path.resolve(process.env.TAJNI_AGENTI_SCENARIOS_DIR)
  : path.resolve(__dirname, '../../..', 'tajni-agenti-scenarios');

// When deployed as a single container, host and controller live on the same
// origin — no CORS list needed. Fall back to the configured origins otherwise.
const SAME_ORIGIN_DEPLOY = process.env.SAME_ORIGIN_DEPLOY === 'true';
const corsOrigins = SAME_ORIGIN_DEPLOY
  ? true
  : [HOST_ORIGIN, CONTROLLER_ORIGIN];

const app = express();
// Strict routing: '/host' and '/host/' are distinct. Required so the
// bare-host → host/ redirect below doesn't also fire on /host/ (which
// would loop).
app.set('strict routing', true);
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/question-packs', async (_req, res) => {
  try {
    const entries = await readdir(QUESTION_PACKS_DIR, { withFileTypes: true });
    const jsonFiles = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.json')
    );

    const packs: Array<{
      id: string;
      fileName: string;
      count: number;
      questions: Array<{
        text: string;
        options: string[];
        correctIndex: number;
        timeLimit: number;
      }>;
    }> = [];

    for (const entry of jsonFiles) {
      try {
        const raw = await readFile(
          path.join(QUESTION_PACKS_DIR, entry.name),
          'utf-8'
        );
        const parsed = parseQuizImport(JSON.parse(raw));
        if (!parsed.ok) continue;
        packs.push({
          id: entry.name.replace(/\.json$/i, ''),
          fileName: entry.name,
          count: parsed.questions.length,
          questions: parsed.questions.map((q) => ({
            text: q.text,
            options: q.options.map((o) => o.text),
            correctIndex: q.correctIndex,
            timeLimit: q.timeLimit,
          })),
        });
      } catch {
        // Skip unreadable or malformed files; the rest of the list still loads.
      }
    }

    packs.sort((a, b) => a.id.localeCompare(b.id));
    res.json({ packs });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ packs: [] });
      return;
    }
    console.error('Failed to read question packs directory:', err);
    res.status(500).json({ error: 'Failed to read question packs' });
  }
});

app.get('/api/ko-sam-ja-packs', async (_req, res) => {
  try {
    const entries = await readdir(KO_SAM_JA_PACKS_DIR, { withFileTypes: true });
    const jsonFiles = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.json')
    );

    const packs: Array<{
      id: string;
      fileName: string;
      count: number;
      questions: KoSamJaImportQuestion[];
    }> = [];

    for (const entry of jsonFiles) {
      try {
        const raw = await readFile(
          path.join(KO_SAM_JA_PACKS_DIR, entry.name),
          'utf-8'
        );
        const parsed = parseKoSamJaImport(JSON.parse(raw));
        if (!parsed.ok) continue;
        packs.push({
          id: entry.name.replace(/\.json$/i, ''),
          fileName: entry.name,
          count: parsed.questions.length,
          questions: parsed.questions,
        });
      } catch {
        // Skip unreadable or malformed files; the rest of the list still loads.
      }
    }

    packs.sort((a, b) => a.id.localeCompare(b.id));
    res.json({ packs });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ packs: [] });
      return;
    }
    console.error('Failed to read ko-sam-ja packs directory:', err);
    res.status(500).json({ error: 'Failed to read ko-sam-ja packs' });
  }
});

app.get('/api/tajni-agenti-packs', async (_req, res) => {
  try {
    const entries = await readdir(TAJNI_AGENTI_PACKS_DIR, {
      withFileTypes: true,
    });
    const jsonFiles = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.json')
    );

    const packs: Array<{
      id: string;
      fileName: string;
      name: string | null;
      count: number;
      words: string[];
    }> = [];

    for (const entry of jsonFiles) {
      try {
        const raw = await readFile(
          path.join(TAJNI_AGENTI_PACKS_DIR, entry.name),
          'utf-8'
        );
        const parsed = parseTajniAgentiImport(JSON.parse(raw));
        if (!parsed.ok) continue;
        packs.push({
          id: entry.name.replace(/\.json$/i, ''),
          fileName: entry.name,
          name: parsed.pack.name ?? null,
          count: parsed.pack.words.length,
          words: parsed.pack.words,
        });
      } catch {
        // Skip unreadable or malformed files; the rest of the list still loads.
      }
    }

    packs.sort((a, b) => a.id.localeCompare(b.id));
    res.json({ packs });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ packs: [] });
      return;
    }
    console.error('Failed to read tajni-agenti packs directory:', err);
    res.status(500).json({ error: 'Failed to read tajni-agenti packs' });
  }
});

app.get('/api/tajni-agenti-scenarios', async (_req, res) => {
  try {
    const entries = await readdir(TAJNI_AGENTI_SCENARIOS_DIR, {
      withFileTypes: true,
    });
    const jsonFiles = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.json')
    );

    const scenarios: Array<{
      id: string;
      fileName: string;
      code: string;
      name: string;
      startingTeam: 'red' | 'blue';
      cardCount: number;
      // Full scenario shape, sent to the host so it can submit the
      // resolved object back to the server when starting a game.
      scenario: {
        code: string;
        name: string;
        cards: { word: string; type: 'red' | 'blue' | 'neutral' | 'assassin' }[];
      };
    }> = [];

    for (const entry of jsonFiles) {
      try {
        const raw = await readFile(
          path.join(TAJNI_AGENTI_SCENARIOS_DIR, entry.name),
          'utf-8'
        );
        const parsed = parseTajniAgentiScenarioImport(JSON.parse(raw));
        if (!parsed.ok) continue;
        scenarios.push({
          id: entry.name.replace(/\.json$/i, ''),
          fileName: entry.name,
          code: parsed.scenario.code,
          name: parsed.scenario.name,
          startingTeam: parsed.scenario.startingTeam,
          cardCount: parsed.scenario.cards.length,
          scenario: {
            code: parsed.scenario.code,
            name: parsed.scenario.name,
            cards: parsed.scenario.cards,
          },
        });
      } catch {
        // Skip unreadable or malformed files.
      }
    }

    scenarios.sort((a, b) => a.id.localeCompare(b.id));
    res.json({ scenarios });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ scenarios: [] });
      return;
    }
    console.error('Failed to read tajni-agenti scenarios directory:', err);
    res.status(500).json({ error: 'Failed to read tajni-agenti scenarios' });
  }
});

app.get('/api/geo-packs', async (_req, res) => {
  try {
    const packs = await listGeoPacks(GEO_PACKS_DIR);
    res.json({ packs });
  } catch (err) {
    console.error('Failed to read geo packs directory:', err);
    res.status(500).json({ error: 'Failed to read geo packs' });
  }
});

// Player-uploaded photos (geo/foto custom modes) live in memory for the
// duration of a game; the game state carries only these short URLs instead
// of inline base64. Ids are immutable UUIDs, so clients may cache hard.
app.get('/api/custom-photos/:roomCode/:photoId', (req, res) => {
  const photo = getCustomPhoto(req.params.roomCode, req.params.photoId);
  if (!photo) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  res.type(photo.mime).send(photo.data);
});

// Serve pack image folders so the host (and any browser) can render them.
// We mount the entire packs dir under /geo-images; manifests are public anyway.
if (existsSync(GEO_PACKS_DIR)) {
  app.use(
    '/geo-images',
    cors({ origin: corsOrigins }),
    express.static(GEO_PACKS_DIR, { maxAge: '7d', etag: true })
  );
}

const httpServer = createServer(app);
const socketOrigins = SAME_ORIGIN_DEPLOY ? '*' : [HOST_ORIGIN, CONTROLLER_ORIGIN];
const { roomManager } = setupSocket(httpServer, socketOrigins, {
  geoPacksDir: GEO_PACKS_DIR,
});

if (SINGLE_ROOM_MODE) {
  app.get('/room-code', (_req, res) => {
    res.json({ roomCode: roomManager.getActiveRoomCode() });
  });
}

// Public rooms list for the landing page: safe summaries only (code,
// connected-player count, capacity, status) — no player names or tokens.
app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.listRoomSummaries() });
});

// Static serving for single-container deployments: host at /, controller at /play.
// Skipped automatically if the dist directories aren't present (e.g. `npm run dev`).
const HOST_DIST_DIR = process.env.HOST_DIST_DIR
  ? path.resolve(process.env.HOST_DIST_DIR)
  : path.resolve(__dirname, '../../host/dist');
const CONTROLLER_DIST_DIR = process.env.CONTROLLER_DIST_DIR
  ? path.resolve(process.env.CONTROLLER_DIST_DIR)
  : path.resolve(__dirname, '../../controller/dist');

// Normalize bare /host and /play to their slashed forms so external
// links and typed URLs land on the right place (Vite's base requires
// trailing slash; express.static auto-redirects in prod but the dev
// proxy doesn't).
app.get('/host', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/host/' + qs);
});
app.get('/play', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/play/' + qs);
});

// Prod check: dist must exist AND have an index.html. Vite sometimes
// leaves an empty dist folder behind, and a bare existsSync(dir) would
// then route us into prod-static mode that serves nothing but 404s.
const hasControllerBuild = existsSync(path.join(CONTROLLER_DIST_DIR, 'index.html'));
const hasHostBuild = existsSync(path.join(HOST_DIST_DIR, 'index.html'));

if (hasControllerBuild) {
  app.use('/play', express.static(CONTROLLER_DIST_DIR));
  app.get('/play/*', (_req, res) => {
    res.sendFile(path.join(CONTROLLER_DIST_DIR, 'index.html'));
  });
  console.log(`Serving controller from ${CONTROLLER_DIST_DIR} at /play`);
} else {
  // Dev fallback: proxy /play to the controller's Vite dev server. Vite
  // is configured with base: '/play/' so asset URLs already carry the
  // prefix — no pathRewrite needed. WS proxy is required for Vite HMR.
  // Use pathFilter (not app.use('/play', ...)) so the /play prefix is
  // preserved when forwarding — otherwise Express strips it and Vite
  // 302-redirects '/' back to '/play/' causing an infinite loop.
  app.use(
    createProxyMiddleware({
      pathFilter: (pathname) =>
        pathname === '/play' || pathname.startsWith('/play/'),
      target: 'http://localhost:5174',
      changeOrigin: true,
      ws: true,
    })
  );
  console.log('Dev: proxying /play -> http://localhost:5174');
}

if (hasHostBuild) {
  app.use('/host', express.static(HOST_DIST_DIR));
  app.get('/host/*', (_req, res) => {
    res.sendFile(path.join(HOST_DIST_DIR, 'index.html'));
  });
  console.log(`Serving host from ${HOST_DIST_DIR} at /host`);
} else {
  app.use(
    createProxyMiddleware({
      pathFilter: (pathname) =>
        pathname === '/host' || pathname.startsWith('/host/'),
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
    })
  );
  console.log('Dev: proxying /host -> http://localhost:5173');
}

// Root landing: prominent "join" CTA → /play, subtle "new room" link → /host.
// The host used to live at /, which spawned an orphan room on every random
// visit (link previews, bots, mistyped URLs). A static landing page costs
// nothing on the server (no socket, no room) and still gives the TV
// operator a discoverable path to /host without a hidden URL.
const LANDING_HTML = `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Igra Na Klik</title>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#0f0f23;color:#e0e0e0;-webkit-text-size-adjust:100%}
body{display:flex;align-items:center;justify-content:center;padding:1.5rem}
.wrap{text-align:center;max-width:22rem;width:100%;display:flex;flex-direction:column;gap:1.5rem}
h1{font-size:2rem;font-weight:800;letter-spacing:0.02em}
.cta{display:inline-block;padding:1rem 2rem;font-size:1.25rem;font-weight:700;background:#6c63ff;color:#fff;border-radius:0.85rem;text-decoration:none;transition:background 0.15s;min-height:48px}
.cta:hover{background:#5a52d5}
.host-link{font-size:0.85rem;color:#a0a0b0;text-decoration:none;margin-top:0.5rem;opacity:0.7}
.host-link:hover{opacity:1;color:#e0e0e0}
.lang{position:fixed;top:1rem;right:1rem;display:inline-flex;gap:0.2rem;padding:0.2rem;background:#1a1a2e;border-radius:0.6rem}
.lang-btn{padding:0.3rem 0.65rem;font:inherit;font-size:0.8rem;font-weight:700;border:none;border-radius:0.45rem;cursor:pointer;background:transparent;color:#a0a0b0}
.rooms{text-align:left;display:none;flex-direction:column;gap:0.5rem}
.rooms.visible{display:flex}
.rooms-title{font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#a0a0b0}
.room-row{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.7rem 1rem;background:#1a1a2e;border-radius:0.7rem;text-decoration:none;color:#e0e0e0;transition:background 0.15s}
a.room-row:hover{background:#24244a}
.room-row.busy{opacity:0.55}
.room-code{font-weight:800;font-size:1.1rem;letter-spacing:0.15em;color:#6c63ff}
.room-row.busy .room-code{color:#a0a0b0}
.room-meta{font-size:0.8rem;color:#a0a0b0}
.room-badge{font-size:0.7rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:0.4rem;background:#2d2d52;color:#c9c9e0;white-space:nowrap}
</style>
</head>
<body>
<div class="lang" role="group" aria-label="Language">
<button class="lang-btn" type="button" data-lang="sr">SR</button>
<button class="lang-btn" type="button" data-lang="en">EN</button>
</div>
<div class="wrap">
<h1>Igra Na Klik</h1>
<a class="cta" id="cta" href="/play/">🎮 Pridruži se igri</a>
<div class="rooms" id="rooms">
<div class="rooms-title" id="rooms-title">Aktivne sobe</div>
<div id="rooms-list"></div>
</div>
<a class="host-link" id="host-link" href="/host/">Kreiraj novu sobu →</a>
</div>
<script>
(function(){
  var KEY='igra-language';
  var T={
    sr:{cta:'🎮 Pridruži se igri',host:'Kreiraj novu sobu →',roomsTitle:'Aktivne sobe',roomsEmpty:'Nema aktivnih soba',inGame:'Igra u toku',players:'igrača'},
    en:{cta:'🎮 Join a game',host:'Create a new room →',roomsTitle:'Active rooms',roomsEmpty:'No active rooms',inGame:'Game in progress',players:'players'}
  };
  var currentLang='sr';
  var lastRooms=null;
  // The apps persist language via Zustand: localStorage holds
  // {"state":{"language":"en"},"version":0}. Read/write that exact shape so
  // the landing toggle stays in sync with the host/controller apps.
  function readLang(){
    try{
      var raw=localStorage.getItem(KEY);
      if(!raw) return 'sr';
      if(raw==='sr'||raw==='en') return raw;
      var v=JSON.parse(raw);
      var l=(v&&v.state)?v.state.language:(v&&v.language);
      return (l==='sr'||l==='en')?l:'sr';
    }catch(e){ return 'sr'; }
  }
  function writeLang(l){
    try{ localStorage.setItem(KEY, JSON.stringify({state:{language:l},version:0})); }catch(e){}
  }
  function renderRooms(){
    var rooms=lastRooms;
    var box=document.getElementById('rooms');
    var list=document.getElementById('rooms-list');
    if(!rooms){ box.className='rooms'; return; }
    box.className='rooms visible';
    document.getElementById('rooms-title').textContent=T[currentLang].roomsTitle;
    list.textContent='';
    if(rooms.length===0){
      var empty=document.createElement('div');
      empty.className='room-meta';
      empty.textContent=T[currentLang].roomsEmpty;
      list.appendChild(empty);
      return;
    }
    for(var i=0;i<rooms.length;i++){
      var r=rooms[i];
      var open=r.status==='lobby';
      var row=document.createElement(open?'a':'div');
      row.className=open?'room-row':'room-row busy';
      if(open) row.href='/play/?code='+encodeURIComponent(r.code);
      var code=document.createElement('span');
      code.className='room-code';
      code.textContent=r.code;
      row.appendChild(code);
      var meta=document.createElement('span');
      meta.className='room-meta';
      meta.textContent=r.playerCount+'/'+r.maxPlayers+' '+T[currentLang].players;
      row.appendChild(meta);
      if(!open){
        var badge=document.createElement('span');
        badge.className='room-badge';
        badge.textContent=T[currentLang].inGame;
        row.appendChild(badge);
      }
      list.appendChild(row);
    }
  }
  function fetchRooms(){
    fetch('/api/rooms').then(function(res){
      if(!res.ok) throw new Error('bad status');
      return res.json();
    }).then(function(data){
      lastRooms=(data&&data.rooms)||[];
      renderRooms();
    }).catch(function(){ /* keep the last rendered list */ });
  }
  function render(l){
    currentLang=l;
    document.documentElement.lang=l;
    document.getElementById('cta').textContent=T[l].cta;
    document.getElementById('host-link').textContent=T[l].host;
    renderRooms();
    var btns=document.querySelectorAll('.lang-btn');
    for(var i=0;i<btns.length;i++){
      var on=btns[i].getAttribute('data-lang')===l;
      btns[i].setAttribute('aria-pressed',on?'true':'false');
      btns[i].style.background=on?'#6c63ff':'transparent';
      btns[i].style.color=on?'#fff':'#a0a0b0';
    }
  }
  var btns=document.querySelectorAll('.lang-btn');
  for(var i=0;i<btns.length;i++){
    btns[i].addEventListener('click',function(){
      var l=this.getAttribute('data-lang');
      writeLang(l);
      render(l);
    });
  }
  render(readLang());
  fetchRooms();
  setInterval(fetchRooms,5000);
})();
</script>
</body>
</html>`;

app.get('/', (_req, res) => {
  res.type('html').send(LANDING_HTML);
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Question packs dir: ${QUESTION_PACKS_DIR}`);
  console.log(`Geo packs dir: ${GEO_PACKS_DIR}`);
  console.log(`Ko sam ja packs dir: ${KO_SAM_JA_PACKS_DIR}`);
  console.log(`Tajni agenti packs dir: ${TAJNI_AGENTI_PACKS_DIR}`);
  console.log(`Tajni agenti scenarios dir: ${TAJNI_AGENTI_SCENARIOS_DIR}`);
  if (SINGLE_ROOM_MODE) {
    console.log('Single-room mode enabled: room code auto-fill active');
  }
});
