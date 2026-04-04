import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import { GameManager } from '../../game/GameManager.js';

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

export function registerGameHandlers(
  _io: IoServer,
  socket: IoSocket,
  gameManager: GameManager
) {
  socket.on('host:start-game', (data) => {
    const { roomCode, isHost } = socket.data;
    if (!roomCode || !isHost) {
      socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can start a game' });
      return;
    }

    const result = gameManager.startGame(roomCode, data.gameId);
    if (result.error) {
      socket.emit('error', { code: 'START_ERROR', message: result.error });
    }
  });

  socket.on('game:player-action', (data) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;

    gameManager.handlePlayerAction(roomCode, playerId, data.action, data.data);
  });
}
