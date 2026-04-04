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
}
