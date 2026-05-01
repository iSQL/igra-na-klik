import type {
  GeoGuessMode,
  GeoGuessPhase,
  GeoLocation,
  GeoPin,
  GeoPlayerRoundResult,
} from '@igra/shared';

// Phase durations (seconds).
export const INTRO_DURATION = 3;
export const VIEWING_DURATION = 4;
export const PLACING_DURATION = 30;
export const REVEAL_DURATION = 8;
export const FINAL_LEADERBOARD_DURATION = 10;

// Submission phase has no timer; this number is large enough to be effectively
// unbounded but still finite so onTick doesn't have to special-case it.
export const SUBMISSION_DURATION = 60 * 30; // 30 minutes

// Predefined-mode rounds are capped to keep games tight.
export const MAX_PREDEFINED_ROUNDS = 8;

// Custom-mode photos per player.
export const MIN_PHOTOS_PER_PLAYER = 1;
export const MAX_PHOTOS_PER_PLAYER = 4;
export const DEFAULT_PHOTOS_PER_PLAYER = 2;

export interface CustomSubmissionDraft {
  imageBase64: string;
  pin: GeoPin;
  caption?: string;
}

export interface GeoGuessInternalState {
  phase: GeoGuessPhase;
  phaseTimeRemaining: number;
  mode: GeoGuessMode;
  packName?: string;

  /** Final, ordered list of rounds (each entry = one location to guess). */
  locations: GeoLocation[];
  currentRoundIndex: number;
  totalRounds: number;

  /** Pins locked in by guessers for the current round. */
  pinsThisRound: Map<string, GeoPin>;

  /** Per-round results (populated when the round resolves). */
  roundResultsHistory: GeoPlayerRoundResult[][];

  /** Cumulative score across rounds (server-authoritative; mirrored to player.score on reveal). */
  totalScores: Map<string, number>;

  /** Custom-mode only: per-player accumulated submissions during the submission phase. */
  customSubmissions: Map<string, CustomSubmissionDraft[]>;
  customPhotosPerPlayer: number;

  /** Custom-mode roster — players eligible to submit at the start of the submission phase. */
  submissionRoster: string[];
}
