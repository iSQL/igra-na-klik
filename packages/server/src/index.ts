import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Load the repo-root .env explicitly. `npm run dev -w @igra/server` sets
// cwd to packages/server, so the bare `import 'dotenv/config'` (which reads
// .env from cwd) silently missed the documented root .env file. cwd is
// still consulted first so a package-local .env can override in odd setups
// (dotenv never overwrites variables that are already set).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
// Tee console.* into daily-rolling JSON files (Grafana/Loki), after .env is
// loaded so LOG_DIR / LOG_RETENTION_DAYS are visible. No-op'able: degrades to
// stdout-only if the log dir isn't writable. See logger.ts.
import { initFileLogging } from './logger.js';
initFileLogging();
import { existsSync, statSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  parseKoSamJaImport,
  parseTajniAgentiImport,
  KVIZ_BANK_PACK_ID,
  QUIZ_QUESTION_BANK,
} from '@igra/shared';
import { listAsocijacijePackSummaries } from './game/games/asocijacije/asocijacije-pack-resolver.js';
import { listBitkaMapSummaries } from './game/games/bitka/bitka-map-resolver.js';
import { puzlaImages, PUZLA_IMAGE_ROUTE } from './game/games/puzla/puzla-image-store.js';
import type { KoSamJaImportQuestion, KvizQuestionType } from '@igra/shared';
import { setupSocket } from './socket/setup.js';
import { GLUVO_DOBA_PAGE_HTML } from './gluvo-doba-page.js';
import { UPUTSTVA_PAGE_HTML } from './uputstva-page.js';
import { listQuizPackSummaries } from './game/games/quiz/quiz-pack-resolver.js';
import { listFibbagePackSummaries } from './game/games/fibbage/fibbage-pack-resolver.js';
import { createContentAdminRouter } from './admin/content-admin.js';
import { createTimingAdminRouter } from './admin/timing-admin.js';
import { initTimingConfig } from './game/timing-config.js';
import { initQuizFeedback } from './game/quiz-feedback.js';
import { renderAdminApp } from './admin/admin-app.js';
import { renderKvizGeneratorPage } from './kviz-generator-page.js';
import { createDataAdminRouter } from './admin/data-admin.js';
import {
  KVIZ_LINK_MEDIA_FILE_RE,
  KvizLinkStore,
  isValidKvizLinkSlug,
} from './kviz-links/kviz-link-store.js';
import { createKvizLinkRouter } from './kviz-links/kviz-link-api.js';
import { createKvizLinkAdminRouter } from './admin/kviz-link-admin.js';
import {
  resolveContentDir,
  resolveTimingFile,
  resolveQuizFeedbackFile,
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
const ASOCIJACIJE_PACKS_DIR = resolveContentDir(
  'asocijacije-packs',
  process.env.ASOCIJACIJE_PACKS_DIR
);
const FIBBAGE_PACKS_DIR = resolveContentDir(
  'fibbage-packs',
  process.env.FIBBAGE_PACKS_DIR
);
// Osvajanje: mape se crtaju u adminu. Manifest je <id>.json, otpremljena slika
// živi u <id>/ pored njega i služi se sa /bitka-files/<id>/<file>.
const BITKA_MAPS_DIR = resolveContentDir(
  'bitka-maps',
  process.env.BITKA_MAPS_DIR
);
// Kviz linkovi (/k/<naziv>): user-made quizzes, one folder per link. Not a
// seeded content dir — nothing ships by default, and a factory reset of the
// packs must not delete what visitors made.
const KVIZ_LINKS_DIR = resolveContentDir('kviz-links', process.env.KVIZ_LINKS_DIR);
const kvizLinks = new KvizLinkStore(KVIZ_LINKS_DIR);
kvizLinks.load();
void kvizLinks.purgeExpired();
setInterval(() => void kvizLinks.purgeExpired(), 12 * 3600_000).unref();
// Admin-configurable "wait" timings live in a single JSON file (overrides only).
const TIMING_CONFIG_FILE = resolveTimingFile(process.env.TIMING_CONFIG_FILE);
initTimingConfig(TIMING_CONFIG_FILE);
// Player quiz feedback (reports + ratings) is file-backed alongside the timing
// overrides; the quiz module writes to it live, the admin editor reads it.
const QUIZ_FEEDBACK_FILE = resolveQuizFeedbackFile(process.env.QUIZ_FEEDBACK_FILE);
initQuizFeedback(QUIZ_FEEDBACK_FILE);

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
  // The kviz-link API parses its own bodies too (covers ride as data: URLs).
  if (
    req.path.startsWith('/api/admin') ||
    req.path === '/api/k' ||
    req.path.startsWith('/api/k/')
  ) {
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

// Lažov — summaries only. A Lažov manifest carries the answers, so full
// questions must never leave the server; the chosen packs ride
// host:start-game as fibbagePackIds and resolve server-side. An empty list
// means the folder has no valid pack — the game falls back to the built-in
// bank, so the picker simply has nothing to offer.
app.get('/api/fibbage-packs', async (_req, res) => {
  try {
    const packs = await listFibbagePackSummaries(FIBBAGE_PACKS_DIR);
    res.json({ packs });
  } catch (err) {
    console.error('Failed to read fibbage packs directory:', err);
    res.status(500).json({ error: 'Failed to read fibbage packs' });
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

// Asocijacije puzzle packs — summaries only (manifests carry answers). Only
// file-backed packs are listed; the in-code bank is kept solely as a silent
// server-side fallback (never a selectable "category").
app.get('/api/asocijacije-packs', async (_req, res) => {
  try {
    const packs = await listAsocijacijePackSummaries(ASOCIJACIJE_PACKS_DIR);
    res.json({ packs });
  } catch (err) {
    console.error('Failed to read asocijacije packs directory:', err);
    res.status(500).json({ error: 'Failed to read asocijacije packs' });
  }
});

// Osvajanje — mape za selektor na game-select ekranu. Geometrija nije tajna
// (svi vide tablu), ali je velika, pa lista nosi samo sažetke; punu mapu
// razrešava server na startu partije.
app.get('/api/bitka-maps', async (_req, res) => {
  try {
    const maps = await listBitkaMapSummaries(BITKA_MAPS_DIR);
    res.json({ maps });
  } catch (err) {
    console.error('Failed to read bitka maps directory:', err);
    res.status(500).json({ error: 'Failed to read bitka maps' });
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

/**
 * Guard for the static content mounts below: only `/<folder>/<file>` and never
 * a manifest. The check runs on the DECODED path — express.static decodes
 * before reading the disk, so testing the raw path let `link%2ejson` through.
 */
function contentFileGuard(
  allow: (folder: string, file: string) => boolean
): express.RequestHandler {
  return (req, res, next) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(req.path);
    } catch {
      res.status(404).end();
      return;
    }
    const m = /^\/([^/\\]+)\/([^/\\]+)$/.exec(decoded);
    if (
      !m ||
      m[2].startsWith('.') ||
      m[2].toLowerCase().endsWith('.json') ||
      !allow(m[1], m[2])
    ) {
      res.status(404).end();
      return;
    }
    next();
  };
}

// Kviz pack assets (images/audio/custom maps) in per-pack subfolders:
// /kviz-files/<packId>/<file>. The manifests at the dir root carry answers
// (correctIndex, lat/lng, broj answers) — only files one level inside a
// pack folder are ever served, and never *.json.
app.use(
  '/kviz-files',
  cors({ origin: corsOrigins }),
  contentFileGuard((folder) => /^[a-zA-Z0-9_-]+$/.test(folder)),
  express.static(QUESTION_PACKS_DIR, { maxAge: '7d', etag: true })
);

// Kviz link media (cover + private-question images/audio):
// /k-files/<slug>/<file>. link.json carries the answers and the PIN hash, so
// the same guard as the packs applies — one level deep, never *.json.
app.use(
  '/k-files',
  cors({ origin: corsOrigins }),
  // Allowlist, not just "no .json": only names the store itself generates.
  contentFileGuard(
    (slug, file) => isValidKvizLinkSlug(slug) && KVIZ_LINK_MEDIA_FILE_RE.test(file)
  ),
  express.static(KVIZ_LINKS_DIR, { maxAge: '7d', etag: true })
);

// Slike mapa za Osvajanje: /bitka-files/<mapId>/<file>. Isti guard kao kod
// kviza — služi se samo jedan nivo unutar foldera mape i nikad *.json, da se
// manifest ne bi mogao povući mimo API-ja.
app.use(
  '/bitka-files',
  cors({ origin: corsOrigins }),
  contentFileGuard((folder) => /^[a-zA-Z0-9_-]+$/.test(folder)),
  express.static(BITKA_MAPS_DIR, { maxAge: '7d', etag: true })
);

// Puzla: the picture a host uploaded for their room, straight from memory
// (see puzla-image-store.ts). 404 unless the id is the room's current one —
// the id is a UUID, the room code alone is guessable. The id changes with
// every upload, so the response can be cached as immutable.
app.get(`${PUZLA_IMAGE_ROUTE}/:room/:id`, cors({ origin: corsOrigins }), (req, res) => {
  const image = puzlaImages.get(req.params.room);
  if (!image || image.id !== req.params.id) {
    res.status(404).end();
    return;
  }
  res.set({
    'Content-Type': 'image/jpeg',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=86400, immutable',
  });
  res.send(image.buf);
});

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
    asocijacijePacksDir: ASOCIJACIJE_PACKS_DIR,
    bitkaMapsDir: BITKA_MAPS_DIR,
    fibbagePacksDir: FIBBAGE_PACKS_DIR,
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
      { name: 'asocijacije-packs', path: ASOCIJACIJE_PACKS_DIR },
      { name: 'fibbage-packs', path: FIBBAGE_PACKS_DIR },
      { name: 'bitka-maps', path: BITKA_MAPS_DIR },
    ],
    timingFile: TIMING_CONFIG_FILE,
    extraFiles: [QUIZ_FEEDBACK_FILE],
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

// Public, no-auth Kviz pack generator. Builds a pack zip fully client-side;
// the owner imports it via the admin "Podaci" tab.
const KVIZ_GENERATOR_HTML = renderKvizGeneratorPage();
app.get('/kviz-generator', (_req, res) => res.type('html').send(KVIZ_GENERATOR_HTML));
app.get('/kviz-generator/', (_req, res) => res.type('html').send(KVIZ_GENERATOR_HTML));
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
  asocijacijePacksDir: ASOCIJACIJE_PACKS_DIR,
  bitkaMapsDir: BITKA_MAPS_DIR,
  fibbagePacksDir: FIBBAGE_PACKS_DIR,
  kvizLinks,
});

// ---- Kviz linkovi -------------------------------------------------------------
// API (public create/join card + PIN-gated editing) and the editor pages. The
// pages are one static app (assets/kviz-link/) that routes on the path:
// /k = my links, /k/novi = new link, /k/<naziv>/uredi = edit behind the PIN.
// /k/<naziv> itself is the link players get — it sends them to the phone app.
app.use('/api/k', createKvizLinkRouter({ store: kvizLinks, questionPacksDir: QUESTION_PACKS_DIR, roomManager }));
// Admin "Kviz linkovi" tab: list, edit (hands the admin an edit token), delete.
app.use('/api/admin', createKvizLinkAdminRouter({ store: kvizLinks, roomManager }));
const KVIZ_LINK_APP_DIR = path.resolve(__dirname, '..', 'assets', 'kviz-link');
app.use('/k-app', express.static(KVIZ_LINK_APP_DIR, { maxAge: '1h', etag: true }));
const sendKvizLinkApp = (_req: express.Request, res: express.Response) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(KVIZ_LINK_APP_DIR, 'index.html'));
};
app.get('/k', sendKvizLinkApp);
app.get('/k/', sendKvizLinkApp);
app.get('/k/novi', sendKvizLinkApp);
app.get('/k/:slug/uredi', sendKvizLinkApp);
app.get('/k/:slug', (req, res) => {
  const slug = req.params.slug.toLowerCase();
  if (!isValidKvizLinkSlug(slug)) {
    res.redirect(302, '/k');
    return;
  }
  res.redirect(302, `/play/?kviz=${encodeURIComponent(slug)}`);
});

if (SINGLE_ROOM_MODE) {
  app.get('/room-code', (_req, res) => {
    res.json({ roomCode: roomManager.getActiveRoomCode() });
  });
}

// Public rooms list for the join screen: safe summaries only (code,
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

/**
 * Kad se servira statički bandl, uz putanju ide i kada je napravljen — bez toga
 * se ne razlikuje svež build od jučerašnjeg, a stariji bandl izgleda kao da
 * "izmene ne rade". U repo-režimu (bez DATA_DIR, tj. lokalni rad) dodaje se i
 * uputstvo, jer je tu zamrznut bandl skoro uvek greška, a ne namera.
 */
function buildBanner(dir: string, pkg: 'host' | 'controller'): string {
  let stamp = 'nepoznato';
  try {
    stamp = statSync(path.join(dir, 'index.html')).mtime.toLocaleString('sv-SE');
  } catch {
    // Nedostupan mtime ne sme da obori start — banner je informativan.
  }
  const hint =
    process.env.DATA_DIR || process.env.NODE_ENV === 'production'
      ? ''
      : `\n  ↳ STATIČKI BANDL: izmene u packages/${pkg}/src se NE vide dok ne uradiš` +
        `\n    "npm run build -w @igra/${pkg}". Za HMR obriši packages/${pkg}/dist` +
        ' (to radi i "npm run dev").';
  return `(build: ${stamp})${hint}`;
}

if (hasControllerBuild) {
  app.use('/play', express.static(CONTROLLER_DIST_DIR));
  app.get('/play/*', (_req, res) => {
    res.sendFile(path.join(CONTROLLER_DIST_DIR, 'index.html'));
  });
  console.log(
    `Serving controller from ${CONTROLLER_DIST_DIR} at /play ` +
      buildBanner(CONTROLLER_DIST_DIR, 'controller')
  );
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
  console.log(
    `Serving host from ${HOST_DIST_DIR} at /host ` + buildBanner(HOST_DIST_DIR, 'host')
  );
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

// Root: straight to the join screen. The phone IS the start page — TV play,
// the rules, language and zabari.net live in its ⋯ menu — so a separate
// landing page in between was one more tap and a second look before anyone
// played. 302 rather than 301 so browsers don't pin the redirect if `/` ever
// becomes a page again. The query string rides along (`/?code=KZB`). Nothing
// here creates a room, so bots and link previews stay harmless; the host
// lives at /host for the same reason.
app.get('/', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, '/play/' + qs);
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

// Pick the most likely physical-LAN IPv4 for the dev banner. Windows dev boxes
// commonly carry virtual adapters (WSL/Docker/Hyper-V — all on 172.16–31.x)
// that would win a naive "first non-internal" pick and print e.g. 172.26.x.x
// instead of the real 192.168.x.x. Rank by address range (192.168 > 10 > 172)
// and demote known-virtual adapter names.
function pickLanIp(): string | undefined {
  const VIRTUAL =
    /(wsl|docker|hyper-?v|virtualbox|vmware|vethernet|loopback|tailscale|zerotier|hamachi|\btun\b|\btap\b)/i;
  const candidates: Array<{ address: string; score: number }> = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const ni of infos ?? []) {
      if (!ni || ni.family !== 'IPv4' || ni.internal) continue;
      let score = 40;
      if (ni.address.startsWith('192.168.')) score = 100;
      else if (ni.address.startsWith('10.')) score = 80;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ni.address)) score = 20;
      if (VIRTUAL.test(name)) score -= 50;
      candidates.push({ address: ni.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address;
}

// Zauzet port je najčešća greška pri pokretanju (stari `npm run dev` koji nije
// ugašen). Podrazumevani Node ispis je goli stack trace, pa se ovde presreće i
// zameni porukom sa gotovom komandom — ugasiti tuđi proces bez pitanja nije
// posao servera, samo se ponudi komanda.
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`
  ✖ Port ${PORT} je zauzet — verovatno stari dev proces.`);
  console.error(`     Ugasi ga sa:  npm run free-ports -- ${PORT}`);
  console.error('     (bez argumenta oslobađa 3001, 5173 i 5174)');
  console.error(`     Ili pokreni server na drugom portu:  PORT=${PORT + 1} npm run dev:server
`);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Question packs dir: ${QUESTION_PACKS_DIR}`);
  console.log(`Ko sam ja packs dir: ${KO_SAM_JA_PACKS_DIR}`);
  console.log(`Gluvo doba packs dir: ${GLUVO_DOBA_PACKS_DIR}`);
  console.log(`Tajni agenti packs dir: ${TAJNI_AGENTI_PACKS_DIR}`);
  console.log(`Spijun packs dir: ${SPIJUN_PACKS_DIR}`);
  console.log(`Asocijacije packs dir: ${ASOCIJACIJE_PACKS_DIR}`);
  console.log(`Bitka maps dir: ${BITKA_MAPS_DIR}`);
  console.log(`Kviz links dir: ${KVIZ_LINKS_DIR}`);
  if (SINGLE_ROOM_MODE) {
    console.log('Single-room mode enabled: room code auto-fill active');
  }
  console.log(
    process.env.ADMIN_TOKEN
      ? 'Admin editors enabled at /admin (kviz, ko-sam-ja, tajni-agenti…)'
      : 'Admin editors disabled (set ADMIN_TOKEN to enable)'
  );

  // The Express server on :3001 is the single entry point — it proxies /host
  // and /play to the Vite dev servers. Players should open THIS URL, not the
  // raw Vite :5173/:5174 addresses (which the Vite dev servers print
  // themselves). Surface the LAN address so phones on the same network can
  // join without guessing the host machine's IP.
  const base = `http://${pickLanIp() ?? 'localhost'}:${PORT}`;
  console.log('\n  ▶ Otvori igru na:');
  console.log(`      TV / host:   ${base}/host/`);
  console.log(`      Telefoni:    ${base}/play/`);
  console.log(`      Kviz link:   ${base}/k`);
  console.log(`      Početna:     ${base}/\n`);
});
