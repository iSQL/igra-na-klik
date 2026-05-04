import type {
  Room,
  GameState,
  CustomFotoKvizSubmission,
  FotoKvizControllerData,
  FotoKvizFullQuestion,
  FotoKvizHostData,
  FotoKvizMode,
  FotoKvizPlayerAnswerSummary,
  FotoKvizPublicQuestion,
  FotoKvizRoundResult,
  GeoLeaderboardEntry,
  GeoLocation,
  GeoSubmissionProgress,
  QuizOption,
} from '@igra/shared';
import { QUIZ_OPTION_COLORS } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { resolveGeoPack } from '../geo-pogodi/geo-pack-resolver.js';
import {
  ANSWERING_DURATION,
  DEFAULT_PHOTOS_PER_PLAYER,
  FINAL_LEADERBOARD_DURATION,
  INTRO_DURATION,
  MAX_BASE64_BYTES,
  MAX_CAPTION_LENGTH,
  MAX_OPTIONS,
  MAX_PHOTOS_PER_PLAYER,
  MAX_ROUNDS,
  MIN_CAPTION_LENGTH,
  MIN_LOCATIONS,
  MIN_PHOTOS_PER_PLAYER,
  SHOWING_PHOTO_DURATION,
  SHOWING_RESULTS_DURATION,
  SUBMISSION_DURATION,
} from './FotoKvizState.js';
import type {
  FotoKvizInternalState,
  FotoKvizPlayerAnswer,
} from './FotoKvizState.js';

interface FotoKvizCustomContent {
  geoPackId?: string;
  geoMode?: FotoKvizMode;
  customPhotosPerPlayer?: number;
}

