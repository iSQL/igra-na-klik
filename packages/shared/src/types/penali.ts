// Penali — 3D penalty shootout. Each turn pairs one shooter against one real
// keeper; both commit blind and simultaneously, then the TV replays the shot.
//
// Goal-plane coordinates used everywhere (client aim pad, server resolution,
// host 3D scene):
//   x ∈ [-1, 1]  left post → right post, from the SHOOTER's point of view
//   y ∈ [ 0, 1]  ground line → crossbar
// Anything outside that box is off target. A real goal is 7.32 × 2.44 m, so
// one x unit is 3.66 m and one y unit is 2.44 m — see GOAL_ASPECT.

export type PenaliPhase =
  | 'intro'
  | 'aiming'
  | 'shot'
  | 'leaderboard'
  | 'ended';

/** The six zones a keeper can commit to (3 columns × 2 heights). */
export type PenaliZone =
  | 'left-low'
  | 'left-high'
  | 'center-low'
  | 'center-high'
  | 'right-low'
  | 'right-high';

export type PenaliOutcome =
  /** In the net. */
  | 'gol'
  /** Keeper guessed close enough and got there. */
  | 'odbrana'
  /** Off target — wide or over. */
  | 'promasaj'
  /** Off the frame. No goal, and the keeper doesn't get credit for it. */
  | 'stativa';

export interface PenaliPoint {
  x: number;
  y: number;
}

export interface PenaliPlayerRef {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
}

/**
 * Everything the TV needs to replay one shot. Only ever sent during the
 * `shot` phase — during `aiming` neither side's choice may leave the server,
 * or the mind game collapses.
 */
export interface PenaliShotResult {
  shooter: PenaliPlayerRef;
  keeper: PenaliPlayerRef;
  /** Where the shooter pointed. */
  aim: PenaliPoint;
  /** Where the ball actually ended up (aim + power-scaled spread). */
  landing: PenaliPoint;
  /** 0–1. Drives spread, keeper reach and the flight speed on the TV. */
  power: number;
  keeperZone: PenaliZone;
  outcome: PenaliOutcome;
  shooterPoints: number;
  keeperPoints: number;
  /** True when the shooter never committed and the server auto-shot for them. */
  shooterTimedOut: boolean;
  /** True when the keeper never committed and stayed rooted to the centre. */
  keeperTimedOut: boolean;
}

export interface PenaliLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  score: number;
  rank: number;
  goals: number;
  saves: number;
}

export interface PenaliHostData {
  round: number;
  totalRounds: number;
  /** 1-based position within the current round (one turn per player). */
  turnInRound: number;
  turnsInRound: number;

  shooter: PenaliPlayerRef;
  keeper: PenaliPlayerRef;

  // aiming — commitment flags only, never the choices themselves.
  shooterCommitted?: boolean;
  keeperCommitted?: boolean;

  // shot
  shot?: PenaliShotResult;

  // leaderboard / ended
  leaderboard?: PenaliLeaderboardEntry[];
}

export type PenaliRole = 'shooter' | 'keeper' | 'spectator';

export interface PenaliControllerData {
  role: PenaliRole;
  /** This player's own committed choice — never anyone else's. */
  committed?: boolean;
  ownAim?: PenaliPoint;
  ownPower?: number;
  ownZone?: PenaliZone;
  /** Points this player earned from the shot being replayed. */
  ownShotPoints?: number;
  score?: number;
}
