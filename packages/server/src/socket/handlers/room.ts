import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import { CHAT_MAX_LENGTH, CHAT_THROTTLE_MS } from '@igra/shared';
import { RoomManager } from '../../room/RoomManager.js';

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
  cancelGraceTimer: (playerId: string) => void
) {
  // Per-socket chat throttle timestamp.
  let lastChatAt = 0;

  socket.on('host:create-room', (data) => {
    const room = roomManager.createRoom(socket.id, data.settings);
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    socket.join(room.code);
    socket.emit('host:room-created', {
      roomCode: room.code,
      room: roomManager.toPublicRoom(room),
    });
  });

  socket.on('player:create-room', (data) => {
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

    socket.emit('player:joined', { player, room: roomManager.toPublicRoom(room) });
    console.log(`Hostless room ${room.code} created by ${player.name}`);
  });

  socket.on('player:join-room', (data) => {
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

        socket.emit('player:joined', { player, room: roomManager.toPublicRoom(room) });
        socket.to(found.roomCode).emit('room:player-reconnected', {
          playerId: found.playerId,
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

    socket.emit('player:joined', { player, room: roomManager.toPublicRoom(room) });
    if (reclaimed) {
      // The slot already exists on the host's roster — just un-grey it.
      socket.to(room.code).emit('room:player-reconnected', {
        playerId: player.id,
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

  socket.on('disconnect', () => {
    const { roomCode, playerId, isHost } = socket.data;
    if (!roomCode) return;

    if (isHost) {
      // For now, just leave the room intact — players see host disconnected
      return;
    }

    if (playerId) {
      roomManager.setPlayerConnected(roomCode, playerId, false);
      io.to(roomCode).emit('room:player-left', { playerId });
    }
  });
}
