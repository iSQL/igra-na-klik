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

/** Cumulative per-player tallies, kept for the end-of-game diplomas. */
export interface FibbagePlayerStats {
  /** Rounds in which the player was expected to write a lie. */
  roundsPlayed: number;
  /** Rounds in which they actually submitted one (or typed the truth). */
  roundsSubmitted: number;
  /** Rounds they identified the real answer (auto-find counts). */
  truthsFound: number;
  /** Rounds they typed the real answer during the writing phase. */
  autoFinds: number;
  /** Total votes their lies attracted across the game. */
  totalFooled: number;
  /** Rounds where at least one player fell for their lie. */
  roundsWithAFool: number;
  /** Votes they cast for someone else's lie. */
  timesFooled: number;
  /** Best single-round haul of voters for one lie. */
  bestLieVotes: number;
  /** The lie behind `bestLieVotes` — used as the diploma subtitle. */
  bestLieText: string | null;
}

export interface FibbageInternalState {
  questions: FibbageQuestion[];
  currentIndex: number;
  phase: FibbagePhase;
  phaseTimeRemaining: number;

  /**
   * Packs load from disk and `onStart` can't be async, so a game may begin
   * with an empty question list. `showing-question` holds until this flips
   * true (or the load falls back to the built-in bank) — same trick as kviz.
   */
  questionsReady: boolean;

  /** playerId → submitted fake text (trimmed) */
  submissions: Map<string, string>;
  /** Players who submitted a fake that matched the real answer — get auto-credit. */
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
   * Players whose truth bonus was withheld this round because they never
   * wrote a lie. Drives the "Nisi napisao/la laž" line on the reveal.
   */
  roundTruthWithheld: Set<string>;

  /** Cumulative tallies for `getAwardCandidates`. */
  playerStats: Map<string, FibbagePlayerStats>;

  /**
   * Snapshot of player IDs connected when the current `writing-answers`
   * phase began. Drives early-exit so a brief mid-round disconnect (phone
   * sleep / network blip) doesn't fool the "everyone submitted" check
   * into firing without that player's submission. Pruned via
   * onPlayerDisconnect when grace expires.
   */
  expectedSubmitterIds: Set<string>;
  /**
   * Same idea, snapshotted at the start of the `voting` phase. Auto-finders
   * are deliberately excluded: they already know the answer, so asking them
   * to vote would be a formality that only stalls the round.
   */
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
