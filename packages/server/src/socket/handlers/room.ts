import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import { CHAT_MAX_LENGTH, CHAT_THROTTLE_MS } from '@igra/shared';
import { RoomManager } from '../../room/RoomManager.js';
import { hostRoom, playerRoom } from '../rooms.js';
import { createThrottle } from '../rate-limit.js';

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerRoomHandlers(
  io: IoServer,
  socket: IoSocket,
  roomManager: RoomManager,
  cancelGraceTimer: (playerId: string) => void,
  destroyRoom: (
    roomCode: string,
    reason: string,
    silentHostSocketId?: string
  ) => void
) {
  // Per-socket chat throttle timestamp.
  let lastChatAt = 0;
  // One room-lifecycle attempt (create/join) per second per socket. These
  // paths allocate rooms and scan rosters — cheap once, expensive flooded.
  const roomOpThrottle = createThrottle(1000);
  const avatarThrottle = createThrottle(250);

  const emitRateLimited = (code: 'CREATE_ERROR' | 'JOIN_ERROR') => {
    socket.emit('error', {
      code,
      message: 'Previše pokušaja — sačekaj sekund pa pokušaj ponovo.',
    });
  };

  socket.on('host:create-room', (data) => {
    if (!roomOpThrottle()) {
      emitRateLimited('CREATE_ERROR');
      return;
    }
    // A socket that's in a room as a *player* must not become a host too.
    if (socket.data.roomCode && !socket.data.isHost) {
      socket.emit('error', { code: 'CREATE_ERROR', message: 'Already in a room' });
      return;
    }
    // A host re-creating (e.g. client-side retry) tears its old room down
    // first — otherwise every call would leak a room with hostConnected
    // stuck true, which the idle sweeper never reaps. Silent for this
    // socket so its own room:destroyed doesn't trigger an auto-recreate
    // loop on the host client.
    if (socket.data.roomCode && socket.data.isHost) {
      destroyRoom(socket.data.roomCode, 'Soba je zamenjena novom.', socket.id);
    }

    const room = roomManager.createRoom(socket.id, data.settings);
    if (!room) {
      socket.emit('error', {
        code: 'CREATE_ERROR',
        message: 'Server je trenutno pun. Pokušaj ponovo kasnije.',
      });
      return;
    }
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    socket.join(room.code);
    socket.join(hostRoom(room.code));
    socket.emit('host:room-created', {
      roomCode: room.code,
      room: roomManager.toPublicRoom(room),
    });
  });

  socket.on('player:create-room', (data) => {
    if (!roomOpThrottle()) {
      emitRateLimited('CREATE_ERROR');
      return;
    }
    const playerName = (data.playerName ?? '').trim();
    if (!playerName) {
      socket.emit('error', { code: 'CREATE_ERROR', message: 'Name required' });
      return;
    }
    if (socket.data.roomCode) {
      socket.emit('error', { code: 'CREATE_ERROR', message: 'Already in a room' });
      return;
    }

    const room = roomManager.createHostlessRoom();
    if (!room) {
      socket.emit('error', {
        code: 'CREATE_ERROR',
        message: 'Server je trenutno pun. Pokušaj ponovo kasnije.',
      });
      return;
    }
    const result = roomManager.joinRoom(room.code, playerName);
    if ('error' in result) {
      roomManager.deleteRoom(room.code);
      socket.emit('error', { code: 'CREATE_ERROR', message: result.error });
      return;
    }

    const { player } = result;
    // The creator drives the show from their phone.
    room.remoteHostPlayerId = player.id;

    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    socket.join(playerRoom(player.id));

    socket.emit('player:joined', { player, room: roomManager.toPublicRoom(room) });
    console.log(`Hostless room ${room.code} created by ${player.name}`);
  });

  socket.on('player:join-room', (data) => {
    if (!roomOpThrottle()) {
      emitRateLimited('JOIN_ERROR');
      return;
    }
    const { roomCode, playerName, reconnectToken } = data;

    // Try reconnection first
    if (reconnectToken) {
      const found = roomManager.findPlayerByReconnectToken(reconnectToken);
      if (found) {
        cancelGraceTimer(found.playerId);
        roomManager.setPlayerConnected(found.roomCode, found.playerId, true);
        const room = roomManager.getRoom(found.roomCode)!;
        const player = room.players.find((p) => p.id === found.playerId)!;

        socket.data.roomCode = found.roomCode;
        socket.data.playerId = found.playerId;
        socket.join(found.roomCode);
        socket.join(playerRoom(found.playerId));

        socket.emit('player:joined', { player, room: roomManager.toPublicRoom(room) });
        socket.to(found.roomCode).emit('room:player-reconnected', {
          playerId: found.playerId,
          player: roomManager.toPublicPlayer(player),
        });
        if (room.status === 'lobby' && room.chatMessages.length > 0) {
          socket.emit('room:chat-history', { messages: room.chatMessages });
        }
        return;
      }
    }

    const result = roomManager.joinRoom(roomCode.toUpperCase(), playerName);
    if ('error' in result) {
      socket.emit('error', { code: 'JOIN_ERROR', message: result.error });
      return;
    }

    const { player, room, reclaimed } = result;
    if (reclaimed) cancelGraceTimer(player.id);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    socket.join(playerRoom(player.id));

    socket.emit('player:joined', { player, room: roomManager.toPublicRoom(room) });
    if (reclaimed) {
      // The slot already exists on the host's roster — just un-grey it (or
      // re-add it if that client had already dropped the player).
      socket.to(room.code).emit('room:player-reconnected', {
        playerId: player.id,
        player: roomManager.toPublicPlayer(player),
      });
    } else {
      socket.to(room.code).emit('room:player-joined', {
        player: roomManager.toPublicPlayer(player),
      });
    }

    if (room.status === 'lobby' && room.chatMessages.length > 0) {
      socket.emit('room:chat-history', { messages: room.chatMessages });
    }
  });

  socket.on('player:send-chat', (data) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    // Chat is a lobby-only feature — reject silently once a game runs.
    if (room.status !== 'lobby') return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    const now = Date.now();
    if (now - lastChatAt < CHAT_THROTTLE_MS) return;

    const text = (data?.text ?? '').trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;

    lastChatAt = now;
    const message = roomManager.addChatMessage(roomCode, player, text);
    if (!message) return;
    io.to(roomCode).emit('room:chat-message', { message });
  });

  socket.on('player:claim-remote-host', () => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const result = roomManager.claimRemoteHost(roomCode, playerId);
    if ('error' in result) {
      socket.emit('error', { code: 'CLAIM_ERROR', message: result.error });
      return;
    }
    io.to(roomCode).emit('room:remote-host-changed', {
      remoteHostPlayerId: playerId,
    });
  });

  socket.on('player:release-remote-host', () => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    if (roomManager.releaseRemoteHost(roomCode, playerId)) {
      io.to(roomCode).emit('room:remote-host-changed', {
        remoteHostPlayerId: null,
      });
    }
  });

  socket.on('player:set-avatar', (data) => {
    if (!avatarThrottle()) return;
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const result = roomManager.setPlayerAvatar(roomCode, playerId, data);
    if ('error' in result) {
      socket.emit('error', { code: 'AVATAR_ERROR', message: result.error });
      return;
    }
    io.to(roomCode).emit('room:player-updated', {
      player: roomManager.toPublicPlayer(result.player),
    });
  });

  socket.on('player:set-name', (data) => {
    if (!avatarThrottle()) return;
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const result = roomManager.setPlayerName(roomCode, playerId, data?.name ?? '');
    if ('error' in result) {
      socket.emit('error', { code: 'NAME_ERROR', message: result.error });
      return;
    }
    io.to(roomCode).emit('room:player-updated', {
      player: roomManager.toPublicPlayer(result.player),
    });
  });

  // Note: the 'disconnect' handling (grey-out, grace timer, host flag)
  // lives in setup.ts — a duplicate handler here used to double-emit
  // room:player-left on every disconnect.
}
