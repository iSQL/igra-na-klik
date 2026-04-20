import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { parseQuizImport } from '@igra/shared';
import { setupSocket } from './socket/setup.js';

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

// When deployed as a single container, host and controller live on the same
// origin — no CORS list needed. Fall back to the configured origins otherwise.
const SAME_ORIGIN_DEPLOY = process.env.SAME_ORIGIN_DEPLOY === 'true';
const corsOrigins = SAME_ORIGIN_DEPLOY
  ? true
  : [HOST_ORIGIN, CONTROLLER_ORIGIN];

const app = express();
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

const httpServer = createServer(app);
const socketOrigins = SAME_ORIGIN_DEPLOY ? '*' : [HOST_ORIGIN, CONTROLLER_ORIGIN];
const { roomManager } = setupSocket(httpServer, socketOrigins);

if (SINGLE_ROOM_MODE) {
  app.get('/room-code', (_req, res) => {
    res.json({ roomCode: roomManager.getActiveRoomCode() });
  });
}

// Static serving for single-container deployments: host at /, controller at /play.
// Skipped automatically if the dist directories aren't present (e.g. `npm run dev`).
const HOST_DIST_DIR = process.env.HOST_DIST_DIR
  ? path.resolve(process.env.HOST_DIST_DIR)
  : path.resolve(__dirname, '../../host/dist');
const CONTROLLER_DIST_DIR = process.env.CONTROLLER_DIST_DIR
  ? path.resolve(process.env.CONTROLLER_DIST_DIR)
  : path.resolve(__dirname, '../../controller/dist');

if (existsSync(CONTROLLER_DIST_DIR)) {
  app.use('/play', express.static(CONTROLLER_DIST_DIR));
  app.get('/play', (_req, res) => {
    res.sendFile(path.join(CONTROLLER_DIST_DIR, 'index.html'));
  });
  app.get('/play/*', (_req, res) => {
    res.sendFile(path.join(CONTROLLER_DIST_DIR, 'index.html'));
  });
  console.log(`Serving controller from ${CONTROLLER_DIST_DIR} at /play`);
}

if (existsSync(HOST_DIST_DIR)) {
  app.use(express.static(HOST_DIST_DIR));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/socket.io') ||
      req.path.startsWith('/play') ||
      req.path === '/health' ||
      req.path === '/room-code'
    ) {
      return next();
    }
    res.sendFile(path.join(HOST_DIST_DIR, 'index.html'));
  });
  console.log(`Serving host from ${HOST_DIST_DIR} at /`);
}

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Question packs dir: ${QUESTION_PACKS_DIR}`);
  if (SINGLE_ROOM_MODE) {
    console.log('Single-room mode enabled: room code auto-fill active');
  }
});
