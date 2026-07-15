import type {
  Room,
  GameState,
  EmojiRiddle,
  EmojiRoundGuess,
  EmojiLeaderboardEntry,
  EmojiZagonetkeControllerData,
  EmojiZagonetkeHostData,
} from '@igra/shared';
import {
  EMOJI_RIDDLES,
  checkEmojiGuess,
  clampGameRounds,
  parseEmojiImport,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import type { EmojiZagonetkeInternalState } from './EmojiState.js';
import {
  LEADERBOARD_DURATION,
  SHOWING_EMOJIS_DURATION,
  SHOWING_RESULTS_DURATION,
} from './EmojiState.js';

interface EmojiCustomContent {
  customEmojiPuzzles?: unknown;
  emojiHints?: unknown;
  roundCount?: unknown;
}

export class EmojiZagonetkeModule extends BaseGameModule {
  readonly gameId = 'emoji-zagonetke';

  private state!: EmojiZagonetkeInternalState;
  private timings: Record<string, number> = {};

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent as EmojiCustomContent | undefined) ?? {};

    let sourceBank: EmojiRiddle[] = EMOJI_RIDDLES as EmojiRiddle[];
    if (cc.customEmojiPuzzles !== undefined) {
      const parsed = parseEmojiImport(cc.customEmojiPuzzles);
      if (parsed.ok) sourceBank = parsed.puzzles; // else silent fallback
    }

    const rounds = clampGameRounds(this.gameId, cc.roundCount);
    const puzzles = shuffled(sourceBank).slice(
      0,
      Math.min(rounds, sourceBank.length)
    );

    this.state = {
      phase: 'showing-emojis',
      phaseTimeRemaining:
        this.timings.SHOWING_EMOJIS_DURATION ?? SHOWING_EMOJIS_DURATION,
      puzzles,
      currentIndex: 0,
      solved: new Map(),
      lastGuess: new Map(),
      lastWrong: new Map(),
      questionStartTime: Date.now(),
      expectedAnswererIds: new Set(),
      hintsEnabled: cc.emojiHints !== false, // default ON
      hint: '',
      hintRevealOrder: [],
      lastHintRevealFraction: 0,
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
    if (action !== 'emoji:guess' || this.state.phase !== 'answering') return null;
    if (this.state.solved.has(playerId)) return null;

    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) return null;

    const puzzle = this.currentPuzzle();
    this.state.lastGuess.set(playerId, text);

    if (checkEmojiGuess(text, puzzle)) {
      const timeMs = Date.now() - this.state.questionStartTime;
      const limitMs = (puzzle.timeLimit ?? 20) * 1000;
      const timeRemaining = Math.max(0, limitMs - timeMs);
      const points = Math.round(1000 * (timeRemaining / limitMs));
      this.state.solved.set(playerId, { timeMs, points });
      this.state.lastWrong.delete(playerId);
      const player = room.players.find((p) => p.id === playerId);
      if (player) player.score += points;

      if (this.allExpectedSolved(room)) {
        this.transitionToResults();
      }
    } else {
      this.state.lastWrong.set(playerId, text);
    }

    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    this.state.expectedAnswererIds.delete(playerId);
    if (this.state.phase === 'answering' && this.allExpectedSolved(room)) {
      this.transitionToResults();
    }
    return this.buildGameState(room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;

    let changed = false;
    if (this.state.phase === 'answering' && this.state.hintsEnabled) {
      changed = this.maybeRevealHint();
    }

    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
      changed = true;
    }

    // Returning the state re-broadcasts; on a pure clock tick with no hint
    // change GameManager still collapses it to a lightweight timer.
    void changed;
    return this.buildGameState(room);
  }

  private allExpectedSolved(room: Room): boolean {
    if (this.state.phase !== 'answering') return false;
    for (const id of this.state.expectedAnswererIds) {
      if (this.state.solved.has(id)) continue;
      const stillInRoom = room.players.some((p) => p.id === id);
      if (!stillInRoom) continue; // gone past grace — release the slot
      return false;
    }
    return true;
  }

  // --- Phase machine -----------------------------------------------------

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'showing-emojis':
        this.enterAnswering(room);
        break;
      case 'answering':
        this.transitionToResults();
        break;
      case 'showing-results':
        this.state.phase = 'leaderboard';
        this.state.phaseTimeRemaining =
          this.timings.LEADERBOARD_DURATION ?? LEADERBOARD_DURATION;
        break;
      case 'leaderboard':
        if (this.state.currentIndex < this.state.puzzles.length - 1) {
          this.state.currentIndex += 1;
          this.state.phase = 'showing-emojis';
          this.state.phaseTimeRemaining =
            this.timings.SHOWING_EMOJIS_DURATION ?? SHOWING_EMOJIS_DURATION;
        } else {
          this.state.phase = 'ended';
          this.state.phaseTimeRemaining = 0;
        }
        break;
    }
  }

  private enterAnswering(room: Room): void {
    const puzzle = this.currentPuzzle();
    this.state.phase = 'answering';
    this.state.phaseTimeRemaining = puzzle.timeLimit ?? 20;
    this.state.questionStartTime = Date.now();
    this.state.solved = new Map();
    this.state.lastGuess = new Map();
    this.state.lastWrong = new Map();
    this.state.expectedAnswererIds = new Set(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );
    this.state.hintRevealOrder = this.getLetterIndices(puzzle.answer);
    this.state.lastHintRevealFraction = 0;
    this.state.hint = this.state.hintsEnabled
      ? this.buildHint(puzzle.answer, [])
      : '';
  }

  private transitionToResults(): void {
    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining =
      this.timings.SHOWING_RESULTS_DURATION ?? SHOWING_RESULTS_DURATION;
  }

  // --- Hints -------------------------------------------------------------

  /** Returns true when the hint actually changed this tick. */
  private maybeRevealHint(): boolean {
    const puzzle = this.currentPuzzle();
    const limit = puzzle.timeLimit ?? 20;
    const elapsed = (Date.now() - this.state.questionStartTime) / 1000;
    const fraction = limit > 0 ? elapsed / limit : 1;

    // Reveal in four steps at 30/50/70/85% of the window, up to ~55% letters.
    const revealThreshold = this.state.lastHintRevealFraction + 0.2;
    if (fraction < 0.3 || fraction < revealThreshold) return false;
    this.state.lastHintRevealFraction = Math.max(revealThreshold, 0.3);

    const letters = this.state.hintRevealOrder;
    const numToReveal = Math.min(
      Math.floor(letters.length * Math.min(0.55, fraction * 0.6)),
      Math.max(0, letters.length - 1)
    );
    const revealed = letters.slice(0, numToReveal);
    const next = this.buildHint(puzzle.answer, revealed);
    if (next === this.state.hint) return false;
    this.state.hint = next;
    return true;
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

  // --- Helpers -----------------------------------------------------------

  private currentPuzzle(): EmojiRiddle {
    return this.state.puzzles[this.state.currentIndex];
  }

  private answerLetterCount(answer: string): number {
    let n = 0;
    for (const ch of answer) if (/[\p{L}\p{N}]/u.test(ch)) n++;
    return n;
  }

  // --- Build state -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const puzzle = this.currentPuzzle();
    const connected = room.players.filter((p) => p.isConnected);

    const host: EmojiZagonetkeHostData = {
      round: this.state.currentIndex + 1,
      totalRounds: this.state.puzzles.length,
    };

    if (
      this.state.phase === 'showing-emojis' ||
      this.state.phase === 'answering'
    ) {
      host.emojis = puzzle.emojis;
      host.answerLength = this.answerLetterCount(puzzle.answer);
    }

    if (this.state.phase === 'answering') {
      host.hint = this.state.hintsEnabled ? this.state.hint : undefined;
      host.timeLimit = puzzle.timeLimit ?? 20;
      host.totalPlayers = connected.length;
      host.answeredCount = this.state.solved.size;
      host.solvedIds = Array.from(this.state.solved.keys());
    }

    if (this.state.phase === 'showing-results') {
      host.emojis = puzzle.emojis;
      host.answer = puzzle.answer;
      host.results = this.buildResults(room);
    }

    if (this.state.phase === 'leaderboard' || this.state.phase === 'ended') {
      host.leaderboard = this.buildLeaderboard(room);
    }

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host,
    };

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const solve = this.state.solved.get(player.id);
      const pd: EmojiZagonetkeControllerData = {
        hasSolved: !!solve,
        ownGuess: this.state.lastGuess.get(player.id) ?? null,
        ownPoints: solve?.points ?? 0,
        lastWrong: this.state.lastWrong.get(player.id) ?? null,
      };
      playerData[player.id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentIndex + 1,
      totalRounds: this.state.puzzles.length,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildResults(room: Room): EmojiRoundGuess[] {
    return room.players
      .map((p) => {
        const solve = this.state.solved.get(p.id);
        return {
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          text: this.state.lastGuess.get(p.id) ?? '',
          correct: !!solve,
          points: solve?.points ?? 0,
        };
      })
      .sort((a, b) => b.points - a.points);
  }

  private buildLeaderboard(room: Room): EmojiLeaderboardEntry[] {
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
