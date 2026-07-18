import type { HotPotatoMode, HotPotatoPhase, KvizChoiceQuestionFull } from '@igra/shared';

// Wait-phase durations (seconds) — tunable via /admin/timinzi.
export const INTRO_DURATION = 3;
export const EXPLODED_DURATION = 4;
export const FINAL_LEADERBOARD_DURATION = 10;

// Hidden fuse bounds (ms). Randomized per round and NEVER sent to clients —
// active gameplay balance, stays in code. onTick resolution is 1s, so keep the
// range comfortably above that.
export const MIN_FUSE_MS = 8_000;
export const MAX_FUSE_MS = 30_000;

// Kviz mode — active-input timers (visible, unlike the hidden fuse).
// KVIZ_ANSWER_DURATION is the default; the host can override it per game
// within [KVIZ_ANSWER_MIN, KVIZ_ANSWER_MAX] seconds.
export const KVIZ_ANSWER_DURATION = 5;
export const KVIZ_ANSWER_MIN = 3;
export const KVIZ_ANSWER_MAX = 30;
export const KVIZ_PICK_DURATION = 10;

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

  // --- kviz mode ---------------------------------------------------------
  /** Seconds a player has to answer each kviz question (host-configurable). */
  kvizAnswerDuration: number;
  /**
   * Working queue of choice-only questions (obicno/uljez) drawn from the
   * selected kviz packs; [0] is current, [1] is the holder's preview. The
   * module refills it from its pool when it runs low.
   */
  questions: KvizChoiceQuestionFull[];
  /** kviz: how the holder answered the current question (exploded reveal). */
  answeredIndex: number | null;
  answeredCorrectly: boolean;
}
