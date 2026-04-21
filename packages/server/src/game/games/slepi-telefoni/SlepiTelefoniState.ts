import type { Chain, SlepiTelefoniPhase, Stroke } from '@igra/shared';

export const ENTERING_PROMPTS_DURATION = 45;
export const DRAWING_ROUND_DURATION = 60;
export const GUESS_ROUND_DURATION = 25;
export const REVEAL_CHAIN_BASE = 4;
export const REVEAL_CHAIN_PER_ITEM = 2;
export const REVEAL_CHAIN_GAP = 1.5;
export const VOTING_DURATION = 30;
export const WINNER_DURATION = 8;
export const FINAL_LEADERBOARD_DURATION = 8;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 4;
export const DEFAULT_ROUNDS = 2;
export const MAX_PROMPT_LENGTH = 80;
export const MAX_GUESS_LENGTH = 80;

export interface SubmissionDraft {
  done: boolean;
  text?: string;
  strokes?: Stroke[];
}

export interface SlepiTelefoniInternalState {
  phase: SlepiTelefoniPhase;
  phaseTimeRemaining: number;
  totalRounds: number;
  playerOrder: string[];
  chains: Chain[];
  stepIndex: number;
  submissions: Map<string, SubmissionDraft>;
  // reveal
  revealChain: number;
  revealGapRemaining: number;
  // voting (single, at end)
  votes: Map<string, number>;
  voteCounts: Map<number, number>;
  winnerChainIndex: number | null;
}
