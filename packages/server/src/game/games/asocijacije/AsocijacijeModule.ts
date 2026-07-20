import type {
  AsocijacijeColumnView,
  AsocijacijeControllerData,
  AsocijacijeFieldView,
  AsocijacijeHostData,
  AsocijacijeMode,
  AsocijacijePuzzle,
  AsocijacijeQuestionView,
  AsocijacijeScoreEntry,
  GameState,
  Room,
} from '@igra/shared';
import {
  ASOCIJACIJE_BANK,
  ASOCIJACIJE_BANK_PACK_ID,
  ASOCIJACIJE_COLUMN_COLORS,
  ASOCIJACIJE_COLUMN_LETTERS,
  checkEmojiGuess,
  isKvizCapablePuzzle,
  parseAsocijacijePack,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import { resolveAsocijacijePackSync } from './asocijacije-pack-resolver.js';
import {
  BOARD_RESULTS_DURATION,
  COLUMN_POINTS,
  FINAL_POINTS,
  KVIZ_FIELD_POINTS,
  LEADERBOARD_DURATION,
  TURN_DURATION,
  UNOPENED_FIELD_BONUS,
  type AsocijacijeInternalState,
} from './AsocijacijeState.js';

interface StartContent {
  asocijacijeMode?: AsocijacijeMode;
  asocijacijePackIds?: string[];
  customAsocijacijePuzzles?: AsocijacijePuzzle[];
}

export class AsocijacijeModule extends BaseGameModule {
  readonly gameId = 'asocijacije';

  private state!: AsocijacijeInternalState;

  constructor(private readonly packsDir: string) {
    super();
  }

  // --- Lifecycle ---------------------------------------------------------

  onStart(room: Room, customContent?: unknown): GameState {
    const c = (customContent ?? {}) as StartContent;
    const mode: AsocijacijeMode = c.asocijacijeMode === 'kviz' ? 'kviz' : 'klasik';
    const timings = getGameTimings(this.gameId);

    // Resolve the puzzle pool: inline custom > selected packs > bank.
    let pool: AsocijacijePuzzle[] = [];
    if (c.customAsocijacijePuzzles && c.customAsocijacijePuzzles.length > 0) {
      const { pack } = parseAsocijacijePack(
        { puzzles: c.customAsocijacijePuzzles },
        { allowEmpty: true }
      );
      if (pack) pool = pack.puzzles;
    } else if (c.asocijacijePackIds && c.asocijacijePackIds.length > 0) {
      for (const id of c.asocijacijePackIds) {
        if (id === ASOCIJACIJE_BANK_PACK_ID) {
          pool.push(...ASOCIJACIJE_BANK);
        } else {
          const puzzles = resolveAsocijacijePackSync(this.packsDir, id);
          if (puzzles) pool.push(...puzzles);
        }
      }
    }
    if (pool.length === 0) pool = [...ASOCIJACIJE_BANK];

    // In kviz mode only fully-kviz-capable puzzles are usable; fall back to
    // the whole pool if the filter empties it (klasik-only content).
    if (mode === 'kviz') {
      const kviz = pool.filter(isKvizCapablePuzzle);
      if (kviz.length > 0) pool = kviz;
    }

    // A game is always a single board (one full Slagalica).
    const puzzles = shuffled(pool).slice(0, 1);

    const turnOrder = shuffled(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );

    this.state = {
      phase: 'playing',
      mode,
      puzzles,
      boardIndex: 0,
      totalBoards: puzzles.length,
      colors: [...ASOCIJACIJE_COLUMN_COLORS],
      revealed: [],
      colSolved: [],
      finalSolved: false,
      turnOrder,
      turnPointer: 0,
      activePlayerId: null,
      turnPhase: 'awaiting-open',
      turnTimeRemaining: TURN_DURATION,
      answering: null,
      lastResult: null,
      boardWinnerId: null,
      phaseTimeRemaining: 0,
      boardResultsDuration:
        timings.BOARD_RESULTS_DURATION ?? BOARD_RESULTS_DURATION,
      leaderboardDuration: timings.LEADERBOARD_DURATION ?? LEADERBOARD_DURATION,
    };

    this.initBoard(room, 0);
    return this.buildGameState(room);
  }

  // --- Board setup -------------------------------------------------------

  private currentPuzzle(): AsocijacijePuzzle {
    return this.state.puzzles[this.state.boardIndex];
  }

  private initBoard(room: Room, index: number): void {
    const s = this.state;
    s.boardIndex = index;
    s.revealed = s.puzzles[index].columns.map((c) => c.fields.map(() => false));
    s.colSolved = s.puzzles[index].columns.map(() => false);
    s.finalSolved = false;
    s.boardWinnerId = null;
    s.lastResult = null;
    s.answering = null;
    // Keep the round-robin pointer across boards, but re-sync to a connected
    // player and begin their turn.
    this.beginTurn(room, s.activePlayerId ? this.pointerForNext(room) : 0);
  }

  // --- Turn management ---------------------------------------------------

  private connectedOrder(room: Room): string[] {
    return this.state.turnOrder.filter((id) =>
      room.players.some((p) => p.id === id && p.isConnected)
    );
  }

  private pointerForNext(room: Room): number {
    // Advance to the next connected player after the current pointer.
    const order = this.state.turnOrder;
    if (order.length === 0) return 0;
    for (let step = 1; step <= order.length; step++) {
      const idx = (this.state.turnPointer + step) % order.length;
      const id = order[idx];
      if (room.players.some((p) => p.id === id && p.isConnected)) return idx;
    }
    return this.state.turnPointer;
  }

  private hasClosedFields(): boolean {
    return this.state.revealed.some((col) => col.some((f) => !f));
  }

  private beginTurn(room: Room, pointer: number): void {
    const s = this.state;
    const order = s.turnOrder;
    if (this.connectedOrder(room).length === 0) {
      s.activePlayerId = null;
      return;
    }
    // Ensure the pointer lands on a connected player.
    let idx = pointer % Math.max(1, order.length);
    for (let step = 0; step < order.length; step++) {
      const id = order[(idx + step) % order.length];
      if (room.players.some((p) => p.id === id && p.isConnected)) {
        idx = (idx + step) % order.length;
        break;
      }
    }
    s.turnPointer = idx;
    s.activePlayerId = order[idx];
    s.turnPhase = this.hasClosedFields() ? 'awaiting-open' : 'awaiting-guess';
    s.turnTimeRemaining = TURN_DURATION;
    s.answering = null;
  }

  private passTurn(room: Room): void {
    this.beginTurn(room, this.pointerForNext(room));
  }

  // --- Player actions ----------------------------------------------------

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    const s = this.state;
    if (s.phase !== 'playing') return null;
    if (playerId !== s.activePlayerId) return null;

    switch (action) {
      case 'asoc:open':
        return this.handleOpen(room, data);
      case 'asoc:answer':
        return this.handleAnswer(room, data);
      case 'asoc:guess-column':
        return this.handleGuessColumn(room, data);
      case 'asoc:guess-final':
        return this.handleGuessFinal(room, data);
      case 'asoc:pass':
        if (s.turnPhase === 'answering-field') return null;
        s.lastResult = null;
        this.passTurn(room);
        return this.buildGameState(room);
      default:
        return null;
    }
  }

  private activeName(room: Room): string {
    return (
      room.players.find((p) => p.id === this.state.activePlayerId)?.name ?? '?'
    );
  }

  private handleOpen(room: Room, data: Record<string, unknown>): GameState | null {
    const s = this.state;
    if (s.turnPhase !== 'awaiting-open') return null;
    const col = Number(data.col);
    const field = Number(data.field);
    if (!this.validFieldRef(col, field)) return null;
    if (s.revealed[col][field]) return null; // already open

    if (s.mode === 'kviz') {
      // Build the shuffled question for this field.
      const f = this.currentPuzzle().columns[col].fields[field];
      if (!f.question || !f.wrongOptions || f.wrongOptions.length === 0) {
        // Degraded content — just reveal it (klasik behaviour).
        return this.revealField(room, col, field, false);
      }
      const opts = shuffled([f.word, ...f.wrongOptions]);
      s.answering = {
        col,
        field,
        options: opts,
        correctIndex: opts.indexOf(f.word),
      };
      s.turnPhase = 'answering-field';
      s.lastResult = null;
      return this.buildGameState(room);
    }

    // Klasik: reveal immediately, then the player must guess or pass.
    return this.revealField(room, col, field, false);
  }

  private handleAnswer(
    room: Room,
    data: Record<string, unknown>
  ): GameState | null {
    const s = this.state;
    if (s.turnPhase !== 'answering-field' || !s.answering) return null;
    const idx = Number(data.optionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= s.answering.options.length) {
      return null;
    }
    const { col, field } = s.answering;
    const correct = idx === s.answering.correctIndex;
    if (correct) {
      return this.revealField(room, col, field, true);
    }
    // Wrong answer — turn passes.
    const word = this.currentPuzzle().columns[col].fields[field].word;
    s.lastResult = {
      correct: false,
      text: `Netačno · tražila se reč ${word}`,
      actorName: this.activeName(room),
    };
    s.answering = null;
    this.passTurn(room);
    return this.buildGameState(room);
  }

  private revealField(
    room: Room,
    col: number,
    field: number,
    scoreIt: boolean
  ): GameState {
    const s = this.state;
    s.revealed[col][field] = true;
    s.answering = null;
    const word = this.currentPuzzle().columns[col].fields[field].word;
    const letter = ASOCIJACIJE_COLUMN_LETTERS[col];
    if (scoreIt) this.award(room, KVIZ_FIELD_POINTS);
    s.lastResult = {
      correct: true,
      text: scoreIt
        ? `Tačno · ${letter}${field + 1} · ${word} +${KVIZ_FIELD_POINTS}`
        : `${letter}${field + 1} · ${word}`,
      actorName: this.activeName(room),
    };
    // After opening, the player chooses: guess a column, guess final, or pass.
    s.turnPhase = 'awaiting-guess';
    s.turnTimeRemaining = TURN_DURATION;
    return this.buildGameState(room);
  }

  private handleGuessColumn(
    room: Room,
    data: Record<string, unknown>
  ): GameState | null {
    const s = this.state;
    if (s.turnPhase !== 'awaiting-guess') return null;
    const col = Number(data.col);
    if (!Number.isInteger(col) || col < 0 || col >= s.colSolved.length) {
      return null;
    }
    if (s.colSolved[col]) return null; // already solved — no-op
    const text = typeof data.text === 'string' ? data.text : '';
    if (!text.trim()) return null;

    const column = this.currentPuzzle().columns[col];
    const ok = checkEmojiGuess(text, {
      answer: column.solution,
      accept: column.acceptSolution,
    });
    const letter = ASOCIJACIJE_COLUMN_LETTERS[col];
    if (ok) {
      s.colSolved[col] = true;
      this.award(room, COLUMN_POINTS);
      // Reveal the whole column and reward any fields left unopened.
      let bonusFields = 0;
      for (let fi = 0; fi < s.revealed[col].length; fi++) {
        if (!s.revealed[col][fi]) {
          s.revealed[col][fi] = true;
          bonusFields++;
        }
      }
      const bonus = bonusFields * UNOPENED_FIELD_BONUS;
      if (bonus > 0) this.award(room, bonus);
      s.lastResult = {
        correct: true,
        text:
          `Tačno · Kolona ${letter} · ${column.solution} +${COLUMN_POINTS}` +
          (bonus > 0 ? ` (+${bonus} za polja)` : ''),
        actorName: this.activeName(room),
      };
      // Correct guess — the same player continues.
      s.turnPhase = this.hasClosedFields() ? 'awaiting-open' : 'awaiting-guess';
      s.turnTimeRemaining = TURN_DURATION;
      return this.buildGameState(room);
    }
    s.lastResult = {
      correct: false,
      text: `Netačno · kolona ${letter}`,
      actorName: this.activeName(room),
    };
    this.passTurn(room);
    return this.buildGameState(room);
  }

  private handleGuessFinal(
    room: Room,
    data: Record<string, unknown>
  ): GameState | null {
    const s = this.state;
    // Allowed both before opening (bold all-in) and after opening a field.
    if (s.turnPhase !== 'awaiting-open' && s.turnPhase !== 'awaiting-guess') {
      return null;
    }
    if (s.finalSolved) return null;
    const text = typeof data.text === 'string' ? data.text : '';
    if (!text.trim()) return null;

    const puzzle = this.currentPuzzle();
    const ok = checkEmojiGuess(text, {
      answer: puzzle.finalSolution,
      accept: puzzle.acceptFinal,
    });
    if (ok) {
      s.finalSolved = true;
      s.boardWinnerId = s.activePlayerId;
      this.award(room, FINAL_POINTS);
      s.lastResult = {
        correct: true,
        text: `KONAČNO REŠENJE · ${puzzle.finalSolution} +${FINAL_POINTS}`,
        actorName: this.activeName(room),
      };
      this.endBoard(room);
      return this.buildGameState(room);
    }
    s.lastResult = {
      correct: false,
      text: 'Netačno konačno rešenje',
      actorName: this.activeName(room),
    };
    this.passTurn(room);
    return this.buildGameState(room);
  }

  private validFieldRef(col: number, field: number): boolean {
    return (
      Number.isInteger(col) &&
      Number.isInteger(field) &&
      col >= 0 &&
      col < this.state.revealed.length &&
      field >= 0 &&
      field < this.state.revealed[col].length
    );
  }

  private award(room: Room, points: number): void {
    const p = room.players.find((pl) => pl.id === this.state.activePlayerId);
    if (p) p.score += points;
  }

  // --- Board / game end --------------------------------------------------

  private endBoard(room: Room): void {
    const s = this.state;
    s.phase = 'board-results';
    s.phaseTimeRemaining = s.boardResultsDuration;
    void room;
  }

  private nextBoardOrEnd(room: Room): void {
    const s = this.state;
    if (s.boardIndex < s.totalBoards - 1) {
      s.phase = 'playing';
      this.initBoard(room, s.boardIndex + 1);
    } else {
      s.phase = 'leaderboard';
      s.phaseTimeRemaining = s.leaderboardDuration;
    }
  }

  // --- Tick --------------------------------------------------------------

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    const s = this.state;
    if (s.phase === 'ended') return null;
    const dt = deltaMs / 1000;

    if (s.phase === 'playing') {
      if (!s.activePlayerId) {
        // Everyone dropped — try to hand the turn to someone connected.
        if (this.connectedOrder(room).length > 0) this.beginTurn(room, 0);
        return this.buildGameState(room);
      }
      s.turnTimeRemaining -= dt;
      if (s.turnTimeRemaining <= 0) {
        s.lastResult = {
          correct: false,
          text: 'Isteklo vreme · potez prelazi dalje',
          actorName: this.activeName(room),
        };
        this.passTurn(room);
      }
      return this.buildGameState(room);
    }

    // Wait phases.
    s.phaseTimeRemaining -= dt;
    if (s.phaseTimeRemaining <= 0) {
      if (s.phase === 'board-results') this.nextBoardOrEnd(room);
      else if (s.phase === 'leaderboard') {
        s.phase = 'ended';
        s.phaseTimeRemaining = 0;
      }
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    const s = this.state;
    // Past-grace removal: drop from the order; if it was the active turn, pass.
    const wasActive = playerId === s.activePlayerId;
    s.turnOrder = s.turnOrder.filter((id) => id !== playerId);
    if (s.turnPointer >= s.turnOrder.length) s.turnPointer = 0;
    if (s.phase === 'playing' && wasActive) {
      if (this.connectedOrder(room).length === 0) {
        s.activePlayerId = null;
      } else {
        s.lastResult = null;
        this.beginTurn(room, s.turnPointer);
      }
    }
    return this.buildGameState(room);
  }

  // --- View building -----------------------------------------------------

  private buildColumns(revealAll: boolean): AsocijacijeColumnView[] {
    const s = this.state;
    const puzzle = this.currentPuzzle();
    return puzzle.columns.map((col, ci) => {
      const solved = s.colSolved[ci] || revealAll;
      const fields: AsocijacijeFieldView[] = col.fields.map((f, fi) => {
        const open = s.revealed[ci][fi] || revealAll;
        return {
          num: `${ASOCIJACIJE_COLUMN_LETTERS[ci]}${fi + 1}`,
          open,
          word: open ? f.word : null,
        };
      });
      return {
        letter: ASOCIJACIJE_COLUMN_LETTERS[ci],
        color: s.colors[ci],
        solved,
        solution: solved ? col.solution : null,
        fields,
      };
    });
  }

  private buildScores(room: Room): AsocijacijeScoreEntry[] {
    return room.players
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        avatarEmoji: p.avatarEmoji ?? '👤',
        score: p.score,
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }

  private buildQuestionView(): AsocijacijeQuestionView | null {
    const s = this.state;
    if (s.phase !== 'playing' || s.turnPhase !== 'answering-field' || !s.answering) {
      return null;
    }
    const f =
      this.currentPuzzle().columns[s.answering.col].fields[s.answering.field];
    return {
      fieldNum: `${ASOCIJACIJE_COLUMN_LETTERS[s.answering.col]}${s.answering.field + 1}`,
      text: f.question ?? '',
      options: s.answering.options,
    };
  }

  private buildGameState(room: Room): GameState {
    const s = this.state;
    const puzzle = this.currentPuzzle();
    const finished = s.phase === 'board-results' || s.phase === 'leaderboard' || s.phase === 'ended';
    const revealAll = s.phase !== 'playing';

    const activePlayer = room.players.find((p) => p.id === s.activePlayerId);

    const host: AsocijacijeHostData = {
      mode: s.mode,
      board: s.boardIndex + 1,
      totalBoards: s.totalBoards,
      columns: this.buildColumns(revealAll),
      finalSolved: s.finalSolved || revealAll,
      finalSolution: s.finalSolved || revealAll ? puzzle.finalSolution : null,
      activePlayerId: s.phase === 'playing' ? s.activePlayerId : null,
      activePlayerName: s.phase === 'playing' ? (activePlayer?.name ?? null) : null,
      activePlayerColor:
        s.phase === 'playing' ? (activePlayer?.avatarColor ?? null) : null,
      turnPhase: s.turnPhase,
      question: this.buildQuestionView(),
      boardFullyOpen: !this.hasClosedFields(),
      scores: this.buildScores(room),
      lastResult: s.lastResult,
    };

    if (s.phase === 'board-results') {
      host.boardWinnerName = s.boardWinnerId
        ? (room.players.find((p) => p.id === s.boardWinnerId)?.name ?? null)
        : null;
    }
    if (finished) {
      host.leaderboard = this.buildScores(room);
    }

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const pd: AsocijacijeControllerData = {
        isActive: s.phase === 'playing' && player.id === s.activePlayerId,
        ownScore: player.score,
      };
      playerData[player.id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: s.phase,
      round: s.boardIndex + 1,
      totalRounds: s.totalBoards,
      timeRemaining: Math.max(
        0,
        Math.ceil(s.phase === 'playing' ? s.turnTimeRemaining : s.phaseTimeRemaining)
      ),
      data: { phase: s.phase, host } as unknown as Record<string, unknown>,
      playerData,
    };
  }
}
