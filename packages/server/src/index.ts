import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Load the repo-root .env explicitly. `npm run dev -w @igra/server` sets
// cwd to packages/server, so the bare `import 'dotenv/config'` (which reads
// .env from cwd) silently missed the documented root .env file. cwd is
// still consulted first so a package-local .env can override in odd setups
// (dotenv never overwrites variables that are already set).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  parseKoSamJaImport,
  parseTajniAgentiImport,
  KVIZ_BANK_PACK_ID,
  QUIZ_QUESTION_BANK,
} from '@igra/shared';
import type { KoSamJaImportQuestion, KvizQuestionType } from '@igra/shared';
import { setupSocket } from './socket/setup.js';
import { GLUVO_DOBA_PAGE_HTML } from './gluvo-doba-page.js';
import { UPUTSTVA_PAGE_HTML } from './uputstva-page.js';
import { listQuizPackSummaries } from './game/games/quiz/quiz-pack-resolver.js';
import { createContentAdminRouter } from './admin/content-admin.js';
import { createTimingAdminRouter } from './admin/timing-admin.js';
import { initTimingConfig } from './game/timing-config.js';
import { renderAdminApp } from './admin/admin-app.js';
import { createDataAdminRouter } from './admin/data-admin.js';
import {
  resolveContentDir,
  resolveTimingFile,
  seedDataDirs,
} from './data-paths.js';
import { parseGluvoDobaPack, parseSpijunPack } from '@igra/shared';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST_ORIGIN = process.env.HOST_ORIGIN || 'http://localhost:5173';
const CONTROLLER_ORIGIN =
  process.env.CONTROLLER_ORIGIN || 'http://localhost:5174';
const SINGLE_ROOM_MODE = process.env.SINGLE_ROOM_MODE === 'true';

// Seed a fresh persistent volume from the baked-in defaults before resolving
// any paths (deploy mode only; a no-op in dev). See data-paths.ts.
seedDataDirs();

// Content directories. In dev these resolve to the repo-root folders; in
// deploy mode (DATA_DIR set) they live on the persistent volume. A per-dir env
// override still wins. See data-paths.ts for the full precedence.
const QUESTION_PACKS_DIR = resolveContentDir(
  'question-packs',
  process.env.QUESTION_PACKS_DIR
);
// Quiz question images (uploaded via the admin editor) live in a flat folder
// inside the packs dir, served at /quiz-images/<file>. Packs reference them by
// that short path so the socket payload stays tiny.
const QUIZ_IMAGES_DIR = path.join(QUESTION_PACKS_DIR, '_images');
const KO_SAM_JA_PACKS_DIR = resolveContentDir(
  'ko-sam-ja-packs',
  process.env.KO_SAM_JA_PACKS_DIR
);
const TAJNI_AGENTI_PACKS_DIR = resolveContentDir(
  'tajni-agenti-packs',
  process.env.TAJNI_AGENTI_PACKS_DIR
);
const GLUVO_DOBA_PACKS_DIR = resolveContentDir(
  'gluvo-doba-packs',
  process.env.GLUVO_DOBA_PACKS_DIR
);
const SPIJUN_PACKS_DIR = resolveContentDir(
  'spijun-packs',
  process.env.SPIJUN_PACKS_DIR
);
// Admin-configurable "wait" timings live in a single JSON file (overrides only).
const TIMING_CONFIG_FILE = resolveTimingFile(process.env.TIMING_CONFIG_FILE);
initTimingConfig(TIMING_CONFIG_FILE);

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
// Admin routers parse their own bodies with a much larger limit (images ride
// inside JSON as base64). The app-wide parser must SKIP those paths — being
// registered first, it would otherwise reject any upload over its default
// 100 kb with a 413 before the admin router's parser ever runs.
const defaultJsonParser = express.json();
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin')) {
    next();
    return;
  }
  defaultJsonParser(req, res, next);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Summaries only — kviz manifests now carry answers (correctIndex, lat/lng,
// broj answer), so full questions must never leave the server. The chosen
// packs ride host:start-game as quizPackIds and resolve server-side. The
// built-in bank is prepended as a pseudo-pack so the multi-select can treat
// it like any other list item.
const BANK_TYPE_COUNTS: Partial<Record<KvizQuestionType, number>> = {};
for (const q of QUIZ_QUESTION_BANK) {
  BANK_TYPE_COUNTS[q.type] = (BANK_TYPE_COUNTS[q.type] ?? 0) + 1;
}
app.get('/api/question-packs', async (_req, res) => {
  try {
    const packs = await listQuizPackSummaries(QUESTION_PACKS_DIR);
    res.json({
      packs: [
        {
          id: KVIZ_BANK_PACK_ID,
          fileName: '',
          name: 'Ugrađena pitanja',
          category: 'opste',
          count: QUIZ_QUESTION_BANK.length,
          types: BANK_TYPE_COUNTS,
        },
        ...packs,
      ],
    });
  } catch (err) {
    console.error('Failed to read question packs directory:', err);
    res.status(500).json({ error: 'Failed to read question packs' });
  }
});

app.get('/api/gluvo-doba-packs', async (_req, res) => {
  try {
    const entries = await readdir(GLUVO_DOBA_PACKS_DIR, { withFileTypes: true });
    const jsonFiles = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.json')
    );
    const packs: Array<{
      id: string;
      name?: string;
      wolves: number;
      roles: string[];
    }> = [];
    for (const entry of jsonFiles) {
      try {
        const raw = await readFile(
          path.join(GLUVO_DOBA_PACKS_DIR, entry.name),
          'utf-8'
        );
        const parsed = parseGluvoDobaPack(JSON.parse(raw));
        if (!parsed.ok) continue;
        packs.push({
          id: entry.name.replace(/\.json$/i, ''),
          name: parsed.pack.name,
          wolves: parsed.pack.wolves,
          roles: parsed.pack.roles,
        });
      } catch {
        // Skip unreadable / malformed files; the rest still loads.
      }
    }
    packs.sort((a, b) => a.id.localeCompare(b.id));
    res.json({ packs });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ packs: [] });
      return;
    }
    console.error('Failed to read gluvo-doba packs directory:', err);
    res.status(500).json({ error: 'Failed to read gluvo-doba packs' });
  }
});

