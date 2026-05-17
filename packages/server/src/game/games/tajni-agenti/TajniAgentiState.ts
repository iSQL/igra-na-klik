import type {
  TajniAgentiClue,
  TajniAgentiPhase,
  TajniAgentiSecretCard,
  TajniAgentiTeam,
  TajniAgentiTurnLogEntry,
  TajniAgentiTurnResultsData,
} from '@igra/shared';

export interface TajniAgentiInternalState {
  phase: TajniAgentiPhase;
  phaseTimeRemaining: number;

  cards: TajniAgentiSecretCard[];

  // Team-selection phase
  teams: Record<TajniAgentiTeam, string[]>;
  /**
   * Single spymaster slot per team, claimed via the controller's "Špijun"
   * toggle during team-selection. Each team holds at most one claimant;
   * subsequent toggles by others are rejected. Cleared when the claimant
   * switches teams or unassigns. Remains in use during play to identify
   * the spymaster for clue-giving / secret-board rendering.
   */
  spymasters: Record<TajniAgentiTeam, string | null>;

  // Active play state
  currentTeam: TajniAgentiTeam;
  startingTeam: TajniAgentiTeam;
  currentClue: TajniAgentiClue | null;
  guessesRemaining: number;
  turnLog: TajniAgentiTurnLogEntry[];

  /** Snapshot of guesser IDs at the start of this `guessing` phase. */
  expectedGuesserIds: Set<string>;
  /** Snapshot of the current spymaster's ID at phase entry. */
  expectedSpymasterId: string | null;

  lastTurnResults: TajniAgentiTurnResultsData | null;
  winner: TajniAgentiTeam | null;
  winReason: 'all-found' | 'assassin' | 'opponent-finished' | null;
}

export const TEAM_SELECTION_DURATION = 300;
export const CLUE_GIVING_DURATION = 90;
export const GUESSING_DURATION = 90;
export const TURN_RESULTS_DURATION = 5;

export const MIN_CLUE_NUMBER = 1;
export const MAX_CLUE_NUMBER = 9;
export const MAX_CLUE_WORD_LENGTH = 30;
