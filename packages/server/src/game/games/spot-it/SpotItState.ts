export type SpotItPhase =
  | 'card-reveal'
  | 'racing'
  | 'round-results'
  | 'final-leaderboard'
  | 'ended';

export interface SpotItRoundState {
  /** Indices into SPOT_IT_SYMBOLS for the central card (shuffled). */
  centerCard: number[];
  /** Per-player hand: indices into SPOT_IT_SYMBOLS (shuffled). */
  playerHands: Map<string, number[]>;
  /** Wall-clock ms when the `racing` phase began (for time-based score). */
  raceStartTime: number;
  /** Player who tapped the correct symbol first this round, if any. */
  winnerId: string | null;
  /** Per-player lockout deadlines (ms epoch) after a wrong tap. */
  lockedUntil: Map<string, number>;
  /** Set of player IDs who tapped this round (winner or wrong tap). */
  tappedPlayerIds: Set<string>;
  /** Points each player earned this round (for round-results display). */
  pointsAwarded: Record<string, number>;
}

export interface SpotItInternalState {
  /** Pre-generated 57-card deck — shared across all rounds of the match. */
  deck: number[][];
  phase: SpotItPhase;
  phaseTimeRemaining: number;
  currentRound: number;
  totalRounds: number;
  round: SpotItRoundState;
}
