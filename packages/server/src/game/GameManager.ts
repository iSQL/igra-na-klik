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
// Broadcast-safe copy: shared data stays, per-player private data goes.
function stripPlayerData(gameState: GameState): GameState {
  return { ...gameState, playerData: {} };
}

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
      if (room.hostless && !definition.supportsHostless) {
        return { error: 'Ova igra zahteva TV ekran.' };
      }
      const connectedPlayers = room.players.filter((p) => p.isConnected);
      if (connectedPlayers.length < definition.minPlayers) {
        return { error: `Need at least ${definition.minPlayers} players` };
      }
    }

    if (module.validateStart) {
      const err = module.validateStart(room, customContent);
      if (err) return { error: err };
    }

    room.status = 'in-game';
    room.currentGameId = gameId;

    // Lobby chat is pre-game only — drop the history when a game starts.
    this.roomManager.clearChat(room.code);

    // Each game is its own match — start everyone at zero so the
    // previous game's totals don't bleed into the new leaderboard.
    for (const player of room.players) {
      player.score = 0;
    }

    const gameState = module.onStart(room, customContent);
    // Broadcast game:started without per-player private data (controllers
    // get their own slice via game:player-state right after; host sockets
    // are excluded from the stripped broadcast and get the full state).
    // Order matters: game:started first so the controller's GameRouter is
    // mounted before player-state lands.
    const hostIds = this.hostSocketIds(roomCode);
    this.io
      .to(roomCode)
      .except(hostIds)
      .emit('game:started', { gameId, gameState: stripPlayerData(gameState) });
    for (const id of hostIds) {
      this.io.sockets.sockets
        .get(id)
        ?.emit('game:started', { gameId, gameState });
    }
    this.emitGameState(roomCode, gameState);

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
      return;
    }

    // Private-only path: the module mutated state for one player and asked
    // us not to broadcast (e.g. slepi-telefoni private drawing drafts).
    const pending = module.getPendingPrivateUpdate?.();
    if (pending) {
      active.gameState = pending.gameState;
      this.emitPlayerState(roomCode, pending.playerId, pending.gameState);
    }
  }

  handleHostAction(
    roomCode: string,
    action: string,
    data: Record<string, unknown>
  ): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const module = this.registry.get(room.currentGameId!);
    if (!module || !module.onHostAction) return;

    const newState = module.onHostAction(
      room,
      active.gameState,
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
    // Room-wide broadcast carries the shared/"host view" data but no
    // per-player private data — a curious player could otherwise read
    // other players' secrets (e.g. the drawer's word choices) off the
    // wire. Controllers get their own slice via game:player-state below;
    // host sockets are excluded here and receive only the full state, so
    // the TV never renders a transient stripped frame.
    const hostIds = this.hostSocketIds(roomCode);
    this.io.to(roomCode).except(hostIds).emit('game:state-update', {
      gameState: stripPlayerData(gameState),
    });
    for (const id of hostIds) {
      this.io.sockets.sockets.get(id)?.emit('game:state-update', { gameState });
    }

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

  // The host socket id stored on the room can go stale across socket.io
  // reconnects, so find host sockets by their socket data instead.
  private hostSocketIds(roomCode: string): string[] {
    const ids: string[] = [];
    for (const [id, sock] of this.io.sockets.sockets) {
      if (sock.data.isHost && sock.data.roomCode === roomCode) ids.push(id);
    }
    return ids;
  }

  private emitPlayerState(
    roomCode: string,
    playerId: string,
    gameState: GameState
  ): void {
    const playerState: GameState = {
      ...gameState,
      playerData: {
        [playerId]: gameState.playerData[playerId] || {},
      },
    };
    for (const [, sock] of this.io.sockets.sockets) {
      if (sock.data.playerId === playerId && sock.data.roomCode === roomCode) {
        sock.emit('game:player-state', { gameState: playerState });
        return;
      }
    }
  }

  /**
   * Replays the current game state to a single reconnecting player so
   * their UI rehydrates to the active phase instead of staying on the
   * lobby. Sends the per-player filtered state (only that player's
   * private data) plus a `game:started` so the controller's GameRouter
   * mounts the right component.
   */
  replayStateToPlayer(
    roomCode: string,
    playerId: string,
    socketId: string
  ): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    const sock = this.io.sockets.sockets.get(socketId);
    if (!sock) return;

    const playerState: GameState = {
      ...active.gameState,
      playerData: {
        [playerId]: active.gameState.playerData[playerId] || {},
      },
    };

    sock.emit('game:started', {
      gameId: active.gameState.gameId,
      gameState: playerState,
    });
    sock.emit('game:player-state', { gameState: playerState });
  }
}
