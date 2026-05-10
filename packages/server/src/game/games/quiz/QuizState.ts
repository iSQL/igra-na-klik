import type { QuizQuestionFull } from '@igra/shared';

export type QuizPhase =
  | 'showing-question'
  | 'answering'
  | 'showing-results'
  | 'leaderboard'
  | 'ended';

export interface QuizPlayerAnswer {
  optionIndex: number;
  timeMs: number;
  correct: boolean;
}

export interface QuizInternalState {
  questions: QuizQuestionFull[];
  currentQuestionIndex: number;
  phase: QuizPhase;
  phaseTimeRemaining: number;
  answers: Map<string, QuizPlayerAnswer>;
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
}
