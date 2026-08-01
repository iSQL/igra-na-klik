import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import {
  RECONNECT_GRACE_MS,
  IDLE_ROOM_TTL_MS,
  IDLE_SWEEP_INTERVAL_MS,
} from '@igra/shared';
import { RoomManager } from '../room/RoomManager.js';
import { GameManager } from '../game/GameManager.js';
import { GameRegistry } from '../game/GameRegistry.js';
import { TestGameModule } from '../game/games/test-game/TestGameModule.js';
import { QuizGameModule } from '../game/games/quiz/QuizGameModule.js';
import { DrawGuessModule } from '../game/games/draw-guess/DrawGuessModule.js';
import { FakeArtistModule } from '../game/games/fake-artist/FakeArtistModule.js';
import { KoBiPreModule } from '../game/games/ko-bi-pre/KoBiPreModule.js';
import { DveIstineModule } from '../game/games/dve-istine-i-laz/DveIstineModule.js';
import { FibbageModule } from '../game/games/fibbage/FibbageModule.js';
import { SlepiTelefoniModule } from '../game/games/slepi-telefoni/SlepiTelefoniModule.js';
import { KoSamJaModule } from '../game/games/ko-sam-ja/KoSamJaModule.js';
import { SpotItModule } from '../game/games/spot-it/SpotItModule.js';
import { TajniAgentiModule } from '../game/games/tajni-agenti/TajniAgentiModule.js';
import { GluvoDobaModule } from '../game/games/gluvo-doba/GluvoDobaModule.js';
import { BoljiZivotModule } from '../game/games/bolji-zivot/BoljiZivotModule.js';
import { HotPotatoModule } from '../game/games/hot-potato/HotPotatoModule.js';
import { SpijunModule } from '../game/games/spijun/SpijunModule.js';
import { AsocijacijeModule } from '../game/games/asocijacije/AsocijacijeModule.js';
import { PenaliModule } from '../game/games/penali/PenaliModule.js';
import { SlozilicaModule } from '../game/games/slozilica/SlozilicaModule.js';
import { BitkaModule } from '../game/games/bitka/BitkaModule.js';
import { registerRoomHandlers } from './handlers/room.js';
import { registerGameHandlers } from './handlers/game.js';
import { authMiddleware, getReconnectToken } from './middleware/auth.js';
import { hostRoom, playerRoom } from './rooms.js';

