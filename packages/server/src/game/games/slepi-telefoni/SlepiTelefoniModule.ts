import type {
  Room,
  GameState,
  ChainItem,
  SlepiTelefoniHostData,
  SlepiTelefoniControllerData,
} from '@igra/shared';
import {
  appendStrokeOp,
  appendFillOp,
  appendEraseOp,
  undoLast,
  clearOps,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { SlepiTelefoniInternalState } from './SlepiTelefoniState.js';
import {
  ENTERING_PROMPTS_DURATION,
  DRAWING_ROUND_DURATION,
  GUESS_ROUND_DURATION,
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
  private pendingPrivate: { playerId: string; gameState: GameState } | null = null;

  getPendingPrivateUpdate(): { playerId: string; gameState: GameState } | null {
    const pending = this.pendingPrivate;
    this.pendingPrivate = null;
    return pending;
  }

  private queuePrivateEmit(room: Room, playerId: string): void {
    this.pendingPrivate = {
      playerId,
      gameState: this.buildGameState(room),
    };
  }

  private ensureDraft(playerId: string) {
    const draft = this.state.submissions.get(playerId) ?? { done: false };
    draft.operations = draft.operations ?? [];
    this.state.submissions.set(playerId, draft);
    return draft;
  }

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
        const sessionId = data.sessionId as string | undefined;
        if (!Array.isArray(points) || points.length < 2 || !color || typeof width !== 'number') {
          return null;
        }
        const draft = this.ensureDraft(playerId);
        appendStrokeOp(draft.operations!, { points, color, width, sessionId });
        // No private echo: the drawer's pad already painted the stroke
        // locally, and the 1s tick carries the full draft for consistency.
        // Echoing every 50ms batch re-sent the whole growing drawing and
        // caused input lag on phones.
        return null;
      }

      case 'slepi:fill': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const x = data.x as number;
        const y = data.y as number;
        const color = data.color as string;
        if (typeof x !== 'number' || typeof y !== 'number' || !color) return null;
        const draft = this.ensureDraft(playerId);
        appendFillOp(draft.operations!, { x, y, color });
        this.queuePrivateEmit(room, playerId);
        return null;
      }

      case 'slepi:erase': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const targetId = data.targetId as string;
        if (!targetId) return null;
        const draft = this.ensureDraft(playerId);
        const op = appendEraseOp(draft.operations!, targetId);
        if (!op) return null;
        this.queuePrivateEmit(room, playerId);
        return null;
      }

      case 'slepi:undo': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const draft = this.ensureDraft(playerId);
        const removed = undoLast(draft.operations!);
        if (removed === 0) return null;
        this.queuePrivateEmit(room, playerId);
        return null;
      }

      case 'slepi:clear': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const draft = this.ensureDraft(playerId);
        clearOps(draft.operations!);
        this.queuePrivateEmit(room, playerId);
        return null;
      }

      case 'slepi:submit-drawing': {
        if (this.state.phase !== 'drawing-step') return null;
        if (!this.isActiveSubmitter(room, playerId)) return null;
        if (this.state.submissions.get(playerId)?.done) return null;

        const draft = this.ensureDraft(playerId);
        draft.done = true;
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

      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    const delta = deltaMs / 1000;

    // Reveal advances on host action only — no auto timer.
    if (this.state.phase === 'reveal') {
      return this.buildGameState(room);
    }

    this.state.phaseTimeRemaining -= delta;
    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }

    return this.buildGameState(room);
  }

  onHostAction(
    room: Room,
    _gameState: GameState,
    action: string,
    _data: Record<string, unknown>
  ): GameState | null {
    if (action !== 'slepi:next-chain') return null;
    if (this.state.phase !== 'reveal') return null;

    const next = this.state.revealChain + 1;
    if (next >= this.state.chains.length) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
    } else {
      this.state.revealChain = next;
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
    const order = shuffled(connected.map((p) => p.id));

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
    const raw = Math.max(n - 1, 0) * this.state.totalRounds;
    if (raw === 0) return 0;
    // Round up to even so every chain ends on a guess (not a dangling
    // drawing). The rotation math still avoids own-chain hits because
    // offsets stay non-zero mod N — players just revisit a previously
    // touched chain when this fixup adds a step.
    return raw % 2 === 0 ? raw : raw + 1;
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
      case 'guess-step':
        this.finalizeStep(room);
        this.enterDrawingOrGuessStep();
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
          operations: draft?.operations ?? [],
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
      // Reveal is host-driven — no countdown for the controller bar.
      this.state.phaseTimeRemaining = 0;
      return;
    }

    // Odd step => drawing, even step => guess.
    const isDrawing = this.state.stepIndex % 2 === 1;
    this.state.phase = isDrawing ? 'drawing-step' : 'guess-step';
    this.state.phaseTimeRemaining = isDrawing
      ? DRAWING_ROUND_DURATION
      : GUESS_ROUND_DURATION;
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
      hostData.totalChains = this.state.chains.length;
      const chain = this.state.chains[this.state.revealChain];
      if (chain) hostData.chainBeingRevealed = chain;
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
        base.myDraft = this.state.submissions.get(playerId)?.operations ?? [];
        break;
      }

      case 'guess-step': {
        base.role = 'guesser';
        const offset = this.stepOffset(s);
        const targetChain = this.state.chains[(i + offset) % n];
        const prev = targetChain?.items[targetChain.items.length - 1];
        if (prev && prev.kind === 'drawing') {
          base.drawingToGuess = prev.operations ?? [];
        }
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
