import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { setupSocket } from './socket/setup.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST_ORIGIN = process.env.HOST_ORIGIN || 'http://localhost:5173';
const CONTROLLER_ORIGIN =
  process.env.CONTROLLER_ORIGIN || 'http://localhost:5174';
const SINGLE_ROOM_MODE = process.env.SINGLE_ROOM_MODE === 'true';

const app = express();
app.use(cors({ origin: [HOST_ORIGIN, CONTROLLER_ORIGIN] }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
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
  if (SINGLE_ROOM_MODE) {
    console.log('Single-room mode enabled: room code auto-fill active');
  }
});
