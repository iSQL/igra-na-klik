import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import { RECONNECT_GRACE_MS } from '@igra/shared';
import { RoomManager } from '../room/RoomManager.js';
import { GameManager } from '../game/GameManager.js';
import { GameRegistry } from '../game/GameRegistry.js';
import { TestGameModule } from '../game/games/test-game/TestGameModule.js';
import { QuizGameModule } from '../game/games/quiz/QuizGameModule.js';
import { DrawGuessModule } from '../game/games/draw-guess/DrawGuessModule.js';
import { registerRoomHandlers } from './handlers/room.js';
import { registerGameHandlers } from './handlers/game.js';
import { authMiddleware, getReconnectToken } from './middleware/auth.js';

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
  gameRegistry.register(new QuizGameModule());
  gameRegistry.register(new DrawGuessModule());

  const gameManager = new GameManager(io, roomManager, gameRegistry);

  // Grace period timers: playerId -> timeout handle
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  io.use(authMiddleware as Parameters<typeof io.use>[0]);

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Check for reconnection via auth token
    const reconnectToken = getReconnectToken(socket);
    if (reconnectToken) {
      const found = roomManager.findPlayerByReconnectToken(reconnectToken);
      if (found) {
        // Cancel grace period timer
        const timer = disconnectTimers.get(found.playerId);
        if (timer) {
          clearTimeout(timer);
          disconnectTimers.delete(found.playerId);
        }

        // Restore socket data and room membership
        roomManager.setPlayerConnected(found.roomCode, found.playerId, true);
        socket.data.roomCode = found.roomCode;
        socket.data.playerId = found.playerId;
        socket.join(found.roomCode);

        const room = roomManager.getRoom(found.roomCode)!;
        const player = room.players.find((p) => p.id === found.playerId)!;

        socket.emit('player:joined', {
          player,
          room: roomManager.toPublicRoom(room),
        });
        socket.to(found.roomCode).emit('room:player-reconnected', {
          playerId: found.playerId,
        });

        console.log(`Player ${found.playerId} reconnected to room ${found.roomCode}`);
      }
    }

    registerRoomHandlers(io, socket, roomManager);
    registerGameHandlers(io, socket, gameManager);

    socket.on('disconnect', () => {
      const { roomCode, playerId, isHost } = socket.data;
      if (!roomCode) return;

      if (isHost) return;

      if (playerId) {
        roomManager.setPlayerConnected(roomCode, playerId, false);
        io.to(roomCode).emit('room:player-left', { playerId });
        gameManager.handlePlayerDisconnect(roomCode, playerId);

        // Start grace period timer
        const timer = setTimeout(() => {
          disconnectTimers.delete(playerId);
          roomManager.removePlayer(roomCode, playerId);
          console.log(`Player ${playerId} removed after grace period`);
        }, RECONNECT_GRACE_MS);

        disconnectTimers.set(playerId, timer);
      }
    });
  });

  return { io, roomManager, gameManager };
}
