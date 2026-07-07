export type PogodiGodinuPhase =
  | 'intro'
  | 'guessing'
  | 'reveal'
  | 'final-leaderboard'
  | 'ended';

/** Public event — the year is withheld until reveal so clients can't peek. */
export interface PogodiGodinuPublicEvent {
  text: string;
  emoji?: string;
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
  yearMin: number;
  yearMax: number;

  // guessing / reveal
  event?: PogodiGodinuPublicEvent;

  // guessing
  lockedCount?: number;
  totalGuessers?: number;

  // reveal
  trueYear?: number;
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
