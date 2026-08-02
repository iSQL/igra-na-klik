import type { SplavElimination, SplavFrame, SplavPhase, SplavRoundResult } from '@igra/shared';
import type { SplavBody } from './physics.js';

/**
 * Wait durations (admin-tunable via GAME_TIMING_DEFS). The round clock itself
 * is NOT here — how long the raft takes to shrink is gameplay balance and
 * lives in splav-rules.ts.
 */
export const INTRO_DURATION = 4;
export const RUNDA_GOTOVA_DURATION = 6;
export const LEADERBOARD_DURATION = 6;

export interface SplavStats {
  /** Players pushed off the raft across the whole game. */
  eliminations: number;
  /** Rounds won. */
  wins: number;
  /** Times they were the FIRST one in the water — the Kamikaza diploma. */
  firstOut: number;
  /** Placement in the round just played, for the phone's own summary. */
  lastRank: number;
  lastRoundPoints: number;
  lastEliminatedBy: string | null;
  /** Elimination points banked this round — paid on the shove, shown at the end. */
  roundElimPoints: number;
}

export function emptyStats(): SplavStats {
  return {
    eliminations: 0,
    wins: 0,
    firstOut: 0,
    lastRank: 0,
    lastRoundPoints: 0,
    lastEliminatedBy: null,
    roundElimPoints: 0,
  };
}

export interface SplavInternalState {
  phase: SplavPhase;
  /** Seconds left in the current phase (during `borba`, seconds left on the raft). */
  phaseTimeRemaining: number;
  round: number;
  totalRounds: number;
  /** Everyone still in the game, in seating order. */
  order: string[];
  bodies: Map<string, SplavBody>;
  stats: Map<string, SplavStats>;
  /** ms into the current round — drives the raft's shrink and drift. */
  roundElapsedMs: number;
  /** Player ids in the order they went into the water this round. */
  eliminationOrder: string[];
  /** The same events in broadcast form — the TV replays every one, not just the last. */
  eliminations: SplavElimination[];
  roundResult?: SplavRoundResult;
  elimSeq: number;
  frameSeq: number;
  /** Milliseconds banked toward the next positional frame. */
  frameAccumMs: number;
  pendingFrame: SplavFrame | null;
  /** Set when something structural changed and the full state must go out. */
  dirty: boolean;
  /** Last whole-second value emitted, so the clock still ticks once a second. */
  lastSecond: number;
}
