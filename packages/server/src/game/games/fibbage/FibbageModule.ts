import type {
  Room,
  GameState,
  DiplomaCandidate,
  FibbageQuestion,
  FibbageAnswerOptionPublic,
  FibbageResultData,
  FibbageResultEntry,
  FibbageRevealOption,
  FibbageFoolEntry,
  FibbageLeaderboardEntry,
  FibbageQuestionPublic,
} from '@igra/shared';
import {
  FIBBAGE_QUESTION_BANK,
  FIBBAGE_MAX_ANSWER_LENGTH,
  clampGameRounds,
  fibbageGlasLabel,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import { resolveFibbageQuestions } from './fibbage-pack-resolver.js';
import type {
  FibbageInternalState,
  FibbagePlayerStats,
  FibbageAnswerOptionInternal,
} from './FibbageState.js';
import {
  SHOWING_QUESTION_DURATION,
  WRITING_ANSWERS_DURATION,
  VOTING_DURATION,
  SHOWING_RESULTS_DURATION,
  LEADERBOARD_DURATION,
  TRUTH_POINTS,
  FOOL_POINTS_PER_VOTER,
} from './FibbageState.js';

interface FibbageCustomContent {
  fibbagePackIds?: unknown;
  fibbageCategories?: unknown;
  roundCount?: unknown;
}

export class FibbageModule extends BaseGameModule {
  readonly gameId = 'fibbage';

  private state!: FibbageInternalState;
  private timings: Record<string, number> = {};
  private roundCount = 5;

  constructor(private readonly packsDir: string = '') {
    super();
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent ?? {}) as FibbageCustomContent;
    this.roundCount = clampGameRounds(this.gameId, cc.roundCount);

    const packIds = Array.isArray(cc.fibbagePackIds)
      ? (cc.fibbagePackIds.filter((v) => typeof v === 'string') as string[])
      : [];
    const categories = Array.isArray(cc.fibbageCategories)
      ? (cc.fibbageCategories.filter((v) => typeof v === 'string') as string[])
      : null;

    this.state = {
      questions: [],
      questionsReady: false,
      currentIndex: 0,
      phase: 'showing-question',
      phaseTimeRemaining:
        this.timings.SHOWING_QUESTION_DURATION ?? SHOWING_QUESTION_DURATION,
      submissions: new Map(),
      autoFinders: new Set(),
      options: [],
      votes: new Map(),
      roundScores: new Map(),
      roundFooledCounts: new Map(),
      roundTruthWithheld: new Set(),
      playerStats: new Map(),
      expectedSubmitterIds: new Set(),
      expectedVoterIds: new Set(),
    };

    for (const p of room.players) this.statsFor(p.id);

    if (packIds.length > 0 && this.packsDir) {
      // Packs load from disk; onStart can't be async, so the first phase holds
      // until this resolves (or falls back to the built-in bank).
      void this.loadPacks(packIds, categories);
    } else {
      this.setQuestions(FIBBAGE_QUESTION_BANK);
    }

    return this.buildGameState(room);
  }

  /**
   * Pool the selected packs, apply the category filter, and fall back to the
   * built-in bank when nothing resolves — a bad pack must never leave the room
   * staring at an empty screen.
   */
  private async loadPacks(
    packIds: string[],
    categories: string[] | null
  ): Promise<void> {
    let pooled: FibbageQuestion[] = [];
    try {
      pooled = await resolveFibbageQuestions(this.packsDir, packIds, categories);
    } catch (err) {
      console.error('fibbage: failed to resolve packs:', err);
    }
    this.setQuestions(pooled.length > 0 ? pooled : FIBBAGE_QUESTION_BANK);
  }

  private setQuestions(pool: readonly FibbageQuestion[]): void {
    this.state.questions = shuffled([...pool]).slice(
      0,
      Math.min(this.roundCount, pool.length)
    );
    this.state.questionsReady = this.state.questions.length > 0;
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    switch (action) {
      case 'fibbage:submit-answer': {
        if (this.state.phase !== 'writing-answers') return null;
        if (!this.state.expectedSubmitterIds.has(playerId)) return null;
        if (this.state.submissions.has(playerId) || this.state.autoFinders.has(playerId)) {
          return null;
        }

        const rawText = (data.text as string) ?? '';
        const text = rawText.trim().slice(0, FIBBAGE_MAX_ANSWER_LENGTH);
        if (!text) return null;

        if (this.matchesRealAnswer(text)) {
          // Auto-find: player submitted the real answer, don't add to voting pool.
          this.state.autoFinders.add(playerId);
        } else {
          this.state.submissions.set(playerId, text);
        }

        if (this.allExpectedSubmitted(room)) {
          this.transitionToVoting(room);
        }

        return this.buildGameState(room);
      }

      case 'fibbage:vote': {
        if (this.state.phase !== 'voting') return null;
        // Auto-finders are out of the vote entirely — they already scored the
        // truth bonus, so letting them vote would just pay it twice.
        if (!this.state.expectedVoterIds.has(playerId)) return null;
        if (this.state.votes.has(playerId)) return null;

        const optionId = data.optionId as string;
        const option = this.state.options.find((o) => o.id === optionId);
        if (!option) return null;

        // Can't vote for your own fake.
        if (option.ownerIds.includes(playerId)) return null;

        this.state.votes.set(playerId, optionId);

        if (this.allExpectedVoted(room)) {
          this.transitionToResults(room);
        }

        return this.buildGameState(room);
      }

      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    // Hold the opening phase while the packs are still loading rather than
    // running the writing timer against a question nobody has seen.
    if (!this.state.questionsReady) return this.buildGameState(room);

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
    // Past-grace removal — release the player's slot from the active
    // snapshot so the round can early-exit once the rest are done.
    this.state.expectedSubmitterIds.delete(playerId);
    this.state.expectedVoterIds.delete(playerId);
    if (
      this.state.phase === 'writing-answers' &&
      this.allExpectedSubmitted(room)
    ) {
      this.transitionToVoting(room);
    } else if (
      this.state.phase === 'voting' &&
      this.allExpectedVoted(room)
    ) {
      this.transitionToResults(room);
    }
    return this.buildGameState(room);
  }

  private allExpectedSubmitted(room: Room): boolean {
    if (this.state.phase !== 'writing-answers') return false;
    for (const id of this.state.expectedSubmitterIds) {
      if (
        this.state.submissions.has(id) ||
        this.state.autoFinders.has(id)
      ) {
        continue;
      }
      const stillInRoom = room.players.some((p) => p.id === id);
      if (!stillInRoom) continue;
      return false;
    }
    return true;
  }

  private allExpectedVoted(room: Room): boolean {
    if (this.state.phase !== 'voting') return false;
    for (const id of this.state.expectedVoterIds) {
      if (this.state.votes.has(id)) continue;
      const stillInRoom = room.players.some((p) => p.id === id);
      if (!stillInRoom) continue;
      return false;
    }
    return true;
  }

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'showing-question':
        this.state.phase = 'writing-answers';
        this.state.phaseTimeRemaining = WRITING_ANSWERS_DURATION;
        this.state.expectedSubmitterIds = new Set(
          room.players.filter((p) => p.isConnected).map((p) => p.id)
        );
        for (const id of this.state.expectedSubmitterIds) {
          this.statsFor(id).roundsPlayed++;
        }
        break;

      case 'writing-answers':
        this.transitionToVoting(room);
        break;

      case 'voting':
        this.transitionToResults(room);
        break;

      case 'showing-results':
        this.state.phase = 'leaderboard';
        this.state.phaseTimeRemaining =
          this.timings.LEADERBOARD_DURATION ?? LEADERBOARD_DURATION;
        break;

      case 'leaderboard':
        if (this.state.currentIndex < this.state.questions.length - 1) {
          this.state.currentIndex++;
          this.resetRoundState();
          this.state.phase = 'showing-question';
          this.state.phaseTimeRemaining =
            this.timings.SHOWING_QUESTION_DURATION ?? SHOWING_QUESTION_DURATION;
        } else {
          this.state.phase = 'ended';
          this.state.phaseTimeRemaining = 0;
        }
        break;
    }
  }

  private transitionToVoting(room: Room): void {
    const question = this.currentQuestion();

    for (const id of this.state.expectedSubmitterIds) {
      if (this.state.submissions.has(id) || this.state.autoFinders.has(id)) {
        this.statsFor(id).roundsSubmitted++;
      }
    }
    for (const id of this.state.autoFinders) this.statsFor(id).autoFinds++;

    // Build options: the real answer + unique fakes (merged by normalized text)
    const options: FibbageAnswerOptionInternal[] = [];

    // Real answer
    const realId = this.generateOptionId('real');
    options.push({
      id: realId,
      text: question.answer,
      isReal: true,
      ownerIds: [],
    });

    // Group fakes by normalized text (case-insensitive merge)
    const fakeGroups = new Map<string, { text: string; ownerIds: string[] }>();
    for (const [playerId, text] of this.state.submissions.entries()) {
      const key = this.normalize(text);
      if (key === this.normalize(question.answer)) continue; // safety: shouldn't happen
      const existing = fakeGroups.get(key);
      if (existing) {
        existing.ownerIds.push(playerId);
      } else {
        fakeGroups.set(key, { text, ownerIds: [playerId] });
      }
    }

    let fakeCounter = 0;
    for (const { text, ownerIds } of fakeGroups.values()) {
      options.push({
        id: this.generateOptionId(`fake-${fakeCounter++}`),
        text,
        isReal: false,
        ownerIds,
      });
    }

    // Shuffle
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    this.state.options = options;
    this.state.votes = new Map();
    this.state.phase = 'voting';
    this.state.phaseTimeRemaining = VOTING_DURATION;
    this.state.expectedVoterIds = new Set(
      room.players
        .filter((p) => p.isConnected && !this.state.autoFinders.has(p.id))
        .map((p) => p.id)
    );

    // Everyone who mattered already found the truth — nothing left to vote on.
    if (this.state.expectedVoterIds.size === 0) {
      this.transitionToResults(room);
    }
  }

  private transitionToResults(room: Room): void {
    // Compute scores per player for this round
    const roundScores = new Map<string, number>();
    const fooledCounts = new Map<string, number>();
    const truthWithheld = new Set<string>();

    for (const p of room.players) {
      roundScores.set(p.id, 0);
      fooledCounts.set(p.id, 0);
    }

    // Auto-finders get the truth bonus once, and are not in the vote at all.
    for (const playerId of this.state.autoFinders) {
      roundScores.set(playerId, (roundScores.get(playerId) ?? 0) + TRUTH_POINTS);
    }

    for (const [voterId, optionId] of this.state.votes.entries()) {
      const opt = this.state.options.find((o) => o.id === optionId);
      if (!opt) continue;

      if (opt.isReal) {
        // Sitting out the writing phase must not be a viable strategy: a
        // player who never wrote a lie still votes, but earns nothing for it.
        if (this.wroteLie(voterId)) {
          roundScores.set(voterId, (roundScores.get(voterId) ?? 0) + TRUTH_POINTS);
        } else {
          truthWithheld.add(voterId);
        }
      } else {
        // Voted for a fake — each owner scores FOOL_POINTS_PER_VOTER
        this.statsFor(voterId).timesFooled++;
        for (const ownerId of opt.ownerIds) {
          roundScores.set(
            ownerId,
            (roundScores.get(ownerId) ?? 0) + FOOL_POINTS_PER_VOTER
          );
          fooledCounts.set(ownerId, (fooledCounts.get(ownerId) ?? 0) + 1);
        }
      }
    }

    // Apply to players and roll the cumulative tallies.
    for (const p of room.players) {
      p.score += roundScores.get(p.id) ?? 0;
      const stats = this.statsFor(p.id);
      const fooled = fooledCounts.get(p.id) ?? 0;
      stats.totalFooled += fooled;
      if (fooled > 0) stats.roundsWithAFool++;
    }
    for (const opt of this.state.options) {
      if (opt.isReal) continue;
      const voteCount = [...this.state.votes.values()].filter(
        (id) => id === opt.id
      ).length;
      if (voteCount === 0) continue;
      for (const ownerId of opt.ownerIds) {
        const stats = this.statsFor(ownerId);
        if (voteCount > stats.bestLieVotes) {
          stats.bestLieVotes = voteCount;
          stats.bestLieText = opt.text;
        }
      }
    }
    for (const p of room.players) {
      if (this.foundTruth(p.id)) this.statsFor(p.id).truthsFound++;
    }

    this.state.roundScores = roundScores;
    this.state.roundFooledCounts = fooledCounts;
    this.state.roundTruthWithheld = truthWithheld;

    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining =
      this.timings.SHOWING_RESULTS_DURATION ?? SHOWING_RESULTS_DURATION;
  }

  private resetRoundState(): void {
    this.state.submissions = new Map();
    this.state.autoFinders = new Set();
    this.state.options = [];
    this.state.votes = new Map();
    this.state.roundScores = new Map();
    this.state.roundFooledCounts = new Map();
    this.state.roundTruthWithheld = new Set();
  }

  // --- Helpers ---

  private currentQuestion(): FibbageQuestion {
    return this.state.questions[this.state.currentIndex];
  }

  private normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * True when the player typed the real answer. Pack authors can widen this
   * with `accept` (e.g. "3" alongside "tri") so a correct guess in a different
   * spelling isn't dumped into the lie pool as a near-duplicate of the truth.
   */
  private matchesRealAnswer(text: string): boolean {
    const q = this.currentQuestion();
    const key = this.normalize(text);
    if (key === this.normalize(q.answer)) return true;
    return (q.accept ?? []).some((alt) => this.normalize(alt) === key);
  }

  /** Did this player put a lie (or the truth) in during the writing phase? */
  private wroteLie(playerId: string): boolean {
    return (
      this.state.submissions.has(playerId) || this.state.autoFinders.has(playerId)
    );
  }

  private foundTruth(playerId: string): boolean {
    if (this.state.autoFinders.has(playerId)) return true;
    const voted = this.state.votes.get(playerId);
    if (!voted) return false;
    return this.state.options.find((o) => o.id === voted)?.isReal ?? false;
  }

  private statsFor(playerId: string): FibbagePlayerStats {
    let stats = this.state.playerStats.get(playerId);
    if (!stats) {
      stats = {
        roundsPlayed: 0,
        roundsSubmitted: 0,
        truthsFound: 0,
        autoFinds: 0,
        totalFooled: 0,
        roundsWithAFool: 0,
        timesFooled: 0,
        bestLieVotes: 0,
        bestLieText: null,
      };
      this.state.playerStats.set(playerId, stats);
    }
    return stats;
  }

  private generateOptionId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // --- Awards ---

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.state.playerStats.entries()]
      .filter(([id]) => room.players.some((p) => p.id === id))
      .map(([id, s]) => ({ id, s }))
      .filter((e) => e.s.roundsPlayed > 0);

    if (entries.length === 0) return candidates;

    // Najveći lažov — the single lie that drew the most votes all game.
    const bestLiar = entries.reduce((a, b) =>
      b.s.bestLieVotes > a.s.bestLieVotes ? b : a
    );
    if (bestLiar.s.bestLieVotes > 0) {
      candidates.push({
        playerId: bestLiar.id,
        awardId: 'najveci-lazov',
        priority: 62,
        subtitle: bestLiar.s.bestLieText
          ? `„${bestLiar.s.bestLieText}" — ${
              bestLiar.s.bestLieVotes
            } ${fibbageGlasLabel(bestLiar.s.bestLieVotes)}`
          : undefined,
      });
    }

    // Detektor laži — found the truth in (almost) every round.
    const sleuths = entries.filter(
      (e) => e.s.roundsPlayed >= 3 && e.s.truthsFound / e.s.roundsPlayed >= 0.7
    );
    if (sleuths.length > 0) {
      const best = sleuths.reduce((a, b) =>
        b.s.truthsFound / b.s.roundsPlayed > a.s.truthsFound / a.s.roundsPlayed
          ? b
          : a
      );
      candidates.push({
        playerId: best.id,
        awardId: 'detektor-lazi',
        priority: 56,
        subtitle: `${best.s.truthsFound}/${best.s.roundsPlayed} tačnih odgovora`,
      });
    }

    // Naivčina — fell for other people's lies the most.
    const gullible = entries.reduce((a, b) =>
      b.s.timesFooled > a.s.timesFooled ? b : a
    );
    if (gullible.s.timesFooled >= 2) {
      candidates.push({
        playerId: gullible.id,
        awardId: 'naivcina',
        priority: 44,
        subtitle: `Poverovao/la u ${gullible.s.timesFooled} ${
          gullible.s.timesFooled < 5 ? 'tuđe laži' : 'tuđih laži'
        }`,
      });
    }

    // Nevidljivi lažov — wrote every round and never fooled anybody.
    const invisible = entries.filter(
      (e) =>
        e.s.roundsPlayed >= 3 &&
        e.s.roundsSubmitted === e.s.roundsPlayed &&
        e.s.totalFooled === 0
    );
    if (invisible.length > 0) {
      candidates.push({
        playerId: invisible[0].id,
        awardId: 'nevidljivi-lazov',
        priority: 40,
      });
    }

    // Duh — sat out most of the writing phases.
    const ghosts = entries.filter(
      (e) => e.s.roundsPlayed >= 3 && e.s.roundsSubmitted <= e.s.roundsPlayed / 2
    );
    if (ghosts.length > 0) {
      const worst = ghosts.reduce((a, b) =>
        b.s.roundsSubmitted < a.s.roundsSubmitted ? b : a
      );
      candidates.push({
        playerId: worst.id,
        awardId: 'duh-lazov',
        priority: 38,
        subtitle: `Napisao/la laž samo ${worst.s.roundsSubmitted} od ${worst.s.roundsPlayed} puta`,
      });
    }

    return candidates;
  }

  // --- buildGameState ---

  private buildGameState(room: Room): GameState {
    const question = this.state.questionsReady
      ? this.currentQuestion()
      : undefined;
    const connectedPlayers = room.players.filter((p) => p.isConnected);

    const publicQuestion: FibbageQuestionPublic | undefined = question
      ? {
          id: question.id,
          text: question.text,
          category: question.category,
        }
      : undefined;

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      questionIndex: this.state.currentIndex,
      totalQuestions: this.state.questions.length || this.roundCount,
      question: publicQuestion,
      loading: !this.state.questionsReady,
    };

    const playerData: Record<string, Record<string, unknown>> = {};

    switch (this.state.phase) {
      case 'showing-question':
        break;

      case 'writing-answers': {
        // Per-player chips on the TV: who is still typing. Only the boolean
        // travels — never the text.
        const submitters = connectedPlayers
          .filter((p) => this.state.expectedSubmitterIds.has(p.id))
          .map((p) => ({
            playerId: p.id,
            name: p.name,
            avatarColor: p.avatarColor,
            done: this.wroteLie(p.id),
          }));
        data.submitters = submitters;
        data.submittedCount = submitters.filter((s) => s.done).length;
        data.totalPlayers = submitters.length;
        for (const player of room.players) {
          playerData[player.id] = {
            hasSubmitted: this.wroteLie(player.id),
            isAutoFinder: this.state.autoFinders.has(player.id),
          };
        }
        break;
      }

      case 'voting': {
        const publicOptions: FibbageAnswerOptionPublic[] = this.state.options.map(
          (o) => ({ id: o.id, text: o.text })
        );
        data.options = publicOptions;
        // Same chip list, now for votes. Auto-finders sit this one out, so
        // they're marked rather than counted against the total.
        const voters = connectedPlayers
          .filter((p) => this.state.expectedVoterIds.has(p.id))
          .map((p) => ({
            playerId: p.id,
            name: p.name,
            avatarColor: p.avatarColor,
            done: this.state.votes.has(p.id),
          }));
        data.voters = voters;
        data.votedCount = voters.filter((v) => v.done).length;
        data.totalPlayers = voters.length;
        data.autoFinderCount = this.state.autoFinders.size;

        for (const player of room.players) {
          // Find which option (if any) belongs to this player
          const myOption = this.state.options.find((o) =>
            o.ownerIds.includes(player.id)
          );
          playerData[player.id] = {
            hasVoted: this.state.votes.has(player.id),
            votedOptionId: this.state.votes.get(player.id) ?? null,
            myFakeOptionId: myOption?.id ?? null,
            isAutoFinder: this.state.autoFinders.has(player.id),
            canVote: this.state.expectedVoterIds.has(player.id),
          };
        }
        break;
      }

      // Results and leaderboard are built for all three phases so clients
      // can show a single merged "reveal + standings" screen; the TV still
      // picks what to render by phase. currentIndex only advances when the
      // next question starts, so the round's votes/options are still valid
      // here.
      case 'showing-results':
      case 'leaderboard':
      case 'ended': {
        if (!question || !publicQuestion) break;

        const votesByOption = new Map<string, string[]>();
        for (const [voterId, optionId] of this.state.votes.entries()) {
          if (!votesByOption.has(optionId)) votesByOption.set(optionId, []);
          votesByOption.get(optionId)!.push(voterId);
        }

        const nameOf = (id: string) =>
          room.players.find((p) => p.id === id)?.name ?? '?';

        // Every option is attributed, including the lies nobody picked —
        // "who wrote THAT?" is half the payoff, and the old reveal dropped it.
        // Sorted so the truth lands last: 0-vote lies, then rising vote count.
        const revealOptions: FibbageRevealOption[] = this.state.options
          .map((opt): FibbageRevealOption => {
            const voters = votesByOption.get(opt.id) ?? [];
            return {
              id: opt.id,
              text: opt.text,
              isReal: opt.isReal,
              authorPlayerIds: opt.ownerIds,
              authorNames: opt.ownerIds
                .map(nameOf)
                .filter((n) => n !== '?'),
              voterPlayerIds: voters,
              pointsEarned: opt.isReal
                ? 0
                : voters.length * FOOL_POINTS_PER_VOTER,
            };
          })
          .sort((a, b) => {
            if (a.isReal !== b.isReal) return a.isReal ? 1 : -1;
            return a.voterPlayerIds.length - b.voterPlayerIds.length;
          });

        const fools: FibbageFoolEntry[] = [];
        for (const opt of revealOptions) {
          if (opt.isReal || opt.voterPlayerIds.length === 0) continue;
          fools.push({
            optionId: opt.id,
            optionText: opt.text,
            fakerPlayerIds: opt.authorPlayerIds,
            fakerNames: opt.authorNames,
            fooledPlayerNames: opt.voterPlayerIds
              .map(nameOf)
              .filter((n) => n !== '?'),
          });
        }

        const results: FibbageResultEntry[] = room.players.map((p) => ({
          playerId: p.id,
          foundTruth: this.foundTruth(p.id),
          fooledCount: this.state.roundFooledCounts.get(p.id) ?? 0,
          roundScore: this.state.roundScores.get(p.id) ?? 0,
          wroteLie: this.wroteLie(p.id),
          truthBonusWithheld: this.state.roundTruthWithheld.has(p.id),
        }));

        const realOption = this.state.options.find((o) => o.isReal);

        const resultData: FibbageResultData = {
          question: publicQuestion,
          realAnswer: question.answer,
          realOptionId: realOption?.id ?? '',
          revealOptions,
          fools,
          results,
        };
        data.results = resultData;

        // Per-player summary for controller RoundResult
        for (const player of room.players) {
          const entry = results.find((r) => r.playerId === player.id);
          playerData[player.id] = {
            foundTruth: entry?.foundTruth ?? false,
            fooledCount: entry?.fooledCount ?? 0,
            roundScore: entry?.roundScore ?? 0,
            wroteLie: entry?.wroteLie ?? false,
            truthBonusWithheld: entry?.truthBonusWithheld ?? false,
            realAnswer: question.answer,
          };
        }

        const leaderboard: FibbageLeaderboardEntry[] = room.players
          .map((p) => ({
            playerId: p.id,
            name: p.name,
            avatarColor: p.avatarColor,
            score: p.score,
            roundScore: this.state.roundScores.get(p.id) ?? 0,
            rank: 0,
          }))
          .sort((a, b) => b.score - a.score)
          .map((entry, i) => ({ ...entry, rank: i + 1 }));
        data.leaderboard = leaderboard;
        break;
      }
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentIndex + 1,
      totalRounds: this.state.questions.length || this.roundCount,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }
}
