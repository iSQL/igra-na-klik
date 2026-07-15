import type { EmojiRiddle, EmojiZagonetkePhase } from '@igra/shared';

// Wait-phase durations (seconds) — tunable via /admin/timinzi.
export const SHOWING_EMOJIS_DURATION = 4;
export const SHOWING_RESULTS_DURATION = 7;
export const LEADERBOARD_DURATION = 5;

export interface EmojiSolve {
  timeMs: number;
  points: number;
}

export interface EmojiZagonetkeInternalState {
  phase: EmojiZagonetkePhase;
  phaseTimeRemaining: number;
  puzzles: EmojiRiddle[];
  currentIndex: number;
  /** playerId → solve record (only correct guessers). */
  solved: Map<string, EmojiSolve>;
  /** playerId → their latest submitted guess (for echo on the phone). */
  lastGuess: Map<string, string>;
  /** playerId → their latest WRONG guess, cleared on solve. */
  lastWrong: Map<string, string>;
  questionStartTime: number;
  expectedAnswererIds: Set<string>;
  // Progressive letter hints (like Crtaj i pogodi).
  hintsEnabled: boolean;
  hint: string;
  hintRevealOrder: number[];
  lastHintRevealFraction: number;
}
