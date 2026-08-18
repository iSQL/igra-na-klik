/**
 * Špijun (Spyfall-style) — shared DTO types.
 *
 * One player (the spy) doesn't know the secret location everyone else knows;
 * the group asks each other questions out loud, then accuses/votes, while the
 * spy tries to deduce the location. In-game screens are Serbian by design
 * (same doctrine as the other deduction games).
 */

export type SpijunPhase =
  | 'reveal-role'
  | 'discussion'
  | 'defense'
  | 'voting'
  | 'spy-guess'
  | 'results'
  | 'ended';

/** One playable location: its name plus the roles dealt to non-spy players. */
export interface SpijunLocation {
  location: string;
  roles: string[];
}

export interface SpijunPlayerInfo {
  playerId: string;
  name: string;
  avatarColor: string;
}

/**
 * Anonymous accusation aggregate — vote COUNTS per target only, never who
 * accused whom (the initiating accuser is tracked server-side for the bonus).
 */
export interface SpijunAccusationTally {
  targetId: string;
  name: string;
  avatarColor: string;
  votes: number;
}

export interface SpijunPlayerResult {
  playerId: string;
  name: string;
  avatarColor: string;
  isSpy: boolean;
  roundScore: number;
  totalScore: number;
}

export interface SpijunLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

/** How a round finished — drives the results screen copy. */
export type SpijunRoundOutcome =
  | 'spy-caught' // accused was the spy, voted out
  | 'wrong-accusation' // an innocent was voted out → spy wins the round
  | 'spy-guessed' // time ran out, spy guessed the location correctly
  | 'spy-missed'; // time ran out, spy guessed wrong

/**
 * Shared "host view" data — broadcast to every device (playerData is
 * stripped from the broadcast). MUST NOT contain the secret location, the
 * spy's identity, or any per-player role before the reveal:
 *  - the full CANDIDATE location list is public (like the physical game's
 *    reference card) — only which one is active is secret;
 *  - the spy's identity surfaces only in `spy-guess` (spy self-reveals to
 *    guess, as in the tabletop rules) and in `results`.
 */
export interface SpijunHostData {
  round: number;
  totalRounds: number;
  /** Public reference list of every possible location this game. */
  locationNames: string[];
  players: SpijunPlayerInfo[];

  // discussion
  accusationTally?: SpijunAccusationTally[];
  /** Votes on one target needed to trigger defense + voting. */
  accuseThreshold?: number;
  /** Seconds left of discussion (frozen while defending/voting). */
  discussionRemaining?: number;

  // defense + voting
  accusedId?: string;
  accusedName?: string;
  accusedAvatarColor?: string;
  votedCount?: number;
  totalVoters?: number;

  // spy-guess (spy publicly revealed here — tabletop rule)
  spyId?: string;
  spyName?: string;
  /**
   * The spy stopped the clock themselves instead of being caught by it.
   * Only ever set once the spy is already public (spy-guess / results), so
   * it leaks nothing during the discussion.
   */
  spyDeclared?: boolean;
  /**
   * Points the early declaration is worth ON TOP of a correct guess (0 when
   * the clock simply ran out). Computed server-side so the formula lives in
   * exactly one place.
   */
  spyEarlyBonus?: number;

  // results (location revealed here only)
  location?: string;
  outcome?: SpijunRoundOutcome;
  spyGuess?: string | null;
  voteYes?: number;
  voteNo?: number;
  initiatorName?: string;
  results?: SpijunPlayerResult[];

  // results / ended
  leaderboard?: SpijunLeaderboardEntry[];
}

export type SpijunRole = 'player' | 'spy' | 'spectator';

export interface SpijunControllerData {
  role: SpijunRole;
  /** Non-spy only, during play — the secret location. */
  location?: string;
  /** Non-spy only — this player's role at the location. */
  roleInLocation?: string;

  // discussion
  canAccuse?: boolean;
  accusedTargetId?: string | null;

  // voting
  canVote?: boolean;
  hasVoted?: boolean;
  isAccused?: boolean;

  // discussion (spy only) — may stop the clock and guess right now
  canDeclare?: boolean;

  // spy-guess (spy only)
  canGuess?: boolean;
  hasGuessed?: boolean;

  // results
  ownRoundScore?: number;
}
