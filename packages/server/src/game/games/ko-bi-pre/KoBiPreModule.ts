import type {
  Room,
  GameState,
  KoBiPreControllerData,
  KoBiPreHostData,
  KoBiPreLeaderboardEntry,
  KoBiPreVoteOption,
  KoBiPreVoteTally,
  KoBiPreVoter,
} from '@igra/shared';
import { KO_BI_PRE_PROMPTS, shuffled } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import type { KoBiPreInternalState } from './KoBiPreState.js';
import {
  CORRECT_CROWD_POINTS,
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  SHOWING_RESULTS_DURATION,
  VOTING_DURATION,
} from './KoBiPreState.js';

function clampRounds(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_ROUNDS;
  const n = Math.floor(raw);
  if (n < MIN_ROUNDS) return MIN_ROUNDS;
  if (n > MAX_ROUNDS) return MAX_ROUNDS;
  return n;
}

export class KoBiPreModule extends BaseGameModule {
  readonly gameId = 'ko-bi-pre';

  private state!: KoBiPreInternalState;
  private timings: Record<string, number> = {};

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const rounds = clampRounds(
      (customContent as { koBiPreRounds?: unknown } | undefined)?.koBiPreRounds
    );
    const prompts = shuffled(KO_BI_PRE_PROMPTS).slice(0, rounds);
    this.state = {
      phase: 'voting',
      phaseTimeRemaining: VOTING_DURATION,
      prompts,
      currentRound: 1,
      totalRounds: prompts.length,
      votes: new Map(),
      expectedVoterIds: new Set(
        room.players.filter((p) => p.isConnected).map((p) => p.id)
      ),
      topPlayerIds: new Set(),
      roundScores: new Map(),
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
    if (action !== 'kobipre:vote') return null;
    if (this.state.phase !== 'voting') return null;
    if (this.state.votes.has(playerId)) return null;

    const targetId = data.targetId as string;
    if (!targetId) return null;
    // You may vote for anyone connected — including yourself.
    if (!room.players.some((p) => p.id === targetId && p.isConnected)) {
      return null;
    }

    this.state.votes.set(playerId, targetId);
    if (this.allExpectedVoted(room)) this.transitionToResults(room);
    return this.buildGameState(room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) {
      if (this.state.phase === 'voting') this.transitionToResults(room);
      else if (this.state.phase === 'showing-results') this.nextRoundOrEnd(room);
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    if (this.state.phase === 'voting') {
      this.state.expectedVoterIds.delete(playerId);
      if (this.allExpectedVoted(room)) this.transitionToResults(room);
    }
    return this.buildGameState(room);
  }

  // --- Transitions -------------------------------------------------------

  private allExpectedVoted(room: Room): boolean {
    if (this.state.phase !== 'voting') return false;
    for (const id of this.state.expectedVoterIds) {
      if (this.state.votes.has(id)) continue;
      if (!room.players.some((p) => p.id === id)) continue; // gone past grace
      return false;
    }
    return true;
  }

  private transitionToResults(room: Room): void {
    const counts = new Map<string, number>();
    for (const target of this.state.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    let maxVotes = 0;
    for (const c of counts.values()) maxVotes = Math.max(maxVotes, c);

    this.state.topPlayerIds = new Set();
    if (maxVotes > 0) {
      for (const [id, c] of counts) {
        if (c === maxVotes) this.state.topPlayerIds.add(id);
      }
    }

    // Reward everyone who "read the room" — voted for a top-voted player.
    const scores = new Map<string, number>();
    for (const [voterId, targetId] of this.state.votes) {
      if (this.state.topPlayerIds.has(targetId)) {
        scores.set(voterId, CORRECT_CROWD_POINTS);
        const player = room.players.find((p) => p.id === voterId);
        if (player) player.score += CORRECT_CROWD_POINTS;
      }
    }
    this.state.roundScores = scores;

    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining =
      this.timings.SHOWING_RESULTS_DURATION ?? SHOWING_RESULTS_DURATION;
  }

  private nextRoundOrEnd(room: Room): void {
    if (this.state.currentRound < this.state.totalRounds) {
      this.state.currentRound += 1;
      this.state.votes = new Map();
      this.state.expectedVoterIds = new Set(
        room.players.filter((p) => p.isConnected).map((p) => p.id)
      );
      this.state.topPlayerIds = new Set();
      this.state.roundScores = new Map();
      this.state.phase = 'voting';
      this.state.phaseTimeRemaining = VOTING_DURATION;
    } else {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
    }
  }

  // --- Build state -------------------------------------------------------

  private currentPrompt(): string {
    return this.state.prompts[this.state.currentRound - 1] ?? '';
  }

  private buildGameState(room: Room): GameState {
    const hostData: KoBiPreHostData = {
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      prompt: this.currentPrompt(),
    };

    if (this.state.phase === 'voting') {
      const voters = [...this.state.expectedVoterIds].filter((id) =>
        room.players.some((p) => p.id === id)
      );
      hostData.totalVoters = voters.length;
      hostData.votedCount = voters.filter((id) =>
        this.state.votes.has(id)
      ).length;
    }

    if (this.state.phase === 'showing-results') {
      hostData.voteTally = this.buildVoteTally(room);
      hostData.topNames = [...this.state.topPlayerIds]
        .map((id) => room.players.find((p) => p.id === id)?.name ?? '?')
        .filter((n) => n !== '?');
    }

    if (this.state.phase === 'showing-results' || this.state.phase === 'ended') {
      hostData.leaderboard = this.buildLeaderboard(room);
    }

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host: hostData,
    };

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      playerData[player.id] = this.buildControllerData(
        room,
        player.id
      ) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildControllerData(
    room: Room,
    playerId: string
  ): KoBiPreControllerData {
    const pd: KoBiPreControllerData = {};
    if (this.state.phase === 'voting') {
      pd.hasVoted = this.state.votes.has(playerId);
      pd.votedFor = this.state.votes.get(playerId) ?? null;
      pd.voteOptions = room.players
        .filter((p) => p.isConnected)
        .map<KoBiPreVoteOption>((p) => ({
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
        }));
    }
    if (this.state.phase === 'showing-results') {
      pd.ownRoundScore = this.state.roundScores.get(playerId) ?? 0;
      const myVote = this.state.votes.get(playerId);
      pd.matchedCrowd = myVote ? this.state.topPlayerIds.has(myVote) : false;
    }
    return pd;
  }

  private buildVoteTally(room: Room): KoBiPreVoteTally[] {
    const counts = new Map<string, number>();
    const votersByTarget = new Map<string, KoBiPreVoter[]>();
    for (const [voterId, target] of this.state.votes) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
      const voter = room.players.find((p) => p.id === voterId);
      const arr = votersByTarget.get(target) ?? [];
      arr.push({
        playerId: voterId,
        name: voter?.name ?? '?',
        avatarColor: voter?.avatarColor ?? '#888',
        avatarEmoji: voter?.avatarEmoji ?? '👤',
      });
      votersByTarget.set(target, arr);
    }
    return room.players
      .filter((p) => p.isConnected || counts.has(p.id))
      .map<KoBiPreVoteTally>((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        votes: counts.get(p.id) ?? 0,
        isTop: this.state.topPlayerIds.has(p.id),
        voters: votersByTarget.get(p.id) ?? [],
      }))
      .sort((a, b) => b.votes - a.votes);
  }

  private buildLeaderboard(room: Room): KoBiPreLeaderboardEntry[] {
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
