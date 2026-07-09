import type {
  Room,
  GameState,
  PogodiGodinuControllerData,
  PogodiGodinuGuessResult,
  PogodiGodinuHostData,
  PogodiGodinuLeaderboardEntry,
} from '@igra/shared';
import { POGODI_BROJ_QUESTIONS, shuffled } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import type {
  PogodiGodinuInternalState,
  RuntimeQuestion,
} from './PogodiGodinuState.js';
import {
  DEFAULT_ROUNDS,
  FINAL_LEADERBOARD_DURATION,
  GUESSING_DURATION,
  INTRO_DURATION,
  MAX_ROUNDS,
  MIN_ROUNDS,
  REVEAL_DURATION,
} from './PogodiGodinuState.js';
import { resolvePogodiBrojPack } from './pack-resolver.js';
import { pointsForGuess } from './scoring.js';

interface PogodiBrojCustomContent {
  pogodiGodinuRounds?: unknown;
  pogodiBrojPackId?: unknown;
}

function clampRounds(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_ROUNDS;
  const n = Math.floor(raw);
  if (n < MIN_ROUNDS) return MIN_ROUNDS;
  if (n > MAX_ROUNDS) return MAX_ROUNDS;
  return n;
}

/** Snap a raw guess to the question's range and step. */
function normalizeGuess(raw: number, question: RuntimeQuestion): number {
  const clamped = Math.max(question.min, Math.min(question.max, raw));
  const step = question.step && question.step > 0 ? question.step : 1;
  const snapped = question.min + Math.round((clamped - question.min) / step) * step;
  return Math.max(question.min, Math.min(question.max, snapped));
}

export class PogodiGodinuModule extends BaseGameModule {
  readonly gameId = 'pogodi-godinu';

  private state!: PogodiGodinuInternalState;
  private timings: Record<string, number> = {};
  private desiredRounds = DEFAULT_ROUNDS;

  constructor(private readonly packsDir: string = '') {
    super();
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent as PogodiBrojCustomContent | undefined) ?? {};
    this.desiredRounds = clampRounds(cc.pogodiGodinuRounds);

    this.state = {
      phase: 'intro',
      phaseTimeRemaining: this.timings.INTRO_DURATION ?? INTRO_DURATION,
      questions: [],
      currentIndex: 0,
      totalRounds: 0,
      guesses: new Map(),
      guessSpeed: new Map(),
      expectedGuesserIds: new Set(),
      roundScores: new Map(),
    };

    const packId =
      typeof cc.pogodiBrojPackId === 'string' ? cc.pogodiBrojPackId : undefined;

    if (packId) {
      // Pack questions load from disk; onStart can't be async, so build the
      // intro placeholder now and fill the questions once the load resolves.
      void this.loadPack(packId);
    } else {
      this.state.questions = shuffled(POGODI_BROJ_QUESTIONS).slice(
        0,
        this.desiredRounds
      );
      this.state.totalRounds = this.state.questions.length;
    }

