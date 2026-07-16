import type {
  Room,
  GameState,
  KvizBrojQuestionFull,
  KvizBrojRoundResult,
  KvizEmojiQuestionFull,
  KvizEmojiRoundResult,
  KvizGeoQuestionFull,
  KvizQuestionFull,
  KvizQuestionType,
  QuizLeaderboardEntry,
  QuizResultData,
} from '@igra/shared';
import {
  KVIZ_BANK_PACK_ID,
  QUIZ_QUESTION_BANK,
  bboxDiagonalKm,
  checkEmojiGuess,
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
  quizPackIds?: unknown;
  quizTypes?: unknown;
  roundCount?: unknown;
}

const ALL_KVIZ_TYPES: KvizQuestionType[] = [
  'obicno',
  'audio',
  'video',
  'geo',
  'broj',
  'emoji',
];

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
      emojiLastGuess: new Map(),
      emojiWrong: new Map(),
      hint: '',
      hintRevealOrder: [],
      lastHintRevealFraction: 0,
    };

    const packIds = Array.isArray(cc.quizPackIds)
      ? (cc.quizPackIds.filter((v) => typeof v === 'string') as string[])
      : [];
    const types = this.parseTypeFilter(cc.quizTypes);

    if (packIds.length > 0) {
      // Pack questions load from disk; onStart can't be async, so start with
      // an empty question list — advancePhase waits in showing-question until
      // the load resolves (or falls back to the built-in bank).
      void this.loadPacks(packIds, types);
    } else if (cc.customQuestions !== undefined) {
      const parsed = parseQuizImport(cc.customQuestions, { context: 'inline' });
      if (parsed.ok) {
        this.setQuestions(
          this.filterByTypes(
            inlineQuestionsToRuntime(parsed.manifest.questions),
            types
          )
        );
      } else {
        // Silent fallback to default bank. Host already validated.
        this.setQuestions(QUIZ_QUESTION_BANK);
      }
    } else {
      this.setQuestions(this.filterByTypes([...QUIZ_QUESTION_BANK], types));
    }

    return this.buildGameState(room);
  }

  /** Sanitize the incoming quizTypes filter; null = no filtering. */
  private parseTypeFilter(raw: unknown): KvizQuestionType[] | null {
    if (!Array.isArray(raw)) return null;
    const types = raw.filter((v): v is KvizQuestionType =>
      ALL_KVIZ_TYPES.includes(v as KvizQuestionType)
    );
    // Empty or full selection = no filter.
    if (types.length === 0 || types.length === ALL_KVIZ_TYPES.length) {
      return null;
    }
    return types;
  }

  /** Apply the type filter; an emptied pool falls back to the unfiltered one. */
  private filterByTypes(
    pool: KvizQuestionFull[],
    types: KvizQuestionType[] | null
  ): KvizQuestionFull[] {
    if (!types) return pool;
    const filtered = pool.filter((q) => types.includes(q.type));
    return filtered.length > 0 ? filtered : pool;
  }

  private setQuestions(bank: KvizQuestionFull[]): void {
    this.state.questions = shuffled(bank).slice(
      0,
      Math.min(this.desiredRounds, bank.length)
    );
  }

  /**
   * Pool questions from every selected pack (the pseudo-id '__bank__' maps to
   * the built-in bank), apply the type filter, and fall back to the built-in
   * bank if nothing resolves.
   */
  private async loadPacks(
    packIds: string[],
    types: KvizQuestionType[] | null
  ): Promise<void> {
    const pool: KvizQuestionFull[] = [];
    const resolved = await Promise.all(
      packIds.map((id) =>
        id === KVIZ_BANK_PACK_ID || !this.packsDir
          ? Promise.resolve(null)
          : resolveQuizPack(this.packsDir, id)
      )
    );
    for (let i = 0; i < packIds.length; i++) {
      if (packIds[i] === KVIZ_BANK_PACK_ID) {
        pool.push(...QUIZ_QUESTION_BANK);
      } else if (resolved[i]) {
        pool.push(...resolved[i]!.questions);
      }
    }
    if (pool.length === 0) {
      // Every pack was bad/empty — fall back so the game still runs.
      this.setQuestions(QUIZ_QUESTION_BANK);
      return;
    }
    this.setQuestions(this.filterByTypes(pool, types));
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
      if (
        question.type === 'geo' ||
        question.type === 'broj' ||
        question.type === 'emoji'
      ) {
        return null;
      }
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
    } else if (action === 'quiz:text') {
      if (question.type !== 'emoji') return null;
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text) return null;
      this.state.emojiLastGuess.set(playerId, text);
      if (!checkEmojiGuess(text, question)) {
        // Wrong guess — the player may retry until the clock runs out.
        this.state.emojiWrong.set(playerId, text);
        return this.buildGameState(room);
      }
      const timeMs = Date.now() - this.state.questionStartTime;
      const timeRemaining = Math.max(0, question.timeLimit * 1000 - timeMs);
      const points = Math.round(
        1000 * (timeRemaining / (question.timeLimit * 1000))
      );
      this.state.emojiWrong.delete(playerId);
      const player = room.players.find((p) => p.id === playerId);
      if (player) player.score += points;
      answer = { kind: 'text', timeMs, points };
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
    if (this.state.phase === 'answering') {
      const question = this.currentQuestion();
      if (question?.type === 'emoji') this.maybeRevealHint(question);
    }

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
        {
          const q = this.currentQuestion()!;
          this.state.emojiLastGuess = new Map();
          this.state.emojiWrong = new Map();
          if (q.type === 'emoji') {
            this.state.hintRevealOrder = this.getLetterIndices(q.answer);
            this.state.lastHintRevealFraction = 0;
            this.state.hint = this.buildHint(q.answer, []);
          } else {
            this.state.hint = '';
          }
        }
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
    const rich =
      question?.type === 'geo' ||
      question?.type === 'broj' ||
      question?.type === 'emoji';
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
        if ('imageUrl' in question && question.imageUrl) {
          data.imageUrl = question.imageUrl;
        }
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
        } else if (question.type === 'emoji') {
          data.emojis = question.emojis;
        }
        break;

      case 'answering':
        data.questionText = question.text;
        if ('imageUrl' in question && question.imageUrl) {
          data.imageUrl = question.imageUrl;
        }
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
        } else if (question.type === 'emoji') {
          data.emojis = question.emojis;
          data.hint = this.state.hint;
          data.answerLength = this.answerLetterCount(question.answer);
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
          if (question.type === 'emoji') {
            pd.ownGuess = this.state.emojiLastGuess.get(player.id) ?? null;
            pd.lastWrong = this.state.emojiWrong.get(player.id) ?? null;
            if (answer?.kind === 'text') pd.ownPoints = answer.points;
          }
          playerData[player.id] = pd;
        }
        break;

      case 'showing-results': {
        if (question.type === 'geo') {
          data.geoResult = this.buildGeoResult(room, question);
          this.fillRichResultPlayerData(room, playerData);
        } else if (question.type === 'emoji') {
          data.emojiResult = this.buildEmojiResult(room, question);
          for (const player of room.players) {
            const answer = this.state.answers.get(player.id);
            playerData[player.id] = {
              ownPoints: answer?.kind === 'text' ? answer.points : 0,
              hasSolved: answer?.kind === 'text',
              ownGuess: this.state.emojiLastGuess.get(player.id) ?? null,
            };
          }
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

  private buildEmojiResult(
    room: Room,
    question: KvizEmojiQuestionFull
  ): KvizEmojiRoundResult {
    const results = room.players
      .filter((p) => p.isConnected || this.state.answers.has(p.id))
      .map((p) => {
        const answer = this.state.answers.get(p.id);
        const solved = answer?.kind === 'text';
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          solved,
          timeMs: solved ? answer.timeMs : null,
          roundScore: solved ? answer.points : 0,
          totalScore: p.score,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore);

    return {
      emojis: question.emojis,
      answer: question.answer,
      results,
    };
  }

  // --- Emoji progressive letter hints (ported from Emoji zagonetke) -------

  /** Reveal in four steps at 30/50/70/85% of the window, up to ~55% letters. */
  private maybeRevealHint(question: KvizEmojiQuestionFull): void {
    const limit = question.timeLimit;
    const elapsed = (Date.now() - this.state.questionStartTime) / 1000;
    const fraction = limit > 0 ? elapsed / limit : 1;

    const revealThreshold = this.state.lastHintRevealFraction + 0.2;
    if (fraction < 0.3 || fraction < revealThreshold) return;
    this.state.lastHintRevealFraction = Math.max(revealThreshold, 0.3);

    const letters = this.state.hintRevealOrder;
    const numToReveal = Math.min(
      Math.floor(letters.length * Math.min(0.55, fraction * 0.6)),
      Math.max(0, letters.length - 1)
    );
    const revealed = letters.slice(0, numToReveal);
    const next = this.buildHint(question.answer, revealed);
    if (next !== this.state.hint) this.state.hint = next;
  }

  private buildHint(answer: string, revealedIndices: number[]): string {
    const set = new Set(revealedIndices);
    return answer
      .split('')
      .map((ch, i) => {
        if (ch === ' ') return '  ';
        if (/[\p{L}\p{N}]/u.test(ch)) return set.has(i) ? ch : '_';
        return ch; // punctuation shown as-is
      })
      .join(' ');
  }

  private getLetterIndices(answer: string): number[] {
    const indices: number[] = [];
    for (let i = 0; i < answer.length; i++) {
      if (/[\p{L}\p{N}]/u.test(answer[i])) indices.push(i);
    }
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  private answerLetterCount(answer: string): number {
    let n = 0;
    for (const ch of answer) if (/[\p{L}\p{N}]/u.test(ch)) n++;
    return n;
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
