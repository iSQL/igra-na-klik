import type { GeoPin, KvizQuestionFull } from '@igra/shared';

export type QuizPhase =
  | 'showing-question'
  | 'answering'
  | 'showing-results'
  | 'leaderboard'
  | 'ended';

/** One player's answer for the current question, shaped by question type. */
export type QuizAnswer =
  | { kind: 'choice'; optionIndex: number; timeMs: number; correct: boolean }
  | { kind: 'pin'; pin: GeoPin }
  | { kind: 'value'; value: number; speedFraction: number }
  // Free-text types (emoji/dopuna/piksel/anagram): only a SOLVED answer lands
  // here (wrong guesses may retry until the clock runs out — see
  // emojiLastGuess/emojiWrong).
  | { kind: 'text'; timeMs: number; points: number }
  // Redosled: locked arrangement (indices into the presented items), scored
  // at results time.
  | { kind: 'order'; order: number[] }
  // Matrica: the 3 tapped cell indices + how many hit the correct triple;
  // scored on submit.
  | { kind: 'matrix'; cells: number[]; hit: number; points: number }
  // Domino: only lands here once the player is DONE (first mistake or the
  // chain is finished). `streak` = consecutive-correct count; scored at
  // results time. In-flight progress lives in dominoProgress.
  | { kind: 'domino'; streak: number };

/**
 * Cross-round accumulator for the end-of-game "utešne diplome". Every field is
 * folded in at results time (see `accumulateStats`); it's the only per-player
 * history the module keeps beyond `player.score`.
 */
export interface QuizPlayerStats {
  /** Rounds where the player submitted (or attempted, for text) an answer. */
  answered: number;
  correct: number;
  /** Attempted but not correct. */
  wrong: number;
  /** Consecutive attempted-wrong rounds so far (reset by a correct answer). */
  wrongStreakCur: number;
  wrongStreakMax: number;
  /** Rounds contributing a normalized-slowness sample. */
  timeSamples: number;
  /** Sum of per-round slowness ∈ [0,1] (1 = used the whole clock). */
  slownessSum: number;
}

/** One round's "Zid srama" snapshot, rendered on the TV after results. */
export interface QuizRoundShame {
  snail: {
    playerId: string;
    name: string;
    avatarColor: string;
    timeMs: number;
  } | null;
  wrongStreak: {
    playerId: string;
    name: string;
    avatarColor: string;
    streak: number;
  }[];
}

export interface QuizInternalState {
  questions: KvizQuestionFull[];
  currentQuestionIndex: number;
  phase: QuizPhase;
  phaseTimeRemaining: number;
  answers: Map<string, QuizAnswer>;
  questionStartTime: number;
  /**
   * Snapshot of player IDs who were connected at the start of the
   * `answering` phase. Used to decide early-exit so a brief mid-round
   * disconnect (mobile screen sleep, network blip) doesn't shrink the
   * "everyone answered" denominator and steal an answering slot from a
   * player who's about to reconnect. Pruned via onPlayerDisconnect when
   * a player is removed past grace.
   */
  expectedAnswererIds: Set<string>;
  /** Per-round points for geo/broj questions, computed at results time. */
  lastRoundScores: Map<string, number>;
  /** Per-player distances (km for geo, value delta for broj) at results. */
  lastRoundDistances: Map<string, number>;
  /** Emoji questions: each player's most recent guess (for results). */
  emojiLastGuess: Map<string, string>;
  /** Emoji questions: last WRONG guess (echoed back so the phone can react). */
  emojiWrong: Map<string, string>;
  /** Emoji questions: progressive letter hint (public, always enabled). */
  hint: string;
  hintRevealOrder: number[];
  lastHintRevealFraction: number;
  /** Anagram questions: current public scramble string (uppercase). */
  scramble: string;
  /** Anagram: the fixed shuffled letter pool the scramble is built from. */
  scramblePool: string[];
  /** Anagram: how many leading letters are already in the correct spot. */
  scrambleFixed: number;
  /**
   * Domino: per-player streak progress. `pos` = the item index currently being
   * compared (to items[pos-1]); `streak` = correct-so-far; `done` once the
   * player errs or finishes; `wrongAt` = the pos where they missed (if any).
   */
  dominoProgress: Map<string, { pos: number; streak: number; done: boolean; wrongAt?: number }>;
  /** Cross-round stats feeding the end-of-game diplomas. */
  playerStats: Map<string, QuizPlayerStats>;
  /** The most recent round's "Zid srama"; null when nobody earned one. */
  lastShame: QuizRoundShame | null;
}
