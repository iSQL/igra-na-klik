import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  GameState,
  GameFlowState,
  Room,
} from '@igra/shared';
import { GAME_DEFINITIONS, genericScoreCandidates, allocateDiplomas } from '@igra/shared';
import { RoomManager } from '../room/RoomManager.js';
import { GameRegistry } from './GameRegistry.js';
import type { IGameModule } from './IGameModule.js';
import { hostRoom, playerRoom } from '../socket/rooms.js';
import { logger } from '../logger.js';

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
  gameId: string;
  startedAt: number;
  /** This module's tick interval (1s for everything but fast-tick games). */
  tickMs: number;
  /** Sub-second remainder, so a fast tick still emits one game:timer per second. */
  timerAccumMs: number;
  /** Wall clock of the previous tick — only consulted by fast-tick modules. */
  lastTickAt: number;
  // --- Platform flow (see GameFlowState) ---
  /** No ticks and no player/host actions while true (including the 3-2-1). */
  paused: boolean;
  pausedAt: number;
  pausedBy: string | null;
  resumeCountdown: 3 | 2 | 1 | null;
  resumeTimer: ReturnType<typeof setTimeout> | null;
  /** "Ne čekaj ga" — re-applied each phase until the player acts or returns. */
  notWaiting: Set<string>;
  lastFlowSignature: string;
}

/** Player actions still accepted while a game is paused. */
const PAUSE_ALLOWED_ACTIONS = new Set(['quiz:feedback']);

export interface StopOptions {
  /** false = "Bez rezultata": clients skip the standings. */
  showResults?: boolean;
}

export class GameManager {
  private activeGames = new Map<string, ActiveGame>();
  /** Last successful start per room — `restartGame` replays it. */
  private lastStarts = new Map<string, { gameId: string; customContent?: unknown }>();
  /** Called once a room is back in the lobby after a game (knock seating). */
  onGameEnded: ((roomCode: string) => void) | null = null;

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

    const reject = (reason: string): { error: string } => {
      logger.warn('game_start_rejected', { room: roomCode, game: gameId, reason });
      return { error: reason };
    };

    const definition = GAME_DEFINITIONS[gameId];
    if (definition) {
      if (room.hostless && !definition.supportsHostless) {
        return reject('Ova igra zahteva TV ekran.');
      }
      const connectedPlayers = room.players.filter((p) => p.isConnected);
      // Dev convenience: let Kviz run solo so a single browser tab can exercise
      // the whole flow. Production keeps the real minimum.
      const devSolo =
        process.env.NODE_ENV !== 'production' && gameId === 'quiz';
      const minPlayers = devSolo ? 1 : definition.minPlayers;
      if (connectedPlayers.length < minPlayers) {
        return reject(`Need at least ${minPlayers} players`);
      }
    }

