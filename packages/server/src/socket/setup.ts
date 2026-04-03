import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import { RoomManager } from '../room/RoomManager.js';
import { registerRoomHandlers } from './handlers/room.js';

export function setupSocket(
  httpServer: HttpServer,
  corsOrigins: string[]
): { io: Server; roomManager: RoomManager } {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  const roomManager = new RoomManager();

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    registerRoomHandlers(io, socket, roomManager);
  });

  return { io, roomManager };
}
