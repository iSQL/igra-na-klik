import type {
  Room,
  GameState,
  FibbageQuestion,
  FibbageAnswerOptionPublic,
  FibbageResultData,
  FibbageResultEntry,
  FibbageVoteTally,
  FibbageFoolEntry,
  FibbageLeaderboardEntry,
  FibbageQuestionPublic,
} from '@igra/shared';
import { FIBBAGE_QUESTION_BANK, FIBBAGE_MAX_ANSWER_LENGTH } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type {
  FibbageInternalState,
  FibbagePhase,
  FibbageAnswerOptionInternal,
} from './FibbageState.js';
import {
  SHOWING_QUESTION_DURATION,
  WRITING_ANSWERS_DURATION,
  VOTING_DURATION,
  SHOWING_RESULTS_DURATION,
  LEADERBOARD_DURATION,
  NUM_QUESTIONS,
  TRUTH_POINTS,
  FOOL_POINTS_PER_VOTER,
} from './FibbageState.js';

export class FibbageModule extends BaseGameModule {
  readonly gameId = 'fibbage';

  private state!: FibbageInternalState;

  onStart(room: Room): GameState {
    const shuffled = [...FIBBAGE_QUESTION_BANK]
      .sort(() => Math.random() - 0.5)
      .slice(0, NUM_QUESTIONS);

    this.state = {
      questions: shuffled,
      currentIndex: 0,
      phase: 'showing-question',
      phaseTimeRemaining: SHOWING_QUESTION_DURATION,
      submissions: new Map(),
      autoFinders: new Set(),
      options: [],
      votes: new Map(),
      roundScores: new Map(),
      roundFooledCounts: new Map(),
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
      case 'fibbage:submit-answer': {
        if (this.state.phase !== 'writing-answers') return null;
        if (this.state.submissions.has(playerId) || this.state.autoFinders.has(playerId)) {
          return null;
        }

        const rawText = (data.text as string) ?? '';
        const text = rawText.trim().slice(0, FIBBAGE_MAX_ANSWER_LENGTH);
        if (!text) return null;

        const realAnswer = this.currentQuestion().answer;
        if (this.normalize(text) === this.normalize(realAnswer)) {
          // Auto-find: player submitted the real answer, don't add to voting pool.
          this.state.autoFinders.add(playerId);
        } else {
          this.state.submissions.set(playerId, text);
        }

        // Transition if all connected non-drawer players accounted for
        const connectedPlayers = room.players.filter((p) => p.isConnected);
        const accountedFor = connectedPlayers.filter(
          (p) =>
            this.state.submissions.has(p.id) || this.state.autoFinders.has(p.id)
        );
        if (accountedFor.length >= connectedPlayers.length) {
          this.transitionToVoting(room);
        }

        return this.buildGameState(room);
      }

      case 'fibbage:vote': {
        if (this.state.phase !== 'voting') return null;
        if (this.state.votes.has(playerId)) return null;

        const optionId = data.optionId as string;
        const option = this.state.options.find((o) => o.id === optionId);
        if (!option) return null;

        // Can't vote for your own fake (unless you were an auto-finder)
        if (
          !this.state.autoFinders.has(playerId) &&
          option.ownerIds.includes(playerId)
        ) {
          return null;
        }

        this.state.votes.set(playerId, optionId);

        // Transition if all connected players have voted
        const connectedPlayers = room.players.filter((p) => p.isConnected);
        if (this.state.votes.size >= connectedPlayers.length) {
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

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'showing-question':
        this.state.phase = 'writing-answers';
        this.state.phaseTimeRemaining = WRITING_ANSWERS_DURATION;
        break;

      case 'writing-answers':
        this.transitionToVoting(room);
        break;

      case 'voting':
        this.transitionToResults(room);
        break;

      case 'showing-results':
        this.state.phase = 'leaderboard';
        this.state.phaseTimeRemaining = LEADERBOARD_DURATION;
        break;

      case 'leaderboard':
        if (this.state.currentIndex < this.state.questions.length - 1) {
          this.state.currentIndex++;
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

  private transitionToVoting(_room: Room): void {
    const question = this.currentQuestion();

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
  }

  private transitionToResults(room: Room): void {
    // Compute scores per player for this round
    const roundScores = new Map<string, number>();
    const fooledCounts = new Map<string, number>();

    for (const p of room.players) {
      roundScores.set(p.id, 0);
      fooledCounts.set(p.id, 0);
    }

    // Auto-finders get the full truth bonus
    for (const playerId of this.state.autoFinders) {
      roundScores.set(playerId, (roundScores.get(playerId) ?? 0) + TRUTH_POINTS);
    }

    // Find the real option
    const realOption = this.state.options.find((o) => o.isReal);

    // Voters who picked the real option get TRUTH_POINTS
    for (const [voterId, optionId] of this.state.votes.entries()) {
      const opt = this.state.options.find((o) => o.id === optionId);
      if (!opt) continue;

      if (opt.isReal) {
        roundScores.set(voterId, (roundScores.get(voterId) ?? 0) + TRUTH_POINTS);
      } else {
        // Voted for a fake — each owner scores FOOL_POINTS_PER_VOTER
        for (const ownerId of opt.ownerIds) {
          roundScores.set(
            ownerId,
            (roundScores.get(ownerId) ?? 0) + FOOL_POINTS_PER_VOTER
          );
          fooledCounts.set(ownerId, (fooledCounts.get(ownerId) ?? 0) + 1);
        }
      }
    }

    // Apply to players
    for (const p of room.players) {
      p.score += roundScores.get(p.id) ?? 0;
    }

    this.state.roundScores = roundScores;
    this.state.roundFooledCounts = fooledCounts;

    // Suppress unused-variable warning for realOption (reserved for logging/debugging)
    void realOption;

    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
  }

  private resetRoundState(): void {
    this.state.submissions = new Map();
    this.state.autoFinders = new Set();
    this.state.options = [];
    this.state.votes = new Map();
    this.state.roundScores = new Map();
    this.state.roundFooledCounts = new Map();
  }

  // --- Helpers ---

  private currentQuestion(): FibbageQuestion {
    return this.state.questions[this.state.currentIndex];
  }

  private normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private generateOptionId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // --- buildGameState ---

  private buildGameState(room: Room): GameState {
    const question = this.currentQuestion();
    const connectedPlayers = room.players.filter((p) => p.isConnected);

    const publicQuestion: FibbageQuestionPublic = {
      id: question.id,
      text: question.text,
      category: question.category,
    };

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      questionIndex: this.state.currentIndex,
      totalQuestions: this.state.questions.length,
      question: publicQuestion,
    };

    const playerData: Record<string, Record<string, unknown>> = {};

    switch (this.state.phase) {
      case 'showing-question':
        break;

      case 'writing-answers': {
        const accountedFor = connectedPlayers.filter(
          (p) =>
            this.state.submissions.has(p.id) || this.state.autoFinders.has(p.id)
        ).length;
        data.submittedCount = accountedFor;
        data.totalPlayers = connectedPlayers.length;
        for (const player of room.players) {
          playerData[player.id] = {
            hasSubmitted:
              this.state.submissions.has(player.id) ||
              this.state.autoFinders.has(player.id),
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
        data.votedCount = this.state.votes.size;
        data.totalPlayers = connectedPlayers.length;

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
          };
        }
        break;
      }

      case 'showing-results': {
        const publicOptions: FibbageAnswerOptionPublic[] = this.state.options.map(
          (o) => ({ id: o.id, text: o.text })
        );

        // Build vote tallies
        const votesByOption = new Map<string, string[]>();
        for (const [voterId, optionId] of this.state.votes.entries()) {
          if (!votesByOption.has(optionId)) votesByOption.set(optionId, []);
          votesByOption.get(optionId)!.push(voterId);
        }
        const votes: FibbageVoteTally[] = Array.from(votesByOption.entries()).map(
          ([optionId, voterPlayerIds]) => ({ optionId, voterPlayerIds })
        );

        // Build fool entries for fakes that got ≥1 vote
        const fools: FibbageFoolEntry[] = [];
        for (const opt of this.state.options) {
          if (opt.isReal) continue;
          const voters = votesByOption.get(opt.id) ?? [];
          if (voters.length === 0) continue;
          const fakerNames = opt.ownerIds
            .map((id) => room.players.find((p) => p.id === id)?.name ?? '?')
            .filter((n) => n !== '?');
          const fooledPlayerNames = voters
            .map((id) => room.players.find((p) => p.id === id)?.name ?? '?')
            .filter((n) => n !== '?');
          fools.push({
            optionId: opt.id,
            optionText: opt.text,
            fakerPlayerIds: opt.ownerIds,
            fakerNames,
            fooledPlayerNames,
          });
        }

        const results: FibbageResultEntry[] = room.players.map((p) => ({
          playerId: p.id,
          foundTruth:
            this.state.autoFinders.has(p.id) ||
            (() => {
              const voted = this.state.votes.get(p.id);
              if (!voted) return false;
              const opt = this.state.options.find((o) => o.id === voted);
              return opt?.isReal ?? false;
            })(),
          fooledCount: this.state.roundFooledCounts.get(p.id) ?? 0,
          roundScore: this.state.roundScores.get(p.id) ?? 0,
        }));

        const realOption = this.state.options.find((o) => o.isReal);

        const resultData: FibbageResultData = {
          question: publicQuestion,
          realAnswer: question.answer,
          realOptionId: realOption?.id ?? '',
          options: publicOptions,
          votes,
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
            realAnswer: question.answer,
          };
        }
        break;
      }

      case 'leaderboard':
      case 'ended': {
        const leaderboard: FibbageLeaderboardEntry[] = room.players
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

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentIndex + 1,
      totalRounds: this.state.questions.length,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }
}
