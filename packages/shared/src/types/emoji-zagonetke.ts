export type EmojiZagonetkePhase =
  | 'showing-emojis'
  | 'answering'
  | 'showing-results'
  | 'leaderboard'
  | 'ended';

/**
 * A single emoji riddle. `emojis` is the clue shown on screen (🎬🦁👑),
 * `answer` the canonical solution (Kralj lavova) and `accept` optional
 * alternate spellings/translations that also count as correct. Matching is
 * accent- and punctuation-insensitive (see checkEmojiGuess).
 */
export interface EmojiRiddle {
  emojis: string;
  answer: string;
  accept?: string[];
  /** Answer window in seconds (5–60, default 20). */
  timeLimit?: number;
}

/** Wire/import shape — identical to EmojiRiddle (kept separate for clarity). */
export type EmojiImportPuzzle = EmojiRiddle;

export interface EmojiRoundGuess {
  playerId: string;
  name: string;
  avatarColor: string;
  text: string;
  correct: boolean;
  points: number;
}

export interface EmojiLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

/** Public "host view" — the answer is withheld until showing-results. */
export interface EmojiZagonetkeHostData {
  round: number;
  totalRounds: number;

  // showing-emojis / answering
  emojis?: string;
  /** Progressive letter hint ("K _ _ _ _  _ _ _ _ _"), empty when disabled. */
  hint?: string;
  answerLength?: number;

  // answering
  timeLimit?: number;
  answeredCount?: number;
  totalPlayers?: number;
  /** Ids that have already answered correctly — for the TV's "solved" chips. */
  solvedIds?: string[];

  // showing-results
  answer?: string;
  results?: EmojiRoundGuess[];

  // leaderboard / ended
  leaderboard?: EmojiLeaderboardEntry[];
}

/** Per-player private slice. */
export interface EmojiZagonetkeControllerData {
  hasSolved?: boolean;
  ownGuess?: string | null;
  ownPoints?: number;
  /** Last wrong attempt echoed back so the phone can show "netačno". */
  lastWrong?: string | null;
}
