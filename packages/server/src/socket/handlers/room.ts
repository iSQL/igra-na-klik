import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
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
  roomManager: RoomManager
) {
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

  socket.on('player:join-room', (data) => {
    const { roomCode, playerName, reconnectToken } = data;

    // Try reconnection first
    if (reconnectToken) {
      const found = roomManager.findPlayerByReconnectToken(reconnectToken);
      if (found) {
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
        return;
      }
    }

    const result = roomManager.joinRoom(roomCode.toUpperCase(), playerName);
    if ('error' in result) {
      socket.emit('error', { code: 'JOIN_ERROR', message: result.error });
      return;
    }

    const { player, room } = result;
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);

    socket.emit('player:joined', { player, room: roomManager.toPublicRoom(room) });
    socket.to(room.code).emit('room:player-joined', {
      player: roomManager.toPublicPlayer(player),
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
