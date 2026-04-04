import type { Stroke, DrawGuessGuess } from '@igra/shared';

export type DrawGuessPhase =
  | 'choosing-word'
  | 'drawing'
  | 'turn-results'
  | 'leaderboard'
  | 'ended';

export interface DrawGuessInternalState {
  phase: DrawGuessPhase;
  phaseTimeRemaining: number;
  /** Player IDs in turn order */
  turnOrder: string[];
  /** Index into turnOrder for current drawer */
  currentTurnIndex: number;
  /** Current round (each full rotation = 1 round) */
  currentRound: number;
  totalRounds: number;
  /** The word the drawer is drawing */
  currentWord: string | null;
  /** 3 word choices offered to the drawer */
  wordChoices: string[];
  /** Current hint string shown to guessers (e.g. "_ _ a _ _") */
  wordHint: string;
  /** Time limit for drawing phase in seconds */
  drawTimeLimit: number;
  /** Strokes accumulated this turn */
  strokes: Stroke[];
  /** Guesses this turn */
  guesses: DrawGuessGuess[];
  /** Player IDs who guessed correctly this turn */
  correctGuessers: string[];
  /** Scores earned this turn (populated in turn-results) */
  turnScores: { playerId: string; roundScore: number }[];
  /** Timestamp when drawing phase started */
  drawingStartTime: number;
  /** Last hint reveal time threshold (fraction of time elapsed) */
  lastHintRevealFraction: number;
}

export const CHOOSING_WORD_DURATION = 15;
export const DRAW_TIME_LIMIT = 60;
export const TURN_RESULTS_DURATION = 5;
export const LEADERBOARD_DURATION = 5;
