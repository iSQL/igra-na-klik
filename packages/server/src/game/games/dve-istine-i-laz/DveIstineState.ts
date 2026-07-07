import type { DveIstinePhase } from '@igra/shared';

export const COLLECTING_DURATION = 120;
export const GUESSING_DURATION = 20;
export const SHOWING_RESULTS_DURATION = 8;

export const MAX_STATEMENT_LENGTH = 120;
export const MIN_STATEMENT_LENGTH = 1;

export const CORRECT_GUESS_POINTS = 100;
export const FOOL_POINTS_PER_GUESSER = 75;

export interface DveIstineSubmission {
  truth1: string;
  truth2: string;
  lie: string;
}

export interface PresentedStatement {
  text: string;
  isLie: boolean;
}

export interface DveIstineInternalState {
  phase: DveIstinePhase;
  phaseTimeRemaining: number;

  submissions: Map<string, DveIstineSubmission>;
  expectedSubmitterIds: Set<string>;

  subjectOrder: string[];
  totalRounds: number;
  currentRoundIndex: number; // 0-based

  presented: PresentedStatement[];
  lieIndex: number;
  guesses: Map<string, number>; // guesserId -> presented index
  expectedGuesserIds: Set<string>;
  roundScores: Map<string, number>;
}
