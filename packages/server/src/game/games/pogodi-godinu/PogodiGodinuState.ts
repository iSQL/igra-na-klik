import type { PogodiGodinuEvent, PogodiGodinuPhase } from '@igra/shared';

// Phase durations (seconds).
export const INTRO_DURATION = 3;
export const GUESSING_DURATION = 25;
export const REVEAL_DURATION = 8;
export const FINAL_LEADERBOARD_DURATION = 10;

export const DEFAULT_ROUNDS = 10;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 20;

// Slider bounds — every built-in event falls within this range.
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2025;

export interface PogodiGodinuInternalState {
  phase: PogodiGodinuPhase;
  phaseTimeRemaining: number;
  events: PogodiGodinuEvent[];
  currentIndex: number;
  totalRounds: number;
  guesses: Map<string, number>; // playerId -> guessed year
  expectedGuesserIds: Set<string>;
  roundScores: Map<string, number>;
}
