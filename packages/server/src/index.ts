import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
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

const app = express();
app.use(cors({ origin: [HOST_ORIGIN, CONTROLLER_ORIGIN] }));
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
const { roomManager } = setupSocket(httpServer, [HOST_ORIGIN, CONTROLLER_ORIGIN]);

if (SINGLE_ROOM_MODE) {
  app.get('/room-code', (_req, res) => {
    res.json({ roomCode: roomManager.getActiveRoomCode() });
  });
}

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Question packs dir: ${QUESTION_PACKS_DIR}`);
  if (SINGLE_ROOM_MODE) {
    console.log('Single-room mode enabled: room code auto-fill active');
  }
});
