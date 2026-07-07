import type { KoBiPrePhase } from '@igra/shared';

export const VOTING_DURATION = 30;
export const SHOWING_RESULTS_DURATION = 8;
export const DEFAULT_ROUNDS = 8;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 15;
export const CORRECT_CROWD_POINTS = 100;

export interface KoBiPreInternalState {
  phase: KoBiPrePhase;
  phaseTimeRemaining: number;
  prompts: string[];
  currentRound: number; // 1-based
  totalRounds: number;
  votes: Map<string, string>; // voterId -> targetId
  expectedVoterIds: Set<string>;
  topPlayerIds: Set<string>;
  roundScores: Map<string, number>;
}