    return this.buildGameState(room);
  }

  private async loadPack(packId: string): Promise<void> {
    const resolved = this.packsDir
      ? await resolvePogodiBrojPack(this.packsDir, packId)
      : null;

    if (!resolved || resolved.questions.length === 0) {
      // Bad/empty pack — fall back to the built-in bank so the game still runs.
      this.state.questions = shuffled(POGODI_BROJ_QUESTIONS).slice(
        0,
        this.desiredRounds
      );
      this.state.totalRounds = this.state.questions.length;
      return;
    }

    const picked = shuffled(resolved.questions).slice(0, this.desiredRounds);
    this.state.questions = picked;
    this.state.totalRounds = picked.length;
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (action !== 'broj:guess') return null;
    if (this.state.phase !== 'guessing') return null;
    if (this.state.guesses.has(playerId)) return null;
    if (!room.players.some((p) => p.id === playerId && p.isConnected)) {
      return null;
    }
    const question = this.currentQuestion();
    if (!question) return null;

    const raw = data.value;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;

    this.state.guesses.set(playerId, normalizeGuess(raw, question));
    // Capture the share of the round clock still left — the speed bonus at
    // reveal scales with this. GUESSING_DURATION is the full window.
    this.state.guessSpeed.set(
      playerId,
      Math.max(0, Math.min(1, this.state.phaseTimeRemaining / GUESSING_DURATION))
    );
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
        // The pack may still be loading; keep waiting one tick if so.
        if (this.state.questions.length === 0) {
          this.state.phaseTimeRemaining =
            this.timings.INTRO_DURATION ?? INTRO_DURATION;
          return;
        }
        this.enterGuessing(room);
        break;
      case 'guessing':
        this.transitionToReveal(room);
        break;
      case 'reveal':
        this.state.currentIndex += 1;
        if (this.state.currentIndex >= this.state.totalRounds) {
          this.state.phase = 'final-leaderboard';
          this.state.phaseTimeRemaining =
            this.timings.FINAL_LEADERBOARD_DURATION ?? FINAL_LEADERBOARD_DURATION;
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
    this.state.guessSpeed = new Map();
    this.state.roundScores = new Map();
    this.state.expectedGuesserIds = new Set(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );
  }

  private transitionToReveal(room: Room): void {
    const question = this.currentQuestion();
    const scores = new Map<string, number>();
    if (question) {
      const span = question.max - question.min;
      for (const [playerId, guess] of this.state.guesses) {
        const distance = Math.abs(guess - question.answer);
        const speed = this.state.guessSpeed.get(playerId) ?? 0;
        const points = pointsForGuess(distance, span, speed);
        scores.set(playerId, points);
        const player = room.players.find((p) => p.id === playerId);
        if (player) player.score += points;
      }
    }
    this.state.roundScores = scores;
    this.state.phase = 'reveal';
    this.state.phaseTimeRemaining = this.timings.REVEAL_DURATION ?? REVEAL_DURATION;
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

  private currentQuestion(): RuntimeQuestion | undefined {
    return this.state.questions[this.state.currentIndex];
  }

  // --- Build state -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const question = this.currentQuestion();
    const hostData: PogodiGodinuHostData = {
      round: this.state.currentIndex + 1,
      totalRounds: this.state.totalRounds,
    };

    if (
      (this.state.phase === 'guessing' || this.state.phase === 'reveal') &&
      question
    ) {
      // The public event never carries the answer — trueValue is exposed only
      // at reveal so a curious player can't read it off the wire.
      hostData.event = {
        text: question.text,
        emoji: question.emoji,
        imageUrl: question.imageUrl,
        unit: question.unit,
        valueType: question.valueType,
        min: question.min,
        max: question.max,
        step: question.step,
      };
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

    if (this.state.phase === 'reveal' && question) {
      hostData.trueValue = question.answer;
      hostData.results = this.buildResults(room, question.answer);
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
        question?.answer
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
    trueValue: number | undefined
  ): PogodiGodinuControllerData {
    const pd: PogodiGodinuControllerData = {};
    if (this.state.phase === 'guessing') {
      pd.hasLocked = this.state.guesses.has(playerId);
      pd.ownGuess = this.state.guesses.get(playerId) ?? null;
    }
    if (this.state.phase === 'reveal') {
      const guess = this.state.guesses.get(playerId);
      pd.ownDistance =
        guess !== undefined && trueValue !== undefined
          ? Math.abs(guess - trueValue)
          : null;
      pd.ownPoints = this.state.roundScores.get(playerId) ?? 0;
      pd.wasExact = guess !== undefined && guess === trueValue;
    }
    return pd;
  }

  private buildResults(
    room: Room,
    trueValue: number
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
          distance: guess !== undefined ? Math.abs(guess - trueValue) : null,
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
