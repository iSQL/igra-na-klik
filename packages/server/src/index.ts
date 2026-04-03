import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { setupSocket } from './socket/setup.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST_ORIGIN = process.env.HOST_ORIGIN || 'http://localhost:5173';
const CONTROLLER_ORIGIN =
  process.env.CONTROLLER_ORIGIN || 'http://localhost:5174';

const app = express();
app.use(cors({ origin: [HOST_ORIGIN, CONTROLLER_ORIGIN] }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = createServer(app);
setupSocket(httpServer, [HOST_ORIGIN, CONTROLLER_ORIGIN]);

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
