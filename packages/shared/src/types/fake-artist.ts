import type { DrawOp } from './draw-guess.js';

export type FakeArtistPhase =
  | 'reveal-role'
  | 'drawing'
  | 'voting'
  | 'fake-guess'
  | 'results'
  | 'ended';

export interface FakeArtistTurnPlayer {
  playerId: string;
  name: string;
  avatarColor: string;
}

export interface FakeArtistVoteTally {
  suspectId: string;
  name: string;
  avatarColor: string;
  votes: number;
  isFake: boolean;
}

export interface FakeArtistPlayerResult {
  playerId: string;
  name: string;
  avatarColor: string;
  isFake: boolean;
  votedForFake: boolean;
  roundScore: number;
  totalScore: number;
}

export interface FakeArtistLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

/**
 * Shared "host view" data — broadcast to every device (playerData is
 * stripped from the broadcast). MUST NOT contain the secret word during
 * play; the word is delivered privately to real artists via playerData and
 * only surfaces here once the round is revealed.
 */
export interface FakeArtistHostData {
  round: number;
  totalRounds: number;
  category: string | null;
  operations: DrawOp[];
  turnOrder: FakeArtistTurnPlayer[];
  strokesPerPlayer: number;

  // drawing
  currentDrawerId?: string;
  currentDrawerName?: string;
  turnNumber?: number;
  totalTurns?: number;

  // voting
  votedCount?: number;
  totalVoters?: number;

  // results (word revealed here only)
  word?: string;
  fakeArtistId?: string;
  fakeArtistName?: string;
  fakeCaught?: boolean;
  fakeGuess?: string | null;
  fakeGuessCorrect?: boolean;
  voteTally?: FakeArtistVoteTally[];
  results?: FakeArtistPlayerResult[];

  // results / ended
  leaderboard?: FakeArtistLeaderboardEntry[];
}

export type FakeArtistRole = 'artist' | 'fake' | 'spectator';

export interface FakeArtistVoteOption {
  playerId: string;
  name: string;
  avatarColor: string;
}

export interface FakeArtistControllerData {
  role: FakeArtistRole;
  category: string | null;
  // Real artists only, during reveal-role + drawing.
  secretWord?: string;
  // drawing
  isMyTurn?: boolean;
  // voting
  canVote?: boolean;
  hasVoted?: boolean;
  votedFor?: string | null;
  voteOptions?: FakeArtistVoteOption[];
  // fake-guess (fake only)
  guessOptions?: string[];
  hasGuessed?: boolean;
  // results
  ownRoundScore?: number;
}
