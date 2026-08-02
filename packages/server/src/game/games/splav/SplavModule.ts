import type {
  DiplomaCandidate,
  GameState,
  Room,
  SplavBoardEntry,
  SplavControllerData,
  SplavElimReason,
  SplavFrame,
  SplavHostData,
  SplavPlayerRef,
  SplavRoundEntry,
} from '@igra/shared';
import {
  clampGameRounds,
  clampSplavInput,
  shuffled,
  splavArenaCenter,
  splavArenaRadius,
  splavSpawn,
  splavSurvivalPoints,
  SPLAV_ELIM_POINTS,
  SPLAV_FRAME_INTERVAL_MS,
  SPLAV_ROUND_MAX_MS,
  SPLAV_TICK_MS,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import {
  createBody,
  dashCooldownProgress,
  isDashing,
  startDash,
  stepSimulation,
  type SplavBody,
} from './physics.js';
import {
  INTRO_DURATION,
  LEADERBOARD_DURATION,
  RUNDA_GOTOVA_DURATION,
  emptyStats,
  type SplavInternalState,
  type SplavStats,
} from './SplavState.js';

/** Wire rounding — three decimals of an arena unit is well under a pixel on any TV. */
function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Splav — sumo on a shrinking raft, and the platform's first continuous-input
 * game.
 *
 * Two rules make it different from every other module here:
 *
 * 1. It runs on a ~25ms tick (`tickIntervalMs`) instead of the platform's 1s
 *    one, and publishes positions as compact `game:frame` deltas via
 *    `getPendingFrame`. Full `GameState` broadcasts are reserved for things
 *    that actually change — a phase, an elimination, the clock ticking over a
 *    second — never for movement.
 * 2. `onPlayerAction` ALWAYS returns null. Joystick and dash mutate the
 *    simulation and are answered by the next frame; returning state there
 *    would fire a full broadcast per input, times eight phones.
 */
export class SplavModule extends BaseGameModule {
  readonly gameId = 'splav';
  readonly tickIntervalMs = SPLAV_TICK_MS;

  private state!: SplavInternalState;
  private timings: Record<string, number> = {};

  validateStart(room: Room): string | null {
    const connected = room.players.filter((p) => p.isConnected).length;
    if (connected < 2) return 'Za Splav trebaju bar 2 igrača.';
    if (connected > 8) return 'Splav prima najviše 8 igrača.';
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
      round: 1,
      totalRounds: clampGameRounds(
        this.gameId,
        (customContent as { roundCount?: unknown } | undefined)?.roundCount
      ),
      order,
      bodies: new Map(),
      stats: new Map(order.map((id) => [id, emptyStats()])),
      roundElapsedMs: 0,
      eliminationOrder: [],
      eliminations: [],
      elimSeq: 0,
      frameSeq: 0,
      frameAccumMs: 0,
      pendingFrame: null,
      dirty: false,
      lastSecond: -1,
    };
    this.dealRound();
    return this.buildGameState(room);
  }

  // --- Input ---------------------------------------------------------------

  onPlayerAction(
    _room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'borba') return null;
    const body = this.state.bodies.get(playerId);
    if (!body || !body.alive) return null;

    if (action === 'splav:input') {
      const v = clampSplavInput(data.x, data.y);
      body.inx = v.x;
      body.iny = v.y;
    } else if (action === 'splav:dash') {
      startDash(body, this.state.roundElapsedMs);
    }

    // Always null: the answer to an input is the next frame, not a broadcast.
    return null;
  }

  // --- Loop ----------------------------------------------------------------

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    const s = this.state;
    if (s.phase === 'ended') return null;

    s.phaseTimeRemaining -= deltaMs / 1000;

    if (s.phase === 'borba') {
      this.simulate(room, deltaMs);
    } else if (s.phaseTimeRemaining <= 0) {
      this.advancePhase();
    }

    // A full state goes out when something structural changed, or once a
    // second so the clock on the TV stays honest. Everything else rides the
    // frame.
    const sec = Math.max(0, Math.ceil(s.phaseTimeRemaining));
    if (s.dirty || sec !== s.lastSecond) {
      s.dirty = false;
      s.lastSecond = sec;
      return this.buildGameState(room);
    }
    return null;
  }

  getPendingFrame(): SplavFrame | null {
    const frame = this.state?.pendingFrame ?? null;
    if (frame) this.state.pendingFrame = null;
    return frame;
  }

  private simulate(room: Room, deltaMs: number): void {
    const s = this.state;
    s.roundElapsedMs += deltaMs;
    s.frameAccumMs += deltaMs;

    const bodies = [...s.bodies.values()];
    const eliminated = stepSimulation(bodies, s.roundElapsedMs, deltaMs);

    for (const hit of eliminated) {
      this.registerElimination(room, hit.id, hit.byId, hit.byId ? 'guranje' : 'ivica');
    }

    if (s.frameAccumMs >= SPLAV_FRAME_INTERVAL_MS) {
      s.frameAccumMs %= SPLAV_FRAME_INTERVAL_MS;
      s.pendingFrame = this.buildFrame();
    }

    const aliveCount = bodies.filter((b) => b.alive).length;
    if (aliveCount <= 1 || s.roundElapsedMs >= SPLAV_ROUND_MAX_MS) {
      this.finishRound(room);
    }
  }

  private buildFrame(): SplavFrame {
    const s = this.state;
    const now = s.roundElapsedMs;
    const center = splavArenaCenter(now);
    return {
      seq: ++s.frameSeq,
      ms: Math.max(0, Math.round(SPLAV_ROUND_MAX_MS - now)),
      r: r3(splavArenaRadius(now)),
      cx: r3(center.x),
      cy: r3(center.y),
      players: [...s.bodies.values()].map((b) => ({
        id: b.id,
        x: r3(b.x),
        y: r3(b.y),
        cd: Math.round(dashCooldownProgress(b, now) * 100) / 100,
        d: isDashing(b, now),
        out: !b.alive,
        ot: b.outAt < 0 ? -1 : Math.round(now - b.outAt),
        h: b.lastImpactAt === -Infinity ? -1 : Math.round(now - b.lastImpactAt),
      })),
    };
  }

  // --- Round flow ----------------------------------------------------------

  /** Place everyone still in the game on a fresh raft. */
  private dealRound(): void {
    const s = this.state;
    s.bodies = new Map();
    s.eliminationOrder = [];
    s.eliminations = [];
    s.roundElapsedMs = 0;
    s.frameAccumMs = 0;
    s.frameSeq = 0;
    s.pendingFrame = null;
    s.roundResult = undefined;

    const spots = shuffled(s.order.map((_, i) => i));
    s.order.forEach((id, i) => {
      const spot = splavSpawn(spots[i], s.order.length);
      s.bodies.set(id, createBody(id, spot.x, spot.y));
    });
    for (const stats of s.stats.values()) {
      stats.lastRank = 0;
      stats.lastRoundPoints = 0;
      stats.lastEliminatedBy = null;
      stats.roundElimPoints = 0;
    }
  }

  private registerElimination(
    room: Room,
    victimId: string,
    byId: string | null,
    reason: SplavElimReason
  ): void {
    const s = this.state;
    if (s.eliminationOrder.includes(victimId)) return;
    s.eliminationOrder.push(victimId);

    const victimStats = this.statsFor(victimId);
    victimStats.lastEliminatedBy = byId;
    if (s.eliminationOrder.length === 1) victimStats.firstOut += 1;

    // Points for the shove — the whole reason the middle isn't a safe place to
    // wait out the shrink.
    if (byId) {
      const killer = room.players.find((p) => p.id === byId);
      if (killer) killer.score += SPLAV_ELIM_POINTS;
      const killerStats = this.statsFor(byId);
      killerStats.eliminations += 1;
      killerStats.roundElimPoints += SPLAV_ELIM_POINTS;
    }

    s.eliminations.push({
      seq: ++s.elimSeq,
      victim: this.playerRef(room, victimId),
      by: byId ? this.playerRef(room, byId) : null,
      reason,
    });
    s.dirty = true;
  }

  private finishRound(room: Room): void {
    const s = this.state;
    const survivors = [...s.bodies.values()].filter((b) => b.alive);

    // Ranking: survivors share the top places (the clock only ever runs out
    // with the raft a sliver wide, so this is the rare case), then the
    // eliminated in reverse order of falling.
    const ranked: string[] = [
      ...survivors.map((b) => b.id),
      ...[...s.eliminationOrder].reverse(),
      // A player who lost their seat mid-round is in eliminationOrder but no
      // longer in the game — they don't get a line in the table.
    ].filter((id) => s.order.includes(id));

    const total = ranked.length;
    const entries: SplavRoundEntry[] = ranked.map((id, i) => {
      const rank = i + 1;
      const body = s.bodies.get(id);
      const stats = this.statsFor(id);
      const survival = splavSurvivalPoints(rank, total);
      const player = room.players.find((p) => p.id === id);
      if (player) player.score += survival;
      stats.lastRank = rank;
      // Elimination points were paid the moment the shove landed; the round
      // table shows what the round was worth in total.
      stats.lastRoundPoints = survival + stats.roundElimPoints;
      return {
        ...this.playerRef(room, id),
        rank,
        points: stats.lastRoundPoints,
        eliminations: stats.eliminations,
        survivedMs:
          body && body.outAt >= 0 ? Math.round(body.outAt) : Math.round(s.roundElapsedMs),
      };
    });

    // Only a clean last-one-standing counts as a round win; a timeout with
    // several people still on the raft has no captain.
    const winner = survivors.length === 1 ? ranked[0] : null;
    if (winner) this.statsFor(winner).wins += 1;

    s.roundResult = {
      round: s.round,
      winner: winner ? this.playerRef(room, winner) : null,
      entries,
    };
    s.phase = 'runda-gotova';
    s.phaseTimeRemaining =
      this.timings.RUNDA_GOTOVA_DURATION ?? RUNDA_GOTOVA_DURATION;
    s.dirty = true;
  }

  private advancePhase(): void {
    const s = this.state;
    switch (s.phase) {
      case 'intro':
        s.phase = 'borba';
        s.phaseTimeRemaining = SPLAV_ROUND_MAX_MS / 1000;
        break;
      case 'runda-gotova':
        s.phase = 'rang-lista';
        s.phaseTimeRemaining =
          this.timings.LEADERBOARD_DURATION ?? LEADERBOARD_DURATION;
        break;
      case 'rang-lista':
        if (s.round >= s.totalRounds || s.order.length < 2) {
          s.phase = 'ended';
          s.phaseTimeRemaining = 0;
        } else {
          s.round += 1;
          this.dealRound();
          s.phase = 'intro';
          s.phaseTimeRemaining = this.timings.INTRO_DURATION ?? INTRO_DURATION;
        }
        break;
    }
    s.dirty = true;
  }

  // --- Disconnects ---------------------------------------------------------

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // Fired only after the reconnect grace expired — the seat is really gone.
    const s = this.state;
    const idx = s.order.indexOf(playerId);
    if (idx === -1) return null;
    s.order.splice(idx, 1);

    const body = s.bodies.get(playerId);
    if (body?.alive && s.phase === 'borba') {
      // No credit for a player who quit — nobody earned that.
      body.alive = false;
      body.outAt = s.roundElapsedMs;
      body.vx = 0;
      body.vy = 0;
      this.registerElimination(room, playerId, null, 'odustao');
    }
    s.bodies.delete(playerId);

    if (s.order.length < 2) {
      s.phase = 'ended';
      s.phaseTimeRemaining = 0;
      return this.buildGameState(room);
    }

    if (s.phase === 'borba') {
      const aliveCount = [...s.bodies.values()].filter((b) => b.alive).length;
      if (aliveCount <= 1) this.finishRound(room);
    }

    return this.buildGameState(room);
  }

  // --- Diplomas ------------------------------------------------------------

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.state.stats.entries()]
      .filter(([id]) => room.players.some((p) => p.id === id))
      .map(([id, s]) => ({ id, s }));
    if (entries.length === 0) return candidates;

    const best = (
      value: (s: SplavStats) => number,
      minimum: number
    ): { id: string; s: SplavStats } | null => {
      const top = entries.reduce((a, b) => (value(b.s) > value(a.s) ? b : a));
      return value(top.s) >= minimum ? top : null;
    };

    const bager = best((s) => s.eliminations, 2);
    if (bager) {
      candidates.push({
        playerId: bager.id,
        awardId: 'bager',
        priority: 72,
        subtitle: `${bager.s.eliminations} izguranih u vodu`,
      });
    }

    const kapetan = best((s) => s.wins, 2);
    if (kapetan) {
      candidates.push({
        playerId: kapetan.id,
        awardId: 'kapetan-splava',
        priority: 66,
        subtitle: `${kapetan.s.wins} dobijenih rundi`,
      });
    }

    const kamikaza = best((s) => s.firstOut, 2);
    if (kamikaza) {
      candidates.push({
        playerId: kamikaza.id,
        awardId: 'kamikaza',
        priority: 54,
        subtitle: `${kamikaza.s.firstOut} puta prvi u vodi`,
      });
    }

    return candidates;
  }

  // --- Build state ---------------------------------------------------------

  private statsFor(playerId: string): SplavStats {
    let s = this.state.stats.get(playerId);
    if (!s) {
      s = emptyStats();
      this.state.stats.set(playerId, s);
    }
    return s;
  }

  private playerRef(room: Room, playerId: string): SplavPlayerRef {
    const p = room.players.find((pl) => pl.id === playerId);
    return {
      playerId,
      name: p?.name ?? '?',
      avatarColor: p?.avatarColor ?? '#888888',
      avatarEmoji: p?.avatarEmoji ?? '👤',
    };
  }

  private buildGameState(room: Room): GameState {
    const s = this.state;

    const hostData: SplavHostData = {
      round: s.round,
      totalRounds: s.totalRounds,
      roster: s.order.map((id) => ({
        ...this.playerRef(room, id),
        alive: s.bodies.get(id)?.alive ?? false,
        score: room.players.find((p) => p.id === id)?.score ?? 0,
      })),
    };

    // Carried into `runda-gotova` too: the shove that ends a round lands on
    // the same tick as the round result, so dropping it there would silently
    // eat the loudest moment of the round.
    if (
      (s.phase === 'borba' || s.phase === 'runda-gotova') &&
      s.eliminations.length > 0
    ) {
      hostData.eliminations = s.eliminations;
    }
    if (s.phase === 'runda-gotova' && s.roundResult) {
      hostData.roundResult = s.roundResult;
    }
    if (s.phase === 'rang-lista' || s.phase === 'ended') {
      hostData.leaderboard = this.buildLeaderboard(room);
    }

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const stats = s.stats.get(player.id);
      const pd: SplavControllerData = {
        alive: s.bodies.get(player.id)?.alive ?? false,
        score: player.score,
        eliminations: stats?.eliminations ?? 0,
      };
      if (stats?.lastEliminatedBy !== undefined) {
        pd.eliminatedBy = stats.lastEliminatedBy;
      }
      if (stats?.lastRank) {
        pd.roundRank = stats.lastRank;
        pd.roundPoints = stats.lastRoundPoints;
      }
      playerData[player.id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: s.phase,
      round: s.round,
      totalRounds: s.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(s.phaseTimeRemaining)),
      data: { phase: s.phase, host: hostData },
      playerData,
    };
  }

  private buildLeaderboard(room: Room): SplavBoardEntry[] {
    return this.state.order
      .map((id) => {
        const stats = this.state.stats.get(id);
        return {
          ...this.playerRef(room, id),
          score: room.players.find((p) => p.id === id)?.score ?? 0,
          rank: 0,
          wins: stats?.wins ?? 0,
          eliminations: stats?.eliminations ?? 0,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }
}

/** Bodies are exposed for the headless test harness (scripts/test-splav.mts). */
export type { SplavBody };
