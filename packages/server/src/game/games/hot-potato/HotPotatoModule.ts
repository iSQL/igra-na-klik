import type {
  Room,
  GameState,
  HotPotatoControllerData,
  HotPotatoHostData,
  HotPotatoLeaderboardEntry,
  HotPotatoMode,
  HotPotatoPlayerLite,
  KvizChoiceQuestionFull,
  KvizQuestionFull,
} from '@igra/shared';
import {
  HOT_POTATO_CATEGORIES,
  KVIZ_BANK_PACK_ID,
  QUIZ_QUESTION_BANK,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import { resolveQuizPack } from '../quiz/quiz-pack-resolver.js';
import { QuizFeedbackTracker } from '../../quiz-feedback-tracker.js';
import type { HotPotatoInternalState } from './HotPotatoState.js';
import {
  EXPLODED_DURATION,
  FINAL_LEADERBOARD_DURATION,
  INTRO_DURATION,
  KVIZ_ANSWER_DURATION,
  KVIZ_ANSWER_MAX,
  KVIZ_ANSWER_MIN,
  KVIZ_PICK_DURATION,
  MAX_FUSE_MS,
  MIN_FUSE_MS,
} from './HotPotatoState.js';

interface HotPotatoCustomContent {
  hotPotatoMode?: unknown;
  // kviz mode: same pack multi-select the Kviz game uses (ids resolved
  // server-side; '__bank__' = built-in bank).
  quizPackIds?: unknown;
  // kviz mode: seconds to answer each question (clamped to [MIN, MAX]).
  hotPotatoKvizAnswerSeconds?: unknown;
}

function pickCategory(): string {
  return HOT_POTATO_CATEGORIES[
    Math.floor(Math.random() * HOT_POTATO_CATEGORIES.length)
  ];
}

function randomFuseMs(): number {
  return MIN_FUSE_MS + Math.floor(Math.random() * (MAX_FUSE_MS - MIN_FUSE_MS));
}

/** Kviz mode plays only text choice questions — no media, quick reads. */
function isKvizModeQuestion(q: KvizQuestionFull): q is KvizChoiceQuestionFull {
  return q.type === 'obicno' || q.type === 'uljez';
}

export class HotPotatoModule extends BaseGameModule {
  readonly gameId = 'hot-potato';

  private state!: HotPotatoInternalState;
  private timings: Record<string, number> = {};
  /** kviz mode: full pool the working queue refills from. */
  private kvizPool: KvizChoiceQuestionFull[] = [];
  /** Prijave i ocene pitanja — isti knjigovođa kao Kviz i KvizAtar. */
  private feedback = new QuizFeedbackTracker();

  constructor(private readonly packsDir: string = '') {
    super();
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent as HotPotatoCustomContent | undefined) ?? {};
    const mode: HotPotatoMode =
      cc.hotPotatoMode === 'choose'
        ? 'choose'
        : cc.hotPotatoMode === 'kviz'
          ? 'kviz'
          : 'sequential';

    const aliveOrder = shuffled(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );

    const rawAnswerSecs = cc.hotPotatoKvizAnswerSeconds;
    const kvizAnswerDuration =
      typeof rawAnswerSecs === 'number' && Number.isFinite(rawAnswerSecs)
        ? Math.max(KVIZ_ANSWER_MIN, Math.min(KVIZ_ANSWER_MAX, Math.round(rawAnswerSecs)))
        : KVIZ_ANSWER_DURATION;

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
      kvizAnswerDuration,
      questions: [],
      answeredIndex: null,
      answeredCorrectly: false,
    };

    if (mode === 'kviz') {
      const packIds = Array.isArray(cc.quizPackIds)
        ? (cc.quizPackIds.filter((v) => typeof v === 'string') as string[])
        : [];
      this.feedback.reset();
      // Async like the Kviz module — intro waits until questions land.
      void this.loadKvizPool(packIds);
    }

    return this.buildGameState(room);
  }

  /** Pool choice questions from the selected packs; bank as fallback. */
  private async loadKvizPool(packIds: string[]): Promise<void> {
    const pool: KvizChoiceQuestionFull[] = [];
    const resolved = await Promise.all(
      packIds.map((id) =>
        id === KVIZ_BANK_PACK_ID || !this.packsDir
          ? Promise.resolve(null)
          : resolveQuizPack(this.packsDir, id)
      )
    );
    for (let i = 0; i < packIds.length; i++) {
      if (packIds[i] === KVIZ_BANK_PACK_ID) {
        this.feedback.registerBank(QUIZ_QUESTION_BANK);
        pool.push(...QUIZ_QUESTION_BANK.filter(isKvizModeQuestion));
      } else if (resolved[i]) {
        this.feedback.registerPack(resolved[i]!.id, resolved[i]!.questions);
        pool.push(...resolved[i]!.questions.filter(isKvizModeQuestion));
      }
    }
    if (pool.length === 0) {
      this.feedback.registerBank(QUIZ_QUESTION_BANK);
      pool.push(...QUIZ_QUESTION_BANK.filter(isKvizModeQuestion));
    }
    this.kvizPool = pool;
    this.refillQueue();
  }

  /** Keep at least 2 queued (current + the holder's preview). */
  private refillQueue(): void {
    while (this.state.questions.length < 2 && this.kvizPool.length > 0) {
      this.state.questions.push(...shuffled(this.kvizPool));
    }
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    // Prijava/ocena pitanja ne dira tok igre — prolazi u svakoj fazi i za
    // svakog igrača, kao i u Kvizu.
    if (action === 'quiz:feedback') {
      this.feedback.handle(playerId, data);
      return null;
    }

    if (action === 'potato:answer') {
      if (this.state.mode !== 'kviz') return null;
      if (this.state.phase !== 'question') return null;
      if (this.currentHolderId() !== playerId) return null;
      const question = this.state.questions[0];
      if (!question) return null;
      const optionIndex = data.optionIndex;
      if (
        typeof optionIndex !== 'number' ||
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= question.options.length
      ) {
        return null;
      }
      this.state.answeredIndex = optionIndex;
      if (optionIndex === question.correctIndex) {
        this.state.answeredCorrectly = true;
        if (this.state.aliveOrder.length <= 1) {
          // Degenerate case — nobody left to pass to.
          this.finishGame(room);
        } else {
          this.state.phase = 'picking';
          this.state.phaseTimeRemaining = KVIZ_PICK_DURATION;
        }
      } else {
        this.explode(room);
      }
      return this.buildGameState(room);
    }

    if (action !== 'potato:pass') return null;
    if (this.currentHolderId() !== playerId) return null;

    const n = this.state.aliveOrder.length;
    if (n <= 1) return null;

    if (this.state.mode === 'kviz') {
      if (this.state.phase !== 'picking') return null;
      const targetId = typeof data.targetId === 'string' ? data.targetId : null;
      if (!targetId) return null;
      const idx = this.state.aliveOrder.indexOf(targetId);
      if (idx < 0 || idx === this.state.holderIndex) return null;
      this.state.holderIndex = idx;
      this.advanceToNextQuestion();
      return this.buildGameState(room);
    }

    if (this.state.phase !== 'passing') return null;

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
    return this.buildGameState(room);
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

    const wasHolder = idx === this.state.holderIndex;
    this.state.aliveOrder.splice(idx, 1);
    // Keep the holder pointer valid; if the leaver held the bomb, it moves to
    // the next living player (the fuse keeps running).
    if (this.state.aliveOrder.length > 0) {
      if (idx < this.state.holderIndex) this.state.holderIndex -= 1;
      this.state.holderIndex =
        this.state.holderIndex % this.state.aliveOrder.length;
    }

    const activePhase =
      this.state.phase === 'passing' ||
      this.state.phase === 'question' ||
      this.state.phase === 'picking';
    if (activePhase && this.state.aliveOrder.length <= 1) {
      this.finishGame(room);
      return this.buildGameState(room);
    }

    // Kviz mode: the question/pick was the leaver's — restart the beat for
    // whoever inherited the bomb so they get a full window.
    if (
      wasHolder &&
      this.state.mode === 'kviz' &&
      (this.state.phase === 'question' || this.state.phase === 'picking')
    ) {
      this.state.phase = 'question';
      this.state.phaseTimeRemaining = this.state.kvizAnswerDuration;
      this.state.answeredIndex = null;
      this.state.answeredCorrectly = false;
    }
    return this.buildGameState(room);
  }

  // --- Phase machine -----------------------------------------------------

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'intro':
        if (this.state.mode === 'kviz') {
          // Pack may still be loading from disk — hold the intro beat.
          if (this.state.questions.length === 0) {
            this.state.phaseTimeRemaining = 1;
            return;
          }
          this.enterQuestion();
        } else {
          this.enterPassing();
        }
        break;
      case 'question':
        // 5s ran out without an answer — boom.
        this.explode(room);
        break;
      case 'picking': {
        // Holder dawdled — the next question flies to a random other player.
        const n = this.state.aliveOrder.length;
        if (n > 1) {
          let idx = Math.floor(Math.random() * (n - 1));
          if (idx >= this.state.holderIndex) idx += 1;
          this.state.holderIndex = idx;
        }
        this.advanceToNextQuestion();
        break;
      }
      case 'exploded':
        if (this.state.aliveOrder.length <= 1) {
          this.finishGame(room);
        } else if (this.state.mode === 'kviz') {
          // Fresh question lands on a random surviving player.
          this.state.holderIndex = Math.floor(
            Math.random() * this.state.aliveOrder.length
          );
          this.advanceToNextQuestion();
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

  /** Kviz mode: current question goes live for the holder, 5s on the clock. */
  private enterQuestion(): void {
    this.refillQueue();
    this.state.round += 1;
    this.state.explodedId = null;
    this.state.answeredIndex = null;
    this.state.answeredCorrectly = false;
    this.state.phase = 'question';
    this.state.phaseTimeRemaining = this.state.kvizAnswerDuration;
  }

  /** Drop the answered question and serve the next one. */
  private advanceToNextQuestion(): void {
    this.state.questions.shift();
    this.enterQuestion();
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

    const isKviz = this.state.mode === 'kviz';
    const question = this.state.questions[0];

    if (!isKviz && (this.state.phase === 'intro' || this.state.phase === 'passing')) {
      hostData.category = this.state.category;
    }
    if (
      this.state.phase === 'passing' ||
      this.state.phase === 'question' ||
      this.state.phase === 'picking'
    ) {
      hostData.holderId = this.currentHolderId();
    }
    if (isKviz && question && this.state.phase !== 'intro') {
      if (
        this.state.phase === 'question' ||
        this.state.phase === 'picking' ||
        this.state.phase === 'exploded'
      ) {
        hostData.question = {
          id: question.id,
          text: question.text,
          options: question.options,
          imageUrl: question.imageUrl,
        };
      }
      // The correct answer is public only once the question is settled.
      if (this.state.phase === 'picking' || this.state.phase === 'exploded') {
        hostData.correctIndex = question.correctIndex;
        hostData.answeredCorrectly = this.state.answeredCorrectly;
        if (this.state.answeredIndex !== null) {
          hostData.answeredIndex = this.state.answeredIndex;
        }
      }
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

    const holderId = this.currentHolderId();
    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const pd: HotPotatoControllerData = {
        eliminated: !aliveSet.has(player.id),
      };
      // The reward preview: only the holder, only while picking, text only.
      if (
        isKviz &&
        this.state.phase === 'picking' &&
        player.id === holderId &&
        this.state.questions[1]
      ) {
        pd.nextQuestionText = this.state.questions[1].text;
      }
      playerData[player.id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.round,
      totalRounds: 0,
      // Classic modes hide the fuse (passing sends 0); kviz-mode windows are
      // visible countdowns.
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