function clampPhotosPerPlayer(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_PHOTOS_PER_PLAYER;
  const n = Math.floor(raw);
  if (n < MIN_PHOTOS_PER_PLAYER) return MIN_PHOTOS_PER_PLAYER;
  if (n > MAX_PHOTOS_PER_PLAYER) return MAX_PHOTOS_PER_PLAYER;
  return n;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Picks `count` random items from `pool`, never including any item whose
 * index appears in `excludeIndexes`. Returns up to `count` items (fewer
 * if the pool is too small after exclusions).
 */
function sampleDistractors<T>(
  pool: T[],
  excludeIndexes: Set<number>,
  count: number
): T[] {
  const candidates: T[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (!excludeIndexes.has(i)) candidates.push(pool[i]);
  }
  shuffleInPlace(candidates);
  return candidates.slice(0, count);
}

export class FotoKvizModule extends BaseGameModule {
  readonly gameId = 'foto-kviz';

  constructor(private readonly packsDir: string) {
    super();
  }

  private state!: FotoKvizInternalState;

  // -- Lifecycle ----------------------------------------------------------

  validateStart(room: Room, customContent?: unknown): string | null {
    const cc = (customContent as FotoKvizCustomContent | undefined) ?? {};
    if (cc.geoMode === 'custom') {
      const connected = room.players.filter((p) => p.isConnected).length;
      if (connected < 2) {
        return 'Custom mod traži najmanje 2 igrača (svaki igrač pogađa tuđe slike).';
      }
      const photosPer = clampPhotosPerPlayer(cc.customPhotosPerPlayer);
      if (connected * photosPer < MIN_LOCATIONS) {
        return `Treba najmanje ${MIN_LOCATIONS} fotografije ukupno za Foto kviz.`;
      }
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    const cc = (customContent as FotoKvizCustomContent | undefined) ?? {};
    const mode: FotoKvizMode = cc.geoMode === 'custom' ? 'custom' : 'predefined';

    this.state = {
      phase: 'intro',
      phaseTimeRemaining: INTRO_DURATION,
      mode,
      packName: undefined,
      questions: [],
      currentQuestionIndex: 0,
      totalRounds: 0,
      answers: new Map(),
      questionStartTime: Date.now(),
      totalScores: new Map(),
      customSubmissions: new Map(),
      customPhotosPerPlayer: clampPhotosPerPlayer(cc.customPhotosPerPlayer),
      submissionRoster: [],
    };

    // Reset persistent player scores so a previous game doesn't bleed in.
    for (const player of room.players) {
      player.score = 0;
      this.state.totalScores.set(player.id, 0);
    }

    if (mode === 'custom') {
      this.enterSubmissionPhase(room);
    } else {
      void this.loadPredefinedPack(cc.geoPackId);
    }

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
      case 'foto:add-photo':
        return this.handleAddPhoto(room, playerId, data);
      case 'foto:undo-photo':
        return this.handleUndoPhoto(room, playerId);
      case 'foto:answer':
        return this.handleAnswer(room, playerId, data);
      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;

    const delta = deltaMs / 1000;
    this.state.phaseTimeRemaining -= delta;

    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }

    return this.buildGameState(room);
  }

  onPlayerDisconnect(room: Room, _gameState: GameState, playerId: string): GameState | null {
    if (this.state.phase === 'submission') {
      const count = this.state.customSubmissions.get(playerId)?.length ?? 0;
      if (count === 0) {
        this.state.submissionRoster = this.state.submissionRoster.filter(
          (id) => id !== playerId
        );
        this.state.customSubmissions.delete(playerId);
        this.maybeAdvanceFromSubmission(room);
      }
    }
    return this.buildGameState(room);
  }

  onEnd(_room: Room, _gameState: GameState): void {
    this.state.customSubmissions.clear();
  }

  // -- Predefined-pack loading -------------------------------------------

  private async loadPredefinedPack(packId?: string): Promise<void> {
    let resolved = null;
    if (packId) {
      resolved = await resolveGeoPack(this.packsDir, packId);
    }
    if (!resolved || resolved.locations.length < MIN_LOCATIONS) {
      // Not enough locations for 4-option questions — abort gracefully.
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }
    this.state.packName = resolved.name;
    this.state.questions = this.buildQuestions(resolved.locations);
    this.state.totalRounds = this.state.questions.length;
    this.state.currentQuestionIndex = 0;
    this.state.phase = 'intro';
    this.state.phaseTimeRemaining = INTRO_DURATION;
  }

  // -- Submission phase (custom mode) -------------------------------------

  private enterSubmissionPhase(room: Room): void {
    const connected = room.players.filter((p) => p.isConnected);
    this.state.submissionRoster = connected.map((p) => p.id);
    this.state.phase = 'submission';
    this.state.phaseTimeRemaining = SUBMISSION_DURATION;
    this.state.packName = 'Slike igrača';
    for (const id of this.state.submissionRoster) {
      if (!this.state.customSubmissions.has(id)) {
        this.state.customSubmissions.set(id, []);
      }
    }
  }

  private handleAddPhoto(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'submission') return null;
    if (!this.state.submissionRoster.includes(playerId)) return null;

    const existing = this.state.customSubmissions.get(playerId) ?? [];
    if (existing.length >= this.state.customPhotosPerPlayer) return null;

    const sub = parseCustomSubmission(data);
    if (!sub) return null;

    existing.push(sub);
    this.state.customSubmissions.set(playerId, existing);

    this.maybeAdvanceFromSubmission(room);
    return this.buildGameState(room);
  }

  private handleUndoPhoto(room: Room, playerId: string): GameState | null {
    if (this.state.phase !== 'submission') return null;
    const existing = this.state.customSubmissions.get(playerId);
    if (!existing || existing.length === 0) return null;
    existing.pop();
    return this.buildGameState(room);
  }

  private maybeAdvanceFromSubmission(room: Room): void {
    if (this.state.submissionRoster.length === 0) return;

    const allDone = this.state.submissionRoster.every((id) => {
      const subs = this.state.customSubmissions.get(id) ?? [];
      return subs.length >= this.state.customPhotosPerPlayer;
    });
    if (!allDone) return;

    // Compose locations from every (player, photo) pair.
    const locations: GeoLocation[] = [];
    let idx = 0;
    for (const playerId of this.state.submissionRoster) {
      const subs = this.state.customSubmissions.get(playerId) ?? [];
      for (const sub of subs) {
        idx += 1;
        locations.push({
          id: `custom-${idx}`,
          imageUrl: sub.imageBase64,
          // Custom-mode locations don't carry real lat/lng — Foto kviz
          // doesn't use them. Set placeholders.
          lat: 0,
          lng: 0,
          caption: sub.caption,
          contributedBy: playerId,
        });
      }
    }

    if (locations.length < MIN_LOCATIONS) {
      // Shouldn't happen given validateStart, but be defensive.
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }

    this.state.questions = this.buildQuestions(locations);
    this.state.totalRounds = this.state.questions.length;
    this.state.currentQuestionIndex = 0;
    this.state.phase = 'intro';
    this.state.phaseTimeRemaining = INTRO_DURATION;
    void room;
  }

  // -- Question construction ---------------------------------------------

  private buildQuestions(locations: GeoLocation[]): FotoKvizFullQuestion[] {
    // Captions are required per round. Fall back to "Lokacija {i}" if the
    // pack author left some empty so the game still runs.
    const labeled = locations.map((loc, i) => ({
      ...loc,
      caption: loc.caption && loc.caption.trim().length > 0 ? loc.caption : `Lokacija ${i + 1}`,
    }));

    const order = labeled.map((_, i) => i);
    shuffleInPlace(order);
    const roundIndexes = order.slice(0, Math.min(MAX_ROUNDS, labeled.length));

    // With N captions available we render min(N, 4) options per round —
    // 4 is the visual ceiling, but a 2-photo custom game still gets a
    // legitimate 2-option round.
    const numOptions = Math.min(MAX_OPTIONS, labeled.length);

    return roundIndexes.map<FotoKvizFullQuestion>((locIdx, roundIdx) => {
      const loc = labeled[locIdx];
      const exclude = new Set<number>([locIdx]);
      // Also exclude any other locations sharing the exact same caption to
      // avoid duplicate options (e.g., two locations both labeled
      // "Beograd" would otherwise leak the answer).
      for (let i = 0; i < labeled.length; i++) {
        if (i !== locIdx && labeled[i].caption === loc.caption) {
          exclude.add(i);
        }
      }
      const distractors = sampleDistractors(
        labeled,
        exclude,
        numOptions - 1
      ).map((d) => d.caption!);

      const optionsTexts = [loc.caption!, ...distractors];
      shuffleInPlace(optionsTexts);
      const options: QuizOption[] = optionsTexts.map((text, i) => ({
        index: i,
        text,
        color: QUIZ_OPTION_COLORS[i],
      }));
      const correctIndex = options.findIndex((o) => o.text === loc.caption);

      return {
        id: `q-${roundIdx + 1}`,
        imageUrl: loc.imageUrl,
        options,
        timeLimit: ANSWERING_DURATION,
        contributedBy: loc.contributedBy,
        correctIndex,
      };
    });
  }

  // -- Answering ---------------------------------------------------------

  private handleAnswer(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'answering') return null;
    if (this.state.answers.has(playerId)) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player || !player.isConnected) return null;

    const question = this.currentQuestion();
    if (!question) return null;
    // The uploader of this round's photo doesn't get to answer.
    if (question.contributedBy === playerId) return null;

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
    let pointsAwarded = 0;
    if (correct) {
      const timeRemaining = Math.max(0, question.timeLimit * 1000 - timeMs);
      pointsAwarded = Math.round(
        1000 * (timeRemaining / (question.timeLimit * 1000))
      );
    }

    const ans: FotoKvizPlayerAnswer = {
      optionIndex,
      timeMs,
      correct,
      pointsAwarded,
    };
    this.state.answers.set(playerId, ans);

    if (pointsAwarded > 0) {
      const prev = this.state.totalScores.get(playerId) ?? 0;
      this.state.totalScores.set(playerId, prev + pointsAwarded);
      player.score = prev + pointsAwarded;
    }

    // Early advance: did everyone eligible answer?
    const eligible = this.eligibleAnswerers(room).length;
    if (eligible > 0 && this.state.answers.size >= eligible) {
      this.transitionToResults();
    }

    return this.buildGameState(room);
  }

  private eligibleAnswerers(room: Room): string[] {
    const question = this.currentQuestion();
    return room.players
      .filter((p) => p.isConnected)
      .filter((p) => question?.contributedBy !== p.id)
      .map((p) => p.id);
  }

  private currentQuestion(): FotoKvizFullQuestion | undefined {
    return this.state.questions[this.state.currentQuestionIndex];
  }

  // -- Phase machine ------------------------------------------------------

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'submission':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        return;

      case 'intro':
        if (this.state.questions.length === 0) {
          // Pack still loading; reset countdown and wait.
          this.state.phaseTimeRemaining = INTRO_DURATION;
          return;
        }
        this.state.phase = 'showing-photo';
        this.state.phaseTimeRemaining = SHOWING_PHOTO_DURATION;
        return;

      case 'showing-photo':
        this.state.phase = 'answering';
        this.state.phaseTimeRemaining = ANSWERING_DURATION;
        this.state.questionStartTime = Date.now();
        this.state.answers = new Map();
        return;

      case 'answering':
        this.transitionToResults();
        return;

      case 'showing-results':
        this.advanceFromResults(room);
        return;

      case 'final-leaderboard':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        return;

      case 'ended':
        return;
    }
  }

  private transitionToResults(): void {
    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
  }

  private advanceFromResults(_room: Room): void {
    const next = this.state.currentQuestionIndex + 1;
    if (next >= this.state.questions.length) {
      this.state.phase = 'final-leaderboard';
      this.state.phaseTimeRemaining = FINAL_LEADERBOARD_DURATION;
      return;
    }
    this.state.currentQuestionIndex = next;
    this.state.phase = 'showing-photo';
    this.state.phaseTimeRemaining = SHOWING_PHOTO_DURATION;
    this.state.answers = new Map();
  }

  // -- buildGameState -----------------------------------------------------

  private buildGameState(room: Room): GameState {
    const hostData: FotoKvizHostData = {
      mode: this.state.mode,
      packName: this.state.packName,
      totalRounds: this.state.totalRounds,
      customPhotosPerPlayer: this.state.customPhotosPerPlayer,
    };

    if (this.state.phase === 'submission') {
      hostData.submissionProgress = this.buildSubmissionProgress(room);
      hostData.submissionPending = hostData.submissionProgress.filter(
        (p) => p.submitted < p.total
      ).length;
    }

    if (
      this.state.phase === 'showing-photo' ||
      this.state.phase === 'answering' ||
      this.state.phase === 'showing-results'
    ) {
      const question = this.currentQuestion();
      if (question) {
        const publicQ: FotoKvizPublicQuestion = {
          id: question.id,
          imageUrl: question.imageUrl,
          options: question.options,
          timeLimit: question.timeLimit,
          contributedBy: question.contributedBy,
        };
        hostData.currentRound = {
          index: this.state.currentQuestionIndex,
          total: this.state.totalRounds,
          question: publicQ,
        };
      }
    }

    if (this.state.phase === 'answering') {
      const eligible = this.eligibleAnswerers(room);
      hostData.totalPlayers = eligible.length;
      hostData.answeredCount = eligible.filter((id) =>
        this.state.answers.has(id)
      ).length;
    }

    if (this.state.phase === 'showing-results') {
      const question = this.currentQuestion();
      if (question) {
        hostData.roundResult = this.buildRoundResult(room, question);
      }
    }

    if (this.state.phase === 'final-leaderboard') {
      hostData.finalLeaderboard = this.buildFinalLeaderboard(room);
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
      round: this.state.currentQuestionIndex + 1,
      totalRounds: Math.max(1, this.state.totalRounds),
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildSubmissionProgress(room: Room): GeoSubmissionProgress[] {
    return this.state.submissionRoster
      .map((id) => {
        const player = room.players.find((p) => p.id === id);
        if (!player) return null;
        return {
          playerId: id,
          name: player.name,
          avatarColor: player.avatarColor,
          submitted: this.state.customSubmissions.get(id)?.length ?? 0,
          total: this.state.customPhotosPerPlayer,
        };
      })
      .filter((x): x is GeoSubmissionProgress => x !== null);
  }

  private buildRoundResult(
    room: Room,
    question: FotoKvizFullQuestion
  ): FotoKvizRoundResult {
    const perPlayer: FotoKvizPlayerAnswerSummary[] = room.players.map((p) => {
      const answer = this.state.answers.get(p.id);
      return {
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        optionIndex: answer?.optionIndex ?? null,
        correct: answer?.correct ?? false,
        pointsAwarded: answer?.pointsAwarded ?? 0,
      };
    });
    perPlayer.sort((a, b) => b.pointsAwarded - a.pointsAwarded);

    return {
      question: {
        id: question.id,
        imageUrl: question.imageUrl,
        options: question.options,
        timeLimit: question.timeLimit,
        contributedBy: question.contributedBy,
        correctIndex: question.correctIndex,
      },
      perPlayer,
    };
  }

  private buildFinalLeaderboard(room: Room): GeoLeaderboardEntry[] {
    const entries = room.players
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        score: this.state.totalScores.get(p.id) ?? 0,
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score);
    let lastScore = -1;
    let lastRank = 0;
    return entries.map((entry, i) => {
      const rank = entry.score === lastScore ? lastRank : i + 1;
      lastScore = entry.score;
      lastRank = rank;
      return { ...entry, rank };
    });
  }

  private buildControllerData(playerId: string): FotoKvizControllerData {
    const totalScore = this.state.totalScores.get(playerId) ?? 0;
    const inRoster = this.state.submissionRoster.includes(playerId);

    const base: FotoKvizControllerData = {
      role: 'spectator',
      mode: this.state.mode,
      totalScore,
    };

    switch (this.state.phase) {
      case 'submission': {
        if (!inRoster) return base;
        const subs = this.state.customSubmissions.get(playerId) ?? [];
        return {
          ...base,
          role: 'submitter',
          photosNeeded: this.state.customPhotosPerPlayer,
          photosSubmitted: subs.length,
        };
      }

      case 'answering': {
        const question = this.currentQuestion();
        if (!question) return base;
        const isOwn = question.contributedBy === playerId;
        if (isOwn) {
          return { ...base, role: 'spectator', isOwnPhoto: true };
        }
        const ans = this.state.answers.get(playerId);
        return {
          ...base,
          role: 'guesser',
          hasAnswered: ans !== undefined,
          selectedIndex: ans?.optionIndex,
          isOwnPhoto: false,
        };
      }

      case 'showing-results': {
        const question = this.currentQuestion();
        const ans = this.state.answers.get(playerId);
        const correctText =
          question && question.options[question.correctIndex]?.text;
        return {
          ...base,
          role: 'spectator',
          ownCorrect: ans?.correct ?? false,
          ownPoints: ans?.pointsAwarded ?? 0,
          correctOptionText: correctText,
          isOwnPhoto: question?.contributedBy === playerId,
        };
      }

      case 'intro':
      case 'showing-photo':
      case 'final-leaderboard':
      case 'ended':
      default:
        return base;
    }
  }
}

// -- Helpers ----------------------------------------------------------------

function parseCustomSubmission(
  data: Record<string, unknown>
): CustomFotoKvizSubmission | null {
  const imageBase64 = data.imageBase64;
  const caption = data.caption;
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) return null;
  if (!imageBase64.startsWith('data:image/')) return null;
  if (imageBase64.length > MAX_BASE64_BYTES) return null;
  if (typeof caption !== 'string') return null;
  const trimmed = caption.trim();
  if (trimmed.length < MIN_CAPTION_LENGTH) return null;
  return {
    imageBase64,
    caption: trimmed.slice(0, MAX_CAPTION_LENGTH),
  };
}
