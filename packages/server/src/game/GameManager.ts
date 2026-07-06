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
import type { IGameModule } from './IGameModule.js';
import { hostRoom, playerRoom } from '../socket/rooms.js';

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

// Content signature used to skip re-broadcasting a state whose only change
// since the last emit is the countdown. timeRemaining is zeroed out so a
// pure clock tick compares equal; any real change (phase, scores, answers,
// drawings, playerData) produces a different string.
function stateSignature(gameState: GameState): string {
  return JSON.stringify({ ...gameState, timeRemaining: 0 });
}

interface ActiveGame {
  module: IGameModule;
  gameState: GameState;
  intervalId: ReturnType<typeof setInterval>;
  lastSignature: string;
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

    // Fresh module instance per game: modules keep their mutable state on
    // the instance, so sharing one across rooms would let two rooms playing
    // the same game corrupt each other.
    const module = this.registry.create(gameId);
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
    const hosts = hostRoom(roomCode);
    this.io
      .to(roomCode)
      .except(hosts)
      .emit('game:started', { gameId, gameState: stripPlayerData(gameState) });
    this.io.to(hosts).emit('game:started', { gameId, gameState });

    const intervalId = setInterval(() => {
      this.tick(roomCode);
    }, 1000);

    this.activeGames.set(roomCode, {
      module,
      gameState,
      intervalId,
      lastSignature: '',
    });
    this.emitGameState(roomCode, gameState);

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

    const newState = active.module.onPlayerAction(
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

    // Append-only path: the module added drawing ops and asked us to
    // broadcast just those instead of the whole state (whose operations
    // array re-sends every stroke drawn so far on every 50ms batch).
    const ops = active.module.getPendingOpsAppend?.();
    if (ops && ops.length > 0) {
      this.io
        .to(roomCode)
        .emit('game:ops-append', { gameId: active.gameState.gameId, ops });
    }

    // Private-only path: the module mutated state for one player and asked
    // us not to broadcast (e.g. slepi-telefoni private drawing drafts).
    const pending = active.module.getPendingPrivateUpdate?.();
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

    if (!active.module.onHostAction) return;

    const newState = active.module.onHostAction(
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

    const newState = active.module.onPlayerDisconnect(
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

    const newState = active.module.onTick(room, active.gameState, 1000);

    if (!newState) {
      // Module says nothing (or nothing but its internal clock) changed.
      // Keep the cached countdown in step and send a lightweight timer
      // tick instead of a full state broadcast.
      this.emitTimerTick(roomCode, active);
      return;
    }

    active.gameState = newState;

    if (newState.phase === 'ended') {
      this.emitGameState(roomCode, newState);
      this.endGame(roomCode);
      return;
    }

    // Most ticks only move the countdown — comparing content signatures
    // lets those go out as a tiny game:timer event instead of re-sending
    // the entire state (with drawings/results/etc.) every second.
    const sig = stateSignature(newState);
    if (sig === active.lastSignature) {
      this.io
        .to(roomCode)
        .emit('game:timer', { timeRemaining: newState.timeRemaining });
      return;
    }

    this.emitGameState(roomCode, newState);
  }

  private emitTimerTick(roomCode: string, active: ActiveGame): void {
    if (active.gameState.timeRemaining <= 0) return;
    active.gameState.timeRemaining -= 1;
    this.io
      .to(roomCode)
      .emit('game:timer', { timeRemaining: active.gameState.timeRemaining });
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

    active.module.onEnd(room, active.gameState);

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
    const active = this.activeGames.get(roomCode);
    if (active) active.lastSignature = stateSignature(gameState);

    // Room-wide broadcast carries the shared/"host view" data but no
    // per-player private data — a curious player could otherwise read
    // other players' secrets (e.g. the drawer's word choices) off the
    // wire. Controllers get their own slice via game:player-state below;
    // host sockets are excluded here and receive only the full state, so
    // the TV never renders a transient stripped frame.
    const hosts = hostRoom(roomCode);
    this.io.to(roomCode).except(hosts).emit('game:state-update', {
      gameState: stripPlayerData(gameState),
    });
    this.io.to(hosts).emit('game:state-update', { gameState });

    // Send each player only their own private slice. The shared data is
    // already on its way via the room broadcast above — repeating it here
    // used to double every state emit on the wire.
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    for (const player of room.players) {
      this.io.to(playerRoom(player.id)).emit('game:player-state', {
        playerData: { [player.id]: gameState.playerData[player.id] || {} },
      });
    }
  }

  isGameActive(roomCode: string): boolean {
    return this.activeGames.has(roomCode);
  }

  private emitPlayerState(
    roomCode: string,
    playerId: string,
    gameState: GameState
  ): void {
    void roomCode;
    this.io.to(playerRoom(playerId)).emit('game:player-state', {
      playerData: { [playerId]: gameState.playerData[playerId] || {} },
    });
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
    sock.emit('game:player-state', { playerData: playerState.playerData });
  }
}
