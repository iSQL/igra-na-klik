import type { FibbageQuestion } from '@igra/shared';

export type FibbagePhase =
  | 'showing-question'
  | 'writing-answers'
  | 'voting'
  | 'showing-results'
  | 'leaderboard'
  | 'ended';

export interface FibbageAnswerOptionInternal {
  id: string;
  text: string;
  isReal: boolean;
  /** Player IDs who submitted this text (empty for real answer; multiple for merged duplicates) */
  ownerIds: string[];
}

export interface FibbageInternalState {
  questions: FibbageQuestion[];
  currentIndex: number;
  phase: FibbagePhase;
  phaseTimeRemaining: number;

  /** playerId → submitted fake text (normalized, trimmed) */
  submissions: Map<string, string>;
  /** Players who submitted a fake that exactly matched the real answer — get auto-credit. */
  autoFinders: Set<string>;

  /** Voting options for current question (built when voting phase starts) */
  options: FibbageAnswerOptionInternal[];
  /** voterPlayerId → optionId */
  votes: Map<string, string>;

  /** Per-player round score for the current question, populated on showing-results */
  roundScores: Map<string, number>;
  /** Per-player "fooled count" (how many voters picked their fake) for current round */
  roundFooledCounts: Map<string, number>;

  /**
   * Snapshot of player IDs connected when the current `writing-answers`
   * phase began. Drives early-exit so a brief mid-round disconnect (phone
   * sleep / network blip) doesn't fool the "everyone submitted" check
   * into firing without that player's submission. Pruned via
   * onPlayerDisconnect when grace expires.
   */
  expectedSubmitterIds: Set<string>;
  /** Same idea, snapshotted at the start of the `voting` phase. */
  expectedVoterIds: Set<string>;
}

export const SHOWING_QUESTION_DURATION = 5;
export const WRITING_ANSWERS_DURATION = 30;
export const VOTING_DURATION = 20;
export const SHOWING_RESULTS_DURATION = 8;
export const LEADERBOARD_DURATION = 5;
export const NUM_QUESTIONS = 5;

export const TRUTH_POINTS = 500;
export const FOOL_POINTS_PER_VOTER = 100;
