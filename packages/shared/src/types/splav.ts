// Splav — sumo arena on a shrinking raft. Everyone is on one platform, the
// only way to eject someone is a dash, and the last one standing takes the
// round.
//
// Coordinate space (used by the simulation, the frame wire format and the TV
// renderer alike): "arena units", where the raft STARTS as a disc of radius 1
// centred on the origin. The raft then shrinks and drifts, so its live radius
// and centre travel in every frame. Nothing in this space knows about pixels —
// the TV maps it onto whatever canvas it has.

export type SplavPhase =
  | 'intro'
  | 'borba'
  | 'runda-gotova'
  | 'rang-lista'
  | 'ended';

/**
 * One player inside a positional frame. Deliberately terse: this ships ~15×
 * per second to every device in the room, so field names are short and the
 * numbers are rounded before they go on the wire.
 */
export interface SplavFramePlayer {
  id: string;
  x: number;
  y: number;
  /** Dash readiness, 0 → just used, 1 → ready. Drives the phone's ring. */
  cd: number;
  /** True while the dash burst itself is in flight. */
  d: boolean;
  /** Eliminated — position is frozen at the moment they went over the edge. */
  out: boolean;
  /** ms since elimination (−1 while alive), so a late viewer doesn't replay the fall. */
  ot: number;
  /** ms since the last hard collision (−1 if none) — drives the impact flash. */
  h: number;
}

/**
 * A single simulation snapshot, broadcast room-wide over `game:frame`. Carries
 * nothing secret (a sumo arena is public by definition), so it needs none of
 * the host/player split that `game:state-update` has.
 */
export interface SplavFrame {
  /** Monotonic per round — clients drop out-of-order frames. */
  seq: number;
  /** ms left in the round. */
  ms: number;
  /** Live raft radius and centre, arena units. */
  r: number;
  cx: number;
  cy: number;
  players: SplavFramePlayer[];
}

export interface SplavPlayerRef {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
}

/** Roster row in the broadcast state — the TV's name tags read from this. */
export interface SplavRosterEntry extends SplavPlayerRef {
  alive: boolean;
  score: number;
}

export type SplavElimReason =
  /** Pushed out by another player (they get the points). */
  | 'guranje'
  /** Walked/slid off, or the shrinking edge caught them. */
  | 'ivica'
  /** Left the room and lost their seat. */
  | 'odustao';

/**
 * One player going into the water. `seq` increments per elimination so a
 * surface can fire its toast + sound exactly once even though the state
 * re-broadcasts — and so nothing is lost when two people fall on the same
 * tick, or when the last shove of a round arrives together with the round's
 * end.
 */
export interface SplavElimination {
  seq: number;
  victim: SplavPlayerRef;
  by: SplavPlayerRef | null;
  reason: SplavElimReason;
}

export interface SplavRoundEntry extends SplavPlayerRef {
  /** 1 = won the round (last one on the raft). */
  rank: number;
  /** Points earned this round (survival + eliminations). */
  points: number;
  eliminations: number;
  /** How long they stayed on, ms. */
  survivedMs: number;
}

export interface SplavRoundResult {
  round: number;
  /** null when the clock ran out with several players still standing. */
  winner: SplavPlayerRef | null;
  entries: SplavRoundEntry[];
}

export interface SplavBoardEntry extends SplavPlayerRef {
  score: number;
  rank: number;
  wins: number;
  eliminations: number;
}

export interface SplavHostData {
  round: number;
  totalRounds: number;
  roster: SplavRosterEntry[];
  /**
   * Everyone who went in this round, oldest first. Kept through
   * `runda-gotova` so the closing shove still gets its moment.
   */
  eliminations?: SplavElimination[];
  /** runda-gotova */
  roundResult?: SplavRoundResult;
  /** rang-lista / ended */
  leaderboard?: SplavBoardEntry[];
}

export interface SplavControllerData {
  alive: boolean;
  score: number;
  eliminations: number;
  /** Set once the player is out this round — who pushed them, if anyone. */
  eliminatedBy?: string | null;
  /** Placement in the round just played (1 = winner). */
  roundRank?: number;
  roundPoints?: number;
}