export function setupSocket(
  httpServer: HttpServer,
  corsOrigins: string | string[],
  options?: {
    questionPacksDir?: string;
    asocijacijePacksDir?: string;
    bitkaMapsDir?: string;
  }
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
    // Cap incoming socket messages well below socket.io's 1MB default.
    // The largest legitimate payload is an inline quiz import whose data:
    // image URLs are capped at 400KB by the shared validator; everything
    // else is tiny. Keeps message floods cheap to reject.
    maxHttpBufferSize: 512 * 1024,
  });

  const roomManager = new RoomManager();
  // Factories, not instances: GameManager creates a fresh module per game
  // so concurrent rooms playing the same game don't share mutable state.
  const gameRegistry = new GameRegistry();
  const questionPacksDir = options?.questionPacksDir ?? '';
  const asocijacijePacksDir = options?.asocijacijePacksDir ?? '';
  const bitkaMapsDir = options?.bitkaMapsDir ?? '';
  gameRegistry.register(() => new TestGameModule());
  gameRegistry.register(() => new QuizGameModule(questionPacksDir));
  gameRegistry.register(() => new DrawGuessModule());
  gameRegistry.register(() => new FakeArtistModule());
  gameRegistry.register(() => new KoBiPreModule());
  gameRegistry.register(() => new DveIstineModule());
  gameRegistry.register(() => new FibbageModule());
  gameRegistry.register(() => new SlepiTelefoniModule());
  gameRegistry.register(() => new KoSamJaModule());
  gameRegistry.register(() => new SpotItModule());
  gameRegistry.register(() => new TajniAgentiModule());
  gameRegistry.register(() => new GluvoDobaModule());
  gameRegistry.register(() => new BoljiZivotModule());
  gameRegistry.register(() => new HotPotatoModule(questionPacksDir));
  gameRegistry.register(() => new SpijunModule());
  gameRegistry.register(() => new AsocijacijeModule(asocijacijePacksDir));
  gameRegistry.register(() => new PenaliModule());
  gameRegistry.register(() => new SlozilicaModule());
  gameRegistry.register(() => new BitkaModule(questionPacksDir, bitkaMapsDir));

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

  // Full room teardown: stop any active game, cancel grace timers, bounce
  // every socket out (host gets room:destroyed and auto-creates a fresh
  // room; players get room:kicked + disconnect), then delete the room.
  // `silentHostSocketId` suppresses the room:destroyed emit for that host
  // socket — used when the same socket is re-creating a room, where the
  // notification would trigger the host client's auto-recreate and loop.
  const destroyRoom = (
    roomCode: string,
    reason: string,
    silentHostSocketId?: string
  ) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    if (gameManager.isGameActive(roomCode)) {
      gameManager.stopGame(roomCode);
    }

    for (const p of room.players) {
      cancelGraceTimer(p.id);
    }

    for (const [, sock] of io.sockets.sockets) {
      if (sock.data.roomCode !== roomCode) continue;
      if (sock.data.isHost) {
        if (sock.id !== silentHostSocketId) {
          sock.emit('room:destroyed', { reason });
        }
        sock.data.roomCode = undefined;
        sock.leave(roomCode);
        sock.leave(hostRoom(roomCode));
        continue;
      }
      if (sock.data.playerId) {
        sock.emit('room:kicked', { reason });
        sock.leave(playerRoom(sock.data.playerId));
        sock.data.roomCode = undefined;
        sock.data.playerId = undefined;
        sock.leave(roomCode);
        sock.disconnect(true);
      }
    }

    roomManager.deleteRoom(roomCode);
  };

  // Abandoned-room sweep: rooms whose host is disconnected and that have
  // had zero connected players for IDLE_ROOM_TTL_MS get deleted. Also
  // reaps orphan rooms left behind when the host page reloads (a reload
  // creates a brand-new room and abandons the old one).
  setInterval(() => {
    for (const code of roomManager.collectIdleRooms(
      Date.now(),
      IDLE_ROOM_TTL_MS
    )) {
      destroyRoom(code, 'Soba je zatvorena zbog neaktivnosti.');
      console.log(`Room ${code} deleted after idle timeout`);
    }
  }, IDLE_SWEEP_INTERVAL_MS);

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
        socket.join(playerRoom(found.playerId));

        const room = roomManager.getRoom(found.roomCode)!;
        const player = room.players.find((p) => p.id === found.playerId)!;

        socket.emit('player:joined', {
          player,
          room: roomManager.toPublicRoom(room),
        });
        socket.to(found.roomCode).emit('room:player-reconnected', {
          playerId: found.playerId,
          player: roomManager.toPublicPlayer(player),
        });

        // Catch the returning player up on lobby chat.
        if (room.status === 'lobby' && room.chatMessages.length > 0) {
          socket.emit('room:chat-history', { messages: room.chatMessages });
        }

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

    registerRoomHandlers(io, socket, roomManager, cancelGraceTimer, destroyRoom);
    registerGameHandlers(io, socket, gameManager, roomManager);

    socket.on('host:kick-player', ({ playerId }) => {
      const { roomCode, playerId: requesterId, isHost } = socket.data;
      if (!roomCode || !playerId) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      // TV host socket, or the player holding the remote-host claim (so the
      // room can be managed from a phone on /play). Same rule as close-room.
      const canControl =
        isHost || (!!requesterId && room.remoteHostPlayerId === requesterId);
      if (!canControl) return;
      // The remote-host holder can't kick themselves — that's what leaving is.
      if (playerId === requesterId) return;

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
          sock.leave(playerRoom(playerId));
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

    socket.on('host:close-room', () => {
      const { roomCode, playerId, isHost } = socket.data;
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      // Same control rule as host:stop-game: the TV host socket or the
      // player currently holding the remote-host claim.
      const canControl =
        isHost || (playerId && room.remoteHostPlayerId === playerId);
      if (!canControl) return;

      destroyRoom(roomCode, 'Soba je zatvorena.');
      console.log(`Room ${roomCode} closed by ${isHost ? 'host' : playerId}`);
    });

    socket.on('player:leave-room', () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      const isRemoteHost = room.remoteHostPlayerId === playerId;

      if (isRemoteHost && !room.hostless) {
        // Remote-host drove the show — tear the entire room down so the
        // remaining players aren't stuck waiting on a phantom controller.
        // (Hostless rooms instead transfer the claim below — closing the
        // room is an explicit choice via host:close-room.)
        destroyRoom(roomCode, 'Igrač koji je držao kontrolu je napustio sobu.');
        console.log(`Room ${roomCode} destroyed by remote-host ${playerId}`);
        return;
      }

      // Regular player leaving — same effect as a kick: drop their seat,
      // invalidate their reconnect token, broadcast the removal.
      cancelGraceTimer(playerId);
      gameManager.handlePlayerDisconnect(roomCode, playerId);
      const result = roomManager.kickPlayer(roomCode, playerId);
      socket.emit('room:kicked', {});
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      socket.leave(roomCode);
      socket.leave(playerRoom(playerId));
      socket.disconnect(true);

      if (result) {
        io.to(roomCode).emit('room:player-removed', { playerId });
        if (result.remoteHostCleared) {
          // In a hostless room the claim must not stay empty — hand it to
          // the next connected player so someone can still run the show.
          const nextHolder = room.hostless
            ? roomManager.transferRemoteHost(roomCode)
            : null;
          io.to(roomCode).emit('room:remote-host-changed', {
            remoteHostPlayerId: nextHolder,
          });
        }
      }
      console.log(`Player ${playerId} left room ${roomCode}`);
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId, isHost } = socket.data;
      if (!roomCode) return;

      if (isHost) {
        // Room stays alive (players see the host greyed out), but mark it
        // so the idle sweeper can reap it if nobody ever comes back.
        roomManager.setHostConnected(roomCode, false);
        return;
      }

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
            const room = roomManager.getRoom(roomCode);
            const nextHolder = room?.hostless
              ? roomManager.transferRemoteHost(roomCode)
              : null;
            io.to(roomCode).emit('room:remote-host-changed', {
              remoteHostPlayerId: nextHolder,
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
