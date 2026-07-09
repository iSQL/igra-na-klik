export type PogodiGodinuPhase =
  | 'intro'
  | 'guessing'
  | 'reveal'
  | 'final-leaderboard'
  | 'ended';

/** How a numeric value is rendered on screen. `duration` shows mm:ss. */
export type PogodiBrojValueType = 'number' | 'duration';

/**
 * A single "Pogodi broj" question — guess a numeric value on a per-question
 * range. Covers years, prices, weights, river lengths, song durations,
 * counting ("how many letters A…"), etc. `imageFile` is only used inside
 * packs; the built-in bank has no images.
 */
export interface PogodiBrojQuestion {
  text: string;
  /** The true value. For `duration`, this is in seconds. */
  answer: number;
  /** Slider lower bound. */
  min: number;
  /** Slider upper bound. */
  max: number;
  /** Slider step (default 1). */
  step?: number;
  /** Unit suffix shown next to the number: "din", "kg", "km", "god."… */
  unit?: string;
  /** `duration` formats the value as mm:ss. */
  valueType?: PogodiBrojValueType;
  emoji?: string;
  /** Pack-relative image filename (packs only). */
  imageFile?: string;
}

/**
 * Public event shown during guessing/reveal. The answer is withheld until
 * reveal so clients can't peek — only the presentation fields ship early.
 */
export interface PogodiGodinuPublicEvent {
  text: string;
  emoji?: string;
  imageUrl?: string;
  unit?: string;
  valueType?: PogodiBrojValueType;
  min: number;
  max: number;
  step?: number;
}

export interface PogodiGodinuGuessResult {
  playerId: string;
  name: string;
  avatarColor: string;
  guess: number | null;
  distance: number | null;
  points: number;
}

export interface PogodiGodinuLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export interface PogodiGodinuHostData {
  round: number;
  totalRounds: number;

  // guessing / reveal — range comes from the current question
  event?: PogodiGodinuPublicEvent;

  // guessing
  lockedCount?: number;
  totalGuessers?: number;

  // reveal
  trueValue?: number;
  results?: PogodiGodinuGuessResult[];

  // final-leaderboard / ended
  leaderboard?: PogodiGodinuLeaderboardEntry[];
}

export interface PogodiGodinuControllerData {
  // guessing
  hasLocked?: boolean;
  ownGuess?: number | null;
  // reveal
  ownDistance?: number | null;
  ownPoints?: number;
  wasExact?: boolean;
}
