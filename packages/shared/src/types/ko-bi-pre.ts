export type KoBiPrePhase = 'voting' | 'showing-results' | 'ended';

export interface KoBiPreVoteOption {
  playerId: string;
  name: string;
  avatarColor: string;
}

export interface KoBiPreVoteTally {
  playerId: string;
  name: string;
  avatarColor: string;
  votes: number;
  isTop: boolean;
}

export interface KoBiPreLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export interface KoBiPreHostData {
  round: number;
  totalRounds: number;
  prompt: string;

  // voting
  votedCount?: number;
  totalVoters?: number;

  // showing-results
  voteTally?: KoBiPreVoteTally[];
  topNames?: string[];

  // showing-results / ended
  leaderboard?: KoBiPreLeaderboardEntry[];
}

export interface KoBiPreControllerData {
  // voting
  hasVoted?: boolean;
  votedFor?: string | null;
  voteOptions?: KoBiPreVoteOption[];
  // results
  ownRoundScore?: number;
  matchedCrowd?: boolean;
}
