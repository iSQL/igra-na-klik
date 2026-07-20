// Asocijacije — TV-style "Slagalica" associations game.
//
// A board (puzzle) is 4 columns (A/B/C/D) × 4 fields each, plus a final
// solution that ties all four column solutions together. Opening a field
// reveals an association word; a column is "solved" by typing its solution;
// the board ends when the final solution is guessed.
//
// Two modes (chosen at game start via `host:start-game`):
//   • klasik — tapping a closed field just reveals its word.
//   • kviz   — tapping a field opens a multiple-choice question; answering
//              correctly reveals the field, and the correct answer IS the
//              association word.
//
// This file holds the CONTENT model (with answers — server-only) and the
// client-safe VIEW model that flows through game state.

export type AsocijacijeMode = 'klasik' | 'kviz';

export const ASOCIJACIJE_MODES: readonly AsocijacijeMode[] = [
  'klasik',
  'kviz',
] as const;

// Column letters by index. The design used A/B/V/G (Cyrillic order); this
// platform uses the Latin A/B/C/D per the game spec.
export const ASOCIJACIJE_COLUMN_LETTERS = ['A', 'B', 'C', 'D'] as const;

// Fixed per-column tints (gold / teal / green / blue) — pleasant and distinct
// on both the navy TV canvas and the phone.
export const ASOCIJACIJE_COLUMN_COLORS = [
  '#E0B84B',
  '#5FC2B8',
  '#A6C86A',
  '#8AA0DC',
] as const;

export const ASOCIJACIJE_COLUMNS = 4;
export const ASOCIJACIJE_FIELDS_PER_COLUMN = 4;

// --- Content model (has answers — never sent verbatim to clients) ----------

export interface AsocijacijeField {
  /** The association word revealed on open / the correct kviz answer. */
  word: string;
  /**
   * Optional kviz question. When present (with wrongOptions), this field is
   * playable in kviz mode. The correct answer is always `word`; it is merged
   * into the shuffled option list server-side.
   */
  question?: string;
  /** 1–3 wrong-answer options for kviz mode. */
  wrongOptions?: string[];
}

export interface AsocijacijeColumn {
  /** The column solution, e.g. "SUNCE". */
  solution: string;
  /** Accepted alternate spellings for the column solution (fuzzy also applies). */
  acceptSolution?: string[];
  /** Exactly ASOCIJACIJE_FIELDS_PER_COLUMN fields. */
  fields: AsocijacijeField[];
}

export interface AsocijacijePuzzle {
  /** Exactly ASOCIJACIJE_COLUMNS columns. */
  columns: AsocijacijeColumn[];
  /** The final solution tying the four column solutions together. */
  finalSolution: string;
  acceptFinal?: string[];
}

export interface AsocijacijePack {
  id: string;
  name: string;
  description?: string;
  puzzles: AsocijacijePuzzle[];
}

/** Pack summary returned by GET /api/asocijacije-packs (no answers). */
export interface AsocijacijePackSummary {
  id: string;
  name: string;
  description?: string;
  puzzleCount: number;
  /** How many of the puzzles are fully playable in kviz mode. */
  kvizPuzzleCount: number;
  /** Whether the pack passes the strict in-game validity check. */
  visibleInGame: boolean;
  error?: string;
}

// --- Client-safe view model (flows through GameState.data / playerData) -----

export interface AsocijacijeFieldView {
  /** Field label, e.g. "A1". */
  num: string;
  open: boolean;
  /** Revealed word, or null while still closed. */
  word: string | null;
}

export interface AsocijacijeColumnView {
  letter: string;
  color: string;
  solved: boolean;
  /** Revealed column solution, or null while unsolved. */
  solution: string | null;
  fields: AsocijacijeFieldView[];
}

export interface AsocijacijeScoreEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  score: number;
  rank: number;
}

/** A multiple-choice question in kviz mode (no correct-answer marker). */
export interface AsocijacijeQuestionView {
  fieldNum: string;
  text: string;
  /** Shuffled options; the correct one is unmarked. */
  options: string[];
}

/** Brief post-action feedback shown to everyone. */
export interface AsocijacijeResultView {
  correct: boolean;
  /** Serbian one-liner, e.g. "Kolona B · KIŠA +300". */
  text: string;
  /** Who acted (name), for the TV banner. */
  actorName?: string;
}

export type AsocijacijeTurnPhase =
  | 'awaiting-open'
  | 'awaiting-guess'
  | 'answering-field';

export type AsocijacijePhase =
  | 'playing'
  | 'board-results'
  | 'leaderboard'
  | 'ended';

/** Shared, broadcast-safe board state (read by TV and every controller). */
export interface AsocijacijeHostData {
  mode: AsocijacijeMode;
  board: number; // 1-based
  totalBoards: number;
  columns: AsocijacijeColumnView[];
  finalSolved: boolean;
  finalSolution: string | null;
  activePlayerId: string | null;
  activePlayerName: string | null;
  activePlayerColor: string | null;
  turnPhase: AsocijacijeTurnPhase;
  /** kviz mode: the question currently being answered (null otherwise). */
  question: AsocijacijeQuestionView | null;
  /** True when the active player has no closed field left to open. */
  boardFullyOpen: boolean;
  scores: AsocijacijeScoreEntry[];
  lastResult: AsocijacijeResultView | null;
  /** board-results: who guessed the final solution (name), or null. */
  boardWinnerName?: string | null;
  /** board-results / leaderboard / ended: final standings. */
  leaderboard?: AsocijacijeScoreEntry[];
}

/** Per-player private slice (mostly a control-authority flag). */
export interface AsocijacijeControllerData {
  isActive: boolean;
  ownScore: number;
}
