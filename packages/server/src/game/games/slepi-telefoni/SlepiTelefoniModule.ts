import type {
  Room,
  GameState,
  Stroke,
  Chain,
  ChainItem,
  SlepiTelefoniHostData,
  SlepiTelefoniControllerData,
  SlepiTelefoniChainSummary,
  SlepiTelefoniLeaderboardEntry,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { SlepiTelefoniInternalState, SubmissionDraft } from './SlepiTelefoniState.js';
import {
  ENTERING_PROMPTS_DURATION,
  DRAWING_ROUND_DURATION,
  GUESS_ROUND_DURATION,
  REVEAL_CHAIN_BASE,
  REVEAL_CHAIN_PER_ITEM,
  REVEAL_CHAIN_GAP,
  VOTING_DURATION,
  WINNER_DURATION,
  FINAL_LEADERBOARD_DURATION,
  MAX_PROMPT_LENGTH,
  MAX_GUESS_LENGTH,
  MIN_ROUNDS,
  MAX_ROUNDS,
  DEFAULT_ROUNDS,
} from './SlepiTelefoniState.js';

function clampRounds(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_ROUNDS;
  const n = Math.floor(raw);
  if (n < MIN_ROUNDS) return MIN_ROUNDS;
  if (n > MAX_ROUNDS) return MAX_ROUNDS;
  return n;
}

export class SlepiTelefoniModule extends BaseGameModule {
  readonly gameId = 'slepi-telefoni';

  private state!: SlepiTelefoniInternalState;

  onStart(room: Room, customContent?: unknown): GameState {
    const slepiRounds =
      customContent && typeof customContent === 'object'
        ? (customContent as { slepiRounds?: unknown }).slepiRounds
        : undefined;
    const totalRounds = clampRounds(slepiRounds);

    this.state = {
      phase: 'entering-prompts',
      phaseTimeRemaining: ENTERING_PROMPTS_DURATION,
      totalRounds,
      playerOrder: [],
      chains: [],
      stepIndex: 0,
      submissions: new Map(),
      revealChain: 0,
      revealGapRemaining: 0,
      votes: new Map(),
      voteCounts: new Map(),
      winnerChainIndex: null,
    };

    this.enterPromptPhase(room);
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
      case 'slepi:submit-prompt': {
        if (this.state.phase !== 'entering-prompts') return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const text = this.cleanText(data.text, MAX_PROMPT_LENGTH);
        if (!text) return null;

        this.state.submissions.set(playerId, { done: true, text });
        this.maybeAdvanceOnAllSubmitted(room);
        return this.buildGameState(room);
      }

      case 'slepi:stroke': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const points = data.points as { x: number; y: number }[] | undefined;
        const color = data.color as string | undefined;
        const width = data.width as number | undefined;
        if (!Array.isArray(points) || !color || typeof width !== 'number') {
          return null;
        }
        const stroke: Stroke = { points, color, width };

        const draft = this.state.submissions.get(playerId) ?? { done: false };
        draft.strokes = draft.strokes ?? [];
        draft.strokes.push(stroke);
        this.state.submissions.set(playerId, draft);
        // No broadcast needed — strokes stay private until reveal.
        return null;
      }

      case 'slepi:clear': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const draft = this.state.submissions.get(playerId) ?? { done: false };
        draft.strokes = [];
        this.state.submissions.set(playerId, draft);
        return null;
      }

      case 'slepi:submit-drawing': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const draft = this.state.submissions.get(playerId) ?? { done: false };
        draft.done = true;
        draft.strokes = draft.strokes ?? [];
        this.state.submissions.set(playerId, draft);
        this.maybeAdvanceOnAllSubmitted(room);
        return this.buildGameState(room);
      }

      case 'slepi:submit-guess': {
        if (this.state.phase !== 'guess-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const text = this.cleanText(data.text, MAX_GUESS_LENGTH);
        if (!text) return null;

        this.state.submissions.set(playerId, { done: true, text });
        this.maybeAdvanceOnAllSubmitted(room);
        return this.buildGameState(room);
      }

      case 'slepi:vote-favorite': {
        if (this.state.phase !== 'voting') return null;
        if (this.state.votes.has(playerId)) return null;

        const chainIndex = data.chainIndex as number | undefined;
        if (typeof chainIndex !== 'number') return null;
        if (chainIndex < 0 || chainIndex >= this.state.chains.length) return null;
        if (this.state.chains[chainIndex].originId === playerId) return null;

        this.state.votes.set(playerId, chainIndex);

        const eligibleVoters = this.state.playerOrder.filter((id) => {
          const player = room.players.find((p) => p.id === id);
          return player?.isConnected;
        });
        if (this.state.votes.size >= eligibleVoters.length) {
          this.transitionToWinner(room);
        }
        return this.buildGameState(room);
      }

      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    const delta = deltaMs / 1000;

    if (this.state.phase === 'reveal') {
      this.tickReveal(room, delta);
    } else {
      this.state.phaseTimeRemaining -= delta;
      if (this.state.phaseTimeRemaining <= 0) {
        this.advancePhase(room);
      }
    }

    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    _playerId: string
  ): GameState | null {
    // Disconnects are handled by placeholder insertion at finalize-step boundaries.
    return this.buildGameState(room);
  }

  // --- Lifecycle helpers ---

  private enterPromptPhase(room: Room): void {
    const connected = room.players.filter((p) => p.isConnected);
    const order = connected.map((p) => p.id).sort(() => Math.random() - 0.5);

    this.state.playerOrder = order;
    this.state.chains = order.map((playerId, i) => {
      const player = room.players.find((p) => p.id === playerId);
      return {
        chainIndex: i,
        originId: playerId,
        originName: player?.name ?? '?',
        originColor: player?.avatarColor ?? '#888',
        items: [],
      };
    });
    this.state.stepIndex = 0;
    this.state.submissions = new Map();
    this.state.phase = 'entering-prompts';
    this.state.phaseTimeRemaining = ENTERING_PROMPTS_DURATION;
  }

  /**
   * Rotation math: for step k in 1..R*(N-1):
   *   pass       = floor((k-1) / (N-1))
   *   withinPass = ((k-1) mod (N-1)) + 1           // 1..N-1, never 0
   *   offset     = pass * N + withinPass           // skips N, 2N, 3N, ...
   *   player i works on chain (i + offset) mod N   // never own chain
   */
  private stepOffset(k: number): number {
    const n = this.state.playerOrder.length;
    const span = Math.max(n - 1, 1);
    const pass = Math.floor((k - 1) / span);
    const withinPass = ((k - 1) % span) + 1;
    return pass * n + withinPass;
  }

  private totalSteps(): number {
    const n = this.state.playerOrder.length;
    return Math.max(n - 1, 0) * this.state.totalRounds;
  }

  private maybeAdvanceOnAllSubmitted(room: Room): void {
    const expected = this.expectedSubmitters(room);
    const done = expected.filter(
      (id) => this.state.submissions.get(id)?.done
    ).length;
    if (done >= expected.length && expected.length > 0) {
      this.advancePhase(room);
    }
  }

  private expectedSubmitters(room: Room): string[] {
    return this.state.playerOrder.filter((id) => {
      const player = room.players.find((p) => p.id === id);
      return player?.isConnected;
    });
  }

  private isActiveSubmitter(room: Room, playerId: string): boolean {
    return this.expectedSubmitters(room).includes(playerId);
  }

  private cleanText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') return '';
    return raw.trim().slice(0, max);
  }

  // --- Phase state machine ---

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'entering-prompts':
        this.finalizePromptStep(room);
        this.enterDrawingOrGuessStep();
        break;

      case 'drawing-step':
        this.finalizeStep(room);
        this.enterDrawingOrGuessStep();
        break;

      case 'guess-step':
        this.finalizeStep(room);
        this.enterDrawingOrGuessStep();
        break;

      case 'reveal':
        this.transitionToVoting();
        break;

      case 'voting':
        this.transitionToWinner(room);
        break;

      case 'winner':
        this.transitionToFinalLeaderboard(room);
        break;

      case 'final-leaderboard':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        break;
    }
  }

  private finalizePromptStep(room: Room): void {
    for (let i = 0; i < this.state.playerOrder.length; i++) {
      const playerId = this.state.playerOrder[i];
      const player = room.players.find((p) => p.id === playerId);
      const draft = this.state.submissions.get(playerId);
      const text = draft?.text && draft.text.length > 0 ? draft.text : '(?)';
      const item: ChainItem = {
        kind: 'prompt',
        authorId: playerId,
        authorName: player?.name ?? '?',
        authorColor: player?.avatarColor ?? '#888',
        text,
      };
      this.state.chains[i].items.push(item);
    }
    this.state.submissions = new Map();
  }

  private finalizeStep(room: Room): void {
    const n = this.state.playerOrder.length;
    const offset = this.stepOffset(this.state.stepIndex);
    const isDrawing = this.state.phase === 'drawing-step';

    for (let i = 0; i < n; i++) {
      const playerId = this.state.playerOrder[i];
      const player = room.players.find((p) => p.id === playerId);
      const draft = this.state.submissions.get(playerId);
      const targetChain = (i + offset) % n;

      const base = {
        authorId: playerId,
        authorName: player?.name ?? '?',
        authorColor: player?.avatarColor ?? '#888',
      };

      let item: ChainItem;
      if (isDrawing) {
        item = {
          ...base,
          kind: 'drawing',
          strokes: draft?.strokes ?? [],
        };
      } else {
        const text = draft?.text && draft.text.length > 0 ? draft.text : '(?)';
        item = { ...base, kind: 'guess', text };
      }
      this.state.chains[targetChain].items.push(item);
    }
    this.state.submissions = new Map();
  }

  private enterDrawingOrGuessStep(): void {
    this.state.stepIndex += 1;

    if (this.state.stepIndex > this.totalSteps()) {
      this.state.phase = 'reveal';
      this.state.revealChain = 0;
      this.state.revealGapRemaining = 0;
      this.state.phaseTimeRemaining = this.revealChainDuration(0);
      return;
    }

    // Odd step => drawing, even step => guess.
    const isDrawing = this.state.stepIndex % 2 === 1;
    this.state.phase = isDrawing ? 'drawing-step' : 'guess-step';
    this.state.phaseTimeRemaining = isDrawing
      ? DRAWING_ROUND_DURATION
      : GUESS_ROUND_DURATION;
  }

  private revealChainDuration(chainIndex: number): number {
    const chain = this.state.chains[chainIndex];
    const items = chain?.items.length ?? 0;
    return REVEAL_CHAIN_BASE + REVEAL_CHAIN_PER_ITEM * items;
  }

  private tickReveal(_room: Room, delta: number): void {
    if (this.state.revealGapRemaining > 0) {
      this.state.revealGapRemaining -= delta;
      if (this.state.revealGapRemaining <= 0) {
        this.state.revealGapRemaining = 0;
        this.state.revealChain += 1;
        if (this.state.revealChain >= this.state.chains.length) {
          this.transitionToVoting();
          return;
        }
        this.state.phaseTimeRemaining = this.revealChainDuration(
          this.state.revealChain
        );
      }
      return;
    }

    this.state.phaseTimeRemaining -= delta;
    if (this.state.phaseTimeRemaining <= 0) {
      this.state.revealGapRemaining = REVEAL_CHAIN_GAP;
    }
  }

  private transitionToVoting(): void {
    this.state.phase = 'voting';
    this.state.phaseTimeRemaining = VOTING_DURATION;
    this.state.votes = new Map();
    this.state.voteCounts = new Map();
  }

  private transitionToWinner(room: Room): void {
    // Tally
    const counts = new Map<number, number>();
    for (const chainIndex of this.state.votes.values()) {
      counts.set(chainIndex, (counts.get(chainIndex) ?? 0) + 1);
    }
    this.state.voteCounts = counts;

    let winnerIndex = 0;
    let winnerVotes = -1;
    for (let i = 0; i < this.state.chains.length; i++) {
      const v = counts.get(i) ?? 0;
      if (v > winnerVotes) {
        winnerVotes = v;
        winnerIndex = i;
      }
    }
    this.state.winnerChainIndex = winnerIndex;

    // Per-chain votes go to the chain's origin player (single vote round).
    for (let i = 0; i < this.state.chains.length; i++) {
      const chain = this.state.chains[i];
      const got = counts.get(i) ?? 0;
      if (got === 0) continue;
      const player = room.players.find((p) => p.id === chain.originId);
      if (player) player.score += got;
    }

    this.state.phase = 'winner';
    this.state.phaseTimeRemaining = WINNER_DURATION;
  }

  private transitionToFinalLeaderboard(_room: Room): void {
    this.state.phase = 'final-leaderboard';
    this.state.phaseTimeRemaining = FINAL_LEADERBOARD_DURATION;
  }

  // --- buildGameState ---

  private buildGameState(room: Room): GameState {
    const s = this.state.stepIndex;
    const connectedCount = this.expectedSubmitters(room).length;
    const submittedCount = this.state.playerOrder.filter(
      (id) => this.state.submissions.get(id)?.done
    ).length;

    const hostData: SlepiTelefoniHostData = {
      totalRounds: this.state.totalRounds,
      stepIndex: s,
      totalSteps: this.totalSteps(),
      submittedCount,
      totalSubmitters: connectedCount,
    };

    if (
      this.state.phase === 'drawing-step' ||
      this.state.phase === 'guess-step'
    ) {
      hostData.stepKind =
        this.state.phase === 'drawing-step' ? 'drawing' : 'guess';
    }

    if (this.state.phase === 'reveal') {
      hostData.currentRevealChain = this.state.revealChain;
      const chain = this.state.chains[this.state.revealChain];
      if (chain) hostData.chainBeingRevealed = chain;
    }

    if (
      this.state.phase === 'voting' ||
      this.state.phase === 'winner'
    ) {
      hostData.chainsForVoting = this.state.chains;
      const voteCountsObj: Record<number, number> = {};
      for (const [idx, count] of this.state.voteCounts.entries()) {
        voteCountsObj[idx] = count;
      }
      hostData.voteCounts = voteCountsObj;
      hostData.votedCount = this.state.votes.size;
      hostData.totalVoters = connectedCount;
    }

    if (
      this.state.phase === 'winner' &&
      this.state.winnerChainIndex != null
    ) {
      const winnerChain = this.state.chains[this.state.winnerChainIndex];
      if (winnerChain) {
        hostData.winnerChain = winnerChain;
        hostData.winnerVotes =
          this.state.voteCounts.get(this.state.winnerChainIndex) ?? 0;
      }
    }

    if (this.state.phase === 'final-leaderboard') {
      const scoreByOrigin = new Map<string, number>();
      for (const chain of this.state.chains) {
        const got = this.state.voteCounts.get(chain.chainIndex) ?? 0;
        scoreByOrigin.set(
          chain.originId,
          (scoreByOrigin.get(chain.originId) ?? 0) + got
        );
      }
      const entries: SlepiTelefoniLeaderboardEntry[] = room.players
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          score: scoreByOrigin.get(p.id) ?? 0,
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));
      hostData.finalLeaderboard = entries;
    }

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host: hostData,
    };

    // Per-player controller state
    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      playerData[player.id] = this.buildControllerData(room, player.id) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: 1,
      totalRounds: 1,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildControllerData(
    room: Room,
    playerId: string
  ): SlepiTelefoniControllerData {
    const n = this.state.playerOrder.length;
    const s = this.state.stepIndex;
    const i = this.state.playerOrder.indexOf(playerId);
    const isActive = i >= 0;
    const hasSubmitted = !!this.state.submissions.get(playerId)?.done;

    const base: SlepiTelefoniControllerData = {
      role: 'spectator',
      hasSubmitted,
      hasVoted: this.state.votes.has(playerId),
      votedChainIndex: this.state.votes.get(playerId),
    };

    if (!isActive) return base;

    switch (this.state.phase) {
      case 'entering-prompts':
        base.role = 'prompter';
        break;

      case 'drawing-step': {
        base.role = 'drawer';
        const offset = this.stepOffset(s);
        const targetChain = this.state.chains[(i + offset) % n];
        const prev = targetChain?.items[targetChain.items.length - 1];
        if (prev && prev.kind === 'prompt' && prev.text) {
          base.promptToDraw = prev.text;
        } else if (prev && prev.kind === 'guess' && prev.text) {
          base.promptToDraw = prev.text;
        }
        break;
      }

      case 'guess-step': {
        base.role = 'guesser';
        const offset = this.stepOffset(s);
        const targetChain = this.state.chains[(i + offset) % n];
        const prev = targetChain?.items[targetChain.items.length - 1];
        if (prev && prev.kind === 'drawing') {
          base.drawingToGuess = prev.strokes ?? [];
        }
        break;
      }

      case 'voting': {
        base.role = 'voter';
        base.ownChainIndex = this.state.chains.findIndex(
          (c) => c.originId === playerId
        );
        const summaries: SlepiTelefoniChainSummary[] = this.state.chains.map(
          (c) => ({
            chainIndex: c.chainIndex,
            originName: c.originName,
            originColor: c.originColor,
            lastItem: c.items[c.items.length - 1] ?? {
              kind: 'prompt',
              authorId: c.originId,
              authorName: c.originName,
              authorColor: c.originColor,
              text: '(?)',
            },
          })
        );
        base.chainsForVoting = summaries;
        break;
      }

      default:
        base.role = 'spectator';
        break;
    }

    // Keep deterministic field for room safety
    void room;
    return base;
  }
}
