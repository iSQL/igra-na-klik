import type {
  Room,
  GameState,
  KoSamJaCategory,
  KoSamJaImportQuestion,
  KoSamJaPublicOption,
  KoSamJaResultData,
  KoSamJaResultGuess,
  KoSamJaLeaderboardEntry,
  KoSamJaUpfrontQuestion,
} from '@igra/shared';
import {
  parseKoSamJaImport,
  KO_SAM_JA_DEFAULT_BANK,
  KO_SAM_JA_FREE_FALLBACK,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import {
  COLLECTING_UPFRONT_DURATION,
  SHOWING_QUESTION_DURATION,
  SUBJECT_PICKING_DURATION,
  GUESSING_DURATION,
  SHOWING_RESULTS_DURATION,
  LEADERBOARD_DURATION,
  NUM_ROUNDS,
  SUBJECT_BONUS_PER_WRONG,
} from './KoSamJaState.js';
import type {
  KoSamJaInternalState,
  KoSamJaQuestion,
  KoSamJaSelectedRound,
} from './KoSamJaState.js';

interface KoSamJaCustomContent {
  koSamJaCategory?: KoSamJaCategory;
  customKoSamJaQuestions?: unknown;
}

export class KoSamJaModule extends BaseGameModule {
  readonly gameId = 'ko-sam-ja';

  private state!: KoSamJaInternalState;

  validateStart(_room: Room, customContent?: unknown): string | null {
    const cc = customContent as KoSamJaCustomContent | undefined;
    const category: KoSamJaCategory =
      cc?.koSamJaCategory === 'nsfw' ? 'nsfw' : 'family';
    const bank = this.resolveBank(cc?.customKoSamJaQuestions);
    const filtered = bank.filter((q) => q.category === category);
    if (filtered.length === 0) {
      return `Nema pitanja u kategoriji "${
        category === 'nsfw' ? 'NSFW' : 'Family'
      }".`;
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    const cc = customContent as KoSamJaCustomContent | undefined;
    const category: KoSamJaCategory =
      cc?.koSamJaCategory === 'nsfw' ? 'nsfw' : 'family';
    const bank = this.resolveBank(cc?.customKoSamJaQuestions);
    const filtered = bank.filter((q) => q.category === category);

    const pool: KoSamJaQuestion[] = filtered.map((q, idx) => ({
      id: `q-${idx}`,
      shape: q.shape,
      category: q.category,
      text: q.text,
      options:
        q.shape === 'fixed'
          ? q.options
          : q.shape === 'peer'
            ? q.options
            : undefined,
      maxLength: q.shape === 'free' ? q.maxLength ?? 60 : undefined,
      optionTemplate: q.shape === 'pickN' ? q.optionTemplate : undefined,
      maxPeers: q.shape === 'pickN' ? q.maxPeers : undefined,
    }));

    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffledPool.slice(
      0,
      Math.min(NUM_ROUNDS, shuffledPool.length)
    );

    const connectedPlayers = room.players.filter((p) => p.isConnected);
    // Round-robin assign subjects
    const selectedRounds: KoSamJaSelectedRound[] = selectedQuestions.map(
      (q, i) => ({
        questionId: q.id,
        subjectPlayerId: connectedPlayers[i % connectedPlayers.length].id,
      })
    );

    const upfrontAssignments = new Map<string, string[]>();
    for (const p of connectedPlayers) {
      upfrontAssignments.set(p.id, []);
    }
    for (const round of selectedRounds) {
      const q = selectedQuestions.find((x) => x.id === round.questionId)!;
      // peer + pickN are answered just-in-time at round start, not upfront.
      if (q.shape === 'fixed' || q.shape === 'free') {
        const list = upfrontAssignments.get(round.subjectPlayerId) ?? [];
        list.push(round.questionId);
        upfrontAssignments.set(round.subjectPlayerId, list);
      }
    }

    this.state = {
      category,
      questionPool: selectedQuestions,
      selectedRounds,
      currentRoundIndex: 0,
      phase: 'collecting-upfront',
      phaseTimeRemaining: COLLECTING_UPFRONT_DURATION,
      upfrontAnswers: new Map(),
      upfrontAssignments,
      roundQuestionStartTime: 0,
      roundOptions: [],
      roundPeerOptionPlayerIds: null,
      roundCorrectOptionId: null,
      roundGuesses: new Map(),
      roundSubjectSkipped: false,
      roundScores: new Map(),
      roundWrongGuessCount: 0,
      roundSubjectBonus: 0,
      expectedGuesserIds: new Set(),
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
      case 'ko-sam-ja:submit-upfront': {
        if (this.state.phase !== 'collecting-upfront') return null;
        const questionId = data.questionId as string | undefined;
        if (!questionId) return null;
        const assigned = this.state.upfrontAssignments.get(playerId) ?? [];
        if (!assigned.includes(questionId)) return null;
        const question = this.getQuestion(questionId);
        if (!question) return null;

        let myAnswers = this.state.upfrontAnswers.get(playerId);
        if (!myAnswers) {
          myAnswers = new Map();
          this.state.upfrontAnswers.set(playerId, myAnswers);
        }
        if (myAnswers.has(questionId)) return null;

        if (question.shape === 'fixed') {
          const optionIndex = data.optionIndex;
          if (
            typeof optionIndex !== 'number' ||
            !Number.isInteger(optionIndex) ||
            optionIndex < 0 ||
            optionIndex >= (question.options?.length ?? 0)
          ) {
            return null;
          }
          myAnswers.set(questionId, { optionIndex });
        } else if (question.shape === 'free') {
          const maxLength = question.maxLength ?? 60;
          const rawText = (data.text as string) ?? '';
          const text = rawText.trim().slice(0, maxLength);
          if (!text) return null;
          myAnswers.set(questionId, { text });
        } else {
          return null;
        }

        if (this.allConnectedDoneWithUpfront(room)) {
          this.transitionFromCollectionToFirstRound(room);
        }
        return this.buildGameState(room);
      }

      case 'ko-sam-ja:submit-peer-pick': {
        if (this.state.phase !== 'subject-picking') return null;
        const round = this.currentRound();
        if (!round || round.subjectPlayerId !== playerId) return null;
        const optionId = data.optionId as string | undefined;
        if (!optionId) return null;
        const option = this.state.roundOptions.find((o) => o.id === optionId);
        if (!option) return null;
        this.state.roundCorrectOptionId = optionId;
        this.transitionToGuessing(room);
        return this.buildGameState(room);
      }

      case 'ko-sam-ja:guess': {
        if (this.state.phase !== 'guessing') return null;
        const round = this.currentRound();
        if (!round) return null;
        if (playerId === round.subjectPlayerId) return null;
        if (this.state.roundGuesses.has(playerId)) return null;
        const optionId = data.optionId as string | undefined;
        if (!optionId) return null;
        const option = this.state.roundOptions.find((o) => o.id === optionId);
        if (!option) return null;

        const timeMs = Date.now() - this.state.roundQuestionStartTime;
        this.state.roundGuesses.set(playerId, { optionId, timeMs });

        if (this.allExpectedGuessed(room)) {
          this.transitionToResults(room);
        }
        return this.buildGameState(room);
      }

      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // Past-grace removal — release the player's slot from active
    // snapshots so the round can early-exit once the rest are done.
    this.state.upfrontAssignments.delete(playerId);
    this.state.expectedGuesserIds.delete(playerId);

    if (
      this.state.phase === 'collecting-upfront' &&
      this.allConnectedDoneWithUpfront(room)
    ) {
      this.transitionFromCollectionToFirstRound(room);
    } else if (this.state.phase === 'guessing' && this.allExpectedGuessed(room)) {
      this.transitionToResults(room);
    }
    return this.buildGameState(room);
  }

  // ---------------------------------------------------------------- helpers

  private resolveBank(
    customQuestions: unknown
  ): readonly KoSamJaImportQuestion[] {
    if (customQuestions !== undefined) {
      const parsed = parseKoSamJaImport(customQuestions);
      if (parsed.ok) return parsed.questions;
    }
    return KO_SAM_JA_DEFAULT_BANK;
  }

  private getQuestion(id: string): KoSamJaQuestion | undefined {
    return this.state.questionPool.find((q) => q.id === id);
  }

  private currentRound(): KoSamJaSelectedRound | null {
    return this.state.selectedRounds[this.state.currentRoundIndex] ?? null;
  }

  private currentQuestion(): KoSamJaQuestion | null {
    const round = this.currentRound();
    if (!round) return null;
    return this.getQuestion(round.questionId) ?? null;
  }

  private normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private allConnectedDoneWithUpfront(room: Room): boolean {
    // Snapshot: upfrontAssignments was set at game start. We do NOT
    // re-filter by isConnected — a brief mid-collection disconnect (phone
    // sleep / network blip) shouldn't shrink the "everyone is done"
    // denominator and steal a slot from someone about to reconnect.
    // Past-grace removal prunes via onPlayerDisconnect.
    for (const [playerId, assigned] of this.state.upfrontAssignments) {
      if (assigned.length === 0) continue;
      const stillInRoom = room.players.some((p) => p.id === playerId);
      if (!stillInRoom) continue;
      const submitted = this.state.upfrontAnswers.get(playerId);
      if (!submitted) return false;
      for (const qid of assigned) {
        if (!submitted.has(qid)) return false;
      }
    }
    return true;
  }

  private allExpectedGuessed(room: Room): boolean {
    if (this.state.phase !== 'guessing') return false;
    for (const id of this.state.expectedGuesserIds) {
      if (this.state.roundGuesses.has(id)) continue;
      const stillInRoom = room.players.some((p) => p.id === id);
      if (!stillInRoom) continue;
      return false;
    }
    return true;
  }

  // ----------------------------------------------- phase transition routing

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'collecting-upfront':
        this.transitionFromCollectionToFirstRound(room);
        break;

      case 'showing-question':
        this.transitionFromShowingQuestion(room);
        break;

      case 'subject-picking':
        if (this.state.roundCorrectOptionId === null) {
          // Subject didn't pick in time — skip the round.
          this.markRoundSkipped();
          this.state.phase = 'showing-results';
          this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
        }
        // If a pick was made, we'd have already transitioned to guessing
        // from onPlayerAction; if we got here on a tick with a pick, just
        // re-route through transitionToGuessing.
        else {
          this.transitionToGuessing(room);
        }
        break;

      case 'guessing':
        this.transitionToResults(room);
        break;

      case 'showing-results':
        this.state.phase = 'leaderboard';
        this.state.phaseTimeRemaining = LEADERBOARD_DURATION;
        break;

      case 'leaderboard':
        if (this.state.currentRoundIndex < this.state.selectedRounds.length - 1) {
          this.state.currentRoundIndex++;
          this.resetRoundState();
          this.state.phase = 'showing-question';
          this.state.phaseTimeRemaining = SHOWING_QUESTION_DURATION;
        } else {
          this.state.phase = 'ended';
          this.state.phaseTimeRemaining = 0;
        }
        break;
    }
  }

  private transitionFromCollectionToFirstRound(room: Room): void {
    // Prune rounds whose subject left or never answered the question.
    const pruned = this.state.selectedRounds.filter((round) => {
      const subjectStillHere = room.players.some(
        (p) => p.id === round.subjectPlayerId
      );
      if (!subjectStillHere) return false;
      const q = this.getQuestion(round.questionId);
      if (!q) return false;
      if (q.shape === 'peer' || q.shape === 'pickN') return true;
      const answered = this.state.upfrontAnswers
        .get(round.subjectPlayerId)
        ?.has(round.questionId);
      return !!answered;
    });
    this.state.selectedRounds = pruned;
    this.state.currentRoundIndex = 0;

    if (pruned.length === 0) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }

    this.resetRoundState();
    this.state.phase = 'showing-question';
    this.state.phaseTimeRemaining = SHOWING_QUESTION_DURATION;
  }

  private transitionFromShowingQuestion(room: Room): void {
    const round = this.currentRound();
    const question = this.currentQuestion();
    if (!round || !question) {
      // Defensive: skip to leaderboard
      this.state.phase = 'leaderboard';
      this.state.phaseTimeRemaining = LEADERBOARD_DURATION;
      return;
    }

    const subject = room.players.find((p) => p.id === round.subjectPlayerId);
    if (!subject || !subject.isConnected) {
      this.markRoundSkipped();
      this.state.phase = 'showing-results';
      this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
      return;
    }

    if (question.shape === 'peer') {
      const ok = this.setupPeerOptions(room, round, question);
      if (!ok) {
        this.markRoundSkipped();
        this.state.phase = 'showing-results';
        this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
        return;
      }
      this.state.phase = 'subject-picking';
      this.state.phaseTimeRemaining = SUBJECT_PICKING_DURATION;
      return;
    }

    if (question.shape === 'pickN') {
      const ok = this.setupPickNOptions(room, round, question);
      if (!ok) {
        this.markRoundSkipped();
        this.state.phase = 'showing-results';
        this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
        return;
      }
      this.state.phase = 'subject-picking';
      this.state.phaseTimeRemaining = SUBJECT_PICKING_DURATION;
      return;
    }

    // shape === 'fixed' or 'free'
    this.setupNonPeerOptions(round, question);
    this.transitionToGuessing(room);
  }

  private transitionToGuessing(room: Room): void {
    const round = this.currentRound();
    const subjectId = round?.subjectPlayerId;
    this.state.roundQuestionStartTime = Date.now();
    this.state.roundGuesses = new Map();
    this.state.expectedGuesserIds = new Set(
      room.players
        .filter((p) => p.isConnected && p.id !== subjectId)
        .map((p) => p.id)
    );
    this.state.phase = 'guessing';
    this.state.phaseTimeRemaining = GUESSING_DURATION;
  }

  private transitionToResults(room: Room): void {
    const round = this.currentRound();
    const question = this.currentQuestion();

    if (!round || !question || this.state.roundCorrectOptionId === null) {
      // Edge case: no correct option set (e.g. subject-picking timeout
      // reached this method via a guard) — mark as skipped.
      this.markRoundSkipped();
      this.state.phase = 'showing-results';
      this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
      return;
    }

    this.state.roundScores = new Map();
    this.state.roundWrongGuessCount = 0;

    const subjectId = round.subjectPlayerId;
    const correctId = this.state.roundCorrectOptionId;

    for (const [guesserId, { optionId, timeMs }] of this.state.roundGuesses) {
      const correct = optionId === correctId;
      let pts = 0;
      if (correct) {
        const remaining = Math.max(0, GUESSING_DURATION * 1000 - timeMs);
        pts = Math.round(1000 * (remaining / (GUESSING_DURATION * 1000)));
      } else {
        this.state.roundWrongGuessCount++;
      }
      this.state.roundScores.set(guesserId, pts);
    }

    // Players who didn't guess (timeout / disconnect) count as wrong
    const nonSubjects = room.players.filter((p) => p.id !== subjectId);
    for (const p of nonSubjects) {
      if (!this.state.roundGuesses.has(p.id)) {
        this.state.roundWrongGuessCount++;
      }
    }

    const subjectBonus =
      this.state.roundWrongGuessCount * SUBJECT_BONUS_PER_WRONG;
    this.state.roundSubjectBonus = subjectBonus;
    this.state.roundScores.set(subjectId, subjectBonus);

    for (const p of room.players) {
      p.score += this.state.roundScores.get(p.id) ?? 0;
    }

    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
  }

  private setupPeerOptions(
    room: Room,
    round: KoSamJaSelectedRound,
    question: KoSamJaQuestion
  ): boolean {
    const peerCandidates = room.players.filter(
      (p) => p.isConnected && p.id !== round.subjectPlayerId
    );
    if (peerCandidates.length < 2) return false;
    for (let i = peerCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [peerCandidates[i], peerCandidates[j]] = [
        peerCandidates[j],
        peerCandidates[i],
      ];
    }
    const peer1 = peerCandidates[0];
    const peer2 = peerCandidates[1];
    this.state.roundPeerOptionPlayerIds = [peer1.id, peer2.id];

    if (question.options && question.options.length > 0) {
      // Author-provided options — interpolate {subject}/{peer1}/{peer2}
      // once at round start (peer pair is now locked).
      const subject = room.players.find(
        (p) => p.id === round.subjectPlayerId
      );
      const subjectName = subject?.name ?? '?';
      this.state.roundOptions = question.options.map((rawText, i) => ({
        id: `opt-${i}`,
        text: this.interpolateText(
          rawText,
          subjectName,
          peer1.name,
          peer2.name
        ),
      }));
    } else {
      this.state.roundOptions = [
        { id: `peer-${peer1.id}`, text: peer1.name },
        { id: `peer-${peer2.id}`, text: peer2.name },
      ];
    }

    this.state.roundCorrectOptionId = null;
    this.state.roundGuesses = new Map();
    return true;
  }

  private setupPickNOptions(
    room: Room,
    round: KoSamJaSelectedRound,
    question: KoSamJaQuestion
  ): boolean {
    const peerCandidates = room.players.filter(
      (p) => p.isConnected && p.id !== round.subjectPlayerId
    );
    if (peerCandidates.length < 2) return false;

    for (let i = peerCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [peerCandidates[i], peerCandidates[j]] = [
        peerCandidates[j],
        peerCandidates[i],
      ];
    }

    const cap = question.maxPeers ?? 4;
    const N = Math.min(peerCandidates.length, cap);
    const chosen = peerCandidates.slice(0, N);

    this.state.roundPeerOptionPlayerIds = chosen.map((p) => p.id);

    const subject = room.players.find((p) => p.id === round.subjectPlayerId);
    const subjectName = subject?.name ?? '?';
    const template = question.optionTemplate;

    this.state.roundOptions = chosen.map((peer) => ({
      id: `pickn-${peer.id}`,
      text: template
        ? template
            .split('{subject}')
            .join(subjectName)
            .split('{peer}')
            .join(peer.name)
        : peer.name,
    }));

    this.state.roundCorrectOptionId = null;
    this.state.roundGuesses = new Map();
    return true;
  }

  private setupNonPeerOptions(
    round: KoSamJaSelectedRound,
    question: KoSamJaQuestion
  ): void {
    if (question.shape === 'fixed') {
      const subjectAnswer = this.state.upfrontAnswers
        .get(round.subjectPlayerId)
        ?.get(question.id);
      const optionIndex = subjectAnswer?.optionIndex ?? 0;
      this.state.roundOptions = (question.options ?? []).map((text, i) => ({
        id: `fixed-${i}`,
        text,
      }));
      this.state.roundCorrectOptionId = `fixed-${optionIndex}`;
      this.state.roundPeerOptionPlayerIds = null;
      return;
    }

    // shape === 'free'
    const subjectAnswer = this.state.upfrontAnswers
      .get(round.subjectPlayerId)
      ?.get(question.id);
    const correctText = (subjectAnswer?.text ?? '').trim() || 'tajna';
    const correctNorm = this.normalize(correctText);

    const distractorTexts: string[] = [];
    const seen = new Set<string>([correctNorm]);

    const allFree: string[] = [];
    for (const [playerId, perQ] of this.state.upfrontAnswers.entries()) {
      if (playerId === round.subjectPlayerId) continue;
      for (const ans of perQ.values()) {
        if (ans.text) allFree.push(ans.text);
      }
    }
    for (let i = allFree.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allFree[i], allFree[j]] = [allFree[j], allFree[i]];
    }
    for (const t of allFree) {
      const norm = this.normalize(t);
      if (seen.has(norm)) continue;
      seen.add(norm);
      distractorTexts.push(t);
      if (distractorTexts.length >= 3) break;
    }

    if (distractorTexts.length < 3) {
      const fb = [...KO_SAM_JA_FREE_FALLBACK];
      for (let i = fb.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fb[i], fb[j]] = [fb[j], fb[i]];
      }
      for (const t of fb) {
        const norm = this.normalize(t);
        if (seen.has(norm)) continue;
        seen.add(norm);
        distractorTexts.push(t);
        if (distractorTexts.length >= 3) break;
      }
    }

    const opts: { id: string; text: string }[] = [
      { id: 'free-real', text: correctText },
      ...distractorTexts.map((t, i) => ({ id: `free-fake-${i}`, text: t })),
    ];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    this.state.roundOptions = opts;
    this.state.roundCorrectOptionId = 'free-real';
    this.state.roundPeerOptionPlayerIds = null;
  }

  private markRoundSkipped(): void {
    this.state.roundSubjectSkipped = true;
    this.state.roundScores = new Map();
    this.state.roundWrongGuessCount = 0;
    this.state.roundSubjectBonus = 0;
  }

  private resetRoundState(): void {
    this.state.roundOptions = [];
    this.state.roundPeerOptionPlayerIds = null;
    this.state.roundCorrectOptionId = null;
    this.state.roundGuesses = new Map();
    this.state.roundSubjectSkipped = false;
    this.state.roundScores = new Map();
    this.state.roundWrongGuessCount = 0;
    this.state.roundSubjectBonus = 0;
    this.state.roundQuestionStartTime = 0;
  }

  // -------------------------------------------------------- buildGameState

  private interpolateText(
    text: string,
    subjectName: string,
    peer1Name?: string,
    peer2Name?: string
  ): string {
    return text
      .split('{subject}')
      .join(subjectName)
      .split('{peer1}')
      .join(peer1Name ?? '?')
      .split('{peer2}')
      .join(peer2Name ?? '?');
  }

  private buildGameState(room: Room): GameState {
    const data: Record<string, unknown> = {
      phase: this.state.phase,
      category: this.state.category,
      totalRounds: this.state.selectedRounds.length,
      roundIndex: this.state.currentRoundIndex,
    };
    const playerData: Record<string, Record<string, unknown>> = {};

    if (this.state.phase === 'collecting-upfront') {
      const connected = room.players.filter((p) => p.isConnected);
      let totalAccountedFor = 0;
      let totalRequired = 0;
      for (const p of connected) {
        const assigned = this.state.upfrontAssignments.get(p.id) ?? [];
        totalRequired += assigned.length;
        const submitted = this.state.upfrontAnswers.get(p.id);
        if (submitted) {
          for (const qid of assigned) {
            if (submitted.has(qid)) totalAccountedFor++;
          }
        }
      }
      data.collectedCount = totalAccountedFor;
      data.totalRequired = totalRequired;

      const totalPlayers = connected.length;
      let playersDone = 0;
      for (const p of connected) {
        const assigned = this.state.upfrontAssignments.get(p.id) ?? [];
        const submitted = this.state.upfrontAnswers.get(p.id);
        const allDone =
          assigned.length === 0 ||
          (!!submitted && assigned.every((q) => submitted.has(q)));
        if (allDone) playersDone++;
      }
      data.playersDone = playersDone;
      data.totalPlayers = totalPlayers;

      for (const p of room.players) {
        const assigned = this.state.upfrontAssignments.get(p.id) ?? [];
        const submitted = this.state.upfrontAnswers.get(p.id) ?? new Map();
        const pendingIds = assigned.filter((qid) => !submitted.has(qid));
        const completedCount = assigned.length - pendingIds.length;

        const pendingQuestions: KoSamJaUpfrontQuestion[] = [];
        for (const qid of pendingIds) {
          const q = this.getQuestion(qid);
          if (!q) continue;
          const interpolated = this.interpolateText(q.text, p.name);
          if (q.shape === 'fixed') {
            pendingQuestions.push({
              id: q.id,
              shape: 'fixed',
              text: interpolated,
              options: q.options ?? [],
            });
          } else if (q.shape === 'free') {
            pendingQuestions.push({
              id: q.id,
              shape: 'free',
              text: interpolated,
              maxLength: q.maxLength ?? 60,
            });
          }
        }

        playerData[p.id] = {
          pendingQuestions,
          currentQuestion: pendingQuestions[0] ?? null,
          completedCount,
          totalAssigned: assigned.length,
          allDone: pendingQuestions.length === 0,
        };
      }
    } else if (
      this.state.phase === 'showing-question' ||
      this.state.phase === 'subject-picking' ||
      this.state.phase === 'guessing' ||
      this.state.phase === 'showing-results'
    ) {
      const round = this.currentRound();
      const question = this.currentQuestion();
      if (round && question) {
        const subject = room.players.find(
          (p) => p.id === round.subjectPlayerId
        );
        const subjectName = subject?.name ?? '?';
        const peer1Name =
          this.state.roundPeerOptionPlayerIds &&
          room.players.find(
            (p) => p.id === this.state.roundPeerOptionPlayerIds![0]
          )?.name;
        const peer2Name =
          this.state.roundPeerOptionPlayerIds &&
          room.players.find(
            (p) => p.id === this.state.roundPeerOptionPlayerIds![1]
          )?.name;

        const interpolated = this.interpolateText(
          question.text,
          subjectName,
          peer1Name ?? undefined,
          peer2Name ?? undefined
        );

        data.currentQuestionText = interpolated;
        data.currentQuestionShape = question.shape;
        data.currentSubjectPlayerId = round.subjectPlayerId;
        data.currentSubjectName = subjectName;
      }

      if (this.state.phase === 'subject-picking') {
        const expectedSubject = round?.subjectPlayerId;
        for (const p of room.players) {
          if (p.id === expectedSubject) {
            const peerOptions: KoSamJaPublicOption[] = this.state.roundOptions.map(
              (o) => ({ id: o.id, text: o.text })
            );
            playerData[p.id] = {
              isSubject: true,
              peerOptions,
              hasPicked: this.state.roundCorrectOptionId !== null,
            };
          } else {
            playerData[p.id] = {
              isSubject: false,
              waitingFor: data.currentSubjectName,
            };
          }
        }
      } else if (this.state.phase === 'guessing') {
        const publicOptions: KoSamJaPublicOption[] = this.state.roundOptions.map(
          (o) => ({ id: o.id, text: o.text })
        );
        const expectedSubject = round?.subjectPlayerId;
        const totalGuessers = room.players.filter(
          (p) => p.isConnected && p.id !== expectedSubject
        ).length;
        const guessedCount = this.state.roundGuesses.size;

        data.options = publicOptions;
        data.timeLimit = GUESSING_DURATION;
        data.guessedCount = guessedCount;
        data.totalGuessers = totalGuessers;

        for (const p of room.players) {
          if (p.id === expectedSubject) {
            playerData[p.id] = {
              isSubject: true,
              guessedCount,
              totalGuessers,
            };
          } else {
            const my = this.state.roundGuesses.get(p.id);
            playerData[p.id] = {
              isSubject: false,
              hasGuessed: !!my,
              selectedOptionId: my?.optionId ?? null,
            };
          }
        }
      } else if (this.state.phase === 'showing-results') {
        const expectedSubject = round?.subjectPlayerId ?? '';
        const subjectName = data.currentSubjectName as string | undefined;
        const publicOptions: KoSamJaPublicOption[] = this.state.roundOptions.map(
          (o) => ({ id: o.id, text: o.text })
        );

        if (this.state.roundSubjectSkipped) {
          // Skipped round — render minimal results with skipped flag.
          const results: KoSamJaResultData = {
            questionText: (data.currentQuestionText as string) ?? '',
            questionShape:
              (data.currentQuestionShape as KoSamJaResultData['questionShape']) ??
              'fixed',
            subjectPlayerId: expectedSubject,
            subjectName: subjectName ?? '?',
            options: publicOptions,
            correctOptionId: '',
            guesses: [],
            subjectBonus: 0,
            wrongGuessCount: 0,
            skipped: true,
          };
          data.results = results;
          for (const p of room.players) {
            playerData[p.id] = {
              wasSubject: p.id === expectedSubject,
              wasCorrect: false,
              roundScore: 0,
              totalScore: p.score,
              myGuess: null,
              skipped: true,
            };
          }
        } else {
          const correctId = this.state.roundCorrectOptionId ?? '';
          const guesses: KoSamJaResultGuess[] = [];
          for (const p of room.players) {
            if (p.id === expectedSubject) continue;
            const my = this.state.roundGuesses.get(p.id);
            const optionId = my?.optionId ?? null;
            const correct = optionId === correctId;
            guesses.push({
              playerId: p.id,
              playerName: p.name,
              optionId,
              correct,
              roundScore: this.state.roundScores.get(p.id) ?? 0,
            });
          }

          const results: KoSamJaResultData = {
            questionText: (data.currentQuestionText as string) ?? '',
            questionShape:
              (data.currentQuestionShape as KoSamJaResultData['questionShape']) ??
              'fixed',
            subjectPlayerId: expectedSubject,
            subjectName: subjectName ?? '?',
            options: publicOptions,
            correctOptionId: correctId,
            guesses,
            subjectBonus: this.state.roundSubjectBonus,
            wrongGuessCount: this.state.roundWrongGuessCount,
          };
          data.results = results;

          for (const p of room.players) {
            if (p.id === expectedSubject) {
              playerData[p.id] = {
                wasSubject: true,
                subjectBonus: this.state.roundSubjectBonus,
                wrongGuessCount: this.state.roundWrongGuessCount,
                roundScore: this.state.roundScores.get(p.id) ?? 0,
                totalScore: p.score,
                myGuess: null,
              };
            } else {
              const my = this.state.roundGuesses.get(p.id);
              const optionId = my?.optionId ?? null;
              playerData[p.id] = {
                wasSubject: false,
                wasCorrect: optionId === correctId,
                roundScore: this.state.roundScores.get(p.id) ?? 0,
                totalScore: p.score,
                myGuess: optionId,
              };
            }
          }
        }
      }
    } else if (
      this.state.phase === 'leaderboard' ||
      this.state.phase === 'ended'
    ) {
      const leaderboard: KoSamJaLeaderboardEntry[] = room.players
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          score: p.score,
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      data.leaderboard = leaderboard;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentRoundIndex + 1,
      totalRounds: this.state.selectedRounds.length,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }
}
