import type {
  Room,
  GameState,
  DveIstineControllerData,
  DveIstineHostData,
  DveIstineLeaderboardEntry,
  DveIstineResultGuesser,
  DveIstineRole,
  DveIstineScoreEntry,
  DveIstineStatement,
} from '@igra/shared';
import { shuffled } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { DveIstineInternalState } from './DveIstineState.js';
import {
  COLLECTING_DURATION,
  CORRECT_GUESS_POINTS,
  FOOL_POINTS_PER_GUESSER,
  GUESSING_DURATION,
  MAX_STATEMENT_LENGTH,
  MIN_STATEMENT_LENGTH,
  SHOWING_RESULTS_DURATION,
} from './DveIstineState.js';

export class DveIstineModule extends BaseGameModule {
  readonly gameId = 'dve-istine-i-laz';

  private state!: DveIstineInternalState;

  onStart(room: Room): GameState {
    const connected = room.players.filter((p) => p.isConnected);
    this.state = {
      phase: 'collecting',
      phaseTimeRemaining: COLLECTING_DURATION,
      submissions: new Map(),
      expectedSubmitterIds: new Set(connected.map((p) => p.id)),
      subjectOrder: [],
      totalRounds: connected.length,
      currentRoundIndex: 0,
      presented: [],
      lieIndex: -1,
      guesses: new Map(),
      expectedGuesserIds: new Set(),
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
    switch (action) {
      case 'dveistine:submit':
        return this.handleSubmit(room, playerId, data);
      case 'dveistine:guess':
        return this.handleGuess(room, playerId, data);
      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) {
      switch (this.state.phase) {
        case 'collecting':
          this.finalizeCollection(room);
          break;
        case 'guessing':
          this.transitionToResults(room);
          break;
        case 'showing-results':
          this.nextRoundOrEnd(room);
          break;
      }
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    if (this.state.phase === 'collecting') {
      this.state.expectedSubmitterIds.delete(playerId);
      if (this.allSubmitted(room)) this.finalizeCollection(room);
    } else if (this.state.phase === 'guessing') {
      this.state.expectedGuesserIds.delete(playerId);
      if (this.allGuessed(room)) this.transitionToResults(room);
    }
    return this.buildGameState(room);
  }

  // --- Actions -----------------------------------------------------------

  private handleSubmit(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'collecting') return null;
    if (this.state.submissions.has(playerId)) return null;

    const truth1 = this.clean(data.truth1);
    const truth2 = this.clean(data.truth2);
    const lie = this.clean(data.lie);
    if (!truth1 || !truth2 || !lie) return null;

    this.state.submissions.set(playerId, { truth1, truth2, lie });
    if (this.allSubmitted(room)) this.finalizeCollection(room);
    return this.buildGameState(room);
  }

  private handleGuess(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'guessing') return null;
    if (playerId === this.currentSubjectId()) return null;
    if (!this.state.subjectOrder.includes(playerId)) return null;
    if (this.state.guesses.has(playerId)) return null;

    const index = data.index;
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.state.presented.length
    ) {
      return null;
    }

