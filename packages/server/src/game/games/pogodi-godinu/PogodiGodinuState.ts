import type { PogodiBrojQuestion, PogodiGodinuPhase } from '@igra/shared';

// Phase durations (seconds).
export const INTRO_DURATION = 3;
export const GUESSING_DURATION = 25;
export const REVEAL_DURATION = 8;
export const FINAL_LEADERBOARD_DURATION = 10;

export const DEFAULT_ROUNDS = 10;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 20;

/** A question with its image reference resolved to a public URL (packs only). */
export type RuntimeQuestion = PogodiBrojQuestion & { imageUrl?: string };

export interface PogodiGodinuInternalState {
  phase: PogodiGodinuPhase;
  phaseTimeRemaining: number;
  questions: RuntimeQuestion[];
  currentIndex: number;
  totalRounds: number;
  guesses: Map<string, number>; // playerId -> guessed value
  // playerId -> share of the guessing clock still left when locked (1..0),
  // captured for the speed bonus at reveal.
  guessSpeed: Map<string, number>;
  expectedGuesserIds: Set<string>;
  roundScores: Map<string, number>;
}
