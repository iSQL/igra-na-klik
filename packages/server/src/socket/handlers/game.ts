import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@igra/shared';
import { GameManager } from '../../game/GameManager.js';
import { RoomManager } from '../../room/RoomManager.js';
import { createRateLimiter, createThrottle } from '../rate-limit.js';

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
  gameManager: GameManager,
  roomManager: RoomManager
) {
  // Drawing batches arrive at ~20/s per drawer — 60/s leaves headroom for
  // that plus normal gameplay, while capping what a flooding client costs.
  // Rejected events are dropped silently (no feedback to tune against).
  const playerActionLimiter = createRateLimiter(60);
  const hostActionLimiter = createRateLimiter(20);
  const startStopThrottle = createThrottle(500);

  const canControl = (): boolean => {
    const { roomCode, isHost, playerId } = socket.data;
    if (!roomCode) return false;
    if (isHost) return true;
    const room = roomManager.getRoom(roomCode);
    return !!room && !!playerId && room.remoteHostPlayerId === playerId;
  };

  socket.on('host:start-game', (data) => {
    if (!startStopThrottle()) return;
    const { roomCode } = socket.data;
    if (!roomCode || !canControl()) {
      socket.emit('error', {
        code: 'NOT_HOST',
        message: 'Only the host or remote host can start a game',
      });
      return;
    }

    const result = gameManager.startGame(roomCode, data.gameId, {
      customQuestions: data.customQuestions,
      quizPackIds: data.quizPackIds,
      quizTypes: data.quizTypes,
      slepiRounds: data.slepiRounds,
      koSamJaCategory: data.koSamJaCategory,
      customKoSamJaQuestions: data.customKoSamJaQuestions,
      customTajniAgentiPack: data.customTajniAgentiPack,
      tajniAgentiMode: data.tajniAgentiMode,
      fakeArtistRounds: data.fakeArtistRounds,
      fakeArtistStrokes: data.fakeArtistStrokes,
      koBiPreRounds: data.koBiPreRounds,
      drawTimeLimit: data.drawTimeLimit,
      gluvoDobaDiscussionSeconds: data.gluvoDobaDiscussionSeconds,
      gluvoDobaDeathReveal: data.gluvoDobaDeathReveal,
      gluvoDobaFirstNightPeace: data.gluvoDobaFirstNightPeace,
      gluvoDobaBajacica: data.gluvoDobaBajacica,
      gluvoDobaPack: data.gluvoDobaPack,
      gluvoDobaTutorial: data.gluvoDobaTutorial,
      roundCount: data.roundCount,
      boljiZivotTutorial: data.boljiZivotTutorial,
      hotPotatoMode: data.hotPotatoMode,
      hotPotatoKvizAnswerSeconds: data.hotPotatoKvizAnswerSeconds,
      spijunDiscussionSeconds: data.spijunDiscussionSeconds,
      spijunPack: data.spijunPack,
      spijunTutorial: data.spijunTutorial,
      language: data.language,
    });
    if (result.error) {
      socket.emit('error', { code: 'START_ERROR', message: result.error });
    }
  });

  socket.on('host:stop-game', () => {
    if (!startStopThrottle()) return;
    const { roomCode } = socket.data;
    if (!roomCode || !canControl()) {
      socket.emit('error', {
        code: 'NOT_HOST',
        message: 'Only the host or remote host can stop a game',
      });
      return;
    }

    const result = gameManager.stopGame(roomCode);
    if (result.error) {
      socket.emit('error', { code: 'STOP_ERROR', message: result.error });
    }
  });

  socket.on('game:player-action', (data) => {
    if (!playerActionLimiter()) return;
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;

    gameManager.handlePlayerAction(roomCode, playerId, data.action, data.data);
  });

  socket.on('host:game-action', (data) => {
    if (!hostActionLimiter()) return;
    const { roomCode } = socket.data;
    if (!roomCode || !canControl()) return;
    gameManager.handleHostAction(roomCode, data.action, data.data ?? {});
  });
}
