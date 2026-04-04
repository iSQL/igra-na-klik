import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import { RoomManager } from '../room/RoomManager.js';
import { GameManager } from '../game/GameManager.js';
import { GameRegistry } from '../game/GameRegistry.js';
import { TestGameModule } from '../game/games/test-game/TestGameModule.js';
import { registerRoomHandlers } from './handlers/room.js';
import { registerGameHandlers } from './handlers/game.js';

export function setupSocket(
  httpServer: HttpServer,
  corsOrigins: string[]
): { io: Server; roomManager: RoomManager; gameManager: GameManager } {
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
  const gameRegistry = new GameRegistry();
  gameRegistry.register(new TestGameModule());

  const gameManager = new GameManager(io, roomManager, gameRegistry);

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    registerRoomHandlers(io, socket, roomManager);
    registerGameHandlers(io, socket, gameManager);

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (roomCode && playerId) {
        gameManager.handlePlayerDisconnect(roomCode, playerId);
      }
    });
  });

  return { io, roomManager, gameManager };
}
