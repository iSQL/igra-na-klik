export type DveIstinePhase =
  | 'collecting'
  | 'guessing'
  | 'showing-results'
  | 'ended';

export interface DveIstineStatement {
  index: number; // presented position 0..2
  text: string;
}

export interface DveIstineResultGuesser {
  playerId: string;
  name: string;
  avatarColor: string;
  guessedIndex: number | null;
  correct: boolean;
}

export interface DveIstineScoreEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  roundScore: number;
  totalScore: number;
}

export interface DveIstineLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export interface DveIstineHostData {
  round: number;
  totalRounds: number;

  // collecting
  submittedCount?: number;
  totalSubmitters?: number;

  // guessing / results — the three statements are public (shuffled); the
  // lie position is withheld until results.
  subjectId?: string;
  subjectName?: string;
  statements?: DveIstineStatement[];
  guessedCount?: number;
  totalGuessers?: number;

  // showing-results
  lieIndex?: number;
  results?: DveIstineResultGuesser[];
  roundScores?: DveIstineScoreEntry[];

  // showing-results / ended
  leaderboard?: DveIstineLeaderboardEntry[];
}

export type DveIstineRole = 'subject' | 'guesser' | 'spectator';

export interface DveIstineControllerData {
  role: DveIstineRole;
  // collecting
  hasSubmitted?: boolean;
  // guessing
  hasGuessed?: boolean;
  guessedIndex?: number | null;
  // results
  ownRoundScore?: number;
  wasCorrect?: boolean;
}