// Špijun location packs — valid packs with full content (the game-select
// sends the chosen pack inline in host:start-game; server re-validates).
app.get('/api/spijun-packs', async (_req, res) => {
  try {
    const entries = await readdir(SPIJUN_PACKS_DIR, { withFileTypes: true });
    const jsonFiles = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.json')
    );
    const packs: Array<{
      id: string;
      name?: string;
      locations: Array<{ location: string; roles: string[] }>;
    }> = [];
    for (const entry of jsonFiles) {
      try {
        const raw = await readFile(
          path.join(SPIJUN_PACKS_DIR, entry.name),
          'utf-8'
        );
        const parsed = parseSpijunPack(JSON.parse(raw));
        if (!parsed.ok) continue; // strict — drafts stay out of the game
        packs.push({
          id: entry.name.replace(/\.json$/i, ''),
          name: parsed.pack.name,
          locations: parsed.pack.locations,
        });
      } catch {
        // Skip unreadable / malformed files; the rest still loads.
      }
    }
    packs.sort((a, b) => a.id.localeCompare(b.id));
    res.json({ packs });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.json({ packs: [] });
      return;
    }
    console.error('Failed to read spijun packs directory:', err);
    res.status(500).json({ error: 'Failed to read spijun packs' });
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

// Quiz question images uploaded through the admin editor. Mounted
// unconditionally: express.static tolerates a missing root, and the folder
// is created lazily on the first upload.
app.use(
  '/quiz-images',
  cors({ origin: corsOrigins }),
  express.static(QUIZ_IMAGES_DIR, { maxAge: '7d', etag: true })
);

// Kviz pack assets (images/audio/custom maps) in per-pack subfolders:
// /kviz-files/<packId>/<file>. The manifests at the dir root carry answers
// (correctIndex, lat/lng, broj answers) — only files one level inside a
// pack folder are ever served, and never *.json.
app.use(
  '/kviz-files',
  cors({ origin: corsOrigins }),
  (req, res, next) => {
    if (
      !/^\/[a-zA-Z0-9_-]+\/[^/]+$/.test(req.path) ||
      req.path.toLowerCase().endsWith('.json')
    ) {
      res.status(404).end();
      return;
    }
    next();
  },
  express.static(QUESTION_PACKS_DIR, { maxAge: '7d', etag: true })
);

// ---- Admin editors ----------------------------------------------------------
// Token-protected CRUD APIs + standalone editor pages for every content type
// (kviz, ko-sam-ja, tajni-agenti… packs). See ADMIN_TOKEN in
// the environment; without it the APIs answer 403 and the pages can't login.
app.use(
  '/api/admin',
  createContentAdminRouter({
    questionPacksDir: QUESTION_PACKS_DIR,
    quizImagesDir: QUIZ_IMAGES_DIR,
    koSamJaPacksDir: KO_SAM_JA_PACKS_DIR,
    tajniAgentiPacksDir: TAJNI_AGENTI_PACKS_DIR,
    gluvoDobaPacksDir: GLUVO_DOBA_PACKS_DIR,
    spijunPacksDir: SPIJUN_PACKS_DIR,
  })
);
app.use('/api/admin', createTimingAdminRouter());
// Backup (.zip) + factory reset for all editable content.
app.use(
  '/api/admin',
  createDataAdminRouter({
    contentDirs: [
      { name: 'question-packs', path: QUESTION_PACKS_DIR },
      { name: 'ko-sam-ja-packs', path: KO_SAM_JA_PACKS_DIR },
      { name: 'tajni-agenti-packs', path: TAJNI_AGENTI_PACKS_DIR },
      { name: 'gluvo-doba-packs', path: GLUVO_DOBA_PACKS_DIR },
      { name: 'spijun-packs', path: SPIJUN_PACKS_DIR },
    ],
    timingFile: TIMING_CONFIG_FILE,
    // Reset wipes the timing file too — refresh the cached overrides.
    onReset: () => initTimingConfig(TIMING_CONFIG_FILE),
  })
);

// Unified admin SPA at /admin — one page covers every content editor, with a
// client-side game switch (see admin/admin-app.ts). The former per-game pages
// (/admin/kviz, /admin/ko-sam-ja, …) now 302 here for backwards-compatible
// bookmarks.
const ADMIN_APP_HTML = renderAdminApp();
app.get('/admin', (_req, res) => res.type('html').send(ADMIN_APP_HTML));
app.get('/admin/', (_req, res) => res.type('html').send(ADMIN_APP_HTML));
const LEGACY_ADMIN_ROUTES = [
  '/admin/kviz',
  '/admin/ko-sam-ja',
  '/admin/tajni-agenti',
  '/admin/gluvo-doba',
  '/admin/spijun',
  '/admin/timinzi',
];
for (const route of LEGACY_ADMIN_ROUTES) {
  app.get(route, (_req, res) => res.redirect(302, '/admin'));
}

// The editor's map image. Served from the server package's own assets copy
// so it exists in both dev (src/) and prod (dist/) layouts.
const ADMIN_MAP_PATH = path.resolve(__dirname, '..', 'assets', 'serbia-map.png');
app.get('/admin/serbia-map.png', (_req, res) => {
  res.sendFile(ADMIN_MAP_PATH, { maxAge: '7d' });
});

const httpServer = createServer(app);
const socketOrigins = SAME_ORIGIN_DEPLOY ? '*' : [HOST_ORIGIN, CONTROLLER_ORIGIN];
const { roomManager } = setupSocket(httpServer, socketOrigins, {
  questionPacksDir: QUESTION_PACKS_DIR,
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
// Visual identity per brand.md (zabari.net "Sunrise Hill"): cream canvas,
// navy voice, gold as light. The mark SVG is inlined so the page stays a
// single self-contained response.
const LANDING_HTML = `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F5EBE0">
<title>Igra Na Klik</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;font-family:'Manrope','Segoe UI',system-ui,sans-serif;background:#F5EBE0;background-image:radial-gradient(760px 460px at 50% -8%,rgba(194,155,71,.18),transparent 62%);color:#2B2B2B;-webkit-text-size-adjust:100%}
body{display:flex;align-items:center;justify-content:center;padding:1.5rem}
.wrap{text-align:center;max-width:22rem;width:100%;display:flex;flex-direction:column;gap:1.35rem;align-items:center}
.mark{width:88px;height:88px}
.eyebrow{font-family:'Fredoka','Manrope',system-ui,sans-serif;font-size:0.72rem;letter-spacing:0.28em;color:#B89040;text-transform:uppercase}
h1{font-family:'Fredoka','Manrope',system-ui,sans-serif;font-weight:400;font-size:2.3rem;letter-spacing:0.02em;color:#1D3557;margin-top:-0.9rem}
.motto{font-style:italic;font-weight:500;font-size:1.05rem;color:#5A5348;margin-top:-1rem;padding-top:0.7rem;position:relative}
.motto::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:56px;height:1px;background:#C29B47}
.cta{display:block;width:100%;padding:1rem 2rem;font-family:'Fredoka','Manrope',system-ui,sans-serif;font-size:1.2rem;letter-spacing:0.03em;background:#1D3557;color:#F5EBE0;border-radius:14px;text-decoration:none;transition:background 0.15s;min-height:48px}
.cta:hover{background:#162E4E}
.host-link{font-size:0.95rem;font-weight:600;color:#B89040;text-decoration:none;margin-top:0.3rem}
.host-link:hover{color:#1D3557}
.lang{position:fixed;top:1rem;right:1rem;display:inline-flex;gap:0.2rem;padding:0.2rem;background:#E6DCD2;border-radius:0.6rem}
.lang-btn{padding:0.3rem 0.65rem;font:inherit;font-size:0.8rem;font-weight:600;border:none;border-radius:0.45rem;cursor:pointer;background:transparent;color:#6E6A5E;min-height:0}
.rooms{text-align:left;display:none;flex-direction:column;gap:0.5rem;width:100%}
.rooms.visible{display:flex}
.rooms-title{font-family:'Fredoka','Manrope',system-ui,sans-serif;font-size:0.72rem;letter-spacing:0.18em;text-transform:uppercase;color:#B89040}
.room-row{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.7rem 1rem;background:#FAF6F0;border:1px solid rgba(29,53,87,.14);border-radius:0.8rem;text-decoration:none;color:#2B2B2B;transition:border-color 0.15s,background 0.15s}
a.room-row:hover{background:#FFFDF9;border-color:#C29B47}
.room-row.busy{opacity:0.6}
.room-code{font-family:'Fredoka','Manrope',system-ui,sans-serif;font-size:1.15rem;letter-spacing:0.15em;color:#1D3557}
.room-row.busy .room-code{color:#8B8578}
.room-meta{font-size:0.9rem;font-weight:500;color:#6E6A5E}
.room-badge{font-size:0.72rem;font-weight:600;padding:0.15rem 0.5rem;border-radius:0.4rem;background:#E6DCD2;color:#4A4438;white-space:nowrap}
.site{font-family:'Fredoka','Manrope',system-ui,sans-serif;font-size:0.9rem;letter-spacing:0.06em;color:#1D3557;margin-top:0.4rem;text-decoration:none;transition:color 0.15s}
.site:hover{color:#C29B47}
.site span{color:#C29B47}
.site:hover span{color:#1D3557}
</style>
</head>
<body>
<div class="lang" role="group" aria-label="Language">
<button class="lang-btn" type="button" data-lang="sr">SR</button>
<button class="lang-btn" type="button" data-lang="en">EN</button>
</div>
<div class="wrap">
<svg class="mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="zabari.net">
  <defs><clipPath id="leapClip"><circle cx="50" cy="50" r="46"></circle></clipPath></defs>
  <circle cx="50" cy="50" r="46" fill="#F5EBE0"></circle>
  <g clip-path="url(#leapClip)">
    <circle cx="50" cy="58" r="26" fill="#C29B47"></circle>
    <path d="M-4 100 C12 78 30 70 50 70 C70 70 88 78 104 100 Z" fill="#1D3557"></path>
    <g transform="translate(0,8) scale(0.46) translate(58,68)">
      <path d="M22 70 C12 70 8 62 12 56 C16 61 22 62 27 60 Z" fill="#1D3557"></path>
      <path d="M78 70 C88 70 92 62 88 56 C84 61 78 62 73 60 Z" fill="#1D3557"></path>
      <path d="M27 64 C27 45 36 35 50 35 C64 35 73 45 73 64 C73 73 64 77 50 77 C36 77 27 73 27 64 Z" fill="#1D3557"></path>
      <path d="M38 76 C35 82 31 83 29 81 C32 80 33 77 34 74 Z" fill="#1D3557"></path>
      <path d="M62 76 C65 82 69 83 71 81 C68 80 67 77 66 74 Z" fill="#1D3557"></path>
      <circle cx="38" cy="33" r="10.5" fill="#1D3557"></circle>
      <circle cx="62" cy="33" r="10.5" fill="#1D3557"></circle>
      <circle cx="38" cy="32" r="6.4" fill="#C29B47"></circle>
      <circle cx="62" cy="32" r="6.4" fill="#C29B47"></circle>
      <circle cx="38" cy="32.5" r="3" fill="#1D3557"></circle>
      <circle cx="62" cy="32.5" r="3" fill="#1D3557"></circle>
      <circle cx="39.6" cy="30.8" r="1.1" fill="#F5EBE0"></circle>
      <circle cx="63.6" cy="30.8" r="1.1" fill="#F5EBE0"></circle>
      <path d="M40 64 C45 68 55 68 60 64" fill="none" stroke="#C29B47" stroke-width="2" stroke-linecap="round"></path>
    </g>
    <path d="M14 90 C26 86 34 94 46 90 C58 86 66 94 86 90" fill="none" stroke="#F5EBE0" stroke-width="2.4" stroke-linecap="round"></path>
  </g>
  <circle cx="50" cy="50" r="46" fill="none" stroke="#C29B47" stroke-width="2.5"></circle>
</svg>
<div class="eyebrow" id="eyebrow">Opština Žabari</div>
<h1>Igra Na Klik</h1>
<div class="motto" id="motto">Mreža naše varoši</div>
<a class="cta" id="cta" href="/play/">Pridruži se igri</a>
<div class="rooms" id="rooms">
<div class="rooms-title" id="rooms-title">Aktivne sobe</div>
<div id="rooms-list"></div>
</div>
<a class="host-link" id="host-link" href="/host/">Kreiraj novu sobu →</a>
<a class="host-link" href="/uputstva">📖 Uputstva za igre</a>
<a class="site" href="https://zabari.net" target="_blank" rel="noopener">zabari<span>.net</span></a>
</div>
<script>
(function(){
  var KEY='igra-language';
  var T={
    sr:{cta:'Pridruži se igri',host:'Kreiraj novu sobu →',roomsTitle:'Aktivne sobe',roomsEmpty:'Nema aktivnih soba',inGame:'Igra u toku',players:'igrača'},
    en:{cta:'Join a game',host:'Create a new room →',roomsTitle:'Active rooms',roomsEmpty:'No active rooms',inGame:'Game in progress',players:'players'}
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
      btns[i].style.background=on?'#1D3557':'transparent';
      btns[i].style.color=on?'#F5EBE0':'#6E6A5E';
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

// Instructions hub — short rules for every game, pick-a-game UI (Serbian).
app.get('/uputstva', (_req, res) => {
  res.type('html').send(UPUTSTVA_PAGE_HTML);
});

// Rules page for the Gluvo doba social-deduction game (Serbian, static).
app.get('/gluvo-doba', (_req, res) => {
  res.type('html').send(GLUVO_DOBA_PAGE_HTML);
});

// Brand favicons (zabari.net mark) for the landing + admin pages. Served
// from the server package's own assets copy so it exists in both dev (src/)
// and prod (dist/) layouts — same trick as the admin map image above.
const BRAND_ASSETS_DIR = path.resolve(__dirname, '..', 'assets', 'brand');
app.use(express.static(BRAND_ASSETS_DIR, { maxAge: '7d', etag: true }));

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Question packs dir: ${QUESTION_PACKS_DIR}`);
  console.log(`Ko sam ja packs dir: ${KO_SAM_JA_PACKS_DIR}`);
  console.log(`Gluvo doba packs dir: ${GLUVO_DOBA_PACKS_DIR}`);
  console.log(`Tajni agenti packs dir: ${TAJNI_AGENTI_PACKS_DIR}`);
  console.log(`Spijun packs dir: ${SPIJUN_PACKS_DIR}`);
  if (SINGLE_ROOM_MODE) {
    console.log('Single-room mode enabled: room code auto-fill active');
  }
  console.log(
    process.env.ADMIN_TOKEN
      ? 'Admin editors enabled at /admin (kviz, ko-sam-ja, tajni-agenti…)'
      : 'Admin editors disabled (set ADMIN_TOKEN to enable)'
  );
});
