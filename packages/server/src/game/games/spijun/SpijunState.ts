import type { SpijunLocation, SpijunPhase, SpijunRoundOutcome } from '@igra/shared';

// --- Wait-phase durations (admin-tunable via /admin/timinzi — keys must
// match GAME_TIMING_DEFS['spijun']) --------------------------------------
export const REVEAL_ROLE_DURATION = 8;
export const RESULTS_DURATION = 14;

// --- Active-input timers (gameplay balance — hardcoded) ------------------
/** Discussion length; the host picks within [MIN, MAX] on game-select. */
export const DEFAULT_DISCUSSION_SECONDS = 420; // 7 min — sweet spot for 5–8
export const MIN_DISCUSSION_SECONDS = 120;
export const MAX_DISCUSSION_SECONDS = 900;
export const DEFENSE_DURATION = 30;
export const VOTING_DURATION = 25;
export const SPY_GUESS_DURATION = 60;

// --- Scoring (user spec ×100 to match platform scale) --------------------
/** Spy guesses the location (big risk, big reward). */
export const SPY_GUESS_POINTS = 300;
/** Every non-spy when the spy is unmasked (or misses the final guess). */
export const PLAYER_CATCH_POINTS = 100;
/** Extra for whoever initiated the successful accusation. */
export const INITIATOR_BONUS = 200;
/** Spy's reward when an innocent gets voted out (punishes haste). */
export const SPY_WRONG_ACCUSATION_POINTS = 200;

export interface SpijunInternalState {
  phase: SpijunPhase;
  phaseTimeRemaining: number;
  tutorialMode: boolean;

  totalRounds: number;
  currentRound: number;

  /** Configured discussion length for each round. */
  discussionSeconds: number;
  /** Discussion clock, saved/frozen while a defense+vote interrupts it. */
  discussionRemaining: number;

  /** Active location bank for the whole game (pack or built-in). */
  locationList: SpijunLocation[];

  // --- per round ---
  /** Players dealt into the round (snapshot at round start). */
  participantIds: string[];
  currentLocation: SpijunLocation | null;
  spyId: string | null;
  /** Non-spy participants' roles at the location. */
  rolesByPlayer: Map<string, string>;

  /**
   * Discussion accusations: accuserId → targetId. Insertion order matters —
   * the earliest accuser still pointing at the tripped target is the
   * "initiator" (re-accusing moves you to the end).
   */
  accusations: Map<string, string>;
  accuseThreshold: number;

  // defense + voting
  accusedId: string | null;
  initiatorId: string | null;
  votes: Map<string, 'da' | 'ne'>;
  expectedVoterIds: Set<string>;

  // spy-guess
  spyGuess: string | null;

  // results
  outcome: SpijunRoundOutcome | null;
  voteYes: number;
  voteNo: number;
  roundScores: Map<string, number>;

  // cross-round memory
  usedLocationNames: Set<string>;
  usedSpyIds: Set<string>;
}
