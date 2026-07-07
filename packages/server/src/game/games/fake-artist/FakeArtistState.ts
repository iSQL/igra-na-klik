import type { DrawOp, FakeArtistPhase } from '@igra/shared';

// Phase durations (seconds).
export const REVEAL_ROLE_DURATION = 6;
export const TURN_DURATION = 20;
export const VOTING_DURATION = 40;
export const FAKE_GUESS_DURATION = 20;
export const RESULTS_DURATION = 12;

export const DEFAULT_STROKES = 2;
export const MIN_STROKES = 1;
export const MAX_STROKES = 3;
export const DEFAULT_ROUNDS = 3;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 8;

// Fixed brush width — every player draws in their own avatar colour so the
// TV shows who drew what; width is uniform so nobody stands out by line size.
export const STROKE_WIDTH = 6;

// Scoring.
export const CORRECT_VOTE_POINTS = 100; // per real artist who fingers the fake
export const FAKE_ESCAPE_POINTS = 300; // fake avoids the most votes
export const FAKE_REDEMPTION_POINTS = 200; // fake caught but guesses the word

export interface FakeArtistInternalState {
  phase: FakeArtistPhase;
  phaseTimeRemaining: number;

  totalRounds: number;
  currentRound: number; // 1-based
  strokesPerPlayer: number;

  // Per-round.
  turnOrder: string[]; // shuffled connected player ids at round start
  currentTurnIndex: number; // 0..(turnOrder.length * strokesPerPlayer - 1)
  word: string | null;
  category: string | null;
  fakeArtistId: string | null;
  operations: DrawOp[];
  votes: Map<string, string>; // voterId -> suspectId
  expectedVoterIds: Set<string>;
  fakeGuessOptions: string[]; // word + distractors, shuffled
  fakeGuess: string | null;
  fakeGuessCorrect: boolean;
  fakeCaught: boolean;
  roundScores: Map<string, number>;

  // Cross-round bookkeeping.
  usedWords: Set<string>;
  usedFakeIds: Set<string>;
}
