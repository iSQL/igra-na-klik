import type {
  Room,
  GameState,
  PogodiGodinuControllerData,
  PogodiGodinuEvent,
  PogodiGodinuGuessResult,
  PogodiGodinuHostData,
  PogodiGodinuLeaderboardEntry,
} from '@igra/shared';
import { POGODI_GODINU_EVENTS, shuffled } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { PogodiGodinuInternalState } from './PogodiGodinuState.js';
import {
  DEFAULT_ROUNDS,
  FINAL_LEADERBOARD_DURATION,
  GUESSING_DURATION,
  INTRO_DURATION,
  MAX_ROUNDS,
  MIN_ROUNDS,
  REVEAL_DURATION,
  YEAR_MAX,
  YEAR_MIN,
} from './PogodiGodinuState.js';
import { pointsForYearDistance } from './scoring.js';

function clampRounds(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_ROUNDS;
  const n = Math.floor(raw);
  if (n < MIN_ROUNDS) return MIN_ROUNDS;
  if (n > MAX_ROUNDS) return MAX_ROUNDS;
  return n;
}

export class PogodiGodinuModule extends BaseGameModule {
  readonly gameId = 'pogodi-godinu';

  private state!: PogodiGodinuInternalState;

  onStart(room: Room, customContent?: unknown): GameState {
    const rounds = clampRounds(
      (customContent as { pogodiGodinuRounds?: unknown } | undefined)
        ?.pogodiGodinuRounds
    );
    const events = shuffled(POGODI_GODINU_EVENTS).slice(0, rounds);
    this.state = {
      phase: 'intro',
      phaseTimeRemaining: INTRO_DURATION,
      events,
      currentIndex: 0,
      totalRounds: events.length,
      guesses: new Map(),
      expectedGuesserIds: new Set(),
      roundScores: new Map(),
    };
    void room;
    return this.buildGameState(room);
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (action !== 'godina:guess') return null;
    if (this.state.phase !== 'guessing') return null;
    if (this.state.guesses.has(playerId)) return null;
    if (!room.players.some((p) => p.id === playerId && p.isConnected)) {
      return null;
    }

    const raw = data.year;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const year = Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(raw)));

    this.state.guesses.set(playerId, year);
    if (this.allGuessed(room)) this.transitionToReveal(room);
    return this.buildGameState(room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) this.advancePhase(room);
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    if (this.state.phase === 'guessing') {
      this.state.expectedGuesserIds.delete(playerId);
      if (this.allGuessed(room)) this.transitionToReveal(room);
    }
    return this.buildGameState(room);
  }

  // --- Phase machine -----------------------------------------------------

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'intro':
        this.enterGuessing(room);
        break;
      case 'guessing':
        this.transitionToReveal(room);
        break;
      case 'reveal':
        this.state.currentIndex += 1;
        if (this.state.currentIndex >= this.state.totalRounds) {
          this.state.phase = 'final-leaderboard';
          this.state.phaseTimeRemaining = FINAL_LEADERBOARD_DURATION;
        } else {
          this.enterGuessing(room);
        }
        break;
      case 'final-leaderboard':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        break;
    }
  }

  private enterGuessing(room: Room): void {
    this.state.phase = 'guessing';
    this.state.phaseTimeRemaining = GUESSING_DURATION;
    this.state.guesses = new Map();
    this.state.roundScores = new Map();
    this.state.expectedGuesserIds = new Set(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );
  }

  private transitionToReveal(room: Room): void {
    const event = this.currentEvent();
    const scores = new Map<string, number>();
    if (event) {
      for (const [playerId, guess] of this.state.guesses) {
        const distance = Math.abs(guess - event.year);
        const points = pointsForYearDistance(distance);
        scores.set(playerId, points);
        const player = room.players.find((p) => p.id === playerId);
        if (player) player.score += points;
      }
    }
    this.state.roundScores = scores;
    this.state.phase = 'reveal';
    this.state.phaseTimeRemaining = REVEAL_DURATION;
  }

  private allGuessed(room: Room): boolean {
    if (this.state.phase !== 'guessing') return false;
    for (const id of this.state.expectedGuesserIds) {
      if (this.state.guesses.has(id)) continue;
      if (!room.players.some((p) => p.id === id)) continue; // gone past grace
      return false;
    }
    return true;
  }

  // --- Helpers -----------------------------------------------------------

  private currentEvent(): PogodiGodinuEvent | undefined {
    return this.state.events[this.state.currentIndex];
  }

  // --- Build state -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const event = this.currentEvent();
    const hostData: PogodiGodinuHostData = {
      round: this.state.currentIndex + 1,
      totalRounds: this.state.totalRounds,
      yearMin: YEAR_MIN,
      yearMax: YEAR_MAX,
    };

    if (
      (this.state.phase === 'guessing' || this.state.phase === 'reveal') &&
      event
    ) {
      // Public event never carries the year — trueYear is exposed only at
      // reveal so a curious player can't read the answer off the wire.
      hostData.event = { text: event.text, emoji: event.emoji };
    }

    if (this.state.phase === 'guessing') {
      const guessers = [...this.state.expectedGuesserIds].filter((id) =>
        room.players.some((p) => p.id === id)
      );
      hostData.totalGuessers = guessers.length;
      hostData.lockedCount = guessers.filter((id) =>
        this.state.guesses.has(id)
      ).length;
    }

    if (this.state.phase === 'reveal' && event) {
      hostData.trueYear = event.year;
      hostData.results = this.buildResults(room, event.year);
    }

    if (
      this.state.phase === 'final-leaderboard' ||
      this.state.phase === 'ended'
    ) {
      hostData.leaderboard = this.buildLeaderboard(room);
    }

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host: hostData,
    };

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      playerData[player.id] = this.buildControllerData(
        player.id,
        event?.year
      ) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentIndex + 1,
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildControllerData(
    playerId: string,
    trueYear: number | undefined
  ): PogodiGodinuControllerData {
    const pd: PogodiGodinuControllerData = {};
    if (this.state.phase === 'guessing') {
      pd.hasLocked = this.state.guesses.has(playerId);
      pd.ownGuess = this.state.guesses.get(playerId) ?? null;
    }
    if (this.state.phase === 'reveal') {
      const guess = this.state.guesses.get(playerId);
      pd.ownDistance =
        guess !== undefined && trueYear !== undefined
          ? Math.abs(guess - trueYear)
          : null;
      pd.ownPoints = this.state.roundScores.get(playerId) ?? 0;
      pd.wasExact = guess !== undefined && guess === trueYear;
    }
    return pd;
  }

  private buildResults(
    room: Room,
    trueYear: number
  ): PogodiGodinuGuessResult[] {
    return room.players
      .filter((p) => p.isConnected || this.state.guesses.has(p.id))
      .map<PogodiGodinuGuessResult>((p) => {
        const guess = this.state.guesses.get(p.id);
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          guess: guess ?? null,
          distance: guess !== undefined ? Math.abs(guess - trueYear) : null,
          points: this.state.roundScores.get(p.id) ?? 0,
        };
      })
      .sort((a, b) => b.points - a.points);
  }

  private buildLeaderboard(room: Room): PogodiGodinuLeaderboardEntry[] {
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