    if (module.validateStart) {
      const err = module.validateStart(room, customContent);
      if (err) return reject(err);
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

    // Turn-based games keep the 1s platform tick; a continuous-input game
    // asks for its own (see IGameModule.tickIntervalMs).
    const tickMs = module.tickIntervalMs ?? 1000;
    const intervalId = setInterval(() => {
      this.tick(roomCode);
    }, tickMs);

    this.activeGames.set(roomCode, {
      module,
      gameState,
      intervalId,
      lastSignature: '',
      gameId,
      startedAt: Date.now(),
      tickMs,
      timerAccumMs: 0,
      lastTickAt: Date.now(),
      paused: false,
      pausedAt: 0,
      pausedBy: null,
      resumeCountdown: null,
      resumeTimer: null,
      notWaiting: new Set(),
      lastFlowSignature: '',
    });
    this.lastStarts.set(roomCode, { gameId, customContent });
    this.emitGameState(roomCode, gameState);

    logger.info('game_started', {
      room: roomCode,
      game: gameId,
      players: room.players.filter((p) => p.isConnected).length,
      hostless: room.hostless,
    });

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

    if (active.paused && !PAUSE_ALLOWED_ACTIONS.has(action)) return;
    // Acting at all means they're back — wait for them again from now on.
    active.notWaiting.delete(playerId);

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
    this.syncFlow(roomCode);
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
    if (active.paused) return;

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

      // Modul sme da završi igru i odavde (npr. u bici ode pretposlednji
      // igrač) — bez ove provere bi `onTick` do kraja vraćao null i igra se
      // nikad ne bi formalno završila.
      if (newState.phase === 'ended') {
        this.endGame(roomCode);
      }
    }
  }

  private tick(roomCode: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    // Paused: the module's clocks stand still because it simply isn't ticked.
    // `resume` resets lastTickAt so a fast-tick module gets no jump either.
    if (active.paused) return;

    // A ~33ms setInterval never fires at exactly 33ms, and a simulation that
    // integrates the nominal step while the clock runs faster plays in slow
    // motion. Fast-tick modules therefore get the REAL elapsed time, capped so
    // a stalled event loop can't teleport bodies through each other. The 1s
    // path keeps its exact 1000 — eighteen existing games assume it.
    const now = Date.now();
    const deltaMs = active.module.tickIntervalMs
      ? Math.min(100, Math.max(1, now - active.lastTickAt))
      : active.tickMs;
    active.lastTickAt = now;

    const newState = active.module.onTick(room, active.gameState, deltaMs);

    // Delta path for fast-tick games: a compact positional frame instead of a
    // full state broadcast. Emitted before the state below so a frame and the
    // phase change it caused arrive in simulation order.
    const frame = active.module.getPendingFrame?.();
    if (frame) {
      this.io
        .to(roomCode)
        .emit('game:frame', { gameId: active.gameId, frame });
    }

    if (!newState) {
      // Module says nothing (or nothing but its internal clock) changed.
      // Keep the cached countdown in step and send a lightweight timer
      // tick instead of a full state broadcast — once per whole second, no
      // matter how fast this module's tick runs.
      active.timerAccumMs += deltaMs;
      if (active.timerAccumMs >= 1000) {
        active.timerAccumMs -= 1000;
        this.emitTimerTick(roomCode, active);
      }
      return;
    }

    active.timerAccumMs = 0;
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

  /**
   * End the running game on request. `opts` comes from the host's "Završi
   * igru" sheet: with it the clients learn the game was cut short (and how
   * far it got); without it (room teardown) it ends like a normal finish.
   */
  stopGame(roomCode: string, opts?: StopOptions): { error?: string } {
    const active = this.activeGames.get(roomCode);
    if (!active) return { error: 'No active game' };
    this.endGame(
      roomCode,
      opts
        ? {
            stoppedEarly: {
              round: active.gameState.round,
              totalRounds: active.gameState.totalRounds,
            },
            skipResults: opts.showResults === false,
          }
        : undefined
    );
    return {};
  }

  /**
   * Same game, same settings, with or without tutorial mode — the tutorial's
   * "Igraj pravu partiju" / "Još jedna proba". A running game ends silently
   * first.
   */
  restartGame(roomCode: string, tutorial: boolean): { error?: string } {
    const last = this.lastStarts.get(roomCode);
    if (!last) return { error: 'Nema igre za ponovno pokretanje.' };
    if (this.activeGames.has(roomCode)) {
      this.endGame(roomCode, { skipResults: true });
    }
    const content =
      last.customContent && typeof last.customContent === 'object'
        ? {
            ...(last.customContent as Record<string, unknown>),
            gluvoDobaTutorial: tutorial,
            boljiZivotTutorial: tutorial,
            spijunTutorial: tutorial,
          }
        : last.customContent;
    return this.startGame(roomCode, last.gameId, content);
  }

  /** Room is gone — drop what restartGame remembered for it. */
  forgetRoom(roomCode: string): void {
    this.lastStarts.delete(roomCode);
  }

  // --- Flow controls (host:flow-action) ---------------------------------

  pause(roomCode: string, pausedBy: string | null): void {
    const active = this.activeGames.get(roomCode);
    if (!active || active.paused) return;
    active.paused = true;
    active.pausedAt = Date.now();
    active.pausedBy = pausedBy;
    logger.info('game_paused', { room: roomCode, game: active.gameId });
    this.syncFlow(roomCode);
  }

  /** 3-2-1 on every screen, then the clocks run again. */
  resume(roomCode: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active || !active.paused || active.resumeTimer) return;
    const step = (n: 3 | 2 | 1 | null) => {
      if (this.activeGames.get(roomCode) !== active) return;
      if (n === null) {
        const now = Date.now();
        active.resumeTimer = null;
        active.resumeCountdown = null;
        active.paused = false;
        active.pausedBy = null;
        active.lastTickAt = now;
        active.timerAccumMs = 0;
        active.module.onResume?.(now - active.pausedAt);
        this.syncFlow(roomCode);
        return;
      }
      active.resumeCountdown = n;
      this.syncFlow(roomCode);
      active.resumeTimer = setTimeout(
        () => step(n === 3 ? 2 : n === 2 ? 1 : null),
        1000
      );
    };
    step(3);
  }

  /** Close the current phase as if its clock ran out. */
  skip(roomCode: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active || active.paused || !active.module.onHostSkip) return;
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;
    const newState = active.module.onHostSkip(room, active.gameState);
    if (!newState) return;
    active.gameState = newState;
    this.emitGameState(roomCode, newState);
    if (newState.phase === 'ended') this.endGame(roomCode);
  }

  /** "Ne čekaj ga" — until the player acts or reconnects. */
  stopWaiting(roomCode: string, playerId: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active || active.paused || !active.module.onStopWaiting) return;
    const room = this.roomManager.getRoom(roomCode);
    if (!room || !room.players.some((p) => p.id === playerId)) return;
    active.notWaiting.add(playerId);
    const newState = active.module.onStopWaiting(room, active.gameState, playerId);
    if (newState) {
      active.gameState = newState;
      this.emitGameState(roomCode, newState);
      if (newState.phase === 'ended') this.endGame(roomCode);
      return;
    }
    this.syncFlow(roomCode);
  }

  private buildFlow(active: ActiveGame, room: Room): GameFlowState {
    const info = active.module.getFlowInfo?.(room, active.gameState) ?? null;
    return {
      paused: active.paused,
      pausedBy: active.pausedBy,
      resumeCountdown: active.resumeCountdown,
      collection: info?.collection ?? null,
      skipLabel: active.module.onHostSkip ? (info?.skipLabel ?? null) : null,
      notWaitingIds: [...active.notWaiting],
      canStopWaiting: !!active.module.onStopWaiting,
      offlineSince: Object.fromEntries(
        room.players
          .filter((p) => !p.isConnected && p.disconnectedAt)
          .map((p) => [p.id, p.disconnectedAt as number])
      ),
      serverNow: Date.now(),
      round: active.gameState.round,
      totalRounds: active.gameState.totalRounds,
    };
  }

  /**
   * Re-apply "ne čekaj ga" to a freshly snapshotted phase, then broadcast the
   * flow if it changed. Called after every emitted state and every action.
   */
  private syncFlow(roomCode: string): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    if (active.notWaiting.size > 0 && !active.paused && active.module.onStopWaiting) {
      const c = active.module.getFlowInfo?.(room, active.gameState)?.collection;
      if (c?.doneIds) {
        const done = new Set(c.doneIds);
        for (const id of active.notWaiting) {
          if (!c.expectedIds.includes(id) || done.has(id)) continue;
          const newState = active.module.onStopWaiting(room, active.gameState, id);
          if (newState) {
            // emitGameState re-enters syncFlow; the module dropped `id` from
            // its snapshot, so the recursion ends.
            active.gameState = newState;
            this.emitGameState(roomCode, newState);
            if (newState.phase === 'ended') this.endGame(roomCode);
            return;
          }
        }
      }
    }

    const flow = this.buildFlow(active, room);
    // serverNow moves every call — keep it out of the change check.
    const sig = JSON.stringify({ ...flow, serverNow: 0 });
    if (sig === active.lastFlowSignature) return;
    active.lastFlowSignature = sig;
    this.io.to(roomCode).emit('game:flow', { flow });
  }

  private endGame(
    roomCode: string,
    extra?: {
      stoppedEarly?: { round: number; totalRounds: number };
      skipResults?: boolean;
    }
  ): void {
    const active = this.activeGames.get(roomCode);
    if (!active) return;

    clearInterval(active.intervalId);
    if (active.resumeTimer) clearTimeout(active.resumeTimer);

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    active.module.onEnd(room, active.gameState);

    const finalScores = room.players.map((p) => ({
      playerId: p.id,
      score: p.score,
    }));

    // Utešne diplome: generic score-based candidates (every game) merged with
    // any rich per-game candidates. Skipped when scores don't rank players
    // (team games tie everyone) — genericScoreCandidates returns [] there and
    // the winner-protection set is empty, so no misleading "Šampion" is handed
    // out.
    const lowerScoreWins = !!GAME_DEFINITIONS[active.gameId]?.lowerScoreWins;
    const genericCandidates = genericScoreCandidates(finalScores, lowerScoreWins);
    let awards: ReturnType<typeof allocateDiplomas> | undefined;
    if (genericCandidates.length > 0) {
      const richCandidates = active.module.getAwardCandidates?.(room) ?? [];
      const winners = genericCandidates
        .filter((c) => c.awardId === 'sampion')
        .map((c) => c.playerId);
      awards = allocateDiplomas(
        [...richCandidates, ...genericCandidates],
        room.players.map((p) => p.id),
        { positiveOnlyPlayerIds: winners }
      );
    }

    this.io.to(roomCode).emit('game:ended', {
      finalScores,
      awards,
      ...(extra?.stoppedEarly ? { stoppedEarly: extra.stoppedEarly } : {}),
      ...(extra?.skipResults ? { skipResults: true } : {}),
    });

    logger.info('game_ended', {
      room: roomCode,
      game: active.gameId,
      players: room.players.length,
      durationSec: Math.round((Date.now() - active.startedAt) / 1000),
      topScore: finalScores.reduce((max, s) => Math.max(max, s.score), 0),
      stoppedEarly: !!extra?.stoppedEarly,
    });

    this.roomManager.markPlayed(roomCode, active.gameId);
    room.status = 'lobby';
    room.currentGameId = null;
    this.activeGames.delete(roomCode);
    this.onGameEnded?.(roomCode);
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

    // The flow trails the state it describes (and may itself re-emit).
    this.syncFlow(roomCode);
  }

  /** Current full state (with playerData) — server-side use only. */
  getGameState(roomCode: string): GameState | undefined {
    return this.activeGames.get(roomCode)?.gameState;
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
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

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

    // Back in the room — wait for them again, and hand them the flow (a
    // returning phone must see the pause overlay too).
    active.notWaiting.delete(playerId);
    this.syncFlow(roomCode);
    sock.emit('game:flow', { flow: this.buildFlow(active, room) });
  }
}
