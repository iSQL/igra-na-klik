import type {
  Room,
  GameState,
  HotPotatoControllerData,
  HotPotatoHostData,
  HotPotatoLeaderboardEntry,
  HotPotatoMode,
  HotPotatoPlayerLite,
} from '@igra/shared';
import { HOT_POTATO_CATEGORIES, shuffled } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import type { HotPotatoInternalState } from './HotPotatoState.js';
import {
  EXPLODED_DURATION,
  FINAL_LEADERBOARD_DURATION,
  INTRO_DURATION,
  MAX_FUSE_MS,
  MIN_FUSE_MS,
} from './HotPotatoState.js';

interface HotPotatoCustomContent {
  hotPotatoMode?: unknown;
}

function pickCategory(): string {
  return HOT_POTATO_CATEGORIES[
    Math.floor(Math.random() * HOT_POTATO_CATEGORIES.length)
  ];
}

function randomFuseMs(): number {
  return MIN_FUSE_MS + Math.floor(Math.random() * (MAX_FUSE_MS - MIN_FUSE_MS));
}

export class HotPotatoModule extends BaseGameModule {
  readonly gameId = 'hot-potato';

  private state!: HotPotatoInternalState;
  private timings: Record<string, number> = {};

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent as HotPotatoCustomContent | undefined) ?? {};
    const mode: HotPotatoMode = cc.hotPotatoMode === 'choose' ? 'choose' : 'sequential';

    const aliveOrder = shuffled(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );

    this.state = {
      phase: 'intro',
      mode,
      phaseTimeRemaining: this.timings.INTRO_DURATION ?? INTRO_DURATION,
      aliveOrder,
      holderIndex: 0,
      bombRemainingMs: 0,
      category: pickCategory(),
      round: 0,
      explodedId: null,
      winnerId: null,
      eliminatedCount: 0,
    };

    return this.buildGameState(room);
  }

  onPlayerAction(
    _room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (action !== 'potato:pass') return null;
    if (this.state.phase !== 'passing') return null;
    if (this.currentHolderId() !== playerId) return null;

    const n = this.state.aliveOrder.length;
    if (n <= 1) return null;

    if (this.state.mode === 'choose') {
      const targetId = typeof data.targetId === 'string' ? data.targetId : null;
      if (!targetId) return null;
      const idx = this.state.aliveOrder.indexOf(targetId);
      if (idx < 0 || idx === this.state.holderIndex) return null;
      this.state.holderIndex = idx;
    } else {
      this.state.holderIndex = (this.state.holderIndex + 1) % n;
    }
    // The fuse is deliberately NOT reset on a pass — the timer keeps running.
    return this.buildGameState(_room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;

    if (this.state.phase === 'passing') {
      this.state.bombRemainingMs -= deltaMs;
      if (this.state.bombRemainingMs <= 0) {
        this.explode(room);
        return this.buildGameState(room);
      }
      // Still ticking, nothing visible changed — let GameManager send a
      // lightweight game:timer (which does nothing here since timeRemaining
      // is 0 during passing, keeping the fuse hidden).
      return null;
    }

    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) this.advancePhase(room);
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    const idx = this.state.aliveOrder.indexOf(playerId);
    if (idx < 0) return this.buildGameState(room);

    this.state.aliveOrder.splice(idx, 1);
    // Keep the holder pointer valid; if the leaver held the bomb, it moves to
    // the next living player (the fuse keeps running).
    if (this.state.aliveOrder.length > 0) {
      this.state.holderIndex =
        this.state.holderIndex % this.state.aliveOrder.length;
    }

    if (this.state.phase === 'passing' && this.state.aliveOrder.length <= 1) {
      this.finishGame(room);
    }
    return this.buildGameState(room);
  }

  // --- Phase machine -----------------------------------------------------

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'intro':
        this.enterPassing();
        break;
      case 'exploded':
        if (this.state.aliveOrder.length <= 1) {
          this.finishGame(room);
        } else {
          this.enterPassing();
        }
        break;
      case 'final-leaderboard':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        break;
    }
  }

  private enterPassing(): void {
    this.state.round += 1;
    this.state.category = pickCategory();
    this.state.bombRemainingMs = randomFuseMs();
    this.state.explodedId = null;
    this.state.phase = 'passing';
    this.state.phaseTimeRemaining = 0;
  }

  private explode(room: Room): void {
    const holderId = this.currentHolderId();
    if (holderId) {
      // Survival-order scoring: earlier out = fewer points.
      const player = room.players.find((p) => p.id === holderId);
      if (player) player.score = this.state.eliminatedCount;
      this.state.eliminatedCount += 1;
      this.state.aliveOrder.splice(this.state.holderIndex, 1);
      if (this.state.aliveOrder.length > 0) {
        this.state.holderIndex =
          this.state.holderIndex % this.state.aliveOrder.length;
      }
      this.state.explodedId = holderId;
    }
    this.state.phase = 'exploded';
    this.state.phaseTimeRemaining =
      this.timings.EXPLODED_DURATION ?? EXPLODED_DURATION;
  }

  private finishGame(room: Room): void {
    const survivorId = this.state.aliveOrder[0] ?? null;
    if (survivorId) {
      const player = room.players.find((p) => p.id === survivorId);
      // Winner outlasted everyone → highest survival-order score.
      if (player) player.score = this.state.eliminatedCount;
    }
    this.state.winnerId = survivorId;
    this.state.phase = 'final-leaderboard';
    this.state.phaseTimeRemaining =
      this.timings.FINAL_LEADERBOARD_DURATION ?? FINAL_LEADERBOARD_DURATION;
  }

  // --- Helpers -----------------------------------------------------------

  private currentHolderId(): string | undefined {
    return this.state.aliveOrder[this.state.holderIndex];
  }

  // --- Build state -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const aliveSet = new Set(this.state.aliveOrder);
    const players: HotPotatoPlayerLite[] = room.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      avatarColor: p.avatarColor,
      avatarEmoji: p.avatarEmoji,
      alive: aliveSet.has(p.id),
    }));

    const hostData: HotPotatoHostData = {
      mode: this.state.mode,
      round: this.state.round,
      aliveCount: this.state.aliveOrder.length,
      players,
    };

    if (this.state.phase === 'intro' || this.state.phase === 'passing') {
      hostData.category = this.state.category;
    }
    if (this.state.phase === 'passing') {
      hostData.holderId = this.currentHolderId();
    }
    if (this.state.phase === 'exploded') {
      hostData.explodedId = this.state.explodedId ?? undefined;
    }
    if (
      this.state.phase === 'final-leaderboard' ||
      this.state.phase === 'ended'
    ) {
      hostData.winnerId = this.state.winnerId ?? undefined;
      hostData.leaderboard = this.buildLeaderboard(room);
    }

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host: hostData,
    };

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const pd: HotPotatoControllerData = {
        eliminated: !aliveSet.has(player.id),
      };
      playerData[player.id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.round,
      totalRounds: 0,
      // Never expose the hidden fuse: only the visible wait phases carry a
      // countdown; passing sends 0.
      timeRemaining:
        this.state.phase === 'passing'
          ? 0
          : Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildLeaderboard(room: Room): HotPotatoLeaderboardEntry[] {
    return room.players
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        score: p.score,
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }
}
