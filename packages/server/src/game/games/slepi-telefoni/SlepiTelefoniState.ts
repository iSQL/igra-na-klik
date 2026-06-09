import type { Chain, DrawOp, SlepiTelefoniPhase } from '@igra/shared';

export const ENTERING_PROMPTS_DURATION = 45;
export const DRAWING_ROUND_DURATION = 120;
export const GUESS_ROUND_DURATION = 25;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 4;
export const DEFAULT_ROUNDS = 2;
export const MAX_PROMPT_LENGTH = 80;
export const MAX_GUESS_LENGTH = 80;

export interface SubmissionDraft {
  done: boolean;
  text?: string;
  operations?: DrawOp[];
}

export interface SlepiTelefoniInternalState {
  phase: SlepiTelefoniPhase;
  phaseTimeRemaining: number;
  totalRounds: number;
  playerOrder: string[];
  chains: Chain[];
  stepIndex: number;
  submissions: Map<string, SubmissionDraft>;
  // reveal — host-advanced (no auto timer)
  revealChain: number;
}