    this.state.guesses.set(playerId, index);
    if (this.allGuessed(room)) this.transitionToResults(room);
    return this.buildGameState(room);
  }

  // --- Lifecycle ---------------------------------------------------------

  private finalizeCollection(room: Room): void {
    const submitters = room.players.filter(
      (p) => p.isConnected && this.state.submissions.has(p.id)
    );
    if (submitters.length < 2) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }
    this.state.subjectOrder = shuffled(submitters.map((p) => p.id));
    this.state.totalRounds = this.state.subjectOrder.length;
    this.state.currentRoundIndex = 0;
    this.enterRound(room);
  }

  private enterRound(room: Room): void {
    // Skip subjects who lost their submission or disconnected.
    while (this.state.currentRoundIndex < this.state.subjectOrder.length) {
      const subjectId = this.state.subjectOrder[this.state.currentRoundIndex];
      const sub = this.state.submissions.get(subjectId);
      if (sub && this.isConnected(room, subjectId)) break;
      this.state.currentRoundIndex += 1;
    }
    if (this.state.currentRoundIndex >= this.state.subjectOrder.length) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }

    const subjectId = this.currentSubjectId();
    const sub = this.state.submissions.get(subjectId)!;
    this.state.presented = shuffled([
      { text: sub.truth1, isLie: false },
      { text: sub.truth2, isLie: false },
      { text: sub.lie, isLie: true },
    ]);
    this.state.lieIndex = this.state.presented.findIndex((s) => s.isLie);
    this.state.guesses = new Map();
    this.state.expectedGuesserIds = new Set(
      room.players
        .filter((p) => p.isConnected && p.id !== subjectId)
        .map((p) => p.id)
    );
    this.state.roundScores = new Map();
    this.state.phase = 'guessing';
    this.state.phaseTimeRemaining = GUESSING_DURATION;

    // Nobody left to guess — resolve immediately so we don't idle 20s.
    if (this.state.expectedGuesserIds.size === 0) {
      this.transitionToResults(room);
    }
  }

  private transitionToResults(room: Room): void {
    const subjectId = this.currentSubjectId();
    const scores = new Map<string, number>();
    let fooled = 0;

    for (const [guesserId, idx] of this.state.guesses) {
      if (idx === this.state.lieIndex) {
        scores.set(guesserId, CORRECT_GUESS_POINTS);
        const p = room.players.find((pp) => pp.id === guesserId);
        if (p) p.score += CORRECT_GUESS_POINTS;
      } else {
        fooled += 1;
      }
    }

    const bonus = fooled * FOOL_POINTS_PER_GUESSER;
    if (bonus > 0) {
      scores.set(subjectId, bonus);
      const subject = room.players.find((p) => p.id === subjectId);
      if (subject) subject.score += bonus;
    }

    this.state.roundScores = scores;
    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
  }

  private nextRoundOrEnd(room: Room): void {
    this.state.currentRoundIndex += 1;
    if (this.state.currentRoundIndex >= this.state.subjectOrder.length) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }
    this.enterRound(room);
  }

  // --- Helpers -----------------------------------------------------------

  private clean(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    const t = raw.trim().slice(0, MAX_STATEMENT_LENGTH);
    return t.length >= MIN_STATEMENT_LENGTH ? t : '';
  }

  private currentSubjectId(): string {
    return this.state.subjectOrder[this.state.currentRoundIndex] ?? '';
  }

  private isConnected(room: Room, playerId: string): boolean {
    return room.players.find((p) => p.id === playerId)?.isConnected === true;
  }

  private allSubmitted(room: Room): boolean {
    if (this.state.phase !== 'collecting') return false;
    for (const id of this.state.expectedSubmitterIds) {
      if (this.state.submissions.has(id)) continue;
      if (!room.players.some((p) => p.id === id)) continue;
      return false;
    }
    return true;
  }

  private allGuessed(room: Room): boolean {
    if (this.state.phase !== 'guessing') return false;
    for (const id of this.state.expectedGuesserIds) {
      if (this.state.guesses.has(id)) continue;
      if (!room.players.some((p) => p.id === id)) continue;
      return false;
    }
    return true;
  }

  private roleFor(playerId: string): DveIstineRole {
    if (this.state.phase === 'collecting') {
      return this.state.expectedSubmitterIds.has(playerId)
        ? 'guesser'
        : 'spectator';
    }
    if (!this.state.subjectOrder.includes(playerId)) return 'spectator';
    return playerId === this.currentSubjectId() ? 'subject' : 'guesser';
  }

  // --- Build state -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const hostData: DveIstineHostData = {
      round: Math.max(1, this.state.currentRoundIndex + 1),
      totalRounds: Math.max(1, this.state.totalRounds),
    };

    if (this.state.phase === 'collecting') {
      const submitters = [...this.state.expectedSubmitterIds].filter((id) =>
        room.players.some((p) => p.id === id)
      );
      hostData.totalSubmitters = submitters.length;
      hostData.submittedCount = submitters.filter((id) =>
        this.state.submissions.has(id)
      ).length;
    }

    if (this.state.phase === 'guessing' || this.state.phase === 'showing-results') {
      const subjectId = this.currentSubjectId();
      hostData.subjectId = subjectId;
      hostData.subjectName =
        room.players.find((p) => p.id === subjectId)?.name ?? '?';
      // Public statements never carry the isLie flag; only the results
      // branch reveals lieIndex.
      hostData.statements = this.state.presented.map<DveIstineStatement>(
        (s, i) => ({ index: i, text: s.text })
      );
      const guessers = [...this.state.expectedGuesserIds].filter((id) =>
        room.players.some((p) => p.id === id)
      );
      hostData.totalGuessers = guessers.length;
      hostData.guessedCount = guessers.filter((id) =>
        this.state.guesses.has(id)
      ).length;
    }

    if (this.state.phase === 'showing-results') {
      hostData.lieIndex = this.state.lieIndex;
      hostData.results = this.buildResultGuessers(room);
      hostData.roundScores = this.buildScoreEntries(room);
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
        player.id
      ) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: Math.max(1, this.state.currentRoundIndex + 1),
      totalRounds: Math.max(1, this.state.totalRounds),
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildControllerData(playerId: string): DveIstineControllerData {
    const pd: DveIstineControllerData = { role: this.roleFor(playerId) };

    if (this.state.phase === 'collecting') {
      pd.hasSubmitted = this.state.submissions.has(playerId);
    }
    if (this.state.phase === 'guessing') {
      pd.hasGuessed = this.state.guesses.has(playerId);
      pd.guessedIndex = this.state.guesses.get(playerId) ?? null;
    }
    if (this.state.phase === 'showing-results') {
      pd.ownRoundScore = this.state.roundScores.get(playerId) ?? 0;
      const g = this.state.guesses.get(playerId);
      pd.wasCorrect = g !== undefined && g === this.state.lieIndex;
    }
    return pd;
  }

  private buildResultGuessers(room: Room): DveIstineResultGuesser[] {
    const subjectId = this.currentSubjectId();
    return room.players
      .filter((p) => this.state.subjectOrder.includes(p.id) && p.id !== subjectId)
      .map<DveIstineResultGuesser>((p) => {
        const g = this.state.guesses.get(p.id);
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          guessedIndex: g ?? null,
          correct: g !== undefined && g === this.state.lieIndex,
        };
      });
  }

  private buildScoreEntries(room: Room): DveIstineScoreEntry[] {
    return room.players
      .filter((p) => (this.state.roundScores.get(p.id) ?? 0) > 0)
      .map<DveIstineScoreEntry>((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        roundScore: this.state.roundScores.get(p.id) ?? 0,
        totalScore: p.score,
      }))
      .sort((a, b) => b.roundScore - a.roundScore);
  }

  private buildLeaderboard(room: Room): DveIstineLeaderboardEntry[] {
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
