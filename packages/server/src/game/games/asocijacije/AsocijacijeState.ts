import type {
  AsocijacijeMode,
  AsocijacijePhase,
  AsocijacijePuzzle,
  AsocijacijeResultView,
  AsocijacijeTurnPhase,
} from '@igra/shared';

// --- Scoring (caps mirror the mockup) --------------------------------------
/** Points for correctly answering a field's question in kviz mode (klasik: 0). */
export const KVIZ_FIELD_POINTS = 100;
/** Points for correctly guessing a column solution. */
export const COLUMN_POINTS = 300;
/** Points for correctly guessing the final solution. */
export const FINAL_POINTS = 1000;
/** Bonus per still-closed field auto-revealed when its column is solved. */
export const UNOPENED_FIELD_BONUS = 100;

// --- Timers ----------------------------------------------------------------
/** Per-turn thinking time (seconds). Active-input timer — stays in code. */
export const TURN_DURATION = 45;
/** How long the fully-revealed board shows at board end (tunable). */
export const BOARD_RESULTS_DURATION = 10;
/** Rang lista between boards / at game end (tunable). */
export const LEADERBOARD_DURATION = 6;

/** One field's answering context (kviz mode), server-side. */
export interface AsocijacijeAnswering {
  col: number;
  field: number;
  /** Shuffled option texts as shown to clients. */
  options: string[];
  /** Index in `options` of the correct answer (never sent to clients). */
  correctIndex: number;
}

export interface AsocijacijeInternalState {
  phase: AsocijacijePhase;
  mode: AsocijacijeMode;

  // Content (with answers — server only).
  puzzles: AsocijacijePuzzle[];
  boardIndex: number; // 0-based
  totalBoards: number;

  // Column tints, indexed 0..3.
  colors: string[];

  // Board runtime.
  revealed: boolean[][]; // [col][field]
  colSolved: boolean[];
  finalSolved: boolean;

  // Turn management.
  turnOrder: string[]; // playerIds, round-robin
  turnPointer: number;
  activePlayerId: string | null;
  turnPhase: AsocijacijeTurnPhase;
  turnTimeRemaining: number;
  answering: AsocijacijeAnswering | null;

  // UI feedback + wait-phase timing.
  lastResult: AsocijacijeResultView | null;
  boardWinnerId: string | null;
  phaseTimeRemaining: number;

  // Resolved-config caches.
  boardResultsDuration: number;
  leaderboardDuration: number;
}
