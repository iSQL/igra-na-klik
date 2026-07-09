import type {
  TajniAgentiClue,
  TajniAgentiEndReason,
  TajniAgentiMode,
  TajniAgentiPhase,
  TajniAgentiSecretCard,
  TajniAgentiTeam,
  TajniAgentiTurnLogEntry,
  TajniAgentiTurnResultsData,
} from '@igra/shared';

export interface TajniAgentiInternalState {
  phase: TajniAgentiPhase;
  phaseTimeRemaining: number;

  /** Game mode — see TajniAgentiMode in @igra/shared. */
  mode: TajniAgentiMode;

  /**
   * Duet/coop shared budget: starts at TAJNI_AGENTI_COOP_TURNS (9). Duet:
   * one turn token per clue given. Coop: one point per turn, plus one
   * extra for revealing an enemy-coloured card. 0 with agents left → loss.
   * Unused (stays 0) in classic.
   */
  turnsRemaining: number;

  /**
   * When `true`, the game runs the simplified scenario flow: no
   * spymasters, no clue-giving phase, and the per-turn guess count is
   * not limited by a `count + 1` from a clue. Players race the public
   * board using the scenario theme as the implicit clue. Enabled
   * automatically when `onStart` resolves a scenario.
   */
  isScenarioMode: boolean;

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
  /** True once the game is decided (turn-results → ended). `winner` alone
   * can't signal this — coop losses have winner === null. */
  gameOver: boolean;
  winner: TajniAgentiTeam | 'players' | null;
  winReason: TajniAgentiEndReason | null;
}

export const TEAM_SELECTION_DURATION = 300;
export const CLUE_GIVING_DURATION = 90;
export const GUESSING_DURATION = 90;
export const TURN_RESULTS_DURATION = 5;

/** Duet/coop: the shared budget of turns (duet) / points (coop). */
export const TAJNI_AGENTI_COOP_TURNS = 9;

export const MIN_CLUE_NUMBER = 1;
export const MAX_CLUE_NUMBER = 9;
export const MAX_CLUE_WORD_LENGTH = 30;
