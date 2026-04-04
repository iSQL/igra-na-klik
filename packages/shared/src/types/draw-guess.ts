export interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface DrawGuessHostData {
  drawerId: string;
  drawerName: string;
  wordHint: string;
  wordLength: number;
  timeLimit: number;
  strokes: Stroke[];
  guesses: DrawGuessGuess[];
  correctGuessers: string[];
  turnScores?: DrawGuessTurnScore[];
  revealedWord?: string;
}

export interface DrawGuessControllerData {
  isDrawer: boolean;
  wordChoices?: string[];
  hasGuessedCorrectly?: boolean;
}

export interface DrawGuessGuess {
  playerId: string;
  playerName: string;
  text: string;
  correct: boolean;
}

export interface DrawGuessTurnScore {
  playerId: string;
  playerName: string;
  avatarColor: string;
  roundScore: number;
  totalScore: number;
}

export interface DrawGuessLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}
