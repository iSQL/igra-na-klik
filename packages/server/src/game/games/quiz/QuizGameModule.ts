import type {
  Room,
  GameState,
  KvizAnagramQuestionFull,
  KvizBrojQuestionFull,
  KvizBrojRoundResult,
  KvizDominoQuestionFull,
  KvizDominoRoundResult,
  KvizDopunaQuestionFull,
  KvizEmojiQuestionFull,
  KvizEmojiRoundResult,
  KvizGeoQuestionFull,
  KvizMatricaQuestionFull,
  KvizMatricaRoundResult,
  KvizPikselQuestionFull,
  KvizQuestionFull,
  KvizQuestionType,
  KvizRedosledQuestionFull,
  KvizRedosledRoundResult,
  KvizTextRoundResult,
  QuizLeaderboardEntry,
  QuizResultData,
} from '@igra/shared';
import {
  KVIZ_BANK_PACK_ID,
  QUIZ_QUESTION_BANK,
  bboxDiagonalKm,
  checkEmojiGuess,
  checkTextGuess,
  clampGameRounds,
  haversineKm,
  packLatLngToPin,
  packPinToLatLng,
  parseQuizImport,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import { recordQuizFeedback } from '../../quiz-feedback.js';
import type { DiplomaCandidate } from '@igra/shared';
import type {
  QuizAnswer,
  QuizInternalState,
  QuizPlayerStats,
  QuizRoundShame,
} from './QuizState.js';
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
  'uljez',
  'dopuna',
  'piksel',
  'anagram',
  'redosled',
  'domino',
  'matrica',
];

/** Free-text types sharing the emoji guess/retry machinery. */
type KvizTextQuestionFull =
  | KvizEmojiQuestionFull
  | KvizDopunaQuestionFull
  | KvizPikselQuestionFull
  | KvizAnagramQuestionFull;

const TEXT_TYPES: ReadonlySet<KvizQuestionType> = new Set([
  'emoji',
  'dopuna',
  'piksel',
  'anagram',
]);

function isTextQuestion(q: KvizQuestionFull): q is KvizTextQuestionFull {
  return TEXT_TYPES.has(q.type);
}

export class QuizGameModule extends BaseGameModule {
  readonly gameId = 'quiz';

