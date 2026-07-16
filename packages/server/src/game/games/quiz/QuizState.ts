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
  // Emoji riddle: only a SOLVED answer lands here (wrong guesses may retry
  // until the clock runs out — see emojiLastGuess/emojiWrong).
  | { kind: 'text'; timeMs: number; points: number };

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
}
