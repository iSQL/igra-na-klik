import type {
  Room,
  GameState,
  KvizBrojQuestionFull,
  KvizBrojRoundResult,
  KvizGeoQuestionFull,
  KvizQuestionFull,
  QuizLeaderboardEntry,
  QuizResultData,
} from '@igra/shared';
import {
  QUIZ_QUESTION_BANK,
  bboxDiagonalKm,
  clampGameRounds,
  haversineKm,
  packLatLngToPin,
  packPinToLatLng,
  parseQuizImport,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import type { QuizAnswer, QuizInternalState } from './QuizState.js';
import { inlineQuestionsToRuntime, resolveQuizPack } from './quiz-pack-resolver.js';
import {
  SERBIA_DECAY_KM,
  decayKmForMapDiagonal,
  normalizeGuess,
  pointsForDistanceKm,
  pointsForGuess,
} from './scoring.js';

const SHOWING_QUESTION_DURATION = 5;
const SHOWING_RESULTS_DURATION = 5;
const RICH_RESULTS_DURATION = 8;
const LEADERBOARD_DURATION = 4;

interface QuizCustomContent {
  customQuestions?: unknown;
  quizPackId?: unknown;
  roundCount?: unknown;
}

export class QuizGameModule extends BaseGameModule {
  readonly gameId = 'quiz';

  private state!: QuizInternalState;
  private timings: Record<string, number> = {};
  private desiredRounds = 0;

  constructor(private readonly packsDir: string = '') {
    super();
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent as QuizCustomContent | undefined) ?? {};
    this.desiredRounds = clampGameRounds(this.gameId, cc.roundCount);

    this.state = {
      questions: [],
      currentQuestionIndex: 0,
      phase: 'showing-question',
      phaseTimeRemaining:
        this.timings.SHOWING_QUESTION_DURATION ?? SHOWING_QUESTION_DURATION,
      answers: new Map(),
      questionStartTime: Date.now(),
      expectedAnswererIds: new Set(),
      lastRoundScores: new Map(),
      lastRoundDistances: new Map(),
    };

    const packId = typeof cc.quizPackId === 'string' ? cc.quizPackId : undefined;

    if (packId && this.packsDir) {
      // Pack questions load from disk; onStart can't be async, so start with
      // an empty question list — advancePhase waits in showing-question until
      // the load resolves (or falls back to the built-in bank).
      void this.loadPack(packId);
    } else if (cc.customQuestions !== undefined) {
      const parsed = parseQuizImport(cc.customQuestions, { context: 'inline' });
      if (parsed.ok) {
        this.setQuestions(inlineQuestionsToRuntime(parsed.manifest.questions));
      } else {
        // Silent fallback to default bank. Host already validated.
        this.setQuestions(QUIZ_QUESTION_BANK);
      }
    } else {
      this.setQuestions(QUIZ_QUESTION_BANK);
    }

    return this.buildGameState(room);
  }

  private setQuestions(bank: KvizQuestionFull[]): void {
    this.state.questions = shuffled(bank).slice(
      0,
      Math.min(this.desiredRounds, bank.length)
    );
  }

  private async loadPack(packId: string): Promise<void> {
    const resolved = await resolveQuizPack(this.packsDir, packId);
    if (!resolved || resolved.questions.length === 0) {
      // Bad/empty pack — fall back to the built-in bank so the game still runs.
      this.setQuestions(QUIZ_QUESTION_BANK);
      return;
    }
    this.setQuestions(resolved.questions);
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'answering') return null;
    if (this.state.answers.has(playerId)) return null;
    const question = this.currentQuestion();
    if (!question) return null;
    if (!room.players.some((p) => p.id === playerId && p.isConnected)) {
      return null;
    }

    let answer: QuizAnswer | null = null;

    if (action === 'quiz:answer') {
      if (question.type === 'geo' || question.type === 'broj') return null;
      const optionIndex = data.optionIndex;
      if (
        typeof optionIndex !== 'number' ||
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= question.options.length
      ) {
        return null;
      }
      const timeMs = Date.now() - this.state.questionStartTime;
      const correct = optionIndex === question.correctIndex;
      answer = { kind: 'choice', optionIndex, timeMs, correct };
      if (correct) {
        const timeRemaining = Math.max(0, question.timeLimit * 1000 - timeMs);
        const score = Math.round(
          1000 * (timeRemaining / (question.timeLimit * 1000))
        );
        const player = room.players.find((p) => p.id === playerId);
        if (player) player.score += score;
      }
    } else if (action === 'quiz:pin') {
      if (question.type !== 'geo') return null;
      const pin = data.pin as { x?: unknown; y?: unknown } | undefined;
      if (
        !pin ||
        typeof pin.x !== 'number' ||
        typeof pin.y !== 'number' ||
        !Number.isFinite(pin.x) ||
        !Number.isFinite(pin.y) ||
        pin.x < 0 ||
        pin.x > 1 ||
        pin.y < 0 ||
        pin.y > 1
      ) {
        return null;
      }
      answer = { kind: 'pin', pin: { x: pin.x, y: pin.y } };
    } else if (action === 'quiz:guess') {
      if (question.type !== 'broj') return null;
      const raw = data.value;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
      // Capture the share of the round clock still left — the speed bonus at
      // results scales with this.
      const speedFraction = Math.max(
        0,
        Math.min(1, this.state.phaseTimeRemaining / question.timeLimit)
      );
      answer = { kind: 'value', value: normalizeGuess(raw, question), speedFraction };
    } else {
      return null;
    }

    this.state.answers.set(playerId, answer);

    if (this.allExpectedAnswered(room)) {
      this.transitionToResults(room);
    }

    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // A disconnect callback only fires after the 5-min grace period, so
    // by the time we get here the player is genuinely gone — release
    // their slot from the answerer snapshot so the round can early-exit
    // once the rest answer.
    this.state.expectedAnswererIds.delete(playerId);
    if (this.state.phase === 'answering' && this.allExpectedAnswered(room)) {
      this.transitionToResults(room);
    }
    return this.buildGameState(room);
  }

  private allExpectedAnswered(room: Room): boolean {
    if (this.state.phase !== 'answering') return false;
    for (const id of this.state.expectedAnswererIds) {
      if (this.state.answers.has(id)) continue;
      const stillInRoom = room.players.some((p) => p.id === id);
      if (!stillInRoom) continue; // gone past grace — release their slot
      return false; // mid-grace or actively connected — wait for them
    }
    return true;
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    this.state.phaseTimeRemaining -= deltaMs / 1000;

    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }

    return this.buildGameState(room);
  }

  onEnd(_room: Room, _gameState: GameState): void {
    // cleanup
  }

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'showing-question': {
        // The pack may still be loading; keep waiting one preview beat if so.
        if (this.state.questions.length === 0) {
          this.state.phaseTimeRemaining =
            this.timings.SHOWING_QUESTION_DURATION ?? SHOWING_QUESTION_DURATION;
          return;
        }
        this.state.phase = 'answering';
        this.state.phaseTimeRemaining = this.currentQuestion()!.timeLimit;
        this.state.questionStartTime = Date.now();
        this.state.answers = new Map();
        this.state.expectedAnswererIds = new Set(
          room.players.filter((p) => p.isConnected).map((p) => p.id)
        );
        break;
      }

      case 'answering':
        this.transitionToResults(room);
        break;

      case 'showing-results':
        // The results screen already shows each player's round score + running
        // total, so a per-question leaderboard would just repeat it. Skip
        // straight to the next question; the ranked standings only appear once
        // at the very end as the final payoff.
        if (this.state.currentQuestionIndex < this.state.questions.length - 1) {
          this.state.currentQuestionIndex++;
          this.state.phase = 'showing-question';
          this.state.phaseTimeRemaining =
            this.timings.SHOWING_QUESTION_DURATION ?? SHOWING_QUESTION_DURATION;
          this.state.answers = new Map();
        } else {
          this.state.phase = 'leaderboard';
          this.state.phaseTimeRemaining =
            this.timings.LEADERBOARD_DURATION ?? LEADERBOARD_DURATION;
        }
        break;

      case 'leaderboard':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        break;
    }
  }

  private transitionToResults(room: Room): void {
    const question = this.currentQuestion();
    this.state.lastRoundScores = new Map();
    this.state.lastRoundDistances = new Map();

    if (question?.type === 'geo') {
      for (const [playerId, answer] of this.state.answers) {
        if (answer.kind !== 'pin') continue;
        const { lat, lng } = packPinToLatLng(
          question.map,
          answer.pin.x,
          answer.pin.y
        );
        const km = haversineKm(
          { lat, lng },
          { lat: question.lat, lng: question.lng }
        );
        const decayKm = question.map
          ? decayKmForMapDiagonal(bboxDiagonalKm(question.map.bbox))
          : SERBIA_DECAY_KM;
        const points = pointsForDistanceKm(km, decayKm);
        this.state.lastRoundScores.set(playerId, points);
        this.state.lastRoundDistances.set(playerId, km);
        const player = room.players.find((p) => p.id === playerId);
        if (player) player.score += points;
      }
    } else if (question?.type === 'broj') {
      const span = question.max - question.min;
      for (const [playerId, answer] of this.state.answers) {
        if (answer.kind !== 'value') continue;
        const distance = Math.abs(answer.value - question.answer);
        const points = pointsForGuess(distance, span, answer.speedFraction);
        this.state.lastRoundScores.set(playerId, points);
        this.state.lastRoundDistances.set(playerId, distance);
        const player = room.players.find((p) => p.id === playerId);
        if (player) player.score += points;
      }
    }

    this.state.phase = 'showing-results';
    const rich = question?.type === 'geo' || question?.type === 'broj';
    this.state.phaseTimeRemaining = rich
      ? (this.timings.RICH_RESULTS_DURATION ?? RICH_RESULTS_DURATION)
      : (this.timings.SHOWING_RESULTS_DURATION ?? SHOWING_RESULTS_DURATION);
  }

  private currentQuestion(): KvizQuestionFull | undefined {
    return this.state.questions[this.state.currentQuestionIndex];
  }

  private buildGameState(room: Room): GameState {
    const question = this.currentQuestion();
    const connectedPlayers = room.players.filter((p) => p.isConnected);

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      questionIndex: this.state.currentQuestionIndex,
      totalQuestions: this.state.questions.length,
    };
    if (question) data.questionType = question.type;

    const playerData: Record<string, Record<string, unknown>> = {};

    // Pack still loading — clients show the existing "get ready" screen.
    if (!question) {
      data.loading = true;
      return this.wrapState(data, playerData);
    }

    switch (this.state.phase) {
      case 'showing-question':
        data.questionText = question.text;
        if (question.imageUrl) data.imageUrl = question.imageUrl;
        data.previewDuration =
          this.timings.SHOWING_QUESTION_DURATION ?? SHOWING_QUESTION_DURATION;
        // Prompt-only extras per type — never the answer.
        if (question.type === 'geo') {
          if (question.caption) data.caption = question.caption;
          if (question.mapImageUrl) data.mapImageUrl = question.mapImageUrl;
        } else if (question.type === 'audio') {
          data.audioUrl = question.audioUrl;
        } else if (question.type === 'video') {
          data.video = question.video;
        }
        break;

      case 'answering':
        data.questionText = question.text;
        if (question.imageUrl) data.imageUrl = question.imageUrl;
        data.timeLimit = question.timeLimit;
        data.answeredCount = this.state.answers.size;
        data.totalPlayers = connectedPlayers.length;
        // Names for the TV's "waiting on..." chips — who answered, not what.
        data.expectedIds = Array.from(this.state.expectedAnswererIds);
        data.answeredIds = Array.from(this.state.answers.keys());

        if (question.type === 'geo') {
          if (question.caption) data.caption = question.caption;
          if (question.mapImageUrl) data.mapImageUrl = question.mapImageUrl;
        } else if (question.type === 'broj') {
          data.min = question.min;
          data.max = question.max;
          if (question.step !== undefined) data.step = question.step;
          if (question.unit) data.unit = question.unit;
          if (question.valueType) data.valueType = question.valueType;
          if (question.emoji) data.emoji = question.emoji;
        } else {
          data.options = question.options;
          if (question.type === 'audio') data.audioUrl = question.audioUrl;
          if (question.type === 'video') data.video = question.video;
        }

        for (const player of room.players) {
          const answer = this.state.answers.get(player.id);
          const pd: Record<string, unknown> = { hasAnswered: !!answer };
          if (answer?.kind === 'choice') pd.selectedIndex = answer.optionIndex;
          else pd.selectedIndex = null;
          if (answer?.kind === 'pin') pd.ownPin = answer.pin;
          if (answer?.kind === 'value') pd.ownGuess = answer.value;
          playerData[player.id] = pd;
        }
        break;

      case 'showing-results': {
        if (question.type === 'geo') {
          data.geoResult = this.buildGeoResult(room, question);
          this.fillRichResultPlayerData(room, playerData);
        } else if (question.type === 'broj') {
          data.brojResult = this.buildBrojResult(room, question);
          this.fillRichResultPlayerData(room, playerData);
          for (const player of room.players) {
            const answer = this.state.answers.get(player.id);
            if (answer?.kind === 'value') {
              playerData[player.id].ownGuess = answer.value;
              playerData[player.id].wasExact = answer.value === question.answer;
            }
          }
        } else {
          const results: QuizResultData = {
            question: { ...question, correctIndex: question.correctIndex },
            answers: Array.from(this.state.answers.entries()).flatMap(
              ([playerId, a]) =>
                a.kind === 'choice'
                  ? [
                      {
                        playerId,
                        optionIndex: a.optionIndex,
                        timeMs: a.timeMs,
                        correct: a.correct,
                      },
                    ]
                  : []
            ),
            scores: room.players.map((p) => {
              const answer = this.state.answers.get(p.id);
              let roundScore = 0;
              if (answer?.kind === 'choice' && answer.correct) {
                const timeRemaining = Math.max(
                  0,
                  question.timeLimit * 1000 - answer.timeMs
                );
                roundScore = Math.round(
                  1000 * (timeRemaining / (question.timeLimit * 1000))
                );
              }
              return {
                playerId: p.id,
                roundScore,
                totalScore: p.score,
              };
            }),
          };
          data.results = results;
        }
        break;
      }

      case 'leaderboard': {
        const leaderboard: QuizLeaderboardEntry[] = room.players
          .map((p) => ({
            playerId: p.id,
            name: p.name,
            avatarColor: p.avatarColor,
            score: p.score,
            rank: 0,
          }))
          .sort((a, b) => b.score - a.score)
          .map((entry, i) => ({ ...entry, rank: i + 1 }));
        data.leaderboard = leaderboard;
        break;
      }
    }

    return this.wrapState(data, playerData);
  }

  /** Own distance/points slice for geo/broj results. */
  private fillRichResultPlayerData(
    room: Room,
    playerData: Record<string, Record<string, unknown>>
  ): void {
    for (const player of room.players) {
      playerData[player.id] = {
        ownDistance: this.state.lastRoundDistances.get(player.id) ?? null,
        ownPoints: this.state.lastRoundScores.get(player.id) ?? 0,
      };
    }
  }

  private buildGeoResult(room: Room, question: KvizGeoQuestionFull) {
    const truePin = packLatLngToPin(question.map, question.lat, question.lng);
    const results = room.players
      .filter((p) => p.isConnected || this.state.answers.has(p.id))
      .map((p) => {
        const answer = this.state.answers.get(p.id);
        const pin = answer?.kind === 'pin' ? answer.pin : null;
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          pin,
          distanceKm: this.state.lastRoundDistances.get(p.id) ?? null,
          roundScore: this.state.lastRoundScores.get(p.id) ?? 0,
          totalScore: p.score,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore);

    return {
      imageUrl: question.imageUrl,
      caption: question.caption,
      lat: question.lat,
      lng: question.lng,
      truePin,
      mapImageUrl: question.mapImageUrl,
      results,
    };
  }

  private buildBrojResult(
    room: Room,
    question: KvizBrojQuestionFull
  ): KvizBrojRoundResult {
    const results = room.players
      .filter((p) => p.isConnected || this.state.answers.has(p.id))
      .map((p) => {
        const answer = this.state.answers.get(p.id);
        const guess = answer?.kind === 'value' ? answer.value : null;
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          guess,
          distance: this.state.lastRoundDistances.get(p.id) ?? null,
          roundScore: this.state.lastRoundScores.get(p.id) ?? 0,
          totalScore: p.score,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore);

    return {
      trueValue: question.answer,
      min: question.min,
      max: question.max,
      step: question.step,
      unit: question.unit,
      valueType: question.valueType,
      results,
    };
  }

  private wrapState(
    data: Record<string, unknown>,
    playerData: Record<string, Record<string, unknown>>
  ): GameState {
    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentQuestionIndex + 1,
      totalRounds: this.state.questions.length,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }
}