  private state!: QuizInternalState;
  private timings: Record<string, number> = {};
  private desiredRounds = 0;
  // Runtime question id → stable feedback key (`pack:<packId>:<index>` or
  // `bank:<index>`). Built as questions load; inline custom questions have no
  // persistable source and are simply absent (their feedback is dropped).
  private feedbackKeys = new Map<string, string>();
  // Dedupe: `<playerId>|<questionId>|<report|rating>` already submitted.
  private feedbackSeen = new Set<string>();

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
      scramble: '',
      scramblePool: [],
      scrambleFixed: 0,
      dominoProgress: new Map(),
      playerStats: new Map(),
      lastShame: null,
    };

    // Reset feedback bookkeeping for this match. Bank keys are always known
    // (the bank is a fallback for every source path); pack keys are added as
    // packs resolve in loadPacks.
    this.feedbackKeys.clear();
    this.feedbackSeen.clear();
    this.registerBankFeedbackKeys();

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

  /** Map the built-in bank's runtime ids to `bank:<index>` feedback keys. */
  private registerBankFeedbackKeys(): void {
    QUIZ_QUESTION_BANK.forEach((q, i) => {
      this.feedbackKeys.set(q.id, `bank:${i}`);
    });
  }

  /**
   * Map one pack's runtime question ids to `pack:<packId>:<index>` keys. The
   * resolver assigns ids as `pack-<packId>-<i+1>`, so array position === the
   * question's index in the manifest — what the admin editor joins against.
   */
  private registerPackFeedbackKeys(
    packId: string,
    questions: KvizQuestionFull[]
  ): void {
    questions.forEach((q, i) => {
      this.feedbackKeys.set(q.id, `pack:${packId}:${i}`);
    });
  }

  /**
   * Handle a `quiz:feedback` player action: a report-as-wrong flag and/or a
   * 1–5 rating for a question the player identifies by its runtime id. Ignored
   * for unknown/unmapped ids (e.g. inline custom questions) and deduped so one
   * player can report / rate each question at most once per match.
   */
  private handleFeedback(playerId: string, data: Record<string, unknown>): void {
    const questionId = typeof data.questionId === 'string' ? data.questionId : '';
    if (!questionId) return;
    const key = this.feedbackKeys.get(questionId);
    if (!key) return; // inline custom or stale id — nothing to persist against.

    const report = data.report === true;
    const ratingRaw = data.rating;
    const rating =
      typeof ratingRaw === 'number' &&
      Number.isInteger(ratingRaw) &&
      ratingRaw >= 1 &&
      ratingRaw <= 5
        ? ratingRaw
        : undefined;

    const payload: { report?: boolean; rating?: number } = {};
    if (report && !this.feedbackSeen.has(`${playerId}|${questionId}|report`)) {
      this.feedbackSeen.add(`${playerId}|${questionId}|report`);
      payload.report = true;
    }
    if (rating !== undefined && !this.feedbackSeen.has(`${playerId}|${questionId}|rating`)) {
      this.feedbackSeen.add(`${playerId}|${questionId}|rating`);
      payload.rating = rating;
    }
    if (payload.report || payload.rating !== undefined) {
      recordQuizFeedback(key, payload);
    }
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
        this.registerPackFeedbackKeys(resolved[i]!.id, resolved[i]!.questions);
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
    // Feedback (report-as-wrong / 1–5 rating) is accepted in any phase and
    // doesn't change game state — handle it before the answering gate.
    if (action === 'quiz:feedback') {
      this.handleFeedback(playerId, data);
      return null;
    }

    if (this.state.phase !== 'answering') return null;
    if (this.state.answers.has(playerId)) return null;
    const question = this.currentQuestion();
    if (!question) return null;
    if (!room.players.some((p) => p.id === playerId && p.isConnected)) {
      return null;
    }

    let answer: QuizAnswer | null = null;

    if (action === 'quiz:answer') {
      if (!('options' in question)) return null;
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
      if (!isTextQuestion(question)) return null;
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text) return null;
      this.state.emojiLastGuess.set(playerId, text);
      // Emoji keeps exact-normalized matching; the new text types tolerate
      // small typos (fuzzy Levenshtein).
      const solved =
        question.type === 'emoji'
          ? checkEmojiGuess(text, question)
          : checkTextGuess(text, question);
      if (!solved) {
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
    } else if (action === 'quiz:order') {
      if (question.type !== 'redosled') return null;
      const raw = data.order;
      const n = question.items.length;
      if (!Array.isArray(raw) || raw.length !== n) return null;
      const order = raw.map((v) => (typeof v === 'number' ? v : -1));
      // Must be a permutation of 0..n-1 (indices into the presented items).
      const seen = new Set<number>();
      for (const v of order) {
        if (!Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) return null;
        seen.add(v);
      }
      answer = { kind: 'order', order };
    } else if (action === 'quiz:matrix') {
      if (question.type !== 'matrica') return null;
      const raw = data.cells;
      if (!Array.isArray(raw) || raw.length !== question.correct.length) return null;
      const n = question.cells.length;
      const seen = new Set<number>();
      const cells: number[] = [];
      for (const v of raw) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) {
          return null;
        }
        seen.add(v);
        cells.push(v);
      }
      const correctSet = new Set(question.correct);
      let hit = 0;
      for (const v of cells) if (correctSet.has(v)) hit++;
      const timeMs = Date.now() - this.state.questionStartTime;
      const timeRemaining = Math.max(0, question.timeLimit * 1000 - timeMs);
      const points = Math.round(
        1000 * (timeRemaining / (question.timeLimit * 1000)) * (hit / question.correct.length)
      );
      const player = room.players.find((p) => p.id === playerId);
      if (player) player.score += points;
      answer = { kind: 'matrix', cells, hit, points };
    } else if (action === 'quiz:domino') {
      if (question.type !== 'domino') return null;
      const dir = data.answer;
      if (dir !== 'before' && dir !== 'after') return null;
      const items = question.items;
      const prog =
        this.state.dominoProgress.get(playerId) ?? { pos: 1, streak: 0, done: false };
      if (prog.done || prog.pos >= items.length) return this.buildGameState(room);
      const correctDir =
        items[prog.pos].value >= items[prog.pos - 1].value ? 'after' : 'before';
      if (dir === correctDir) {
        prog.streak++;
        prog.pos++;
        if (prog.pos >= items.length) prog.done = true;
      } else {
        prog.done = true;
        prog.wrongAt = prog.pos;
      }
      this.state.dominoProgress.set(playerId, prog);
      if (prog.done) {
        this.state.answers.set(playerId, { kind: 'domino', streak: prog.streak });
        if (this.allExpectedAnswered(room)) this.transitionToResults(room);
      }
      return this.buildGameState(room);
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
      if (question?.type === 'anagram') this.maybeAdvanceScramble(question);
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
          if (q.type === 'anagram') {
            this.initScramble(q);
          } else {
            this.state.scramble = '';
            this.state.scramblePool = [];
            this.state.scrambleFixed = 0;
          }
          this.state.dominoProgress = new Map();
          if (q.type === 'domino') {
            for (const id of this.state.expectedAnswererIds) {
              this.state.dominoProgress.set(id, { pos: 1, streak: 0, done: false });
            }
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
    } else if (question?.type === 'redosled') {
      // Pairwise concordance: exact order = 1000, random ≈ 0.
      // lastRoundDistances doubles as the accuracy store (0–100 % of pairs).
      const totalPairs =
        (question.items.length * (question.items.length - 1)) / 2;
      for (const [playerId, answer] of this.state.answers) {
        if (answer.kind !== 'order') continue;
        let concordant = 0;
        for (let i = 0; i < answer.order.length; i++) {
          for (let j = i + 1; j < answer.order.length; j++) {
            if (question.order[answer.order[i]] < question.order[answer.order[j]]) {
              concordant++;
            }
          }
        }
        const frac = totalPairs > 0 ? concordant / totalPairs : 0;
        const points = Math.round(1000 * Math.max(0, 2 * frac - 1));
        this.state.lastRoundScores.set(playerId, points);
        this.state.lastRoundDistances.set(playerId, Math.round(frac * 100));
        const player = room.players.find((p) => p.id === playerId);
        if (player) player.score += points;
      }
    } else if (question?.type === 'domino') {
      // Streak scoring: proportional to the consecutive-correct run, capped at
      // 1000 for a full clear. lastRoundDistances doubles as the streak store.
      const maxStreak = Math.max(1, question.items.length - 1);
      for (const id of this.state.expectedAnswererIds) {
        const prog = this.state.dominoProgress.get(id);
        const streak = prog ? prog.streak : 0;
        const points = Math.round(1000 * Math.min(1, streak / maxStreak));
        this.state.lastRoundScores.set(id, points);
        this.state.lastRoundDistances.set(id, streak);
        const player = room.players.find((p) => p.id === id);
        if (player) player.score += points;
      }
    }
    // matrica is scored on submit (in onPlayerAction); nothing to do here.

    // Fold this round into the cross-game diploma stats + build the Zid srama.
    this.accumulateStats(room, question);

    this.state.phase = 'showing-results';
    const rich =
      question?.type === 'geo' ||
      question?.type === 'broj' ||
      question?.type === 'redosled' ||
      question?.type === 'domino' ||
      question?.type === 'matrica' ||
      (question ? isTextQuestion(question) : false);
    this.state.phaseTimeRemaining = rich
      ? (this.timings.RICH_RESULTS_DURATION ?? RICH_RESULTS_DURATION)
      : (this.timings.SHOWING_RESULTS_DURATION ?? SHOWING_RESULTS_DURATION);
  }

  private static emptyStats(): QuizPlayerStats {
    return {
      answered: 0,
      correct: 0,
      wrong: 0,
      wrongStreakCur: 0,
      wrongStreakMax: 0,
      timeSamples: 0,
      slownessSum: 0,
    };
  }

  /**
   * Fold the just-finished round into per-player stats and compute this round's
   * "Zid srama". Runs once per round at results time — the single point where
   * every question type's transient correctness/timing is still known before
   * `answers` is cleared for the next round.
   */
  private accumulateStats(room: Room, question: KvizQuestionFull | undefined): void {
    if (!question) {
      this.state.lastShame = null;
      return;
    }
    const timeLimitMs = Math.max(1, question.timeLimit * 1000);
    // Per-round timeMs for connected answerers (drives the "Puž" trophy).
    const roundTimeMs = new Map<string, number>();

    for (const id of this.state.expectedAnswererIds) {
      const stats =
        this.state.playerStats.get(id) ?? QuizGameModule.emptyStats();
      const answer = this.state.answers.get(id);
      // Text types store only a SOLVED answer; a wrong-only attempt shows up in
      // emojiLastGuess, so count that as an attempt too.
      const attempted = !!answer || this.state.emojiLastGuess.has(id);

      let correct = false;
      let timeMs: number | undefined;
      if (answer) {
        switch (answer.kind) {
          case 'choice':
            correct = answer.correct;
            timeMs = answer.timeMs;
            break;
          case 'text':
            correct = true;
            timeMs = answer.timeMs;
            break;
          case 'matrix':
            correct = answer.points >= 500;
            break;
          case 'value':
            correct = (this.state.lastRoundScores.get(id) ?? 0) >= 500;
            timeMs = Math.round((1 - answer.speedFraction) * timeLimitMs);
            break;
          case 'pin':
          case 'order':
          case 'domino':
            correct = (this.state.lastRoundScores.get(id) ?? 0) >= 500;
            break;
        }
      }

      if (attempted) {
        stats.answered++;
        if (correct) {
          stats.correct++;
          stats.wrongStreakCur = 0;
        } else {
          stats.wrong++;
          stats.wrongStreakCur++;
          stats.wrongStreakMax = Math.max(
            stats.wrongStreakMax,
            stats.wrongStreakCur
          );
        }
      }

      if (timeMs !== undefined) {
        const slowness = Math.max(0, Math.min(1, timeMs / timeLimitMs));
        stats.slownessSum += slowness;
        stats.timeSamples++;
        roundTimeMs.set(id, timeMs);
      }
      this.state.playerStats.set(id, stats);
    }

    this.state.lastShame = this.buildRoundShame(room, timeLimitMs, roundTimeMs);
  }

  /** Slowest answerer + anyone on a ≥3 wrong streak, connected players only. */
  private buildRoundShame(
    room: Room,
    timeLimitMs: number,
    roundTimeMs: Map<string, number>
  ): QuizRoundShame | null {
    const isConnected = (id: string) =>
      room.players.some((p) => p.id === id && p.isConnected);
    const playerOf = (id: string) => room.players.find((p) => p.id === id);

    // Puž: the round's slowest answer, only if genuinely slow (>60% of clock)
    // and at least two people answered — no shame in a fast, sparse round.
    let snail: QuizRoundShame['snail'] = null;
    if (roundTimeMs.size >= 2) {
      let snailId: string | null = null;
      let snailTime = -1;
      for (const [id, t] of roundTimeMs) {
        if (isConnected(id) && t > snailTime) {
          snailTime = t;
          snailId = id;
        }
      }
      const p = snailId ? playerOf(snailId) : undefined;
      if (p && snailTime >= timeLimitMs * 0.6) {
        snail = {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          timeMs: snailTime,
        };
      }
    }

    const wrongStreak: QuizRoundShame['wrongStreak'] = [];
    for (const id of this.state.expectedAnswererIds) {
      if (!isConnected(id)) continue;
      const s = this.state.playerStats.get(id);
      const p = playerOf(id);
      if (s && p && s.wrongStreakCur >= 3) {
        wrongStreak.push({
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          streak: s.wrongStreakCur,
        });
      }
    }

    return snail || wrongStreak.length > 0 ? { snail, wrongStreak } : null;
  }

  /**
   * Rich end-of-game diploma candidates from the accumulated stats. Merged with
   * the generic score-based layer by GameManager; the winner is protected from
   * shame titles there.
   */
  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.state.playerStats.entries()]
      .filter(([id]) => room.players.some((p) => p.id === id))
      .map(([id, s]) => ({
        id,
        s,
        accuracy: s.answered > 0 ? s.correct / s.answered : 0,
        avgSlowness: s.timeSamples > 0 ? s.slownessSum / s.timeSamples : null,
      }))
      .filter((e) => e.s.answered > 0);

    if (entries.length === 0) return candidates;
    const timed = entries.filter(
      (e): e is typeof e & { avgSlowness: number } => e.avgSlowness !== null
    );

    // Sigurica — accurate but deliberate (a compliment; ranks above Puž so a
    // slow-but-accurate player gets praised, not shamed).
    const sig = timed.filter((e) => e.accuracy >= 0.7 && e.avgSlowness >= 0.4);
    if (sig.length > 0) {
      const s = sig.reduce((a, b) => (b.avgSlowness > a.avgSlowness ? b : a));
      candidates.push({ playerId: s.id, awardId: 'sigurica', priority: 58 });
    }

    // Najbrži prst — quick on the trigger, poor on the answers.
    const fastWrong = timed.filter((e) => e.accuracy < 0.5 && e.s.answered >= 2);
    if (fastWrong.length > 0) {
      const fp = fastWrong.reduce((a, b) => (b.avgSlowness < a.avgSlowness ? b : a));
      if (fp.avgSlowness <= 0.5) {
        candidates.push({ playerId: fp.id, awardId: 'najbrzi-prst', priority: 55 });
      }
    }

    // Gospodar panike — the most wrong answers.
    const paniker = entries.reduce((a, b) => (b.s.wrong > a.s.wrong ? b : a));
    if (paniker.s.wrong >= 2) {
      candidates.push({
        playerId: paniker.id,
        awardId: 'gospodar-panike',
        priority: 50,
      });
    }

    // Kamikaza — answers everything, lands little.
    const maxAnswered = Math.max(...entries.map((e) => e.s.answered));
    const kamikaze = entries.find(
      (e) => e.s.answered === maxAnswered && e.accuracy < 0.4
    );
    if (kamikaze) {
      candidates.push({ playerId: kamikaze.id, awardId: 'kamikaza', priority: 48 });
    }

    // Puž — the overall slowest.
    if (timed.length > 0) {
      const puz = timed.reduce((a, b) => (b.avgSlowness > a.avgSlowness ? b : a));
      if (puz.avgSlowness >= 0.5) {
        candidates.push({ playerId: puz.id, awardId: 'puz', priority: 45 });
      }
    }

    return candidates;
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
    if (question) {
      data.questionType = question.type;
      // Runtime id so the controller can attach report/rating feedback to the
      // right question (see handleFeedback). Not sensitive — carries no answer.
      data.questionId = question.id;
    }

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
          if (question.category) data.emojiCategory = question.category;
        } else if (question.type === 'dopuna') {
          data.quote = question.quote;
        } else if (question.type === 'redosled') {
          data.items = question.items;
        } else if (question.type === 'matrica') {
          data.cells = question.cells;
        } else if (question.type === 'domino') {
          data.lowerLabel = question.lowerLabel;
          data.higherLabel = question.higherLabel;
          data.dominoTotal = question.items.length;
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
          if (question.category) data.emojiCategory = question.category;
          data.hint = this.state.hint;
          data.answerLength = this.answerLetterCount(question.answer);
        } else if (question.type === 'dopuna') {
          data.quote = question.quote;
          data.answerLength = this.answerLetterCount(question.answer);
        } else if (question.type === 'piksel') {
          data.answerLength = this.answerLetterCount(question.answer);
        } else if (question.type === 'anagram') {
          data.scramble = this.state.scramble;
        } else if (question.type === 'redosled') {
          data.items = question.items;
        } else if (question.type === 'matrica') {
          data.cells = question.cells;
        } else if (question.type === 'domino') {
          data.lowerLabel = question.lowerLabel;
          data.higherLabel = question.higherLabel;
          data.dominoTotal = question.items.length;
          if (question.unit) data.unit = question.unit;
          if (question.valueType) data.valueType = question.valueType;
          // Public streak board for the TV (counts only — not secret).
          data.dominoBoard = connectedPlayers.map((p) => {
            const prog =
              this.state.dominoProgress.get(p.id) ?? { pos: 1, streak: 0, done: false };
            return { playerId: p.id, streak: prog.streak, done: prog.done };
          });
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
          if (answer?.kind === 'order') pd.ownOrder = answer.order;
          if (answer?.kind === 'matrix') pd.ownCells = answer.cells;
          if (isTextQuestion(question)) {
            pd.ownGuess = this.state.emojiLastGuess.get(player.id) ?? null;
            pd.lastWrong = this.state.emojiWrong.get(player.id) ?? null;
            if (answer?.kind === 'text') pd.ownPoints = answer.points;
          }
          if (question.type === 'domino') {
            const prog =
              this.state.dominoProgress.get(player.id) ?? { pos: 1, streak: 0, done: false };
            const items = question.items;
            pd.streak = prog.streak;
            pd.done = prog.done;
            // Reference = the previously-shown item (label + value revealed);
            // current = the item to place (label only — value stays hidden).
            const refIdx = Math.min(prog.pos - 1, items.length - 1);
            const ref = items[refIdx];
            pd.reference = { label: ref.label, value: ref.value };
            if (!prog.done && prog.pos < items.length) {
              pd.current = { label: items[prog.pos].label };
            } else {
              pd.current = null;
            }
          }
          playerData[player.id] = pd;
        }
        break;

      case 'showing-results': {
        // Zid srama for the round just finished (null when nobody earned one).
        if (this.state.lastShame) data.shame = this.state.lastShame;
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
        } else if (
          question.type === 'dopuna' ||
          question.type === 'piksel' ||
          question.type === 'anagram'
        ) {
          data.textResult = this.buildTextResult(room, question);
          for (const player of room.players) {
            const answer = this.state.answers.get(player.id);
            playerData[player.id] = {
              ownPoints: answer?.kind === 'text' ? answer.points : 0,
              hasSolved: answer?.kind === 'text',
              ownGuess: this.state.emojiLastGuess.get(player.id) ?? null,
            };
          }
        } else if (question.type === 'redosled') {
          data.redosledResult = this.buildRedosledResult(room, question);
          for (const player of room.players) {
            playerData[player.id] = {
              ownPoints: this.state.lastRoundScores.get(player.id) ?? 0,
              ownAccuracy: this.state.lastRoundDistances.get(player.id) ?? null,
            };
          }
        } else if (question.type === 'domino') {
          data.dominoResult = this.buildDominoResult(room, question);
          for (const player of room.players) {
            playerData[player.id] = {
              ownPoints: this.state.lastRoundScores.get(player.id) ?? 0,
              ownStreak: this.state.lastRoundDistances.get(player.id) ?? 0,
            };
          }
        } else if (question.type === 'matrica') {
          data.matricaResult = this.buildMatricaResult(room, question);
          for (const player of room.players) {
            const answer = this.state.answers.get(player.id);
            playerData[player.id] = {
              ownPoints: answer?.kind === 'matrix' ? answer.points : 0,
              ownHit: answer?.kind === 'matrix' ? answer.hit : null,
              ownCells: answer?.kind === 'matrix' ? answer.cells : null,
            };
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
      category: question.category,
      results,
    };
  }

  /** Results for the free-text types dopuna/piksel/anagram. */
  private buildTextResult(
    room: Room,
    question: KvizDopunaQuestionFull | KvizPikselQuestionFull | KvizAnagramQuestionFull
  ): KvizTextRoundResult {
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
      kind: question.type,
      answer: question.answer,
      quote: question.type === 'dopuna' ? question.quote : undefined,
      imageUrl: question.type === 'piksel' ? question.imageUrl : undefined,
      results,
    };
  }

  private buildRedosledResult(
    room: Room,
    question: KvizRedosledQuestionFull
  ): KvizRedosledRoundResult {
    // question.order[i] = correct rank of presented items[i]; invert it to
    // list the items in the correct order for the reveal.
    const correctItems = new Array<string>(question.items.length);
    for (let i = 0; i < question.items.length; i++) {
      correctItems[question.order[i]] = question.items[i];
    }
    const results = room.players
      .filter((p) => p.isConnected || this.state.answers.has(p.id))
      .map((p) => {
        const answer = this.state.answers.get(p.id);
        const arrangement = answer?.kind === 'order' ? answer.order : null;
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          arrangement,
          accuracy: arrangement
            ? (this.state.lastRoundDistances.get(p.id) ?? null)
            : null,
          roundScore: this.state.lastRoundScores.get(p.id) ?? 0,
          totalScore: p.score,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore);

    return {
      text: question.text,
      correctItems,
      presentedItems: question.items,
      results,
    };
  }

  private buildDominoResult(
    room: Room,
    question: KvizDominoQuestionFull
  ): KvizDominoRoundResult {
    const results = room.players
      .filter((p) => p.isConnected || this.state.answers.has(p.id))
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        streak: this.state.lastRoundDistances.get(p.id) ?? 0,
        roundScore: this.state.lastRoundScores.get(p.id) ?? 0,
        totalScore: p.score,
      }))
      .sort((a, b) => b.roundScore - a.roundScore);

    return {
      text: question.text,
      lowerLabel: question.lowerLabel,
      higherLabel: question.higherLabel,
      unit: question.unit,
      valueType: question.valueType,
      items: question.items,
      maxStreak: Math.max(1, question.items.length - 1),
      results,
    };
  }

  private buildMatricaResult(
    room: Room,
    question: KvizMatricaQuestionFull
  ): KvizMatricaRoundResult {
    const results = room.players
      .filter((p) => p.isConnected || this.state.answers.has(p.id))
      .map((p) => {
        const answer = this.state.answers.get(p.id);
        const selected = answer?.kind === 'matrix' ? answer.cells : null;
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          selected,
          hit: answer?.kind === 'matrix' ? answer.hit : null,
          roundScore: answer?.kind === 'matrix' ? answer.points : 0,
          totalScore: p.score,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore);

    return {
      text: question.text,
      cells: question.cells,
      correct: question.correct,
      explanation: question.explanation,
      results,
    };
  }

  // --- Anagram progressive unscramble -------------------------------------

  /** Uppercase letters of the answer at non-space positions. */
  private initScramble(question: KvizAnagramQuestionFull): void {
    const answer = question.answer.toUpperCase();
    const letters: string[] = [];
    for (const ch of answer) if (ch !== ' ') letters.push(ch);
    // Reshuffle a few times if the shuffle lands on the solution itself.
    let pool = shuffled(letters);
    for (let tries = 0; tries < 5; tries++) {
      if (letters.length < 2 || pool.join('') !== letters.join('')) break;
      pool = shuffled(letters);
    }
    this.state.scramblePool = pool;
    this.state.scrambleFixed = 0;
    this.state.scramble = this.buildScramble(question);
  }

  /**
   * Fix more leading letters into place at 25/45/65/80 % of the window, up
   * to 70 % of the letters — the rest stays for the players to solve.
   */
  private maybeAdvanceScramble(question: KvizAnagramQuestionFull): void {
    const limit = question.timeLimit;
    const elapsed = (Date.now() - this.state.questionStartTime) / 1000;
    const fraction = limit > 0 ? elapsed / limit : 1;
    const letterCount = this.state.scramblePool.length;
    const steps = [0.25, 0.45, 0.65, 0.8];
    let target = 0;
    for (let i = 0; i < steps.length; i++) {
      if (fraction >= steps[i]) {
        target = Math.floor(letterCount * 0.7 * ((i + 1) / steps.length));
      }
    }
    if (target > this.state.scrambleFixed) {
      this.state.scrambleFixed = target;
      this.state.scramble = this.buildScramble(question);
    }
  }

  /** First `scrambleFixed` letters correct, the remainder from the pool. */
  private buildScramble(question: KvizAnagramQuestionFull): string {
    const answer = question.answer.toUpperCase();
    const letters: string[] = [];
    for (const ch of answer) if (ch !== ' ') letters.push(ch);
    const fixed = Math.min(this.state.scrambleFixed, letters.length);
    const remaining = [...this.state.scramblePool];
    for (let k = 0; k < fixed; k++) {
      const at = remaining.indexOf(letters[k]);
      if (at >= 0) remaining.splice(at, 1);
    }
    let li = 0;
    let ri = 0;
    let out = '';
    for (const ch of answer) {
      if (ch === ' ') {
        out += ' ';
        continue;
      }
      out += li < fixed ? letters[li] : (remaining[ri++] ?? '?');
      li++;
    }
    return out;
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
