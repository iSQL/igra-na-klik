import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  GameState,
} from '@igra/shared';
import { GAME_DEFINITIONS } from '@igra/shared';
import { RoomManager } from '../room/RoomManager.js';
import { GameRegistry } from './GameRegistry.js';

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

interface ActiveGame {
  gameState: GameState;
  intervalId: ReturnType<typeof setInterval>;
}

export class GameManager {
  private activeGames = new Map<string, ActiveGame>();

  constructor(
    private io: IoServer,
    private roomManager: RoomManager,
    private registry: GameRegistry
  ) {}

  startGame(
    roomCode: string,
    gameId: string,
    customContent?: unknown
  ): { error?: string } {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'lobby') return { error: 'Game already in progress' };

    const module = this.registry.get(gameId);
    if (!module) return { error: 'Unknown game' };

    const definition = GAME_DEFINITIONS[gameId];
    if (definition) {
      const connectedPlayers = room.players.filter((p) => p.isConnected);
      if (connectedPlayers.length < definition.minPlayers) {
        return { error: `Need at least ${definition.minPlayers} players` };
      }
    }

    room.status = 'in-game';
    room.currentGameId = gameId;

    const gameState = module.onStart(room, customContent);
    this.emitGameState(roomCode, gameState);
    this.io.to(roomCode).emit('game:started', { gameId, gameState });

    const intervalId = setInterval(() => {
      this.tick(roomCode);
    }, 1000);

    this.activeGames.set(roomCode, { gameState, intervalId });

    return {};
  }

  handlePlayerAction(
    roomCode: string,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const module = this.registry.get(room.currentGameId!);
    if (!module) return;

    const newState = module.onPlayerAction(
      room,
      active.gameState,
      playerId,
      action,
      data
    );

    if (newState) {
      active.gameState = newState;
      this.emitGameState(roomCode, newState);

      if (newState.phase === 'ended') {
        this.endGame(roomCode);
      }
    }
  }

  handlePlayerDisconnect(roomCode: string, playerId: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const module = this.registry.get(room.currentGameId!);
    if (!module) return;

    const newState = module.onPlayerDisconnect(
      room,
      active.gameState,
      playerId
    );

    if (newState) {
      active.gameState = newState;
      this.emitGameState(roomCode, newState);
    }
  }

  private tick(roomCode: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const module = this.registry.get(room.currentGameId!);
    if (!module) return;

    const newState = module.onTick(room, active.gameState, 1000);

    if (newState) {
      active.gameState = newState;
      this.emitGameState(roomCode, newState);

      if (newState.phase === 'ended') {
        this.endGame(roomCode);
      }
    }
  }

  stopGame(roomCode: string): { error?: string } {
    const active = this.activeGames.get(roomCode);
    if (!active) return { error: 'No active game' };
    this.endGame(roomCode);
    return {};
  }

  private endGame(roomCode: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    clearInterval(active.intervalId);

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const module = this.registry.get(room.currentGameId!);
    if (module) {
      module.onEnd(room, active.gameState);
    }

    const finalScores = room.players.map((p) => ({
      playerId: p.id,
      score: p.score,
    }));

    this.io.to(roomCode).emit('game:ended', { finalScores });

    room.status = 'lobby';
    room.currentGameId = null;
    this.activeGames.delete(roomCode);
  }

  private emitGameState(roomCode: string, gameState: GameState): void {
    // Send full state to host
    this.io.to(roomCode).emit('game:state-update', { gameState });

    // Send per-player state to each controller
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    for (const player of room.players) {
      const playerState: GameState = {
        ...gameState,
        playerData: {
          [player.id]: gameState.playerData[player.id] || {},
        },
      };

      // Emit to the player's socket via the room
      // We use the io.sockets to find the player's socket by iterating
      const sockets = this.io.sockets.sockets;
      for (const [, sock] of sockets) {
        if (sock.data.playerId === player.id && sock.data.roomCode === roomCode) {
          sock.emit('game:player-state', { gameState: playerState });
          break;
        }
      }
    }
  }

  isGameActive(roomCode: string): boolean {
    return this.activeGames.has(roomCode);
  }
}
