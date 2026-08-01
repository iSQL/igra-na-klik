import type {
  DiplomaCandidate,
  GameState,
  PenaliControllerData,
  PenaliHostData,
  PenaliLeaderboardEntry,
  PenaliPlayerRef,
  PenaliShotResult,
  Room,
} from '@igra/shared';
import {
  clampAim,
  clampGameRounds,
  clampPower,
  isPenaliZone,
  resolveShot,
  shuffled,
  timeoutShot,
  TIMEOUT_ZONE,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import type { PenaliInternalState, PenaliTurn } from './PenaliState.js';
import {
  AIMING_DURATION,
  INTRO_DURATION,
  LEADERBOARD_DURATION,
  SHOT_DURATION,
  emptyStats,
} from './PenaliState.js';

/**
 * Penali — duel-rotation penalty shootout.
 *
 * Anti-leak rule for this module: during `aiming`, neither the shooter's aim
 * nor the keeper's corner may appear in the broadcast `data` — the whole game
 * is the blind guess. Only commitment booleans are public until the shot is
 * resolved, at which point everything is published at once for the replay.
 */
export class PenaliModule extends BaseGameModule {
  readonly gameId = 'penali';

  private state!: PenaliInternalState;
  private timings: Record<string, number> = {};

  validateStart(room: Room): string | null {
    const connected = room.players.filter((p) => p.isConnected).length;
    if (connected < 2) return 'Za penale trebaju bar 2 igrača.';
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const order = shuffled(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );
    this.state = {
      phase: 'intro',
      phaseTimeRemaining: this.timings.INTRO_DURATION ?? INTRO_DURATION,
      currentRound: 1,
      totalRounds: clampGameRounds(
        this.gameId,
        (customContent as { roundCount?: unknown } | undefined)?.roundCount
      ),
      order,
      turnIndex: 0,
      turn: this.makeTurn(order, 0),
      stats: new Map(order.map((id) => [id, emptyStats()])),
    };
    return this.buildGameState(room);
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'aiming') return null;
    const turn = this.state.turn;

    if (action === 'penali:shoot') {
      if (playerId !== turn.shooterId || turn.aim !== null) return null;
      const aim = clampAim(data.aim);
      if (!aim) return null;
      turn.aim = aim;
      turn.power = clampPower(data.power);
    } else if (action === 'penali:dive') {
      if (playerId !== turn.keeperId || turn.zone !== null) return null;
      if (!isPenaliZone(data.zone)) return null;
      turn.zone = data.zone;
    } else {
      return null;
    }

    // Both committed — no reason to burn the rest of the clock.
    if (turn.aim !== null && turn.zone !== null) this.resolveTurn(room);
    return this.buildGameState(room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining > 0) return this.buildGameState(room);

    switch (this.state.phase) {
      case 'intro':
        this.state.phase = 'aiming';
        this.state.phaseTimeRemaining = AIMING_DURATION;
        break;
      case 'aiming':
        this.resolveTurn(room);
        break;
      case 'shot':
        this.advanceTurn();
        break;
      case 'leaderboard':
        this.startNextRoundOrEnd();
        break;
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // Fired only once the reconnect grace has expired, so the seat is really
    // gone — drop it from the rotation and keep the shootout moving.
    const idx = this.state.order.indexOf(playerId);
    if (idx === -1) return null;

    const wasInTurn =
      this.state.turn.shooterId === playerId ||
      this.state.turn.keeperId === playerId;

    this.state.order.splice(idx, 1);
    if (idx < this.state.turnIndex) this.state.turnIndex -= 1;

    if (this.state.order.length < 2) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return this.buildGameState(room);
    }

    // A duel can't continue with a missing half. Rebuild the turn at the SAME
    // index rather than advancing: after the splice, order[turnIndex] is
    // already the next player up, so incrementing would skip someone's shot.
    if (wasInTurn && (this.state.phase === 'intro' || this.state.phase === 'aiming')) {
      this.restartCurrentTurn();
    }
    return this.buildGameState(room);
  }

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.state.stats.entries()]
      .filter(([id]) => room.players.some((p) => p.id === id))
      .map(([id, s]) => ({ id, s }));
    if (entries.length === 0) return candidates;

    const best = <T>(
      list: T[],
      value: (item: T) => number,
      minimum: number
    ): T | null => {
      const top = list.reduce((a, b) => (value(b) > value(a) ? b : a));
      return value(top) >= minimum ? top : null;
    };

    const keeper = best(entries, (e) => e.s.saves, 2);
    if (keeper) {
      candidates.push({
        playerId: keeper.id,
        awardId: 'zlatna-rukavica',
        priority: 70,
        subtitle: `${keeper.s.saves} odbrana`,
      });
    }

    const sniper = best(entries, (e) => e.s.cornerGoals, 2);
    if (sniper) {
      candidates.push({
        playerId: sniper.id,
        awardId: 'snajperista',
        priority: 62,
        subtitle: `${sniper.s.cornerGoals} gola u ćošak`,
      });
    }

    const wild = best(entries, (e) => e.s.misses, 2);
    if (wild) {
      candidates.push({
        playerId: wild.id,
        awardId: 'u-tribine',
        priority: 56,
        subtitle: `${wild.s.misses} puta preko gola`,
      });
    }

    // Only shame a keeper who actually stood there doing nothing.
    const statue = best(entries, (e) => e.s.frozen, 2);
    if (statue) {
      candidates.push({
        playerId: statue.id,
        awardId: 'statue-of-liberty',
        priority: 52,
        subtitle: `${statue.s.frozen} puta nije ni krenuo`,
      });
    }

    return candidates;
  }

  // --- Turn flow -----------------------------------------------------------

  private makeTurn(order: string[], turnIndex: number): PenaliTurn {
    return {
      shooterId: order[turnIndex] ?? '',
      keeperId: order[(turnIndex + 1) % Math.max(1, order.length)] ?? '',
      aim: null,
      power: null,
      zone: null,
      result: null,
    };
  }

  private statsFor(playerId: string) {
    let s = this.state.stats.get(playerId);
    if (!s) {
      s = emptyStats();
      this.state.stats.set(playerId, s);
    }
    return s;
  }

  private resolveTurn(room: Room): void {
    const turn = this.state.turn;
    const shooterTimedOut = turn.aim === null;
    const keeperTimedOut = turn.zone === null;

    const auto = timeoutShot();
    const aim = turn.aim ?? auto.aim;
    const power = turn.power ?? auto.power;
    const zone = turn.zone ?? TIMEOUT_ZONE;
    const resolved = resolveShot(aim, power, zone);

    // A keeper who never picked a corner doesn't get paid for standing in the
    // right place — otherwise sitting out the phase is a viable strategy.
    const keeperPoints = keeperTimedOut ? 0 : resolved.keeperPoints;

    const shooter = room.players.find((p) => p.id === turn.shooterId);
    const keeper = room.players.find((p) => p.id === turn.keeperId);
    if (shooter) shooter.score += resolved.shooterPoints;
    if (keeper) keeper.score += keeperPoints;

    const shooterStats = this.statsFor(turn.shooterId);
    shooterStats.shots += 1;
    if (resolved.outcome === 'gol') {
      shooterStats.goals += 1;
      if (resolved.shooterPoints > 100) shooterStats.cornerGoals += 1;
    } else if (resolved.outcome === 'promasaj') {
      shooterStats.misses += 1;
    }

    const keeperStats = this.statsFor(turn.keeperId);
    keeperStats.keptTurns += 1;
    if (resolved.outcome === 'odbrana') keeperStats.saves += 1;
    if (keeperTimedOut) keeperStats.frozen += 1;

    turn.aim = aim;
    turn.power = power;
    turn.zone = zone;
    turn.result = {
      shooter: this.playerRef(room, turn.shooterId),
      keeper: this.playerRef(room, turn.keeperId),
      aim,
      landing: resolved.landing,
      power,
      keeperZone: zone,
      outcome: resolved.outcome,
      shooterPoints: resolved.shooterPoints,
      keeperPoints,
      shooterTimedOut,
      keeperTimedOut,
    };

    this.state.phase = 'shot';
    this.state.phaseTimeRemaining = this.timings.SHOT_DURATION ?? SHOT_DURATION;
  }

  /** Re-deal the current turn in place (used when a duellist is removed). */
  private restartCurrentTurn(): void {
    if (this.state.order.length < 2) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }
    if (this.state.turnIndex >= this.state.order.length) {
      this.state.phase = 'leaderboard';
      this.state.phaseTimeRemaining =
        this.timings.LEADERBOARD_DURATION ?? LEADERBOARD_DURATION;
      return;
    }
    this.state.turn = this.makeTurn(this.state.order, this.state.turnIndex);
    this.state.phase = 'intro';
    this.state.phaseTimeRemaining = this.timings.INTRO_DURATION ?? INTRO_DURATION;
  }

  private advanceTurn(): void {
    if (this.state.order.length < 2) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }

    this.state.turnIndex += 1;
    if (this.state.turnIndex >= this.state.order.length) {
      // Everyone has shot once — show the table before the next round.
      this.state.phase = 'leaderboard';
      this.state.phaseTimeRemaining =
        this.timings.LEADERBOARD_DURATION ?? LEADERBOARD_DURATION;
      return;
    }

    this.state.turn = this.makeTurn(this.state.order, this.state.turnIndex);
    this.state.phase = 'intro';
    this.state.phaseTimeRemaining = this.timings.INTRO_DURATION ?? INTRO_DURATION;
  }

  private startNextRoundOrEnd(): void {
    if (this.state.currentRound >= this.state.totalRounds) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }
    this.state.currentRound += 1;
    this.state.turnIndex = 0;
    this.state.turn = this.makeTurn(this.state.order, 0);
    this.state.phase = 'intro';
    this.state.phaseTimeRemaining = this.timings.INTRO_DURATION ?? INTRO_DURATION;
  }

  // --- Build state ---------------------------------------------------------

  private playerRef(room: Room, playerId: string): PenaliPlayerRef {
    const p = room.players.find((pl) => pl.id === playerId);
    return {
      playerId,
      name: p?.name ?? '?',
      avatarColor: p?.avatarColor ?? '#888888',
      avatarEmoji: p?.avatarEmoji ?? '👤',
    };
  }

  private buildGameState(room: Room): GameState {
    const turn = this.state.turn;
    const hostData: PenaliHostData = {
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      turnInRound: Math.min(this.state.turnIndex + 1, this.state.order.length),
      turnsInRound: this.state.order.length,
      shooter: this.playerRef(room, turn.shooterId),
      keeper: this.playerRef(room, turn.keeperId),
    };

    if (this.state.phase === 'aiming') {
      // Commitment only — the choices themselves stay server-side until the
      // shot is resolved, or the phone opposite could read the answer.
      hostData.shooterCommitted = turn.aim !== null;
      hostData.keeperCommitted = turn.zone !== null;
    }

    if (this.state.phase === 'shot' && turn.result) {
      hostData.shot = turn.result;
    }

    if (this.state.phase === 'leaderboard' || this.state.phase === 'ended') {
      hostData.leaderboard = this.buildLeaderboard(room);
    }

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      playerData[player.id] = this.buildControllerData(
        room,
        player.id,
        turn.result
      ) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data: { phase: this.state.phase, host: hostData },
      playerData,
    };
  }

  private buildControllerData(
    room: Room,
    playerId: string,
    result: PenaliShotResult | null
  ): PenaliControllerData {
    const turn = this.state.turn;
    const role =
      playerId === turn.shooterId
        ? 'shooter'
        : playerId === turn.keeperId
          ? 'keeper'
          : 'spectator';

    const pd: PenaliControllerData = { role };
    pd.score = room.players.find((p) => p.id === playerId)?.score ?? 0;

    if (this.state.phase === 'aiming') {
      if (role === 'shooter') {
        pd.committed = turn.aim !== null;
        if (turn.aim) {
          pd.ownAim = turn.aim;
          pd.ownPower = turn.power ?? undefined;
        }
      } else if (role === 'keeper') {
        pd.committed = turn.zone !== null;
        if (turn.zone) pd.ownZone = turn.zone;
      }
    }

    if (this.state.phase === 'shot' && result) {
      if (role === 'shooter') pd.ownShotPoints = result.shooterPoints;
      if (role === 'keeper') pd.ownShotPoints = result.keeperPoints;
    }

    return pd;
  }

  private buildLeaderboard(room: Room): PenaliLeaderboardEntry[] {
    return room.players
      .map((p) => {
        const s = this.state.stats.get(p.id);
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          avatarEmoji: p.avatarEmoji,
          score: p.score,
          rank: 0,
          goals: s?.goals ?? 0,
          saves: s?.saves ?? 0,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }
}
