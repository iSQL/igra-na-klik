import type { HotPotatoMode, HotPotatoPhase } from '@igra/shared';

// Wait-phase durations (seconds) — tunable via /admin/timinzi.
export const INTRO_DURATION = 3;
export const EXPLODED_DURATION = 4;
export const FINAL_LEADERBOARD_DURATION = 10;

// Hidden fuse bounds (ms). Randomized per round and NEVER sent to clients —
// active gameplay balance, stays in code. onTick resolution is 1s, so keep the
// range comfortably above that.
export const MIN_FUSE_MS = 8_000;
export const MAX_FUSE_MS = 30_000;

export interface HotPotatoInternalState {
  phase: HotPotatoPhase;
  mode: HotPotatoMode;
  /** Countdown for the visible wait phases (intro/exploded/leaderboard). */
  phaseTimeRemaining: number;
  /** Ordered ids of players still in the game; explosion removes one. */
  aliveOrder: string[];
  /** Index into aliveOrder of the current bomb holder. */
  holderIndex: number;
  /** HIDDEN — remaining fuse time in ms while phase === 'passing'. */
  bombRemainingMs: number;
  /** Current round's category (one word from HOT_POTATO_CATEGORIES). */
  category: string;
  /** How many rounds (explosions) have happened, 1-based for display. */
  round: number;
  /** Who just blew up — for the `exploded` reveal. */
  explodedId: string | null;
  /** Last survivor once the game is decided. */
  winnerId: string | null;
  /** Elimination counter → drives survival-order scoring. */
  eliminatedCount: number;
}
