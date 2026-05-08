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
import { FibbageModule } from '../game/games/fibbage/FibbageModule.js';
import { SlepiTelefoniModule } from '../game/games/slepi-telefoni/SlepiTelefoniModule.js';
import { GeoGuessModule } from '../game/games/geo-pogodi/GeoGuessModule.js';
import { FotoKvizModule } from '../game/games/foto-kviz/FotoKvizModule.js';
import { registerRoomHandlers } from './handlers/room.js';
import { registerGameHandlers } from './handlers/game.js';
import { authMiddleware, getReconnectToken } from './middleware/auth.js';

export function setupSocket(
  httpServer: HttpServer,
  corsOrigins: string | string[],
  options?: { geoPacksDir?: string }
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
    // Tolerate mobile browsers that suspend WebSockets when the screen
    // turns off or the tab is backgrounded. With these defaults the server
    // waits up to 60s before declaring a stalled connection dead, which
    // gives socket.io's reconnection layer a chance to recover the same
    // session instead of forcing a full reconnect through grace-period
    // logic.
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  const roomManager = new RoomManager();
  const gameRegistry = new GameRegistry();
  gameRegistry.register(new TestGameModule());
  gameRegistry.register(new QuizGameModule());
  gameRegistry.register(new DrawGuessModule());
  gameRegistry.register(new FibbageModule());
  gameRegistry.register(new SlepiTelefoniModule());
  gameRegistry.register(new GeoGuessModule(options?.geoPacksDir ?? ''));
  gameRegistry.register(new FotoKvizModule(options?.geoPacksDir ?? ''));

  const gameManager = new GameManager(io, roomManager, gameRegistry);

  // Grace period timers: playerId -> timeout handle
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancelGraceTimer = (playerId: string) => {
    const timer = disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(playerId);
    }
  };

  io.use(authMiddleware as Parameters<typeof io.use>[0]);

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Check for reconnection via auth token
    const reconnectToken = getReconnectToken(socket);
    if (reconnectToken) {
      const found = roomManager.findPlayerByReconnectToken(reconnectToken);
      if (found) {
        cancelGraceTimer(found.playerId);

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

        // If a game is in progress, replay the current state so the
        // reconnecting controller jumps straight back into the active
        // phase instead of sitting on the lobby until the next tick.
        if (gameManager.isGameActive(found.roomCode)) {
          gameManager.replayStateToPlayer(
            found.roomCode,
            found.playerId,
            socket.id
          );
        }

        console.log(`Player ${found.playerId} reconnected to room ${found.roomCode}`);
      }
    }

    registerRoomHandlers(io, socket, roomManager, cancelGraceTimer);
    registerGameHandlers(io, socket, gameManager, roomManager);

    socket.on('host:kick-player', ({ playerId }) => {
      const { roomCode, isHost } = socket.data;
      if (!roomCode || !isHost) return;
      if (!playerId) return;

      cancelGraceTimer(playerId);

      // Tell the game first (so its onPlayerDisconnect cleanup runs while
      // the player still exists in the room), then remove the player and
      // invalidate their reconnect token.
      gameManager.handlePlayerDisconnect(roomCode, playerId);

      const result = roomManager.kickPlayer(roomCode, playerId);
      if (!result) return;

      // Find the kicked player's socket(s) and force them out: emit
      // room:kicked so the client clears its reconnect token, then
      // disconnect so they can't keep listening on the room channel.
      for (const [, sock] of io.sockets.sockets) {
        if (sock.data.playerId === playerId) {
          sock.emit('room:kicked', { reason: 'Izbačen si iz sobe.' });
          sock.data.roomCode = undefined;
          sock.data.playerId = undefined;
          sock.leave(roomCode);
          sock.disconnect(true);
        }
      }

      io.to(roomCode).emit('room:player-removed', { playerId });
      if (result.remoteHostCleared) {
        io.to(roomCode).emit('room:remote-host-changed', {
          remoteHostPlayerId: null,
        });
      }
      console.log(`Player ${playerId} kicked from room ${roomCode}`);
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId, isHost } = socket.data;
      if (!roomCode) return;

      if (isHost) return;

      if (playerId) {
        roomManager.setPlayerConnected(roomCode, playerId, false);
        io.to(roomCode).emit('room:player-left', { playerId });

        // Don't notify the game module yet — short disconnects (mobile
        // screen off, tab background) usually resolve within seconds, and
        // game-specific disconnect logic (skipping a drawer's turn,
        // dropping a submission slot) is too destructive to fire on every
        // blip. We only tell the game the player is gone if they fail to
        // reconnect before the grace period expires.
        const timer = setTimeout(() => {
          disconnectTimers.delete(playerId);
          gameManager.handlePlayerDisconnect(roomCode, playerId);
          if (roomManager.clearRemoteHostIfHolder(roomCode, playerId)) {
            io.to(roomCode).emit('room:remote-host-changed', {
              remoteHostPlayerId: null,
            });
          }
          roomManager.removePlayer(roomCode, playerId);
          io.to(roomCode).emit('room:player-removed', { playerId });
          console.log(`Player ${playerId} removed after grace period`);
        }, RECONNECT_GRACE_MS);

        disconnectTimers.set(playerId, timer);
      }
    });
  });

  return { io, roomManager, gameManager };
}
